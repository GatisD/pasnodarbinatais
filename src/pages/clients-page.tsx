import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'

type ClientRecord = {
  address: string | null
  bank_iban: string | null
  created_at: string
  email: string | null
  id: string
  name: string
  reg_number: string | null
}

type ClientFormState = {
  address: string
  bank_iban: string
  email: string
  name: string
  reg_number: string
}

const emptyForm: ClientFormState = {
  address: '',
  bank_iban: '',
  email: '',
  name: '',
  reg_number: '',
}

export function ClientsPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [form, setForm] = useState<ClientFormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    void loadClients()
  }, [user?.id])

  async function loadClients() {
    if (!supabase || !user) {
      setIsLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('clients')
      .select('id, name, reg_number, address, email, bank_iban, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setIsLoading(false)
      return
    }

    setClients(data ?? [])
    setIsLoading(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase || !user) {
      return
    }

    setIsSaving(true)
    setFeedback(null)

    const payload = {
      address: form.address || null,
      bank_iban: form.bank_iban || null,
      email: form.email || null,
      name: form.name,
      reg_number: form.reg_number || null,
      user_id: user.id,
    }

    const request = editingId
      ? supabase.from('clients').update(payload).eq('id', editingId).eq('user_id', user.id)
      : supabase.from('clients').insert(payload)

    const { error } = await request

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setIsSaving(false)
      return
    }

    setFeedback(editingId ? 'Klients atjaunināts.' : 'Klients pievienots.')
    setForm(emptyForm)
    setEditingId(null)
    setIsSaving(false)
    await loadClients()
  }

  async function handleDelete(clientId: string) {
    if (!supabase || !user) {
      return
    }

    const confirmed = window.confirm('Vai tiešām dzēst šo klientu?')

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId)
      .eq('user_id', user.id)

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      return
    }

    setFeedback('Klients dzēsts.')
    await loadClients()
  }

  function handleEdit(client: ClientRecord) {
    setEditingId(client.id)
    setForm({
      address: client.address ?? '',
      bank_iban: client.bank_iban ?? '',
      email: client.email ?? '',
      name: client.name,
      reg_number: client.reg_number ?? '',
    })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[460px_1fr]">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-white">
              {editingId ? 'Rediģēt klientu' : 'Pievienot klientu'}
            </h3>
            <p className="mt-2 text-base leading-8 text-slate-300">
              Saglabā klientu rekvizītus, lai rēķina izveide vēlāk būtu ātra un
              bez atkārtotas manuālas rakstīšanas.
            </p>
          </div>
          <div className="rounded-full bg-emerald-400/15 p-3 text-emerald-200">
            <Plus className="h-5 w-5" />
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <ClientField
            label="Nosaukums"
            value={form.name}
            onChange={(value) => setForm((current) => ({ ...current, name: value }))}
            required
          />
          <ClientField
            label="Reģistrācijas numurs / personas kods"
            value={form.reg_number}
            onChange={(value) => setForm((current) => ({ ...current, reg_number: value }))}
          />
          <ClientField
            label="E-pasts"
            type="email"
            value={form.email}
            onChange={(value) => setForm((current) => ({ ...current, email: value }))}
          />
          <ClientField
            label="IBAN"
            value={form.bank_iban}
            onChange={(value) => setForm((current) => ({ ...current, bank_iban: value }))}
          />
          <ClientField
            label="Adrese"
            value={form.address}
            onChange={(value) => setForm((current) => ({ ...current, address: value }))}
          />

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex rounded-2xl bg-emerald-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            >
              {isSaving ? 'Saglabājam...' : editingId ? 'Saglabāt izmaiņas' : 'Pievienot klientu'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-medium text-slate-200 transition hover:bg-white/10"
              >
                Atcelt
              </button>
            ) : null}
          </div>
        </form>

        {feedback ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
            {feedback}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-white">Klientu saraksts</h3>
            <p className="mt-2 text-base leading-8 text-slate-300">
              Šis saraksts vēlāk kalpos kā pamats rēķinu formai un ātrai klientu atlasei.
            </p>
          </div>
          <div className="rounded-full bg-sky-400/15 p-3 text-sky-200">
            <Users className="h-5 w-5" />
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-6 text-sm text-slate-300">
            Ielādējam klientus...
          </div>
        ) : clients.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-5 py-8 text-base leading-8 text-slate-400">
            Klientu vēl nav. Pievieno pirmo klientu, lai varam nākamajā solī ķerties klāt rēķiniem.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {clients.map((client) => (
              <article
                key={client.id}
                className="rounded-3xl border border-white/10 bg-slate-900/70 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold text-white">{client.name}</h4>
                    <p className="text-sm text-slate-300">
                      {client.reg_number || 'Nav norādīts reģistrācijas numurs'}
                    </p>
                    <div className="grid gap-1 text-sm text-slate-400">
                      <span>{client.email || 'Nav e-pasta'}</span>
                      <span>{client.bank_iban || 'Nav IBAN'}</span>
                      <span>{client.address || 'Nav adreses'}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(client)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                    >
                      <Pencil className="h-4 w-4" />
                      Rediģēt
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(client.id)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-400/15"
                    >
                      <Trash2 className="h-4 w-4" />
                      Dzēst
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ClientField(props: {
  label: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
  value: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-300">{props.label}</span>
      <input
        required={props.required}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50"
      />
    </label>
  )
}
