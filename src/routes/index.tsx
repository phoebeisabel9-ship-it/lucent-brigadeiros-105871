import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  WalletCards,
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: Home })

const TICKERS = ['IVV', 'DHHF', 'VEU', 'VAS', 'VESG'] as const
type Ticker = (typeof TICKERS)[number]

type Balances = Record<Ticker, number> & {
  cash: number
  brokerage: number
}

type Allocation = Record<Ticker, number>

type Research = {
  valuationScore: number
  newsScore: number
  thesisDisqualified: boolean
  valuationContext: string
  developments: string
  newsSummary: string
  citations: Array<{
    title: string
    url: string
  }>
}

type Market = {
  weekReturn: number
  monthReturn: number
  quarterReturn: number
  high52Week: number
  drawdown52Week: number
  asOf: string
}

type Comparison = {
  ticker: Ticker
  eligible: boolean
  units: number
  price: number
  alignmentImprovement: number
  strategicScore: number
  tacticalScore: number
  overallScore: number
  disqualificationReason: string | null
  whyItLost: string
  market: Market
  research: Research
}

type Recommendation = Comparison & {
  amountInvested: number
  brokerage: number
  cashUsed: number
  cashRemaining: number
  beforeAllocation: Allocation
  afterAllocation: Allocation
  reason: string
  whyItBeatAlternatives: Array<{
    ticker: Ticker
    reason: string
  }>
}

type DataStatus = {
  researchGeneratedAt: string
  researchAgeHours: number
  researchFresh: boolean
  marketMetricsAvailable: boolean
  researchAvailable: boolean
  tacticalInputsAvailable: boolean
  currentPricesAvailable: boolean
}

type Analysis = {
  generatedAt: string
  targets: Allocation
  recommendation: Recommendation
  comparisons: Comparison[]
  dataStatus?: DataStatus
}

type RefreshStatus = {
  status?: 'not-started' | 'running' | 'failed' | 'success'
  step?: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  snapshotGeneratedAt?: string
  error?: string | null
  updatedAt?: string
}

type SnapshotStatus = {
  available: boolean
  message?: string
  error?: string
  generatedAt?: string
  ageHours?: number
  marketTickers?: string[]
  researchTickers?: string[]
  marketComplete?: boolean
  researchComplete?: boolean
  refreshStatus?: RefreshStatus | null
}

type DailyResearchState =
  | 'checking'
  | 'refreshing'
  | 'ready'
  | 'stale'
  | 'failed'

type Trade = {
  id: string
  ticker: string
  units: number
  unitPrice: string
  amountInvested: string
  createdAt: string
}

const defaults: Balances = {
  IVV: 1072,
  DHHF: 797,
  VEU: 598,
  VAS: 1129,
  VESG: 713,
  cash: 526.88,
  brokerage: 5.5,
}

const targets: Allocation = {
  IVV: 0.35,
  DHHF: 0.3,
  VEU: 0.15,
  VAS: 0.1,
  VESG: 0.1,
}

const labels: Record<Ticker, string> = {
  IVV: 'S&P 500',
  DHHF: 'Diversified High Growth',
  VEU: 'All-World ex-US',
  VAS: 'Australian Shares',
  VESG: 'Ethical International',
}

const tickerColors: Record<Ticker, string> = {
  IVV: '#6F8FB3',
  DHHF: '#D98C7C',
  VEU: '#D8B25C',
  VAS: '#A98BB8',
  VESG: '#7FA6A1',
}

const money = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 2,
})

const percent = (value: number, digits = 1) =>
  `${(value * 100).toFixed(digits)}%`

const signed = (value: number) =>
  `${value > 0 ? '+' : ''}${value.toFixed(2)}%`

function sydneyDateKey(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)

  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function isSydneyToday(timestamp?: string) {
  if (!timestamp) return false
  return sydneyDateKey(timestamp) === sydneyDateKey()
}

function formatSydneyTimestamp(timestamp?: string) {
  if (!timestamp) return 'unknown time'

  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function targetStatus(
  current: number,
  target: number,
) {
  const difference = current - target
  const absoluteDifference = Math.abs(difference)

  if (absoluteDifference < 0.005) {
    return {
      label: '✓ On target',
      color: '#4E7A63',
    }
  }

  if (difference > 0) {
    return {
      label: `↑ Over ${percent(absoluteDifference)}`,
      color: '#B7783F',
    }
  }

  return {
    label: `↓ Under ${percent(absoluteDifference)}`,
    color: '#C35F5F',
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch (error) {
    throw new Error(
      `Could not reach the server: ${
        error instanceof Error ? error.message : 'Network error'
      }`,
    )
  }

  const text = await response.text()

  if (!response.ok) {
    let message = text

    try {
      const parsed = JSON.parse(text)

      message =
        parsed.error ||
        parsed.message ||
        parsed.details ||
        text
    } catch {
      // The server returned plain text or HTML.
    }

    throw new Error(
      `HTTP ${response.status}: ${
        message ||
        response.statusText ||
        'Unknown server error'
      }`,
    )
  }

  if (!text) {
    throw new Error(
      'The server returned an empty response.',
    )
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      `The server returned an invalid response: ${text.slice(0, 500)}`,
    )
  }
}

function Home() {
  const [balances, setBalances] = useState<Balances>(defaults)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [history, setHistory] = useState<Trade[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [snapshotStatus, setSnapshotStatus] =
    useState<SnapshotStatus | null>(null)
  const [dailyResearchState, setDailyResearchState] =
    useState<DailyResearchState>('checking')
  const [dailyResearchMessage, setDailyResearchMessage] =
    useState("Checking today's market research…")
  const refreshCheckStarted = useRef(false)

  /*
   * Load your previously saved balances and trade history
   * from this browser when the app opens.
   */
  useEffect(() => {
    try {
      const savedBalances = localStorage.getItem('etf-buyer-balances')
      const savedHistory = localStorage.getItem('etf-buyer-history')

      if (savedBalances) {
        setBalances({
          ...defaults,
          ...JSON.parse(savedBalances),
        })
      }

      if (savedHistory) {
        setHistory(JSON.parse(savedHistory))
      }
    } catch {
      // If browser storage contains invalid data,
      // simply fall back to the defaults.
    }
  }, [])

  /*
   * Automatically remember balance changes in this browser.
   */
  useEffect(() => {
    try {
      localStorage.setItem(
        'etf-buyer-balances',
        JSON.stringify(balances),
      )
    } catch {
      // Ignore browser storage errors.
    }
  }, [balances])

  async function readSnapshotStatus() {
    const status = await api<SnapshotStatus>('/api/snapshot-status')
    setSnapshotStatus(status)
    return status
  }

  async function pollForTodaySnapshot() {
    for (let attempt = 0; attempt < 72; attempt += 1) {
      await wait(5_000)

      const status = await readSnapshotStatus()

      if (
        status.available &&
        status.generatedAt &&
        isSydneyToday(status.generatedAt)
      ) {
        setDailyResearchState('ready')
        setDailyResearchMessage(
          `Today's tactical research is ready · updated ${formatSydneyTimestamp(
            status.generatedAt,
          )}.`,
        )
        return
      }

      if (status.refreshStatus?.status === 'failed') {
        if (status.available && status.generatedAt) {
          setDailyResearchState('stale')
          setDailyResearchMessage(
            `Today's refresh failed, so the model will use the last successful research from ${formatSydneyTimestamp(
              status.generatedAt,
            )}.`,
          )
        } else {
          setDailyResearchState('failed')
          setDailyResearchMessage(
            status.refreshStatus.error
              ? `Today's research refresh failed: ${status.refreshStatus.error}`
              : "Today's research refresh failed.",
          )
        }
        return
      }
    }

    const status = await readSnapshotStatus().catch(() => null)

    if (status?.available && status.generatedAt) {
      setDailyResearchState('stale')
      setDailyResearchMessage(
        `Today's refresh is taking longer than expected. The model can still use the last successful research from ${formatSydneyTimestamp(
          status.generatedAt,
        )}.`,
      )
    } else {
      setDailyResearchState('failed')
      setDailyResearchMessage(
        "Today's research refresh is taking longer than expected. Please reload the page to try again.",
      )
    }
  }

  async function triggerDailyRefresh() {
    setDailyResearchState('refreshing')
    setDailyResearchMessage(
      "Refreshing today's market metrics, valuation and 7-day news research…",
    )

    try {
      const response = await fetch(
        '/.netlify/functions/refresh-research',
        {
          method: 'GET',
        },
      )

      if (response.status !== 202 && !response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(
          `Could not start today's research refresh: HTTP ${response.status} ${
            text || response.statusText
          }`,
        )
      }

      await pollForTodaySnapshot()
    } catch (refreshError) {
      const status = await readSnapshotStatus().catch(() => null)

      if (status?.available && status.generatedAt) {
        setDailyResearchState('stale')
        setDailyResearchMessage(
          `Today's refresh could not be started. The model will use the last successful research from ${formatSydneyTimestamp(
            status.generatedAt,
          )}.`,
        )
      } else {
        setDailyResearchState('failed')
        setDailyResearchMessage(
          refreshError instanceof Error
            ? refreshError.message
            : "Today's research refresh could not be started.",
        )
      }
    }
  }

  async function ensureTodayResearch() {
    setDailyResearchState('checking')
    setDailyResearchMessage("Checking today's market research…")

    try {
      const status = await readSnapshotStatus()

      if (
        status.available &&
        status.generatedAt &&
        isSydneyToday(status.generatedAt) &&
        status.marketComplete &&
        status.researchComplete
      ) {
        setDailyResearchState('ready')
        setDailyResearchMessage(
          `Today's tactical research is ready · updated ${formatSydneyTimestamp(
            status.generatedAt,
          )}.`,
        )
        return
      }

      if (status.refreshStatus?.status === 'running') {
        setDailyResearchState('refreshing')
        setDailyResearchMessage(
          "Today's research refresh is already running…",
        )
        await pollForTodaySnapshot()
        return
      }

      await triggerDailyRefresh()
    } catch (statusError) {
      setDailyResearchState('failed')
      setDailyResearchMessage(
        statusError instanceof Error
          ? statusError.message
          : 'Could not check daily research status.',
      )
    }
  }

  useEffect(() => {
    if (refreshCheckStarted.current) return
    refreshCheckStarted.current = true
    void ensureTodayResearch()
  }, [])

  const totalPortfolio = useMemo(
    () =>
      TICKERS.reduce(
        (sum, ticker) => sum + balances[ticker],
        0,
      ),
    [balances],
  )

  async function analyse() {
    setLoading(true)
    setError('')
    setNotice('')

    try {
      localStorage.setItem(
        'etf-buyer-balances',
        JSON.stringify(balances),
      )

      const result = await api<Analysis>('/api/analyse', {
        method: 'POST',
        body: JSON.stringify(balances),
      })

      setAnalysis(result)
      setNotice('')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Analysis failed',
      )
    } finally {
      setLoading(false)
    }
  }

  async function saveTrade() {
    if (!analysis) return

    setSaving(true)
    setError('')

    try {
      const recommendation = analysis.recommendation

      const savedTrade: Trade = {
        id: crypto.randomUUID(),
        ticker: recommendation.ticker,
        units: recommendation.units,
        unitPrice: String(recommendation.price),
        amountInvested: String(
          recommendation.amountInvested,
        ),
        createdAt: new Date().toISOString(),
      }

      setHistory((current) => {
        const updated = [savedTrade, ...current]

        localStorage.setItem(
          'etf-buyer-history',
          JSON.stringify(updated),
        )

        return updated
      })

      setNotice(
        `${recommendation.ticker} trade saved to history.`,
      )
    } catch {
      setError('Trade could not be saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="app-shell">
      <style>{`
        .allocation-pair-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 22px;
        }

        .allocation-pair-grid .allocation-card {
          min-height: 0;
        }

        .research-full-card {
          margin-top: 22px;
        }

        .research-full-card .panel-heading {
          margin-bottom: 6px;
        }

        .research-full-card .research-line {
          padding: 22px 0;
        }

        .research-full-card .research-line p {
          font-size: 15px;
          line-height: 1.65;
          max-width: 1100px;
        }

        .research-full-card .citations {
          margin-top: 8px;
        }

        .research-updated-note {
          color: #627269;
          font-size: 13px;
          line-height: 1.4;
          margin: 6px 0 0;
        }

        .allocation-row > div > i {
          transition: width 220ms ease;
        }

        @media (max-width: 760px) {
          .allocation-pair-grid {
            grid-template-columns: 1fr;
          }

          .research-full-card .research-line p {
            font-size: 14px;
          }
        }
      `}</style>

      <header className="topbar">
        <a
          className="brand"
          href="#top"
          aria-label="ETF Buyer home"
        >
          <span className="brand-mark">
            <BarChart3 size={19} />
          </span>

          <span>ETF Buyer</span>
        </a>

        <div className="topbar-actions">
          <span className="private-pill">
            <ShieldCheck size={14} />
            Personal calculator
          </span>
        </div>
      </header>

      <div className="page" id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">
              <Sparkles size={14} />
              Contribution decision engine
            </p>

            <h1>
              One contribution.
              <br />
              <em>One clear buy.</em>
            </h1>

            <p className="hero-copy">
              A strategic-first recommendation for your next
              whole-unit ETF purchase, informed by current ASX
              data and cited market research.
            </p>
          </div>

          <div className="target-card">
            <div className="target-card-head">
              <span>Fixed target</span>
              <span>100%</span>
            </div>

            <div
              className="target-strip"
              aria-label="Target allocation"
            >
              {TICKERS.map((ticker) => (
                <span
                  key={ticker}
                  style={{
                    width: `${targets[ticker] * 100}%`,
                    backgroundColor: tickerColors[ticker],
                  }}
                />
              ))}
            </div>

            <div className="target-list">
              {TICKERS.map((ticker) => (
                <div key={ticker}>
                  <i
                    className={`dot dot-${ticker.toLowerCase()}`}
                    style={{ backgroundColor: tickerColors[ticker] }}
                  />

                  <span>{ticker}</span>

                  <strong>
                    {percent(targets[ticker], 0)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <div className="panel input-panel">
            <div className="panel-heading">
              <div>
                <p className="kicker">
                  Portfolio snapshot
                </p>

                <h2>Current balances</h2>
              </div>

              <span className="total-label">
                {money.format(totalPortfolio)}
              </span>
            </div>

            <div className="balance-grid">
              {TICKERS.map((ticker) => (
                <label
                  className="money-field"
                  key={ticker}
                >
                  <span>
                    <strong>{ticker}</strong>
                    <small>{labels[ticker]}</small>
                  </span>

                  <div>
                    <i>$</i>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={balances[ticker]}
                      onChange={(event) =>
                        setBalances({
                          ...balances,
                          [ticker]: Number(
                            event.target.value,
                          ),
                        })
                      }
                    />
                  </div>
                </label>
              ))}
            </div>

            <div className="cash-row">
              <label className="money-field accent-field">
                <span>
                  <strong>Cash available</strong>
                  <small>For this contribution</small>
                </span>

                <div>
                  <i>$</i>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={balances.cash}
                    onChange={(event) =>
                      setBalances({
                        ...balances,
                        cash: Number(
                          event.target.value,
                        ),
                      })
                    }
                  />
                </div>
              </label>

              <label className="money-field">
                <span>
                  <strong>Brokerage</strong>
                  <small>Charged once</small>
                </span>

                <div>
                  <i>$</i>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={balances.brokerage}
                    onChange={(event) =>
                      setBalances({
                        ...balances,
                        brokerage: Number(
                          event.target.value,
                        ),
                      })
                    }
                  />
                </div>
              </label>
            </div>

            <div
              className={`message ${
                dailyResearchState === 'failed'
                  ? 'error-message'
                  : 'success-message'
              }`}
            >
              {dailyResearchState === 'checking' ||
              dailyResearchState === 'refreshing' ? (
                <LoaderCircle className="spin" size={16} />
              ) : dailyResearchState === 'ready' ? (
                <Check size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              {dailyResearchMessage}
            </div>

            <button
              className="analyse-button"
              onClick={() => void analyse()}
              disabled={
                loading ||
                dailyResearchState === 'checking' ||
                dailyResearchState === 'refreshing' ||
                (dailyResearchState === 'failed' &&
                  !snapshotStatus?.available)
              }
            >
              {loading ? (
                <>
                  <LoaderCircle
                    className="spin"
                    size={19}
                  />
                  Calculating recommendation
                </>
              ) : dailyResearchState === 'checking' ||
                dailyResearchState === 'refreshing' ? (
                <>
                  <LoaderCircle
                    className="spin"
                    size={19}
                  />
                  Preparing daily research
                </>
              ) : (
                <>
                  Analyse contribution
                  <ArrowRight size={19} />
                </>
              )}
            </button>

            <p className="secure-note">
              <LockKeyhole size={13} />
              Balances are stored only in this browser. Daily tactical
              research is refreshed once when you use the app; current ETF
              prices refresh when you analyse.
            </p>
          </div>

          <aside className="method-card">
            <p className="kicker">Decision policy</p>

            <h3>Strategy stays in control.</h3>

            <div className="weight-row">
              <span>Strategic alignment</span>
              <strong>80%</strong>
            </div>

            <div className="weight-track">
              <span style={{ width: '80%' }} />
            </div>

            <div className="weight-row">
              <span>Market opportunity</span>
              <strong>20%</strong>
            </div>

            <div className="weight-track tactical">
              <span style={{ width: '20%' }} />
            </div>

            <p>
              A dip can improve an eligible ETF’s rank,
              but cannot rescue a trade that moves the
              portfolio further from target.
            </p>

            <div className="guardrail">
              <ShieldCheck size={18} />

              <span>
                <strong>Hard guardrail</strong>
                Worse alignment means disqualified.
              </span>
            </div>
          </aside>
        </section>

        {error && (
          <div className="message error-message">
            {error}
          </div>
        )}

        {notice && (
          <div className="message success-message">
            <Check size={16} />
            {notice}
          </div>
        )}

        {loading && <AnalysisSkeleton />}

        {analysis && !loading && (
          <Results
            analysis={analysis}
            onSave={() => void saveTrade()}
            saving={saving}
          />
        )}

        <TradeHistory trades={history} />
      </div>
    </main>
  )
}

function Results({
  analysis,
  onSave,
  saving,
}: {
  analysis: Analysis
  onSave: () => void
  saving: boolean
}) {
  const recommendation = analysis.recommendation

  return (
    <section className="results-section">
      <div className="result-hero">
        <div className="buy-copy">
          <p className="eyebrow">
            <Check size={14} />
            Highest eligible score
          </p>

          <h2>
            <span>BUY</span>{' '}
            {recommendation.ticker}
          </h2>

          <p>{recommendation.reason}</p>

          <button
            onClick={onSave}
            disabled={saving}
          >
            {saving ? (
              <LoaderCircle
                className="spin"
                size={18}
              />
            ) : (
              <Save size={18} />
            )}

            Save trade
          </button>
        </div>

        <div className="units-card">
          <span>Whole units</span>

          <strong>
            {recommendation.units}
          </strong>

          <small>
            @ {money.format(recommendation.price)}
          </small>
        </div>

        <div className="score-orbit">
          <div>
            <strong>
              {recommendation.overallScore.toFixed(
                1,
              )}
            </strong>

            <span>Overall</span>
          </div>

          <small>80 / 20 weighted</small>
        </div>
      </div>

      <div className="metrics-row">
        <Metric
          label="Amount invested"
          value={money.format(
            recommendation.amountInvested,
          )}
        />

        <Metric
          label="Brokerage"
          value={money.format(
            recommendation.brokerage,
          )}
        />

        <Metric
          label="Cash used"
          value={money.format(
            recommendation.cashUsed,
          )}
        />

        <Metric
          label="Cash remaining"
          value={money.format(
            recommendation.cashRemaining,
          )}
        />

        <Metric
          label="Strategic score"
          value={recommendation.strategicScore.toFixed(
            1,
          )}
        />

        <Metric
          label="Tactical score"
          value={recommendation.tacticalScore.toFixed(
            1,
          )}
        />
      </div>

      <div className="allocation-pair-grid">
        <AllocationCard
          title="Allocation before"
          allocation={recommendation.beforeAllocation}
        />

        <AllocationCard
          title="Allocation after"
          allocation={recommendation.afterAllocation}
          target={analysis.targets}
        />
      </div>

      <div className="panel research-card research-full-card">
        <div className="panel-heading">
          <div>
            <p className="kicker">
              Daily tactical research
            </p>

            <h3>
              {recommendation.ticker} context
            </h3>

            {analysis.dataStatus?.researchGeneratedAt && (
              <p className="research-updated-note">
                Market metrics + research updated{' '}
                {formatSydneyTimestamp(
                  analysis.dataStatus.researchGeneratedAt,
                )}. Current ETF prices refreshed for this analysis.
              </p>
            )}
          </div>

          <span className="live-badge">
            Daily
          </span>
        </div>

        <ResearchLine
          title="Valuation"
          score={recommendation.research.valuationScore}
          text={recommendation.research.valuationContext}
        />

        <ResearchLine
          title="Developments"
          text={recommendation.research.developments}
        />

        <ResearchLine
          title="7-day news"
          score={recommendation.research.newsScore}
          text={recommendation.research.newsSummary}
        />

        <div className="citations">
          {recommendation.research.citations.map(
            (citation) => (
              <a
                key={citation.url}
                href={citation.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={13} />
                {citation.title}
              </a>
            ),
          )}
        </div>
      </div>

      <div className="panel comparison-panel">
        <div className="panel-heading">
          <div>
            <p className="kicker">
              Every candidate
            </p>

            <h3>Trade comparison</h3>
          </div>

          <span className="as-of">
            As of{' '}
            {new Date(
              analysis.generatedAt,
            ).toLocaleString('en-AU')}
          </span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ETF</th>
                <th>Trade</th>
                <th>1W</th>
                <th>1M</th>
                <th>3M</th>
                <th>52W DD</th>
                <th>Strategic</th>
                <th>Tactical</th>
                <th>Overall</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {analysis.comparisons.map(
                (item) => (
                  <tr
                    key={item.ticker}
                    className={
                      item.ticker ===
                      recommendation.ticker
                        ? 'recommended-row'
                        : ''
                    }
                  >
                    <td>
                      <strong>
                        {item.ticker}
                      </strong>

                      <small>
                        {labels[item.ticker]}
                      </small>
                    </td>

                    <td>
                      {item.units} @{' '}
                      {money.format(item.price)}
                    </td>

                    <td
                      className={
                        item.market.weekReturn < 0
                          ? 'dip'
                          : ''
                      }
                    >
                      {signed(
                        item.market.weekReturn,
                      )}
                    </td>

                    <td
                      className={
                        item.market.monthReturn < 0
                          ? 'dip'
                          : ''
                      }
                    >
                      {signed(
                        item.market.monthReturn,
                      )}
                    </td>

                    <td
                      className={
                        item.market.quarterReturn <
                        0
                          ? 'dip'
                          : ''
                      }
                    >
                      {signed(
                        item.market.quarterReturn,
                      )}
                    </td>

                    <td>
                      {item.market.drawdown52Week.toFixed(
                        2,
                      )}
                      %
                    </td>

                    <td>
                      {item.strategicScore.toFixed(
                        1,
                      )}
                    </td>

                    <td>
                      {item.tacticalScore.toFixed(
                        1,
                      )}
                    </td>

                    <td>
                      <strong>
                        {item.overallScore.toFixed(
                          1,
                        )}
                      </strong>
                    </td>

                    <td>
                      {item.eligible ? (
                        <span className="eligible">
                          Eligible
                        </span>
                      ) : (
                        <span className="disqualified">
                          Disqualified
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <div className="why-list">
          <h4>
            Why {recommendation.ticker} beat
            each alternative
          </h4>

          {recommendation.whyItBeatAlternatives.map(
            (item) => (
              <div key={item.ticker}>
                <span>{item.ticker}</span>
                <p>{item.reason}</p>
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function AllocationCard({
  title,
  allocation,
  target,
}: {
  title: string
  allocation: Allocation
  target?: Allocation
}) {
  return (
    <div className="panel allocation-card">
      <p className="kicker">
        Portfolio mix
      </p>

      <h3>{title}</h3>

      {TICKERS.map((ticker) => (
        <div
          className="allocation-row"
          key={ticker}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <i
              aria-hidden="true"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '999px',
                backgroundColor: tickerColors[ticker],
                flex: '0 0 auto',
              }}
            />
            {ticker}
          </span>

          <div>
            <i
              style={{
                width: `${Math.min(
                  100,
                  allocation[ticker] * 240,
                )}%`,
                backgroundColor: tickerColors[ticker],
              }}
            />
          </div>

          <strong>
            {percent(allocation[ticker])}
          </strong>

          {target && (() => {
            const status = targetStatus(
              allocation[ticker],
              target[ticker],
            )

            return (
              <small
                style={{
                  color: status.color,
                  fontWeight: 600,
                }}
              >
                {status.label}
              </small>
            )
          })()}
        </div>
      ))}
    </div>
  )
}

function ResearchLine({
  title,
  text,
  score,
}: {
  title: string
  text: string
  score?: number
}) {
  return (
    <div className="research-line">
      <div>
        <strong>{title}</strong>

        {score !== undefined && (
          <span
            className={
              score >= 0
                ? 'positive-score'
                : 'negative-score'
            }
          >
            {score > 0 ? '+' : ''}
            {score}
          </span>
        )}
      </div>

      <p>{text}</p>
    </div>
  )
}

function TradeHistory({
  trades,
}: {
  trades: Trade[]
}) {
  return (
    <section className="history-section">
      <div className="section-title">
        <div>
          <p className="kicker">
            Saved decisions
          </p>

          <h2>Trade history</h2>
        </div>

        <Clock3 size={21} />
      </div>

      {trades.length ? (
        <div className="history-list">
          {trades.map((trade) => (
            <div key={trade.id}>
              <span className="history-ticker">
                {trade.ticker}
              </span>

              <p>
                <strong>
                  {trade.units} units
                </strong>{' '}
                at{' '}
                {money.format(
                  Number(trade.unitPrice),
                )}
              </p>

              <span>
                {money.format(
                  Number(
                    trade.amountInvested,
                  ),
                )}
              </span>

              <time>
                {new Date(
                  trade.createdAt,
                ).toLocaleDateString(
                  'en-AU',
                  {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  },
                )}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-history">
          <WalletCards size={24} />

          <p>
            Saved recommendations appear here
            after you record a trade.
          </p>
        </div>
      )}
    </section>
  )
}

function AnalysisSkeleton() {
  return (
    <section className="analysis-loading">
      <div>
        <RefreshCw
          className="spin"
          size={20}
        />

        <span>
          Refreshing current ETF prices
        </span>
      </div>

      <div>
        <TrendingDown size={20} />

        <span>
          Loading daily tactical inputs
        </span>
      </div>

      <div>
        <Sparkles size={20} />

        <span>
          Scoring one-trade candidates
        </span>
      </div>

      <ChevronDown
        className="pulse"
        size={20}
      />
    </section>
  )
}
