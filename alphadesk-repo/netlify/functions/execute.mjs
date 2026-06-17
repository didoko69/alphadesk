import { BitgetRestClient, loadConfig } from "bitget-core";
// POST /api/execute  { ticket:{ side, size, symbol } }  -> paper order via Bitget Tools API
export default async (req)=>{
  const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}});
  let body; try{ body=await req.json(); }catch(_){ return json({error:"bad json"},400); }
  const t=body.ticket||{}; const symbol=t.symbol||"BTCUSDT";
  const hasKeys=!!(process.env.BITGET_API_KEY&&process.env.BITGET_SECRET_KEY&&process.env.BITGET_PASSPHRASE);
  if(!hasKeys){
    return json({mode:"simulated",note:"No Bitget keys set — order simulated. Add BITGET_* env vars to route a real paper order.",
      order:{symbol,side:t.side,size:t.size,orderType:"market",ts:Date.now()}});
  }
  try{
    const client=new BitgetRestClient(loadConfig({modules:"futures",paperTrading:true}));
    const r=await client.privatePost("/api/v2/mix/order/place-order",{
      symbol, productType:"susdt-futures", marginMode:"isolated", marginCoin:"SUSDT",
      size:String(t.size), side:t.side==="long"?"buy":"sell", tradeSide:"open", orderType:"market",
    });
    return json({mode:"paper",order:r.data,endpoint:r.endpoint});
  }catch(e){ return json({mode:"error",error:String(e&&e.message||e)},200); }
};
