import type { PropsWithChildren } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CircleUserRound,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  Users,
} from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const navigationItems = [
  { to: '/', label: 'Pārskats', icon: LayoutDashboard },
  { to: '/invoices', label: 'Rēķini', icon: FileText },
  { to: '/expenses', label: 'Izdevumi', icon: Receipt },
  { to: '/clients', label: 'Klienti', icon: Users },
  { to: '/reports', label: 'Atskaites', icon: BarChart3 },
  { to: '/profile', label: 'Profils', icon: CircleUserRound },
]

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const { isSupabaseConfigured, user } = useAuth()

  async function handleSignOut() {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-4 md:px-6 lg:grid-cols-[280px_1fr] lg:px-8 lg:py-8">
        <aside className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="border-b border-white/10 pb-5">
            <Link to="/" className="block">
              <p className="text-xs uppercase tracking-[0.32em] text-sky-200/70">
                Pašnodarbinātais
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                Self Employed
              </h1>
            </Link>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Privāta finanšu darba telpa ar Supabase datiem, moderniem rēķiniem
              un vienkāršu ikdienas uzskaiti.
            </p>
          </div>

          <nav className="mt-5 space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition',
                      isActive
                        ? 'bg-emerald-400/15 text-white'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
            Rēķinu izsūtīšana v1 būs manuāla. Sistēma sagatavos PDF un palīdzēs
            tev saglabāt statusus un termiņus.
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-white">
                {user?.email ?? 'Nav aktīvas sesijas'}
              </p>
              <p className="text-xs text-slate-400">
                {isSupabaseConfigured ? 'Supabase pieslēgts' : 'Gaida .env iestatījumus'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              aria-label="Izlogoties"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <div className="flex min-h-full flex-col gap-6">
          <header className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,_rgba(15,23,42,0.92),_rgba(17,24,39,0.95))] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-sky-200/70">
                  Privāts darba režīms
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                  Tava uzskaite vienuviet
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Sākam ar drošu autentifikāciju, profilu un lietotnes karkasu.
                  Tālāk pievienosim rēķinus, izdevumus un atskaišu loģiku.
                </p>
              </div>
              <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  Subdomēns: <span className="text-white">pasnodarbinats.virtualamaksla.lv</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  Hostings: <span className="text-white">Vercel + Supabase</span>
                </div>
              </div>
            </div>
          </header>

          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}
