export const TAX_YEAR = 2026
export const MIN_WAGE = 780
export const NON_TAXABLE_MIN_MONTHLY = 550
export const VSAOI_FULL_RATE = 0.3107
export const VSAOI_PENSION_RATE = 0.1
export const IIN_RATE = 0.255

export type MonthlyTaxEstimate = {
  profit: number
  vsaoi: number
  iin: number
  totalTaxes: number
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function calculateMonthlySelfEmployedTaxes(profit: number): MonthlyTaxEstimate {
  const normalizedProfit = roundMoney(Math.max(0, profit))
  if (normalizedProfit <= 0) {
    return { profit: 0, vsaoi: 0, iin: 0, totalTaxes: 0 }
  }

  const vsaoi =
    normalizedProfit < MIN_WAGE
      ? roundMoney(normalizedProfit * VSAOI_PENSION_RATE)
      : roundMoney(MIN_WAGE * VSAOI_FULL_RATE + Math.max(0, normalizedProfit - MIN_WAGE) * VSAOI_PENSION_RATE)

  const iinBase = Math.max(0, normalizedProfit - NON_TAXABLE_MIN_MONTHLY - vsaoi)
  const iin = roundMoney(iinBase * IIN_RATE)

  return {
    profit: normalizedProfit,
    vsaoi,
    iin,
    totalTaxes: roundMoney(vsaoi + iin),
  }
}
