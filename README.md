# AlphaDesk — Autonomous AI Trading Agent

**Bitget AI × Crypto Trading Hackathon · Track: Trading Agent** — built on **Bitget Agent Hub**.

An autonomous agent that reads live Bitget market structure, reasons like a
disciplined desk trader, and issues **risk-defined order tickets** — never a
position without a stop. It runs the full closed loop:

> **Perception → Decision → Execution → Risk → Exit**

> Live demo: `https://alphadessk.netlify.app/` · Repo: `https://github.com/didoko69/alphadesk`

---

## The loop

| Stage | How it works | Bitget Agent Hub |
|------|---------------|------------------|
| **Perception** | Live BTC-USDT perp candles + funding → RSI / MACD / MA-trend / ATR | `bitget-core` → `/api/v2/mix/market/candles`, `current-fund-rate` (Skill Hub patterns: `technical-analysis`, `sentiment-analyst`) |
| **Decision** | The agent reasons over the snapshot and issues `open` (long/short) or `flat`, with a plain-English thesis | LLM agent, run server-side on the deploy |
| **Execution** | Risk-defined ticket routed to Bitget in **paper** mode | `bitget-core` → `/api/v2/mix/order/place-order` (`paperTrading`) |
| **Risk** | Position sized from volatility at 1% account risk, ATR stop, R:R take-profit | — |
| **Exit** | Stop / take-profit levels set on every ticket | — |

The **policy backtest** (return, win rate, profit factor, max drawdown, Sharpe)
gives verifiable, measurable edge — not assertions.

## Architecture

```
React (Vite) ──┬─ /api/market   → bitget-core → Bitget perp candles + funding   (perception)
               ├─ /api/decide   → agent reasoning via LLM key                     (decision)
               └─ /api/execute  → bitget-core → Bitget place-order (paper)         (execution)
Netlify Functions hold every key server-side; the browser never sees a secret.
If the backend is offline, the app falls back to in-app reasoning so it always runs.
```

## Run locally

```bash
npm install
npm run dev          # frontend (Vite)
# full stack incl. functions:  npm i -g netlify-cli && netlify dev
```

## Deploy (Netlify)

Connect the repo. Build `npm run build`, publish `dist`; functions auto-detected from `netlify.toml`. Set env vars:

```
# LLM — Anthropic OR any OpenAI-compatible endpoint (e.g. Alibaba Qwen / DashScope)
ANTHROPIC_API_KEY=...            # or:
LLM_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=...
LLM_MODEL=qwen-plus

# Bitget (optional — enables real paper-order routing; market data needs none)
BITGET_API_KEY=...
BITGET_SECRET_KEY=...
BITGET_PASSPHRASE=...
```

## Tech

React · Vite · Recharts · Netlify Functions · **bitget-core** (Bitget Agent Hub). MIT.
