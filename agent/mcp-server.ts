#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
// Ielādē .env no projekta saknes neatkarīgi no cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  initSupabase,
  getProfile,
  listClients,
  getClient,
  createClient,
  updateClient,
  listInvoices,
  getInvoice,
  getInvoiceByNumber,
  createInvoice,
  updateInvoiceStatus,
  updateInvoice,
  updateInvoiceItems,
  deleteInvoice,
  sendInvoiceEmail,
  listExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getFinancialSummary,
} from './tools.js';

// ── Tool call handler ────────────────────────────────────────────────────────
async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_profile':
      return getProfile();

    case 'list_clients':
      return listClients(args.search as string | undefined);

    case 'get_client':
      return getClient(args.client_id as string);

    case 'create_client':
      return createClient(args as Parameters<typeof createClient>[0]);

    case 'update_client':
      return updateClient(args.client_id as string, args as Parameters<typeof updateClient>[1]);

    case 'list_invoices':
      return listInvoices(args as Parameters<typeof listInvoices>[0]);

    case 'get_invoice':
      if (args.invoice_number) return getInvoiceByNumber(args.invoice_number as string);
      return getInvoice(args.invoice_id as string);

    case 'create_invoice':
      return createInvoice(args as Parameters<typeof createInvoice>[0]);

    case 'update_invoice_status':
      return updateInvoiceStatus(args.invoice_id as string, args.status as Parameters<typeof updateInvoiceStatus>[1]);

    case 'update_invoice':
      return updateInvoice(args.invoice_id as string, args as Parameters<typeof updateInvoice>[1]);

    case 'update_invoice_items':
      return updateInvoiceItems(
        args.invoice_id as string,
        args.items as Parameters<typeof updateInvoiceItems>[1],
        args.vat_rate as number | undefined
      );

    case 'delete_invoice':
      return deleteInvoice(args.invoice_id as string);

    case 'send_invoice_email':
      return sendInvoiceEmail(args.invoice_id as string, args.custom_message as string | undefined);

    case 'list_expenses':
      return listExpenses(args as Parameters<typeof listExpenses>[0]);

    case 'add_expense':
      return addExpense(args as Parameters<typeof addExpense>[0]);

    case 'update_expense':
      return updateExpense(args.expense_id as string, args as Parameters<typeof updateExpense>[1]);

    case 'delete_expense':
      return deleteExpense(args.expense_id as string);

    case 'get_financial_summary':
      return getFinancialSummary(args as Parameters<typeof getFinancialSummary>[0]);

    default:
      throw new Error(`Nezināms rīks: ${name}`);
  }
}

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_profile',
    description: 'Iegūt pašnodarbinātā profilu: vārds, personas kods, banka, IBAN, adrese, e-pasts, PVN maksātājs.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_clients',
    description: 'Uzskaitīt visus klientus. Opcija: meklēšana pēc nosaukuma.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Daļējs klienta nosaukums meklēšanai' },
      },
    },
  },
  {
    name: 'get_client',
    description: 'Iegūt konkrēta klienta pilnus datus pēc ID.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Klienta UUID' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'create_client',
    description: 'Izveidot jaunu klientu sistēmā.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Klienta nosaukums (obligāts)' },
        reg_number: { type: 'string', description: 'Reģistrācijas numurs' },
        address: { type: 'string', description: 'Juridiskā adrese' },
        email: { type: 'string', description: 'E-pasta adrese rēķinu nosūtīšanai' },
        bank_iban: { type: 'string', description: 'IBAN konts' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_client',
    description: 'Labot klienta datus.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        name: { type: 'string' },
        reg_number: { type: 'string' },
        address: { type: 'string' },
        email: { type: 'string' },
        bank_iban: { type: 'string' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'list_invoices',
    description: 'Uzskaitīt rēķinus ar filtriem. Statusi: izrakstits, apmaksats, kavejas, atcelts.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['izrakstits', 'nosutits', 'apmaksats', 'kavejas', 'atcelts'],
          description: 'Filtrēt pēc statusa',
        },
        client_id: { type: 'string', description: 'Filtrēt pēc klienta ID' },
        year: { type: 'number', description: 'Gads (piem., 2026)' },
        month: { type: 'number', description: 'Mēnesis 1-12' },
        limit: { type: 'number', description: 'Maks. skaits (noklusēts: visi)' },
      },
    },
  },
  {
    name: 'get_invoice',
    description: 'Iegūt pilnu rēķina informāciju ar pozīcijām. Var meklēt pēc ID vai rēķina numura (piem. R-2026-001).',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'Rēķina UUID' },
        invoice_number: { type: 'string', description: 'Rēķina numurs, piem. R-2026-001' },
      },
    },
  },
  {
    name: 'create_invoice',
    description: 'Izveidot jaunu rēķinu ar pozīcijām. Rēķina numurs tiek ģenerēts automātiski.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Klienta UUID (obligāts)' },
        issue_date: { type: 'string', description: 'Izrakstīšanas datums YYYY-MM-DD' },
        due_date: { type: 'string', description: 'Apmaksas termiņš YYYY-MM-DD' },
        vat_rate: { type: 'number', description: 'PVN likme decimāldaļskaitļa formātā (0 = 0%, 0.21 = 21%). Noklusēts: 0.' },
        notes: { type: 'string', description: 'Piezīmes rēķinā' },
        items: {
          type: 'array',
          description: 'Rēķina pozīcijas',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Pakalpojuma apraksts' },
              quantity: { type: 'number', description: 'Daudzums' },
              unit: { type: 'string', description: 'Mērvienība (gab., st., mēn. u.c.)' },
              unit_price: { type: 'number', description: 'Cena par vienību EUR' },
            },
            required: ['description', 'quantity', 'unit_price'],
          },
        },
      },
      required: ['client_id', 'issue_date', 'due_date', 'items'],
    },
  },
  {
    name: 'update_invoice_status',
    description: 'Mainīt rēķina statusu. Atzīmēt kā apmaksātu vai atceltu.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'Rēķina UUID' },
        status: {
          type: 'string',
          enum: ['izrakstits', 'nosutits', 'apmaksats', 'kavejas', 'atcelts'],
        },
      },
      required: ['invoice_id', 'status'],
    },
  },
  {
    name: 'update_invoice',
    description: 'Labot rēķina datus: apmaksas termiņu, piezīmes, PVN likmi.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string' },
        due_date: { type: 'string', description: 'Jauns apmaksas termiņš YYYY-MM-DD' },
        notes: { type: 'string' },
        vat_rate: { type: 'number' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'update_invoice_items',
    description: 'Aizstāt rēķina pozīcijas ar jaunām. Automātiski pārrēķina subtotal, PVN un kopējo summu. Izmanto lai labotu pozīcijas, cenas vai daudzumus esošā rēķinā.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'Rēķina UUID' },
        vat_rate: { type: 'number', description: 'Jauna PVN likme (0 = 0%, 0.21 = 21%). Ja nav norādīts, tiek saglabāta esošā.' },
        items: {
          type: 'array',
          description: 'Jaunās rēķina pozīcijas (aizstāj visas esošās)',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Pakalpojuma apraksts' },
              quantity: { type: 'number', description: 'Daudzums' },
              unit: { type: 'string', description: 'Mērvienība (gab., st., mēn. u.c.)' },
              unit_price: { type: 'number', description: 'Cena par vienību EUR' },
            },
            required: ['description', 'quantity', 'unit_price'],
          },
        },
      },
      required: ['invoice_id', 'items'],
    },
  },
  {
    name: 'delete_invoice',
    description: 'Dzēst rēķinu no sistēmas. Izmantot tikai ja rēķins ir kļūdaini izveidots.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'send_invoice_email',
    description: 'Nosūtīt rēķinu uz klienta e-pastu kā PDF pielikumu. Automātiski ģenerē PDF un atzīmē rēķinu kā nosūtītu.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'Rēķina UUID' },
        custom_message: { type: 'string', description: 'Pielāgots e-pasta teksts. Ja nav norādīts, tiek izmantots standarta teksts.' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'list_expenses',
    description: 'Uzskaitīt izdevumus ar filtriem pēc kategorijas un perioda.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['sakari', 'transports', 'degviela', 'biroja_preces', 'programmatura',
            'majaslapa', 'reklama', 'gramatvediba', 'telpu_noma', 'komunalie',
            'apdrosinasana', 'profesionala_izglitiba', 'aprikojums', 'bankas_komisija', 'citi'],
        },
        year: { type: 'number' },
        month: { type: 'number', description: '1-12' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'add_expense',
    description: 'Pievienot jaunu izdevumu.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Datums YYYY-MM-DD' },
        amount: { type: 'number', description: 'Summa EUR (ar PVN)' },
        category: {
          type: 'string',
          enum: ['sakari', 'transports', 'degviela', 'biroja_preces', 'programmatura',
            'majaslapa', 'reklama', 'gramatvediba', 'telpu_noma', 'komunalie',
            'apdrosinasana', 'profesionala_izglitiba', 'aprikojums', 'bankas_komisija', 'citi'],
          description: 'Izdevumu kategorija',
        },
        vendor: { type: 'string', description: 'Piegādātājs / uzņēmums' },
        description: { type: 'string', description: 'Apraksts' },
        vat_amount: { type: 'number', description: 'PVN summa EUR (ja zināma)' },
        receipt_url: { type: 'string', description: 'Čeka/rēķina faila URL (Supabase Storage)' },
        receipt_path: { type: 'string', description: 'Čeka/rēķina faila ceļš storage (user_id/filename)' },
      },
      required: ['date', 'amount', 'category'],
    },
  },
  {
    name: 'update_expense',
    description: 'Labot esošu izdevumu.',
    inputSchema: {
      type: 'object',
      properties: {
        expense_id: { type: 'string' },
        date: { type: 'string' },
        amount: { type: 'number' },
        category: { type: 'string' },
        vendor: { type: 'string' },
        description: { type: 'string' },
        vat_amount: { type: 'number' },
      },
      required: ['expense_id'],
    },
  },
  {
    name: 'delete_expense',
    description: 'Dzēst izdevumu.',
    inputSchema: {
      type: 'object',
      properties: {
        expense_id: { type: 'string' },
      },
      required: ['expense_id'],
    },
  },
  {
    name: 'get_financial_summary',
    description: 'Iegūt finanšu kopsavilkumu: ienākumi, izdevumi, peļņa, aprēķinātie nodokļi (IIN + VSAOI) par periodu.',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'number', description: 'Gads (obligāts)' },
        month: { type: 'number', description: 'Mēnesis 1-12 (ja nav norādīts, rāda visu gadu)' },
      },
      required: ['year'],
    },
  },
] as const;

// ── Server setup ─────────────────────────────────────────────────────────────
async function main() {
  // Authenticate with Supabase
  try {
    const { userId } = await initSupabase();
    process.stderr.write(`[gramatvediba] Autentificēts kā ${userId}\n`);
  } catch (err) {
    process.stderr.write(`[gramatvediba] KĻŪDA: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const server = new Server(
    { name: 'gramatvediba', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      const result = await handleTool(name, args as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Kļūda: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[gramatvediba] MCP serveris darbojas\n');
}

main().catch(err => {
  process.stderr.write(`[gramatvediba] Fatāla kļūda: ${err.message}\n`);
  process.exit(1);
});
