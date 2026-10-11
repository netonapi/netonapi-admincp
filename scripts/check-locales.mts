/**
 * 语言包检查（评审 R12）。在 typecheck 之前跑，任何失败都中断。
 *
 * 1. 每个命名空间的各语言 key 集合必须完全一致；同一 key 在各语言里用到的 `{参数}` 也必须一致
 *    （漏一个参数，界面上就会原样露出 `{name}`）。
 * 2. 声明了 `locales` 的模块已承诺完成国际化：它的页面里不得再出现硬编码的中文字符串（注释除外）。
 * 3. 还没有声明 `locales` 的模块列为待迁移，只告警不失败 —— 迁移逐个模块推进，已迁移的不允许倒退。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FrontModuleManifest } from "@neton/application-front-contract";

type Catalog = Record<string, Record<string, string>>; // locale → key → template

const here = path.dirname(fileURLToPath(import.meta.url));
const shellDir = path.resolve(here, "../apps/shell");
const shellRequire = createRequire(path.join(shellDir, "package.json"));
const errors: string[] = [];
const warnings: string[] = [];

function params(template: string): string {
  return [...template.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(",");
}

function checkNamespace(namespace: string, catalog: Catalog) {
  const locales = Object.keys(catalog);
  if (locales.length === 0) return;
  const reference = locales[0];
  const refKeys = new Set(Object.keys(catalog[reference]));
  for (const locale of locales.slice(1)) {
    const keys = new Set(Object.keys(catalog[locale]));
    for (const k of refKeys) if (!keys.has(k)) errors.push(`[${namespace}] ${locale} 缺少 key "${k}"（${reference} 有）`);
    for (const k of keys) if (!refKeys.has(k)) errors.push(`[${namespace}] ${reference} 缺少 key "${k}"（${locale} 有）`);
    for (const k of refKeys) {
      if (keys.has(k) && params(catalog[reference][k]) !== params(catalog[locale][k])) {
        errors.push(`[${namespace}] "${k}" 的参数不一致：${reference}={${params(catalog[reference][k])}} ${locale}={${params(catalog[locale][k])}}`);
      }
    }
  }
}

/** 去掉注释后再找中文：注释写中文是允许的。 */
function hardcodedCjk(file: string): string[] {
  const source = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  return source.split("\n").flatMap((line, i) => (/[一-鿿]/.test(line) ? [`${path.basename(file)}:${i + 1}: ${line.trim().slice(0, 80)}`] : []));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(tsx?|mts)$/.test(name) ? [full] : [];
  });
}

// ---- 静态词条：运行时 + 宿主 ----
// 从壳的依赖里解析：发行版 fork 没有自带 packages/，运行时包是 file: 依赖。
const { runtimeCatalogs } = (await import(pathToFileURL(shellRequire.resolve("@neton/application-front-runtime/messages")).href)) as { runtimeCatalogs: Record<string, Catalog> };
const { shellCatalogs } = (await import(pathToFileURL(path.join(shellDir, "src/messages.ts")).href)) as { shellCatalogs: Record<string, Catalog> };
for (const [ns, catalog] of Object.entries({ ...runtimeCatalogs, ...shellCatalogs })) checkNamespace(ns, catalog);

// ---- 模块语言包 ----
const { default: packages } = (await import(pathToFileURL(path.join(shellDir, "front.modules.ts")).href)) as { default: string[] };
for (const pkg of packages) {
  const manifestPath = shellRequire.resolve(`${pkg}/manifest`);
  const manifest = ((await import(pathToFileURL(manifestPath).href)) as { default: FrontModuleManifest }).default;
  const pagesDir = path.join(path.dirname(manifestPath), "pages");
  if (!manifest.locales?.length) {
    const count = walk(pagesDir).reduce((n, f) => n + hardcodedCjk(f).length, 0);
    warnings.push(`${manifest.id}: 尚未国际化（页面里 ${count} 行含中文）`);
    continue;
  }
  const catalog: Catalog = {};
  for (const l of manifest.locales) {
    const file = shellRequire.resolve(`${pkg}/locales/${l.entry}`);
    catalog[l.lang] = ((await import(pathToFileURL(file).href)) as { default: Record<string, string> }).default;
  }
  checkNamespace(manifest.id, catalog);
  for (const f of walk(pagesDir)) for (const hit of hardcodedCjk(f)) errors.push(`[${manifest.id}] 已声明语言包，但页面仍有硬编码文案 ${hit}`);
}

for (const w of warnings) console.warn(`[locales] 待迁移 ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[locales] ${e}`);
  process.exit(1);
}
console.log(`[locales] ok — ${packages.length} module(s) checked`);
