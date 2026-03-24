"use client";
import { useState } from "react";
import Header from "@/components/Header";

interface Generated {
  id: string;
  content: string;
  tone: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
const SITUATIONS = ["생일 축하", "결혼기념일", "감사 인사", "안부 인사", "축하 메시지", "위로", "마케팅", "기타"];
const RELATIONSHIPS = ["가족", "친구", "직장 동료", "거래처", "연인", "지인"];
const TONES = [
  { value: "friendly", label: "따뜻한 😊" },
  { value: "formal", label: "격식 🤵" },
  { value: "witty", label: "유머 😄" },
  { value: "professional", label: "비즈니스 💼" },
];

export default function AIWriterPage() {
  const [situation, setSituation] = useState("생일 축하");
  const [relationship, setRelationship] = useState("친구");
  const [tone, setTone] = useState("friendly");
  const [recipientName, setRecipientName] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [results, setResults] = useState<Generated[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setResults([]);
    try {
      const res = await fetch(`${API}/kakao-bot/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          situation,
          relationship,
          tone,
          recipient_name: recipientName || undefined,
          extra_context: extraContext || undefined,
          count: 3,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.candidates || []);
      }
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const handleSave = async (item: Generated) => {
    const content = editingId === item.id ? editContent : item.content;
    await fetch(`${API}/kakao-bot/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "custom",
        title: `AI 생성 - ${situation}`,
        content,
        tone: item.tone,
      }),
    });
    setSaved(prev => new Set(prev).add(item.id));
    setEditingId(null);
  };

  const startEdit = (item: Generated) => {
    setEditingId(item.id);
    setEditContent(item.content);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="AI 문구 생성기" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 좌측: 입력 패널 */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>✨ 문구 설정</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>상황</label>
                <div className="flex flex-wrap gap-2">
                  {SITUATIONS.map(s => (
                    <button key={s} onClick={() => setSituation(s)}
                      className="rounded-full px-3 py-1.5 text-xs transition-colors"
                      style={{
                        background: situation === s ? "var(--accent)" : "var(--bg-hover)",
                        color: situation === s ? "#fff" : "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>관계</label>
                <div className="flex flex-wrap gap-2">
                  {RELATIONSHIPS.map(r => (
                    <button key={r} onClick={() => setRelationship(r)}
                      className="rounded-full px-3 py-1.5 text-xs transition-colors"
                      style={{
                        background: relationship === r ? "#8b5cf6" : "var(--bg-hover)",
                        color: relationship === r ? "#fff" : "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}>{r}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>톤</label>
                <div className="flex flex-wrap gap-2">
                  {TONES.map(t => (
                    <button key={t.value} onClick={() => setTone(t.value)}
                      className="rounded-full px-3 py-1.5 text-xs transition-colors"
                      style={{
                        background: tone === t.value ? "#ec4899" : "var(--bg-hover)",
                        color: tone === t.value ? "#fff" : "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>받는 사람 이름 (선택)</label>
                <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="예: 김민수"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>추가 맥락 (선택)</label>
                <textarea value={extraContext} onChange={e => setExtraContext(e.target.value)} rows={2}
                  placeholder="예: 최근 승진했고, 10년 지기 친구입니다"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <button onClick={handleGenerate} disabled={generating}
                className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: generating ? "var(--bg-hover)" : "var(--accent)" }}>
                {generating ? "✨ AI가 문구를 만들고 있어요..." : "✨ AI 문구 3개 생성하기"}
              </button>
            </div>
          </div>

          {/* 우측: 결과 패널 */}
          <div>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>📄 생성 결과</h2>
            {results.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <p className="text-4xl mb-3">✨</p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>왼쪽에서 설정 후 생성 버튼을 눌러주세요</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>AI가 상황에 맞는 문구 3개를 추천합니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((item, idx) => (
                  <div key={item.id || idx} className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>후보 {idx + 1}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                        {item.tone}
                      </span>
                    </div>
                    {editingId === item.id ? (
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none mb-2"
                        style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    ) : (
                      <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-primary)" }}>{item.content}</p>
                    )}
                    <div className="flex gap-2">
                      {!saved.has(item.id) ? (
                        <>
                          {editingId === item.id ? (
                            <>
                              <button onClick={() => handleSave(item)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ background: "#22c55e" }}>저장</button>
                              <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>취소</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(item)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-hover)", color: "var(--accent)" }}>편집</button>
                              <button onClick={() => handleSave(item)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ background: "#22c55e" }}>템플릿 저장</button>
                              <button onClick={() => navigator.clipboard.writeText(item.content)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>복사</button>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "#22c55e" }}>✅ 저장됨</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
