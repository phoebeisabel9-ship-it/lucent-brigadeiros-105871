import type { Config } from '@netlify/functions'
import { requireUser, handleFunctionError } from './_lib/auth.mjs'
import { getMarketData } from './_lib/market.mjs'
import { getResearch } from './_lib/research.mjs'
import { analyseTrades } from './_lib/scoring.mjs'
import { TICKERS, type Balances } from './_lib/types.mjs'

function parseBalances(value: unknown): Balances {
  if (!value || typeof value !== 'object') throw new Error('Balances are required')
  const body = value as Record<string, unknown>
  const parsed = Object.fromEntries([...TICKERS, 'cash', 'brokerage'].map((key) => [key, Number(body[key])])) as Balances
  if (Object.values(parsed).some((entry) => !Number.isFinite(entry) || entry < 0)) throw new Error('All balances must be non-negative numbers')
  return parsed
}

export default async (req: Request) => {
  try {
    await requireUser()
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const balances = parseBalances(await req.json())
    const [market, research] = await Promise.all([getMarketData(), getResearch()])
    return Response.json(analyseTrades(balances, market, research))
  } catch (error) {
    return handleFunctionError(error)
  }
}

export const config: Config = { path: '/api/analyse' }
