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
