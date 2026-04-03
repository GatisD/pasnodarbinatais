import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

type ParsedInvoiceItem = {
  description: string
  quantity: number
  total: number
  unit: string
  unitPrice: number
}

export type ParsedPdfInvoice = {
  client: {
    address: string | null
    email: string | null
    name: string
    regNumber: string | null
  }
  dueDate: string
  issueDate: string
  items: ParsedInvoiceItem[]
  notes: string
  sourceInvoiceNumber: string | null
  vatRate: number
}

type TextBit = {
  str: string
  transform: number[]
}

function normalizeLine(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim()
}

function isNumericToken(value: string) {
  return /^-?\d+(?:[.,]\d+)?$/.test(value)
}

function parseDecimal(value: string) {
  return Number(value.replace(',', '.'))
}

function toIsoDate(value: string) {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (!match) return ''
  return `${match[3]}-${match[2]}-${match[1]}`
}

function getLabelValue(lines: string[], label: string) {
  const index = lines.findIndex((line) => line.toLowerCase().startsWith(label.toLowerCase()))
  if (index === -1) return ''
  const current = normalizeLine(lines[index].slice(label.length))
  if (current) return current
  return normalizeLine(lines[index + 1] ?? '')
}

function parseItemLine(line: string) {
  const tokens = normalizeLine(line).split(' ')
  if (tokens.length < 5) return null
  if (!/^\d+$/.test(tokens[0])) return null

  const totalToken = tokens.at(-1)
  const unitPriceToken = tokens.at(-2)

  if (!totalToken || !unitPriceToken || !isNumericToken(totalToken) || !isNumericToken(unitPriceToken)) {
    return null
  }

  let cursor = tokens.length - 3
  let unit = 'gab.'
  if (cursor >= 0 && !isNumericToken(tokens[cursor])) {
    unit = tokens[cursor]
    cursor -= 1
  }

  if (cursor < 1 || !isNumericToken(tokens[cursor])) {
    return null
  }

  const quantityToken = tokens[cursor]
  const description = tokens.slice(1, cursor).join(' ').trim()
  if (!description) return null

  return {
    description,
    quantity: parseDecimal(quantityToken),
    total: parseDecimal(totalToken),
    unit,
    unitPrice: parseDecimal(unitPriceToken),
  }
}

function extractOrderedLines(pageItems: TextBit[]) {
  const sorted = [...pageItems]
    .map((item) => ({
      str: item.str,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
    }))
    .filter((item) => normalizeLine(item.str))
    .sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2) return b.y - a.y
      return a.x - b.x
    })

  const rows: Array<{ y: number; bits: typeof sorted }> = []
  for (const item of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2)
    if (row) row.bits.push(item)
    else rows.push({ y: item.y, bits: [item] })
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      normalizeLine(
        row.bits
          .sort((a, b) => a.x - b.x)
          .map((bit) => bit.str)
          .join(' '),
      ),
    )
    .filter(Boolean)
}

export async function parseInvoicePdf(file: File): Promise<ParsedPdfInvoice> {
  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
  const lines: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    lines.push(...extractOrderedLines(content.items as TextBit[]))
  }

  const sourceInvoiceNumber =
    getLabelValue(lines, 'Rēķina numurs') ||
    lines.find((line) => /\bR(?:ē|e)ķins\.Nr\./i.test(line)) ||
    null

  const issueDate = toIsoDate(getLabelValue(lines, 'Rēķina datums'))
  const dueDate = toIsoDate(getLabelValue(lines, 'Maksājuma termiņš'))

  const clientName = getLabelValue(lines, 'Klients')
  const clientRegNumber = getLabelValue(lines, 'Reģistrācijas numurs') || null
  const clientAddress = getLabelValue(lines, 'Adrese') || null
  const clientEmail = getLabelValue(lines, 'E-pasts') || null

  const tableStart = lines.findIndex((line) => line.includes('Nosaukums') && line.includes('Daudzums') && line.includes('Cena'))
  const totalIndex = lines.findIndex((line) => line.toLowerCase().startsWith('summa apmaksai'))
  const requisitesIndex = lines.findIndex((line) => line.toLowerCase().includes('norēķinu rekvizīti') || line.toLowerCase().includes('n o r ē ķ i n u'))

  const noteCandidates = lines
    .slice(
      lines.findIndex((line) => line.toLowerCase().startsWith('adrese')) + 1,
      tableStart === -1 ? undefined : tableStart,
    )
    .map(normalizeLine)
    .filter((line) => line && !line.toLowerCase().startsWith('konta numurs') && !line.toLowerCase().startsWith('līguma numurs'))

  const items = (tableStart === -1 || totalIndex === -1 ? [] : lines.slice(tableStart + 1, totalIndex))
    .map(parseItemLine)
    .filter((item): item is ParsedInvoiceItem => Boolean(item))

  const totalLine = totalIndex === -1 ? '' : lines[totalIndex]
  const totalMatch = totalLine.match(/(\d+(?:[.,]\d+)?)(?!.*\d)/)
  const total = totalMatch ? parseDecimal(totalMatch[1]) : 0

  const vatLine = lines.find((line) => /^PVN/i.test(line))
  const vatRateMatch = vatLine?.match(/\((\d+(?:[.,]\d+)?)%\)/)
  const vatRate = vatRateMatch ? parseDecimal(vatRateMatch[1]) : 0

  const parsedItems =
    items.length > 0
      ? items
      : total > 0
        ? [
            {
              description: noteCandidates[0] || 'Importēts pakalpojums',
              quantity: 1,
              total,
              unit: 'gab.',
              unitPrice: total,
            },
          ]
        : []

  if (!clientName || !issueDate || !dueDate || !parsedItems.length) {
    throw new Error('PDF neizdevās uzticami nolasīt. Pamēģini citu failu vai ievadi rēķinu manuāli.')
  }

  const notes = noteCandidates
    .slice(0, requisitesIndex === -1 ? noteCandidates.length : undefined)
    .join('\n')
    .trim()

  return {
    client: {
      address: clientAddress,
      email: clientEmail,
      name: clientName,
      regNumber: clientRegNumber,
    },
    dueDate,
    issueDate,
    items: parsedItems,
    notes,
    sourceInvoiceNumber,
    vatRate,
  }
}
