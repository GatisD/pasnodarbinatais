import { useEffect, useMemo, useState } from 'react'
import { Calculator, Download, FileSpreadsheet, Landmark, ReceiptText } from 'lucide-react'

import { formatCurrency, formatDate } from '@/lib/format'
import { roundMoney } from '@/lib/numbers'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'
import { calculateMonthlySelfEmployedTaxes } from '@/lib/tax'
import { useAuth } from '@/features/auth/auth-provider'

type ReportInvoice = {
  client_name: string | null
  due_date: string
  id: string
  invoice_number: string
  issue_date: string
  paid_at: string | null
  status: 'izrakstits' | 'apmaksats' | 'kavejas' | 'atcelts'
  total: number
  vat_amount: number
}

type ReportExpense = {
  amount: number
  category: string
  date: string
  description: string | null
  id: string
  vat_amount: number
  vendor: string | null
}

type ProfileSettings = {
  full_name: string | null
  is_vat_payer: boolean
  tax_regime: 'visparejais' | 'mun'
}

type MonthSummary = {
  expenses: number
  iin: number
  income: number
  label: string
  monthKey: string
  taxes: number
  taxableIncome: number
  vatIn: number
  vatOut: number
  vsaoi: number
}

function currentQuarter(date = new Date()) {
  return Math.floor(date.getMonth() / 3) + 1
}

function monthKeyFromDate(value: string) {
  return value.slice(0, 7)
}

function formatMonthName(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('lv-LV', { month: 'long' }).format(new Date(year, month - 1, 1))
}

function buildQuarterMonthKeys(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1
  return Array.from({ length: 3 }, (_, index) => `${year}-${String(startMonth + index).padStart(2, '0')}`)
}

function buildYearMonthKeys(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
}

function reportDateForInvoice(invoice: ReportInvoice) {
  return invoice.paid_at ? invoice.paid_at.slice(0, 10) : invoice.issue_date
}

function makeCsv(rows: Array<Array<string | number>>) {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\n')
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const blob = new Blob([`\uFEFF${makeCsv(rows)}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function ReportsPage() {
  const { user } = useAuth()
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [selectedQuarter, setSelectedQuarter] = useState(String(currentQuarter()))
  const [invoices, setInvoices] = useState<ReportInvoice[]>([])
  const [expenses, setExpenses] = useState<ReportExpense[]>([])
  const [profile, setProfile] = useState<ProfileSettings>({
    full_name: null,
    is_vat_payer: false,
    tax_regime: 'visparejais',
  })
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void loadReportsData()
  }, [user?.id])

  const yearNumber = Number(selectedYear)
  const quarterNumber = Number(selectedQuarter)
  const quarterMonthKeys = useMemo(
    () => buildQuarterMonthKeys(yearNumber, quarterNumber),
    [quarterNumber, yearNumber],
  )

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.status === 'apmaksats'),
    [invoices],
  )

  const quarterMonths = useMemo<MonthSummary[]>(
    () =>
      quarterMonthKeys.map((monthKey) => {
        const income = roundMoney(
          paidInvoices
            .filter((invoice) => monthKeyFromDate(reportDateForInvoice(invoice)) === monthKey)
            .reduce((sum, invoice) => sum + invoice.total, 0),
        )

        const expenseTotal = roundMoney(
          expenses
            .filter((expense) => monthKeyFromDate(expense.date) === monthKey)
            .reduce((sum, expense) => sum + expense.amount, 0),
        )

        const vatOut = roundMoney(
          paidInvoices
            .filter((invoice) => monthKeyFromDate(reportDateForInvoice(invoice)) === monthKey)
            .reduce((sum, invoice) => sum + invoice.vat_amount, 0),
        )

        const vatIn = roundMoney(
          expenses
            .filter((expense) => monthKeyFromDate(expense.date) === monthKey)
            .reduce((sum, expense) => sum + expense.vat_amount, 0),
        )

        const taxableIncome = roundMoney(income - expenseTotal)
        const taxEstimate = calculateMonthlySelfEmployedTaxes(taxableIncome)

        return {
          expenses: expenseTotal,
          iin: taxEstimate.iin,
          income,
          label: formatMonthName(monthKey),
          monthKey,
          taxes: taxEstimate.totalTaxes,
          taxableIncome,
          vatIn,
          vatOut,
          vsaoi: taxEstimate.vsaoi,
        }
      }),
    [expenses, paidInvoices, quarterMonthKeys],
  )

  const quarterSummary = useMemo(() => {
    const income = roundMoney(quarterMonths.reduce((sum, month) => sum + month.income, 0))
    const expenseTotal = roundMoney(quarterMonths.reduce((sum, month) => sum + month.expenses, 0))
    const taxableIncome = roundMoney(quarterMonths.reduce((sum, month) => sum + month.taxableIncome, 0))
    const vsaoi = roundMoney(quarterMonths.reduce((sum, month) => sum + month.vsaoi, 0))
    const iin = roundMoney(quarterMonths.reduce((sum, month) => sum + month.iin, 0))
    const vatOut = roundMoney(quarterMonths.reduce((sum, month) => sum + month.vatOut, 0))
    const vatIn = roundMoney(quarterMonths.reduce((sum, month) => sum + month.vatIn, 0))

    return {
      expenses: expenseTotal,
      iin,
      income,
      taxableIncome,
      totalTaxes: roundMoney(vsaoi + iin),
      vatDiff: roundMoney(vatOut - vatIn),
      vatIn,
      vatOut,
      vsaoi,
    }
  }, [quarterMonths])

  const yearMonths = useMemo<MonthSummary[]>(
    () =>
      buildYearMonthKeys(yearNumber).map((monthKey) => {
        const income = roundMoney(
          paidInvoices
            .filter((invoice) => monthKeyFromDate(reportDateForInvoice(invoice)) === monthKey)
            .reduce((sum, invoice) => sum + invoice.total, 0),
        )
        const expenseTotal = roundMoney(
          expenses
            .filter((expense) => monthKeyFromDate(expense.date) === monthKey)
            .reduce((sum, expense) => sum + expense.amount, 0),
        )
        const vatOut = roundMoney(
          paidInvoices
            .filter((invoice) => monthKeyFromDate(reportDateForInvoice(invoice)) === monthKey)
            .reduce((sum, invoice) => sum + invoice.vat_amount, 0),
        )
        const vatIn = roundMoney(
          expenses
            .filter((expense) => monthKeyFromDate(expense.date) === monthKey)
            .reduce((sum, expense) => sum + expense.vat_amount, 0),
        )
        const taxableIncome = roundMoney(income - expenseTotal)
        const taxEstimate = calculateMonthlySelfEmployedTaxes(taxableIncome)

        return {
          expenses: expenseTotal,
          iin: taxEstimate.iin,
          income,
          label: formatMonthName(monthKey),
          monthKey,
          taxes: taxEstimate.totalTaxes,
          taxableIncome,
          vatIn,
          vatOut,
          vsaoi: taxEstimate.vsaoi,
        }
      }),
    [expenses, paidInvoices, yearNumber],
  )

  const yearSummary = useMemo(() => {
    const income = roundMoney(yearMonths.reduce((sum, month) => sum + month.income, 0))
    const expenseTotal = roundMoney(yearMonths.reduce((sum, month) => sum + month.expenses, 0))
    const taxableIncome = roundMoney(yearMonths.reduce((sum, month) => sum + month.taxableIncome, 0))
    const vsaoi = roundMoney(yearMonths.reduce((sum, month) => sum + month.vsaoi, 0))
    const iin = roundMoney(yearMonths.reduce((sum, month) => sum + month.iin, 0))

    return {
      expenses: expenseTotal,
      iin,
      income,
      taxableIncome,
      totalTaxes: roundMoney(vsaoi + iin),
      vsaoi,
    }
  }, [yearMonths])

  const quarterInvoices = useMemo(
    () =>
      paidInvoices.filter((invoice) =>
        quarterMonthKeys.includes(monthKeyFromDate(reportDateForInvoice(invoice))),
      ),
    [paidInvoices, quarterMonthKeys],
  )

  const quarterExpenses = useMemo(
    () => expenses.filter((expense) => quarterMonthKeys.includes(monthKeyFromDate(expense.date))),
    [expenses, quarterMonthKeys],
  )

  async function loadReportsData() {
    if (!supabase || !user) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setFeedback(null)

    const [invoiceResult, expenseResult, profileResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, due_date, status, total, vat_amount, paid_at, clients(name)')
        .eq('user_id', user.id)
        .order('issue_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('id, date, amount, vat_amount, category, vendor, description')
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase
        .from('profiles')
        .select('full_name, is_vat_payer, tax_regime')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    if (invoiceResult.error) {
      setFeedback(getFriendlySupabaseError(invoiceResult.error.message))
    }

    if (expenseResult.error) {
      setFeedback(getFriendlySupabaseError(expenseResult.error.message))
    }

    if (profileResult.error) {
      setFeedback(getFriendlySupabaseError(profileResult.error.message))
    }

    setInvoices(
      (invoiceResult.data ?? []).map((row: any) => ({
        client_name: row.clients?.name ?? null,
        due_date: row.due_date,
        id: row.id,
        invoice_number: row.invoice_number,
        issue_date: row.issue_date,
        paid_at: row.paid_at,
        status: row.status,
        total: Number(row.total ?? 0),
        vat_amount: Number(row.vat_amount ?? 0),
      })),
    )

    setExpenses(
      (expenseResult.data ?? []).map((row: any) => ({
        amount: Number(row.amount ?? 0),
        category: row.category,
        date: row.date,
        description: row.description ?? null,
        id: row.id,
        vat_amount: Number(row.vat_amount ?? 0),
        vendor: row.vendor ?? null,
      })),
    )

    if (profileResult.data) {
      setProfile({
        full_name: profileResult.data.full_name ?? null,
        is_vat_payer: profileResult.data.is_vat_payer ?? false,
        tax_regime: profileResult.data.tax_regime ?? 'visparejais',
      })
    }

    setIsLoading(false)
  }

  function exportQuarterCsv() {
    const rows = [
      ['Ceturksnis', `Q${quarterNumber}`, selectedYear],
      ['Mēnesis', 'Ieņēmumi', 'Izdevumi', 'Apliekamais ienākums', 'VSAOI', 'IIN', 'Nodokļi kopā'],
      ...quarterMonths.map((month) => [
        month.label,
        month.income,
        month.expenses,
        month.taxableIncome,
        month.vsaoi,
        month.iin,
        month.taxes,
      ]),
      [],
      ['Kopā', quarterSummary.income, quarterSummary.expenses, quarterSummary.taxableIncome, quarterSummary.vsaoi, quarterSummary.iin, quarterSummary.totalTaxes],
      [],
      ['Apmaksātie rēķini'],
      ['Datums', 'Numurs', 'Klients', 'Summa', 'PVN'],
      ...quarterInvoices.map((invoice) => [
        formatDate(reportDateForInvoice(invoice)),
        invoice.invoice_number,
        invoice.client_name ?? 'Bez klienta',
        invoice.total,
        invoice.vat_amount,
      ]),
      [],
      ['Izdevumi'],
      ['Datums', 'Piegādātājs', 'Kategorija', 'Summa', 'PVN', 'Apraksts'],
      ...quarterExpenses.map((expense) => [
        formatDate(expense.date),
        expense.vendor ?? 'Bez piegādātāja',
        expense.category,
        expense.amount,
        expense.vat_amount,
        expense.description ?? '',
      ]),
    ]

    downloadCsv(`atskaite-Q${quarterNumber}-${selectedYear}.csv`, rows)
  }

  function exportYearCsv() {
    const rows = [
      ['Gads', selectedYear],
      ['Mēnesis', 'Ieņēmumi', 'Izdevumi', 'Apliekamais ienākums', 'VSAOI', 'IIN', 'Nodokļi kopā'],
      ...yearMonths.map((month) => [
        month.label,
        month.income,
        month.expenses,
        month.taxableIncome,
        month.vsaoi,
        month.iin,
        month.taxes,
      ]),
      [],
      ['Kopā', yearSummary.income, yearSummary.expenses, yearSummary.taxableIncome, yearSummary.vsaoi, yearSummary.iin, yearSummary.totalTaxes],
    ]

    downloadCsv(`atskaite-gads-${selectedYear}.csv`, rows)
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="pipboy-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="text-3xl font-semibold text-[#efffeb]">Atskaites</h3>
              <p className="text-base text-[rgba(184,255,184,0.8)]">
                {profile.full_name ? `${profile.full_name} · ` : ''}
                Režīms: <span className="text-[#efffeb]">{profile.tax_regime === 'visparejais' ? 'vispārējais' : 'MUN'}</span>
              </p>
            </div>
            <p className="mt-3 max-w-4xl text-base leading-8 text-[rgba(184,255,184,0.8)]">
              Šeit redzi ceturkšņa un gada kopsavilkumus, apmaksātos ieņēmumus, izdevumus un
              provizoriskos 2026. gada nodokļu aprēķinus. Atskaites balstās uz apmaksātiem
              rēķiniem un reģistrētajiem izdevumiem.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <Field title="Gads">
              <input
                type="number"
                min="2024"
                max="2035"
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
                className="w-[130px] rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(7,17,7,0.84)] px-4 py-3 text-[#efffeb] outline-none focus:border-[rgba(57,255,20,0.42)]"
              />
            </Field>
            <Field title="Ceturksnis">
              <select
                value={selectedQuarter}
                onChange={(event) => setSelectedQuarter(event.target.value)}
                className="w-[150px] rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(7,17,7,0.84)] px-4 py-3 text-[#efffeb] outline-none focus:border-[rgba(57,255,20,0.42)]"
              >
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </Field>
            <button type="button" onClick={exportQuarterCsv} className="pipboy-button px-4 py-3 font-medium">
              <Download className="h-4 w-4" />
              Eksportēt ceturksni
            </button>
            <button type="button" onClick={exportYearCsv} className="pipboy-button pipboy-button-primary px-4 py-3 font-medium">
              <FileSpreadsheet className="h-4 w-4" />
              Eksportēt gadu
            </button>
          </div>
        </div>

        {profile.tax_regime !== 'visparejais' ? (
          <div className="mt-5 rounded-2xl border border-[rgba(255,215,0,0.2)] bg-[rgba(120,96,0,0.16)] px-4 py-3 text-sm leading-6 text-[#fff2a8]">
            Pašlaik atskaišu nodokļu daļa ir optimizēta vispārējam režīmam. Ja izvēlēsies MUN,
            kopsavilkumi par ieņēmumiem un izdevumiem strādās, bet nodokļu aprēķinu loģika būs
            jāpieskaņo atsevišķi.
          </div>
        ) : null}

        {feedback ? (
          <div className="mt-5 rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(6,16,8,0.76)] px-4 py-3 text-sm leading-6 text-[rgba(214,255,220,0.9)]">
            {feedback}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportStat title={`Q${quarterNumber} ieņēmumi`} value={formatCurrency(quarterSummary.income)} icon={Landmark} />
        <ReportStat title={`Q${quarterNumber} izdevumi`} value={formatCurrency(quarterSummary.expenses)} icon={ReceiptText} />
        <ReportStat title="Apliekamais ienākums" value={formatCurrency(quarterSummary.taxableIncome)} icon={FileSpreadsheet} />
        <ReportStat title="Prognozētie nodokļi" value={formatCurrency(quarterSummary.totalTaxes)} icon={Calculator} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="pipboy-panel rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-2xl font-semibold text-[#efffeb]">Ceturkšņa sadalījums</h4>
              <p className="mt-2 text-base leading-8 text-[rgba(184,255,184,0.8)]">
                Q{quarterNumber} {selectedYear}. Aprēķins sadalīts pa mēnešiem, lai skaidri redzi
                ieņēmumus, izdevumus un nodokļu slodzi.
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-[rgba(0,255,70,0.12)]">
            <div className="grid grid-cols-[140px_repeat(6,minmax(0,1fr))] gap-3 bg-[rgba(255,255,255,0.04)] px-5 py-4 text-sm font-medium text-[rgba(184,255,184,0.74)]">
              <span>Mēnesis</span>
              <span>Ieņēmumi</span>
              <span>Izdevumi</span>
              <span>Apliekamais</span>
              <span>VSAOI</span>
              <span>IIN</span>
              <span>Nodokļi</span>
            </div>
            <div className="divide-y divide-[rgba(0,255,70,0.1)]">
              {quarterMonths.map((month) => (
                <div
                  key={month.monthKey}
                  className="grid grid-cols-[140px_repeat(6,minmax(0,1fr))] gap-3 px-5 py-4 text-sm text-[rgba(214,255,220,0.88)]"
                >
                  <span className="font-medium text-[#efffeb]">{month.label}</span>
                  <span>{formatCurrency(month.income)}</span>
                  <span>{formatCurrency(month.expenses)}</span>
                  <span>{formatCurrency(month.taxableIncome)}</span>
                  <span>{formatCurrency(month.vsaoi)}</span>
                  <span>{formatCurrency(month.iin)}</span>
                  <span>{formatCurrency(month.taxes)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pipboy-panel rounded-[28px] p-6">
          <h4 className="text-2xl font-semibold text-[#efffeb]">Ceturkšņa kopsavilkums</h4>
          <div className="mt-5 space-y-4">
            <QuickMetric title="Ieņēmumi no apmaksātiem rēķiniem" value={formatCurrency(quarterSummary.income)} />
            <QuickMetric title="Kopējie izdevumi" value={formatCurrency(quarterSummary.expenses)} />
            <QuickMetric title="Apliekamais ienākums" value={formatCurrency(quarterSummary.taxableIncome)} />
            <QuickMetric title="VSAOI prognoze" value={formatCurrency(quarterSummary.vsaoi)} />
            <QuickMetric title="IIN prognoze" value={formatCurrency(quarterSummary.iin)} />
            <QuickMetric title="Nodokļi kopā" value={formatCurrency(quarterSummary.totalTaxes)} />
            <QuickMetric
              title={profile.is_vat_payer ? 'PVN starpība' : 'PVN kopsavilkums'}
              value={
                profile.is_vat_payer
                  ? `${formatCurrency(quarterSummary.vatOut)} - ${formatCurrency(quarterSummary.vatIn)} = ${formatCurrency(quarterSummary.vatDiff)}`
                  : 'Profils nav atzīmēts kā PVN maksātājs'
              }
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="pipboy-panel rounded-[28px] p-6">
          <h4 className="text-2xl font-semibold text-[#efffeb]">Gada kopsavilkums</h4>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <QuickMetric title={`Ieņēmumi ${selectedYear}`} value={formatCurrency(yearSummary.income)} />
            <QuickMetric title={`Izdevumi ${selectedYear}`} value={formatCurrency(yearSummary.expenses)} />
            <QuickMetric title="Apliekamais ienākums gadā" value={formatCurrency(yearSummary.taxableIncome)} />
            <QuickMetric title="Nodokļi gadā" value={formatCurrency(yearSummary.totalTaxes)} />
          </div>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-[rgba(0,255,70,0.12)]">
            <div className="grid grid-cols-[140px_repeat(4,minmax(0,1fr))] gap-3 bg-[rgba(255,255,255,0.04)] px-5 py-4 text-sm font-medium text-[rgba(184,255,184,0.74)]">
              <span>Mēnesis</span>
              <span>Ieņēmumi</span>
              <span>Izdevumi</span>
              <span>Apliekamais</span>
              <span>Nodokļi</span>
            </div>
            <div className="divide-y divide-[rgba(0,255,70,0.1)]">
              {yearMonths.map((month) => (
                <div
                  key={month.monthKey}
                  className="grid grid-cols-[140px_repeat(4,minmax(0,1fr))] gap-3 px-5 py-4 text-sm text-[rgba(214,255,220,0.88)]"
                >
                  <span className="font-medium text-[#efffeb]">{month.label}</span>
                  <span>{formatCurrency(month.income)}</span>
                  <span>{formatCurrency(month.expenses)}</span>
                  <span>{formatCurrency(month.taxableIncome)}</span>
                  <span>{formatCurrency(month.taxes)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pipboy-panel rounded-[28px] p-6">
          <h4 className="text-2xl font-semibold text-[#efffeb]">Paskaidrojums</h4>
          <div className="mt-5 space-y-4 text-sm leading-7 text-[rgba(184,255,184,0.78)]">
            <p>
              Ieņēmumu puse šeit balstās uz apmaksātiem rēķiniem. Ja rēķins ir izrakstīts, bet vēl
              nav atzīmēts kā apmaksāts, tas kopsavilkumā neiekrīt.
            </p>
            <p>
              Nodokļu aprēķins 2026. gadam izmanto noteikumu, ka zem 780 € mēnesī tiek piemēroti
              10% pensiju apdrošināšanai, bet virs šī sliekšņa tiek rēķināta pilnā VSAOI daļa un
              pēc tam IIN.
            </p>
            <p>
              Šī sadaļa ir domāta ātrai paškontrolei. Ja vajadzēs, nākamajā solī varam uzbūvēt vēl
              detalizētāku VID stilam tuvāku atskaišu skatu.
            </p>
          </div>
        </div>
      </section>

      {isLoading ? (
        <section className="pipboy-panel rounded-[28px] p-6 text-[rgba(184,255,184,0.78)]">
          Ielādējam atskaišu datus...
        </section>
      ) : null}
    </div>
  )
}

function ReportStat(props: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: string
}) {
  const Icon = props.icon

  return (
    <article className="pipboy-panel rounded-[24px] p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm uppercase tracking-[0.22em] text-[rgba(184,255,184,0.62)]">{props.title}</p>
        <div className="rounded-full border border-[rgba(0,255,70,0.18)] bg-[rgba(0,255,65,0.08)] p-3 text-[#7cff7c]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-5 text-4xl font-semibold text-[#efffeb]">{props.value}</p>
    </article>
  )
}

function QuickMetric(props: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[rgba(0,255,70,0.12)] bg-[rgba(6,16,8,0.76)] p-4">
      <p className="text-sm uppercase tracking-[0.18em] text-[rgba(184,255,184,0.58)]">{props.title}</p>
      <p className="mt-3 text-2xl font-semibold text-[#efffeb]">{props.value}</p>
    </div>
  )
}

function Field(props: { title: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-[rgba(184,255,184,0.78)]">{props.title}</span>
      {props.children}
    </label>
  )
}
