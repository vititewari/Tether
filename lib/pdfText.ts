// Extracts plain text from a PDF file entirely in the browser — the raw file
// never needs to touch our server just to get its text out. Only the
// resulting text is sent server-side (to the extraction API route) for the
// actual AI classification step.

export async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    return extractTextFromPdf(file)
  }

  if (file.type === 'text/plain') {
    return file.text()
  }

  throw new Error(
    `Unsupported file type: ${file.type || 'unknown'}. This MVP supports PDF and .txt files.`
  )
}

async function extractTextFromPdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs-dist (fairly large) out of the initial bundle,
  // only loading it when someone actually uploads a PDF.
  const pdfjsLib = await import('pdfjs-dist')

  // Point at the static copy in public/ (see scripts/copy-pdf-worker.js) —
  // NOT `new URL(..., import.meta.url)`. That pattern makes webpack try to
  // bundle the pre-minified worker file itself, which breaks the Next.js
  // build. Serving it as a plain static asset avoids that entirely.
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items.map((item: any) => item.str).join(' ')
    fullText += pageText + '\n'
  }

  return fullText.trim()
}