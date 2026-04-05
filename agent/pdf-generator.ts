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

// ── A4 layout constants ───────────────────────────────────────────────────────
// A4 = 595 × 842 pt. Margins 50 left/right → content width = 495, right edge = 545
const ML = 50;   // margin left
const MR = 545;  // content right edge (595 - 50)
const CW = 495;  // content width
const MID = 295; // mid column split

function eur(n: number): string { return n.toFixed(2) + ' €'; }

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('lv-LV', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function amountInWords(amount: number): string {
  const euros = Math.floor(amount);
  const cents = Math.round((amount - euros) * 100);
  const ones = ['', 'viens', 'divi', 'trīs', 'četri', 'pieci', 'seši', 'septiņi', 'astoņi', 'deviņi'];
  const teens = ['desmit', 'vienpadsmit', 'divpadsmit', 'trīspadsmit', 'četrpadsmit', 'piecpadsmit',
    'sešpadsmit', 'septiņpadsmit', 'astoņpadsmit', 'deviņpadsmit'];
  const tens10 = ['', 'desmit', 'divdesmit', 'trīsdesmit', 'četrdesmit', 'piecdesmit',
    'sešdesmit', 'septiņdesmit', 'astoņdesmit', 'deviņdesmit'];
  const h100 = ['', 'simts', 'divi simti', 'trīs simti', 'četri simti', 'pieci simti',
    'seši simti', 'septiņi simti', 'astoņi simti', 'deviņi simti'];

  function three(n: number): string {
    if (!n) return '';
    const h = Math.floor(n / 100), rem = n % 100, t = Math.floor(rem / 10), o = rem % 10;
    let r = h ? h100[h] + ' ' : '';
    if (rem >= 10 && rem < 20) r += teens[rem - 10];
    else { if (t) r += tens10[t] + ' '; if (o) r += ones[o]; }
    return r.trim();
  }

  function toWords(n: number): string {
    if (!n) return 'nulle';
    const th = Math.floor(n / 1000), rem = n % 1000;
    let r = '';
    if (th === 1) r = 'tūkstotis ';
    else if (th > 1) r = three(th) + ' tūkstoši ';
    if (rem) r += three(rem);
    return r.trim();
  }

  let res = toWords(euros) + ' eiro';
  if (cents > 0) res += ' un ' + toWords(cents) + (cents === 1 ? ' cents' : ' centi');
  return res.charAt(0).toUpperCase() + res.slice(1);
}

export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: ML, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('NotoSans', FONT_PATH);
    doc.font('NotoSans');

    const BLUE  = '#2563EB';
    const DARK  = '#111827';
    const GRAY  = '#6B7280';
    const LGRAY = '#F9FAFB';
    const BDR   = '#E5E7EB';

    // ── HEADER ───────────────────────────────────────────────────────────────
    // Left: "Rēķins" title + reg/email
    doc.fontSize(28).fillColor(DARK).text('Rēķins', ML, 50);
    doc.fontSize(9).fillColor(GRAY);
    let hY = 88;
    if (data.profile.person_code) { doc.text(`Reģistrācijas numurs: ${data.profile.person_code}`, ML, hY); hY += 13; }
    if (data.profile.email)       { doc.text(`E-pasts: ${data.profile.email}`, ML, hY); }

    // Right: meta table — labels start at MID+5, values right-aligned to MR
    // Label col: MID+5 width 140 → ends ~MID+145
    // Value col: MID+150 width 95, right-aligned → MID+150+95 = 295+245 = 540 ≤ 545 ✓
    const mX  = MID + 5;   // 300
    const vX  = MID + 150; // 445
    const vW  = 100;        // → right edge 445+100 = 545 ✓
    const metaLabels = ['Rēķina numurs', 'Rēķina datums', 'Maksājuma termiņš'];
    const metaVals   = [data.invoice_number, fmtDate(data.issue_date), fmtDate(data.due_date)];
    metaLabels.forEach((lbl, i) => {
      const y = 60 + i * 18;
      doc.fontSize(9).fillColor(BLUE).text(lbl, mX, y, { width: 145 });
      doc.fillColor(DARK).text(metaVals[i], vX, y, { width: vW, align: 'right' });
    });

    // Horizontal divider
    const divY = 118;
    doc.moveTo(ML, divY).lineTo(MR, divY).strokeColor(BDR).lineWidth(0.8).stroke();

    // ── KLIENTS / IZRAKSTĪTĀJS ────────────────────────────────────────────────
    let cY = 132;
    doc.fontSize(8).fillColor(GRAY).text('KLIENTS', ML, cY);
    doc.fontSize(8).fillColor(GRAY).text('IZRAKSTĪTĀJS', MID + 5, cY);
    cY += 14;

    // Client left column
    let cLY = cY;
    doc.fontSize(10).fillColor(DARK).text(data.client.name, ML, cLY); cLY += 15;
    doc.fontSize(9).fillColor(GRAY);
    if (data.client.reg_number) { doc.text(`Reģistrācijas numurs: ${data.client.reg_number}`, ML, cLY); cLY += 13; }
    if (data.client.address)    { doc.text(data.client.address, ML, cLY); cLY += 13; }
    if (data.client.email)      { doc.text(`E-pasts: ${data.client.email}`, ML, cLY); cLY += 13; }

    // Issuer right column
    let cRY = cY;
    doc.fontSize(10).fillColor(DARK).text(data.profile.full_name ?? '—', MID + 5, cRY); cRY += 15;
    doc.fontSize(9).fillColor(GRAY);
    if (data.profile.person_code) { doc.text(`Reģistrācijas numurs: ${data.profile.person_code}`, MID + 5, cRY); cRY += 13; }
    if (data.profile.address)     { doc.text(`Adrese: ${data.profile.address}`, MID + 5, cRY); cRY += 13; }
    if (data.profile.email)       { doc.text(`E-pasts: ${data.profile.email}`, MID + 5, cRY); cRY += 13; }
    if (data.profile.phone)       { doc.text(`Telefons: ${data.profile.phone}`, MID + 5, cRY); cRY += 13; }

    // ── PAKALPOJUMI ───────────────────────────────────────────────────────────
    const tblTop = Math.max(cLY, cRY) + 24;
    doc.fontSize(14).fillColor(DARK).text('Pakalpojumi', ML, tblTop);

    // Table columns — total width must = CW = 495
    // Nosaukums:200, Daudzums:65, Mērvienība:80, Cena:75, Summa:75 → 200+65+80+75+75=495 ✓
    const cols  = [ML, ML+200, ML+265, ML+345, ML+420]; // x starts
    const colW  = [200, 65, 80, 75, 75];
    const hdrs  = ['Nosaukums', 'Daudzums', 'Mērvienība', 'Cena', 'Summa, euro'];
    const aligns: ('left'|'right')[] = ['left','right','right','right','right'];

    const hdrY = tblTop + 20;
    // Header row background
    doc.rect(ML, hdrY, CW, 24).fill(LGRAY);
    doc.moveTo(ML, hdrY).lineTo(MR, hdrY).strokeColor(BDR).lineWidth(0.5).stroke();
    doc.moveTo(ML, hdrY + 24).lineTo(MR, hdrY + 24).strokeColor(BDR).lineWidth(0.5).stroke();
    doc.fontSize(8).fillColor(GRAY);
    hdrs.forEach((h, i) => {
      const pad = aligns[i] === 'left' ? 6 : 0;
      doc.text(h, cols[i] + pad, hdrY + 8, { width: colW[i] - pad, align: aligns[i] });
    });

    // Rows
    let rowY = hdrY + 28;
    data.items.forEach(item => {
      doc.moveTo(ML, rowY + 18).lineTo(MR, rowY + 18).strokeColor(BDR).lineWidth(0.5).stroke();
      doc.fontSize(9).fillColor(DARK);
      doc.text(item.description,              cols[0] + 6, rowY, { width: colW[0]-6, align: 'left' });
      doc.text(item.quantity.toFixed(2),      cols[1],     rowY, { width: colW[1],   align: 'right' });
      doc.text(item.unit,                     cols[2],     rowY, { width: colW[2],   align: 'right' });
      doc.text(item.unit_price.toFixed(2)+' €', cols[3],  rowY, { width: colW[3],   align: 'right' });
      doc.text(item.total.toFixed(2)+' €',    cols[4],     rowY, { width: colW[4],   align: 'right' });
      rowY += 22;
    });

    // Table bottom border
    doc.moveTo(ML, rowY).lineTo(MR, rowY).strokeColor(BDR).lineWidth(0.8).stroke();
    rowY += 20;

    // ── SUMMA VĀRDIEM  +  TOTALS ─────────────────────────────────────────────
    // Left: Summa vārdiem (x=50, width=230)
    // Right totals: label x=295, value right-aligned to 545
    const totLblX = MID;      // 295
    const totValX = MR - 100; // 445
    const totValW = 100;       // → 445+100=545 ✓

    doc.fontSize(8).fillColor(GRAY).text('Summa vārdiem', ML, rowY);
    doc.fontSize(9).fillColor(DARK).text(amountInWords(data.total), ML, rowY + 13, { width: 230 });

    // Starpsumma
    doc.fontSize(9).fillColor(GRAY).text('Starpsumma', totLblX, rowY, { width: 145 });
    doc.fillColor(DARK).text(eur(data.subtotal), totValX, rowY, { width: totValW, align: 'right' });
    rowY += 16;

    // PVN
    const vatPct = data.profile.is_vat_payer ? (data.vat_rate * 100).toFixed(0) : '0';
    doc.fontSize(9).fillColor(GRAY).text(`PVN (${vatPct}%)`, totLblX, rowY, { width: 145 });
    doc.fillColor(DARK).text(eur(data.vat_amount), totValX, rowY, { width: totValW, align: 'right' });
    rowY += 20;

    // Summa apmaksai — divider above
    doc.moveTo(totLblX, rowY - 4).lineTo(MR, rowY - 4).strokeColor(BDR).lineWidth(0.5).stroke();
    doc.fontSize(10).fillColor(DARK).text('Summa apmaksai, euro', totLblX, rowY, { width: 145 });
    doc.fontSize(14).fillColor(DARK).text(eur(data.total), totValX - 10, rowY - 2, { width: totValW + 10, align: 'right' });
    rowY += 36;

    // ── NORĒĶINU REKVIZĪTI ───────────────────────────────────────────────────
    if (data.profile.bank_name || data.profile.bank_iban) {
      doc.fontSize(8).fillColor(GRAY).text('NORĒĶINU REKVIZĪTI', ML, rowY);
      rowY += 14;
      const rekviziti: [string, string][] = [
        ['Piegādātājs',      data.profile.full_name ?? '—'],
        ['Reģistrācijas numurs', data.profile.person_code ?? '—'],
        ['Adrese',           data.profile.address ?? '—'],
        ['Bankas nosaukums', data.profile.bank_name ?? '—'],
        ['Konta numurs',     data.profile.bank_iban ?? '—'],
      ];
      rekviziti.forEach(([lbl, val]) => {
        doc.fontSize(9).fillColor(BLUE).text(lbl, ML, rowY, { width: 145 });
        doc.fillColor(DARK).text(val, ML + 155, rowY, { width: CW - 155 });
        rowY += 14;
      });
      rowY += 8;
    }

    // ── LEGAL TEXT ───────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY)
      .text('Dokuments ir sagatavots elektroniski un ir derīgs bez paraksta.', ML, rowY, { width: CW });

    if (data.notes) {
      rowY += 18;
      doc.fontSize(9).fillColor(DARK).text(data.notes, ML, rowY, { width: CW });
    }

    // ── FOOTER ───────────────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc.moveTo(ML, pageH - 50).lineTo(MR, pageH - 50).strokeColor(BDR).lineWidth(0.5).stroke();
    doc.fontSize(8).fillColor(GRAY)
      .text('Rēķins sagatavots lietotnē Pašnodarbinātā uzskaite', ML, pageH - 36, { width: CW, align: 'right' });

    doc.end();
  });
}
