import type { Config } from '@netlify/functions'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { trades } from '../../db/schema.js'
import { handleFunctionError, requireUser } from './_lib/auth.mjs'

export default async (req: Request) => {
  try {
    const user = await requireUser()
    if (req.method === 'GET') {
      const history = await db.select().from(trades).where(eq(trades.userId, user.id)).orderBy(desc(trades.createdAt)).limit(25)
      return Response.json(history)
    }
    if (req.method === 'POST') {
      const body = await req.json()
      const recommendation = body.recommendation
      if (!recommendation?.ticker || !Number.isInteger(recommendation.units)) throw new Error('Invalid trade payload')
      const [trade] = await db
        .insert(trades)
        .values({
          userId: user.id,
          ticker: recommendation.ticker,
          units: recommendation.units,
          unitPrice: String(recommendation.price),
          amountInvested: String(recommendation.amountInvested),
          brokerage: String(recommendation.brokerage),
          cashUsed: String(recommendation.cashUsed),
          cashRemaining: String(recommendation.cashRemaining),
          strategicScore: String(recommendation.strategicScore),
          tacticalScore: String(recommendation.tacticalScore),
          overallScore: String(recommendation.overallScore),
          snapshot: body,
        })
        .returning()
      return Response.json(trade, { status: 201 })
    }
    return new Response('Method not allowed', { status: 405 })
  } catch (error) {
    return handleFunctionError(error)
  }
}

export const config: Config = { path: '/api/trades' }
