import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function normalizeLine(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim()
}

function normalizeForMatch(value: string) {
  return normalizeLine(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function isNumericToken(value: string) {
  return /^-?\d+(?:[.,]\d+)?$/.test(value)
}

function parseDecimal(value: string) {
  return Number(value.replace(/\s/g, '').replace(',', '.'))
}

function toIsoDate(value: string) {
  const dotted = value.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`

  const slashed = value.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (slashed) return `${slashed[3]}-${slashed[2]}-${slashed[1]}`

  return ''
}

function getLabelValue(lines: string[], label: string) {
  const normalizedLabel = normalizeForMatch(label)
  const index = lines.findIndex((line) => normalizeForMatch(line).startsWith(normalizedLabel))
  if (index === -1) return ''

  const line = normalizeLine(lines[index])
  const labelWordCount = normalizeLine(label).split(' ').length
  const suffix = normalizeLine(line.split(' ').slice(labelWordCount).join(' '))
  if (suffix) return suffix

  return normalizeLine(lines[index + 1] ?? '')
}

function parseItemLine(line: string) {
  const tokens = normalizeLine(line).split(' ')
  if (tokens.length < 5) return null
  if (!/^\d+$/.test(tokens[0])) return null

  const numericPositions = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token, index }) => index > 0 && isNumericToken(token))

  if (numericPositions.length < 3) return null

  const quantityEntry = numericPositions[0]
  const unitPriceEntry = numericPositions[numericPositions.length - 2]
  const totalEntry = numericPositions[numericPositions.length - 1]

  const description = tokens.slice(1, quantityEntry.index).join(' ').trim()
  if (!description) return null

  let unit = 'gab.'
  const maybeUnit = tokens[quantityEntry.index + 1]
  if (maybeUnit && !isNumericToken(maybeUnit)) {
    unit = maybeUnit
  }

  return {
    description,
    quantity: parseDecimal(quantityEntry.token),
    total: parseDecimal(totalEntry.token),
    unit,
    unitPrice: parseDecimal(unitPriceEntry.token),
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

  const rows: Array<{ bits: typeof sorted; y: number }> = []
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
    lines.find((line) => /\bRēķins\.Nr\./i.test(line)) ||
    null

  const issueDate = toIsoDate(getLabelValue(lines, 'Rēķina datums'))
  const dueDate = toIsoDate(getLabelValue(lines, 'Maksājuma termiņš'))

  const clientName = getLabelValue(lines, 'Klients')
  const clientRegNumber = getLabelValue(lines, 'Reģistrācijas numurs') || null
  const clientAddress = getLabelValue(lines, 'Adrese') || null
  const clientEmail = getLabelValue(lines, 'E-pasts') || null

  const tableStart = lines.findIndex((line) => {
    const normalized = normalizeForMatch(line)
    return normalized.includes('nosaukums') && normalized.includes('daudzums') && normalized.includes('cena')
  })

  const totalIndex = lines.findIndex((line) => normalizeForMatch(line).startsWith('summa apmaksai'))
  const requisitesIndex = lines.findIndex((line) => normalizeForMatch(line).includes('norekinu rekviziti'))

  const noteCandidates = lines
    .slice(
      lines.findIndex((line) => normalizeForMatch(line).startsWith('adrese')) + 1,
      tableStart === -1 ? undefined : tableStart,
    )
    .map(normalizeLine)
    .filter((line) => {
      const normalized = normalizeForMatch(line)
      return (
        Boolean(line) &&
        !normalized.startsWith('klients') &&
        !normalized.startsWith('registracijas numurs') &&
        !normalized.startsWith('adrese') &&
        !normalized.startsWith('konta numurs') &&
        !normalized.startsWith('liguma numurs')
      )
    })

  const items = (tableStart === -1 || totalIndex === -1 ? [] : lines.slice(tableStart + 1, totalIndex))
    .map(parseItemLine)
    .filter((item): item is ParsedInvoiceItem => Boolean(item))

  const totalLine = totalIndex === -1 ? '' : lines[totalIndex]
  const totalMatch = totalLine.match(/(\d+(?:[.,]\d+)?)(?!.*\d)/)
  const total = totalMatch ? parseDecimal(totalMatch[1]) : 0

  const vatLine = lines.find((line) => normalizeForMatch(line).startsWith('pvn'))
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
