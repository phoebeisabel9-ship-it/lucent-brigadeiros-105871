import {
  TARGETS,
  TICKERS,
  type Balances,
  type MarketDatum,
  type ResearchDatum,
  type Ticker,
} from './types.mjs'

const PORTFOLIO_PRIORITY_WEIGHT = 0.6
const MARKET_OPPORTUNITY_WEIGHT = 0.4
const HARD_OVERWEIGHT_BUFFER = 0.075
const MAX_BROKERAGE_DRAG = 0.02

const OPPORTUNITY_WEIGHTS = {
  week: 0.3,
  month: 0.25,
  quarter: 0.15,
  drawdown52Week: 0.3,
} as const

type MarketWithSnapshot = MarketDatum & {
  snapshotPrice?: number
  snapshotAsOf?: string
}

const round = (value: number, decimals = 2) =>
  Number(value.toFixed(decimals))

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

function allocation(values: Record<Ticker, number>) {
  const total = Object.values(values).reduce(
    (sum, value) => sum + value,
    0,
  )

  return Object.fromEntries(
    TICKERS.map((ticker) => [
      ticker,
      total ? values[ticker] / total : 0,
    ]),
  ) as Record<Ticker, number>
}

function alignmentError(
  allocationValue: Record<Ticker, number>,
) {
  return TICKERS.reduce(
    (sum, ticker) =>
      sum +
      Math.abs(
        allocationValue[ticker] - TARGETS[ticker],
      ),
    0,
  )
}

/*
 * Portfolio Priority: absolute 0-100.
 *
 * 100 = maximally underweight (0% allocation with a positive target)
 *  50 = exactly on target
 *   0 = at or beyond the hard overweight cap
 *
 * The same formula is applied independently to every ETF using
 * that ETF's own target.
 */
function portfolioPriorityScore(
  ticker: Ticker,
  allocationValue: Record<Ticker, number>,
) {
  const target = TARGETS[ticker]
  const current = allocationValue[ticker]

  if (target <= 0) return 0

  if (current <= target) {
    const underweightFraction = clamp(
      (target - current) / target,
      0,
      1,
    )

    return round(
      50 + underweightFraction * 50,
    )
  }

  const overweightFraction = clamp(
    (current - target) /
      HARD_OVERWEIGHT_BUFFER,
    0,
    1,
  )

  return round(
    50 - overweightFraction * 50,
  )
}

/*
 * Price-opportunity score.
 *
 * For 1W:
 * +5% = 0
 *  0% = 50
 * -5% = 100
 *
 * The 1M and 3M signals use wider ranges.
 */
function returnOpportunityScore(
  returnPct: number,
  fullSignalAt: number,
) {
  return round(
    clamp(
      50 -
        (returnPct / fullSignalAt) *
          50,
      0,
      100,
    ),
  )
}

/*
 * 52W drawdown:
 * 0% down = 0
 * 7.5% down = 50
 * 15%+ down = 100
 */
function drawdownOpportunityScore(
  drawdownPct: number,
) {
  return round(
    clamp(
      (drawdownPct / 15) * 100,
      0,
      100,
    ),
  )
}

function liveAdjustedReturn(
  snapshotPrice: number,
  currentPrice: number,
  snapshotReturnPct: number,
) {
  const denominator =
    1 + snapshotReturnPct / 100

  if (
    !Number.isFinite(snapshotPrice) ||
    snapshotPrice <= 0 ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(snapshotReturnPct) ||
    denominator <= 0
  ) {
    return snapshotReturnPct
  }

  const referencePrice =
    snapshotPrice / denominator

  return (
    (currentPrice / referencePrice - 1) *
    100
  )
}

function opportunityLabel(score: number) {
  if (score >= 85) return 'Exceptional opportunity'
  if (score >= 70) return 'Strong opportunity'
  if (score >= 55) return 'Moderate opportunity'
  if (score >= 45) return 'Neutral'
  if (score >= 30) return 'Limited opportunity'
  return 'Low opportunity'
}

function overallLabel(score: number) {
  if (score >= 85) return 'Very strong'
  if (score >= 70) return 'Strong'
  if (score >= 55) return 'Moderate'
  if (score >= 40) return 'Weak'
  return 'Very weak'
}

function allocationForTrade(
  beforeValues: Record<Ticker, number>,
  ticker: Ticker,
  units: number,
  price: number,
) {
  return allocation({
    ...beforeValues,
    [ticker]:
      beforeValues[ticker] +
      units * price,
  })
}

export function analyseTrades(
  balances: Balances,
  market: MarketDatum[],
  research: Record<Ticker, ResearchDatum>,
) {
  const marketByTicker =
    Object.fromEntries(
      market.map((datum) => [
        datum.ticker,
        datum,
      ]),
    ) as Record<Ticker, MarketDatum>

  const beforeValues =
    Object.fromEntries(
      TICKERS.map((ticker) => [
        ticker,
        balances[ticker],
      ]),
    ) as Record<Ticker, number>

  const beforeAllocation =
    allocation(beforeValues)

  const beforeError =
    alignmentError(beforeAllocation)

  const simulations = TICKERS.map(
    (ticker) => {
      const datum =
        marketByTicker[ticker] as
          | MarketWithSnapshot
          | undefined

      const researchDatum =
        research[ticker]

      if (!datum) {
        throw new Error(
          `Market data is missing for ${ticker}.`,
        )
      }

      if (!researchDatum) {
        throw new Error(
          `Research data is missing for ${ticker}.`,
        )
      }

      if (
        !Number.isFinite(datum.price) ||
        datum.price <= 0
      ) {
        throw new Error(
          `Current price is invalid for ${ticker}.`,
        )
      }

      const currentPrice =
        datum.price

      const snapshotPriceCandidate =
        Number(datum.snapshotPrice)

      const snapshotPrice =
        Number.isFinite(
          snapshotPriceCandidate,
        ) &&
        snapshotPriceCandidate > 0
          ? snapshotPriceCandidate
          : currentPrice

      const adjustedWeekReturn =
        liveAdjustedReturn(
          snapshotPrice,
          currentPrice,
          datum.weekReturn,
        )

      const adjustedMonthReturn =
        liveAdjustedReturn(
          snapshotPrice,
          currentPrice,
          datum.monthReturn,
        )

      const adjustedQuarterReturn =
        liveAdjustedReturn(
          snapshotPrice,
          currentPrice,
          datum.quarterReturn,
        )

      const adjustedHigh52Week =
        Math.max(
          datum.high52Week,
          currentPrice,
        )

      const adjustedDrawdown52Week =
        adjustedHigh52Week > 0
          ? Math.max(
              0,
              ((adjustedHigh52Week -
                currentPrice) /
                adjustedHigh52Week) *
                100,
            )
          : datum.drawdown52Week

      /*
       * Market Opportunity is 100% deterministic.
       * No AI valuation or news scores are used.
       */
      const tacticalComponents = {
        week: {
          rawValue: round(
            adjustedWeekReturn,
            3,
          ),
          score:
            returnOpportunityScore(
              adjustedWeekReturn,
              5,
            ),
          weight:
            OPPORTUNITY_WEIGHTS.week,
        },

        month: {
          rawValue: round(
            adjustedMonthReturn,
            3,
          ),
          score:
            returnOpportunityScore(
              adjustedMonthReturn,
              10,
            ),
          weight:
            OPPORTUNITY_WEIGHTS.month,
        },

        quarter: {
          rawValue: round(
            adjustedQuarterReturn,
            3,
          ),
          score:
            returnOpportunityScore(
              adjustedQuarterReturn,
              15,
            ),
          weight:
            OPPORTUNITY_WEIGHTS.quarter,
        },

        drawdown52Week: {
          rawValue: round(
            adjustedDrawdown52Week,
            3,
          ),
          score:
            drawdownOpportunityScore(
              adjustedDrawdown52Week,
            ),
          weight:
            OPPORTUNITY_WEIGHTS.drawdown52Week,
        },
      }

      const marketOpportunityScore =
        round(
          tacticalComponents.week.score *
            tacticalComponents.week.weight +
            tacticalComponents.month.score *
              tacticalComponents.month.weight +
            tacticalComponents.quarter.score *
              tacticalComponents.quarter.weight +
            tacticalComponents.drawdown52Week
              .score *
              tacticalComponents
                .drawdown52Week.weight,
        )

      /*
       * Portfolio Priority uses the CURRENT, pre-trade allocation.
       * This answers: which ETF most needs the next contribution?
       */
      const priorityScore =
        portfolioPriorityScore(
          ticker,
          beforeAllocation,
        )

      const investableCash =
        Math.max(
          0,
          balances.cash -
            balances.brokerage,
        )

      const maxAffordableUnits =
        Math.floor(
          investableCash /
            currentPrice,
        )

      const hardOverweightCap =
        TARGETS[ticker] +
        HARD_OVERWEIGHT_BUFFER

      const minimumEfficientUnits =
        balances.brokerage > 0
          ? Math.max(
              1,
              Math.ceil(
                balances.brokerage /
                  (MAX_BROKERAGE_DRAG *
                    currentPrice),
              ),
            )
          : 1

      /*
       * Find all whole-unit trades that are:
       * - affordable
       * - under the hard overweight cap
       * - brokerage-efficient (<=2%)
       */
      const permittedTrades:
        Array<{
          units: number
          allocation: Record<Ticker, number>
          brokerageDrag: number
        }> = []

      for (
        let candidateUnits = 1;
        candidateUnits <=
        maxAffordableUnits;
        candidateUnits += 1
      ) {
        const candidateAllocation =
          allocationForTrade(
            beforeValues,
            ticker,
            candidateUnits,
            currentPrice,
          )

        if (
          candidateAllocation[ticker] >
          hardOverweightCap +
            Number.EPSILON
        ) {
          continue
        }

        const candidateInvestment =
          candidateUnits *
          currentPrice

        const candidateBrokerageDrag =
          candidateInvestment > 0
            ? balances.brokerage /
              candidateInvestment
            : Number.POSITIVE_INFINITY

        if (
          candidateBrokerageDrag >
          MAX_BROKERAGE_DRAG
        ) {
          continue
        }

        permittedTrades.push({
          units:
            candidateUnits,
          allocation:
            candidateAllocation,
          brokerageDrag:
            candidateBrokerageDrag,
        })
      }

      /*
       * Trade sizing:
       *
       * UNDER TARGET:
       * choose the permitted whole-unit trade that gets closest to target.
       *
       * AT / OVER TARGET:
       * choose only the smallest brokerage-efficient permitted trade.
       * This lets a true "sale" win without pushing an overweight ETF
       * unnecessarily toward its hard cap.
       */
      let selectedTrade:
        | {
            units: number
            allocation: Record<Ticker, number>
            brokerageDrag: number
          }
        | undefined

      if (
        permittedTrades.length >
        0
      ) {
        if (
          beforeAllocation[ticker] <
          TARGETS[ticker]
        ) {
          selectedTrade = [
            ...permittedTrades,
          ].sort(
            (a, b) => {
              const aDistance =
                Math.abs(
                  a.allocation[ticker] -
                    TARGETS[ticker],
                )

              const bDistance =
                Math.abs(
                  b.allocation[ticker] -
                    TARGETS[ticker],
                )

              return (
                aDistance -
                  bDistance ||
                b.units -
                  a.units
              )
            },
          )[0]
        } else {
          selectedTrade = [
            ...permittedTrades,
          ].sort(
            (a, b) =>
              a.units -
              b.units,
          )[0]
        }
      }

      const units =
        selectedTrade?.units ?? 0

      const amountInvested =
        round(
          units * currentPrice,
        )

      const brokerageDrag =
        selectedTrade
          ? selectedTrade.brokerageDrag
          : Number.POSITIVE_INFINITY

      const cashUsed =
        round(
          amountInvested +
            (units > 0
              ? balances.brokerage
              : 0),
        )

      const cashRemaining =
        round(
          balances.cash -
            cashUsed,
        )

      const afterAllocation =
        selectedTrade?.allocation ??
        beforeAllocation

      const afterError =
        alignmentError(
          afterAllocation,
        )

      const improvement =
        beforeError -
        afterError

      const overallScore =
        round(
          priorityScore *
            PORTFOLIO_PRIORITY_WEIGHT +
            marketOpportunityScore *
              MARKET_OPPORTUNITY_WEIGHT,
        )

      const disqualificationReasons:
        string[] = []

      if (
        maxAffordableUnits < 1
      ) {
        disqualificationReasons.push(
          'Insufficient cash for one whole unit after brokerage.',
        )
      } else if (
        permittedTrades.length <
        1
      ) {
        const anyUnderHardCap =
          Array.from(
            {
              length:
                maxAffordableUnits,
            },
            (_, index) =>
              index + 1,
          ).some(
            (candidateUnits) =>
              allocationForTrade(
                beforeValues,
                ticker,
                candidateUnits,
                currentPrice,
              )[ticker] <=
              hardOverweightCap +
                Number.EPSILON,
          )

        if (!anyUnderHardCap) {
          disqualificationReasons.push(
            `No additional whole unit can be purchased without exceeding the ${round(
              hardOverweightCap *
                100,
              1,
            )}% hard cap for ${ticker}.`,
          )
        } else {
          disqualificationReasons.push(
            `No guardrail-compliant trade is large enough to keep $${balances.brokerage.toFixed(
              2,
            )} brokerage at or below ${round(
              MAX_BROKERAGE_DRAG *
                100,
              0,
            )}% of the investment. Minimum efficient size is approximately ${minimumEfficientUnits} unit${
              minimumEfficientUnits ===
              1
                ? ''
                : 's'
            }.`,
          )
        }
      }

      /*
       * AI research is context only.
       * It does NOT change scoring, ranking or eligibility.
       */
      const disqualificationReason =
        disqualificationReasons.length
          ? disqualificationReasons.join(
              ' ',
            )
          : null

      const adjustedMarket = {
        ...datum,

        price: round(
          currentPrice,
          4,
        ),

        weekReturn: round(
          adjustedWeekReturn,
          3,
        ),

        monthReturn: round(
          adjustedMonthReturn,
          3,
        ),

        quarterReturn: round(
          adjustedQuarterReturn,
          3,
        ),

        high52Week: round(
          adjustedHigh52Week,
          4,
        ),

        drawdown52Week: round(
          adjustedDrawdown52Week,
          3,
        ),

        snapshotPrice: round(
          snapshotPrice,
          4,
        ),

        snapshotAsOf:
          datum.snapshotAsOf ??
          datum.asOf,

        currentPriceAsOf:
          datum.asOf,

        priceAdjustmentPct:
          snapshotPrice > 0
            ? round(
                ((currentPrice -
                  snapshotPrice) /
                  snapshotPrice) *
                  100,
                3,
              )
            : 0,

        returnsAdjustedUsingCurrentPrice:
          true,
      }

      return {
        ticker,

        units,

        maxAffordableUnits,

        minimumEfficientUnits,

        price: round(
          currentPrice,
          4,
        ),

        snapshotPrice: round(
          snapshotPrice,
          4,
        ),

        amountInvested,

        brokerageDrag:
          Number.isFinite(
            brokerageDrag,
          )
            ? round(
                brokerageDrag *
                  100,
                3,
              )
            : null,

        maxBrokerageDragPct:
          round(
            MAX_BROKERAGE_DRAG *
              100,
            2,
          ),

        brokerage:
          units > 0
            ? round(
                balances.brokerage,
              )
            : 0,

        cashUsed,

        cashRemaining,

        beforeAllocation,

        afterAllocation,

        beforeError,

        afterError,

        improvement,

        portfolioPriorityScore:
          priorityScore,

        /*
         * Alias retained so the existing API/frontend migration
         * stays backwards-compatible.
         */
        strategicScore:
          priorityScore,

        marketOpportunityScore,

        tacticalScore:
          marketOpportunityScore,

        tacticalLabel:
          opportunityLabel(
            marketOpportunityScore,
          ),

        overallScore,

        overallLabel:
          overallLabel(
            overallScore,
          ),

        scoreWeights: {
          strategic:
            PORTFOLIO_PRIORITY_WEIGHT,
          tactical:
            MARKET_OPPORTUNITY_WEIGHT,
        },

        tacticalComponents,

        hardOverweightCap,

        eligible:
          !disqualificationReason,

        disqualificationReason,

        disqualificationReasons,

        market:
          adjustedMarket,

        research:
          researchDatum,

        researchAffectsRecommendation:
          false,
      }
    },
  )

  const eligible =
    simulations.filter(
      (simulation) =>
        simulation.eligible,
    )

  if (!eligible.length) {
    throw new Error(
      'No ETF is eligible under the affordability, brokerage-efficiency and hard-overweight guardrails.',
    )
  }

  const rankedEligible = [
    ...eligible,
  ].sort(
    (a, b) =>
      b.overallScore -
        a.overallScore ||
      b.portfolioPriorityScore -
        a.portfolioPriorityScore ||
      b.marketOpportunityScore -
        a.marketOpportunityScore,
  )

  const recommendation =
    rankedEligible[0]

  const comparisons =
    simulations.map((item) => ({
      ticker:
        item.ticker,

      eligible:
        item.eligible,

      units:
        item.units,

      maxAffordableUnits:
        item.maxAffordableUnits,

      minimumEfficientUnits:
        item.minimumEfficientUnits,

      price:
        item.price,

      snapshotPrice:
        item.snapshotPrice,

      brokerageDrag:
        item.brokerageDrag,

      maxBrokerageDragPct:
        item.maxBrokerageDragPct,

      alignmentImprovement:
        round(
          item.improvement *
            100,
          3,
        ),

      beforeAllocation:
        item.beforeAllocation,

      afterAllocation:
        item.afterAllocation,

      portfolioPriorityScore:
        item.portfolioPriorityScore,

      strategicScore:
        item.strategicScore,

      marketOpportunityScore:
        item.marketOpportunityScore,

      tacticalScore:
        item.tacticalScore,

      tacticalLabel:
        item.tacticalLabel,

      overallScore:
        item.overallScore,

      overallLabel:
        item.overallLabel,

      scoreWeights:
        item.scoreWeights,

      tacticalComponents:
        item.tacticalComponents,

      hardOverweightCap:
        item.hardOverweightCap,

      disqualificationReason:
        item.disqualificationReason,

      disqualificationReasons:
        item.disqualificationReasons,

      market:
        item.market,

      research:
        item.research,

      researchAffectsRecommendation:
        false,
    }))

  return {
    generatedAt:
      new Date().toISOString(),

    targets:
      TARGETS,

    scoringModel: {
      strategicWeight:
        PORTFOLIO_PRIORITY_WEIGHT,

      tacticalWeight:
        MARKET_OPPORTUNITY_WEIGHT,

      hardOverweightBuffer:
        HARD_OVERWEIGHT_BUFFER,

      maxBrokerageDrag:
        MAX_BROKERAGE_DRAG,

      portfolioPriorityScale:
        'Absolute 0-100 applied independently to every ETF using its current pre-trade allocation and its own target. 100 = maximally underweight, 50 = exactly on target, 0 = at or beyond the hard overweight cap.',

      marketOpportunityScale:
        'Absolute 0-100 based only on live-adjusted 1W, 1M, 3M and 52W drawdown price signals. AI research does not affect the recommendation.',

      tradeSizing:
        'Underweight ETFs use the brokerage-efficient whole-unit trade that lands closest to target. ETFs already at or above target use the smallest brokerage-efficient permitted trade if market opportunity still makes them the winner.',

      currentPriceAdjustment:
        '1W, 1M, 3M and 52W drawdown are recalculated using the current/latest price at analysis time.',

      researchAffectsRecommendation:
        false,
    },

    recommendation: {
      ...recommendation,

      reason:
        `${recommendation.ticker} has the highest eligible score at ${recommendation.overallScore.toFixed(
          1,
        )}/100, combining ${recommendation.portfolioPriorityScore.toFixed(
          1,
        )}/100 portfolio priority with ${recommendation.marketOpportunityScore.toFixed(
          1,
        )}/100 market opportunity.`,
    },

    comparisons,
  }
}
