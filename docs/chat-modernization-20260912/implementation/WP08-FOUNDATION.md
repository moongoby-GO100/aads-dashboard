# WP08 Foundation — auth, tenancy and accessibility policies

## Scope and preservation

This independent foundation starts from clean Dashboard `origin/main` at `c9ceb2d`. It adds pure,
fail-closed policy functions and focused T27/T28/T31/T32 tests. It does not change `page.tsx`, the
active auth helper, runtime/transport, composer, API/DB contracts, feature flags, or production.
Existing bearer/cookie behavior therefore remains unchanged until the full cross-version WP08 gate.

## Implemented contracts

- Login return targets preserve `/chat` pathname, search and hash, normalize to a relative URL and
  reject cross-origin, scheme, protocol-relative, backslash, control-character and non-chat targets.
- Logout and tenant/user transitions produce one cleanup plan covering transports, runtime, query
  cache, drafts, completion ACKs and notifications. New-principal resources are never selected.
- Private storage keys encode tenant, user, kind and resource identity instead of sharing a global key.
- UI authorization is derived only from a scope-matching, versioned server capability response.
  Missing/malformed/cross-tenant envelopes deny every capability; viewer write grants remain denied.
- Cookie-auth requests require exact origin and unsafe methods require a matching CSRF token. Legacy
  bearer mode must omit cookie credentials so an activation cannot silently mix trust models.
- Message updates preserve focus, dialog/menu close restores its trigger, virtualized focused rows are
  pinned, terminal states are announced once, token updates are not announced, reduced motion uses
  instant movement and mobile target policy enforces the product's 44px goal.

## Verification

The focused test file maps the implemented foundation to FR27/FR28/FR31/FR32 and T27/T28/T31/T32.
Node 24 verification completed with focused T27/T28/T31/T32 `6/6`, all Node chat tests `35/35`,
rendering security `22/22`, selftests `6/6`, typecheck, documentation (`14` documents, `83` links,
`219` IDs, `44` FR mappings), change-impact and `git diff --check` passing. Scoped lint reported
zero errors and the existing 22-warning baseline. The tests use synthetic origins, principals,
tokens and capability envelopes only; no production credential, tenant data or network was accessed.

## Remaining activation gates

This is not full WP08. HttpOnly/BFF issuance and revocation, server Origin/CSRF enforcement, CORS and
SSE credential behavior, object-level server authorization, PC Agent callback compatibility, actual
cache/draft cleanup wiring, browser redirect, keyboard/screen-reader checks, 320px/200% reflow,
safe-area/rotation/visualViewport, real iOS Safari and Android Chrome remain unverified. Activation is
blocked on WP04/WP07 and those server/browser/device gates.

## Rollback

Revert the two additive policy modules, focused test, change-impact entry and documentation/HANDOVER
record. No API, database, stored data, runtime route, auth mode or deployed behavior changes.
