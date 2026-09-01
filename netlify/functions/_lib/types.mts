export const TICKERS = ['IVV', 'DHHF', 'VEU', 'VAS', 'VESG'] as const
export type Ticker = (typeof TICKERS)[number]

export const TARGETS: Record<Ticker, number> = {
  IVV: 0.35,
  DHHF: 0.3,
  VEU: 0.15,
  VAS: 0.1,
  VESG: 0.1,
}

export type Balances = Record<Ticker, number> & {
  cash: number
  brokerage: number
}

export type MarketDatum = {
  ticker: Ticker
  price: number
  weekReturn: number
  monthReturn: number
  quarterReturn: number
  high52Week: number
  drawdown52Week: number
  currency: string
  asOf: string
}

export type ResearchDatum = {
  valuationScore: number
  newsScore: number
  thesisDisqualified: boolean
  valuationContext: string
  developments: string
  newsSummary: string
  citations: Array<{ title: string; url: string }>
}
