import { Euro, FileSpreadsheet, Hourglass, Wallet } from 'lucide-react'

import { formatCurrency } from '@/lib/format'

const summaryCards = [
  {
    label: 'Ieņēmumi šomēnes',
    value: formatCurrency(0),
    icon: Euro,
  },
  {
    label: 'Izdevumi šomēnes',
    value: formatCurrency(0),
    icon: Wallet,
  },
  {
    label: 'Apliekamais ienākums',
    value: formatCurrency(0),
    icon: FileSpreadsheet,
  },
  {
    label: 'Prognozētie nodokļi',
    value: formatCurrency(0),
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
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-300">{card.label}</p>
                <div className="rounded-full bg-emerald-400/15 p-3 text-emerald-200">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-8 text-3xl font-semibold tracking-tight text-white">
                {card.value}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                Dati parādīsies pēc pieslēguma un ierakstu ievades
              </p>
            </article>
          )
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <h3 className="text-xl font-semibold text-white">Kas jau ir gatavs</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <DashboardNote text="Privāta piekļuve ar Supabase Auth" />
            <DashboardNote text="Sākotnējā datubāzes migrācija ar RLS" />
            <DashboardNote text="Supabase Storage politika čeku failiem" />
            <DashboardNote text="Vercel-ready frontend karkass" />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6">
          <h3 className="text-xl font-semibold text-white">Nākamais fokuss</h3>
          <ol className="mt-5 space-y-4">
            <DashboardStep index={1} text="Profila onboardings pēc pirmās ielogošanās" />
            <DashboardStep index={2} text="Klientu, rēķinu un izdevumu CRUD ekrāni" />
            <DashboardStep index={3} text="PDF, atgādinājumi un atskaišu loģika" />
          </ol>
        </div>
      </section>
    </div>
  )
}

function DashboardNote({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4 text-sm leading-6 text-slate-200">
      {text}
    </div>
  )
}

function DashboardStep(props: { index: number; text: string }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-200">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 font-semibold text-emerald-200">
        {props.index}
      </span>
      <span className="leading-6">{props.text}</span>
    </li>
  )
}
