"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";

interface Contact {
  id: string;
  name: string;
  phone?: string;
  relationship: string;
  group_name?: string;
  memo?: string;
  created_at: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

const RELATIONSHIPS = ["가족", "친구", "직장동료", "거래처", "지인", "기타"];
const GROUPS = ["전체", "가족", "친구", "직장", "거래처", "VIP"];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRel, setFilterRel] = useState("전체");
  const [filterGroup, setFilterGroup] = useState("전체");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", relationship: "친구", group_name: "", memo: "" });

  const fetchContacts = useCallback(() => {
    setLoading(true);
    fetch(`${API}/kakao-bot/contacts`)
      .then(r => r.ok ? r.json() : { contacts: [] })
      .then(d => setContacts(d.contacts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const filtered = contacts.filter(c => {
    if (filterRel !== "전체" && c.relationship !== filterRel) return false;
    if (filterGroup !== "전체" && c.group_name !== filterGroup) return false;
    if (search && !c.name.includes(search) && !(c.phone || "").includes(search)) return false;
    return true;
  });

  const handleSubmit = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API}/kakao-bot/contacts/${editId}` : `${API}/kakao-bot/contacts`;
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setEditId(null);
    setForm({ name: "", phone: "", relationship: "친구", group_name: "", memo: "" });
    fetchContacts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await fetch(`${API}/kakao-bot/contacts/${id}`, { method: "DELETE" });
    fetchContacts();
  };

  const handleEdit = (c: Contact) => {
    setForm({ name: c.name, phone: c.phone || "", relationship: c.relationship, group_name: c.group_name || "", memo: c.memo || "" });
    setEditId(c.id);
    setShowForm(true);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="연락처 관리" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 상단 바 */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="이름 또는 번호 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <select
            value={filterRel}
            onChange={e => setFilterRel(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            <option value="전체">관계: 전체</option>
            {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button
            onClick={() => { setShowForm(true); setEditId(null); setForm({ name: "", phone: "", relationship: "친구", group_name: "", memo: "" }); }}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            + 연락처 추가
          </button>
        </div>

        {/* 연락처 목록 */}
        {loading ? (
          <div className="text-sm py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>등록된 연락처가 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(c => (
              <div key={c.id} className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{c.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                    {c.relationship}
                  </span>
                </div>
                {c.phone && <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>📞 {c.phone}</p>}
                {c.group_name && <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>🏷️ {c.group_name}</p>}
                {c.memo && <p className="text-xs mb-2 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{c.memo}</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleEdit(c)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-hover)", color: "var(--accent)" }}>수정</button>
                  <button onClick={() => handleDelete(c.id)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-hover)", color: "var(--danger)" }}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 추가/수정 모달 */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
            <div
              className="rounded-xl p-6 w-full max-w-md mx-4"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                {editId ? "연락처 수정" : "연락처 추가"}
              </h3>
              <div className="space-y-3">
                <input placeholder="이름 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                <input placeholder="전화번호" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                <select value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input placeholder="그룹" value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                <textarea placeholder="메모" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-secondary)" }}>취소</button>
                <button onClick={handleSubmit} disabled={!form.name} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
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
