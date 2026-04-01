import { useEffect, useMemo, useState } from 'react'
import { Plus, Receipt, Trash2, Wallet } from 'lucide-react'

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

export function ExpensesPage() {
  const { user } = useAuth()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('0')
  const [vatAmount, setVatAmount] = useState('0')
  const [category, setCategory] = useState<ExpenseCategory>('programmatura')
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)

  useEffect(() => {
    void loadExpenses()
  }, [user?.id])

  const totals = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7)
    const monthExpenses = expenses.filter((expense) => expense.date.startsWith(monthKey))
    const monthTotal = roundMoney(monthExpenses.reduce((sum, expense) => sum + expense.amount, 0))
    const monthVat = roundMoney(monthExpenses.reduce((sum, expense) => sum + expense.vat_amount, 0))
    const allTotal = roundMoney(expenses.reduce((sum, expense) => sum + expense.amount, 0))

    return {
      allTotal,
      monthTotal,
      monthVat,
    }
  }, [expenses])

  async function loadExpenses() {
    if (!supabase || !user) {
      setIsLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('id, date, amount, vat_amount, category, vendor, description, receipt_url')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setIsLoading(false)
      return
    }

    setExpenses(
      (data ?? []).map((row: any) => ({
        amount: Number(row.amount ?? 0),
        category: row.category,
        date: row.date,
        description: row.description,
        id: row.id,
        receipt_url: row.receipt_url,
        vat_amount: Number(row.vat_amount ?? 0),
        vendor: row.vendor,
      })),
    )
    setIsLoading(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase || !user) {
      return
    }

    const parsedAmount = roundMoney(parseNumber(amount))
    const parsedVatAmount = roundMoney(parseNumber(vatAmount))

    if (parsedAmount <= 0) {
      setFeedback('Ievadi derīgu izdevumu summu.')
      return
    }

    setIsSaving(true)
    setFeedback(null)

    const { error } = await supabase.from('expenses').insert({
      amount: parsedAmount,
      category,
      date,
      description: description || null,
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
    setFeedback('Izdevums saglabāts.')
    setIsSaving(false)
    await loadExpenses()
  }

  async function handleDelete(expenseId: string) {
    if (!supabase) {
      return
    }

    setDeletingExpenseId(expenseId)
    setFeedback(null)

    const { error } = await supabase.from('expenses').delete().eq('id', expenseId)

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setDeletingExpenseId(null)
      return
    }

    setDeletingExpenseId(null)
    await loadExpenses()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-white">Jauns izdevums</h3>
            <p className="mt-2 text-base leading-8 text-slate-300">
              Reģistrē izmaksas, PVN un piegādātāju. Čeku augšupielādi pieliksim nākamajā solī.
            </p>
          </div>
          <div className="rounded-full bg-emerald-400/15 p-3 text-emerald-200">
            <Receipt className="h-5 w-5" />
          </div>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Datums</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Kategorija</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Summa</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                placeholder="0,00"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">PVN summa</span>
              <input
                value={vatAmount}
                onChange={(event) => setVatAmount(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                placeholder="0,00"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm text-slate-300">Piegādātājs</span>
              <input
                value={vendor}
                onChange={(event) => setVendor(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                placeholder="Uzņēmuma vai personas nosaukums"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm text-slate-300">Apraksts</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                placeholder="Par ko bija šis izdevums"
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/70 p-5 text-base md:grid-cols-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Šis mēnesis</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(totals.monthTotal)}</p>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">PVN šomēnes</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(totals.monthVat)}</p>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Kopā reģistrēts</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">{formatCurrency(totals.allTotal)}</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
          >
            <Plus className="h-4 w-4" />
            {isSaving ? 'Saglabājam...' : 'Pievienot izdevumu'}
          </button>

          {feedback ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
              {feedback}
            </div>
          ) : null}
        </form>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-white">Izdevumu saraksts</h3>
            <p className="mt-2 text-base leading-8 text-slate-300">
              Te redzēsi jaunākos izdevumus, kategorijas un summas. Nākamajā solī varēsim pielikt čekus un filtrus.
            </p>
          </div>
          <div className="rounded-full bg-sky-400/15 p-3 text-sky-200">
            <Wallet className="h-5 w-5" />
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-6 text-sm text-slate-300">
            Ielādējam izdevumus...
          </div>
        ) : expenses.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-5 py-8 text-base leading-8 text-slate-400">
            Izdevumu vēl nav. Pievieno pirmo ierakstu no kreisās puses formas.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {expenses.map((expense) => (
              <article
                key={expense.id}
                className="rounded-3xl border border-white/10 bg-slate-900/70 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-500">
                      {getCategoryLabel(expense.category)}
                    </p>
                    <h4 className="mt-2 text-xl font-semibold text-white">
                      {expense.vendor || 'Bez piegādātāja nosaukuma'}
                    </h4>
                    <p className="mt-2 text-sm text-slate-400">
                      Datums: {formatDate(expense.date)}
                      {expense.description ? ` | ${expense.description}` : ''}
                    </p>
                    {expense.receipt_url ? (
                      <a
                        className="mt-2 inline-flex text-sm text-emerald-300 underline-offset-4 hover:underline"
                        href={expense.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Atvērt pievienoto čeku
                      </a>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-semibold text-white">{formatCurrency(expense.amount)}</p>
                    <p className="mt-2 text-sm text-slate-400">PVN: {formatCurrency(expense.vat_amount)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleDelete(expense.id)}
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
        )}
      </section>
    </div>
  )
}
