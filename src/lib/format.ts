const euroFormatter = new Intl.NumberFormat('lv-LV', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('lv-LV', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatCurrency(value: number) {
  return euroFormatter.format(value)
}

export function formatDate(value: Date | string | number) {
  return dateFormatter.format(new Date(value))
}
