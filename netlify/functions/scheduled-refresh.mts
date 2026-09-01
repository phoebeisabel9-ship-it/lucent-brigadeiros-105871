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

  /*
   * Use GET because this is the exact same
   * invocation we have now confirmed works
   * successfully from the browser.
   */
  const response = await fetch(
    refreshUrl,
    {
      method: 'GET',

      signal:
        AbortSignal.timeout(
          10_000,
        ),
    },
  )

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
   * Netlify cron schedules use UTC.
   *
   * 21:00 UTC Sunday–Thursday gives us a
   * Monday–Friday morning refresh in Sydney.
   *
   * Around:
   * 7:00am AEST
   * 8:00am AEDT
   */
  schedule: '0 21 * * 0-4',
}
