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

const INTERACTIVE_PREVIEW_CSP = [
  "default-src 'none'",
  "img-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
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

// meta CSP를 생성 HTML 맨 앞에 붙이면 doctype이 뒤로 밀려 quirks mode가 되고 기존 artifact
// 레이아웃이 깨진다. head/doctype 뒤에 삽입해 standards mode를 유지한다.
function injectCsp(generatedHtml: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  const headOpen = /<head(\s[^>]*)?>/i.exec(generatedHtml);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return generatedHtml.slice(0, at) + meta + generatedHtml.slice(at);
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(generatedHtml);
  if (doctype) {
    const at = doctype.index + doctype[0].length;
    return generatedHtml.slice(0, at) + meta + generatedHtml.slice(at);
  }
  return meta + generatedHtml;
}

export function staticArtifactHtml(generatedHtml: string): string {
  return injectCsp(generatedHtml, STATIC_PREVIEW_CSP);
}

export function interactiveArtifactHtml(generatedHtml: string): string {
  return injectCsp(generatedHtml, INTERACTIVE_PREVIEW_CSP);
}

export function createIsolatedHtmlPreviewDocument(title: string, generatedHtml: string): string {
  const isolated = interactiveArtifactHtml(generatedHtml);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}body{background:#fff}</style></head><body><iframe title="${escapeHtml(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeHtml(isolated)}"></iframe></body></html>`;
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
