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
  return value.replace(/\u00a0/g, ' ').replace(/\0/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeForMatch(value: string) {
  return normalizeLine(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function parseDecimal(value: string) {
  const cleaned = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoDate(value: string) {
  const normalized = normalizeLine(value)

  const dotted = normalized.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`

  const slashed = normalized.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (slashed) return `${slashed[3]}-${slashed[2]}-${slashed[1]}`

  const english = normalized.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i,
  )
  if (english) {
    const months = {
      january: '01',
      february: '02',
      march: '03',
      april: '04',
      may: '05',
      june: '06',
      july: '07',
      august: '08',
      september: '09',
      october: '10',
      november: '11',
      december: '12',
    } as const
    return `${english[3]}-${months[english[1].toLowerCase() as keyof typeof months]}-${String(Number(english[2])).padStart(2, '0')}`
  }

  return ''
}

function collapseBrokenLetterRows(lines: string[]) {
  const merged: string[] = []

  for (const current of lines) {
    const line = normalizeLine(current)
    if (!line) continue

    const previous = merged.at(-1)
    const previousNormalized = previous ? normalizeForMatch(previous) : ''
    const currentNormalized = normalizeForMatch(line)

    const shouldMerge =
      previous &&
      previous.length <= 16 &&
      line.length <= 48 &&
      /[\p{L}]/u.test(previous) &&
      /[\p{L}]/u.test(line) &&
      !previous.includes(':') &&
      !/^(summa|klients|adrese|e-pasts|epasts|rekina|invoice|bill to|date|pvn|vat|subtotal|total)/.test(previousNormalized) &&
      !/^(summa|klients|adrese|e-pasts|epasts|rekina|invoice|bill to|date|pvn|vat|subtotal|total)/.test(currentNormalized)

    if (shouldMerge) {
      merged[merged.length - 1] = normalizeLine(`${previous} ${line}`)
      continue
    }

    merged.push(line)
  }

  return merged
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
      if (Math.abs(b.y - a.y) > 6) return b.y - a.y
      return a.x - b.x
    })

  const rows: Array<{ bits: typeof sorted; y: number }> = []
  for (const item of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 6)
    if (row) row.bits.push(item)
    else rows.push({ y: item.y, bits: [item] })
  }

  return collapseBrokenLetterRows(
    rows
      .sort((a, b) => b.y - a.y)
      .map((row) =>
        normalizeLine(
          row.bits
            .sort((a, b) => a.x - b.x)
            .map((bit) => bit.str)
            .join(' '),
        ),
      )
      .filter(Boolean),
  )
}

function findLineValue(lines: string[], labels: string[]) {
  for (const label of labels) {
    const normalizedLabel = normalizeForMatch(label)

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const normalizedLine = normalizeForMatch(line)
      if (!normalizedLine.includes(normalizedLabel)) continue

      const separatorIndex = line.indexOf(':')
      if (separatorIndex !== -1) {
        const inlineValue = normalizeLine(line.slice(separatorIndex + 1))
        if (inlineValue) return inlineValue
      }

      const labelIndex = normalizedLine.indexOf(normalizedLabel)
      const suffix = normalizeLine(line.slice(labelIndex + label.length))
      if (suffix) return suffix

      const nextLine = normalizeLine(lines[index + 1] ?? '')
      if (nextLine) return nextLine
    }
  }

  return ''
}

function firstMatchingLine(lines: string[], patterns: RegExp[]) {
  for (const line of lines) {
    if (patterns.some((pattern) => pattern.test(line))) return normalizeLine(line)
  }
  return ''
}

function parseItemLine(line: string) {
  const tokens = normalizeLine(line).split(' ')
  if (tokens.length < 5) return null
  if (!/^\d+$/.test(tokens[0])) return null

  const numericEntries = tokens
    .map((token, index) => ({ index, token }))
    .filter(({ token, index }) => index > 0 && /^-?\d+(?:[.,]\d+)?$/.test(token))

  if (numericEntries.length < 3) return null

  const quantityEntry = numericEntries[0]
  const unitPriceEntry = numericEntries[numericEntries.length - 2]
  const totalEntry = numericEntries[numericEntries.length - 1]

  const description = normalizeLine(tokens.slice(1, quantityEntry.index).join(' '))
  if (!description) return null

  let unit = 'gab.'
  const maybeUnit = tokens[quantityEntry.index + 1]
  if (maybeUnit && !/^-?\d+(?:[.,]\d+)?$/.test(maybeUnit)) unit = maybeUnit

  return {
    description,
    quantity: parseDecimal(quantityEntry.token),
    total: parseDecimal(totalEntry.token),
    unit,
    unitPrice: parseDecimal(unitPriceEntry.token),
  }
}

function parseItems(lines: string[]) {
  const tableStart = lines.findIndex((line) => {
    const normalized = normalizeForMatch(line)
    return (
      (normalized.includes('nosaukums') || normalized.includes('description')) &&
      (normalized.includes('daudzums') || normalized.includes('qty') || normalized.includes('quantity')) &&
      (normalized.includes('cena') || normalized.includes('unit price') || normalized.includes('price'))
    )
  })

  const totalIndex = lines.findIndex((line) => {
    const normalized = normalizeForMatch(line)
    return (
      normalized.startsWith('summa apmaksai') ||
      normalized.startsWith('amount due') ||
      normalized.startsWith('amount paid') ||
      normalized.startsWith('total')
    )
  })

  if (tableStart === -1 || totalIndex === -1 || totalIndex <= tableStart) return []

  const rows = lines.slice(tableStart + 1, totalIndex)
  return rows.map(parseItemLine).filter((item): item is ParsedInvoiceItem => Boolean(item))
}

function inferItemDescription(lines: string[]) {
  const strongCandidate = lines.find((line) => {
    const normalized = normalizeForMatch(line)
    return (
      line.length > 6 &&
      !normalized.startsWith('rekina numurs') &&
      !normalized.startsWith('invoice number') &&
      !normalized.startsWith('receipt number') &&
      !normalized.startsWith('rekina datums') &&
      !normalized.startsWith('date of issue') &&
      !normalized.startsWith('invoice date') &&
      !normalized.startsWith('maksajuma termins') &&
      !normalized.startsWith('date due') &&
      !normalized.startsWith('bill to') &&
      !normalized.startsWith('klients') &&
      !normalized.startsWith('provided to') &&
      !normalized.startsWith('summa apmaksai') &&
      !normalized.startsWith('amount due') &&
      !normalized.startsWith('amount paid') &&
      !normalized.startsWith('subtotal') &&
      !normalized.startsWith('total excluding tax') &&
      !normalized.startsWith('vat') &&
      !normalized.startsWith('norekinu rekviziti') &&
      !normalized.startsWith('dokuments') &&
      !normalized.startsWith('powered by') &&
      !normalized.startsWith('description') &&
      !normalized.startsWith('nosaukums') &&
      !normalized.startsWith('transaction') &&
      !normalized.startsWith('start date')
    )
  })

  return strongCandidate || 'Importēts pakalpojums'
}

function parseTotal(lines: string[]) {
  const line =
    firstMatchingLine(lines, [
      /^Summa apmaksai/i,
      /^Amount due/i,
      /^Amount paid/i,
      /^Total\s+/i,
      /^Total$/i,
    ]) || ''

  const match = line.match(/(\d+(?:[.,]\d+)?)(?!.*\d)/)
  return match ? parseDecimal(match[1]) : 0
}

function parseVatRate(lines: string[]) {
  const line = firstMatchingLine(lines, [/^PVN/i, /^VAT/i, /tax/i])
  const match = line.match(/(\d+(?:[.,]\d+)?)\s*%/)
  return match ? parseDecimal(match[1]) : 0
}

function parseInvoiceNumber(lines: string[]) {
  const explicit = findLineValue(lines, ['Rēķina numurs', 'Invoice number', 'Invoice #', 'Receipt number'])
  if (explicit) return explicit

  return (
    firstMatchingLine(lines, [
      /\bRēķins\.Nr\.[A-Za-z0-9-]+/i,
      /\bPR\d{4}-\d+/i,
      /\b[A-Z0-9]{4,}-\d{4,}(?:-\d+)?\b/,
    ]) || null
  )
}

function parseIssueDate(lines: string[]) {
  return (
    toIsoDate(findLineValue(lines, ['Rēķina datums', 'Izrakstīšanas datums', 'Invoice date', 'Date of issue', 'Date paid'])) ||
    toIsoDate(firstMatchingLine(lines, [/\d{2}\.\d{2}\.\d{4}/, /[A-Za-z]+ \d{1,2}, \d{4}/])) ||
    ''
  )
}

function parseDueDate(lines: string[], issueDate: string) {
  return (
    toIsoDate(findLineValue(lines, ['Maksājuma termiņš', 'Apmaksas termiņš', 'Date due', 'Due date'])) ||
    issueDate
  )
}

function parseClient(lines: string[]) {
  const clientName =
    findLineValue(lines, ['Klients', 'Pakalpojuma saņēmējs', 'Bill to', 'Provided to']) ||
    firstMatchingLine(lines, [/^Gatis Daugavietis$/i, /^Laima Daugaviete$/i, /^Rois SIA$/i]) ||
    ''

  const clientRegNumber =
    findLineValue(lines, ['Reģistrācijas numurs', 'Pk.']) ||
    (firstMatchingLine(lines, [/\b\d{6}-\d{5}\b/, /\b\d{11}\b/]) || null)

  const clientAddress = findLineValue(lines, ['Adrese', 'Deklarētā adrese']) || null
  const clientEmail = findLineValue(lines, ['E-pasts']) || (firstMatchingLine(lines, [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i]) || null)

  return {
    address: clientAddress,
    email: clientEmail,
    name: clientName,
    regNumber: clientRegNumber,
  }
}

function parseNotes(lines: string[], items: ParsedInvoiceItem[]) {
  return lines
    .filter((line) => {
      const normalized = normalizeForMatch(line)
      return (
        line.length > 8 &&
        !items.some((item) => line.includes(item.description)) &&
        !normalized.startsWith('rekina numurs') &&
        !normalized.startsWith('invoice number') &&
        !normalized.startsWith('receipt number') &&
        !normalized.startsWith('rekina datums') &&
        !normalized.startsWith('invoice date') &&
        !normalized.startsWith('date of issue') &&
        !normalized.startsWith('maksajuma termins') &&
        !normalized.startsWith('date due') &&
        !normalized.startsWith('summa apmaksai') &&
        !normalized.startsWith('amount due') &&
        !normalized.startsWith('amount paid') &&
        !normalized.startsWith('subtotal') &&
        !normalized.startsWith('vat') &&
        !normalized.startsWith('klients') &&
        !normalized.startsWith('bill to') &&
        !normalized.startsWith('provided to') &&
        !normalized.startsWith('norekinu rekviziti') &&
        !normalized.startsWith('dokuments') &&
        !normalized.startsWith('powered by')
      )
    })
    .slice(0, 4)
    .join('\n')
    .trim()
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

  const sourceInvoiceNumber = parseInvoiceNumber(lines)
  const issueDate = parseIssueDate(lines)
  const dueDate = parseDueDate(lines, issueDate)
  const client = parseClient(lines)
  const vatRate = parseVatRate(lines)
  const items = parseItems(lines)
  const total = parseTotal(lines)

  const parsedItems =
    items.length > 0
      ? items
      : total > 0
        ? [
            {
              description: inferItemDescription(lines),
              quantity: 1,
              total,
              unit: 'gab.',
              unitPrice: total,
            },
          ]
        : []

  if (!client.name || !issueDate || !dueDate || !parsedItems.length) {
    throw new Error('PDF neizdevās uzticami nolasīt. Pamēģini citu failu vai ievadi rēķinu manuāli.')
  }

  return {
    client,
    dueDate,
    issueDate,
    items: parsedItems,
    notes: parseNotes(lines, parsedItems),
    sourceInvoiceNumber,
    vatRate,
  }
}
