// Provider-agnostic LLM call. Prefers Anthropic; falls back to any OpenAI-compatible
// endpoint (e.g. Alibaba Qwen / DashScope, which this hackathon subsidises).
export async function llm(prompt){
  const aKey=process.env.ANTHROPIC_API_KEY;
  if(aKey){
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
      headers:{"content-type":"application/json","x-api-key":aKey,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:process.env.LLM_MODEL||"claude-sonnet-4-20250514",max_tokens:1000,
        messages:[{role:"user",content:prompt}]})});
    const d=await r.json();
    return (d.content||[]).map(b=>b.type==="text"?b.text:"").join("");
  }
  const base=process.env.LLM_BASE_URL, key=process.env.LLM_API_KEY;
  if(base&&key){
    const r=await fetch(`${base.replace(/\/$/,"")}/chat/completions`,{method:"POST",
      headers:{"content-type":"application/json","authorization":`Bearer ${key}`},
      body:JSON.stringify({model:process.env.LLM_MODEL||"qwen-plus",max_tokens:1000,
        messages:[{role:"user",content:prompt}]})});
    const d=await r.json();
    return d.choices?.[0]?.message?.content||"";
  }
  throw new Error("No LLM provider configured (set ANTHROPIC_API_KEY or LLM_BASE_URL+LLM_API_KEY).");
}
export function parseJSON(txt){
  const c=txt.replace(/```json|```/g,"").trim();
  return JSON.parse(c.slice(c.indexOf("{"),c.lastIndexOf("}")+1));
}
