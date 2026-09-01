import type { Config } from '@netlify/functions'
import { getMarketData } from './_lib/market.mjs'
import { getResearch } from './_lib/research.mjs'
import { analyseTrades } from './_lib/scoring.mjs'
import { TICKERS, type Balances } from './_lib/types.mjs'

function parseBalances(value: unknown): Balances {
  if (!value || typeof value !== 'object') {
    throw new Error('Balances are required')
  }

  const body = value as Record<string, unknown>

  const parsed = Object.fromEntries(
    [...TICKERS, 'cash', 'brokerage'].map((key) => [
      key,
      Number(body[key]),
    ]),
  ) as Balances

  if (
    Object.values(parsed).some(
      (entry) => !Number.isFinite(entry) || entry < 0,
    )
  ) {
    throw new Error(
      'All balances must be non-negative numbers',
    )
  }

  return parsed
}

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 },
      )
    }

    const balances = parseBalances(await req.json())

    console.log('Starting ETF analysis')

    const [market, research] = await Promise.all([
      getMarketData(),
      getResearch(),
    ])

    console.log('Market and research data retrieved')

    const result = analyseTrades(
      balances,
      market,
      research,
    )

    console.log(
      `Recommendation generated: ${result.recommendation.ticker}`,
    )

    return Response.json(result)
  } catch (error) {
    console.error('ETF analysis failed:', error)

    const message =
      error instanceof Error
        ? error.message
        : 'Analysis failed'

    return Response.json(
      { error: message },
      { status: 500 },
    )
  }
}

export const config: Config = {
  path: '/api/analyse',
}
