import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

import { getMarketData } from './_lib/market.mjs'
import { getResearch } from './_lib/research.mjs'
import {
  getDailySnapshot,
  saveDailySnapshot,
} from './_lib/snapshot.mjs'
import { TICKERS, type Ticker } from './_lib/types.mjs'

const STORE_NAME = 'etf-buyer-cache'
const STATUS_KEY = 'daily-refresh-status-v1'

const RESEARCH_MAX_AGE_DAYS = 30
const RESEARCH_RETRY_DAYS = 7

function store() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
  })
}

function sydneyDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)

  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function isSydneyToday(timestamp?: string) {
  if (!timestamp) return false
  return sydneyDateKey(timestamp) === sydneyDateKey(new Date())
}

function researchComplete(research: any) {
  return TICKERS.every((ticker) =>
    Boolean(research?.[ticker as Ticker]),
  )
}

function ageDays(timestamp?: string | null) {
  if (!timestamp) return Number.POSITIVE_INFINITY

  const ms = Date.now() - new Date(timestamp).getTime()

  if (!Number.isFinite(ms)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.max(0, ms / (1000 * 60 * 60 * 24))
}

async function setStatus(status: Record<string, any>) {
  await store().setJSON(STATUS_KEY, {
    ...status,
    updatedAt: new Date().toISOString(),
  })
}

export default async () => {
  const startedAt = new Date().toISOString()

  const existingStatus = await store().get(STATUS_KEY, {
    type: 'json',
    consistency: 'strong',
  })

  if (
    existingStatus?.status === 'running' &&
    ageDays(existingStatus.startedAt) < 20 / (24 * 60)
  ) {
    console.log('Refresh already running; skipping duplicate trigger.')
    return
  }

  const existing = await getDailySnapshot()

  const existingMarketTime =
    existing?.marketGeneratedAt ?? existing?.generatedAt

  if (existing && isSydneyToday(existingMarketTime)) {
    console.log(
      'Today’s market snapshot already exists; skipping duplicate refresh.',
    )
    return
  }

  await setStatus({
    status: 'running',
    step: 'market-data',
    startedAt,
    completedAt: null,
    error: null,
  })

  try {
    const market = await getMarketData()
    const marketGeneratedAt = new Date().toISOString()

    let research = existing?.research ?? {}

    let researchGeneratedAt =
      existing?.researchGeneratedAt ??
      (researchComplete(research) ? existing?.generatedAt : null)

    let researchAttemptedAt =
      existing?.researchAttemptedAt ?? null

    let researchRefreshed = false
    let researchRefreshError: string | null = null

    const researchAgeDays = ageDays(researchGeneratedAt)

    const researchIsDue =
      !researchComplete(research) ||
      researchAgeDays >= RESEARCH_MAX_AGE_DAYS

    const retryAllowed =
      !researchAttemptedAt ||
      ageDays(researchAttemptedAt) >= RESEARCH_RETRY_DAYS

    if (researchIsDue && retryAllowed) {
      researchAttemptedAt = new Date().toISOString()

      await setStatus({
        status: 'running',
        step: 'research-context',
        startedAt,
        completedAt: null,
        error: null,
      })

      try {
        research = await getResearch()
        researchGeneratedAt = new Date().toISOString()
        researchRefreshed = true
      } catch (error) {
        researchRefreshError =
          error instanceof Error
            ? error.message
            : 'Research context refresh failed'

        console.error(
          'Research context refresh failed; continuing with market-only snapshot:',
          error,
        )
      }
    }

    await setStatus({
      status: 'running',
      step: 'saving-snapshot',
      startedAt,
      completedAt: null,
      error: null,
    })

    const snapshot = {
      generatedAt: marketGeneratedAt,
      marketGeneratedAt,
      researchGeneratedAt,
      researchAttemptedAt,
      researchRefreshed,
      researchRefreshError,
      market,
      research,
    }

    await saveDailySnapshot(snapshot)

    const completedAt = new Date().toISOString()

    await setStatus({
      status: 'success',
      step: 'complete',
      startedAt,
      completedAt,
      snapshotGeneratedAt: marketGeneratedAt,
      marketGeneratedAt,
      researchGeneratedAt,
      researchRefreshed,
      researchRefreshError,
      error: null,
    })

    console.log(
      `Daily market snapshot saved. AI research refreshed: ${
        researchRefreshed ? 'yes' : 'no'
      }.`,
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Daily market refresh failed'

    console.error('Daily market refresh failed:', error)

    await setStatus({
      status: 'failed',
      step: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      error: message,
    })

    throw error
  }
}

export const config: Config = {
  background: true,
}
