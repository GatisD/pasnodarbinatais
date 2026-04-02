import { useState } from 'react'
import { LogIn, Shield, UserPlus } from 'lucide-react'

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
        ? 'Piekļuve atvērta. Ielādējam tavu darba vidi.'
        : 'Konts izveidots. Ja vajag, apstiprini e-pastu un turpini ar profila aizpildi.',
    )
    setIsSubmitting(false)
  }

  return (
    <div className="pipboy-grid min-h-screen bg-[#061008] px-4 py-10 text-[#d6ffdc] md:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="pipboy-shell pipboy-panel rounded-[32px] p-8 lg:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(132,255,157,0.22)] bg-[rgba(132,255,157,0.08)] px-4 py-1 text-sm font-medium text-[#8cff9d]">
            <Shield className="h-4 w-4" />
            Pip-Boy piekļuves režīms
          </div>
          <h1 className="pipboy-title mt-6 max-w-2xl text-4xl font-semibold tracking-[0.02em] md:text-5xl">
            Ieeja privātajā uzskaites terminālī.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[rgba(214,255,220,0.76)]">
            Šī sistēma ir paredzēta tikai privātai lietošanai. Ieņēmumi, izdevumi,
            rēķini un nodokļu aprēķini glabājas aiz piekļuves kontroles un Supabase autentifikācijas.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <FeatureCard title="Darba terminālis" description="Viens ekrāns klientiem, rēķiniem, izdevumiem un ikdienas naudai." />
            <FeatureCard title="Rēķinu PDF" description="Melnraksts, preview un lejupielāde tieši no sistēmas." />
            <FeatureCard title="Privāta piekļuve" description="Cloudflare Access priekšā un Supabase Auth iekšpusē." />
            <FeatureCard title="Latvijas loģika" description="Pielāgots pašnodarbinātā darba plūsmai un vietējam formātam." />
          </div>
        </section>

        <section className="pipboy-shell pipboy-panel rounded-[32px] p-6 lg:p-8">
          <div className="flex rounded-2xl border border-[rgba(132,255,157,0.14)] bg-[rgba(6,16,8,0.68)] p-1">
            <ModeButton active={mode === 'login'} onClick={() => setMode('login')} icon={LogIn}>
              Ielogoties
            </ModeButton>
            <ModeButton active={mode === 'register'} onClick={() => setMode('register')} icon={UserPlus}>
              Reģistrēties
            </ModeButton>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm text-[rgba(214,255,220,0.78)]">E-pasts</span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-[rgba(132,255,157,0.14)] bg-[rgba(6,16,8,0.74)] px-4 py-3 text-[#f3fff5] outline-none transition placeholder:text-[rgba(214,255,220,0.3)] focus:border-[rgba(132,255,157,0.44)]"
                placeholder="tu@epasts.lv"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-[rgba(214,255,220,0.78)]">Parole</span>
              <input
                required
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[rgba(132,255,157,0.14)] bg-[rgba(6,16,8,0.74)] px-4 py-3 text-[#f3fff5] outline-none transition placeholder:text-[rgba(214,255,220,0.3)] focus:border-[rgba(132,255,157,0.44)]"
                placeholder="Vismaz 6 simboli"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !isSupabaseConfigured}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-[rgba(132,255,157,0.22)] bg-[rgba(102,255,122,0.18)] px-4 py-3 font-medium text-[#f3fff5] transition hover:bg-[rgba(102,255,122,0.24)] disabled:cursor-not-allowed disabled:border-[rgba(132,255,157,0.08)] disabled:bg-[rgba(255,255,255,0.04)] disabled:text-[rgba(214,255,220,0.4)]"
            >
              {isSubmitting ? 'Lūdzu uzgaidi...' : mode === 'login' ? 'Atvērt termināli' : 'Izveidot kontu'}
            </button>
          </form>

          {feedback ? (
            <div className="mt-4 rounded-2xl border border-[rgba(132,255,157,0.14)] bg-[rgba(6,16,8,0.76)] px-4 py-3 text-sm leading-6 text-[#d6ffdc]">
              {feedback}
            </div>
          ) : null}

          {!isSupabaseConfigured ? (
            <div className="mt-4 rounded-2xl border border-[rgba(255,189,89,0.18)] bg-[rgba(255,189,89,0.08)] px-4 py-3 text-sm leading-6 text-[#ffe3a6]">
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
    <div className="rounded-3xl border border-[rgba(132,255,157,0.12)] bg-[rgba(6,16,8,0.5)] p-5">
      <h2 className="text-lg font-semibold text-[#f3fff5]">{props.title}</h2>
      <p className="mt-2 text-sm leading-6 text-[rgba(214,255,220,0.72)]">{props.description}</p>
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
        props.active
          ? 'border border-[rgba(132,255,157,0.14)] bg-[rgba(102,255,122,0.16)] text-[#f3fff5]'
          : 'text-[rgba(214,255,220,0.68)] hover:text-[#f3fff5]'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {props.children}
      </span>
    </button>
  )
}
