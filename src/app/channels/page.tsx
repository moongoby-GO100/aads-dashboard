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

const EMPTY_FORM = { id: "", name: "", description: "", url: "", status: "active", project: "", server: "" };

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Channel | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

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

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="대화창 관리" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            📌 Genspark 대화창 목록 ({channels.length})
          </p>
          <button
            onClick={openAdd}
            className="px-3 py-1.5 text-sm rounded-lg font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + 추가
          </button>
        </div>

        {/* 테이블 */}
        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  <th className="text-left p-3">대화창명</th>
                  <th className="text-left p-3 hidden sm:table-cell">설명</th>
                  <th className="text-left p-3 hidden md:table-cell">프로젝트</th>
                  <th className="text-center p-3">상태</th>
                  <th className="text-center p-3">액션</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr key={ch.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="p-3">
                      <p className="font-medium" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{ch.id}</p>
                    </td>
                    <td className="p-3 hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>
                      {ch.description || "-"}
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      {ch.project && (
                        <span className="px-1.5 py-0.5 rounded text-xs"
                          style={{ background: "rgba(59,130,246,0.2)", color: "var(--accent)" }}>
                          {ch.project}
                        </span>
                      )}
                      {ch.server && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs"
                          style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                          🖥 {ch.server}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        style={{
                          background: ch.status === "active" ? "rgba(34,197,94,0.15)" : "var(--bg-hover)",
                          color: ch.status === "active" ? "var(--success)" : "var(--text-secondary)",
                        }}>
                        <span className="w-1.5 h-1.5 rounded-full inline-block"
                          style={{ background: ch.status === "active" ? "var(--success)" : "var(--text-secondary)" }} />
                        {ch.status === "active" ? "ON" : "OFF"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {ch.url && (
                          <button
                            title="대화창 열기"
                            onClick={() => window.open(ch.url, "_blank")}
                            className="text-base leading-none hover:opacity-70 transition-opacity"
                          >
                            🔗
                          </button>
                        )}
                        <button
                          title="수정"
                          onClick={() => openEdit(ch)}
                          className="text-base leading-none hover:opacity-70 transition-opacity"
                        >
                          ✏️
                        </button>
                        <button
                          title="삭제"
                          onClick={() => handleDelete(ch)}
                          className="text-base leading-none hover:opacity-70 transition-opacity"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {channels.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8" style={{ color: "var(--text-secondary)" }}>
                      대화창이 없습니다. [+ 추가] 버튼으로 등록하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>URL *</label>
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
                    <option value="AADS">AADS</option>
                    <option value="GO100">GO100</option>
                    <option value="KIS">KIS</option>
                    <option value="ShortFlow">ShortFlow</option>
                    <option value="NAS">NAS</option>
                    <option value="NewTalk">NewTalk</option>
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
    </div>
  );
}
