# WP09 foundation — privacy-safe telemetry and change-impact gate

This additive increment starts from Dashboard `origin/main` at `db4e0ca`. It implements only the
independent WP09 foundation that can be verified before WP05~WP08 complete. It does not activate a
telemetry sink, change `/chat`, alter an API/DB contract, modify release scripts or deploy production.

## Scope and preservation

| Classification | Result |
| --- | --- |
| Preserve | Existing chat route, runtime, stream transport, viewport, composer, rendering, artifacts, auth, API endpoints and stored data remain untouched. |
| Add | Transport-agnostic telemetry record validation, change-impact manifest/checker, focused T37/T38/T41 tests and PR evidence template. |
| Modify | Chat CI invokes the change-impact checker and supplies a full-history comparison base; the documentation checker discovers all implementation records. |
| Delete | None. |

## Contracts

- T37/FR37: telemetry accepts only seven named event families and finite label vocabularies. Dynamic
  release/report correlation is outside metric labels. Unknown labels/measurements, malformed IDs and
  secret-shaped values fail closed. Numeric measurements are finite and capped. No content, draft,
  token text, tool input, attachment, credential, session ID or user ID field exists in the record.
- T38/FR38: Node 24 CI retains typecheck, scoped lint, selftests, Node regressions, rendering security,
  source baseline and docs gates, and adds the change-impact gate. Pull requests use full Git history so
  a missing/invalid comparison base fails rather than silently bypassing impact coverage.
- T41/FR41: each manifest entry binds trigger, FR/INV/T IDs, owner, source SHA, affected files,
  documentation, telemetry impact and rollback. Temporary hotfixes additionally require an owner,
  ISO expiry date and measurable removal condition. The PR template exposes the same evidence fields.

## Rollback

Revert the additive observability module, checker/manifest, focused test, PR template and CI/package
wiring. No database rollback, message migration, route rollback or service restart is involved.

## Verification record

The final command results for this worktree are recorded in `HANDOVER.md`. Browser E2E, release image,
candidate/standby digest, cutover, mandatory five-minute monitoring and 24-hour/7-day observation are
not claimed by this foundation and remain gated on WP05~WP08 plus the full WP09 operational release.
