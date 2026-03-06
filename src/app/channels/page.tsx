"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

interface Channel {
  id: string;
  name: string;
  description: string;
  url: string;
  status: string;
  project?: string;
  server?: string;
  created_at?: string;
  updated_at?: string;
}

interface TaskSummary {
  recent: string | null;
  running: number;
}

const PROJECT_ICONS: Record<string, string> = {
  AADS: "🤖",
  GO100: "📈",
  KIS: "🔌",
  NAS: "🖼️",
  NewTalk: "💬",
  ShortFlow: "🎬",
};

const PROJECT_COLORS: Record<string, string> = {
  AADS: "rgba(59,130,246,0.25)",
  GO100: "rgba(34,197,94,0.25)",
  KIS: "rgba(168,85,247,0.25)",
  NAS: "rgba(249,115,22,0.25)",
  NewTalk: "rgba(236,72,153,0.25)",
  ShortFlow: "rgba(234,179,8,0.25)",
};

const EMPTY_FORM = { id: "", name: "", description: "", url: "", status: "active", project: "", server: "" };

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Channel | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [taskSummary, setTaskSummary] = useState<TaskSummary | null>(null);
  const [contextModal, setContextModal] = useState<{ id: string; data: string } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getChannels();
      setChannels(res.channels || []);
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTaskSummary = useCallback(async () => {
    try {
      const res = await api.getTaskHistory();
      const tasks = res.tasks || [];
      const running = tasks.filter((t: { status: string }) => t.status === "running").length;
      const done = tasks.filter((t: { status: string }) => t.status !== "running");
      setTaskSummary({ recent: done.length > 0 ? done[0].task_id : null, running });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);
  useEffect(() => { fetchTaskSummary(); }, [fetchTaskSummary]);

  useEffect(() => {
    const interval = setInterval(() => { fetchTaskSummary(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchTaskSummary]);

  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  function openAdd() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setShowModal(true);
  }

  function openEdit(ch: Channel) {
    setEditTarget(ch);
    setForm({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      url: ch.url,
      status: ch.status,
      project: ch.project || "",
      server: ch.server || "",
    });
    setError("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.url.trim()) {
      setError("대화창명과 URL은 필수입니다.");
      return;
    }
    if (!editTarget && !form.id.trim()) {
      setError("ID는 필수입니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editTarget) {
        await api.updateChannel(editTarget.id, {
          name: form.name,
          description: form.description,
          url: form.url,
          status: form.status,
          project: form.project || undefined,
          server: form.server || undefined,
        });
      } else {
        await api.createChannel({
          id: form.id,
          name: form.name,
          description: form.description,
          url: form.url,
          status: form.status,
          project: form.project || undefined,
          server: form.server || undefined,
        });
      }
      setShowModal(false);
      await fetchChannels();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ch: Channel) {
    if (!confirm(`'${ch.name}' 대화창을 삭제하시겠습니까?`)) return;
    try {
      await api.deleteChannel(ch.id);
      await fetchChannels();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "삭제 중 오류 발생");
    }
  }

  async function openContext(ch: Channel) {
    try {
      const data = await api.getContextPackage(ch.id);
      setContextModal({ id: ch.id, data: JSON.stringify(data, null, 2) });
    } catch (e: unknown) {
      setContextModal({ id: ch.id, data: e instanceof Error ? e.message : "오류 발생" });
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="대화창 관리" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            📌 Genspark 매니저 허브 ({channels.length})
          </p>
          <button
            onClick={openAdd}
            className="px-3 py-1.5 text-sm rounded-lg font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + 추가
          </button>
        </div>

        {/* Genspark AI 일반 채팅 카드 */}
        <div
          className="mb-6 rounded-xl p-4 flex items-center justify-between gap-3 cursor-pointer"
          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)" }}
          onClick={() => window.open("https://www.genspark.ai/", "_blank")}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl flex-shrink-0">🌐</span>
            <div className="min-w-0">
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>Genspark AI Chat</p>
              <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>일반 AI 채팅 — 새 탭에서 Genspark 열기</p>
            </div>
          </div>
          <button
            className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={(e) => { e.stopPropagation(); window.open("https://www.genspark.ai/", "_blank"); }}
          >
            Genspark 열기 →
          </button>
        </div>

        {/* 카드 그리드 */}
        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : channels.length === 0 ? (
          <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
            대화창이 없습니다. [+ 추가] 버튼으로 등록하세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((ch) => {
              const icon = ch.project ? (PROJECT_ICONS[ch.project] || "🤖") : "🔗";
              const projColor = ch.project ? (PROJECT_COLORS[ch.project] || "rgba(99,102,241,0.25)") : "var(--bg-hover)";
              const isActive = ch.status === "active";

              return (
                <div
                  key={ch.id}
                  className="rounded-xl p-4 flex flex-col gap-2"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  {/* 상단: ⋮ 메뉴 + 상태 */}
                  <div className="flex items-center justify-between">
                    <div className="relative">
                      <button
                        className="text-xl leading-none hover:opacity-70 transition-opacity px-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === ch.id ? null : ch.id);
                        }}
                        title="메뉴"
                      >
                        ⋮
                      </button>
                      {openMenuId === ch.id && (
                        <div
                          className="absolute left-0 top-7 z-20 rounded-lg shadow-lg py-1 min-w-[100px]"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="w-full text-left px-3 py-1.5 text-sm hover:opacity-70"
                            style={{ color: "var(--text-primary)" }}
                            onClick={() => { openEdit(ch); setOpenMenuId(null); }}
                          >
                            ✏️ 수정
                          </button>
                          <button
                            className="w-full text-left px-3 py-1.5 text-sm hover:opacity-70"
                            style={{ color: "#ef4444" }}
                            onClick={() => { handleDelete(ch); setOpenMenuId(null); }}
                          >
                            🗑️ 삭제
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: isActive ? "#22c55e" : "var(--text-secondary)" }}>
                      {isActive ? "🟢 ON" : "🔴 OFF"}
                    </span>
                  </div>

                  {/* 아이콘 + 이름 */}
                  <div className="flex items-start gap-3 mt-1">
                    <span className="text-3xl leading-none flex-shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-base leading-tight" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{ch.id}</p>
                    </div>
                  </div>

                  {/* 설명 */}
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{ch.description || "-"}</p>

                  {/* 프로젝트 & 서버 뱃지 */}
                  <div className="flex flex-wrap gap-1">
                    {ch.project && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: projColor, color: "var(--text-primary)" }}>
                        {ch.project}
                      </span>
                    )}
                    {ch.server && (
                      <span className="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                        서버 {ch.server}
                      </span>
                    )}
                  </div>

                  {/* 태스크 요약 */}
                  <div className="text-xs space-y-0.5 py-1" style={{ color: "var(--text-secondary)" }}>
                    {taskSummary ? (
                      <>
                        <p>최근: {taskSummary.recent ? `#${taskSummary.recent} ✅` : "태스크 없음"}</p>
                        <p>진행중: {taskSummary.running}건 🔄</p>
                      </>
                    ) : (
                      <p>태스크 없음</p>
                    )}
                  </div>

                  {/* 구분선 + 액션 버튼 */}
                  <div className="border-t mt-auto pt-2 flex gap-2" style={{ borderColor: "var(--border)" }}>
                    {ch.url && (
                      <button
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{ background: "var(--accent)", color: "#fff" }}
                        onClick={() => window.open(ch.url, "_blank")}
                      >
                        🔗 에이전트 열기
                      </button>
                    )}
                    <button
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                      onClick={() => openContext(ch)}
                    >
                      📋 컨텍스트
                    </button>
                    <button
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                      style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                      onClick={() => openEdit(ch)}
                    >
                      ✏️ 수정
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md rounded-xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h3 className="text-base font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              {editTarget ? "대화창 수정" : "대화창 추가"}
            </h3>

            <div className="space-y-3">
              {!editTarget && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>ID *</label>
                  <input
                    type="text"
                    value={form.id}
                    onChange={(e) => setForm({ ...form, id: e.target.value })}
                    placeholder="예: GO100_MGR"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>대화창명 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="예: GO100 총괄매니저"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>설명</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="예: AI 투자 에이전트, 자동매매"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Genspark 에이전트 URL *</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://www.genspark.ai/agents?id=..."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>프로젝트</label>
                  <select
                    value={form.project}
                    onChange={(e) => setForm({ ...form, project: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <option value="">선택 안함</option>
                    <option value="AADS">AADS 🤖</option>
                    <option value="GO100">GO100 📈</option>
                    <option value="KIS">KIS 🔌</option>
                    <option value="ShortFlow">ShortFlow 🎬</option>
                    <option value="NAS">NAS 🖼️</option>
                    <option value="NewTalk">NewTalk 💬</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>서버</label>
                  <select
                    value={form.server}
                    onChange={(e) => setForm({ ...form, server: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <option value="">선택 안함</option>
                    <option value="68">68 (AADS)</option>
                    <option value="211">211 (KIS/GO100)</option>
                    <option value="114">114 (SF/NAS/NTV2)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>상태</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  <option value="active">active (ON)</option>
                  <option value="inactive">inactive (OFF)</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-xs" style={{ color: "var(--error, #ef4444)" }}>{error}</p>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컨텍스트 모달 */}
      {contextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-2xl rounded-xl p-6 max-h-[80vh] flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                📋 컨텍스트 패키지 — {contextModal.id}
              </h3>
              <button
                onClick={() => setContextModal(null)}
                className="text-xl leading-none hover:opacity-70 transition-opacity"
                style={{ color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </div>
            <pre className="flex-1 overflow-auto text-xs rounded-lg p-3" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
              {contextModal.data}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
