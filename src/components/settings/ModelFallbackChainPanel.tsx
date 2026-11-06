"use client";

import { useEffect, useState } from "react";
import { api, type FallbackCandidate, type ModelFallbackChain } from "@/lib/api";

type Model = { provider: string; model_id: string; display_name?: string; is_enabled: boolean; is_active?: boolean };
const keyOf = (model: { provider: string; model_id: string }) => JSON.stringify([model.provider, model.model_id]);

export default function ModelFallbackChainPanel({ models, globalChain }: { models: Model[]; globalChain: FallbackCandidate[] }) {
  const [chains, setChains] = useState<ModelFallbackChain[]>([]);
  const [source, setSource] = useState("");
  const [drafts, setDrafts] = useState<Record<string, FallbackCandidate[]>>({});
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    api.getModelFallbackChains().then((res) => { if (live) { setChains(res.chains.map((item) => ({ ...item, chain: [...item.chain].sort((a, b) => a.display_order - b.display_order) }))); setReady(true); } })
      .catch((error: unknown) => { if (live) setMessage(error instanceof Error ? error.message : "모델별 폴백 조회 실패"); });
    return () => { live = false; };
  }, []);
  const sources = models.filter((model) => model.is_enabled && model.is_active === true);
  const selected = sources.find((model) => keyOf(model) === source);
  const saved = chains.find((chain) => chain.source_provider === selected?.provider && chain.source_model_id === selected?.model_id);
  const draft = drafts[source] ?? saved?.chain ?? [];
  const update = (chain: FallbackCandidate[]) => setDrafts((prev) => ({ ...prev, [source]: chain.map((item, index) => ({ ...item, display_order: index })) }));
  const save = async () => {
    if (!selected) return;
    setSaving(true); setMessage("");
    try {
      const result = await api.updateModelFallbackChain(selected.provider, selected.model_id, draft);
      setChains((prev) => [...prev.filter((item) => item.source_provider !== selected.provider || item.source_model_id !== selected.model_id), result]);
      setMessage("저장 완료");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 실패"); }
    finally { setSaving(false); }
  };
  const move = (index: number, offset: number) => {
    const next = [...draft];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    update(next);
  };
  return <section className="rounded-xl p-4 space-y-3 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
    <h3 className="text-sm font-semibold">모델별 폴백</h3>
    <label className="block text-xs">원본 모델
      <select className="block w-full min-h-11 rounded mt-1" value={source} disabled={!ready || saving} onChange={(event) => { setSource(event.target.value); setMessage(""); }}>
        <option value="">원본 모델 선택</option>
        {sources.map((model) => <option key={keyOf(model)} value={keyOf(model)}>{model.display_name || model.model_id} · {model.provider}</option>)}
      </select>
    </label>
    {selected && <>
      {draft.length === 0 && <div className="text-xs space-y-2"><p>전역 순서 사용 중</p>
        {globalChain.filter((item) => item.is_enabled).map((item, index) => <p className="break-all" key={keyOf(item)}>{index + 1}. {item.provider} · {item.model_id}{item.excluded_reason ? " ⚠️ 서버가 전역 폴백에서 제외" : ""}</p>)}
      </div>}
      <ol className="space-y-2">{draft.map((item, index) => <li key={keyOf(item)} className="rounded border p-2 text-xs space-y-2">
        <p className="break-all">{index + 1}. {item.provider} · {item.model_id}</p>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="min-h-11 inline-flex items-center gap-2"><input type="checkbox" checked={item.is_enabled} disabled={saving} onChange={(event) => update(draft.map((row, i) => i === index ? { ...row, is_enabled: event.target.checked } : row))} />사용</label>
          <button className="min-h-11 min-w-11 border rounded" aria-label={`${item.model_id} 위로 이동`} disabled={saving || index === 0} onClick={() => move(index, -1)}>위로</button>
          <button className="min-h-11 min-w-11 border rounded" aria-label={`${item.model_id} 아래로 이동`} disabled={saving || index === draft.length - 1} onClick={() => move(index, 1)}>아래로</button>
          <button className="min-h-11 min-w-11 border rounded" disabled={saving} onClick={() => update(draft.filter((_, i) => i !== index))}>삭제</button>
        </div>
      </li>)}</ol>
      <select aria-label="폴백 후보 추가" className="w-full min-h-11" value="" disabled={saving || !ready} onChange={(event) => {
        const model = models.find((item) => keyOf(item) === event.target.value);
        if (model) update([...draft, { provider: model.provider, model_id: model.model_id, display_order: draft.length, is_enabled: true }]);
      }}><option value="">폴백 후보 추가</option>{models.filter((item) => keyOf(item) !== source && !draft.some((row) => keyOf(row) === keyOf(item))).map((item) => <option key={keyOf(item)} value={keyOf(item)}>{item.display_name || item.model_id} · {item.provider}</option>)}</select>
      <div className="flex flex-wrap gap-2"><button className="min-h-11 px-3 border rounded" disabled={saving} onClick={() => update([])}>전역 순서 사용</button><button className="min-h-11 px-3 border rounded" disabled={saving || !ready} onClick={save}>{saving ? "저장 중…" : "모델별 폴백 저장"}</button></div>
    </>}
    {message && <p role="status" className="text-xs break-all whitespace-pre-wrap">{message}</p>}
  </section>;
}
