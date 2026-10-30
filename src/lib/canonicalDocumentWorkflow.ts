export type CanonicalAction = "review" | "approve" | "archive";

const REQUIRED_STATUS: Record<CanonicalAction, string> = {
  review: "draft",
  approve: "review",
  archive: "approved",
};

export function canTransitionDocument(status: string, action: CanonicalAction, hasRevision: boolean): boolean {
  return hasRevision && status === REQUIRED_STATUS[action];
}

export function canTransitionDocumentForHead(
  latestStatus: string, hasLatest: boolean, approvedStatus: string, hasApproved: boolean, action: CanonicalAction,
): boolean {
  return action === "archive"
    ? canTransitionDocument(approvedStatus, action, hasApproved)
    : canTransitionDocument(latestStatus, action, hasLatest);
}

export interface SessionCanonicalDocument {
  project: string; document_key: string; revision?: number | null;
  title?: string | null; approved?: boolean; at?: string | null;
  is_latest?: boolean; latest_revision?: number | null; approved_revision?: number | null;
  in_review?: boolean; superseded?: boolean;
}

export function groupCanonicalDocuments(documents: SessionCanonicalDocument[]) {
  const groups = new Map<string, SessionCanonicalDocument[]>();
  for (const document of documents) {
    const id = `${document.project}/${document.document_key}`;
    const revisions = groups.get(id) ?? [];
    revisions.push(document);
    groups.set(id, revisions);
  }
  return [...groups.entries()].map(([id, revisions]) => {
    const sorted = [...revisions].sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0));
    const latest = sorted.find(document => document.is_latest === true) ?? sorted[0];
    const previous = sorted.filter(document => document !== latest);
    const approvedRevision = latest.approved_revision ?? sorted.find(document => document.approved)?.revision;
    return { id, latest, previous, approvedRevision };
  });
}

export type CanonicalDocumentGroup = ReturnType<typeof groupCanonicalDocuments>[number];

export function sortCanonicalGroupsForReview(
  groups: CanonicalDocumentGroup[],
  isWaiting: (group: CanonicalDocumentGroup) => boolean,
  isApproved: (group: CanonicalDocumentGroup) => boolean,
): CanonicalDocumentGroup[] {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const rank = (group: CanonicalDocumentGroup) => isWaiting(group) ? 0 : isApproved(group) ? 2 : 1;
      return rank(a.group) - rank(b.group) || a.index - b.index;
    })
    .map(({ group }) => group);
}

export function canonicalRevisionApproved(document: SessionCanonicalDocument): boolean {
  return document.approved === true || (document.revision != null && document.revision === document.approved_revision);
}

export function canonicalLatestWaiting(document: SessionCanonicalDocument, queued: boolean, locallyApproved = false): boolean {
  return !locallyApproved && !canonicalRevisionApproved(document) && document.is_latest !== false
    && document.superseded !== true && (document.in_review ?? queued);
}
