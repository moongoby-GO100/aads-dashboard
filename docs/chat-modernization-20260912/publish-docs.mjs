#!/usr/bin/env node
// Deterministic, script-free publication of the canonical Markdown documents.
// Default output is an apply_patch patch; --check checks the committed artifact.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const base = path.dirname(fileURLToPath(import.meta.url));
const outputName = '20260912_채팅_구조개선_기능개선_PRD_설계_유지보수_재발방지_통합보고서.html';
const outputPath = path.join(base, outputName);
const documents = [
  ['README.md', 'overview', '문서 안내·핵심 판단'],
  ['CURRENT-CODE-AUDIT.md', 'audit', '현재 코드 감사·원인·문제점'],
  ['PRD.md', 'prd', 'PRD·기능 요구사항·인수 기준'],
  ['TECHNICAL-DESIGN.md', 'design', '상세 기술 설계·기술 스택'],
  ['VERIFICATION-AND-ROLLOUT.md', 'verification', '실행 계획·검증·유지보수·재발 방지'],
  ['SOURCES.md', 'sources', '공식 출처·내부 보고서'],
];
const e = React.createElement;
// srcdoc otherwise resolves #fragment against the parent /docs URL.
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#embedding_source_code_in_an_iframe
const frameAnchor = (fragment) => `about:srcdoc${fragment}`;
const encodePath = (value) => value.split('/').map(encodeURIComponent).join('/');
const slug = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').trim().replace(/\s/g, '-');
const textOf = (node) => typeof node === 'string' ? node : Array.isArray(node)
  ? node.map(textOf).join('') : node?.props ? textOf(node.props.children) : '';
const byPath = new Map(documents.map(([file, id]) => [path.join(base, file), id]));
const roots = [
  ['/root/aads/aads-dashboard/docs', '/root/aads/aads-dashboard/docs'],
  ['/root/aads/aads-dashboard/src', '/root/aads/aads-dashboard/src'],
  ['/root/aads/aads-server/docs', '/app/docs'],
  ['/root/aads/aads-server/reports', '/app/reports'],
  ['/root/aads/aads-server/app', '/app/app'],
];
const viewer = (basePath, filePath) => 'https://aads.newtalk.kr/docs?' + new URLSearchParams({
  project: 'AADS', base_path: basePath, file_path: filePath,
}).toString();
const publicationUrl = viewer('/root/aads/aads-dashboard/docs', `chat-modernization-20260912/${outputName}`);

function resolveLink(href, currentId) {
  if (/^https?:\/\//.test(href)) return href;
  if (href.startsWith('#')) return `#${currentId}--${href.slice(1)}`;
  const [relative, fragment] = href.split('#');
  const target = path.resolve(base, decodeURIComponent(relative));
  if (target === outputPath) return '#publication';
  if (byPath.has(target)) return `#${byPath.get(target)}${fragment ? `--${fragment}` : ''}`;
  for (const [hostRoot, apiRoot] of roots) {
    if (target.startsWith(`${hostRoot}/`) && !target.endsWith('.mjs')) {
      return viewer(apiRoot, target.slice(hostRoot.length + 1));
    }
  }
  // Repo-root configuration/handovers are outside the docs API allowlist.
  // Keep their source attribution without widening the server's access policy.
  const repos = [
    ['/root/aads/aads-dashboard', 'aads-dashboard', '17d1124'],
    ['/root/aads/aads-server', 'aads-server', 'e50f0ef9f9a397fcb0908fdcd6cb477723a1c2c0'],
  ];
  for (const [root, repo, revision] of repos) {
    if (target.startsWith(`${root}/`)) {
      return `https://github.com/moongoby-GO100/${repo}/blob/${revision}/${encodePath(target.slice(root.length + 1))}`;
    }
  }
  return null;
}

const hashes = [];
const sections = documents.map(([file, id, title]) => {
  const source = fs.readFileSync(path.join(base, file), 'utf8');
  hashes.push([file, createHash('sha256').update(source).digest('hex')]);
  const headingCounts = new Map();
  const components = {
    a: ({ href = '', children }) => {
      const resolved = resolveLink(href, id);
      return resolved ? e('a', {
        href: resolved.startsWith('#') ? frameAnchor(resolved) : resolved,
        ...(resolved.startsWith('#') ? {} : { target: '_blank', rel: 'noopener noreferrer' }),
      }, children) : e('span', { title: href }, children, e('code', {}, ` [저장소 경로: ${href}]`));
    },
    table: ({ children }) => e('div', { className: 'table-scroll', tabIndex: 0, role: 'region', 'aria-label': `${title} 표` }, e('table', {}, children)),
  };
  for (let level = 1; level <= 6; level++) {
    components[`h${level}`] = ({ children }) => {
      const key = slug(textOf(children));
      const count = headingCounts.get(key) || 0;
      headingCounts.set(key, count + 1);
      return e(`h${Math.min(level + 1, 6)}`, { id: `${id}--${key}${count ? `-${count}` : ''}` }, children);
    };
  }
  return e('section', { id, className: 'document', key: id },
    e('div', { className: 'document-label' }, title, ' · ', file,
      e('a', { href: frameAnchor('#publication'), className: 'back-link' }, '목차로')),
    e(ReactMarkdown, { remarkPlugins: [remarkGfm], skipHtml: true, components }, source));
});

const css = `
:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#172238;background:#f2f5fa;line-height:1.75}
*{box-sizing:border-box}body{margin:0}main{max-width:1280px;margin:auto;padding:24px}
a{color:#1457b8;text-underline-offset:3px;overflow-wrap:anywhere}a:focus-visible{outline:3px solid #d16b00;outline-offset:3px}
header,nav,.document{background:white;border:1px solid #d9e1ec;border-radius:14px;padding:24px;margin-bottom:20px}
h1{font-size:clamp(24px,4vw,36px);line-height:1.3;margin:0 0 14px}h2{font-size:25px}h3{font-size:21px}h4{font-size:18px}
h2,h3,h4,h5,h6{line-height:1.5;scroll-margin-top:20px}p,li,td{overflow-wrap:anywhere}
.status{display:inline-block;background:#e7f1ff;color:#154b8b;padding:5px 12px;border-radius:8px;font-weight:650}
.muted{color:#536379;font-size:14px}nav ol{margin:0;padding-left:24px}nav a{display:inline-block;padding:7px 0;min-height:40px}
.document-label{font-size:14px;color:#536379;border-bottom:1px solid #d9e1ec;padding-bottom:12px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:10px}
.back-link{margin-left:auto}.table-scroll{overflow:auto;max-width:100%;border:1px solid #d9e1ec;border-radius:8px;margin:18px 0}
table{border-collapse:collapse;font-size:14px;width:100%}th,td{border:1px solid #d9e1ec;padding:10px 12px;vertical-align:top;min-width:90px}th{background:#eef3fa;text-align:left}
pre{background:#15243b;color:#eaf2fc;padding:18px;border-radius:9px;overflow:auto;font-size:13px;line-height:1.65}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em}p code,li code,td code{background:#edf2f8;border-radius:4px;padding:2px 4px;overflow-wrap:anywhere}
blockquote{border-left:4px solid #4379be;padding-left:16px;margin-left:0;color:#43546b}details{margin-top:18px}summary{cursor:pointer}
@media(max-width:640px){main{padding:10px}header,nav,.document{padding:16px}h2{font-size:22px}th,td{padding:8px}.back-link{margin-left:0}}
@media print{body{background:white}main{max-width:none;padding:0}header,nav,.document{border:0;border-radius:0;padding:0}.document{break-before:page}.table-scroll,pre{overflow:visible}pre{white-space:pre-wrap}a{color:inherit}.back-link{display:none}}
`;
const html = '<!DOCTYPE html>\n' + renderToStaticMarkup(e('html', { lang: 'ko' },
  e('head', {}, e('meta', { charSet: 'utf-8' }),
    e('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
    e('meta', { httpEquiv: 'Content-Security-Policy', content: "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'" }),
    e('title', {}, 'AADS 채팅 구조·기능 개선 PRD·설계·유지보수 통합 보고서 | 2026-09-12'),
    e('style', {}, css)),
  e('body', {}, e('main', {},
    e('header', { id: 'publication' },
      e('p', { className: 'status' }, '계획 수립 완료 · 제품 구현 전'),
      e('h1', {}, '채팅 구조·기능 개선 PRD·설계·유지보수 통합 보고서'),
      e('p', {}, '2026-09-12 작성한 원문 6개를 생략 없이 통합했습니다. 코드 감사, 요구사항, 기술 스택, 실행 계획, 재발 방지와 출처를 아래 목차에서 확인하세요.'),
      e('p', { className: 'muted' }, '원문 기준 시점의 감사 기록입니다. 이후 제품 변경의 완료를 의미하지 않습니다. 외부 출처와 별도 문서는 새 창으로 열립니다. Mermaid 설계도는 의존 스크립트 없이 원문 코드로 보존합니다.'),
      e('a', { href: publicationUrl, target: '_blank', rel: 'noopener noreferrer' }, '/docs에서 이 통합 보고서 바로 열기')),
    e('nav', { 'aria-label': '문서 목차' }, e('h2', {}, '목차'),
      e('ol', {}, documents.map(([, id, title]) => e('li', { key: id }, e('a', { href: frameAnchor(`#${id}`) }, title))))),
    ...sections,
    e('footer', { className: 'muted' },
      e('p', {}, '이 HTML은 publish-docs.mjs로 생성한 열람용 산출물입니다. 원본 Markdown을 수정한 후 재생성하고 --check로 동기화를 검증합니다. 운영 앱 배포·인증 정책 변경 없이 기존 문서 경로로 제공됩니다.'),
      e('details', {}, e('summary', {}, '원문 SHA-256 검증 지문'),
        e('ul', {}, hashes.map(([file, hash]) => e('li', { key: file }, `${file}: `, e('code', {}, hash)))))))))) + '\n';

if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== html) {
    console.error('FAIL: publication is missing or differs from canonical Markdown');
    process.exitCode = 1;
  } else {
    console.log(`PASS: 6 canonical documents match publication (${Buffer.byteLength(html)} bytes)`);
  }
} else {
  const exists = fs.existsSync(outputPath);
  const before = exists ? fs.readFileSync(outputPath, 'utf8').trimEnd().split('\n').map((line) => `-${line}`).join('\n') + '\n' : '';
  const after = html.trimEnd().split('\n').map((line) => `+${line}`).join('\n');
  console.log(`*** Begin Patch\n*** ${exists ? 'Update' : 'Add'} File: ${outputPath}\n${exists ? '@@\n' : ''}${before}${after}\n*** End Patch`);
}
