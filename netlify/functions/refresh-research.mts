import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

import { getMarketData } from './_lib/market.mjs'
import { getResearch } from './_lib/research.mjs'
import { saveDailySnapshot } from './_lib/snapshot.mjs'

const STATUS_STORE = 'etf-buyer-cache'
const STATUS_KEY = 'daily-refresh-status-v1'

async function saveStatus(
  data: Record<string, unknown>,
) {
  const store = getStore({
    name: STATUS_STORE,
    consistency: 'strong',
  })

  await store.setJSON(
    STATUS_KEY,
    {
      ...data,
      updatedAt:
        new Date().toISOString(),
    },
  )
}

export default async () => {
  const startedAt =
    new Date().toISOString()

  await saveStatus({
    status: 'running',
    step: 'starting',
    startedAt,
    error: null,
  })

  console.log(
    `Starting daily ETF refresh at ${startedAt}`,
  )

  try {
    /*
     * STEP 1
     * Fetch daily market history.
     */
    await saveStatus({
      status: 'running',
      step: 'market-data',
      startedAt,
      error: null,
    })

    console.log(
      'Fetching daily market data',
    )

    const market =
      await getMarketData()

    if (
      !Array.isArray(market) ||
      market.length !== 5
    ) {
      throw new Error(
        `Market refresh returned ${
          Array.isArray(market)
            ? market.length
            : 0
        } ETFs instead of 5`,
      )
    }

    console.log(
      'Market data completed',
    )

    /*
     * STEP 2
     * Run the slower AI + web research.
     */
    await saveStatus({
      status: 'running',
      step: 'ai-research',
      startedAt,
      error: null,
    })

    console.log(
      'Starting AI/web research',
    )

    const research =
      await getResearch()

    if (
      !research ||
      typeof research !==
        'object' ||
      Object.keys(research).length !==
        5
    ) {
      throw new Error(
        'Research refresh did not return all 5 ETFs',
      )
    }

    console.log(
      'AI/web research completed',
    )

    /*
     * STEP 3
     * Save only a COMPLETE successful
     * snapshot.
     */
    await saveStatus({
      status: 'running',
      step: 'saving-snapshot',
      startedAt,
      error: null,
    })

    const snapshot = {
      generatedAt:
        new Date().toISOString(),
      market,
      research,
    }

    await saveDailySnapshot(
      snapshot,
    )

    console.log(
      `Daily ETF snapshot saved at ${snapshot.generatedAt}`,
    )

    await saveStatus({
      status: 'success',
      step: 'complete',
      startedAt,

      completedAt:
        new Date().toISOString(),

      snapshotGeneratedAt:
        snapshot.generatedAt,

      error: null,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error)

    console.error(
      'Daily ETF refresh failed:',
      error,
    )

    /*
     * Record the real failure so
     * /api/snapshot-status can show us
     * exactly what went wrong.
     */
    try {
      await saveStatus({
        status: 'failed',
        step: 'failed',
        startedAt,

        failedAt:
          new Date().toISOString(),

        error: message,
      })
    } catch (statusError) {
      console.error(
        'Could not save refresh failure status:',
        statusError,
      )
    }

    /*
     * Never overwrite the previous good
     * snapshot after a failed refresh.
     */
    throw error
  }
}

/*
 * IMPORTANT:
 *
 * No custom path here.
 *
 * This makes Netlify expose the
 * background function at its native
 * endpoint:
 *
 * /.netlify/functions/refresh-research
 */
export const config: Config = {
  background: true,
}
