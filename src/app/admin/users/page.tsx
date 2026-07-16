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

function formatNumber(value: unknown): string {
  const num = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString("ko-KR") : "0";
}

function formatUsd(value: unknown): string {
  const num = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  return `$${(Number.isFinite(num) ? num : 0).toLocaleString("ko-KR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
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
  const normalized = value.toLowerCase();
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

export default function AdminUsersPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userSessions, setUserSessions] = useState<AdminSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<AdminSessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [resetTokenInfo, setResetTokenInfo] = useState<{ email: string; token: string; expiresAt: string } | null>(null);

  const loadOverview = useCallback(async (silent = false, windowDays = days) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await api.getAdminUsersOverview({ days: windowDays, limit: 120 });
      setData(response);
      setError("");
    } catch (err) {
      console.error("admin users overview load failed", err);
      setError(err instanceof Error ? err.message : "사용자 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const loadUserSessions = useCallback(async (user: UserRow) => {
    setSelectedUser(user);
    setSessionsLoading(true);
    setSessionDetail(null);
    try {
      const response = await api.getAdminSessions({ user_id: user.user_id, limit: 120 });
      setUserSessions(response.sessions || []);
    } catch (err) {
      console.error("admin user sessions load failed", err);
      setError(err instanceof Error ? err.message : "사용자 세션을 불러오지 못했습니다.");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

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

  const updateInternalAccess = useCallback(async (user: UserRow, enabled: boolean) => {
    setActionUserId(user.user_id);
    setError("");
    setResetTokenInfo(null);
    try {
      await api.updateAdminUserInternalAccess(user.user_id, enabled);
      await loadOverview(true);
    } catch (err) {
      console.error("internal access update failed", err);
      setError(err instanceof Error ? err.message : "내부 관리자 권한 변경 실패");
    } finally {
      setActionUserId(null);
    }
  }, [loadOverview]);

  const createResetToken = useCallback(async (user: UserRow) => {
    setActionUserId(user.user_id);
    setError("");
    try {
      const result = await api.createAdminUserPasswordResetToken(user.user_id);
      setResetTokenInfo({
        email: result.email,
        token: result.reset_token,
        expiresAt: result.expires_at,
      });
    } catch (err) {
      console.error("password reset token create failed", err);
      setError(err instanceof Error ? err.message : "비밀번호 재설정 토큰 생성 실패");
    } finally {
      setActionUserId(null);
    }
  }, []);

  const summary = useMemo(() => data?.summary || {}, [data?.summary]);
  const topStats = useMemo(() => [
    { label: "전체 가입자", value: formatNumber(summary.total_users), sub: `30일 신규 ${formatNumber(summary.new_users_30d)}` },
    { label: "활성 사용자", value: formatNumber(summary.active_users), sub: `정지 ${formatNumber(summary.suspended_users)} / 삭제 ${formatNumber(summary.deleted_users)}` },
    { label: "Customer Tenant", value: formatNumber(summary.customer_tenants), sub: `전체 tenant ${formatNumber(summary.total_tenants)}` },
    { label: "대기 초대", value: formatNumber(summary.pending_invites), sub: `활성 멤버십 ${formatNumber(summary.active_memberships)}` },
    { label: `${data?.window_days || days}일 호출`, value: formatNumber(summary.calls_window), sub: `7일 ${formatNumber(summary.calls_7d)}` },
    { label: `${data?.window_days || days}일 토큰`, value: formatNumber(summary.tokens_window), sub: `7일 ${formatNumber(summary.tokens_7d)}` },
    { label: `${data?.window_days || days}일 비용`, value: formatUsd(summary.usage_cost_window), sub: `7일 ${formatUsd(summary.usage_cost_7d)}` },
    { label: "채팅 활동", value: formatNumber(summary.chat_messages_window), sub: `세션 ${formatNumber(summary.chat_sessions_window)}` },
  ], [data?.window_days, days, summary]);

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
                가입자, tenant, 멤버십, 초대, LLM 호출·토큰·비용을 운영 DB 기준으로 집계합니다.
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={days}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setDays(next);
                  loadOverview(false, next);
                }}
                style={{
                  height: "36px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  padding: "0 10px",
                }}
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
          {resetTokenInfo ? (
            <div style={cardStyle}>
              <SectionTitle title="비밀번호 재설정 토큰" right={resetTokenInfo.email} />
              <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "8px" }}>
                만료: {formatDateTime(resetTokenInfo.expiresAt)}
              </div>
              <code style={{ display: "block", wordBreak: "break-all", color: "var(--text-primary)", fontSize: "12px" }}>
                {resetTokenInfo.token}
              </code>
            </div>
          ) : null}

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            {topStats.map((item) => (
              <div key={item.label} style={cardStyle}>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "6px" }}>{item.label}</div>
                <div style={{ color: "var(--text-primary)", fontSize: "24px", fontWeight: 700 }}>
                  {loading ? "..." : item.value}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "6px" }}>{item.sub}</div>
              </div>
            ))}
          </div>

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

          <section style={cardStyle}>
            <SectionTitle title="Tenant 현황" right={`내부 활성 멤버 ${formatNumber(summary.internal_active_memberships)}`} />
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={headRowStyle}>
                    <th style={thStyle}>Tenant</th>
                    <th style={thStyle}>종류</th>
                    <th style={thStyle}>상태</th>
                    <th style={thStyle}>활성 멤버</th>
                    <th style={thStyle}>대기 초대</th>
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
                      <td style={tdStyle}>{formatNumber(tenant.active_members)}</td>
                      <td style={tdStyle}>{formatNumber(tenant.pending_invites)}</td>
                      <td style={tdStyle}>{formatDateTime(tenant.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={cardStyle}>
            <SectionTitle title="사용자별 사용 현황" right={`최근 갱신 ${formatDateTime(data?.generated_at)}`} />
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...tableStyle, minWidth: "1120px" }}>
                <thead>
                  <tr style={headRowStyle}>
                    <th style={thStyle}>사용자</th>
                    <th style={thStyle}>권한</th>
                    <th style={thStyle}>상태</th>
                    <th style={thStyle}>기본 Tenant</th>
                    <th style={thStyle}>내부 접근</th>
                    <th style={thStyle}>Tenant 수</th>
                    <th style={thStyle}>세션</th>
                    <th style={thStyle}>메시지</th>
                    <th style={thStyle}>토큰</th>
                    <th style={thStyle}>비용</th>
                    <th style={thStyle}>가입일</th>
                    <th style={thStyle}>최근 활동</th>
                    <th style={thStyle}>세션</th>
                    <th style={thStyle}>운영 액션</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.users || []).length === 0 ? (
                    <TableEmpty colSpan={14} loading={loading} />
                  ) : data?.users.map((user) => (
                    <tr key={user.user_id} style={bodyRowStyle}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{user.name || "-"}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{user.email}</div>
                      </td>
                      <td style={tdStyle}>{user.role}</td>
                      <td style={{ ...tdStyle, color: statusColor(user.status) }}>{user.status}</td>
                      <td style={tdStyle}>{user.default_tenant_name || "-"}</td>
                      <td style={tdStyle}>{user.has_internal_access ? "허용" : "고객 전용"}</td>
                      <td style={tdStyle}>{formatNumber(user.tenant_count)}</td>
                      <td style={tdStyle}>{formatNumber(user.sessions_30d)}</td>
                      <td style={tdStyle}>{formatNumber(user.messages_30d)}</td>
                      <td style={tdStyle}>{formatNumber(user.tokens_30d)}</td>
                      <td style={tdStyle}>{formatUsd(user.cost_30d)}</td>
                      <td style={tdStyle}>{formatDateTime(user.created_at)}</td>
                      <td style={tdStyle}>{formatDateTime(user.last_seen_at)}</td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => loadUserSessions(user)}
                          style={smallButtonStyle}
                        >
                          세션 보기
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateInternalAccess(user, !user.has_internal_access)}
                            disabled={actionUserId === user.user_id}
                            style={smallButtonStyle}
                          >
                            {user.has_internal_access ? "내부 해제" : "내부 관리자"}
                          </button>
                          <button
                            type="button"
                            onClick={() => createResetToken(user)}
                            disabled={actionUserId === user.user_id}
                            style={smallButtonStyle}
                          >
                            재설정 토큰
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={cardStyle}>
            <SectionTitle
              title="사용자별 세션 접근"
              right={selectedUser ? `${selectedUser.email} · ${userSessions.length}건` : "사용자 행에서 세션 보기를 선택"}
            />
            {!selectedUser ? (
              <EmptyText loading={false} />
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ ...tableStyle, minWidth: "780px" }}>
                    <thead>
                      <tr style={headRowStyle}>
                        <th style={thStyle}>세션</th>
                        <th style={thStyle}>Tenant</th>
                        <th style={thStyle}>메시지</th>
                        <th style={thStyle}>최근 갱신</th>
                        <th style={thStyle}>열람</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userSessions.length === 0 ? (
                        <TableEmpty colSpan={5} loading={sessionsLoading} />
                      ) : userSessions.map((session) => (
                        <tr key={session.session_id} style={bodyRowStyle}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600 }}>{session.title || session.session_id.slice(0, 8)}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{session.workspace}</div>
                          </td>
                          <td style={tdStyle}>{session.tenant_name || "-"}</td>
                          <td style={tdStyle}>{formatNumber(session.message_count)}</td>
                          <td style={tdStyle}>{formatDateTime(session.updated_at || session.created_at)}</td>
                          <td style={tdStyle}>
                            <button
                              type="button"
                              onClick={() => loadSessionDetail(session.session_id)}
                              style={smallButtonStyle}
                            >
                              메시지
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", maxHeight: "520px", overflow: "auto" }}>
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
                            <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                              {formatDateTime(message.created_at)}
                            </span>
                          </div>
                          <div style={{ color: "var(--text-primary)", fontSize: "13px", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                            {message.content || "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
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
