import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscoveryRunStatus, HostAccountUsage, ModelReleaseDate, latestDiscoveryRuns, safeSource } from "../../src/components/settings/LlmMetadata";

describe("provider metadata evidence", () => {
  it("does not publish links with executable schemes or embedded credentials", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,hello", "//example.com", "https://user:password@example.com"]) {
      expect(safeSource(value)).toBeNull();
    }
    expect(safeSource("https://openai.com/index/gpt-4-1/")).toBe("https://openai.com/index/gpt-4-1/");
  });

  it("shows a verified release date and source without timezone shifting the date", () => {
    const html = renderToStaticMarkup(<ModelReleaseDate model={{ release_date: "2025-04-14", release_date_source: "https://openai.com/index/gpt-4-1/", release_date_verified_at: "2026-10-30T11:08:43Z" }} />);
    expect(html).toContain('dateTime="2025-04-14"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("KST");
  });

  it.each([
    {}, { release_date: "2025-04-14" },
    { release_date: "2025-02-30", release_date_source: "https://example.com", release_date_verified_at: "2026-10-30T11:08:43Z" },
    { release_date: "2025-04-14", release_date_source: "javascript:alert(1)", release_date_verified_at: "2026-10-30T11:08:43Z" },
    { release_date: "2025-04-14", release_date_source: "https://example.com", release_date_verified_at: "bad-date" },
  ])("does not infer an unverified release date (%j)", model => {
    expect(renderToStaticMarkup(<ModelReleaseDate model={model} />)).toContain("출시일 미확인");
  });

  it.each([
    ["unsupported", "조회 미지원"], ["collection_failed", "수집 실패"], ["not_measured", "미측정"],
  ] as const)("distinguishes quota state %s", (usage_status, expected) => {
    const html = renderToStaticMarkup(<HostAccountUsage account={{ state: "ok", usage_status }} />);
    expect(html).toContain(expected);
    expect(html).not.toContain("첫 호출");
    expect(html).not.toContain("0%");
  });

  it("does not turn absent or invalid quota into zero", () => {
    for (const used_percent of [null, NaN, Infinity, -1, 101]) {
      const html = renderToStaticMarkup(<HostAccountUsage account={{ state: "ok", usage_status: "available", usage_collected_at: "2026-11-01T23:00:00Z", windows: [{ window_minutes: 300, used_percent, resets_at: null }] }} />);
      expect(html).toContain("유효한 수집 기록 없음");
    }
  });

  it("shows measured quota, remaining quota, reset and collection time in KST", () => {
    const html = renderToStaticMarkup(<HostAccountUsage account={{ state: "ok", usage_status: "available", usage_collected_at: "2026-11-01T23:00:00Z", windows: [{ window_minutes: 300, used_percent: 35, resets_at: "2026-11-02T02:00:00Z" }] }} />);
    expect(html).toContain("35.0%");
    expect(html).toContain("65.0%");
    expect(html).toContain("리셋");
    expect(html).toContain("수집");
    expect(html.match(/KST/g)).toHaveLength(2);
  });

  it("keeps login and relay failures distinct from quota availability", () => {
    expect(renderToStaticMarkup(<HostAccountUsage account={{ state: "needs_login", usage_status: "unsupported" }} />)).toContain("Google 로그인 필요");
    expect(renderToStaticMarkup(<HostAccountUsage account={{ state: "unknown", usage_status: "unsupported" }} />)).toContain("연결 확인 불가");
  });

  it("uses the newest attempt per provider, including failed and skipped attempts", () => {
    const base = { provider: "openai", status: "ok", created_at: "2026-10-30T11:00:00Z" };
    const rows = latestDiscoveryRuns([{ ...base, id: 1 }, { ...base, id: 3, status: "failed" }, { ...base, id: 2, provider: "anthropic", status: "skipped" }]);
    expect(rows.map(r => r.id)).toEqual([3, 2]);
    const html = renderToStaticMarkup(<DiscoveryRunStatus run={{ ...rows[1], error: "oauth_runtime_only_models_api_unavailable" }} />);
    expect(html).toContain("건너뜀");
    expect(html).toContain("OAuth 계정");
  });
});
