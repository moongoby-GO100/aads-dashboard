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
    a: "WebSocket 연결을 확인해주세요. 방화벽에서 포트 8080이 열려 있는지 확인하고, 에이전트 토큰이 올바르게 입력되었는지 다시 확인해 주세요.",
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

  useEffect(() => {
    fetch(`${API}/kakao-bot/agent/version`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setVersionInfo(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const downloadUrl = `${API}/kakao-bot/agent/download-exe`;

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
            <a
              href={downloadUrl}
              download="kakaobot-setup.exe"
              className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "#FFE812", color: "#3C1E1E", border: "2px solid #F5DC00" }}
            >
              <span style={{ fontSize: "16px" }}>⬇️</span>
              PC 에이전트 다운로드
            </a>
            {versionInfo?.changelog && (
              <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", color: "#6B7280" }}>
                <span className="font-medium" style={{ color: "#1A1A1A" }}>변경사항: </span>{versionInfo.changelog}
              </div>
            )}
          </div>

          {/* 설치 가이드 */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "#1A1A1A" }}>설치 가이드</h2>
            <div className="space-y-4">
              {[
                {
                  step: 1,
                  title: "에이전트 다운로드",
                  desc: "위 다운로드 버튼을 클릭하여 EXE 설치 파일을 저장합니다.",
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
                  title: "토큰 입력 후 연결 확인",
                  desc: "EXE 실행 창에 아래 에이전트 등록 섹션에서 발급받은 토큰을 입력하면 서버와 자동 연결됩니다.",
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
