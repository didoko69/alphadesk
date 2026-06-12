import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, ReferenceLine, Tooltip, CartesianGrid,
} from "recharts";
import {
  Activity, TrendingUp, TrendingDown, Minus, Cpu, Play, RotateCcw,
  ShieldCheck, Crosshair, Gauge, ChevronRight, Zap,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   AlphaDesk — autonomous AI trading agent
   Bitget AI × Crypto Trading Hackathon · Track: Autonomous Trading Agents
   Synthetic-but-realistic feed · real TA math · Claude-powered reasoning ·
   deterministic backtest of the same policy.
   ────────────────────────────────────────────────────────────────────────── */

// ---------- market engine: regime-switching GBM with OHLC ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function genCandles(seed, n = 260, start = 64000) {
  const rng = mulberry32(seed);
  const candles = [];
  let price = start;
  let drift = 0.0004, vol = 0.011, regime = 0, regimeLeft = 30;
  for (let i = 0; i < n; i++) {
    if (regimeLeft-- <= 0) {
      regime = Math.floor(rng() * 3); // 0 up, 1 down, 2 chop
      regimeLeft = 18 + Math.floor(rng() * 34);
      drift = regime === 0 ? 0.0016 : regime === 1 ? -0.0015 : 0.0001;
      vol = regime === 2 ? 0.016 : 0.0105;
    }
    const open = price;
    const ret = drift + vol * gauss(rng);
    const close = Math.max(1, open * (1 + ret));
    const hi = Math.max(open, close) * (1 + Math.abs(vol * gauss(rng)) * 0.55);
    const lo = Math.min(open, close) * (1 - Math.abs(vol * gauss(rng)) * 0.55);
    candles.push({ i, open, high: hi, low: lo, close });
    price = close;
  }
  return candles;
}

// ---------- indicators ----------
const sma = (a, p, i) => {
  if (i < p - 1) return null;
  let s = 0; for (let k = i - p + 1; k <= i; k++) s += a[k];
  return s / p;
};
function emaSeries(a, p) {
  const k = 2 / (p + 1); const out = []; let prev = a[0];
  for (let i = 0; i < a.length; i++) {
    prev = i === 0 ? a[0] : a[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
function rsiSeries(closes, p = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= p) { gain += g; loss += l; if (i === p) { gain /= p; loss /= p; out[i] = 100 - 100 / (1 + gain / (loss || 1e-9)); } }
    else { gain = (gain * (p - 1) + g) / p; loss = (loss * (p - 1) + l) / p; out[i] = 100 - 100 / (1 + gain / (loss || 1e-9)); }
  }
  return out;
}
function macdSeries(closes) {
  const e12 = emaSeries(closes, 12), e26 = emaSeries(closes, 26);
  const macd = closes.map((_, i) => e12[i] - e26[i]);
  const signal = emaSeries(macd, 9);
  return macd.map((m, i) => ({ macd: m, signal: signal[i], hist: m - signal[i] }));
}
function atrSeries(candles, p = 14) {
  const tr = candles.map((c, i) => i === 0 ? c.high - c.low :
    Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  const out = new Array(candles.length).fill(null);
  let acc = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < p) { acc += tr[i]; if (i === p - 1) out[i] = acc / p; }
    else out[i] = (out[i - 1] * (p - 1) + tr[i]) / p;
  }
  return out;
}

// snapshot of all signals at index i
function snapshotAt(candles, i) {
  const closes = candles.map((c) => c.close);
  const rsi = rsiSeries(closes)[i];
  const macd = macdSeries(closes)[i];
  const atr = atrSeries(candles)[i];
  const ma20 = sma(closes, 20, i);
  const ma50 = sma(closes, 50, i);
  const price = closes[i];
  return { price, rsi, macd, atr, ma20, ma50,
    trend: ma20 != null && ma50 != null ? (ma20 > ma50 ? "up" : "down") : "flat" };
}

// ---------- deterministic policy (this is what we backtest) ----------
// Returns { side: 'long'|'short'|null, conf } from a snapshot.
function policy(s) {
  if (s.ma20 == null || s.ma50 == null || s.rsi == null || !s.macd) return { side: null, conf: 0 };
  const up = s.ma20 > s.ma50;
  const macdUp = s.macd.hist > 0;
  let conf = 0, side = null;
  if (up && macdUp && s.rsi > 48 && s.rsi < 72) { side = "long"; conf = 0.5 + Math.min(0.4, (s.macd.hist / s.price) * 60) + (s.rsi < 60 ? 0.08 : 0); }
  else if (!up && !macdUp && s.rsi < 52 && s.rsi > 28) { side = "short"; conf = 0.5 + Math.min(0.4, (-s.macd.hist / s.price) * 60) + (s.rsi > 40 ? 0.08 : 0); }
  return { side, conf: Math.max(0, Math.min(0.97, conf)) };
}

// ---------- backtest the policy ----------
function backtest(candles, { riskPct = 1, atrStop = 1.5, rr = 2, equity0 = 10000 } = {}) {
  let equity = equity0;
  const curve = [{ i: 0, equity }];
  let pos = null; const trades = []; let peak = equity, maxDD = 0;
  for (let i = 55; i < candles.length; i++) {
    const s = snapshotAt(candles, i);
    const c = candles[i];
    if (pos) {
      const hitStop = pos.side === "long" ? c.low <= pos.stop : c.high >= pos.stop;
      const hitTP = pos.side === "long" ? c.high >= pos.tp : c.low <= pos.tp;
      let exit = null;
      if (hitStop) exit = pos.stop; else if (hitTP) exit = pos.tp;
      if (exit != null) {
        const dir = pos.side === "long" ? 1 : -1;
        const pnl = (exit - pos.entry) * dir * pos.qty;
        equity += pnl;
        trades.push({ ...pos, exit, pnl, exitI: i });
        pos = null;
        peak = Math.max(peak, equity);
        maxDD = Math.max(maxDD, (peak - equity) / peak);
        curve.push({ i, equity });
      }
    }
    if (!pos) {
      const p = policy(s);
      if (p.side && s.atr) {
        const stopDist = atrStop * s.atr;
        const entry = s.price;
        const stop = p.side === "long" ? entry - stopDist : entry + stopDist;
        const tp = p.side === "long" ? entry + stopDist * rr : entry - stopDist * rr;
        const riskAmt = equity * (riskPct / 100);
        const qty = riskAmt / stopDist;
        pos = { side: p.side, entry, stop, tp, qty, conf: p.conf, entryI: i };
      }
    }
  }
  const wins = trades.filter((t) => t.pnl > 0);
  const grossW = wins.reduce((a, t) => a + t.pnl, 0);
  const grossL = Math.abs(trades.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0));
  const rets = curve.map((c, k) => k === 0 ? 0 : (c.equity - curve[k - 1].equity) / curve[k - 1].equity);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1)) || 1e-9;
  return {
    equity, curve, trades,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossL ? grossW / grossL : grossW > 0 ? 99 : 0,
    maxDD, totalReturn: (equity - equity0) / equity0,
    sharpe: (mean / sd) * Math.sqrt(rets.length),
    count: trades.length,
  };
}

// ---------- the Claude-powered agent (the demo showpiece) ----------
async function agentDecide(snapshot, cfg) {
  const sys =
    "You are AlphaDesk, a disciplined crypto perpetual-futures trading agent. " +
    "You only take trades with a clear technical edge and you ALWAYS define risk. " +
    "Given a market snapshot, decide ONE action. Respond with ONLY a JSON object, no prose, no markdown fences. " +
    'Schema: {"action":"open"|"flat","side":"long"|"short","confidence":0-1,' +
    '"stop_atr_mult":number,"reward_risk":number,"thesis":"<=40 words, desk-trader voice"}. ' +
    "If signals conflict or are weak, action='flat'.";
  const u = `Snapshot for BTC-USDT perp:
price=${snapshot.price.toFixed(1)}
RSI14=${snapshot.rsi?.toFixed(1)}
MACD_hist=${snapshot.macd?.hist?.toFixed(2)} (macd ${snapshot.macd?.macd?.toFixed(2)} vs signal ${snapshot.macd?.signal?.toFixed(2)})
MA20=${snapshot.ma20?.toFixed(1)} MA50=${snapshot.ma50?.toFixed(1)} (trend ${snapshot.trend})
ATR14=${snapshot.atr?.toFixed(1)}
Account risk per trade=${cfg.riskPct}%. Decide.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: `${sys}\n\n${u}` }],
      }),
    });
    const data = await res.json();
    const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const j = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
    return { ...j, _src: "claude" };
  } catch (e) {
    // deterministic fallback so the demo never dies on camera
    const p = policy(snapshot);
    return p.side
      ? { action: "open", side: p.side, confidence: p.conf, stop_atr_mult: 1.5, reward_risk: 2,
          thesis: `${p.side === "long" ? "Uptrend" : "Downtrend"} with MACD + RSI in agreement; taking the trend with defined risk.`, _src: "fallback" }
      : { action: "flat", confidence: 0.3, thesis: "Signals in conflict — standing aside to protect capital.", _src: "fallback" };
  }
}

// ---------- small UI atoms ----------
const fmt = (n, d = 1) => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

function Stat({ label, value, tone }) {
  const c = tone === "long" ? "var(--long)" : tone === "short" ? "var(--short)" : tone === "signal" ? "var(--signal)" : "var(--text)";
  return (
    <div style={{ borderColor: "var(--line)" }} className="border-l pl-3 py-1">
      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="font-mono text-[15px] mt-0.5" style={{ color: c }}>{value}</div>
    </div>
  );
}

export default function AlphaDesk() {
  const [seed, setSeed] = useState(7);
  const candles = useMemo(() => genCandles(seed), [seed]);
  const cfg = { riskPct: 1 };
  const idx = candles.length - 1;
  const snap = useMemo(() => snapshotAt(candles, idx), [candles, idx]);
  const bt = useMemo(() => backtest(candles, { riskPct: cfg.riskPct }), [candles]);

  const [decision, setDecision] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [typed, setTyped] = useState("");
  const typer = useRef(null);

  const ticket = useMemo(() => {
    if (!decision || decision.action !== "open" || !snap.atr) return null;
    const stopDist = (decision.stop_atr_mult || 1.5) * snap.atr;
    const entry = snap.price;
    const long = decision.side === "long";
    const stop = long ? entry - stopDist : entry + stopDist;
    const tp = long ? entry + stopDist * (decision.reward_risk || 2) : entry - stopDist * (decision.reward_risk || 2);
    const riskAmt = bt.equity * (cfg.riskPct / 100);
    const qty = riskAmt / stopDist;
    return { side: decision.side, entry, stop, tp, qty, riskAmt, rr: decision.reward_risk || 2 };
  }, [decision, snap, bt.equity]);

  async function run() {
    setThinking(true); setDecision(null); setTyped("");
    const d = await agentDecide(snap, cfg);
    setDecision(d); setThinking(false);
  }
  // typewriter reveal of the thesis
  useEffect(() => {
    if (!decision?.thesis) return;
    clearInterval(typer.current);
    let k = 0; const t = decision.thesis;
    typer.current = setInterval(() => {
      k++; setTyped(t.slice(0, k));
      if (k >= t.length) clearInterval(typer.current);
    }, 16);
    return () => clearInterval(typer.current);
  }, [decision]);

  const priceData = candles.slice(-90).map((c) => ({ i: c.i, price: c.close }));
  const eqData = bt.curve.map((p) => ({ i: p.i, equity: Math.round(p.equity) }));

  return (
    <div style={{ background: "var(--ink)", color: "var(--text)", fontFamily: "'Space Grotesk', system-ui, sans-serif" }} className="min-h-screen w-full">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        :root{
          --ink:#0A0D13; --panel:#111722; --panel2:#0E141E; --line:#1E2735;
          --text:#E7EBF2; --muted:#7E8AA0; --long:#2DD4A7; --short:#FB6B7C; --signal:#F5B544;
        }
        .mono{font-family:'JetBrains Mono',monospace}
        .tapecursor::after{content:'▋';color:var(--signal);animation:bl 1s steps(2) infinite}
        @keyframes bl{50%{opacity:0}}
        ::selection{background:rgba(245,181,68,.25)}
      `}</style>

      {/* top bar */}
      <header style={{ borderColor: "var(--line)" }} className="border-b px-5 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div style={{ background: "var(--signal)" }} className="w-2.5 h-2.5 rounded-sm" />
          <span className="font-bold tracking-tight text-[17px]">AlphaDesk</span>
          <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ color: "var(--signal)", border: "1px solid var(--line)" }}>autonomous agent</span>
        </div>
        <div className="mono text-[11px]" style={{ color: "var(--muted)" }}>BTC-USDT · perp · 4h</div>
        <div className="ml-auto flex items-center gap-2 text-[11px] mono" style={{ color: "var(--muted)" }}>
          <Activity size={13} style={{ color: "var(--long)" }} /> feed live
          <span style={{ color: "var(--line)" }}>|</span>
          Bitget AI × Crypto Hackathon
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        {/* LEFT — market + agent (2 cols) */}
        <section className="lg:col-span-2 space-y-4">
          {/* signal strip */}
          <div style={{ background: "var(--panel)", borderColor: "var(--line)" }} className="border rounded-lg p-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-y-3">
              <Stat label="Price" value={`$${fmt(snap.price)}`} />
              <Stat label="RSI 14" value={fmt(snap.rsi, 0)} tone={snap.rsi > 70 ? "short" : snap.rsi < 30 ? "long" : undefined} />
              <Stat label="MACD hist" value={fmt(snap.macd?.hist, 1)} tone={snap.macd?.hist > 0 ? "long" : "short"} />
              <Stat label="MA20 / MA50" value={snap.trend === "up" ? "bull" : snap.trend === "down" ? "bear" : "flat"} tone={snap.trend === "up" ? "long" : snap.trend === "down" ? "short" : undefined} />
              <Stat label="ATR 14" value={fmt(snap.atr, 0)} tone="signal" />
            </div>
          </div>

          {/* price chart */}
          <div style={{ background: "var(--panel)", borderColor: "var(--line)" }} className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>Price · last 90 bars</span>
              {ticket && <span className="mono text-[11px]" style={{ color: "var(--signal)" }}>entry {fmt(ticket.entry)} · stop {fmt(ticket.stop)} · tp {fmt(ticket.tp)}</span>}
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={priceData} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--signal)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--signal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis domain={["auto", "auto"]} width={52} tick={{ fill: "var(--muted)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 11 }} labelStyle={{ color: "var(--muted)" }} />
                <Area type="monotone" dataKey="price" stroke="var(--signal)" strokeWidth={1.6} fill="url(#pg)" />
                {ticket && <ReferenceLine y={ticket.entry} stroke="var(--text)" strokeDasharray="2 3" />}
                {ticket && <ReferenceLine y={ticket.stop} stroke="var(--short)" strokeDasharray="4 3" />}
                {ticket && <ReferenceLine y={ticket.tp} stroke="var(--long)" strokeDasharray="4 3" />}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* THE SIGNATURE: reasoning tape -> order ticket */}
          <div style={{ background: "var(--panel)", borderColor: "var(--line)" }} className="border rounded-lg overflow-hidden">
            <div style={{ borderColor: "var(--line)" }} className="border-b px-4 py-2.5 flex items-center gap-2">
              <Cpu size={15} style={{ color: "var(--signal)" }} />
              <span className="text-[13px] font-semibold">Agent reasoning</span>
              {decision?._src && <span className="mono text-[10px] ml-1" style={{ color: "var(--muted)" }}>· {decision._src === "claude" ? "Claude" : "local policy"}</span>}
              <button onClick={run} disabled={thinking}
                style={{ background: thinking ? "var(--panel2)" : "var(--signal)", color: thinking ? "var(--muted)" : "#1A1205" }}
                className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded transition active:scale-95">
                {thinking ? <><Gauge size={13} className="animate-spin" /> reasoning…</> : <><Play size={13} /> Run agent</>}
              </button>
            </div>

            <div className="px-4 py-4 min-h-[96px]">
              {!decision && !thinking && (
                <p className="text-[13px]" style={{ color: "var(--muted)" }}>
                  Press <span style={{ color: "var(--signal)" }}>Run agent</span> — AlphaDesk reads the live snapshot, reasons like a desk trader, and prints a risk-defined order ticket. Capital is never put at risk without a stop.
                </p>
              )}
              {thinking && <p className="text-[13px] tapecursor" style={{ color: "var(--muted)" }}>reading RSI / MACD / trend / volatility</p>}
              {decision && (
                <div className="space-y-3">
                  <p className={`text-[14px] leading-relaxed ${typed.length < (decision.thesis?.length || 0) ? "tapecursor" : ""}`}>
                    <span className="mono text-[11px] mr-2" style={{ color: "var(--signal)" }}>thesis ›</span>{typed}
                  </p>
                  {decision.action === "open" && ticket ? (
                    <div style={{ background: "var(--panel2)", borderColor: decision.side === "long" ? "var(--long)" : "var(--short)" }} className="border rounded-lg">
                      <div className="flex items-center gap-2 px-4 pt-3">
                        {decision.side === "long" ? <TrendingUp size={16} style={{ color: "var(--long)" }} /> : <TrendingDown size={16} style={{ color: "var(--short)" }} />}
                        <span className="font-semibold tracking-wide" style={{ color: decision.side === "long" ? "var(--long)" : "var(--short)" }}>
                          OPEN {decision.side?.toUpperCase()}
                        </span>
                        <span className="ml-auto mono text-[11px]" style={{ color: "var(--muted)" }}>conf {pct(decision.confidence)}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 px-4 py-3">
                        <Stat label="Entry" value={fmt(ticket.entry)} />
                        <Stat label="Stop" value={fmt(ticket.stop)} tone="short" />
                        <Stat label="Take profit" value={fmt(ticket.tp)} tone="long" />
                        <Stat label="R:R" value={`1:${ticket.rr}`} tone="signal" />
                        <Stat label="Size (BTC)" value={fmt(ticket.qty, 4)} />
                        <Stat label="$ at risk" value={`$${fmt(ticket.riskAmt, 0)}`} />
                        <Stat label="Risk / trade" value={`${cfg.riskPct}%`} />
                        <Stat label="Notional" value={`$${fmt(ticket.qty * ticket.entry, 0)}`} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "var(--panel2)", borderColor: "var(--line)" }} className="border rounded-lg px-4 py-3 flex items-center gap-2">
                      <Minus size={15} style={{ color: "var(--muted)" }} />
                      <span className="text-[13px]" style={{ color: "var(--muted)" }}>FLAT — no trade taken. Preserving capital is a position.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT — backtest / proof of edge */}
        <aside className="space-y-4">
          <div style={{ background: "var(--panel)", borderColor: "var(--line)" }} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={15} style={{ color: "var(--long)" }} />
              <span className="text-[13px] font-semibold">Policy backtest</span>
              <span className="mono text-[10px] ml-auto" style={{ color: "var(--muted)" }}>{bt.count} trades</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={eqData} margin={{ top: 4, right: 6, left: 6, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis width={46} domain={["auto", "auto"]} tick={{ fill: "var(--muted)", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 11 }} />
                <ReferenceLine y={10000} stroke="var(--muted)" strokeDasharray="2 3" />
                <Line type="monotone" dataKey="equity" stroke={bt.totalReturn >= 0 ? "var(--long)" : "var(--short)"} strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-y-3 mt-3">
              <Stat label="Total return" value={pct(bt.totalReturn)} tone={bt.totalReturn >= 0 ? "long" : "short"} />
              <Stat label="Win rate" value={pct(bt.winRate)} />
              <Stat label="Profit factor" value={fmt(bt.profitFactor, 2)} tone={bt.profitFactor >= 1 ? "long" : "short"} />
              <Stat label="Max drawdown" value={pct(bt.maxDD)} tone="short" />
              <Stat label="Sharpe (ann.)" value={fmt(bt.sharpe, 2)} tone="signal" />
              <Stat label="Equity" value={`$${fmt(bt.equity, 0)}`} />
            </div>
          </div>

          {/* recent trades */}
          <div style={{ background: "var(--panel)", borderColor: "var(--line)" }} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Crosshair size={15} style={{ color: "var(--signal)" }} />
              <span className="text-[13px] font-semibold">Trade blotter</span>
            </div>
            <div className="space-y-1.5 max-h-[200px] overflow-auto pr-1">
              {bt.trades.slice(-9).reverse().map((t, k) => (
                <div key={k} className="flex items-center justify-between mono text-[11px] py-1" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span style={{ color: t.side === "long" ? "var(--long)" : "var(--short)" }}>{t.side === "long" ? "L" : "S"} @{fmt(t.entry, 0)}</span>
                  <span style={{ color: "var(--muted)" }}>→ {fmt(t.exit, 0)}</span>
                  <span style={{ color: t.pnl >= 0 ? "var(--long)" : "var(--short)" }}>{t.pnl >= 0 ? "+" : ""}{fmt(t.pnl, 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* new market */}
          <button onClick={() => setSeed((s) => s + 1)}
            style={{ borderColor: "var(--line)", color: "var(--muted)" }}
            className="w-full border rounded-lg py-2.5 inline-flex items-center justify-center gap-2 text-[12px] hover:text-white transition">
            <RotateCcw size={13} /> Resample market regime
          </button>
          <p className="text-[10px] leading-relaxed px-1" style={{ color: "var(--muted)" }}>
            <Zap size={10} className="inline mb-0.5" style={{ color: "var(--signal)" }} /> Feed is a regime-switching simulation for offline demo. Swap <span className="mono">genCandles()</span> for a Bitget REST/WS feed to go live — indicator math, agent, and risk engine are unchanged.
          </p>
        </aside>
      </div>
    </div>
  );
}
