import { type ExpenseCategory, type ParsedExpenseDocument } from './expense-document-import'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-3-5-haiku-20241022'

const CATEGORY_VALUES: ExpenseCategory[] = [
  'sakari',
  'transports',
  'degviela',
  'biroja_preces',
  'programmatura',
  'majaslapa',
  'reklama',
  'gramatvediba',
  'telpu_noma',
  'komunalie',
  'apdrosinasana',
  'profesionala_izglitiba',
  'aprikojums',
  'bankas_komisija',
  'citi',
]

const SYSTEM_PROMPT = `You are a receipt and invoice data extraction assistant for a Latvian self-employed person's accounting app.

Extract the following fields from the provided receipt or invoice and return ONLY valid JSON with no additional text:

{
  "date": "YYYY-MM-DD",
  "vendor": "Store or company name",
  "description": "Short description of what was purchased (in Latvian if possible)",
  "category": "one of the category values below",
  "amount": 0.00,
  "vatAmount": 0.00,
  "documentNumber": "receipt/invoice number or null"
}

Category values (choose the most appropriate):
- sakari: phone, internet, telecom (Tele2, LMT, Bite, Tet)
- transports: taxis, public transport, parking, car expenses
- degviela: fuel, petrol, diesel (Circle K, Neste, Virši)
- biroja_preces: office supplies, stationery, paper
- programmatura: software subscriptions, SaaS, apps (Adobe, Anthropic, OpenAI)
- majaslapa: hosting, domains, web services (Hostinger, Vercel, Cloudflare)
- reklama: advertising, marketing, Google/Facebook ads
- gramatvediba: accounting, bookkeeping, legal services
- telpu_noma: office or space rental
- komunalie: utilities, electricity, heating, water
- apdrosinasana: insurance
- profesionala_izglitiba: professional education, courses, books
- aprikojums: equipment, hardware, cameras, computers (Master Foto, electronics stores)
- bankas_komisija: bank fees, payment processing (Swedbank, SEB)
- citi: other expenses that don't fit above categories

Rules:
- amount should be the TOTAL amount paid (including VAT if applicable)
- vatAmount should be the VAT portion only (0 if not shown or not applicable)
- date must be in YYYY-MM-DD format
- For Latvian receipts: "KOPĀ" or "SUMMA" is the total; "PVN" is VAT
- If a field cannot be determined, use null for strings or 0 for numbers
- description should be concise (max 80 chars), describing the purchase purpose
- vendor should be the business name, not the bank/payment terminal name`

type ClaudeResponse = {
  amount: number
  category: string
  date: string
  description: string
  documentNumber: string | null
  vatAmount: number
  vendor: string
}

function validateCategory(value: string): ExpenseCategory {
  if (CATEGORY_VALUES.includes(value as ExpenseCategory)) return value as ExpenseCategory
  return 'citi'
}

function parseClaudeResponse(json: ClaudeResponse, source: 'pdf' | 'image', rawText: string): ParsedExpenseDocument {
  return {
    amount: typeof json.amount === 'number' && json.amount > 0 ? json.amount : 0,
    category: validateCategory(json.category),
    date: typeof json.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : '',
    description: typeof json.description === 'string' ? json.description.slice(0, 200) : '',
    documentNumber: typeof json.documentNumber === 'string' ? json.documentNumber : null,
    rawText,
    source,
    vatAmount: typeof json.vatAmount === 'number' ? json.vatAmount : 0,
    vendor: typeof json.vendor === 'string' ? json.vendor.slice(0, 100) : '',
  }
}

async function callClaudeWithImage(apiKey: string, base64Data: string, mediaType: string): Promise<ClaudeResponse> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            {
              type: 'text',
              text: 'Extract the receipt data from this image and return the JSON.',
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const content = data?.content?.[0]?.text ?? ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude returned no JSON')
  return JSON.parse(jsonMatch[0]) as ClaudeResponse
}

async function callClaudeWithText(apiKey: string, text: string): Promise<ClaudeResponse> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract the receipt/invoice data from this text and return the JSON:\n\n${text.slice(0, 4000)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const content = data?.content?.[0]?.text ?? ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude returned no JSON')
  return JSON.parse(jsonMatch[0]) as ClaudeResponse
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getImageMediaType(file: File): string {
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return file.type || 'image/jpeg'
}

export async function parseReceiptWithAI(
  file: File,
  apiKey: string,
  pdfText?: string,
): Promise<ParsedExpenseDocument> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  let claudeResult: ClaudeResponse

  if (isPdf && pdfText) {
    claudeResult = await callClaudeWithText(apiKey, pdfText)
  } else if (!isPdf) {
    const base64 = await fileToBase64(file)
    const mediaType = getImageMediaType(file)
    claudeResult = await callClaudeWithImage(apiKey, base64, mediaType)
  } else {
    throw new Error('PDF bez teksta nav atbalstīts AI atpazīšanai')
  }

  const result = parseClaudeResponse(claudeResult, isPdf ? 'pdf' : 'image', pdfText ?? '')

  if (!result.date || result.amount <= 0) {
    throw new Error('AI neizdevās nolasīt datumu vai summu no dokumenta')
  }

  return result
}
