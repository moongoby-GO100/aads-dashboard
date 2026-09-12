# WP07 Foundation — scoped composer and artifact policies

## Scope and preservation

This safe increment adds pure, opt-in contracts for the WP07 composer and artifact work. It does not
modify `page.tsx`, the active `ChatInput`, transport/runtime state, API calls, dependencies, server
code, feature flags or deployment scripts. Existing production input, upload, voice, artifact,
search, edit, branch and model-selection behavior remains authoritative.

## Implemented policies

- Scope tab drafts by `tenant:user:session:branch:tab`, persist only an explicit non-secret schema in
  caller-provided session storage, fall back to memory after blocked/quota storage, and expose tenant
  and logout purge operations with a cleanup-success result.
- Apply one Enter precedence table: IME/native composition/keyCode 229, slash or mention selection,
  Shift+Enter, duplicate-submit guard, then ordinary submit.
- Fence upload callbacks by scope, generation and attempt identity; make completed/cancelled entries
  terminal and provide idempotent abort, media-track and Blob URL cleanup ownership.
- Suppress artifact list requests while the panel is hidden, allow direct-link detail loading, and
  reject responses from an older request, artifact or tenant/user/session scope.
- Capture requested model/account/role selection per command and append actual provider attempts in
  ledger order without mutating the request snapshot; retain fallback reason, usage and cost fields.

## Verification

Node 24 with the existing lockfile dependency tree:

```text
npm run typecheck                                      PASS
focused T16/T17/T18/T23/T24/T27                      5 passed
npm run test:chat                                     PASS (includes the 5 focused cases)
npm run selftest                                      PASS
npm run test:chat:security                            PASS
npm run test:chat:docs                                PASS
focused ESLint                                        PASS
git diff --check                                      PASS
```

## Remaining activation gates

This is not full WP07 activation. Wiring into the production composer/artifact panel, debounce and
visibility flush effects, durable send receipt linkage, retry UI, actual FileReader/MediaRecorder
ownership, server MIME/size/tenant binding, search/edit/branch integration, model-attempt API data,
multi-tab notification behavior, and browser/mobile/IME/device validation remain gated on WP04,
WP05 and WP06 integration. Rollback is deletion or revert of these additive modules, tests and docs;
no runtime state, stored data, API or deployed behavior changes in this increment.
