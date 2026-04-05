import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.join(__dirname, '..', 'src', 'assets', 'fonts', 'NotoSans-Variable.ttf');

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
}

export interface InvoicePdfData {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  notes?: string | null;
  items: InvoiceItem[];
  client: {
    name: string;
    reg_number?: string | null;
    address?: string | null;
    email?: string | null;
  };
  profile: {
    full_name?: string | null;
    person_code?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    bank_name?: string | null;
    bank_iban?: string | null;
    is_vat_payer: boolean;
  };
}

function eur(amount: number): string {
  return amount.toFixed(2) + ' €';
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('lv-LV', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Summa vārdiem latviešu valodā
function amountInWords(amount: number): string {
  const euros = Math.floor(amount);
  const cents = Math.round((amount - euros) * 100);

  const ones = ['', 'viens', 'divi', 'trīs', 'četri', 'pieci', 'seši', 'septiņi', 'astoņi', 'deviņi'];
  const teens = ['desmit', 'vienpadsmit', 'divpadsmit', 'trīspadsmit', 'četrpadsmit', 'piecpadsmit',
    'sešpadsmit', 'septiņpadsmit', 'astoņpadsmit', 'deviņpadsmit'];
  const tens = ['', 'desmit', 'divdesmit', 'trīsdesmit', 'četrdesmit', 'piecdesmit',
    'sešdesmit', 'septiņdesmit', 'astoņdesmit', 'deviņdesmit'];
  const hundreds = ['', 'simts', 'divi simti', 'trīs simti', 'četri simti', 'pieci simti',
    'seši simti', 'septiņi simti', 'astoņi simti', 'deviņi simti'];

  function threeDigits(n: number): string {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    const t = Math.floor(remainder / 10);
    const o = remainder % 10;
    let result = '';
    if (h > 0) result += hundreds[h] + ' ';
    if (remainder >= 10 && remainder < 20) {
      result += teens[remainder - 10];
    } else {
      if (t > 0) result += tens[t] + ' ';
      if (o > 0) result += ones[o];
    }
    return result.trim();
  }

  function numberToWords(n: number): string {
    if (n === 0) return 'nulle';
    let result = '';
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    if (thousands > 0) {
      if (thousands === 1) result += 'tūkstotis ';
      else result += threeDigits(thousands) + ' tūkstoši ';
    }
    if (remainder > 0) result += threeDigits(remainder);
    return result.trim();
  }

  const euroWord = euros === 1 ? 'eiro' : 'eiro';
  const centWord = cents === 1 ? 'cents' : 'centi';
  let result = numberToWords(euros) + ' ' + euroWord;
  if (cents > 0) result += ' un ' + numberToWords(cents) + ' ' + centWord;
  // Capitalize first letter
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('NotoSans', FONT_PATH);
    doc.font('NotoSans');

    const BLUE = '#2563EB';
    const DARK = '#111827';
    const GRAY = '#6B7280';
    const LIGHT_GRAY = '#F9FAFB';
    const BORDER = '#E5E7EB';
    const pageWidth = doc.page.width - 100;
    const rightCol = 370;

    // ── Header: "Rēķins" + info ──────────────────────────────────────────────
    doc.fontSize(28).fillColor(DARK).text('Rēķins', 50, 50);

    doc.fontSize(9).fillColor(GRAY);
    if (data.profile.person_code) {
      doc.text(`Reģistrācijas numurs: ${data.profile.person_code}`, 50, 86);
    }
    if (data.profile.email) {
      doc.text(`E-pasts: ${data.profile.email}`, 50, 98);
    }

    // Right: invoice meta
    const metaX = rightCol;
    const metaLabels = ['Rēķina numurs', 'Rēķina datums', 'Maksājuma termiņš'];
    const metaValues = [data.invoice_number, fmtDate(data.issue_date), fmtDate(data.due_date)];
    metaLabels.forEach((label, i) => {
      const y = 50 + i * 18;
      doc.fontSize(9).fillColor(BLUE).text(label, metaX, y, { width: 140 });
      doc.fillColor(DARK).text(metaValues[i], metaX + 145, y, { width: 110, align: 'right' });
    });

    // Horizontal divider
    const divY = 118;
    doc.moveTo(50, divY).lineTo(50 + pageWidth, divY).strokeColor(BORDER).lineWidth(1).stroke();

    // ── Two columns: KLIENTS | IZRAKSTĪTĀJS ─────────────────────────────────
    const colY = 130;
    const midX = 300;

    doc.fontSize(8).fillColor(GRAY).text('KLIENTS', 50, colY);
    doc.fontSize(10).fillColor(DARK).text(data.client.name, 50, colY + 14);
    doc.fontSize(9).fillColor(GRAY);
    if (data.client.reg_number) doc.fillColor(GRAY).text(`Reģistrācijas numurs: ${data.client.reg_number}`, 50);
    if (data.client.address) doc.text(data.client.address, 50);
    if (data.client.email) doc.text(`E-pasts: ${data.client.email}`, 50);

    doc.fontSize(8).fillColor(GRAY).text('IZRAKSTĪTĀJS', midX, colY);
    doc.fontSize(10).fillColor(DARK).text(data.profile.full_name ?? '—', midX, colY + 14);
    doc.fontSize(9).fillColor(GRAY);
    if (data.profile.person_code) doc.text(`Reģistrācijas numurs: ${data.profile.person_code}`, midX);
    if (data.profile.address) doc.text(`Adrese: ${data.profile.address}`, midX);
    if (data.profile.email) doc.text(`E-pasts: ${data.profile.email}`, midX);
    if (data.profile.phone) doc.text(`Telefons: ${data.profile.phone}`, midX);

    // ── Pakalpojumi ───────────────────────────────────────────────────────────
    const tableTop = 240;
    doc.fontSize(12).fillColor(DARK).text('Pakalpojumi', 50, tableTop);

    const tblStart = tableTop + 20;
    const colW = [220, 60, 80, 80, 80];
    const colX = [50, 270, 330, 410, 470];

    // Table header row
    doc.rect(50, tblStart, pageWidth, 22).fill(LIGHT_GRAY).stroke();
    doc.moveTo(50, tblStart).lineTo(50 + pageWidth, tblStart).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.moveTo(50, tblStart + 22).lineTo(50 + pageWidth, tblStart + 22).strokeColor(BORDER).lineWidth(0.5).stroke();

    const hdrLabels = ['Nosaukums', 'Daudzums', 'Mērvienība', 'Cena', 'Summa, euro'];
    doc.fontSize(8).fillColor(GRAY);
    hdrLabels.forEach((h, i) => {
      const align = i === 0 ? 'left' : 'right';
      doc.text(h, colX[i], tblStart + 7, { width: colW[i], align });
    });

    // Rows
    let rowY = tblStart + 26;
    data.items.forEach((item) => {
      doc.moveTo(50, rowY + 18).lineTo(50 + pageWidth, rowY + 18).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.fontSize(9).fillColor(DARK);
      doc.text(item.description, colX[0], rowY, { width: colW[0], align: 'left' });
      doc.text(item.quantity.toFixed(2), colX[1], rowY, { width: colW[1], align: 'right' });
      doc.text(item.unit, colX[2], rowY, { width: colW[2], align: 'right' });
      doc.text(item.unit_price.toFixed(2) + ' €', colX[3], rowY, { width: colW[3], align: 'right' });
      doc.text(item.total.toFixed(2) + ' €', colX[4], rowY, { width: colW[4], align: 'right' });
      rowY += 22;
    });

    // Bottom border of table
    doc.moveTo(50, rowY).lineTo(50 + pageWidth, rowY).strokeColor(BORDER).lineWidth(1).stroke();
    rowY += 16;

    // ── Summa vārdiem + Totals ───────────────────────────────────────────────
    const words = amountInWords(data.total);
    doc.fontSize(8).fillColor(GRAY).text('Summa vārdiem', 50, rowY);
    doc.fontSize(9).fillColor(DARK).text(words, 50, rowY + 12, { width: 250 });

    const totalsX = 360;
    const totalsLabelW = 100;
    const totalsValW = 90;

    doc.fontSize(9);
    // Starpsumma
    doc.fillColor(GRAY).text('Starpsumma', totalsX, rowY, { width: totalsLabelW });
    doc.fillColor(DARK).text(eur(data.subtotal), totalsX + totalsLabelW, rowY, { width: totalsValW, align: 'right' });
    rowY += 16;

    // PVN
    const vatPct = data.profile.is_vat_payer ? (data.vat_rate * 100).toFixed(0) : '0';
    doc.fillColor(GRAY).text(`PVN (${vatPct}%)`, totalsX, rowY, { width: totalsLabelW });
    doc.fillColor(DARK).text(eur(data.vat_amount), totalsX + totalsLabelW, rowY, { width: totalsValW, align: 'right' });
    rowY += 20;

    // Kopā
    doc.fontSize(10).fillColor(DARK);
    doc.text('Summa apmaksai, euro', totalsX, rowY, { width: totalsLabelW + 20 });
    doc.fontSize(12).text(eur(data.total), totalsX + totalsLabelW + 20, rowY - 2, { width: totalsValW - 20, align: 'right' });
    rowY += 30;

    // ── NORĒĶINU REKVIZĪTI ───────────────────────────────────────────────────
    if (data.profile.bank_name || data.profile.bank_iban) {
      doc.fontSize(8).fillColor(GRAY).text('NORĒĶINU REKVIZĪTI', 50, rowY);
      rowY += 14;

      const rekviziti: [string, string][] = [
        ['Piegādātājs', data.profile.full_name ?? '—'],
        ['Reģistrācijas numurs', data.profile.person_code ?? '—'],
        ['Adrese', data.profile.address ?? '—'],
        ['Bankas nosaukums', data.profile.bank_name ?? '—'],
        ['Konta numurs', data.profile.bank_iban ?? '—'],
      ];

      rekviziti.forEach(([label, value]) => {
        doc.fontSize(9).fillColor(BLUE).text(label, 50, rowY, { width: 150 });
        doc.fillColor(DARK).text(value, 210, rowY, { width: 340 });
        rowY += 14;
      });
      rowY += 6;
    }

    // ── Legal text ───────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY)
      .text('Dokuments ir sagatavots elektroniski un ir derīgs bez paraksta.', 50, rowY, { width: pageWidth });

    // ── Notes ────────────────────────────────────────────────────────────────
    if (data.notes) {
      rowY += 20;
      doc.fontSize(9).fillColor(DARK).text(data.notes, 50, rowY, { width: pageWidth });
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc.moveTo(50, pageH - 55).lineTo(50 + pageWidth, pageH - 55).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.fontSize(8).fillColor(GRAY)
      .text('Rēķins sagatavots lietotnē Pašnodarbinātā uzskaite', 50, pageH - 42, { width: pageWidth, align: 'right' });

    doc.end();
  });
}
