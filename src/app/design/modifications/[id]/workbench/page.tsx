"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

const AXIS_LABELS: Record<string, string> = {
  request_match: "요청 일치도",
  context_retention: "맥락 유지",
  visual_completeness: "시각 완성도",
  responsive_stability: "반응형 안정성",
  accessibility: "접근성",
  technical_stability: "기술 안정성",
};

function scoreColor(score: number) {
  if (score >= 90) return "var(--success)";
  if (score >= 80) return "var(--accent)";
  if (score >= 70) return "var(--warning)";
  return "var(--danger)";
}

export default function DesignWorkbenchPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const [detail, setDetail] = useState<any>(null);
  const [score, setScore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const detailData = await api.getDesignModificationRequest(requestId);
    setDetail(detailData);
  }

  useEffect(() => {
    let mounted = true;
    load()
      .catch((err: any) => {
        if (mounted) setError(err?.message || "Workbench 데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [requestId]);

  const runScore = async () => {
    setScoring(true);
    setError("");
    try {
      const result = await api.scoreDesignModification(requestId);
      setScore(result);
    } catch (err: any) {
      setError(err?.message || "QA 점수 계산에 실패했습니다.");
    } finally {
      setScoring(false);
    }
  };

  const request = detail?.request;
  const snapshots = Array.isArray(detail?.snapshots) ? detail.snapshots : [];
  const before = snapshots.find((item: any) => item.phase === "before");
  const after = snapshots.find((item: any) => item.phase === "after");
  const total = Number(score?.total_score || 0);

  return (
    <div style={{ background: "var(--bg-primary)" }} className="flex flex-col h-full">
      <Header title="Design Workbench" />
      <main className="flex-1 overflow-auto p-3 md:p-6">
        {error && (
          <div className="text-sm rounded-md p-3 mb-4" style={{ color: "var(--danger)", background: "var(--bg-card)" }}>
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {request?.screen?.name || "디자인 수정 검수"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {loading ? "로딩 중..." : request?.user_prompt}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/design/modifications/${requestId}/context`}
              className="rounded-md px-3 py-2 text-sm"
              style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              Context
            </Link>
            <button
              onClick={runScore}
              disabled={scoring}
              className="rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {scoring ? "점수 계산 중..." : "QA 점수 계산"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg p-4 min-h-80" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Before</h2>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{before?.viewport || "-"}</span>
                </div>
                {before?.image_url ? (
                  <img src={before.image_url} alt="Before snapshot" className="w-full rounded-md object-contain" />
                ) : (
                  <div className="h-64 rounded-md grid place-items-center text-sm" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                    before snapshot 없음
                  </div>
                )}
              </div>
              <div className="rounded-lg p-4 min-h-80" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>After</h2>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{after?.viewport || "-"}</span>
                </div>
                {after?.image_url ? (
                  <img src={after.image_url} alt="After snapshot" className="w-full rounded-md object-contain" />
                ) : (
                  <div className="h-64 rounded-md grid place-items-center text-sm" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                    after snapshot 없음
                  </div>
                )}
              </div>
            </div>

            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>검수 기준</h2>
              <div className="grid gap-2">
                {(request?.acceptance_criteria || []).map((item: string, index: number) => (
                  <div key={index} className="rounded-md p-3 text-sm" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
                    {item}
                  </div>
                ))}
                {!request?.acceptance_criteria?.length ? (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>검수 기준이 없습니다.</p>
                ) : null}
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Design QA Score</div>
              <div className="text-5xl font-semibold mt-2" style={{ color: scoreColor(total) }}>
                {score ? total : "--"}
              </div>
              <div className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                {score?.rating || "정적 QA 점수를 아직 계산하지 않았습니다."}
              </div>
            </section>

            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>축별 점수</h2>
              <div className="space-y-3">
                {Object.entries(score?.axes || {}).map(([key, axis]: [string, any]) => {
                  const axisScore = Number(axis?.score || 0);
                  const maxScore = Number(axis?.max_score || 1);
                  const width = Math.max(0, Math.min(100, (axisScore / maxScore) * 100));
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                        <span>{AXIS_LABELS[key] || key}</span>
                        <span>{axisScore}/{maxScore}</span>
                      </div>
                      <div className="h-2 rounded-full" style={{ background: "var(--bg-hover)" }}>
                        <div className="h-2 rounded-full" style={{ width: `${width}%`, background: scoreColor(width) }} />
                      </div>
                    </div>
                  );
                })}
                {!score ? (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>점수 계산 후 축별 결과가 표시됩니다.</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Token Compliance</h2>
              <pre className="text-xs rounded-md p-3 overflow-auto max-h-72" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
                {JSON.stringify(score?.token_compliance?.summary || {}, null, 2)}
              </pre>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
