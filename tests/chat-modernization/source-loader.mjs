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
    AbortController,
    ReadableStream,
    setTimeout,
    clearTimeout,
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
  const { mergeMessageProjection } = loadSource("src/features/chat/domain/messageReducer.ts");
  vm.runInNewContext(
    transpile(`${code}\nmodule.exports = {${names.join(",")}};`),
    { module: commonJsModule, console, mergeMessageProjection },
    { timeout: 5000 },
  );
  return commonJsModule.exports;
}
