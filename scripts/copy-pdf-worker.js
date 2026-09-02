const fs = require('fs')
const path = require('path')

const src = path.join(
  __dirname,
  '..',
  'node_modules',
  'pdfjs-dist',
  'build',
  'pdf.worker.min.mjs'
)
const destDir = path.join(__dirname, '..', 'public')
const dest = path.join(destDir, 'pdf.worker.min.mjs')

if (!fs.existsSync(src)) {
  console.warn('pdfjs-dist worker file not found — skipping copy. Did npm install run?')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, dest)
console.log('Copied pdf.worker.min.mjs to public/')