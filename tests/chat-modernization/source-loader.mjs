import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const pagePath = "src/app/chat/page.tsx";
export const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function transpile(text, file = "fixture.ts") {
  return ts.transpileModule(text, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
}

export function loadSource(file, globals = {}, cache = new Map()) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const commonJsModule = { exports: {} };
  cache.set(absolute, commonJsModule);
  const requireFrom = createRequire(absolute);
  const localRequire = (name) => {
    if (!name.startsWith(".") && !name.startsWith("@/")) return requireFrom(name);
    const base = name.startsWith("@/")
      ? path.join(root, "src", name.slice(2))
      : path.resolve(path.dirname(absolute), name);
    const resolved = ["", ".ts", ".tsx", ".js"].map((ext) => base + ext)
      .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error(`Unresolved source import ${name}`);
    return loadSource(resolved, globals, cache);
  };
  vm.runInNewContext(transpile(fs.readFileSync(absolute, "utf8"), absolute), {
    module: commonJsModule,
    exports: commonJsModule.exports,
    require: localRequire,
    console,
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    ...globals,
  }, { filename: absolute, timeout: 5000 });
  return commonJsModule.exports;
}

// Execute only selected top-level pure declarations from the production route.
// React effects, browser state, auth, and network are never evaluated.
export function loadPageFunctions(names) {
  const text = source(pagePath);
  const ast = ts.createSourceFile(pagePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, statement);
      }
    }
  }
  const selected = new Set();
  const visitName = (name) => {
    const node = declarations.get(name);
    if (!node || selected.has(node)) return;
    selected.add(node);
    const visit = (child) => {
      if (ts.isIdentifier(child)) visitName(child.text);
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
  };
  for (const name of names) {
    if (!declarations.has(name)) throw new Error(`Missing production symbol ${name}`);
    visitName(name);
  }
  const code = [...selected]
    .sort((left, right) => left.pos - right.pos)
    .map((node) => node.getText(ast))
    .join("\n");
  const commonJsModule = { exports: {} };
  vm.runInNewContext(
    transpile(`${code}\nmodule.exports = {${names.join(",")}};`),
    { module: commonJsModule, console },
    { timeout: 5000 },
  );
  return commonJsModule.exports;
}

// Run the framing/id/JSON prefix of each actual legacy inline reader. Dispatch
// is replaced by a recorder, so this observes C10 without copying a parser.
export function legacyParser(entry) {
  const marker = {
    direct: "seenStreamEventIds",
    replay: "seenReplayEventIds",
    resume: "seenResumeEventIds",
    regenerate: "seenRegenEventIds",
  }[entry];
  if (!marker) throw new Error(`Unknown parser entry ${entry}`);
  const text = source(pagePath);
  const start = text.indexOf(`const ${marker}`);
  const whileAt = text.indexOf("while (true)", start);
  const json = /const (ev|rev) = JSON\.parse\([^;]+;/g;
  json.lastIndex = whileAt;
  const match = json.exec(text);
  if (start < 0 || whileAt < 0 || !match || match.index - whileAt > 3000) {
    throw new Error(`Legacy parser shape drift: ${entry}`);
  }
  const stateEnd = text.indexOf(";", text.indexOf("let skip", start)) + 1;
  const state = text.slice(start, stateEnd);
  const loop = text.slice(whileAt, match.index + match[0].length);
  const body = `${state}\n${loop}\nevents.push(${match[1]}); } catch { invalid++; } } }`;
  const compiled = transpile(`module.exports = async function(inputChunks) {
    let index = 0;
    const reader = { read: async () => index < inputChunks.length
      ? { value: inputChunks[index++], done: false } : { done: true } };
    const resumeReader = reader;
    const decoder = new TextDecoder();
    const resumeDecoder = decoder;
    let buf = "", resumeBuf = "";
    const events = [], lastEventIdRef = { current: "" };
    let invalid = 0;
    const attachSessionId = "synthetic-session-a";
    const activeSessionRef = { current: attachSessionId };
    const isStale = () => false;
    ${body}
    return { events, cursor: lastEventIdRef.current, invalid };
  };`);
  const commonJsModule = { exports: {} };
  vm.runInNewContext(compiled, { module: commonJsModule, TextDecoder }, { timeout: 5000 });
  return commonJsModule.exports;
}
