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
    <div className="pipboy-grid min-h-screen bg-[#020502] text-[#d6ffdc]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1480px] gap-6 px-4 py-4 md:px-6 lg:grid-cols-[320px_1fr] lg:px-8 lg:py-8">
        <aside className="pipboy-shell pipboy-panel rounded-[28px] p-6 backdrop-blur">
          <div className="border-b border-[rgba(0,255,70,0.14)] pb-6">
            <Link to="/" className="block">
              <p className="pipboy-accent text-xs uppercase tracking-[0.4em]">Vault Ledger</p>
              <div className="mt-4 flex min-h-[154px] items-center justify-center rounded-[20px] border border-[rgba(0,255,70,0.18)] bg-[radial-gradient(circle_at_center,rgba(0,255,65,0.14),rgba(2,6,2,0.9)_68%)] px-3 py-4 shadow-[inset_0_0_24px_rgba(0,255,65,0.08),0_0_18px_rgba(0,255,65,0.08)]">
                <img
                  src="/media/pipboy.gif"
                  alt="Pip-Boy"
                  className="h-[136px] w-full object-contain mix-blend-screen"
                />
              </div>
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
                        ? 'border-[rgba(57,255,20,0.28)] bg-[rgba(0,255,65,0.12)] text-[#efffeb] shadow-[0_0_22px_rgba(0,255,65,0.12)]'
                        : 'border-transparent text-[rgba(184,255,184,0.78)] hover:border-[rgba(0,255,70,0.14)] hover:bg-[rgba(0,255,65,0.06)] hover:text-[#f3fff5]',
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-8 rounded-3xl border border-[rgba(0,255,70,0.14)] bg-[rgba(6,16,8,0.72)] px-5 py-5">
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-[#f3fff5]">{user?.email ?? 'Nav aktīvas sesijas'}</p>
              <p className="mt-1 text-sm text-[rgba(184,255,184,0.62)]">
                {isSupabaseConfigured ? 'Supabase pieslēgts' : 'Gaida .env iestatījumus'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="pipboy-button pipboy-button-primary mt-4 h-12 w-12 rounded-full p-0"
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
