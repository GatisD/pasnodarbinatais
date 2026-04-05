import { useEffect, useState } from 'react'
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react'

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
  const [search, setSearch] = useState('')

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
      <section className="pipboy-panel rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="pipboy-title text-2xl font-semibold">
              {editingId ? 'Rediģēt klientu' : 'Pievienot klientu'}
            </h3>
            <p className="pipboy-subtle mt-2 text-base leading-8">
              Saglabā klientu rekvizītus, lai rēķina izveide vēlāk būtu ātra un bez
              atkārtotas manuālas rakstīšanas.
            </p>
          </div>
          <div className="rounded-full border border-[rgba(0,255,70,0.18)] bg-[rgba(0,255,65,0.08)] p-3 text-[#7cff7c]">
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
              className="pipboy-button pipboy-button-primary px-5 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saglabājam...' : editingId ? 'Saglabāt izmaiņas' : 'Pievienot klientu'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="pipboy-button px-5 py-3 font-medium"
              >
                Atcelt
              </button>
            ) : null}
          </div>
        </form>

        {feedback ? <div className="pipboy-surface mt-4 px-4 py-3 text-sm leading-6 text-[rgba(214,255,220,0.9)]">{feedback}</div> : null}
      </section>

      <section className="pipboy-panel rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="pipboy-title text-2xl font-semibold">Klientu saraksts</h3>
            <p className="pipboy-subtle mt-2 text-base leading-8">
              Šis saraksts vēlāk kalpos kā pamats rēķinu formai un ātrai klientu atlasei.
            </p>
          </div>
          <div className="rounded-full border border-[rgba(0,255,70,0.18)] bg-[rgba(0,255,65,0.08)] p-3 text-[#7cff7c]">
            <Users className="h-5 w-5" />
          </div>
        </div>

        {!isLoading && clients.length > 0 ? (
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pipboy-subtle pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pipboy-input py-2 pl-10 pr-4 text-sm"
                placeholder="Meklē pēc nosaukuma vai reģ. nr."
              />
            </div>
            <span className="pipboy-subtle shrink-0 text-sm">
              {(() => {
                const n = clients.filter((c) =>
                  search.trim()
                    ? `${c.name} ${c.reg_number ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
                    : true,
                ).length
                return `${n} ${n === 1 ? 'klients' : 'klienti'}`
              })()}
            </span>
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-6 rounded-2xl border border-[rgba(0,255,70,0.14)] bg-[rgba(6,16,8,0.7)] px-4 py-6 text-sm text-[rgba(184,255,184,0.72)]">
            Ielādējam klientus...
          </div>
        ) : clients.length === 0 ? (
          <div className="pipboy-empty mt-6 px-5 py-8 text-base leading-8">
            Klientu vēl nav. Pievieno pirmo klientu, lai varam nākamajā solī ķerties klāt
            rēķiniem.
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[20px] border border-[rgba(0,255,70,0.12)]">
            <div className="grid grid-cols-[1fr_140px_1fr_72px] gap-3 bg-[rgba(9,19,9,0.9)] px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-[rgba(184,255,184,0.6)]">
              <span>Nosaukums</span>
              <span>Reģ. nr.</span>
              <span>E-pasts / IBAN</span>
              <span className="text-right">Darbības</span>
            </div>
            <div className="max-h-[420px] divide-y divide-[rgba(0,255,70,0.08)] overflow-y-auto">
              {clients
                .filter((client) =>
                  search.trim()
                    ? `${client.name} ${client.reg_number ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
                    : true,
                )
                .map((client) => (
                  <article
                    key={client.id}
                    className="grid grid-cols-[1fr_140px_1fr_72px] items-center gap-3 px-4 py-2.5"
                  >
                    <p className="pipboy-title truncate text-sm font-semibold" title={client.name}>
                      {client.name}
                    </p>
                    <p className="pipboy-subtle truncate text-xs">
                      {client.reg_number ?? '—'}
                    </p>
                    <div className="min-w-0">
                      <p className="pipboy-subtle truncate text-xs">{client.email ?? '—'}</p>
                      <p className="truncate text-xs text-[rgba(184,255,184,0.45)]">{client.bank_iban ?? '—'}</p>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(client)}
                        title="Rediģēt"
                        className="pipboy-button h-8 w-8 rounded-full p-0"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(client.id)}
                        title="Dzēst"
                        className="pipboy-button pipboy-button-danger h-8 w-8 rounded-full p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
              {clients.filter((client) =>
                search.trim()
                  ? `${client.name} ${client.reg_number ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
                  : true,
              ).length === 0 ? (
                <div className="pipboy-empty mx-4 my-3 px-4 py-5 text-sm">
                  Neviens klients neatbilst meklēšanai.
                </div>
              ) : null}
            </div>
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
      <span className="pipboy-field-label">{props.label}</span>
      <input
        required={props.required}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="pipboy-input px-4 py-3"
      />
    </label>
  )
}
