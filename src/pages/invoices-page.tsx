import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileText, Plus, Trash2 } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-provider'
import { formatCurrency, formatDate } from '@/lib/format'
import { roundMoney } from '@/lib/numbers'
import { getFriendlySupabaseError } from '@/lib/supabase-errors'
import { supabase } from '@/lib/supabase'

type ClientOption = {
  id: string
  name: string
}

type InvoiceStatus = 'izrakstits' | 'apmaksats' | 'kavejas' | 'atcelts'

type InvoiceRecord = {
  client_name: string | null
  due_date: string
  id: string
  invoice_number: string | null
  issue_date: string
  status: InvoiceStatus
  total: number
}

type InvoiceItemForm = {
  description: string
  quantity: string
  unit: string
  unit_price: string
}

const emptyItem = (): InvoiceItemForm => ({
  description: '',
  quantity: '1',
  unit: 'gab.',
  unit_price: '0',
})

export function InvoicesPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<ClientOption[]>([])
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [clientId, setClientId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [vatRate, setVatRate] = useState('0')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<InvoiceItemForm[]>([emptyItem()])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    void Promise.all([loadClients(), loadInvoices()])
  }, [user?.id])

  const calculations = useMemo(() => {
    const preparedItems = items.map((item) => {
      const quantity = roundMoney(Number(item.quantity.replace(',', '.')) || 0)
      const unitPrice = roundMoney(Number(item.unit_price.replace(',', '.')) || 0)
      const total = roundMoney(quantity * unitPrice)

      return {
        ...item,
        quantity,
        total,
        unitPrice,
      }
    })

    const subtotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.total, 0))
    const vatRateValue = Number(vatRate.replace(',', '.')) || 0
    const vatAmount = roundMoney(subtotal * (vatRateValue / 100))
    const total = roundMoney(subtotal + vatAmount)

    return {
      preparedItems,
      subtotal,
      total,
      vatAmount,
      vatRateValue,
    }
  }, [items, vatRate])

  async function loadClients() {
    if (!supabase || !user) {
      return
    }

    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name')

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      return
    }

    setClients(data ?? [])
  }

  async function loadInvoices() {
    if (!supabase || !user) {
      setIsLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, issue_date, due_date, status, total, clients(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      setFeedback(getFriendlySupabaseError(error.message))
      setIsLoading(false)
      return
    }

    const mapped = (data ?? []).map((row: any) => ({
      client_name: row.clients?.name ?? null,
      due_date: row.due_date,
      id: row.id,
      invoice_number: row.invoice_number,
      issue_date: row.issue_date,
      status: row.status,
      total: Number(row.total ?? 0),
    }))

    setInvoices(mapped)
    setIsLoading(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase || !user) {
      return
    }

    if (!clientId) {
      setFeedback('Vispirms izvēlies klientu.')
      return
    }

    const validItems = calculations.preparedItems.filter((item) => item.description.trim().length > 0)

    if (validItems.length === 0) {
      setFeedback('Pievieno vismaz vienu rēķina rindu.')
      return
    }

    setIsSaving(true)
    setFeedback(null)

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        client_id: clientId,
        due_date: dueDate,
        issue_date: issueDate,
        notes: notes || null,
        status: 'izrakstits',
        subtotal: calculations.subtotal,
        total: calculations.total,
        user_id: user.id,
        vat_amount: calculations.vatAmount,
        vat_rate: calculations.vatRateValue / 100,
      })
      .select('id')
      .single()

    if (invoiceError || !invoice) {
      setFeedback(getFriendlySupabaseError(invoiceError?.message ?? 'Neizdevās saglabāt rēķinu.'))
      setIsSaving(false)
      return
    }

    const { error: itemsError } = await supabase.from('invoice_items').insert(
      validItems.map((item) => ({
        description: item.description,
        invoice_id: invoice.id,
        quantity: item.quantity,
        total: item.total,
        unit: item.unit,
        unit_price: item.unitPrice,
      })),
    )

    if (itemsError) {
      setFeedback(getFriendlySupabaseError(itemsError.message))
      setIsSaving(false)
      return
    }

    setClientId('')
    setIssueDate(new Date().toISOString().slice(0, 10))
    setDueDate(new Date().toISOString().slice(0, 10))
    setVatRate('0')
    setNotes('')
    setItems([emptyItem()])
    setFeedback('Rēķins saglabāts.')
    setIsSaving(false)
    await loadInvoices()
  }

  function updateItem(index: number, field: keyof InvoiceItemForm, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  function addItem() {
    setItems((current) => [...current, emptyItem()])
  }

  function removeItem(index: number) {
    setItems((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-white">Jauns rēķins</h3>
            <p className="mt-2 text-base leading-8 text-slate-300">
              Izveido rēķinu, izvēlies klientu un aizpildi rindas. Summas aprēķins notiek automātiski.
            </p>
          </div>
          <div className="rounded-full bg-emerald-400/15 p-3 text-emerald-200">
            <FileText className="h-5 w-5" />
          </div>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Klients</span>
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
              >
                <option value="">Izvēlies klientu</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">PVN likme (%)</span>
              <input
                value={vatRate}
                onChange={(event) => setVatRate(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                placeholder="0"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Izrakstīšanas datums</span>
              <input
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Apmaksas termiņš</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
              />
            </label>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-white">Rēķina rindas</h4>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
              >
                <Plus className="h-4 w-4" />
                Pievienot rindu
              </button>
            </div>

            {items.map((item, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/60 p-4 md:grid-cols-[1.5fr_0.5fr_0.45fr_0.65fr_auto]"
              >
                <input
                  value={item.description}
                  onChange={(event) => updateItem(index, 'description', event.target.value)}
                  className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                  placeholder="Pakalpojuma apraksts"
                />
                <input
                  value={item.quantity}
                  onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                  className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                  placeholder="1"
                />
                <input
                  value={item.unit}
                  onChange={(event) => updateItem(index, 'unit', event.target.value)}
                  className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                  placeholder="gab."
                />
                <input
                  value={item.unit_price}
                  onChange={(event) => updateItem(index, 'unit_price', event.target.value)}
                  className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                  placeholder="0,00"
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="inline-flex items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-rose-100 transition hover:bg-rose-400/15"
                  aria-label="Dzēst rindu"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Piezīmes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
              placeholder="Papildu piezīmes rēķinam"
            />
          </label>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/70 p-5 text-base md:grid-cols-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Starpsumma</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(calculations.subtotal)}</p>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">PVN</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(calculations.vatAmount)}</p>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Kopā</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">{formatCurrency(calculations.total)}</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex rounded-2xl bg-emerald-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
          >
            {isSaving ? 'Saglabājam...' : 'Saglabāt rēķinu'}
          </button>

          {feedback ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
              {feedback}
            </div>
          ) : null}
        </form>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-white">Rēķinu saraksts</h3>
            <p className="mt-2 text-base leading-8 text-slate-300">
              Te redzēsi jaunākos rēķinus, statusus un kopsummas. PDF un e-pasta plūsma nāks nākamajā solī.
            </p>
          </div>
          <div className="rounded-full bg-sky-400/15 p-3 text-sky-200">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-6 text-sm text-slate-300">
            Ielādējam rēķinus...
          </div>
        ) : invoices.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-5 py-8 text-base leading-8 text-slate-400">
            Rēķinu vēl nav. Izveido pirmo rēķinu no kreisās puses formas.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {invoices.map((invoice) => (
              <article
                key={invoice.id}
                className="rounded-3xl border border-white/10 bg-slate-900/70 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-500">
                      {invoice.invoice_number ?? 'Jauns rēķins'}
                    </p>
                    <h4 className="mt-2 text-xl font-semibold text-white">
                      {invoice.client_name ?? 'Bez klienta nosaukuma'}
                    </h4>
                    <p className="mt-2 text-sm text-slate-400">
                      Izrakstīts: {formatDate(invoice.issue_date)} | Termiņš: {formatDate(invoice.due_date)}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                      {invoice.status}
                    </span>
                    <p className="mt-3 text-2xl font-semibold text-white">
                      {formatCurrency(invoice.total)}
                    </p>
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
