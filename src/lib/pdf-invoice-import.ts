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
  return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').replace(/\0/g, ' ').trim()
}

function normalizeForMatch(value: string) {
  return normalizeLine(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function parseDecimal(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoDate(value: string) {
  const normalized = normalizeLine(value)
  const dotted = normalized.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`

  const slashed = normalized.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (slashed) return `${slashed[3]}-${slashed[2]}-${slashed[1]}`

  return ''
}

function collapseBrokenLetterRows(lines: string[]) {
  const merged: string[] = []

  for (const current of lines) {
    const line = normalizeLine(current)
    if (!line) continue

    const previous = merged.at(-1)
    const shouldMerge =
      previous &&
      previous.length <= 3 &&
      line.length <= 20 &&
      /[\p{L}]/u.test(previous) &&
      /[\p{L}]/u.test(line) &&
      !/[:]/.test(previous)

    if (shouldMerge) {
      merged[merged.length - 1] = `${previous}${line}`
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
      const normalizedLine = normalizeForMatch(lines[index])
      if (!normalizedLine.startsWith(normalizedLabel)) continue

      const separatorIndex = lines[index].indexOf(':')
      if (separatorIndex !== -1) {
        const inlineValue = normalizeLine(lines[index].slice(separatorIndex + 1))
        if (inlineValue) return inlineValue
      }

      const labelWordCount = normalizeLine(label).split(' ').length
      const suffix = normalizeLine(lines[index].split(' ').slice(labelWordCount).join(' '))
      if (suffix) return suffix

      return normalizeLine(lines[index + 1] ?? '')
    }
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
    return normalized.includes('nosaukums') && normalized.includes('daudzums') && normalized.includes('cena')
  })
  const totalIndex = lines.findIndex((line) => normalizeForMatch(line).startsWith('summa apmaksai'))
  if (tableStart === -1 || totalIndex === -1) return []

  const rows = lines.slice(tableStart + 1, totalIndex)
  const parsed = rows.map(parseItemLine).filter((item): item is ParsedInvoiceItem => Boolean(item))
  return parsed
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
    findLineValue(lines, ['Rēķina numurs']) ||
    lines.find((line) => /\bRēķins\.Nr\./i.test(line)) ||
    null

  const issueDate = toIsoDate(findLineValue(lines, ['Rēķina datums', 'Datums']))
  const dueDate = toIsoDate(findLineValue(lines, ['Maksājuma termiņš', 'Samaksas termiņš']))

  const clientName = findLineValue(lines, ['Klients'])
  const clientRegNumber = findLineValue(lines, ['Reģistrācijas numurs']) || null
  const clientAddress = findLineValue(lines, ['Adrese']) || null
  const clientEmail = findLineValue(lines, ['E-pasts']) || null

  const noteCandidates = lines
    .filter((line) => {
      const normalized = normalizeForMatch(line)
      return (
        !normalized.startsWith('rekina numurs') &&
        !normalized.startsWith('rekina datums') &&
        !normalized.startsWith('maksajuma termins') &&
        !normalized.startsWith('liguma numurs') &&
        !normalized.startsWith('klients') &&
        !normalized.startsWith('registracijas numurs') &&
        !normalized.startsWith('adrese') &&
        !normalized.startsWith('konta numurs') &&
        !normalized.startsWith('summa apmaksai') &&
        !normalized.startsWith('summa vardiem') &&
        !normalized.includes('norekinu rekviziti') &&
        !normalized.includes('dokuments ir sagatavots elektroniski') &&
        !normalized.includes('rekins sagatavots') &&
        !normalized.includes('piegadatajs') &&
        !normalized.includes('bankas nosaukums') &&
        !normalized.includes('nosaukums') &&
        !normalized.includes('daudzums') &&
        !normalized.includes('summa, euro')
      )
    })
    .filter((line) => /[\p{L}]/u.test(line))

  const items = parseItems(lines)

  const totalLine = lines.find((line) => normalizeForMatch(line).startsWith('summa apmaksai')) ?? ''
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
              description: noteCandidates.find((line) => line.length > 5) || 'Importēts pakalpojums',
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
    .filter((line) => !parsedItems.some((item) => line.includes(item.description)))
    .slice(0, 4)
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
