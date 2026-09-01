import type { Config } from '@netlify/functions'

export default async () => {
  const siteUrl = process.env.URL

  if (!siteUrl) {
    throw new Error(
      'Netlify site URL is unavailable',
    )
  }

  const refreshUrl = new URL(
    '/.netlify/functions/refresh-research',
    siteUrl,
  )

  console.log(
    `Triggering scheduled ETF refresh via ${refreshUrl.toString()}`,
  )

  const response = await fetch(
    refreshUrl,
    {
      method: 'POST',

      signal:
        AbortSignal.timeout(
          10_000,
        ),
    },
  )

  /*
   * Background Functions normally return
   * 202 Accepted immediately.
   */
  if (
    response.status !== 202 &&
    !response.ok
  ) {
    const text =
      await response
        .text()
        .catch(() => '')

    throw new Error(
      `Background refresh could not be started: HTTP ${response.status} ${text}`,
    )
  }

  console.log(
    `Background refresh queued successfully with HTTP ${response.status}`,
  )
}

export const config: Config = {
  /*
   * Runs Sunday–Thursday UTC,
   * which corresponds to Monday–Friday
   * morning in Sydney.
   */
  schedule: '0 21 * * 0-4',
}
