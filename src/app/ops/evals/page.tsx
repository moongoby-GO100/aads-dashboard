"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

function toKST(d: string|null|undefined): string {
  if(!d)return"-";
  try{return new Date(d).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false}).replace(/\.\s*/g,"-").slice(0,16);}catch{return"-";}
}

export default function EvalsPage() {
  const [st,setSt]=useState<any>(null);
  const [candidates,setCandidates]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [msg,setMsg]=useState("");
  const [evalResult,setEvalResult]=useState<any>(null);
  const [expId,setExpId]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);
    try{setSt(await api.getLlmopsStatus());}catch{}
    try{const r=await api.getLlmopsCandidates({hours:48,limit:20});setCandidates(r?.candidates||[]);}catch{setCandidates([]);}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);
  const promote=async(id:string)=>{
    try{const r=await api.postLlmopsPromote(id);setMsg(r?.promoted?"Promoted":"Failed: "+(r?.reason||""));setTimeout(()=>setMsg(""),4000);}catch{setMsg("error");}
  };
  const runEval=async()=>{
    setMsg("Running...");
    try{
      const r=await api.postLlmopsRunEval("aads-failed-traces");
      if(r?.experiment_id){setMsg("Done: "+r.experiment_id.slice(0,12));setExpId(r.experiment_id);try{setEvalResult(await api.getLlmopsEvalResult(r.experiment_id));}catch{}}
      else{setMsg(r?.reason||JSON.stringify(r));}
    }catch{setMsg("eval failed");}
  };
  const viewExp=async()=>{if(!expId)return;try{setEvalResult(await api.getLlmopsEvalResult(expId));setMsg("");}catch{setMsg("not found");}};
  const cs={background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,padding:16,marginBottom:16} as const;
  const th_={padding:"8px 10px",textAlign:"left" as const,fontSize:12,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)"};
  const td_={padding:"8px 10px",fontSize:13,borderBottom:"1px solid var(--border)"};
  const db=st?.db;
  return (
    <div style={{minHeight:"100vh",background:"var(--bg-primary)"}}>
      <Header title="LLMOps Evaluations" />
      <div style={{padding:"24px 16px",maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:20,fontWeight:700}}>LLMOps Evaluations</h2>
          <div style={{display:"flex",gap:10}}><a href="/ops/traces" style={{fontSize:13,color:"var(--accent)"}}>Traces</a><a href="/ops" style={{fontSize:13,color:"var(--accent)"}}>Ops</a></div>
        </div>
        {db&&<div style={{...cs,display:"flex",gap:24,flexWrap:"wrap"}}>
          {[["Datasets",db.datasets],["Examples",db.examples],["Experiments",db.experiments],["Scores",db.scores],["Feedback",db.feedback]].map(([k,v])=>
            <div key={String(k)}><span style={{fontSize:11,color:"var(--text-secondary)"}}>{k}</span><br/><b>{v??0}</b></div>)}
        </div>}
        <div style={{...cs,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={runEval} style={{padding:"8px 16px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600}}>Run Evaluation</button>
          <input value={expId} onChange={e=>setExpId(e.target.value)} placeholder="Experiment ID" style={{padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--bg-primary)",color:"var(--text-primary)",fontSize:13,width:260}}/>
          <button onClick={viewExp} style={{padding:"8px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-primary)",fontSize:13,cursor:"pointer"}}>View</button>
          <button onClick={load} style={{padding:"8px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-primary)",fontSize:13,cursor:"pointer"}}>Refresh</button>
          {msg&&<span style={{fontSize:12,fontWeight:500}}>{msg}</span>}
        </div>
        {evalResult&&<div style={cs}>
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:12}}>Experiment Result</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,fontSize:13,marginBottom:12}}>
            <div><b>ID:</b> {evalResult.id?.slice(0,12)||"-"}</div>
            <div><b>Name:</b> {evalResult.name||"-"}</div>
            <div><b>Dataset:</b> {evalResult.dataset_slug||"-"}</div>
            <div><b>Status:</b> {evalResult.status||"-"}</div>
            <div><b>Scored:</b> {evalResult.scored_count??evalResult.example_count??"-"}</div>
            <div><b>Avg:</b> {evalResult.avg_score!=null?evalResult.avg_score.toFixed(3):"-"}</div>
            <div><b>Pass:</b> {evalResult.pass_rate!=null?(evalResult.pass_rate*100).toFixed(1)+"%":"-"}</div>
            <div><b>Time:</b> {toKST(evalResult.created_at)}</div>
          </div>
          {evalResult.criteria_summary&&<div style={{marginBottom:12}}>
            <b style={{fontSize:13}}>Criteria:</b>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:6}}>
              {Object.entries(evalResult.criteria_summary).map(([k,v]:any)=>
                <div key={k} style={{padding:"4px 10px",borderRadius:6,background:v?.avg_score>=0.6?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)",fontSize:12}}>
                  <span style={{fontWeight:600}}>{k}</span>: {v?.avg_score?.toFixed(2)||"-"} ({v?.pass_count||0}/{v?.total||0})
                </div>)}
            </div>
          </div>}
          {evalResult.scores&&evalResult.scores.length>0&&<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Example","Criterion","Score","Pass","Comment"].map(h=><th key={h} style={th_}>{h}</th>)}</tr></thead>
              <tbody>{evalResult.scores.slice(0,50).map((s:any,i:number)=><tr key={i}>
                <td style={{...td_,fontSize:11}}>{s.example_id?.slice(0,8)||"-"}</td>
                <td style={td_}>{s.criterion||"-"}</td>
                <td style={td_}>{s.score?.toFixed(3)??"-"}</td>
                <td style={td_}>{s.passed?"Y":"N"}</td>
                <td style={{...td_,fontSize:11,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>{s.comment?.slice(0,100)||"-"}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </div>}
        <div style={cs}>
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:12}}>Promotion Candidates <span style={{fontWeight:400,fontSize:13,color:"var(--text-secondary)"}}>({candidates.length})</span></h3>
          <p style={{fontSize:12,color:"var(--text-secondary)",marginBottom:12}}>Promote failed/low-quality traces to eval dataset for automated quality benchmarking.</p>
          <div style={{overflowX:"auto"}}>
            {loading?<div style={{textAlign:"center",padding:20}}>Loading...</div>:
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["St","Project","Source","Model","Quality","Error","Time",""].map(h=><th key={h} style={th_}>{h}</th>)}</tr></thead>
                <tbody>{candidates.length===0?<tr><td colSpan={8} style={{...td_,textAlign:"center",color:"var(--text-secondary)"}}>No candidates</td></tr>:candidates.map(c=><tr key={c.id}>
                  <td style={td_}>{c.status==="success"?"OK":"ERR"}</td>
                  <td style={td_}>{c.project||"-"}</td>
                  <td style={td_}>{c.source||"-"}</td>
                  <td style={{...td_,fontSize:11}}>{c.model?.split("/").pop()?.slice(0,20)||"-"}</td>
                  <td style={td_}>{c.quality_score?.toFixed(2)||"-"}</td>
                  <td style={{...td_,fontSize:11,color:"var(--danger)"}}>{c.error_class||""}</td>
                  <td style={{...td_,fontSize:11}}>{toKST(c.created_at)}</td>
                  <td style={td_}><button onClick={()=>promote(c.id)} style={{padding:"2px 8px",borderRadius:4,border:"1px solid var(--accent)",background:"transparent",color:"var(--accent)",fontSize:11,cursor:"pointer"}}>Promote</button></td>
                </tr>)}</tbody>
              </table>}
          </div>
        </div>
      </div>
    </div>
  );
}
