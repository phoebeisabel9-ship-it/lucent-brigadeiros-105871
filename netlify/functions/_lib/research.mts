import OpenAI from 'openai'
import {
  TICKERS,
  type ResearchDatum,
  type Ticker,
} from './types.mjs'

function parseJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
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
    ? Math.max(-2, Math.min(2, Math.round(score)))
    : 0
}

function validateResearch(
  parsed: Record<string, Partial<ResearchDatum>>,
): Record<Ticker, ResearchDatum> {
  return Object.fromEntries(
    TICKERS.map((ticker) => {
      const item = parsed[ticker]

      if (!item) {
        throw new Error(
          `Research response is missing ${ticker}`,
        )
      }

      const valuationContext = String(
        item.valuationContext || '',
      ).trim()

      const developments = String(
        item.developments || '',
      ).trim()

      const newsSummary = String(
        item.newsSummary || '',
      ).trim()

      if (
        !valuationContext ||
        !developments ||
        !newsSummary
      ) {
        throw new Error(
          `Research response for ${ticker} is incomplete`,
        )
      }

      const citations = Array.isArray(
        item.citations,
      )
        ? item.citations
            .filter(
              (
                citation,
              ): citation is {
                title: string
                url: string
              } =>
                Boolean(
                  citation &&
                    typeof citation.title ===
                      'string' &&
                    citation.title.trim() &&
                    typeof citation.url ===
                      'string' &&
                    /^https:\/\//.test(
                      citation.url,
                    ),
                ),
            )
            .slice(0, 3)
        : []

      if (citations.length === 0) {
        throw new Error(
          `Research response for ${ticker} has no sources`,
        )
      }

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

          valuationContext,

          developments,

          newsSummary,

          citations,
        },
      ]
    }),
  ) as Record<Ticker, ResearchDatum>
}

export async function getResearch(): Promise<
  Record<Ticker, ResearchDatum>
> {
  const client = new OpenAI({
    /*
     * This function will run inside a Netlify
     * Background Function, so it can be allowed
     * substantially more time than the old
     * synchronous request.
     */
    timeout: 180_000,
    maxRetries: 1,
  })

  const today = new Date()
    .toISOString()
    .slice(0, 10)

  const model =
    process.env.OPENAI_RESEARCH_MODEL ||
    'gpt-5.6-luna'

  console.log(
    `Starting daily ETF research using ${model}`,
  )

  const response = await client.responses.create({
    model,

    reasoning: {
      effort: 'none',
    },

    max_output_tokens: 2500,

    tools: [
      {
        type: 'web_search_preview',
        search_context_size: 'medium',
      },
    ],

    input: `
Today is ${today}.

Research these ASX-listed ETFs:

- IVV
- DHHF
- VEU
- VAS
- VESG

This research will be used as the tactical 20% layer
of a long-term portfolio rebalancing model.

The strategic target allocation is:

IVV 35%
DHHF 30%
VEU 15%
VAS 10%
VESG 10%

Do NOT recommend which ETF to buy.

For EACH ETF, research:

1. VALUATION
Assess the valuation of the underlying market or
portfolio relative to its own history and comparable
markets where reliable information is available.

2. DEVELOPMENTS
Identify material developments affecting the ETF,
its index, or its underlying market.

3. LAST 7 DAYS OF NEWS
Identify significant macroeconomic, central-bank,
earnings, geopolitical or market news from the
previous 7 calendar days that is relevant to the ETF.

Use current web research.

Prefer authoritative and high-quality sources such as:

- ETF issuers
- index providers
- ASX
- central banks
- regulators
- official economic data
- Reuters
- other high-quality financial reporting

Ignore routine commentary and low-quality speculation.

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

thesisDisqualified should be TRUE only if a genuine
structural or thesis-changing negative development
means that simply "buying the dip" would be
inappropriate.

A normal market decline, recession fear, rate move,
geopolitical volatility or ordinary earnings weakness
should NOT automatically be considered
thesis-disqualifying.

Return ONLY valid JSON.

Use exactly this structure:

{
  "IVV": {
    "valuationScore": 0,
    "newsScore": 0,
    "thesisDisqualified": false,
    "valuationContext": "One concise but informative sentence.",
    "developments": "One concise but informative sentence.",
    "newsSummary": "One concise but informative sentence.",
    "citations": [
      {
        "title": "Source title",
        "url": "https://..."
      }
    ]
  },
  "DHHF": {
    "valuationScore": 0,
    "newsScore": 0,
    "thesisDisqualified": false,
    "valuationContext": "",
    "developments": "",
    "newsSummary": "",
    "citations": []
  },
  "VEU": {
    "valuationScore": 0,
    "newsScore": 0,
    "thesisDisqualified": false,
    "valuationContext": "",
    "developments": "",
    "newsSummary": "",
    "citations": []
  },
  "VAS": {
    "valuationScore": 0,
    "newsScore": 0,
    "thesisDisqualified": false,
    "valuationContext": "",
    "developments": "",
    "newsSummary": "",
    "citations": []
  },
  "VESG": {
    "valuationScore": 0,
    "newsScore": 0,
    "thesisDisqualified": false,
    "valuationContext": "",
    "developments": "",
    "newsSummary": "",
    "citations": []
  }
}

Each ETF must include at least one real source URL.

Do not include markdown fences or text outside the
JSON object.
    `.trim(),
  })

  if (!response.output_text) {
    throw new Error(
      'Research provider returned no text',
    )
  }

  let parsed: Record<
    string,
    Partial<ResearchDatum>
  >

  try {
    parsed = parseJson(response.output_text)
  } catch (error) {
    console.error(
      'Unreadable research response:',
      response.output_text,
    )

    throw new Error(
      'Research provider returned invalid JSON',
    )
  }

  const research = validateResearch(parsed)

  console.log(
    'Daily ETF research completed successfully',
  )

  return research
}
