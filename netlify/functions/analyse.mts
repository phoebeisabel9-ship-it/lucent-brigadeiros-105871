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

type MarketWithSnapshot = MarketDatum & {
  snapshotPrice: number
  snapshotAsOf: string
}

function parseBalances(
  value: unknown,
): Balances {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    throw new Error(
      'Balances are required',
    )
  }

  const body =
    value as Record<
      string,
      unknown
    >

  const parsed =
    Object.fromEntries(
      [
        ...TICKERS,
        'cash',
        'brokerage',
      ].map((key) => [
        key,
        Number(body[key]),
      ]),
    ) as Balances

  if (
    Object.values(
      parsed,
    ).some(
      (entry) =>
        !Number.isFinite(
          entry,
        ) ||
        entry < 0,
    )
  ) {
    throw new Error(
      'All balances must be non-negative numbers',
    )
  }

  return parsed
}

export default async (
  req: Request,
) => {
  try {
    if (
      req.method !== 'POST'
    ) {
      return Response.json(
        {
          error:
            'Method not allowed',
        },
        {
          status: 405,
        },
      )
    }

    const balances =
      parseBalances(
        await req.json(),
      )

    /*
     * Read the latest successful daily
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
      getSnapshotAgeHours(
        snapshot,
      )

    const fresh =
      isSnapshotFresh(
        snapshot,
        36,
      )

    /*
     * Fetch the current/latest ETF prices.
     *
     * IMPORTANT:
     * Keep the daily snapshot price as snapshotPrice.
     * The scoring engine uses both prices to recalculate
     * 1W / 1M / 3M returns and the 52W drawdown.
     */
    const currentPrices =
      await getCurrentPrices()

    const market =
      (
        snapshot.market as MarketDatum[]
      ).map(
        (
          datum,
        ): MarketWithSnapshot => {
          const ticker =
            datum.ticker as Ticker

          const live =
            currentPrices[
              ticker
            ]

          return {
            ...datum,

            snapshotPrice:
              datum.price,

            snapshotAsOf:
              datum.asOf,

            price:
              live?.price ??
              datum.price,

            asOf:
              live?.asOf ??
              datum.asOf,
          }
        },
      )

    /*
     * Run the scoring model:
     *
     * 60% strategic
     * 40% tactical
     *
     * Tactical price signals are adjusted
     * using the current/latest price.
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
            ageHours.toFixed(
              1,
            ),
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

        currentPriceFeedsTacticalScore:
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
        error:
          message,
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
