import OpenAI from 'openai'

import {
  TICKERS,
  type ResearchDatum,
  type Ticker,
} from './types.mjs'

const citationSchema = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
    },
    url: {
      type: 'string',
    },
  },
  required: [
    'title',
    'url',
  ],
  additionalProperties: false,
}

const researchItemSchema = {
  type: 'object',

  properties: {
    valuationScore: {
      type: 'integer',
      minimum: -2,
      maximum: 2,
    },

    newsScore: {
      type: 'integer',
      minimum: -2,
      maximum: 2,
    },

    thesisDisqualified: {
      type: 'boolean',
    },

    valuationContext: {
      type: 'string',
    },

    developments: {
      type: 'string',
    },

    newsSummary: {
      type: 'string',
    },

    citations: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: citationSchema,
    },
  },

  required: [
    'valuationScore',
    'newsScore',
    'thesisDisqualified',
    'valuationContext',
    'developments',
    'newsSummary',
    'citations',
  ],

  additionalProperties: false,
}

const researchSchema = {
  type: 'object',

  properties: {
    IVV: researchItemSchema,
    DHHF: researchItemSchema,
    VEU: researchItemSchema,
    VAS: researchItemSchema,
    VESG: researchItemSchema,
  },

  required: [
    'IVV',
    'DHHF',
    'VEU',
    'VAS',
    'VESG',
  ],

  additionalProperties: false,
}

function isHttpsUrl(
  value: string,
) {
  return /^https:\/\//i.test(
    value,
  )
}

function validateResearch(
  parsed: Record<
    string,
    ResearchDatum
  >,
): Record<
  Ticker,
  ResearchDatum
> {
  return Object.fromEntries(
    TICKERS.map(
      (ticker) => {
        const item =
          parsed[ticker]

        if (!item) {
          throw new Error(
            `Research response is missing ${ticker}`,
          )
        }

        const citations =
          Array.isArray(
            item.citations,
          )
            ? item.citations
                .filter(
                  (
                    citation,
                  ) =>
                    citation &&
                    typeof citation.title ===
                      'string' &&
                    citation.title.trim()
                      .length > 0 &&
                    typeof citation.url ===
                      'string' &&
                    isHttpsUrl(
                      citation.url,
                    ),
                )
                .slice(
                  0,
                  3,
                )
            : []

        if (
          citations.length ===
          0
        ) {
          throw new Error(
            `Research response for ${ticker} has no valid citations`,
          )
        }

        return [
          ticker,
          {
            valuationScore:
              item.valuationScore,

            newsScore:
              item.newsScore,

            thesisDisqualified:
              item.thesisDisqualified,

            valuationContext:
              item.valuationContext,

            developments:
              item.developments,

            newsSummary:
              item.newsSummary,

            citations,
          },
        ]
      },
    ),
  ) as Record<
    Ticker,
    ResearchDatum
  >
}

export async function getResearch(): Promise<
  Record<
    Ticker,
    ResearchDatum
  >
> {
  const client =
    new OpenAI({
      timeout: 180_000,
      maxRetries: 1,
    })

  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      )

  const model =
    process.env
      .OPENAI_RESEARCH_MODEL ||
    'gpt-5.6-luna'

  console.log(
    `Starting daily ETF research using ${model}`,
  )

  const response =
    await client.responses.create({
      model,

      reasoning: {
        effort: 'none',
      },

      /*
       * Web search is the actual
       * research layer.
       */
      tools: [
        {
          type: 'web_search',
        },
      ],

      /*
       * Structured Outputs forces
       * the final answer to match
       * our JSON schema.
       */
      text: {
        format: {
          type: 'json_schema',

          name:
            'etf_daily_research',

          strict: true,

          schema:
            researchSchema,
        },
      },

      max_output_tokens:
        3000,

      input: `
Today is ${today}.

Research these ASX-listed ETFs:

IVV
DHHF
VEU
VAS
VESG

This research is used as the tactical layer of a
long-term portfolio rebalancing model.

The fixed strategic target is:

IVV 35%
DHHF 30%
VEU 15%
VAS 10%
VESG 10%

Do NOT make an allocation or buy recommendation.

For EACH ETF assess:

1. VALUATION

Assess the valuation of the underlying market or
portfolio relative to its own history and comparable
markets where reliable data exists.

Use actual valuation evidence where available,
including measures such as:

- price/earnings
- forward price/earnings
- earnings yield
- price/book
- dividend yield
- issuer or index valuation data

Do not invent valuation statistics.

2. DEVELOPMENTS

Identify material developments affecting:

- the ETF
- its index
- its underlying markets
- major sectors or geographic exposures

Ignore routine commentary.

3. PREVIOUS 7 DAYS OF NEWS

Identify important market, macroeconomic,
central-bank, earnings, geopolitical or regulatory
developments published during the previous
7 calendar days that are materially relevant to the ETF.

Prefer authoritative sources:

- ETF issuers
- index providers
- ASX
- central banks
- regulators
- government economic data
- Reuters
- other high-quality financial reporting

SCORING

valuationScore:

+2 = materially attractive
+1 = somewhat attractive
 0 = broadly neutral
-1 = somewhat stretched
-2 = materially unattractive

newsScore:

+2 = materially positive
+1 = mildly positive
 0 = broadly neutral
-1 = mildly negative
-2 = materially negative

thesisDisqualified:

Set true ONLY for a genuine structural or
thesis-changing negative event.

Ordinary market volatility, recession fears,
interest-rate changes, geopolitical volatility or
short-term earnings weakness are NOT by themselves
thesis-disqualifying.

Keep valuationContext, developments and newsSummary
concise but informative.

Include 1–3 real source URLs for EACH ETF.

Do not recommend what I should buy.
      `.trim(),
    })

  if (
    !response.output_text
  ) {
    throw new Error(
      'Research provider returned no output',
    )
  }

  let parsed: Record<
    string,
    ResearchDatum
  >

  try {
    parsed =
      JSON.parse(
        response.output_text,
      )
  } catch {
    console.error(
      'Structured research output could not be parsed:',
      response.output_text,
    )

    throw new Error(
      'Structured research output could not be parsed',
    )
  }

  const research =
    validateResearch(
      parsed,
    )

  console.log(
    'Daily ETF research completed successfully',
  )

  return research
}
