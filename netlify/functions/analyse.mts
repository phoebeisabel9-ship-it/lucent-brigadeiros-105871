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
        ) || entry < 0,
    )
  ) {
    throw new Error(
      'All balances must be non-negative numbers',
    )
  }

  return parsed
}

/*
 * Ask the long-running background
 * function to prepare a new snapshot.
 *
 * The endpoint responds immediately
 * while the research continues in
 * the background.
 */
async function triggerRefresh(
  req: Request,
) {
  try {
    const refreshUrl =
      new URL(
        '/api/refresh-research',
        req.url,
      )

    const response =
      await fetch(
        refreshUrl,
        {
          method: 'POST',

          signal:
            AbortSignal.timeout(
              5_000,
            ),
        },
      )

    console.log(
      `Research refresh trigger returned ${response.status}`,
    )
  } catch (error) {
    /*
     * A refresh-trigger failure must not
     * break analysis if an older valid
     * snapshot already exists.
     */
    console.warn(
      'Could not trigger background refresh:',
      error,
    )
  }
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
     * Load the LAST SUCCESSFUL daily
     * market + research snapshot.
     */
    const snapshot =
      await getDailySnapshot()

    /*
     * If the app has never successfully
     * produced a snapshot, start one now.
     *
     * Importantly, we do NOT substitute
     * fake neutral research.
     */
    if (!snapshot) {
      await triggerRefresh(req)

      return Response.json(
        {
          error:
            'Your first market research snapshot is being prepared. Please wait a few minutes and press Analyse again.',
          code:
            'SNAPSHOT_PREPARING',
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
     * If the saved research is older than
     * 36 hours, keep using it rather than
     * replacing it with zeroes.
     *
     * At the same time, request a fresh
     * background snapshot.
     */
    if (!fresh) {
      void triggerRefresh(
        req,
      )
    }

    /*
     * Only the current ETF prices are
     * fetched on every Analyse click.
     *
     * These are required for the exact
     * whole-unit trade calculation.
     */
    const currentPrices =
      await getCurrentPrices()

    /*
     * Keep the daily 1W / 1M / 3M /
     * 52-week metrics from the snapshot,
     * but replace its price with the most
     * current price available.
     */
    const market =
      (
        snapshot.market as MarketDatum[]
      ).map(
        (
          datum,
        ): MarketDatum => {
          const ticker =
            datum.ticker as Ticker

          const live =
            currentPrices[
              ticker
            ]

          if (!live) {
            return datum
          }

          return {
            ...datum,

            price:
              live.price,

            asOf:
              live.asOf ||
              datum.asOf,
          }
        },
      )

    /*
     * Run the deterministic portfolio
     * scoring model.
     *
     * Strategic score = 80%
     * Tactical score = 20%
     *
     * Tactical inputs now come from the
     * last REAL successful research
     * snapshot, not fake neutral values.
     */
    const result =
      analyseTrades(
        balances,
        market,
        snapshot.research,
      )

    return Response.json({
      ...result,

      /*
       * Extra metadata for the frontend.
       * Existing UI can safely ignore this
       * until we update it in a later file.
       */
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

        researchSource:
          fresh
            ? 'daily-cache'
            : 'stale-cache',

        livePrices: true,

        tacticalInputsAvailable:
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
