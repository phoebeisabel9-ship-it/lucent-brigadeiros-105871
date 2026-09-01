import {
  TICKERS,
  type MarketDatum,
  type Ticker,
} from './types.mjs'

type EodRow = {
  date: string
  close?: number
  adjusted_close?: number
}

type RealTimeQuote = {
  close?: number
  timestamp?: number
}

type LivePrice = {
  ticker: Ticker
  price: number
  asOf: string
}

const API_ROOT = 'https://eodhd.com/api'
const FETCH_TIMEOUT_MS = 8_000

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function fetchOptions() {
  return {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ETF-Buyer/1.0',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }
}

function closestPrice(
  rows: EodRow[],
  target: Date,
) {
  const targetTime = target.getTime()
  let closest = rows[0]

  for (const row of rows) {
    if (
      Math.abs(
        new Date(row.date).getTime() -
          targetTime,
      ) <
      Math.abs(
        new Date(closest.date).getTime() -
          targetTime,
      )
    ) {
      closest = row
    }
  }

  return Number(
    closest.adjusted_close ??
      closest.close,
  )
}

function pctReturn(
  latest: number,
  earlier: number,
) {
  return earlier > 0
    ? ((latest - earlier) / earlier) * 100
    : 0
}

/*
 * -----------------------------------------
 * EODHD
 * -----------------------------------------
 */

async function fetchEodQuote(
  ticker: Ticker,
  token: string,
): Promise<LivePrice> {
  const symbol = `${ticker}.AU`

  const url = new URL(
    `${API_ROOT}/real-time/${symbol}`,
  )

  url.searchParams.set(
    'api_token',
    token,
  )

  url.searchParams.set(
    'fmt',
    'json',
  )

  const response = await fetch(
    url,
    fetchOptions(),
  )

  if (!response.ok) {
    throw new Error(
      `EODHD quote unavailable for ${ticker}`,
    )
  }

  const quote =
    (await response.json()) as RealTimeQuote

  const price = Number(quote.close)

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error(
      `Invalid EODHD quote for ${ticker}`,
    )
  }

  return {
    ticker,
    price,
    asOf: quote.timestamp
      ? new Date(
          quote.timestamp * 1000,
        ).toISOString()
      : new Date().toISOString(),
  }
}

async function fetchEodTicker(
  ticker: Ticker,
  token: string,
): Promise<MarketDatum> {
  const now = new Date()

  const start = new Date(now)
  start.setUTCDate(
    start.getUTCDate() - 380,
  )

  const symbol = `${ticker}.AU`

  const url = new URL(
    `${API_ROOT}/eod/${symbol}`,
  )

  url.searchParams.set(
    'api_token',
    token,
  )

  url.searchParams.set(
    'fmt',
    'json',
  )

  url.searchParams.set(
    'period',
    'd',
  )

  url.searchParams.set(
    'from',
    dateOnly(start),
  )

  url.searchParams.set(
    'to',
    dateOnly(now),
  )

  const [
    historyResponse,
    quote,
  ] = await Promise.all([
    fetch(
      url,
      fetchOptions(),
    ),
    fetchEodQuote(
      ticker,
      token,
    ),
  ])

  if (!historyResponse.ok) {
    throw new Error(
      `EODHD market history unavailable for ${ticker}`,
    )
  }

  const rows =
    (await historyResponse.json()) as EodRow[]

  if (
    !Array.isArray(rows) ||
    rows.length < 5
  ) {
    throw new Error(
      `Insufficient EODHD market history for ${ticker}`,
    )
  }

  const latestRow = rows.at(-1)!

  const latest =
    quote.price ||
    Number(
      latestRow.adjusted_close ??
        latestRow.close,
    )

  const target = (days: number) => {
    const date = new Date(now)

    date.setUTCDate(
      date.getUTCDate() - days,
    )

    return closestPrice(
      rows,
      date,
    )
  }

  const validPrices = rows
    .map((row) =>
      Number(
        row.adjusted_close ??
          row.close,
      ),
    )
    .filter(Number.isFinite)

  const high52Week = Math.max(
    ...validPrices,
  )

  return {
    ticker,
    price: latest,

    weekReturn: pctReturn(
      latest,
      target(7),
    ),

    monthReturn: pctReturn(
      latest,
      target(30),
    ),

    quarterReturn: pctReturn(
      latest,
      target(90),
    ),

    high52Week,

    drawdown52Week:
      high52Week > 0
        ? ((high52Week - latest) /
            high52Week) *
          100
        : 0,

    currency: 'AUD',

    asOf: quote.asOf,
  }
}

/*
 * -----------------------------------------
 * Yahoo Finance fallback
 * -----------------------------------------
 */

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp: number[]

      meta: {
        currency?: string
        regularMarketPrice?: number
      }

      indicators: {
        quote: Array<{
          close: Array<
            number | null
          >
        }>

        adjclose?: Array<{
          adjclose: Array<
            number | null
          >
        }>
      }
    }>

    error?: {
      description?: string
    }
  }
}

async function fetchYahooChart(
  ticker: Ticker,
  range = '1y',
) {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.AX?range=${range}&interval=1d&events=history`,
    fetchOptions(),
  )

  if (!response.ok) {
    throw new Error(
      `Yahoo market data unavailable for ${ticker}`,
    )
  }

  const payload =
    (await response.json()) as YahooChart

  const result =
    payload.chart?.result?.[0]

  if (!result) {
    throw new Error(
      payload.chart?.error
        ?.description ||
        `Yahoo market data unavailable for ${ticker}`,
    )
  }

  return result
}

async function fetchYahooQuote(
  ticker: Ticker,
): Promise<LivePrice> {
  const result =
    await fetchYahooChart(
      ticker,
      '5d',
    )

  const sourcePrices =
    result.indicators.adjclose?.[0]
      ?.adjclose ??
    result.indicators.quote[0]
      ?.close

  const validPrices =
    sourcePrices
      ?.filter(
        (
          price,
        ): price is number =>
          Number.isFinite(price),
      ) ?? []

  const fallbackPrice =
    validPrices.at(-1)

  const price = Number(
    result.meta.regularMarketPrice ??
      fallbackPrice,
  )

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error(
      `Invalid Yahoo quote for ${ticker}`,
    )
  }

  const timestamp =
    result.timestamp.at(-1)

  return {
    ticker,
    price,

    asOf: timestamp
      ? new Date(
          timestamp * 1000,
        ).toISOString()
      : new Date().toISOString(),
  }
}

async function fetchYahooTicker(
  ticker: Ticker,
): Promise<MarketDatum> {
  const result =
    await fetchYahooChart(
      ticker,
      '1y',
    )

  const sourcePrices =
    result.indicators.adjclose?.[0]
      ?.adjclose ??
    result.indicators.quote[0]
      ?.close

  const rows =
    result.timestamp
      .map(
        (
          timestamp,
          index,
        ) => ({
          date: dateOnly(
            new Date(
              timestamp * 1000,
            ),
          ),

          adjusted_close:
            sourcePrices?.[
              index
            ] ?? undefined,
        }),
      )
      .filter(
        (
          row,
        ): row is EodRow & {
          adjusted_close: number
        } =>
          Number.isFinite(
            row.adjusted_close,
          ),
      )

  if (rows.length < 5) {
    throw new Error(
      `Insufficient Yahoo history for ${ticker}`,
    )
  }

  const latestRow =
    rows.at(-1)!

  const latest = Number(
    result.meta.regularMarketPrice ||
      latestRow.adjusted_close,
  )

  const now = new Date()

  const target = (
    days: number,
  ) => {
    const date = new Date(now)

    date.setUTCDate(
      date.getUTCDate() -
        days,
    )

    return closestPrice(
      rows,
      date,
    )
  }

  const high52Week =
    Math.max(
      ...rows.map(
        (row) =>
          row.adjusted_close,
      ),
    )

  return {
    ticker,
    price: latest,

    weekReturn: pctReturn(
      latest,
      target(7),
    ),

    monthReturn: pctReturn(
      latest,
      target(30),
    ),

    quarterReturn: pctReturn(
      latest,
      target(90),
    ),

    high52Week,

    drawdown52Week:
      high52Week > 0
        ? ((high52Week -
            latest) /
            high52Week) *
          100
        : 0,

    currency:
      result.meta.currency ||
      'AUD',

    asOf:
      latestRow.date,
  }
}

/*
 * -----------------------------------------
 * Public functions
 * -----------------------------------------
 */

/*
 * DAILY REFRESH
 *
 * Downloads enough history to calculate:
 *
 * - 1W return
 * - 1M return
 * - 3M return
 * - 52W high
 * - 52W drawdown
 *
 * This should normally run only during
 * the daily background refresh.
 */
export async function getMarketData(): Promise<
  MarketDatum[]
> {
  const token =
    process.env.EODHD_API_TOKEN

  return Promise.all(
    TICKERS.map(
      async (ticker) => {
        /*
         * If EODHD is configured,
         * try it first.
         *
         * Yahoo remains a fallback so
         * a temporary EODHD problem
         * does not kill the snapshot.
         */
        if (token) {
          try {
            return await fetchEodTicker(
              ticker,
              token,
            )
          } catch (error) {
            console.warn(
              `EODHD failed for ${ticker}; falling back to Yahoo`,
              error,
            )
          }
        }

        return fetchYahooTicker(
          ticker,
        )
      },
    ),
  )
}

/*
 * EVERY ANALYSE CLICK
 *
 * Only retrieves the current/latest
 * price required for the whole-unit
 * trade calculation.
 *
 * It deliberately does NOT download
 * a year of market history.
 */
export async function getCurrentPrices(): Promise<
  Record<
    Ticker,
    {
      price: number
      asOf: string
    }
  >
> {
  const token =
    process.env.EODHD_API_TOKEN

  const prices =
    await Promise.all(
      TICKERS.map(
        async (ticker) => {
          if (token) {
            try {
              return await fetchEodQuote(
                ticker,
                token,
              )
            } catch (error) {
              console.warn(
                `EODHD live quote failed for ${ticker}; falling back to Yahoo`,
                error,
              )
            }
          }

          return fetchYahooQuote(
            ticker,
          )
        },
      ),
    )

  return Object.fromEntries(
    prices.map(
      ({
        ticker,
        price,
        asOf,
      }) => [
        ticker,
        {
          price,
          asOf,
        },
      ],
    ),
  ) as Record<
    Ticker,
    {
      price: number
      asOf: string
    }
  >
}
