const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function main() {
  const root = path.resolve(__dirname, '..');

  const srcWorker = path.resolve(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
  const destDir = path.resolve(root, 'public', 'pdfjs');
  const destWorker = path.resolve(destDir, 'pdf.worker.min.mjs');

  if (!fs.existsSync(srcWorker)) {
    console.error('pdfjs worker not found:', srcWorker);
    process.exitCode = 1;
    return;
  }

  copyFile(srcWorker, destWorker);

  // Optional sourcemap (ignore if missing)
  const srcMap = `${srcWorker}.map`;
  const destMap = `${destWorker}.map`;
  if (fs.existsSync(srcMap)) {
    copyFile(srcMap, destMap);
  }

  console.log('Copied pdfjs worker to', path.relative(root, destWorker));
}

main();
