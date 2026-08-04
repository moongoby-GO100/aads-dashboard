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

const API = typeof window !== "undefined" ? "/api/v1" : (process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1");

interface VersionInfo {
  version: string;
  release_date: string;
  file_size: string;
  changelog?: string;
}

const FAQ_ITEMS = [
  {
    q: "에이전트가 연결되지 않아요",
    a: "자동 설치 파일을 새로 내려받아 실행하고, Windows 방화벽 또는 보안 프로그램이 AADS 서버 WebSocket 연결을 차단하지 않는지 확인해 주세요.",
  },
  {
    q: "카카오톡이 자동으로 메시지를 보내나요?",
    a: "설정된 예약 발송 및 자동응대 규칙에 따라서만 동작합니다. 임의로 메시지를 보내지 않으며, 사용자가 설정한 경우에만 발송됩니다.",
  },
  {
    q: "업데이트는 어떻게 하나요?",
    a: "자동 업데이트를 지원합니다. EXE 실행 시 새 버전이 있으면 자동으로 업데이트됩니다. 또는 이 페이지에서 최신 버전을 다시 다운로드하여 덮어쓰기 설치할 수 있습니다.",
  },
];

export default function AgentPage() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [agentToken, setAgentToken] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [installLoading, setInstallLoading] = useState(false);
  const [installError, setInstallError] = useState("");
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    fetch(`${API}/kakao-bot/agent/version`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setVersionInfo(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch(`${API}/kakao-bot/agent/token`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.token) setAgentToken(d.token); })
      .catch(() => {});
  }, []);

  const manualDownloadUrl = `${API}/kakao-bot/agent/download-exe`;
  const installTicketUrl = `${API}/kakao-bot/agent/install-ticket`;

  const handleAutoInstallDownload = async () => {
    setInstallLoading(true);
    setInstallError("");
    setInstallMessage("");
    try {
      const res = await fetch(installTicketUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok || !data?.download_url) {
        throw new Error(data?.detail || "자동 설치 파일 준비 실패");
      }
      setInstallMessage("자동 페어링 설치 파일을 내려받습니다.");
      window.location.href = data.download_url;
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "자동 설치 파일 준비 실패");
    } finally {
      setInstallLoading(false);
    }
  };

  const handleGenerateToken = async () => {
    setTokenLoading(true);
    setTokenError("");
    try {
      const res = await fetch(`${API}/kakao-bot/agent/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok || !data?.token) {
        throw new Error(data?.detail || "토큰 발급 실패");
      }
      setAgentToken(data.token);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : "토큰 발급 실패");
    } finally {
      setTokenLoading(false);
    }
  };

  const handleCopyToken = async () => {
    if (!agentToken) return;
    try {
      await navigator.clipboard.writeText(agentToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      setTokenError("클립보드 복사 실패");
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "#FAFAFA" }}>
      <KakaoBotHeader title="💻 PC 에이전트 설치" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* 히어로 섹션 */}
          <div className="rounded-xl p-6" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#FFF9DB" }}>
                <span style={{ fontSize: "28px" }}>💻</span>
              </div>
              <div>
                <h1 className="text-lg font-bold mb-1" style={{ color: "#1A1A1A" }}>PC 에이전트 설치</h1>
                <p className="text-sm leading-relaxed" style={{ color: "#6B7280" }}>
                  카카오톡 PC에서 자동 메시지 발송 및 응대를 위한 에이전트입니다.
                  Windows PC에 설치하여 예약된 메시지를 자동으로 발송합니다.
                </p>
              </div>
            </div>
          </div>

          {/* 다운로드 카드 */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>에이전트 다운로드</h2>
            <div className="flex items-center justify-between mb-4 p-3 rounded-lg" style={{ background: "#FAFAFA", border: "1px solid #E5E7EB" }}>
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: "#1A1A1A" }}>최신 버전</p>
                {loading ? (
                  <p className="text-xs" style={{ color: "#9CA3AF" }}>버전 정보 로딩 중...</p>
                ) : versionInfo ? (
                  <>
                    <p className="text-sm font-bold" style={{ color: "#3C1E1E" }}>v{versionInfo.version}</p>
                    {versionInfo.release_date && (
                      <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>출시일: {versionInfo.release_date}</p>
                    )}
                    {versionInfo.file_size && (
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>크기: {versionInfo.file_size}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm font-bold" style={{ color: "#3C1E1E" }}>최신 버전</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#DCFCE7", color: "#16A34A" }}>EXE</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAutoInstallDownload}
              disabled={installLoading}
              className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
              style={{ background: "#FFE812", color: "#3C1E1E", border: "2px solid #F5DC00" }}
            >
              <span style={{ fontSize: "16px" }}>⬇️</span>
              {installLoading ? "자동 설치 파일 준비 중..." : "PC 에이전트 자동 설치"}
            </button>
            {installMessage && (
              <p className="mt-2 text-xs" style={{ color: "#16A34A" }}>{installMessage}</p>
            )}
            {installError && (
              <p className="mt-2 text-xs" style={{ color: "#DC2626" }}>{installError}</p>
            )}
            {versionInfo?.changelog && (
              <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", color: "#6B7280" }}>
                <span className="font-medium" style={{ color: "#1A1A1A" }}>변경사항: </span>{versionInfo.changelog}
              </div>
            )}
          </div>

          {/* 토큰 발급 카드 */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold mb-1" style={{ color: "#1A1A1A" }}>에이전트 등록 토큰</h2>
                <p className="text-xs leading-relaxed" style={{ color: "#6B7280" }}>
                  자동 설치가 실패한 경우에만 이 토큰을 사용합니다.
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0" style={{ background: "#F3F4F6", color: "#4B5563" }}>수동 백업</span>
            </div>
            {agentToken ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <code className="flex-1 rounded-lg px-3 py-2.5 text-xs font-mono select-all break-all"
                    style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", color: "#1A1A1A" }}>
                    {agentToken}
                  </code>
                  <button
                    onClick={handleCopyToken}
                    className="shrink-0 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors"
                    style={{ background: tokenCopied ? "#22c55e" : "#FFE812", color: tokenCopied ? "#fff" : "#3C1E1E", border: tokenCopied ? "1px solid #16a34a" : "1px solid #F5DC00" }}
                  >
                    {tokenCopied ? "복사됨" : "복사"}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs" style={{ color: "#6B7280" }}>자동 설치가 실패하면 위 토큰을 입력하세요.</p>
                  <button onClick={handleGenerateToken} disabled={tokenLoading} className="text-xs underline" style={{ color: "#6B7280" }}>
                    {tokenLoading ? "발급 중..." : "토큰 재발급"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGenerateToken}
                disabled={tokenLoading}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#FFE812", color: "#3C1E1E", border: "2px solid #F5DC00" }}
              >
                {tokenLoading ? "발급 중..." : "토큰 발급하기"}
              </button>
            )}
            {tokenError && (
              <p className="mt-2 text-xs" style={{ color: "#DC2626" }}>{tokenError}</p>
            )}
          </div>

          {/* 설치 가이드 */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "#1A1A1A" }}>설치 가이드</h2>
            <div className="space-y-4">
              {[
                {
                  step: 1,
                  title: "자동 설치 파일 다운로드",
                  desc: "위 버튼을 클릭하면 계정에 연결된 1회용 설치 파일이 생성됩니다.",
                  icon: "⬇️",
                },
                {
                  step: 2,
                  title: "카카오톡 PC 로그인",
                  desc: "카카오톡 PC 버전을 실행하고 계정에 로그인합니다.",
                  icon: "💬",
                },
                {
                  step: 3,
                  title: "EXE 실행",
                  desc: "다운로드한 kakaobot-setup.exe를 더블클릭하여 실행합니다.",
                  icon: "▶️",
                },
                {
                  step: 4,
                  title: "연결 확인",
                  desc: "EXE를 실행하면 토큰 입력 없이 서버와 자동 연결됩니다.",
                  icon: "🔑",
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#FFF9DB", color: "#3C1E1E" }}>
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#1A1A1A" }}>
                      {item.icon} {item.title}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: "#6B7280" }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 시스템 요구사항 */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>시스템 요구사항</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: "🪟", label: "운영체제", value: "Windows 10 이상" },
                { icon: "💬", label: "카카오톡", value: "PC 버전 최신" },
                { icon: "💾", label: "디스크", value: "100MB 이상" },
              ].map((req) => (
                <div key={req.label} className="rounded-lg p-3 text-center" style={{ background: "#FAFAFA", border: "1px solid #E5E7EB" }}>
                  <div className="text-2xl mb-1">{req.icon}</div>
                  <p className="text-xs font-medium mb-0.5" style={{ color: "#6B7280" }}>{req.label}</p>
                  <p className="text-xs font-semibold" style={{ color: "#1A1A1A" }}>{req.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>수동 다운로드</h2>
            <a
              href={manualDownloadUrl}
              download="kakaobot-setup.exe"
              className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "#F3F4F6", color: "#374151", border: "1px solid #D1D5DB" }}
            >
              일반 설치 파일 다운로드
            </a>
          </div>

          {/* FAQ */}
          <div className="rounded-xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>자주 묻는 질문</h2>
            </div>
            <div className="divide-y" style={{ borderColor: "#E5E7EB" }}>
              {FAQ_ITEMS.map((item, idx) => (
                <div key={idx}>
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="text-xs font-medium" style={{ color: "#1A1A1A" }}>{item.q}</span>
                    <span className="text-xs shrink-0 ml-2" style={{ color: "#9CA3AF", transform: openFaq === idx ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
                  </button>
                  {openFaq === idx && (
                    <div className="px-5 pb-4">
                      <p className="text-xs leading-relaxed" style={{ color: "#6B7280" }}>{item.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pb-6" />
        </div>
      </div>
    </div>
  );
}
