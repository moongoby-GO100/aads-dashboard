"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  spacing_density: "밀도/간격",
  visual_hierarchy: "시각 위계",
  color_brand: "색상/브랜드",
  typography: "타이포그래피",
  component_consistency: "컴포넌트 일관성",
  responsive: "반응형",
  interaction: "인터랙션",
  content_clarity: "문구 명확성",
  workflow_layout: "업무 흐름",
  other: "기타",
};

function classifyRequest(text: string): string {
  const value = text.toLowerCase();
  if (/간격|여백|좁|넓|밀도|카드|row|compact|spacing|density/.test(value)) return "spacing_density";
  if (/위계|강조|눈에|정렬|hierarchy|emphasis/.test(value)) return "visual_hierarchy";
  if (/색|컬러|브랜드|톤|color|brand/.test(value)) return "color_brand";
  if (/글씨|폰트|타이포|typography|font/.test(value)) return "typography";
  if (/컴포넌트|버튼|카드|테이블|component|button|table/.test(value)) return "component_consistency";
  if (/모바일|반응형|viewport|responsive|겹침/.test(value)) return "responsive";
  if (/클릭|전환|hover|focus|interaction/.test(value)) return "interaction";
  if (/문구|라벨|설명|copy|label|content/.test(value)) return "content_clarity";
  if (/흐름|단계|업무|workflow|layout/.test(value)) return "workflow_layout";
  return "other";
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function NewDesignModificationPage() {
  const router = useRouter();
  const [screens, setScreens] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [screenId, setScreenId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [allowedScope, setAllowedScope] = useState("선택한 화면의 레이아웃, 간격, 컴포넌트 표현만 수정");
  const [forbiddenScope, setForbiddenScope] = useState("인증, API 호출, 데이터 구조, 사이드바 네비게이션 변경 금지");
  const [criteria, setCriteria] = useState("1440px에서 핵심 목록이 더 많이 보여야 함\n390px 모바일에서 버튼/텍스트 겹침이 없어야 함\n기존 색상 토큰과 컴포넌트 패턴을 유지해야 함");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [screenData, requestData] = await Promise.all([
          api.getDesignScreens("AADS"),
          api.getDesignModificationRequests("AADS"),
        ]);
        if (!mounted) return;
        const nextScreens = Array.isArray(screenData?.screens) ? screenData.screens : [];
        setScreens(nextScreens);
        setRequests(Array.isArray(requestData?.requests) ? requestData.requests : []);
        if (nextScreens[0]?.id) setScreenId(nextScreens[0].id);
      } catch (err: any) {
        if (mounted) setError(err?.message || "디자인 수정 데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedScreen = useMemo(
    () => screens.find((screen) => screen.id === screenId),
    [screenId, screens],
  );
  const requestType = classifyRequest(prompt);

  const submit = async () => {
    if (!prompt.trim()) {
      setError("수정 요청 내용을 입력해야 합니다.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await api.createDesignModificationRequest({
        project_key: "AADS",
        screen_id: screenId || null,
        user_prompt: prompt.trim(),
        request_type: requestType,
        status: "ready",
        normalized_card: {
          target_route: selectedScreen?.route || null,
          screen_name: selectedScreen?.name || null,
          request_type: requestType,
          summary: prompt.trim().slice(0, 240),
        },
        allowed_scope: { notes: splitLines(allowedScope) },
        forbidden_scope: { notes: splitLines(forbiddenScope) },
        acceptance_criteria: splitLines(criteria),
      });
      const id = response?.request?.id;
      if (id) {
        await api.buildDesignContextPack(id);
        router.push(`/design/modifications/${id}/context`);
      }
    } catch (err: any) {
      setError(err?.message || "수정 요청 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: "var(--bg-primary)" }} className="flex flex-col h-full">
      <Header title="Design Modification Studio" />
      <main className="flex-1 overflow-auto p-3 md:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>새 디자인 수정 카드</h1>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  화면, 허용 범위, 금지 범위, 검수 기준을 한 번에 고정합니다.
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}>
                {REQUEST_TYPE_LABELS[requestType] || requestType}
              </span>
            </div>

            {error && (
              <div className="text-sm rounded-md p-3 mb-4" style={{ color: "var(--danger)", background: "var(--bg-hover)" }}>
                {error}
              </div>
            )}

            <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>대상 화면</label>
            <select
              value={screenId}
              onChange={(event) => setScreenId(event.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm mb-4"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              disabled={loading}
            >
              {screens.length === 0 ? <option value="">등록된 화면 없음</option> : null}
              {screens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.route} · {screen.name}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>수정 요청</label>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm mb-4 min-h-36 resize-y"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              placeholder="예: 상단 요약 카드 높이를 줄이고 작업 목록을 첫 화면에서 더 많이 보이게 해주세요. 모바일에서는 버튼이 겹치면 안 됩니다."
            />

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>변경 허용 범위</label>
                <textarea
                  value={allowedScope}
                  onChange={(event) => setAllowedScope(event.target.value)}
                  className="w-full rounded-md px-3 py-2 text-sm min-h-28 resize-y"
                  style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>변경 금지 범위</label>
                <textarea
                  value={forbiddenScope}
                  onChange={(event) => setForbiddenScope(event.target.value)}
                  className="w-full rounded-md px-3 py-2 text-sm min-h-28 resize-y"
                  style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
            </div>

            <label className="block text-xs font-semibold mt-4 mb-2" style={{ color: "var(--text-secondary)" }}>검수 기준</label>
            <textarea
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm min-h-28 resize-y"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />

            <div className="flex justify-end mt-4">
              <button
                onClick={submit}
                disabled={submitting || !prompt.trim()}
                className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {submitting ? "생성 중..." : "컨텍스트팩 생성"}
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>선택 화면 맥락</h2>
              {selectedScreen ? (
                <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <div style={{ color: "var(--text-primary)" }}>{selectedScreen.route}</div>
                  <div>{selectedScreen.purpose || "목적 미등록"}</div>
                  <div className="text-xs">파일: {(selectedScreen.component_paths || []).join(", ") || "미등록"}</div>
                </div>
              ) : (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>화면을 먼저 등록해야 합니다.</div>
              )}
            </section>

            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>최근 수정 요청</h2>
              <div className="space-y-2">
                {requests.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/design/modifications/${item.id}/context`)}
                    className="w-full text-left rounded-md p-3"
                    style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                  >
                    <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{item.screen_route || "화면 미지정"} · {item.status}</div>
                    <div className="text-sm">{item.prompt_excerpt}</div>
                  </button>
                ))}
                {!loading && requests.length === 0 ? (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>아직 요청이 없습니다.</div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
