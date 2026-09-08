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
  const [datasetSlug,setDatasetSlug]=useState("aads-failed-traces");
  const [running,setRunning]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);
    try{setSt(await api.getLlmopsStatus("AADS"));}catch{setMsg("상태 조회 실패: 새로고침 후 다시 시도하십시오.");}
    try{const r=await api.getLlmopsCandidates({project:"AADS",hours:48});setCandidates(r?.candidates||[]);}catch{setCandidates([]);setMsg("승격 후보 조회 실패: 새로고침 후 다시 시도하십시오.");}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);
  const promote=async(id:string)=>{
    try{const r=await api.postLlmopsPromote(id,datasetSlug);setMsg(r?.promoted?"Promoted":"Failed: "+(r?.reason||""));await load();}catch{setMsg("error");}
  };
  useEffect(()=>{
    const saved=localStorage.getItem("aads_llmops_last_experiment");
    if(saved){setExpId(saved);api.getLlmopsEvalResult(saved).then(setEvalResult).catch(()=>setMsg("최근 평가 조회 실패: 실험 ID로 다시 조회하십시오."));}
  },[]);
  const runEval=async()=>{
    if(running||!datasetSlug.trim())return;
    setRunning(true);setMsg("평가 실행 중...");
    try{
      const r=await api.postLlmopsEvalRun(datasetSlug.trim());
      if(r?.experiment_id){
        setExpId(r.experiment_id);
        localStorage.setItem("aads_llmops_last_experiment",r.experiment_id);
        setEvalResult(await api.getLlmopsEvalResult(r.experiment_id));
        await load();setMsg(r.summary?.examples ? "평가 완료" : "평가 대상이 없습니다. Trace를 데이터셋에 먼저 승격하십시오.");
      }else{setMsg(r?.reason||"평가 실행 실패");}
    }catch(e){setMsg(e instanceof Error ? e.message : "평가 실패: 데이터셋 이름과 승격 여부를 확인한 후 재시도하십시오.");}
    finally{setRunning(false);}
  };
  const viewExp=async()=>{if(!expId)return;try{setEvalResult(await api.getLlmopsEvalResult(expId));setMsg("");}catch{setMsg("not found");}};
  const cs={background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,padding:16,marginBottom:16} as const;
  const th_={padding:"8px 10px",textAlign:"left" as const,fontSize:12,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)"};
  const td_={padding:"8px 10px",fontSize:13,borderBottom:"1px solid var(--border)"};
  const db=st?.db;
  const summary=evalResult?.summary;
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
          <input aria-label="평가 데이터셋" value={datasetSlug} onChange={e=>setDatasetSlug(e.target.value)} style={{padding:8,maxWidth:"100%",color:"var(--text-primary)",background:"var(--bg-primary)",border:"1px solid var(--border)"}}/>
          <button disabled={running||!datasetSlug.trim()} onClick={runEval} style={{padding:"8px 16px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600}}>Run Evaluation</button>
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
            <div><b>Scored:</b> {summary?.examples??summary?.count??"-"}</div>
            <div><b>Avg:</b> {(summary?.mean_score??summary?.avg_score)!=null?Number(summary.mean_score??summary.avg_score).toFixed(3):"-"}</div>
            <div><b>Pass:</b> {summary?.pass_rate!=null?(summary.pass_rate*100).toFixed(1)+"%":"-"}</div>
            <div><b>Time:</b> {toKST(evalResult.completed_at??evalResult.started_at)}</div>
          </div>
          {summary?.criteria&&<div style={{marginBottom:12}}>
            <b style={{fontSize:13}}>Criteria:</b>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:6}}>
              {Object.entries(summary?.criteria).map(([k,v]:any)=>
                <div key={k} style={{padding:"4px 10px",borderRadius:6,background:Number(v)>=0.6?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)",fontSize:12}}>
                  <span style={{fontWeight:600}}>{k}</span>: {Number(v).toFixed(2)}
                </div>)}
            </div>
          </div>}
          {evalResult.scores&&evalResult.scores.length>0&&<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Example","Criterion","Score","Pass","Comment"].map(h=><th key={h} style={th_}>{h}</th>)}</tr></thead>
              <tbody>{evalResult.scores.slice(0,50).map((s:any,i:number)=><tr key={i}>
                <td style={{...td_,fontSize:11}}>{s.example_id?.slice(0,8)||"-"}</td>
                <td style={td_}>{s.criterion||"-"}</td>
                <td style={td_}>{s.score!=null?Number(s.score).toFixed(3):"-"}</td>
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
