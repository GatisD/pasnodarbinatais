export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function parseNumber(value: string) {
  const normalized = value.replace(',', '.').trim()
  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : 0
}
