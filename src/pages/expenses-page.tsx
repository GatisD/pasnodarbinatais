import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Copy, ExternalLink, FileUp, LoaderCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

import { PickerInput } from '@/components/picker-input'
import { useAuth } from '@/features/auth/auth-provider'
import { type ExpenseCategory, parseExpenseDocument } from '@/lib/expense-document-import'
import { formatCurrency, formatDate } from '@/lib/format'
import { parseNumber, roundMoney } from '@/lib/numbers'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'

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
  const [importingDocument, setImportingDocument] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all')
  const [search, setSearch] = useState('')
  const importInputRef = useRef<HTMLInputElement | null>(null)

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
      count: filtered.length,
      filteredTotal: filtered.reduce((sum, expense) => sum + expense.amount, 0),
      filteredVat: filtered.reduce((sum, expense) => sum + expense.vat_amount, 0),
      yearTotal: expenses.filter((expense) => expense.date.startsWith(year)).reduce((sum, expense) => sum + expense.amount, 0),
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
    if (parsedAmount <= 0) {
      setFeedback('Ievadi derīgu izdevumu summu.')
      return
    }

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
        setIsSaving(false)
        return
      }
      const { data: signed } = await supabase.storage.from('expense-documents').createSignedUrl(receiptPath, 60 * 60)
      receiptUrl = signed?.signedUrl ?? null
      if (editingExpenseId && existingReceiptPath && existingReceiptPath !== receiptPath) {
        await supabase.storage.from('expense-documents').remove([existingReceiptPath])
      }
    }

    if (editingExpenseId) {
      const { error } = await supabase
        .from('expenses')
        .update({
          amount: parsedAmount,
          category,
          date,
          description: description || null,
          receipt_path: receiptPath,
          receipt_url: receiptUrl,
          vat_amount: parsedVatAmount,
          vendor: vendor || null,
        })
        .eq('id', editingExpenseId)

      if (error) {
        setFeedback(getFriendlySupabaseError(error.message))
        setIsSaving(false)
        return
      }

      resetComposer()
      setShowComposer(false)
      setFeedback('Izdevums atjaunināts.')
      setIsSaving(false)
      await loadExpenses()
      return
    }

    const { error } = await supabase.from('expenses').insert({
      amount: parsedAmount,
      category,
      date,
      description: description || null,
      receipt_path: receiptPath,
      receipt_url: receiptUrl,
      user_id: user.id,
      vat_amount: parsedVatAmount,
      vendor: vendor || null,
    })

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setIsSaving(false)
      return
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
      setDeletingExpenseId(null)
      return
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

  async function handleImportDocument(file: File) {
    setImportingDocument(true)
    setFeedback(null)

    try {
      const parsed = await parseExpenseDocument(file)
      const nextDescription =
        parsed.documentNumber && !parsed.description.includes(parsed.documentNumber)
          ? `${parsed.description} | Dok. Nr. ${parsed.documentNumber}`
          : parsed.description

      setEditingExpenseId(null)
      setDate(parsed.date)
      setAmount(String(parsed.amount))
      setVatAmount(String(parsed.vatAmount))
      setCategory(parsed.category)
      setVendor(parsed.vendor)
      setDescription(nextDescription)
      setReceiptFile(file)
      setExistingReceiptPath(null)
      setExistingReceiptUrl(null)
      setShowComposer(true)
      setFeedback('Dokuments nolasīts kā melnraksts. Pārbaudi laukus un spied "Pievienot izdevumu".')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Dokumentu neizdevās importēt.')
    } finally {
      setImportingDocument(false)
    }
  }

  return (
    <div className="grid gap-4">
      <section className="pipboy-panel rounded-[28px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="pipboy-title text-2xl font-semibold">Izdevumi</h3>
            <span className="pipboy-subtle text-sm">Gada izdevumi: <span className="pipboy-accent-strong font-semibold">{formatCurrency(summary.yearTotal)}</span></span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={clearFilters} className="pipboy-button pipboy-button-ghost px-4 py-2 text-sm font-medium">Notīrīt filtrus</button>
            <button type="button" onClick={() => importInputRef.current?.click()} disabled={importingDocument} className="pipboy-button pipboy-button-ghost px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
              {importingDocument ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {importingDocument ? 'Importējam...' : 'Importēt PDF/JPG'}
            </button>
            <button type="button" onClick={() => { if (showComposer) resetComposer(); setShowComposer((current) => !current) }} className="pipboy-button pipboy-button-primary px-4 py-2 text-sm font-medium">
              {showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showComposer ? 'Aizvērt formu' : 'Pievienot izdevumu'}
            </button>
          </div>
        </div>

        <input ref={importInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImportDocument(file); event.currentTarget.value = '' }} />

        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Stat title="Perioda izdevumi" value={formatCurrency(summary.filteredTotal)} compact />
          <Stat title="PVN atlasē" value={formatCurrency(summary.filteredVat)} compact />
          <Stat title="Ierakstu skaits" value={String(summary.count)} compact />
          <Stat title="Gada kopējais" value={formatCurrency(summary.yearTotal)} compact />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-[200px_240px_1fr]">
          <Field title="Mēnesis"><PickerInput type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="py-2 text-sm" /></Field>
          <Field title="Kategorija">
            <div className="relative">
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'all' | ExpenseCategory)} className="pipboy-input w-full appearance-none px-3 py-2 pr-10 text-sm">
                <option value="all">Visas kategorijas</option>
                {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" />
            </div>
          </Field>
          <div className="col-span-2 xl:col-span-1">
            <Field title="Meklēšana">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pipboy-subtle" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="pipboy-input py-2 pl-10 pr-4 text-sm" placeholder="Meklē pēc piegādātāja vai apraksta" /></div>
            </Field>
          </div>
        </div>
        {feedback ? <div className="pipboy-surface mt-3 px-4 py-2.5 text-sm leading-6 text-[rgba(214,255,220,0.9)]">{feedback}</div> : null}
      </section>

      {showComposer ? (
        <section className="pipboy-panel rounded-[28px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="pipboy-title text-2xl font-semibold">{editingExpenseId ? 'Rediģēt izdevumu' : 'Jauns izdevums'}</h4>
              <p className="pipboy-subtle mt-2 text-sm leading-7">
                Saglabā summu, kategoriju, piegādātāju un, ja vajag, pievieno čeka vai rēķina failu.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetComposer()
                setShowComposer(false)
              }}
              className="pipboy-button h-11 w-11 rounded-full"
              aria-label="Aizvērt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field title="Datums">
                <PickerInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              <Field title="Kategorija">
                <select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)} className="pipboy-input px-4 py-3">
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field title="Summa">
                <input value={amount} onChange={(event) => setAmount(event.target.value)} className="pipboy-input px-4 py-3" placeholder="0,00" />
              </Field>
              <Field title="PVN summa">
                <input value={vatAmount} onChange={(event) => setVatAmount(event.target.value)} className="pipboy-input px-4 py-3" placeholder="0,00" />
              </Field>
              <Field title="Piegādātājs">
                <input
                  value={vendor}
                  onChange={(event) => setVendor(event.target.value)}
                  className="pipboy-input px-4 py-3"
                  placeholder="Uzņēmuma vai personas nosaukums"
                />
              </Field>
              <Field title="Čeks vai rēķina fails">
                <label className="pipboy-empty flex cursor-pointer items-center gap-3 px-4 py-4 transition hover:border-[rgba(57,255,20,0.32)] hover:bg-[rgba(9,22,9,0.9)]">
                  <FileUp className="h-5 w-5 pipboy-accent-strong" />
                  <span className="text-sm">
                    {receiptFile ? receiptFile.name : existingReceiptPath ? 'Esošais fails saglabāts' : 'Izvēlies attēlu vai PDF failu'}
                  </span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    className="hidden"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              </Field>
              <div className="md:col-span-2">
                <Field title="Apraksts">
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    className="pipboy-input px-4 py-3"
                    placeholder="Par ko bija šis izdevums"
                  />
                </Field>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={isSaving} className="pipboy-button pipboy-button-primary px-5 py-3 font-medium">
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isSaving ? 'Saglabājam...' : editingExpenseId ? 'Saglabāt izmaiņas' : 'Pievienot izdevumu'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="pipboy-panel rounded-[28px] p-3 md:p-4">
        {isLoading ? (
          <div className="pipboy-surface px-4 py-6 text-sm pipboy-subtle">Ielādējam izdevumus...</div>
        ) : filtered.length === 0 ? (
          <div className="pipboy-empty px-5 py-8 text-base leading-8">Nekas neatbilst atlasītajiem filtriem.</div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-[rgba(0,255,70,0.12)]">
            <div className="hidden grid-cols-[100px_1fr_auto_110px_auto] gap-3 bg-[rgba(9,19,9,0.9)] px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-[rgba(184,255,184,0.6)] lg:grid">
              <span>Datums</span><span>Piegādātājs / apraksts</span><span>Kategorija</span><span className="text-right">Summa</span><span className="text-right">Darbības</span>
            </div>
            <div className="divide-y divide-[rgba(0,255,70,0.08)]">
              {filtered.map((expense) => (
                <article key={expense.id} className="px-4 py-2.5">
                  {/* Mobile */}
                  <div className="lg:hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold pipboy-title">{expense.vendor || 'Bez piegādātāja'}</p>
                        <p className="mt-0.5 truncate text-xs pipboy-subtle">{expense.description || 'Izdevumu ieraksts'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-semibold pipboy-accent-strong">{formatCurrency(expense.amount)}</p>
                        <p className="text-xs pipboy-subtle">PVN: {formatCurrency(expense.vat_amount)}</p>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                      <span className="text-[#efffeb]">{formatDate(expense.date)}</span>
                      <span className="pipboy-subtle">·</span>
                      <span className="pipboy-status pipboy-status-paid">{getCategoryLabel(expense.category)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {expense.receipt_url && <a className="pipboy-button flex-1 px-3 py-2 text-xs font-medium" href={expense.receipt_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Fails</a>}
                      <button type="button" onClick={() => openEditor(expense, false)} className="pipboy-button flex-1 px-3 py-2 text-xs font-medium"><Pencil className="h-3.5 w-3.5" />Rediģēt</button>
                      <button type="button" onClick={() => openEditor(expense, true)} className="pipboy-button pipboy-button-warning flex-1 px-3 py-2 text-xs font-medium"><Copy className="h-3.5 w-3.5" />Dublēt</button>
                      <button type="button" onClick={() => void handleDelete(expense)} disabled={deletingExpenseId === expense.id} className="pipboy-button pipboy-button-danger flex-1 px-3 py-2 text-xs font-medium disabled:opacity-60">{deletingExpenseId === expense.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}{deletingExpenseId === expense.id ? 'Dzēšam...' : 'Dzēst'}</button>
                    </div>
                  </div>
                  {/* Desktop — single row */}
                  <div className={cn('hidden items-center gap-3 lg:grid lg:grid-cols-[100px_1fr_auto_110px_auto]')}>
                    <div className="text-sm font-medium text-[#efffeb]">{formatDate(expense.date)}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold pipboy-title">{expense.vendor || 'Bez piegādātāja nosaukuma'}</p>
                      <p className="mt-0.5 truncate text-xs pipboy-subtle">{expense.description || 'Izdevumu ieraksts'}</p>
                    </div>
                    <div><span className="pipboy-status pipboy-status-paid">{getCategoryLabel(expense.category)}</span></div>
                    <div className="text-right">
                      <p className="text-base font-semibold pipboy-accent-strong">{formatCurrency(expense.amount)}</p>
                      <p className="mt-0.5 text-xs pipboy-subtle">PVN: {formatCurrency(expense.vat_amount)}</p>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-1">
                      {expense.receipt_url && <a href={expense.receipt_url} target="_blank" rel="noreferrer" title="Atvērt failu" className="pipboy-button h-8 w-8 rounded-full p-0"><ExternalLink className="h-4 w-4" /></a>}
                      <button type="button" onClick={() => openEditor(expense, false)} title="Rediģēt" className="pipboy-button h-8 w-8 rounded-full p-0"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => openEditor(expense, true)} title="Dublēt" className="pipboy-button pipboy-button-warning h-8 w-8 rounded-full p-0"><Copy className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void handleDelete(expense)} disabled={deletingExpenseId === expense.id} title="Dzēst" className="pipboy-button pipboy-button-danger h-8 w-8 rounded-full p-0 disabled:opacity-60">{deletingExpenseId === expense.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
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

function Stat(props: { title: string; value: string; compact?: boolean }) {
  if (props.compact) {
    return <article className="pipboy-stat px-4 py-2.5"><p className="pipboy-stat-label text-xs">{props.title}</p><p className="pipboy-stat-value mt-1 text-xl font-semibold break-words">{props.value}</p></article>
  }
  return (
    <article className="pipboy-stat p-5">
      <p className="pipboy-stat-label text-sm">{props.title}</p>
      <p className="pipboy-stat-value mt-3 text-3xl font-semibold break-words">{props.value}</p>
    </article>
  )
}

function Field(props: { title: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="pipboy-field-label">{props.title}</span>
      {props.children}
    </label>
  )
}
