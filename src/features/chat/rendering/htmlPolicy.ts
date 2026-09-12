const STATIC_PREVIEW_CSP = [
  "default-src 'none'",
  "img-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  "script-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Untrusted markup is never used as the outer document. A trusted wrapper owns
// the CSP from byte zero and the generated document is encoded into an opaque,
// script-free child frame. This also prevents fake/commented <head> tags or
// pre-head content from running before a dynamically injected policy.
export function createIsolatedHtmlPreviewDocument(title: string, generatedHtml: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${STATIC_PREVIEW_CSP}"><title>${escapeHtml(title)}</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}body{background:#fff}</style></head><body><iframe title="${escapeHtml(title)}" sandbox="" referrerpolicy="no-referrer" srcdoc="${escapeHtml(generatedHtml)}"></iframe></body></html>`;
}

export function staticArtifactHtml(generatedHtml: string): string {
  return createIsolatedHtmlPreviewDocument("HTML 미리보기", generatedHtml);
}

export function createStaticTextDocument(title: string, content: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${STATIC_PREVIEW_CSP}"><title>${escapeHtml(title)}</title><style>:root{color-scheme:dark}body{margin:0;font-family:ui-sans-serif,system-ui;background:#0f172a;color:#e5e7eb}header{position:sticky;top:0;padding:14px 18px;background:#0f172a;border-bottom:1px solid #334155}h1{margin:0;font-size:15px}main{padding:18px}pre{margin:0;white-space:pre-wrap;word-break:break-word;font:13px/1.6 ui-monospace,monospace;background:#020617;border:1px solid #334155;border-radius:8px;padding:16px}</style></head><body><header><h1>${escapeHtml(title)}</h1></header><main><pre>${escapeHtml(content)}</pre></main></body></html>`;
}

function openBlobDocument(documentHtml: string): boolean {
  const url = URL.createObjectURL(new Blob([documentHtml], { type: "text/html;charset=utf-8" }));
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return Boolean(opened);
}

export function openIsolatedHtmlPreview(title: string, generatedHtml: string): boolean {
  return openBlobDocument(createIsolatedHtmlPreviewDocument(title, generatedHtml));
}

export function openStaticTextPreview(title: string, content: string): boolean {
  return openBlobDocument(createStaticTextDocument(title, content));
}
