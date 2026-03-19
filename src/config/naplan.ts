// src/config/naplan.ts

export type Year = 3 | 5 | 7 | 9;
export type Section = "reading" | "writing" | "language" | "numeracy";

export interface Option {
  year: Year;
  section: Section;
  title: string;
  description: string;
  enabled: boolean;
  path: string;
}

export const YEARS: Year[] = [3, 5, 7, 9];
export const SECTIONS: Section[] = ["reading", "writing", "language", "numeracy"];

export const SECTION_LABELS: Record<Section, string> = {
  reading: "Reading",
  writing: "Writing", 
  language: "Language Conventions",
  numeracy: "Numeracy (Math)"
};

export const SECTION_DESCRIPTIONS: Record<Section, string> = {
  reading: "Comprehension and literacy skills",
  writing: "Creative and persuasive writing tasks",
  language: "Spelling, punctuation, grammar",
  numeracy: "Mathematical reasoning and problem solving"
};

export const SECTION_ICONS: Record<Section, string> = {
  reading: "📖",
  writing: "✍️", 
  language: "📝",
  numeracy: "🧮"
};

export function getRoutePath(year: Year, section: Section): string {
  if (year === 3 && section === 'reading') {
    return '/y3/reading-magazine';
  }
  if (year === 3 && section === 'language') {
    return '/y3/language-conventions';
  }
  return `/y${year}/${section}`;
}

export function isAvailable(year: Year, section: Section): boolean {
  return year === 3 && (section === 'numeracy' || section === 'language' || section === 'reading' || section === 'writing');
}

export function getAllOptions(): Option[] {
  const options: Option[] = [];
  
  for (const year of YEARS) {
    for (const section of SECTIONS) {
      options.push({
        year,
        section,
        title: SECTION_LABELS[section],
        description: SECTION_DESCRIPTIONS[section],
        enabled: isAvailable(year, section),
        path: getRoutePath(year, section)
      });
    }
  }
  
  return options;
}