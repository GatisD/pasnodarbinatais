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

  // Autentifikācija
  const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key },
    body: JSON.stringify({ email, password }),
  });
  const authData = await authRes.json() as { access_token: string; user: { id: string } };
  const { access_token, user } = authData;

  // Augšupielāde
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

  // Iegūst parakstītu URL uz 10 gadiem
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

// ── Drošības pārbaude ────────────────────────────────────────────────────────
function isAllowed(userId: number): boolean {
  return !ALLOWED_USER_ID || userId === ALLOWED_USER_ID;
}

// ── Palaišanas ziņa ──────────────────────────────────────────────────────────
bot.start((ctx) => {
  ctx.reply(
    '👨‍💼 *Grāmatvedis šeit!*\n\nEs esmu tavs personīgais grāmatvedis ar 18 gadu pieredzi Latvijas likumdošanā.\n\nKo varu izdarīt?\n• Izrakstīt rēķinus\n• Pievienot izdevumus\n• Parādīt finanšu pārskatu\n• Atbildēt uz grāmatvedības jautājumiem\n• 📄 Apstrādāt PDF čekus/rēķinus\n• 📷 Fotografēt čekus (JPEG/PNG)\n\nVienkārši uzraksti ko vajag vai nosūti failu!',
    { parse_mode: 'Markdown' }
  );
});

// ── Teksta ziņas ─────────────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  if (!isAllowed(ctx.from.id)) { await ctx.reply('Nav atļauts.'); return; }

  const waitMsg = await ctx.reply('⏳ Apstrādā...');
  try {
    const prompt = `Tu esi Latvijas grāmatvedis ar 18 gadu pieredzi. Tev ir pieejami gramatvediba MCP rīki Supabase datubāzei. Izmanto tos lai izpildītu šo uzdevumu. Atbildi latviešu valodā, kodolīgi. Uzdevums: ${ctx.message.text}`;
    const response = await callClaude(prompt);
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes no Claude.');
  } catch (err) {
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

  try {
    // Lejupielādē failu
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const fileResponse = await fetch(fileLink.href);
    if (!fileResponse.ok) throw new Error(`Nevar lejupielādēt: ${fileResponse.status}`);
    const buffer = Buffer.from(await fileResponse.arrayBuffer());

    // Augšupielādē storage
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
      // Attēls — izmanto Claude Vision
      const safeMime = (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp')
        ? mimeType as 'image/jpeg' | 'image/png' | 'image/webp'
        : 'image/jpeg';
      extractedText = await analyzeReceiptImage(buffer, safeMime);
    }

    // Sūta Claude pievienot izdevumu ar receipt_url
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
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes no Claude.');

  } catch (err) {
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

  try {
    // Augstākā kvalitāte — pēdējais foto masīvā
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const fileResponse = await fetch(fileLink.href);
    if (!fileResponse.ok) throw new Error(`Nevar lejupielādēt: ${fileResponse.status}`);
    const buffer = Buffer.from(await fileResponse.arrayBuffer());

    // Augšupielādē storage
    const fileName = `receipt-${Date.now()}.jpg`;
    const { path: storagePath, signedUrl } = await uploadToStorage(buffer, fileName, 'image/jpeg');

    // Atpazīst čeku ar Claude Vision
    const extractedText = await analyzeReceiptImage(buffer, 'image/jpeg');

    // Sūta Claude pievienot izdevumu
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
    await sendResponse(ctx as any, waitMsg.message_id, response || '❌ Nav atbildes no Claude.');

  } catch (err) {
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
