import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

import {
  getDailySnapshot,
  getSnapshotAgeHours,
  getTimestampAgeHours,
} from './_lib/snapshot.mjs'
import { TICKERS } from './_lib/types.mjs'

const STORE_NAME = 'etf-buyer-cache'
const STATUS_KEY = 'daily-refresh-status-v1'

function store() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
  })
}

export default async () => {
  try {
    const [snapshot, refreshStatus] = await Promise.all([
      getDailySnapshot(),
      store().get(STATUS_KEY, {
        type: 'json',
        consistency: 'strong',
      }),
    ])

    if (!snapshot) {
      return Response.json({
        available: false,
        marketComplete: false,
        researchComplete: false,
        refreshStatus,
      })
    }

    const marketTickers = Array.isArray(snapshot.market)
      ? snapshot.market.map((item: any) => item.ticker)
      : []

    const researchTickers =
      snapshot.research && typeof snapshot.research === 'object'
        ? Object.keys(snapshot.research)
        : []

    const marketComplete = TICKERS.every((ticker) =>
      marketTickers.includes(ticker),
    )

    const researchComplete = TICKERS.every((ticker) =>
      researchTickers.includes(ticker),
    )

    const marketGeneratedAt =
      snapshot.marketGeneratedAt ?? snapshot.generatedAt

    const researchGeneratedAt =
      snapshot.researchGeneratedAt ??
      (researchComplete ? snapshot.generatedAt : null)

    const researchAgeHours =
      getTimestampAgeHours(researchGeneratedAt)

    return Response.json({
      available: true,
      generatedAt: marketGeneratedAt,
      marketGeneratedAt,
      researchGeneratedAt,
      ageHours: Number(getSnapshotAgeHours(snapshot).toFixed(1)),
      researchAgeDays: Number.isFinite(researchAgeHours)
        ? Number((researchAgeHours / 24).toFixed(1))
        : null,
      marketTickers,
      researchTickers,
      marketComplete,
      researchComplete,
      researchRefreshError: snapshot.researchRefreshError ?? null,
      refreshStatus,
    })
  } catch (error) {
    console.error('Snapshot status failed:', error)

    return Response.json(
      {
        available: false,
        error:
          error instanceof Error
            ? error.message
            : 'Snapshot status failed',
      },
      {
        status: 500,
      },
    )
  }
}

export const config: Config = {
  path: '/api/snapshot-status',
}
