"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api, type UserApiKeyItem } from "@/lib/api";

const PROVIDERS = ["anthropic", "openai", "gemini", "dashscope"];

function fmtKst(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

export default function UserApiKeysPage() {
  const [keys, setKeys] = useState<UserApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string>("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ provider: "openai", display_name: "", key: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKeys(await api.getUserApiKeys());
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "API 키 목록 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.key.trim()) {
      setMessage("API 키를 입력하십시오.");
      return;
    }
    setSaving(true);
    try {
      await api.createUserApiKey({
        provider: form.provider,
        display_name: form.display_name.trim() || undefined,
        key: form.key.trim(),
      });
      setForm((prev) => ({ ...prev, key: "" }));
      await load();
      setMessage("저장 완료");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const test = async (key: UserApiKeyItem) => {
    setTesting(key.id);
    try {
      const result = await api.testUserApiKey(key.id);
      setMessage(result.ok ? `${key.provider} 검증 성공` : `${key.provider} 검증 실패: ${result.reason}`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "검증 실패");
    } finally {
      setTesting("");
    }
  };

  const remove = async (key: UserApiKeyItem) => {
    if (!window.confirm(`${key.provider} 키를 삭제하시겠습니까?`)) return;
    try {
      await api.deleteUserApiKey(key.id);
      await load();
      setMessage("삭제 완료");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const panelStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 16,
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="AI API" />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <section style={panelStyle}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>사용자 API 키</h1>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>등록된 키가 있으면 해당 provider 호출에 우선 사용됩니다.</p>
              </div>
              <button onClick={load} className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                새로고침
              </button>
            </div>
            {message && (
              <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{
                background: message.includes("실패") || message.includes("error") ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                color: message.includes("실패") || message.includes("error") ? "var(--danger)" : "var(--success)",
              }}>
                {message}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr]">
              <select
                value={form.provider}
                onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
                className="rounded-md px-3 py-2 text-sm"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              >
                {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
              </select>
              <input
                value={form.display_name}
                onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
                placeholder="표시명"
                className="rounded-md px-3 py-2 text-sm"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <input
                value={form.key}
                onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
                type="password"
                placeholder="API key"
                className="rounded-md px-3 py-2 text-sm md:col-span-2"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={save} disabled={saving} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.6 : 1 }}>
                {saving ? "저장 중" : "저장"}
              </button>
            </div>
          </section>

          <section style={panelStyle}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--text-primary)" }}>등록 목록</h2>
            {loading ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
            ) : keys.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>오비스 자원으로 지원 중</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                      <th className="py-2 text-left">Provider</th>
                      <th className="py-2 text-left">키</th>
                      <th className="py-2 text-left">표시명</th>
                      <th className="py-2 text-left">최근 사용</th>
                      <th className="py-2 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr key={key.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="py-3 font-semibold" style={{ color: "var(--text-primary)" }}>{key.provider}</td>
                        <td className="py-3 font-mono" style={{ color: "var(--text-secondary)" }}>{key.masked_key}</td>
                        <td className="py-3" style={{ color: "var(--text-secondary)" }}>{key.display_name || "-"}</td>
                        <td className="py-3" style={{ color: "var(--text-secondary)" }}>{fmtKst(key.last_used_at)}</td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => void test(key)} disabled={testing === key.id} className="rounded-md px-3 py-1.5 text-xs" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                              {testing === key.id ? "검증 중" : "검증"}
                            </button>
                            <button onClick={() => void remove(key)} className="rounded-md px-3 py-1.5 text-xs" style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)" }}>
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
