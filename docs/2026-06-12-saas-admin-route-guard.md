# 2026-06-12 SaaS Admin Route Guard

## Scope

- General SaaS users must not enter internal admin/home routes.
- CEO/internal admin accounts must keep the original admin menu and home access.
- Backend admin APIs remain protected by `require_internal_admin`; this change adds a dashboard route guard before page render.

## Change

- `src/middleware.ts` now treats `/`, `/admin`, `/project-status`, `/conversations`, `/channels`, `/managers`, `/decisions`, `/tasks`, `/design`, `/projects`, `/ops`, `/lessons`, `/flow`, `/reports`, and `/server-status` as internal admin routes.
- For those routes, the middleware calls `/api/v1/auth/me` with the `aads_token` cookie and allows the request only when `is_internal_admin` is true.
- Non-internal users with a valid token are redirected to `/chat`.
- Unauthenticated users are still redirected to `/login?redirect=...`.

## Verification

- `npm run lint -- src/middleware.ts` passed.
- Operating DB check showed `internal` active memberships are limited to the two CEO accounts; removed internal memberships remain non-active for historical users.
- No backend schema or data mutation was required for this UI guard.

## Remaining Validation

- After deployment, verify `/admin/users` with:
  - no cookie: login redirect,
  - customer user cookie: `/chat` redirect,
  - CEO cookie: HTTP 200 admin page.
