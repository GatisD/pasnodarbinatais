import { useEffect, useMemo, useState } from 'react'
import { PDFDownloadLink, PDFViewer, pdf } from '@react-pdf/renderer'
import { ChevronDown, Copy, Download, Eye, LoaderCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { InvoicePdfDocument, type InvoicePdfData } from '@/features/invoices/invoice-pdf'
import { formatCurrency, formatDate } from '@/lib/format'
import { parseNumber, roundMoney } from '@/lib/numbers'
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
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)
  const [importingHistory, setImportingHistory] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [loadingEditorId, setLoadingEditorId] = useState<string | null>(null)
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [search, setSearch] = useState('')

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
  const draftNumber = editingInvoiceId ? invoices.find((invoice) => invoice.id === editingInvoiceId)?.invoice_number ?? `R-${new Date(issueDate).getFullYear()}-001` : `R-${new Date(issueDate).getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`

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
    setInvoices((data ?? []).map((row: any) => ({ ...row, client: row.clients ?? null, subtotal: Number(row.subtotal ?? 0), vat_amount: Number(row.vat_amount ?? 0), vat_rate: Number(row.vat_rate ?? 0), total: Number(row.total ?? 0) })))
    setIsLoading(false)
  }

  function resetComposer() {
    setEditingInvoiceId(null)
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

    if (editingInvoiceId) {
      const { error: invoiceError } = await supabase.from('invoices').update({ client_id: clientId, due_date: dueDate, issue_date: issueDate, notes: notes || null, subtotal, total, vat_amount: vatAmount, vat_rate: vatRateValue / 100 }).eq('id', editingInvoiceId)
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

    const { data: invoice, error } = await supabase.from('invoices').insert({ client_id: clientId, due_date: dueDate, issue_date: issueDate, notes: notes || null, status: 'izrakstits', subtotal, total, user_id: user.id, vat_amount: vatAmount, vat_rate: vatRateValue / 100 }).select('id').single()
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
    const confirmed = window.confirm(`Dzēst rēķinu ${invoice.invoice_number ?? 'bez numura'}?`)
    if (!confirmed) return

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

  return (
    <div className="grid gap-6">
      <section className="pipboy-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="pipboy-title text-3xl font-semibold">Rēķini</h3>
              <p className="pipboy-subtle text-base">Kalendārā gada ieņēmumi: <span className="pipboy-accent-strong font-semibold">{formatCurrency(summary.yearIncome)}</span></p>
            </div>
            <p className="pipboy-subtle mt-3 max-w-3xl text-base leading-8">Filtrē rēķinus pēc mēneša, statusa vai klienta un pārvaldi PDF, rediģēšanu un dublēšanu vienuviet.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <button type="button" onClick={clearFilters} className="pipboy-button pipboy-button-ghost px-5 py-3 font-medium">Notīrīt filtrus</button>
            <button type="button" onClick={() => void handleImportHistoricalInvoices()} disabled={importingHistory} className="pipboy-button pipboy-button-ghost px-5 py-3 font-medium disabled:opacity-60">
              {importingHistory ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{importingHistory ? 'Importējam PDF rēķinus...' : 'Importēt 5068/5069'}
            </button>
            <button type="button" onClick={() => { if (showComposer) resetComposer(); setShowComposer((current) => !current) }} className="pipboy-button pipboy-button-primary px-5 py-3 font-medium">
              {showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showComposer ? 'Aizvērt formu' : 'Izveidot rēķinu'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title="Atlasītā mēneša ieņēmumi" value={formatCurrency(summary.monthIncome)} />
          <Stat title="Rēķini atlasē" value={String(filtered.length)} />
          <Stat title="Apmaksāti" value={String(summary.paid)} />
          <Stat title="Kavējas" value={String(summary.late)} />
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-[220px_220px_1fr]">
          <Field title="Mēnesis"><input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="pipboy-input px-4 py-3" /></Field>
          <Field title="Statuss"><div className="relative"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | Status)} className="pipboy-input w-full appearance-none px-4 py-3 pr-10"><option value="all">Visi statusi</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" /></div></Field>
          <Field title="Meklēšana"><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="pipboy-input py-3 pl-11 pr-4" placeholder="Meklē pēc klienta, numura vai piezīmēm" /></div></Field>
        </div>
        {feedback ? <div className="pipboy-surface mt-4 px-4 py-3 text-sm leading-6 text-[rgba(214,255,220,0.9)]">{feedback}</div> : null}
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
                <Field title="Klients"><select value={clientId} onChange={(event) => setClientId(event.target.value)} className="pipboy-input px-4 py-3"><option value="">Izvēlies klientu</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
                <Field title="PVN likme (%)"><input value={vatRate} onChange={(event) => setVatRate(event.target.value)} className="pipboy-input px-4 py-3" placeholder="0" /></Field>
                <Field title="Izrakstīšanas datums"><input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="pipboy-input px-4 py-3" /></Field>
                <Field title="Apmaksas termiņš"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="pipboy-input px-4 py-3" /></Field>
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

      <section className="pipboy-panel rounded-[28px] p-4 md:p-6">
        {isLoading ? <div className="pipboy-surface px-4 py-6 text-sm pipboy-subtle">Ielādējam rēķinus...</div> : filtered.length === 0 ? <div className="pipboy-empty px-5 py-8 text-base leading-8">Nekas neatbilst atlasītajiem filtriem.</div> : (
          <div className="overflow-hidden rounded-[24px] border border-[rgba(0,255,70,0.12)]">
            <div className="hidden grid-cols-[140px_minmax(220px,1.6fr)_230px_230px_340px] gap-4 bg-[rgba(9,19,9,0.9)] px-5 py-4 text-sm font-medium text-[rgba(184,255,184,0.82)] lg:grid"><span>Datums</span><span>Klients / apraksts</span><span>Dokuments</span><span>Statuss</span><span>Summa / darbības</span></div>
            <div className="divide-y divide-[rgba(0,255,70,0.08)]">
              {filtered.map((invoice) => (
                <article key={invoice.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[140px_minmax(220px,1.6fr)_230px_230px_340px] lg:items-center">
                  <div className="text-base font-medium text-[#efffeb]">{formatDate(invoice.issue_date)}</div>
                  <div className="min-w-0"><p className="truncate text-lg font-semibold pipboy-title">{invoice.client?.name ?? 'Bez klienta nosaukuma'}</p><p className="mt-1 truncate text-sm pipboy-subtle">{invoice.notes || invoice.client?.reg_number || 'Rēķina ieraksts'}</p></div>
                  <div><p className="text-base font-semibold pipboy-accent-strong">{invoice.invoice_number ?? 'Bez numura'}</p><p className="mt-1 text-sm pipboy-subtle">Termiņš: {formatDate(invoice.due_date)}</p></div>
                  <div className="space-y-2"><span className={pill[invoice.status]}>{labels[invoice.status]}</span><div className="relative"><select value={invoice.status} onChange={(event) => void handleStatusChange(invoice.id, event.target.value as Status)} disabled={updatingId === invoice.id} className="pipboy-input appearance-none px-4 py-3 pr-10 text-sm disabled:opacity-60">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" /></div></div>
                  <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end"><p className="text-2xl font-semibold pipboy-accent-strong">{formatCurrency(invoice.total)}</p><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void handleDownload(invoice)} disabled={downloadingId === invoice.id} className="pipboy-button px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">{downloadingId === invoice.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}PDF</button><button type="button" onClick={() => void openEditor(invoice, false)} disabled={loadingEditorId === invoice.id} className="pipboy-button px-3 py-2 text-sm font-medium disabled:opacity-60"><Pencil className="h-4 w-4" />Rediģēt</button><button type="button" onClick={() => void openEditor(invoice, true)} disabled={loadingEditorId === invoice.id} className="pipboy-button pipboy-button-warning px-3 py-2 text-sm font-medium disabled:opacity-60"><Copy className="h-4 w-4" />Dublēt</button><button type="button" onClick={() => void handleDelete(invoice)} disabled={deletingInvoiceId === invoice.id} className="pipboy-button pipboy-button-danger px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">{deletingInvoiceId === invoice.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{deletingInvoiceId === invoice.id ? 'Dzēšam...' : 'Dzēst'}</button></div></div>
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
  return <article className={cn('pipboy-stat p-5', props.compact && 'rounded-3xl')}><p className="pipboy-stat-label text-sm">{props.title}</p><p className={cn('mt-3 text-3xl font-semibold', props.compact && 'text-2xl', props.accent ? 'pipboy-stat-value' : 'text-[#efffeb]')}>{props.value}</p></article>
}

function Field(props: { title: string; children: React.ReactNode }) {
  return <label className="block"><span className="pipboy-field-label">{props.title}</span>{props.children}</label>
}
