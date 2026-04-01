import { useEffect, useMemo, useState } from 'react'
import { PDFDownloadLink, PDFViewer, pdf } from '@react-pdf/renderer'
import { ChevronDown, Download, Eye, LoaderCircle, Plus, Search, Trash2, X } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { InvoicePdfDocument, type InvoicePdfData } from '@/features/invoices/invoice-pdf'
import { formatCurrency, formatDate } from '@/lib/format'
import { parseNumber, roundMoney } from '@/lib/numbers'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

type Client = { id: string; name: string; reg_number: string | null; address: string | null; email: string | null; bank_iban: string | null }
type Profile = { full_name: string | null; person_code: string | null; address: string | null; email: string | null; bank_iban: string | null; bank_name: string | null; phone: string | null }
type Status = 'izrakstits' | 'apmaksats' | 'kavejas' | 'atcelts'
type Invoice = { id: string; invoice_number: string | null; issue_date: string; due_date: string; status: Status; subtotal: number; vat_amount: number; vat_rate: number; total: number; notes: string | null; client: Client | null }
type Item = { description: string; quantity: string; unit: string; unit_price: string }

const emptyItem = (): Item => ({ description: '', quantity: '1', unit: 'gab.', unit_price: '0' })
const labels: Record<Status, string> = { izrakstits: 'Izrakstīts', apmaksats: 'Apmaksāts', kavejas: 'Kavējas', atcelts: 'Atcelts' }
const pill: Record<Status, string> = {
  izrakstits: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
  apmaksats: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
  kavejas: 'border-rose-300/20 bg-rose-300/10 text-rose-100',
  atcelts: 'border-slate-300/20 bg-slate-300/10 text-slate-200',
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
  const draftNumber = `R-${new Date(issueDate).getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`

  const draftPdf: InvoicePdfData = {
    client: { address: selectedClient?.address, bankIban: selectedClient?.bank_iban, email: selectedClient?.email, name: selectedClient?.name ?? 'Klients nav izvēlēts', regNumber: selectedClient?.reg_number },
    dueDate, invoiceNumber: draftNumber, issueDate,
    items: preparedItems.filter((item) => item.description.trim()).map((item) => ({ description: item.description, quantity: item.quantity, total: item.total, unit: item.unit, unitPrice: item.unitPrice })),
    notes,
    profile: { address: profile?.address, bankIban: profile?.bank_iban, email: profile?.email ?? user?.email ?? null, name: profile?.full_name ?? 'Pašnodarbinātais', regNumber: profile?.person_code },
    subtotal, total, vatAmount, vatRateLabel: `${vatRateValue.toFixed(0)}%`,
  }

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const byMonth = !monthFilter || invoice.issue_date.startsWith(monthFilter)
    const byStatus = statusFilter === 'all' || invoice.status === statusFilter
    const haystack = `${invoice.invoice_number ?? ''} ${invoice.client?.name ?? ''} ${invoice.notes ?? ''}`.toLowerCase()
    return byMonth && byStatus && haystack.includes(search.trim().toLowerCase())
  }), [invoices, monthFilter, search, statusFilter])

  const summary = useMemo(() => {
    const year = (monthFilter || new Date().toISOString()).slice(0, 4)
    const yearIncome = invoices.filter((invoice) => invoice.issue_date.startsWith(year)).reduce((sum, invoice) => sum + invoice.total, 0)
    return {
      yearIncome,
      monthIncome: filtered.reduce((sum, invoice) => sum + invoice.total, 0),
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
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, issue_date, due_date, status, subtotal, vat_amount, vat_rate, total, notes, clients(id, name, reg_number, address, email, bank_iban)')
      .eq('user_id', user.id).order('issue_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) { setFeedback(getFriendlySupabaseError(error.message)); return void setIsLoading(false) }
    setInvoices((data ?? []).map((row: any) => ({ ...row, client: row.clients ?? null, subtotal: Number(row.subtotal ?? 0), vat_amount: Number(row.vat_amount ?? 0), vat_rate: Number(row.vat_rate ?? 0), total: Number(row.total ?? 0) })))
    setIsLoading(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) return
    if (!clientId) return void setFeedback('Vispirms izvēlies klientu.')
    const validItems = preparedItems.filter((item) => item.description.trim())
    if (!validItems.length) return void setFeedback('Pievieno vismaz vienu rēķina rindu.')
    setIsSaving(true); setFeedback(null)
    const { data: invoice, error } = await supabase.from('invoices').insert({ client_id: clientId, due_date: dueDate, issue_date: issueDate, notes: notes || null, status: 'izrakstits', subtotal, total, user_id: user.id, vat_amount: vatAmount, vat_rate: vatRateValue / 100 }).select('id').single()
    if (error || !invoice) { setFeedback(getFriendlySupabaseError(error?.message ?? 'Neizdevās saglabāt rēķinu.')); return void setIsSaving(false) }
    const { error: itemError } = await supabase.from('invoice_items').insert(validItems.map((item) => ({ description: item.description, invoice_id: invoice.id, quantity: item.quantity, total: item.total, unit: item.unit, unit_price: item.unitPrice })))
    if (itemError) { setFeedback(getFriendlySupabaseError(itemError.message)); return void setIsSaving(false) }
    setClientId(''); setIssueDate(new Date().toISOString().slice(0, 10)); setDueDate(new Date().toISOString().slice(0, 10)); setVatRate('0'); setNotes(''); setItems([emptyItem()]); setShowComposer(false); setShowPreview(false); setFeedback('Rēķins saglabāts.'); setIsSaving(false); await loadInvoices()
  }

  async function handleStatusChange(id: string, status: Status) {
    if (!supabase) return
    setUpdatingId(id)
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id)
    if (error) setFeedback(getFriendlySupabaseError(error.message))
    else setInvoices((current) => current.map((invoice) => invoice.id === id ? { ...invoice, status } : invoice))
    setUpdatingId(null)
  }

  async function handleDownload(invoice: Invoice) {
    if (!supabase || !user) return
    setDownloadingId(invoice.id)
    const { data, error } = await supabase.from('invoice_items').select('description, quantity, unit, unit_price, total').eq('invoice_id', invoice.id).order('created_at', { ascending: true })
    if (error) { setFeedback(getFriendlySupabaseError(error.message)); return void setDownloadingId(null) }
    const pdfData: InvoicePdfData = {
      client: { address: invoice.client?.address, bankIban: invoice.client?.bank_iban, email: invoice.client?.email, name: invoice.client?.name ?? 'Klients nav izvēlēts', regNumber: invoice.client?.reg_number },
      dueDate: invoice.due_date, invoiceNumber: invoice.invoice_number ?? `rekins-${invoice.id}`, issueDate: invoice.issue_date,
      items: (data ?? []).map((item: any) => ({ description: item.description, quantity: Number(item.quantity ?? 0), total: Number(item.total ?? 0), unit: item.unit, unitPrice: Number(item.unit_price ?? 0) })),
      notes: invoice.notes ?? '',
      profile: { address: profile?.address, bankIban: profile?.bank_iban, email: profile?.email ?? user.email ?? null, name: profile?.full_name ?? 'Pašnodarbinātais', regNumber: profile?.person_code },
      subtotal: invoice.subtotal, total: invoice.total, vatAmount: invoice.vat_amount, vatRateLabel: `${roundMoney(invoice.vat_rate * 100).toFixed(0)}%`,
    }
    try {
      const blob = await pdf(<InvoicePdfDocument data={pdfData} />).toBlob()
      const url = URL.createObjectURL(blob); const link = document.createElement('a')
      link.href = url; link.download = `${pdfData.invoiceNumber}.pdf`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
    } catch { setFeedback('Neizdevās sagatavot PDF lejupielādi.') } finally { setDownloadingId(null) }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="text-3xl font-semibold text-white">Rēķinu saraksts</h3>
              <p className="text-base text-slate-300">Kalendārā gada ieņēmumi: <span className="font-semibold text-white">{formatCurrency(summary.yearIncome)}</span></p>
            </div>
            <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300">Filtrē rēķinus pēc mēneša, statusa vai klienta, un pārvaldi PDF un statusus vienuviet.</p>
          </div>
          <button type="button" onClick={() => setShowComposer((current) => !current)} className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-medium text-white transition hover:bg-sky-500">
            {showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showComposer ? 'Aizvērt formu' : 'Izveidot rēķinu'}
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title="Atlasītā mēneša ieņēmumi" value={formatCurrency(summary.monthIncome)} />
          <Stat title="Rēķini atlasē" value={String(filtered.length)} />
          <Stat title="Apmaksāti" value={String(summary.paid)} />
          <Stat title="Kavējas" value={String(summary.late)} />
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-[220px_220px_1fr]">
          <Field title="Mēnesis"><input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50" /></Field>
          <Field title="Statuss">
            <div className="relative"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)} className="w-full appearance-none rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 pr-10 text-white outline-none focus:border-emerald-400/50"><option value="all">Visi statusi</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div>
          </Field>
          <Field title="Meklēšana">
            <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 py-3 pl-11 pr-4 text-white outline-none focus:border-emerald-400/50" placeholder="Meklē pēc klienta, numura vai piezīmēm" /></div>
          </Field>
        </div>
        {feedback ? <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">{feedback}</div> : null}
      </section>

      {showComposer ? (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
            <h4 className="text-2xl font-semibold text-white">Jauns rēķins</h4>
            <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field title="Klients"><select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50"><option value="">Izvēlies klientu</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
                <Field title="PVN likme (%)"><input value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50" placeholder="0" /></Field>
                <Field title="Izrakstīšanas datums"><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50" /></Field>
                <Field title="Apmaksas termiņš"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50" /></Field>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between"><h5 className="text-lg font-semibold text-white">Rēķina rindas</h5><button type="button" onClick={() => setItems((current) => [...current, emptyItem()])} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"><Plus className="h-4 w-4" />Pievienot rindu</button></div>
                {items.map((item, index) => <div key={index} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/60 p-4 md:grid-cols-[1.45fr_0.5fr_0.45fr_0.65fr_auto]"><input value={item.description} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, description: e.target.value } : row))} className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" placeholder="Pakalpojuma apraksts" /><input value={item.quantity} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" placeholder="1" /><input value={item.unit} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, unit: e.target.value } : row))} className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" placeholder="gab." /><input value={item.unit_price} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, unit_price: e.target.value } : row))} className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" placeholder="0,00" /><button type="button" onClick={() => setItems((current) => current.length === 1 ? current : current.filter((_, i) => i !== index))} className="inline-flex items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-rose-100 transition hover:bg-rose-400/15"><Trash2 className="h-4 w-4" /></button></div>)}
              </div>
              <Field title="Piezīmes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50" placeholder="Papildu piezīmes rēķinam" /></Field>
              <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/70 p-5 text-base md:grid-cols-3">
                <Stat title="Starpsumma" value={formatCurrency(subtotal)} compact />
                <Stat title="PVN" value={formatCurrency(vatAmount)} compact />
                <Stat title="Kopā" value={formatCurrency(total)} compact accent />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={isSaving} className="inline-flex rounded-2xl bg-emerald-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300">{isSaving ? 'Saglabājam...' : 'Saglabāt rēķinu'}</button>
                <PDFDownloadLink document={<InvoicePdfDocument data={draftPdf} />} fileName={`${draftNumber}.pdf`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-medium text-slate-100 transition hover:bg-white/10">{({ loading }) => <><Download className="h-4 w-4" />{loading ? 'Gatavojam PDF...' : 'Lejupielādēt melnrakstu'}</>}</PDFDownloadLink>
                <button type="button" onClick={() => setShowPreview((current) => !current)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-medium text-slate-100 transition hover:bg-white/10"><Eye className="h-4 w-4" />{showPreview ? 'Paslēpt preview' : 'Rādīt preview'}</button>
              </div>
            </form>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
            <h4 className="text-2xl font-semibold text-white">Melnraksta preview</h4>
            {showPreview ? <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60"><PDFViewer width="100%" height={760} showToolbar><InvoicePdfDocument data={draftPdf} /></PDFViewer></div> : <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-5 py-8 text-base leading-8 text-slate-400">Preview ir paslēpts. Vari to ieslēgt ar pogu “Rādīt preview”.</div>}
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-4 md:p-6">
        {isLoading ? <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-6 text-sm text-slate-300">Ielādējam rēķinus...</div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-5 py-8 text-base leading-8 text-slate-400">Nekas neatbilst atlasītajiem filtriem.</div> : (
          <div className="overflow-hidden rounded-[24px] border border-white/10">
            <div className="hidden grid-cols-[140px_minmax(0,1.5fr)_220px_220px_180px] gap-4 bg-slate-100/5 px-5 py-4 text-sm font-medium text-slate-300 lg:grid"><span>Datums</span><span>Klients / apraksts</span><span>Dokuments</span><span>Statuss</span><span>Summa / darbības</span></div>
            <div className="divide-y divide-white/10">
              {filtered.map((invoice) => (
                <article key={invoice.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[140px_minmax(0,1.5fr)_220px_220px_180px] lg:items-center">
                  <div className="text-base font-medium text-white">{formatDate(invoice.issue_date)}</div>
                  <div className="min-w-0"><p className="truncate text-lg font-semibold text-white">{invoice.client?.name ?? 'Bez klienta nosaukuma'}</p><p className="mt-1 truncate text-sm text-slate-400">{invoice.notes || invoice.client?.reg_number || 'Rēķina ieraksts'}</p></div>
                  <div><p className="text-base font-semibold text-white">{invoice.invoice_number ?? 'Bez numura'}</p><p className="mt-1 text-sm text-slate-400">Termiņš: {formatDate(invoice.due_date)}</p></div>
                  <div className="space-y-2"><span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em]', pill[invoice.status])}>{labels[invoice.status]}</span><div className="relative"><select value={invoice.status} onChange={(e) => void handleStatusChange(invoice.id, e.target.value as Status)} disabled={updatingId === invoice.id} className="w-full appearance-none rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 pr-10 text-sm text-white outline-none focus:border-emerald-400/50 disabled:opacity-60">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></div>
                  <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end"><p className="text-2xl font-semibold text-white">{formatCurrency(invoice.total)}</p><button type="button" onClick={() => void handleDownload(invoice)} disabled={downloadingId === invoice.id} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">{downloadingId === invoice.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}PDF</button></div>
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
  return <article className={cn('rounded-[24px] border border-white/10 bg-slate-900/40 p-5', props.compact && 'rounded-3xl')}><p className="text-sm uppercase tracking-[0.22em] text-slate-500">{props.title}</p><p className={cn('mt-3 text-3xl font-semibold text-white', props.compact && 'text-2xl', props.accent && 'text-emerald-300')}>{props.value}</p></article>
}

function Field(props: { title: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm text-slate-400">{props.title}</span>{props.children}</label>
}
