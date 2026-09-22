"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Header from "@/components/Header";
import {
  api,
  type AdminSessionDetailResponse,
  type AdminSessionItem,
  type AdminUsersOverviewResponse,
} from "@/lib/api";

type Overview = AdminUsersOverviewResponse;
type UserRow = Overview["users"][number];
type TabKey = "users" | "tenants" | "insights";

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  align?: "left" | "right";
  sticky?: boolean;
};

const USER_COLUMNS: Column[] = [
  { key: "user", label: "사용자", sortKey: "email", sticky: true },
  { key: "role", label: "권한", sortKey: "role" },
  { key: "status", label: "상태", sortKey: "status" },
  { key: "tenant", label: "기본 Tenant" },
  { key: "sessions", label: "세션", sortKey: "sessions_30d", align: "right" },
  { key: "messages", label: "메시지", sortKey: "messages_30d", align: "right" },
  { key: "tokens", label: "토큰", sortKey: "tokens_30d", align: "right" },
  { key: "cost", label: "비용", sortKey: "cost_30d", align: "right" },
  { key: "created", label: "가입일", sortKey: "created_at" },
  { key: "seen", label: "최근 활동", sortKey: "last_seen_at" },
  { key: "action", label: "" },
];

function formatNumber(value: unknown): string {
  const num = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString("ko-KR") : "0";
}

function formatUsd(value: unknown): string {
  const num = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  const safe = Number.isFinite(num) ? num : 0;
  const digits = safe > 0 && safe < 0.01 ? 4 : 2;
  return `$${safe.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(value: string): string {
  const normalized = (value || "").toLowerCase();
  if (normalized === "active") return "#059669";
  if (normalized === "suspended" || normalized === "deleted") return "#dc2626";
  if (normalized === "pending" || normalized === "invited") return "#d97706";
  return "var(--text-secondary)";
}

const cardStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "16px",
};

const controlStyle = {
  height: "36px",
  borderRadius: "8px",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  padding: "0 10px",
  fontSize: "13px",
};

export default function AdminUsersPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [tab, setTab] = useState<TabKey>("users");
  const [days, setDays] = useState(30);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState("last_seen_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [drawerUser, setDrawerUser] = useState<UserRow | null>(null);
  const [userSessions, setUserSessions] = useState<AdminSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<AdminSessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [queryInput]);

  const loadOverview = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await api.getAdminUsersOverview({
        days,
        q: query || undefined,
        role: role || undefined,
        status: status || undefined,
        active_only: activeOnly,
        page,
        page_size: pageSize,
        sort,
        order,
      });
      setData(response);
      setError("");
    } catch (err) {
      console.error("admin users overview load failed", err);
      setError(err instanceof Error ? err.message : "사용자 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, query, role, status, activeOnly, page, pageSize, sort, order]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const openDrawer = useCallback(async (user: UserRow) => {
    setDrawerUser(user);
    setSessionsLoading(true);
    setSessionDetail(null);
    setUserSessions([]);
    try {
      const response = await api.getAdminSessions({ user_id: user.user_id, limit: 60 });
      setUserSessions(response.sessions || []);
    } catch (err) {
      console.error("admin user sessions load failed", err);
      setError(err instanceof Error ? err.message : "사용자 세션을 불러오지 못했습니다.");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerUser(null);
    setUserSessions([]);
    setSessionDetail(null);
  }, []);

  useEffect(() => {
    if (!drawerUser) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerUser, closeDrawer]);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    setDetailLoading(true);
    try {
      const response = await api.getAdminSessionDetail(sessionId, 100);
      setSessionDetail(response);
    } catch (err) {
      console.error("admin session detail load failed", err);
      setError(err instanceof Error ? err.message : "세션 메시지를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const impersonate = useCallback(async (user: UserRow) => {
    const impersonationWindow = window.open("about:blank", "_blank");
    try {
      const res = await api.adminImpersonate(user.user_id);
      const nextUrl = `/impersonate?token=${encodeURIComponent(res.token)}&next=${encodeURIComponent("/chat")}`;
      if (impersonationWindow) impersonationWindow.location.href = nextUrl;
      else window.open(nextUrl, "_blank");
    } catch (err) {
      if (impersonationWindow) impersonationWindow.close();
      alert(err instanceof Error ? err.message : "대리 로그인 실패");
    }
  }, []);

  const toggleSort = useCallback((key?: string) => {
    if (!key) return;
    setPage(1);
    setSort((prev) => {
      if (prev === key) {
        setOrder((dir) => (dir === "desc" ? "asc" : "desc"));
        return prev;
      }
      setOrder("desc");
      return key;
    });
  }, []);

  const summary = useMemo(() => data?.summary || {}, [data?.summary]);
  const users = data?.users || [];
  const total = data?.pagination?.total ?? users.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(total, page * pageSize);

  const topStats = useMemo(() => [
    { label: "전체 가입자", value: formatNumber(summary.total_users), sub: `30일 신규 ${formatNumber(summary.new_users_30d)}` },
    { label: "활성 사용자", value: formatNumber(summary.active_users), sub: `정지 ${formatNumber(summary.suspended_users)} / 삭제 ${formatNumber(summary.deleted_users)}` },
    { label: "Customer Tenant", value: formatNumber(summary.customer_tenants), sub: `전체 tenant ${formatNumber(summary.total_tenants)}` },
    { label: `${data?.window_days || days}일 비용`, value: formatUsd(summary.usage_cost_window), sub: `7일 ${formatUsd(summary.usage_cost_7d)}` },
    { label: "채팅 활동", value: formatNumber(summary.chat_messages_window), sub: `세션 ${formatNumber(summary.chat_sessions_window)}` },
  ], [data?.window_days, days, summary]);

  const filterActive = Boolean(query || role || status) || !activeOnly;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Admin Users" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div style={{ color: "var(--text-primary)", fontSize: "22px", fontWeight: 700 }}>
                사용자 가입·사용 현황
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                운영 DB 기준 집계 · 최근 갱신 {formatDateTime(data?.generated_at)}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={days}
                onChange={(event) => { setDays(Number(event.target.value)); setPage(1); }}
                style={controlStyle}
                aria-label="집계 기간"
              >
                <option value={7}>7일</option>
                <option value={30}>30일</option>
                <option value={90}>90일</option>
              </select>
              <button
                type="button"
                onClick={() => loadOverview(true)}
                style={{
                  height: "36px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {refreshing ? "갱신 중" : "새로고침"}
              </button>
            </div>
          </div>

          {error ? <div style={{ ...cardStyle, color: "var(--danger)" }}>{error}</div> : null}

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            {topStats.map((item) => (
              <div key={item.label} style={cardStyle}>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "6px" }}>{item.label}</div>
                <div style={{ color: "var(--text-primary)", fontSize: "22px", fontWeight: 700 }}>
                  {loading ? "..." : item.value}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "6px" }}>{item.sub}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "users" as TabKey, label: `사용자 ${formatNumber(total)}` },
              { key: "tenants" as TabKey, label: `Tenant ${formatNumber(data?.tenants?.length || 0)}` },
              { key: "insights" as TabKey, label: "플랜·가입추이" },
            ]).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                style={{
                  height: "34px",
                  padding: "0 14px",
                  borderRadius: "999px",
                  border: `1px solid ${tab === item.key ? "var(--accent)" : "var(--border)"}`,
                  background: tab === item.key ? "var(--accent)" : "var(--bg-card)",
                  color: tab === item.key ? "#fff" : "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "users" ? (
            <section style={cardStyle}>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: "12px" }}>
                <input
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder="이메일·이름 검색"
                  style={{ ...controlStyle, minWidth: "200px", flex: "1 1 220px" }}
                  aria-label="사용자 검색"
                />
                <select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }} style={controlStyle} aria-label="권한 필터">
                  <option value="">권한 전체</option>
                  <option value="ceo">ceo</option>
                  <option value="admin">admin</option>
                  <option value="user">user</option>
                </select>
                <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} style={controlStyle} aria-label="상태 필터">
                  <option value="">상태 전체</option>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="deleted">deleted</option>
                </select>
                <label
                  className="flex items-center gap-2"
                  style={{ ...controlStyle, display: "inline-flex", cursor: "pointer", color: "var(--text-secondary)" }}
                  title="e2e/test/qa/codex/legacy 계정과 삭제 계정을 숨깁니다"
                >
                  <input
                    type="checkbox"
                    checked={activeOnly}
                    onChange={(event) => { setActiveOnly(event.target.checked); setPage(1); }}
                  />
                  테스트 계정 숨김
                </label>
                <select
                  value={pageSize}
                  onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                  style={controlStyle}
                  aria-label="페이지당 행 수"
                >
                  <option value={20}>20행</option>
                  <option value={30}>30행</option>
                  <option value={50}>50행</option>
                  <option value={100}>100행</option>
                </select>
                {filterActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQueryInput("");
                      setQuery("");
                      setRole("");
                      setStatus("");
                      setActiveOnly(true);
                      setPage(1);
                    }}
                    style={smallButtonStyle}
                  >
                    필터 초기화
                  </button>
                ) : null}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ ...tableStyle, minWidth: "980px" }}>
                  <thead>
                    <tr style={headRowStyle}>
                      {USER_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          style={{
                            ...thStyle,
                            textAlign: column.align === "right" ? "right" : "left",
                            cursor: column.sortKey ? "pointer" : "default",
                            whiteSpace: "nowrap",
                            color: column.sortKey === sort ? "var(--accent)" : "var(--text-secondary)",
                          }}
                          onClick={() => toggleSort(column.sortKey)}
                        >
                          {column.label}
                          {column.sortKey === sort ? (order === "desc" ? " ▼" : " ▲") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <TableEmpty colSpan={USER_COLUMNS.length} loading={loading} />
                    ) : users.map((user) => (
                      <tr key={user.user_id} style={bodyRowStyle}>
                        <td style={{ ...tdStyle, minWidth: "220px" }}>
                          <div style={{ fontWeight: 600 }}>{user.name || user.email.split("@")[0] || "-"}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", fontSize: "12px" }}>
                            <span>{user.email}</span>
                            <button
                              type="button"
                              onClick={() => impersonate(user)}
                              aria-label={`${user.email} 로 대리 로그인`}
                              title="대리 로그인 (새 창에서 해당 사용자로 로그인)"
                              style={loginIconLinkStyle}
                            >
                              <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none">
                                <path d="M8 16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                                <path d="M12 14l4-4-4-4M16 10H7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td style={tdStyle}>{user.role}</td>
                        <td style={{ ...tdStyle, color: statusColor(user.status) }}>{user.status}</td>
                        <td style={tdStyle}>{user.default_tenant_name || "-"}</td>
                        <td style={numTdStyle}>{formatNumber(user.sessions_30d)}</td>
                        <td style={numTdStyle}>{formatNumber(user.messages_30d)}</td>
                        <td style={numTdStyle}>{formatNumber(user.tokens_30d)}</td>
                        <td style={numTdStyle}>{formatUsd(user.cost_30d)}</td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDateTime(user.created_at)}</td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDateTime(user.last_seen_at)}</td>
                        <td style={tdStyle}>
                          <button type="button" onClick={() => openDrawer(user)} style={smallButtonStyle}>
                            세션
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: "12px" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                  {formatNumber(rangeFrom)}–{formatNumber(rangeTo)} / 총 {formatNumber(total)}명
                  {activeOnly ? " (테스트·삭제 계정 제외)" : ""}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1} style={pagerStyle(page <= 1)}>
                    이전
                  </button>
                  <span style={{ color: "var(--text-primary)", fontSize: "13px", minWidth: "72px", textAlign: "center" }}>
                    {page} / {totalPages}
                  </span>
                  <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} style={pagerStyle(page >= totalPages)}>
                    다음
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {tab === "tenants" ? (
            <section style={cardStyle}>
              <SectionTitle title="Tenant 현황" right={`내부 활성 멤버 ${formatNumber(summary.internal_active_memberships)}`} />
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={headRowStyle}>
                      <th style={thStyle}>Tenant</th>
                      <th style={thStyle}>종류</th>
                      <th style={thStyle}>상태</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>활성 멤버</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>대기 초대</th>
                      <th style={thStyle}>생성일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.tenants || []).length === 0 ? (
                      <TableEmpty colSpan={6} loading={loading} />
                    ) : data?.tenants.map((tenant) => (
                      <tr key={tenant.tenant_id} style={bodyRowStyle}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{tenant.name}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{tenant.slug}</div>
                        </td>
                        <td style={tdStyle}>{tenant.kind}</td>
                        <td style={{ ...tdStyle, color: statusColor(tenant.status) }}>{tenant.status}</td>
                        <td style={numTdStyle}>{formatNumber(tenant.active_members)}</td>
                        <td style={numTdStyle}>{formatNumber(tenant.pending_invites)}</td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDateTime(tenant.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === "insights" ? (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <section style={cardStyle}>
                <SectionTitle title="플랜 분포" />
                <div className="grid gap-2">
                  {(data?.plans || []).length === 0 ? (
                    <EmptyText loading={loading} />
                  ) : data?.plans.map((item) => (
                    <RowBar key={item.plan} label={item.plan || "unassigned"} value={item.users} max={summary.total_users || 1} />
                  ))}
                </div>
              </section>

              <section style={cardStyle}>
                <SectionTitle title="멤버십 역할" />
                <div className="grid gap-2">
                  {(data?.membership_roles || []).length === 0 ? (
                    <EmptyText loading={loading} />
                  ) : data?.membership_roles.map((item) => (
                    <div key={`${item.role}-${item.status}`} className="flex items-center justify-between gap-3">
                      <span style={{ color: "var(--text-primary)", fontSize: "13px" }}>
                        {item.role} <span style={{ color: statusColor(item.status) }}>{item.status}</span>
                      </span>
                      <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>{formatNumber(item.memberships)}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section style={cardStyle}>
                <SectionTitle title="최근 가입 추이" />
                <div className="flex items-end gap-1" style={{ height: "112px" }}>
                  {(data?.daily || []).map((item) => {
                    const max = Math.max(1, ...(data?.daily || []).map((row) => row.signups));
                    const height = Math.max(6, Math.round((item.signups / max) * 96));
                    return (
                      <div key={item.day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${item.day}: ${item.signups}`}>
                        <div style={{ width: "100%", height, background: "var(--accent)", borderRadius: "4px 4px 0 0", opacity: item.signups ? 0.9 : 0.2 }} />
                        <span style={{ color: "var(--text-secondary)", fontSize: "10px" }}>{item.day.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>

      {drawerUser ? (
        <>
          <div
            onClick={closeDrawer}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60 }}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-label="사용자 세션"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(560px, 100vw)",
              background: "var(--bg-card)",
              borderLeft: "1px solid var(--border)",
              zIndex: 61,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex items-start justify-between gap-3" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--text-primary)", fontSize: "15px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {drawerUser.name || drawerUser.email}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "2px" }}>
                  {drawerUser.email} · {drawerUser.role} · Tenant {formatNumber(drawerUser.tenant_count)}개
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "2px" }}>
                  세션 {formatNumber(drawerUser.sessions_30d)} · 메시지 {formatNumber(drawerUser.messages_30d)} · 비용 {formatUsd(drawerUser.cost_30d)}
                </div>
              </div>
              <button type="button" onClick={closeDrawer} style={{ ...smallButtonStyle, flex: "0 0 auto" }} aria-label="닫기">
                닫기
              </button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
              <SectionTitle title="세션" right={sessionsLoading ? "로딩 중" : `${userSessions.length}건`} />
              {userSessions.length === 0 ? (
                <EmptyText loading={sessionsLoading} />
              ) : (
                <div className="grid gap-2">
                  {userSessions.map((session) => (
                    <button
                      key={session.session_id}
                      type="button"
                      onClick={() => loadSessionDetail(session.session_id)}
                      style={{
                        textAlign: "left",
                        border: `1px solid ${sessionDetail?.session?.session_id === session.session_id ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: "8px",
                        padding: "10px",
                        background: "var(--bg-hover)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 600 }}>
                        {session.title || session.session_id.slice(0, 8)}
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "3px" }}>
                        {session.workspace || "-"} · {session.tenant_name || "-"} · 메시지 {formatNumber(session.message_count)} · {formatDateTime(session.updated_at || session.created_at)}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {sessionDetail || detailLoading ? (
                <div style={{ marginTop: "16px" }}>
                  <SectionTitle
                    title={sessionDetail?.session?.title || "세션 메시지"}
                    right={detailLoading ? "로딩 중" : sessionDetail ? `${sessionDetail.messages.length}개` : undefined}
                  />
                  {!sessionDetail ? (
                    <EmptyText loading={detailLoading} />
                  ) : (
                    <div className="grid gap-3">
                      {sessionDetail.messages.map((message) => (
                        <div
                          key={message.message_id}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            padding: "10px",
                            background: message.role === "user" ? "var(--bg-hover)" : "transparent",
                          }}
                        >
                          <div className="flex items-center justify-between gap-3" style={{ marginBottom: "6px" }}>
                            <strong style={{ color: message.role === "user" ? "var(--accent)" : "var(--text-primary)", fontSize: "12px" }}>
                              {message.role}
                            </strong>
                            <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{formatDateTime(message.created_at)}</span>
                          </div>
                          <div style={{ color: "var(--text-primary)", fontSize: "13px", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                            {message.content || "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function SectionTitle({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ marginBottom: "12px" }}>
      <h2 style={{ color: "var(--text-primary)", fontSize: "15px", fontWeight: 700 }}>{title}</h2>
      {right ? <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{right}</span> : null}
    </div>
  );
}

function EmptyText({ loading }: { loading: boolean }) {
  return <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>{loading ? "로딩 중..." : "표시할 데이터가 없습니다."}</div>;
}

function RowBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(3, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: "4px" }}>
        <span style={{ color: "var(--text-primary)", fontSize: "13px" }}>{label}</span>
        <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>{formatNumber(value)}</strong>
      </div>
      <div style={{ height: "6px", background: "var(--bg-hover)", borderRadius: "999px", overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: "var(--accent)" }} />
      </div>
    </div>
  );
}

function TableEmpty({ colSpan, loading }: { colSpan: number; loading: boolean }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ ...tdStyle, textAlign: "center", color: "var(--text-secondary)" }}>
        {loading ? "로딩 중..." : "표시할 데이터가 없습니다."}
      </td>
    </tr>
  );
}

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  minWidth: "760px",
};

const headRowStyle = {
  borderBottom: "1px solid var(--border)",
  color: "var(--text-secondary)",
};

const bodyRowStyle = {
  borderBottom: "1px solid var(--border)",
};

const thStyle = {
  textAlign: "left" as const,
  padding: "10px 8px",
  fontSize: "12px",
  fontWeight: 600,
};

const tdStyle = {
  padding: "10px 8px",
  color: "var(--text-primary)",
  fontSize: "13px",
  verticalAlign: "top" as const,
};

const numTdStyle = {
  ...tdStyle,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
};

const smallButtonStyle = {
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid var(--border)",
  background: "var(--bg-hover)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 600,
};

function pagerStyle(disabled: boolean) {
  return {
    ...smallButtonStyle,
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const loginIconLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  background: "var(--bg-hover)",
  color: "var(--accent)",
  textDecoration: "none",
  flex: "0 0 auto",
  cursor: "pointer",
};
