import OpenAI from 'openai'
import {
  TICKERS,
  type ResearchDatum,
  type Ticker,
} from './types.mjs'

const emptyResearch = (
  reason = 'No material valuation signal identified.',
): ResearchDatum => ({
  valuationScore: 0,
  newsScore: 0,
  thesisDisqualified: false,
  valuationContext: reason,
  developments:
    'No material index or fund development identified.',
  newsSummary:
    'No material thesis-changing news identified in the review window.',
  citations: [],
})

const unavailableResearch = (): ResearchDatum => ({
  valuationScore: 0,
  newsScore: 0,
  thesisDisqualified: false,
  valuationContext:
    'Live valuation research was unavailable on this run, so the valuation signal has been set to neutral.',
  developments:
    'Live ETF and index research was unavailable on this run.',
  newsSummary:
    'Live news research timed out or was unavailable, so the news signal has been set to neutral.',
  citations: [],
})

function parseJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  return JSON.parse(cleaned) as Record<
    string,
    Partial<ResearchDatum>
  >
}

function clampScore(value: unknown) {
  const score = Number(value)

  return Number.isFinite(score)
    ? Math.max(-2, Math.min(2, score))
    : 0
}

function neutralResearch(): Record<
  Ticker,
  ResearchDatum
> {
  return Object.fromEntries(
    TICKERS.map((ticker) => [
      ticker,
      unavailableResearch(),
    ]),
  ) as Record<Ticker, ResearchDatum>
}

export async function getResearch(): Promise<
  Record<Ticker, ResearchDatum>
> {
  /*
   * Use Netlify's AI Gateway via the OpenAI SDK.
   *
   * Luna is deliberately used here because this task does not
   * require a large reasoning model. It is faster and much
   * cheaper than GPT-5.2 while still supporting web search.
   *
   * The timeout ensures live research can never prevent the
   * portfolio calculator from returning a result.
   */
  const client = new OpenAI({
    timeout: 12000,
    maxRetries: 0,
  })

  const today = new Date()
    .toISOString()
    .slice(0, 10)

  try {
    const response = await client.responses.create({
      model: 'gpt-5.6-luna',

      reasoning: {
        effort: 'none',
      },

      max_output_tokens: 1500,

      tools: [
        {
          type: 'web_search',
        },
      ],

      input: `
Today is ${today}.

Research the following ASX-listed ETFs:

IVV
DHHF
VEU
VAS
VESG

This research is ONLY a small tactical input into a
portfolio-rebalancing model.

Be concise.

For each ETF assess:

1. Whether its current market/index valuation appears
   relatively attractive, neutral, or stretched.

2. Any MATERIAL ETF, index or underlying-market
   developments.

3. MATERIAL financial-market or macroeconomic news
   published during the previous 7 calendar days.

Focus only on information capable of affecting an
investment decision.

Do not provide general ETF explanations.

Prefer:
- fund issuers
- index providers
- exchanges
- central banks
- regulators
- Reuters
- other high-quality financial reporting

Return ONLY valid JSON.

Required structure:

{
  "IVV": {
    "valuationScore": 0,
    "newsScore": 0,
    "thesisDisqualified": false,
    "valuationContext": "",
    "developments": "",
    "newsSummary": "",
    "citations": [
      {
        "title": "",
        "url": "https://..."
      }
    ]
  }
}

Include the same structure for:
DHHF, VEU, VAS and VESG.

SCORING:

valuationScore:
-2 = materially unattractive
-1 = somewhat unattractive
 0 = neutral
+1 = somewhat attractive
+2 = materially attractive

newsScore:
-2 = materially negative
-1 = mildly negative
 0 = neutral
+1 = mildly positive
+2 = materially positive

Set thesisDisqualified to true ONLY where there is a
genuine structural or thesis-changing negative event.

Use no more than 2 citations per ETF.

Do NOT recommend what ETF to buy.
      `.trim(),
    })

    let parsed: Record<
      string,
      Partial<ResearchDatum>
    >

    try {
      parsed = parseJson(response.output_text)
    } catch {
      console.error(
        'Research response could not be parsed',
      )

      return neutralResearch()
    }

    return Object.fromEntries(
      TICKERS.map((ticker) => {
        const fallback = emptyResearch()
        const item =
          parsed[ticker] ?? fallback

        return [
          ticker,
          {
            valuationScore: clampScore(
              item.valuationScore,
            ),

            newsScore: clampScore(
              item.newsScore,
            ),

            thesisDisqualified:
              item.thesisDisqualified === true,

            valuationContext: String(
              item.valuationContext ||
                fallback.valuationContext,
            ),

            developments: String(
              item.developments ||
                fallback.developments,
            ),

            newsSummary: String(
              item.newsSummary ||
                fallback.newsSummary,
            ),

            citations: Array.isArray(
              item.citations,
            )
              ? item.citations
                  .filter(
                    (citation) =>
                      citation?.title &&
                      typeof citation.url ===
                        'string' &&
                      /^https:\/\//.test(
                        citation.url,
                      ),
                  )
                  .slice(0, 2)
              : [],
          },
        ]
      }),
    ) as Record<Ticker, ResearchDatum>
  } catch (error) {
    /*
     * Research is deliberately non-fatal.
     *
     * If Netlify AI Gateway is slow, unavailable,
     * out of credits, or the model request fails,
     * the portfolio model still runs.
     *
     * The tactical AI inputs simply become neutral.
     */
    console.error(
      'Live research unavailable:',
      error,
    )

    return neutralResearch()
  }
}
