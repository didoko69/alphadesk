# AlphaDesk — Autonomous AI Trading Agent

**Bitget AI × Crypto Trading Hackathon · Track: Autonomous Trading Agents**

An autonomous trading agent that reads live market structure, reasons over it like
a disciplined futures desk, and prints **risk-defined order tickets** — never a
position without a stop. The same trading policy is **backtested in-app** so the
edge is measurable, not asserted.

> Live demo: `<paste your published demo link here>`
> Demo video: `<paste your video link here>`

---

## The problem

Most "AI trading" tools either (a) wrap an LLM around a price feed and let it
hand-wave a direction with no risk management, or (b) are black-box bots a user
can't reason about. Neither is safe to put capital behind.

**AlphaDesk** treats the LLM as a *desk trader under risk limits*: it must justify
a trade from real indicators and must attach a stop, take-profit, and position
size derived from volatility before any ticket is issued.

## What it does

- **Reads market structure** — RSI(14), MACD(12/26/9), MA20/MA50 trend, ATR(14).
- **Reasons** — the agent evaluates the snapshot and decides `open` (long/short)
  or `flat`. Conflicting/weak signals → it stands aside.
- **Defines risk first** — every ticket sizes the position from a fixed % account
  risk and an ATR-based stop, with an R:R-multiple take-profit.
- **Proves the edge** — the same deterministic policy is run over the full price
  history; the app reports total return, win rate, profit factor, max drawdown,
  and an annualised Sharpe.

## Architecture

```
market feed ──▶ indicator engine ──▶ snapshot ──┬─▶ agent (reason → decision)
 (OHLC)         RSI/MACD/MA/ATR                  │      └─▶ risk engine ──▶ order ticket
                                                 └─▶ backtest (same policy) ──▶ stats + equity curve
```

- `genCandles()` — regime-switching market simulator (trend/down/chop) for a
  reliable offline demo.
- `snapshotAt()` — computes all indicators at a bar.
- `policy()` — the deterministic trading policy that is backtested.
- `agentDecide()` — LLM reasoning layer (returns a structured JSON decision);
  falls back to `policy()` if the model is unreachable, so the agent always
  produces a safe, auditable decision.
- `backtest()` — event loop over history with stop/TP fills and full risk sizing.

## Risk engine (the core)

```
stop_distance = atr_mult × ATR
position_size = (equity × risk_pct) ÷ stop_distance
take_profit   = entry ± stop_distance × reward_risk
```

Capital risked per trade is fixed; size floats with volatility. This is the part
that separates a trading *agent* from a chatbot guessing direction.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL. Press **Run agent** to get a decision + ticket; the
right panel shows the backtest. Tailwind ships via Play CDN, so there's no build
config to fight.

> **Note on the reasoning layer:** the hosted demo runs the live LLM-powered
> agent. Run locally, the browser call to the model is sandboxed, so the agent
> uses the bundled deterministic `policy()` — the *same* strategy that is
> backtested. To enable live LLM reasoning in your own deployment, route
> `agentDecide()` through a small server proxy holding your API key.

## Roadmap to live trading

1. Replace `genCandles()` with a Bitget REST/WS candle feed (indicators, agent,
   and risk engine are untouched).
2. Route order tickets to the Bitget API in paper mode, then live with caps.
3. Persist trade history and expose a kill-switch + daily loss limit.

## Tech

React · Vite · Recharts · Lucide. No secrets in the client.
