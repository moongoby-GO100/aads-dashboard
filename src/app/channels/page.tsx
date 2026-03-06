"use client";
import { useEffect, useState, useCallback, useRef } from "react";
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
  recentCompleted: string | null;
  runningCount: number;
}

const EMPTY_FORM = { id: "", name: "", description: "", url: "", status: "active", project: "", server: "" };

const PROJECT_ICONS: Record<string, string> = {
  AADS: "🤖",
  GO100: "📈",
  KIS: "🔌",
  NAS: "🖼️",
  NewTalk: "💬",
  ShortFlow: "🎬",
};

function getProjectIcon(project?: string): string {
  if (!project) return "📌";
  return PROJECT_ICONS[project] || "📌";
}

const PROJECT_COLORS: Record<string, string> = {
  AADS: "rgba(59,130,246,0.2)",
  GO100: "rgba(34,197,94,0.2)",
  KIS: "rgba(168,85,247,0.2)",
  NAS: "rgba(249,115,22,0.2)",
  NewTalk: "rgba(20,184,166,0.2)",
  ShortFlow: "rgba(239,68,68,0.2)",
};

const PROJECT_TEXT_COLORS: Record<string, string> = {
  AADS: "#60a5fa",
  GO100: "#4ade80",
  KIS: "#c084fc",
  NAS: "#fb923c",
  NewTalk: "#2dd4bf",
  ShortFlow: "#f87171",
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Channel | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [taskSummaries, setTaskSummaries] = useState<Record<string, TaskSummary>>({});
  const [contextModal, setContextModal] = useState<{ channelId: string; content: string } | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const fetchTaskSummaries = useCallback(async (channelList: Channel[]) => {
    try {
      const res = await api.getTaskHistory();
      const tasks = res.tasks || res.items || [];
      const summaries: Record<string, TaskSummary> = {};
      channelList.forEach((ch) => {
        if (!ch.project) return;
        const proj = ch.project.toLowerCase();
        const projectTasks = tasks.filter((t: { memory_type?: string; from_agent?: string; task_id?: string }) => {
          const mt = (t.memory_type || "").toLowerCase();
          const fa = (t.from_agent || "").toLowerCase();
          return mt.includes(proj) || fa.includes(proj);
        });
        const running = projectTasks.filter((t: { status?: string }) => t.status === "running").length;
        const completed = projectTasks.filter((t: { status?: string }) => t.status === "completed" || t.status === "reported");
        const recent = completed.length > 0 ? `${completed[0].task_id}` : null;
        summaries[ch.id] = { recentCompleted: recent, runningCount: running };
      });
      setTaskSummaries(summaries);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (channels.length > 0) {
      fetchTaskSummaries(channels);
      pollRef.current = setInterval(() => fetchTaskSummaries(channels), 30000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [channels, fetchTaskSummaries]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick() { setOpenMenuId(null); }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
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
    setContextLoading(true);
    setContextModal({ channelId: ch.id, content: "" });
    try {
      const res = await api.getContextPackage(ch.id);
      const content = res.context_package || JSON.stringify(res, null, 2);
      setContextModal({ channelId: ch.id, content });
    } catch (e: unknown) {
      setContextModal({ channelId: ch.id, content: e instanceof Error ? e.message : "컨텍스트 로드 실패" });
    } finally {
      setContextLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="대화창 관리" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        {/* 헤더 */}
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
          className="w-full rounded-xl p-4 mb-5 flex items-center justify-between cursor-pointer"
          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)" }}
          onClick={() => window.open("https://www.genspark.ai/", "_blank")}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌐</span>
            <div>
              <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Genspark AI Chat</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>일반 AI 채팅 — 새 탭에서 Genspark 열기</p>
            </div>
          </div>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium flex-shrink-0"
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
              const icon = getProjectIcon(ch.project);
              const isActive = ch.status === "active";
              const summary = taskSummaries[ch.id];
              const projBg = ch.project ? PROJECT_COLORS[ch.project] : "rgba(100,100,100,0.2)";
              const projText = ch.project ? PROJECT_TEXT_COLORS[ch.project] : "var(--text-secondary)";

              return (
                <div
                  key={ch.id}
                  className="rounded-xl flex flex-col relative"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  {/* 카드 상단 행: ⋮ 메뉴 + 상태 */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    {/* ⋮ 메뉴 */}
                    <div className="relative">
                      <button
                        className="text-lg leading-none px-1 rounded hover:opacity-70"
                        style={{ color: "var(--text-secondary)" }}
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === ch.id ? null : ch.id); }}
                        title="메뉴"
                      >
                        ⋮
                      </button>
                      {openMenuId === ch.id && (
                        <div
                          className="absolute top-7 left-0 z-20 rounded-lg py-1 shadow-lg min-w-[100px]"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="w-full text-left px-3 py-1.5 text-xs hover:opacity-70"
                            style={{ color: "var(--text-primary)" }}
                            onClick={() => { openEdit(ch); setOpenMenuId(null); }}
                          >
                            ✏️ 수정
                          </button>
                          <button
                            className="w-full text-left px-3 py-1.5 text-xs hover:opacity-70"
                            style={{ color: "#ef4444" }}
                            onClick={() => { handleDelete(ch); setOpenMenuId(null); }}
                          >
                            🗑️ 삭제
                          </button>
                        </div>
                      )}
                    </div>
                    {/* 상태 */}
                    <span className="text-sm font-bold">
                      {isActive ? "🟢 ON" : "🔴 OFF"}
                    </span>
                  </div>

                  {/* 카드 본문 */}
                  <div className="px-4 py-2 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-3xl">{icon}</span>
                      <div>
                        <p className="font-bold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{ch.id}</p>
                      </div>
                    </div>
                    <p className="text-xs mt-2 mb-3" style={{ color: "var(--text-secondary)" }}>
                      {ch.description || "설명 없음"}
                    </p>

                    {/* 뱃지 */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {ch.project && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: projBg, color: projText }}>
                          {ch.project}
                        </span>
                      )}
                      {ch.server && (
                        <span className="px-2 py-0.5 rounded-full text-xs"
                          style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                          🖥 서버 {ch.server}
                        </span>
                      )}
                    </div>

                    {/* 태스크 요약 */}
                    {ch.project && (
                      <div className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                        {summary ? (
                          <>
                            <p>최근: {summary.recentCompleted ? `#${summary.recentCompleted} ✅` : "없음"}</p>
                            <p>진행중: {summary.runningCount}건 🔄</p>
                          </>
                        ) : (
                          <p>태스크 없음</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 카드 하단 버튼 */}
                  <div
                    className="flex gap-2 px-4 py-3"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <button
                      className="flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors"
                      style={{ background: "var(--accent)", color: "#fff" }}
                      onClick={() => ch.url && window.open(ch.url, "_blank")}
                      disabled={!ch.url}
                    >
                      🔗 에이전트 열기
                    </button>
                    <button
                      className="flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                      onClick={() => openContext(ch)}
                    >
                      📋 컨텍스트
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
          <div className="w-full max-w-md rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
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
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>에이전트 URL *</label>
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
                  <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                    프로젝트
                    {form.project && <span className="ml-1">{getProjectIcon(form.project)}</span>}
                  </label>
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

      {/* 컨텍스트 패키지 모달 */}
      {contextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-2xl rounded-xl flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", maxHeight: "80vh" }}>
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                📋 컨텍스트 패키지 — {contextModal.channelId}
              </h3>
              <button
                onClick={() => setContextModal(null)}
                className="text-lg leading-none hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {contextLoading ? (
                <div className="text-center py-8" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
              ) : (
                <pre className="text-xs whitespace-pre-wrap" style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>
                  {contextModal.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
