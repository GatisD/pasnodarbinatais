import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, FileUp, Plus, Search, Trash2, X } from 'lucide-react'

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

  const filtered = useMemo(() => {
    return expenses.filter((expense) => {
      const byMonth = !monthFilter || expense.date.startsWith(monthFilter)
      const byCategory = categoryFilter === 'all' || expense.category === categoryFilter
      const haystack = `${expense.vendor ?? ''} ${expense.description ?? ''} ${getCategoryLabel(expense.category)}`.toLowerCase()
      return byMonth && byCategory && haystack.includes(search.trim().toLowerCase())
    })
  }, [categoryFilter, expenses, monthFilter, search])

  const summary = useMemo(() => {
    const year = (monthFilter || new Date().toISOString()).slice(0, 4)
    const yearTotal = expenses.filter((expense) => expense.date.startsWith(year)).reduce((sum, expense) => sum + expense.amount, 0)
    const filteredTotal = filtered.reduce((sum, expense) => sum + expense.amount, 0)
    const filteredVat = filtered.reduce((sum, expense) => sum + expense.vat_amount, 0)
    return { filteredTotal, filteredVat, count: filtered.length, yearTotal }
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

    let receiptPath: string | null = null
    let receiptUrl: string | null = null

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

    setDate(new Date().toISOString().slice(0, 10))
    setAmount('0')
    setVatAmount('0')
    setCategory('programmatura')
    setVendor('')
    setDescription('')
    setReceiptFile(null)
    setShowComposer(false)
    setFeedback('Izdevums saglabāts.')
    setIsSaving(false)
    await loadExpenses()
  }

  async function handleDelete(expense: ExpenseRecord) {
    if (!supabase) return

    setDeletingExpenseId(expense.id)
    setFeedback(null)

    if (expense.receipt_path) {
      await supabase.storage.from('expense-documents').remove([expense.receipt_path])
    }

    const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setDeletingExpenseId(null)
      return
    }

    setDeletingExpenseId(null)
    await loadExpenses()
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="text-3xl font-semibold text-white">Izdevumu saraksts</h3>
              <p className="text-base text-slate-300">
                Kalendārā gada izdevumi: <span className="font-semibold text-white">{formatCurrency(summary.yearTotal)}</span>
              </p>
            </div>
            <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300">
              Filtrē izdevumus pēc mēneša, kategorijas vai piegādātāja, un pārvaldi failus no viena skata.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowComposer((current) => !current)}
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-medium text-white transition hover:bg-sky-500"
          >
            {showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showComposer ? 'Aizvērt formu' : 'Pievienot izdevumu'}
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title="Atlasītā perioda izdevumi" value={formatCurrency(summary.filteredTotal)} />
          <Stat title="PVN atlasē" value={formatCurrency(summary.filteredVat)} />
          <Stat title="Ierakstu skaits" value={String(summary.count)} />
          <Stat title="Gada kopējais" value={formatCurrency(summary.yearTotal)} />
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-[220px_240px_1fr]">
          <Field title="Mēnesis">
            <input
              type="month"
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
            />
          </Field>

          <Field title="Kategorija">
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as 'all' | ExpenseCategory)}
                className="w-full appearance-none rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 pr-10 text-white outline-none focus:border-emerald-400/50"
              >
                <option value="all">Visas kategorijas</option>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </Field>

          <Field title="Meklēšana">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 py-3 pl-11 pr-4 text-white outline-none focus:border-emerald-400/50"
                placeholder="Meklē pēc piegādātāja vai apraksta"
              />
            </div>
          </Field>
        </div>

        {feedback ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
            {feedback}
          </div>
        ) : null}
      </section>

      {showComposer ? (
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <h4 className="text-2xl font-semibold text-white">Jauns izdevums</h4>
          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field title="Datums">
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                />
              </Field>

              <Field title="Kategorija">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field title="Summa">
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                  placeholder="0,00"
                />
              </Field>

              <Field title="PVN summa">
                <input
                  value={vatAmount}
                  onChange={(event) => setVatAmount(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                  placeholder="0,00"
                />
              </Field>

              <Field title="Piegādātājs">
                <input
                  value={vendor}
                  onChange={(event) => setVendor(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                  placeholder="Uzņēmuma vai personas nosaukums"
                />
              </Field>

              <Field title="Čeks vai rēķina fails">
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-slate-900/50 px-4 py-4 text-slate-300 transition hover:border-emerald-400/40 hover:bg-slate-900/70">
                  <FileUp className="h-5 w-5 text-emerald-300" />
                  <span className="text-sm">{receiptFile ? receiptFile.name : 'Izvēlies attēlu vai PDF failu'}</span>
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
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                    placeholder="Par ko bija šis izdevums"
                  />
                </Field>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                <Plus className="h-4 w-4" />
                {isSaving ? 'Saglabājam...' : 'Pievienot izdevumu'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-4 md:p-6">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-6 text-sm text-slate-300">
            Ielādējam izdevumus...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-5 py-8 text-base leading-8 text-slate-400">
            Nekas neatbilst atlasītajiem filtriem.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] border border-white/10">
            <div className="hidden grid-cols-[140px_minmax(0,1.4fr)_180px_180px_170px] gap-4 bg-slate-100/5 px-5 py-4 text-sm font-medium text-slate-300 lg:grid">
              <span>Datums</span>
              <span>Piegādātājs / apraksts</span>
              <span>Kategorija</span>
              <span>Fails</span>
              <span>Summa / darbības</span>
            </div>

            <div className="divide-y divide-white/10">
              {filtered.map((expense) => (
                <article
                  key={expense.id}
                  className="grid gap-4 px-5 py-5 lg:grid-cols-[140px_minmax(0,1.4fr)_180px_180px_170px] lg:items-center"
                >
                  <div className="text-base font-medium text-white">{formatDate(expense.date)}</div>

                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-white">
                      {expense.vendor || 'Bez piegādātāja nosaukuma'}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-400">
                      {expense.description || 'Izdevumu ieraksts'}
                    </p>
                  </div>

                  <div>
                    <span className="inline-flex rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-100">
                      {getCategoryLabel(expense.category)}
                    </span>
                  </div>

                  <div>
                    {expense.receipt_url ? (
                      <a
                        className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
                        href={expense.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Atvērt failu
                      </a>
                    ) : (
                      <span className="text-sm text-slate-500">Nav faila</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end">
                    <div>
                      <p className="text-2xl font-semibold text-white">{formatCurrency(expense.amount)}</p>
                      <p className="mt-1 text-sm text-slate-400">PVN: {formatCurrency(expense.vat_amount)}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDelete(expense)}
                      disabled={deletingExpenseId === expense.id}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingExpenseId === expense.id ? 'Dzēšam...' : 'Dzēst'}
                    </button>
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

function Stat(props: { title: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-slate-900/40 p-5">
      <p className="text-sm uppercase tracking-[0.22em] text-slate-500">{props.title}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{props.value}</p>
    </article>
  )
}

function Field(props: { title: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-400">{props.title}</span>
      {props.children}
    </label>
  )
}
