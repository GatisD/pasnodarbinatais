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

const monthLookup: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
}

let ocrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

function normalizeLine(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').replace(/\0/g, ' ').trim()
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
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoDate(value: string) {
  const normalized = normalizeLine(value)
  const dotted = normalized.match(/(\d{2})[./-](\d{2})[./-](\d{4})/)
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`

  const iso = normalized.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const shortMonth = normalized.match(/(\d{2})-([A-Z]{3})-(\d{4})/i)
  if (shortMonth) {
    const month = monthLookup[shortMonth[2].toLowerCase()]
    if (month) return `${shortMonth[3]}-${month}-${shortMonth[1]}`
  }

  const englishMonth = normalized.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/)
  if (englishMonth) {
    const month = monthLookup[englishMonth[1].toLowerCase()]
    if (month) return `${englishMonth[3]}-${month}-${englishMonth[2].padStart(2, '0')}`
  }

  return ''
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
  if (/(tele2|bite|lmt|tet)/.test(haystack)) return 'sakari'
  if (/(adobe|acrobat|creative cloud|anthropic|claude|openai|chatgpt|cursor)/.test(haystack)) return 'programmatura'
  if (/(hostnet|hostinger|hosting|domain|domēn|server|vercel|cloudflare)/.test(haystack)) return 'majaslapa'
  if (/(circle k|neste|virši|virsi|degviela|diesel|benz|fuel)/.test(haystack)) return 'degviela'
  if (/(master foto|foto|kamera|printer|aprīkoj|aprikoj)/.test(haystack)) return 'aprikojums'
  if (/(swedbank|seb|banka|bank|komisij)/.test(haystack)) return 'bankas_komisija'
  if (/(reklāma|ads|facebook ads|google ads)/.test(haystack)) return 'reklama'
  return 'citi'
}

function fallbackAmount(text: string) {
  const euroMatches = [...text.matchAll(/(?:€|EUR)\s*([0-9]+(?:[.,][0-9]{2})?)|([0-9]+(?:[.,][0-9]{2})?)\s*(?:€|EUR)/gi)]
    .map((match) => parseDecimal(match[1] || match[2] || '0'))
    .filter((value) => value > 0)

  return euroMatches.at(-1) ?? 0
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return normalizeLine(match[1])
  }
  return ''
}

function parseAdobePdf(text: string): ParsedExpenseDocument | null {
  if (!/Adobe Systems Software Ireland Ltd/i.test(text)) return null

  const documentNumber = firstMatch(text, [/\b(\d{10})\s+Invoice Number/i]) || null
  const date = toIsoDate(firstMatch(text, [/(\d{2}-[A-Z]{3}-\d{4})\s+Invoice Date/i]))
  const amount = parseDecimal(firstMatch(text, [/GRAND TOTAL \(EUR\)\s+(\d+(?:[.,]\d+)?)/i]))
  const vatAmount = parseDecimal(firstMatch(text, [/TAXES \(SEE DETAILS FOR RATES\)\s+(\d+(?:[.,]\d+)?)/i]))
  const description =
    [...text.matchAll(/\d{5,}\s+(.+?)\s+\d+\s+EA\s+\d+(?:[.,]\d+)?/g)]
      .map((match) => normalizeLine(match[1]))
      .filter(Boolean)
      .join(', ') || 'Adobe abonements'

  if (!date || amount <= 0) return null

  return {
    amount,
    category: 'programmatura',
    date,
    description,
    documentNumber,
    rawText: text,
    source: 'pdf',
    vatAmount,
    vendor: 'Adobe Systems Software Ireland Ltd',
  }
}

function parseHostnetPdf(text: string): ParsedExpenseDocument | null {
  if (!/(SIA Hostnet|Hostinger|Hostnet)/i.test(text)) return null

  const documentNumber =
    firstMatch(text, [
      /Priekšapmaksas rēķins\s+([A-Z0-9-]+)/i,
      /Invoice number\s+([A-Z0-9-]+)/i,
      /Rēķina numurs\s+([A-Z0-9-]+)/i,
    ]) || null
  const date = toIsoDate(
    firstMatch(text, [
      /Rēķina datums:\s*(\d{2}[./]\d{2}[./]\d{4})/i,
      /Invoice date[:\s]+(\d{2}[./]\d{2}[./]\d{4})/i,
    ]),
  )
  const amount = parseDecimal(
    firstMatch(text, [
      /Summa apmaksai\s+(\d+(?:[.,]\d+)?)\s*EUR/i,
      /Kopā\s+(\d+(?:[.,]\d+)?)\s*EUR/i,
      /Total\s+(\d+(?:[.,]\d+)?)\s*EUR/i,
    ]),
  )
  const vatAmount = parseDecimal(firstMatch(text, [/21(?:[.,]00)?%\s*PVN\s+(\d+(?:[.,]\d+)?)\s*EUR/i, /VAT.*?(\d+(?:[.,]\d+)?)/i]))
  const description =
    firstMatch(text, [
      /\d+\.\s+(.+?)\s+\d+\s+\d+(?:[.,]\d+)\s*EUR/i,
      /Description\s+Qty.*?\n(.+)/i,
    ]) || 'Hostinga pakalpojums'

  if (!date || amount <= 0) return null

  return {
    amount,
    category: 'majaslapa',
    date,
    description,
    documentNumber,
    rawText: text,
    source: 'pdf',
    vatAmount,
    vendor: /Hostinger/i.test(text) ? 'Hostinger' : 'SIA Hostnet',
  }
}

function parseAnthropicReceiptPdf(text: string): ParsedExpenseDocument | null {
  if (!/(Anthropic|Claude Pro)/i.test(text)) return null

  const documentNumber =
    firstMatch(text, [/Receipt number\s+([0-9 ]{6,})/i, /Invoice number\s+([A-Z0-9 ]{6,})/i]).replace(/\s+/g, ' ') || null
  const date = toIsoDate(firstMatch(text, [/Date paid\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/i]))
  const amount = parseDecimal(firstMatch(text, [/Amount paid\s+€?([0-9]+(?:[.,][0-9]{2})?)/i, /Total\s+€?([0-9]+(?:[.,][0-9]{2})?)/i]))
  const vatAmount = parseDecimal(firstMatch(text, [/VAT\s*-\s*Latvia.*?€([0-9]+(?:[.,][0-9]{2})?)/i]))
  const description =
    firstMatch(text, [/Description\s+Qty.*?\n([^\n]+)/i]).replace(/\s{2,}/g, ' ') || 'Claude abonements'

  if (!date || amount <= 0) return null

  return {
    amount,
    category: 'programmatura',
    date,
    description,
    documentNumber,
    rawText: text,
    source: 'pdf',
    vatAmount,
    vendor: 'Anthropic, PBC',
  }
}

function parseTele2Pdf(text: string): ParsedExpenseDocument | null {
  if (!/(Tele2|mans\.tele2\.lv|Rēķins ir sagatavots un autorizēts elektroniski)/i.test(text)) return null

  const documentNumber =
    firstMatch(text, [
      /Rēķina Nr\.?\s*([0-9-]+)/i,
      /Klienta Nr\.\s*[0-9]+\s*Rēķina Nr\.\s*([0-9-]+)/i,
    ]) || null

  const date = toIsoDate(
    firstMatch(text, [
      /Datums\s+(\d{2}\.\d{2}\.\d{4})/i,
      /Rēķina Nr\.\s*[0-9-]+\s*Datums\s+(\d{2}\.\d{2}\.\d{4})/i,
    ]),
  )

  const period =
    firstMatch(text, [/Periods\s+(\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4})/i]) || ''

  const amount = parseDecimal(
    firstMatch(text, [
      /Kopā par periodu\s+([0-9]+(?:[.,][0-9]{2})?)/i,
      /Summa apmaksai\s+([0-9]+(?:[.,][0-9]{2})?)/i,
    ]),
  )

  const vatAmount = parseDecimal(
    firstMatch(text, [
      /PVN 21%\s+([0-9]+(?:[.,][0-9]{2})?)/i,
      /PVN\s*[0-9]+%\s+([0-9]+(?:[.,][0-9]{2})?)/i,
    ]),
  )

  const description = period ? `Tele2 sakaru pakalpojumi ${period}` : 'Tele2 sakaru pakalpojumi'

  if (!date || amount <= 0) return null

  return {
    amount,
    category: 'sakari',
    date,
    description,
    documentNumber,
    rawText: text,
    source: 'pdf',
    vatAmount,
    vendor: 'SIA Tele2',
  }
}

function parseGenericPdf(text: string): ParsedExpenseDocument | null {
  const lines = text.split('\n').map(normalizeLine).filter(Boolean)
  const vendor =
    lines.find((line) => /(SIA|AS|Ltd|LLC|PBC|GmbH|Swedbank|Adobe|Anthropic|Hostnet|Hostinger)/i.test(line)) ??
    lines.find((line) => line.length > 3) ??
    ''

  const date = toIsoDate(
    firstMatch(text, [
      /(\d{2}[./-]\d{2}[./-]\d{4})/,
      /(\d{4}-\d{2}-\d{2})/,
      /([A-Za-z]+\s+\d{1,2},\s*\d{4})/,
      /(\d{2}-[A-Z]{3}-\d{4})/i,
    ]),
  )

  const amount = parseDecimal(
    firstMatch(text, [
      /Amount paid\s+€?([0-9]+(?:[.,][0-9]{2})?)/i,
      /Grand total.*?([0-9]+(?:[.,][0-9]{2})?)/i,
      /Total\s+€?([0-9]+(?:[.,][0-9]{2})?)/i,
      /Kopā\s+([0-9]+(?:[.,][0-9]{2})?)/i,
    ]),
  ) || fallbackAmount(text)

  const vatAmount = parseDecimal(
    firstMatch(text, [
      /VAT.*?€?([0-9]+(?:[.,][0-9]{2})?)/i,
      /PVN.*?([0-9]+(?:[.,][0-9]{2})?)/i,
      /Taxes.*?([0-9]+(?:[.,][0-9]{2})?)/i,
    ]),
  )

  const documentNumber =
    firstMatch(text, [
      /Receipt number\s+([A-Z0-9 -]+)/i,
      /Invoice number\s+([A-Z0-9 -]+)/i,
      /Rēķina numurs\s+([A-Z0-9.-]+)/i,
      /Dok\.?\s*#?\s*([A-Z0-9-]+)/i,
    ]) || null

  if (!date || amount <= 0 || !vendor) return null

  return {
    amount,
    category: inferCategory(vendor, text),
    date,
    description: 'Importēts PDF dokuments',
    documentNumber,
    rawText: text,
    source: 'pdf',
    vatAmount,
    vendor,
  }
}

function parseReceiptImage(text: string): ParsedExpenseDocument | null {
  const lines = text.split('\n').map(normalizeLine).filter(Boolean)
  const vendor =
    lines.find((line) => /(SIA|AS|Adobe|Hostnet|Hostinger|Circle K|Master Foto|Swedbank|Anthropic)/i.test(line)) ??
    lines.find((line) => !/(^čeks$|^paldies$|^karte$|visa|mastercard|swedbank)/i.test(line)) ??
    ''

  const date = toIsoDate(
    firstMatch(text, [
      /(\d{2}[./-]\d{2}[./-]\d{4})/,
      /(\d{4}-\d{2}-\d{2})/,
    ]),
  )

  const amount =
    parseDecimal(
      firstMatch(text, [
        /(?:KOPĀ|KOPA|SUMMA)\s*(?:EUR)?\s*[: ]\s*(\d+(?:[.,]\d+)?)/i,
        /(\d+(?:[.,]\d+)?)\s*EUR/i,
      ]),
    ) || fallbackAmount(text)

  const vatAmount =
    parseDecimal(
      firstMatch(text, [
        /PVN[-A-Z ]*\d+(?:[.,]\d+)?%\s*(\d+(?:[.,]\d+)?)/i,
        /AR PVN[-A-Z ]*\d+(?:[.,]\d+)?%\s*(\d+(?:[.,]\d+)?)/i,
        /PVN[^0-9]{0,8}(\d+(?:[.,]\d+)?)/i,
      ]),
    ) || 0

  const documentNumber =
    firstMatch(text, [
      /DOK\.?\s*#?\s*([A-Z0-9-]+)/i,
      /Kvīts:\s*([A-Z0-9-]+)/i,
      /DOKUMENTS\s*#?\s*([A-Z0-9-]+)/i,
    ]) || null

  const itemLines = lines.filter((line) => {
    const lowered = line.toLowerCase()
    return (
      !/(sia|swedbank|visa|mastercard|čeks|kopa|summa|pvn|karte|paldies|reģ|pvn nr|adrese|tālrunis|tel\.|eka|dok\.|kvīts|visa debit)/i.test(lowered) &&
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
    (isPdf ? parseAnthropicReceiptPdf(text) : null) ??
    (isPdf ? parseTele2Pdf(text) : null) ??
    (isPdf ? parseGenericPdf(text) : null) ??
    (!isPdf ? parseReceiptImage(text) : null)

  if (!parsed) {
    throw new Error('Dokumentu neizdevās uzticami nolasīt. Pamēģini citu failu vai ievadi izdevumu manuāli.')
  }

  return parsed
}
