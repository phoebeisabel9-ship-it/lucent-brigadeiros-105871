import { getStore } from '@netlify/blobs'

const STORE_NAME = 'etf-buyer-cache'
const SNAPSHOT_KEY = 'daily-market-research-v1'

function store() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
  })
}

export async function getDailySnapshot() {
  return store().get(SNAPSHOT_KEY, {
    type: 'json',
    consistency: 'strong',
  })
}

export async function saveDailySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Cannot save an empty daily snapshot')
  }

  if (!snapshot.generatedAt) {
    throw new Error('Daily snapshot must include generatedAt')
  }

  if (!Array.isArray(snapshot.market) || snapshot.market.length === 0) {
    throw new Error('Daily snapshot must include market data')
  }

  if (!snapshot.research || typeof snapshot.research !== 'object') {
    throw new Error('Daily snapshot must include research data')
  }

  await store().setJSON(SNAPSHOT_KEY, snapshot)

  return snapshot
}

export function getSnapshotAgeHours(snapshot) {
  if (!snapshot?.generatedAt) {
    return Number.POSITIVE_INFINITY
  }

  const generated = new Date(snapshot.generatedAt).getTime()

  if (!Number.isFinite(generated)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.max(
    0,
    (Date.now() - generated) / (1000 * 60 * 60),
  )
}

export function isSnapshotFresh(
  snapshot,
  maxAgeHours = 36,
) {
  return getSnapshotAgeHours(snapshot) <= maxAgeHours
}
