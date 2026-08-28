# AADS Dashboard Handover

## 2026-08-29 04:33 KST - Chat completion alert waits for stable final message

- Request: Stop the first assistant bubble from showing a completion alert while the answer is still continuing and later changing in place.
- Cause:
  - `src/app/chat/page.tsx` emitted the completion toast from the SSE `done` path even when the server had not provided a saved `message_id`.
  - That local synthetic finalization could fire the voice/toast completion alert before DB finalization, polling recovery, or later message merge stabilized the final assistant bubble.
  - Completion badges and alerts also did not reject progress-only assistant text such as "확인하겠습니다/진행하겠습니다" tails.
- Changes:
  - `src/app/chat/page.tsx`: completion badges now reject progress-only terminal text.
  - `src/app/chat/page.tsx`: added `shouldEmitCompletionAlertForMessage` so completion alerts require a final assistant message that is not incomplete/progress-only.
  - `src/app/chat/page.tsx`: SSE `done` no longer uses `execution_id` as an alert message ID fallback. If the server has not returned a saved `message_id`, the alert waits for DB finalization/polling to fetch the stable final message.
  - `src/app/chat/page.tsx`: polling/finalization completion paths pass the final message object into the alert gate.
- Verification:
  - `npx eslint src/app/chat/page.tsx` passed with existing warnings only.
  - `npx tsc --noEmit` passed.
  - `git diff --check` passed.
  - `npm run build` passed and generated `/chat`.
  - Full `npm run lint` still fails on pre-existing repository-wide lint debt outside this change.
- Deployment:
  - Not committed, pushed, or deployed in this step. Production will keep the previous behavior until the dashboard release/deploy step runs.

## 2026-08-28 17:15 KST - Chat streaming completion state stabilization

- Request: Apply the recommended fix for repeated response bubbles in session `45249276-83a1-42ca-b58d-d5f1737a388b`.
- Cause:
  - The chat UI could keep polling `streaming-status` for an execution that had already completed locally.
  - A stale `execution_id` could re-enable `streaming_placeholder` on tab focus, session entry, interval polling, or post-SSE completion checks.
  - Historical assistant messages such as `regenerated`, `interrupted_partial`, and `_archived_partial` were still rendered as normal visible bubbles when consecutive assistant history existed.
- Changes:
  - `src/app/chat/page.tsx`: added per-session completed execution tracking to prevent settled executions from being reactivated as active streaming.
  - `src/app/chat/page.tsx`: wired the settled execution guard into tab focus refresh, session entry, interval polling, server finalization merge, completion toast, and post-SSE one-shot checks.
  - `src/app/chat/page.tsx`: collapsed historical assistant trail messages behind the kept response bubble instead of surfacing them as repeated current answers.
- Verification:
  - `npx eslint src/app/chat/page.tsx` passed with existing warnings only.
  - `git diff --check -- src/app/chat/page.tsx` passed.
  - `npm run build` passed and generated `/chat`.
  - Production deploy script completed blue-green deployment; active slot: blue, standby: green, `AADS_RELEASE_SHA=41ef497b9d5d`.
  - External `/chat` verified HTTP 307 to `/login?redirect=%2Fchat`; local dashboard `/login` verified HTTP 200; `aads-dashboard` and `aads-dashboard-green` containers reported healthy.
  - Deploy script Step 7 QA returned UNKNOWN, so HTTP/container validation was used as fallback.

## 2026-08-27 07:24 KST - Chat auto-recovery status wording

- Request: Verify whether immediate response bubbles still appear, then apply the improvement if safe because the chat shows an "response interrupted" message right after a question.
- Cause:
  - The immediate `streaming_placeholder` bubble is required and should remain.
  - Auto-retry, SSE reconnect, and background completion recovery could convert a recent in-progress placeholder into `interrupted_partial` or show an interruption alert before the final answer had a chance to settle.
- Changes:
  - `src/app/chat/page.tsx`: kept the immediate assistant progress bubble behavior.
  - `src/app/chat/page.tsx`: changed inactive auto-recovery placeholders from "stopped/interrupted" wording to "response checking" wording.
  - `src/app/chat/page.tsx`: added a 120s grace window so recent streaming placeholders remain recoverable instead of being finalized as interrupted.
  - `src/app/chat/page.tsx`: separated automatic recovery alerts from manual user stop alerts.
- Verification:
  - `git diff --check` passed.
  - `npx eslint src/app/chat/page.tsx` passed with existing warnings only.
  - `npm run build` passed and generated `/chat`.
  - Full `npm run lint` still fails on pre-existing repository-wide lint debt outside this change.
- Deployment:
  - Commit `aeb4d86cae2178af29505f6c2b1c46de980ddc11` pushed to `main`.
  - `bash deploy.sh` completed blue-green deployment at 2026-08-27 07:31 KST; active slot: green, standby: blue, `AADS_RELEASE_SHA=aeb4d86cae21`.
  - External `/chat` verified HTTP 307 to `/login?redirect=%2Fchat`; external `/login` verified HTTP 200.
  - API health verified HTTP 200 via `/api/v1/health`; both `aads-dashboard-green` and `aads-dashboard` containers reported healthy.
  - Deploy script Step 7 QA returned UNKNOWN, so HTTP/API/container validation was used as fallback.

## 2026-08-25 18:29 KST - GO100 docs/reports deep-link base correction

- Request: Re-review before dashboard deployment, then commit, push, deploy, and E2E verify.
- Cause:
  - Post-deploy verification found that `docs/reports/GO100-...` links were routed to `/root/kis-autotrade-v4/reports`.
  - GO100 documents under the `docs/reports/` relative prefix actually live under the allowed backend base `/root/kis-autotrade-v4/docs` with `file_path=reports/...` on contabo14.
- Changes:
  - `src/lib/documentLinks.ts`: split GO100 project-hint mapping so `docs/reports/GO100-...` uses `/root/kis-autotrade-v4/docs` plus `reports/...`, while `reports/GO100-...` keeps `/root/kis-autotrade-v4/reports`.
  - `src/lib/documentLinks.selftest.ts`: added a regression case for an observed existing GO100 docs report filename.
- Verification:
  - `npm exec tsc -- --noEmit` passed.
  - `npm exec eslint -- src/lib/documentLinks.ts src/lib/documentLinks.selftest.ts` passed.
  - `npm exec tsc -- --target ES2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --outDir /tmp/aads-doclink-selftest src/lib/documentLinks.ts src/lib/documentLinks.selftest.ts && node /tmp/aads-doclink-selftest/documentLinks.selftest.js` passed.
  - `npm run build` passed.
  - Full `npm run lint` still fails on pre-existing repository-wide lint debt outside this change (`any`, React hook rules, refs during render).
- Deployment:
  - Commit `c629bbabd29760deb62ef89059ca0ffd4542017a` pushed to `main`.
  - `bash deploy.sh` completed blue-green deployment at 2026-08-25 18:41 KST; active slot: green, standby: blue, `AADS_RELEASE_SHA=c629bbabd297`.
  - Authenticated project-docs API verified the observed GO100 report path returns HTTP 200 from `/root/kis-autotrade-v4/docs/reports/GO100-303-STRATEGY-CARD-FULL-SYNC-20260825.md`.
  - Browser Bridge E2E tools timed out; HTTP/API/container validation used as fallback.

## 2026-08-25 17:55 KST - Project document deep-link routing fallback

- Request: Directly apply and verify the immediate improvement for document click 404s.
- Cause:
  - Relative links such as `docs/reports/GO100-...md` and `reports/GO100-...md` were normalized as AADS local `/app/docs` or `/app/reports` links.
  - GO100/KIS/SF/NTV2 project reports can live under each project server path, so AADS-local routing can open `/docs` with the wrong `project/base_path/file_path` and show a file-load 404.
- Changes:
  - `src/lib/documentLinks.ts`: added project-hint mappings before generic AADS relative path handling. Project-prefixed document/report links now route to their project document base, with GO100 reports using `/root/kis-autotrade-v4/reports`.
  - `src/lib/documentLinks.selftest.ts`: added regression cases for `reports/GO100-303-strategy-card.md` and `docs/reports/GO100-303-strategy-card.md`.
- Verification:
  - `npm exec tsc -- --noEmit` passed.
  - `npm exec tsc -- src/lib/documentLinks.selftest.ts --module commonjs --target es2020 --outDir /tmp/aads-documentlinks-test --esModuleInterop --skipLibCheck` passed.
  - `node /tmp/aads-documentlinks-test/documentLinks.selftest.js` passed.
  - `npm run build` passed and generated `/docs`.
- Deployment:
  - Not deployed, committed, or pushed in this step. Production will keep the previous behavior until the dashboard release step runs.

## 2026-08-21 16:09 KST - Mobile chat font size control

- Request: Add a way to increase/decrease chat text size on mobile because the fixed mobile fit made long-phone screens hard to read.
- Changes:
  - `src/app/chat/page.tsx`: added persisted mobile chat font size state using `localStorage` key `aads-chat-mobile-font-px`.
  - `src/app/chat/page.tsx`: added mobile-only `A-` and `A+` controls in the compact header, clamped from 17px to 24px.
  - `src/app/chat/page.tsx`: mobile message text, active stream fallback text, and message scroll container now follow the selected font size.
  - `src/app/chat/ChatInput.tsx`: mobile textarea font size follows the selected chat font size plus 1px.
  - `src/app/globals.css`: mobile chat and code font sizes now use CSS variables with readable fallbacks.
- Verification:
  - `npm run build` passed and generated `/chat`.
  - `npm run lint` still fails on pre-existing repository-wide ESLint debt unrelated to this change.
- Deployment:
  - Commit, push, and production dashboard deployment are handled in the release step for this entry.

## 2026-08-21 13:49 KST - Mobile focus mode readability pass

- Request: Implement the CEO smartphone chat UX direction immediately and clarify whether it also applies to the app.
- App scope:
  - AADS dashboard is currently a PWA/mobile web app with `public/manifest.json` `start_url=/chat`.
  - The same `/chat` dashboard code path is used by mobile browser and installed PWA app.
  - There is no separate native Android/iOS app package in this dashboard repo for this UI.
- Changes:
  - `src/app/chat/page.tsx`: mobile message bubbles now use the full available width, 17px body text, 1.75 line-height, stronger wrapping, and tighter first-screen header spacing.
  - `src/app/chat/page.tsx`: mobile empty-state prompt cards and instructions are hidden so the first screen stays focused on chat plus input.
  - `src/app/chat/page.tsx`: mobile composer buttons were enlarged and the composer received a dedicated mobile class for bottom emphasis.
  - `src/app/chat/ChatInput.tsx`: mobile textarea now has larger padding, 18px input text, 54px minimum height, stronger border, and hides the screen-share button from the default mobile first screen.
  - `src/app/globals.css`: mobile chat text, paragraph/list line-height, code text, links, header, and composer readability rules were added.
- Verification:
  - `npx eslint src/app/chat/page.tsx src/app/chat/ChatInput.tsx` passed with pre-existing warnings only.
  - `npm run build` passed and generated `/chat`.
- Deployment:
  - Included in the dashboard deployment candidate from this commit. Production health and release SHA are verified after deploy.

## 2026-08-21 13:36 KST - Mobile composer context collapse

- Request: Immediately implement the remaining mobile chat focus-mode fix.
- Cause:
  - The previous mobile focus-mode change hid major panels, but composer-level context banners still rendered at full height on mobile.
  - Yellow warning, tool-turn notice, upload status, branch banner, reply preview, and attachment thumbnails could still push the message list and input away from the first viewport.
- Changes:
  - `src/app/chat/page.tsx`: added `showMobileComposerContext` state.
  - `src/app/chat/page.tsx`: mobile composer context now appears as a single compact summary row by default.
  - `src/app/chat/page.tsx`: the original full warning/tool/upload/branch/reply/attachment details remain available by tapping the compact row.
- Verification:
  - `npx eslint src/app/chat/page.tsx` passed with pre-existing warnings only.
  - `npx tsc --noEmit --pretty false` passed.
  - `npm run build` passed and generated `/chat`.
- Deployment:
  - Not deployed in this entry. Push/deploy require an explicit release step.

## 2026-08-21 13:27 KST - Mobile chat focus mode and large-text input

- Request: Make the AADS chat usable from a smartphone by showing only the essential chat and input controls on the first screen, hiding secondary menus behind buttons, and improving readability for older eyes.
- Changes:
  - `src/app/chat/page.tsx`: mobile first row is reduced to sidebar, session title, and a settings button. Role/model/response mode/notification/voice/export/memo/artifact controls are hidden in the settings panel.
  - `src/app/chat/page.tsx`: mobile first screen hides usage bar, session summary, memory context, TODO details, and Ops Dock from the default composer area.
  - `src/app/chat/page.tsx`: mobile message bubbles use larger readable text and wider available width.
  - `src/app/chat/ChatInput.tsx`: mobile textarea increased to 18px, 52px minimum height, 220px max height, larger line-height, and safer right padding for voice/send controls.
  - `src/app/globals.css`: mobile action grid changed to two columns with larger button text and touch targets.
- Verification:
  - `npx eslint src/app/chat/page.tsx src/app/chat/ChatInput.tsx` passed with pre-existing warnings only.
  - `npx tsc --noEmit --pretty false` passed.
  - `npm run build` passed and generated `/chat`.
- Commits:
  - `0709540` `fix: improve mobile chat header controls`
  - `958203b` `fix: tune mobile chat input layout`
- Deployment:
  - Not deployed in this entry. Push/deploy require the explicit release step.

## 2026-08-21 12:45 KST - Chat completion/interruption app push and voice alerts

- Request: Verify why chat completion/interruption app push alerts are not reliably noticeable, improve the behavior, and add voice guidance.
- Finding:
  - Existing local chat notification only called `new Notification()` for completion and returned early while the chat tab was visible via `document.hidden`.
  - Interruption states such as `interrupted_partial`/`model_used=interrupted`/manual stop were not wired to the app notification path.
  - Voice output was not implemented; the chat input only had speech-to-text.
- Changes:
  - `src/services/pushNotifications.ts`: added `showLocalChatNotification()` for `completed` and `interrupted`, using Service Worker `showNotification()` when available and preserving the old hidden-tab completion wrapper.
  - `src/services/voiceAlerts.ts`: added Korean Web Speech API voice alert helper with localStorage toggle, duplicate suppression, and cancellation.
  - `src/app/chat/page.tsx`: unified completion/interruption toast, local app notification, and voice alert dispatch with per-message dedupe.
  - Added interruption alerts for SSE/stream failure partial preservation and manual stop.
  - Added a chat toolbar voice toggle button next to the app notification button.
  - Completion remains green; interruption uses amber so status is visually distinct.
- Verification:
  - `npx eslint src/app/chat/page.tsx src/services/pushNotifications.ts src/services/voiceAlerts.ts` passed with pre-existing warnings only.
  - `npm run build` passed and generated `/chat`.
  - Repository-wide `npm run lint` still fails on pre-existing lint debt outside this change.
- Deployment:
  - Not deployed in this entry. Commit/push/deploy require the explicit release step after CEO approval.

## 2026-08-20 19:33 KST - Chat completion toast and response bubble timing

- Request: Fix cases where the green `응답이 완료되었습니다` popup appears before the final assistant bubble, and where the response bubble is temporarily absent after a CEO instruction.
- Changes:
  - `src/app/chat/page.tsx`: added a shared `StreamingStatusPayload` type and `streamingStatusPath()` helper.
  - Frontend now sends `acked_completion_token` after a visible final assistant message is confirmed, so repeated `just_completed` responses are suppressed per session.
  - Streaming-status completion paths now mark completion as seen only after a final assistant message is loaded or merged.
  - SSE `done` no longer shows the completion toast for tool-only/empty final events before DB finalization produces a visible assistant bubble.
  - Invisible Recovery now renders the waiting bubble even when a stale `streaming=true` flag remains but no streaming placeholder exists.
- Verification:
  - `npx tsc --noEmit` passed.
  - `git diff --check` passed.
  - `npm run build` passed and generated `/chat`.
  - `npm run lint` was attempted but still fails on pre-existing repository-wide lint debt outside this change.
- Deployment:
  - Commit/push completed: `e7fcae49e231` on `dashboard-write/main`.
  - `bash /root/aads/aads-dashboard/deploy.sh` completed the active-slot cutover.
  - Active slot: `aads-dashboard-green` on `:3101`; standby slot: `aads-dashboard` on `:3100`.
  - External `https://aads.newtalk.kr` returned HTTP 307 to `/login?redirect=%2F`.
  - Both dashboard containers are `healthy`.

## 2026-08-20 07:43 KST - Agent Vault account edit/delete production deploy

- Request: Continue interrupted account edit/delete deploy and verify production state.
- Deployment:
  - `bash /root/aads/aads-dashboard/deploy.sh` completed blue-green deploy.
  - Release SHA: `e87821bc4fc6`.
  - Active slot: `aads-dashboard-green` on `:3101`.
  - Standby slot: `aads-dashboard` on `:3100`, synced to the same release.
- Verification:
  - External `https://aads.newtalk.kr/login` returned HTTP 200.
  - External `https://aads.newtalk.kr/agent-vault` returned HTTP 307 to `/login?redirect=%2Fagent-vault`.
  - Both dashboard containers expose `AADS_RELEASE_SHA=e87821bc4fc6`.
  - Production bundle includes Agent Vault `수정 저장`, `비활성화`, `영구 삭제`, and API client calls for `PATCH` and `DELETE`.
  - Backend external unauthenticated `PATCH`/`DELETE` probes returned HTTP 401, so the API routes are present and protected.
- Note:
  - Deploy script frontend QA ended as `UNKNOWN`; manual HTTP/API/container/bundle fallback verification was used instead.
  - Authenticated UI E2E with a real credential remains pending.

## 2026-08-20 06:41 KST - Agent Vault account edit/delete

- Request: Add account edit/delete controls to the dedicated Agent Vault UI and deploy.
- Changes:
  - `/agent-vault` account list now opens a selected-account edit panel.
  - The edit panel can update service name, label, origin, login URL, work key, project, owner, username, auth type, policy, tags, and optionally replace the password.
  - Delete behavior is split into soft disable and hard delete confirmation.
  - `src/lib/api.ts` now supports Agent Vault `PATCH` and `DELETE?hard=true`.
- Verification:
  - `npx eslint src/app/agent-vault/page.tsx` succeeded.
  - `npm run build` succeeded and generated `/agent-vault`.
  - `npx tsc --noEmit` succeeded after `next build` regenerated `.next/types`.
- Backend counterpart:
  - Requires AADS server commit with `PATCH /api/v1/agent-vault/credentials/{credential_id}` and hard-delete support.

## 2026-08-20 05:35 KST - Agent Vault Google Password Manager CSV import

- Request: Determine whether Google Account Password Manager entries can be brought into OHVIS Agent Vault and deploy the account registration UI.
- Finding:
  - Google Password Manager supports user-initiated password export as CSV, but OHVIS must not directly extract Google account passwords or persist raw CSV files server-side.
- Changes:
  - `src/app/agent-vault/page.tsx`: added a `Google CSV 가져오기` tab to the dedicated Agent Vault console.
  - The import flow parses Google/Chrome CSV headers `url`, `username`, and `password` in the browser, previews selectable rows, masks usernames, never displays raw passwords in the table, and stores only selected rows through the existing Agent Vault API.
  - Imported credentials are tagged with `source=google-password-manager-csv`, `google-password-manager`, and `imported`, while preserving the selected `work_key`, policy, project, and owner metadata.
- Verification:
  - `npx eslint src/app/agent-vault/page.tsx src/app/browser-tasks/page.tsx src/components/Sidebar.tsx` passed.
  - `npx tsc --noEmit --pretty false` passed.
  - `git diff --check` passed.
- Deployment:
  - Pending in this entry; deploy and external verification follow this note.

## 2026-08-20 05:26 KST - OHVIS Agent Vault account registration UI

- Request: Implement the dedicated account registration UI from the benchmarked Agent Vault plan.
- Changes:
  - Added `/agent-vault` admin page as a dedicated account registration and audit console.
  - Added account summary cards, work_key/origin filters, credential table, account detail panel, registration form, metadata policy fields, and access log tab.
  - Added `Agent Vault` sidebar entry and linked Managed Browser to the dedicated Vault page.
  - Removed the credential save form from `/browser-tasks` so that browser tasks remain focused on execution and approvals.
  - Stopped rendering the credential `password` field in the Managed Browser credential list; the UI now states that raw passwords are hidden.
  - Added dashboard API methods for disabling credentials and reading Vault access logs.
- Verification:
  - `npx eslint src/app/agent-vault/page.tsx src/app/browser-tasks/page.tsx src/components/Sidebar.tsx` passed.
  - `npx tsc --noEmit --pretty false` passed.
  - `npx eslint src/app/agent-vault/page.tsx src/app/browser-tasks/page.tsx src/lib/api.ts src/components/Sidebar.tsx` was attempted, but `src/lib/api.ts` still has pre-existing `@typescript-eslint/no-explicit-any` debt outside this change.
- Deployment:
  - Not deployed in this step. Commit and push were not performed.

## 2026-08-19 21:36 KST - AADS-186 Managed Browser console MVP

- Request: Complete OHVIS Managed Browser + Agent Vault implementation after runner failures.
- Changes:
  - Added `/browser-tasks` dashboard page for managed browser task creation, status scan, approval/rejection, and Agent Vault credential save/list.
  - Added browser task and Agent Vault API client methods in `src/lib/api.ts`.
  - Added `Managed Browser` admin menu item in `src/components/Sidebar.tsx`.
- Verification:
  - `npx eslint src/app/browser-tasks/page.tsx src/components/Sidebar.tsx` passed.
  - `npx tsc --noEmit --pretty false` passed.
  - `git diff --check` passed.
  - Full `npm run lint` was attempted and still fails on pre-existing repository-wide lint debt, not this new page.
- Deployment:
  - Source commit, push, and dashboard blue-green deployment were handled after this implementation verification.

## 2026-08-19 07:29 KST - Chat file download link hardening

- Request: Fix chat-generated Excel/report links that opened as `https://aads.newtalk.kr/root/aads/aads-server/...` and failed to open or download.
- Changes:
  - `src/components/chat/ChatBubble.tsx`: file download API links now use `openManagedFile()` so authenticated fetch downloads the file instead of navigating directly.
  - `src/components/chat/ArtifactReport.tsx`: artifact/report markdown links use the same managed download flow.
  - `src/lib/documentLinks.selftest.ts`: added a regression case for the exact `세무신고_필요항목_정리_20260818.xlsx` production-style URL.
- Verification:
  - `python3 -m py_compile app/api/files.py app/main.py` passed in the backend repo.
  - `npx tsc --noEmit --pretty false` passed.
  - `npx eslint src/components/chat/ChatBubble.tsx src/components/chat/ArtifactReport.tsx src/app/chat/MarkdownRenderer.tsx src/lib/documentLinks.ts src/lib/fileDownload.ts` passed with 0 errors and 3 existing `<img>` warnings.
  - `npx tsc src/lib/documentLinks.selftest.ts ... && node .../documentLinks.selftest.js` passed.
- Deployment:
  - Runtime commit `680909bfc385` was pushed to `main` and deployed with dashboard blue-green at 2026-08-19 07:37 KST.
  - Active dashboard slot switched to green on port 3101; standby blue on port 3100 was synced to the same release.
  - External `https://aads.newtalk.kr/login` returned HTTP 200 after deploy.
  - Internal authenticated-file fallback check returned HTTP 200 for `세무신고_필요항목_정리_20260818.xlsx` with 38,054 bytes and Excel MIME.
- Scope exclusions:
  - Existing unrelated dashboard/server dirty files were preserved and excluded from the selected commit.

## 2026-08-06 10:39 KST - Ably ad analyzer added to OHVIS

- Request: Make the Ably ad analysis HTML available inside OHVIS for a non-representative account that could not open the previous backend static path.
- Changes:
  - `public/apps/ably-ad-analyzer/index.html`: copied the standalone Ably ad analyzer into the dashboard public app path.
  - `src/app/marketing/ably/page.tsx`: added an OHVIS page that embeds the analyzer and provides a new-window link.
  - `src/components/Sidebar.tsx`: added a non-admin sidebar menu item, `에이블리 광고분석`.
- Verification:
  - `npx eslint src/components/Sidebar.tsx src/app/marketing/ably/page.tsx` passed.
  - Inline script syntax check for `public/apps/ably-ad-analyzer/index.html` passed.
  - Local Next.js dev server on port 3177 returned 200 for `/apps/ably-ad-analyzer/index.html`.
  - `/marketing/ably` redirects to login without a token and returns 200 with a cookie, confirming it is login-protected but not admin-only at middleware level.
- Not completed:
  - Browser rendering verification was attempted but local Chromium was not installed.
  - Commit, push, and production deploy were not performed in this step.

## 2026-08-04 20:38 KST - PC Agent auto-pair install deployed

- Request: Commit/push and deploy the PC Agent automatic pairing install flow to production.
- Result:
  - `origin/main` and `dashboard-write/main` both point to `80ef273df6ab`.
  - Dashboard blue-green deploy completed successfully; active slot is green on port 3101, standby blue on port 3100 is synced.
  - `/kakaobot/agent` was included in the production Next.js build and external HTTPS returned HTTP 200 after deploy.
- Verification:
  - `bash /root/aads/aads-dashboard/deploy.sh` passed through build, green health, Nginx reload, external health, standby sync, and release check.
  - Production unauthenticated probes confirmed backend route registration: `POST /api/v1/kakao-bot/agent/install-ticket` returned 401, `GET /api/v1/kakao-bot/agent/token` returned 401, and `GET /api/v1/kakao-bot/agent/download-exe` returned 200.
  - `aads-dashboard`, `aads-dashboard-green`, `aads-server`, and `aads-server-green` all reported Docker healthy.
- Note:
  - The deploy script frontend QA step reported `UNKNOWN`; this was not treated as pass. Manual HTTP/API/container fallback verification was completed instead.

## 2026-08-04 19:12 KST - PC Agent auto-pair install ticket route verification

- Request: Make PC Agent installation automatic so new users do not have to manually find and type an agent token.
- Finding:
  - The auto-pair UI and backend install-ticket logic were already committed, but the running backend process still returned 404 for `/api/v1/kakao-bot/agent/install-ticket` until a safe backend restart loaded the new route table.
  - A temporary no-prefix probe path redirected to the dashboard login page and must not be used by the install button.
- Change:
  - `src/app/kakaobot/agent/page.tsx`: keeps the auto install-ticket POST on `${API}/kakao-bot/agent/install-ticket`, so it uses the authenticated `/api/v1` API route.
- Verification:
  - `npx eslint src/app/kakaobot/agent/page.tsx src/app/kakaobot/settings/page.tsx` passed.
  - `npx tsc --noEmit` passed.
  - After backend blue-green deploy, public unauthenticated route probes showed `/api/v1/kakao-bot/agent/install-ticket` returns 401 instead of 404.
  - Invalid ticket exchange returned 400, confirming the exchange endpoint is registered and executing validation.
- Deployment note:
  - Backend blue-green deploy completed after target slot active streams dropped to 0; active backend moved to port 8100.
  - Dashboard redeploy is required after this verification entry.

## 2026-08-04 17:55 KST - naengmyeon menu order and gomyunghee old-shop branding

- Request: Move the donkatsu composition block to the bottom of the main menu on both Unni Naengmyeon and Gomyunghee Naengmyeon pages, because naengmyeon should remain the lead product. Also change Gomyunghee Naengmyeon homepage design and logo to an old local-shop style.
- Changes:
  - `src/app/unni-naengmyeon/page.tsx`: restored the hero to the water naengmyeon image and naengmyeon-first copy, and moved the `donkatsuFeature` block after main, solo set, double set, side, and extra/drink menu categories.
  - `src/app/unni-naengmyeon/page.module.css`: adjusted donkatsu feature spacing for its new bottom placement.
  - `src/app/gomyunghee-naengmyeon/page.tsx`: restored the hero to naengmyeon-first content, moved the donkatsu composition to the bottom, and changed metadata/copy to old signboard style.
  - `src/app/gomyunghee-naengmyeon/page.module.css`: changed the visual system to a restrained old-shop signboard palette and typography.
  - `public/brands/gomyunghee-naengmyeon/logo.svg`: replaced the logo with a red-bordered old signboard style mark and heavy Korean wordmark.
- Verification:
  - `npm run lint -- src/app/unni-naengmyeon/page.tsx src/app/gomyunghee-naengmyeon/page.tsx` passed.
  - `npm run build` passed. Next.js 16.1.6 generated both `/unni-naengmyeon` and `/gomyunghee-naengmyeon`.
  - External HTTPS checks passed: `https://unni.newtalk.kr/` returned 200 with `돈까스 메뉴 구성` after `추가 메뉴`; `https://gomyunghee.newtalk.kr/` returned 200 with the same order plus `노포 감성` and `오래된 간판처럼` text.
  - `https://gomyunghee.newtalk.kr/brands/gomyunghee-naengmyeon/logo.svg` returned 200 and served the updated old-shop SVG logo.
- Deployment:
  - Dashboard blue-green deploy completed before this entry; active dashboard upstream is green on port 3101 and both dashboard containers are healthy.
  - Local commit `f2bbae3 fix: refine naengmyeon menus and gomyunghee branding` contains the page/logo changes.
  - This HANDOVER entry is recorded in a separate local follow-up docs commit.
  - Push was not performed in this step. `main` is ahead of `dashboard-write/main` by the local page/logo and docs commits.
- Scope exclusions:
  - Existing unrelated dirty files `public/manager/env_unknown.json` and `public/manager/env_5.json` were preserved and excluded from this change.
- Rollback:
  - Revert `f2bbae3` and redeploy the dashboard to restore the previous donkatsu-first/gomyunghee styling state. Revert the follow-up docs commit to remove this handover note.

## 2026-08-04 08:31 KST - OHVIS app branding and push notification UI

- Request: Rename the current AADS app to OHVIS and support app notifications for response completion.
- Changes:
  - `public/manifest.json` and `src/app/manifest.ts`: PWA name/short name/description changed to OHVIS.
  - `src/app/layout.tsx`: default metadata and Apple web app title changed to OHVIS while keeping KakaoBot and Unni Naengmyeon host-specific metadata intact.
  - `src/app/login/page.tsx`, `src/app/signup/page.tsx`, and `src/components/Sidebar.tsx`: visible app brand changed from AADS to OHVIS.
  - `public/sw.js`: cache namespace changed to OHVIS and Push/notificationclick handlers added.
  - `src/services/pushNotifications.ts`: browser permission, VAPID lookup, PushManager subscription, server upsert, test push, and local hidden-tab notification helpers added.
  - `src/app/chat/page.tsx`: response-complete toast now also triggers a local notification when the page is hidden, and the chat header has a bell button to request app notification permission.
- Backend dependency: server endpoint `/api/v1/notifications/*` and VAPID environment variables must be deployed/configured for real background push delivery.
- Verification:
  - Rechecked at 2026-08-04 08:42 KST: `git diff --check -- public/manifest.json public/sw.js src/app/chat/page.tsx src/app/layout.tsx src/app/login/page.tsx src/app/signup/page.tsx src/app/manifest.ts src/components/Sidebar.tsx src/services/pushNotifications.ts HANDOVER.md` passed.
  - Rechecked at 2026-08-04 08:42 KST: `npx tsc --noEmit --pretty false` passed.
  - Rechecked at 2026-08-04 08:42 KST: `npx eslint src/services/pushNotifications.ts src/app/chat/page.tsx src/app/layout.tsx src/app/login/page.tsx src/app/signup/page.tsx src/app/manifest.ts src/components/Sidebar.tsx` passed with 0 errors and 21 pre-existing warnings in `src/app/chat/page.tsx`.
  - Rechecked at 2026-08-04 08:42 KST: `npm run build` passed with 62 app routes generated.
- Commit/push/deploy: not performed in this step. Existing unrelated dirty files remain in the worktree.

## 2026-07-30 16:51 KST - Unni Naengmyeon donkatsu menu and hero update

- Request: Add donkatsu menu composition and reflect a donkatsu main banner photo on the Unni Naengmyeon homepage.
- Changes:
  - `src/app/unni-naengmyeon/page.tsx`: changed the hero headline/copy and hero image to the cleaned donkatsu + naengmyeon menu photo.
  - `src/app/unni-naengmyeon/page.tsx`: added a dedicated donkatsu menu block with standalone, 1-person set, and 2-person set pricing from the existing menu data.
  - `src/app/unni-naengmyeon/page.tsx`: mapped donkatsu set menu thumbnails to the cleaned web image so Baemin screenshot UI is not exposed in the site.
  - `src/app/unni-naengmyeon/page.module.css`: added responsive layout and image positioning for the donkatsu feature block.
- Verification:
  - `npx eslint src/app/unni-naengmyeon/page.tsx` passed.
  - `npx tsc --noEmit` passed.
  - `npm run build` passed with 62 app routes generated.
  - Local production preview `http://5.104.86.116:3017/unni-naengmyeon` returned HTTP 200.
  - Screenshot checks passed for the hero and menu section.
- Deployment:
  - Feature commit `40a719d9748ba9b2e02e217a65555ee3a9be1fe9` was pushed to `dashboard-write/main`.
  - Dashboard blue-green deployment completed and both `aads-dashboard` and `aads-dashboard-green` reported release SHA `40a719d9748b`.
  - External production URL `https://unni.newtalk.kr` returned HTTP 200 and rendered the donkatsu hero/menu content.
  - Note correction: this deployment status was reconciled after the initial handover entry incorrectly said deployment was pending.

## 2026-07-28 07:08 KST - chat question echo and scroll merge hardening

- Request: Continue the interrupted fix for session `d19a0e9e-f96f-4c83-8367-20de50762364`, where submitting during an active response could jump the scroll upward and make the user's question look lost.
- Findings:
  - DB still showed a live `running` execution and one `streaming_placeholder` for the target session at 07:02 KST, so the dashboard correctly entered the interrupt/additional-instruction path.
  - The interrupt fallback path removed local `interrupt-*` user bubbles before resending as a normal message, creating a visible gap where the question disappeared if queue acceptance failed or stale streaming was cleared.
  - Tab-focus refetch, streaming safety-net, briefing, and polling completion paths still called chat bottom scrolling after server merges, even when the user was navigating a large session.
  - Large-session render caps could still drop local transient user echoes if many messages arrived after the local bubble.
- Changes:
  - `src/app/chat/page.tsx`: added a protected local question echo registry and preserves up to five local question bubbles across large-session render caps.
  - `src/app/chat/page.tsx`: stale interrupt fallback now promotes the same local `interrupt-*` bubble into normal send instead of deleting it and recreating the question.
  - `src/app/chat/page.tsx`: server merge/refetch completion scrolls now pass through a user-scroll/bottom-stick gate instead of unconditional bottom jumps.
  - `src/app/chat/page.tsx`: failed resend with an existing local echo restores the input without removing the visible question bubble.
- Verification:
  - `npx tsc --noEmit` passed.
  - `npm run build` passed with 62 app routes generated.
- Deployment:
  - Pending at the time of this note; commit/deploy after this entry.

## 2026-07-28 05:58 KST - chat submit visibility and scroll stabilization

- Request: In session `d19a0e9e-f96f-4c83-8367-20de50762364`, submitting a question during an active response made the scroll jump upward and the submitted question appear to disappear, forcing the CEO to ask again.
- Findings:
  - The session had a live `running` execution and a DB-saved `streaming_placeholder`, so new input entered the interrupt/additional-instruction path.
  - The backend saves queued interrupts as `[추가 지시] ...`, while the dashboard local echo compared the unprefixed text. This could prevent local/user echo and DB row from merging cleanly.
  - Runner/system messages were included in the render cap before being hidden, allowing large sessions with many automatic messages to push visible user messages out of the rendered window.
- Changes:
  - `src/app/chat/page.tsx`: normalize plain `[추가 지시]` prefixes when matching queued interrupt local echoes with DB rows.
  - `src/app/chat/page.tsx`: immediately refetch and merge the latest DB messages after interrupt queue acceptance, preserving the visible user instruction.
  - `src/app/chat/page.tsx`: restore the input field if interrupt persistence fails instead of silently clearing it.
  - `src/app/chat/page.tsx`: filter runner/system messages before visible chat render limits are calculated.
- Verification:
  - `npx tsc --noEmit` passed.
  - `npm run build` passed with 61 app routes generated.
- Deployment:
  - Commit `cfba926bee31` was pushed to `main`.
  - Dashboard blue-green deployment completed at 2026-07-28 06:07 KST.
  - Active slot after deployment: green. Standby blue was rebuilt and synchronized to the same release.
  - Runtime verification: `aads-dashboard` and `aads-dashboard-green` both reported `AADS_RELEASE_SHA=cfba926bee31` and Docker health `healthy`.
  - External unauthenticated `/chat` probe returned `HTTP/2 307` to `/login?redirect=%2Fchat`, confirming the dashboard route is served behind auth.
  - Step 7 dashboard QA returned `UNKNOWN`; it was not used as a pass condition.

## 2026-07-27 23:00 KST - Chat global reply scroll stabilization for d19a recurrence

- 배경: CEO가 세션 `d19a0e9e-f96f-4c83-8367-20de50762364`에서 질문 응답 중 스크롤이 상단으로 이동하고 반복 응답처럼 보이는 현상이 계속 난다고 보고했다.
- 실측: 대상 세션은 assistant 228건/user 136건, assistant 본문 합계 986,333자, 최신 `chat_turn_executions`에 `running` 1건이 있었고, 최신 assistant `streaming_placeholder` 5,383자가 계속 병합 대상이었다.
- 원인: 응답 생성 중 status/message polling이 `setMessages`를 반복 호출하고, 기존 auto-scroll effect가 일반 polling/merge에도 하단 스크롤을 실행해 Chrome scroll anchoring 및 대형 Markdown 재배치와 충돌할 수 있었다.
- 조치: `src/app/chat/page.tsx`에 질문 전송 후 3분 동안만 하단 stick 상태를 유지하는 `bottomStickUntilRef`를 추가하고, 사용자가 직접 위로 스크롤하면 즉시 해제되게 했다.
- 조치: 메시지 변경 effect는 streaming/waiting 응답 중 새 메시지가 추가될 때만 하단 보정을 수행하고, 일반 polling/merge 교체는 스크롤 위치를 건드리지 않게 했다.
- 조치: 메시지 스크롤 컨테이너에 `overflow-anchor: none`, `scrollbar-gutter: stable`, `scrollBehavior: auto`를 적용하고 transform layer 힌트를 제거했다.
- 검증: `npx tsc --noEmit`, `npm run build` 통과.

## 2026-07-27 09:30 KST - Chat d19a session initial merge and scroll stabilization

- 배경: CEO가 세션 `d19a0e9e-f96f-4c83-8367-20de50762364`에서 스크롤 이상과 반복 응답 체감을 보고했다.
- 실측: 대상 세션은 메시지 357건이며 최근 50건 중 assistant 32건, partial/interrupted 계열 5건이 포함됐다. 완전 동일 assistant 본문 중복은 2그룹뿐이어서 대량 DB 중복보다 화면 병합/중단응답 노출 문제가 우세했다.
- 원인: 세션 초기 로드와 빈 화면 500ms 재시도 경로가 `mergeServerMessagesPreservingLocal()`을 우회해, 같은 execution/시작문을 가진 interrupted partial과 최종 assistant가 동시에 렌더될 수 있었다.
- 조치: `src/app/chat/page.tsx`에서 초기 로드 첫 세트와 자동 재시도 세트도 모두 `mergeServerMessagesPreservingLocal()`을 통과시켜 assistant 중복 접기/우선순위 병합을 동일하게 적용한다.
- 검증: `npx tsc --noEmit` 통과. 운영 배포 후 대상 세션 새로고침/질문 시 상단 이동과 반복 표시 재발 여부를 확인한다.

## 2026-07-27 09:22 KST - Chat large-session initial scroll anchoring hardening

- 배경: CEO가 세션 `7a1b186e-e71f-41c5-bd7b-e5926f41b4d9`에서 질문 시 브라우저 멈춤과 스크롤 상단 이동이 계속 재발한다고 보고했고, 이전 완료 보고가 커밋/푸시/배포/문서 원장과 충돌했다.
- 실측: 대상 세션은 `chat_messages` 2,101건, assistant 1,310건/user 791건, 본문 합계 3,063,125자, 최대 단일 메시지 68,782자이며 현재 `chat_turn_executions`에 `running` 상태는 없었다.
- 원인: SSE replay 중복 방지와 대형 세션 렌더 cap은 반영됐지만, 초기 로드 `ResizeObserver`가 DOM 높이 변화마다 force scroll을 호출했고 하단 sentinel이 browser scroll anchor 후보로 남아 대형 Markdown/이미지 렌더 중 스크롤 보정 개입 여지가 있었다.
- 조치: `src/app/chat/page.tsx`에서 초기 `ResizeObserver`가 initial lock 해제 후 동작하지 않게 막고, force scroll 대신 near-bottom/user pause guard를 통과하는 일반 하단 스크롤을 사용하게 했다.
- 조치: `messagesEndRef` sentinel의 `overflowAnchor`를 `none`으로 바꿔 브라우저가 하단 sentinel을 임의 scroll anchor로 잡아 상단/하단 점프를 유발하는 경로를 줄였다.
- 검증: `npx tsc --noEmit` 통과. 운영 배포 후 `/chat` 307 인증 리다이렉트, blue/green 컨테이너 healthy, 배포 로그를 확인해야 완료로 본다.

## 2026-07-27 09:10 KST - Chat idea memo manual input and management

- 배경: CEO가 채팅창의 아이디어 메모를 직접 입력하고 확인·관리할 수 있게 해 달라고 지시했다.
- 원인: 아이디어 메모 탭은 `agenda` 목록 조회만 제공했고, 채팅 패널 안에서 직접 등록·수정·상태 변경하는 UI가 없었다.
- 조치: `src/app/chat/ChatArtifactPanel.tsx`에 직접 입력 폼을 추가해 제목, 내용, 우선순위를 입력하고 현재 세션에 연결된 `ceo_agenda` 메모로 저장하게 했다.
- 조치: 기존 메모 목록에서 상세 펼침, 수정 모드, 우선순위/상태 편집, 빠른 상태 변경, 새로고침, 오류 표시를 지원한다.
- 검증: `npx tsc --noEmit`, `npm run build` 통과.
- 범위 제외: DB 스키마 변경 없음. 기존 `/api/v1/agenda` CRUD를 사용한다.

## 2026-07-27 08:55 KST - Chat SSE replay duplicate guard follow-up

- 배경: 세션 `7a1b186e-e71f-41c5-bd7b-e5926f41b4d9`에서 대형 세션 렌더 완화 후에도 질문 중 브라우저 멈춤, 스크롤 상단 이동, 중복 응답 체감이 재발했다.
- 실측: 대상 세션은 assistant 1,310건/user 791건, assistant 본문 합계 2,876,744자, user 본문 합계 186,381자였다.
- 원인: 대형 세션 DOM/Markdown 완화는 반영됐지만, 일반 전송 재연결 경로에서 `currentExecutionIdRef`가 있고 `last_event_id`가 비어 있으면 `/chat/executions/{id}/events?last_event_id=0`으로 과거 이벤트를 처음부터 다시 받을 수 있었다.
- 조치: `src/app/chat/page.tsx`에 SSE delta overlap guard를 추가하고, 일반 전송/실행 attach/재연결/재생성 루프에 이벤트 ID 중복 무시와 delta 중복 병합 방지를 적용했다.
- 조치: `last_event_id`가 없을 때는 execution replay 대신 session `stream-resume` offset 경로를 사용해 이미 화면에 표시된 partial 뒤에 과거 delta가 다시 붙지 않게 했다.
- 검증: `npx tsc --noEmit`, `npm run build` 통과.

## 2026-07-27 08:12 KST - Chat 7a1b residual freeze/scroll mitigation

- 배경: 세션 `7a1b186e-e71f-41c5-bd7b-e5926f41b4d9`에서 이전 P0 패치 후에도 질문 시 브라우저 멈춤과 스크롤 상단 이동이 재발했다.
- 실측: 2026-07-27 08:06 KST 기준 대상 세션은 assistant 1,310건/user 791건, assistant 본문 합계 2,854,159자, 최대 단일 assistant 68,782자, `interrupted` execution 85건이다.
- 원인: 기존 SSE replay/scroll guard는 반영됐지만, 대형 세션에서 전체 message 배열 정렬·중복 그룹화, 장문 streaming Markdown, 메시지 row의 browser scroll anchoring, 비동기 SessionSummaryCard 삽입이 남은 멈춤/상단 이동 조건이었다.
- 조치: `src/app/chat/page.tsx`에서 live streaming Markdown tail 렌더 상한을 6,000자에서 3,000자로 낮추고, 마지막 assistant 자동 전체 펼침 기준을 8,000자에서 3,000자로 낮췄다.
- 조치: 메시지 row를 browser scroll anchor 후보에서 제외하고, displayData 계산은 500건 초과 대형 세션에서 최근 120건만 group/dedupe 대상으로 삼도록 제한했다. 화면 DOM cap은 기존 최근 40건 정책을 유지한다.
- 조치: message_count 200건 이상 세션에서는 상단 비동기 `SessionSummaryCard`를 렌더하지 않아 초기 하단 정렬 후 상단 높이 변화가 스크롤을 흔드는 경로를 차단했다.
- 검증: `npx tsc --noEmit`, `git diff --check -- src/app/chat/page.tsx`, `npm run build` 통과.
- 범위 제외: 기존 `public/manager/env_unknown.json`, `public/manager/env_5.json`은 수정·커밋 대상에서 제외한다.

## 2026-07-27 07:18 KST - Chat large-session freeze and scroll-loop mitigation

- 배경: 세션 `7a1b186e-e71f-41c5-bd7b-e5926f41b4d9`에서 질문 시 브라우저 멈춤, 스크롤 상단 이동, 중복 응답 체감이 재발했다.
- 실측: 대상 세션은 assistant 1,306건/user 786건, assistant 본문 합계 2,822,636자, 최신 40건만 assistant 52,057자이며 `interrupted` execution 83건이 남아 있었다.
- 원인: 기존 replay/anchor 패치는 반영됐지만, 상단 근접 자동 과거 로드와 마지막 대형 assistant 전체 Markdown 자동 펼침이 대형 세션에서 렌더 비용과 scroll anchoring 루프를 계속 유발할 수 있었다.
- 조치: `src/app/chat/page.tsx`에서 스크롤 상단 자동 과거 로드를 제거하고, 과거 메시지는 `이전 대화 불러오기` 버튼으로만 로드하게 했다.
- 조치: 실시간 스트리밍 Markdown 렌더는 최근 6,000자만 렌더하고, 마지막 assistant도 8,000자를 넘으면 자동 전체 펼침 대신 접힌 미리보기로 시작하게 했다.
- 조치: 대형 세션에서는 채팅 DOM 렌더 cap을 최근 40개로 낮춰 2,000건 이상 세션의 브라우저 메인스레드 부하를 줄였다.
- 조치: 기존 미커밋 상태였던 `src/app/chat/MarkdownRenderer.tsx`의 `React.memo` 닫힘 구문 오류를 보정해 Docker 빌드 차단을 해소했다.
- 검증: `npm exec tsc -- --noEmit` 통과, `npm run build`는 컴파일/정적 생성 통과 후 trace 수집 중 143으로 종료되어 Docker 배포 빌드로 최종 검증한다.
- 범위 제외: 기존 `public/manager/env_unknown.json`, `public/manager/env_5.json`, 언니냉면 관련 미커밋 파일은 수정·커밋 대상에서 제외한다.

## 2026-07-26 20:42 KST - Chat idea memo panel restore

- 배경: 채팅창에서 아이디어 메모 창이 사라져 보인다는 CEO 지시가 있었다.
- 원인: 아이디어 메모는 기존 `agenda` 탭으로 남아 있었지만 라벨이 `아젠다`로 노출되고, 기본 진입 탭이 보고서였으며, 패널 미니 상태에서는 아이콘 툴팁도 영문 key로만 표시돼 사용자가 메모 창을 찾기 어려웠다.
- 조치: `src/app/chat/page.tsx`에서 채팅 진입·세션 전환 시 기본 아티팩트 탭을 `agenda`로 열고, 상단 툴바에 `아이디어 메모` 직접 열기 버튼을 추가했다.
- 조치: `src/app/chat/ChatArtifactPanel.tsx`에서 `아젠다` 라벨/빈 상태 문구를 `아이디어 메모`로 교체하고, 미니 패널 아이콘 툴팁과 메모 수 배지를 보강했다.
- 검증: `npx tsc --noEmit` 통과, `npm run build` 통과. 서버68 health 정상.
- 범위 제외: 기존 `public/manager/env_unknown.json`, `public/manager/env_5.json`은 수정·커밋 대상에서 제외한다.

## 2026-07-26 19:41 KST - Chat streaming replay and scroll stability P0

- 배경: 세션 `7a1b186e-e71f-41c5-bd7b-e5926f41b4d9`에서 응답 중 브라우저 멈춤, 스크롤 상하 점프, 이전/중복 assistant 응답 표시가 반복됐다.
- 실측: 대상 세션은 메시지 2,081건, 총 2,926,736자, 최대 단일 메시지 68,782자이며 DB에 `streaming_placeholder` 1건과 `running` execution 1건이 남아 있었다.
- 반영: `src/app/chat/page.tsx`에서 `last_event_id=0` 강제 replay를 차단하고, partial/last_event_id가 있을 때만 execution SSE에 attach한다. replay 이벤트 ID 중복은 클라이언트에서 무시한다.
- 스크롤: 메시지 row를 브라우저 scroll anchor 대상에서 제외하고, 사용자 스크롤 중 자동 하단 이동을 4초간 억제한다. 이전 대화 prepend는 첫 visible message anchor+offset으로 보정한다.
- 검증: `npx tsc --noEmit` 통과, `npm run build` 통과.
- 범위 제외: 기존 `public/manager/env_unknown.json`, `public/manager/env_5.json`은 수정·커밋 대상에서 제외한다.

## 2026-07-24 17:25 KST - OHVIS TaskCard and artifact panel deployment closeout

- 배경: OHVIS 3-Tier P0-P2 구현 중 대시보드가 작업 결과를 일반 채팅 메시지에 섞지 않고 작업 카드와 아티팩트 패널로 표시하도록 마감했다.
- 조치: `TaskCard`, `ChatArtifactPanel`, 채팅 페이지 상태 병합, SSE 이벤트 수신, chat API 클라이언트를 커밋 `2364c21`로 `dashboard-write/main`에 반영했다.
- 운영 상태: dashboard Blue(3100)와 Green(3101)은 모두 healthy이며 양 슬롯의 `AADS_RELEASE_SHA`는 `2364c2120eae`다. 공개 `/chat`은 로그인 리다이렉트 HTTP 307로 응답한다.
- 검증: Next.js production build는 성공했고, 변경 파일 한정 ESLint는 오류 0건이다. 운영 번들에 `TaskCard`, `task_progress`, `task_complete`, `오비스 판단` 문자열이 포함됨을 확인했다.
- 남은 리스크: 전체 `npm run lint`는 기존 전역 ESLint 오류 261건으로 실패한다. `public/manager/env_5.json`은 이번 작업 범위 밖 미추적 파일로 보존했다. 인증 브라우저 E2E는 미수행이며 API/컨테이너 검증으로 대체했다.

## 2026-07-23 14:21 KST - Chat artifact compact-width release ledger reconciliation
- 불일치 실측: 운영 Blue/Green은 기능 브랜치 `c1b0978`을 실행했지만 정식 `origin/main`은 `cd491bd`여서 이전 완료보고가 브랜치별 커밋·푸시·배포 원장을 구분하지 않았다.
- 정식 `main` 보강: 새 창/새로고침/세션 전환 시 아티팩트 패널을 `full` 420px로 초기화하고, 패널을 세션 ID로 재마운트해 이전 세션 폭을 승계하지 않는다.
- 기능 보존: 같은 세션 안에서는 `넓게` 버튼(980px), 420px 이상 드래그 폭 조절, `mini` 48px 접기를 유지한다. 저장된 과거 폭은 초기값으로 복원하지 않는다.
- 브랜치별 원장: 정식 `main`에는 아티팩트 보강 커밋을 푸시한다. 운영은 동시 진행 중인 언니냉면 인쇄 자산을 보존하기 위해 동일 아티팩트 보강(`4045a5b`, `c1b0978`)을 포함한 `feat/unni-naengmyeon-homepage-20260722` 릴리스를 사용한다. 두 독립 이력의 SHA를 같다고 보고하지 않는다.
- 완료 기준: `main == 원격 main`, `운영 release branch == 원격 release branch == Blue AADS_RELEASE_SHA == Green AADS_RELEASE_SHA`, 두 브랜치의 아티팩트 폭 계약 일치, TypeScript/프로덕션 빌드 통과, 컨테이너 health 및 공개 HTTP 확인. 인증 브라우저 검증 실패 시 사유와 API/번들 대체 검증을 명시한다.

## 2026-07-23 11:55 KST - Chat artifact compact-width final ledger correction
- 최종 요구사항: 첫 번째 참고 이미지의 과도하게 넓어진 아티팩트 패널을 사용하지 않고, 두 번째 참고 이미지처럼 본문이 보이는 compact `full` 모드(420px)로 연다.
- 적용 시점: 브라우저 새 창/직접 URL 진입, 하드 새로고침, 세션 ID 전환 모두 `full`로 초기화하며 이전 세션의 넓어진 폭을 승계하지 않는다.
- 원장 정정: `mini` 48px 레일을 기본값으로 둔 `32f7ed4`는 중간 시도이고, 정식 `main`의 `8252aed`가 이를 420px compact 모드로 교정했다. 운영 컨테이너와 정식 `main` SHA가 달랐던 상태는 본 기록 이후 정식 `main` Blue/Green 재배포로 일치시킨다.
- 완료 판정: `main == origin/main == Blue AADS_RELEASE_SHA == Green AADS_RELEASE_SHA`, TypeScript/프로덕션 빌드 통과, 공개 HTTP 정상, 인증 브라우저 하드 새로고침 후 패널 본문 노출을 모두 확인해야 한다.

## 2026-07-23 - Chat artifact panel compact-mode ledger reconciliation
- 기준 화면: 세션을 새 창에서 열거나 새로고침하거나 다른 세션으로 전환할 때 우측 아티팩트 내용을 숨기는 48px 레일이 아니라, 두 번째 참고 이미지처럼 내용이 보이는 compact `full` 모드(420px)로 시작한다.
- 재발 원인: 운영 릴리스 브랜치는 `full` 420px로 수정됐지만 정식 `main`에는 이전 `mini` 48px 패치가 남아 있어 다음 일반 배포에서 동작이 다시 뒤집힐 수 있었다.
- 조치: `src/app/chat/page.tsx`의 최초 상태와 세션 ID 전환 초기화를 모두 `full`로 통일했다. `ChatArtifactPanel.tsx`의 `full=420px`, `mini=48px` 폭 계약은 유지한다.
- 검증 기준: TypeScript, 프로덕션 빌드, 운영 컨테이너 health/HTTP 200, 인증 브라우저 새로고침 후 아티팩트 본문 노출을 확인한다.

## 2026-07-23 10:19 KST - E2E auth callback asset image guard
- 원인: `src/middleware.ts`는 `/e2e-auth.html`을 공개 경로로 허용했지만, 운영 blue/green 이미지의 `/app/public`에 정적 콜백 파일이 누락돼 신규 PC Agent 로그인 복구가 `/login`으로 되돌아갈 수 있었다.
- 반영: `Dockerfile`에서 `public/e2e-auth.html`을 builder에 명시적으로 복사하고 non-empty 검증을 추가했으며, runner 이미지에도 동일 파일을 명시적으로 복사한다.
- 범위 제외: 기존 사용자 변경 `public/manager/env_unknown.json`은 수정·커밋하지 않는다.
- 완료 기준: 이미지 빌드, blue/green의 `/app/public/e2e-auth.html` 존재, 공개 콜백 GET, PC Agent 지정 채팅 세션 로그인 E2E를 확인한다.

## 2026-07-23 09:52 KST - Chat artifact panel opens as narrow rail
- 대상: 채팅 세션을 처음 열거나 다른 세션으로 이동할 때 우측 아티팩트 패널이 전체 폭(420px)으로 열려 대화 영역을 가리는 동작.
- 반영: `src/app/chat/page.tsx`의 `artifactMode` 초기값을 `mini`로 변경하고, 실제 세션 ID가 바뀔 때도 `mini`로 초기화해 48px 아티팩트 레일로 시작하도록 했다. 사용자가 아티팩트 또는 보고서 보기를 누르면 기존처럼 전체 폭으로 확장된다.
- 검증: stale `.next/types`를 별도 `/tmp` 경로로 보관한 뒤 `npx tsc --noEmit` 통과. `npm run build` 통과(57개 라우트 생성).
- 범위 제외: 기존 사용자 변경 `public/manager/env_unknown.json`은 수정·커밋 대상에서 제외한다.

## 2026-06-18 10:39 KST - Personal Assistant voice UX final verification correction
- 배경: CEO가 이전 완료보고의 커밋/푸시/배포/문서 상태 충돌을 지적했고, 채팅 개인비서 UX/음성 입력/일반 사용자 분리 상태를 최종 재검증하라고 지시했다.
- 정정:
  - dashboard `HEAD`와 `origin/main`은 `8708983b58407c04e7f2d61a575120c584d4beb8`로 일치한다.
  - 실제 반영 커밋은 `9fb9046 feat(chat): add personal assistant voice input`, `8708983 docs: correct assistant voice verification note`다.
  - “브라우저 마이크 권한과 실제 STT provider 동작”은 아직 로그인 브라우저 E2E로 검증하지 않았으므로 완료로 보고하지 않는다.
- 검증:
  - `npx eslint src/app/chat/ChatInput.tsx src/app/chat/page.tsx` 결과 error 0건, warning 22건.
  - `curl https://aads.newtalk.kr/api/health` 200, `{"status":"healthy"}` 응답.
  - dashboard active port는 3100이고, `aads-dashboard`, `aads-dashboard-green` 컨테이너 모두 healthy다.
- 남은 제한:
  - CEO 로그인 세션에서 실제 마이크 버튼 노출, 녹음 권한, `/api/v1/voice/transcribe` provider 응답은 브라우저 E2E로 추가 확인해야 한다.

## 2026-06-18 10:20 KST - Personal Assistant chat UX and voice input
- 대상: CEO가 AADS를 개인 인공지능 비서처럼 쓰기 위한 채팅 진입 UX와 음성 입력 MVP, 일반 사용자에게 내부 프로젝트 안내가 노출되는 리스크.
- 반영:
  - `src/app/chat/page.tsx`: `/auth/me`의 `is_internal_admin`을 읽어 CEO/internal admin은 Personal Assistant 빈 화면, 운영/승인/아젠다 quick prompt, 개인비서 placeholder를 표시한다. 일반 사용자는 기존 customer workspace 안내를 유지한다.
  - `src/app/chat/ChatInput.tsx`: CEO/internal admin에게만 마이크 버튼을 표시하고, 브라우저 `MediaRecorder` 녹음 후 `/api/v1/voice/transcribe`로 STT 변환해 입력창에 반영한다. voice API가 internal admin 전용이므로 일반 사용자에게는 마이크 버튼을 숨겼다.
  - `src/app/chat/ChatInput.tsx`: 일반 사용자는 `@PROJECT/@TEAM/@TASK` 멘션만 보게 하고, CEO/internal admin만 AADS/KIS/GO100/SF/NTV2/NAS 내부 프로젝트 멘션을 볼 수 있게 분리했다.
- 검증:
  - `npx eslint src/app/chat/ChatInput.tsx src/app/chat/page.tsx` 에러 0개, 기존 경고 22개.
  - `npm run build` 통과. route 목록에 `/chat`, `/admin/sessions`, `/onboarding`, `/team` 포함 확인.
  - `git diff --check -- src/app/chat/ChatInput.tsx src/app/chat/page.tsx HANDOVER.md` 통과 예정.
- 제한: 브라우저 마이크 권한과 실제 STT provider 설정 여부는 배포 후 로그인 세션에서 확인해야 한다. provider 미설정 시 UI는 오류 메시지를 채팅에 표시한다. 브라우저 로그인 화면 캡처는 아직 미실행이다.

## 2026-06-15 15:16 KST - Chat streaming bubble preservation and BG sync
- 대상: `/chat#d84b7c2c-64a5-4a80-9472-21170fd7d160` 등에서 추가지시 반영 중 이전 응답 버블이 사라지거나, DB에 저장된 streaming/partial 버블이 새로고침 전후 다르게 보이는 현상.
- 원인: 프론트 병합 로직이 `streaming_placeholder`를 전역 1개만 남기며 내용 있는 DB 저장 placeholder까지 삭제할 수 있었고, `stream_reset(reason=interrupt_applied)` 처리 시 기존 draft를 별도 버블로 고정하지 않은 채 같은 placeholder를 계속 재사용했다. 또한 배포 전 dashboard blue/green의 `BUILD_ID`와 client manifest가 달라 클라이언트 산출물 혼재 가능성이 있었다.
- 반영: `src/app/chat/page.tsx`에서 `interrupt-*` 로컬 user 버블을 transient 보존 대상에 포함했다. 중복 `streaming_placeholder` 중 내용 있는 DB 저장본은 삭제하지 않고 `interrupted_partial`로 고정한다. 추가지시 반영 `stream_reset` 시 현재 보이는 draft를 `ai-partial-interrupt-*` 버블로 남기고, 새 streaming placeholder를 이어쓰기 앵커로 유지한다.
- 검증: `git diff --check -- src/app/chat/page.tsx` 통과, `npm run build` 통과. `npm run lint`는 기존 전역 lint 부채 264 errors / 67 warnings로 실패했으며 이번 변경 파일 신규 에러는 확인되지 않았다.
- 배포: 커밋 `ba0a058 fix(chat): preserve streaming bubbles during interrupts` 푸시 완료. `bash deploy.sh`로 dashboard blue-green 배포 성공, active blue 및 standby green 헬스체크 통과, 양쪽 `/app/.next/server/app/chat/page.js` 해시가 `7e05546b...`로 일치한다. 배포 스크립트 Step 7 프론트 QA는 `UNKNOWN`이라 브라우저 E2E는 수동 확인 필요하다.

## 2026-06-15 12:41 KST - Docs electronic contract visibility
- 대상: `https://aads.newtalk.kr/docs`에서 전자계약 기획서와 근로계약서/프리랜서 계약서/뉴톡 입점계약서 초안이 눈에 잘 띄지 않는 문제.
- 반영: `src/app/docs/page.tsx`에 `계약/전자계약` 유형 라벨과 색상을 추가하고, AADS 문서 목록 상단에 전자계약 문서 고정 섹션을 추가했다. `전체 보기`는 `AADS + 전자계약` 검색 상태로 전환한다.
- 연동: 백엔드 `app/api/project_docs.py`가 계약/전자계약 문서를 `contract` 유형으로 분류하도록 보강되어 `/docs` 유형 필터에도 노출된다.
- 검증: `npx eslint src/app/docs/page.tsx` 통과. 백엔드 스캔 함수 직접 호출 기준 `/app/docs/reports/20260615_전자계약_시스템_기획서.md`, `/app/docs/reports/20260615_전자계약서_3종_템플릿_초안.md`, `/app/docs/contracts/*전자계약_초안.md` 3종이 `contract`로 분류됐다.
- 제한: 실브라우저 E2E는 인증 세션이 필요해 미실행했고, API/함수 스캔 검증으로 대체했다.

## 2026-06-12 12:50 KST - Admin home access final verification
- 대상: CEO 계정이 채팅창 홈 버튼으로 `/` 이동 시 어드민 홈에 접근하지 못하던 현상.
- 최종 상태: `moongoby@gmail.com` 검증 토큰 기준 `https://aads.newtalk.kr/` 200, `/chat` 200을 확인했다. 일반 사용자 검증 토큰은 양 대시보드 슬롯 `3100`, `3101`에서 `/` 접근 시 `/chat` 307로 리다이렉트된다.
- 권한 근거: 운영 DB에서 `moongoby@gmail.com`은 `role=ceo`, `default_tenant=internal`, `tenant_memberships.role=owner`, `status=active`다. `internal` active member 2명은 모두 CEO allowlist 계정이다.
- 코드 근거: `src/middleware.ts`는 `http://aads-server:8080/api/v1/auth/me`로 `is_internal_admin`을 확인하고, `src/components/chat/ChatLayout.tsx` 홈 버튼은 Next `Link href="/"`를 사용한다.
- 검증: `npx eslint src/app/chat/page.tsx src/components/chat/ChatLayout.tsx src/middleware.ts src/components/ClientLayout.tsx` 에러 0개(기존 경고 23개), `npm run build` 통과.
- 한계: CEO 실브라우저 쿠키는 Vault에 없어 브라우저 E2E는 미로그인 화면 확인까지만 수행했고, 인증 상태 검증은 서버 생성 검증 토큰과 API/HTTP 응답으로 대체했다.

## 2026-06-12 11:00 KST - Chat TODO panel default collapsed
- 대상: 채팅창 진입 또는 세션 이동 시 하단 TODO 패널이 기본 펼침 상태로 열리는 동작.
- 원인: `src/app/chat/page.tsx`의 `todoCollapsed` 초기값과 세션 변경 reset 값이 모두 `false`라서 첫 렌더와 세션 전환 때마다 TODO 목록이 펼쳐졌다.
- 반영: `todoCollapsed` 초기값과 `activeSession?.id` 변경 시 reset 값을 모두 `true`로 변경해 채팅 진입/세션 이동 기본 상태를 닫힘으로 맞췄다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run lint -- src/app/chat/page.tsx` 에러 0개(기존 경고 23개), `npm run build` 통과.
- 배포: 커밋/푸시/배포는 아직 수행하지 않았다. 운영 반영 시 대시보드 배포가 필요하다.

## 2026-06-11 11:42 KST - Admin user signup and usage overview verification
- 대상: CEO가 어드민에서 일반 사용자 가입현황과 사용현황을 확인할 수 있는지 최종 확인.
- 반영 확인: `src/app/admin/users/page.tsx`는 `/admin/users` 화면에서 전체 가입자, 활성 사용자, customer tenant, 초대, 호출/토큰/비용, 채팅 활동과 사용자별 최근 활동을 표시한다. `src/components/Sidebar.tsx`에는 `사용자 현황` admin 전용 메뉴가 추가되어 있고, `src/lib/api.ts`는 `/api/v1/admin/users/overview`를 호출한다.
- 운영 검증: API 양 슬롯 `aads-server:8100`, `aads-server-green:8102`에서 CEO 토큰으로 `/api/v1/admin/users/overview?days=30&limit=3` 호출 시 HTTP 200을 확인했다. 응답 기준 `total_users=43`, `active_users=35`, `customer_tenants=34`, `calls_window=5,551`, `tokens_window=1,979,329`, `usage_cost_window=$239.398435`이다. 외부 도메인 `https://aads.newtalk.kr/api/v1/admin/users/overview?days=30&limit=3`도 CEO 토큰으로 HTTP 200이며 `calls_window=5,552`로 1건 증가한 최신 사용량을 반환했다.
- 화면 검증: dashboard active 슬롯 `3101`과 외부 도메인 `/admin/users`는 미인증 상태에서 `/login?redirect=%2Fadmin%2Fusers`로 리다이렉트된다. 브라우저 로그인 클릭 E2E는 미실행했으며, 인증 API 검증과 배포된 소스/라우트 검증으로 대체했다.
- 제한: `npx eslint src/app/admin/users/page.tsx src/components/Sidebar.tsx src/components/ClientLayout.tsx src/lib/auth.ts`는 통과했다. `src/lib/api.ts` 단독 lint는 기존 `no-explicit-any` 부채 141건으로 실패했으며, 이번 변경 diff 자체에는 신규 `any` 추가가 없다.

## 2026-06-10 12:51 KST - Chat session artifact scope freeze fix
- 대상: `/chat#266ab3aa-b0fd-46bb-8c54-01e4852c956f` 세션에서 채팅 진행 시 브라우저가 멈추는 현상.
- 확인: DB 기준 해당 세션은 메시지 532건, 본문 505,688자, 세션 artifact 292건/400,934자였다. 하지만 프론트 `src/app/chat/page.tsx`가 세션 진입과 SSE 완료 후 artifact 갱신 시 `workspace_id` 전체 artifact를 조회해 같은 워크스페이스 artifact 7,026건/9,121,191자를 매번 로드하고 있었다.
- 원인: 메시지 렌더 cap은 150개로 제한되어 있었지만, artifact 배열은 워크스페이스 전체를 `setArtifacts()`에 넣고 필터/카운트/패널 렌더에 반복 사용되어 특정 대용량 워크스페이스 세션에서 메인스레드 부하가 급증했다.
- 반영: 채팅 화면의 artifact 초기 로드와 스트리밍 완료 후 artifact 새로고침을 모두 `workspace_id` 기준에서 현재 `session_id` 기준으로 변경했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `git diff --check -- src/app/chat/page.tsx` 통과, `npx tsc --noEmit --pretty false` 통과, `npm run build` 통과. `npm run lint`는 기존 전역 lint 부채 276 errors / 69 warnings로 실패했으며 이번 변경 파일 신규 컴파일 오류는 없음.

## 2026-06-08 14:38 KST - SaaS signup onboarding UI
- 대상: SaaS 가입 직후 조직명, 팀원 초대, 권한 역할을 명확히 받는 P1 온보딩 흐름.
- 반영: `src/app/signup/page.tsx`는 계정 생성 후 일반 AADS 사용자를 `/onboarding`으로 이동시킨다. 신규 `src/app/onboarding/page.tsx`는 조직명을 필수로 받고, 팀원 초대 이메일과 `admin/member/viewer` 역할을 입력받아 `/api/v1/auth/onboarding`에 제출한다.
- 반영: `src/lib/auth.ts`에 `completeOnboarding()` 클라이언트 API를 추가해 온보딩 완료 후 새 tenant token을 저장한다. `src/components/ClientLayout.tsx`는 온보딩 화면에서 사이드바를 숨긴다.
- 검증: `npx eslint src/lib/auth.ts src/app/signup/page.tsx src/app/onboarding/page.tsx src/components/ClientLayout.tsx` 통과. `npm run build` 통과.

## 2026-06-05 15:49 KST - Chat final response and stream reset preservation
- 대상: 채팅창에서 스트리밍 응답이 중간 재검증/재연결/완료 직후 비거나, 최종응답이 DB 저장 후 화면에 늦게 병합되어 사라진 것처럼 보이는 재발 위험.
- 반영: `src/hooks/useChatSSE.ts`에서 fallback 복구가 `streaming_placeholder/rate_limited`를 최종 응답으로 오인하지 않게 필터링하고, `stream_reset` 시 이미 보이는 텍스트를 `displayTextRef`에 유지한다. 완료 이벤트에서는 `chunk.content → 렌더 버퍼 → 누적 fullText` 순서로 최종 텍스트를 산정해 `completeStream()`과 `onDone()`에 같은 값을 넘긴다.
- 반영: `src/app/chat/page.tsx`에서 attach replay와 메인 SSE `stream_reset` 분기가 `setStreamBuf("")`로 버블을 비우지 않고, 기존 `full/streamBuf/bgPartialContent`를 visible draft로 유지한다. 기존 finalization 보강 흐름과 결합해 완료 직후 DB 최종 메시지 병합을 반복 확인한다.
- 변경 파일: `src/hooks/useChatSSE.ts`, `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npx tsc --noEmit --pretty false` 통과, `npx eslint src/app/chat/page.tsx src/hooks/useChatSSE.ts` 에러 0개(기존 경고 23개), `npm run build` 통과.
- 배포: 본 문서 기록 후 `bash deploy.sh`로 dashboard blue-green 배포 대상.

## 2026-06-01 17:20 KST - Dashboard deploy lock hardening
- 대상: `bash deploy.sh` 실행 시 `/tmp/aads-dashboard-deploy.lock`에 죽은 PID가 남아 "대시보드 배포가 이미 진행 중입니다"로 무중단 배포가 차단된 현상.
- 확인: lock 파일에는 `PID=30800`이 기록되어 있었으나 호스트 `ps -p 30800` 기준 프로세스가 존재하지 않았다. Docker 상태는 `aads-dashboard:3100` active, `aads-dashboard-green:3101` standby 모두 healthy였고 BG 구조 장애는 아니었다.
- 원인: 기존 lock 파일은 PID 한 줄만 저장해 종료 시 `trap`이 실행되지 못한 stale lock과 실제 진행 중인 배포를 구분하기 어려웠다.
- 반영: `deploy.sh`가 lock에 `pid`, `started_at`, `host`, `cwd`, `script`, `log`를 기록하고, 기존 lock 발견 시 `/proc/{pid}/cmdline`이 실제 `bash deploy.sh`인지 확인한 뒤 살아있는 실제 배포만 차단한다. 종료된 PID 또는 deploy.sh가 아닌 PID의 lock은 stale로 기록하고 제거한다. 배포 실행별 로그는 `deploy-logs/dashboard-deploy-YYYYMMDD-HHMMSS.log`에 남긴다.
- 변경 파일: `deploy.sh`, `.gitignore`, `HANDOVER.md`.
- 검증/배포: 본 변경 검증 후 `bash deploy.sh`로 dashboard blue-green 배포를 진행한다.

## 2026-05-31 (Chat final response dedup priority fix)
- 대상: `/chat#b8a8651b-6226-46df-9a44-36a70e478959` 등에서 응답 버블이 있다가 사라지거나 중단/partial 버블이 최종 응답을 밀어내는 재발 현상.
- 확인: DB에는 대상 세션 메시지 614건이 남아 있고 최신 assistant partial도 저장되어 있었으나, 프론트 `mergeServerMessagesPreservingLocal()`의 assistant dedup가 ASC 순회 중 같은 `execution_id`/content prefix 중복을 먼저 본 메시지 기준으로 제거했다. 이 구조에서는 `interrupted_partial` 또는 로컬 draft가 먼저 들어오면 뒤늦게 도착한 최종 assistant가 화면 상태에서 제거될 수 있다.
- 반영: `assistantMergePriority()`를 추가해 중복 병합 시 `final assistant > meaningful interrupted/recovered partial > short interruption/placeholder/local draft` 순서로 보존한다. 같은 `execution_id`나 content prefix가 충돌하면 우선순위와 본문 길이를 비교해 최종 응답을 대표 메시지로 교체하고, partial/draft만 제거한다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 21개), `npm run build` 통과.
- 주의: 대시보드 워크트리에는 과거 백업 파일 삭제와 미추적 리포트가 다수 남아 있으므로 커밋 시 이번 조치 파일만 선별 스테이징한다.

## 2026-05-29 (Chat tab-return streaming restore regression fix)
- 대상: `/chat#b8a8651b-6226-46df-9a44-36a70e478959` 세션에서 응답 버블이 있다가 사라지고, 새로고침/탭 복귀 후 완료 응답이 늦게 보이는 재발 현상.
- 확인: 프론트 탭 복귀 복원 코드가 존재하지 않는 `/chat/streaming-status?session_id=...` 경로를 호출하고 있었다. 실제 백엔드 경로는 `/chat/sessions/{session_id}/streaming-status`다. 호출 실패는 `catch {}`로 조용히 묻혔고, 이어지는 메시지 재조회도 `streamingRef.current`가 true이면 DB `streaming_placeholder` 병합을 건너뛰어 화면상 버블이 사라진 것처럼 보일 수 있었다.
- 반영: 탭 복귀 복원 API 경로를 실제 엔드포인트로 수정하고, 서버가 `is_streaming=true`와 `partial_content`를 반환하면 `streamingSessionRef`, `streaming`, `waitingBgResponse`, `streamBuf`, `currentExecutionIdRef`, `lastEventIdRef`를 즉시 복원한다. 또한 스트리밍 중이어도 DB에 의미 있는 `streaming_placeholder`가 있으면 병합을 허용해 강력 새로고침/탭 복귀 후 진행 버블이 사라지지 않게 했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm exec eslint -- src/app/chat/page.tsx` 에러 0개, 기존 경고 21개.
- 주의: 대시보드 워크트리에는 과거 백업 파일 삭제와 미추적 리포트가 다수 남아 있으므로 커밋 시 이번 조치 파일만 선별 스테이징한다.

## 2026-05-26 (Chat browser freeze follow-up)
- 대상: 채팅에 지시를 입력하면 브라우저가 잠시 멈췄다가 진행되는 재발 현상.
- 확인: `/chat#be533af6-c514-4bbc-b71c-bb68705addc0` 세션은 DB 기준 메시지 385건, assistant 228건, `streaming_placeholder` 0건, `interrupted_partial/interruption_notice` 46건으로 저장 중복보다는 프론트 렌더/스트리밍 처리 부하가 핵심이었다. `page.tsx`에서는 긴 응답을 150ms마다 전체 `streamBuf`로 갱신하고, 화면 키워드가 있는 지시에서 캡처 파일을 `String.fromCharCode(...bytes)`로 동기 base64 변환하는 경로가 남아 있었다.
- 반영: 스트리밍 드레인을 250ms tick + 450ms/900ms 최소 렌더 간격으로 완화하고 `startTransition`으로 낮은 우선순위 갱신 처리한다. 화면 캡처 base64 변환은 `FileReader.readAsDataURL()` 기반 비동기 helper로 통일해 전송 직전 메인스레드 블로킹과 spread argument 과부하를 제거했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 21개), `npm run build` 통과, `git diff --check` 통과. 전체 `npm run lint`는 기존 전역 lint 부채 277 errors / 67 warnings로 실패.

## 2026-05-18 (Chat recovery duplicate bubble guard)
- 대상: `/chat#2648cf77-4256-45e8-9cde-0e563ffefe5c` 등에서 복구/재연결 이후 assistant 응답 버블이 2개로 보이는 현상.
- 확인: DB 기준 최신 실행은 `chat_turn_executions.id=209ab75c-ad86-467e-82fd-d6fe2050b8ac`, `status=running`, `streaming_placeholder` 1건만 존재했다. 저장 중복이 아니라 프론트가 같은 `execution_id`의 `streaming_placeholder`, `interrupted_partial`, `recovered/interrupted` draft를 동시에 렌더링할 수 있는 병합 경합으로 분리했다.
- 반영: `isAssistantDraftMessage()`를 추가하고 `mergeServerMessagesPreservingLocal()`에서 같은 `execution_id`의 draft assistant를 1개로 collapse한다. 최종 assistant가 저장된 execution의 draft류는 제거한다. 렌더 단계도 같은 `execution_id`의 draft는 본문 overlap이 약해도 중복 그룹으로 묶도록 보강했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run build` 통과.

## 2026-05-15 (Chat 응답 버블 중복/도구 박스 깜빡임 재수정)
- 대상: `/chat#5f09a33c-7535-42e6-929d-ae999803c64f`, `/chat#8ad08cc2-620c-4a70-8305-74a8d9b43c4e` 등에서 응답 중 assistant 버블이 2개처럼 보이거나 도구 박스가 접혔다 펴지는 현상.
- 원인: SSE `done`/`message_done`/resume/last-response 경로가 placeholder를 최종 메시지로 바꾸는 방식이 서로 달랐고, `done` 직후 350ms/1.5s 서버 재조회가 즉시 실행되어 로컬 최종 버블과 DB 최종 버블 병합이 경합했다. 일부 교체 경로는 `render_id`를 보존하지 않아 React key가 바뀌면서 도구 박스가 리마운트됐다.
- 반영: `replaceStreamingPlaceholderWithFinal()`로 최종 버블 교체를 단일화해 `render_id`를 유지하고, 중복 placeholder/partial을 제거한다. `done` 직후 즉시 재조회는 5초 merge cooldown으로 대체했고, 이미 final을 받은 경우 finally의 `just_completed` 원샷 조회를 건너뛰게 했다. 마지막 assistant의 도구 박스/긴 본문 자동 펼침은 effect setState 대신 파생값으로 처리해 접힘/펼침 cascade를 제거했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run build` 통과, `npx tsc --noEmit` 통과, `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 22개).

## 2026-05-14 (Chat assistant 중복 버블 렌더링 압축)
- 대상: `/chat#f31f1238-fdc8-4405-8893-351226e06bda` 등에서 응답 중 assistant 버블이 여러 개 보였다가 새로고침 후 DB 기준 1개만 남는 현상.
- 확인: 직전 `ee9a08d`는 실제 blue/green 배포까지 완료됐고, 배포 이후 대상 세션 DB에는 중복 assistant 저장이 없었다. 남은 증상은 실행 중 브라우저 메모리에 남는 draft/recovered/interrupted assistant 버블이 화면에서 압축되지 않는 렌더링 문제로 확인했다.
- 반영: assistant 메시지 렌더링 배열 생성 단계에서 `streaming_placeholder`, 로컬 transient, `interrupted`, `recovered` 버블의 본문이 연속으로 겹치면 가장 긴 본문 1개만 대표 표시하고 나머지는 기존 중복 메시지 접기 UI로 묶도록 보강했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run build` 통과. `npm run lint`는 기존 전역 lint 부채 274건으로 실패했으며 이번 변경 파일 신규 빌드 오류는 없음.

## 2026-05-18 (Chat interrupted_partial dependency conflict guard)
- 대상: `/chat#2648cf77-4256-45e8-9cde-0e563ffefe5c` 등에서 복구/중단 시 현재 응답 버블이 사라지거나 2개처럼 보이는 재발 현상.
- 원인: 과거 partial 숨김용 `interrupted_partial` intent를 현재 진행 중 placeholder 보존에도 재사용해, `isHiddenAssistantMessage()` 필터와 충돌했다.
- 반영: 스트리밍 stuck/복구 타임아웃에서 현재 placeholder를 `interrupted_partial`로 숨기지 않고, `intent=undefined`, `model_used='interrupted'`, stable `render_id`로 visible partial bubble을 유지하도록 변경했다. 과거 DB partial 숨김 정책은 유지한다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run lint -- src/app/chat/page.tsx` 에러 0개(기존 경고 22개), `npm run build` 통과.

## 2026-05-14 (Chat streaming placeholder 중복 제거)
- 대상: `/chat#aa433b41-0ad2-421c-ae7c-bac4806035cc` 등에서 응답 중 로컬 `streaming_placeholder` 버블이 여러 개 보이다가 새로고침 후 DB 기준 1개로 정리되는 현상.
- 원인: 프론트가 새 지시 전송 시 내용 없는 이전 로컬 placeholder도 보존 문구로 얼리고, 서버 최종 assistant가 도착해도 `execution_id` 없는 로컬 placeholder를 제거하지 않아 화면 상태에만 중복 버블이 누적될 수 있었다.
- 반영: 내용 없는 placeholder는 보존하지 않고 제거하며, 서버 assistant가 해당 시점 이후 도착하면 매칭되지 않은 로컬 streaming placeholder를 정리하도록 `mergeServerMessagesPreservingLocal()`을 보강했다.
# 2026-06-05 15:06 KST - Chat streaming-stuck false interrupt guard

- 대상: `https://aads.newtalk.kr/chat#7e4a270f-0134-4f8b-bf6d-04b08e66e002` 세션에서 마지막 응답 버블이 최종 완료되지 않고, 장시간 응답 중 하단에 "응답 중단" 배지가 반복 표시될 수 있는 현상.
- DB 실측: 해당 세션의 최신 실행 `366ccc75-d30a-48d8-b60c-be31eb838160`은 `running` 상태였고, `updated_at`이 계속 갱신 중이었다. 최신 assistant 메시지는 `streaming_placeholder`, `model_used=streaming`으로 최종 완료 메시지가 아니었다.
- 원인: 프론트 `STREAMING-STUCK` 안전장치가 서버가 아직 `is_streaming=true`라고 보고하는 중에도 진행 키 변화가 오래 없으면 placeholder를 `interruption_notice/model_used=interrupted`로 전환했다. 긴 도구 실행이나 LLM 지연 중 이 분기가 실행되면 실제 실행은 살아 있는데 UI만 "응답 중단"으로 보이고, 이후 재연결/폴링으로 다시 진행되는 것처럼 보인다.
- 반영: `src/app/chat/page.tsx`에서 `ss.is_streaming && _streaming` 상태의 stuck 분기는 더 이상 placeholder를 interrupted로 바꾸거나 streaming을 끄지 않는다. 대신 서버 생성 상태를 유지하고, 메시지 병합과 execution replay 재연결만 수행한다.
- 검증: `npx tsc --noEmit --pretty false` 통과. `npx eslint src/app/chat/page.tsx src/services/chatApi.ts` 에러 0개, 기존 경고 23개. `npm run build` 통과.
- 배포: 본 변경은 아직 커밋/푸시/배포 전이다.

- 추가 보정: `deploy.sh`가 nginx upstream 전환 후 `.active_container`/`.active_port` 상태 파일을 갱신하도록 수정했고, 현재 상태 파일을 active green(`aads-dashboard-green`, `3101`)으로 보정했다.
- 변경 파일: `src/app/chat/page.tsx`, `deploy.sh`, `HANDOVER.md`.
- 검증: `npm run build` 통과, `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 21개), `./deploy.sh` blue-green 배포 및 프론트 QA 통과.

## 2026-05-13 (Chat TODO 즉시 갱신 보강)
- 대상: 채팅창 상단 TODO 패널의 생성/완료 직후 갱신 지연.
- 반영: 사용자 메시지 전송 직후 `600ms/1.8s/4.2s` 지연 재조회와 스트리밍 완료 직후 즉시 재조회를 추가해, 새로 생성되거나 완료 처리된 TODO가 폴링 주기까지 기다리지 않고 패널에 반영되도록 했다.
- 변경 파일: `src/app/chat/page.tsx`.
- 검증: `npx tsc --noEmit --pretty false` 통과. `npx eslint src/app/chat/page.tsx`는 에러 0개, 기존 경고 21개.

## 2026-05-13 (Chat TODO 정리 UI)
- 대상: 채팅창 상단 TODO 패널의 사용자 정리 액션.
- 반영: 실패 TODO 재시도, 완료/실패/대기 일괄 비우기, 항목별 재시도/제외/숨김 버튼을 `src/app/chat/page.tsx`에 추가했다.
- 백엔드 연동: AADS API의 `PATCH/DELETE /chat/sessions/{session_id}/todos/{todo_id}`, `POST /chat/sessions/{session_id}/todos/clear`, `POST /chat/sessions/{session_id}/todos/retry-failed`를 호출한다.
- 검증: `npx tsc --noEmit --pretty false` 통과. `npx eslint src/app/chat/page.tsx`는 에러 0개, 기존 경고 21개.

## 2026-05-12 (AADS-BRIDGE-SESSION-001F)
- 대상: `runner-7e568511` 후속 조치 (dashboard 배포 실패 `nginx 설정 검증 실패 — upstream 롤백`)
- 확인: Runner 실패 로그는 `Step 3: nginx upstream -> green` 직후 `nginx -t` 실패로 중단됨.
- 원인 정리: 기존 `deploy.sh`는 `nginx -t` 실패 원인을 버리고(`>/dev/null 2>&1`), 실행 환경에 따라 `/var/run/nginx.pid` 접근 이슈가 발생하면 upstream 문법이 정상이어도 false-fail 될 수 있음.

### 반영된 수정 (`deploy.sh`)
- `nginx_test()`:
  - `nginx -t`를 기본 검증으로 사용하고 실패 시 stderr를 그대로 출력해 원인 로그를 남김.
  - 1차 후속 배포에서 `-g "pid ..."` 방식이 서버의 기존 `pid` 지시어와 중복되는 문제가 확인되어 제거함.
  - 호스트 nginx 테스트 실패 시 `aads-nginx` 컨테이너가 실제로 존재할 때만 컨테이너 검증으로 폴백.
- `nginx_reload()`:
  - `systemctl reload nginx`가 불가한 환경이면 `nginx -s reload`를 먼저 시도.
  - 컨테이너 폴백은 `aads-nginx` 존재 시에만 수행.
- `verify_upstream_shape()` 추가:
  - upstream 파일에 `3100`, `3101` 라인이 최소 1개씩 있는지 사전 검증 후 전환.
- Step 3/rollback 검증에서 stdout/stderr를 버리지 않도록 변경.

### 영향 범위
- 변경 파일: `deploy.sh` 1개.
- 영향 대상: dashboard blue-green 배포 시 nginx upstream 전환 검증/리로드 경로.
- 비영향: Browser Bridge 업무별 세션 매니저 로직(`browser_work_key`, `ensure_work_session`)은 수정하지 않음.

### Browser Bridge 사용 예시 (운영 규칙 유지)
- 신상마켓 전용 세션 확보:
  - `browser_connect(action='ensure_work_session', work_key='ntv2-sinsang-registration')`
- 중국상품소싱 관리자 전용 세션 확보:
  - `browser_connect(action='ensure_work_session', work_key='ntv2-china-sourcing-admin')`
- 같은 업무 키 재호출(동일 세션 재사용 기대):
  - `browser_connect(action='ensure_work_session', work_key='ntv2-china-sourcing-admin')`
- 업무 키로 격리된 후속 작업:
  - `browser_snapshot(browser_work_key='ntv2-china-sourcing-admin')`
- 세션/매핑 상태 확인:
  - `browser_connect(action='status')`
## 2026-05-20 15:42 KST - Chat bubble immediate placeholder and interrupted partial continuity

- 대상: 채팅창에서 질문 직후 응답 버블이 늦게 뜨거나, 중단 응답이 이어가기 중 사라지고, 복구 중 버블이 중복 표시되는 현상.
- 원인: 첫 세션 생성 경로에서 방금 만든 optimistic `streaming_placeholder`까지 `freezeStreamingPlaceholders()`로 `interrupted_partial` 처리해 현재 응답 버블을 불안정하게 만들었다. 또한 `partial_preserved` 처리 시 기존 `interrupted_partial` 전체를 제거해 DB에 저장된 partial을 화면에서 잃을 수 있었다.
- 반영: `src/app/chat/page.tsx`에서 1자 이상 저장된 placeholder를 visible partial로 전환하고, `partial_preserved`는 기존 partial을 유지한 채 새 placeholder를 이어 붙이도록 수정했다. 실시간 `thinkingBuf`를 placeholder의 `thinking_summary`로 주기 동기화해 중단 후에도 사고 과정 박스에 남도록 했다.
## 2026-06-10 11:14 KST - Chat false completion toast guard

- 대상: 채팅창에서 응답이 완료처럼 보였다가 `완료 전 중단`으로 뒤집히는 현상.
- 원인: `/streaming-status`가 `just_completed=true`를 반환하면 프론트가 최종 assistant 존재 여부와 무관하게 streaming 상태를 해제하고 완료 토스트를 표시할 수 있었다. 이후 DB 메시지 재조회에서 같은 execution의 중단/archived partial이 들어오면 완료 버블이 중단 버블처럼 바뀌어 보였다.
- 반영: `src/app/chat/page.tsx`에서 `just_completed` 처리 시 `latestFinalAssistantForExecution()`으로 실제 최종 assistant를 확인한 경우에만 placeholder를 final로 교체하고 완료 토스트를 표시한다. 최종 assistant가 없으면 `waitingBgResponse/streaming`을 유지하고 `최종 응답 확인 중` 상태로 둔다. SSE 종료 직후 원샷 completion check도 동일하게 보강했다.
- 검증: `npm run build` 통과. `npm run lint` 전체는 기존 전역 ESLint 부채 276 errors/69 warnings로 실패했으며, 이번 변경 파일은 build 기준 통과했다.
- 배포 상태: 본 기록 후 backend와 함께 커밋/푸시 및 dashboard blue-green 배포 대상이다.

- 검증: `npm run lint -- src/app/chat/page.tsx` 에러 0개(기존 경고 22개), `npm run build` 통과.
- 배포: 본 문서 기록 후 백엔드 threshold 패치와 함께 커밋/푸시 및 무중단 배포를 진행한다.

## 2026-05-20 15:56 KST - Chat TODO manual list deployment fix

- 대상: 채팅창 하단/아티팩트 tasks TODO를 실제 작업 리스트 제목으로 직접 추가/관리하는 UI 반영 누락.
- 원인: `src/app/chat/page.tsx`와 백엔드 TODO API 변경은 소스에 있었지만, 활성 대시보드 컨테이너 정적 번들에는 `/todos` 생성 코드가 없어 사용자 브라우저 화면에 반영되지 않았다. 자동 배포는 cron PATH에 `nginx` 경로가 없어 upstream 검증 단계에서 false-fail로 롤백되고 있었다.
- 반영: `deploy.sh`에 `/usr/sbin` 포함 PATH를 명시해 cron/자동 동기화 환경에서도 `nginx -t`와 reload가 정상 실행되게 했다.
- 배포: `bash deploy.sh`로 dashboard blue-green 배포 완료. active 슬롯은 `aads-dashboard:3100`, standby는 `aads-dashboard-green:3101`.
- 검증: 외부 `https://aads.newtalk.kr/_next/static/chunks/app/chat/page-2dd488c1106b05b1.js`에서 `/todos` 호출 7건 확인, backend OpenAPI에서 `/chat/sessions/{session_id}/todos` 확인, `nginx -t` 통과.
- 남은 사항: Visual QA API 결과는 `UNKNOWN`으로 통과 판정하지 않음. 저장된 브라우저 로그인 자격증명이 없어 로그인 후 실제 클릭 QA는 미실행.

## 2026-05-20 16:42 KST - Chat interrupted response visibility and continue bubble

- 대상: `be533af6-c514-4bbc-b71c-bb68705addc0` 등 채팅창에서 응답 중단 후 부분 응답이 사라지거나, placeholder 문구가 새 응답 버블로 계속 쌓이는 현상.
- 원인: 1자 이상 표시 정책이 실제 LLM partial과 UI 상태문구(`분석 중`, `세션 생성 중`)를 구분하지 못해 placeholder-only 텍스트까지 `interrupted_partial`로 승격될 수 있었다. 또한 regenerate/이어쓰기 경로는 스트리밍 상태만 켜고 즉시 표시용 placeholder를 추가하지 않아 응답 버블이 늦게 보였다.
- 반영: `src/app/chat/page.tsx`에 placeholder-only 문구 필터를 추가해 실제 DB partial은 1자라도 표시하되 UI 상태문구만 단독 버블로 승격하지 않게 했다. 중단 응답의 사고 과정 요약은 기본 펼침으로 표시하고, 중단 응답의 재생성 버튼은 즉시 `이어서 생성 중` placeholder를 삽입한 뒤 최종 응답으로 in-place 교체한다.
- 검증: `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 22개), `npm run build` 통과. 백엔드 관련 파일은 `python3 -m py_compile app/services/chat_service.py app/services/model_selector.py app/routers/chat.py` 통과.
- 배포: 본 변경 커밋 후 dashboard blue-green 배포 대상.

## 2026-05-27 08:51 KST - Chat stale interrupt auto resend

- 대상: 세션 `f31f1238-fdc8-4405-8893-351226e06bda`에서 스트리밍이 멈춘 뒤 추가 지시를 보내면 user 버블만 저장되고 assistant 응답이 생성되지 않는 현상.
- 원인: 프론트가 `streamingRef/waitingBgRef`를 기준으로 `/interrupt`를 호출했고, 백엔드가 stale runtime을 `queued=false`로 반환해도 기존 코드는 입력 복원만 하고 일반 전송을 자동 재시도하지 않았다.
- 반영: `src/app/chat/page.tsx`에서 `/interrupt`가 `queued=false`를 반환하면 streaming/waiting/finalizing ref를 즉시 정리하고 같은 내용을 일반 `sendMessage()`로 자동 재전송한다. 사용자는 다시 입력하지 않아도 다음 턴이 생성된다.
- 검증: `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 21개), `npm run build` 통과.

## 2026-06-05 16:18 KST - Chat running placeholder completion badge guard

- 대상: 세션 `7e4a270f-0134-4f8b-bf6d-04b08e66e002`에서 DB 실행은 `running`인데 마지막 `streaming_placeholder` 버블이 완료처럼 표시되는 현상.
- 원인: `MessageItem` 완료 배지 조건이 `isActiveStreaming`에만 의존했다. SSE/브라우저 재연결이 끊겨 전역 streaming 플래그가 꺼지면, `intent='streaming_placeholder'` 메시지도 일반 assistant 완료 배지 블록으로 들어갈 수 있었다.
- 반영: `src/app/chat/page.tsx`에서 `isVisiblyStreaming = isActiveStreaming || isStreamingPlaceholder`로 렌더 기준을 통합했다. placeholder는 전역 streaming 플래그가 꺼져도 `생성 중` 배지를 유지하고 `완료` 배지를 표시하지 않는다.
- 검증: 본 변경 커밋 전 `npm run build`와 운영 API/컨테이너 상태를 확인한다.

## 2026-06-05 16:37 KST - Chat continued partial badge guard

- 대상: 새 지시가 들어와 이전 응답 partial이 `intent='continued'`로 보존된 뒤에도 하단에 `응답 중단` 또는 `완료` 배지가 표시되는 현상.
- 원인: DB는 일부 partial을 `continued`로 보정했지만 `model_used='interrupted'`가 남아 있고, 프론트 배지 조건이 `model_used`만 보고 장애 중단으로 분류했다.
- 반영: `src/app/chat/page.tsx`에 `isContinuedMessage()`를 추가해 `continued`는 별도 `이어서 생성됨` 출처 배지만 표시하고, `응답 중단`/`완료` 배지 조건에서 제외했다.
- 검증: `npx tsc --noEmit --pretty false`, `npm run build`, dashboard blue-green 배포 후 health/release 확인 대상.

## 2026-06-11 10:49 KST - AADS signup onboarding copy follow-up

- 배경: 일반 사용자가 처음 가입/로그인할 때 사용 흐름을 이해하기 어렵고, `/signup` 화면이 AADS 도메인에서도 `KakaoBot 회원가입`으로 보이는 문제가 확인됐다.
- 조치:
  - `src/app/signup/page.tsx`의 AADS 기본 가입 화면 문구를 `AADS 워크스페이스 회원가입`으로 수정했다.
  - 가입 후 `조직명과 팀원 권한을 설정합니다` 안내 문구를 추가해 `/onboarding` 흐름을 명시했다.
- 검증:
  - `npx eslint src/app/signup/page.tsx` 통과.
  - `bash deploy.sh`로 dashboard blue-green 배포 완료. active 슬롯은 `aads-dashboard:3100`, standby는 `aads-dashboard-green:3101`이다.
  - Browser Bridge 스냅샷 기준 `https://aads.newtalk.kr/signup?v=a8ce6b2`에서 수정 문구가 표시된다.
- 주의:
  - 배포 스크립트 Step 7 QA는 `UNKNOWN`으로 종료되어 통과로 간주하지 않는다. 수동 검증으로 화면 문구와 컨테이너 health를 확인했다.
  - Browser Bridge에서 가입 폼 입력 후 submit 이벤트가 API 요청으로 이어지지 않아 브라우저 가입 제출 E2E는 미확정이다. API 직접 검증 기준 customer tenant 생성, agenda 0건, customer briefing scope는 정상이다.

## 2026-06-12 12:11 KST - Admin home middleware auth URL fix

- 대상: CEO 계정이 `/chat` 홈 버튼으로 `/` 이동 시 관리자 홈 대신 `/chat`으로 되돌아가는 현상.
- 원인: middleware의 내부 `/auth/me` 확인 URL을 `new URL("/auth/me", "http://aads-server:8080/api/v1/")`로 만들면 `/api/v1` 경로가 버려져 `http://aads-server:8080/auth/me`를 호출했다. 이 404가 관리자 권한 없음으로 처리되어 CEO도 `/chat`으로 리다이렉트됐다.
- 반영: `src/middleware.ts`에서 상대 경로를 `auth/me`로 바꿔 실제 호출 대상이 `http://aads-server:8080/api/v1/auth/me`가 되도록 수정했다.
- 검증 예정: `npx tsc --noEmit --pretty false`, dashboard blue-green 배포, 공개 도메인 `https://aads.newtalk.kr/` 쿠키 기반 CEO/일반 사용자 리다이렉트 분리 확인.

## 2026-06-12 12:40 KST - Chat admin home Link cleanup

- 대상: 채팅 상단 `Dashboard` 홈 버튼.
- 반영: `src/components/chat/ChatLayout.tsx`의 `/` 이동 버튼을 `<a href="/">`에서 Next `Link`로 교체했다. 이동 대상은 그대로 `/`이며, CEO/internal admin은 middleware와 `/auth/me`의 `is_internal_admin` 판정으로 어드민 홈에 접근한다.
- 검증: `npx eslint src/middleware.ts src/components/ClientLayout.tsx src/components/Sidebar.tsx src/app/login/page.tsx src/components/chat/ChatLayout.tsx src/app/chat/ChatSidebar.tsx` 통과. `bash /root/aads/aads-dashboard/deploy.sh`로 release `7698f43ae41a` blue-green 배포 완료. Step 7 QA는 `UNKNOWN`이라 수동 health/API 검증으로 보완 필요.

## 2026-06-12 13:47 KST - Admin user session audit UI and faster admin navigation

- 배경: CEO가 어드민 메뉴 클릭 후 이동이 느리고 페이지 접근이 불안정하며, 관리자가 사용자별 세션을 접근 확인할 수 있어야 한다고 지시했다.
- 조치:
  - `src/app/admin/users/page.tsx` 사용자 행에 `세션 보기`를 추가해 해당 사용자의 tenant 세션과 메시지 상세를 관리자 화면에서 열람할 수 있게 했다.
  - `src/app/admin/sessions/page.tsx`에 이메일/tenant/세션명 검색, tenant/사용자/최근 질문 컬럼, 메시지 상세 패널을 추가했다.
  - `src/lib/api.ts`에 `/admin/sessions` 필터 파라미터와 `/admin/sessions/{session_id}` 상세 API 타입을 추가했다.
  - `src/middleware.ts`에서 메뉴 이동마다 서버 측 `/auth/me`를 재호출하던 관리자 판정을 제거했다. 일반 사용자 데이터 차단은 `ClientLayout`과 백엔드 admin API 권한으로 유지한다.
  - `src/lib/auth.ts`에서 `/auth/me` 결과를 단기 캐시해 클라이언트 라우트 이동 시 중복 인증 왕복을 줄였다.
- 검증:
  - `npx eslint src/app/admin/users/page.tsx src/app/admin/sessions/page.tsx src/lib/auth.ts src/middleware.ts` 통과.
  - `npx tsc --noEmit --pretty false` 통과.
  - 운영 API 검증: CEO 토큰 `/admin/sessions?email=objgood@naver.com` 200/3건, 일반 사용자 토큰 `/admin/sessions` 403 확인.
- 주의:
  - 과거 세션은 서버 DB에 작성자 ID가 없으므로 사용자 active tenant membership 기준으로 노출된다. 신규 세션은 서버 `chat_sessions.user_id`로 작성자 단위 추적된다.

## 2026-06-18 11:42 KST - Personal Assistant Hub minimum UI

- 배경: CEO가 AADS를 개인 인공지능 자비스처럼 만드는 진행상황 보고와 빠른 구현 진행을 지시했다. Pipeline Runner가 `dead_local_pid`, `empty_task_logs`로 반복 실패해 직접 최소 UI를 붙였다.
- 반영:
  - `src/app/assistant/page.tsx`를 추가해 내부 관리자용 Personal Assistant Hub를 제공한다.
  - `src/components/Sidebar.tsx`에 internal admin 전용 `Assistant Hub` 메뉴를 추가했다.
  - `src/components/ClientLayout.tsx`에 `/assistant`를 internal admin 경로로 등록해 일반 사용자는 `/chat`으로 차단한다.
- 검증:
  - `npx eslint src/app/assistant/page.tsx src/components/Sidebar.tsx src/components/ClientLayout.tsx` 통과.
  - 전체 `npm run lint`는 기존 전역 lint 오류 261건으로 실패했으며, 신규 변경 파일 단위 lint로 대체했다.
- 주의:
  - 배포/푸시는 아직 수행하지 않았다.
  - 실 OAuth 연결은 이번 범위가 아니라 readiness/status contract만 먼저 고정했다.

## 2026-06-12 13:19 KST - Chat home button cookie recovery

- 대상: CEO 계정이 채팅창 홈 버튼으로 `/` 이동 시 관리자 홈 접근이 간헐적으로 막히는 현상.
- 원인: 채팅 API는 `localStorage.aads_token`을 사용하지만 Next middleware는 `aads_token` 쿠키만 검사한다. 과거 로그인 세션이나 일부 복구 세션에서 localStorage에는 토큰이 있고 쿠키가 없으면 채팅은 정상 동작해도 `/` 접근은 인증 없음으로 처리될 수 있었다.
- 반영: `src/lib/auth.ts`에 `syncTokenCookieFromStorage()`를 추가하고 `getMe()`/`getToken()` 호출 시 쿠키를 복구한다. `src/app/chat/api.ts`도 채팅 API 토큰 조회 때 쿠키를 복구한다. 채팅 홈 버튼 2곳(`src/app/chat/ChatSidebar.tsx`, `src/components/chat/ChatLayout.tsx`)은 클릭 직전에 쿠키 동기화를 수행한다.
- 검증: `npx eslint src/lib/auth.ts src/app/chat/api.ts src/app/chat/ChatSidebar.tsx src/components/chat/ChatLayout.tsx` 통과. `npm run build` 통과. 운영 API 양 슬롯에서 CEO 테스트 토큰의 `/api/v1/auth/me`가 `is_internal_admin=true`를 반환했고, active dashboard green `http://127.0.0.1:3101/`는 CEO 쿠키로 `200 OK`를 반환했다.
- 주의: 전체 `npm run lint`는 기존 전역 ESLint 부채 265 errors/68 warnings로 실패한다. 이번 변경 파일 대상 lint는 통과했다.

## 2026-06-12 13:50 KST - Admin navigation speed patch reapplied after revert

- 배경: `c3037c8 fix(admin): speed up admin navigation`가 `9a4ad19 Revert "fix(admin): speed up admin navigation"`로 되돌아간 상태를 확인했다. 사용자별 세션 UI는 남아 있었지만, 관리자 메뉴 이동 지연 완화 패치가 빠져 있었다.
- 반영: `src/middleware.ts`에서 서버 측 `/auth/me` 관리자 판정 왕복을 제거하고 토큰 존재 확인만 수행하게 재적용했다. `src/lib/auth.ts`에는 `/auth/me` 30초 캐시를 다시 추가했다. 관리자 데이터 접근 통제는 백엔드 admin API 권한과 `ClientLayout` 클라이언트 가드가 유지한다.
- 검증: `npx eslint src/middleware.ts src/lib/auth.ts src/app/admin/users/page.tsx src/app/admin/sessions/page.tsx` 통과. `npx tsc --noEmit` 통과. 서버 관리자 세션 API 직접 호출 기준 `objgood@naver.com` tenant 세션 3건과 메시지 상세 5건 반환 확인.
- 주의: 신규 배포 전 기존 active release는 `9a4ad19afecf`였으며 Step 7 QA는 `UNKNOWN`이라 수동 API/라우트 검증으로 보완했다.

## 2026-06-12 18:39 KST - Codex usage bar lint-safe refresh

- 배경: 채팅 상단 Codex 사용량바가 `/ops/codex-usage`의 빈 `limits` 응답 시 사라지는 문제가 있었고, 서버 active 슬롯은 `ok=true` fallback 응답으로 복구된 상태를 확인했다.
- 반영: `src/components/chat/UsageBar.tsx`의 초기 fetch를 effect 본문 직접 호출에서 `window.setTimeout` 예약 호출로 바꿔 React hooks lint 오류를 제거했다. 표시 로직은 유지했다.
- 검증: `npx eslint src/components/chat/UsageBar.tsx` 통과. 서버 `https://aads.newtalk.kr/api/v1/ops/codex-usage`는 `200 OK`, `ok=true`, `limits[0]` 포함으로 확인했다.
- 주의: Codex relay가 `codex_rpc_timeout`이면 DB fallback이 표시되며, 현재 `oauth_usage_log`의 Codex 모델 기록은 0건이라 실시간 한도 수치가 아니라 안전 표시값이다.

## 2026-06-12 18:54 KST - Codex usage reset time on chat bar

- 배경: 채팅 상단 Codex 사용량바가 Claude처럼 남은 리셋 시간을 표시하지 않았다.
- 원인: `/api/v1/ops/codex-usage`는 `primary.resets_in_sec`, `secondary.resets_in_sec`를 내려주고 있었지만, `src/components/chat/UsageBar.tsx`가 Codex `MiniBar`에 `resetIn`을 전달하지 않았다. 또한 API 응답의 첫 항목이 `codex_bengalfox`일 수 있어 실제 Codex 항목 대신 0% 항목이 표시될 수 있었다.
- 반영: Codex limit 선택은 `limit_id="codex"`를 우선 사용하고, `resets_in_sec`를 `5h`, `1w` 막대 옆에 `4h30m`, `5d14h` 형식으로 표시하도록 수정했다.
- 검증: `npx eslint src/components/chat/UsageBar.tsx` 통과. 운영 API `http://127.0.0.1:8102/api/v1/ops/codex-usage` 기준 `codex` 항목의 5h/1w reset 초 값이 존재함을 확인했다.

## 2026-06-15 12:22 KST - Chat active streaming reconciliation

- 배경: 세션 `95c53d3f-2863-49f5-948e-53e4bab877e2`에서 재시도 후 화면에는 `응답 중단` 버블이 남고, 새로고침하면 같은 실행이 `생성 중` 버블로 바뀌는 표시 불일치가 있었다.
- 원인: 서버 `streaming-status`는 최신 실행을 `running`으로 반환하지만, 프론트의 로컬 interrupted/partial 버블이 polling merge 전에 우선 표시되어 새로고침 전후 상태가 달라졌다.
- 반영: `src/app/chat/page.tsx`에 active streaming reconciliation을 추가했다. `streaming-status.is_streaming=true`이면 같은 execution의 interrupted/partial/draft를 즉시 `streaming_placeholder`로 승격하고, 탭 복귀·세션 진입·5초 폴링·재시도/이어쓰기 스트림 시작/복구 실패 경로 모두 같은 보정 함수를 사용한다.
- 검증: `git diff --check` 통과. `npm run build` 통과. `npm run lint`는 기존 전역 ESLint 부채 264 errors/67 warnings로 실패했으며, 이번 변경 파일에는 신규 error가 확인되지 않았다. DB 직접 조회 기준 해당 세션은 `current_execution_id=e97e2aa4-b729-4595-a15d-e716b0767ef7`, `status=running`, 최신 assistant는 같은 execution의 `streaming_placeholder`였다.

## 2026-06-16 17:49 KST - Chat streaming duplicate and freeze guard

- 배경: 세션 `b0bdd28a-589a-4440-9fcf-8ff84560544c`에서 응답이 바로 끊겨 보이고, 스트리밍 중 추가지시/재시도 시 버블이 중복 생성되며 브라우저가 멈추는 현상이 보고됐다.
- 원인: 해당 실행은 `background_producer_incomplete_exit:missing_done_event`로 자동 재시도 중이었고, DB에는 긴 `streaming_placeholder`가 계속 갱신됐다. 프론트는 같은 내용의 placeholder를 반복 setState하면서 대형 Markdown을 재렌더링했고, 추가지시 로컬 버블과 DB 저장 `queued_interrupt`가 본문 형식 차이로 중복 병합될 수 있었다.
- 반영: `src/app/chat/page.tsx`에서 active streaming reconcile이 동일 content/execution 상태일 때 기존 배열을 그대로 반환하도록 해 불필요한 재렌더를 줄였다. 추가지시 로컬 버블은 `queued_interrupt` intent와 원문 content로 저장하고 동일 본문은 중복 추가하지 않도록 했다. 로컬/DB 추가지시 병합은 과거 `💬 **[추가 지시]**` prefix를 정규화해 같은 버블로 합쳐지게 했다. 사고 과정 라벨은 내부 추론 원문으로 오해되지 않도록 `진행 과정`으로 바꿨다.
- 검증: `git diff --check` 통과. `npm run build` 통과. `npm run lint`는 기존 전역 ESLint 부채 264 errors/67 warnings로 실패했으나 이번 변경 파일에는 신규 error가 확인되지 않았다. DB 직접 조회 기준 문제 세션 최신 실행 `0e1be3a3-5636-4469-9fe0-9ce535525e9c`는 17:48:40 KST `completed`로 닫혔고 assistant 최종 버블은 17,652자로 저장됐다.

## 2026-06-18 09:09 KST - Dashboard deploy QA active API alignment

- 배경: CEO가 blue-green 배포/헬스체크 기준과 대시보드 단독 배포 시 API 연쇄 재시작 방지 여부를 재검토하라고 지시했다.
- 확인: 대시보드 `deploy.sh`는 실제 빌드/standby 동기화 모두 `docker compose ... up -d --build --no-deps`를 사용한다. 다만 Step 7 Visual QA API 기본값이 `http://127.0.0.1:8100`으로 고정되어 API active 슬롯이 `8102`일 때 검증 기준이 어긋날 수 있었다.
- 반영: `deploy.sh` Step 7에서 `/etc/nginx/conf.d/aads-upstream.conf`의 `aads_api` upstream 중 non-backup active 포트를 파싱해 `QA_API_BASE` 기본값으로 사용하도록 수정했다. `AADS_API_BASE` 명시값은 계속 우선한다.
- 검증: `bash -n deploy.sh` 통과. 현재 upstream 기준 active API 포트 파싱 결과는 `8100`이다.

## 2026-06-18 09:12 KST - Chat model dropdown uses full registry

- 배경: CEO가 채팅 모델 추가를 등록된 모든 모델이 드롭다운에 반영되도록 지시했다.
- 확인: 운영 `llm_models` 레지스트리에는 478개 모델이 있고, 기존 채팅/토론 UI는 `/llm-models?active_only=true`만 호출해 실행 가능 모델만 표시했다.
- 반영: `src/app/chat/page.tsx`, `src/components/chat/ModelSelector.tsx`, `src/components/chat/DiscussionPanel.tsx`가 `/llm-models` 전체 레지스트리를 읽도록 변경했다. 실행 가능하지 않은 모델은 드롭다운에 `(비활성)`으로 표시하고 disabled 처리해 등록 현황은 보이되 실수 선택은 막는다.
- 검증: `npx eslint src/components/chat/ModelSelector.tsx src/components/chat/DiscussionPanel.tsx src/app/chat/page.tsx` 통과. 기존 `src/app/chat/page.tsx` 경고 22건은 남아 있으나 신규 error는 없다.

## 2026-07-23 10:38 KST - unni.newtalk.kr public domain cutover

- 대상: 언니냉면 홈페이지의 대표 URL을 `https://unni.newtalk.kr`로 전환하고 기존 `https://aads.newtalk.kr/unni-naengmyeon` 경로를 호환 유지했다.
- 반영:
  - `src/middleware.ts`에서 `unni.newtalk.kr` 루트 요청을 `/unni-naengmyeon`으로 내부 rewrite한다.
  - nginx의 `unni.newtalk.kr` HTTPS 프록시와 기존 대시보드 호스트 라우팅을 적용했다.
  - 기본 브랜치 라우팅 커밋 `bade060` (`feat: unni.newtalk.kr domain routing with public access`)을 원격 `main`에 푸시했다.
  - 실제 dashboard blue-green 양 슬롯은 언니냉면 전체 페이지·자산·호스트 격리가 포함된 전용 릴리스 `ffd6d6f69a81`로 동기화했다.
- 검증:
  - `https://unni.newtalk.kr/` → `HTTP/2 200`, `x-middleware-rewrite: /unni-naengmyeon`.
  - 공개 HTML에서 언니냉면 제목, canonical/OG URL, NAS 메뉴 이미지와 메뉴 설명을 확인했다.
  - `https://unni.newtalk.kr/admin`, `/assistant` → `307 /`로 차단되고, 기존 `https://aads.newtalk.kr/unni-naengmyeon` → `HTTP/2 200`을 확인했다.
  - `aads-dashboard:3100`, `aads-dashboard-green:3101` 양 슬롯은 Docker health 기준 healthy이며 `AADS_RELEASE_SHA=ffd6d6f69a81`로 일치한다.
  - nginx에 중복 등록된 `unni.newtalk.kr` 서버 블록 1세트를 제거하고 `nginx -t` 통과 후 무중단 reload했다. `conflicting server name` 경고는 제거됐다.
- 주의: Browser Bridge 스크린샷은 2회 timeout되어 브라우저 캡처 대신 공개 HTTP, HTML, 정적 자산, 컨테이너 health 검증으로 대체했다. `public/manager/env_unknown.json`의 기존 미커밋 변경은 이번 커밋에서 제외해 보존했다. 언니냉면 전용 페이지는 별도 브랜치/compose overlay로 배포되므로 일반 dashboard `main` 배포 시 전용 릴리스를 다시 동기화해야 한다.

## 2026-07-23 12:26 KST - unni.newtalk.kr main release integration

- 장애: 일반 dashboard `main@785acadb4b00` 배포 후 `https://unni.newtalk.kr/`이 다시 HTTP 404를 반환했다.
- 원인: `main`에는 전용 도메인 middleware rewrite만 병합되어 있었고, rewrite 대상인 `/unni-naengmyeon` 페이지와 `public/brands/unni-naengmyeon` 자산은 전용 브랜치에만 남아 있었다.
- 조치:
  - 최신 `main` 기준 격리 브랜치에 언니냉면 홈페이지·브랜드 페이지·최종 메뉴/로고/입간판 자산을 통합했다.
  - `src/middleware.ts`는 전용 호스트의 공개 경로만 허용하고 AADS 내부 경로는 루트로 차단한다. 기존 E2E 호환 rewrite, 매장비서 호스트, 카카오봇 및 인증 redirect query 보존 로직은 유지했다.
  - `src/app/layout.tsx`, `src/components/ClientLayout.tsx`는 언니냉면 호스트에서 전용 metadata·theme·favicon을 제공하고 AADS 인증/sidebar/service worker를 노출하지 않는다.
  - 언니냉면 페이지와 자산을 기본 릴리스에 포함해 이후 일반 dashboard 배포에서도 404가 재발하지 않도록 했다.
- 사전 검증: 대상 ESLint, `npx tsc --noEmit`, `git diff --check`, Next.js 16.1.6 production build를 통과했으며 `/unni-naengmyeon`, `/unni-naengmyeon/brand/logo`, `/unni-naengmyeon/brand/banners`를 포함한 60개 라우트가 생성됐다.
- 배포 검증 기준: Blue/Green 양 슬롯의 `Host: unni.newtalk.kr` 루트 HTTP 200, 외부 루트 HTTP 200/redirect 0회, 언니냉면 제목·canonical·주소·메뉴 본문 및 대표 이미지 HTTP 200, AADS 내부 경로 307 루트 차단, 양 컨테이너 healthy·동일 release SHA.
- 롤백: 외부 헬스 또는 홈페이지 E2E 실패 시 Nginx dashboard upstream을 직전 `785acadb4b00` 슬롯로 즉시 되돌리고, 본 커밋을 revert한다.
- 운영 반영·검증 (2026-07-23 12:34~12:41 KST):
  - 앱 릴리스 `f6766a172e02`를 Blue에 먼저 빌드해 내부 헬스 통과 후 Nginx를 Blue로 전환했고, Green standby도 같은 릴리스로 동기화했다. 양 컨테이너는 `healthy`다.
  - `docker exec aads-nginx nginx -t` 통과. 외부 루트는 HTTP 200, redirect 0회, `text/html; charset=utf-8`이며 Blue/Green 직접 요청도 각각 HTTP 200이다.
  - 외부 HTML에서 제목 `언니냉면 | 성신여대 배달 냉면`, canonical `https://unni.newtalk.kr`, 주소 `동소문로 90 1층`, `외할머니 명태회냉면`, `냉면 + 수제돈까스`를 확인했다.
  - 대표 메뉴 이미지는 HTTP 200, `image/jpeg`, 1,755,446바이트다. `/admin`은 `307 https://unni.newtalk.kr/`로 차단되고 기존 `https://aads.newtalk.kr/unni-naengmyeon`은 HTTP 200을 유지한다.
  - 자동 Visual QA는 `UNKNOWN`이라 통과로 간주하지 않았다. CEO용 캡처 도구는 timeout, 호스트에는 Playwright/Chromium 실행 파일이 없어 화면 캡처는 미실행했으며 공개 HTTP·HTML·정적 자산·양 슬롯·Nginx 검증으로 대체했다.

## 2026-07-23 13:24 KST - unni B-1 300DPI download source integration

- 원인: 운영 정적 경로에는 B-1 300DPI PNG가 배치되어 다운로드가 가능했지만, `main` 소스에는 다운로드 링크와 원본 두 파일이 없어 다음 일반 dashboard 재배포 시 누락될 위험이 있었다.
- 조치: 배너 페이지의 B-1 앞·뒷면에 300DPI 다운로드 링크를 추가하고 `public/brands/unni-naengmyeon/banners-20260722/print/300dpi/`에 앞면 77,157,245바이트, 뒷면 38,277,235바이트 PNG를 포함했다.
- 범위: `src/app/unni-naengmyeon/brand/banners/page.tsx`, 300DPI PNG 두 파일과 본 HANDOVER 기록만 반영했다. 기존 `public/manager/env_unknown.json` 변경은 제외해 보존했다.
- 롤백: 본 통합 커밋을 revert하면 다운로드 링크와 저장소 원본만 제거된다. 현재 운영 정적 파일은 별도 경로에 유지되므로 즉시 다운로드 장애를 유발하지 않는다.

## 2026-07-23 14:09 KST - unni.newtalk.kr 도메인 전환 및 green 슬롯 배포 완료

- unni.newtalk.kr DNS/HTTPS 연결 확인, nginx server block 추가 완료
- middleware.ts에 unni.newtalk.kr 호스트 감지 → 루트 / → /unni-naengmyeon rewrite, 인증 생략
- layout.tsx/ClientLayout.tsx hydration 대응: data-unni-domain 속성 전달, 인증 체크 생략
- green 슬롯(3101) Docker 빌드 성공, nginx upstream green active 전환 완료
- 검증: unni.newtalk.kr 루트 200, /admin 307 차단, aads.newtalk.kr/unni-naengmyeon 200 호환 유지
- NAS 메뉴 이미지 9종 모두 HTTP 200 확인
- Release: a643fe1 (dashboard), green active(3101), blue standby(3100)

## 2026-07-24 15:04 KST - unni logo registration JPG download

- 원인: 로고 가이드에는 PNG 원본 열기만 제공되어, 560×560 이상 정사각형·900KB 이하·JPG 전용 등록 조건을 바로 만족하는 다운로드 파일이 없었다.
- 조치: 컨셉 H 메인 로고 PNG를 흰 배경 1000×1000 JPEG로 변환해 `public/brands/unni-naengmyeon/logo-downloads/unni-naengmyeon-logo-1000-square.jpg`에 추가했다.
- 조치: `/unni-naengmyeon/brand/logo`의 USAGE 영역에 등록 조건 맞춤 JPG 다운로드 카드를 추가했다.
- 검증 기준: 공개 페이지 HTTP 200, JPG HTTP 200 및 `image/jpeg`, 실제 다운로드 파일 metadata `1000×1000`, 900KB 이하, Next.js build 통과.
- 롤백: 본 변경 커밋을 revert하면 다운로드 카드와 JPG 원본만 제거된다. 기존 로고 가이드와 PNG 아카이브는 유지된다.

## 2026-07-26 08:54 KST - chat scroll jump on question send

- 원인: 질문 전송 직후 사용자 메시지와 streaming placeholder가 추가되는 동안 브라우저 기본 scroll anchoring이 장문 메시지 중간을 기준점으로 잡고, 동시에 상단 근접 자동 이전 대화 로드와 여러 직접 `scrollTop` 보정 경로가 경합해 채팅창이 상단으로 이동할 수 있었다.
- 조치: `src/app/chat/page.tsx`에 공통 `scrollToMessagesBottom()` 보정 함수를 추가하고, 질문 전송 시작 시 8초 동안 이전 대화 자동 로드를 억제하며 하단 모드를 명시했다. 스트리밍 완료·폴링 복구·브리핑·중지 경로의 직접 스크롤 보정을 공통 함수로 통합했다.
- 조치: 메시지 스크롤 컨테이너의 `overflowAnchor`를 `none`으로 바꾸고 하단 sentinel만 앵커 후보로 남겨, 장문 응답 DOM 높이 재계산 시 상단 메시지가 임의 기준점이 되지 않도록 했다.
- 검증: `npx tsc --noEmit` 통과, `npm run build` 통과. 배포 후 `/chat` HTTP 200, 대시보드 컨테이너 healthy, 릴리스 SHA 확인이 필요하다.
- 롤백: 본 변경 커밋을 revert하고 직전 dashboard 릴리스로 Blue/Green 전환하면 스크롤 정책을 이전 상태로 복구할 수 있다.

## 2026-07-26 09:16 KST - chat scroll jump deployment verification

- 추가 확인: dashboard `main`, `origin/main`, `dashboard-write/main`이 `e203c91815e0c8050aa8772bed839b8e9570fac5`로 일치했고, 양 대시보드 컨테이너의 `AADS_RELEASE_SHA`도 `e203c91815e0`로 일치했다.
- 운영 검증: `aads-dashboard`와 `aads-dashboard-green`은 Docker health 기준 모두 healthy이며, Nginx dashboard upstream은 green `3101` active / blue `3100` backup 구조다. `/chat` 외부 요청은 인증 보호 때문에 `307 /login?redirect=%2Fchat`이 정상 반환됐다.
- 번들 검증: 운영 컨테이너 번들에서 `overflowAnchor:"none"`이 확인되어 메시지 컨테이너의 브라우저 기본 scroll anchoring 비활성화가 배포 반영됐다.
- 재검증: `npx tsc --noEmit`, `npm run build`, `git diff --check`, `python3 -m py_compile /root/aads/aads-server/app/services/chat_service.py`를 통과했다.
- 미검증: 인증된 CEO 브라우저에서 실제 질문 전송 후 스크롤 위치를 눈으로 확인하는 E2E는 미실행이다. 캡처 도구의 저장 URL은 HTML을 반환해 이미지 판독에 실패했으므로, 코드/빌드/운영 번들/컨테이너/HTTP 검증으로 대체했다.

## 2026-07-26 09:28 KST - chat scroll jump follow-up fix

- 원인 정정: 이전 보고에서 "이전 대화 prepend 시 기존 scrollTop까지 포함해 위치 보존"이라고 했지만 실제 운영 코드는 `container.scrollTop = container.scrollHeight - prevScrollHeight`만 적용되어 기존 오프셋을 보존하지 않았다. 또한 초기 로드 `ResizeObserver`가 3초 동안 사용자 wheel/touch/pointer 입력과 관계없이 하단 고정을 유지해 질문 전송 직후 DOM 재배치와 경합할 수 있었다.
- 조치: `src/app/chat/page.tsx`의 이전 대화 로드 보정을 `newScrollHeight - prevScrollHeight + prevScrollTop`으로 변경해 prepend 전후 같은 메시지 위치를 유지하도록 했다. 초기 로드 scroll stabilizer는 3초에서 0.8초로 줄이고, 사용자가 wheel/touch/pointer 입력을 시작하면 즉시 해제하도록 변경했다.
- 검증: `npx tsc --noEmit`, `git diff --check`, `npm run build`를 통과했다. 빌드는 Next.js 16.1.6 기준 60개 route 생성까지 성공했다.
- 배포 검증: 커밋 `074eaff5d524`를 dashboard `main`에 푸시했고 Blue/Green 배포 스크립트가 green active / blue standby 동기화와 release 확인을 완료했다. 양 컨테이너는 `healthy`, `AADS_RELEASE_SHA=074eaff5d524`였고 `/chat` 및 대상 세션 URL은 인증 보호 `307 /login?redirect=...`를 반환했다.
- 번들 검증: 양 슬롯 운영 번들에서 `overflowAnchor:"none"`, `touchstart`, `pointerdown`, `setTimeout(r,800)` 토큰을 확인해 이번 scroll stabilizer 변경이 배포 번들에 포함된 것을 확인했다.
- 미검증: E2E Vault 계정 `e2e_auto@aads.dev` 로그인 테스트가 `failed`로 종료되어 인증된 브라우저에서 실제 질문 전송 후 스크롤 위치를 눈으로 확인하는 수동 E2E는 미완료다. 코드/빌드/운영 번들/컨테이너/HTTP 검증으로 대체했다.

## 2026-07-26 09:57 KST - chat scroll jump final ledger reconciliation

- 원장 보정: 이전 완료 보고의 commit/push/deploy/document 상태가 실제 ledger와 충돌할 수 있어 dashboard `HEAD`, `origin/main`, `dashboard-write/main`, Blue/Green release env, external HTTP, Docker health를 같은 절차로 재검증하도록 정리했다.
- 배포 기록: `/root/aads/aads-dashboard/deploy-logs/dashboard-deploy-20260726-095022.log`에서 green active 전환, blue standby 동기화, release 확인, external health 통과가 기록됐다.
- 운영 검증 기준: 최종 완료 판정은 배포 후 `git fetch --all --prune`, `git rev-parse HEAD origin/main dashboard-write/main`, 양 컨테이너 `AADS_RELEASE_SHA`, `docker ps`, `curl https://aads.newtalk.kr/login`, `curl https://aads.newtalk.kr/chat` 결과가 일치할 때로 한다.
- 정적 검증: `npx tsc --noEmit`, `npm run build`, `git diff --check -- src/app/chat/page.tsx HANDOVER.md`를 통과했다. Next.js 빌드는 60개 route 생성을 완료했다.
- 미검증: QA Step 7은 API Bearer 인증 누락으로 `UNKNOWN`이라 통과 근거로 쓰지 않는다. 인증된 CEO 브라우저에서 실제 질문 전송 후 스크롤 위치를 눈으로 확인하는 E2E는 아직 미완료다.

## 2026-07-26 18:21 KST - unni recipe guide page

- 요청: CEO가 제공한 언니냉면 주메뉴/사이드 메뉴 조리법을 사이트에 반영.
- 조치:
  - `/unni-naengmyeon/recipes` 공개 라우트를 추가하고 면삶기, 물냉면, 비빔냉면, 언니냉면, 불냉면, 명태회냉면, 묵사발, 사이드 메뉴 조리 기준을 단계형 카드로 정리했다.
  - 기존 언니냉면 홈페이지 상단 메뉴에 `조리법` 링크를 추가했다.
  - 메뉴 이미지 자산은 기존 NAS 반영본 중 물냉면, 비빔/불냉면, 명태회냉면, 묵사발 이미지만 조리 참고 이미지로 연결했다.
- 검증:
  - `npx tsc --noEmit` 통과.
  - 대상 파일 ESLint `npx eslint src/app/unni-naengmyeon/page.tsx src/app/unni-naengmyeon/recipes/page.tsx` 통과.
  - 전체 `npm run build` 통과. Next.js 16.1.6 기준 `/unni-naengmyeon/recipes` 포함 61개 route 생성.
  - 로컬 production server `127.0.0.1:3013`에서 `Host: unni.newtalk.kr` 기준 `/`, `/unni-naengmyeon`, `/unni-naengmyeon/recipes` 모두 HTTP 200 확인. HTML에 `조리법 가이드`, `물냉면`, 홈 `조리법` 링크 포함 확인.
- 주의:
  - 조리 g/cc/시간이 포함된 운영 정보가 공개 페이지에 노출된다. 외부 노출을 원하지 않으면 middleware/API auth가 걸린 내부 직원용 경로로 전환해야 한다.
  - 전체 `npm run lint`는 기존 대시보드 전역 오류 261건으로 실패했으며, 이번 변경 파일 대상 ESLint는 통과했다.
  - Browser Bridge `capture_screenshot`은 timeout되어 시각 캡처는 미완료이며, HTTP/HTML/build 검증으로 대체했다.
- 롤백: 본 변경 커밋을 revert하면 조리법 페이지와 홈 상단 링크가 제거된다. 기존 언니냉면 메뉴/이미지/문의 페이지는 유지된다.

## 2026-07-26 18:33 KST - chat scroll jump final deployment ledger closeout

- 요청: 채팅창에서 질문하면 스크롤이 상단으로 이동되는 현상 조치 완료 보고가 commit/push/deploy/document 원장과 충돌한다는 지적에 따라 실제 원장을 재검증했다.
- 코드 상태: 스크롤 조치 커밋 `074eaff5d524`는 이후 문서 보정 및 언니냉면 조리법 커밋을 거쳐 `origin/main` 최신 `49caaf9cf8b5`에 포함되어 있다. `src/app/chat/page.tsx`에는 질문 전송 직후 하단 고정, 이전 대화 prepend 위치 보존, 메시지 컨테이너 `overflowAnchor: none`, 하단 sentinel anchor가 반영되어 있다.
- 검증: `npx tsc --noEmit` 통과. 외부 `https://aads.newtalk.kr/chat`, active `127.0.0.1:3101/chat`, standby `127.0.0.1:3100/chat`는 인증 보호 경로로 `307 /login?redirect=%2Fchat`를 반환했다.
- 배포: `/root/aads/aads-dashboard/deploy-logs/dashboard-deploy-20260726-182251.log` 기준 `18:31:59 KST` Blue/Green 배포 완료. Active는 green `3101`, standby는 blue `3100`이며 양 컨테이너 모두 `AADS_RELEASE_SHA=49caaf9cf8b5`, Docker health `healthy`다.
- 정정: 이전 중간 보고의 `fee516f0fa70` 배포 완료 표기는 당시 기준으로는 스크롤 조치가 포함된 릴리스였지만, 최신 `origin/main`과 운영 active SHA가 다를 수 있어 최종 완료 보고 근거로는 부족했다. 최종 완료 기준은 이번 `49caaf9cf8b5` 배포 로그와 양 슬롯 SHA 일치로 보정한다.
- 미검증: 인증된 CEO 브라우저에서 실제 질문 전송 후 스크롤 위치를 눈으로 확인하는 E2E는 자동 QA 인증 누락으로 미실행이다. 코드/타입검사/HTTP/컨테이너/SHA 검증으로 대체했다.

## 2026-07-26 18:44 KST - chat scroll deployment ledger audit

- 재확인 사유: 이전 자동 완료보고 검증기가 workspace ledger의 과거 미완료 항목을 섞어 "미완료 344건"을 표시했으므로, 실제 Git/컨테이너/HTTP/문서 상태를 다시 분리 확인했다.
- Git 원장: `HEAD`, `origin/main`, `dashboard-write/main`은 모두 `efbb634a13722dd52349c3ab49297ec2e0dc1b4a`였고, 최종 커밋 메시지는 `docs(chat): close scroll deployment ledger`였다.
- 운영 원장: `aads-dashboard`와 `aads-dashboard-green`은 모두 Docker health `healthy`였고, 양 컨테이너의 `AADS_RELEASE_SHA`는 `efbb634a1372`로 일치했다.
- 배포 로그: `/root/aads/aads-dashboard/deploy-logs/dashboard-deploy-20260726-183504.log` 기준 `18:41:48 KST`에 blue active 전환, green standby 동기화, release 확인이 완료됐다. Step 7 QA는 Bearer 인증 누락으로 `UNKNOWN`이라 통과 근거로 쓰지 않는다.
- 검증: `npx tsc --noEmit`, `git diff --check`, 외부 `https://aads.newtalk.kr/login` HTTP 200, 외부 `https://aads.newtalk.kr/chat` 인증 보호 307 redirect, blue `127.0.0.1:3100/login` HTTP 200, green `127.0.0.1:3101/login` HTTP 200을 확인했다.
- 작업트리: 스크롤 조치와 무관한 `public/manager/env_unknown.json`, `public/manager/env_5.json`만 별도 사용자 변경으로 남아 있었고, 배포 산출물에 섞이지 않도록 보호 대상이다.

## 2026-07-26 19:04 KST - unni recipe guide access protection

- 요청: CEO 권장 조치 승인에 따라 언니냉면 조리법 페이지의 공개 접근을 차단하고 직원용/관리자용으로 전환.
- 조치:
  - `src/middleware.ts`에서 `/unni-naengmyeon/recipes`를 공개 예외보다 먼저 검사해 비로그인 접근을 AADS 로그인으로 리다이렉트하도록 했다.
  - `unni.newtalk.kr` 도메인에서 조리법 경로 요청 시 `https://aads.newtalk.kr/login?redirect=/unni-naengmyeon/recipes`로 이동시켜 브랜드 공개 도메인에는 내부 조리법을 직접 노출하지 않도록 했다.
  - `src/app/unni-naengmyeon/recipes/page.tsx`에서 서버 렌더 시 `auth/me`를 호출해 `is_internal_admin` 사용자만 레시피 본문을 렌더링하도록 했다. 인증 실패는 로그인, 내부 관리자 아님은 `/chat`으로 이동한다.
  - `src/app/unni-naengmyeon/page.tsx` 상단 링크 문구를 `직원용 조리법`으로 변경하고 AADS 로그인 URL로 연결했다.
- 검증:
  - 대상 ESLint `npx eslint src/middleware.ts src/app/unni-naengmyeon/page.tsx src/app/unni-naengmyeon/recipes/page.tsx` 통과.
  - `npx tsc --noEmit` 통과.
  - `npm run build` 통과. Next.js 16.1.6 기준 `/unni-naengmyeon/recipes`가 dynamic route로 생성됨.
  - 로컬 production server `127.0.0.1:3040`에서 `Host: unni.newtalk.kr /` HTTP 200 확인.
  - 로컬 production server에서 `Host: unni.newtalk.kr /unni-naengmyeon/recipes` 비로그인 요청은 `307 https://aads.newtalk.kr/login?redirect=%2Funni-naengmyeon%2Frecipes` 확인.
  - 로컬 production server에서 `Host: aads.newtalk.kr /unni-naengmyeon/recipes` 비로그인 요청은 `307 /login?redirect=%2Funni-naengmyeon%2Frecipes`, 가짜 쿠키 요청도 `307 /login?redirect=/unni-naengmyeon/recipes` 확인.
- 롤백: 본 변경 커밋을 revert하면 조리법 페이지는 이전처럼 공개 경로로 되돌아간다.

## 2026-07-26 19:13 KST - unni baemin official launch update

- 요청: CEO가 전달한 배민 오픈 링크 `https://s.baemin.com/lX000J2aj8vt4`를 확인하고 언니냉면 사이트를 정식 오픈 운영 상태로 수정.
- 확인:
  - 단축 링크 `https://s.baemin.com/lX000J2aj8vt4`는 서버 HEAD 요청에서 502를 반환했으나, 리다이렉트 대상은 `https://www.baemin.com/shopDetail?shopDetail_shopNo=14948203&bm_rfr=SHARE&shopDetail_campaignId=-1`로 확인했다.
  - 배민 직접 URL은 CloudFront/ALB 봇 차단으로 403을 반환했다. 사이트에는 CEO가 공유한 단축 링크를 공식 주문 CTA로 사용한다.
- 조치:
  - `src/app/unni-naengmyeon/page.tsx`에 배민 주문 링크 상수를 추가하고 헤더, 히어로, 위치, 주문 섹션 CTA를 모두 배민 주문 링크로 연결했다.
  - 기존 `배민 입점 준비 중`, `COMING SOON`, `오픈 전 업데이트 예정` 문구를 정식 오픈/주문 가능 문구로 교체했다.
  - 공개 홈페이지 metadata description을 배민 주문 중심으로 갱신하고 robots를 `index: true, follow: true`로 변경했다.
  - 직원용 조리법 보호는 그대로 유지했다.
- 검증:
  - 고객 화면 대상 준비중 문구 검색 `rg "입점 준비|준비 중|COMING SOON|오픈 전|곧 찾아"` 결과 없음.
  - `npx eslint src/app/unni-naengmyeon/page.tsx` 통과.
  - `npx tsc --noEmit` 통과.
  - `npm run build` 통과. Next.js 16.1.6 기준 `/unni-naengmyeon` 포함 61개 route 생성.
- 배포/운영 검증:
  - 커밋 `bb19b8534e6f`를 `dashboard-write/main`과 `origin/main`에 푸시했다.
  - 배포 로그 `/root/aads/aads-dashboard/deploy-logs/dashboard-deploy-20260726-191836.log` 기준 `19:25:46 KST` Blue/Green 배포 성공. active는 green `3101`, standby는 blue `3100`.
  - 양 컨테이너 `aads-dashboard`, `aads-dashboard-green`은 Docker health `healthy`, `AADS_RELEASE_SHA=bb19b8534e6f`로 일치했다.
  - 외부 `https://unni.newtalk.kr/`는 HTTP 200, `x-middleware-rewrite: /unni-naengmyeon` 확인.
  - 운영 HTML에서 `s.baemin.com/lX000J2aj8vt4` 10회, `배민 주문하기` 4회, `NOW OPEN ON BAEMIN` 2회, `index, follow` 2회 확인.
  - 운영 HTML에서 `입점 준비`, `준비 중`, `COMING SOON`, `오픈 전`, `곧 찾아` 문구 없음.
  - `https://unni.newtalk.kr/unni-naengmyeon/recipes` 비로그인 요청은 `307 https://aads.newtalk.kr/login?redirect=%2Funni-naengmyeon%2Frecipes`로 보호 유지.
  - 기존 무관 변경 `public/manager/env_unknown.json`, `public/manager/env_5.json`은 배포 동안 임시 stash 후 원위치 복원했다.
- 미검증:
  - `capture_screenshot`은 `[Errno 7] Argument list too long: 'ssh'`로 실패해 브라우저 캡처는 미실행이다. 외부 HTTP/HTML/컨테이너/SHA 검증으로 대체했다.
  - 배포 스크립트 Step 7 프론트엔드 QA는 `UNKNOWN`으로 종료되어 통과 근거로 쓰지 않는다.
- 롤백: 본 변경 커밋을 revert하고 dashboard blue/green 배포를 재실행하면 오픈 CTA 변경을 이전 상태로 되돌릴 수 있다.

## 2026-07-26 20:13 KST - unni recipe FB tenant access and A4 print

- 요청: 언니냉면 조리법 페이지를 AADS `is_internal_admin` 권한이 아니라 FB 권한으로 접근하게 수정하고, 레시피를 A4 출력/PDF 저장이 가능하게 정리.
- 확인:
  - DB 기준 FB 운영 tenant는 `yeoljeong-gukbap` / `열정국밥 운영관리` / `customer` / `active`이다.
  - 기존 조리법 보호는 `aads_token` + `/auth/me` + `is_internal_admin` 검사였고, 공개 홈페이지 링크도 `aads.newtalk.kr/login`으로 연결되어 있었다.
- 조치:
  - `src/middleware.ts`: `unni.newtalk.kr/unni-naengmyeon/recipes` 접근을 `https://fb.newtalk.kr/unni-naengmyeon/recipes`로 전환했다.
  - `src/app/unni-naengmyeon/page.tsx`: 직원용 조리법 링크를 FB 도메인으로 변경했다.
  - `src/app/unni-naengmyeon/recipes/page.tsx`: 서버 렌더 보호 조건을 `fb.newtalk.kr` 호스트 + `yeoljeong-gukbap` active tenant 멤버십 + `owner/admin/member` role로 변경했다. 비로그인은 FB 로그인으로, 권한 불일치는 FB 운영 홈으로 이동한다.
  - `src/app/unni-naengmyeon/recipes/RecipePrintActions.tsx`: A4 출력/PDF 저장 버튼을 추가했다.
  - `src/app/unni-naengmyeon/recipes/page.module.css`: `@page A4`와 print 전용 여백, 글자 크기, 카드 분할 방지, 버튼 숨김 스타일을 추가했다.
- 검증:
  - 대상 ESLint `npx eslint src/middleware.ts src/app/unni-naengmyeon/page.tsx src/app/unni-naengmyeon/recipes/page.tsx src/app/unni-naengmyeon/recipes/RecipePrintActions.tsx` 통과.
  - `npx tsc --noEmit` 통과.
  - `npm run build` 통과. Next.js 16.1.6 기준 `/unni-naengmyeon/recipes` dynamic route 생성.
  - 로컬 production server `127.0.0.1:3210`에서 `Host: unni.newtalk.kr /` HTTP 200 확인.
  - 로컬 production server에서 `Host: unni.newtalk.kr /unni-naengmyeon/recipes`는 `307 https://fb.newtalk.kr/unni-naengmyeon/recipes` 확인.
  - 로컬 production server에서 `Host: fb.newtalk.kr /unni-naengmyeon/recipes` 비로그인 요청은 `307 /login?redirect=%2Funni-naengmyeon%2Frecipes` 확인.
  - 대표 메뉴 이미지 `nas-water-naengmyeon.jpg`는 HTTP 200 확인.
- 미포함:
  - 기존 무관 변경 `public/manager/env_unknown.json`, `public/manager/env_5.json`은 이번 커밋/배포 대상에서 제외한다.
- 롤백: 본 변경 커밋을 revert하고 dashboard blue/green 배포를 재실행하면 조리법 접근 제어와 A4 출력 버튼 변경을 이전 상태로 되돌릴 수 있다.

## 2026-07-27 06:50 KST - unni recipe direct FB login routing

- 요청: 직원용 레시피 페이지가 아직 AADS 로그인 페이지로 이동하는 문제를 확인하고, FB 로그인 권한으로 로그인한 뒤 레시피 페이지로 복귀하도록 즉시 수정.
- 원인:
  - 이전 FB 권한 전환은 tenant 검사까지는 변경했지만, 비로그인 보호 미들웨어가 여전히 1차 redirect를 `/login?redirect=/unni-naengmyeon/recipes`로 반환했다.
  - `fb.newtalk.kr/login`은 운영에서 FB 매장비서 앱으로 302되고 있었지만, 사용자 입장에서는 `/login` 중간 경로 때문에 AADS 로그인으로 보일 수 있었다.
- 조치:
  - `src/middleware.ts`에 `FOOD_BIZ_LOGIN_PATH=/static/apps/yeoljeong-finance/index.html`을 추가하고, `/unni-naengmyeon/recipes` 비로그인 접근을 FB 매장비서 로그인 앱으로 직접 redirect하도록 변경했다.
  - `fb.newtalk.kr/login?redirect=...` 요청도 같은 FB 매장비서 정적앱으로 redirect하도록 명시했다.
  - `src/app/unni-naengmyeon/recipes/page.tsx`의 서버 렌더 fallback 로그인 URL도 `https://fb.newtalk.kr/static/apps/yeoljeong-finance/index.html?redirect=/unni-naengmyeon/recipes`로 통일했다.
- 검증:
  - `npx eslint src/middleware.ts src/app/unni-naengmyeon/recipes/page.tsx` 통과.
  - `npx tsc --noEmit` 통과.
  - `npm run build` 통과. Next.js 16.1.6 기준 `/unni-naengmyeon/recipes` dynamic route 생성.
  - 로컬 production 재현 `Host: fb.newtalk.kr /unni-naengmyeon/recipes`는 `307 /static/apps/yeoljeong-finance/index.html?redirect=%2Funni-naengmyeon%2Frecipes` 확인.
  - 로컬 production 재현 `Host: fb.newtalk.kr /login?redirect=/unni-naengmyeon/recipes`도 같은 FB 정적앱으로 redirect 확인.
- 배포/운영 검증:
  - 커밋 `d6e900bc3364`를 `origin/main`에 푸시했다.
  - 배포 로그 `/root/aads/aads-dashboard/deploy-logs/dashboard-deploy-20260727-064239.log` 기준 `06:49:28 KST` Blue/Green 배포 성공. active는 blue `3100`, standby는 green `3101`.
  - 양 컨테이너 `aads-dashboard`, `aads-dashboard-green`은 Docker health `healthy`, `AADS_RELEASE_SHA=d6e900bc3364`로 일치했다.
  - 외부 `https://fb.newtalk.kr/unni-naengmyeon/recipes` 비로그인 요청은 `307 /static/apps/yeoljeong-finance/index.html?redirect=%2Funni-naengmyeon%2Frecipes` 확인.
  - 외부 redirect follow 결과 최종 `HTTP 200`, HTML title `매장비서`, 로그인 문구 확인.
- 미검증:
  - `capture_screenshot`은 timeout으로 실패해 브라우저 캡처는 미실행이다. 외부 HTTP/HTML/컨테이너/SHA 검증으로 대체했다.
  - 배포 스크립트 Step 7 프론트엔드 QA는 `UNKNOWN`으로 종료되어 통과 근거로 쓰지 않는다.
- 미포함:
  - 기존 무관 변경 `public/manager/env_unknown.json`, `public/manager/env_5.json`은 이번 커밋/배포 대상에서 제외하고 보존했다.
- 롤백: 본 변경 커밋을 revert하고 dashboard blue/green 배포를 재실행하면 레시피 로그인 redirect를 이전 `/login` 경유 방식으로 되돌릴 수 있다.

## 2026-07-27 07:18 KST - unni recipe FB access token enforcement

- 요청: 직원용 레시피 페이지가 AADS 로그인/권한이 아니라 FB 로그인 권한으로만 접근되고, 로그인 후 레시피 페이지로 돌아오도록 완료 상태를 재검증 및 보완.
- 확인:
  - 이전 커밋은 비로그인 redirect를 FB 매장비서 앱으로 보냈지만, 레시피 보호 토큰은 여전히 `aads_token`을 읽고 있었다.
  - 운영 HTTP 기준 `https://unni.newtalk.kr/unni-naengmyeon/recipes`는 `https://fb.newtalk.kr/unni-naengmyeon/recipes`로 이동하고, 비로그인 상태에서는 FB 매장비서 정적앱으로 이동한다.
- 조치:
  - `src/middleware.ts`: `/unni-naengmyeon/recipes` 보호 쿠키를 `aads_token`에서 `fb_access_token`으로 변경했다.
  - `src/app/unni-naengmyeon/recipes/page.tsx`: 서버 렌더 권한 검증도 `fb_access_token` Bearer 토큰만 사용하도록 변경했다.
  - FB 매장비서 앱에서 로그인/회원가입/초대수락 시 `fb_access_token` 쿠키를 함께 발급하도록 aads-server에 별도 커밋으로 반영했다.
- 검증:
  - `npm run lint -- src/middleware.ts src/app/unni-naengmyeon/recipes/page.tsx` 통과.
  - `npx tsc --noEmit` 통과.
  - `npm run build` 통과. Next.js 16.1.6 기준 `/unni-naengmyeon/recipes` dynamic route 생성 확인.
  - `git diff --check -- src/middleware.ts src/app/unni-naengmyeon/recipes/page.tsx` 통과.
- 롤백: 본 변경 커밋을 revert하고 dashboard blue/green 배포를 재실행하면 레시피 보호 쿠키를 이전 공용 토큰 기준으로 되돌릴 수 있다.

## 2026-07-27 07:31 KST - unni recipe FB token deployment verification

- 배포:
  - 커밋 `4794bf642f69`를 `dashboard-write/main` 및 `origin/main`에 푸시했다.
  - 대시보드 blue-green 배포를 실행해 새 릴리스를 반영했다.
  - 배포 스크립트는 standby green 이미지 unpack 직후 `130`으로 종료되어 standby 완료 로그가 남지 않았다. 후속으로 `AADS_RELEASE_SHA=4794bf642f69 docker compose -f docker-compose.prod.yml --profile green up -d --build --no-deps aads-dashboard-green`을 실행해 green을 수동 동기화했고, `AADS_RELEASE_SHA=4794bf642f69 docker compose -f docker-compose.prod.yml up -d --no-build --no-deps aads-dashboard`로 blue 슬롯도 재기동했다.
- 운영 검증:
  - `aads-dashboard`와 `aads-dashboard-green` 모두 Docker health `healthy`.
  - 양 컨테이너 `AADS_RELEASE_SHA=4794bf642f69` 일치.
  - nginx upstream active는 green `127.0.0.1:3101`, blue `3100`은 backup.
  - `https://unni.newtalk.kr/unni-naengmyeon/recipes`는 `307 https://fb.newtalk.kr/unni-naengmyeon/recipes`.
  - `https://fb.newtalk.kr/unni-naengmyeon/recipes` 비로그인 요청은 `307 /static/apps/yeoljeong-finance/index.html?redirect=%2Funni-naengmyeon%2Frecipes`.
  - `Cookie: aads_token=dummy`만 있는 요청도 동일하게 FB 로그인 앱으로 이동하여 AADS 공용 쿠키만으로는 레시피 접근이 열리지 않는다.
- 미검증:
  - 실제 FB 계정 비밀번호 입력 E2E는 수행하지 않았다. 공개 HTTP redirect, 운영 HTML, 컨테이너 SHA/health로 대체 검증했다.
- 작업트리:
  - 배포 전 대시보드 무관 dirty 파일을 stash로 격리했다.
  - 배포 중 다른 프로세스가 `public/manager/env_unknown.json`, `src/app/chat/page.tsx`, `public/manager/env_5.json` 변경을 다시 만든 상태라 stash pop은 충돌 방지를 위해 중단됐고, stash `pre-unni-fb-token-deploy-20260727`은 보존했다.

## 2026-07-28 07:34 KST - chat report document deep links

- 요청: 중단된 대시보드 수정 작업을 이어서 진행.
- 확인:
  - 대시보드 작업트리에는 기존 무관 변경 `public/manager/env_unknown.json`이 있었고, 서버 레포에도 여러 미커밋 변경이 있어 이번 작업 범위에서 제외했다.
  - 채팅/리포트 마크다운에 표시되는 로컬 절대 경로 문서 링크가 브라우저에서 직접 열리지 않는 구조였다.
- 조치:
  - `src/lib/documentLinks.ts`를 추가해 `/root/aads/...`, `/root/kis-autotrade-v4/...`, `/data/shortflow/docs`, `/srv/newtalk-v2/docs` 문서 경로를 `/docs?project=...&base_path=...&file_path=...` 딥링크로 변환하도록 했다.
  - `src/app/docs/page.tsx`가 `project/base_path/file_path` 쿼리를 읽어 해당 문서를 자동 선택하고, 사용자가 파일을 열 때 현재 URL도 갱신하도록 했다.
  - `src/app/chat/MarkdownRenderer.tsx`, `src/components/chat/ArtifactReport.tsx`, `src/components/chat/ChatBubble.tsx`에서 마크다운 링크와 자동 URL 링크에 동일한 변환을 적용했다.
  - `javascript:`, `data:`, `vbscript:` 링크 차단은 유지하고, `:라인번호`는 `line` 쿼리로 분리해 `file_path` 오염을 막았다.
- 검증:
  - `npx tsc --noEmit` 통과.
  - `npx eslint src/lib/documentLinks.ts src/app/docs/page.tsx src/app/chat/MarkdownRenderer.tsx src/components/chat/ArtifactReport.tsx src/components/chat/ChatBubble.tsx`는 오류 0건, 기존 이미지 태그 경고 3건.
  - `npm run build` 통과. Next.js 16.1.6 기준 `/docs` route 포함 62개 app route 생성 확인.
  - 전체 `npm run lint`는 기존 누적 오류 261건 때문에 실패했으며, 이번 변경 파일 오류는 없음.
- 미완료:
  - 커밋, 푸시, 배포는 CEO의 별도 지시 전까지 수행하지 않았다.
  - 브라우저 E2E 캡처는 수행하지 않았다.
- 롤백: 위 5개 코드 변경과 `src/lib/documentLinks.ts` 추가분, 본 HANDOVER 항목을 revert하면 이전 링크 동작으로 돌아간다.

## 2026-08-04 08:07 KST - unni recipe topping and sauce quantities

- 요청: 직원용 레시피 페이지의 기본 토핑 순서와 물냉면/비빔냉면/언니냉면/불냉면/명태회냉면/묵사발 조리 기준을 CEO 최신 지시 기준으로 수정.
- 조치:
  - `src/app/unni-naengmyeon/recipes/page.tsx`의 기본 토핑 순서를 `다대기 → 달걀 반쪽 → 무김치 → 오이 → 깨가루 → 땅콩가루`로 변경했다.
  - 물냉면 다대기를 `30g(큰스푼 기준 반스푼)`, 비빔냉면 다대기를 `150g(큰스푼 기준 3스푼)`, 비빔냉면 곁육수를 `1통 500cc`로 변경했다.
  - 언니냉면과 명태회냉면 다대기를 각각 `50g(큰스푼 기준 1스푼)`으로 명시했다.
  - 불냉면은 기존 캡사이신/매운 고춧가루 추가 방식에서 `비빔냉면 동일 준비 + 매운다대기 100g(2스푼) + 다대기 50g(1스푼)` 방식으로 교체했다.
  - 매운다대기 제조 기준 `육수 300cc + 베트남 고춧가루 100g + 냉면다대기 400g`을 불냉면 카드에 추가했다.
  - 묵사발은 묵을 냉면그릇에 담고 토핑을 묵 위에 올리며, 육수 500cc는 육수그릇에 담는 방식으로 수정했다. 묵 실온보관 및 냉장보관 시 끊어짐 주의 문구도 추가했다.
  - Docker clean build에서 기존 `src/app/chat/page.tsx`의 `finalizationTimeoutIdsRef` 중복 선언/중복 cleanup 3줄이 컴파일을 차단해, 해당 중복만 제거했다.
- 검증:
  - `rg`로 변경 문구 반영 확인.
  - `npx eslint src/app/unni-naengmyeon/recipes/page.tsx src/app/unni-naengmyeon/recipes/RecipePrintActions.tsx` 통과.
  - `npx tsc --noEmit` 통과.
  - `npm run build` 통과. Next.js 16.1.6 기준 `/unni-naengmyeon/recipes` dynamic route 생성 확인.
- 미포함:
  - 기존 무관 변경 `public/manager/env_unknown.json`, `public/manager/env_5.json`, `public/reports/gomyunghee-naengmyeon-logo-proposals.html`은 이번 변경 범위에서 제외하고 보존했다.
- 롤백: 본 HANDOVER 항목, `src/app/unni-naengmyeon/recipes/page.tsx`, `src/app/chat/page.tsx` 중복 제거 변경분을 revert하면 이전 상태로 돌아간다.

## 2026-08-04 08:51 KST - gomyunghee naengmyeon public site

- 요청: 고명희냉면도 언니냉면과 동일한 구성의 공개 사이트를 하나 생성.
- 조치:
  - `src/app/gomyunghee-naengmyeon/page.tsx`, `InquiryForm.tsx`, `page.module.css`를 추가해 `/gomyunghee-naengmyeon` 공개 홈페이지를 구성했다.
  - `public/brands/gomyunghee-naengmyeon/logo.svg`를 추가해 고명희냉면 전용 로고와 favicon/apple icon을 적용했다.
  - `src/middleware.ts`, `src/components/ClientLayout.tsx`, `src/app/layout.tsx`에 고명희냉면 공개 경로와 `gomyunghee.newtalk.kr` 호스트 예외를 추가했다.
  - 배민 주문 링크는 현재 확인된 `https://s.baemin.com/2b000l0sq2E18`로 연결했다.
  - 매장 주소/전화번호는 실측 정보가 없어 언니냉면 정보를 복사하지 않고 배민 주문 화면 기준 안내로 제한했다.
- 검증:
  - `npx eslint src/app/gomyunghee-naengmyeon/page.tsx src/app/gomyunghee-naengmyeon/InquiryForm.tsx src/components/ClientLayout.tsx src/app/layout.tsx src/middleware.ts` 통과.
  - `npx tsc --noEmit` 통과.
  - `npm run build` 통과. Next.js 16.1.6 기준 `/gomyunghee-naengmyeon` route 생성 확인.
  - 로컬 임시 서버 기준 `curl -I http://127.0.0.1:3022/gomyunghee-naengmyeon` 200 OK, `curl -I http://127.0.0.1:3022/brands/gomyunghee-naengmyeon/logo.svg` 200 OK 확인.
- 미완료:
  - 커밋, 푸시, 운영 배포는 CEO의 별도 승인 전까지 수행하지 않았다.
  - Playwright 스크린샷 검증은 대시보드 의존성에 Playwright가 없어 수행하지 못했다.
  - 현재 작업트리에 기존 무관 변경 `public/manager/env_unknown.json`, `public/manager/env_5.json`, `public/reports/gomyunghee-naengmyeon-logo-proposals.html`이 남아 있어 배포 전 선별 커밋이 필요하다.
- 롤백: 위 신규 라우트/로고 파일과 `src/middleware.ts`, `src/components/ClientLayout.tsx`, `src/app/layout.tsx`, 본 HANDOVER 항목의 변경분을 revert하면 이전 상태로 돌아간다.

## 2026-08-04 09:13 KST - gomyunghee naengmyeon deploy and domain check

- 요청: 고명희냉면 사이트 운영 외부 URL 반영.
- 조치:
  - `03edf4c feat: add gomyunghee naengmyeon public site`를 원격 `main`에 push했다.
  - `bash deploy.sh`로 dashboard blue-green 배포를 수행했고 active 슬롯은 `green`, release는 `03edf4ccc147`이다.
  - `/etc/nginx/conf.d/aads.conf`에 `gomyunghee.newtalk.kr` 전용 80/443 server block을 추가하고 `aads-nginx`에서 `nginx -t` 및 reload를 수행했다.
- 검증:
  - `https://aads.newtalk.kr/gomyunghee-naengmyeon` 외부 HTTP 200 확인.
  - `https://aads.newtalk.kr/brands/gomyunghee-naengmyeon/logo.svg` 외부 HTTP 200 확인.
  - 원서버 직접 호출 `Host: gomyunghee.newtalk.kr` 기준 IPv4/IPv6 모두 HTTP 200 및 `/gomyunghee-naengmyeon` rewrite 확인.
  - deploy script의 자동 visual QA는 `UNKNOWN`으로 종료되어 통과로 간주하지 않았다.
- 남은 이슈:
  - Cloudflare 경유 `https://gomyunghee.newtalk.kr`는 아직 HTTP 403이다. 원서버 직접 호출은 200이므로 서버 코드/nginx보다는 Cloudflare DNS/origin/rule 설정 문제로 분리했다.
  - 스크린샷 캡처 도구는 timeout으로 실패했다. curl 본문 확인으로 대체했다.
- 롤백:
  - 앱 변경은 `03edf4c` revert 후 dashboard deploy.
  - nginx 변경은 `/etc/nginx/conf.d/aads.conf.bak.pre_gomyunghee_20260804_0911` 복원 후 `docker exec aads-nginx nginx -t && docker exec aads-nginx nginx -s reload`.

## 2026-08-04 09:24 KST - gomyunghee domain final verification

- 요청: Cloudflare DNS 반영 후 `gomyunghee.newtalk.kr` 최종 완료 상태 재검증 및 누락된 커밋/푸시/배포/문서 상태 명시.
- 조치:
  - Cloudflare 경유 `https://gomyunghee.newtalk.kr/` 외부 접근이 HTTP 200으로 전환된 것을 확인했다.
  - 운영 HTML에서 `고명희냉면`, `/gomyunghee-naengmyeon` rewrite, logo preload가 내려오는 것을 확인했다.
  - 고명희냉면 페이지의 `metadataBase`, canonical, OG URL이 `aads.newtalk.kr`로 남아 있어 `https://gomyunghee.newtalk.kr` 기준으로 정정했다.
- 검증:
  - `curl -I https://gomyunghee.newtalk.kr/` HTTP/2 200 확인.
  - `curl -I https://gomyunghee.newtalk.kr/gomyunghee-naengmyeon` HTTP/2 200 확인.
  - `git rev-parse HEAD`와 `git rev-parse @{u}`가 동일한 `d9dd8d0e2cb0767c8bdf99fe284cc2dd8972b9ab`였음을 확인했다.
- 최종 반영:
  - `e729be7 fix: use gomyunghee domain metadata`로 메타 도메인 정정과 본 HANDOVER 항목을 원격 `main`에 push했다.
  - `bash deploy.sh`로 dashboard blue-green 배포를 수행했고 active 슬롯은 `blue`, release는 `e729be7c26c8`이다.
  - 배포 후 Cloudflare 경유 `https://gomyunghee.newtalk.kr/` HTTP/2 200, logo.svg HTTP/2 200, canonical/OG URL `https://gomyunghee.newtalk.kr` 확인.
- 남은 이슈:
  - deploy script의 자동 frontend QA는 `UNKNOWN`으로 종료되어 통과로 간주하지 않았다. 외부 HTTP/API/컨테이너 health 검증으로 대체했다.
  - 기존 무관 변경 `public/manager/env_unknown.json`, `public/manager/env_5.json`, `public/reports/gomyunghee-naengmyeon-logo-proposals.html`은 이번 변경 범위에서 제외하고 보존한다.
- 롤백: 메타 도메인 정정 커밋을 revert하고 dashboard deploy를 재실행하면 이전 상태로 돌아간다.

## 2026-08-04 09:40 KST - gomyunghee logo proposal report tracking

- 요청: 이전 최종 완료보고의 커밋/푸시/배포/문서 상태가 원장과 충돌하지 않도록 남은 확인과 조치를 완료.
- 조치:
  - 공개 페이지에서 연결되는 `public/reports/gomyunghee-naengmyeon-logo-proposals.html`이 미추적 상태로 남아 있던 것을 완료 범위 누락으로 판단하고 Git 추적 대상에 포함했다.
  - 기존 09:24 HANDOVER 항목의 배포 검증과 별도로, 로고 시안 리포트 파일의 공개 URL 상태와 HTML 무결성을 재검증했다.
- 검증:
  - `python3 -m html.parser public/reports/gomyunghee-naengmyeon-logo-proposals.html` 통과.
  - `rg`로 `로고 시안 6종`, `시안 D`, `시안 F` 문구 확인.
  - `curl -I https://gomyunghee.newtalk.kr/reports/gomyunghee-naengmyeon-logo-proposals.html` HTTP/2 200 확인.
  - `curl -I https://aads.newtalk.kr/reports/gomyunghee-naengmyeon-logo-proposals.html` HTTP/2 200 확인.
- 미포함:
  - 기존 무관 변경 `public/manager/env_unknown.json`, `public/manager/env_5.json`은 이번 커밋 대상에서 제외하고 보존한다.
- 롤백: 본 커밋을 revert하면 로고 시안 리포트 파일 추적과 문서 기록만 이전 상태로 돌아간다.

## 2026-08-04 18:42 KST - PC Agent 자동 페어링 설치 버튼 전환

- 요청: PC Agent 설치 시 토큰을 수동 입력하지 않고 자동으로 반영되어 설치되도록 변경.
- 조치:
  - `src/app/kakaobot/agent/page.tsx`의 기본 다운로드 CTA를 `PC 에이전트 자동 설치` 버튼으로 변경했다.
  - 버튼 클릭 시 `POST /api/v1/kakao-bot/agent/install-ticket`를 호출해 10분짜리 1회용 설치 티켓을 발급하고, 반환된 `download_url`로 EXE 다운로드를 시작하도록 했다.
  - 수동 토큰 발급/복사 UI는 자동 설치 실패 시 사용하는 백업 경로로 낮췄다.
  - 일반 EXE 다운로드 링크는 수동 다운로드 카드로 분리했다.
  - FAQ와 설치 가이드를 자동 설치 기준 문구로 수정했다.
- 검증:
  - `npx tsc --noEmit` 성공.
- 배포 주의:
  - 백엔드 `install-ticket` API 배포와 함께 반영되어야 버튼이 정상 동작한다.
  - 실제 운영 E2E는 로그인 사용자로 설치 페이지 접속 후 자동 설치 버튼 클릭, 파일명 `--ticket-...` 포함 여부, PC Agent 첫 실행 후 온라인 상태로 검증한다.

## 2026-08-04 19:52 KST - gomyunghee instagram nopo redesign deploy

- 요청: 고명희냉면 홈페이지 디자인이 노포 감성과 맞지 않아, 현재 감성 사이트 기준으로 벤치마킹해 인스타그램 피드형 UI/UX와 감정적인 노포 무드로 전면 재설계.
- 조치:
  - `src/app/gomyunghee-naengmyeon/page.tsx`를 풀스크린 냉면 히어로, 인스타 피드형 메뉴 이미지 그리드, 감성 스토리, 간결한 배달 안내, 문의/주문 CTA 구조로 재작성했다.
  - 돈까스 메뉴는 냉면 대표 메뉴, 1인 세트, 2인 세트, 사이드, 추가/음료 뒤의 최하단 별도 블록으로 유지했다.
  - `src/app/gomyunghee-naengmyeon/page.module.css`를 새 클래스 구조에 맞춰 재작성하고 모바일 2열 피드/단일 메뉴 리스트 대응을 추가했다.
  - `public/brands/gomyunghee-naengmyeon/logo.svg`를 원형 도장형 노포 로고로 교체했다.
  - 러너가 남긴 미사용 백업 파일 `src/app/gomyunghee-naengmyeon/page.tsx.bak`, `src/app/gomyunghee-naengmyeon/page.module.css.bak`를 제거했다.
- 검증 예정:
  - `npx eslint src/app/gomyunghee-naengmyeon/page.tsx src/app/gomyunghee-naengmyeon/InquiryForm.tsx`
  - `npx tsc --noEmit`
  - `npm run build`
  - 운영 배포 후 `https://gomyunghee.newtalk.kr/` 외부 HTTP 200, 본문/로고/돈까스 하단 위치 확인.
- 미포함:
  - 기존 무관 변경 `public/manager/env_unknown.json`, `public/manager/env_5.json`은 이번 커밋 대상에서 제외하고 보존한다.
- 롤백: 본 변경 커밋을 revert하고 dashboard deploy를 재실행하면 이전 고명희냉면 디자인으로 돌아간다.
## 2026-08-04 22:20 KST - 알림 확인 클릭 시 채팅 세션 이동 반영

- 요청: 알람/푸시 알림의 `확인` 클릭 시 완료된 채팅 세션으로 바로 이동되도록 조치.
- 조치:
  - `public/sw.js`에 `chatUrlForSession()`과 same-origin URL 검증을 추가하고, 푸시 payload의 `session_id`만으로도 `/chat#<session_id>`를 만들도록 했다.
  - 서비스워커 `notificationclick`에서 기존 열린 창이 있으면 `navigate(url)` 후 `focus()`하고, 열린 창이 없으면 `openWindow(url)`로 해당 세션을 연다.
  - `src/services/pushNotifications.ts`의 로컬 Notification 클릭도 단순 focus가 아니라 target URL로 이동하도록 바꿨다.
  - `src/app/chat/page.tsx`에서 SSE 완료, 폴백 완료 감지, 원샷 완료 감지 경로가 완료된 세션 ID를 알림 URL로 넘기도록 했다.
- 서버 연계:
  - 백엔드 커밋 `0b51bd47`에서 Web Push payload에 `actions: 확인`, 최상위 `url`, `data.url=/chat#<session_id>`가 포함됐다.
- 검증:
  - `npx eslint` 신규 에러 없이 통과, 기존 경고 21건 유지.
  - `curl -fsS https://aads.newtalk.kr/sw.js`에서 배포된 서비스워커 코드 확인.
  - 2026-08-04 22:19 KST 기준 `aads-dashboard` Docker 컨테이너 `healthy`, active 슬롯 `aads-dashboard:3100`.
- 배포:
  - 커밋 `f36ef5c fix: route notifications to chat sessions` 원격 `main` 포함.
  - dashboard blue-green 배포 완료. 외부 헬스체크 통과.
- 남은 주의:
  - 기존 설치 PWA는 브라우저가 새 service worker를 activate한 뒤부터 새 클릭 이동이 보장된다.

## 2026-08-05 17:37 KST - 열정국밥 연동설정 수정 저장 운영 노출 동기화

- 요청: 연동설정 화면에서 기존 입력값을 `수정` 후 저장하면 저장되지 않는 문제 확인 및 수정.
- 원인:
  - 백엔드 원본 `app/static/apps/yeoljeong-finance/index.html`과 API 패치는 AADS 서버에 반영됐지만, 운영 도메인 `https://aads.newtalk.kr/apps/yeoljeong-finance/index.html`은 dashboard `public/apps/...` 공개 복사본을 바라본다.
  - dashboard 공개 복사본이 없어 운영 URL이 404/Next fallback으로 응답했다.
- 조치:
  - AADS 서버 원본을 `public/static/apps/yeoljeong-finance/`에 동기화했다.
  - 운영 앱 경로용 `public/apps/yeoljeong-finance/index.html`도 동일 원본으로 생성했다.
- 검증 기준:
  - `integrationCategoryFilter`, `integrationStatusFilter`, `integrationSearchInput` 표식이 운영 HTML에 노출되어야 한다.
  - `accountNoMasked: serverAccount?.account_no_masked`, `await persistSettingsToServer()`가 운영 HTML에 포함되어야 수정 저장 회귀 방지가 반영된 것으로 본다.
- 롤백:
  - 본 dashboard 커밋을 revert하고 dashboard deploy를 재실행하면 공개 복사본 노출 변경이 제거된다.

## 2026-08-06 08:43 KST - 치즈돈까스 배민/쿠팡이츠 메뉴 이미지 최종본

- 요청: 이전 대화와 생성 이미지를 확인해 치즈돈까스 이미지를 배민/쿠팡이츠 메뉴 이미지 조건에 맞고 구매 전환에 유리한 구도로 최종 생성.
- 조치:
  - `public/brands/unni-naengmyeon/menu/generated/cheese-donkatsu-baemin-coupangeats-1280x960.jpg`를 최종 업로드 원본으로 확정했다.
  - `public/reports/menu-images/cheese-donkatsu-baemin-coupangeats-1280x960.jpg`에 동일 원본을 보고/전달용으로 보관했다.
  - `public/reports/menu-images/cheese-donkatsu-square-crop-preview.jpg`에 앱 정사각 썸네일 노출 검수용 중앙 크롭 프리뷰를 추가했다.
- 검증:
  - PIL 기준 최종본 JPEG, 1280x960, RGB, 300dpi, 312,296 bytes로 확인했다.
  - 배민 공식 기준: 1280x960 이상, 15MB 이하, JPG/PNG 조건 충족.
  - 쿠팡이츠 공식 기준: 1280x960, 300ppi, JPG/JPEG/PNG, 음식 중앙 배치 조건 충족.
  - 육안 검수: 텍스트/로고/워터마크 없음, 치즈 단면과 돈까스 본체가 중앙 960x960 크롭 안에 유지됨.
- 배포:
  - 커밋 `330835b feat(food): add cheese donkatsu menu image`를 `origin/main`에 push했다.
  - `aads-dashboard`, `aads-dashboard-green` 컨테이너에 정적 파일 반영 후 재시작했다.
  - 외부 URL `https://unni.newtalk.kr/brands/unni-naengmyeon/menu/generated/cheese-donkatsu-baemin-coupangeats-1280x960.jpg`가 HTTP 200으로 응답함을 확인했다.
  - 외부 다운로드 파일 기준 JPEG, 1280x960, RGB, 300dpi, 312,296 bytes로 재검증했다.
- 롤백:
  - 본 이미지 커밋을 revert하면 추가된 최종본/프리뷰 파일과 문서 기록이 제거된다.

## 2026-08-06 08:53 KST - 치즈돈까스 메뉴 이미지 alias 운영 반영 재검증

- 요청: 이전 완료보고가 커밋/푸시/배포/문서 원장과 충돌했으므로 남은 확인·조치·검증을 계속 수행하고 최종 상태를 명확히 보고.
- 추가 조치:
  - `public/brands/unni-naengmyeon/menu/cheese-donkatsu-menu-baemin-coupang-1280x960.jpg` alias 파일을 300dpi 메타데이터가 있는 최종 원본과 동일하게 맞췄다.
  - `aads-dashboard`, `aads-dashboard-green` 컨테이너의 `/app/public/brands/unni-naengmyeon/menu/`에 alias 파일을 직접 동기화했다.
  - 정적 파일 인식 갱신을 위해 `aads-dashboard`, `aads-dashboard-green` 컨테이너를 재시작했다.
- 재검증:
  - 로컬 alias 파일: JPEG, 1280x960, RGB, 300dpi, 312,296 bytes.
  - 내부 포트 `http://127.0.0.1:3100/brands/unni-naengmyeon/menu/cheese-donkatsu-menu-baemin-coupang-1280x960.jpg`: HTTP 200, `Content-Length: 312296`.
  - 외부 URL `https://unni.newtalk.kr/brands/unni-naengmyeon/menu/cheese-donkatsu-menu-baemin-coupang-1280x960.jpg`: HTTP 200, 다운로드 파일 기준 JPEG, 1280x960, RGB, 300dpi, 312,296 bytes.
  - 외부 URL `https://unni.newtalk.kr/brands/unni-naengmyeon/menu/generated/cheese-donkatsu-baemin-coupangeats-1280x960.jpg`: HTTP 200, 다운로드 파일 기준 JPEG, 1280x960, RGB, 300dpi, 312,296 bytes.
  - 컨테이너 상태: `aads-dashboard`, `aads-dashboard-green` 모두 healthy.
- 원장 상태:
  - alias 파일과 이 문서 기록은 본 항목 작성 시점에 아직 커밋 전이다. 선별 커밋 후 최종 보고에서 실제 commit/push 상태를 재확인한다.

## 2026-08-06 13:56 KST - 오비스 에이블리 광고분석 2파일 통합 구조 조정

- 요청: 오비스 에이블리 광고분석을 에이블리 제공 `주간보고서` CSV와 사방넷 `주문서확인처리_주문수량 확인` 엑셀을 함께 업로드해 분석할 수 있게 재구성.
- 조치:
  - `public/apps/ably-ad-analyzer/index.html`을 2파일 통합 분석 구조로 변경했다.
  - 에이블리 주간보고서 CSV는 `일자`, `상품명`, `광고비`, `노출수`, `클릭수`, `직접 구매 전환수`, `직접 광고 전환 매출` 계열 컬럼을 광고 원천으로 읽는다.
  - 사방넷 주문 엑셀은 `주문일자/수집일`, `자체상품코드/상품코드/옵션관리코드`, `상품명`, `주문수량`, `결제금액/판매금액/판매가` 계열 컬럼을 주문 원천으로 읽는다.
  - 파일 내 최종 날짜를 기준으로 최근 7일과 직전 7일을 자동 비교하고, 종료일을 수동 지정할 수 있게 했다.
  - 사방넷 파일에 날짜 컬럼이 없으면 주문 파일 전체를 최근 기간 주문으로 간주하고, 직전 기간 비교에는 중복 반영하지 않도록 보강했다.
  - 사방넷 파일이 자체상품코드만 제공하거나 옵션명이 별도 컬럼인 경우도 읽도록 헤더 자동 인식 범위를 넓혔다.
  - 자체상품코드 자동 매칭이 안 되는 상품을 위한 `수동 코드 매핑` 입력과 `매칭 필요` 탭을 추가했다.
  - 전체매출 기준 기여이익 계산은 `상품마진 - 광고비 - 전체매출 5% 쿠폰비`로 유지하되, 사방넷 파일에 마진/원가 컬럼이 없으면 기본 마진율 입력값으로 보수 계산한다.
  - `src/app/marketing/ably/page.tsx`의 오비스 안내 문구를 2파일 통합 분석 기준으로 갱신했다.
- 검증:
  - HTML 내 JS 문법 검사: `new Function(script)` 통과.
  - `npx eslint src/app/marketing/ably/page.tsx` 통과.
  - 임시 정적 서버 `python3 -m http.server 8899 --directory public` 기준 `/apps/ably-ad-analyzer/index.html` HTTP 200 확인.
  - `npm run lint` 전체 검사는 기존 레포 전반 오류 261건(`src/app/admin/prompts/page.tsx`, `src/app/agenda/page.tsx`, `src/lib/api.ts` 등)으로 실패했다. 이번 수정 파일 관련 오류는 확인되지 않았다.
- 배포:
  - 본 항목 작성 시점에는 코드 수정만 완료했고, 커밋/푸시/운영 배포는 아직 미실행이다.

## 2026-08-06 19:05 KST - 오비스 에이블리 광고분석 결제금액 0원 수량/배송비 기준 정정

- 요청: 결제금액 0원 주문은 주문수량에는 포함하고, 배송비 카운트에는 미포함해야 한다.
- 조치:
  - `public/apps/ably-ad-analyzer/index.html`에서 결제금액 0원 행도 `quantity=rawQuantity`로 유지하도록 변경했다.
  - 배송비 산정용 `orderCount`는 기존처럼 결제금액이 있는 주문만 1건으로 잡아, 결제금액 0원 행은 배송비 2,500원/건 계산에서 제외되도록 유지했다.
  - `원가2(상품)`이 있으면 결제금액 0원 행도 `원가2(상품) × 1.1 × 주문수량` 원가가 반영되어 상품마진에 포함된다.
  - 오비스 안내 문구도 "결제금액 0원은 수량 포함, 배송비 건수 제외"로 갱신했다.
- 검증:
  - HTML inline script 문법 검사 통과.
  - `npx eslint src/app/marketing/ably/page.tsx` 통과.
  - 샘플 검증 통과: `결제금액=0원`, `주문수량=3`, `원가2(상품)=10,000원`일 때 주문수량 3, 배송비 건수 0, 총원가 33,000원, 상품마진 -33,000원으로 계산됨.

## 2026-08-06 14:09 KST - 오비스 에이블리 광고분석 선택 기간 계산 반영

- 요청: 에이블리 광고분석에서 특정 기간을 설정할 수 있게 하고, 해당 기간 동안의 광고/주문 데이터만 계산되도록 반영.
- 조치:
  - `public/apps/ably-ad-analyzer/index.html`의 기간 입력을 `최근 기간 종료일 + 기간일수`에서 `분석 시작일 + 분석 종료일`로 변경했다.
  - 시작일/종료일을 모두 입력하면 해당 양끝 날짜 포함 기간만 광고 CSV와 사방넷 주문 엑셀에서 필터링한다.
  - 시작일/종료일을 비워두면 파일 내 최종 날짜 기준 최근 7일로 자동 설정한다.
  - 시작일만 입력하면 파일 내 최종 날짜를 종료일로, 종료일만 입력하면 종료일 기준 최근 7일로 보완한다.
  - 직전 비교 기간은 선택 기간과 같은 일수로 자동 계산한다.
  - 사방넷 주문 파일에 날짜 컬럼이 없는 경우는 업로드 파일 전체를 선택 기간 주문으로만 반영한다는 안내와 상태 문구로 수정했다.
  - `src/app/marketing/ably/page.tsx`의 오비스 상단 안내 문구를 선택 기간 기준으로 갱신했다.
- 검증:
  - HTML 내 JS 추출 후 `node --check /tmp/ably-ad-analyzer.js` 통과.
  - `npx eslint src/app/marketing/ably/page.tsx` 통과.
  - 임시 정적 서버 `python3 -m http.server 8899 --directory public` 기준 `/apps/ably-ad-analyzer/index.html` HTTP 200 확인.
- 배포:
  - 본 항목 작성 시점에는 코드 수정과 로컬 검증만 완료했고, 커밋/푸시/운영 배포는 아직 미실행이다.

## 2026-08-06 14:25 KST - 오비스 에이블리 광고분석 선택 기간 기능 운영 배포

- 요청: 선택 기간 계산 기능을 운영 오비스에 배포.
- 배포:
  - 커밋: `cf52eadd89c8` (`feat(marketing): support Ably custom period analysis`)
  - 스크립트: `/root/aads/aads-dashboard/deploy.sh`
  - 방식: blue-green 배포, 활성 슬롯 `blue` -> `green`
  - 결과: 14:22:07 KST green 내부/외부 헬스체크 통과 후 nginx upstream 전환 완료.
  - standby: 14:24:38 KST 이전 blue 슬롯 `aads-dashboard` 동기화 및 헬스체크 통과.
- 검증:
  - `npx eslint src/app/marketing/ably/page.tsx` 통과.
  - HTML inline script `new Function(script)` 문법 검사 통과.
  - 운영 `/marketing/ably`는 비로그인 기준 `/login?redirect=%2Fmarketing%2Fably` 307 응답 확인.
  - 운영 `/apps/ably-ad-analyzer/index.html`에서 `분석 시작일`, `분석 종료일`, `에이블리 주간보고서 CSV`, `사방넷 주문 수집 엑셀` 문구 확인.
  - `aads-dashboard`, `aads-dashboard-green` 컨테이너 모두 healthy 확인.
- 주의:
  - 배포 스크립트의 Visual QA API 결과는 `UNKNOWN`으로 미확정. 배포는 성공했으나 브라우저 E2E 통과로 간주하지 않는다.

## 2026-08-06 17:14 KST - 오비스 에이블리 광고분석 사방넷 상품명 매칭 기준 보정

- 요청: 사방넷 파일 매칭 시 일반 `상품명`이 아니라 `[상품명(수집)]`과 에이블리 상품명을 기준으로 매칭하도록 보정.
- 조치:
  - `public/apps/ably-ad-analyzer/index.html`의 사방넷 주문 파일 상품명 헤더 후보에서 `상품명(수집)`, `상품명 수집`, `수집상품명`, `수집 상품명`을 최우선으로 올렸다.
  - 이제 사방넷 파일에 `상품명`과 `상품명(수집)`이 같이 있으면 `상품명(수집)` 값을 우선 사용해 에이블리 주간보고서의 `상품명`과 매칭한다.
- 검증:
  - HTML inline script `new Function(script)` 문법 검사 통과.
  - 헤더 우선순위 단위 확인: `["상품명", "상품명(수집)", "주문수량"]`에서 `상품명(수집)` 인덱스가 선택됨을 확인.
- 배포:
  - 본 항목 작성 시점에는 코드 수정과 로컬 검증만 완료했고, 커밋/푸시/운영 배포는 아직 미실행이다.

## 2026-08-06 18:22 KST - 오비스 에이블리 광고분석 원가2(상품) 부가세 포함 계산 반영

- 요청: 사방넷 주문 파일의 원가는 `원가2(상품)` 컬럼을 기준으로 잡고, 해당 값이 부가세 미포함이므로 부가세 포함 원가로 계산되도록 보정.
- 조치:
  - `public/apps/ably-ad-analyzer/index.html`의 사방넷 원가 헤더 후보에서 `원가2(상품)`, `원가2 상품`, `원가2`, `상품원가2`를 일반 `원가`보다 우선하도록 변경했다.
  - `상품마진` 계산에서 `원가2(상품)`이 있으면 기존 마진 컬럼보다 우선해 `전체매출 - 원가2(상품) × 1.1 × 주문수량`으로 계산하도록 변경했다.
  - 원가 헤더가 `부가세포함`, `VAT포함`, `vat included` 계열로 들어오면 중복 부가세를 붙이지 않도록 예외를 뒀다.
  - `src/app/marketing/ably/page.tsx`의 오비스 상단 안내 문구를 `상품명(수집)` 매칭 및 `원가2(상품)` 부가세 포함 계산 기준으로 갱신했다.
- 검증:
  - HTML inline script 문법 검사 통과.
  - `상품명`과 `상품명(수집)`이 같이 있을 때 `상품명(수집)`을 우선 선택하는 단위 확인을 재실행한다.
  - `원가2(상품)=3,000`, `주문수량=2`, `판매가=10,000`인 경우 부가세 포함 총원가 6,600원, 상품마진 13,400원으로 계산되는지 재실행한다.
- 배포:
  - 코드 커밋: `8fd4968` (`fix(marketing): use Sabanet product cost for Ably analysis`)
  - 스크립트: `/root/aads/aads-dashboard/deploy.sh`
  - 방식: blue-green 배포, 활성 슬롯 `blue` -> `green`
  - 결과: 18:27:31 KST green 내부 헬스체크 통과 및 nginx upstream 전환 완료, 18:29:58 KST standby-blue 동기화 완료.
  - 운영 검증: `https://aads.newtalk.kr/apps/ably-ad-analyzer/index.html` HTTP 200, `원가2(상품)`, `상품명(수집)`, 부가세 포함 계산 로직 문자열 확인.
  - 컨테이너 상태: `aads-dashboard`, `aads-dashboard-green` 모두 healthy.
  - 주의: 배포 스크립트의 Step 7 QA API 결과는 `UNKNOWN`으로 미확정이며, 브라우저 E2E 통과로 간주하지 않는다.

## 2026-08-06 18:45 KST - 오비스 에이블리 광고분석 묶음 캠페인 설정 저장

- 요청: 묶음 캠페인은 최종 입력한 내용이 저장될 수 있게 반영.
- 조치:
  - `public/apps/ably-ad-analyzer/index.html`에 `묶음 저장`, `기본값 복원` 버튼을 추가했다.
  - 묶음 캠페인 입력값은 `localStorage` 키 `ohvis:ably-ad-analyzer:config:v1`에 저장하고, 페이지 재접속/새로고침 시 자동 복원한다.
  - 수동 코드 매핑, 최소 집행일, 기본 마진율, 쿠폰비, 단일/묶음 최소 일예산, 증액 기준도 함께 저장되도록 했다.
  - 분석 실행 전 현재 설정을 자동 저장해 마지막 입력값 손실을 줄였다.
  - `src/app/marketing/ably/page.tsx`의 안내 문구에 묶음 캠페인 설정 저장 기준을 반영했다.
- 검증:
  - HTML inline script 문법 검사 통과.
  - `npx eslint src/app/marketing/ably/page.tsx` 통과.
- 배포:
  - 본 항목 작성 시점에는 코드 수정만 완료했고, 커밋/푸시/운영 배포는 아직 미실행이다.

## 2026-08-06 18:46 KST - 오비스 에이블리 광고분석 결제금액/수수료/배송비 계산 기준 반영

- 요청: 매출은 사방넷 `결제금액` 기준으로 잡고, 에이블리 수수료 10%, 배송비 2,500원/건을 차감하며, 결제금액이 0원인 경우 주문수량을 카운트하지 않도록 보정.
- 조치:
  - `public/apps/ably-ad-analyzer/index.html`의 사방넷 매출 헤더 후보에서 `결제금액`, `총결제금액`, `실결제금액`을 최우선으로 올렸다.
  - 결제금액이 0원인 주문 행은 `quantity=0`, `orderCount=0`, `grossMargin=0`으로 정규화해 주문수량과 배송비 건수에서 제외되도록 했다.
  - 최종 기여이익 공식을 `상품마진 - 광고비 - 쿠폰비 - 에이블리 수수료 - 배송비`로 변경했다.
  - 기본 에이블리 수수료율은 10%, 배송비는 2,500원/건으로 추가했고, 운영자가 화면에서 조정할 수 있게 했다.
  - 상품/묶음 표와 CSV 내보내기에 `수수료`, `배송비` 컬럼을 추가했다.
  - `src/app/marketing/ably/page.tsx`의 오비스 상단 안내 문구를 결제금액 매출, 수수료 10%, 배송비 2,500원/건 기준으로 갱신했다.
- 검증:
  - HTML inline script 문법 검사 통과.
  - `npx eslint src/app/marketing/ably/page.tsx` 통과.
  - 함수 샘플 검증 통과: `결제금액=100,000원`, `원가2(상품)=30,000원`, `주문수량=2`, `광고비=10,000원`, `쿠폰=5%`, `수수료=10%`, `배송비=2,500원/건`일 때 최종 기여이익 6,500원으로 계산됨.
  - 함수 샘플 검증 통과: `결제금액=0원`, `주문수량=3`인 주문 행은 분석 수량 0, 배송비 건수 0으로 정규화됨.
- 배포:
  - 본 항목 작성 시점에는 코드 수정만 완료했고, 커밋/푸시/운영 배포는 아직 미실행이다.

## 2026-08-20 10:12 KST - 오비스 에이블리 광고분석 광고중 우선/오가닉 조치 기준 개선

- 요청: 에이블리 광고 보고서가 보기 어려우므로 광고 진행 중인 상품을 분석자료 첫번째로 보여주고, 광고 미집행 상품은 최근 7일 오가닉 매출 5건 이상이면 `광고 제안`, 그 미만이면 `오가닉 매출`로 조치 표기.
- 조치:
  - `public/apps/ably-ad-analyzer/index.html`의 기본 정렬을 광고비가 있는 상품 우선으로 변경했다.
  - 조치사항 탭은 광고중 상품을 `유지` 판정이어도 상단 분석자료에 포함하도록 변경했다.
  - 광고 미집행 상품은 선택 기간 유료 주문건수(`orderCount`) 기준 5건 이상이면 `광고 제안`, 5건 미만이면 `오가닉 매출`로 표시한다.
  - 표/CSV에 `광고상태`, `오가닉 주문` 컬럼을 추가하고, 보고문 복사 결과에도 광고 제안 후보를 포함했다.
  - 조치 분포 차트에 `광고 제안`, `오가닉 매출` 항목을 추가했다.
  - 오비스 `/marketing/ably` 상단 안내 문구도 광고중 우선/오가닉 5건 기준으로 갱신했다.
- 검증:
  - HTML inline script `new Function(script)` 문법 검사 통과.
  - `npx eslint src/app/marketing/ably/page.tsx` 통과.
  - 샘플 검증 통과: 광고중 상품이 오가닉 상품보다 먼저 정렬되고, 광고 미집행 유료 주문 5건은 `광고 제안`, 4건은 `오가닉 매출`로 판정됨.
- 배포:
  - 본 항목 작성 시점에는 코드 수정과 로컬 검증만 완료했고, 커밋/푸시/운영 배포는 아직 미실행이다.

## 2026-08-26 07:56 KST - 문서현황 GO100 딥링크 오분류 복구

- 요청: 각 프로젝트 세션에서 저장된 문서를 채팅창에서 클릭하면 문서현황으로 이동하지만 문서가 열리지 않는 문제를 즉시 조치하고 배포.
- 원인:
  - 구형 채팅 링크가 `project=AADS`, `base_path=/app/docs`, `file_path=reports/GO100-...md` 형태로 저장되어 GO100 문서를 AADS 로컬 문서로 열려고 했다.
  - 신규 `normalizeDocumentHref()`에는 GO100 힌트 매핑이 있었지만, 이미 생성된 `/docs?...` 딥링크를 문서 화면 진입 시 다시 교정하는 방어 로직이 없었다.
- 조치:
  - `src/lib/documentLinks.ts`에 `normalizeDocumentRouteParams()`를 추가해 AADS `/app/docs`·`/app/reports` 오분류 딥링크를 프로젝트 힌트 기준으로 재정규화한다.
  - `src/app/docs/page.tsx`에서 URL 파라미터를 열기 전에 위 함수를 적용하고, 교정된 URL로 `history.replaceState()`를 수행한다.
  - `src/lib/documentLinks.selftest.ts`에 GO100 #303 문서 URL 오분류 회귀 케이스를 추가했다.
- 검증:
  - `npx tsc --noEmit` 통과.
  - `npx eslint src/lib/documentLinks.ts src/lib/documentLinks.selftest.ts src/app/docs/page.tsx` 통과.
  - `npm run build` 통과.
  - `/tmp/aads-doclinks-selftest`로 TypeScript 셀프테스트 컴파일 후 `node documentLinks.selftest.js` 통과.
  - GO100 원격 문서 `/root/kis-autotrade-v4/docs/reports/GO100-303-STRATEGY-CARD-FULL-SYNC-20260825.md` 존재 및 내용 확인.
  - 운영 green 컨테이너 정적 번들에서 GO100 `/root/kis-autotrade-v4/docs` 매핑 및 딥링크 보정 로직 포함 확인.
- 배포:
  - 코드 커밋: `5b323a4` (`fix(docs): repair project document deep links`)
  - 문서기록 커밋: `2d1d689` (`docs: record project docs deeplink deployment`)
  - 스크립트: `/root/aads/aads-dashboard/deploy.sh`
  - 1차 결과: 07:46:17 KST green 내부 헬스체크 통과, 07:46:18 KST nginx reload 완료, 07:46:19 KST 외부 헬스체크 통과, 07:48:49 KST standby-blue 동기화 완료.
  - 최신 HEAD 재배포: 07:59:35 KST blue 내부 헬스체크 통과, 07:59:35 KST nginx reload 완료, 07:59:36 KST 외부 헬스체크 통과, 08:02:29 KST standby-green 동기화 완료.
  - 운영 상태: `aads-dashboard` 활성, release `2d1d6896a059`, `aads-dashboard`·`aads-dashboard-green` 모두 healthy.
  - 주의: 배포 스크립트 Step 7 QA는 `UNKNOWN`, Browser Bridge 로그인/E2E는 타임아웃/로그인 실패로 미완료. HTTP 307 인증 보호, API `/health`, 컨테이너 상태, 번들 반영 검증으로 대체했다.

## 2026-08-27 07:53 KST - 채팅창 음성알림 온오프 토글 안정화

- 요청: 채팅창 음성알림 온오프가 동작하지 않는 문제 확인 및 조치.
- 원인:
  - 음성 지원 여부를 렌더 시점의 `speechSynthesis` 존재 여부로만 판정해, 모바일 브라우저처럼 음성 엔진/voice 목록이 늦게 준비되는 환경에서 버튼 상태가 비활성 또는 불일치할 수 있었다.
  - `localStorage` 접근 실패 시 예외 방어가 없어 private/webview 계열 환경에서 설정 저장이 깨질 수 있었다.
  - 꺼짐 상태에서는 토스트/아이콘 피드백이 없어 토글 적용 여부를 사용자가 확인하기 어려웠다.
- 조치:
  - `src/services/voiceAlerts.ts`에서 음성알림 설정 읽기/쓰기를 예외 안전하게 변경하고, 사용자 제스처 시 `speechSynthesis.resume()`/`getVoices()`를 호출하는 워밍업 함수를 추가했다.
  - `src/app/chat/page.tsx`에서 `voiceschanged`와 `storage` 이벤트를 구독해 음성 지원/설정 상태를 재동기화하도록 했다.
  - 음성 토글 버튼에 `aria-pressed`를 추가하고, 켜짐/꺼짐 아이콘을 `🔊`/`🔇`으로 분리했다.
  - 토글 시 `음성 안내가 켜졌습니다.` 또는 `음성 안내가 꺼졌습니다.` 토스트를 즉시 표시한다.
- 검증:
  - `npx eslint src/services/voiceAlerts.ts src/app/chat/page.tsx` 통과. 기존 경고 20건, 신규 오류 0건.
  - `npm run build` 통과.
  - 운영 컨테이너 번들에서 `음성 안내가 꺼졌습니다.`, `voice-enabled`, `voiceschanged` 반영 확인.
  - `https://aads.newtalk.kr/chat` HTTP 307 로그인 리다이렉트 확인, `https://aads.newtalk.kr/login` HTTP 200 확인.
  - `aads-dashboard`, `aads-dashboard-green` 컨테이너 healthy 확인.
- 배포:
  - 코드 커밋: `07124ad` (`fix(chat): stabilize voice alert toggle`)
  - 스크립트: `/root/aads/aads-dashboard/deploy.sh`
  - 결과: 07:56:41 KST blue 내부 헬스체크 통과, 07:56:42 KST nginx reload 완료, 07:56:43 KST 외부 헬스체크 통과, 07:59:08 KST standby-green 동기화 완료.
  - 운영 상태: 활성 슬롯 `blue`, release `07124ad9992b`, `aads-dashboard`·`aads-dashboard-green` 모두 healthy.
  - 주의: 배포 스크립트 Step 7 QA는 `UNKNOWN`, 브라우저 음성 재생은 기기/브라우저 권한과 사용자 제스처가 필요하므로 수동 클릭 검증이 필요하다.

## 2026-08-28 17:18 KST - 채팅 응답 완료 시 스크롤 위치 보존

- 요청: 응답 완료 시 채팅창 스크롤이 다시 상단으로 이동하는 현상을 확인하고 즉시 조치.
- 원인:
  - 응답 완료 직후 SSE `done`, `streaming-status.just_completed`, safety-net polling, 추가지시 완료 확인 경로가 서버 메시지를 다시 병합하면서 `setMessages()`를 여러 번 실행했다.
  - 기존 완료 경로는 메시지 병합 전 화면 앵커를 저장하지 않고 `settleScrollAfterMessageMerge()`만 호출해, 대형 세션에서 React 렌더와 DOM 높이 재계산이 겹치면 브라우저가 viewport를 상단 쪽으로 재고정할 수 있었다.
- 조치:
  - `src/app/chat/page.tsx`에 `MessageViewportAnchor`와 `captureMessageViewportAnchor()` / `restoreMessageViewportAnchor()`를 추가했다.
  - 완료·복구·폴링 병합 경로를 `setMessagesPreservingViewport()`로 감싸, 메시지 교체 전 현재 보이는 메시지의 `data-message-id`와 offset을 저장하고 렌더 후 같은 위치로 복원한다.
  - 사용자가 하단에 있을 때는 계속 하단을 유지하고, 중간을 보고 있을 때는 기존 읽던 위치를 유지하도록 분기했다.
- 검증:
  - `npx eslint src/app/chat/page.tsx` 통과. 기존 경고 19건, 신규 오류 0건.
  - `npx tsc --noEmit --pretty false` 통과.
  - `npm run build` 통과.
  - `git diff --check` 통과.
  - `aads-dashboard`, `aads-dashboard-green`, `aads-server`, `aads-postgres` 컨테이너 healthy 확인.
- 배포:
  - 코드 커밋: `6c322f6` (`fix chat completion scroll anchoring`)
  - 스크립트: `/root/aads/aads-dashboard/deploy.sh`
  - 결과: 운영 `aads-dashboard` 컨테이너가 새 빌드로 교체되어 healthy 상태를 반환했다.
  - 운영 상태: `https://aads.newtalk.kr/chat`은 로그인 리다이렉트 후 `/login` HTTP 200 응답을 반환한다.
  - 주의: `capture_screenshot`은 타임아웃으로 실패해 브라우저 시각 검증은 미완료이며, API/컨테이너 검증으로 대체했다.
