"use client";
import { useEffect, useState } from "react";
import KakaoBotHeader from "@/components/KakaoBotHeader";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token")
    || document.cookie.split("; ").find(r => r.startsWith("aads_token="))?.split("=")[1]
    || null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}


interface Anniversary {
  id: string;
  contact_name: string;
  anniversary_type: string;
  date: string;
  lunar: boolean;
  memo?: string;
  auto_send: boolean;
}

const API = typeof window !== "undefined" ? "/api/v1" : (process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1");
const TYPES = ["생일", "결혼기념일", "입사기념일", "개업기념일", "기타"];
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

export default function AnniversariesPage() {
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ contact_name: "", anniversary_type: "생일", date: "", lunar: false, memo: "", auto_send: true });

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/kakao-bot/anniversaries`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { anniversaries: [] })
      .then(d => setAnniversaries(d.anniversaries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    await fetch(`${API}/kakao-bot/anniversaries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ contact_name: "", anniversary_type: "생일", date: "", lunar: false, memo: "", auto_send: true });
    // refetch
    const r = await fetch(`${API}/kakao-bot/anniversaries`);
    if (r.ok) { const d = await r.json(); setAnniversaries(d.anniversaries || []); }
  };

  // 캘린더 데이터 생성
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const calendarDays = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const getAnniversariesForDay = (day: number) => {
    const mm = String(currentMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return anniversaries.filter(a => {
      const d = a.date;
      return d.endsWith(`-${mm}-${dd}`) || d.endsWith(`/${mm}/${dd}`);
    });
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <KakaoBotHeader title="기념일 캘린더" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 컨트롤 바 */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>←</button>
            <span className="text-sm font-semibold min-w-[100px] text-center" style={{ color: "var(--text-primary)" }}>
              {currentYear}년 {MONTHS[currentMonth]}
            </span>
            <button onClick={nextMonth} className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>→</button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <button onClick={() => setViewMode("calendar")} className="px-3 py-1.5 text-xs"
                style={{ background: viewMode === "calendar" ? "var(--accent)" : "var(--bg-card)", color: viewMode === "calendar" ? "#fff" : "var(--text-secondary)" }}>캘린더</button>
              <button onClick={() => setViewMode("list")} className="px-3 py-1.5 text-xs"
                style={{ background: viewMode === "list" ? "var(--accent)" : "var(--bg-card)", color: viewMode === "list" ? "#fff" : "var(--text-secondary)" }}>리스트</button>
            </div>
            <button onClick={() => setShowForm(true)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
              + 기념일 등록
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : viewMode === "calendar" ? (
          /* 캘린더 뷰 */
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["일","월","화","수","목","금","토"].map(d => (
                <div key={d} className="text-xs text-center py-1 font-semibold" style={{ color: "var(--text-secondary)" }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, i) => {
                const dayAnnivs = day ? getAnniversariesForDay(day) : [];
                const isToday = day === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
                return (
                  <div key={i} className="min-h-[60px] md:min-h-[80px] rounded-lg p-1"
                    style={{ background: isToday ? "rgba(59,130,246,0.15)" : day ? "var(--bg-hover)" : "transparent" }}>
                    {day && (
                      <>
                        <span className="text-xs" style={{ color: isToday ? "var(--accent)" : "var(--text-secondary)" }}>{day}</span>
                        {dayAnnivs.map(a => (
                          <div key={a.id} className="text-[10px] rounded px-1 py-0.5 mt-0.5 truncate" style={{ background: "#8b5cf6", color: "#fff" }}>
                            🎂 {a.contact_name}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* 리스트 뷰 */
          <div className="space-y-2">
            {anniversaries.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>등록된 기념일이 없습니다</p>
              </div>
            ) : anniversaries.map(a => (
              <div key={a.id} className="rounded-xl p-4 flex items-center justify-between" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎂</span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{a.contact_name}</p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{a.anniversary_type} · {a.date} {a.lunar ? "(음력)" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.auto_send && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>자동발송</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 등록 모달 */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
            <div className="rounded-xl p-6 w-full max-w-md mx-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>기념일 등록</h3>
              <div className="space-y-3">
                <input placeholder="이름 *" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                <select value={form.anniversary_type} onChange={e => setForm({ ...form, anniversary_type: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                  <input type="checkbox" checked={form.lunar} onChange={e => setForm({ ...form, lunar: e.target.checked })} />
                  음력
                </label>
                <textarea placeholder="메모" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                  <input type="checkbox" checked={form.auto_send} onChange={e => setForm({ ...form, auto_send: e.target.checked })} />
                  자동 발송
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-secondary)" }}>취소</button>
                <button onClick={handleSubmit} disabled={!form.contact_name || !form.date} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                  등록
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
