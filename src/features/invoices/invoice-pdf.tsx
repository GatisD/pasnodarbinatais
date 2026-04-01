import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import notoSansFont from '@/assets/fonts/NotoSans-Variable.ttf'
import { formatCurrency, formatDate } from '@/lib/format'

Font.register({
  family: 'Noto Sans',
  fonts: [
    { src: notoSansFont, fontWeight: 400 },
    { src: notoSansFont, fontWeight: 700 },
  ],
})

export type InvoicePdfParty = {
  address?: string | null
  bankIban?: string | null
  bankName?: string | null
  email?: string | null
  name?: string | null
  phone?: string | null
  regNumber?: string | null
}

export type InvoicePdfItem = {
  description: string
  quantity: number
  total: number
  unit: string
  unitPrice: number
}

export type InvoicePdfData = {
  client: InvoicePdfParty
  dueDate: string
  invoiceNumber: string
  issueDate: string
  items: InvoicePdfItem[]
  notes?: string
  profile: InvoicePdfParty
  subtotal: number
  total: number
  vatAmount: number
  vatRateLabel: string
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontFamily: 'Noto Sans',
    fontSize: 10,
    lineHeight: 1.45,
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
  },
  muted: {
    color: '#475569',
    fontSize: 10,
    marginBottom: 2,
  },
  metaTable: {
    minWidth: 210,
  },
  metaRow: {
    columnGap: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaLabel: {
    color: '#0ea5e9',
    fontSize: 9,
    fontWeight: 700,
  },
  metaValue: {
    color: '#334155',
    fontSize: 9,
  },
  divider: {
    borderBottom: '1 solid #d5dee7',
    marginBottom: 16,
  },
  infoGrid: {
    columnGap: 22,
    flexDirection: 'row',
    marginBottom: 18,
  },
  infoBlock: {
    flex: 1,
  },
  sectionTitle: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.6,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  partyLine: {
    color: '#0f172a',
    fontSize: 10,
    marginBottom: 3,
  },
  serviceTitle: {
    color: '#334155',
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
  },
  table: {
    border: '1 solid #dbe4ee',
    marginBottom: 14,
  },
  tableHeader: {
    backgroundColor: '#eef2f6',
    flexDirection: 'row',
  },
  headerCell: {
    color: '#334155',
    fontSize: 9,
    fontWeight: 700,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  row: {
    borderTop: '1 solid #e2e8f0',
    flexDirection: 'row',
  },
  cell: {
    color: '#0f172a',
    fontSize: 9,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  descriptionCol: {
    flex: 2.6,
  },
  quantityCol: {
    flex: 0.8,
  },
  unitCol: {
    flex: 0.9,
  },
  priceCol: {
    flex: 1.1,
  },
  totalCol: {
    flex: 1.2,
  },
  alignRight: {
    textAlign: 'right',
  },
  summaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  amountCard: {
    minWidth: 230,
  },
  amountRow: {
    borderTop: '1 solid #e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  amountLabel: {
    color: '#334155',
    fontSize: 10,
  },
  amountValue: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: 700,
  },
  grandTotal: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: 700,
  },
  wordsWrap: {
    maxWidth: 260,
  },
  wordsTitle: {
    color: '#475569',
    fontSize: 9,
    marginBottom: 4,
  },
  wordsValue: {
    color: '#0f172a',
    fontSize: 10,
  },
  paymentBlock: {
    marginBottom: 18,
  },
  paymentRow: {
    columnGap: 14,
    flexDirection: 'row',
    marginBottom: 3,
  },
  paymentLabel: {
    color: '#0ea5e9',
    fontSize: 9,
    fontWeight: 700,
    width: 120,
  },
  paymentValue: {
    color: '#334155',
    flex: 1,
    fontSize: 9,
  },
  notesBlock: {
    marginBottom: 16,
  },
  legalNote: {
    color: '#64748b',
    fontSize: 8,
    marginBottom: 18,
  },
  footer: {
    alignItems: 'flex-end',
    borderTop: '1 solid #dbe4ee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
  },
  footerLeft: {
    color: '#64748b',
    fontSize: 8,
    maxWidth: 300,
  },
  footerRight: {
    color: '#64748b',
    fontSize: 8,
    textAlign: 'right',
  },
})

function formatQuantity(value: number) {
  return value.toFixed(2)
}

function joinDefined(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(', ')
}

function numberToWordsLv(value: number): string {
  const ones = [
    'nulle',
    'viens',
    'divi',
    'trīs',
    'četri',
    'pieci',
    'seši',
    'septiņi',
    'astoņi',
    'deviņi',
    'desmit',
    'vienpadsmit',
    'divpadsmit',
    'trīspadsmit',
    'četrpadsmit',
    'piecpadsmit',
    'sešpadsmit',
    'septiņpadsmit',
    'astoņpadsmit',
    'deviņpadsmit',
  ]
  const tens = ['', '', 'divdesmit', 'trīsdesmit', 'četrdesmit', 'piecdesmit', 'sešdesmit', 'septiņdesmit', 'astoņdesmit', 'deviņdesmit']
  const hundreds = ['', 'viens simts', 'divi simti', 'trīs simti', 'četri simti', 'pieci simti', 'seši simti', 'septiņi simti', 'astoņi simti', 'deviņi simti']

  if (value < 20) return ones[value]
  if (value < 100) {
    const ten = Math.floor(value / 10)
    const rest = value % 10
    return rest === 0 ? tens[ten] : `${tens[ten]} ${ones[rest]}`
  }
  if (value < 1000) {
    const hundred = Math.floor(value / 100)
    const rest = value % 100
    return rest === 0 ? hundreds[hundred] : `${hundreds[hundred]} ${numberToWordsLv(rest)}`
  }
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1000)
    const rest = value % 1000
    const thousandWord = thousands === 1 ? 'tūkstotis' : 'tūkstoši'
    const thousandPart = thousands === 1 ? thousandWord : `${numberToWordsLv(thousands)} ${thousandWord}`
    return rest === 0 ? thousandPart : `${thousandPart} ${numberToWordsLv(rest)}`
  }

  return String(value)
}

function amountToWordsLv(value: number) {
  const euros = Math.floor(value)
  const cents = Math.round((value - euros) * 100)
  const centsWord = cents === 1 ? 'cents' : 'centi'
  return `${numberToWordsLv(euros)} eiro un ${numberToWordsLv(cents)} ${centsWord}`
}

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  const clientAddress = joinDefined([data.client.address])
  const issuerAddress = joinDefined([data.profile.address])
  const issuerFooter = joinDefined([data.profile.regNumber, data.profile.email, data.profile.address])

  return (
    <Document title={data.invoiceNumber}>
      <Page size="A4" style={styles.page}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.title}>Rēķins</Text>
            {data.profile.regNumber ? <Text style={styles.muted}>Reģistrācijas numurs: {data.profile.regNumber}</Text> : null}
            {data.profile.email ? <Text style={styles.muted}>E-pasts: {data.profile.email}</Text> : null}
          </View>

          <View style={styles.metaTable}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rēķina numurs</Text>
              <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rēķina datums</Text>
              <Text style={styles.metaValue}>{formatDate(data.issueDate)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Maksājuma termiņš</Text>
              <Text style={styles.metaValue}>{formatDate(data.dueDate)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionTitle}>Klients</Text>
            <Text style={styles.partyLine}>{data.client.name || 'Klients nav izvēlēts'}</Text>
            {data.client.regNumber ? <Text style={styles.partyLine}>Reģistrācijas numurs: {data.client.regNumber}</Text> : null}
            {clientAddress ? <Text style={styles.partyLine}>Adrese: {clientAddress}</Text> : null}
            {data.client.email ? <Text style={styles.partyLine}>E-pasts: {data.client.email}</Text> : null}
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.sectionTitle}>Izrakstītājs</Text>
            <Text style={styles.partyLine}>{data.profile.name || 'Pašnodarbinātais'}</Text>
            {data.profile.regNumber ? <Text style={styles.partyLine}>Reģistrācijas numurs: {data.profile.regNumber}</Text> : null}
            {issuerAddress ? <Text style={styles.partyLine}>Adrese: {issuerAddress}</Text> : null}
            {data.profile.email ? <Text style={styles.partyLine}>E-pasts: {data.profile.email}</Text> : null}
            {data.profile.phone ? <Text style={styles.partyLine}>Telefons: {data.profile.phone}</Text> : null}
          </View>
        </View>

        <Text style={styles.serviceTitle}>Pakalpojumi</Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.descriptionCol]}>Nosaukums</Text>
            <Text style={[styles.headerCell, styles.quantityCol, styles.alignRight]}>Daudzums</Text>
            <Text style={[styles.headerCell, styles.unitCol]}>Mērvienība</Text>
            <Text style={[styles.headerCell, styles.priceCol, styles.alignRight]}>Cena</Text>
            <Text style={[styles.headerCell, styles.totalCol, styles.alignRight]}>Summa, euro</Text>
          </View>

          {data.items.map((item, index) => (
            <View key={`${item.description}-${index}`} style={styles.row}>
              <Text style={[styles.cell, styles.descriptionCol]}>{item.description}</Text>
              <Text style={[styles.cell, styles.quantityCol, styles.alignRight]}>{formatQuantity(item.quantity)}</Text>
              <Text style={[styles.cell, styles.unitCol]}>{item.unit}</Text>
              <Text style={[styles.cell, styles.priceCol, styles.alignRight]}>{formatCurrency(item.unitPrice)}</Text>
              <Text style={[styles.cell, styles.totalCol, styles.alignRight]}>{formatCurrency(item.total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.wordsWrap}>
            <Text style={styles.wordsTitle}>Summa vārdiem</Text>
            <Text style={styles.wordsValue}>{amountToWordsLv(data.total)}</Text>
          </View>

          <View style={styles.amountCard}>
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Starpsumma</Text>
              <Text style={styles.amountValue}>{formatCurrency(data.subtotal)}</Text>
            </View>
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>PVN ({data.vatRateLabel})</Text>
              <Text style={styles.amountValue}>{formatCurrency(data.vatAmount)}</Text>
            </View>
            <View style={styles.amountRow}>
              <Text style={styles.grandTotal}>Summa apmaksai, euro</Text>
              <Text style={styles.grandTotal}>{formatCurrency(data.total)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.paymentBlock}>
          <Text style={styles.sectionTitle}>Norēķinu rekvizīti</Text>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Piegādātājs</Text>
            <Text style={styles.paymentValue}>{data.profile.name || 'Pašnodarbinātais'}</Text>
          </View>
          {data.profile.regNumber ? (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Reģistrācijas numurs</Text>
              <Text style={styles.paymentValue}>{data.profile.regNumber}</Text>
            </View>
          ) : null}
          {issuerAddress ? (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Adrese</Text>
              <Text style={styles.paymentValue}>{issuerAddress}</Text>
            </View>
          ) : null}
          {data.profile.bankName ? (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Bankas nosaukums</Text>
              <Text style={styles.paymentValue}>{data.profile.bankName}</Text>
            </View>
          ) : null}
          {data.profile.bankIban ? (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Konta numurs</Text>
              <Text style={styles.paymentValue}>{data.profile.bankIban}</Text>
            </View>
          ) : null}
        </View>

        {data.notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionTitle}>Piezīmes</Text>
            <Text style={styles.wordsValue}>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.legalNote}>Dokuments ir sagatavots elektroniski un ir derīgs bez paraksta.</Text>

        <View style={styles.footer}>
          <Text style={styles.footerLeft}>{issuerFooter || 'Pašnodarbinātā rekvizīti aizpildāmi profilā.'}</Text>
          <Text style={styles.footerRight}>Rēķins sagatavots lietotnē{"\n"}Pašnodarbinātā uzskaite</Text>
        </View>
      </Page>
    </Document>
  )
}
