// src/lib/subtractionPdf.ts

import { PDFDocument, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { PracticePage, formatForDisplay, expectedAnswer, AnySubProblem } from './y3SubtractionGen';
import {
  applyNumeracyContentTheme,
  drawNumeracyCoverPage,
  formatDateLine as themeFormatDateLine,
  loadNumeracyThemeAssets,
  loadNumeracyThemeFonts,
} from './pdf/y3NumeracyTheme';

// Layout constants
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGINS = {
  top: 60,
  bottom: 60,
  left: 50,
  right: 50
};
const COLUMN_GAP = 30;
const ROW_HEIGHT = 65;

// Calculate derived layout values
const COLUMN_WIDTH = (PAGE_WIDTH - MARGINS.left - MARGINS.right - COLUMN_GAP) / 2;

interface PdfData {
  title: string;
  pages: PracticePage[];
  createdAtIso?: string;
  studentName?: string;
  score?: { correct: number; total: number; percentage: number };
  sessionId?: string;
}

interface ProblemData {
  display?: ReturnType<typeof formatForDisplay>;
  userAnswer: string;
  expected: number;
  isCorrect: boolean;
  problemIndex: number;
  problem: AnySubProblem;
}
function formatDateLine(createdAtIso?: string): string {
  return themeFormatDateLine(createdAtIso);
}

function drawCoverPage(params: {
  page: PDFPage;
  title: string;
  studentName: string;
  dateLine: string;
  marksLine: string;
  sessionId?: string;
  font: PDFFont;
  fontBold: PDFFont;
  logoImage: any | null;
}): void {
  drawNumeracyCoverPage({
    ...params,
    sectionLabel: 'YEAR 3 • NUMERACY',
    margins: MARGINS,
  });
}

function drawSubtractionProblem(
  page: PDFPage,
  xBase: number,
  yCursor: number,
  problemData: ProblemData,
  helvetica: PDFFont,
  helveticaBold: PDFFont
): number {
  const { display, userAnswer, expected, isCorrect, problemIndex, problem } = problemData;
  const gradeSymbol = isCorrect ? 'C' : 'X';
  const gradeColor = isCorrect ? rgb(0, 0.7, 0) : rgb(0.8, 0, 0);
  
  if (problem.kind === 'word') {
    // Word problem rendering
    let currentY = yCursor;
    
    // Problem number
    page.drawText(`${problemIndex}.`, {
      x: xBase,
      y: currentY,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    currentY -= 20;
    
    // Word wrap the problem text
    const words = problem.text.split(' ');
    const maxWidth = COLUMN_WIDTH - 20;
    let line = '';
    
    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const lineWidth = helvetica.widthOfTextAtSize(testLine, 10);
      
      if (lineWidth > maxWidth && line) {
        page.drawText(line, {
          x: xBase + 10,
          y: currentY,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        line = word;
        currentY -= 15;
      } else {
        line = testLine;
      }
    }
    
    if (line) {
      page.drawText(line, {
        x: xBase + 10,
        y: currentY,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      currentY -= 20;
    }
    
    // Answer line
    const answerText = `Answer: ${userAnswer || '(blank)'}`;
    page.drawText(answerText, {
      x: xBase + 10,
      y: currentY,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    // Grade symbol
    page.drawText(gradeSymbol, {
      x: xBase + COLUMN_WIDTH - 20,
      y: currentY,
      size: 12,
      font: helveticaBold,
      color: gradeColor,
    });
    
    currentY -= 15;
    
    // Correct answer if wrong
    if (!isCorrect) {
      page.drawText(`(Correct: ${expected})`, {
        x: xBase + 10,
        y: currentY,
        size: 9,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
      currentY -= 15;
    }
    
    return yCursor - currentY + 10; // Return height used
  } else {
    // Numeric problem rendering (existing logic)
    const rightAlign = xBase + COLUMN_WIDTH - 30;
    const topText = display!.top;
    const topWidth = helvetica.widthOfTextAtSize(topText, 12);
    
    // Problem number
    page.drawText(`${problemIndex}.`, {
      x: xBase,
      y: yCursor,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(topText, {
      x: rightAlign - topWidth,
      y: yCursor,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    const minusBottomText = `- ${display!.bottom}`;
    const minusBottomWidth = helvetica.widthOfTextAtSize(minusBottomText, 12);
    page.drawText(minusBottomText, {
      x: rightAlign - minusBottomWidth,
      y: yCursor - 18,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    page.drawLine({
      start: { x: xBase + 20, y: yCursor - 28 },
      end: { x: rightAlign, y: yCursor - 28 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    const answerText = userAnswer || '(blank)';
    const answerWidth = helvetica.widthOfTextAtSize(answerText, 12);
    page.drawText(answerText, {
      x: rightAlign - answerWidth,
      y: yCursor - 45,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(gradeSymbol, {
      x: xBase + COLUMN_WIDTH - 15,
      y: yCursor - 45,
      size: 14,
      font: helveticaBold,
      color: gradeColor,
    });
    
    if (!isCorrect) {
      const correctText = `(${expected})`;
      page.drawText(correctText, {
        x: xBase + 20,
        y: yCursor - 60,
        size: 10,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
    
    if (display!.result) {
      const equationText = `= ${display!.result}`;
      const equationWidth = helvetica.widthOfTextAtSize(equationText, 12);
      page.drawText(equationText, {
        x: rightAlign - equationWidth,
        y: yCursor - (isCorrect ? 55 : 75),
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    return ROW_HEIGHT; // Fixed height for numeric problems
  }
}

export async function buildSubtractionPdf(input: PdfData): Promise<Uint8Array> {
  const { title, pages, createdAtIso, studentName: inputStudentName, score: inputScore, sessionId } = input;
  const pdfDoc = await PDFDocument.create();
  const { regular: helvetica, bold: helveticaBold } = await loadNumeracyThemeFonts(pdfDoc);
  const themeAssets = await loadNumeracyThemeAssets(pdfDoc);
  const logoImage = themeAssets.logoImage;
  
  const safePages = Array.isArray(pages) ? pages : [];

  // Calculate totals
  const totalProblems = safePages.reduce((sum, page) => sum + (page?.problems?.length ?? 0), 0);
  const correctAnswers = safePages.reduce((sum, page) => {
    return (
      sum +
      (page?.problems ?? []).filter((problem) => {
        const userAnswer = page.userAnswers[problem.id];
        const parsedAnswer = parseInt(userAnswer, 10);
        const expected = expectedAnswer(problem);
        return !isNaN(parsedAnswer) && parsedAnswer === expected;
      }).length
    );
  }, 0);

  const percentage = totalProblems > 0 ? Math.round((correctAnswers / totalProblems) * 100) : 0;

  // Cover page (no Q/A content, matches Addition cover styling)
  const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const studentName = String(inputStudentName ?? 'Student');
  const dateLine = formatDateLine(createdAtIso);
  const scoreFromInput = inputScore;
  const scoreToPrint =
    scoreFromInput && Number.isFinite(scoreFromInput.total) && scoreFromInput.total > 0
      ? scoreFromInput
      : { correct: correctAnswers, total: totalProblems, percentage };
  const marksLine =
    Number.isFinite(scoreToPrint.total) && scoreToPrint.total > 0
      ? `${scoreToPrint.correct} / ${scoreToPrint.total} (${scoreToPrint.percentage}%)`
      : '';

  drawCoverPage({
    page: coverPage,
    title,
    studentName,
    dateLine,
    marksLine,
    sessionId,
    font: helvetica,
    fontBold: helveticaBold,
    logoImage,
  });

  // Practice pages with two-column layout
  let problemIndex = 1;
  let currentPdfPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  applyNumeracyContentTheme(currentPdfPage, themeAssets, MARGINS);
  let yCursor = PAGE_HEIGHT - MARGINS.top;
  let columnIndex: 0 | 1 = 0;
  
  for (const page of safePages) {
    for (const problem of page.problems) {
      // Calculate required height for this problem
      const estimatedHeight = problem.kind === 'word' ? 
        Math.max(ROW_HEIGHT, problem.text.length / 8) : 
        ROW_HEIGHT;
      
      // Check if current problem fits in current column
      if (yCursor - estimatedHeight < MARGINS.bottom) {
        if (columnIndex === 0) {
          // Move to right column
          columnIndex = 1;
          yCursor = PAGE_HEIGHT - MARGINS.top;
        } else {
          // Create new page
          currentPdfPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          applyNumeracyContentTheme(currentPdfPage, themeAssets, MARGINS);
          columnIndex = 0;
          yCursor = PAGE_HEIGHT - MARGINS.top;
        }
      }
      
      const display = problem.kind === 'numeric' ? formatForDisplay(problem) : undefined;
      const userAnswer = page.userAnswers[problem.id] || '';
      const parsedAnswer = parseInt(userAnswer, 10);
      const expected = expectedAnswer(problem);
      const isCorrect = !isNaN(parsedAnswer) && parsedAnswer === expected;
      
      const problemData: ProblemData = {
        display,
        userAnswer,
        expected,
        isCorrect,
        problemIndex,
        problem
      };
      
      const xBase = MARGINS.left + columnIndex * (COLUMN_WIDTH + COLUMN_GAP);
      
      const usedHeight = drawSubtractionProblem(
        currentPdfPage,
        xBase,
        yCursor,
        problemData,
        helvetica,
        helveticaBold
      );
      
      yCursor -= usedHeight + 10; // Add some padding
      problemIndex++;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}