import { useEffect, useState } from 'react'

import { useAuth } from '@/features/auth/auth-provider'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'

type ProfileFormState = {
  address: string
  bank_iban: string
  bank_name: string
  email: string
  full_name: string
  nace_code: string
  person_code: string
  phone: string
}

const emptyForm: ProfileFormState = {
  address: '',
  bank_iban: '',
  bank_name: '',
  email: '',
  full_name: '',
  nace_code: '',
  person_code: '',
  phone: '',
}

export function ProfilePage() {
  const { isSupabaseConfigured, user } = useAuth()
  const [form, setForm] = useState<ProfileFormState>(emptyForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user) {
      setIsLoading(false)
      return
    }

    let isMounted = true

    void supabase
      .from('profiles')
      .select('address, bank_iban, bank_name, email, full_name, nace_code, person_code, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) {
          return
        }

        if (error) {
          setFeedback(getFriendlySupabaseError(error.message))
          setIsLoading(false)
          return
        }

        if (data) {
          setForm({
            address: data.address ?? '',
            bank_iban: data.bank_iban ?? '',
            bank_name: data.bank_name ?? '',
            email: data.email ?? user.email ?? '',
            full_name: data.full_name ?? '',
            nace_code: data.nace_code ?? '',
            person_code: data.person_code ?? '',
            phone: data.phone ?? '',
          })
        } else {
          setForm((current) => ({
            ...current,
            email: user.email ?? '',
          }))
        }

        setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isSupabaseConfigured, user])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase || !user) {
      return
    }

    setIsSaving(true)
    setFeedback(null)

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      address: form.address,
      bank_iban: form.bank_iban,
      bank_name: form.bank_name,
      email: form.email,
      full_name: form.full_name,
      nace_code: form.nace_code,
      person_code: form.person_code,
      phone: form.phone,
    })

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setIsSaving(false)
      return
    }

    setFeedback('Profils saglabāts.')
    setIsSaving(false)
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="rounded-[28px] border border-[rgba(255,215,0,0.2)] bg-[rgba(120,96,0,0.16)] p-6 text-[#fff2a8]">
        Pievieno `.env` failu ar Supabase URL un publishable key, lai profila saglabāšana darbotos.
      </section>
    )
  }

  return (
    <section className="pipboy-panel rounded-[28px] p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-[#efffeb]">Profils</h3>
          <p className="mt-2 max-w-2xl text-base leading-8 text-[rgba(184,255,184,0.8)]">
            Šie dati tiks izmantoti rēķinos, atskaitēs un vispārējā pašnodarbinātā
            uzskaites plūsmā.
          </p>
        </div>
        <div className="rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(7,17,7,0.72)] px-4 py-3 text-sm text-[rgba(184,255,184,0.8)]">
          Konts: <span className="text-[#efffeb]">{user?.email ?? '-'}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(6,16,8,0.76)] px-4 py-6 text-sm text-[rgba(184,255,184,0.72)]">
          Ielādējam profila datus...
        </div>
      ) : (
        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <ProfileField
            label="Pilns vārds"
            value={form.full_name}
            onChange={(value) => setForm((current) => ({ ...current, full_name: value }))}
          />
          <ProfileField
            label="E-pasts"
            type="email"
            value={form.email}
            onChange={(value) => setForm((current) => ({ ...current, email: value }))}
          />
          <ProfileField
            label="Personas kods"
            value={form.person_code}
            onChange={(value) => setForm((current) => ({ ...current, person_code: value }))}
          />
          <ProfileField
            label="NACE kods"
            value={form.nace_code}
            onChange={(value) => setForm((current) => ({ ...current, nace_code: value }))}
          />
          <ProfileField
            label="Telefons"
            value={form.phone}
            onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
          />
          <ProfileField
            label="Banka"
            value={form.bank_name}
            onChange={(value) => setForm((current) => ({ ...current, bank_name: value }))}
          />
          <ProfileField
            label="IBAN"
            value={form.bank_iban}
            onChange={(value) => setForm((current) => ({ ...current, bank_iban: value }))}
          />
          <ProfileField
            label="Adrese"
            value={form.address}
            onChange={(value) => setForm((current) => ({ ...current, address: value }))}
          />

          <div className="md:col-span-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="pipboy-button pipboy-button-primary px-5 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saglabājam...' : 'Saglabāt profilu'}
            </button>
          </div>
        </form>
      )}

      {feedback ? (
        <div className="mt-4 rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(6,16,8,0.76)] px-4 py-3 text-sm leading-6 text-[rgba(214,255,220,0.9)]">
          {feedback}
        </div>
      ) : null}
    </section>
  )
}

function ProfileField(props: {
  label: string
  onChange: (value: string) => void
  type?: string
  value: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-[rgba(184,255,184,0.8)]">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(7,17,7,0.84)] px-4 py-3 text-[#efffeb] outline-none transition placeholder:text-[rgba(184,255,184,0.4)] focus:border-[rgba(57,255,20,0.42)] focus:bg-[rgba(9,22,9,0.94)]"
      />
    </label>
  )
}
