#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { Telegraf } from 'telegraf';
import { exec } from 'child_process';
import { promisify } from 'util';

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

const bot = new Telegraf(BOT_TOKEN);

// Palaišanas ziņa
bot.start((ctx) => {
  ctx.reply(
    '👨‍💼 *Grāmatvedis šeit!*\n\nEs esmu tavs personīgais grāmatvedis ar 18 gadu pieredzi Latvijas likumdošanā.\n\nKo varu izdarīt?\n• Izrakstīt rēķinus\n• Pievienot izdevumus\n• Parādīt finanšu pārskatu\n• Atbildēt uz grāmatvedības jautājumiem\n\nVienkārši uzraksti ko vajag!',
    { parse_mode: 'Markdown' }
  );
});

// Galvenais ziņu apstrādātājs
bot.on('text', async (ctx) => {
  // Drošība: atļauts tikai norādītais lietotājs
  if (ALLOWED_USER_ID && ctx.from.id !== ALLOWED_USER_ID) {
    console.warn(`Neatļauts pieejas mēģinājums no user_id: ${ctx.from.id}`);
    await ctx.reply('Nav atļauts.');
    return;
  }

  const userMessage = ctx.message.text;
  const waitMsg = await ctx.reply('⏳ Apstrādā...');

  try {
    // Izsauc claude -p ar gramatvedja instrukciju
    const prompt = `Tu esi Latvijas grāmatvedis ar 18 gadu pieredzi. Tev ir pieejami gramatvediba MCP rīki Supabase datubāzei. Izmanto tos lai izpildītu šo uzdevumu. Atbildi latviešu valodā, kodolīgi. Uzdevums: ${userMessage}`;

    const { stdout, stderr } = await execAsync(
      `${CLAUDE_PATH} -p ${JSON.stringify(prompt)} --allowedTools "mcp__gramatvediba__*" --dangerously-skip-permissions 2>/dev/null`,
      {
        cwd: PROJECT_DIR,
        timeout: 120_000, // 2 minūtes
        env: { ...process.env, HOME: process.env.HOME },
      }
    );

    const response = stdout.trim();
    if (!response) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, waitMsg.message_id, undefined,
        '❌ Nav atbildes no Claude.'
      );
      return;
    }

    // Telegram max 4096 simboli vienā ziņā
    if (response.length <= 4096) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, waitMsg.message_id, undefined,
        response
      );
    } else {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
      // Sūta pa daļām
      for (let i = 0; i < response.length; i += 4000) {
        await ctx.reply(response.slice(i, i + 4000));
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Kļūda:', errMsg);
    await ctx.telegram.editMessageText(
      ctx.chat.id, waitMsg.message_id, undefined,
      `❌ Kļūda: ${errMsg.slice(0, 500)}`
    );
  }
});

// Gracioza apturēšana
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
