#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { Telegraf } from 'telegraf';
import { exec } from 'child_process';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';

// Ielādē .env no projekta saknes
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

const execAsync = promisify(exec);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_USER_ID ? parseInt(process.env.TELEGRAM_USER_ID) : null;
const CLAUDE_PATH = process.env.CLAUDE_PATH ?? 'claude';
const PROJECT_DIR = path.join(__dirname, '..');

if (!BOT_TOKEN) {
  console.error('Nav TELEGRAM_BOT_TOKEN vides mainīgais');
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: process.env.VITE_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
});

const bot = new Telegraf(BOT_TOKEN);

// ── Supabase Storage augšupielāde ───────────────────────────────────────────
async function uploadToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ path: string; signedUrl: string }> {
  const url = process.env.VITE_SUPABASE_URL!;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const email = process.env.AGENT_USER_EMAIL!;
  const password = process.env.AGENT_USER_PASSWORD!;

  const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key },
    body: JSON.stringify({ email, password }),
  });
  const authData = await authRes.json() as { access_token: string; user: { id: string } };
  const { access_token, user } = authData;

  const filePath = `${user.id}/${Date.now()}-${fileName}`;
  const uploadRes = await fetch(`${url}/storage/v1/object/expense-documents/${filePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': mimeType,
      'apikey': key,
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    throw new Error(`Storage upload kļūda (${uploadRes.status}): ${txt}`);
  }

  const signRes = await fetch(`${url}/storage/v1/object/sign/expense-documents/${filePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      'apikey': key,
    },
    body: JSON.stringify({ expiresIn: 315360000 }),
  });
  const signData = await signRes.json() as { signedURL: string };
  const signedUrl = `${url}/storage/v1${signData.signedURL}`;

  return { path: filePath, signedUrl };
}

// ── Attēla atpazīšana ar Claude Vision ─────────────────────────────────────
async function analyzeReceiptImage(
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<string> {
  const base64 = imageBuffer.toString('base64');
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64 },
        },
        {
          type: 'text',
          text: 'Šis ir čeks vai rēķins. Izvelc šādus datus:\n- Datums (YYYY-MM-DD)\n- Kopsumma EUR\n- PVN summa EUR (ja redzama)\n- Piegādātāja nosaukums\n- Īss apraksts\n- Kategorija (sakari/transports/degviela/biroja_preces/programmatura/majaslapa/reklama/gramatvediba/telpu_noma/komunalie/apdrosinasana/profesionala_izglitiba/aprikojums/bankas_komisija/citi)\n\nAtbildi tikai ar strukturētiem datiem latviešu valodā.',
        },
      ],
    }],
  });
  return (response.content[0] as { type: string; text: string }).text;
}

// ── Claudeam nosūta uzdevumu un atgriež atbildi ─────────────────────────────
async function callClaude(prompt: string): Promise<string> {
  const { stdout } = await execAsync(
    `${CLAUDE_PATH} -p ${JSON.stringify(prompt)} --allowedTools "mcp__gramatvediba__*" --dangerously-skip-permissions 2>/dev/null`,
    {
      cwd: PROJECT_DIR,
      timeout: 120_000,
      env: { ...process.env, HOME: process.env.HOME },
    }
  );
  return stdout.trim();
}

// ── Atbildes nosūtīšana (sadalīt ja > 4096) ─────────────────────────────────
async function sendResponse(ctx: Parameters<typeof bot.on>[1] extends (ctx: infer C) => unknown ? C : never, waitMsgId: number, response: string) {
  if (!response) {
    await (ctx as any).telegram.editMessageText(
      (ctx as any).chat.id, waitMsgId, undefined, '❌ Nav atbildes no Claude.'
    );
    return;
  }
  if (response.length <= 4096) {
    await (ctx as any).telegram.editMessageText(
      (ctx as any).chat.id, waitMsgId, undefined, response
    );
  } else {
    await (ctx as any).telegram.deleteMessage((ctx as any).chat.id, waitMsgId);
    for (let i = 0; i < response.length; i += 4000) {
      await (ctx as any).reply(response.slice(i, i + 4000));
    }
  }
}

// ── Progresa ziņojumu atjaunotājs ───────────────────────────────────────────
const PROGRESS_STEPS: Record<string, string[]> = {
  send: [
    '⏳ Meklē rēķinu...',
    '📄 Sagatavo PDF...',
    '📧 Sūta e-pastu...',
    '⏳ Pabeidz nosūtīšanu...',
  ],
  edit: [
    '⏳ Meklē klientu...',
    '📄 Ielādē rēķinu...',
    '✏️ Labo pozīcijas...',
    '💾 Saglabā izmaiņas...',
  ],
  status: [
    '⏳ Meklē rēķinu...',
    '✅ Atjaunina statusu...',
    '⏳ Pabeidz...',
  ],
  new_invoice: [
    '⏳ Meklē klientu...',
    '📝 Izveido rēķinu...',
    '⏳ Pabeidz...',
  ],
  expense: [
    '⏳ Apstrādā datus...',
    '💾 Pievieno izdevumu...',
    '⏳ Pabeidz...',
  ],
  summary: [
    '⏳ Ielādē rēķinus...',
    '📊 Aprēķina kopsavilkumu...',
    '⏳ Pabeidz...',
  ],
  default: [
    '⏳ Apstrādā...',
    '🔍 Meklē datus...',
    '⚙️ Izpilda uzdevumu...',
    '⏳ Gandrīz gatavs...',
  ],
};

function startProgress(
  telegram: any,
  chatId: number,
  msgId: number,
  type: keyof typeof PROGRESS_STEPS = 'default'
): () => void {
  const steps = PROGRESS_STEPS[type] ?? PROGRESS_STEPS.default;
  let i = 0;
  const timer = setInterval(async () => {
    i++;
    if (i < steps.length) {
      try {
        await telegram.editMessageText(chatId, msgId, undefined, steps[i]);
      } catch { /* ziņa jau aizstāta ar atbildi */ }
    }
  }, 15_000);
  return () => clearInterval(timer);
}

function detectIntent(text: string): keyof typeof PROGRESS_STEPS {
  const t = text.toLowerCase();
  if (/nosūt|sūt|e-past|email|izsūt/.test(t)) return 'send';
  if (/labo|maini|laboj|kļūda|preciz|atjauno|rediģ|pieliek|pievieno.*rēķin/.test(t)) return 'edit';
  if (/apmaksāt|samaksāt|apmaksāj|samaksāj|atcel|anulē/.test(t)) return 'status';
  if (/izrakst|jaun.*rēķin|rēķin.*jaun|izveidoj.*rēķin/.test(t)) return 'new_invoice';
  if (/izdevum|čeks|kvīts/.test(t)) return 'expense';
  if (/pārskats|nodokļ|ienākum|peļņ|finansiāl|ceturkšņ/.test(t)) return 'summary';
  return 'default';
}

// ── Drošības pārbaude ────────────────────────────────────────────────────────
function isAllowed(userId: number): boolean {
  return !ALLOWED_USER_ID || userId === ALLOWED_USER_ID;
}

// ── Intent noteikšana pēc atslēgvārdiem ─────────────────────────────────────
function buildPrompt(userText: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const base = `Tu esi Latvijas grāmatvedis ar 18 gadu pieredzi. Tev ir pieejami gramatvediba MCP rīki Supabase datubāzei. Šodienas datums: ${today}. Atbildi latviešu valodā, kodolīgi.`;

  const t = userText.toLowerCase();

  // Nosūtīšana
  if (/nosūt|sūt|e-past|email|izsūt/.test(t)) {
    return `${base}\n\nLietotājs vēlas nosūtīt rēķinu(-s) e-pastā. Izmanto list_invoices vai get_invoice lai atrastu rēķinu, tad send_invoice_email lai nosūtītu. Ja norādīts klienta vārds — meklē ar list_clients. Ja norādīts rēķina numurs (piem. R-2026-001) — izmanto get_invoice ar invoice_number.\n\nUzdevums: ${userText}`;
  }

  // Labošana / maiņa
  if (/labo|maini|laboj|kļūda|kļūdain|preciz|atjauno|update|rediģ/.test(t)) {
    return `${base}\n\nLietotājs vēlas labot esošu rēķinu. Vispirms izmanto get_invoice lai iegūtu pilnus datus (ar invoice_number parametru ja norādīts numurs). Ja maina pozīcijas/cenas/daudzumus — izmanto update_invoice_items (nodod VISAS pozīcijas, ne tikai mainītās). Ja maina termiņu/piezīmes/PVN — izmanto update_invoice.\n\nUzdevums: ${userText}`;
  }

  // Apmaksāts / samaksāts
  if (/apmaksāt|samaksāt|apmaksāj|samaksāj|saņēm|saņemt maks|nomaksāt/.test(t)) {
    return `${base}\n\nLietotājs vēlas atzīmēt rēķinu kā apmaksātu. Izmanto get_invoice (ar invoice_number ja norādīts numurs) lai iegūtu invoice_id, tad update_invoice_status ar status: "apmaksats".\n\nUzdevums: ${userText}`;
  }

  // Jauns rēķins
  if (/izrakst|jaun.*rēķin|rēķin.*jaun|izveidoj.*rēķin|rēķin.*izveidoj/.test(t)) {
    return `${base}\n\nLietotājs vēlas izrakstīt jaunu rēķinu. Izmanto list_clients (search) lai atrastu klientu, tad create_invoice. Pēc izveides jautā vai nosūtīt uz klienta e-pastu.\n\nUzdevums: ${userText}`;
  }

  // Atcelt rēķinu
  if (/atcel|anulē|dzēs.*rēķin/.test(t)) {
    return `${base}\n\nLietotājs vēlas atcelt vai dzēst rēķinu. Ja atcelt — izmanto update_invoice_status ar status: "atcelts". Dzēst tikai ja lietotājs skaidri prasa un rēķins ir kļūdains.\n\nUzdevums: ${userText}`;
  }

  // Rēķinu saraksts / pārskats par rēķiniem
  if (/rēķin.*sarakst|sarakst.*rēķin|neapmaksāt|kavēj|izrakstīt.*rēķin|rēķin.*izrakstīt|kādi rēķin|kas ir rēķin/.test(t)) {
    return `${base}\n\nLietotājs vēlas redzēt rēķinu sarakstu. Izmanto list_invoices ar atbilstošiem filtriem. Formatē sarakstu ar numuru, klientu, summu, termiņu un statusu.\n\nUzdevums: ${userText}`;
  }

  // Izdevumi
  if (/izdevum|čeks|kvīts|maksājum.*par|samaksāj.*par/.test(t)) {
    return `${base}\n\nLietotājs vēlas pievienot vai skatīt izdevumus. Pievienošanai izmanto add_expense. Sarakstam — list_expenses.\n\nUzdevums: ${userText}`;
  }

  // Finanšu pārskats
  if (/pārskats|pārskatu|nodokļ|ienākum|peļņ|finansiāl|ceturkšņ|gada|mēneša/.test(t)) {
    return `${base}\n\nLietotājs vēlas finanšu pārskatu. Izmanto get_financial_summary ar attiecīgo gadu un mēnesi. Skaidri parādī: ienākumi, izdevumi, peļņa, aplēstie nodokļi.\n\nUzdevums: ${userText}`;
  }

  // Klienti
  if (/klients|klient|pievienot.*klien|jaun.*klien/.test(t)) {
    return `${base}\n\nLietotājs vēlas strādāt ar klientiem. Sarakstam — list_clients. Jaunam klientam — create_client. Labošanai — update_client.\n\nUzdevums: ${userText}`;
  }

  // Ģenērisks
  return `${base}\n\nIzmanto pieejamos MCP rīkus lai izpildītu šo uzdevumu.\n\nUzdevums: ${userText}`;
}

// ── /start komanda ──────────────────────────────────────────────────────────
bot.start((ctx) => {
  ctx.reply(
    '👨‍💼 *Grāmatvedis šeit!*\n\nEs esmu tavs personīgais grāmatvedis ar 18 gadu pieredzi Latvijas likumdošanā.\n\n*Ko varu izdarīt:*\n• Izrakstīt, labot, nosūtīt rēķinus\n• Atzīmēt rēķinus kā apmaksātus\n• Nosūtīt esošos rēķinus klientiem\n• Pievienot izdevumus\n• Parādīt finanšu pārskatu\n• 📄 Apstrādāt PDF čekus/rēķinus\n• 📷 Fotografēt čekus\n\n*Ātrās komandas:*\n/rekini — neapmaksātie rēķini\n/izdevumi — šī mēneša izdevumi\n/parskata — finanšu kopsavilkums\n/klienti — klientu saraksts\n\nVienkārši uzraksti ko vajag!',
    { parse_mode: 'Markdown' }
  );
});

// ── /rekini — neapmaksātie rēķini ──────────────────────────────────────────
bot.command('rekini', async (ctx) => {
  if (!isAllowed(ctx.from.id)) { await ctx.reply('Nav atļauts.'); return; }
  const waitMsg = await ctx.reply('⏳ Ielādē rēķinus...');
  const stopProgress = startProgress(ctx.telegram, ctx.chat.id, waitMsg.message_id, 'summary');
  try {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Tu esi Latvijas grāmatvedis. Tev ir pieejami gramatvediba MCP rīki. Šodienas datums: ${today}. Izmanto list_invoices lai iegūtu visus rēķinus ar statusu "izrakstits". Parādī sarakstu ar rēķina numuru, klientu, summu EUR un apmaksas termiņu. Pievieno kopsavilkumu: kopējā neapmaksātā summa. Ja rēķinu nav — paziņo to. Atbildi latviešu valodā.`;
    const response = await callClaude(prompt);
    stopProgress();
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes.');
  } catch (err) {
    stopProgress();
    const errMsg = err instanceof Error ? err.message : String(err);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `❌ Kļūda: ${errMsg.slice(0, 500)}`);
  }
});

// ── /izdevumi — šī mēneša izdevumi ─────────────────────────────────────────
bot.command('izdevumi', async (ctx) => {
  if (!isAllowed(ctx.from.id)) { await ctx.reply('Nav atļauts.'); return; }
  const waitMsg = await ctx.reply('⏳ Ielādē izdevumus...');
  const stopProgress = startProgress(ctx.telegram, ctx.chat.id, waitMsg.message_id, 'expense');
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prompt = `Tu esi Latvijas grāmatvedis. Tev ir pieejami gramatvediba MCP rīki. Izmanto list_expenses ar year: ${year}, month: ${month} lai iegūtu šī mēneša izdevumus. Parādī sarakstu: datums, piegādātājs, apraksts, summa EUR. Pievieno kopsavilkumu pēc kategorijām un kopējo summu. Atbildi latviešu valodā.`;
    const response = await callClaude(prompt);
    stopProgress();
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes.');
  } catch (err) {
    stopProgress();
    const errMsg = err instanceof Error ? err.message : String(err);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `❌ Kļūda: ${errMsg.slice(0, 500)}`);
  }
});

// ── /parskata — šī mēneša finanšu kopsavilkums ─────────────────────────────
bot.command('parskata', async (ctx) => {
  if (!isAllowed(ctx.from.id)) { await ctx.reply('Nav atļauts.'); return; }
  const waitMsg = await ctx.reply('⏳ Sagatavo pārskatu...');
  const stopProgress = startProgress(ctx.telegram, ctx.chat.id, waitMsg.message_id, 'summary');
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prompt = `Tu esi Latvijas grāmatvedis. Tev ir pieejami gramatvediba MCP rīki. Izmanto get_financial_summary ar year: ${year}, month: ${month}. Parādī: ienākumi, apmaksātie ienākumi, izdevumi, peļņa, aplēstie nodokļi (IIN + VSAOI). Atgādini par ceturkšņa VID maksājumiem ja aktuāli. Atbildi latviešu valodā.`;
    const response = await callClaude(prompt);
    stopProgress();
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes.');
  } catch (err) {
    stopProgress();
    const errMsg = err instanceof Error ? err.message : String(err);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `❌ Kļūda: ${errMsg.slice(0, 500)}`);
  }
});

// ── /klienti — visu klientu saraksts ───────────────────────────────────────
bot.command('klienti', async (ctx) => {
  if (!isAllowed(ctx.from.id)) { await ctx.reply('Nav atļauts.'); return; }
  const waitMsg = await ctx.reply('⏳ Ielādē klientus...');
  const stopProgress = startProgress(ctx.telegram, ctx.chat.id, waitMsg.message_id, 'default');
  try {
    const prompt = `Tu esi Latvijas grāmatvedis. Tev ir pieejami gramatvediba MCP rīki. Izmanto list_clients lai iegūtu visu klientu sarakstu. Parādī: nosaukums, e-pasts (ja ir), reģistrācijas numurs (ja ir). Atbildi latviešu valodā.`;
    const response = await callClaude(prompt);
    stopProgress();
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes.');
  } catch (err) {
    stopProgress();
    const errMsg = err instanceof Error ? err.message : String(err);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `❌ Kļūda: ${errMsg.slice(0, 500)}`);
  }
});

// ── Teksta ziņas ─────────────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  if (!isAllowed(ctx.from.id)) { await ctx.reply('Nav atļauts.'); return; }

  const intent = detectIntent(ctx.message.text);
  const waitMsg = await ctx.reply('⏳ Apstrādā...');
  const stopProgress = startProgress(ctx.telegram, ctx.chat.id, waitMsg.message_id, intent);
  try {
    const prompt = buildPrompt(ctx.message.text);
    const response = await callClaude(prompt);
    stopProgress();
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes no Claude.');
  } catch (err) {
    stopProgress();
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Kļūda:', errMsg);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `❌ Kļūda: ${errMsg.slice(0, 500)}`);
  }
});

// ── PDF dokumenti ─────────────────────────────────────────────────────────────
bot.on('document', async (ctx) => {
  if (!isAllowed(ctx.from.id)) { await ctx.reply('Nav atļauts.'); return; }

  const doc = ctx.message.document;
  const mimeType = doc.mime_type ?? '';
  const isPdf = mimeType.includes('pdf');
  const isImage = mimeType.startsWith('image/');

  if (!isPdf && !isImage) {
    await ctx.reply('📄 Atbalstu tikai PDF un attēlu failus (JPEG, PNG).');
    return;
  }

  const waitMsg = await ctx.reply('⏳ Apstrādā failu...');
  const stopProgress = startProgress(ctx.telegram, ctx.chat.id, waitMsg.message_id, 'expense');

  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const fileResponse = await fetch(fileLink.href);
    if (!fileResponse.ok) throw new Error(`Nevar lejupielādēt: ${fileResponse.status}`);
    const buffer = Buffer.from(await fileResponse.arrayBuffer());

    const fileName = doc.file_name ?? `receipt-${Date.now()}.${isPdf ? 'pdf' : 'jpg'}`;
    const { path: storagePath, signedUrl } = await uploadToStorage(buffer, fileName, mimeType || 'application/pdf');

    let extractedText: string;

    if (isPdf) {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      await parser.load();
      const textResult = await parser.getText();
      extractedText = textResult.text.trim().slice(0, 3000);

      if (!extractedText) {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined,
          '❌ Nevar izlasīt tekstu no PDF. Mēģini sūtīt kā foto.');
        return;
      }
    } else {
      const safeMime = (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp')
        ? mimeType as 'image/jpeg' | 'image/png' | 'image/webp'
        : 'image/jpeg';
      extractedText = await analyzeReceiptImage(buffer, safeMime);
    }

    const docCaption = ctx.message.caption ? `\nLietotāja instrukcija: "${ctx.message.caption}"\nJa norādīts mēnesis vai gads, izmanto to kā datumu (ignorē čeka datumu).` : '';
    const prompt = `Tu esi Latvijas grāmatvedis ar 18 gadu pieredzi. Tev ir pieejami gramatvediba MCP rīki Supabase datubāzei. Šodienas datums: ${new Date().toISOString().slice(0, 10)}.

No šiem čeka datiem pievieno izdevumu datubāzē ar add_expense MCP rīku.
SVARĪGI: obligāti norādi receipt_url: "${signedUrl}" un receipt_path: "${storagePath}"${docCaption}

Čeka dati:
---
${extractedText}
---

Pēc pievienošanas atbildi latviešu valodā ar apstiprinājumu un izdevuma kopsavilkumu.`;

    const response = await callClaude(prompt);
    stopProgress();
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes no Claude.');

  } catch (err) {
    stopProgress();
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Faila kļūda:', errMsg);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined,
      `❌ Kļūda apstrādājot failu: ${errMsg.slice(0, 500)}`);
  }
});

// ── Foto (tieši no kameras) ──────────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  if (!isAllowed(ctx.from.id)) { await ctx.reply('Nav atļauts.'); return; }

  const waitMsg = await ctx.reply('⏳ Atpazīst čeku...');
  const stopProgress = startProgress(ctx.telegram, ctx.chat.id, waitMsg.message_id, 'expense');

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const fileResponse = await fetch(fileLink.href);
    if (!fileResponse.ok) throw new Error(`Nevar lejupielādēt: ${fileResponse.status}`);
    const buffer = Buffer.from(await fileResponse.arrayBuffer());

    const fileName = `receipt-${Date.now()}.jpg`;
    const { path: storagePath, signedUrl } = await uploadToStorage(buffer, fileName, 'image/jpeg');

    const extractedText = await analyzeReceiptImage(buffer, 'image/jpeg');

    const photoCaption = ctx.message.caption ? `\nLietotāja instrukcija: "${ctx.message.caption}"\nJa norādīts mēnesis vai gads, izmanto to kā datumu (ignorē čeka datumu).` : '';
    const prompt = `Tu esi Latvijas grāmatvedis ar 18 gadu pieredzi. Tev ir pieejami gramatvediba MCP rīki Supabase datubāzei. Šodienas datums: ${new Date().toISOString().slice(0, 10)}.

No šiem čeka datiem pievieno izdevumu datubāzē ar add_expense MCP rīku.
SVARĪGI: obligāti norādi receipt_url: "${signedUrl}" un receipt_path: "${storagePath}"${photoCaption}

Čeka dati (atpazīti no foto):
---
${extractedText}
---

Pēc pievienošanas atbildi latviešu valodā ar apstiprinājumu un izdevuma kopsavilkumu.`;

    const response = await callClaude(prompt);
    stopProgress();
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes no Claude.');

  } catch (err) {
    stopProgress();
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Foto kļūda:', errMsg);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined,
      `❌ Kļūda apstrādājot foto: ${errMsg.slice(0, 500)}`);
  }
});

// ── Gracioza apturēšana ──────────────────────────────────────────────────────
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch().then(() => {
  console.log('🤖 Telegram bots darbojas — @gramatvedis_bot');
  console.log(`📁 Projekts: ${PROJECT_DIR}`);
  if (ALLOWED_USER_ID) {
    console.log(`🔒 Atļautais lietotājs: ${ALLOWED_USER_ID}`);
  } else {
    console.warn('⚠️  Nav iestatīts TELEGRAM_USER_ID — bots pieejams ikvienam!');
  }
});
