import type { Config } from '@netlify/functions'

export default async () => {
  const siteUrl = process.env.URL

  if (!siteUrl) {
    throw new Error(
      'Netlify site URL is unavailable',
    )
  }

  const refreshUrl = new URL(
    '/api/refresh-research',
    siteUrl,
  )

  console.log(
    `Triggering scheduled ETF refresh via ${refreshUrl.toString()}`,
  )

  const response = await fetch(
    refreshUrl,
    {
      method: 'POST',

      /*
       * The refresh endpoint is a Background Function,
       * so it should reply almost immediately with 202.
       */
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
    `Daily ETF refresh successfully queued with status ${response.status}`,
  )
}

export const config: Config = {
  /*
   * Netlify schedules are UTC.
   *
   * 21:00 UTC Sunday–Thursday =
   * Monday–Friday morning in Sydney:
   *
   * ~7:00am during AEST
   * ~8:00am during AEDT
   *
   * Both are before the ASX opens.
   */
  schedule:
    '0 21 * * 0-4',
}
