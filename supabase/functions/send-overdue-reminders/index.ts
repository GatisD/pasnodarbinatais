import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Dienas, pēc kurām sūtīt atkārtotu atgādinājumu
const REMINDER_INTERVAL_DAYS = 7

Deno.serve(async (req: Request) => {
  // Atļauj tikai POST pieprasījumus
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metode nav atļauta' }), { status: 405 })
  }

  // Pārbauda autorizāciju — jābūt service_role atslēgai
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'Nav autorizācijas' }), { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const resendFrom = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev'

  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY nav konfigurēts' }), { status: 500 })
  }

  // Izmanto service_role klientu, lai apietu RLS un redzētu visus lietotājus
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  // 7 dienas atpakaļ — atgādinājums jāsūta ja pēdējais bija senāk vai nekad
  const reminderCutoff = new Date(today)
  reminderCutoff.setDate(reminderCutoff.getDate() - REMINDER_INTERVAL_DAYS)
  const reminderCutoffStr = reminderCutoff.toISOString()

  // Atlasa kavētos rēķinus (ar klientu e-pastu un profila datiem)
  const { data: invoices, error: fetchError } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, due_date, total, currency, status,
      last_reminder_sent_at, notes, vat_rate, subtotal, vat_amount,
      clients ( id, name, email ),
      profiles ( full_name, email, bank_iban, bank_name, invoice_prefix ),
      invoice_items ( description, quantity, unit, unit_price, total )
    `)
    .lt('due_date', todayStr)
    .in('status', ['izrakstits', 'nosutits', 'kavejas'])
    .not('clients.email', 'is', null)
    .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${reminderCutoffStr}`)

  if (fetchError) {
    console.error('Kļūda ielādējot rēķinus:', fetchError)
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
  }

  const results: Array<{ invoiceNumber: string; status: 'nosūtīts' | 'kļūda'; error?: string }> = []

  for (const invoice of (invoices ?? [])) {
    const client = invoice.clients as { id: string; name: string; email: string } | null
    const profile = invoice.profiles as { full_name: string | null; email: string | null; bank_iban: string | null; bank_name: string | null } | null

    if (!client?.email) continue

    const issuerName = profile?.full_name ?? 'Pašnodarbinātais'
    const dueDate = new Date(invoice.due_date).toLocaleDateString('lv-LV', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
    const overdueDays = Math.floor((today.getTime() - new Date(invoice.due_date).getTime()) / 86400000)

    const items: Array<{ description: string; quantity: number; unit: string; total: number }> =
      (invoice.invoice_items as Array<{ description: string; quantity: number; unit: string; unit_price: number; total: number }>) ?? []

    const plainText = [
      `Labdien,`,
      ``,
      `Atgādinām, ka rēķins ${invoice.invoice_number} bija jāapmaksā ${dueDate} un kavējas jau ${overdueDays} dienu(-as).`,
      ``,
      `Kavētā summa: ${invoice.total.toFixed(2)} ${invoice.currency}`,
      ``,
      `Lūdzu veikt apmaksu pēc iespējas ātrāk, izmantojot šādus rekvizītus:`,
      `Saņēmējs: ${issuerName}`,
      profile?.bank_iban ? `IBAN: ${profile.bank_iban}` : '',
      profile?.bank_name ? `Banka: ${profile.bank_name}` : '',
      `Maksājuma mērķis: ${invoice.invoice_number}`,
      ``,
      `Ar cieņu,`,
      issuerName,
    ].filter(l => l !== '').join('\n')

    const htmlBody = `
<!DOCTYPE html>
<html lang="lv">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Galvene -->
        <tr><td style="background:#7f1d1d;padding:28px 40px;">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">⚠ Kavēts rēķins ${invoice.invoice_number}</p>
          <p style="margin:6px 0 0;color:#fca5a5;font-size:13px;">Apmaksas termiņš bija: ${dueDate} · Kavējas ${overdueDays} dienu(-as)</p>
        </td></tr>
        <!-- Saturs -->
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;">Labdien,</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;">
            Atgādinām, ka rēķins <strong>${invoice.invoice_number}</strong> bija jāapmaksā <strong>${dueDate}</strong>
            un kavējas jau <strong style="color:#b91c1c;">${overdueDays} dienu(-as)</strong>.
            Lūdzu veikt apmaksu pēc iespējas ātrāk.
          </p>

          <!-- Rēķina pozīcijas -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
            <tr style="background:#f9fafb;">
              <td style="padding:10px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Pakalpojums</td>
              <td style="padding:10px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:right;">Daudzums</td>
              <td style="padding:10px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:right;">Summa</td>
            </tr>
            ${items.map(it => `
            <tr>
              <td style="padding:10px 12px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${it.description}</td>
              <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb;text-align:right;">${it.quantity} ${it.unit}</td>
              <td style="padding:10px 12px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;text-align:right;">${it.total.toFixed(2)} ${invoice.currency}</td>
            </tr>`).join('')}
            <tr style="background:#fef2f2;">
              <td colspan="2" style="padding:12px;font-size:14px;font-weight:bold;color:#111827;">Kavētā summa</td>
              <td style="padding:12px;font-size:16px;font-weight:bold;color:#b91c1c;text-align:right;">${invoice.total.toFixed(2)} ${invoice.currency}</td>
            </tr>
          </table>

          <!-- Maksājuma rekvizīti -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:24px;">
            <tr><td colspan="2" style="padding-bottom:10px;font-size:11px;font-weight:bold;color:#6b7280;letter-spacing:0.05em;">NORĒĶINU REKVIZĪTI</td></tr>
            <tr>
              <td style="padding:3px 0;font-size:13px;color:#2563eb;width:160px;">Saņēmējs</td>
              <td style="padding:3px 0;font-size:13px;color:#111827;">${issuerName}</td>
            </tr>
            ${profile?.bank_iban ? `<tr>
              <td style="padding:3px 0;font-size:13px;color:#2563eb;">IBAN</td>
              <td style="padding:3px 0;font-size:13px;color:#111827;">${profile.bank_iban}</td>
            </tr>` : ''}
            ${profile?.bank_name ? `<tr>
              <td style="padding:3px 0;font-size:13px;color:#2563eb;">Banka</td>
              <td style="padding:3px 0;font-size:13px;color:#111827;">${profile.bank_name}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:3px 0;font-size:13px;color:#2563eb;">Mērķis</td>
              <td style="padding:3px 0;font-size:13px;color:#111827;">${invoice.invoice_number}</td>
            </tr>
          </table>

          <p style="margin:0;color:#6b7280;font-size:13px;">Ja apmaksa jau veikta, lūdzu ignorēt šo ziņojumu.</p>
          <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Ar cieņu,<br><strong style="color:#111827;">${issuerName}</strong></p>
        </td></tr>
        <!-- Kājene -->
        <tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">Automātisks atgādinājums no Pašnodarbinātā uzskaites lietotnes</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${issuerName} <${resendFrom}>`,
          to: [client.email],
          reply_to: profile?.email ?? undefined,
          subject: `Atgādinājums: kavēts rēķins ${invoice.invoice_number} (${invoice.total.toFixed(2)} ${invoice.currency})`,
          text: plainText,
          html: htmlBody,
        }),
      })

      if (!emailRes.ok) {
        const errText = await emailRes.text()
        results.push({ invoiceNumber: invoice.invoice_number, status: 'kļūda', error: errText })
        console.error(`E-pasta kļūda ${invoice.invoice_number}:`, errText)
        continue
      }

      // Atjauno rēķina statusu un last_reminder_sent_at
      await supabase
        .from('invoices')
        .update({
          status: 'kavejas',
          last_reminder_sent_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)

      results.push({ invoiceNumber: invoice.invoice_number, status: 'nosūtīts' })
      console.log(`Atgādinājums nosūtīts: ${invoice.invoice_number} → ${client.email}`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ invoiceNumber: invoice.invoice_number, status: 'kļūda', error: msg })
      console.error(`Kļūda ${invoice.invoice_number}:`, msg)
    }
  }

  const sent = results.filter(r => r.status === 'nosūtīts').length
  const failed = results.filter(r => r.status === 'kļūda').length

  return new Response(
    JSON.stringify({ ok: true, processed: results.length, sent, failed, results }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
