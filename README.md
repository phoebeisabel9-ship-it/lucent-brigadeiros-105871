# ETF Buyer

ETF Buyer is a private, responsive Netlify application that recommends exactly one ETF for each investment contribution. It compares whole-unit purchases of IVV, DHHF, VEU, VAS, and VESG against a fixed target allocation, applies a hard strategic guardrail, and then uses current market and cited research context as a smaller tactical input.

## Technology

- TanStack Start, React, TypeScript, Tailwind CSS
- Netlify Functions for protected APIs and third-party data access
- Netlify Identity for private account access
- Netlify Blobs for each user's latest balances
- Netlify Database with Drizzle ORM for trade history
- Netlify AI Gateway with OpenAI web research
- EODHD when configured, with a server-side Yahoo Finance ASX fallback

## Decision Policy

The function simulates investing the available cash in each ETF independently using:

```text
units = floor((cash - brokerage) / current price)
```

It disqualifies unaffordable trades, trades that worsen total target alignment, and ETFs with a material thesis-changing negative development. Eligible ETFs receive an 80% strategic score and a 20% tactical score. AI never performs allocation or trade calculations.

## Local Development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and optionally add an `EODHD_API_TOKEN`.
3. Link the site with Netlify CLI so Identity, Blobs, Database, and AI Gateway are available.
4. Run `netlify dev --port 8889`.
5. Open `http://localhost:8889` and create or sign in to an Identity account.

Netlify AI Gateway supplies the OpenAI API credentials in the deployed function runtime. Do not add provider secrets to frontend environment variables.

## Production Configuration

- Netlify Identity must remain enabled. New registrations require email confirmation by default.
- Set `EODHD_API_TOKEN` in Netlify environment variables to use the premium market feed; otherwise the server-side fallback is used.
- Optionally set `OPENAI_RESEARCH_MODEL` to a compatible model supported by Netlify AI Gateway.
- Database migrations in `netlify/database/migrations/` are applied automatically during deployment.
