import OpenAI from 'openai'
import { TICKERS, type ResearchDatum, type Ticker } from './types.mjs'

const emptyResearch = (): ResearchDatum => ({
  valuationScore: 0,
  newsScore: 0,
  thesisDisqualified: false,
  valuationContext: 'No material valuation signal identified.',
  developments: 'No material index or fund development identified.',
  newsSummary: 'No material thesis-changing news identified in the review window.',
  citations: [],
})

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as Record<string, Partial<ResearchDatum>>
}

function clampScore(value: unknown) {
  const score = Number(value)
  return Number.isFinite(score) ? Math.max(-2, Math.min(2, score)) : 0
}

export async function getResearch(): Promise<Record<Ticker, ResearchDatum>> {
  const client = new OpenAI()
  const today = new Date().toISOString().slice(0, 10)
  const response = await client.responses.create({
    model: process.env.OPENAI_RESEARCH_MODEL || 'gpt-5.2',
    tools: [{ type: 'web_search' }],
    input: `Research these ASX-listed ETFs: IVV, DHHF, VEU, VAS, VESG. Today is ${today}.

For each ETF assess current valuation context, relevant ETF/index developments, and significant market or macro news published in the previous 7 calendar days. Use reputable primary sources, fund issuers, index providers, exchanges, central banks, regulators, and high-quality financial reporting.

Return ONLY valid JSON keyed by ticker. Each ticker must have:
valuationScore (integer -2 to 2, where -2 is materially unattractive and +2 materially attractive),
newsScore (integer -2 to 2),
thesisDisqualified (boolean, true only for a material thesis-changing negative development),
valuationContext (one concise sentence),
developments (one concise sentence),
newsSummary (one concise sentence),
citations (2-4 objects with title and full https URL).

Do not make any allocation or trade recommendation.`,
  })

  let parsed: Record<string, Partial<ResearchDatum>>
  try {
    parsed = parseJson(response.output_text)
  } catch {
    throw new Error('Research provider returned an unreadable response')
  }

  return Object.fromEntries(
    TICKERS.map((ticker) => {
      const item = parsed[ticker] ?? emptyResearch()
      return [
        ticker,
        {
          valuationScore: clampScore(item.valuationScore),
          newsScore: clampScore(item.newsScore),
          thesisDisqualified: item.thesisDisqualified === true,
          valuationContext: String(item.valuationContext || emptyResearch().valuationContext),
          developments: String(item.developments || emptyResearch().developments),
          newsSummary: String(item.newsSummary || emptyResearch().newsSummary),
          citations: Array.isArray(item.citations)
            ? item.citations
                .filter((citation) => citation?.title && /^https:\/\//.test(citation.url))
                .slice(0, 4)
            : [],
        },
      ]
    }),
  ) as Record<Ticker, ResearchDatum>
}
