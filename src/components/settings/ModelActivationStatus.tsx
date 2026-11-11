import { metadataTime } from "./LlmMetadata";

export interface ActivationModel {
  is_active?: boolean;
  is_executable?: boolean;
  verification_status?: string;
  metadata?: {
    activation_review_reason?: string;
    activation_probe?: {
      status?: string;
      error?: string;
      transient?: boolean;
      at?: string;
      next_retry_at?: string;
    };
  };
}

export function ModelActivationStatus({ model }: { model: ActivationModel }) {
  const probe = model.metadata?.activation_probe;
  const reason = model.metadata?.activation_review_reason || probe?.error;
  const available = model.is_active && model.is_executable;
  const retrying = !available && probe?.status === "failed" && probe.transient;
  const label = available ? "실행 가능" : retrying ? "일시 제한 · 자동 재검증 대기" : "실행 불가 · 검증/설정 필요";
  return (
    <div className="mt-1 space-y-1 break-words" style={{ color: available ? "var(--success)" : "var(--warning)" }}>
      <p>{label}{!available && reason ? ` (${reason})` : ""}</p>
      {probe && <>
        <p style={{ color: "var(--text-secondary)" }}>마지막 검증: {metadataTime(probe.at)}</p>
        {!available && <p style={{ color: "var(--text-secondary)" }}>다음 재시도: {probe.next_retry_at ? metadataTime(probe.next_retry_at) : retrying ? "자동 재검증 일정 확인 중" : "—"}</p>}
      </>}
    </div>
  );
}
