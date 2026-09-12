# WP04 Dashboard — typed atomic session-view adapter

## Scope and preservation

This increment starts from clean Dashboard `origin/main` at `ba90320a3f4550ae52342c69470c6aecfeca1e46`.
It adds the client boundary for WP04's atomic session view without switching the production `/chat`
read path. Existing v1 fetches, WP02 viewport ownership, WP03 event transport, message identity,
rendering, composer, artifact, authentication and authorization behavior are preserved.

## Contract

- Accept only `schema_version=2` and `contract_version=2`.
- Require matching top-level/page session identity, snapshot timestamp, message array and all four
  non-negative revisions; reject a nested page whose session/message revision diverges.
- Treat the server cursor as opaque; do not parse, rewrite or manufacture it in the browser.
- Reject an execution/checkpoint identity mismatch and malformed phase, owner epoch or checkpoint
  content version; carry the execution phase/fence/revision into the runtime reducer.
- Ignore unknown additive fields so a compatible server can extend the response.
- Apply the normalized view only when the server advertises `production_ready=true`.
- Reuse the WP03 session epoch, applied cursor and message revision guard so a late response cannot
  overwrite a newer session or stream state.

## Verification

Node 24 with the lockfile dependency tree:

```text
npm run typecheck                                      PASS
npm run test:chat                                      22 passed
npm run lint:chat                                      0 errors, 22 existing warnings
git diff --check                                       PASS
```

The seven new cases cover opaque cursor preservation, checkpoint normalization, cross-execution
rejection, inactive-server fail-close, stale-guard application, nested scope/revision mismatch and
malformed execution fencing state.

## Activation and rollback

This commit does not call the WP04 endpoint and cannot activate v2 by itself. Activation remains
blocked until the server migration, signing secret, disposable PostgreSQL checks and cross-version
browser tests pass. Rollback is a revert of this adapter/test/documentation commit; no stored data,
API route or runtime flag is changed.
