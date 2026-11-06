import { renderToStaticMarkup } from "react-dom/server";
import styles from "./RunnerHostStatus.module.css";
import { describe, expect, it } from "vitest";
import { RunnerHostStatusView, type Payload } from "./RunnerHostStatus";

function payload(): Payload {
  return {
    window_hours: 1,
    totals: { hosts: 3, running: 4, queued: 13, done: 7, error: 5, cancelled: 0 },
    servers: [
      { host: "contabo14", running: 2, max_concurrent: 3, queued: 13, queued_shared: true },
      { host: "contabo92", running: 1, max_concurrent: 1, queued: 13, queued_shared: true },
      { host: "contabo42", running: 0, max_concurrent: 15, queued: 0, queued_shared: false },
    ].map((s, index) => ({ ...s, done: index === 0 ? 7 : 0, error: index === 0 ? 5 : 0,
      cancelled: 0, other: 0, oldest_running_sec: 120, projects: ["GO100"], alive: true, seen_ago_sec: 0 })),
  };
}

const render = (data: Payload, open = true, emphasis: "running" | "error" = "running") =>
  renderToStaticMarkup(<RunnerHostStatusView data={data} open={open} emphasis={emphasis} />);

describe("RunnerHostStatus", () => {
  it("uses API totals once in the summary despite shared queues", () => {
    const html = render(payload(), false);
    expect(html).toMatch(/러너 3대.*실행 4.*대기 13.*성공 7.*실패 5/);
    expect(html.match(/대기 13/g)).toHaveLength(1);
    expect(html).toContain("최근 1시간");
    expect(html).toContain('title="최근 1시간 기준 성공 작업 수"');
  });

  it("shows server limits, shared queues, success and unchanged error tones", () => {
    const html = render(payload());
    expect(html).toContain(`class="${styles.runningActive}" title="러너가 보고한 동시 실행 상한">`);
    expect(html).toMatch(/실행 2\/3/);
    expect(html).toContain(`class="${styles.runningFull}" title="러너가 보고한 동시 실행 상한">`);
    expect(html).toContain(`class="${styles.runningIdle}" title="러너가 보고한 동시 실행 상한">실행 0/15`);
    expect(html).toContain('title="러너가 보고한 동시 실행 상한"');
    expect(html.match(/이 대기는 같은 프로젝트를 받는 다른 서버와 공유됩니다\(합계에는 한 번만 셈\)/g)).toHaveLength(2);
    expect(html).toContain('color:var(--ct-text);font-weight:700">대기 13');
    expect(html).toContain('color:var(--ct-text);font-weight:400">대기 0');
    expect(html).toContain('color:var(--ct-success, #4ade80)">성공 7');
    expect(html).toContain('color:var(--ct-text)">성공 0');
    expect(html).toContain('color:#f59e0b;font-weight:700;min-width:54px">실패 5');
    const data = payload();
    data.servers[0].error = 15;
    expect(render(data)).toContain('color:#ef4444;font-weight:700;min-width:54px">실패 15');
    expect(html).toContain("최장 2분");
    expect(render(data, true, "error")).not.toContain("최장");
  });

  it("renders absent queue and limit fields without errors, including null limits", () => {
    const data = payload();
    delete data.totals.queued;
    data.servers.forEach((s) => {
      delete s.queued;
      delete s.queued_shared;
      delete s.max_concurrent;
    });
    data.servers[1].max_concurrent = null;
    const html = render(data);
    expect(html.match(/대기 —/g)).toHaveLength(4);
    expect(html).toContain("실행 2/—");
    expect(html).toContain("실행 1/—");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("이 대기는");
  });

  it("allows summary and server rows to wrap at narrow viewport widths", () => {
    expect(render(payload()).match(/flex-wrap:wrap/g)).toHaveLength(4);
  });
});

it("marks 12/12 full, 2/3 active and 0/15 idle", () => {
  const data = payload();
  data.servers[1].running = 12;
  data.servers[1].max_concurrent = 12;
  const html = render(data);
  expect(html).toMatch(new RegExp(`class="${styles.runningFull}"[^>]*>(?:<span[^>]*></span>)?실행 12/12`));
  expect(html).toMatch(new RegExp(`class="${styles.runningActive}"[^>]*>(?:<span[^>]*></span>)?실행 2/3`));
  expect(html).toMatch(new RegExp(`class="${styles.runningIdle}"[^>]*>실행 0/15`));
});

it("merges canonical host aliases and prefers API labels", () => {
  const data = payload();
  const row = data.servers[0];
  data.servers = [
    { ...row, host: "vmi3267555", label: "주 서버", aliases: ["original-host"] },
    { ...row, host: "contabo116", max_concurrent: 12 },
    { ...row, host: "rfree-0009" },
    { ...row, host: "rfree-0009.cafe24.com" },
  ];
  const html = render(data);
  expect(html).toContain(">주 서버</span>");
  expect(html).toContain('title="실제 호스트명: vmi3267555, original-host, contabo116"');
  expect(html).toContain('title="실제 호스트명: rfree-0009, rfree-0009.cafe24.com"');
  expect(html.match(/실행 4\/12/g)).toHaveLength(1);
  expect(html.match(/실행 4\/3/g)).toHaveLength(1);
  expect(html).toContain(">cafe24_114</span>");
  expect(html).toContain("성공 14");
  expect(html).toContain("실패 10");
  expect(html).toContain("대기 26 (공유)");
  expect(html).toContain("서버 배정 전 줄 선 작업. 주 서버가 꽉 차면 보조 서버로 넘어갑니다");
  expect(html.match(/min-height:44px/g)).toHaveLength(2);
});
