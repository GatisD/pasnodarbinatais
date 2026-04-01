import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Euro, FileSpreadsheet, Hourglass, Wallet } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { formatCurrency, formatDate } from '@/lib/format'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'
import { calculateMonthlySelfEmployedTaxes } from '@/lib/tax'

type InvoiceRow = {
  client_name: string | null
  due_date: string
  id: string
  issue_date: string
  status: 'izrakstits' | 'apmaksats' | 'kavejas' | 'atcelts'
  total: number
}

type ExpenseRow = {
  amount: number
  category: string
  date: string
  id: string
  vendor: string | null
}

type ChartRow = {
  expenses: number
  income: number
  label: string
  monthKey: string
}

function startMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('lv-LV', { month: 'short' }).format(new Date(year, month - 1, 1))
}

function getPreviousMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1 - offset, 1)
  return startMonthKey(date)
}

export function DashboardPage() {
  const { user } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(startMonthKey())
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void loadDashboardData()
  }, [user?.id])

  const monthLabel = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    return new Intl.DateTimeFormat('lv-LV', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month - 1, 1))
  }, [selectedMonth])

  const chartData = useMemo<ChartRow[]>(() => {
    const monthKeys = Array.from({ length: 12 }, (_, index) => getPreviousMonthKey(selectedMonth, 11 - index))

    return monthKeys.map((monthKey) => {
      const income = invoices
        .filter((invoice) => invoice.issue_date.startsWith(monthKey) && invoice.status !== 'atcelts')
        .reduce((sum, invoice) => sum + invoice.total, 0)

      const expenseTotal = expenses
        .filter((expense) => expense.date.startsWith(monthKey))
        .reduce((sum, expense) => sum + expense.amount, 0)

      return {
        expenses: expenseTotal,
        income,
        label: formatMonthLabel(monthKey),
        monthKey,
      }
    })
  }, [expenses, invoices, selectedMonth])

  const monthSummary = useMemo(() => {
    const currentIncome = chartData.find((entry) => entry.monthKey === selectedMonth)?.income ?? 0
    const currentExpenses = chartData.find((entry) => entry.monthKey === selectedMonth)?.expenses ?? 0
    const taxableIncome = currentIncome - currentExpenses
    const taxEstimate = calculateMonthlySelfEmployedTaxes(taxableIncome)

    return {
      currentExpenses,
      currentIncome,
      estimatedTaxes: taxEstimate.totalTaxes,
      taxableIncome,
      vsaoi: taxEstimate.vsaoi,
      iin: taxEstimate.iin,
    }
  }, [chartData, selectedMonth])

  const recentInvoices = useMemo(
    () => invoices.slice().sort((a, b) => b.issue_date.localeCompare(a.issue_date)).slice(0, 5),
    [invoices],
  )

  const recentExpenses = useMemo(
    () => expenses.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [expenses],
  )

  async function loadDashboardData() {
    if (!supabase || !user) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setFeedback(null)

    const [invoiceResult, expenseResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, issue_date, due_date, status, total, clients(name)')
        .eq('user_id', user.id)
        .order('issue_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('id, date, amount, category, vendor')
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
    ])

    if (invoiceResult.error) {
      setFeedback(getFriendlySupabaseError(invoiceResult.error.message))
    }

    if (expenseResult.error) {
      setFeedback(getFriendlySupabaseError(expenseResult.error.message))
    }

    setInvoices(
      (invoiceResult.data ?? []).map((row: any) => ({
        client_name: row.clients?.name ?? null,
        due_date: row.due_date,
        id: row.id,
        issue_date: row.issue_date,
        status: row.status,
        total: Number(row.total ?? 0),
      })),
    )

    setExpenses(
      (expenseResult.data ?? []).map((row: any) => ({
        amount: Number(row.amount ?? 0),
        category: row.category,
        date: row.date,
        id: row.id,
        vendor: row.vendor,
      })),
    )

    setIsLoading(false)
  }

  const summaryCards = [
    {
      label: 'Ieņēmumi periodā',
      value: formatCurrency(monthSummary.currentIncome),
      hint: 'Izrakstītie rēķini izvēlētajā mēnesī',
      icon: Euro,
    },
    {
      label: 'Izdevumi periodā',
      value: formatCurrency(monthSummary.currentExpenses),
      hint: 'Reģistrētie izdevumi izvēlētajā mēnesī',
      icon: Wallet,
    },
    {
      label: 'Apliekamais ienākums',
      value: formatCurrency(monthSummary.taxableIncome),
      hint: 'Ieņēmumi mīnus izdevumi',
      icon: FileSpreadsheet,
    },
    {
      label: 'Prognozētie nodokļi',
      value: formatCurrency(monthSummary.estimatedTaxes),
      hint: 'Vienkāršots 25,5% aprēķins',
      icon: Hourglass,
    },
  ]

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Pārskata periods</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">{monthLabel}</h2>
            <p className="mt-2 max-w-3xl text-base leading-8 text-slate-300">
              Šeit redzi izvēlētā mēneša ieņēmumus un izdevumus, bet zemāk vari salīdzināt arī pēdējo 12 mēnešu dinamiku.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
            />
            <button
              type="button"
              onClick={() => setSelectedMonth(startMonthKey())}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10"
            >
              Šis mēnesis
            </button>
          </div>
        </div>

        {feedback ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
            {feedback}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <article
              key={card.label}
              className="rounded-[28px] border border-white/10 bg-white/5 p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-lg font-medium text-slate-200">{card.label}</p>
                <div className="rounded-full bg-emerald-400/15 p-3 text-emerald-200">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-8 text-4xl font-semibold tracking-tight text-white">
                {isLoading ? '...' : card.value}
              </p>
              <p className="mt-3 text-sm uppercase tracking-[0.24em] text-slate-500">
                {card.hint}
              </p>
            </article>
          )
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold text-white">Pēdējie 12 mēneši</h3>
              <p className="mt-2 text-base leading-8 text-slate-300">
                Salīdzini ieņēmumus un izdevumus pa mēnešiem, pārslēdzot periodu augšā.
              </p>
            </div>
          </div>

          <div className="mt-6 h-[320px] rounded-3xl border border-white/10 bg-slate-950/40 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${Math.round(value)}€`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px',
                    color: '#fff',
                  }}
                  formatter={(value, name) => [
                    formatCurrency(Number(value ?? 0)),
                    name === 'income' ? 'Ieņēmumi' : 'Izdevumi',
                  ]}
                />
                <Bar dataKey="income" name="Ieņēmumi" radius={[8, 8, 0, 0]} fill="#34d399" />
                <Bar dataKey="expenses" name="Izdevumi" radius={[8, 8, 0, 0]} fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6">
          <h3 className="text-2xl font-semibold text-white">Ātrais skats</h3>
          <div className="mt-5 space-y-4">
            <DashboardQuickList
              title="Pēdējie rēķini"
              emptyText="Rēķinu vēl nav."
              items={recentInvoices.map((invoice) => ({
                id: invoice.id,
                primary: invoice.client_name ?? 'Bez klienta',
                secondary: `${formatDate(invoice.issue_date)} • ${formatCurrency(invoice.total)}`,
              }))}
            />
            <DashboardQuickList
              title="Pēdējie izdevumi"
              emptyText="Izdevumu vēl nav."
              items={recentExpenses.map((expense) => ({
                id: expense.id,
                primary: expense.vendor ?? 'Bez piegādātāja',
                secondary: `${formatDate(expense.date)} • ${formatCurrency(expense.amount)}`,
              }))}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function DashboardQuickList(props: {
  title: string
  emptyText: string
  items: { id: string; primary: string; secondary: string }[]
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <h4 className="text-lg font-medium text-white">{props.title}</h4>
      {props.items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">{props.emptyText}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {props.items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="font-medium text-slate-100">{item.primary}</p>
              <p className="mt-1 text-sm text-slate-400">{item.secondary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
