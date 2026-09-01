# ETF Buyer Architecture

## Overview

ETF Buyer is a private TanStack Start application deployed on Netlify. It accepts current ETF balances, retrieves server-side market and research data, and returns exactly one whole-unit ETF purchase recommendation. All portfolio and scoring logic is deterministic TypeScript.

## Key Directories

- `src/routes/` contains the authenticated React interface.
- `src/styles.css` contains the dashboard design system and responsive layout.
- `netlify/functions/` contains protected APIs and server-only integrations.
- `netlify/functions/_lib/` contains market, research, auth, and scoring modules.
- `db/` contains the Drizzle schema and Netlify Database client.
- `netlify/database/migrations/` contains generated database migrations.

## Persistence

- Latest balances are stored per Identity user in Netlify Blobs with strong consistency.
- Saved trade recommendations are stored as structured records in Netlify Database.
- Never replace either store with local files, browser storage, or in-memory state.

## Security

- Every API route calls `requireUser()` before accessing data or third-party services.
- All market and AI calls stay inside Netlify Functions.
- Never expose provider keys to `src/` or variables prefixed with `VITE_`.
- Netlify AI Gateway supplies OpenAI credentials at runtime.

## Decision Model

- Target weights are fixed in `netlify/functions/_lib/types.mts`.
- Strategic alignment is 80% of the final score and is calculated before tactical inputs.
- Any trade that worsens total absolute target deviation is disqualified.
- Tactical signals cannot override the strategic guardrail.
- AI output supplies only valuation, news context, citations, and a thesis-disqualification flag; it never performs portfolio math.

## Conventions

- Use TypeScript for application and function code.
- Keep monetary calculations explicit and round display values only at clear boundaries.
- Preserve whole-unit purchase logic and one-recommendation output.
- Generate a migration after every schema change with `drizzle-kit generate --name <imperative_name>`.
- Do not add client-side third-party data calls.
