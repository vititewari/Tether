import type { PrefillFact } from './actionCard'

// Generates a plain "application support summary" PDF entirely client-side —
// this is NOT the official form, just the facts already on file laid out for
// easy copy-into-the-real-form. No AI involved; nothing here is invented.
export async function downloadSummaryPdf(opts: {
  title: string
  subtitle: string
  facts: PrefillFact[]
  requiredDocuments: string[]
  sourceUrl?: string
  fileName: string
}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const margin = 50
  let y = 792

  const drawText = (text: string, size: number, useBold = false, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(text, { x: margin, y, size, font: useBold ? bold : font, color })
    y -= size + 8
  }

  const wrapText = (text: string, size: number, maxWidth: number) => {
    const words = text.split(' ')
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
    return lines
  }

  drawText(opts.title, 18, true)
  drawText(opts.subtitle, 11, false, rgb(0.4, 0.4, 0.4))
  y -= 6

  page.drawRectangle({ x: margin, y: y - 4, width: 495, height: 44, color: rgb(1, 0.96, 0.86) })
  const disclaimerLines = wrapText(
    'Prepared by Tether from information already on file — this is a support summary, NOT the official application. AI-assisted drafts can be wrong. Verify every field against the official source before submitting.',
    9,
    475
  )
  let dy = y + 30
  for (const line of disclaimerLines) {
    page.drawText(line, { x: margin + 10, y: dy, size: 9, font, color: rgb(0.5, 0.3, 0) })
    dy -= 12
  }
  y -= 56

  drawText('Details on file', 13, true)
  for (const fact of opts.facts) {
    page.drawText(`${fact.label}:`, { x: margin, y, size: 10, font: bold })
    page.drawText(fact.value, { x: margin + 160, y, size: 10, font })
    y -= 18
  }
  y -= 8

  if (opts.requiredDocuments.length > 0) {
    drawText('Commonly required documents', 13, true)
    for (const doc of opts.requiredDocuments) {
      const lines = wrapText(`•  ${doc}`, 10, 495)
      for (const line of lines) {
        page.drawText(line, { x: margin, y, size: 10, font })
        y -= 15
      }
    }
    y -= 8
  }

  if (opts.sourceUrl) {
    drawText('Official source', 13, true)
    page.drawText(opts.sourceUrl, { x: margin, y, size: 9, font, color: rgb(0.2, 0.2, 0.6) })
  }

  const bytes = await pdfDoc.save()
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = opts.fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
