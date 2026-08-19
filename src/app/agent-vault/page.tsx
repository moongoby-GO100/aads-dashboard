"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type CredentialMetadata = {
  source?: string;
  service_name?: string;
  target_url?: string;
  project?: string;
  owner?: string;
  auth_type?: string;
  policy?: string;
  tags?: string[];
  verification_status?: string;
  last_verified_at?: string | null;
};

type VaultCredential = {
  id: string;
  work_key: string;
  origin: string;
  label: string;
  username: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  metadata?: CredentialMetadata;
};

type AccessLog = {
  id: string;
  credential_id?: string | null;
  work_key?: string | null;
  origin?: string | null;
  action?: string | null;
  status?: string | null;
  actor_user_id?: string | null;
  created_at?: string;
  metadata?: Record<string, unknown>;
};

type ImportRow = {
  id: string;
  url: string;
  origin: string;
  username: string;
  password: string;
  label: string;
  selected: boolean;
  status: "ready" | "saved" | "failed";
  error?: string;
};

type EditCredentialForm = {
  work_key: string;
  origin: string;
  label: string;
  service_name: string;
  target_url: string;
  project: string;
  owner: string;
  username: string;
  password: string;
  auth_type: string;
  policy: string;
  tags: string;
};

const WORK_KEYS = ["aads-ceo-browser", "food-delivery", "finance-admin", "go100-research", "kis-trading", "ntv2-admin"];
const PROJECTS = ["AADS", "FOOD", "SF", "KIS", "GO100", "NTV2", "NAS"];
const AUTH_TYPES = [
  { value: "password", label: "비밀번호" },
  { value: "passkey", label: "Passkey/OS 위임" },
  { value: "mfa", label: "MFA/사람 승인" },
  { value: "manual", label: "수동 로그인" },
];
const POLICIES = [
  { value: "ask", label: "매번 승인", tone: "#fef3c7", color: "#a16207" },
  { value: "allow", label: "자동 허용", tone: "#dcfce7", color: "#15803d" },
  { value: "deny", label: "항상 차단", tone: "#fee2e2", color: "#b91c1c" },
];

function getInitialWorkKey(): string {
  if (typeof window === "undefined") return "aads-ceo-browser";
  return new URLSearchParams(window.location.search).get("work_key") || "aads-ceo-browser";
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).origin;
  } catch {
    return trimmed;
  }
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function policyStyle(policy?: string): React.CSSProperties {
  const item = POLICIES.find((candidate) => candidate.value === policy) || POLICIES[0];
  return { background: item.tone, color: item.color };
}

function policyLabel(policy?: string): string {
  return POLICIES.find((candidate) => candidate.value === policy)?.label || "매번 승인";
}

function maskUsername(value: string): string {
  if (!value) return "-";
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  if (value.length <= 4) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function credentialToEditForm(credential?: VaultCredential | null): EditCredentialForm {
  return {
    work_key: credential?.work_key || "aads-ceo-browser",
    origin: credential?.origin || "",
    label: credential?.label || "default",
    service_name: credential?.metadata?.service_name || credential?.label || "",
    target_url: credential?.metadata?.target_url || credential?.origin || "",
    project: credential?.metadata?.project || "AADS",
    owner: credential?.metadata?.owner || "CEO",
    username: credential?.username || "",
    password: "",
    auth_type: credential?.metadata?.auth_type || "password",
    policy: credential?.metadata?.policy || "ask",
    tags: credential?.metadata?.tags?.join(",") || "",
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function makeImportRows(text: string): ImportRow[] {
  const rows = parseCsv(text).filter((row) => row.some((value) => value.trim()));
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const urlIndex = headers.indexOf("url");
  const usernameIndex = headers.indexOf("username");
  const passwordIndex = headers.indexOf("password");
  const nameIndex = headers.findIndex((header) => ["name", "title", "service", "label"].includes(header));

  if (urlIndex < 0 || usernameIndex < 0 || passwordIndex < 0) return [];

  return rows.slice(1).map((row, index) => {
    const url = (row[urlIndex] || "").trim();
    const username = (row[usernameIndex] || "").trim();
    const password = row[passwordIndex] || "";
    const origin = normalizeOrigin(url);
    const hostLabel = origin.replace(/^https?:\/\//, "") || `Google CSV ${index + 1}`;
    const labelValue = (nameIndex >= 0 ? row[nameIndex] : "")?.trim() || hostLabel;
    return {
      id: `${index}-${origin}-${username}`,
      url,
      origin,
      username,
      password,
      label: labelValue.slice(0, 120),
      selected: Boolean(origin && username && password),
      status: "ready" as const,
    };
  }).filter((row) => row.origin && row.username && row.password);
}

export default function AgentVaultPage() {
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [workKey, setWorkKey] = useState(getInitialWorkKey);
  const [originFilter, setOriginFilter] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://aads.newtalk.kr/login");
  const [origin, setOrigin] = useState("https://aads.newtalk.kr");
  const [label, setLabel] = useState("대표 계정");
  const [serviceName, setServiceName] = useState("OHVIS");
  const [project, setProject] = useState("AADS");
  const [owner, setOwner] = useState("CEO");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authType, setAuthType] = useState("password");
  const [policy, setPolicy] = useState("ask");
  const [tags, setTags] = useState("admin,agent");
  const [activeTab, setActiveTab] = useState<"accounts" | "new" | "import" | "logs">("accounts");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditCredentialForm>(() => credentialToEditForm(null));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(
    () => credentials.find((credential) => credential.id === selectedId) || credentials[0],
    [credentials, selectedId],
  );
  const filteredCredentials = useMemo(
    () => credentials.filter((credential) => !originFilter || credential.origin.includes(originFilter)),
    [credentials, originFilter],
  );
  const activeCount = credentials.filter((credential) => credential.is_active !== false).length;
  const askCount = credentials.filter((credential) => (credential.metadata?.policy || "ask") === "ask").length;
  const recentUseCount = logs.filter((log) => {
    if (!log.created_at) return false;
    return Date.now() - new Date(log.created_at).getTime() <= 24 * 60 * 60 * 1000;
  }).length;
  const selectedImportCount = importRows.filter((row) => row.selected && row.status !== "saved").length;

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [credentialRes, logRes] = await Promise.all([
        api.getAgentVaultCredentials({ work_key: workKey || undefined, origin: originFilter || undefined }),
        api.getAgentVaultAccessLogs({ limit: 50 }),
      ]);
      const credentialData = credentialRes as { credentials?: VaultCredential[] };
      const logData = logRes as { logs?: AccessLog[] };
      const nextCredentials = Array.isArray(credentialData.credentials) ? credentialData.credentials : [];
      setCredentials(nextCredentials);
      setLogs(Array.isArray(logData.logs) ? logData.logs : []);
      setSelectedId((current) => current || nextCredentials[0]?.id || null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workKey]);

  useEffect(() => {
    setEditForm(credentialToEditForm(selected));
  }, [selected]);

  const applyOrigin = () => {
    const nextOrigin = normalizeOrigin(targetUrl);
    setOrigin(nextOrigin);
    if (!serviceName && nextOrigin) setServiceName(nextOrigin.replace(/^https?:\/\//, ""));
  };

  const saveCredential = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const normalizedOrigin = normalizeOrigin(origin || targetUrl);
      await api.saveAgentVaultCredential({
        work_key: workKey,
        origin: normalizedOrigin,
        label,
        username,
        password,
        metadata: {
          source: "agent-vault-ui",
          service_name: serviceName,
          target_url: targetUrl,
          project,
          owner,
          auth_type: authType,
          policy,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          verification_status: "unverified",
          last_verified_at: null,
        },
      });
      setPassword("");
      setOrigin(normalizedOrigin);
      setNotice("계정이 저장되었습니다. 원문 비밀번호는 목록에 표시하지 않고 autofill 토큰으로만 사용됩니다.");
      setActiveTab("accounts");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const updateEditForm = <K extends keyof EditCredentialForm>(field: K, value: EditCredentialForm[K]) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const updateCredential = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const normalizedOrigin = normalizeOrigin(editForm.origin || editForm.target_url);
      const payload: {
        work_key: string;
        origin: string;
        label: string;
        username: string;
        password?: string;
        metadata: Record<string, unknown>;
      } = {
        work_key: editForm.work_key,
        origin: normalizedOrigin,
        label: editForm.label,
        username: editForm.username,
        metadata: {
          ...selected.metadata,
          source: selected.metadata?.source || "agent-vault-ui",
          service_name: editForm.service_name,
          target_url: editForm.target_url,
          project: editForm.project,
          owner: editForm.owner,
          auth_type: editForm.auth_type,
          policy: editForm.policy,
          tags: editForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          verification_status: selected.metadata?.verification_status || "unverified",
          last_verified_at: selected.metadata?.last_verified_at || null,
        },
      };
      if (editForm.password.trim()) payload.password = editForm.password;
      await api.updateAgentVaultCredential(selected.id, payload);
      setNotice(editForm.password.trim() ? "계정 정보와 비밀번호가 수정되었습니다." : "계정 정보가 수정되었습니다.");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const disableCredential = async (credentialId: string, hard = false) => {
    const message = hard
      ? "이 계정을 영구 삭제하시겠습니까? 저장된 비밀번호와 autofill 토큰도 함께 제거됩니다."
      : "이 계정을 비활성화하시겠습니까?";
    if (!window.confirm(message)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.disableAgentVaultCredential(credentialId, { hard });
      setNotice(hard ? "계정이 영구 삭제되었습니다." : "계정이 비활성화되었습니다.");
      setSelectedId(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadGoogleCsv = async (file?: File | null) => {
    setError(null);
    setNotice(null);
    setImportRows([]);
    setImportFileName(file?.name || "");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Google Password Manager에서 내보낸 CSV 파일만 가져올 수 있습니다.");
      return;
    }
    const text = await file.text();
    const rows = makeImportRows(text);
    if (rows.length === 0) {
      setError('CSV 첫 줄에 "url,username,password" 컬럼이 있어야 합니다.');
      return;
    }
    setImportRows(rows);
    setNotice(`${rows.length}개 계정을 읽었습니다. 저장할 항목을 확인한 뒤 가져오기를 실행하십시오.`);
  };

  const toggleImportRow = (id: string) => {
    setImportRows((rows) => rows.map((row) => row.id === id ? { ...row, selected: !row.selected } : row));
  };

  const toggleAllImportRows = (checked: boolean) => {
    setImportRows((rows) => rows.map((row) => row.status === "saved" ? row : { ...row, selected: checked }));
  };

  const importSelectedRows = async () => {
    setImportBusy(true);
    setError(null);
    setNotice(null);
    let saved = 0;
    let failed = 0;
    const nextRows = [...importRows];
    try {
      for (let index = 0; index < nextRows.length; index += 1) {
        const row = nextRows[index];
        if (!row.selected || row.status === "saved") continue;
        try {
          await api.saveAgentVaultCredential({
            work_key: workKey,
            origin: row.origin,
            label: row.label,
            username: row.username,
            password: row.password,
            metadata: {
              source: "google-password-manager-csv",
              service_name: row.label,
              target_url: row.url,
              project,
              owner,
              auth_type: "password",
              policy,
              tags: ["google-password-manager", "imported"],
              verification_status: "unverified",
              last_verified_at: null,
            },
          });
          nextRows[index] = { ...row, status: "saved", selected: false, error: undefined };
          saved += 1;
        } catch (e) {
          nextRows[index] = { ...row, status: "failed", error: String(e) };
          failed += 1;
        }
        setImportRows([...nextRows]);
      }
      setNotice(`Google Password Manager CSV 가져오기 완료: 저장 ${saved}건, 실패 ${failed}건`);
      await refresh();
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6" style={{ color: "var(--text-primary)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔐</span>
            <div>
              <h1 className="text-xl font-bold">Agent Vault</h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                계정 등록, 에이전트 autofill 정책, 접근 로그를 관리합니다.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/browser-tasks"
            className="rounded border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Managed Browser
          </Link>
          <button
            onClick={refresh}
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border px-4 py-3 text-sm" style={{ borderColor: "#fca5a5", color: "#b91c1c", background: "#fee2e2" }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded border px-4 py-3 text-sm" style={{ borderColor: "#86efac", color: "#15803d", background: "#dcfce7" }}>
          {notice}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["총 계정", credentials.length],
          ["활성 계정", activeCount],
          ["승인 필요", askCount],
          ["24시간 사용", recentUseCount],
        ].map(([title, value]) => (
          <section key={title} className="rounded-lg border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{title}</div>
            <div className="mt-2 text-2xl font-bold">{value}</div>
          </section>
        ))}
      </div>

      <section className="rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap gap-2">
            {[
              ["accounts", "계정"],
              ["new", "새 계정 등록"],
              ["import", "Google CSV 가져오기"],
              ["logs", "접근 로그"],
            ].map(([id, labelText]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as "accounts" | "new" | "import" | "logs")}
                className="rounded px-3 py-2 text-sm font-medium"
                style={activeTab === id ? { background: "var(--accent)", color: "#fff" } : { background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                {labelText}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded border px-3 py-2 text-sm"
              value={workKey}
              onChange={(e) => setWorkKey(e.target.value)}
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              {WORK_KEYS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="origin 필터"
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") refresh(); }}
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            />
          </div>
        </div>

        {activeTab === "accounts" && (
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead style={{ color: "var(--text-secondary)" }}>
                  <tr className="text-left">
                    <th className="px-4 py-3">서비스</th>
                    <th className="px-4 py-3">계정</th>
                    <th className="px-4 py-3">Work key</th>
                    <th className="px-4 py-3">정책</th>
                    <th className="px-4 py-3">인증</th>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">갱신</th>
                    <th className="px-4 py-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCredentials.map((credential) => (
                    <tr
                      key={credential.id}
                      className="border-t"
                      style={{ borderColor: "var(--border)", background: selected?.id === credential.id ? "var(--bg-hover)" : undefined }}
                    >
                      <td className="px-4 py-3">
                        <button className="text-left" onClick={() => setSelectedId(credential.id)}>
                          <div className="font-medium">{credential.metadata?.service_name || credential.label}</div>
                          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{credential.origin}</div>
                        </button>
                      </td>
                      <td className="px-4 py-3">{maskUsername(credential.username)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{credential.work_key}</td>
                      <td className="px-4 py-3">
                        <span className="rounded px-2 py-1 text-xs font-medium" style={policyStyle(credential.metadata?.policy)}>
                          {policyLabel(credential.metadata?.policy)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{credential.metadata?.auth_type || "password"}</td>
                      <td className="px-4 py-3">{credential.is_active === false ? "disabled" : credential.metadata?.verification_status || "active"}</td>
                      <td className="px-4 py-3">{formatTime(credential.updated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={busy}
                            onClick={() => setSelectedId(credential.id)}
                            className="rounded px-3 py-1.5 text-sm disabled:opacity-50"
                            style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                          >
                            수정
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => disableCredential(credential.id)}
                            className="rounded px-3 py-1.5 text-sm disabled:opacity-50"
                            style={{ background: "#fee2e2", color: "#b91c1c" }}
                          >
                            비활성화
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredCredentials.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center" style={{ color: "var(--text-secondary)" }}>
                        등록된 계정이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <aside className="border-t p-4 xl:border-l xl:border-t-0" style={{ borderColor: "var(--border)" }}>
              <h2 className="font-semibold">계정 수정</h2>
              {selected ? (
                <div className="mt-4 space-y-3 text-sm">
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>서비스명</span>
                    <input className="w-full rounded border px-3 py-2" value={editForm.service_name} onChange={(e) => updateEditForm("service_name", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>계정 라벨</span>
                    <input className="w-full rounded border px-3 py-2" value={editForm.label} onChange={(e) => updateEditForm("label", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Origin</span>
                    <input className="w-full rounded border px-3 py-2 font-mono text-xs" value={editForm.origin} onChange={(e) => updateEditForm("origin", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>로그인 페이지 URL</span>
                    <input className="w-full rounded border px-3 py-2" value={editForm.target_url} onChange={(e) => updateEditForm("target_url", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Work key</span>
                    <select className="w-full rounded border px-3 py-2" value={editForm.work_key} onChange={(e) => updateEditForm("work_key", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      {WORK_KEYS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>프로젝트</span>
                    <select className="w-full rounded border px-3 py-2" value={editForm.project} onChange={(e) => updateEditForm("project", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      {PROJECTS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>책임자</span>
                    <input className="w-full rounded border px-3 py-2" value={editForm.owner} onChange={(e) => updateEditForm("owner", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>아이디/이메일</span>
                    <input className="w-full rounded border px-3 py-2" value={editForm.username} onChange={(e) => updateEditForm("username", e.target.value)} autoComplete="username" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>새 비밀번호</span>
                    <input className="w-full rounded border px-3 py-2" type="password" value={editForm.password} onChange={(e) => updateEditForm("password", e.target.value)} autoComplete="new-password" placeholder="비워두면 기존 값 유지" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>인증 방식</span>
                    <select className="w-full rounded border px-3 py-2" value={editForm.auth_type} onChange={(e) => updateEditForm("auth_type", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      {AUTH_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>사용 정책</span>
                    <select className="w-full rounded border px-3 py-2" value={editForm.policy} onChange={(e) => updateEditForm("policy", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      {POLICIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>태그</span>
                    <input className="w-full rounded border px-3 py-2" value={editForm.tags} onChange={(e) => updateEditForm("tags", e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  </label>
                  <div className="rounded border p-3 text-xs leading-5" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                    원문 비밀번호는 표시하지 않습니다. 삭제는 복구 가능한 비활성화가 기본이며, 영구 삭제는 저장된 비밀번호와 미사용 autofill 토큰을 함께 제거합니다.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={busy || !editForm.work_key || !editForm.origin || !editForm.username}
                      onClick={updateCredential}
                      className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      수정 저장
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => disableCredential(selected.id)}
                      className="rounded px-3 py-2 text-sm disabled:opacity-50"
                      style={{ background: "#fef3c7", color: "#a16207" }}
                    >
                      비활성화
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => disableCredential(selected.id, true)}
                      className="rounded px-3 py-2 text-sm disabled:opacity-50"
                      style={{ background: "#fee2e2", color: "#b91c1c" }}
                    >
                      영구 삭제
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>계정을 선택하면 상세 정보가 표시됩니다.</p>
              )}
            </aside>
          </div>
        )}

        {activeTab === "new" && (
          <div className="grid gap-6 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>로그인 페이지 URL</span>
                <div className="flex gap-2">
                  <input className="w-full rounded border px-3 py-2" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
                  <button type="button" onClick={applyOrigin} className="rounded px-3 py-2 font-medium" style={{ background: "var(--bg-hover)" }}>정규화</button>
                </div>
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>Origin</span>
                <input className="w-full rounded border px-3 py-2 font-mono text-xs" value={origin} onChange={(e) => setOrigin(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>서비스명</span>
                <input className="w-full rounded border px-3 py-2" value={serviceName} onChange={(e) => setServiceName(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>계정 라벨</span>
                <input className="w-full rounded border px-3 py-2" value={label} onChange={(e) => setLabel(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>프로젝트</span>
                <select className="w-full rounded border px-3 py-2" value={project} onChange={(e) => setProject(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                  {PROJECTS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>책임자</span>
                <input className="w-full rounded border px-3 py-2" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>아이디/이메일</span>
                <input className="w-full rounded border px-3 py-2" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>비밀번호</span>
                <input className="w-full rounded border px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>인증 방식</span>
                <select className="w-full rounded border px-3 py-2" value={authType} onChange={(e) => setAuthType(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                  {AUTH_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>사용 정책</span>
                <select className="w-full rounded border px-3 py-2" value={policy} onChange={(e) => setPolicy(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                  {POLICIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm md:col-span-2">
                <span style={{ color: "var(--text-secondary)" }}>태그</span>
                <input className="w-full rounded border px-3 py-2" value={tags} onChange={(e) => setTags(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
              </label>
              <div className="md:col-span-2">
                <button
                  disabled={busy || !workKey || !origin || !username || !password}
                  onClick={saveCredential}
                  className="rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  계정 저장
                </button>
              </div>
            </div>
            <aside className="rounded border p-4 text-sm leading-6" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
              <h2 className="font-semibold">저장 정책</h2>
              <p className="mt-3" style={{ color: "var(--text-secondary)" }}>
                Chrome/1Password/Aside 벤치마크 기준으로 원문 비밀번호는 저장 후 화면에 다시 표시하지 않습니다.
                Agent는 승인된 origin/work_key 범위에서만 일회성 autofill 토큰을 받아 사용합니다.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5" style={{ color: "var(--text-secondary)" }}>
                <li>Passkey, OTP, CAPTCHA는 자동 저장/우회 대상이 아닙니다.</li>
                <li>결제, 비밀번호 변경, 계정 삭제는 항상 사람 승인 대상입니다.</li>
                <li>메모에는 비밀번호, OTP, API key를 입력하지 마십시오.</li>
              </ul>
            </aside>
          </div>
        )}

        {activeTab === "import" && (
          <div className="space-y-4 p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                <h2 className="font-semibold">Google Password Manager CSV 가져오기</h2>
                <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
                  Google 계정 비밀번호관리자는 제3자 API로 직접 비밀번호를 내보내지 않습니다. Chrome 또는 passwords.google.com에서
                  CSV를 직접 다운로드한 뒤 이 화면에서 선택 저장하십시오. CSV 원문은 서버에 파일로 업로드하지 않고, 선택한 항목만 Vault API로 저장합니다.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>저장 work_key</span>
                    <select className="w-full rounded border px-3 py-2" value={workKey} onChange={(e) => setWorkKey(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      {WORK_KEYS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>기본 정책</span>
                    <select className="w-full rounded border px-3 py-2" value={policy} onChange={(e) => setPolicy(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      {POLICIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm md:col-span-2">
                    <span style={{ color: "var(--text-secondary)" }}>CSV 파일</span>
                    <input
                      className="w-full rounded border px-3 py-2 text-sm"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => loadGoogleCsv(event.target.files?.[0])}
                      style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                    />
                    {importFileName && <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>{importFileName}</span>}
                  </label>
                </div>
              </section>

              <aside className="rounded border p-4 text-sm leading-6" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                <h2 className="font-semibold">내보내기 절차</h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5" style={{ color: "var(--text-secondary)" }}>
                  <li>Chrome에서 비밀번호 및 자동완성 메뉴의 Google Password Manager 설정을 엽니다.</li>
                  <li>Export passwords에서 CSV 파일을 다운로드합니다.</li>
                  <li>이 화면에서 CSV를 읽고 저장할 항목만 선택합니다.</li>
                  <li>가져오기 후 PC에 남은 CSV 파일은 삭제하십시오.</li>
                </ol>
              </aside>
            </div>

            <section className="rounded border" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
                <div>
                  <h2 className="font-semibold">미리보기</h2>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>비밀번호 원문은 미리보기 표에 표시하지 않습니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <input type="checkbox" checked={importRows.length > 0 && selectedImportCount === importRows.filter((row) => row.status !== "saved").length} onChange={(event) => toggleAllImportRows(event.target.checked)} />
                    전체 선택
                  </label>
                  <button
                    disabled={importBusy || selectedImportCount === 0}
                    onClick={importSelectedRows}
                    className="rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    선택 {selectedImportCount}건 가져오기
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead style={{ color: "var(--text-secondary)" }}>
                    <tr className="text-left">
                      <th className="px-4 py-3">선택</th>
                      <th className="px-4 py-3">서비스</th>
                      <th className="px-4 py-3">Origin</th>
                      <th className="px-4 py-3">계정</th>
                      <th className="px-4 py-3">비밀번호</th>
                      <th className="px-4 py-3">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row) => (
                      <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={row.selected} disabled={row.status === "saved" || importBusy} onChange={() => toggleImportRow(row.id)} />
                        </td>
                        <td className="px-4 py-3">{row.label}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.origin}</td>
                        <td className="px-4 py-3">{maskUsername(row.username)}</td>
                        <td className="px-4 py-3">저장 시 암호화</td>
                        <td className="px-4 py-3">{row.status === "failed" ? row.error || "failed" : row.status}</td>
                      </tr>
                    ))}
                    {importRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "var(--text-secondary)" }}>
                          CSV 파일을 선택하면 저장 전 미리보기가 표시됩니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === "logs" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead style={{ color: "var(--text-secondary)" }}>
                <tr className="text-left">
                  <th className="px-4 py-3">시간</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Origin</th>
                  <th className="px-4 py-3">Work key</th>
                  <th className="px-4 py-3">Actor</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">{formatTime(log.created_at)}</td>
                    <td className="px-4 py-3">{log.action || "-"}</td>
                    <td className="px-4 py-3">{log.status || "-"}</td>
                    <td className="px-4 py-3">{log.origin || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.work_key || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.actor_user_id || "-"}</td>
                  </tr>
                ))}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "var(--text-secondary)" }}>
                      접근 로그가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
