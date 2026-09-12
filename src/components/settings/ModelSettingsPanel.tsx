"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────── */

interface RoutingPref {
  route_key: string;
  provider: string;
  model_id: string;
  display_name?: string | null;
  display_order: number;
  is_enabled: boolean;
  is_default: boolean;
  notes: string;
  availability?: string;
}

interface IntentPolicy {
  id: number;
  intent: string;
  default_model: string;
  allowed_models: string[];
  cascade_downgrade: boolean;
  tool_allowlist: string[] | null;
  description: string | null;
  temperature?: number | null;
  updated_by: string | null;
  updated_at: string | null;
}

/* ─── Constants ─────────────────────────────────────── */

const ROUTE_LABELS: Record<string, string> = {
  llm: "채팅 LLM",
  background_llm: "배경 LLM",
  runner_llm: "러너 LLM",
  code_exec: "코드 실행",
  search: "검색",
  deep_research: "심층 연구",
  url_analyze: "URL 분석",
  fact_check: "팩트체크",
  image_analyze: "이미지 분석",
  video_analyze: "영상 분석",
  visual_qa: "시각 QA",
  embedding: "임베딩",
  semantic_search: "시맨틱 검색",
  image: "이미지 생성",
  edit_image: "이미지 편집",
  video: "영상 생성",
  music: "음악 생성",
  audio: "음성 생성",
};

const ROUTE_GROUP_ORDER: [string, string[]][] = [
  ["LLM", ["llm", "background_llm", "runner_llm", "code_exec"]],
  ["검색 · 분석", ["search", "deep_research", "url_analyze", "fact_check"]],
  ["비전 · 임베딩", ["image_analyze", "video_analyze", "visual_qa", "embedding", "semantic_search"]],
  ["미디어 생성", ["image", "edit_image", "video", "music", "audio"]],
];

const INTENT_LABELS: Record<string, string> = {
  greeting: "인사",
  casual: "일상대화",
  status_check: "상태 확인",
  task_query: "작업 조회",
  code_modify: "코드 수정",
  report: "보고/분석",
  dashboard: "대시보드",
  search: "검색",
  url_read: "URL 읽기",
  browser: "브라우저",
  service_inspection: "서비스 점검",
  code_explorer: "코드 탐색",
  analyze_changes: "변경 분석",
};

/* ─── RoutingTab ────────────────────────────────────── */

function RoutingTab() {
  const [prefs, setPrefs] = useState<RoutingPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await (api as any).getModelRoutingPreferences();
      setPrefs(res.preferences || []);
    } catch {
      setMsg("라우팅 설정 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const grouped = useMemo(() => {
    const map = new Map<string, RoutingPref[]>();
    for (const p of prefs) {
      if (!map.has(p.route_key)) map.set(p.route_key, []);
      map.get(p.route_key)!.push(p);
    }
    return map;
  }, [prefs]);

  const handleToggleEnabled = async (pref: RoutingPref) => {
    setSaving(true);
    try {
      await (api as any).updateModelRoutingPreferences([{
        route_key: pref.route_key,
        provider: pref.provider,
        model_id: pref.model_id,
        display_order: pref.display_order,
        is_enabled: !pref.is_enabled,
        is_default: pref.is_default,
        notes: pref.notes || "",
      }]);
      flash(pref.is_enabled ? "비활성화됨" : "활성화됨");
      load();
    } catch {
      flash("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (routeKey: string, pref: RoutingPref) => {
    if (pref.is_default) return;
    setSaving(true);
    try {
      const routePrefs = grouped.get(routeKey) || [];
      const updates = routePrefs
        .filter(p => p.is_default || (p.provider === pref.provider && p.model_id === pref.model_id))
        .map(p => ({
          route_key: p.route_key,
          provider: p.provider,
          model_id: p.model_id,
          display_order: p.display_order,
          is_enabled: p.is_enabled || (p.provider === pref.provider && p.model_id === pref.model_id),
          is_default: p.provider === pref.provider && p.model_id === pref.model_id,
          notes: p.notes || "",
        }));
      await (api as any).updateModelRoutingPreferences(updates);
      flash(`기본 모델 변경: ${pref.display_name || pref.model_id}`);
      load();
    } catch {
      flash("기본 모델 변경 실패");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>;

  return (
    <div className="space-y-3">
      {msg && (
        <div className="text-sm px-3 py-2 rounded" style={{
          background: msg.includes("실패") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
          color: msg.includes("실패") ? "var(--danger)" : "var(--success)",
        }}>{msg}</div>
      )}

      {ROUTE_GROUP_ORDER.map(([groupName, routeKeys]) => {
        const activeRoutes = routeKeys.filter(rk => grouped.has(rk));
        if (activeRoutes.length === 0) return null;
        return (
          <div key={groupName} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2" style={{ background: "var(--bg-hover)" }}>
              <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{groupName}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["라우트", "기본 모델", "활성", ""].map(h => (
                    <th key={h} style={{ padding: "6px 12px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRoutes.map(rk => {
                  const items = grouped.get(rk) || [];
                  const defaultItem = items.find(i => i.is_default);
                  const enabledCount = items.filter(i => i.is_enabled).length;
                  const isOpen = expandedRoute === rk;
                  return (
                    <React.Fragment key={rk}>
                      <tr
                        style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: isOpen ? "rgba(59,130,246,0.03)" : "transparent" }}
                        onClick={() => setExpandedRoute(isOpen ? null : rk)}
                      >
                        <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                          {ROUTE_LABELS[rk] || rk}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {defaultItem ? (
                            <span className="font-mono text-xs px-2 py-0.5 rounded" style={{
                              background: "rgba(59,130,246,0.15)", color: "#60a5fa",
                            }}>⭐ {defaultItem.display_name || defaultItem.model_id}</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>미설정</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--text-secondary)", fontSize: 11 }}>
                          {enabledCount}/{items.length}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)", fontSize: 11 }}>
                          {isOpen ? "▲" : "▼"}
                        </td>
                      </tr>
                      {isOpen && items.map((item, idx) => (
                        <tr key={`${item.provider}-${item.model_id}`}
                            style={{
                              borderBottom: idx < items.length - 1 ? "1px solid var(--border)" : "1px solid var(--border)",
                              background: "rgba(0,0,0,0.03)",
                              opacity: item.is_enabled ? 1 : 0.5,
                            }}>
                          <td style={{ padding: "6px 12px 6px 28px" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSetDefault(rk, item); }}
                              disabled={saving || item.is_default}
                              style={{ background: "none", border: "none", cursor: item.is_default ? "default" : "pointer", fontSize: 14, padding: 0, marginRight: 6 }}
                              title={item.is_default ? "현재 기본 모델" : "기본 모델로 설정"}
                            >{item.is_default ? "⭐" : "☆"}</button>
                            <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{
                              background: "var(--bg-hover)", color: "var(--text-secondary)", fontSize: 10,
                            }}>{item.provider}</span>
                          </td>
                          <td colSpan={2} style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 11, color: "var(--text-primary)" }}>
                            {item.display_name || item.model_id}
                            <span style={{ marginLeft: 8, fontSize: 10, color: "var(--text-secondary)" }}>#{item.display_order}</span>
                          </td>
                          <td style={{ padding: "6px 12px", textAlign: "center" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleEnabled(item); }}
                              disabled={saving}
                              className="text-xs px-2 py-0.5 rounded font-semibold"
                              style={{
                                border: "none", cursor: "pointer",
                                background: item.is_enabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.1)",
                                color: item.is_enabled ? "var(--success)" : "var(--danger)",
                              }}
                            >{item.is_enabled ? "ON" : "OFF"}</button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ─── IntentPolicyTab ───────────────────────────────── */

function IntentPolicyTab() {
  const [policies, setPolicies] = useState<IntentPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editIntent, setEditIntent] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<IntentPolicy>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await (api as any).getGovernanceIntentPolicies();
      setPolicies(res.policies || []);
    } catch {
      setMsg("인텐트 정책 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const startEdit = (p: IntentPolicy) => {
    setEditIntent(p.intent);
    setEditData({
      intent: p.intent,
      default_model: p.default_model,
      allowed_models: [...p.allowed_models],
      cascade_downgrade: p.cascade_downgrade,
      temperature: p.temperature,
      description: p.description,
    });
  };

  const cancelEdit = () => { setEditIntent(null); setEditData({}); };

  const saveEdit = async () => {
    if (!editData.intent || !editData.default_model || !editData.allowed_models?.length) {
      flash("필수 값이 비어있습니다"); return;
    }
    setSaving(true);
    try {
      await (api as any).upsertGovernanceIntentPolicy({
        intent: editData.intent,
        default_model: editData.default_model,
        allowed_models: editData.allowed_models,
        cascade_downgrade: editData.cascade_downgrade ?? false,
        description: editData.description || null,
        temperature: editData.temperature ?? null,
        updated_by: "ops_settings_ui",
      });
      flash("저장 완료");
      cancelEdit();
      load();
    } catch {
      flash("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>;

  return (
    <div className="space-y-3">
      {msg && (
        <div className="text-sm px-3 py-2 rounded" style={{
          background: msg.includes("실패") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
          color: msg.includes("실패") ? "var(--danger)" : "var(--success)",
        }}>{msg}</div>
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-hover)", borderBottom: "1px solid var(--border)" }}>
              {["인텐트", "기본 모델", "허용 모델", "Cascade", "Temp", ""].map(h => (
                <th key={h} style={{
                  padding: "8px 12px",
                  textAlign: (h === "Cascade" || h === "Temp" || h === "") ? "center" : "left",
                  color: "var(--text-secondary)", fontWeight: 600, fontSize: 11,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {policies.map(p => {
              const isEditing = editIntent === p.intent;
              if (isEditing) {
                return (
                  <tr key={p.intent} style={{ borderBottom: "1px solid var(--border)", background: "rgba(59,130,246,0.04)" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {INTENT_LABELS[p.intent] || p.intent}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <input value={editData.default_model || ""}
                        onChange={e => setEditData(d => ({ ...d, default_model: e.target.value }))}
                        className="w-full rounded px-2 py-1 font-mono"
                        style={{ fontSize: 11, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <input value={(editData.allowed_models || []).join(", ")}
                        onChange={e => setEditData(d => ({ ...d, allowed_models: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                        className="w-full rounded px-2 py-1 font-mono"
                        style={{ fontSize: 10, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <button onClick={() => setEditData(d => ({ ...d, cascade_downgrade: !d.cascade_downgrade }))}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
                        {editData.cascade_downgrade ? "✅" : "⬜"}
                      </button>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <input type="number" step="0.01" min="0" max="2"
                        value={editData.temperature ?? ""}
                        onChange={e => setEditData(d => ({ ...d, temperature: e.target.value ? parseFloat(e.target.value) : null }))}
                        style={{ width: 56, padding: "4px", borderRadius: 4, border: "1px solid var(--border)",
                          background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 11, textAlign: "center" }} />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={saveEdit} disabled={saving} className="text-xs px-2 py-1 rounded font-bold"
                          style={{ border: "none", cursor: "pointer", background: "var(--accent)", color: "#fff" }}>저장</button>
                        <button onClick={cancelEdit} className="text-xs px-2 py-1 rounded"
                          style={{ border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>취소</button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={p.intent} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {INTENT_LABELS[p.intent] || p.intent}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{
                      background: "rgba(59,130,246,0.15)", color: "#60a5fa",
                    }}>{p.default_model}</span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {p.allowed_models.map(m => (
                        <span key={m} className="font-mono rounded" style={{
                          fontSize: 10, padding: "1px 5px",
                          background: "var(--bg-hover)", color: "var(--text-secondary)",
                        }}>{m}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    {p.cascade_downgrade ? "✅" : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "monospace" }}>
                    {p.temperature != null ? p.temperature : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 rounded"
                      style={{ border: "1px solid var(--border)", cursor: "pointer",
                        background: "var(--bg-hover)", color: "var(--text-primary)" }}>수정</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Export ────────────────────────────────────── */

export default function ModelSettingsPanel() {
  const [tab, setTab] = useState<"routing" | "intent">("routing");

  const tabBtn = (key: "routing" | "intent", label: string) => (
    <button onClick={() => setTab(key)} className="text-xs px-3 py-1.5 font-semibold"
      style={{
        border: "1px solid var(--border)",
        borderBottom: tab === key ? "1px solid var(--bg-card)" : "1px solid var(--border)",
        borderRadius: "6px 6px 0 0",
        background: tab === key ? "var(--bg-card)" : "var(--bg-hover)",
        color: tab === key ? "var(--accent)" : "var(--text-secondary)",
        marginBottom: -1,
        cursor: "pointer",
      }}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 4 }}>
        {tabBtn("routing", "라우팅 기본 모델")}
        {tabBtn("intent", "인텐트별 정책")}
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: "0 8px 8px 8px", padding: 12 }}>
        {tab === "routing" ? <RoutingTab /> : <IntentPolicyTab />}
      </div>
    </div>
  );
}
