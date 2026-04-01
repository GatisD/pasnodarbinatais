import type { PropsWithChildren } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, CircleUserRound, FileText, LayoutDashboard, LogOut, Receipt, Users } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

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
    if (!supabase) return
    await supabase.auth.signOut()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] gap-6 px-4 py-4 md:px-6 lg:grid-cols-[300px_1fr] lg:px-8 lg:py-8">
        <aside className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="border-b border-white/10 pb-6">
            <Link to="/" className="block">
              <p className="text-xs uppercase tracking-[0.32em] text-sky-200/70">Pašnodarbinātais</p>
              <h1 className="mt-3 text-[2rem] font-semibold tracking-tight text-white">Pašnodarbinātā uzskaite</h1>
            </Link>
          </div>

          <nav className="mt-6 space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-2xl px-4 py-3 text-lg transition',
                      isActive ? 'bg-emerald-400/15 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-8 flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-900/70 px-5 py-5">
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-white">{user?.email ?? 'Nav aktīvas sesijas'}</p>
              <p className="mt-1 text-sm text-slate-400">{isSupabaseConfigured ? 'Supabase pieslēgts' : 'Gaida .env iestatījumus'}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              aria-label="Izlogoties"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  )
}
