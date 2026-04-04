import { env } from './env'
import { type ParsedPdfInvoice } from './pdf-invoice-import'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `You are an invoice data extraction assistant for a Latvian self-employed person's accounting app.

Extract invoice data and return ONLY valid JSON with no additional text:

{
  "sourceInvoiceNumber": "invoice number or null",
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "vatRate": 21,
  "notes": "payment notes or description",
  "client": {
    "name": "company or person name",
    "regNumber": "registration number or null",
    "address": "full address or null",
    "email": "email or null"
  },
  "items": [
    {
      "description": "line item description",
      "quantity": 1,
      "unit": "gab.",
      "unitPrice": 100.00,
      "total": 100.00
    }
  ]
}

Rules:
- issueDate / dueDate must be YYYY-MM-DD format
- vatRate is a percentage number (e.g. 21 for 21%, 0 if not shown)
- items must list every billable line; infer quantity/unit if not explicit
- unit defaults to "gab." if not specified
- regNumber: look for reģ.nr., reg.nr., reģistrācijas numurs, or a Latvian format number (40XXXXXXXXXX)
- For Latvian invoices: "Rēķina datums" = issueDate, "Apmaksas termiņš" = dueDate
- notes: payment terms, bank details description, or additional info — keep concise
- If a field is unknown use null for strings, 0 for numbers, [] for arrays`

type ClaudeInvoiceResponse = {
  client: {
    address: string | null
    email: string | null
    name: string
    regNumber: string | null
  }
  dueDate: string
  issueDate: string
  items: {
    description: string
    quantity: number
    total: number
    unit: string
    unitPrice: number
  }[]
  notes: string
  sourceInvoiceNumber: string | null
  vatRate: number
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getMediaType(file: File): string {
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

async function callClaude(body: object): Promise<ClaudeInvoiceResponse> {
  const apiKey = env.anthropicApiKey
  if (!apiKey) throw new Error('Nav Anthropic API atslēgas')

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM_PROMPT, ...body }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const content = data?.content?.[0]?.text ?? ''
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude neatgrieza JSON')
  return JSON.parse(match[0]) as ClaudeInvoiceResponse
}

function toIsoDate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const m = value.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ''
}

function parseResult(raw: ClaudeInvoiceResponse): ParsedPdfInvoice {
  return {
    client: {
      address: raw.client?.address ?? null,
      email: raw.client?.email ?? null,
      name: raw.client?.name ?? '',
      regNumber: raw.client?.regNumber ?? null,
    },
    dueDate: toIsoDate(raw.dueDate) || new Date().toISOString().slice(0, 10),
    issueDate: toIsoDate(raw.issueDate) || new Date().toISOString().slice(0, 10),
    items: (raw.items ?? []).map((item) => ({
      description: item.description ?? '',
      quantity: Number(item.quantity) || 1,
      total: Number(item.total) || 0,
      unit: item.unit || 'gab.',
      unitPrice: Number(item.unitPrice) || 0,
    })),
    notes: raw.notes ?? '',
    sourceInvoiceNumber: raw.sourceInvoiceNumber ?? null,
    vatRate: Number(raw.vatRate) || 0,
  }
}

export async function parseInvoiceWithAI(file: File, pdfText?: string): Promise<ParsedPdfInvoice> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  let raw: ClaudeInvoiceResponse

  if (isPdf && pdfText) {
    raw = await callClaude({
      messages: [{ role: 'user', content: `Extract the invoice data from this text and return the JSON:\n\n${pdfText.slice(0, 6000)}` }],
    })
  } else if (!isPdf) {
    const base64 = await fileToBase64(file)
    const mediaType = getMediaType(file)
    raw = await callClaude({
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Extract the invoice data from this image and return the JSON.' },
        ],
      }],
    })
  } else {
    throw new Error('PDF bez teksta nav atbalstīts')
  }

  const result = parseResult(raw)
  if (!result.client.name) throw new Error('AI neizdevās nolasīt klienta vārdu')
  return result
}
