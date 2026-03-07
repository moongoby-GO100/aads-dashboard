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

// AADS-148: 프로젝트별 중요 문서 링크 (DB 미로드 시 기본값)
const DEFAULT_PROJECT_DOCS: Record<string, { label: string; url: string }[]> = {
  AADS: [
    { label: "HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/HANDOVER.md" },
    { label: "RULES", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/HANDOVER-RULES.md" },
    { label: "CEO-DIRECTIVES", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/CEO-DIRECTIVES.md" },
    { label: "STATUS", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/STATUS.md" },
    { label: "RULE-MATRIX", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/shared/rules/RULE-MATRIX.md" },
    { label: "WORKFLOW", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/shared/rules/WORKFLOW-PIPELINE.md" },
  ],
  GO100: [
    { label: "HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/GO100-HANDOVER.md" },
    { label: "AADS HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/HANDOVER.md" },
    { label: "CEO-DIRECTIVES", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/CEO-DIRECTIVES.md" },
  ],
  KIS: [
    { label: "HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/KIS-HANDOVER.md" },
    { label: "AADS HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/HANDOVER.md" },
    { label: "CEO-DIRECTIVES", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/CEO-DIRECTIVES.md" },
  ],
  ShortFlow: [
    { label: "HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/SF-HANDOVER.md" },
    { label: "AADS HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/HANDOVER.md" },
    { label: "CEO-DIRECTIVES", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/CEO-DIRECTIVES.md" },
  ],
  NewTalk: [
    { label: "HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/NTV2-HANDOVER.md" },
    { label: "CEO-DIRECTIVES", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/NTV2-CEO-DIRECTIVES.md" },
    { label: "AADS HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/HANDOVER.md" },
  ],
  NAS: [
    { label: "HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/NAS-HANDOVER.md" },
    { label: "CEO-DIRECTIVES", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/NAS-CEO-DIRECTIVES.md" },
    { label: "AADS HANDOVER", url: "https://github.com/moongoby-GO100/aads-docs/blob/main/HANDOVER.md" },
  ],
};

// AADS-143: 6프로젝트 트리거 메시지 (DB 미로드 시 기본값)
const DEFAULT_TRIGGER_MESSAGES: Record<string, string> = {
  AADS: "[AADS] 안녕하세요. AADS Phase 2 운영 상태를 확인하고 다음 태스크를 진행해주세요. 최근: AADS-160 (CEO 검수 완료). HANDOVER.md + HANDOVER-RULES.md + CEO-DIRECTIVES.md를 참조하세요.",
  GO100: "[GO100] 안녕하세요. GO100 AI 자동매매 현황을 확인하고 다음 태스크를 진행해주세요. 최근 태스크: GO100-023. GO100-HANDOVER.md를 참조하세요.",
  KIS: "[KIS] 안녕하세요. KIS V4.1 API 연동 상태를 확인하고 다음 태스크를 진행해주세요. 최근 태스크: KIS-041. KIS-HANDOVER.md를 참조하세요.",
  ShortFlow: "[SF] 안녕하세요. ShortFlow 영상 생성 현황을 확인하고 다음 태스크를 진행해주세요. 최근 태스크: SF-015. SF-HANDOVER.md를 참조하세요.",
  NewTalk: "[NTV2] 안녕하세요. NewTalk V2 Phase 1 환경 구축 진행 상황을 확인해주세요. 최근 태스크: NT-001 (대기). NTV2-HANDOVER.md + NTV2-CEO-DIRECTIVES.md를 참조하세요.",
  NAS: "[NAS] 안녕하세요. NAS 유지보수 현황을 확인하고 다음 태스크를 진행해주세요. 최근 태스크: NAS-010. NAS-HANDOVER.md + NAS-CEO-DIRECTIVES.md를 참조하세요.",
};

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
  const [triggerSending, setTriggerSending] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragIndexRef = useRef<number>(-1);

  // AADS-148: 문서 링크 편집 state
  const [projectDocs, setProjectDocs] = useState<Record<string, { label: string; url: string }[]>>({ ...DEFAULT_PROJECT_DOCS });
  const [docsEditProject, setDocsEditProject] = useState<string | null>(null);
  const [docsEditList, setDocsEditList] = useState<{ label: string; url: string }[]>([]);
  const [docsSaving, setDocsSaving] = useState(false);
  const [docsSyncResult, setDocsSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // 트리거 메시지 편집 state
  const [triggerMessages, setTriggerMessages] = useState<Record<string, string>>({ ...DEFAULT_TRIGGER_MESSAGES });
  const [triggerEditProject, setTriggerEditProject] = useState<string | null>(null);
  const [triggerEditText, setTriggerEditText] = useState("");
  const [triggerSavingEdit, setTriggerSavingEdit] = useState(false);
  const [triggerEditResult, setTriggerEditResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // DB에서 트리거 메시지 로드
  const fetchTriggerMessages = useCallback(async () => {
    try {
      const res = await api.getTriggerMessages();
      if (res.ok && res.trigger_messages && Object.keys(res.trigger_messages).length > 0) {
        setTriggerMessages({ ...DEFAULT_TRIGGER_MESSAGES, ...res.trigger_messages });
        return;
      }
    } catch { /* fallthrough */ }
    try {
      const raw = await fetch(
        "https://raw.githubusercontent.com/moongoby-GO100/aads-docs/main/shared/trigger-messages.json",
        { cache: "no-store" }
      );
      if (raw.ok) {
        const data = await raw.json();
        if (data.trigger_messages && Object.keys(data.trigger_messages).length > 0) {
          setTriggerMessages({ ...DEFAULT_TRIGGER_MESSAGES, ...data.trigger_messages });
          return;
        }
      }
    } catch { /* fallthrough */ }
  }, []);

  function openTriggerEdit(project: string) {
    setTriggerEditProject(project);
    setTriggerEditText(triggerMessages[project] || "");
    setTriggerEditResult(null);
  }

  async function saveTriggerMessage() {
    if (!triggerEditProject) return;
    setTriggerSavingEdit(true);
    setTriggerEditResult(null);
    try {
      const newMessages = { ...triggerMessages, [triggerEditProject]: triggerEditText };
      const res = await api.syncTriggerMessages(newMessages);
      setTriggerMessages(newMessages);
      setTriggerEditResult({
        ok: true,
        msg: res.git_pushed
          ? `저장 + push 완료 (${res.commit_sha})`
          : "저장 완료 (변경사항 없어 push 생략)"
      });
      setTimeout(() => { setTriggerEditProject(null); setTriggerEditResult(null); }, 2000);
    } catch (e: unknown) {
      setTriggerEditResult({ ok: false, msg: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setTriggerSavingEdit(false);
    }
  }

  // DB에서 문서 링크 로드 → GitHub raw JSON 폴백 (작업자 수정 실시간 반영)
  const fetchProjectDocs = useCallback(async () => {
    try {
      // 1차: DB (대시보드에서 CEO가 직접 수정한 데이터)
      const res = await api.getProjectDocs();
      if (res.ok && res.project_docs && Object.keys(res.project_docs).length > 0) {
        setProjectDocs({ ...DEFAULT_PROJECT_DOCS, ...res.project_docs });
        return;
      }
    } catch { /* fallthrough */ }
    try {
      // 2차: GitHub raw JSON (작업자가 push한 데이터)
      const raw = await fetch(
        "https://raw.githubusercontent.com/moongoby-GO100/aads-docs/main/shared/project-docs.json",
        { cache: "no-store" }
      );
      if (raw.ok) {
        const data = await raw.json();
        if (data.project_docs && Object.keys(data.project_docs).length > 0) {
          setProjectDocs({ ...DEFAULT_PROJECT_DOCS, ...data.project_docs });
          return;
        }
      }
    } catch { /* fallthrough */ }
    // 3차: 하드코딩 기본값 유지
  }, []);

  function openDocsEdit(project: string) {
    const docs = projectDocs[project] || [];
    setDocsEditProject(project);
    setDocsEditList(docs.map(d => ({ ...d })));
    setDocsSyncResult(null);
  }

  function addDocRow() {
    setDocsEditList([...docsEditList, { label: "", url: "" }]);
  }

  function removeDocRow(idx: number) {
    setDocsEditList(docsEditList.filter((_, i) => i !== idx));
  }

  function updateDocRow(idx: number, field: "label" | "url", value: string) {
    const updated = [...docsEditList];
    updated[idx] = { ...updated[idx], [field]: value };
    setDocsEditList(updated);
  }

  async function saveProjectDocs() {
    if (!docsEditProject) return;
    const validDocs = docsEditList.filter(d => d.label.trim() && d.url.trim());
    setDocsSaving(true);
    setDocsSyncResult(null);
    try {
      const newDocs = { ...projectDocs, [docsEditProject]: validDocs };
      const res = await api.syncProjectDocs(newDocs);
      setProjectDocs(newDocs);
      setDocsSyncResult({
        ok: true,
        msg: res.git_pushed
          ? `저장 + push 완료 (${res.commit_sha})`
          : "저장 완료 (변경사항 없어 push 생략)"
      });
      setTimeout(() => { setDocsEditProject(null); setDocsSyncResult(null); }, 2000);
    } catch (e: unknown) {
      setDocsSyncResult({ ok: false, msg: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setDocsSaving(false);
    }
  }

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getChannels();
      let chs: Channel[] = res.channels || [];
      try {
        const saved = localStorage.getItem("channels-order");
        if (saved) {
          const order: string[] = JSON.parse(saved);
          chs = [...chs].sort((a, b) => {
            const ai = order.indexOf(a.id);
            const bi = order.indexOf(b.id);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          });
        }
      } catch { /* ignore */ }
      setChannels(chs);
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
  useEffect(() => { fetchProjectDocs(); }, [fetchProjectDocs]);
  useEffect(() => { fetchTriggerMessages(); }, [fetchTriggerMessages]);

  // 30초 주기 자동 갱신 (작업자 수정 실시간 반영)
  useEffect(() => {
    const interval = setInterval(() => { fetchProjectDocs(); fetchTriggerMessages(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchProjectDocs, fetchTriggerMessages]);

  useEffect(() => {
    const interval = setInterval(() => { fetchTaskSummary(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchTaskSummary]);

  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  function handleDragStart(e: React.DragEvent, idx: number) {
    dragIndexRef.current = idx;
    setDraggingId(channels[idx].id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  }

  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === -1 || from === idx) {
      setDraggingId(null);
      setOverIdx(null);
      return;
    }
    const reordered = [...channels];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(idx, 0, moved);
    setChannels(reordered);
    try {
      localStorage.setItem("channels-order", JSON.stringify(reordered.map((c) => c.id)));
    } catch { /* ignore */ }
    setDraggingId(null);
    setOverIdx(null);
    dragIndexRef.current = -1;
  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverIdx(null);
    dragIndexRef.current = -1;
  }

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

  async function sendTriggerMessage(ch: Channel) {
    const proj = ch.project || "";
    const msg = triggerMessages[proj];
    if (!msg) {
      setTriggerResult({ id: ch.id, ok: false, msg: "트리거 메시지 없음 (프로젝트 미설정)" });
      return;
    }
    setTriggerSending(ch.id);
    setTriggerResult(null);
    try {
      // message_queue API에 트리거 메시지 등록
      await api.setContext({
        category: "message_queue",
        key: `${proj}_${Date.now()}_trigger`,
        value: {
          target: proj,
          type: "trigger",
          message: msg,
          status: "pending",
          created_at: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " KST",
          source: "dashboard_trigger",
          channel_id: ch.id,
        },
      });
      setTriggerResult({ id: ch.id, ok: true, msg: `트리거 전송 완료 (${proj})` });
    } catch (e: unknown) {
      setTriggerResult({ id: ch.id, ok: false, msg: e instanceof Error ? e.message : "전송 실패" });
    } finally {
      setTriggerSending(null);
      setTimeout(() => setTriggerResult(null), 4000);
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
            {channels.map((ch, idx) => {
              const icon = ch.project ? (PROJECT_ICONS[ch.project] || "🤖") : "🔗";
              const projColor = ch.project ? (PROJECT_COLORS[ch.project] || "rgba(99,102,241,0.25)") : "var(--bg-hover)";
              const isActive = ch.status === "active";

              const isDragging = draggingId === ch.id;
              const isOver = overIdx === idx && draggingId !== null && draggingId !== ch.id;

              return (
                <div
                  key={ch.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  className="rounded-xl p-4 flex flex-col gap-2 transition-all duration-150"
                  style={{
                    background: "var(--bg-card)",
                    border: isOver ? "2px dashed var(--accent)" : "1px solid var(--border)",
                    opacity: isDragging ? 0.4 : 1,
                    cursor: "grab",
                    transform: isOver ? "scale(1.02)" : "scale(1)",
                  }}
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

                  {/* AADS-148: 중요 문서 링크 (편집 가능) */}
                  {ch.project && (
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>중요 문서</span>
                        <button
                          className="text-xs px-1.5 py-0 rounded hover:opacity-70 transition-opacity"
                          style={{ color: "var(--accent)", background: "rgba(59,130,246,0.08)" }}
                          onClick={(e) => { e.stopPropagation(); openDocsEdit(ch.project!); }}
                          title="문서 링크 편집"
                        >
                          편집
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(projectDocs[ch.project] || []).map((doc) => (
                          <a
                            key={doc.label}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                            style={{ background: "rgba(59,130,246,0.12)", color: "var(--accent)", border: "1px solid rgba(59,130,246,0.2)" }}
                          >
                            {doc.label}
                          </a>
                        ))}
                        {(!projectDocs[ch.project] || projectDocs[ch.project].length === 0) && (
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>문서 없음</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 트리거 메시지 미리보기 (편집 가능) */}
                  {ch.project && triggerMessages[ch.project] && (
                    <div className="text-xs px-2 py-1 rounded" style={{ background: "rgba(59,130,246,0.08)", color: "var(--text-secondary)", border: "1px solid rgba(59,130,246,0.15)" }}>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="font-medium" style={{ color: "var(--accent)" }}>트리거:</span>
                        <button
                          className="text-xs px-1 py-0 rounded hover:opacity-70 transition-opacity"
                          style={{ color: "var(--accent)", background: "rgba(59,130,246,0.12)" }}
                          onClick={(e) => { e.stopPropagation(); openTriggerEdit(ch.project!); }}
                          title="트리거 메시지 편집"
                        >
                          편집
                        </button>
                      </div>
                      {triggerMessages[ch.project].slice(0, 80)}...
                    </div>
                  )}

                  {/* 트리거 전송 결과 표시 */}
                  {triggerResult && triggerResult.id === ch.id && (
                    <div className="text-xs px-2 py-1 rounded" style={{ background: triggerResult.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: triggerResult.ok ? "var(--success, #22c55e)" : "#ef4444" }}>
                      {triggerResult.ok ? "✅" : "❌"} {triggerResult.msg}
                    </div>
                  )}

                  {/* 구분선 + 액션 버튼 */}
                  <div className="border-t mt-auto pt-2 flex gap-1 flex-wrap" style={{ borderColor: "var(--border)" }}>
                    {ch.url && (
                      <button
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{ background: "var(--accent)", color: "#fff" }}
                        onClick={() => window.open(ch.url, "_blank")}
                      >
                        🔗 열기
                      </button>
                    )}
                    {ch.project && triggerMessages[ch.project] && (
                      <button
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                        style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}
                        onClick={() => sendTriggerMessage(ch)}
                        disabled={triggerSending === ch.id}
                      >
                        {triggerSending === ch.id ? "전송 중..." : "📨 트리거 전송"}
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

      {/* 문서 링크 편집 모달 */}
      {docsEditProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-lg rounded-xl p-6 max-h-[85vh] overflow-y-auto" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                {PROJECT_ICONS[docsEditProject] || "📄"} {docsEditProject} 중요 문서 편집
              </h3>
              <button
                onClick={() => setDocsEditProject(null)}
                className="text-xl leading-none hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
              저장 시 DB에 반영되고 aads-docs 레포에 자동 push됩니다.
            </p>

            <div className="space-y-2">
              {docsEditList.map((doc, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={doc.label}
                    onChange={(e) => updateDocRow(idx, "label", e.target.value)}
                    placeholder="이름 (예: HANDOVER)"
                    className="w-28 px-2 py-1.5 rounded text-xs outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                  <input
                    type="url"
                    value={doc.url}
                    onChange={(e) => updateDocRow(idx, "url", e.target.value)}
                    placeholder="URL"
                    className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                  <button
                    onClick={() => removeDocRow(idx)}
                    className="text-sm px-1.5 hover:opacity-70"
                    style={{ color: "#ef4444" }}
                    title="삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addDocRow}
              className="mt-2 px-3 py-1 text-xs rounded-lg hover:opacity-80 transition-opacity"
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
            >
              + 문서 추가
            </button>

            {docsSyncResult && (
              <div className="mt-3 text-xs px-2 py-1.5 rounded" style={{
                background: docsSyncResult.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                color: docsSyncResult.ok ? "#22c55e" : "#ef4444"
              }}>
                {docsSyncResult.ok ? "✅" : "❌"} {docsSyncResult.msg}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setDocsEditProject(null)}
                className="px-4 py-2 text-sm rounded-lg"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                취소
              </button>
              <button
                onClick={saveProjectDocs}
                disabled={docsSaving}
                className="px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {docsSaving ? "저장 + Push 중..." : "저장 + Push"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 트리거 메시지 편집 모달 */}
      {triggerEditProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-lg rounded-xl p-6 max-h-[85vh] overflow-y-auto" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                {PROJECT_ICONS[triggerEditProject] || "📨"} {triggerEditProject} 트리거 메시지 편집
              </h3>
              <button
                onClick={() => setTriggerEditProject(null)}
                className="text-xl leading-none hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
              저장 시 DB에 반영되고 aads-docs 레포에 자동 push됩니다. 전체 내용을 직접 수정하세요.
            </p>

            <textarea
              value={triggerEditText}
              onChange={(e) => setTriggerEditText(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", minHeight: "120px" }}
              placeholder="트리거 메시지를 입력하세요..."
            />

            <div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              글자 수: {triggerEditText.length}
            </div>

            {triggerEditResult && (
              <div className="mt-3 text-xs px-2 py-1.5 rounded" style={{
                background: triggerEditResult.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                color: triggerEditResult.ok ? "#22c55e" : "#ef4444"
              }}>
                {triggerEditResult.ok ? "✅" : "❌"} {triggerEditResult.msg}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setTriggerEditProject(null)}
                className="px-4 py-2 text-sm rounded-lg"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                취소
              </button>
              <button
                onClick={saveTriggerMessage}
                disabled={triggerSavingEdit}
                className="px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {triggerSavingEdit ? "저장 + Push 중..." : "저장 + Push"}
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
