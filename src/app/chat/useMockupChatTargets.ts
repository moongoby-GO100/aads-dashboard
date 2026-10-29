// 채팅 화면에서 수정 요청 대상을 모으는 훅 — 답장한 카드, 이 세션의 진행 중 검토 건 후보를 저장소에 올린다.
import { useEffect } from "react";
import { mockupApi } from "@/lib/mockupReviewApi";
import { mockupBindingFromArtifact, type MockupTarget } from "@/lib/mockupReviewModel";
import { mockupTargetStore } from "@/lib/mockupTargetStore";

type ArtifactLike = { id: string; metadata?: Record<string, unknown> };

const ACTIVE = new Set(["review_ready", "changes_requested", "revising"]);

async function targetOf(sessionId: string, project: string, reviewId: string, artifactId: string | null, signal: AbortSignal): Promise<MockupTarget | null> {
  const review = await mockupApi.getReview(project, reviewId, signal);
  if (review.session_id && review.session_id !== sessionId) return null;
  return {
    sessionId, project, reviewId, revisionId: review.latest_revision?.revision_id ?? null,
    artifactId, screenId: null, title: review.title, generation: review.generation,
  };
}

export function useMockupChatTargets(opts: {
  sessionId: string | null;
  replyArtifactId: string | null;
  artifacts: readonly ArtifactLike[];
  workspaceProject: string;
}): void {
  const { sessionId, replyArtifactId, artifacts, workspaceProject } = opts;

  useEffect(() => { mockupTargetStore.resetForSession(sessionId); }, [sessionId]);

  const bindingKeys = artifacts
    .map((a) => { const b = mockupBindingFromArtifact(a.metadata); return b ? `${b.project}:${b.reviewId}:${a.id}` : ""; })
    .filter(Boolean).join("|");

  useEffect(() => {
    if (!sessionId) return;
    const ctl = new AbortController();
    (async () => {
      const projects = new Set<string>();
      if (workspaceProject) projects.add(workspaceProject);
      const artifactByReview = new Map<string, string>();
      for (const a of artifacts) {
        const b = mockupBindingFromArtifact(a.metadata);
        if (b) { projects.add(b.project); artifactByReview.set(`${b.project}:${b.reviewId}`, a.id); }
      }
      // 프로젝트별 목록과 건별 상세(generation 필요)를 병렬로 읽는다. 실패한 조회는 후보에서 빠지고 화면에 알린다.
      const perProject = await Promise.all([...projects].map(async (project) => {
        try {
          const list = await mockupApi.listReviews(project, { sessionId, limit: 20 }, ctl.signal);
          const settled = await Promise.allSettled(list.items.filter((i) => ACTIVE.has(i.status)).map((it) =>
            targetOf(sessionId, project, it.review_id, artifactByReview.get(`${project}:${it.review_id}`) ?? null, ctl.signal)));
          return {
            targets: settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])),
            failed: settled.some((r) => r.status === "rejected"),
          };
        } catch {
          return { targets: [] as MockupTarget[], failed: true };
        }
      }));
      if (ctl.signal.aborted) return;
      const found = new Map<string, MockupTarget>();
      for (const p of perProject) for (const t of p.targets) found.set(`${t.project}:${t.reviewId}`, t);
      mockupTargetStore.setCandidates(sessionId, [...found.values()], perProject.some((p) => p.failed));
    })();
    return () => ctl.abort();
    // bindingKeys 가 artifacts 의 목업 연결 변화를 대신한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, workspaceProject, bindingKeys]);

  useEffect(() => {
    if (!sessionId) return;
    const artifact = replyArtifactId ? artifacts.find((a) => a.id === replyArtifactId) : undefined;
    const binding = artifact ? mockupBindingFromArtifact(artifact.metadata) : null;
    if (!artifact || !binding) { mockupTargetStore.setReply(sessionId, null); return; }
    const ctl = new AbortController();
    targetOf(sessionId, binding.project, binding.reviewId, artifact.id, ctl.signal)
      .then((t) => { if (!ctl.signal.aborted) mockupTargetStore.setReply(sessionId, t); })
      .catch(() => { if (!ctl.signal.aborted) mockupTargetStore.setReply(sessionId, null); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, replyArtifactId, bindingKeys]);
}
