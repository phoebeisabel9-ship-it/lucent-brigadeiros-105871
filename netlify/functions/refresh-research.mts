import type { Config } from '@netlify/functions'

import { getMarketData } from './_lib/market.mjs'
import { getResearch } from './_lib/research.mjs'
import { saveDailySnapshot } from './_lib/snapshot.mjs'

export default async () => {
  const startedAt = new Date().toISOString()

  console.log(
    `Starting daily ETF market + research refresh at ${startedAt}`,
  )

  try {
    /*
     * Market history and AI research are independent,
     * so run them in parallel.
     *
     * Because this is a Background Function, we do not
     * need to finish before the browser receives a response.
     */
    const [market, research] = await Promise.all([
      getMarketData(),
      getResearch(),
    ])

    /*
     * Never overwrite the saved snapshot unless BOTH
     * market data and research completed successfully.
     *
     * This ensures a failed refresh cannot replace good
     * yesterday data with zeros or "unavailable" values.
     */
    if (!Array.isArray(market) || market.length === 0) {
      throw new Error(
        'Market refresh returned no market data',
      )
    }

    if (!research || typeof research !== 'object') {
      throw new Error(
        'Research refresh returned no research data',
      )
    }

    const snapshot = {
      generatedAt: new Date().toISOString(),
      market,
      research,
    }

    await saveDailySnapshot(snapshot)

    console.log(
      `Daily ETF snapshot saved successfully at ${snapshot.generatedAt}`,
    )
  } catch (error) {
    /*
     * Deliberately DO NOT write anything to the cache
     * if this refresh fails.
     *
     * The previous successful snapshot remains available.
     */
    console.error(
      'Daily ETF refresh failed:',
      error,
    )

    throw error
  }
}

export const config: Config = {
  path: '/api/refresh-research',
  method: 'POST',
  background: true,
}
