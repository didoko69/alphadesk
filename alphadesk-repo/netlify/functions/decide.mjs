import { llm, parseJSON } from "./_llm.mjs";
// POST /api/decide  { snapshot, riskPct }  -> single-agent risk-defined decision
export default async (req)=>{
  const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}});
  let body; try{ body=await req.json(); }catch(_){ return json({error:"bad json"},400); }
  const s=body.snapshot, riskPct=body.riskPct||1;
  if(!s) return json({error:"missing snapshot"},400);
  const sys="You are AlphaDesk, a disciplined crypto perpetual-futures trading agent. You only take trades with a clear technical edge and ALWAYS define risk. Given a market snapshot, decide ONE action. Respond with ONLY a JSON object, no prose, no markdown fences. Schema: {\"action\":\"open\"|\"flat\",\"side\":\"long\"|\"short\",\"confidence\":0-1,\"stop_atr_mult\":number,\"reward_risk\":number,\"thesis\":\"<=34 words, terse desk-trader voice\"}. If signals conflict or are weak, action='flat'.";
  const u=`BTC-USDT perp snapshot: price=${(+s.price).toFixed(1)} RSI14=${s.rsi?.toFixed?.(1)} MACDhist=${s.macd?.hist?.toFixed?.(2)} MA20=${s.ma20?.toFixed?.(1)} MA50=${s.ma50?.toFixed?.(1)} trend=${s.trend} ATR14=${s.atr?.toFixed?.(1)} risk=${riskPct}%/trade. Decide.`;
  try{
    const j=parseJSON(await llm(`${sys}\n\n${u}`));
    return json({...j,_src:"Agent · live"});
  }catch(e){ return json({error:String(e&&e.message||e)},500); }
};
