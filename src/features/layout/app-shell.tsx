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
    <div className="pipboy-grid min-h-screen bg-[#061008] text-[#d6ffdc]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1480px] gap-6 px-4 py-4 md:px-6 lg:grid-cols-[320px_1fr] lg:px-8 lg:py-8">
        <aside className="pipboy-shell pipboy-panel rounded-[28px] p-6 backdrop-blur">
          <div className="border-b border-[rgba(132,255,157,0.12)] pb-6">
            <Link to="/" className="block">
              <p className="pipboy-accent text-xs uppercase tracking-[0.4em]">Vault Ledger</p>
              <h1 className="pipboy-title mt-3 text-[2rem] font-semibold tracking-[0.02em]">Pašnodarbinātā uzskaite</h1>
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
                      'flex items-center gap-3 rounded-2xl border px-4 py-3 text-lg transition',
                      isActive
                        ? 'border-[rgba(132,255,157,0.24)] bg-[rgba(102,255,122,0.12)] text-[#f3fff5] shadow-[0_0_20px_rgba(102,255,122,0.08)]'
                        : 'border-transparent text-[rgba(214,255,220,0.74)] hover:border-[rgba(132,255,157,0.12)] hover:bg-[rgba(132,255,157,0.05)] hover:text-[#f3fff5]',
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-8 rounded-3xl border border-[rgba(132,255,157,0.14)] bg-[rgba(6,16,8,0.72)] px-5 py-5">
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-[#f3fff5]">{user?.email ?? 'Nav aktīvas sesijas'}</p>
              <p className="mt-1 text-sm text-[rgba(214,255,220,0.62)]">
                {isSupabaseConfigured ? 'Supabase pieslēgts' : 'Gaida .env iestatījumus'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(132,255,157,0.14)] bg-[rgba(132,255,157,0.06)] text-[#d6ffdc] transition hover:bg-[rgba(132,255,157,0.12)]"
              aria-label="Izlogoties"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
