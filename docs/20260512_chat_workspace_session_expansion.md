# Chat Workspace Session Expansion

**Date**: 2026-05-12 KST
**Target**: `/chat`

## Summary

Chat sidebar workspace headers now expand or collapse their session lists without moving the active chat session. A session transition occurs only when the user clicks a session inside the expanded workspace list.

## Behavior

- Clicking another workspace header keeps the current session open.
- The selected workspace's sessions are loaded into a sidebar cache and displayed below that workspace.
- Clicking a session updates the active workspace, active session, URL hash, role, and model.
- The active workspace remains expanded so the current session stays visible.
- Non-active expanded workspaces can be collapsed by clicking their header again.

## Validation

- `npx eslint src/app/chat/page.tsx src/app/chat/ChatSidebar.tsx`
  - Result: 0 errors, existing warnings only.
- `npx tsc --noEmit --pretty false`
  - Result: passed.
