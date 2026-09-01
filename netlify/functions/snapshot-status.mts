import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

import {
  getDailySnapshot,
  getSnapshotAgeHours,
} from './_lib/snapshot.mjs'

const STORE_NAME = 'etf-buyer-cache'
const STATUS_KEY = 'daily-refresh-status-v1'

async function getRefreshStatus() {
  const store = getStore({
    name: STORE_NAME,
    consistency: 'strong',
  })

  return store.get(STATUS_KEY, {
    type: 'json',
    consistency: 'strong',
  })
}

export default async () => {
  try {
    const [
      snapshot,
      refreshStatus,
    ] = await Promise.all([
      getDailySnapshot(),
      getRefreshStatus(),
    ])

    if (!snapshot) {
      return Response.json({
        available: false,

        message:
          'No successful daily snapshot has been saved yet.',

        refreshStatus:
          refreshStatus ?? {
            status:
              'not-started',
          },
      })
    }

    const ageHours =
      getSnapshotAgeHours(
        snapshot,
      )

    return Response.json({
      available: true,

      generatedAt:
        snapshot.generatedAt,

      ageHours:
        Number(
          ageHours.toFixed(1),
        ),

      marketTickers:
        Array.isArray(
          snapshot.market,
        )
          ? snapshot.market.map(
              (item: {
                ticker?: string
              }) =>
                item.ticker,
            )
          : [],

      researchTickers:
        snapshot.research
          ? Object.keys(
              snapshot.research,
            )
          : [],

      marketComplete:
        Array.isArray(
          snapshot.market,
        ) &&
        snapshot.market.length ===
          5,

      researchComplete:
        snapshot.research &&
        Object.keys(
          snapshot.research,
        ).length === 5,

      refreshStatus:
        refreshStatus ?? null,
    })
  } catch (error) {
    console.error(
      'Snapshot status failed:',
      error,
    )

    return Response.json(
      {
        available: false,

        error:
          error instanceof Error
            ? error.message
            : 'Could not read snapshot',
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
