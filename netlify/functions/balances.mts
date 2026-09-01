import { getStore } from '@netlify/blobs'
import type { Config } from '@netlify/functions'
import { handleFunctionError, requireUser } from './_lib/auth.mjs'

export default async (req: Request) => {
  try {
    const user = await requireUser()
    const store = getStore({ name: 'etf-buyer-balances', consistency: 'strong' })
    const key = `user-${user.id}`

    if (req.method === 'GET') {
      return Response.json((await store.get(key, { type: 'json' })) ?? null)
    }
    if (req.method === 'PUT') {
      const balances = await req.json()
      await store.setJSON(key, { ...balances, updatedAt: new Date().toISOString() })
      return Response.json({ saved: true })
    }
    return new Response('Method not allowed', { status: 405 })
  } catch (error) {
    return handleFunctionError(error)
  }
}

export const config: Config = { path: '/api/balances' }
