"use client";
import { useCallback, useState } from "react";
import { CanonicalApprovalPanel, selectCanonicalCardRefs, shownCanonicalCardIds, type Reference } from "./CanonicalApprovalPanel";
export { allowedCanonicalReference, approvable, reviewable, canonicalReferencesFromTools, selectCanonicalCardRefs, shownCanonicalCardIds } from "./CanonicalApprovalPanel";
export const CanonicalApprovalCard = CanonicalApprovalPanel;
const referenceId = (ref: Reference) => `${ref.project}/${ref.document_key}`;
export default function CanonicalApprovalCards({ documents }: { documents: Reference[] }) {
  const refs = selectCanonicalCardRefs(documents);
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());
  const onVisibleChange = useCallback((id: string, isVisible: boolean) => {
    setVisible(prev => {
      if (prev.has(id) === isVisible) return prev;
      const next = new Set(prev);
      if (isVisible) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  if (!refs.length) return null;
  const shown = new Set(shownCanonicalCardIds(refs.map(referenceId), visible));
  return <section aria-label="채팅 정본 문서">{refs.map(ref => {
    const id = referenceId(ref);
    return <CanonicalApprovalCard key={id} {...ref} suppressed={!shown.has(id)} onVisibleChange={onVisibleChange} />;
  })}</section>;
}
