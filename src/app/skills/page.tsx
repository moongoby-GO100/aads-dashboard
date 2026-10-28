"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import SkillDialog, { type DialogRequest } from "@/components/skills/SkillDialog";
import { SkillDetailView } from "@/components/skills/SkillDetail";
import { FilterBar, SkillList } from "@/components/skills/SkillList";
import { BUTTON_PLAIN, MUTED } from "@/components/skills/skillStyles";
import { getMe } from "@/lib/auth";
import {
  EMPTY_FILTERS, filterSkills, NO_PERMISSIONS, parseSkillDetail, parseSkillList, permissionsFor, projectOptions, skillErrorMessage,
  type SkillAction, type SkillDetail, type SkillFilters, type SkillPermissions, type SkillSummary, type VersionAction,
} from "@/lib/skillCatalog";
import { skillsApi } from "@/lib/skillsApi";

type LoadState = "loading" | "ready" | "error";
type DetailState = { status: "idle" | "loading" | "ready" | "error"; data: SkillDetail | null; error: string };

function ErrorBox({ text, onRetry, testId }: { text: string; onRetry: () => void; testId: string }) {
  return (
    <div role="alert" data-testid={testId} style={{ fontSize: 14, lineHeight: 1.5, color: "var(--danger)" }}>
      <p style={{ margin: "0 0 10px", overflowWrap: "anywhere" }}>{text}</p>
      <button type="button" onClick={onRetry} style={BUTTON_PLAIN}>다시 시도</button>
    </div>
  );
}

export default function SkillsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [filters, setFilters] = useState<SkillFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: "idle", data: null, error: "" });
  const [perms, setPerms] = useState<SkillPermissions>(NO_PERMISSIONS);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const listSeq = useRef(0);
  const detailSeq = useRef(0);
  const selectedRef = useRef<string | null>(null);

  const loadList = useCallback(async () => {
    const seq = ++listSeq.current;
    const result = await skillsApi.list();
    if (seq !== listSeq.current) return;
    if (result.ok) {
      const parsed = parseSkillList(result.data);
      if (parsed) {
        setSkills(parsed);
        setLoadState("ready");
        return;
      }
      setLoadError("서버 응답을 읽을 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
    } else {
      setLoadError(result.status === 403 ? "스킬 목록을 볼 권한이 없습니다." : skillErrorMessage(result));
    }
    setLoadState((prev) => (prev === "ready" ? prev : "error"));
  }, []);

  const loadDetail = useCallback(async (skillId: string, quiet: boolean) => {
    const seq = ++detailSeq.current;
    if (!quiet) setDetail({ status: "loading", data: null, error: "" });
    const result = await skillsApi.detail(skillId);
    if (seq !== detailSeq.current) return;
    if (result.ok) {
      const parsed = parseSkillDetail(result.data);
      if (parsed) {
        setDetail({ status: "ready", data: parsed, error: "" });
        return;
      }
    }
    const error = result.ok ? "서버 응답을 읽을 수 없습니다." : skillErrorMessage(result);
    setDetail((prev) => (quiet && prev.status === "ready" ? prev : { status: "error", data: null, error }));
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadList);
    void getMe().then((user) => setPerms(permissionsFor(user)));
  }, [loadList]);

  const select = useCallback((skillId: string | null) => {
    selectedRef.current = skillId;
    setSelectedId(skillId);
    if (skillId) {
      void loadDetail(skillId, false);
    } else {
      detailSeq.current += 1;
      setDetail({ status: "idle", data: null, error: "" });
    }
  }, [loadDetail]);

  const retryList = useCallback(() => {
    setLoadState("loading");
    void loadList();
  }, [loadList]);

  const afterChange = useCallback(() => {
    void loadList();
    if (selectedRef.current) void loadDetail(selectedRef.current, true);
  }, [loadDetail, loadList]);

  const openAction = useCallback((action: SkillAction) => setDialog({ kind: action }), []);
  const openVersionAction = useCallback((version: string, action: VersionAction) => {
    const fromStatus = detail.data?.versions.find((v) => v.version === version)?.status ?? "";
    setDialog(action === "validate" ? { kind: "validate", version } : { kind: "promote", version, fromStatus });
  }, [detail.data]);

  const projects = useMemo(() => projectOptions(skills), [skills]);
  const shown = useMemo(() => filterSkills(skills, filters), [skills, filters]);
  const hasSelection = selectedId !== null;

  const detailPane = (() => {
    if (detail.status === "loading") return <p role="status" style={{ fontSize: 14, ...MUTED }}>상세를 불러오는 중입니다...</p>;
    if (detail.status === "error" && selectedId) {
      return <ErrorBox testId="skill-detail-error" text={detail.error} onRetry={() => void loadDetail(selectedId, false)} />;
    }
    if (detail.status === "ready" && detail.data) {
      return (
        <SkillDetailView
          detail={detail.data}
          perms={perms}
          busy={dialog !== null}
          onAction={openAction}
          onVersionAction={openVersionAction}
          onBack={() => select(null)}
        />
      );
    }
    return <p style={{ fontSize: 14, ...MUTED }}>왼쪽 목록에서 스킬을 선택하면 상세가 여기에 표시됩니다.</p>;
  })();

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="스킬" />
      <div className="flex-1 min-h-0 md:flex">
        <section
          aria-label="스킬 목록"
          className={`${hasSelection ? "hidden md:block" : "block"} md:w-[420px] md:shrink-0 md:border-r h-full overflow-auto p-4 md:p-5`}
          style={{ borderColor: "var(--border)", paddingBottom: 96, boxSizing: "border-box" }}
        >
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>스킬 관리</h1>
          <p style={{ margin: "4px 0 14px", fontSize: 13, lineHeight: 1.5, ...MUTED }}>
            업무 자동화 스킬의 버전과 실행 기록을 확인하고, 조회 전용 스킬은 바로 실행할 수 있습니다.
          </p>
          {loadState === "loading" && <p role="status" data-testid="skill-loading" style={{ fontSize: 14, ...MUTED }}>스킬 목록을 불러오는 중입니다...</p>}
          {loadState === "error" && <ErrorBox testId="skill-list-error" text={loadError} onRetry={retryList} />}
          {loadState === "ready" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <FilterBar filters={filters} projects={projects} onChange={setFilters} />
              <p data-testid="skill-count" style={{ margin: 0, fontSize: 12, ...MUTED }}>{shown.length} / {skills.length}개</p>
              <SkillList
                skills={shown}
                totalCount={skills.length}
                filters={filters}
                selectedId={selectedId}
                onSelect={select}
                onResetFilters={() => setFilters(EMPTY_FILTERS)}
              />
            </div>
          )}
        </section>
        <section
          aria-label="스킬 상세"
          className={`${hasSelection ? "block" : "hidden md:block"} flex-1 min-w-0 h-full overflow-auto p-4 md:p-5`}
          style={{ paddingBottom: 96, boxSizing: "border-box" }}
        >
          {detailPane}
        </section>
      </div>
      {dialog && detail.data && (
        <SkillDialog request={dialog} skill={detail.data} onClose={() => setDialog(null)} onChanged={afterChange} />
      )}
    </div>
  );
}
