import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { generateInvoicePdf, type InvoicePdfData } from './pdf-generator.js';
import { Resend } from 'resend';

// ── Types ────────────────────────────────────────────────────────────────────
export type InvoiceStatus = 'izrakstits' | 'apmaksats' | 'kavejas' | 'atcelts';
export type ExpenseCategory =
  | 'sakari' | 'transports' | 'degviela' | 'biroja_preces'
  | 'programmatura' | 'majaslapa' | 'reklama' | 'gramatvediba'
  | 'telpu_noma' | 'komunalie' | 'apdrosinasana' | 'profesionala_izglitiba'
  | 'aprikojums' | 'bankas_komisija' | 'citi';

// ── Singleton state ──────────────────────────────────────────────────────────
let _supabase: SupabaseClient | null = null;
let _accessToken: string | null = null;
let _userId: string | null = null;

export async function initSupabase(): Promise<{ userId: string }> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_KEY;
  const email = process.env.AGENT_USER_EMAIL;
  const password = process.env.AGENT_USER_PASSWORD;

  if (!url || !key) throw new Error('Nav SUPABASE_URL vai SUPABASE_KEY vides mainīgais');
  if (!email || !password) throw new Error('Nav AGENT_USER_EMAIL vai AGENT_USER_PASSWORD vides mainīgais');

  // Autentificēties tieši caur REST API (sb_publishable_* atslēga bloķē .auth moduli Node.js vidē)
  const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    throw new Error(`Autentifikācijas kļūda (${authRes.status}): ${errText}`);
  }

  const authData = await authRes.json() as { access_token: string; user: { id: string } };
  _accessToken = authData.access_token;
  _userId = authData.user.id;

  // Izveidot Supabase klientu ar access token (RLS darbosies pareizi)
  _supabase = createSupabaseClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${_accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return { userId: _userId };
}

function db(): SupabaseClient {
  if (!_supabase || !_userId) throw new Error('Supabase nav inicializēts. Izsauciet initSupabase() vispirms.');
  return _supabase;
}

function uid(): string {
  if (!_userId) throw new Error('Nav autentificēts lietotājs.');
  return _userId;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function requireFields(obj: Record<string, unknown>, fields: string[]) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') {
      throw new Error(`Trūkst obligātais lauks: ${f}`);
    }
  }
}

// ── Profile ──────────────────────────────────────────────────────────────────
export async function getProfile() {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', uid())
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Clients ──────────────────────────────────────────────────────────────────
export async function listClients(search?: string) {
  let query = db()
    .from('clients')
    .select('id, name, reg_number, address, email, bank_iban, created_at')
    .eq('user_id', uid())
    .order('name');

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getClient(clientId: string) {
  const { data, error } = await db()
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('user_id', uid())
    .single();
  if (error) throw new Error(`Klients nav atrasts: ${error.message}`);
  return data;
}

export async function createClient(args: {
  name: string;
  reg_number?: string;
  address?: string;
  email?: string;
  bank_iban?: string;
}) {
  requireFields(args as Record<string, unknown>, ['name']);
  const { data, error } = await db()
    .from('clients')
    .insert({ ...args, user_id: uid() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateClient(clientId: string, args: {
  name?: string;
  reg_number?: string;
  address?: string;
  email?: string;
  bank_iban?: string;
}) {
  const { data, error } = await db()
    .from('clients')
    .update(args)
    .eq('id', clientId)
    .eq('user_id', uid())
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Invoices ─────────────────────────────────────────────────────────────────
export async function listInvoices(args: {
  status?: InvoiceStatus;
  client_id?: string;
  year?: number;
  month?: number;
  limit?: number;
} = {}) {
  let query = db()
    .from('invoices')
    .select(`
      id, invoice_number, issue_date, due_date, status,
      subtotal, vat_rate, vat_amount, total, currency,
      sent_at, paid_at,
      clients ( id, name, email )
    `)
    .eq('user_id', uid())
    .order('issue_date', { ascending: false });

  if (args.status) query = query.eq('status', args.status);
  if (args.client_id) query = query.eq('client_id', args.client_id);
  if (args.year) {
    const from = `${args.year}-01-01`;
    const to = `${args.year}-12-31`;
    query = query.gte('issue_date', from).lte('issue_date', to);
  }
  if (args.year && args.month) {
    const m = String(args.month).padStart(2, '0');
    const from = `${args.year}-${m}-01`;
    const lastDay = new Date(args.year, args.month, 0).getDate();
    const to = `${args.year}-${m}-${lastDay}`;
    query = query.gte('issue_date', from).lte('issue_date', to);
  }
  if (args.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getInvoice(invoiceId: string) {
  const { data, error } = await db()
    .from('invoices')
    .select(`
      *,
      clients ( * ),
      invoice_items ( * )
    `)
    .eq('id', invoiceId)
    .eq('user_id', uid())
    .single();
  if (error) throw new Error(`Rēķins nav atrasts: ${error.message}`);
  return data;
}

export async function getInvoiceByNumber(invoiceNumber: string) {
  const { data, error } = await db()
    .from('invoices')
    .select(`*, clients ( * ), invoice_items ( * )`)
    .eq('invoice_number', invoiceNumber)
    .eq('user_id', uid())
    .single();
  if (error) throw new Error(`Rēķins ${invoiceNumber} nav atrasts.`);
  return data;
}

export async function createInvoice(args: {
  client_id: string;
  issue_date: string;
  due_date: string;
  vat_rate?: number;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    unit?: string;
    unit_price: number;
  }>;
}) {
  requireFields(args as Record<string, unknown>, ['client_id', 'issue_date', 'due_date', 'items']);

  const vatRate = args.vat_rate ?? 0;

  // Calculate totals
  const items = args.items.map(item => ({
    ...item,
    unit: item.unit ?? 'gab.',
    total: Math.round(item.quantity * item.unit_price * 100) / 100,
  }));
  const subtotal = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;

  // Insert invoice
  const { data: invoice, error: invErr } = await db()
    .from('invoices')
    .insert({
      user_id: uid(),
      client_id: args.client_id,
      issue_date: args.issue_date,
      due_date: args.due_date,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      subtotal,
      total,
      notes: args.notes ?? null,
      currency: 'EUR',
    })
    .select()
    .single();
  if (invErr) throw new Error(invErr.message);

  // Insert items
  const itemsToInsert = items.map(item => ({
    invoice_id: invoice.id,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    total: item.total,
  }));
  const { error: itemsErr } = await db().from('invoice_items').insert(itemsToInsert);
  if (itemsErr) throw new Error(itemsErr.message);

  return { ...invoice, items: itemsToInsert };
}

export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
  const updates: Record<string, unknown> = { status };
  if (status === 'apmaksats') updates.paid_at = new Date().toISOString();

  const { data, error } = await db()
    .from('invoices')
    .update(updates)
    .eq('id', invoiceId)
    .eq('user_id', uid())
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateInvoice(invoiceId: string, args: {
  due_date?: string;
  notes?: string;
  vat_rate?: number;
}) {
  const { data, error } = await db()
    .from('invoices')
    .update(args)
    .eq('id', invoiceId)
    .eq('user_id', uid())
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteInvoice(invoiceId: string) {
  const { error } = await db()
    .from('invoices')
    .delete()
    .eq('id', invoiceId)
    .eq('user_id', uid());
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function sendInvoiceEmail(invoiceId: string, customMessage?: string) {
  if (!_accessToken) throw new Error('Nav autentificēts — restart MCP serveri.');

  // Load full invoice data
  const invoice = await getInvoice(invoiceId);
  const profile = await getProfile();

  if (!invoice.clients?.email) {
    throw new Error(`Klientam ${invoice.clients?.name} nav norādīts e-pasts.`);
  }

  // Generate PDF
  const pdfData: InvoicePdfData = {
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    vat_rate: invoice.vat_rate,
    vat_amount: invoice.vat_amount,
    total: invoice.total,
    notes: invoice.notes,
    items: invoice.invoice_items ?? [],
    client: invoice.clients,
    profile,
  };

  const pdfBuffer = await generateInvoicePdf(pdfData);
  const pdfBase64 = pdfBuffer.toString('base64');

  const issuerName = profile.full_name ?? 'Pašnodarbinātais';
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'invoice@resend.dev';

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error('Nav RESEND_API_KEY vides mainīgais.');

  // Pakalpojumu saraksts e-pastam
  const itemsList = (invoice.invoice_items ?? [])
    .map((it: { description: string; quantity: number; unit: string; total: number }) =>
      `${it.description} — ${it.quantity} ${it.unit} × ${it.total.toFixed(2)} EUR`)
    .join('\n');

  const dueDate = new Date(invoice.due_date).toLocaleDateString('lv-LV', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const plainText = customMessage ?? `Labdien,\n\nLūdzu apmaksāt pievienoto rēķinu ${invoice.invoice_number}.\n\nPakalpojumi:\n${itemsList}\n\nKopā apmaksai: ${invoice.total.toFixed(2)} EUR\nApmaksas termiņš: ${dueDate}\n\nNorēķinu rekvizīti:\nSaņēmējs: ${issuerName}\nIBAN: ${profile.bank_iban ?? '—'}\nBanka: ${profile.bank_name ?? '—'}\n\nAr cieņu,\n${issuerName}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="lv">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:#1e3a5f;padding:28px 40px;">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">Rēķins ${invoice.invoice_number}</p>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">Apmaksas termiņš: ${dueDate}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;">Labdien,</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;">
            ${customMessage ? customMessage.replace(/\n/g, '<br>') : `Lūdzu apmaksāt pievienoto rēķinu <strong>${invoice.invoice_number}</strong> līdz <strong>${dueDate}</strong>.`}
          </p>
          <!-- Items table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
            <tr style="background:#f9fafb;">
              <td style="padding:10px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Pakalpojums</td>
              <td style="padding:10px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:right;">Daudzums</td>
              <td style="padding:10px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:right;">Summa</td>
            </tr>
            ${(invoice.invoice_items ?? []).map((it: { description: string; quantity: number; unit: string; total: number }) => `
            <tr>
              <td style="padding:10px 12px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${it.description}</td>
              <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb;text-align:right;">${it.quantity} ${it.unit}</td>
              <td style="padding:10px 12px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;text-align:right;">${it.total.toFixed(2)} EUR</td>
            </tr>`).join('')}
            <tr style="background:#f0fdf4;">
              <td colspan="2" style="padding:12px;font-size:14px;font-weight:bold;color:#111827;">Kopā apmaksai</td>
              <td style="padding:12px;font-size:16px;font-weight:bold;color:#166534;text-align:right;">${invoice.total.toFixed(2)} EUR</td>
            </tr>
          </table>
          <!-- Bank details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:24px;">
            <tr><td colspan="2" style="padding-bottom:10px;font-size:11px;font-weight:bold;color:#6b7280;letter-spacing:0.05em;">NORĒĶINU REKVIZĪTI</td></tr>
            <tr>
              <td style="padding:3px 0;font-size:13px;color:#2563eb;width:160px;">Saņēmējs</td>
              <td style="padding:3px 0;font-size:13px;color:#111827;">${issuerName}</td>
            </tr>
            ${profile.bank_iban ? `<tr>
              <td style="padding:3px 0;font-size:13px;color:#2563eb;">IBAN</td>
              <td style="padding:3px 0;font-size:13px;color:#111827;">${profile.bank_iban}</td>
            </tr>` : ''}
            ${profile.bank_name ? `<tr>
              <td style="padding:3px 0;font-size:13px;color:#2563eb;">Banka</td>
              <td style="padding:3px 0;font-size:13px;color:#111827;">${profile.bank_name}</td>
            </tr>` : ''}
          </table>
          <p style="margin:0;color:#6b7280;font-size:13px;">Ar cieņu,<br><strong style="color:#111827;">${issuerName}</strong></p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">Rēķins sagatavots lietotnē Pašnodarbinātā uzskaite · PDF pielikumā</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resend = new Resend(resendKey);
  const { error: mailError } = await resend.emails.send({
    from: `${issuerName} <${fromEmail}>`,
    to: invoice.clients.email,
    reply_to: profile.email ?? undefined,
    subject: `Rēķins ${invoice.invoice_number} — apmaksas termiņš ${dueDate}`,
    text: plainText,
    html: htmlBody,
    attachments: [{
      filename: `${invoice.invoice_number}.pdf`,
      content: pdfBuffer,
    }],
  });

  if (mailError) throw new Error(`Resend kļūda: ${mailError.message}`);

  // Mark as sent
  await db()
    .from('invoices')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('user_id', uid());

  return { success: true, sent_to: invoice.clients.email, invoice_number: invoice.invoice_number };
}

// ── Expenses ──────────────────────────────────────────────────────────────────
export async function listExpenses(args: {
  category?: ExpenseCategory;
  year?: number;
  month?: number;
  limit?: number;
} = {}) {
  let query = db()
    .from('expenses')
    .select('id, date, amount, vat_amount, category, vendor, description, created_at')
    .eq('user_id', uid())
    .order('date', { ascending: false });

  if (args.category) query = query.eq('category', args.category);
  if (args.year && args.month) {
    const m = String(args.month).padStart(2, '0');
    const from = `${args.year}-${m}-01`;
    const lastDay = new Date(args.year, args.month, 0).getDate();
    const to = `${args.year}-${m}-${lastDay}`;
    query = query.gte('date', from).lte('date', to);
  } else if (args.year) {
    query = query.gte('date', `${args.year}-01-01`).lte('date', `${args.year}-12-31`);
  }
  if (args.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addExpense(args: {
  date: string;
  amount: number;
  category: ExpenseCategory;
  vendor?: string;
  description?: string;
  vat_amount?: number;
  receipt_url?: string;
  receipt_path?: string;
}) {
  requireFields(args as Record<string, unknown>, ['date', 'amount', 'category']);
  const { data, error } = await db()
    .from('expenses')
    .insert({ ...args, user_id: uid(), vat_amount: args.vat_amount ?? 0 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateExpense(expenseId: string, args: {
  date?: string;
  amount?: number;
  category?: ExpenseCategory;
  vendor?: string;
  description?: string;
  vat_amount?: number;
}) {
  const { data, error } = await db()
    .from('expenses')
    .update(args)
    .eq('id', expenseId)
    .eq('user_id', uid())
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteExpense(expenseId: string) {
  const { error } = await db()
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .eq('user_id', uid());
  if (error) throw new Error(error.message);
  return { success: true };
}

// ── Financial summary ────────────────────────────────────────────────────────
const MIN_WAGE = 780;
const NON_TAXABLE = 550;
const VSAOI_FULL = 0.3107;
const VSAOI_PENSION = 0.1;
const IIN_RATE = 0.255;

function roundMoney(v: number) {
  return Math.round(v * 100) / 100;
}

function calcTaxes(profit: number) {
  const p = roundMoney(Math.max(0, profit));
  if (p <= 0) return { profit: 0, vsaoi: 0, iin: 0, totalTaxes: 0 };
  const vsaoi = p < MIN_WAGE
    ? roundMoney(p * VSAOI_PENSION)
    : roundMoney(MIN_WAGE * VSAOI_FULL + Math.max(0, p - MIN_WAGE) * VSAOI_PENSION);
  const iinBase = Math.max(0, p - NON_TAXABLE - vsaoi);
  const iin = roundMoney(iinBase * IIN_RATE);
  return { profit: p, vsaoi, iin, totalTaxes: roundMoney(vsaoi + iin) };
}

export async function getFinancialSummary(args: { year: number; month?: number }) {
  let dateFrom: string, dateTo: string;
  if (args.month) {
    const m = String(args.month).padStart(2, '0');
    dateFrom = `${args.year}-${m}-01`;
    const lastDay = new Date(args.year, args.month, 0).getDate();
    dateTo = `${args.year}-${m}-${lastDay}`;
  } else {
    dateFrom = `${args.year}-01-01`;
    dateTo = `${args.year}-12-31`;
  }

  const [invoicesRes, expensesRes] = await Promise.all([
    db()
      .from('invoices')
      .select('total, status')
      .eq('user_id', uid())
      .in('status', ['izrakstits', 'apmaksats'])
      .gte('issue_date', dateFrom)
      .lte('issue_date', dateTo),
    db()
      .from('expenses')
      .select('amount, vat_amount, category')
      .eq('user_id', uid())
      .gte('date', dateFrom)
      .lte('date', dateTo),
  ]);

  if (invoicesRes.error) throw new Error(invoicesRes.error.message);
  if (expensesRes.error) throw new Error(expensesRes.error.message);

  const income = roundMoney((invoicesRes.data ?? []).reduce((s, i) => s + Number(i.total), 0));
  const paidIncome = roundMoney(
    (invoicesRes.data ?? []).filter(i => i.status === 'apmaksats').reduce((s, i) => s + Number(i.total), 0)
  );
  const totalExpenses = roundMoney((expensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0));
  const profit = roundMoney(income - totalExpenses);
  const taxes = calcTaxes(args.month ? profit : profit / 12); // monthly estimate for annual

  const expByCategory: Record<string, number> = {};
  for (const e of expensesRes.data ?? []) {
    expByCategory[e.category] = roundMoney((expByCategory[e.category] ?? 0) + Number(e.amount));
  }

  return {
    period: args.month ? `${args.year}-${String(args.month).padStart(2, '0')}` : String(args.year),
    income,
    paid_income: paidIncome,
    total_expenses: totalExpenses,
    profit,
    estimated_taxes: taxes,
    expenses_by_category: expByCategory,
    invoice_count: invoicesRes.data?.length ?? 0,
    expense_count: expensesRes.data?.length ?? 0,
  };
}
