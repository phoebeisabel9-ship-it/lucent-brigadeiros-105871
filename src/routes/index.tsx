import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  LogOut,
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
type Balances = Record<Ticker, number> & { cash: number; brokerage: number }

type Allocation = Record<Ticker, number>
type Research = {
  valuationScore: number
  newsScore: number
  thesisDisqualified: boolean
  valuationContext: string
  developments: string
  newsSummary: string
  citations: Array<{ title: string; url: string }>
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
  whyItBeatAlternatives: Array<{ ticker: Ticker; reason: string }>
}
type Analysis = {
  generatedAt: string
  targets: Allocation
  recommendation: Recommendation
  comparisons: Comparison[]
}
type Trade = {
  id: string
  ticker: string
  units: number
  unitPrice: string
  amountInvested: string
  createdAt: string
}

const defaults: Balances = { IVV: 35000, DHHF: 30000, VEU: 15000, VAS: 10000, VESG: 10000, cash: 2500, brokerage: 9.5 }
const targets: Allocation = { IVV: 0.35, DHHF: 0.3, VEU: 0.15, VAS: 0.1, VESG: 0.1 }
const labels: Record<Ticker, string> = {
  IVV: 'S&P 500',
  DHHF: 'Diversified High Growth',
  VEU: 'All-World ex-US',
  VAS: 'Australian Shares',
  VESG: 'Ethical International',
}

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 })
const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || 'Request failed')
  }
  return response.json() as Promise<T>
}

function Home() {
  const [user, setUser] = useState<{ id: string; email?: string } | null | undefined>(undefined)
  const [balances, setBalances] = useState<Balances>(defaults)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [history, setHistory] = useState<Trade[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      const { getUser } = await import('@netlify/identity')
      const currentUser = await getUser()
      setUser(currentUser ? { id: currentUser.id, email: currentUser.email } : null)
    })()
  }, [])

  useEffect(() => {
    if (!user) return
    void Promise.all([api<Balances | null>('/api/balances'), api<Trade[]>('/api/trades')])
      .then(([savedBalances, trades]) => {
        if (savedBalances) setBalances({ ...defaults, ...savedBalances })
        setHistory(trades)
      })
      .catch((requestError: Error) => setError(requestError.message))
  }, [user])

  const totalPortfolio = useMemo(() => TICKERS.reduce((sum, ticker) => sum + balances[ticker], 0), [balances])

  async function analyse() {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      await api('/api/balances', { method: 'PUT', body: JSON.stringify(balances) })
      setAnalysis(await api<Analysis>('/api/analyse', { method: 'POST', body: JSON.stringify(balances) }))
      setNotice('Balances saved and live analysis completed.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  async function saveTrade() {
    if (!analysis) return
    setSaving(true)
    setError('')
    try {
      const saved = await api<Trade>('/api/trades', { method: 'POST', body: JSON.stringify(analysis) })
      setHistory((current) => [saved, ...current])
      setNotice(`${analysis.recommendation.ticker} trade saved to history.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Trade could not be saved')
    } finally {
      setSaving(false)
    }
  }

  if (user === undefined) return <LoadingScreen />
  if (!user) return <AuthScreen onAuthenticated={(signedIn) => setUser({ id: signedIn.id, email: signedIn.email })} />

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ETF Buyer home">
          <span className="brand-mark"><BarChart3 size={19} /></span>
          <span>ETF Buyer</span>
        </a>
        <div className="topbar-actions">
          <span className="private-pill"><ShieldCheck size={14} /> Private workspace</span>
          <button className="icon-button" aria-label="Sign out" onClick={() => void import('@netlify/identity').then(({ logout }) => logout()).then(() => setUser(null))}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="page" id="top">
        <section className="hero">
          <div>
            <p className="eyebrow"><Sparkles size={14} /> Contribution decision engine</p>
            <h1>One contribution.<br /><em>One clear buy.</em></h1>
            <p className="hero-copy">A strategic-first recommendation for your next whole-unit ETF purchase, informed by current ASX data and cited market research.</p>
          </div>
          <div className="target-card">
            <div className="target-card-head"><span>Fixed target</span><span>100%</span></div>
            <div className="target-strip" aria-label="Target allocation">
              {TICKERS.map((ticker) => <span key={ticker} style={{ width: `${targets[ticker] * 100}%` }} />)}
            </div>
            <div className="target-list">
              {TICKERS.map((ticker) => <div key={ticker}><i className={`dot dot-${ticker.toLowerCase()}`} /><span>{ticker}</span><strong>{percent(targets[ticker], 0)}</strong></div>)}
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <div className="panel input-panel">
            <div className="panel-heading">
              <div><p className="kicker">Portfolio snapshot</p><h2>Current balances</h2></div>
              <span className="total-label">{money.format(totalPortfolio)}</span>
            </div>
            <div className="balance-grid">
              {TICKERS.map((ticker) => (
                <label className="money-field" key={ticker}>
                  <span><strong>{ticker}</strong><small>{labels[ticker]}</small></span>
                  <div><i>$</i><input type="number" min="0" step="0.01" value={balances[ticker]} onChange={(event) => setBalances({ ...balances, [ticker]: Number(event.target.value) })} /></div>
                </label>
              ))}
            </div>
            <div className="cash-row">
              <label className="money-field accent-field">
                <span><strong>Cash available</strong><small>For this contribution</small></span>
                <div><i>$</i><input type="number" min="0" step="0.01" value={balances.cash} onChange={(event) => setBalances({ ...balances, cash: Number(event.target.value) })} /></div>
              </label>
              <label className="money-field">
                <span><strong>Brokerage</strong><small>Charged once</small></span>
                <div><i>$</i><input type="number" min="0" step="0.01" value={balances.brokerage} onChange={(event) => setBalances({ ...balances, brokerage: Number(event.target.value) })} /></div>
              </label>
            </div>
            <button className="analyse-button" onClick={() => void analyse()} disabled={loading}>
              {loading ? <><LoaderCircle className="spin" size={19} /> Researching markets</> : <>Analyse contribution <ArrowRight size={19} /></>}
            </button>
            <p className="secure-note"><LockKeyhole size={13} /> Balances are stored privately in Netlify Blobs.</p>
          </div>

          <aside className="method-card">
            <p className="kicker">Decision policy</p>
            <h3>Strategy stays in control.</h3>
            <div className="weight-row"><span>Strategic alignment</span><strong>80%</strong></div>
            <div className="weight-track"><span style={{ width: '80%' }} /></div>
            <div className="weight-row"><span>Market opportunity</span><strong>20%</strong></div>
            <div className="weight-track tactical"><span style={{ width: '20%' }} /></div>
            <p>A dip can improve an eligible ETF’s rank, but cannot rescue a trade that moves the portfolio further from target.</p>
            <div className="guardrail"><ShieldCheck size={18} /><span><strong>Hard guardrail</strong>Worse alignment means disqualified.</span></div>
          </aside>
        </section>

        {error && <div className="message error-message">{error}</div>}
        {notice && <div className="message success-message"><Check size={16} />{notice}</div>}
        {loading && <AnalysisSkeleton />}
        {analysis && !loading && <Results analysis={analysis} onSave={() => void saveTrade()} saving={saving} />}
        <TradeHistory trades={history} />
      </div>
    </main>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: { id: string; email?: string }) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const identity = await import('@netlify/identity')
      if (mode === 'login') {
        const authenticated = await identity.login(email, password)
        onAuthenticated({ id: authenticated.id, email: authenticated.email })
      } else {
        const created = await identity.signup(email, password)
        if (created.confirmedAt) onAuthenticated({ id: created.id, email: created.email })
        else setMessage('Check your inbox to confirm your private account, then sign in.')
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand light-brand" href="/"><span className="brand-mark"><BarChart3 size={19} /></span><span>ETF Buyer</span></a>
        <div>
          <p className="eyebrow"><ShieldCheck size={14} /> Private by design</p>
          <h1>Make the next<br />contribution <em>count.</em></h1>
          <p>Deterministic portfolio logic. Live market context. Exactly one whole-unit ETF recommendation.</p>
        </div>
        <div className="auth-proof"><span>80%</span><p>of every score comes from improving your fixed target allocation.</p></div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <span className="auth-icon"><LockKeyhole size={22} /></span>
          <p className="kicker">Secure access</p>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p>{mode === 'login' ? 'Sign in to your private investment workspace.' : 'Use a private email address you control.'}</p>
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}
          <button disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <button className="text-button" type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Need an account? Create one' : 'Already registered? Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

function Results({ analysis, onSave, saving }: { analysis: Analysis; onSave: () => void; saving: boolean }) {
  const recommendation = analysis.recommendation
  return (
    <section className="results-section">
      <div className="result-hero">
        <div className="buy-copy">
          <p className="eyebrow"><Check size={14} /> Highest eligible score</p>
          <h2><span>BUY</span> {recommendation.ticker}</h2>
          <p>{recommendation.reason}</p>
          <button onClick={onSave} disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} Save trade</button>
        </div>
        <div className="units-card"><span>Whole units</span><strong>{recommendation.units}</strong><small>@ {money.format(recommendation.price)}</small></div>
        <div className="score-orbit">
          <div><strong>{recommendation.overallScore.toFixed(1)}</strong><span>Overall</span></div>
          <small>80 / 20 weighted</small>
        </div>
      </div>

      <div className="metrics-row">
        <Metric label="Amount invested" value={money.format(recommendation.amountInvested)} />
        <Metric label="Brokerage" value={money.format(recommendation.brokerage)} />
        <Metric label="Cash used" value={money.format(recommendation.cashUsed)} />
        <Metric label="Cash remaining" value={money.format(recommendation.cashRemaining)} />
        <Metric label="Strategic score" value={recommendation.strategicScore.toFixed(1)} />
        <Metric label="Tactical score" value={recommendation.tacticalScore.toFixed(1)} />
      </div>

      <div className="result-grid">
        <AllocationCard title="Allocation before" allocation={recommendation.beforeAllocation} />
        <AllocationCard title="Allocation after" allocation={recommendation.afterAllocation} target={analysis.targets} />
        <div className="panel research-card">
          <div className="panel-heading"><div><p className="kicker">Current research</p><h3>{recommendation.ticker} context</h3></div><span className="live-badge">Live</span></div>
          <ResearchLine title="Valuation" score={recommendation.research.valuationScore} text={recommendation.research.valuationContext} />
          <ResearchLine title="Developments" text={recommendation.research.developments} />
          <ResearchLine title="7-day news" score={recommendation.research.newsScore} text={recommendation.research.newsSummary} />
          <div className="citations">
            {recommendation.research.citations.map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer"><ExternalLink size={13} />{citation.title}</a>)}
          </div>
        </div>
      </div>

      <div className="panel comparison-panel">
        <div className="panel-heading"><div><p className="kicker">Every candidate</p><h3>Trade comparison</h3></div><span className="as-of">As of {new Date(analysis.generatedAt).toLocaleString('en-AU')}</span></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>ETF</th><th>Trade</th><th>1W</th><th>1M</th><th>3M</th><th>52W DD</th><th>Strategic</th><th>Tactical</th><th>Overall</th><th>Status</th></tr></thead>
            <tbody>{analysis.comparisons.map((item) => (
              <tr key={item.ticker} className={item.ticker === recommendation.ticker ? 'recommended-row' : ''}>
                <td><strong>{item.ticker}</strong><small>{labels[item.ticker]}</small></td>
                <td>{item.units} @ {money.format(item.price)}</td>
                <td className={item.market.weekReturn < 0 ? 'dip' : ''}>{signed(item.market.weekReturn)}</td>
                <td className={item.market.monthReturn < 0 ? 'dip' : ''}>{signed(item.market.monthReturn)}</td>
                <td className={item.market.quarterReturn < 0 ? 'dip' : ''}>{signed(item.market.quarterReturn)}</td>
                <td>{item.market.drawdown52Week.toFixed(2)}%</td>
                <td>{item.strategicScore.toFixed(1)}</td><td>{item.tacticalScore.toFixed(1)}</td><td><strong>{item.overallScore.toFixed(1)}</strong></td>
                <td>{item.eligible ? <span className="eligible">Eligible</span> : <span className="disqualified">Disqualified</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="why-list">
          <h4>Why {recommendation.ticker} beat each alternative</h4>
          {recommendation.whyItBeatAlternatives.map((item) => <div key={item.ticker}><span>{item.ticker}</span><p>{item.reason}</p></div>)}
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function AllocationCard({ title, allocation, target }: { title: string; allocation: Allocation; target?: Allocation }) {
  return <div className="panel allocation-card"><p className="kicker">Portfolio mix</p><h3>{title}</h3>{TICKERS.map((ticker) => <div className="allocation-row" key={ticker}><span>{ticker}</span><div><i style={{ width: `${Math.min(100, allocation[ticker] * 240)}%` }} /></div><strong>{percent(allocation[ticker])}</strong>{target && <small className={Math.abs(allocation[ticker] - target[ticker]) < 0.005 ? 'on-target' : ''}>{allocation[ticker] > target[ticker] ? 'Over' : 'Under'} {percent(Math.abs(allocation[ticker] - target[ticker]))}</small>}</div>)}</div>
}

function ResearchLine({ title, text, score }: { title: string; text: string; score?: number }) {
  return <div className="research-line"><div><strong>{title}</strong>{score !== undefined && <span className={score >= 0 ? 'positive-score' : 'negative-score'}>{score > 0 ? '+' : ''}{score}</span>}</div><p>{text}</p></div>
}

function TradeHistory({ trades }: { trades: Trade[] }) {
  return <section className="history-section"><div className="section-title"><div><p className="kicker">Saved decisions</p><h2>Trade history</h2></div><Clock3 size={21} /></div>{trades.length ? <div className="history-list">{trades.map((trade) => <div key={trade.id}><span className="history-ticker">{trade.ticker}</span><p><strong>{trade.units} units</strong> at {money.format(Number(trade.unitPrice))}</p><span>{money.format(Number(trade.amountInvested))}</span><time>{new Date(trade.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>)}</div> : <div className="empty-history"><WalletCards size={24} /><p>Saved recommendations appear here after you record a trade.</p></div>}</section>
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="brand-mark"><BarChart3 size={22} /></span><LoaderCircle className="spin" size={24} /></main>
}

function AnalysisSkeleton() {
  return <section className="analysis-loading"><div><RefreshCw className="spin" size={20} /><span>Retrieving ASX history</span></div><div><TrendingDown size={20} /><span>Scoring market dips</span></div><div><Sparkles size={20} /><span>Researching the last 7 days</span></div><ChevronDown className="pulse" size={20} /></section>
}
