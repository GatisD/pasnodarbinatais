import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { supabase } from '@/lib/supabase'

type AuthMode = 'login' | 'register'

export function AuthPage() {
  const { isSupabaseConfigured } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      setFeedback('Supabase vēl nav nokonfigurēts. Pievieno .env failu ar URL un publishable key.')
      return
    }

    setIsSubmitting(true)
    setFeedback(null)

    const action =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password })

    const { error } = await action

    if (error) {
      setFeedback(error.message)
      setIsSubmitting(false)
      return
    }

    setFeedback(
      mode === 'login'
        ? 'Ielogošanās veiksmīga.'
        : 'Konts izveidots. Ja vajag, apstiprini e-pastu un turpini ar profila aizpildi.',
    )
    setIsSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 md:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.16),_transparent_38%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(2,6,23,0.98))] p-8 lg:p-10">
          <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-sm font-medium text-emerald-200">
            Privāta grāmatvedības lietotne
          </div>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Ienāc savā darba telpā un turi rēķinus, izdevumus un atskaites kārtībā.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Šī sistēma ir veidota privātai lietošanai: dati glabājas Supabase,
            piekļuve ir tikai ar autentifikāciju, un lapa nav paredzēta publiskai
            indeksēšanai.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <FeatureCard
              title="Moderni rēķini"
              description="PDF ģenerēšana, statusi, termiņi un manuāla izsūtīšanas plūsma."
            />
            <FeatureCard
              title="Izdevumu uzskaite"
              description="Čeku glabāšana Supabase Storage un skaidras kategorijas."
            />
            <FeatureCard
              title="Latvijas loģika"
              description="Ceturkšņa un gada atskaites, pielāgotas pašnodarbinātajam."
            />
            <FeatureCard
              title="Privāts hostings"
              description="Vercel un Supabase ar noindex un pieslēgšanos tikai caur login."
            />
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur lg:p-8">
          <div className="flex rounded-2xl border border-white/10 bg-slate-900/80 p-1">
            <ModeButton active={mode === 'login'} onClick={() => setMode('login')} icon={LogIn}>
              Ielogoties
            </ModeButton>
            <ModeButton active={mode === 'register'} onClick={() => setMode('register')} icon={UserPlus}>
              Reģistrēties
            </ModeButton>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">E-pasts</span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50"
                placeholder="tu@epasts.lv"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Parole</span>
              <input
                required
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50"
                placeholder="Vismaz 6 simboli"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !isSupabaseConfigured}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            >
              {isSubmitting ? 'Lūdzu uzgaidi...' : mode === 'login' ? 'Ielogoties' : 'Izveidot kontu'}
            </button>
          </form>

          {feedback ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
              {feedback}
            </div>
          ) : null}

          {!isSupabaseConfigured ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
              Lai autentifikācija darbotos, projektam jābūt `.env` failam ar
              `VITE_SUPABASE_URL` un `VITE_SUPABASE_PUBLISHABLE_KEY`.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function FeatureCard(props: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold text-white">{props.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">{props.description}</p>
    </div>
  )
}

function ModeButton(props: {
  active: boolean
  children: string
  icon: typeof LogIn
  onClick: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition ${
        props.active ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:text-white'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {props.children}
      </span>
    </button>
  )
}
