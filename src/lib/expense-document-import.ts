import { createWorker } from 'tesseract.js'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type ExpenseCategory =
  | 'sakari'
  | 'transports'
  | 'degviela'
  | 'biroja_preces'
  | 'programmatura'
  | 'majaslapa'
  | 'reklama'
  | 'gramatvediba'
  | 'telpu_noma'
  | 'komunalie'
  | 'apdrosinasana'
  | 'profesionala_izglitiba'
  | 'aprikojums'
  | 'bankas_komisija'
  | 'citi'

export type ParsedExpenseDocument = {
  amount: number
  category: ExpenseCategory
  date: string
  description: string
  documentNumber: string | null
  rawText: string
  source: 'pdf' | 'image'
  vatAmount: number
  vendor: string
}

type TextBit = {
  str: string
  transform: number[]
}

let ocrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

function normalizeLine(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim()
}

function normalizeText(value: string) {
  return value
    .replace(/\r/g, '\n')
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean)
    .join('\n')
}

function parseDecimal(value: string) {
  return Number(value.replace(/\s/g, '').replace(',', '.'))
}

function toIsoDate(value: string) {
  const normalized = value.trim()
  const dotted = normalized.match(/(\d{2})[./-](\d{2})[./-](\d{4})/)
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`

  const iso = normalized.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const english = normalized.match(/(\d{2})-([A-Z]{3})-(\d{4})/i)
  if (english) {
    const month = monthLookup[english[2].toUpperCase()]
    if (month) return `${english[3]}-${month}-${english[1]}`
  }

  return ''
}

const monthLookup: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
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

async function extractPdfText(file: File) {
  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
  const lines: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    lines.push(...extractOrderedLines(content.items as TextBit[]))
  }

  return normalizeText(lines.join('\n'))
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) ocrWorkerPromise = createWorker('eng')
  return ocrWorkerPromise
}

async function extractImageText(file: File) {
  const worker = await getOcrWorker()
  const result = await worker.recognize(file)
  return normalizeText(result.data.text)
}

function inferCategory(vendor: string, description: string) {
  const haystack = `${vendor} ${description}`.toLowerCase()
  if (/(adobe|acrobat|creative cloud)/.test(haystack)) return 'programmatura'
  if (/(hostnet|hostinger|hosting|domain|domēn|domēna|server)/.test(haystack)) return 'majaslapa'
  if (/(circle k|neste|virsi|degviela|diesel|benz|fuel)/.test(haystack)) return 'degviela'
  if (/(master foto|foto|kamera|printeris|aprīkoj|aprikoj)/.test(haystack)) return 'aprikojums'
  if (/(bank|swedbank|seb|komisij)/.test(haystack)) return 'bankas_komisija'
  return 'citi'
}

function fallbackAmount(text: string) {
  const matches = [...text.matchAll(/(\d+(?:[.,]\d{2}))\s*EUR/gi)].map((match) => parseDecimal(match[1]))
  return matches.at(-1) ?? 0
}

function parseAdobePdf(text: string): ParsedExpenseDocument | null {
  if (!/Adobe Systems Software Ireland Ltd/i.test(text)) return null

  const invoiceNumber = text.match(/(\d{10})\s+Invoice Number/i)?.[1] ?? null
  const issueDate = toIsoDate(text.match(/(\d{2}-[A-Z]{3}-\d{4})\s+Invoice Date/i)?.[1] ?? '')
  const amount = parseDecimal(text.match(/GRAND TOTAL \(EUR\)\s+(\d+(?:[.,]\d+)?)/i)?.[1] ?? '0')
  const vatAmount = parseDecimal(text.match(/TAXES \(SEE DETAILS FOR RATES\)\s+(\d+(?:[.,]\d+)?)/i)?.[1] ?? '0')
  const descriptions = [...text.matchAll(/\d{5,}\s+(.+?)\s+\d+\s+EA\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?%\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?/g)]
    .map((match) => normalizeLine(match[1]))
    .filter(Boolean)

  return {
    amount,
    category: 'programmatura',
    date: issueDate,
    description: descriptions.join(', ') || 'Adobe abonements',
    documentNumber: invoiceNumber,
    rawText: text,
    source: 'pdf',
    vatAmount,
    vendor: 'Adobe Systems Software Ireland Ltd',
  }
}

function parseHostnetPdf(text: string): ParsedExpenseDocument | null {
  if (!/SIA Hostnet/i.test(text)) return null

  const invoiceNumber = text.match(/Priekšapmaksas rēķins\s+([A-Z0-9-]+)/i)?.[1] ?? null
  const issueDate = toIsoDate(text.match(/Rēķina datums:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? '')
  const amount = parseDecimal(
    text.match(/Summa Apmaksai\s+(\d+(?:[.,]\d+)?)\s*EUR/i)?.[1] ??
      text.match(/Kopā\s+(\d+(?:[.,]\d+)?)\s*EUR/i)?.[1] ??
      '0',
  )
  const vatAmount = parseDecimal(text.match(/21\.00%\s*PVN\s+(\d+(?:[.,]\d+)?)\s*EUR/i)?.[1] ?? '0')
  const description =
    normalizeLine(
      text.match(/\d+\.\s+(.+?)\s+\d+\s+\d+(?:[.,]\d+)\s*EUR\s+\d+(?:[.,]\d+)\s*EUR/i)?.[1] ??
        'Hostinga pakalpojums',
    ) || 'Hostinga pakalpojums'

  return {
    amount,
    category: 'majaslapa',
    date: issueDate,
    description,
    documentNumber: invoiceNumber,
    rawText: text,
    source: 'pdf',
    vatAmount,
    vendor: 'SIA Hostnet',
  }
}

function parseGenericPdf(text: string): ParsedExpenseDocument | null {
  const firstLine = text.split('\n').find(Boolean) ?? ''
  const date = toIsoDate(text.match(/(\d{2}[./-]\d{2}[./-]\d{4}|\d{2}-[A-Z]{3}-\d{4}|\d{4}-\d{2}-\d{2})/i)?.[1] ?? '')
  const amount = fallbackAmount(text)
  if (!date || amount <= 0 || !firstLine) return null

  return {
    amount,
    category: inferCategory(firstLine, text),
    date,
    description: 'Importēts PDF dokuments',
    documentNumber: text.match(/(?:Invoice Number|Rēķins|Rēķina numurs|Dok\.?\s*#?)\s*([A-Z0-9-]+)/i)?.[1] ?? null,
    rawText: text,
    source: 'pdf',
    vatAmount: parseDecimal(text.match(/(?:PVN|TAXES).*?(\d+(?:[.,]\d+)?)/i)?.[1] ?? '0'),
    vendor: firstLine,
  }
}

function parseReceiptImage(text: string): ParsedExpenseDocument | null {
  const lines = text.split('\n').map(normalizeLine).filter(Boolean)
  const vendor =
    lines.find((line) => /(?:SIA|AS|Adobe|Hostnet|Circle K|Master Foto|Swedbank)/i.test(line)) ??
    lines.find((line) => !/(^čeks$|^paldies|^karte$|visa|mastercard|swedbank)/i.test(line)) ??
    ''

  const date = toIsoDate(
    text.match(/(\d{2}[./-]\d{2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/)?.[1] ??
      '',
  )

  const amount =
    parseDecimal(text.match(/(?:KOPĀ|KOPA|SUMMA)\s*(?:EUR)?\s*[: ]\s*(\d+(?:[.,]\d+)?)/i)?.[1] ?? '0') ||
    fallbackAmount(text)

  const vatAmount =
    parseDecimal(
      text.match(/PVN[-A-Z ]*\d+(?:[.,]\d+)?%\s*(\d+(?:[.,]\d+)?)/i)?.[1] ??
        text.match(/PVN[^0-9]{0,8}(\d+(?:[.,]\d+)?)/i)?.[1] ??
        '0',
    ) || 0

  const documentNumber =
    text.match(/DOK\.?\s*#?\s*([A-Z0-9-]+)/i)?.[1] ??
    text.match(/Kvīts:\s*([A-Z0-9-]+)/i)?.[1] ??
    null

  const itemLines = lines.filter((line) => {
    const lowered = line.toLowerCase()
    return (
      !/(sia|swedbank|visa|mastercard|čeks|kopa|summa|pvn|karte|paldies|reģ|pvn nr|adrese|tālrunis|tel\.|eka|dok\.)/i.test(lowered) &&
      /[a-zāčēģīķļņōŗšūž]/i.test(line)
    )
  })
  const description = itemLines.slice(0, 3).join(', ') || 'Importēts čeks'

  if (!vendor || !date || amount <= 0) return null

  return {
    amount,
    category: inferCategory(vendor, description),
    date,
    description,
    documentNumber,
    rawText: text,
    source: 'image',
    vatAmount,
    vendor,
  }
}

export async function parseExpenseDocument(file: File): Promise<ParsedExpenseDocument> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const text = isPdf ? await extractPdfText(file) : await extractImageText(file)

  const parsed =
    (isPdf ? parseAdobePdf(text) : null) ??
    (isPdf ? parseHostnetPdf(text) : null) ??
    (isPdf ? parseGenericPdf(text) : null) ??
    (!isPdf ? parseReceiptImage(text) : null)

  if (!parsed) {
    throw new Error('Dokumentu neizdevās uzticami nolasīt. Pamēģini citu failu vai ievadi izdevumu manuāli.')
  }

  return parsed
}
