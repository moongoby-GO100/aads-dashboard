"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";

interface Template {
  id: string;
  category: string;
  title: string;
  content: string;
  tone: string;
  is_system: boolean;
  created_at: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
const CATEGORIES = [
  { key: "all", label: "전체" },
  { key: "birthday", label: "🎂 생일" },
  { key: "wedding_anniversary", label: "💕 결혼기념일" },
  { key: "greeting", label: "👋 안부" },
  { key: "marketing", label: "📢 마케팅" },
  { key: "thank_you", label: "🙏 감사" },
  { key: "congratulation", label: "🎉 축하" },
  { key: "new_year", label: "🎊 새해" },
  { key: "chuseok", label: "🌕 추석" },
  { key: "custom", label: "✏️ 커스텀" },
];
const TONES = ["friendly", "formal", "witty"];
const TONE_LABELS: Record<string, string> = { friendly: "따뜻한", formal: "격식", witty: "유머" };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "custom", title: "", content: "", tone: "friendly" });

  const fetchTemplates = useCallback(() => {
    setLoading(true);
    const q = activeTab !== "all" ? `?category=${activeTab}` : "";
    fetch(`${API}/kakao-bot/templates${q}`)
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(d => setTemplates(d.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSubmit = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API}/kakao-bot/templates/${editId}` : `${API}/kakao-bot/templates`;
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false);
    setEditId(null);
    setForm({ category: "custom", title: "", content: "", tone: "friendly" });
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`${API}/kakao-bot/templates/${id}`, { method: "DELETE" });
    fetchTemplates();
  };

  const handleEdit = (t: Template) => {
    setForm({ category: t.category, title: t.title, content: t.content, tone: t.tone });
    setEditId(t.id);
    setShowForm(true);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="템플릿 관리" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 카테고리 탭 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => setActiveTab(cat.key)}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: activeTab === cat.key ? "var(--accent)" : "var(--bg-card)",
                color: activeTab === cat.key ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}>
              {cat.label}
            </button>
          ))}
        </div>

        {/* 추가 버튼 */}
        <div className="flex justify-end mb-4">
          <button onClick={() => { setShowForm(true); setEditId(null); setForm({ category: "custom", title: "", content: "", tone: "friendly" }); }}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
            + 새 템플릿
          </button>
        </div>

        {/* 템플릿 목록 */}
        {loading ? (
          <div className="text-sm py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-3xl mb-2">📝</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>이 카테고리에 템플릿이 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map(t => (
              <div key={t.id} className="rounded-xl p-4 flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{t.title}</h3>
                  {t.is_system && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}>시스템</span>}
                </div>
                <div className="flex gap-1.5 mb-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>{t.category}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>{TONE_LABELS[t.tone] || t.tone}</span>
                </div>
                <p className="text-xs flex-1 leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>{t.content}</p>
                {!t.is_system && (
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(t)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-hover)", color: "var(--accent)" }}>수정</button>
                    <button onClick={() => handleDelete(t.id)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-hover)", color: "var(--danger)" }}>삭제</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 폼 모달 */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
            <div className="rounded-xl p-6 w-full max-w-md mx-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{editId ? "템플릿 수정" : "새 템플릿"}</h3>
              <div className="space-y-3">
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  {CATEGORIES.filter(c => c.key !== "all").map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <input placeholder="제목 *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                <textarea placeholder="내용 ({name}으로 이름 치환)" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={4}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                <select value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  {TONES.map(t => <option key={t} value={t}>{TONE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-secondary)" }}>취소</button>
                <button onClick={handleSubmit} disabled={!form.title || !form.content} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                  {editId ? "수정" : "추가"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
