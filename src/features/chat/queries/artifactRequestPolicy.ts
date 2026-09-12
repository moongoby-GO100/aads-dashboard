export type ArtifactScope = Readonly<{
  tenantId: string;
  userId: string;
  sessionId: string;
}>;

export type ArtifactFetchPlan = Readonly<{
  fetchList: boolean;
  fetchArtifactId: string | null;
  reason: "hidden" | "panel-open" | "direct-link" | "cached";
}>;

export function artifactScopeKey(scope: ArtifactScope): string {
  const parts = [scope.tenantId, scope.userId, scope.sessionId].map((value) => value.trim());
  if (parts.some((value) => !value)) throw new TypeError("complete artifact scope is required");
  return parts.map(encodeURIComponent).join(":");
}

export function planArtifactFetch(input: Readonly<{
  panelOpen: boolean;
  directArtifactId: string | null;
  listCached: boolean;
  detailCached: boolean;
}>): ArtifactFetchPlan {
  if (input.directArtifactId && !input.detailCached) {
    return { fetchList: input.panelOpen && !input.listCached, fetchArtifactId: input.directArtifactId, reason: "direct-link" };
  }
  if (!input.panelOpen) return { fetchList: false, fetchArtifactId: null, reason: "hidden" };
  if (input.listCached) return { fetchList: false, fetchArtifactId: null, reason: "cached" };
  return { fetchList: true, fetchArtifactId: null, reason: "panel-open" };
}

export type ArtifactRequestToken = Readonly<{
  requestId: number;
  scopeKey: string;
  artifactId: string | null;
}>;

/** A late A response cannot overwrite the latest request for B or another scope. */
export function createArtifactRequestGuard(): Readonly<{
  begin(scope: ArtifactScope, artifactId?: string | null): ArtifactRequestToken;
  accepts(token: ArtifactRequestToken, currentScope: ArtifactScope, currentArtifactId?: string | null): boolean;
  invalidate(): void;
}> {
  let requestId = 0;
  return {
    begin(scope, artifactId = null) {
      requestId += 1;
      return { requestId, scopeKey: artifactScopeKey(scope), artifactId };
    },
    accepts(token, currentScope, currentArtifactId = null) {
      return token.requestId === requestId
        && token.scopeKey === artifactScopeKey(currentScope)
        && token.artifactId === currentArtifactId;
    },
    invalidate() { requestId += 1; },
  };
}
