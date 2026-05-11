"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      className="text-xs rounded-md p-3 overflow-auto max-h-96"
      style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function DesignContextPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const [detail, setDetail] = useState<any>(null);
  const [packs, setPacks] = useState<any[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const [detailData, packData] = await Promise.all([
      api.getDesignModificationRequest(requestId),
      api.getDesignContextPacks(requestId),
    ]);
    const nextPacks = Array.isArray(packData?.context_packs) ? packData.context_packs : [];
    setDetail(detailData);
    setPacks(nextPacks);
    if (nextPacks[0]?.id) {
      const previewData = await api.getDesignContextPackPreview(nextPacks[0].id);
      setPreview(previewData?.context_pack || null);
    } else {
      setPreview(null);
    }
  }

  useEffect(() => {
    let mounted = true;
    load()
      .catch((err: any) => {
        if (mounted) setError(err?.message || "컨텍스트를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [requestId]);

  const buildContext = async () => {
    setBuilding(true);
    setError("");
    try {
      await api.buildDesignContextPack(requestId);
      await load();
    } catch (err: any) {
      setError(err?.message || "컨텍스트팩 생성에 실패했습니다.");
    } finally {
      setBuilding(false);
    }
  };

  const request = detail?.request;
  const latestPack = packs[0];

  return (
    <div style={{ background: "var(--bg-primary)" }} className="flex flex-col h-full">
      <Header title="Design Context Pack" />
      <main className="flex-1 overflow-auto p-3 md:p-6">
        {error && (
          <div className="text-sm rounded-md p-3 mb-4" style={{ color: "var(--danger)", background: "var(--bg-card)" }}>
            {error}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>수정 요청</h1>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{request?.screen?.route || "화면 미지정"}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded" style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}>
                  {request?.status || "loading"}
                </span>
              </div>
              <p className="text-sm mt-4 whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
                {loading ? "로딩 중..." : request?.user_prompt}
              </p>
              <div className="mt-4 text-xs space-y-2" style={{ color: "var(--text-secondary)" }}>
                <div>유형: {request?.request_type || "-"}</div>
                <div>검수 기준: {(request?.acceptance_criteria || []).length}개</div>
                <div>컨텍스트팩: {request?.context_pack_count || 0}개</div>
              </div>
            </section>

            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>액션</h2>
              <div className="grid gap-2">
                <button
                  onClick={buildContext}
                  disabled={building}
                  className="rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {building ? "생성 중..." : "컨텍스트팩 재생성"}
                </button>
                <Link
                  href={`/design/modifications/${requestId}/workbench`}
                  className="rounded-md px-3 py-2 text-sm font-semibold text-center"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  Workbench로 이동
                </Link>
                <Link
                  href="/design/modifications/new"
                  className="rounded-md px-3 py-2 text-sm text-center"
                  style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                >
                  새 요청 작성
                </Link>
              </div>
            </section>
          </aside>

          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Sources</div>
                <div className="text-2xl font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{latestPack?.source_count ?? 0}</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Missing Context</div>
                <div className="text-2xl font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{latestPack?.missing_context_count ?? 0}</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Prompt Chars</div>
                <div className="text-2xl font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{latestPack?.prompt_chars ?? 0}</div>
              </div>
            </div>

            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>누락 경고</h2>
              {(preview?.missing_context || latestPack?.missing_context || []).length ? (
                <div className="grid gap-2">
                  {(preview?.missing_context || latestPack?.missing_context || []).map((item: any, index: number) => (
                    <div key={index} className="rounded-md p-3 text-sm" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
                      {typeof item === "string" ? item : item.message || JSON.stringify(item)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>최신 컨텍스트팩에 치명적인 누락 경고가 없습니다.</p>
              )}
            </section>

            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>컨텍스트 미리보기</h2>
              <JsonBlock value={preview?.context || {}} />
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
