import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider, useAuth } from '@/features/auth/auth-provider'
import { AppShell } from '@/features/layout/app-shell'
import { AuthPage } from '@/pages/auth-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { ExpensesPage } from '@/pages/expenses-page'
import { InvoicesPage } from '@/pages/invoices-page'
import { ClientsPage } from '@/pages/clients-page'
import { ReportsPage } from '@/pages/reports-page'
import { ProfilePage } from '@/pages/profile-page'

function ProtectedRoutes() {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm">
          Ielādējam tavu darba vidi...
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate replace to="/auth" />
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </AppShell>
  )
}

function PublicRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate replace to="/" /> : <AuthPage />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PublicRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
