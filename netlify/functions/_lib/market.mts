import { TICKERS, type MarketDatum, type Ticker } from './types.mjs'

type EodRow = {
  date: string
  close?: number
  adjusted_close?: number
}

type RealTimeQuote = {
  close?: number
  timestamp?: number
}

const API_ROOT = 'https://eodhd.com/api'

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function closestPrice(rows: EodRow[], target: Date) {
  const targetTime = target.getTime()
  let closest = rows[0]
  for (const row of rows) {
    if (
      Math.abs(new Date(row.date).getTime() - targetTime) <
      Math.abs(new Date(closest.date).getTime() - targetTime)
    ) {
      closest = row
    }
  }
  return Number(closest.adjusted_close ?? closest.close)
}

function pctReturn(latest: number, earlier: number) {
  return earlier > 0 ? ((latest - earlier) / earlier) * 100 : 0
}

async function fetchTicker(ticker: Ticker, token: string): Promise<MarketDatum> {
  const now = new Date()
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - 380)
  const symbol = `${ticker}.AU`
  const url = new URL(`${API_ROOT}/eod/${symbol}`)
  url.searchParams.set('api_token', token)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('period', 'd')
  url.searchParams.set('from', dateOnly(start))
  url.searchParams.set('to', dateOnly(now))

  const quoteUrl = new URL(`${API_ROOT}/real-time/${symbol}`)
  quoteUrl.searchParams.set('api_token', token)
  quoteUrl.searchParams.set('fmt', 'json')
  const [historyResponse, quoteResponse] = await Promise.all([
    fetch(url, { headers: { Accept: 'application/json' } }),
    fetch(quoteUrl, { headers: { Accept: 'application/json' } }),
  ])
  if (!historyResponse.ok || !quoteResponse.ok) throw new Error(`Market data unavailable for ${ticker}`)
  const rows = (await historyResponse.json()) as EodRow[]
  const quote = (await quoteResponse.json()) as RealTimeQuote
  if (!Array.isArray(rows) || rows.length < 5) throw new Error(`Insufficient market history for ${ticker}`)

  const latestRow = rows.at(-1)!
  const latest = Number(quote.close || latestRow.adjusted_close || latestRow.close)
  const target = (days: number) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - days)
    return closestPrice(rows, date)
  }
  const high52Week = Math.max(...rows.map((row) => Number(row.adjusted_close ?? row.close)).filter(Number.isFinite))

  return {
    ticker,
    price: latest,
    weekReturn: pctReturn(latest, target(7)),
    monthReturn: pctReturn(latest, target(30)),
    quarterReturn: pctReturn(latest, target(90)),
    high52Week,
    drawdown52Week: high52Week > 0 ? ((high52Week - latest) / high52Week) * 100 : 0,
    currency: 'AUD',
    asOf: quote.timestamp ? new Date(quote.timestamp * 1000).toISOString() : latestRow.date,
  }
}

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp: number[]
      meta: { currency?: string; regularMarketPrice?: number }
      indicators: {
        quote: Array<{ close: Array<number | null> }>
        adjclose?: Array<{ adjclose: Array<number | null> }>
      }
    }>
    error?: { description?: string }
  }
}

async function fetchYahooTicker(ticker: Ticker): Promise<MarketDatum> {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.AX?range=1y&interval=1d&events=history`, {
    headers: { Accept: 'application/json', 'User-Agent': 'ETF-Buyer/1.0' },
  })
  if (!response.ok) throw new Error(`Market data unavailable for ${ticker}`)
  const payload = (await response.json()) as YahooChart
  const result = payload.chart?.result?.[0]
  if (!result) throw new Error(payload.chart?.error?.description || `Market data unavailable for ${ticker}`)
  const sourcePrices = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0]?.close
  const rows = result.timestamp
    .map((timestamp, index) => ({ date: dateOnly(new Date(timestamp * 1000)), adjusted_close: sourcePrices?.[index] ?? undefined }))
    .filter((row): row is EodRow & { adjusted_close: number } => Number.isFinite(row.adjusted_close))
  if (rows.length < 5) throw new Error(`Insufficient market history for ${ticker}`)
  const latestRow = rows.at(-1)!
  const latest = Number(result.meta.regularMarketPrice || latestRow.adjusted_close)
  const now = new Date()
  const target = (days: number) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - days)
    return closestPrice(rows, date)
  }
  const high52Week = Math.max(...rows.map((row) => row.adjusted_close))
  return {
    ticker,
    price: latest,
    weekReturn: pctReturn(latest, target(7)),
    monthReturn: pctReturn(latest, target(30)),
    quarterReturn: pctReturn(latest, target(90)),
    high52Week,
    drawdown52Week: high52Week > 0 ? ((high52Week - latest) / high52Week) * 100 : 0,
    currency: result.meta.currency || 'AUD',
    asOf: latestRow.date,
  }
}

export async function getMarketData() {
  const token = process.env.EODHD_API_TOKEN
  return Promise.all(TICKERS.map((ticker) => (token ? fetchTicker(ticker, token) : fetchYahooTicker(ticker))))
}
