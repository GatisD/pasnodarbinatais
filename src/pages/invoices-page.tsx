import { useEffect, useMemo, useRef, useState } from 'react'
import { PDFDownloadLink, PDFViewer, pdf } from '@react-pdf/renderer'
import { AlertTriangle, CircleCheck, CircleOff, Clock, ChevronDown, Copy, Download, Eye, FileUp, LoaderCircle, Mail, Pencil, Plus, Search, Trash2, X } from 'lucide-react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { PickerInput } from '@/components/picker-input'
import { useAuth } from '@/features/auth/auth-provider'
import { InvoicePdfDocument, type InvoicePdfData } from '@/features/invoices/invoice-pdf'
import { formatCurrency, formatDate } from '@/lib/format'
import { parseNumber, roundMoney } from '@/lib/numbers'
import { parseInvoicePdf } from '@/lib/pdf-invoice-import'
import { parseInvoiceWithAI } from '@/lib/invoice-ai-recognition'
import { env } from '@/lib/env'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Client = { id: string; name: string; reg_number: string | null; address: string | null; email: string | null; bank_iban: string | null }
type Profile = { full_name: string | null; person_code: string | null; address: string | null; email: string | null; bank_iban: string | null; bank_name: string | null; phone: string | null }
type Status = 'izrakstits' | 'apmaksats' | 'kavejas' | 'atcelts'
type Invoice = { id: string; invoice_number: string | null; issue_date: string; due_date: string; status: Status; subtotal: number; vat_amount: number; vat_rate: number; total: number; notes: string | null; client: Client | null }
type Item = { description: string; quantity: string; unit: string; unit_price: string }
type InvoiceItemRow = { description: string; quantity: number; unit: string; unit_price: number; total: number }
type HistoricalInvoiceSeed = {
  client: Pick<Client, 'address' | 'email' | 'name' | 'reg_number'>
  due_date: string
  invoice_number: string
  issue_date: string
  line_description: string
  notes: string
  paid_at: string
  quantity: number
  total: number
  unit: string
  unit_price: number
}
const emptyItem = (): Item => ({ description: '', quantity: '1', unit: 'gab.', unit_price: '0' })
const labels: Record<Status, string> = { izrakstits: 'Izrakstīts', apmaksats: 'Apmaksāts', kavejas: 'Kavējas', atcelts: 'Atcelts' }
const pill: Record<Status, string> = {
  izrakstits: 'pipboy-status pipboy-status-issued',
  apmaksats: 'pipboy-status pipboy-status-paid',
  kavejas: 'pipboy-status pipboy-status-late',
  atcelts: 'pipboy-status pipboy-status-cancelled',
}
const statusIconEl: Record<Status, React.ReactNode> = {
  izrakstits: <Clock className="h-4 w-4" />,
  apmaksats: <CircleCheck className="h-4 w-4" />,
  kavejas: <AlertTriangle className="h-4 w-4" />,
  atcelts: <CircleOff className="h-4 w-4" />,
}
const statusIconBg: Record<Status, string> = {
  izrakstits: 'bg-[rgba(255,204,51,0.18)] text-[#ffcc33] border-[rgba(255,204,51,0.35)]',
  apmaksats: 'bg-[rgba(0,255,65,0.15)] text-[#39ff14] border-[rgba(57,255,20,0.3)]',
  kavejas: 'bg-[rgba(255,80,80,0.2)] text-[#ff6b6b] border-[rgba(255,107,107,0.3)]',
  atcelts: 'bg-[rgba(184,255,184,0.08)] text-[rgba(184,255,184,0.45)] border-[rgba(184,255,184,0.18)]',
}
const amountColor: Record<Status, string> = {
  izrakstits: 'text-[#ffcc33]',
  apmaksats: 'pipboy-accent-strong',
  kavejas: 'text-[#ff6b6b]',
  atcelts: 'pipboy-subtle',
}
const historicalInvoices: HistoricalInvoiceSeed[] = [
  {
    client: {
      address: 'Smiltenes iela 11, Rauna, Raunas pag., Smiltenes nov., LV-4131',
      email: null,
      name: 'Tenter Latvija SIA',
      reg_number: '40203257311',
    },
    due_date: '2026-04-06',
    invoice_number: 'Rēķins.Nr.5068',
    issue_date: '2026-03-30',
    line_description: 'Mēneša pakalpojuma maksa',
    notes: 'Digitālā mārketinga un komunikācijas pakalpojumi 20.03 - 20.04.2026',
    paid_at: '2026-04-06',
    quantity: 1,
    total: 1200,
    unit: 'mēn.',
    unit_price: 1200,
  },
  {
    client: {
      address: 'Smiltenes iela 11, Rauna, Raunas pag., Smiltenes nov., LV-4131',
      email: null,
      name: 'Tenter Latvija SIA',
      reg_number: '40203257311',
    },
    due_date: '2026-04-02',
    invoice_number: 'Rēķins.Nr.5069',
    issue_date: '2026-03-31',
    line_description: 'Koorparatīvā dizaina izstrāde - 50% avanss',
    notes: 'Koorparatīvā dizaina izstrāde',
    paid_at: '2026-04-02',
    quantity: 0.5,
    total: 465,
    unit: 'gab.',
    unit_price: 930,
  },
]

function toEditableItems(rows: InvoiceItemRow[]): Item[] {
  return rows.map((item) => ({ description: item.description, quantity: String(item.quantity), unit: item.unit, unit_price: String(item.unit_price) }))
}

function buildGeneratedInvoiceNumber(issueDate: string, invoices: Invoice[], excludeId?: string | null) {
  const year = new Date(issueDate).getFullYear()
  const prefix = `R-${year}-`
  const usedNumbers = new Set(
    invoices
      .filter((invoice) => invoice.id !== excludeId)
      .map((invoice) => invoice.invoice_number)
      .filter((value): value is string => Boolean(value)),
  )

  let counter = 1
  let candidate = `${prefix}${String(counter).padStart(3, '0')}`

  while (usedNumbers.has(candidate)) {
    counter += 1
    candidate = `${prefix}${String(counter).padStart(3, '0')}`
  }

  return candidate
}

export function InvoicesPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clientId, setClientId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [vatRate, setVatRate] = useState('0')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([emptyItem()])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<Invoice | null>(null)
  const [importingHistory, setImportingHistory] = useState(false)
  const [importingPdf, setImportingPdf] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [sourceInvoiceNumber, setSourceInvoiceNumber] = useState<string | null>(null)
  const [loadingEditorId, setLoadingEditorId] = useState<string | null>(null)
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  void importingHistory

  useEffect(() => { void Promise.all([loadClients(), loadInvoices(), loadProfile()]) }, [user?.id])

  const selectedClient = clients.find((client) => client.id === clientId) ?? null
  const preparedItems = items.map((item) => {
    const quantity = roundMoney(parseNumber(item.quantity))
    const unitPrice = roundMoney(parseNumber(item.unit_price))
    return { ...item, quantity, unitPrice, total: roundMoney(quantity * unitPrice) }
  })
  const subtotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.total, 0))
  const vatRateValue = parseNumber(vatRate)
  const vatAmount = roundMoney(subtotal * (vatRateValue / 100))
  const total = roundMoney(subtotal + vatAmount)
  const draftNumber = (sourceInvoiceNumber?.trim() || null) ?? buildGeneratedInvoiceNumber(issueDate, invoices, editingInvoiceId)

  const draftPdf: InvoicePdfData = {
    client: { address: selectedClient?.address, bankIban: selectedClient?.bank_iban, email: selectedClient?.email, name: selectedClient?.name ?? 'Klients nav izvēlēts', regNumber: selectedClient?.reg_number },
    dueDate,
    invoiceNumber: draftNumber,
    issueDate,
    items: preparedItems.filter((item) => item.description.trim()).map((item) => ({ description: item.description, quantity: item.quantity, total: item.total, unit: item.unit, unitPrice: item.unitPrice })),
    notes,
    profile: { address: profile?.address, bankIban: profile?.bank_iban, bankName: profile?.bank_name, email: profile?.email ?? user?.email ?? null, name: profile?.full_name ?? 'Pašnodarbinātais', phone: profile?.phone, regNumber: profile?.person_code },
    subtotal,
    total,
    vatAmount,
    vatRateLabel: `${vatRateValue.toFixed(0)}%`,
  }

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const byMonth = !monthFilter || invoice.issue_date.startsWith(monthFilter)
    const byStatus = statusFilter === 'all' || invoice.status === statusFilter
    const haystack = `${invoice.invoice_number ?? ''} ${invoice.client?.name ?? ''} ${invoice.notes ?? ''}`.toLowerCase()
    return byMonth && byStatus && haystack.includes(search.trim().toLowerCase())
  }), [invoices, monthFilter, search, statusFilter])

  const summary = useMemo(() => {
    const year = (monthFilter || new Date().toISOString()).slice(0, 4)
    return {
      yearIncome: invoices.filter((invoice) => invoice.issue_date.startsWith(year) && invoice.status !== 'atcelts').reduce((sum, invoice) => sum + invoice.total, 0),
      monthIncome: filtered.filter((invoice) => invoice.status !== 'atcelts').reduce((sum, invoice) => sum + invoice.total, 0),
      paid: filtered.filter((invoice) => invoice.status === 'apmaksats').length,
      late: filtered.filter((invoice) => invoice.status === 'kavejas').length,
    }
  }, [filtered, invoices, monthFilter])

  async function loadClients() {
    if (!supabase || !user) return
    const { data, error } = await supabase.from('clients').select('id, name, reg_number, address, email, bank_iban').eq('user_id', user.id).order('name')
    if (error) return void setFeedback(getFriendlySupabaseError(error.message))
    setClients(data ?? [])
  }

  async function loadProfile() {
    if (!supabase || !user) return
    const { data, error } = await supabase.from('profiles').select('full_name, person_code, address, email, bank_iban, bank_name, phone').eq('id', user.id).maybeSingle()
    if (error) return void setFeedback(getFriendlySupabaseError(error.message))
    setProfile(data)
  }

  async function loadInvoices() {
    if (!supabase || !user) return void setIsLoading(false)
    const { data, error } = await supabase.from('invoices').select('id, invoice_number, issue_date, due_date, status, subtotal, vat_amount, vat_rate, total, notes, clients(id, name, reg_number, address, email, bank_iban)').eq('user_id', user.id).order('issue_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      return void setIsLoading(false)
    }
    const rows: Invoice[] = (data ?? []).map((row: any) => ({ ...row, client: row.clients ?? null, subtotal: Number(row.subtotal ?? 0), vat_amount: Number(row.vat_amount ?? 0), vat_rate: Number(row.vat_rate ?? 0), total: Number(row.total ?? 0) }))
    const today = new Date().toISOString().slice(0, 10)
    const overdueIds = rows.filter((inv) => inv.status === 'izrakstits' && inv.due_date < today).map((inv) => inv.id)
    if (overdueIds.length && supabase) {
      await supabase.from('invoices').update({ status: 'kavejas' }).in('id', overdueIds).eq('user_id', user.id)
      setInvoices(rows.map((inv) => overdueIds.includes(inv.id) ? { ...inv, status: 'kavejas' as Status } : inv))
    } else {
      setInvoices(rows)
    }
    setIsLoading(false)
  }

  function resetComposer() {
    setEditingInvoiceId(null)
    setSourceInvoiceNumber(null)
    setClientId('')
    setIssueDate(new Date().toISOString().slice(0, 10))
    setDueDate(new Date().toISOString().slice(0, 10))
    setVatRate('0')
    setNotes('')
    setItems([emptyItem()])
    setShowPreview(false)
  }

  function clearFilters() {
    setMonthFilter(new Date().toISOString().slice(0, 7))
    setStatusFilter('all')
    setSearch('')
  }

  async function loadInvoiceItems(invoiceId: string) {
    if (!supabase) return []
    const { data, error } = await supabase.from('invoice_items').select('description, quantity, unit, unit_price, total').eq('invoice_id', invoiceId).order('created_at', { ascending: true })
    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      return []
    }
    return (data ?? []).map((item: any) => ({ description: item.description, quantity: Number(item.quantity ?? 0), unit: item.unit, unit_price: Number(item.unit_price ?? 0), total: Number(item.total ?? 0) })) satisfies InvoiceItemRow[]
  }

  async function openEditor(invoice: Invoice, duplicate: boolean) {
    setLoadingEditorId(invoice.id)
    const itemRows = await loadInvoiceItems(invoice.id)
    if (!itemRows.length) return void setLoadingEditorId(null)
    setEditingInvoiceId(duplicate ? null : invoice.id)
    setSourceInvoiceNumber(duplicate ? null : invoice.invoice_number ?? null)
    setClientId(invoice.client?.id ?? '')
    setIssueDate(duplicate ? new Date().toISOString().slice(0, 10) : invoice.issue_date)
    setDueDate(duplicate ? new Date().toISOString().slice(0, 10) : invoice.due_date)
    setVatRate(String(roundMoney(invoice.vat_rate * 100)))
    setNotes(invoice.notes ?? '')
    setItems(toEditableItems(itemRows))
    setShowComposer(true)
    setShowPreview(false)
    setFeedback(duplicate ? 'Rēķins ielādēts kā jauns melnraksts.' : 'Rēķins ielādēts rediģēšanai.')
    setLoadingEditorId(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) return
    if (!clientId) return void setFeedback('Vispirms izvēlies klientu.')
    const validItems = preparedItems.filter((item) => item.description.trim())
    if (!validItems.length) return void setFeedback('Pievieno vismaz vienu rēķina rindu.')
    setIsSaving(true)
    setFeedback(null)

    const duplicateNumber = invoices.find(
      (invoice) =>
        invoice.id !== editingInvoiceId &&
        (invoice.invoice_number ?? '').trim().toLowerCase() === draftNumber.trim().toLowerCase(),
    )

    if (duplicateNumber) {
      setFeedback(`Rēķina numurs ${draftNumber} jau tiek izmantots.`)
      return void setIsSaving(false)
    }

    if (editingInvoiceId) {
      const { error: invoiceError } = await supabase.from('invoices').update({ client_id: clientId, due_date: dueDate, invoice_number: draftNumber, issue_date: issueDate, notes: notes || null, subtotal, total, vat_amount: vatAmount, vat_rate: vatRateValue / 100 }).eq('id', editingInvoiceId)
      if (invoiceError) {
        setFeedback(getFriendlySupabaseError(invoiceError.message))
        return void setIsSaving(false)
      }
      const { error: deleteError } = await supabase.from('invoice_items').delete().eq('invoice_id', editingInvoiceId)
      if (deleteError) {
        setFeedback(getFriendlySupabaseError(deleteError.message))
        return void setIsSaving(false)
      }
      const { error: itemError } = await supabase.from('invoice_items').insert(validItems.map((item) => ({ description: item.description, invoice_id: editingInvoiceId, quantity: item.quantity, total: item.total, unit: item.unit, unit_price: item.unitPrice })))
      if (itemError) {
        setFeedback(getFriendlySupabaseError(itemError.message))
        return void setIsSaving(false)
      }
      resetComposer()
      setShowComposer(false)
      setFeedback('Rēķins atjaunināts.')
      setIsSaving(false)
      return void loadInvoices()
    }

    const { data: invoice, error } = await supabase.from('invoices').insert({ client_id: clientId, due_date: dueDate, invoice_number: draftNumber, issue_date: issueDate, notes: notes || null, status: 'izrakstits', subtotal, total, user_id: user.id, vat_amount: vatAmount, vat_rate: vatRateValue / 100 }).select('id').single()
    if (error || !invoice) {
      setFeedback(getFriendlySupabaseError(error?.message ?? 'Neizdevās saglabāt rēķinu.'))
      return void setIsSaving(false)
    }
    const { error: itemError } = await supabase.from('invoice_items').insert(validItems.map((item) => ({ description: item.description, invoice_id: invoice.id, quantity: item.quantity, total: item.total, unit: item.unit, unit_price: item.unitPrice })))
    if (itemError) {
      setFeedback(getFriendlySupabaseError(itemError.message))
      return void setIsSaving(false)
    }
    resetComposer()
    setShowComposer(false)
    setFeedback('Rēķins saglabāts.')
    setIsSaving(false)
    await loadInvoices()
  }

  async function handleStatusChange(id: string, status: Status) {
    if (!supabase) return
    setUpdatingId(id)
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id)
    if (error) setFeedback(getFriendlySupabaseError(error.message))
    else setInvoices((current) => current.map((invoice) => (invoice.id === id ? { ...invoice, status } : invoice)))
    setUpdatingId(null)
  }

  async function handleDelete(invoice: Invoice) {
    if (!supabase) return
    setConfirmDeleteInvoice(null)
    setDeletingInvoiceId(invoice.id)
    setFeedback(null)

    const { error: itemError } = await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id)
    if (itemError) {
      setFeedback(getFriendlySupabaseError(itemError.message))
      return void setDeletingInvoiceId(null)
    }

    const { error: invoiceError } = await supabase.from('invoices').delete().eq('id', invoice.id)
    if (invoiceError) {
      setFeedback(getFriendlySupabaseError(invoiceError.message))
      return void setDeletingInvoiceId(null)
    }

    if (editingInvoiceId === invoice.id) {
      resetComposer()
      setShowComposer(false)
    }

    setInvoices((current) => current.filter((row) => row.id !== invoice.id))
    setFeedback('Rēķins dzēsts.')
    setDeletingInvoiceId(null)
  }

  async function findOrCreateImportedClient(seed: Pick<Client, 'address' | 'email' | 'name' | 'reg_number'>) {
    if (!supabase || !user) return null

    let query = supabase
      .from('clients')
      .select('id, name, reg_number, address, email, bank_iban')
      .eq('user_id', user.id)

    if (seed.reg_number) query = query.eq('reg_number', seed.reg_number)
    else query = query.eq('name', seed.name)

    const { data: existing, error: existingError } = await query.maybeSingle()
    if (existingError) throw new Error(getFriendlySupabaseError(existingError.message))
    if (existing) return existing as Client

    const { data, error } = await supabase
      .from('clients')
      .insert({
        address: seed.address,
        email: seed.email,
        name: seed.name,
        reg_number: seed.reg_number,
        user_id: user.id,
      })
      .select('id, name, reg_number, address, email, bank_iban')
      .single()

    if (error) throw new Error(getFriendlySupabaseError(error.message))
    return data as Client
  }

  async function handleImportPdf(event: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase || !user) return
    const file = event.target.files?.[0]
    if (!file) return

    setImportingPdf(true)
    setFeedback(null)

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

      let parsed = null
      let aiUsed = false

      if (env.anthropicApiKey) {
        try {
          let pdfText: string | undefined
          if (isPdf) {
            const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs')
            const pdfWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
            GlobalWorkerOptions.workerSrc = pdfWorkerUrl
            const buffer = await file.arrayBuffer()
            const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
            const lines: string[] = []
            for (let p = 1; p <= pdf.numPages; p++) {
              const page = await pdf.getPage(p)
              const content = await page.getTextContent()
              lines.push(...(content.items as { str: string }[]).map((i) => i.str))
            }
            pdfText = lines.join(' ')
          }
          parsed = await parseInvoiceWithAI(file, pdfText)
          aiUsed = true
        } catch (aiError) {
          console.error('[Invoice AI]', aiError)
          // fallback to regex below
        }
      }

      if (!parsed) {
        if (!isPdf) throw new Error('Attēlu importam nepieciešama AI (VITE_ANTHROPIC_API_KEY).')
        parsed = await parseInvoicePdf(file)
      }

      if (parsed.sourceInvoiceNumber) {
        const { data: existingInvoice, error: checkError } = await supabase
          .from('invoices')
          .select('id')
          .eq('user_id', user.id)
          .eq('invoice_number', parsed.sourceInvoiceNumber)
          .maybeSingle()

        if (checkError) throw new Error(getFriendlySupabaseError(checkError.message))
        if (existingInvoice) throw new Error(`Rēķins ${parsed.sourceInvoiceNumber} sistēmā jau eksistē.`)
      }

      const client = await findOrCreateImportedClient({
        address: parsed.client.address,
        email: parsed.client.email,
        name: parsed.client.name,
        reg_number: parsed.client.regNumber,
      })

      await loadClients()

      setEditingInvoiceId(null)
      setSourceInvoiceNumber(parsed.sourceInvoiceNumber)
      setClientId(client?.id ?? '')
      setIssueDate(parsed.issueDate)
      setDueDate(parsed.dueDate)
      setVatRate(String(parsed.vatRate))
      setNotes(parsed.notes)
      setItems(
        parsed.items.map((item) => ({
          description: item.description,
          quantity: String(item.quantity),
          unit: item.unit,
          unit_price: String(item.unitPrice),
        })),
      )
      setShowComposer(true)
      setShowPreview(true)
      setFeedback(
        parsed.sourceInvoiceNumber
          ? `${aiUsed ? 'AI nolasīja' : 'Nolasīts'}. Rēķins ${parsed.sourceInvoiceNumber} aizpildīts melnrakstā — pārbaudi un saglabā.`
          : `${aiUsed ? 'AI nolasīja dokumentu' : 'Dokuments nolasīts'}. Melnraksts aizpildīts — pārbaudi un saglabā.`,
      )
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Neizdevās nolasīt PDF rēķinu.')
    } finally {
      event.target.value = ''
      setImportingPdf(false)
    }
  }

  async function findOrCreateHistoricalClient(seed: HistoricalInvoiceSeed) {
    if (!supabase || !user) return null

    const { data: existing, error: existingError } = await supabase
      .from('clients')
      .select('id, name, reg_number, address, email, bank_iban')
      .eq('user_id', user.id)
      .eq('name', seed.client.name)
      .maybeSingle()

    if (existingError) throw new Error(getFriendlySupabaseError(existingError.message))
    if (existing) return existing as Client

    const { data, error } = await supabase
      .from('clients')
      .insert({
        address: seed.client.address,
        email: seed.client.email,
        name: seed.client.name,
        reg_number: seed.client.reg_number,
        user_id: user.id,
      })
      .select('id, name, reg_number, address, email, bank_iban')
      .single()

    if (error) throw new Error(getFriendlySupabaseError(error.message))
    return data as Client
  }

  async function handleImportHistoricalInvoices() {
    if (!supabase || !user) return
    setImportingHistory(true)
    setFeedback(null)

    try {
      const imported: string[] = []

      for (const seed of historicalInvoices) {
        const { data: existingInvoice, error: checkError } = await supabase
          .from('invoices')
          .select('id')
          .eq('user_id', user.id)
          .eq('invoice_number', seed.invoice_number)
          .maybeSingle()

        if (checkError) throw new Error(getFriendlySupabaseError(checkError.message))
        if (existingInvoice) continue

        const client = await findOrCreateHistoricalClient(seed)
        if (!client) continue

        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            client_id: client.id,
            due_date: seed.due_date,
            invoice_number: seed.invoice_number,
            issue_date: seed.issue_date,
            notes: seed.notes,
            paid_at: seed.paid_at,
            status: 'apmaksats',
            subtotal: seed.total,
            total: seed.total,
            user_id: user.id,
            vat_amount: 0,
            vat_rate: 0,
          })
          .select('id')
          .single()

        if (invoiceError || !invoice) throw new Error(getFriendlySupabaseError(invoiceError?.message ?? 'NeizdevÄs importÄ“t PDF rÄ“Ä·inu.'))

        const { error: itemError } = await supabase.from('invoice_items').insert({
          description: seed.line_description,
          invoice_id: invoice.id,
          quantity: seed.quantity,
          total: seed.total,
          unit: seed.unit,
          unit_price: seed.unit_price,
        })

        if (itemError) throw new Error(getFriendlySupabaseError(itemError.message))
        imported.push(seed.invoice_number)
      }

      setFeedback(imported.length ? `ImportÄ“ti rÄ“Ä·ini: ${imported.join(', ')}` : 'Å ie PDF rÄ“Ä·ini jau ir sistÄ“mÄ.')
      await Promise.all([loadClients(), loadInvoices()])
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'NeizdevÄs importÄ“t PDF rÄ“Ä·inus.')
    } finally {
      setImportingHistory(false)
    }
  }

  async function handleDownload(invoice: Invoice) {
    if (!supabase || !user) return
    setDownloadingId(invoice.id)
    const itemRows = await loadInvoiceItems(invoice.id)
    if (!itemRows.length) return void setDownloadingId(null)
    const pdfData: InvoicePdfData = {
      client: { address: invoice.client?.address, bankIban: invoice.client?.bank_iban, email: invoice.client?.email, name: invoice.client?.name ?? 'Klients nav izvēlēts', regNumber: invoice.client?.reg_number },
      dueDate: invoice.due_date,
      invoiceNumber: invoice.invoice_number ?? `rekins-${invoice.id}`,
      issueDate: invoice.issue_date,
      items: itemRows.map((item) => ({ description: item.description, quantity: item.quantity, total: item.total, unit: item.unit, unitPrice: item.unit_price })),
      notes: invoice.notes ?? '',
      profile: { address: profile?.address, bankIban: profile?.bank_iban, bankName: profile?.bank_name, email: profile?.email ?? user.email ?? null, name: profile?.full_name ?? 'Pašnodarbinātais', phone: profile?.phone, regNumber: profile?.person_code },
      subtotal: invoice.subtotal,
      total: invoice.total,
      vatAmount: invoice.vat_amount,
      vatRateLabel: `${roundMoney(invoice.vat_rate * 100).toFixed(0)}%`,
    }
    try {
      const blob = await pdf(<InvoicePdfDocument data={pdfData} />).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${pdfData.invoiceNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setFeedback('Neizdevās sagatavot PDF lejupielādi.')
    } finally {
      setDownloadingId(null)
    }
  }
  async function handleSendEmail(invoice: Invoice) {
    if (!supabase || !user) return
    if (!invoice.client?.email) return void setFeedback('Klientam nav e-pasta adreses. Pievieno to klienta kartītē.')
    setSendingEmailId(invoice.id)
    const itemRows = await loadInvoiceItems(invoice.id)
    if (!itemRows.length) return void setSendingEmailId(null)
    const pdfData: InvoicePdfData = {
      client: { address: invoice.client?.address, bankIban: invoice.client?.bank_iban, email: invoice.client?.email, name: invoice.client?.name ?? 'Klients nav izvēlēts', regNumber: invoice.client?.reg_number },
      dueDate: invoice.due_date,
      invoiceNumber: invoice.invoice_number ?? `rekins-${invoice.id}`,
      issueDate: invoice.issue_date,
      items: itemRows.map((item) => ({ description: item.description, quantity: item.quantity, total: item.total, unit: item.unit, unitPrice: item.unit_price })),
      notes: invoice.notes ?? '',
      profile: { address: profile?.address, bankIban: profile?.bank_iban, bankName: profile?.bank_name, email: profile?.email ?? user.email ?? null, name: profile?.full_name ?? 'Pašnodarbinātais', phone: profile?.phone, regNumber: profile?.person_code },
      subtotal: invoice.subtotal,
      total: invoice.total,
      vatAmount: invoice.vat_amount,
      vatRateLabel: `${roundMoney(invoice.vat_rate * 100).toFixed(0)}%`,
    }
    try {
      const blob = await pdf(<InvoicePdfDocument data={pdfData} />).toBlob()

      // Convert blob to base64 for email attachment
      const pdfBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      const senderName = profile?.full_name ?? user.email ?? 'Pašnodarbinātais'
      const fileName = `${pdfData.invoiceNumber}.pdf`
      const subject = pdfData.invoiceNumber
      const textBody = [
        'Labdien!',
        '',
        `Paldies par līdzšinējo sadarbību! Pielikumā atradīsiet ${pdfData.invoiceNumber}.`,
        '',
        'Ja rodas kādi jautājumi, lūdzu sazinieties ar mani.',
        '',
        `Ar cieņu,\n${senderName}`,
      ].join('\n')

      const { error: fnError } = await supabase.functions.invoke('send-invoice-email', {
        body: { to: invoice.client.email, subject, textBody, pdfBase64, fileName, replyTo: profile?.email ?? user.email },
      })

      if (fnError) throw new Error(fnError.message)

      await supabase.from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', invoice.id)
      setFeedback(`Rēķins ${pdfData.invoiceNumber} nosūtīts uz ${invoice.client.email}.`)
      await loadInvoices()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Neizdevās nosūtīt e-pastu.')
    } finally {
      setSendingEmailId(null)
    }
  }

  void handleImportHistoricalInvoices

  return (
    <div className="grid gap-4">
      {confirmDeleteInvoice ? (
        <ConfirmDialog
          title="Dzēst rēķinu?"
          message={`Vai tiešām vēlaties dzēst rēķinu ${confirmDeleteInvoice.invoice_number ?? 'bez numura'}? Šo darbību nevar atsaukt.`}
          onConfirm={() => void handleDelete(confirmDeleteInvoice)}
          onCancel={() => setConfirmDeleteInvoice(null)}
        />
      ) : null}
      <section className="pipboy-panel rounded-[28px] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="pipboy-title text-2xl font-semibold">Rēķini</h3>
            <span className="pipboy-subtle text-sm">Gada ieņēmumi: <span className="pipboy-accent-strong font-semibold">{formatCurrency(summary.yearIncome)}</span></span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={clearFilters} className="pipboy-button pipboy-button-ghost px-3 py-2 text-xs font-medium">Notīrīt filtrus</button>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf" onChange={handleImportPdf} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importingPdf} className="pipboy-button pipboy-button-ghost px-3 py-2 text-xs font-medium disabled:opacity-60">
              {importingPdf ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{importingPdf ? 'Importējam...' : 'Importēt'}
            </button>
            <button type="button" onClick={() => { if (showComposer) resetComposer(); setShowComposer((current) => !current) }} className="pipboy-button pipboy-button-primary px-3 py-2 text-xs font-medium">
              {showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showComposer ? 'Aizvērt' : 'Jauns rēķins'}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Stat title="Mēneša ieņēmumi" value={formatCurrency(summary.monthIncome)} compact />
          <Stat title="Rēķini atlasē" value={String(filtered.length)} compact />
          <Stat title="Apmaksāti" value={String(summary.paid)} compact />
          <Stat title="Kavējas" value={String(summary.late)} compact />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-[200px_200px_1fr]">
          <Field title="Mēnesis"><PickerInput type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="py-2 text-sm" /></Field>
          <Field title="Statuss"><div className="relative"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | Status)} className="pipboy-input w-full appearance-none px-3 py-2 pr-10 text-sm"><option value="all">Visi statusi</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" /></div></Field>
          <div className="col-span-2 xl:col-span-1"><Field title="Meklēšana"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="pipboy-input py-2 pl-10 pr-4 text-sm" placeholder="Meklē pēc klienta, numura vai piezīmēm" /></div></Field></div>
        </div>
        {feedback ? <div className="pipboy-surface mt-3 px-4 py-2.5 text-sm leading-6 text-[rgba(214,255,220,0.9)]">{feedback}</div> : null}
      </section>

      {showComposer ? (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="pipboy-panel rounded-[28px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="pipboy-title text-2xl font-semibold">{editingInvoiceId ? 'Rediģēt rēķinu' : 'Jauns rēķins'}</h4>
                <p className="pipboy-subtle mt-2 text-sm leading-7">Aizpildi klientu, rindas un summas. Ja vajag, uzreiz apskati PDF melnrakstu.</p>
              </div>
              <button type="button" onClick={() => { resetComposer(); setShowComposer(false) }} className="pipboy-button h-11 w-11 rounded-full" aria-label="Aizvērt"><X className="h-4 w-4" /></button>
            </div>

            <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field title="Rēķina numurs">
                  <input
                    value={sourceInvoiceNumber ?? ''}
                    onChange={(event) => setSourceInvoiceNumber(event.target.value || null)}
                    className="pipboy-input px-4 py-3"
                    placeholder="Atstāj tukšu autoģenerācijai"
                  />
                </Field>
                <Field title="Klients"><select value={clientId} onChange={(event) => setClientId(event.target.value)} className="pipboy-input px-4 py-3"><option value="">Izvēlies klientu</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
                <Field title="PVN likme (%)"><input value={vatRate} onChange={(event) => setVatRate(event.target.value)} className="pipboy-input px-4 py-3" placeholder="0" /></Field>
                <Field title="Izrakstīšanas datums"><PickerInput type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></Field>
                <Field title="Apmaksas termiņš"><PickerInput type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between"><h5 className="pipboy-title text-lg font-semibold">Rēķina rindas</h5><button type="button" onClick={() => setItems((current) => [...current, emptyItem()])} className="pipboy-button px-4 py-2 text-sm"><Plus className="h-4 w-4" />Pievienot rindu</button></div>
                {items.map((item, index) => <div key={index} className="pipboy-surface grid gap-3 p-4 md:grid-cols-[1.45fr_0.5fr_0.45fr_0.65fr_auto]"><input value={item.description} onChange={(event) => setItems((current) => current.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} className="pipboy-input px-4 py-3" placeholder="Pakalpojuma apraksts" /><input value={item.quantity} onChange={(event) => setItems((current) => current.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} className="pipboy-input px-4 py-3" placeholder="1" /><input value={item.unit} onChange={(event) => setItems((current) => current.map((row, i) => i === index ? { ...row, unit: event.target.value } : row))} className="pipboy-input px-4 py-3" placeholder="gab." /><input value={item.unit_price} onChange={(event) => setItems((current) => current.map((row, i) => i === index ? { ...row, unit_price: event.target.value } : row))} className="pipboy-input px-4 py-3" placeholder="0,00" /><button type="button" onClick={() => setItems((current) => current.length === 1 ? current : current.filter((_, i) => i !== index))} className="pipboy-button pipboy-button-danger px-4 py-3"><Trash2 className="h-4 w-4" /></button></div>)}
              </div>

              <Field title="Piezīmes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="pipboy-input px-4 py-3" placeholder="Papildu piezīmes rēķinam" /></Field>
              <div className="pipboy-surface grid gap-3 rounded-3xl p-5 text-base md:grid-cols-3"><Stat title="Starpsumma" value={formatCurrency(subtotal)} compact /><Stat title="PVN" value={formatCurrency(vatAmount)} compact /><Stat title="Kopā" value={formatCurrency(total)} compact accent /></div>
              <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                <button type="submit" disabled={isSaving} className="pipboy-button pipboy-button-primary px-5 py-3 font-medium">{isSaving ? 'Saglabājam...' : editingInvoiceId ? 'Saglabāt izmaiņas' : 'Saglabāt rēķinu'}</button>
                <PDFDownloadLink document={<InvoicePdfDocument data={draftPdf} />} fileName={`${draftNumber}.pdf`} className="pipboy-button px-5 py-3 font-medium">{({ loading }) => <><Download className="h-4 w-4" />{loading ? 'Gatavojam PDF...' : 'Lejupielādēt melnrakstu'}</>}</PDFDownloadLink>
                <button type="button" onClick={() => setShowPreview((current) => !current)} className="pipboy-button px-5 py-3 font-medium"><Eye className="h-4 w-4" />{showPreview ? 'Paslēpt preview' : 'Rādīt preview'}</button>
              </div>
            </form>
          </div>

          <div className="pipboy-panel rounded-[28px] p-6">
            <h4 className="pipboy-title text-2xl font-semibold">Melnraksta preview</h4>
            {showPreview ? <div className="pipboy-surface mt-6 overflow-hidden"><PDFViewer width="100%" height={760} showToolbar><InvoicePdfDocument data={draftPdf} /></PDFViewer></div> : <div className="pipboy-empty mt-6 px-5 py-8 text-base leading-8">Preview ir paslēpts. Vari to ieslēgt ar pogu “Rādīt preview”.</div>}
          </div>
        </section>
      ) : null}

      <section className="pipboy-panel rounded-[28px] p-3 md:p-4">
        {isLoading ? <div className="pipboy-surface px-4 py-6 text-sm pipboy-subtle">Ielādējam rēķinus...</div> : filtered.length === 0 ? <div className="pipboy-empty px-5 py-8 text-base leading-8">Nekas neatbilst atlasītajiem filtriem.</div> : (
          <div className="overflow-hidden rounded-[20px] border border-[rgba(0,255,70,0.12)]">
            <div className="hidden grid-cols-[100px_1fr_160px_36px_110px_auto] gap-3 bg-[rgba(9,19,9,0.9)] px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-[rgba(184,255,184,0.6)] lg:grid">
              <span>Datums</span><span>Klients / apraksts</span><span>Dokuments</span><span></span><span className="text-right">Summa</span><span className="text-right">Darbības</span>
            </div>
            <div className="divide-y divide-[rgba(0,255,70,0.08)]">
              {filtered.map((invoice) => (
                <article key={invoice.id} className="px-4 py-2.5">
                  {/* Mobile */}
                  <div className="lg:hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold pipboy-title">{invoice.client?.name ?? 'Bez klienta nosaukuma'}</p>
                        <p className="mt-0.5 truncate text-xs pipboy-subtle">{invoice.notes || invoice.client?.reg_number || 'Rēķina ieraksts'}</p>
                      </div>
                      <p className={cn('shrink-0 text-base font-semibold', amountColor[invoice.status])}>{formatCurrency(invoice.total)}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="text-[#efffeb]">{formatDate(invoice.issue_date)}</span>
                      <span className="pipboy-subtle">·</span>
                      <span className="pipboy-accent-strong font-semibold">{invoice.invoice_number ?? '—'}</span>
                      <span className="pipboy-subtle">Termiņš: {formatDate(invoice.due_date)}</span>
                    </div>
                    <div className="mt-1.5"><span className={pill[invoice.status]}>{labels[invoice.status]}</span></div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => void handleDownload(invoice)} disabled={downloadingId === invoice.id} title="PDF" className="pipboy-button flex-1 px-3 py-2 text-xs font-medium disabled:opacity-60">{downloadingId === invoice.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}PDF</button>
                      <button type="button" onClick={() => void handleSendEmail(invoice)} disabled={sendingEmailId === invoice.id} title={invoice.client?.email ?? 'Nav e-pasta'} className="pipboy-button flex-1 px-3 py-2 text-xs font-medium border border-[rgba(0,255,70,0.45)] bg-[rgba(0,255,70,0.1)] text-[#5dff7a] disabled:opacity-60">{sendingEmailId === invoice.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Sūtīt</button>
                      <button type="button" onClick={() => void openEditor(invoice, false)} disabled={loadingEditorId === invoice.id} className="pipboy-button flex-1 px-3 py-2 text-xs font-medium disabled:opacity-60"><Pencil className="h-3.5 w-3.5" />Rediģēt</button>
                      <button type="button" onClick={() => void openEditor(invoice, true)} disabled={loadingEditorId === invoice.id} className="pipboy-button pipboy-button-warning flex-1 px-3 py-2 text-xs font-medium disabled:opacity-60"><Copy className="h-3.5 w-3.5" />Dublēt</button>
                      <div className="relative flex-1"><select value={invoice.status} onChange={(event) => void handleStatusChange(invoice.id, event.target.value as Status)} disabled={updatingId === invoice.id} className="pipboy-button w-full appearance-none px-3 py-2 pr-7 text-xs cursor-pointer disabled:opacity-60">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 pipboy-subtle" /></div>
                      <button type="button" onClick={() => setConfirmDeleteInvoice(invoice)} disabled={deletingInvoiceId === invoice.id} className="pipboy-button pipboy-button-danger flex-1 px-3 py-2 text-xs font-medium disabled:opacity-60">{deletingInvoiceId === invoice.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Dzēst</button>
                    </div>
                  </div>
                  {/* Desktop — single row, no button bar */}
                  <div className="hidden items-center gap-3 lg:grid lg:grid-cols-[100px_1fr_160px_36px_110px_auto]">
                    <div className="text-sm font-medium text-[#efffeb]">{formatDate(invoice.issue_date)}</div>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold pipboy-title">{invoice.client?.name ?? 'Bez klienta nosaukuma'}</p><p className="mt-0.5 truncate text-xs pipboy-subtle">{invoice.notes || invoice.client?.reg_number || 'Rēķina ieraksts'}</p></div>
                    <div><p className="text-sm font-semibold pipboy-accent-strong">{invoice.invoice_number ?? '—'}</p><p className="mt-0.5 text-xs pipboy-subtle">Termiņš: {formatDate(invoice.due_date)}</p></div>
                    {/* Status icon — click to change */}
                    <div className="relative h-8 w-8 shrink-0" title={`${labels[invoice.status]} — mainīt`}>
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg border', statusIconBg[invoice.status])}>{statusIconEl[invoice.status]}</div>
                      <select value={invoice.status} onChange={(event) => void handleStatusChange(invoice.id, event.target.value as Status)} disabled={updatingId === invoice.id} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    </div>
                    <p className={cn('text-right text-base font-semibold', amountColor[invoice.status])}>{formatCurrency(invoice.total)}</p>
                    {/* Icon-only action buttons */}
                    <div className="flex shrink-0 items-center justify-end gap-1">
                      <button type="button" onClick={() => void handleDownload(invoice)} disabled={downloadingId === invoice.id} title="Lejupielādēt PDF" className="pipboy-button h-8 w-8 rounded-full p-0 disabled:opacity-60">{downloadingId === invoice.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}</button>
                      <button type="button" onClick={() => void handleSendEmail(invoice)} disabled={sendingEmailId === invoice.id} title={invoice.client?.email ? `Sūtīt uz ${invoice.client.email}` : 'Nav e-pasta'} className="pipboy-button h-8 w-8 rounded-full p-0 border-[rgba(0,255,70,0.5)] bg-[rgba(0,255,70,0.12)] text-[#5dff7a] hover:bg-[rgba(0,255,70,0.2)] disabled:opacity-60">{sendingEmailId === invoice.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}</button>
                      <button type="button" onClick={() => void openEditor(invoice, false)} disabled={loadingEditorId === invoice.id} title="Rediģēt" className="pipboy-button h-8 w-8 rounded-full p-0 disabled:opacity-60">{loadingEditorId === invoice.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}</button>
                      <button type="button" onClick={() => void openEditor(invoice, true)} disabled={loadingEditorId === invoice.id} title="Dublēt" className="pipboy-button pipboy-button-warning h-8 w-8 rounded-full p-0 disabled:opacity-60"><Copy className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setConfirmDeleteInvoice(invoice)} disabled={deletingInvoiceId === invoice.id} title="Dzēst" className="pipboy-button pipboy-button-danger h-8 w-8 rounded-full p-0 disabled:opacity-60">{deletingInvoiceId === invoice.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat(props: { title: string; value: string; compact?: boolean; accent?: boolean }) {
  if (props.compact) {
    return <article className="pipboy-stat px-4 py-2.5"><p className="pipboy-stat-label text-xs">{props.title}</p><p className={cn('mt-1 text-xl font-semibold break-words', props.accent ? 'pipboy-stat-value' : 'text-[#efffeb]')}>{props.value}</p></article>
  }
  return <article className="pipboy-stat p-5"><p className="pipboy-stat-label text-sm">{props.title}</p><p className={cn('mt-3 text-3xl font-semibold break-words', props.accent ? 'pipboy-stat-value' : 'text-[#efffeb]')}>{props.value}</p></article>
}

function Field(props: { title: string; children: React.ReactNode }) {
  return <label className="block"><span className="pipboy-field-label">{props.title}</span>{props.children}</label>
}
