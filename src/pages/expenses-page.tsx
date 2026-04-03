import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Copy, FileUp, LoaderCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { formatCurrency, formatDate } from '@/lib/format'
import { parseNumber, roundMoney } from '@/lib/numbers'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'

type ExpenseCategory =
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

type ExpenseRecord = {
  amount: number
  category: ExpenseCategory
  date: string
  description: string | null
  id: string
  receipt_path: string | null
  receipt_url: string | null
  vat_amount: number
  vendor: string | null
}

const categoryOptions: { label: string; value: ExpenseCategory }[] = [
  { value: 'sakari', label: 'Sakari' },
  { value: 'transports', label: 'Transports' },
  { value: 'degviela', label: 'Degviela' },
  { value: 'biroja_preces', label: 'Biroja preces' },
  { value: 'programmatura', label: 'Programmatūra' },
  { value: 'majaslapa', label: 'Mājaslapa' },
  { value: 'reklama', label: 'Reklāma' },
  { value: 'gramatvediba', label: 'Grāmatvedība' },
  { value: 'telpu_noma', label: 'Telpu noma' },
  { value: 'komunalie', label: 'Komunālie' },
  { value: 'apdrosinasana', label: 'Apdrošināšana' },
  { value: 'profesionala_izglitiba', label: 'Profesionālā izglītība' },
  { value: 'aprikojums', label: 'Aprīkojums' },
  { value: 'bankas_komisija', label: 'Bankas komisija' },
  { value: 'citi', label: 'Citi' },
]

function getCategoryLabel(category: ExpenseCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? category
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export function ExpensesPage() {
  const { user } = useAuth()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('0')
  const [vatAmount, setVatAmount] = useState('0')
  const [category, setCategory] = useState<ExpenseCategory>('programmatura')
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null)
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)
  const [showComposer, setShowComposer] = useState(false)
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    void loadExpenses()
  }, [user?.id])

  const filtered = useMemo(
    () =>
      expenses.filter((expense) => {
        const byMonth = !monthFilter || expense.date.startsWith(monthFilter)
        const byCategory = categoryFilter === 'all' || expense.category === categoryFilter
        const haystack = `${expense.vendor ?? ''} ${expense.description ?? ''} ${getCategoryLabel(expense.category)}`.toLowerCase()
        return byMonth && byCategory && haystack.includes(search.trim().toLowerCase())
      }),
    [categoryFilter, expenses, monthFilter, search],
  )

  const summary = useMemo(() => {
    const year = (monthFilter || new Date().toISOString()).slice(0, 4)
    return {
      yearTotal: expenses.filter((expense) => expense.date.startsWith(year)).reduce((sum, expense) => sum + expense.amount, 0),
      filteredTotal: filtered.reduce((sum, expense) => sum + expense.amount, 0),
      filteredVat: filtered.reduce((sum, expense) => sum + expense.vat_amount, 0),
      count: filtered.length,
    }
  }, [expenses, filtered, monthFilter])

  async function loadExpenses() {
    if (!supabase || !user) {
      setIsLoading(false)
      return
    }

    const client = supabase
    const { data, error } = await client
      .from('expenses')
      .select('id, date, amount, vat_amount, category, vendor, description, receipt_url, receipt_path')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setIsLoading(false)
      return
    }

    const mappedExpenses = await Promise.all(
      (data ?? []).map(async (row: any) => {
        let signedUrl: string | null = row.receipt_url ?? null
        if (!signedUrl && row.receipt_path) {
          const { data: signed } = await client.storage.from('expense-documents').createSignedUrl(row.receipt_path, 60 * 60)
          signedUrl = signed?.signedUrl ?? null
        }

        return {
          amount: Number(row.amount ?? 0),
          category: row.category,
          date: row.date,
          description: row.description,
          id: row.id,
          receipt_path: row.receipt_path,
          receipt_url: signedUrl,
          vat_amount: Number(row.vat_amount ?? 0),
          vendor: row.vendor,
        } satisfies ExpenseRecord
      }),
    )

    setExpenses(mappedExpenses)
    setIsLoading(false)
  }

  function resetComposer() {
    setEditingExpenseId(null)
    setDate(new Date().toISOString().slice(0, 10))
    setAmount('0')
    setVatAmount('0')
    setCategory('programmatura')
    setVendor('')
    setDescription('')
    setReceiptFile(null)
    setExistingReceiptPath(null)
    setExistingReceiptUrl(null)
  }

  function clearFilters() {
    setMonthFilter(new Date().toISOString().slice(0, 7))
    setCategoryFilter('all')
    setSearch('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) return

    const parsedAmount = roundMoney(parseNumber(amount))
    const parsedVatAmount = roundMoney(parseNumber(vatAmount))
    if (parsedAmount <= 0) return void setFeedback('Ievadi derīgu izdevumu summu.')

    setIsSaving(true)
    setFeedback(null)

    let receiptPath = existingReceiptPath
    let receiptUrl = existingReceiptUrl

    if (receiptFile) {
      const fileName = `${Date.now()}-${sanitizeFileName(receiptFile.name)}`
      receiptPath = `${user.id}/${fileName}`
      const { error: uploadError } = await supabase.storage.from('expense-documents').upload(receiptPath, receiptFile, { upsert: false })
      if (uploadError) {
        setFeedback(getFriendlySupabaseError(uploadError.message))
        return void setIsSaving(false)
      }
      const { data: signed } = await supabase.storage.from('expense-documents').createSignedUrl(receiptPath, 60 * 60)
      receiptUrl = signed?.signedUrl ?? null
      if (editingExpenseId && existingReceiptPath && existingReceiptPath !== receiptPath) {
        await supabase.storage.from('expense-documents').remove([existingReceiptPath])
      }
    }

    if (editingExpenseId) {
      const { error } = await supabase.from('expenses').update({ amount: parsedAmount, category, date, description: description || null, receipt_path: receiptPath, receipt_url: receiptUrl, vat_amount: parsedVatAmount, vendor: vendor || null }).eq('id', editingExpenseId)
      if (error) {
        setFeedback(getFriendlySupabaseError(error.message))
        return void setIsSaving(false)
      }
      resetComposer()
      setShowComposer(false)
      setFeedback('Izdevums atjaunināts.')
      setIsSaving(false)
      return void loadExpenses()
    }

    const { error } = await supabase.from('expenses').insert({ amount: parsedAmount, category, date, description: description || null, receipt_path: receiptPath, receipt_url: receiptUrl, user_id: user.id, vat_amount: parsedVatAmount, vendor: vendor || null })
    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      return void setIsSaving(false)
    }

    resetComposer()
    setShowComposer(false)
    setFeedback('Izdevums saglabāts.')
    setIsSaving(false)
    await loadExpenses()
  }

  async function handleDelete(expense: ExpenseRecord) {
    if (!supabase) return
    const confirmed = window.confirm(`Dzēst izdevumu ${formatCurrency(expense.amount)} apmērā?`)
    if (!confirmed) return

    setDeletingExpenseId(expense.id)
    setFeedback(null)
    if (expense.receipt_path) await supabase.storage.from('expense-documents').remove([expense.receipt_path])
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      return void setDeletingExpenseId(null)
    }
    setDeletingExpenseId(null)
    setFeedback('Izdevums dzēsts.')
    await loadExpenses()
  }

  function openEditor(expense: ExpenseRecord, duplicate: boolean) {
    setEditingExpenseId(duplicate ? null : expense.id)
    setDate(duplicate ? new Date().toISOString().slice(0, 10) : expense.date)
    setAmount(String(expense.amount))
    setVatAmount(String(expense.vat_amount))
    setCategory(expense.category)
    setVendor(expense.vendor ?? '')
    setDescription(expense.description ?? '')
    setReceiptFile(null)
    setExistingReceiptPath(duplicate ? null : expense.receipt_path)
    setExistingReceiptUrl(duplicate ? null : expense.receipt_url)
    setShowComposer(true)
    setFeedback(duplicate ? 'Izdevums ielādēts kā jauns melnraksts.' : 'Izdevums ielādēts rediģēšanai.')
  }

  return (
    <div className="grid gap-6">
      <section className="pipboy-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="pipboy-title text-3xl font-semibold">Izdevumi</h3>
              <p className="pipboy-subtle text-base">Kalendārā gada izdevumi: <span className="pipboy-accent-strong font-semibold">{formatCurrency(summary.yearTotal)}</span></p>
            </div>
            <p className="pipboy-subtle mt-3 max-w-3xl text-base leading-8">Filtrē izdevumus pēc mēneša, kategorijas vai piegādātāja un pārvaldi failus no viena skata.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <button type="button" onClick={clearFilters} className="pipboy-button pipboy-button-ghost px-5 py-3 font-medium">Notīrīt filtrus</button>
            <button type="button" onClick={() => { if (showComposer) resetComposer(); setShowComposer((current) => !current) }} className="pipboy-button pipboy-button-primary px-5 py-3 font-medium">{showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showComposer ? 'Aizvērt formu' : 'Pievienot izdevumu'}</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title="Atlasītā perioda izdevumi" value={formatCurrency(summary.filteredTotal)} />
          <Stat title="PVN atlasē" value={formatCurrency(summary.filteredVat)} />
          <Stat title="Ierakstu skaits" value={String(summary.count)} />
          <Stat title="Gada kopējais" value={formatCurrency(summary.yearTotal)} />
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-[220px_240px_1fr]">
          <Field title="Mēnesis"><input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="pipboy-input px-4 py-3" /></Field>
          <Field title="Kategorija"><div className="relative"><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'all' | ExpenseCategory)} className="pipboy-input w-full appearance-none px-4 py-3 pr-10"><option value="all">Visas kategorijas</option>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" /></div></Field>
          <Field title="Meklēšana"><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="pipboy-input py-3 pl-11 pr-4" placeholder="Meklē pēc piegādātāja vai apraksta" /></div></Field>
        </div>
        {feedback ? <div className="pipboy-surface mt-4 px-4 py-3 text-sm leading-6 text-[rgba(214,255,220,0.9)]">{feedback}</div> : null}
      </section>

      {showComposer ? (
        <section className="pipboy-panel rounded-[28px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="pipboy-title text-2xl font-semibold">{editingExpenseId ? 'Rediģēt izdevumu' : 'Jauns izdevums'}</h4>
              <p className="pipboy-subtle mt-2 text-sm leading-7">Saglabā summu, kategoriju, piegādātāju un, ja vajag, pievieno čeka vai rēķina failu.</p>
            </div>
            <button type="button" onClick={() => { resetComposer(); setShowComposer(false) }} className="pipboy-button h-11 w-11 rounded-full" aria-label="Aizvērt"><X className="h-4 w-4" /></button>
          </div>

          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field title="Datums"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="pipboy-input px-4 py-3" /></Field>
              <Field title="Kategorija"><select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)} className="pipboy-input px-4 py-3">{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
              <Field title="Summa"><input value={amount} onChange={(event) => setAmount(event.target.value)} className="pipboy-input px-4 py-3" placeholder="0,00" /></Field>
              <Field title="PVN summa"><input value={vatAmount} onChange={(event) => setVatAmount(event.target.value)} className="pipboy-input px-4 py-3" placeholder="0,00" /></Field>
              <Field title="Piegādātājs"><input value={vendor} onChange={(event) => setVendor(event.target.value)} className="pipboy-input px-4 py-3" placeholder="Uzņēmuma vai personas nosaukums" /></Field>
              <Field title="Čeks vai rēķina fails"><label className="pipboy-empty flex cursor-pointer items-center gap-3 px-4 py-4 transition hover:border-[rgba(57,255,20,0.32)] hover:bg-[rgba(9,22,9,0.9)]"><FileUp className="h-5 w-5 pipboy-accent-strong" /><span className="text-sm">{receiptFile ? receiptFile.name : existingReceiptPath ? 'Esošais fails saglabāts' : 'Izvēlies attēlu vai PDF failu'}</span><input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} /></label></Field>
              <div className="md:col-span-2"><Field title="Apraksts"><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="pipboy-input px-4 py-3" placeholder="Par ko bija šis izdevums" /></Field></div>
            </div>
            <div className="flex gap-3"><button type="submit" disabled={isSaving} className="pipboy-button pipboy-button-primary px-5 py-3 font-medium">{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{isSaving ? 'Saglabājam...' : editingExpenseId ? 'Saglabāt izmaiņas' : 'Pievienot izdevumu'}</button></div>
          </form>
        </section>
      ) : null}

      <section className="pipboy-panel rounded-[28px] p-4 md:p-6">
        {isLoading ? <div className="pipboy-surface px-4 py-6 text-sm pipboy-subtle">Ielādējam izdevumus...</div> : filtered.length === 0 ? <div className="pipboy-empty px-5 py-8 text-base leading-8">Nekas neatbilst atlasītajiem filtriem.</div> : (
          <div className="overflow-hidden rounded-[24px] border border-[rgba(0,255,70,0.12)]">
            <div className="hidden grid-cols-[140px_minmax(220px,1.4fr)_180px_180px_290px] gap-4 bg-[rgba(9,19,9,0.9)] px-5 py-4 text-sm font-medium text-[rgba(184,255,184,0.82)] lg:grid"><span>Datums</span><span>Piegādātājs / apraksts</span><span>Kategorija</span><span>Fails</span><span>Summa / darbības</span></div>
            <div className="divide-y divide-[rgba(0,255,70,0.08)]">
              {filtered.map((expense) => (
                <article key={expense.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[140px_minmax(220px,1.4fr)_180px_180px_290px] lg:items-center">
                  <div className="text-base font-medium text-[#efffeb]">{formatDate(expense.date)}</div>
                  <div className="min-w-0"><p className="truncate text-lg font-semibold pipboy-title">{expense.vendor || 'Bez piegādātāja nosaukuma'}</p><p className="mt-1 truncate text-sm pipboy-subtle">{expense.description || 'Izdevumu ieraksts'}</p></div>
                  <div><span className="pipboy-status pipboy-status-paid">{getCategoryLabel(expense.category)}</span></div>
                  <div>{expense.receipt_url ? <a className="pipboy-button px-4 py-2 text-sm" href={expense.receipt_url} target="_blank" rel="noreferrer">Atvērt failu</a> : <span className="text-sm pipboy-subtle">Nav faila</span>}</div>
                  <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end"><div><p className="text-2xl font-semibold pipboy-accent-strong">{formatCurrency(expense.amount)}</p><p className="mt-1 text-sm pipboy-subtle">PVN: {formatCurrency(expense.vat_amount)}</p></div><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => openEditor(expense, false)} className="pipboy-button px-3 py-2 text-sm font-medium"><Pencil className="h-4 w-4" />Rediģēt</button><button type="button" onClick={() => openEditor(expense, true)} className="pipboy-button pipboy-button-warning px-3 py-2 text-sm font-medium"><Copy className="h-4 w-4" />Dublēt</button><button type="button" onClick={() => void handleDelete(expense)} disabled={deletingExpenseId === expense.id} className="pipboy-button pipboy-button-danger px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">{deletingExpenseId === expense.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{deletingExpenseId === expense.id ? 'Dzēšam...' : 'Dzēst'}</button></div></div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat(props: { title: string; value: string }) {
  return <article className="pipboy-stat p-5"><p className="pipboy-stat-label text-sm">{props.title}</p><p className="pipboy-stat-value mt-3 text-3xl font-semibold">{props.value}</p></article>
}

function Field(props: { title: string; children: React.ReactNode }) {
  return <label className="block"><span className="pipboy-field-label">{props.title}</span>{props.children}</label>
}
