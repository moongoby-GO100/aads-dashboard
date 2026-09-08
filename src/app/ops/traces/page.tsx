"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

function toKST(d: string|null|undefined): string {
  if(!d)return"-";
  try{return new Date(d).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false}).replace(/\.\s*/g,"-").slice(0,16);}catch{return"-";}
}

export default function TracesPage() {
  const [traces,setTraces]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [sel,setSel]=useState<any>(null);
  const [fProj,setFProj]=useState("");
  const [fStat,setFStat]=useState("");
  const [fHrs,setFHrs]=useState(24);
  const [st,setSt]=useState<any>(null);
  const [msg,setMsg]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);
    try{const p:any={hours:fHrs,limit:100};if(fProj)p.project=fProj;if(fStat)p.status=fStat;setTraces((await api.getLlmopsTraces(p))?.traces||[]);}catch{setTraces([]);}
    try{setSt(await api.getLlmopsStatus());}catch{}
    setLoading(false);
  },[fProj,fStat,fHrs]);
  useEffect(()=>{load();},[load]);
  const detail=async(id:string)=>{try{setSel(await api.getLlmopsTraceDetail(id));}catch{}};
  const promote=async(id:string)=>{try{const r=await api.postLlmopsPromote(id);setMsg(r?.promoted?"Promoted":"Failed");setTimeout(()=>setMsg(""),3000);}catch{setMsg("error");}};
  const cs={background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,padding:16,marginBottom:16} as const;
  const th_={padding:"8px 10px",textAlign:"left" as const,fontSize:12,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)"};
  const td_={padding:"8px 10px",fontSize:13,borderBottom:"1px solid var(--border)"};
  const db=st?.db;
  return (
    <div style={{minHeight:"100vh",background:"var(--bg-primary)"}}>
      <Header title="LLMOps Traces" />
      <div style={{padding:"24px 16px",maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:20,fontWeight:700}}>LLMOps Traces</h2>
          <div style={{display:"flex",gap:10}}><a href="/ops/evals" style={{fontSize:13,color:"var(--accent)"}}>Evals</a><a href="/ops" style={{fontSize:13,color:"var(--accent)"}}>Ops</a></div>
        </div>
        {db&&<div style={{...cs,display:"flex",gap:24,flexWrap:"wrap"}}>{[["Traces",db.traces?.total],["Errors",db.traces?.error],["24h",db.traces?.last_24h],["Datasets",db.datasets],["Examples",db.examples]].map(([k,v])=><div key={String(k)}><span style={{fontSize:11,color:"var(--text-secondary)"}}>{k}</span><br/><b>{v??0}</b></div>)}</div>}
        <div style={{...cs,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <select value={fProj} onChange={e=>setFProj(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--bg-primary)",color:"var(--text-primary)",fontSize:13}}><option value="">All</option>{["AADS","KIS","GO100","SF","NTV2","NAS"].map(p=><option key={p}>{p}</option>)}</select>
          <select value={fStat} onChange={e=>setFStat(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--bg-primary)",color:"var(--text-primary)",fontSize:13}}><option value="">All</option><option value="success">Success</option><option value="error">Error</option></select>
          <select value={fHrs} onChange={e=>setFHrs(Number(e.target.value))} style={{padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--bg-primary)",color:"var(--text-primary)",fontSize:13}}>{[1,6,12,24,48,72,168].map(h=><option key={h} value={h}>{h}h</option>)}</select>
          <button onClick={load} style={{padding:"6px 14px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",fontSize:13,cursor:"pointer"}}>Search</button>
          {msg&&<span style={{fontSize:12}}>{msg}</span>}
        </div>
        <div style={{...cs,overflowX:"auto"}}>
          {loading?<div style={{textAlign:"center",padding:20}}>Loading...</div>:
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["St","Project","Source","Model","Latency","Cost","Error","Time",""].map(h=><th key={h} style={th_}>{h}</th>)}</tr></thead>
              <tbody>{traces.length===0?<tr><td colSpan={9} style={{...td_,textAlign:"center"}}>No traces</td></tr>:traces.map(t=><tr key={t.id} style={{cursor:"pointer"}} onClick={()=>detail(t.id)}>
                <td style={td_}>{t.status==="success"?"\u2705":"\u274c"}</td><td style={td_}>{t.project||"-"}</td><td style={td_}>{t.source||"-"}</td>
                <td style={{...td_,fontSize:11}}>{t.model?.split("/").pop()?.slice(0,20)||"-"}</td>
                <td style={td_}>{t.latency_ms!=null?(t.latency_ms/1000).toFixed(1)+"s":"-"}</td>
                <td style={td_}>{t.cost_usd!=null?"$"+t.cost_usd.toFixed(4):"-"}</td>
                <td style={{...td_,fontSize:11,color:"var(--danger)"}}>{t.error_class||""}</td>
                <td style={{...td_,fontSize:11}}>{toKST(t.created_at)}</td>
                <td style={td_}>{t.status==="error"&&<button onClick={e=>{e.stopPropagation();promote(t.id)}} style={{padding:"2px 8px",borderRadius:4,border:"1px solid var(--warning)",background:"transparent",color:"var(--warning)",fontSize:11,cursor:"pointer"}}>Promote</button>}</td>
              </tr>)}</tbody></table>}
        </div>
        {sel&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSel(null)}>
          <div style={{background:"var(--bg-card)",borderRadius:12,padding:24,maxWidth:700,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3>Trace Detail</h3><button onClick={()=>setSel(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer"}}>x</button></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13}}>
              <div><b>ID:</b> {sel.id?.slice(0,12)}</div><div><b>Project:</b> {sel.project}</div>
              <div><b>Source:</b> {sel.source}</div><div><b>Model:</b> {sel.model||"-"}</div>
              <div><b>Status:</b> {sel.status}</div><div><b>Latency:</b> {sel.latency_ms?(sel.latency_ms/1000).toFixed(1)+"s":"-"}</div>
              <div><b>Cost:</b> {sel.cost_usd!=null?"$"+sel.cost_usd.toFixed(4):"-"}</div><div><b>Quality:</b> {sel.quality_score?.toFixed(2)||"-"}</div>
            </div>
            {sel.error&&<pre style={{background:"var(--bg-primary)",padding:8,borderRadius:6,fontSize:11,marginTop:12,whiteSpace:"pre-wrap"}}>{sel.error}</pre>}
            {sel.input_summary&&<div style={{marginTop:8}}><b>Input:</b><pre style={{background:"var(--bg-primary)",padding:8,borderRadius:6,fontSize:11,whiteSpace:"pre-wrap",maxHeight:80,overflow:"auto"}}>{sel.input_summary?.slice(0,500)}</pre></div>}
            {sel.output_summary&&<div style={{marginTop:8}}><b>Output:</b><pre style={{background:"var(--bg-primary)",padding:8,borderRadius:6,fontSize:11,whiteSpace:"pre-wrap",maxHeight:80,overflow:"auto"}}>{sel.output_summary?.slice(0,500)}</pre></div>}
          </div>
        </div>}
      </div>
    </div>
  );
}
