"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

interface AndroidManifest {
  name: string;
  package: string;
  version: string;
  server_ws_base_url: string;
  install_page_url: string;
  apk_download_url: string;
  source_zip_url: string;
  apk_available: boolean;
  apk_size: number;
  source_file_count: number;
}

interface DeviceInfo {
  agent_id: string;
  hostname?: string;
  device_type?: string;
  status?: string;
  connected_at?: string;
  last_heartbeat?: string;
  capabilities?: string[];
}

interface PairingResponse {
  agent_id: string;
  device_type: string;
  expires_at: string;
  pairing_payload: Record<string, unknown>;
  full_ws_url: string;
  install_page_url: string;
  apk_download_url: string;
  note?: string;
}

function formatBytes(value: number): string {
  if (!value) return "-";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function toKst(value?: string): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour12: false,
    });
  } catch {
    return value;
  }
}

function resolveApiUrl(pathOrUrl?: string): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${BASE_URL.replace(/\/$/, "")}${pathOrUrl.startsWith("/") ? pathOrUrl.replace(/^\/api\/v1/, "") : `/${pathOrUrl}`}`;
}

export default function MobileAgentPage() {
  const [manifest, setManifest] = useState<AndroidManifest | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [label, setLabel] = useState("CEO phone");
  const [agentId, setAgentId] = useState("");
  const [expiresHours, setExpiresHours] = useState(24);
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const connectedAndroidDevices = useMemo(
    () => devices.filter((device) => (device.device_type || "").toLowerCase() === "android"),
    [devices],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [manifestRes, devicesRes] = await Promise.allSettled([
        api.getAndroidAgentManifest(),
        api.getDevices("android"),
      ]);
      if (manifestRes.status === "fulfilled") setManifest(manifestRes.value as AndroidManifest);
      if (devicesRes.status === "fulfilled") {
        const value = devicesRes.value as { devices?: DeviceInfo[] } | DeviceInfo[];
        const list = Array.isArray(value) ? value : value.devices || [];
        setDevices(Array.isArray(list) ? list : []);
      }
      const failed = [manifestRes, devicesRes].find((item) => item.status === "rejected") as PromiseRejectedResult | undefined;
      setError(failed ? String(failed.reason) : null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const openDownload = () => {
    const url = resolveApiUrl(manifest?.apk_download_url || "/devices/android/download");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openInstallPage = () => {
    const url = resolveApiUrl(manifest?.install_page_url || "/devices/android/install");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const createPairing = async () => {
    setPairingLoading(true);
    setError(null);
    setCopied(null);
    try {
      const res = await api.createAndroidPairing({
        agent_id: agentId.trim() || undefined,
        label: label.trim() || "Android phone",
        expires_hours: expiresHours,
      });
      setPairing(res as PairingResponse);
    } catch (e) {
      setError(String(e));
    } finally {
      setPairingLoading(false);
    }
  };

  const copyText = async (name: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(name);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
  } as const;

  const pairingJson = pairing ? JSON.stringify(pairing.pairing_payload, null, 2) : "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header title="Android Agent 설치" />
      <main style={{ padding: "24px 16px", maxWidth: 1120, margin: "0 auto", color: "var(--text-primary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Android Agent 설치</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>APK 다운로드와 페어링 토큰 발급을 한 화면에서 처리합니다.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={openDownload}
              disabled={manifest ? !manifest.apk_available : loading}
              style={{
                background: manifest?.apk_available ? "var(--accent)" : "var(--bg-tertiary)",
                color: manifest?.apk_available ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 700,
                cursor: manifest?.apk_available ? "pointer" : "not-allowed",
              }}
            >
              APK 다운로드
            </button>
            <button
              type="button"
              onClick={openInstallPage}
              style={{
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              설치 페이지 열기
            </button>
          </div>
        </div>

        {error && (
          <div style={{ ...cardStyle, marginBottom: 16, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13 }}>
            {error}
          </div>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div style={cardStyle}>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 8 }}>APK 상태</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: manifest?.apk_available ? "var(--success)" : "var(--danger)" }}>
              {loading ? "확인 중" : manifest?.apk_available ? "준비됨" : "미빌드"}
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 6 }}>{formatBytes(manifest?.apk_size || 0)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 8 }}>앱 버전</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{manifest?.version || "-"}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 6 }}>{manifest?.package || "-"}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 8 }}>연결 단말</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{connectedAndroidDevices.length}대</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 6 }}>5초마다 갱신</div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="mobile-agent-grid">
          <div style={cardStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>페어링 생성</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                단말 라벨
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                Agent ID
                <input
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="비우면 자동 생성"
                  style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                유효 시간
                <select
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(Number(e.target.value))}
                  style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}
                >
                  <option value={6}>6시간</option>
                  <option value={24}>24시간</option>
                  <option value={72}>3일</option>
                  <option value={168}>7일</option>
                </select>
              </label>
              <button
                type="button"
                onClick={createPairing}
                disabled={pairingLoading}
                style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "11px 14px", fontSize: 14, fontWeight: 800, cursor: pairingLoading ? "wait" : "pointer" }}
              >
                {pairingLoading ? "생성 중..." : "페어링 토큰 생성"}
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>앱 입력값</h2>
            {pairing ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => copyText("json", pairingJson)}
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
                  >
                    JSON 복사
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText("url", pairing.full_ws_url)}
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
                  >
                    URL 복사
                  </button>
                  <span style={{ color: "var(--success)", fontSize: 13, alignSelf: "center" }}>{copied ? "복사됨" : ""}</span>
                </div>
                <pre style={{ margin: 0, padding: 12, borderRadius: 8, overflowX: "auto", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 12 }}>
                  {pairingJson}
                </pre>
                <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>만료: {toKst(pairing.expires_at)}</div>
              </div>
            ) : (
              <div style={{ color: "var(--text-secondary)", fontSize: 13, minHeight: 120, display: "flex", alignItems: "center" }}>
                페어링 토큰을 생성하면 앱에 붙여 넣을 값이 표시됩니다.
              </div>
            )}
          </div>
        </section>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800 }}>연결된 Android 단말</h2>
            <button
              type="button"
              onClick={load}
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontSize: 12 }}
            >
              새로고침
            </button>
          </div>
          {connectedAndroidDevices.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>현재 연결된 Android Agent가 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {connectedAndroidDevices.map((device) => (
                <div key={device.agent_id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-primary)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{device.hostname || device.agent_id}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 12, display: "grid", gap: 4 }}>
                    <span>ID: <span style={{ fontFamily: "monospace" }}>{device.agent_id}</span></span>
                    <span>상태: {device.status || "connected"}</span>
                    <span>하트비트: {toKst(device.last_heartbeat)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <style jsx>{`
        @media (max-width: 820px) {
          .mobile-agent-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
