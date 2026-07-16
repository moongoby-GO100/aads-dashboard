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

interface Settings {
  auto_send_enabled: boolean;
  default_tone: string;
  send_channel: string;
  send_time: string;
  birthday_days_before: number;
  anniversary_days_before: number;
  greeting_frequency: string;
  marketing_enabled: boolean;
}

const API = typeof window !== "undefined" ? "/api/v1" : (process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1");

const TONES = [
  { value: "friendly", label: "따뜻한 😊" },
  { value: "formal", label: "격식 🤵" },
  { value: "witty", label: "유머 😄" },
  { value: "professional", label: "비즈니스 💼" },
];

const CHANNELS = [
  { value: "kakao", label: "카카오톡" },
  { value: "sms", label: "SMS" },
  { value: "both", label: "카카오톡 + SMS" },
];

const FREQUENCIES = [
  { value: "weekly", label: "주 1회" },
  { value: "biweekly", label: "격주" },
  { value: "monthly", label: "월 1회" },
  { value: "off", label: "사용 안 함" },
];

const DEFAULT_SETTINGS: Settings = {
  auto_send_enabled: true,
  default_tone: "friendly",
  send_channel: "kakao",
  send_time: "09:00",
  birthday_days_before: 0,
  anniversary_days_before: 0,
  greeting_frequency: "monthly",
  marketing_enabled: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [agentToken, setAgentToken] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  useEffect(() => {
    fetch(`${API}/kakao-bot/settings`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.settings) setSettings(prev => ({ ...prev, ...d.settings })); })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch(`${API}/kakao-bot/agent/token`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.token) setAgentToken(d.token); })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaveMsg("");
    try {
      const res = await fetch(`${API}/kakao-bot/settings`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(settings),
      });
      setSaveMsg(res.ok ? "저장되었습니다" : "저장 실패");
    } catch { setSaveMsg("저장 실패"); }
    setSaving(false); setTimeout(() => setSaveMsg(""), 3000);
  };

  const handleGenerateToken = async () => {
    setTokenLoading(true);
    try {
      const res = await fetch(`${API}/kakao-bot/agent/token`, {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const d = await res.json();
      if (d?.token) setAgentToken(d.token);
    } catch {}
    setTokenLoading(false);
  };

  const handleCopyToken = () => {
    if (!agentToken) return;
    navigator.clipboard.writeText(agentToken);
    setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000);
  };

  const update = (key: keyof Settings, value: unknown) => setSettings(prev => ({ ...prev, [key]: value }));

  if (loading) return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <KakaoBotHeader title="KakaoBot 설정" />
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <KakaoBotHeader title="KakaoBot 설정" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* PC Agent 토큰 */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "2px solid #FFE812" }}>
            <div className="flex items-start gap-3 mb-4">
              <span style={{ fontSize: "24px" }}>🔑</span>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>PC 에이전트 토큰</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>PC Agent 설치 시 이 토큰을 입력하세요</p>
              </div>
            </div>
            {agentToken ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg px-3 py-2.5 text-xs font-mono select-all break-all"
                    style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                    {agentToken}
                  </code>
                  <button onClick={handleCopyToken} className="shrink-0 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors"
                    style={{ background: tokenCopied ? "#22c55e" : "#FFE812", color: tokenCopied ? "#fff" : "#3C1E1E", border: tokenCopied ? "1px solid #16a34a" : "1px solid #F5DC00" }}>
                    {tokenCopied ? "✓ 복사됨" : "📋 복사"}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>이 토큰을 PC Agent 실행 시 붙여넣기 하세요</p>
                  <button onClick={handleGenerateToken} disabled={tokenLoading} className="text-xs underline" style={{ color: "var(--text-secondary)" }}>
                    {tokenLoading ? "발급 중..." : "토큰 재발급"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={handleGenerateToken} disabled={tokenLoading}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#FFE812", color: "#3C1E1E", border: "2px solid #F5DC00" }}>
                {tokenLoading ? "발급 중..." : "🔑 토큰 발급하기"}
              </button>
            )}
          </div>

          {/* 자동 발송 */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>자동 발송</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>기념일에 자동으로 메시지를 발송합니다</p>
              </div>
              <button onClick={() => update("auto_send_enabled", !settings.auto_send_enabled)}
                className="relative w-12 h-6 rounded-full transition-colors shrink-0"
                style={{ background: settings.auto_send_enabled ? "var(--accent)" : "var(--bg-hover)" }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                  style={{ left: settings.auto_send_enabled ? "26px" : "2px" }} />
              </button>
            </div>
            {settings.auto_send_enabled && (
              <div className="space-y-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>발송 시간</label>
                  <input type="time" value={settings.send_time} onChange={e => update("send_time", e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>생일 사전 발송</label>
                    <select value={settings.birthday_days_before} onChange={e => update("birthday_days_before", Number(e.target.value))}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      <option value={0}>당일</option><option value={1}>1일 전</option><option value={3}>3일 전</option><option value={7}>7일 전</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>기념일 사전 발송</label>
                    <select value={settings.anniversary_days_before} onChange={e => update("anniversary_days_before", Number(e.target.value))}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      <option value={0}>당일</option><option value={1}>1일 전</option><option value={3}>3일 전</option><option value={7}>7일 전</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 기본 톤 */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>기본 메시지 톤</h2>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>AI 문구 생성 및 자동 발송 시 기본 톤</p>
            <div className="flex flex-wrap gap-2">
              {TONES.map(t => (
                <button key={t.value} onClick={() => update("default_tone", t.value)}
                  className="rounded-full px-4 py-2 text-xs font-medium transition-colors"
                  style={{ background: settings.default_tone === t.value ? "var(--accent)" : "var(--bg-hover)",
                    color: settings.default_tone === t.value ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 발송 채널 */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>발송 채널</h2>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>메시지를 보낼 기본 채널을 선택합니다</p>
            <div className="space-y-2">
              {CHANNELS.map(ch => (
                <label key={ch.value} className="flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-colors"
                  style={{ background: settings.send_channel === ch.value ? "rgba(59,130,246,0.1)" : "var(--bg-hover)",
                    border: `1px solid ${settings.send_channel === ch.value ? "var(--accent)" : "var(--border)"}` }}>
                  <input type="radio" name="channel" checked={settings.send_channel === ch.value}
                    onChange={() => update("send_channel", ch.value)} className="accent-blue-500" />
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>{ch.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 안부 인사 빈도 */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>안부 인사 자동 발송</h2>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>연락처에 정기적으로 안부 인사를 보냅니다</p>
            <div className="flex flex-wrap gap-2">
              {FREQUENCIES.map(f => (
                <button key={f.value} onClick={() => update("greeting_frequency", f.value)}
                  className="rounded-full px-4 py-2 text-xs font-medium transition-colors"
                  style={{ background: settings.greeting_frequency === f.value ? "#8b5cf6" : "var(--bg-hover)",
                    color: settings.greeting_frequency === f.value ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 마케팅 메시지 */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>마케팅 메시지</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>마케팅 템플릿을 활용한 자동 발송 허용</p>
              </div>
              <button onClick={() => update("marketing_enabled", !settings.marketing_enabled)}
                className="relative w-12 h-6 rounded-full transition-colors shrink-0"
                style={{ background: settings.marketing_enabled ? "#22c55e" : "var(--bg-hover)" }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                  style={{ left: settings.marketing_enabled ? "26px" : "2px" }} />
              </button>
            </div>
          </div>

          {/* 저장 */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-6">
            {saveMsg && <span className="text-xs" style={{ color: saveMsg === "저장되었습니다" ? "#22c55e" : "#ef4444" }}>{saveMsg}</span>}
            <button onClick={handleSave} disabled={saving}
              className="rounded-lg px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ background: "var(--accent)" }}>
              {saving ? "저장 중..." : "설정 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
