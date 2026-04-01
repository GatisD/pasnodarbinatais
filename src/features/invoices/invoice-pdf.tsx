import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

import { formatCurrency, formatDate } from '@/lib/format'

export type InvoicePdfParty = {
  address?: string | null
  bankIban?: string | null
  email?: string | null
  name?: string | null
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
  dueDate: string
  invoiceNumber: string
  issueDate: string
  items: InvoicePdfItem[]
  notes?: string
  profile: InvoicePdfParty
  subtotal: number
  total: number
  client: InvoicePdfParty
  vatAmount: number
  vatRateLabel: string
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.45,
    padding: 36,
  },
  header: {
    alignItems: 'flex-start',
    borderBottom: '1 solid #dbe4f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingBottom: 18,
  },
  brandTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 6,
  },
  brandSubtitle: {
    color: '#475569',
    fontSize: 10,
    maxWidth: 220,
  },
  badge: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    color: '#166534',
    fontSize: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sectionGrid: {
    columnGap: 18,
    flexDirection: 'row',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    flex: 1,
    padding: 14,
  },
  cardLabel: {
    color: '#64748b',
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 4,
  },
  mutedText: {
    color: '#475569',
    fontSize: 10,
    marginBottom: 2,
  },
  invoiceMeta: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    color: '#ffffff',
    marginBottom: 20,
    padding: 16,
  },
  invoiceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  invoiceMetaLabel: {
    color: '#94a3b8',
    fontSize: 10,
  },
  invoiceMetaValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
  },
  table: {
    border: '1 solid #e2e8f0',
    borderRadius: 14,
    marginBottom: 18,
    overflow: 'hidden',
  },
  tableHeader: {
    backgroundColor: '#eff6ff',
    flexDirection: 'row',
  },
  tableHeaderCell: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: 700,
    padding: 10,
  },
  row: {
    borderTop: '1 solid #e2e8f0',
    flexDirection: 'row',
  },
  cell: {
    color: '#334155',
    fontSize: 10,
    padding: 10,
  },
  colDescription: {
    flex: 2.4,
  },
  colQty: {
    flex: 0.7,
  },
  colUnit: {
    flex: 0.7,
  },
  colPrice: {
    flex: 1,
  },
  colTotal: {
    flex: 1,
  },
  totalsWrap: {
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  totalsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    minWidth: 220,
    padding: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    color: '#475569',
    fontSize: 10,
  },
  totalValue: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 700,
  },
  grandTotal: {
    borderTop: '1 solid #dbe4f0',
    marginTop: 6,
    paddingTop: 8,
  },
  grandTotalText: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: 700,
  },
  notesCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
  },
  footer: {
    borderTop: '1 solid #dbe4f0',
    color: '#64748b',
    fontSize: 9,
    marginTop: 22,
    paddingTop: 12,
    textAlign: 'center',
  },
})

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  return (
    <Document title={data.invoiceNumber}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>Rēķins</Text>
            <Text style={styles.brandSubtitle}>
              Profesionāls rēķina melnraksts pašnodarbinātā darba vajadzībām.
            </Text>
          </View>
          <Text style={styles.badge}>Sagatavots nosūtīšanai</Text>
        </View>

        <View style={styles.invoiceMeta}>
          <View style={styles.invoiceMetaRow}>
            <Text style={styles.invoiceMetaLabel}>Rēķina numurs</Text>
            <Text style={styles.invoiceMetaValue}>{data.invoiceNumber}</Text>
          </View>
          <View style={styles.invoiceMetaRow}>
            <Text style={styles.invoiceMetaLabel}>Izrakstīšanas datums</Text>
            <Text style={styles.invoiceMetaValue}>{formatDate(data.issueDate)}</Text>
          </View>
          <View style={styles.invoiceMetaRow}>
            <Text style={styles.invoiceMetaLabel}>Apmaksas termiņš</Text>
            <Text style={styles.invoiceMetaValue}>{formatDate(data.dueDate)}</Text>
          </View>
        </View>

        <View style={styles.sectionGrid}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Izrakstītājs</Text>
            <Text style={styles.cardTitle}>{data.profile.name || 'Pašnodarbinātais'}</Text>
            {data.profile.regNumber ? <Text style={styles.mutedText}>{data.profile.regNumber}</Text> : null}
            {data.profile.address ? <Text style={styles.mutedText}>{data.profile.address}</Text> : null}
            {data.profile.email ? <Text style={styles.mutedText}>{data.profile.email}</Text> : null}
            {data.profile.bankIban ? <Text style={styles.mutedText}>{data.profile.bankIban}</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Klients</Text>
            <Text style={styles.cardTitle}>{data.client.name || 'Nav izvēlēts klients'}</Text>
            {data.client.regNumber ? <Text style={styles.mutedText}>{data.client.regNumber}</Text> : null}
            {data.client.address ? <Text style={styles.mutedText}>{data.client.address}</Text> : null}
            {data.client.email ? <Text style={styles.mutedText}>{data.client.email}</Text> : null}
            {data.client.bankIban ? <Text style={styles.mutedText}>{data.client.bankIban}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDescription]}>Apraksts</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Daudz.</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>Vien.</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Cena</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Kopā</Text>
          </View>

          {data.items.map((item, index) => (
            <View key={`${item.description}-${index}`} style={styles.row}>
              <Text style={[styles.cell, styles.colDescription]}>{item.description}</Text>
              <Text style={[styles.cell, styles.colQty]}>{item.quantity.toFixed(2)}</Text>
              <Text style={[styles.cell, styles.colUnit]}>{item.unit}</Text>
              <Text style={[styles.cell, styles.colPrice]}>{formatCurrency(item.unitPrice)}</Text>
              <Text style={[styles.cell, styles.colTotal]}>{formatCurrency(item.total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Starpsumma</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>PVN ({data.vatRateLabel})</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.vatAmount)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text style={styles.grandTotalText}>Kopā</Text>
              <Text style={styles.grandTotalText}>{formatCurrency(data.total)}</Text>
            </View>
          </View>
        </View>

        {data.notes ? (
          <View style={styles.notesCard}>
            <Text style={styles.cardLabel}>Piezīmes</Text>
            <Text style={styles.mutedText}>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Šis dokuments ir ģenerēts no lietotnes “Pašnodarbinātā uzskaite”.
        </Text>
      </Page>
    </Document>
  )
}
