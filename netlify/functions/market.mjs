import { BitgetRestClient, loadConfig } from "bitget-core";
// GET /api/market?symbol=BTCUSDT&granularity=4H&limit=250
export default async (req) => {
  const url=new URL(req.url);
  const symbol=url.searchParams.get("symbol")||"BTCUSDT";
  const granularity=url.searchParams.get("granularity")||"4H";
  const limit=url.searchParams.get("limit")||"250";
  const productType="usdt-futures";
  const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}});
  try{
    let raw, funding=null;
    try{ // primary: Bitget Agent Hub client (bitget-core)
      const client=new BitgetRestClient(loadConfig({modules:"futures",readOnly:true}));
      raw=(await client.publicGet("/api/v2/mix/market/candles",{symbol,productType,granularity,limit})).data;
      try{ funding=(await client.publicGet("/api/v2/mix/market/current-fund-rate",{symbol,productType})).data?.[0]?.fundingRate ?? null; }catch(_){}
    }catch(sdkErr){ // fallback: direct Bitget REST (same endpoints)
      const u=`https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=${productType}&granularity=${granularity}&limit=${limit}`;
      raw=(await (await fetch(u)).json()).data;
    }
    const candles=(raw||[]).map((c,i)=>({i,ts:+c[0],open:+c[1],high:+c[2],low:+c[3],close:+c[4]}));
    if(!candles.length) return json({error:"no candles returned"},502);
    return json({source:"bitget-live",symbol,granularity,funding,candles});
  }catch(e){ return json({error:String(e&&e.message||e)},500); }
};
