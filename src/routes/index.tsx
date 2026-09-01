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
  snapshotPrice?: number
  snapshotAsOf?: string
  currentPriceAsOf?: string
  priceAdjustmentPct?: number
  returnsAdjustedUsingCurrentPrice?: boolean
}

type TacticalComponent = {
  rawValue: number
  score: number
  weight: number
}

type TacticalComponents = {
  week: TacticalComponent
  month: TacticalComponent
  quarter: TacticalComponent
  drawdown52Week: TacticalComponent
}

type Comparison = {
  ticker: Ticker
  eligible: boolean
  units: number
  maxAffordableUnits?: number
  price: number
  snapshotPrice?: number
  brokerageDrag?: number | null
  maxBrokerageDragPct?: number
  alignmentImprovement: number
  beforeAllocation?: Allocation
  afterAllocation?: Allocation
  beforeStrategicScore?: number
  portfolioPriorityScore?: number
  strategicScore: number
  marketOpportunityScore?: number
  tacticalScore: number
  tacticalLabel?: string
  overallScore: number
  overallLabel?: string
  scoreWeights?: {
    strategic: number
    tactical: number
  }
  tacticalComponents?: TacticalComponents
  hardOverweightCap?: number
  disqualificationReason: string | null
  disqualificationReasons?: string[]
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
  currentPriceFeedsTacticalScore?: boolean
}

type Analysis = {
  generatedAt: string
  targets: Allocation
  recommendation: Recommendation
  comparisons: Comparison[]
  dataStatus?: DataStatus
  scoringModel?: {
    strategicWeight: number
    tacticalWeight: number
    hardOverweightBuffer: number
    maxBrokerageDrag?: number
    tradeSizing?: string
    strategicScale?: string
    tacticalScale?: string
    portfolioPriorityScale?: string
    marketOpportunityScale?: string
    currentPriceAdjustment?: string
    researchAffectsRecommendation?: boolean
  }
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

function friendlyTacticalLabel(label?: string) {
  if (!label) return ''

  const replacements: Record<string, string> = {
    Unattractive: 'Limited opportunity',
    'Very unattractive': 'Low opportunity',
    Attractive: 'Strong opportunity',
    'Neutral / mixed': 'Neutral',
  }

  return replacements[label] ?? label
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
        .workspace-grid {
          grid-template-columns: 1fr !important;
        }

        .workspace-grid .input-panel {
          grid-column: 1 / -1;
          width: 100%;
        }

        .allocation-pair-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 22px;
          align-items: stretch;
        }

        .allocation-pair-grid .allocation-card {
          min-height: 0;
          position: relative;
          overflow: hidden;
        }

        .allocation-card.after-card {
          border: 2px solid rgba(33, 103, 73, 0.34);
          background:
            linear-gradient(
              135deg,
              rgba(232, 242, 226, 0.74),
              rgba(255, 255, 255, 0.92) 52%
            );
        }

        .allocation-card.after-card::before {
          content: '';
          position: absolute;
          inset: 0 auto 0 0;
          width: 5px;
          background: #216749;
        }

        .allocation-card .allocation-card-subtitle {
          margin: 4px 0 18px;
          color: #748178;
          font-size: 12px;
          line-height: 1.4;
        }

        .allocation-card .after-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 9px;
          border-radius: 999px;
          background: rgba(33, 103, 73, 0.09);
          color: #216749;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 10px;
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

        .contribution-settings {
          margin-top: 22px;
          padding: 18px 20px;
          border-radius: 18px;
          border: 1px solid rgba(111, 143, 179, 0.26);
          background:
            linear-gradient(
              135deg,
              rgba(111, 143, 179, 0.10),
              rgba(216, 178, 92, 0.08)
            );
        }

        .contribution-settings-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
        }

        .contribution-settings-title {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .contribution-settings-title strong {
          font-size: 14px;
        }

        .contribution-settings-head > span {
          color: #748178;
          font-size: 11px;
        }

        .contribution-values {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(0, 0.75fr);
          gap: 12px;
        }

        .contribution-value {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 13px 15px;
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(78, 92, 83, 0.10);
        }

        .contribution-value > span {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .contribution-value > span strong {
          font-size: 13px;
        }

        .contribution-value > span small {
          color: #7b857f;
          font-size: 10px;
        }

        .contribution-input {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 105px;
          justify-content: flex-end;
        }

        .contribution-input i {
          font-style: normal;
          color: #7c8780;
          font-size: 12px;
        }

        .contribution-input input {
          width: 92px;
          border: 0;
          background: transparent;
          text-align: right;
          font: inherit;
          font-size: 16px;
          font-weight: 700;
          outline: none;
          color: inherit;
        }

        .contribution-value.primary {
          background: rgba(255, 255, 255, 0.94);
          border-color: rgba(111, 143, 179, 0.22);
        }

        .score-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .score-cell strong {
          white-space: nowrap;
        }

        .score-cell small {
          color: #7c8780;
          font-size: 9px;
          white-space: nowrap;
        }

        .table-note {
          margin: 12px 0 0;
          color: #748178;
          font-size: 11px;
          line-height: 1.5;
        }

        .score-audit {
          margin-top: 22px;
        }

        .score-audit details {
          border-top: 1px solid rgba(78, 92, 83, 0.12);
        }

        .score-audit details:last-child {
          border-bottom: 1px solid rgba(78, 92, 83, 0.12);
        }

        .score-audit summary {
          list-style: none;
          cursor: pointer;
          padding: 16px 0;
          display: grid;
          grid-template-columns: 80px 1fr auto;
          align-items: center;
          gap: 16px;
        }

        .score-audit summary::-webkit-details-marker {
          display: none;
        }

        .score-audit-summary-score {
          display: flex;
          align-items: center;
          gap: 14px;
          color: #69756e;
          font-size: 12px;
        }

        .score-audit-body {
          padding: 0 0 20px;
        }

        .price-proof {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .price-proof > div {
          padding: 12px;
          border-radius: 12px;
          background: rgba(111, 143, 179, 0.08);
        }

        .price-proof span,
        .tactical-grid span {
          display: block;
          color: #78837c;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 4px;
        }

        .price-proof strong {
          font-size: 13px;
        }

        .live-proof {
          margin: 0 0 15px;
          color: #587064;
          font-size: 11px;
          line-height: 1.5;
        }

        .tactical-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .tactical-grid > div {
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(78, 92, 83, 0.10);
          background: rgba(255, 255, 255, 0.72);
        }

        .tactical-grid strong {
          display: block;
          font-size: 13px;
          margin-bottom: 3px;
        }

        .tactical-grid small {
          color: #768179;
          font-size: 10px;
          line-height: 1.35;
        }

        .guardrail-note {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 11px;
          line-height: 1.5;
        }

        .guardrail-note.ok {
          background: rgba(85, 136, 102, 0.09);
          color: #4f735a;
        }

        .guardrail-note.blocked {
          background: rgba(195, 95, 95, 0.09);
          color: #a55454;
        }

        .target-fit-proof {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) minmax(0, 1fr);
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
          padding: 12px;
          border-radius: 12px;
          background: rgba(216, 178, 92, 0.08);
          border: 1px solid rgba(216, 178, 92, 0.18);
        }

        .target-fit-proof > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .target-fit-proof span {
          color: #78837c;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .target-fit-proof strong {
          font-size: 13px;
        }

        .target-fit-proof > svg {
          color: #8a938d;
        }

        @media (max-width: 900px) {
          .tactical-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .price-proof {
            grid-template-columns: 1fr;
          }

          .target-fit-proof {
            grid-template-columns: 1fr;
          }

          .target-fit-proof > svg {
            transform: rotate(90deg);
          }
        }

        @media (max-width: 760px) {
          .allocation-pair-grid,
          .contribution-values {
            grid-template-columns: 1fr;
          }

          .research-full-card .research-line p {
            font-size: 14px;
          }

          .tactical-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .score-audit summary {
            grid-template-columns: 58px 1fr auto;
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

            <div className="contribution-settings">
              <div className="contribution-settings-head">
                <div className="contribution-settings-title">
                  <WalletCards size={17} />
                  <strong>Contribution settings</strong>
                </div>

                <span>Used for this purchase only</span>
              </div>

              <div className="contribution-values">
                <label className="contribution-value primary">
                  <span>
                    <strong>Cash available</strong>
                    <small>Your maximum spend for this contribution</small>
                  </span>

                  <div className="contribution-input">
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

                <label className="contribution-value">
                  <span>
                    <strong>Brokerage</strong>
                    <small>Applied once to the chosen trade</small>
                  </span>

                  <div className="contribution-input">
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

          <small>60 / 40 weighted · /100</small>
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
          label="Portfolio priority"
          value={`${recommendation.strategicScore.toFixed(
            1,
          )}/100`}
        />

        <Metric
          label="Market opportunity"
          value={`${recommendation.tacticalScore.toFixed(
            1,
          )}/100`}
        />
      </div>

      <div className="allocation-pair-grid">
        <AllocationCard
          title="Current allocation"
          subtitle="Before this contribution"
          allocation={recommendation.beforeAllocation}
          target={analysis.targets}
          variant="before"
        />

        <AllocationCard
          title="Allocation after"
          subtitle={`After buying ${recommendation.units} ${recommendation.ticker}`}
          allocation={recommendation.afterAllocation}
          target={analysis.targets}
          variant="after"
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
                Research context updated{' '}
                {formatSydneyTimestamp(
                  analysis.dataStatus.researchGeneratedAt,
                )}. It does not affect the recommendation score.
                Current ETF prices refreshed for this analysis.
              </p>
            )}
          </div>

          <span className="live-badge">
            Not scored
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {analysis.dataStatus?.currentPriceFeedsTacticalScore && (
              <span className="live-badge">
                Current price applied
              </span>
            )}

            <span className="as-of">
              As of{' '}
              {new Date(
                analysis.generatedAt,
              ).toLocaleString('en-AU')}
            </span>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ETF</th>
                <th>Trade</th>
                <th>1W*</th>
                <th>1M*</th>
                <th>3M*</th>
                <th>52W DD*</th>
                <th>Priority /100</th>
                <th>Opportunity /100</th>
                <th>Overall /100</th>
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
                      <div className="score-cell">
                        <strong>
                          {item.strategicScore.toFixed(1)}
                        </strong>
                        <small>portfolio need</small>
                      </div>
                    </td>

                    <td>
                      <div className="score-cell">
                        <strong>
                          {item.tacticalScore.toFixed(1)}
                        </strong>
                        <small>
                          {friendlyTacticalLabel(item.tacticalLabel)}
                        </small>
                      </div>
                    </td>

                    <td>
                      <div className="score-cell">
                        <strong>
                          {item.overallScore.toFixed(1)}
                        </strong>
                        <small>
                          {item.overallLabel ?? ''}
                        </small>
                      </div>
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

        <p className="table-note">
          * Live-adjusted using the current ETF price at analysis time and
          today&apos;s cached historical reference data. 52W DD means the
          percentage below the 52-week high — it is not the 12-month return.
        </p>

        <div className="score-audit">
          <h4>How each score was calculated</h4>

          {analysis.comparisons.map((item) => (
            <ScoreAudit
              key={item.ticker}
              item={item}
              target={analysis.targets[item.ticker]}
              analysisGeneratedAt={analysis.generatedAt}
            />
          ))}
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
  subtitle,
  allocation,
  target,
  variant = 'before',
}: {
  title: string
  subtitle?: string
  allocation: Allocation
  target?: Allocation
  variant?: 'before' | 'after'
}) {
  return (
    <div
      className={`panel allocation-card ${
        variant === 'after' ? 'after-card' : 'before-card'
      }`}
    >
      <p className="kicker">
        Portfolio mix
      </p>

      {variant === 'after' && (
        <span className="after-pill">
          <ArrowRight size={12} />
          Proposed after trade
        </span>
      )}

      <h3>{title}</h3>

      {subtitle && (
        <p className="allocation-card-subtitle">
          {subtitle}
        </p>
      )}

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

function ScoreAudit({
  item,
  target,
  analysisGeneratedAt,
}: {
  item: Comparison
  target: number
  analysisGeneratedAt: string
}) {
  const components = item.tacticalComponents

  const snapshotPrice =
    item.snapshotPrice ??
    item.market.snapshotPrice ??
    item.price

  const snapshotAsOf =
    item.market.snapshotAsOf

  const priceMove =
    item.market.priceAdjustmentPct ??
    (snapshotPrice
      ? ((item.price - snapshotPrice) / snapshotPrice) * 100
      : 0)

  const componentCards = components
    ? [
        {
          label: '1W',
          raw: signed(components.week.rawValue),
          score: components.week.score,
          weight: components.week.weight,
        },
        {
          label: '1M',
          raw: signed(components.month.rawValue),
          score: components.month.score,
          weight: components.month.weight,
        },
        {
          label: '3M',
          raw: signed(components.quarter.rawValue),
          score: components.quarter.score,
          weight: components.quarter.weight,
        },
        {
          label: '52W drawdown',
          raw: `${components.drawdown52Week.rawValue.toFixed(2)}%`,
          score: components.drawdown52Week.score,
          weight: components.drawdown52Week.weight,
        },
      ]
    : []

  return (
    <details>
      <summary>
        <strong
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '9px',
          }}
        >
          <i
            aria-hidden="true"
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '999px',
              backgroundColor: tickerColors[item.ticker],
              flex: '0 0 auto',
            }}
          />
          {item.ticker}
        </strong>

        <span
          style={{
            color: '#748178',
            fontSize: '12px',
          }}
        >
          Show calculation
        </span>

        <ChevronDown
          size={16}
          style={{
            color: tickerColors[item.ticker],
          }}
        />
      </summary>

      <div className="score-audit-body">
        <div
          style={{
            display: 'flex',
            gap: '18px',
            flexWrap: 'wrap',
            marginBottom: '14px',
            fontSize: '12px',
          }}
        >
          <strong>
            Portfolio priority {item.strategicScore.toFixed(1)}/100
          </strong>
          <strong>
            Market opportunity {item.tacticalScore.toFixed(1)}/100
          </strong>
          <strong>
            Overall {item.overallScore.toFixed(1)}/100
          </strong>
        </div>

        {item.beforeAllocation && (
          <div
            className="target-fit-proof"
            style={{
              borderLeft: `4px solid ${tickerColors[item.ticker]}`,
            }}
          >
            <div>
              <span>Current {item.ticker}</span>
              <strong>
                {percent(item.beforeAllocation[item.ticker])}
              </strong>
            </div>

            <ArrowRight
              size={15}
              style={{
                color: tickerColors[item.ticker],
              }}
            />

            <div>
              <span>Target</span>
              <strong>{percent(target)}</strong>
            </div>

            <div>
              <span>Portfolio priority</span>
              <strong>{item.strategicScore.toFixed(1)}/100</strong>
            </div>
          </div>
        )}

        {item.afterAllocation && (
          <p
            style={{
              margin: '0 0 14px',
              color: '#6f7b74',
              fontSize: '11px',
            }}
          >
            Proposed trade: {item.units} {item.ticker} unit
            {item.units === 1 ? '' : 's'} → post-trade allocation{' '}
            <strong>
              {percent(item.afterAllocation[item.ticker])}
            </strong>.
          </p>
        )}

        <div className="price-proof">
          <div>
            <span>Daily research snapshot price</span>
            <strong>{money.format(snapshotPrice)}</strong>
            {snapshotAsOf && (
              <small>
                {' '}
                · {formatSydneyTimestamp(snapshotAsOf)}
              </small>
            )}
          </div>

          <div>
            <span>Latest price used</span>
            <strong>{money.format(item.price)}</strong>
            <small>
              {' '}
              · fetched {formatSydneyTimestamp(analysisGeneratedAt)}
            </small>
          </div>

          <div>
            <span>Price move since snapshot</span>
            <strong>{signed(priceMove)}</strong>
          </div>
        </div>

        <p className="live-proof">
          Portfolio priority measures how much this ETF currently needs the
          next contribution: 100 is maximally underweight, 50 is exactly on
          target and 0 is at or beyond the hard overweight cap. The latest
          price is fetched when you press Analyse and is used to recalculate
          the 1W, 1M, 3M and 52-week drawdown inputs before the market
          opportunity score is built. Research context is not used here.
        </p>

        {componentCards.length > 0 && (
          <div className="tactical-grid">
            {componentCards.map((component) => (
              <div
                key={component.label}
                style={{
                  borderTop: `3px solid ${tickerColors[item.ticker]}`,
                }}
              >
                <span>{component.label}</span>
                <strong>{component.raw}</strong>
                <small>
                  {component.score.toFixed(1)}/100 ·{' '}
                  {(component.weight * 100).toFixed(0)}% of market opportunity
                </small>
              </div>
            ))}
          </div>
        )}

        <div
          className={`guardrail-note ${
            item.eligible ? 'ok' : 'blocked'
          }`}
        >
          {item.eligible
            ? `Eligible · ${item.units} whole unit${
                item.units === 1 ? '' : 's'
              } selected. ${
                item.brokerageDrag != null
                  ? `Brokerage drag ${item.brokerageDrag.toFixed(2)}%.`
                  : ''
              }`
            : `Disqualified · ${
                item.disqualificationReason ??
                'A portfolio guardrail was triggered.'
              }`}
        </div>
      </div>
    </details>
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
