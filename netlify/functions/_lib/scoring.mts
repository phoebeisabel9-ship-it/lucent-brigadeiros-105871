import { TARGETS, TICKERS, type Balances, type MarketDatum, type ResearchDatum, type Ticker } from './types.mjs'

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals))
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function allocation(values: Record<Ticker, number>) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)
  return Object.fromEntries(TICKERS.map((ticker) => [ticker, total ? values[ticker] / total : 0])) as Record<Ticker, number>
}

function alignmentError(allocationValue: Record<Ticker, number>) {
  return TICKERS.reduce((sum, ticker) => sum + Math.abs(allocationValue[ticker] - TARGETS[ticker]), 0)
}

function dipScore(returnPct: number, fullSignalAt: number) {
  return clamp((-returnPct / fullSignalAt) * 2, -2, 2)
}

export function analyseTrades(
  balances: Balances,
  market: MarketDatum[],
  research: Record<Ticker, ResearchDatum>,
) {
  const marketByTicker = Object.fromEntries(market.map((datum) => [datum.ticker, datum])) as Record<Ticker, MarketDatum>
  const beforeValues = Object.fromEntries(TICKERS.map((ticker) => [ticker, balances[ticker]])) as Record<Ticker, number>
  const beforeAllocation = allocation(beforeValues)
  const beforeError = alignmentError(beforeAllocation)

  const simulations = TICKERS.map((ticker) => {
    const datum = marketByTicker[ticker]
    const investableCash = Math.max(0, balances.cash - balances.brokerage)
    const units = Math.floor(investableCash / datum.price)
    const amountInvested = round(units * datum.price)
    const cashUsed = round(amountInvested + (units > 0 ? balances.brokerage : 0))
    const cashRemaining = round(balances.cash - cashUsed)
    const afterValues = { ...beforeValues, [ticker]: beforeValues[ticker] + amountInvested }
    const afterAllocation = allocation(afterValues)
    const afterError = alignmentError(afterAllocation)
    const improvement = beforeError - afterError
    const tacticalRaw =
      dipScore(datum.weekReturn, 5) * 0.3 +
      dipScore(datum.monthReturn, 10) * 0.25 +
      dipScore(datum.quarterReturn, 15) * 0.1 +
      clamp((datum.drawdown52Week / 20) * 2, 0, 2) * 0.15 +
      ((research[ticker].valuationScore + research[ticker].newsScore) / 2) * 0.2
    const tacticalScore = round(((tacticalRaw + 2) / 4) * 100)
    const disqualificationReason =
      units < 1
        ? 'Insufficient cash for one whole unit after brokerage.'
        : improvement <= 0
          ? 'Trade worsens overall target alignment.'
          : research[ticker].thesisDisqualified
            ? 'Material thesis-changing negative development identified.'
            : null

    return {
      ticker,
      units,
      price: round(datum.price, 4),
      amountInvested,
      brokerage: units > 0 ? round(balances.brokerage) : 0,
      cashUsed,
      cashRemaining,
      beforeAllocation,
      afterAllocation,
      beforeError,
      afterError,
      improvement,
      tacticalScore,
      tacticalRaw: round(tacticalRaw, 3),
      eligible: !disqualificationReason,
      disqualificationReason,
      market: datum,
      research: research[ticker],
    }
  })

  const eligible = simulations.filter((simulation) => simulation.eligible)
  if (!eligible.length) throw new Error('No ETF is eligible: each trade either worsens alignment, is unaffordable, or is thesis-disqualified.')
  const maxImprovement = Math.max(...eligible.map((simulation) => simulation.improvement))

  const scored = simulations.map((simulation) => {
    const strategicScore = simulation.eligible ? round((simulation.improvement / maxImprovement) * 100) : 0
    const overallScore = simulation.eligible ? round(strategicScore * 0.8 + simulation.tacticalScore * 0.2) : 0
    return { ...simulation, strategicScore, overallScore }
  })
  const recommendation = [...scored].filter((item) => item.eligible).sort((a, b) => b.overallScore - a.overallScore)[0]

  const comparisons = scored.map((item) => ({
    ticker: item.ticker,
    eligible: item.eligible,
    units: item.units,
    price: item.price,
    alignmentImprovement: round(item.improvement * 100, 3),
    strategicScore: item.strategicScore,
    tacticalScore: item.tacticalScore,
    overallScore: item.overallScore,
    disqualificationReason: item.disqualificationReason,
    whyItLost:
      item.ticker === recommendation.ticker
        ? 'Recommended.'
        : !item.eligible
          ? item.disqualificationReason
          : item.strategicScore < recommendation.strategicScore
            ? `Improved target alignment less than ${recommendation.ticker}.`
            : `Its tactical setup scored below ${recommendation.ticker}.`,
    market: item.market,
    research: item.research,
  }))

  return {
    generatedAt: new Date().toISOString(),
    targets: TARGETS,
    recommendation: {
      ...recommendation,
      reason: `${recommendation.ticker} produces the strongest guardrail-compliant blend of target alignment and current market context.`,
      whyItBeatAlternatives: comparisons.filter((item) => item.ticker !== recommendation.ticker).map((item) => ({ ticker: item.ticker, reason: item.whyItLost })),
    },
    comparisons,
  }
}
