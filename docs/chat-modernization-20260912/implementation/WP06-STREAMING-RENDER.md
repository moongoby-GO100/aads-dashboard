# WP06 streaming Markdown runtime integration

## Scope

- Connected the existing `planMarkdownRender` policy to the production `MarkdownBlock`.
- The live assistant bubble now marks itself busy and exposes a bounded stability state.
- Syntax highlighting is deferred while content is streaming; the final render retains the existing highlighted, sanitized renderer.
- Source and copy text are never trimmed or rewritten.

## Preservation

- Historical and completed message rendering remains on the existing plugin chain.
- `rehypeRaw` remains followed by the same `rehype-sanitize` policy in both live and final paths.
- Link handling, HTML sandboxing, charts, copy controls, document links, and CRF rendering are unchanged.

## Verification

- `npm run typecheck`
- `npm run test:chat:security`
- `npm run test:chat`
- `npm run test:chat:baseline`
- `npm run lint:chat`
- `git diff --check`

Browser and production performance measurements remain WP06 release gates; this increment does not claim virtualization, heap, INP, or canary completion.
