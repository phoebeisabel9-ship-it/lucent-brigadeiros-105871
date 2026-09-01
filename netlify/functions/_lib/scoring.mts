import {
  TARGETS,
  TICKERS,
  type Balances,
  type MarketDatum,
  type ResearchDatum,
  type Ticker,
} from './types.mjs'

const STRATEGIC_WEIGHT = 0.6
const TACTICAL_WEIGHT = 0.4
const HARD_OVERWEIGHT_BUFFER = 0.075
const MAX_BROKERAGE_DRAG = 0.02

const TACTICAL_WEIGHTS = {
  week: 0.3,
  month: 0.2,
  quarter: 0.1,
  drawdown52Week: 0.2,
  valuation: 0.15,
  news: 0.05,
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

/*
 * L1 distance from the target portfolio.
 *
 * Because both allocations sum to 1, the theoretical range is 0 to 2.
 * That lets the strategic score have a true absolute 0-100 meaning:
 *
 * 100 = exact target allocation
 *   0 = maximum possible distance from target
 */
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
 * Candidate Target Fit: absolute 0-100.
 *
 * 100 = this ETF lands exactly on its target after the proposed trade.
 *  50 = its post-trade weight is 50% of its target away from target.
 *   0 = its post-trade weight is at least 100% of its target away.
 *
 * Example:
 * VAS target = 10%.
 * A post-trade VAS weight of 20%+ scores 0 because it is at least
 * 100% above its target.
 */
function targetFitScore(
  ticker: Ticker,
  allocationValue: Record<Ticker, number>,
) {
  const target = TARGETS[ticker]

  if (target <= 0) return 0

  const relativeDeviation =
    Math.abs(
      allocationValue[ticker] -
        target,
    ) / target

  return round(
    clamp(
      (1 - relativeDeviation) *
        100,
      0,
      100,
    ),
  )
}

/*
 * Converts a return into a 0-100 "sale" score.
 *
 * Example for the 1W signal:
 * +5% = 0
 *  0% = 50
 * -5% = 100
 */
function returnOpportunityScore(
  returnPct: number,
  fullSignalAt: number,
) {
  return round(
    clamp(
      50 -
        (returnPct / fullSignalAt) * 50,
      0,
      100,
    ),
  )
}

/*
 * 52W drawdown sale score:
 *  0% drawdown = 0
 *  7.5% down   = 50
 * 15%+ down    = 100
 */
function drawdownOpportunityScore(
  drawdownPct: number,
) {
  return round(
    clamp((drawdownPct / 15) * 100, 0, 100),
  )
}

/*
 * Research scores are supplied on a -2 to +2 scale.
 *
 * -2 = very unattractive
 *  0 = neutral
 * +2 = very attractive
 */
function researchOpportunityScore(
  score: number,
) {
  return round(
    clamp(((score + 2) / 4) * 100, 0, 100),
  )
}

/*
 * The daily snapshot contains:
 * - snapshot price
 * - 1W / 1M / 3M returns measured at that snapshot price
 *
 * Analyse later supplies the current/latest price.
 *
 * From the cached return we can infer the period-start reference price,
 * then recalculate the return using the current price.
 */
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

function tacticalLabel(score: number) {
  if (score >= 85) {
    return 'Exceptional opportunity'
  }

  if (score >= 70) {
    return 'Strong opportunity'
  }

  if (score >= 55) {
    return 'Moderate opportunity'
  }

  if (score >= 45) {
    return 'Neutral'
  }

  if (score >= 30) {
    return 'Limited opportunity'
  }

  return 'Low opportunity'
}

function overallLabel(score: number) {
  if (score >= 85) {
    return 'Very strong'
  }

  if (score >= 70) {
    return 'Strong'
  }

  if (score >= 55) {
    return 'Moderate'
  }

  if (score >= 40) {
    return 'Weak'
  }

  return 'Very weak'
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
            TACTICAL_WEIGHTS.week,
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
            TACTICAL_WEIGHTS.month,
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
            TACTICAL_WEIGHTS.quarter,
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
            TACTICAL_WEIGHTS.drawdown52Week,
        },

        valuation: {
          rawValue:
            researchDatum.valuationScore,
          score:
            researchOpportunityScore(
              researchDatum.valuationScore,
            ),
          weight:
            TACTICAL_WEIGHTS.valuation,
        },

        news: {
          rawValue:
            researchDatum.newsScore,
          score:
            researchOpportunityScore(
              researchDatum.newsScore,
            ),
          weight:
            TACTICAL_WEIGHTS.news,
        },
      }

      const tacticalScore = round(
        tacticalComponents.week.score *
          tacticalComponents.week.weight +
          tacticalComponents.month.score *
            tacticalComponents.month.weight +
          tacticalComponents.quarter.score *
            tacticalComponents.quarter.weight +
          tacticalComponents.drawdown52Week
            .score *
            tacticalComponents
              .drawdown52Week.weight +
          tacticalComponents.valuation.score *
            tacticalComponents.valuation
              .weight +
          tacticalComponents.news.score *
            tacticalComponents.news.weight,
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

      /*
       * Start with the maximum affordable whole-unit trade.
       * If that would breach the hard portfolio cap, step the
       * unit count down until the largest permitted trade is found.
       */
      let units =
        maxAffordableUnits

      while (units > 0) {
        const testAmount =
          units * currentPrice

        const testValues = {
          ...beforeValues,
          [ticker]:
            beforeValues[ticker] +
            testAmount,
        }

        const testAllocation =
          allocation(testValues)

        if (
          testAllocation[ticker] <=
          hardOverweightCap +
            Number.EPSILON
        ) {
          break
        }

        units -= 1
      }

      const amountInvested =
        round(
          units * currentPrice,
        )

      const brokerageDrag =
        amountInvested > 0
          ? balances.brokerage /
            amountInvested
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

      const afterValues = {
        ...beforeValues,
        [ticker]:
          beforeValues[ticker] +
          amountInvested,
      }

      const afterAllocation =
        allocation(afterValues)

      const afterError =
        alignmentError(afterAllocation)

      const beforeStrategicScore =
        targetFitScore(
          ticker,
          beforeAllocation,
        )

      const strategicScore =
        targetFitScore(
          ticker,
          afterAllocation,
        )

      const overallScore =
        round(
          strategicScore *
            STRATEGIC_WEIGHT +
            tacticalScore *
              TACTICAL_WEIGHT,
        )

      const improvement =
        beforeError - afterError

      const disqualificationReasons:
        string[] = []

      if (
        maxAffordableUnits < 1
      ) {
        disqualificationReasons.push(
          'Insufficient cash for one whole unit after brokerage.',
        )
      } else if (units < 1) {
        disqualificationReasons.push(
          `No additional whole unit can be purchased without exceeding the ${round(
            hardOverweightCap * 100,
            1,
          )}% hard cap for ${ticker}.`,
        )
      }

      if (
        units > 0 &&
        brokerageDrag >
          MAX_BROKERAGE_DRAG
      ) {
        disqualificationReasons.push(
          `The largest guardrail-compliant trade is only ${units} whole unit${units === 1 ? '' : 's'} ($${amountInvested.toFixed(
            2,
          )}), making $${balances.brokerage.toFixed(
            2,
          )} brokerage ${round(
            brokerageDrag * 100,
            2,
          )}% of the investment — above the ${round(
            MAX_BROKERAGE_DRAG *
              100,
            0,
          )}% efficiency limit.`,
        )
      }

      if (
        researchDatum.thesisDisqualified
      ) {
        disqualificationReasons.push(
          'Material thesis-changing negative development identified.',
        )
      }

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

        beforeStrategicScore,

        strategicScore,

        tacticalScore,

        tacticalLabel:
          tacticalLabel(
            tacticalScore,
          ),

        overallScore,

        overallLabel:
          overallLabel(
            overallScore,
          ),

        scoreWeights: {
          strategic:
            STRATEGIC_WEIGHT,
          tactical:
            TACTICAL_WEIGHT,
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
      'No ETF is eligible under the affordability, brokerage-efficiency, thesis and hard-overweight guardrails.',
    )
  }

  const rankedEligible = [
    ...eligible,
  ].sort(
    (a, b) =>
      b.overallScore -
        a.overallScore ||
      b.strategicScore -
        a.strategicScore ||
      b.tacticalScore -
        a.tacticalScore,
  )

  const recommendation =
    rankedEligible[0]

  const comparisons =
    simulations.map((item) => {
      let whyItLost: string

      if (
        item.ticker ===
        recommendation.ticker
      ) {
        whyItLost =
          'Recommended.'
      } else if (!item.eligible) {
        whyItLost =
          item.disqualificationReason ??
          'Disqualified by a portfolio guardrail.'
      } else {
        whyItLost =
          `${recommendation.ticker} scored ${recommendation.overallScore}/100 overall versus ${item.overallScore}/100 for ${item.ticker}.`
      }

      return {
        ticker: item.ticker,

        eligible:
          item.eligible,

        units:
          item.units,

        maxAffordableUnits:
          item.maxAffordableUnits,

        price:
          item.price,

        brokerageDrag:
          item.brokerageDrag,

        maxBrokerageDragPct:
          item.maxBrokerageDragPct,

        snapshotPrice:
          item.snapshotPrice,

        alignmentImprovement:
          round(
            item.improvement * 100,
            3,
          ),

        beforeAllocation:
          item.beforeAllocation,

        afterAllocation:
          item.afterAllocation,

        beforeStrategicScore:
          item.beforeStrategicScore,

        strategicScore:
          item.strategicScore,

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

        whyItLost,

        market:
          item.market,

        research:
          item.research,
      }
    })

  return {
    generatedAt:
      new Date().toISOString(),

    targets:
      TARGETS,

    scoringModel: {
      strategicWeight:
        STRATEGIC_WEIGHT,

      tacticalWeight:
        TACTICAL_WEIGHT,

      hardOverweightBuffer:
        HARD_OVERWEIGHT_BUFFER,

      maxBrokerageDrag:
        MAX_BROKERAGE_DRAG,

      tradeSizing:
        'For each ETF, use the largest whole-unit trade that fits both available cash and the hard overweight cap; then require brokerage to be no more than 2% of the amount invested.',

      strategicScale:
        'Absolute Target Fit 0-100 applied independently to every ETF using that ETF’s own target. 100 means the candidate lands exactly on its target after the proposed trade; 0 means it is at least 100% of its target away from target.',

      tacticalScale:
        'Absolute 0-100. 50 is broadly neutral; 100 is an exceptional tactical opportunity.',

      currentPriceAdjustment:
        '1W, 1M, 3M and 52W drawdown are recalculated using the current/latest price at analysis time.',
    },

    recommendation: {
      ...recommendation,

      reason:
        `${recommendation.ticker} has the highest eligible score at ${recommendation.overallScore.toFixed(
          1,
        )}/100, combining ${recommendation.strategicScore.toFixed(
          1,
        )}/100 target fit with ${recommendation.tacticalScore.toFixed(
          1,
        )}/100 market opportunity.`,

      whyItBeatAlternatives:
        comparisons
          .filter(
            (item) =>
              item.ticker !==
              recommendation.ticker,
          )
          .map((item) => ({
            ticker:
              item.ticker,

            reason:
              item.whyItLost,
          })),
    },

    comparisons,
  }
}
