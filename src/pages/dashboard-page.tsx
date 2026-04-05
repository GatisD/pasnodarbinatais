import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Euro, FileSpreadsheet, Hourglass, Wallet } from 'lucide-react'

import { PickerInput } from '@/components/picker-input'
import { useAuth } from '@/features/auth/auth-provider'
import { formatCurrency, formatDate } from '@/lib/format'
import { roundMoney } from '@/lib/numbers'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'
import { calculateMonthlySelfEmployedTaxes } from '@/lib/tax'

type InvoiceRow = {
  client_name: string | null
  due_date: string
  id: string
  issue_date: string
  status: 'izrakstits' | 'nosutits' | 'apmaksats' | 'kavejas' | 'atcelts'
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

function formatMonthLong(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('lv-LV', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
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

  const monthLabel = useMemo(() => formatMonthLong(selectedMonth), [selectedMonth])

  const chartData = useMemo<ChartRow[]>(() => {
    const monthKeys = Array.from({ length: 12 }, (_, index) =>
      getPreviousMonthKey(selectedMonth, 11 - index),
    )

    return monthKeys.map((monthKey) => {
      const income = roundMoney(
        invoices
          .filter((invoice) => invoice.issue_date.startsWith(monthKey) && invoice.status !== 'atcelts')
          .reduce((sum, invoice) => sum + invoice.total, 0),
      )

      const expenseTotal = roundMoney(
        expenses
          .filter((expense) => expense.date.startsWith(monthKey))
          .reduce((sum, expense) => sum + expense.amount, 0),
      )

      return {
        expenses: expenseTotal,
        income,
        label: formatMonthLabel(monthKey),
        monthKey,
      }
    })
  }, [expenses, invoices, selectedMonth])

  const periodInvoices = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.issue_date.startsWith(selectedMonth))
        .sort((a, b) => b.issue_date.localeCompare(a.issue_date)),
    [invoices, selectedMonth],
  )

  const periodExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.date.startsWith(selectedMonth))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, selectedMonth],
  )

  const monthSummary = useMemo(() => {
    const currentIncome = roundMoney(
      periodInvoices
        .filter((invoice) => invoice.status !== 'atcelts')
        .reduce((sum, invoice) => sum + invoice.total, 0),
    )
    const currentExpenses = roundMoney(periodExpenses.reduce((sum, expense) => sum + expense.amount, 0))
    const taxableIncome = roundMoney(currentIncome - currentExpenses)
    const taxEstimate = calculateMonthlySelfEmployedTaxes(taxableIncome)

    return {
      currentExpenses,
      currentIncome,
      estimatedTaxes: taxEstimate.totalTaxes,
      paidInvoices: periodInvoices.filter((invoice) => invoice.status === 'apmaksats').length,
      taxableIncome,
      totalInvoices: periodInvoices.length,
      vsaoi: taxEstimate.vsaoi,
      iin: taxEstimate.iin,
    }
  }, [periodExpenses, periodInvoices])

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
      hint: `${monthSummary.totalInvoices} rēķini atlasītajā mēnesī`,
      icon: Euro,
    },
    {
      label: 'Izdevumi periodā',
      value: formatCurrency(monthSummary.currentExpenses),
      hint: `${periodExpenses.length} izdevumi atlasītajā mēnesī`,
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
      hint: `VSAOI ${formatCurrency(monthSummary.vsaoi)} + IIN ${formatCurrency(monthSummary.iin)}`,
      icon: Hourglass,
    },
  ]

  return (
    <div className="grid gap-6">
      <section className="pipboy-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="pipboy-accent text-sm uppercase tracking-[0.34em]">Pārskata periods</p>
            <h2 className="pipboy-accent-strong mt-2 text-3xl font-semibold">
              {monthLabel}
            </h2>
            <p className="pipboy-subtle mt-3 max-w-3xl text-base leading-8">
              Šeit redzi atlasītā mēneša ieņēmumus, izdevumus un provizorisko nodokļu ainu.
              Zemāk vari salīdzināt pēdējo 12 mēnešu dinamiku.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PickerInput type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            <button
              type="button"
              onClick={() => setSelectedMonth(startMonthKey())}
              className="pipboy-button px-4 py-3 text-sm font-medium"
            >
              Šis mēnesis
            </button>
          </div>
        </div>

        {feedback ? (
          <div className="mt-5 rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(6,16,8,0.76)] px-4 py-3 text-sm leading-6 text-[rgba(214,255,220,0.9)]">
            {feedback}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <article key={card.label} className="pipboy-stat p-5">
              <div className="flex items-start justify-between gap-4">
                <p className="text-lg font-medium text-[rgba(214,255,220,0.92)]">{card.label}</p>
                <div className="rounded-full border border-[rgba(0,255,70,0.18)] bg-[rgba(0,255,65,0.08)] p-3 text-[#7cff7c]">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="pipboy-stat-value mt-8 text-4xl font-semibold tracking-tight break-words">
                {isLoading ? '...' : card.value}
              </p>
              <p className="pipboy-stat-label mt-3 text-sm">
                {card.hint}
              </p>
            </article>
          )
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="pipboy-panel rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="pipboy-accent-strong text-2xl font-semibold">Pēdējo 12 mēnešu dinamika</h3>
              <p className="pipboy-subtle mt-2 text-base leading-8">
                Grafiks vienmēr beidzas ar atlasīto mēnesi, tāpēc vari ērti paskatīties atpakaļ līdz
                12 mēnešiem.
              </p>
            </div>
          </div>

          <div className="mt-6 h-[320px] rounded-3xl border border-[rgba(0,255,70,0.12)] bg-[rgba(4,10,4,0.72)] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="rgba(0,255,70,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#9cff9c', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#9cff9c', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${Math.round(Number(value ?? 0))}€`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,255,65,0.05)' }}
                  contentStyle={{
                    background: '#081108',
                    border: '1px solid rgba(0,255,70,0.16)',
                    borderRadius: '16px',
                    color: '#efffeb',
                  }}
                  formatter={(value, name) => [
                    formatCurrency(Number(value ?? 0)),
                    name === 'income' ? 'Ieņēmumi' : 'Izdevumi',
                  ]}
                />
                <Bar dataKey="income" name="Ieņēmumi" radius={[8, 8, 0, 0]} fill="#39ff14" />
                <Bar dataKey="expenses" name="Izdevumi" radius={[8, 8, 0, 0]} fill="#00b33c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="pipboy-panel rounded-[28px] p-6">
          <h3 className="pipboy-accent-strong text-2xl font-semibold">Ātrais skats par periodu</h3>
          <div className="mt-5 space-y-4">
            <DashboardQuickList
              title="Jaunākie rēķini periodā"
              emptyText="Šajā mēnesī rēķinu vēl nav."
              items={periodInvoices.slice(0, 5).map((invoice) => ({
                id: invoice.id,
                primary: invoice.client_name ?? 'Bez klienta',
                secondary: `${formatDate(invoice.issue_date)} • ${formatCurrency(invoice.total)}`,
              }))}
            />
            <DashboardQuickList
              title="Jaunākie izdevumi periodā"
              emptyText="Šajā mēnesī izdevumu vēl nav."
              items={periodExpenses.slice(0, 5).map((expense) => ({
                id: expense.id,
                primary: expense.vendor ?? 'Bez piegādātāja',
                secondary: `${formatDate(expense.date)} • ${formatCurrency(expense.amount)}`,
              }))}
            />
            <DashboardQuickList
              title="Nodokļu kopsavilkums"
              emptyText="Nav datu nodokļu aprēķinam."
              highlightValues
              items={[
                {
                  id: 'vsaoi',
                  primary: 'VSAOI prognoze',
                  secondary: formatCurrency(monthSummary.vsaoi),
                },
                {
                  id: 'iin',
                  primary: 'IIN prognoze',
                  secondary: formatCurrency(monthSummary.iin),
                },
                {
                  id: 'paid',
                  primary: 'Apmaksāti rēķini periodā',
                  secondary: `${monthSummary.paidInvoices} gab.`,
                },
              ]}
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
  highlightValues?: boolean
  items: { id: string; primary: string; secondary: string }[]
}) {
  return (
    <div className="rounded-3xl border border-[rgba(0,255,70,0.12)] bg-[rgba(6,16,8,0.66)] p-4">
      <h4 className="pipboy-accent-strong text-lg font-medium">{props.title}</h4>
      {props.items.length === 0 ? (
        <p className="pipboy-subtle mt-3 text-sm">{props.emptyText}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {props.items.map((item) => (
            <div key={item.id} className="pipboy-metric-box px-4 py-3">
              <p className="font-medium text-[#efffeb]">{item.primary}</p>
              <p
                className={`mt-1 text-sm ${
                  props.highlightValues ? 'text-[#39ff14]' : 'text-[rgba(184,255,184,0.7)]'
                }`}
              >
                {item.secondary}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
