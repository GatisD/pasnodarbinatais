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
  return amount.toFixed(2) + ' EUR';
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('lv-LV', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

    const GREEN = '#1a5c2a';
    const GRAY = '#555555';
    const LIGHT = '#f5f5f5';
    const pageWidth = doc.page.width - 100; // margins

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(22).fillColor(GREEN).text('RĒĶINS', 50, 50);
    doc.fontSize(14).fillColor('#000000').text(data.invoice_number, 50, 78);

    doc.fontSize(9).fillColor(GRAY);
    doc.text(`Datums: ${fmtDate(data.issue_date)}`, 50, 110);
    doc.text(`Apmaksas termiņš: ${fmtDate(data.due_date)}`, 50, 124);

    // ── Issuer (right column) ────────────────────────────────────────────────
    const rightX = 320;
    doc.fontSize(9).fillColor(GRAY).text('IZDEVĒJS', rightX, 50);
    doc.fontSize(10).fillColor('#000000');
    doc.text(data.profile.full_name ?? '—', rightX, 64);
    if (data.profile.person_code) doc.text(`Personas kods: ${data.profile.person_code}`, rightX);
    if (data.profile.address) doc.text(data.profile.address, rightX);
    if (data.profile.phone) doc.text(`Tel: ${data.profile.phone}`, rightX);
    if (data.profile.email) doc.text(data.profile.email, rightX);

    // ── Client ───────────────────────────────────────────────────────────────
    const clientY = 165;
    doc.fontSize(9).fillColor(GRAY).text('SAŅĒMĒJS', 50, clientY);
    doc.fontSize(10).fillColor('#000000');
    doc.text(data.client.name, 50, clientY + 14);
    if (data.client.reg_number) doc.text(`Reģ. nr.: ${data.client.reg_number}`, 50);
    if (data.client.address) doc.text(data.client.address, 50);
    if (data.client.email) doc.text(data.client.email, 50);

    // ── Items table ──────────────────────────────────────────────────────────
    const tableTop = 270;
    const colWidths = [240, 50, 60, 80, 80];
    const cols = [50, 290, 340, 400, 480];

    // Table header
    doc.rect(50, tableTop, pageWidth, 20).fill(GREEN);
    doc.fontSize(9).fillColor('#ffffff');
    const headers = ['Apraksts', 'Skaits', 'Vienība', 'Cena', 'Summa'];
    headers.forEach((h, i) => {
      const align = i === 0 ? 'left' : 'right';
      const w = colWidths[i];
      doc.text(h, cols[i], tableTop + 5, { width: w, align });
    });

    // Table rows
    let rowY = tableTop + 24;
    data.items.forEach((item, idx) => {
      if (idx % 2 === 0) {
        doc.rect(50, rowY - 2, pageWidth, 18).fill(LIGHT);
      }
      doc.fillColor('#000000').fontSize(9);
      doc.text(item.description, cols[0], rowY, { width: colWidths[0], align: 'left' });
      doc.text(item.quantity.toString(), cols[1], rowY, { width: colWidths[1], align: 'right' });
      doc.text(item.unit, cols[2], rowY, { width: colWidths[2], align: 'right' });
      doc.text(eur(item.unit_price), cols[3], rowY, { width: colWidths[3], align: 'right' });
      doc.text(eur(item.total), cols[4], rowY, { width: colWidths[4], align: 'right' });
      rowY += 20;
    });

    // Divider line
    rowY += 6;
    doc.moveTo(50, rowY).lineTo(50 + pageWidth, rowY).strokeColor(GREEN).lineWidth(1).stroke();
    rowY += 10;

    // Totals
    const totalsX = 380;
    doc.fontSize(9).fillColor(GRAY);

    doc.text('Summa bez PVN:', 50, rowY, { width: totalsX - 60, align: 'right' });
    doc.fillColor('#000000').text(eur(data.subtotal), totalsX, rowY, { width: 120, align: 'right' });
    rowY += 16;

    if (data.profile.is_vat_payer || data.vat_rate > 0) {
      const vatPct = (data.vat_rate * 100).toFixed(0);
      doc.fillColor(GRAY).text(`PVN ${vatPct}%:`, 50, rowY, { width: totalsX - 60, align: 'right' });
      doc.fillColor('#000000').text(eur(data.vat_amount), totalsX, rowY, { width: 120, align: 'right' });
      rowY += 16;
    }

    // Total box
    doc.rect(totalsX - 10, rowY - 4, 140, 22).fill(GREEN);
    doc.fillColor('#ffffff').fontSize(11);
    doc.text('KOPĀ:', 50, rowY, { width: totalsX - 60, align: 'right' });
    doc.text(eur(data.total), totalsX, rowY, { width: 120, align: 'right' });
    rowY += 36;
    doc.fillColor('#000000');

    // ── Bank details ─────────────────────────────────────────────────────────
    if (data.profile.bank_name || data.profile.bank_iban) {
      doc.fontSize(9).fillColor(GRAY).text('BANKAS REKVIZĪTI', 50, rowY);
      rowY += 13;
      doc.fillColor('#000000').fontSize(9);
      if (data.profile.bank_name) {
        doc.text(`Banka: ${data.profile.bank_name}`, 50, rowY);
        rowY += 13;
      }
      if (data.profile.bank_iban) {
        doc.text(`IBAN: ${data.profile.bank_iban}`, 50, rowY);
        rowY += 13;
      }
      rowY += 8;
    }

    // ── Notes ────────────────────────────────────────────────────────────────
    if (data.notes) {
      doc.fontSize(9).fillColor(GRAY).text('PIEZĪMES', 50, rowY);
      rowY += 13;
      doc.fillColor('#000000').text(data.notes, 50, rowY, { width: pageWidth });
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc.fontSize(8).fillColor(GRAY)
      .text(
        `Rēķins ${data.invoice_number} | Izveidots: ${fmtDate(data.issue_date)}`,
        50, pageH - 40, { width: pageWidth, align: 'center' }
      );

    doc.end();
  });
}
