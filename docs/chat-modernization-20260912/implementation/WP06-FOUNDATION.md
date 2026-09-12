# WP06 Foundation — bounded rendering policies

## Scope and preservation

This safe increment adds pure, opt-in policy functions for the WP06 rendering work. It does not
modify `page.tsx`, message transport, the composer, an API contract, or the production render path.
The existing WP02 viewport controller, WP03 runtime, and WP04 adapter remain authoritative.

## Implemented policies

- Keep visible rows and prioritized focus/search/reply pins inside a fixed mounted-row budget.
- Permit one layout correction per revision only while the captured gesture epoch remains current.
- Reserve bounded image geometry before load and evict only unpinned cached pages.
- Subscribe only the active bubble to token revisions; stable historical row keys remain unchanged.
- Classify incomplete streaming Markdown without trimming or rewriting source/copy text.
- Merge out-of-order tool events by durable tool ID while bounding preview content.
- Announce terminal execution states once and suppress token-by-token live-region noise.

## Verification

Node 24 with the lockfile dependency tree:

```text
npm run typecheck                                      PASS
focused T03/T12/T13/T14/T15/T31/T44                  7 passed
rendering test suite                                  22 passed
npm run test:chat                                     24 passed
npm run selftest                                      6 passed
focused ESLint                                        0 errors, 0 warnings
git diff --check                                      PASS
```

## Remaining activation gates

This is not full WP06 activation. Consumer wiring, real virtual-list DOM behavior, renderer
equivalence, focus restoration, browser/device accessibility, and measured latency/heap budgets
remain blocked on WP04/WP05 integration. Rollback is a revert of this additive policy/test/document
commit; it changes no runtime flag, stored data, API, or deployed behavior.
