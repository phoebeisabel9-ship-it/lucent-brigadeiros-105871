import type { Config } from '@netlify/functions'

import { getCurrentPrices } from './_lib/market.mjs'
import {
  getDailySnapshot,
  getSnapshotAgeHours,
  isSnapshotFresh,
} from './_lib/snapshot.mjs'
import { analyseTrades } from './_lib/scoring.mjs'
import {
  TICKERS,
  type Balances,
  type MarketDatum,
  type Ticker,
} from './_lib/types.mjs'

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
      (entry) =>
        !Number.isFinite(entry) ||
        entry < 0,
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
        {
          error: 'Method not allowed',
        },
        {
          status: 405,
        },
      )
    }

    const balances = parseBalances(
      await req.json(),
    )

    /*
     * Read the latest SUCCESSFUL daily
     * market + research snapshot.
     */
    const snapshot =
      await getDailySnapshot()

    if (!snapshot) {
      return Response.json(
        {
          error:
            'Today’s market research has not been prepared yet.',
          code:
            'SNAPSHOT_MISSING',
        },
        {
          status: 503,
        },
      )
    }

    const ageHours =
      getSnapshotAgeHours(snapshot)

    const fresh =
      isSnapshotFresh(
        snapshot,
        36,
      )

    /*
     * Fetch only current/latest ETF prices.
     * The slower analytical metrics come
     * from the cached daily snapshot.
     */
    const currentPrices =
      await getCurrentPrices()

    const market =
      (
        snapshot.market as MarketDatum[]
      ).map(
        (datum): MarketDatum => {
          const ticker =
            datum.ticker as Ticker

          const live =
            currentPrices[ticker]

          if (!live) {
            return datum
          }

          return {
            ...datum,
            price: live.price,
            asOf:
              live.asOf ||
              datum.asOf,
          }
        },
      )

    /*
     * Run deterministic scoring:
     *
     * 80% strategic
     * 20% tactical
     *
     * Tactical inputs are the last
     * successfully researched snapshot.
     */
    const result =
      analyseTrades(
        balances,
        market,
        snapshot.research,
      )

    return Response.json({
      ...result,

      dataStatus: {
        researchGeneratedAt:
          snapshot.generatedAt,

        researchAgeHours:
          Number(
            ageHours.toFixed(1),
          ),

        researchFresh:
          fresh,

        marketMetricsAvailable:
          true,

        researchAvailable:
          true,

        tacticalInputsAvailable:
          true,

        currentPricesAvailable:
          true,
      },
    })
  } catch (error) {
    console.error(
      'ETF analysis failed:',
      error,
    )

    const message =
      error instanceof Error
        ? error.message
        : 'Analysis failed'

    return Response.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    )
  }
}

export const config: Config = {
  path: '/api/analyse',
}
