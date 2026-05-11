"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

type DesignScreen = {
  id: string;
  name?: string;
  route?: string;
  purpose?: string;
};

type DesignModificationRequest = {
  id: string;
  status?: string;
  request_type?: string;
  screen_id?: string;
  screen_name?: string;
  screen_route?: string;
  prompt_excerpt?: string;
  user_prompt?: string;
  context_pack_count?: number;
  created_at?: string;
};

const STATUS_OPTIONS = ["all", "ready", "in_progress", "review", "done", "rejected"];

function statusLabel(status: string) {
  return status === "all" ? "전체" : status.replace(/_/g, " ");
}

export default function DesignModificationsPage() {
  const [screens, setScreens] = useState<DesignScreen[]>([]);
  const [requests, setRequests] = useState<DesignModificationRequest[]>([]);
  const [status, setStatus] = useState("all");
  const [screenId, setScreenId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextStatus = status, nextScreenId = screenId) {
    setError("");
    const params: { status?: string; screen_id?: string } = {};
    if (nextStatus !== "all") params.status = nextStatus;
    if (nextScreenId !== "all") params.screen_id = nextScreenId;

    const [screenData, requestData] = await Promise.all([
      api.getDesignScreens("AADS"),
      api.getDesignModificationRequests("AADS", params),
    ]);

    setScreens(Array.isArray(screenData?.screens) ? screenData.screens : []);
    setRequests(Array.isArray(requestData?.requests) ? requestData.requests : []);
  }

  useEffect(() => {
    let mounted = true;
    load()
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : "디자인 수정 요청을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = requests.length;
    const needsContext = requests.filter((item) => !item.context_pack_count).length;
    const inReview = requests.filter((item) => item.status === "review").length;
    return { total, needsContext, inReview };
  }, [requests]);

  const changeStatus = async (value: string) => {
    setStatus(value);
    setLoading(true);
    try {
      await load(value, screenId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "상태 필터 적용에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const changeScreen = async (value: string) => {
    setScreenId(value);
    setLoading(true);
    try {
      await load(status, value);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "화면 필터 적용에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "var(--bg-primary)" }} className="flex flex-col h-full">
      <Header title="Design Modification Studio" />
      <main className="flex-1 overflow-auto p-3 md:p-6">
        {error ? (
          <div className="text-sm rounded-md p-3 mb-4" style={{ color: "var(--danger)", background: "var(--bg-card)" }}>
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>디자인 수정 요청</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {loading ? "로딩 중..." : `${requests.length}건 표시 중`}
            </p>
          </div>
          <Link
            href="/design/modifications/new"
            className="rounded-md px-4 py-2 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            새 요청
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-3 mb-4">
          <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Requests</div>
            <div className="text-2xl font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{stats.total}</div>
          </section>
          <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Needs Context</div>
            <div className="text-2xl font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{stats.needsContext}</div>
          </section>
          <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>In Review</div>
            <div className="text-2xl font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{stats.inReview}</div>
          </section>
        </div>

        <section className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <select
              value={status}
              onChange={(event) => changeStatus(event.target.value)}
              className="rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item} value={item}>{statusLabel(item)}</option>
              ))}
            </select>
            <select
              value={screenId}
              onChange={(event) => changeScreen(event.target.value)}
              className="rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              <option value="all">모든 화면</option>
              {screens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.route || screen.name || screen.id}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-3">
          {requests.map((item) => (
            <article
              key={item.id}
              className="rounded-lg p-4"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                    {item.screen_route || item.screen_name || "화면 미지정"} · {item.request_type || "other"}
                  </div>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {item.prompt_excerpt || item.user_prompt || "요청 내용 없음"}
                  </h2>
                </div>
                <span className="text-xs rounded px-2 py-1" style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}>
                  {item.status || "ready"}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Context packs {item.context_pack_count ?? 0}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/design/modifications/${item.id}/context`}
                    className="rounded-md px-3 py-2 text-sm"
                    style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                  >
                    Context
                  </Link>
                  <Link
                    href={`/design/modifications/${item.id}/workbench`}
                    className="rounded-md px-3 py-2 text-sm font-semibold"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    Workbench
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {!loading && requests.length === 0 ? (
            <section className="rounded-lg p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>표시할 디자인 수정 요청이 없습니다.</p>
              <Link
                href="/design/modifications/new"
                className="inline-flex mt-4 rounded-md px-4 py-2 text-sm font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                첫 요청 작성
              </Link>
            </section>
          ) : null}
        </section>
      </main>
    </div>
  );
}
