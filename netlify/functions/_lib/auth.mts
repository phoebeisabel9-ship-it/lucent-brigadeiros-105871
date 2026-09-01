import { getUser } from '@netlify/identity'

export async function requireUser() {
  const user = await getUser()
  if (!user) {
    throw new Response('Unauthorized', { status: 401 })
  }
  return user
}

export function handleFunctionError(error: unknown) {
  if (error instanceof Response) return error
  console.error(error)
  return Response.json(
    { error: error instanceof Error ? error.message : 'Unexpected server error' },
    { status: 500 },
  )
}
