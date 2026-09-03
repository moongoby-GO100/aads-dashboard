"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { CollectorJob, CollectorOverview, CollectorSite } from "@/lib/api";

const PROJECTS = ["ALL", "AADS", "KIS", "GO100", "SF", "NTV2", "NAS", "STORE_ASSISTANT", "MARKETING", "BANKING", "CUSTOM"];
const statusLabel: Record<string, string> = {
  queued: "대기",
  running: "실행 중",
  action_required: "개입 필요",
  succeeded: "완료",
  failed: "실패",
  superseded: "대체됨",
};
const runtimeLabel: Record<string, string> = {
  webview2: "Windows 앱",
  windows_collector: "Windows 수집기",
  pc_agent: "PC Agent 실행",
  chrome_extension: "Chrome 확장",
  chrome_cdp: "Chrome 연결",
  playwright_server: "서버 브라우저",
  file_upload: "파일 업로드",
  official_api: "공식 API",
  manual_export: "수동 내보내기",
};
const challengeLabel: Record<string, string> = {
  captcha: "CAPTCHA",
  otp: "OTP",
  identity_check: "본인인증",
  certificate: "인증서",
  terms: "약관 확인",
  permission: "권한 승인",
  login: "로그인",
};
const physicalInputChallenges = new Set(["otp", "identity_check", "certificate"]);
const resumeOptions = [
  { value: "user_completed", label: "사용자가 직접 해결" },
  { value: "user_input_completed", label: "OTP/인증 직접 입력 완료" },
  { value: "user_approved_automation", label: "책임 승인 후 자동 해결" },
  { value: "approved_same_session", label: "현재 세션에서 승인 후 재개" },
  { value: "manual_export_uploaded", label: "수동 파일 업로드 완료" },
  { value: "skip_optional_step", label: "선택 단계 건너뜀" },
];

export default function AuthenticatedCollectorPage() {
  const [project, setProject] = useState("ALL");
  const [overview, setOverview] = useState<CollectorOverview | null>(null);
  const [sites, setSites] = useState<CollectorSite[]>([]);
  const [jobs, setJobs] = useState<CollectorJob[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [resumeInputs, setResumeInputs] = useState<Record<string, { resolution: string; note: string; confirmed: boolean }>>({});

  const load = useCallback(async () => {
    try {
      setError("");
      const projectKey = project === "ALL" ? undefined : project;
      const [summary, siteResult, jobResult] = await Promise.all([
        api.getCollectorOverview(),
        api.getCollectorSites(projectKey),
        api.getCollectorJobs(projectKey),
      ]);
      setOverview(summary);
      setSites(siteResult.sites);
      setJobs(jobResult.jobs);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "수집 현황을 불러오지 못했습니다.");
    }
  }, [project]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionJobs = useMemo(() => jobs.filter((job) => job.status === "action_required"), [jobs]);
  const totals = overview?.totals;

  const resume = async (job: CollectorJob) => {
    const input = resumeInputs[job.id] || { resolution: "user_completed", note: "", confirmed: false };
    const challengeKind = job.challenge?.kind || "";
    const requiresPhysicalInput = Boolean(job.challenge?.requires_user_physical_input) || physicalInputChallenges.has(challengeKind);
    const requestsApprovedAutomation = input.resolution === "user_approved_automation";
    if (requestsApprovedAutomation && requiresPhysicalInput) {
      setError("OTP/인증서/본인인증은 자동 해결할 수 없습니다. 사용자가 직접 입력한 뒤 같은 work_key로 재개해야 합니다.");
      return;
    }
    if (!input.confirmed) {
      setError(
        requestsApprovedAutomation
          ? "자동 해결 책임 승인 여부를 확인해야 재개할 수 있습니다."
          : "사용자가 CAPTCHA/OTP/본인인증을 직접 완료했는지 확인해야 재개할 수 있습니다.",
      );
      return;
    }
    setBusy(job.id);
    try {
      await api.resumeCollectorJob(job.id, input.resolution, input.note, {
        responsibility_accepted: input.confirmed && requestsApprovedAutomation,
        physical_input_completed: input.confirmed && requiresPhysicalInput,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "작업을 재개하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm" style={{ color: "var(--accent)" }}>Authenticated Site Collector</p>
            <h1 className="text-2xl font-bold">로그인 사이트 수집 허브</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              프로젝트별 로그인 세션, 레시피, 수집 작업을 한 곳에서 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border px-4 py-2 text-sm">새 사이트 연결</button>
            <button className="rounded-lg px-4 py-2 text-sm text-white" style={{ background: "var(--accent)" }}>새 수집 작업</button>
          </div>
        </header>

        <section className="flex gap-2 overflow-x-auto pb-1" aria-label="프로젝트 필터">
          {PROJECTS.map((key) => (
            <button
              key={key}
              onClick={() => setProject(key)}
              className="shrink-0 rounded-full px-4 py-2 text-sm"
              style={{
                background: project === key ? "var(--accent)" : "var(--bg-card)",
                color: project === key ? "white" : "var(--text-secondary)",
              }}
            >
              {key === "ALL" ? "전체 프로젝트" : key}
            </button>
          ))}
        </section>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
            <button className="ml-2 underline" onClick={() => void load()}>다시 시도</button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["연결된 사이트", totals?.connected_sites],
            ["활성 계정", totals?.active_accounts],
            ["실행 중", totals?.running_jobs],
            ["개입 필요", totals?.action_required_jobs],
            ["최근 실패", totals?.failed_jobs],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-lg p-4" style={{ background: "var(--bg-card)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
              <p className="mt-2 text-2xl font-bold">{value ?? "-"}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold">인증 챌린지 처리 정책</h2>
              <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
                CAPTCHA/OTP는 자동 우회하지 않고, 사용자가 같은 브라우저 세션에서 직접 완료한 뒤 수집만 재개합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-red-500/15 px-3 py-1 text-red-200">자동 우회 금지</span>
              <span className="rounded bg-emerald-500/15 px-3 py-1 text-emerald-200">값 저장 안함</span>
              <span className="rounded bg-blue-500/15 px-3 py-1 text-blue-200">같은 work_key 재개</span>
            </div>
          </div>
          {overview?.challenge_contract && (
            <p className="mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
              지원 챌린지: {overview.challenge_contract.supported_challenge_kinds.map((kind) => challengeLabel[kind] || kind).join(", ")}
            </p>
          )}
        </section>

        {actionJobs.length > 0 && (
          <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 md:p-6">
            <h2 className="font-semibold text-amber-300">사용자 개입 필요</h2>
            <div className="mt-3 space-y-3">
              {actionJobs.map((job) => (
                <div key={job.id} className="flex flex-col gap-3 rounded-lg p-4 md:flex-row md:items-center md:justify-between" style={{ background: "var(--bg-card)" }}>
                  <div className="min-w-0 flex-1">
                    {(() => {
                      const challengeKind = job.challenge?.kind || "";
                      const requiresPhysicalInput =
                        Boolean(job.challenge?.requires_user_physical_input) || physicalInputChallenges.has(challengeKind);
                      const selectedResolution = resumeInputs[job.id]?.resolution || "user_completed";
                      const automationSelected = selectedResolution === "user_approved_automation";
                      const availableResumeOptions = resumeOptions.filter(
                        (option) => option.value !== "user_approved_automation" || !requiresPhysicalInput,
                      );
                      return (
                        <>
                    <p className="font-medium">{job.payload.project_key || "CUSTOM"} · {job.site_key}</p>
                    <p className="text-sm text-amber-200">{job.error_code || "로그인 확인 필요"} - {job.message || "OTP/CAPTCHA/약관/권한 상태를 직접 확인해 주세요."}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-black/20 px-2 py-1">{challengeLabel[job.challenge?.kind || ""] || "사용자 인증"}</span>
                      <span className="rounded bg-black/20 px-2 py-1">{job.challenge?.auto_bypass_allowed === false ? "자동 우회 금지" : "승인 확인 필요"}</span>
                      <span className="rounded bg-black/20 px-2 py-1">{requiresPhysicalInput ? "사용자 직접 입력 필수" : "사용자 승인 자동화 가능"}</span>
                      <span className="rounded bg-black/20 px-2 py-1">{job.challenge?.challenge_values_persisted === false ? "OTP/CAPTCHA 값 미저장" : "민감값 저장 금지"}</span>
                    </div>
                    <p className="mt-2 truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                      {job.challenge?.page_url || "현재 로그인 세션"} · {job.work_key}
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr]">
                      <select
                        value={resumeInputs[job.id]?.resolution || "user_completed"}
                        onChange={(event) =>
                          setResumeInputs((prev) => ({
                            ...prev,
                            [job.id]: { resolution: event.target.value, note: prev[job.id]?.note || "", confirmed: prev[job.id]?.confirmed || false },
                          }))
                        }
                        className="rounded-lg border px-3 py-2 text-sm"
                        style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      >
                        {availableResumeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <input
                        value={resumeInputs[job.id]?.note || ""}
                        onChange={(event) =>
                          setResumeInputs((prev) => ({
                            ...prev,
                            [job.id]: { resolution: prev[job.id]?.resolution || "user_completed", note: event.target.value, confirmed: prev[job.id]?.confirmed || false },
                          }))
                        }
                        placeholder="조치 메모: 인증 완료, 담당자 승인 등"
                        className="rounded-lg border px-3 py-2 text-sm"
                        style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                    </div>
                    <label className="mt-3 flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={resumeInputs[job.id]?.confirmed || false}
                        onChange={(event) =>
                          setResumeInputs((prev) => ({
                            ...prev,
                            [job.id]: { resolution: prev[job.id]?.resolution || "user_completed", note: prev[job.id]?.note || "", confirmed: event.target.checked },
                          }))
                        }
                        className="mt-0.5"
                      />
                      {automationSelected
                        ? "사용자가 자동 해결 실행과 결과 확인 책임을 승인했으며, 민감한 일회용 값은 저장하지 않습니다."
                        : requiresPhysicalInput
                          ? "사용자가 OTP/인증서/본인인증을 현재 브라우저에서 직접 입력 완료했으며, 같은 work_key로 재개합니다."
                          : "사용자가 CAPTCHA/권한/약관 상태를 확인했으며, 민감한 일회용 값은 저장하지 않았습니다."}
                    </label>
                        </>
                      );
                    })()}
                  </div>
                  <button disabled={busy === job.id} onClick={() => void resume(job)} className="shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
                    {busy === job.id ? "재개 중..." : "조치 완료 후 재개"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">사이트 연결</h2>
            <button className="text-sm" style={{ color: "var(--accent)" }}>설정 및 레시피 관리</button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {sites.map((site) => (
              <article key={site.id} className="rounded-lg p-4" style={{ background: "var(--bg-card)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{site.project_key}</p>
                    <h3 className="font-semibold">{site.display_name}</h3>
                  </div>
                  <span
                    className="rounded-full px-2 py-1 text-xs"
                    style={{
                      background: site.connected_account_count ? "rgba(34,197,94,.15)" : "rgba(245,158,11,.15)",
                      color: site.connected_account_count ? "#86efac" : "#fcd34d",
                    }}
                  >
                    {site.connected_account_count ? "로그인 연결됨" : "로그인 필요"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-black/20 px-2 py-1">{runtimeLabel[site.runtime] || site.runtime}</span>
                  {site.data_categories.map((category) => (
                    <span key={category} className="rounded bg-black/20 px-2 py-1">{category}</span>
                  ))}
                </div>
                <p className="mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                  마지막 수집: {site.last_collected_at ? new Date(site.last_collected_at).toLocaleString("ko-KR") : "수집 이력 없음"}
                </p>
              </article>
            ))}
            {!sites.length && !error && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                연결된 사이트가 없습니다. 첫 사이트를 연결해 주세요.
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">작업 큐</h2>
          <div className="overflow-x-auto rounded-lg" style={{ background: "var(--bg-card)" }}>
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead style={{ color: "var(--text-secondary)" }}>
                <tr>
                  <th className="p-4">프로젝트</th>
                  <th>사이트</th>
                  <th>런타임</th>
                  <th>상태</th>
                  <th>마지막 갱신</th>
                  <th>다음 행동</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-4">{job.payload.project_key || "CUSTOM"}</td>
                    <td>{job.site_key}</td>
                    <td>{runtimeLabel[job.runtime] || job.runtime}</td>
                    <td>{statusLabel[job.status] || job.status}</td>
                    <td>{new Date(job.updated_at).toLocaleString("ko-KR")}</td>
                    <td>{job.status === "failed" ? "다시 로그인 · 수동 업로드 · 담당자 승인" : job.status === "action_required" ? "사용자 확인 후 재개" : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
