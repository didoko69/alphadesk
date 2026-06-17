import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, ReferenceLine, CartesianGrid, Tooltip,
} from "recharts";

/* ══════════════════════════════════════════════════════════════════════════
   AlphaDesk · Autonomous Execution Terminal
   Bitget AI × Crypto Trading Hackathon — Track: Autonomous Trading Agents
   Visible reasoning · real TA math · Claude-reasoned · policy backtest
   ══════════════════════════════════════════════════════════════════════════ */

/* ---------- market engine ---------- */
function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function gauss(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function genCandles(seed,n=260,start=64000){
  const r=mulberry32(seed);const c=[];let p=start,drift=0.0004,vol=0.011,reg=0,left=30;
  for(let i=0;i<n;i++){
    if(left--<=0){reg=Math.floor(r()*3);left=18+Math.floor(r()*34);drift=reg===0?0.0016:reg===1?-0.0015:0.0001;vol=reg===2?0.016:0.0105;}
    const o=p,ret=drift+vol*gauss(r),cl=Math.max(1,o*(1+ret));
    const hi=Math.max(o,cl)*(1+Math.abs(vol*gauss(r))*0.55),lo=Math.min(o,cl)*(1-Math.abs(vol*gauss(r))*0.55);
    c.push({i,open:o,high:hi,low:lo,close:cl});p=cl;
  }
  return c;
}
const sma=(a,p,i)=>{if(i<p-1)return null;let s=0;for(let k=i-p+1;k<=i;k++)s+=a[k];return s/p;};
function ema(a,p){const k=2/(p+1);const o=[];let pr=a[0];for(let i=0;i<a.length;i++){pr=i===0?a[0]:a[i]*k+pr*(1-k);o.push(pr);}return o;}
function rsiS(c,p=14){const o=new Array(c.length).fill(null);let g=0,l=0;for(let i=1;i<c.length;i++){const ch=c[i]-c[i-1],gg=Math.max(ch,0),ll=Math.max(-ch,0);if(i<=p){g+=gg;l+=ll;if(i===p){g/=p;l/=p;o[i]=100-100/(1+g/(l||1e-9));}}else{g=(g*(p-1)+gg)/p;l=(l*(p-1)+ll)/p;o[i]=100-100/(1+g/(l||1e-9));}}return o;}
function macdS(c){const e12=ema(c,12),e26=ema(c,26),m=c.map((_,i)=>e12[i]-e26[i]),s=ema(m,9);return m.map((mm,i)=>({macd:mm,signal:s[i],hist:mm-s[i]}));}
function atrS(c,p=14){const tr=c.map((x,i)=>i===0?x.high-x.low:Math.max(x.high-x.low,Math.abs(x.high-c[i-1].close),Math.abs(x.low-c[i-1].close)));const o=new Array(c.length).fill(null);let acc=0;for(let i=0;i<tr.length;i++){if(i<p){acc+=tr[i];if(i===p-1)o[i]=acc/p;}else o[i]=(o[i-1]*(p-1)+tr[i])/p;}return o;}
function snapAt(c,i){const cl=c.map(x=>x.close);return{price:cl[i],rsi:rsiS(cl)[i],macd:macdS(cl)[i],atr:atrS(c)[i],ma20:sma(cl,20,i),ma50:sma(cl,50,i),trend:(()=>{const a=sma(cl,20,i),b=sma(cl,50,i);return a!=null&&b!=null?(a>b?"up":"down"):"flat";})()};}
function policy(s){
  if(s.ma20==null||s.ma50==null||s.rsi==null||!s.macd)return{side:null,conf:0};
  const up=s.ma20>s.ma50,mu=s.macd.hist>0;let side=null,conf=0;
  if(up&&mu&&s.rsi>48&&s.rsi<72){side="long";conf=0.5+Math.min(0.4,(s.macd.hist/s.price)*60)+(s.rsi<60?0.08:0);}
  else if(!up&&!mu&&s.rsi<52&&s.rsi>28){side="short";conf=0.5+Math.min(0.4,(-s.macd.hist/s.price)*60)+(s.rsi>40?0.08:0);}
  return{side,conf:Math.max(0,Math.min(0.97,conf))};
}
function backtest(c,{riskPct=1,atrStop=1.5,rr=2,equity0=10000}={}){
  let eq=equity0;const curve=[{i:0,equity:eq}];let pos=null;const trades=[];let peak=eq,mdd=0;
  for(let i=55;i<c.length;i++){
    const s=snapAt(c,i),cd=c[i];
    if(pos){
      const hs=pos.side==="long"?cd.low<=pos.stop:cd.high>=pos.stop;
      const ht=pos.side==="long"?cd.high>=pos.tp:cd.low<=pos.tp;
      let ex=hs?pos.stop:ht?pos.tp:null;
      if(ex!=null){const dir=pos.side==="long"?1:-1;const pnl=(ex-pos.entry)*dir*pos.qty;eq+=pnl;trades.push({...pos,exit:ex,pnl,exitI:i});pos=null;peak=Math.max(peak,eq);mdd=Math.max(mdd,(peak-eq)/peak);curve.push({i,equity:eq});}
    }
    if(!pos){const p=policy(s);if(p.side&&s.atr){const sd=atrStop*s.atr,entry=s.price,stop=p.side==="long"?entry-sd:entry+sd,tp=p.side==="long"?entry+sd*rr:entry-sd*rr,qty=(eq*(riskPct/100))/sd;pos={side:p.side,entry,stop,tp,qty,conf:p.conf,entryI:i};}}
  }
  const w=trades.filter(t=>t.pnl>0),gw=w.reduce((a,t)=>a+t.pnl,0),gl=Math.abs(trades.filter(t=>t.pnl<0).reduce((a,t)=>a+t.pnl,0));
  const rets=curve.map((x,k)=>k===0?0:(x.equity-curve[k-1].equity)/curve[k-1].equity);
  const mean=rets.reduce((a,b)=>a+b,0)/(rets.length||1);
  const sd=Math.sqrt(rets.reduce((a,b)=>a+(b-mean)**2,0)/(rets.length||1))||1e-9;
  return{equity:eq,curve,trades,winRate:trades.length?w.length/trades.length:0,profitFactor:gl?gw/gl:gw>0?99:0,maxDD:mdd,totalReturn:(eq-equity0)/equity0,sharpe:(mean/sd)*Math.sqrt(rets.length),count:trades.length};
}
async function agentDecide(s,cfg){
  // 1) backend — runs live on the deployed site with the LLM key (perception built on Bitget Agent Hub)
  try{
    const r=await fetch("/api/decide",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({snapshot:s,riskPct:cfg.riskPct})});
    if(r.ok){const j=await r.json();if(!j.error&&j.action)return{...j,_src:j._src||"Agent · live"};}
  }catch(e){}
  // 2) in-artifact direct reasoning (works in the chat preview)
  const sys="You are AlphaDesk, a disciplined crypto perpetual-futures trading agent. You only take trades with a clear technical edge and ALWAYS define risk. Given a market snapshot, decide ONE action. Respond with ONLY a JSON object, no prose, no markdown fences. Schema: {\"action\":\"open\"|\"flat\",\"side\":\"long\"|\"short\",\"confidence\":0-1,\"stop_atr_mult\":number,\"reward_risk\":number,\"thesis\":\"<=34 words, terse desk-trader voice\"}. If signals conflict or are weak, action='flat'.";
  const u=`BTC-USDT perp snapshot: price=${s.price.toFixed(1)} RSI14=${s.rsi?.toFixed(1)} MACDhist=${s.macd?.hist?.toFixed(2)} MA20=${s.ma20?.toFixed(1)} MA50=${s.ma50?.toFixed(1)} trend=${s.trend} ATR14=${s.atr?.toFixed(1)} risk=${cfg.riskPct}%/trade. Decide.`;
  try{
    const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:`${sys}\n\n${u}`}]})});
    const data=await res.json();
    const txt=(data.content||[]).map(b=>b.type==="text"?b.text:"").join("");
    const cl=txt.replace(/```json|```/g,"").trim();
    const j=JSON.parse(cl.slice(cl.indexOf("{"),cl.lastIndexOf("}")+1));
    return{...j,_src:"Claude"};
  }catch(e){
    const p=policy(s);
    return p.side?{action:"open",side:p.side,confidence:p.conf,stop_atr_mult:1.5,reward_risk:2,thesis:`${p.side==="long"?"Uptrend":"Downtrend"} confirmed by MACD and RSI alignment — taking the trend with fixed, predefined risk.`,_src:"Local policy"}
      :{action:"flat",confidence:0.3,thesis:"Signals are in conflict — standing aside to protect capital.",_src:"Local policy"};
  }
}
async function loadMarket(){
  const r=await fetch("/api/market?symbol=BTCUSDT&granularity=4H&limit=250");
  if(!r.ok)throw new Error("market");
  const j=await r.json();
  if(!j.candles||j.candles.length<70)throw new Error("thin");
  const candles=j.candles.slice().sort((a,b)=>a.ts-b.ts).map((c,i)=>({i,close:c.close}));
  return{candles,funding:j.funding,source:j.source||"bitget-live"};
}
async function executeOrder(side,qty){
  try{const r=await fetch("/api/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket:{symbol:"BTCUSDT",side,size:Number(qty.toFixed(4))}})});
    if(!r.ok)throw 0;return await r.json();}catch(e){return{mode:"simulated"};}
}
const f=(n,d=1)=>n==null?"——":Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const pc=n=>n==null?"——":`${(n*100).toFixed(1)}%`;

/* ---------- atoms ---------- */
function Field({k,v,tone,big}){
  const c=tone==="up"?"var(--up)":tone==="dn"?"var(--dn)":tone==="ag"?"var(--agent)":"var(--text)";
  return(<div>
    <div className="lab">{k}</div>
    <div className="num" style={{color:c,fontSize:big?20:14,marginTop:2}}>{v}</div>
  </div>);
}
function Chip({k,v,tone}){
  const c=tone==="up"?"var(--up)":tone==="dn"?"var(--dn)":"var(--muted)";
  return(<span className="chip"><span style={{color:"var(--faint)"}}>{k}</span> <span className="num" style={{color:c}}>{v}</span></span>);
}
function Card({title,right,children,style}){
  return(<section className="card" style={style}>
    <header className="card-h"><span className="card-t">{title}</span>{right}</header>
    <div className="card-b">{children}</div>
  </section>);
}

const STEPS=["Read market feed","Compute structure","Reason over edge","Issue order ticket"];

export default function AlphaDesk(){
  const [seed,setSeed]=useState(7);
  const [candles,setCandles]=useState(()=>genCandles(7));
  const [source,setSource]=useState("sim");
  const [funding,setFunding]=useState(null);
  const [exec,setExec]=useState(null);
  useEffect(()=>{(async()=>{try{const m=await loadMarket();if(m.candles.length>70){setCandles(m.candles);setSource(m.source);setFunding(m.funding);}}catch(e){}})();},[]);
  const cfg={riskPct:1};
  const idx=candles.length-1;
  const snap=useMemo(()=>snapAt(candles,idx),[candles,idx]);
  const bt=useMemo(()=>backtest(candles,{riskPct:cfg.riskPct}),[candles]);
  const chg=(snap.price-candles[idx-1].close)/candles[idx-1].close;

  const [state,setState]=useState(STEPS.map(()=>"idle")); // idle|active|done
  const [decision,setDecision]=useState(null);
  const [typed,setTyped]=useState("");
  const [busy,setBusy]=useState(false);
  const [clock,setClock]=useState("");
  const typer=useRef(null);

  useEffect(()=>{const t=setInterval(()=>setClock(new Date().toLocaleTimeString("en-GB")),1000);setClock(new Date().toLocaleTimeString("en-GB"));return()=>clearInterval(t);},[]);

  const ticket=useMemo(()=>{
    if(!decision||decision.action!=="open"||!snap.atr)return null;
    const sd=(decision.stop_atr_mult||1.5)*snap.atr,entry=snap.price,long=decision.side==="long";
    const stop=long?entry-sd:entry+sd,tp=long?entry+sd*(decision.reward_risk||2):entry-sd*(decision.reward_risk||2);
    const riskAmt=bt.equity*(cfg.riskPct/100),qty=riskAmt/sd;
    return{side:decision.side,entry,stop,tp,qty,riskAmt,rr:decision.reward_risk||2,notional:qty*entry};
  },[decision,snap,bt.equity]);

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const setStep=(i,v)=>setState(p=>p.map((x,k)=>k===i?v:x));
  async function run(){
    if(busy)return;
    setBusy(true);setDecision(null);setTyped("");setState(STEPS.map(()=>"idle"));
    setStep(0,"active");await sleep(420);setStep(0,"done");
    setStep(1,"active");await sleep(560);setStep(1,"done");
    setStep(2,"active");const d=await agentDecide(snap,cfg);setStep(2,"done");
    setStep(3,"active");setDecision(d);
    if(d.action==="open"&&d.side&&snap.atr){
      const sd=(d.stop_atr_mult||1.5)*snap.atr,qty=(bt.equity*(cfg.riskPct/100))/sd;
      setExec(await executeOrder(d.side,qty));
    }else setExec(null);
    await sleep(260);setStep(3,"done");
    setBusy(false);
  }
  useEffect(()=>{
    if(!decision?.thesis)return;clearInterval(typer.current);
    let k=0;const t=decision.thesis;
    typer.current=setInterval(()=>{k++;setTyped(t.slice(0,k));if(k>=t.length)clearInterval(typer.current);},14);
    return()=>clearInterval(typer.current);
  },[decision]);

  const priceData=candles.slice(-90).map(c=>({i:c.i,price:c.close}));
  const eqData=bt.curve.map(p=>({i:p.i,equity:Math.round(p.equity)}));

  return(
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .root{
          --bg:#0B0E14; --panel:#12161F; --panel2:#0F131B; --line:#1F2632; --line2:#2B3340;
          --text:#E7EAF1; --muted:#8A94A6; --faint:#586176;
          --up:#34D6A0; --dn:#FF5D73; --agent:#8C8DFF; --agentdim:#2C2E52; --paper:#F3F5FA;
          min-height:100vh; background:
            radial-gradient(1100px 520px at 78% -8%, rgba(140,141,255,0.07), transparent 60%),
            var(--bg);
          color:var(--text); font-family:'Space Grotesk',system-ui,sans-serif; letter-spacing:0.01em;
        }
        .root *{box-sizing:border-box}
        .num{font-family:'IBM Plex Mono',monospace; font-variant-numeric:tabular-nums; font-weight:500}
        .lab{font-size:10px; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted)}
        .wrap{max-width:1180px; margin:0 auto; padding:18px 16px 28px}
        .card{background:var(--panel); border:1px solid var(--line); border-radius:14px; overflow:hidden}
        .card-h{display:flex; align-items:center; justify-content:space-between; gap:10px;
          padding:11px 15px; border-bottom:1px solid var(--line)}
        .card-t{font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); font-weight:600}
        .card-b{padding:15px}
        .chip{display:inline-flex; gap:6px; align-items:baseline; font-size:12px; background:var(--panel2);
          border:1px solid var(--line); border-radius:999px; padding:4px 10px}
        .runbtn{display:inline-flex; align-items:center; gap:8px; font-family:inherit; font-size:12.5px; font-weight:600;
          letter-spacing:0.03em; padding:8px 15px; border-radius:9px; cursor:pointer; border:1px solid transparent;
          background:var(--agent); color:#0B0B16; transition:transform .1s, filter .15s}
        .runbtn:hover:not(:disabled){filter:brightness(1.08)} .runbtn:active{transform:scale(.97)}
        .runbtn:disabled{background:var(--panel2); color:var(--muted); border-color:var(--line); cursor:wait}
        .ghostbtn{width:100%; font-family:inherit; font-size:12px; font-weight:500; letter-spacing:0.04em;
          color:var(--muted); background:transparent; border:1px solid var(--line); border-radius:10px; padding:10px; cursor:pointer; transition:.15s}
        .ghostbtn:hover{color:var(--text); border-color:var(--line2)}
        .pill{font-size:10.5px; letter-spacing:0.1em; padding:3px 9px; border-radius:999px; border:1px solid var(--line2)}
        /* reasoning rail */
        .rail{position:relative; padding-left:30px}
        .rail::before{content:''; position:absolute; left:9px; top:6px; bottom:6px; width:2px; background:var(--line)}
        .step{position:relative; padding:0 0 16px}
        .step:last-child{padding-bottom:0}
        .node{position:absolute; left:-30px; top:1px; width:20px; height:20px; border-radius:50%;
          border:2px solid var(--line2); background:var(--panel); display:flex; align-items:center; justify-content:center; z-index:1}
        .node.active{border-color:var(--agent); box-shadow:0 0 0 4px var(--agentdim); animation:pulse 1.1s ease-in-out infinite}
        .node.done{border-color:var(--agent); background:var(--agent)}
        .node .tick{color:#0B0B16; font-size:11px; line-height:1}
        .node .dot{width:6px; height:6px; border-radius:50%; background:var(--agent)}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 4px var(--agentdim)}50%{box-shadow:0 0 0 7px transparent}}
        .step-l{font-size:13px; font-weight:500; color:var(--text)}
        .step.idle .step-l{color:var(--faint)}
        .cur::after{content:'▍'; color:var(--agent); animation:bl 1s steps(2) infinite; margin-left:1px}
        @keyframes bl{50%{opacity:0}}
        @media (prefers-reduced-motion:reduce){.node.active{animation:none}.cur::after{animation:none}}
        .grid2{display:grid; grid-template-columns:1.6fr 1fr; gap:14px}
        .gridf{display:grid; grid-template-columns:repeat(4,1fr); gap:14px 10px}
        @media (max-width:840px){.grid2{grid-template-columns:1fr}.gridf{grid-template-columns:repeat(2,1fr)}}
        ::selection{background:rgba(140,141,255,.3)}
        .scr::-webkit-scrollbar{width:7px}.scr::-webkit-scrollbar-thumb{background:var(--line2);border-radius:6px}
        a{color:var(--agent)}
      `}</style>

      <div className="wrap">
        {/* top bar */}
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <span style={{width:13,height:13,borderRadius:4,background:"var(--agent)",display:"inline-block",transform:"rotate(45deg)"}}/>
            <span style={{fontWeight:700,fontSize:18,letterSpacing:"-0.01em"}}>AlphaDesk</span>
          </div>
          <span style={{color:"var(--muted)",fontSize:12.5}}>Autonomous Execution Terminal</span>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:14,fontSize:12}}>
            <span className="pill" style={{color:source==="sim"?"var(--muted)":"var(--up)",borderColor:source==="sim"?"var(--line2)":"rgba(52,214,160,.4)"}}>{source==="sim"?"◷ Sim feed":"● Bitget live"}</span>
            <span className="num" style={{color:"var(--muted)"}}>{clock}</span>
          </div>
        </div>

        <div className="grid2">
          {/* LEFT */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Card title="BTC-USDT · Perp · 4h"
              right={<span className="num" style={{fontSize:12,color:chg>=0?"var(--up)":"var(--dn)"}}>{chg>=0?"▲":"▼"} {pc(Math.abs(chg))}</span>}>
              <div style={{display:"flex",alignItems:"flex-end",gap:16,marginBottom:12}}>
                <div>
                  <div className="lab">Mark price</div>
                  <div className="num" style={{fontSize:32,fontWeight:600,color:"var(--paper)",lineHeight:1.1,marginTop:3}}>{f(snap.price)}</div>
                </div>
                {ticket&&<div style={{marginLeft:"auto",display:"flex",gap:18,fontSize:12,color:"var(--muted)"}}>
                  <span>entry <span className="num" style={{color:"var(--paper)"}}>{f(ticket.entry,0)}</span></span>
                  <span>stop <span className="num" style={{color:"var(--dn)"}}>{f(ticket.stop,0)}</span></span>
                  <span>tp <span className="num" style={{color:"var(--up)"}}>{f(ticket.tp,0)}</span></span>
                </div>}
              </div>
              <ResponsiveContainer width="100%" height={196}>
                <AreaChart data={priceData} margin={{top:6,right:6,left:6,bottom:0}}>
                  <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--agent)" stopOpacity={0.22}/>
                    <stop offset="100%" stopColor="var(--agent)" stopOpacity={0}/>
                  </linearGradient></defs>
                  <CartesianGrid stroke="var(--line)" vertical={false}/>
                  <XAxis dataKey="i" hide/>
                  <YAxis domain={["auto","auto"]} width={52} tick={{fill:"var(--muted)",fontSize:10,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:"var(--panel2)",border:"1px solid var(--line2)",borderRadius:10,fontFamily:"IBM Plex Mono",fontSize:11,color:"var(--text)"}} labelStyle={{color:"var(--muted)"}}/>
                  <Area type="monotone" dataKey="price" stroke="var(--agent)" strokeWidth={1.7} fill="url(#pg)"/>
                  {ticket&&<ReferenceLine y={ticket.entry} stroke="var(--paper)" strokeDasharray="2 4"/>}
                  {ticket&&<ReferenceLine y={ticket.stop} stroke="var(--dn)" strokeDasharray="5 4"/>}
                  {ticket&&<ReferenceLine y={ticket.tp} stroke="var(--up)" strokeDasharray="5 4"/>}
                </AreaChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
                <Chip k="RSI" v={f(snap.rsi,0)} tone={snap.rsi>70?"dn":snap.rsi<30?"up":undefined}/>
                <Chip k="MACD" v={f(snap.macd?.hist,1)} tone={snap.macd?.hist>0?"up":"dn"}/>
                <Chip k="MA20/50" v={snap.trend} tone={snap.trend==="up"?"up":snap.trend==="down"?"dn":undefined}/>
                <Chip k="ATR" v={f(snap.atr,0)}/>
              </div>
            </Card>

            {/* AGENT — signature reasoning rail */}
            <Card title="Agent reasoning"
              right={<button className="runbtn" onClick={run} disabled={busy}>{busy?"Reasoning…":"▶ Run agent"}</button>}>
              {state.every(s=>s==="idle")&&!busy?(
                <div style={{color:"var(--muted)",fontSize:13,lineHeight:1.6}}>
                  The agent reads the live snapshot, reasons over market structure like a desk trader, and issues a
                  risk-defined order ticket. <span style={{color:"var(--text)"}}>No position is ever opened without a stop.</span>
                </div>
              ):(
                <div className="rail">
                  {STEPS.map((label,i)=>{
                    const st=state[i];
                    return(<div key={i} className={`step ${st}`}>
                      <span className={`node ${st}`}>{st==="done"?<span className="tick">✓</span>:st==="active"?<span className="dot"/>:null}</span>
                      <div className="step-l">{label}</div>
                      <div style={{marginTop:6}}>
                        {i===0&&state[0]!=="idle"&&(
                          <div style={{fontSize:12,color:"var(--muted)"}} className="num">
                            BTC-USDT @ {f(snap.price)} · <span style={{color:chg>=0?"var(--up)":"var(--dn)"}}>{chg>=0?"+":""}{pc(chg)}</span>
                          </div>)}
                        {i===1&&(state[1]==="done"||state[2]!=="idle"||state[3]!=="idle")&&(
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            <Chip k="RSI" v={f(snap.rsi,0)}/><Chip k="MACD" v={f(snap.macd?.hist,1)} tone={snap.macd?.hist>0?"up":"dn"}/>
                            <Chip k="trend" v={snap.trend} tone={snap.trend==="up"?"up":snap.trend==="down"?"dn":undefined}/><Chip k="ATR" v={f(snap.atr,0)}/>
                          </div>)}
                        {i===2&&decision&&(
                          <div style={{fontSize:13,color:"var(--paper)",lineHeight:1.55}}>
                            <span className={typed.length<(decision.thesis?.length||0)?"cur":""}>{typed}</span>
                            {typed.length>=(decision.thesis?.length||0)&&<span style={{color:"var(--faint)",marginLeft:8,fontSize:11}}>— {decision._src}, conf {pc(decision.confidence)}</span>}
                          </div>)}
                        {i===2&&state[2]==="active"&&!decision&&(<div style={{fontSize:12,color:"var(--muted)"}}>weighing trend, momentum and volatility…</div>)}
                        {i===3&&decision&&ticket&&(
                          <div style={{marginTop:6,border:`1px solid ${ticket.side==="long"?"rgba(52,214,160,.5)":"rgba(255,93,115,.5)"}`,borderRadius:12,background:"var(--panel2)"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 13px",borderBottom:"1px solid var(--line)"}}>
                              <span style={{fontWeight:700,letterSpacing:"0.04em",color:ticket.side==="long"?"var(--up)":"var(--dn)"}}>{ticket.side==="long"?"▲ OPEN LONG":"▼ OPEN SHORT"}</span>
                              <span className="pill" style={{marginLeft:"auto",color:"var(--muted)"}}>Market ticket</span>
                            </div>
                            <div style={{padding:"13px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px 10px"}}>
                              <Field k="Entry" v={f(ticket.entry)}/><Field k="Stop" v={f(ticket.stop)} tone="dn"/>
                              <Field k="Take profit" v={f(ticket.tp)} tone="up"/><Field k="R : R" v={`1:${ticket.rr}`} tone="ag"/>
                              <Field k="Size · BTC" v={f(ticket.qty,4)}/><Field k="$ at risk" v={`$${f(ticket.riskAmt,0)}`}/>
                              <Field k="Risk/trade" v={`${cfg.riskPct}%`}/><Field k="Notional" v={`$${f(ticket.notional,0)}`}/>
                            </div>
                            {exec&&<div style={{padding:"8px 13px",borderTop:"1px solid var(--line)",fontSize:11.5,color:"var(--muted)"}}>
                              <span style={{color:exec.mode==="paper"?"var(--up)":exec.mode==="simulated"?"var(--muted)":"var(--agent)"}}>⇄ Bitget Tools API</span> — {exec.mode==="paper"?`paper order routed${exec.order?.orderId?` · id ${String(exec.order.orderId).slice(0,10)}…`:""}`:exec.mode==="simulated"?"order simulated — set BITGET_* keys to route a real paper order":"execution offline"}
                            </div>}
                          </div>)}
                        {i===3&&decision&&decision.action!=="open"&&(
                          <div style={{marginTop:6,border:"1px solid var(--line2)",borderRadius:12,background:"var(--panel2)",padding:"11px 13px",fontSize:12.5,color:"var(--muted)"}}>
                            ◇ Stand aside — no trade taken. Preserving capital is a position.
                          </div>)}
                      </div>
                    </div>);
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* RIGHT */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Card title="Policy backtest" right={<span className="lab">{bt.count} trades</span>}>
              <ResponsiveContainer width="100%" height={124}>
                <LineChart data={eqData} margin={{top:4,right:6,left:4,bottom:0}}>
                  <CartesianGrid stroke="var(--line)" vertical={false}/>
                  <XAxis dataKey="i" hide/>
                  <YAxis width={50} domain={["auto","auto"]} tick={{fill:"var(--muted)",fontSize:9,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
                  <ReferenceLine y={10000} stroke="var(--line2)" strokeDasharray="2 3"/>
                  <Line type="monotone" dataKey="equity" stroke={bt.totalReturn>=0?"var(--up)":"var(--dn)"} strokeWidth={1.8} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
              <div className="gridf" style={{marginTop:14}}>
                <Field k="Return" v={pc(bt.totalReturn)} tone={bt.totalReturn>=0?"up":"dn"}/>
                <Field k="Win rate" v={pc(bt.winRate)}/>
                <Field k="Profit factor" v={f(bt.profitFactor,2)} tone={bt.profitFactor>=1?"up":"dn"}/>
                <Field k="Max DD" v={pc(bt.maxDD)} tone="dn"/>
                <Field k="Sharpe" v={f(bt.sharpe,2)} tone="ag"/>
                <Field k="Equity" v={`$${f(bt.equity,0)}`}/>
              </div>
            </Card>

            <Card title="Trade blotter">
              <div className="scr" style={{maxHeight:188,overflowY:"auto"}}>
                {bt.trades.slice(-10).reverse().map((t,k)=>(
                  <div key={k} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:10,alignItems:"center",padding:"7px 0",borderBottom:"1px solid var(--line)"}}>
                    <span className="pill" style={{color:t.side==="long"?"var(--up)":"var(--dn)",borderColor:t.side==="long"?"rgba(52,214,160,.35)":"rgba(255,93,115,.35)"}}>{t.side==="long"?"LONG":"SHORT"}</span>
                    <span className="num" style={{fontSize:11.5,color:"var(--muted)"}}>{f(t.entry,0)} → {f(t.exit,0)}</span>
                    <span className="num" style={{fontSize:12,color:t.pnl>=0?"var(--up)":"var(--dn)"}}>{t.pnl>=0?"+":""}{f(t.pnl,0)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <button className="ghostbtn" onClick={()=>setSeed(s=>s+1)}>↻ Resample market regime</button>
          </div>
        </div>

        {/* footer status */}
        <div style={{display:"flex",gap:18,flexWrap:"wrap",alignItems:"center",marginTop:16,paddingTop:13,borderTop:"1px solid var(--line)",fontSize:11,color:"var(--muted)"}}>
          <span>Feed <span style={{color:source==="sim"?"var(--text)":"var(--up)"}}>{source==="sim"?"Simulated":"Bitget live"}</span></span>
          <span>Engine <span style={{color:"var(--up)"}}>OK</span></span>
          <span>Risk <span style={{color:"var(--text)"}}>1% / trade · ATR-stopped</span></span>
          <span style={{marginLeft:"auto"}}>Bitget AI × Crypto Hackathon — Autonomous Trading Agents</span>
        </div>
        <div style={{fontSize:10.5,color:"var(--faint)",marginTop:10,lineHeight:1.6}}>
          Perception built on Bitget Agent Hub (live perp candles + funding), the agent runs live on the deployed backend (decision), the order routes to Bitget's Tools API in paper mode (execution), risk is volatility-sized at 1% with an ATR stop, and the policy is backtested for verifiable edge. Falls back to in-app reasoning when the backend is offline.
        </div>
      </div>
    </div>
  );
}
