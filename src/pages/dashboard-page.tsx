import { Euro, FileSpreadsheet, Hourglass, Wallet } from 'lucide-react'

import { formatCurrency } from '@/lib/format'

const summaryCards = [
  {
    label: 'Ieņēmumi šomēnes',
    value: formatCurrency(0),
    hint: 'Apmaksātie rēķini',
    icon: Euro,
  },
  {
    label: 'Izdevumi šomēnes',
    value: formatCurrency(0),
    hint: 'Reģistrētie izdevumi',
    icon: Wallet,
  },
  {
    label: 'Apliekamais ienākums',
    value: formatCurrency(0),
    hint: 'Ieņēmumi mīnus izdevumi',
    icon: FileSpreadsheet,
  },
  {
    label: 'Prognozētie nodokļi',
    value: formatCurrency(0),
    hint: 'Provizorisks aprēķins',
    icon: Hourglass,
  },
]

export function DashboardPage() {
  return (
    <div className="grid gap-6">
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
                {card.value}
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
          <h3 className="text-2xl font-semibold text-white">Kas jau ir gatavs</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <DashboardNote text="Privāta piekļuve ar Supabase Auth" />
            <DashboardNote text="Sākotnējā datubāzes migrācija ar RLS" />
            <DashboardNote text="Supabase Storage politika čeku failiem" />
            <DashboardNote text="Dzīvs deploy uz tava subdomēna" />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6">
          <h3 className="text-2xl font-semibold text-white">Ko darām tālāk</h3>
          <ol className="mt-5 space-y-4">
            <DashboardStep index={1} text="Palaist Supabase sākotnējo migrāciju, lai strādā profils un klienti" />
            <DashboardStep index={2} text="Iebūvēt rēķinu formu ar klienta izvēli un summu aprēķinu" />
            <DashboardStep index={3} text="Pievienot izdevumu ievadi un pirmos atskaišu aprēķinus" />
          </ol>
        </div>
      </section>
    </div>
  )
}

function DashboardNote({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4 text-base leading-8 text-slate-200">
      {text}
    </div>
  )
}

function DashboardStep(props: { index: number; text: string }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-base text-slate-200">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 font-semibold text-emerald-200">
        {props.index}
      </span>
      <span className="leading-8">{props.text}</span>
    </li>
  )
}
