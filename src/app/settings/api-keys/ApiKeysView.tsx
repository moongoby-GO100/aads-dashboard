import type { CSSProperties } from "react";
import type { UserApiKeyItem } from "@/lib/api";

export type ConnectMethod = "api" | "cli";
export type StatusKind = "ok" | "error";
export interface StatusMessage { kind: StatusKind; text: string }

export interface ProviderOption {
  value: string;
  label: string;
  keyHint: string;
  issueUrl: string;
  issueLabel: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { value: "anthropic", label: "Anthropic Claude", keyHint: "sk-ant- 로 시작하는 긴 문자열", issueUrl: "https://console.anthropic.com/settings/keys", issueLabel: "Anthropic Console > API Keys" },
  { value: "openai", label: "OpenAI", keyHint: "sk- 로 시작하는 긴 문자열", issueUrl: "https://platform.openai.com/api-keys", issueLabel: "OpenAI Platform > API keys" },
  { value: "gemini", label: "Google Gemini", keyHint: "AIza 로 시작하는 약 39자 문자열", issueUrl: "https://aistudio.google.com/apikey", issueLabel: "Google AI Studio > API 키" },
  { value: "dashscope", label: "Alibaba Qwen (dashscope)", keyHint: "sk- 로 시작하는 문자열", issueUrl: "https://dashscope.console.aliyun.com/apiKey", issueLabel: "Alibaba DashScope > API-KEY" },
];

export const CLI_OPTIONS = [
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "gemini_cli", label: "Gemini CLI / Antigravity(agy)" },
];

export const EMPTY_LIST_TEXT = "아직 등록한 키가 없습니다. 지금은 오비스 공용 계정으로 동작합니다 — 내 키를 등록하면 그 키가 먼저 쓰입니다.";
export const GEMINI_WARNING = "Google API는 결제 계정이 없으면 호출이 실패합니다. 구독이 있으면 'CLI 구독으로 연결'을 쓰세요";
export const CLI_ADMIN_ONLY_TEXT = "관리자 설정 > LLM 관리 > LLM 계정에서 연결";
export const ADMIN_LLM_PATH = "/settings";

export function providerLabel(provider: string): string {
  return PROVIDER_OPTIONS.find((p) => p.value === provider)?.label ?? provider;
}

export function describeTestReason(reason: string | undefined): string {
  if (!reason) return "원인을 알 수 없습니다.";
  if (reason === "invalid_api_key") return "키가 올바르지 않습니다.";
  if (reason === "decrypt_failed") return "저장된 키를 읽지 못했습니다. 다시 등록하십시오.";
  if (reason.startsWith("provider_test_not_supported")) return "이 회사 키는 자동 검증을 지원하지 않습니다.";
  if (reason.startsWith("http_")) return `회사 API가 오류를 응답했습니다 (${reason.slice(5)}).`;
  return "회사 API에 연결하지 못했습니다.";
}

export interface KeyApi {
  createUserApiKey: (data: { provider: string; key: string; display_name?: string }) => Promise<{ id: string }>;
  testUserApiKey: (keyId: string) => Promise<{ ok: boolean; reason: string }>;
}

export interface SaveAndVerifyInput { provider: string; displayName: string; key: string }
export interface SaveAndVerifyResult {
  saved: boolean;
  status: StatusMessage;
  /** 저장 후 입력창에 남길 키 값. 저장되면 빈 문자열 */
  keyValue: string;
}

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export async function verifyKey(api: KeyApi, id: string, label: string): Promise<StatusMessage> {
  try {
    const result = await api.testUserApiKey(id);
    return result.ok
      ? { kind: "ok", text: `${label} 키 검증 성공` }
      : { kind: "error", text: `${label} 키 검증 실패: ${describeTestReason(result.reason)}` };
  } catch (e) {
    return { kind: "error", text: `${label} 키 검증 요청에 실패했습니다: ${errText(e, "알 수 없는 오류")}` };
  }
}

export async function saveAndVerify(api: KeyApi, input: SaveAndVerifyInput): Promise<SaveAndVerifyResult> {
  const plain = input.key.trim();
  if (!plain) return { saved: false, status: { kind: "error", text: "API 키를 입력하십시오." }, keyValue: input.key };
  let created: { id: string };
  try {
    created = await api.createUserApiKey({
      provider: input.provider,
      display_name: input.displayName.trim() || undefined,
      key: plain,
    });
  } catch (e) {
    return { saved: false, status: { kind: "error", text: `저장하지 못했습니다: ${errText(e, "알 수 없는 오류")}` }, keyValue: input.key };
  }
  const verified = await verifyKey(api, created.id, providerLabel(input.provider));
  const status: StatusMessage = verified.kind === "ok"
    ? { kind: "ok", text: `저장했습니다. ${verified.text}` }
    : { kind: "error", text: `저장은 완료했지만 검증에 실패했습니다. ${verified.text}` };
  return { saved: true, status, keyValue: "" };
}

const inputStyle: CSSProperties = { background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" };
const panelStyle: CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 };

function StatusLine({ status, testId }: { status: StatusMessage | null; testId: string }) {
  if (!status) return null;
  const isError = status.kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      data-testid={testId}
      data-status={status.kind}
      className="mt-3 rounded-md px-3 py-2 text-sm"
      style={{
        background: isError ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
        color: isError ? "var(--danger)" : "var(--success)",
      }}
    >
      {status.text}
    </div>
  );
}

export interface ApiKeysViewProps {
  method: ConnectMethod | null;
  onSelectMethod: (method: ConnectMethod | null) => void;
  provider: string;
  onProviderChange: (provider: string) => void;
  keyValue: string;
  onKeyChange: (value: string) => void;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  saving: boolean;
  onSave: () => void;
  formStatus: StatusMessage | null;
  /** true: 관리자 / false: 일반 사용자 / null: 아직 확인 전 */
  isAdmin: boolean | null;
  keys: UserApiKeyItem[];
  loading: boolean;
  /** 삭제·검증 같은 사용자 작업의 결과 */
  listStatus: StatusMessage | null;
  /** 목록 조회 실패. 다음 조회가 시작되면 지워진다 */
  loadError: StatusMessage | null;
  testingId: string;
  onRefresh: () => void;
  onTest: (key: UserApiKeyItem) => void;
  onDelete: (key: UserApiKeyItem) => void;
}

function MethodButton({ selected, title, description, testId, onClick }: {
  selected: boolean; title: string; description: string; testId: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className="rounded-md px-4 py-3 text-left"
      style={{
        minHeight: 44,
        background: selected ? "var(--accent)" : "var(--bg-hover)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        color: selected ? "#fff" : "var(--text-primary)",
      }}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs" style={{ opacity: 0.85 }}>{description}</span>
    </button>
  );
}

function ApiKeyForm(props: ApiKeysViewProps) {
  const option = PROVIDER_OPTIONS.find((p) => p.value === props.provider) ?? PROVIDER_OPTIONS[0];
  return (
    <div data-testid="api-key-form" className="mt-4 space-y-3">
      <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>
        회사
        <select
          data-testid="provider-select"
          value={props.provider}
          onChange={(e) => props.onProviderChange(e.target.value)}
          className="mt-1 block w-full rounded-md px-3 py-2 text-sm md:w-72"
          style={{ ...inputStyle, minHeight: 44 }}
        >
          {PROVIDER_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>

      {props.provider === "gemini" && (
        <div data-testid="gemini-warning" role="alert" className="rounded-md px-3 py-2 text-sm" style={{ background: "rgba(234,179,8,0.14)", color: "var(--text-primary)", border: "1px solid rgba(234,179,8,0.5)" }}>
          <p>{GEMINI_WARNING}</p>
          <button
            type="button"
            data-testid="gemini-switch-cli"
            onClick={() => props.onSelectMethod("cli")}
            className="mt-2 rounded-md px-3 py-2 text-sm font-semibold"
            style={{ minHeight: 44, background: "var(--accent)", color: "#fff" }}
          >
            CLI 구독으로 연결하기
          </button>
        </div>
      )}

      <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>
        API 키
        <input
          data-testid="api-key-input"
          value={props.keyValue}
          onChange={(e) => props.onKeyChange(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder={`${option.keyHint}`}
          className="mt-1 block w-full rounded-md px-3 py-2 text-sm"
          style={{ ...inputStyle, minHeight: 44 }}
        />
      </label>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        키는 여기서 발급합니다:{" "}
        <a href={option.issueUrl} target="_blank" rel="noopener noreferrer" data-testid="issue-link" style={{ color: "var(--accent)", textDecoration: "underline" }}>
          {option.issueLabel}
        </a>
      </p>

      <details>
        <summary className="cursor-pointer text-xs" style={{ color: "var(--text-secondary)" }}>표시명 (선택)</summary>
        <input
          data-testid="display-name-input"
          value={props.displayName}
          onChange={(e) => props.onDisplayNameChange(e.target.value)}
          placeholder="예: 팀 공용 키"
          className="mt-2 block w-full rounded-md px-3 py-2 text-sm md:w-72"
          style={{ ...inputStyle, minHeight: 44 }}
        />
      </details>

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="save-and-verify"
          onClick={props.onSave}
          disabled={props.saving}
          className="rounded-md px-4 py-2 text-sm font-semibold"
          style={{ minHeight: 44, background: "var(--accent)", color: "#fff", opacity: props.saving ? 0.6 : 1 }}
        >
          {props.saving ? "저장하고 검증하는 중" : "저장하고 검증"}
        </button>
      </div>
      <StatusLine status={props.formStatus} testId="form-status" />
    </div>
  );
}

function CliPanel({ isAdmin }: { isAdmin: boolean | null }) {
  const allowed = isAdmin === true;
  return (
    <div data-testid="cli-panel" className="mt-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {CLI_OPTIONS.map((cli) => allowed ? (
          <a
            key={cli.value}
            href={ADMIN_LLM_PATH}
            data-testid={`cli-option-${cli.value}`}
            className="flex items-center justify-center rounded-md px-4 py-3 text-sm font-semibold"
            style={{ minHeight: 44, background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            {cli.label}
          </a>
        ) : (
          <button
            key={cli.value}
            type="button"
            disabled
            aria-disabled="true"
            data-testid={`cli-option-${cli.value}`}
            className="rounded-md px-4 py-3 text-sm font-semibold"
            style={{ minHeight: 44, background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: 0.5, cursor: "not-allowed" }}
          >
            {cli.label}
          </button>
        ))}
      </div>
      {allowed ? (
        <p data-testid="cli-admin-guide" className="text-sm" style={{ color: "var(--text-secondary)" }}>
          CLI 구독 로그인은 <a href={ADMIN_LLM_PATH} data-testid="cli-admin-link" style={{ color: "var(--accent)", textDecoration: "underline" }}>설정 &gt; LLM 관리 &gt; LLM 계정</a> 화면에서 진행합니다. 위 CLI를 누르면 그 화면으로 이동합니다.
        </p>
      ) : (
        <p data-testid="cli-disabled-guide" className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {isAdmin === null
            ? "권한을 확인하는 중입니다."
            : <>CLI 구독 연결은 관리자만 할 수 있습니다. 관리자에게 요청하거나, 관리자라면 <strong>{CLI_ADMIN_ONLY_TEXT}</strong> 하십시오.</>}
        </p>
      )}
    </div>
  );
}

function KeyList(props: ApiKeysViewProps) {
  const fmtKst = (value?: string | null) => (value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "-");
  return (
    <section style={panelStyle}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>등록 목록</h2>
        <button type="button" onClick={props.onRefresh} className="rounded-md px-3 py-2 text-sm" style={{ minHeight: 44, background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          새로고침
        </button>
      </div>
      <StatusLine status={props.loadError} testId="list-load-error" />
      <StatusLine status={props.listStatus} testId="list-status" />
      {props.loading ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
      ) : props.keys.length === 0 ? (
        <p data-testid="empty-list" className="text-sm" style={{ color: "var(--text-secondary)" }}>{EMPTY_LIST_TEXT}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                <th className="py-2 text-left">회사</th>
                <th className="py-2 text-left">키</th>
                <th className="py-2 text-left">표시명</th>
                <th className="py-2 text-left">최근 사용</th>
                <th className="py-2 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {props.keys.map((key) => (
                <tr key={key.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-3 font-semibold" style={{ color: "var(--text-primary)" }}>{providerLabel(key.provider)}</td>
                  <td className="py-3 font-mono" style={{ color: "var(--text-secondary)" }}>{key.masked_key}</td>
                  <td className="py-3" style={{ color: "var(--text-secondary)" }}>{key.display_name || "-"}</td>
                  <td className="py-3" style={{ color: "var(--text-secondary)" }}>{fmtKst(key.last_used_at)}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => props.onTest(key)} disabled={props.testingId === key.id} className="rounded-md px-3 py-1.5 text-xs" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                        {props.testingId === key.id ? "검증 중" : "검증"}
                      </button>
                      <button type="button" onClick={() => props.onDelete(key)} className="rounded-md px-3 py-1.5 text-xs" style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)" }}>
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
  );
}

export function ApiKeysView(props: ApiKeysViewProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section style={panelStyle}>
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>AI 연결</h1>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          내 AI 계정을 연결하면 해당 회사 호출에 우선 사용됩니다. 연결 방식을 먼저 고르십시오.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <MethodButton
            testId="method-api"
            selected={props.method === "api"}
            title="API 키로 연결"
            description="사용한 만큼 회사에서 과금됩니다."
            onClick={() => props.onSelectMethod("api")}
          />
          <MethodButton
            testId="method-cli"
            selected={props.method === "cli"}
            title="CLI 구독으로 연결"
            description="구독 중인 계정으로 CLI에 로그인합니다."
            onClick={() => props.onSelectMethod("cli")}
          />
        </div>
        {props.method === "api" && <ApiKeyForm {...props} />}
        {props.method === "cli" && <CliPanel isAdmin={props.isAdmin} />}
      </section>
      <KeyList {...props} />
    </div>
  );
}
