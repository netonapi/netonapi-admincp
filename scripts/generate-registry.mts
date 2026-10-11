/**
 * 构建期模块注册表生成（NETON_APPLICATION_FRONT_SPEC §5 / §10）。
 * 读 apps/shell/front.modules.ts → 校验 manifest → 生成
 * apps/shell/src/generated/modules.generated.ts（静态 import()，Next 可分析拆包）。
 * 任何校验失败即抛错中断构建。
 */
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FrontModuleManifest } from "@neton/application-front-contract";

const SHELL_CONTRACT_MAJOR = 1;

const here = path.dirname(fileURLToPath(import.meta.url));
const shellDir = path.resolve(here, "../apps/shell");
// 模块包必须从 shell 的依赖上下文解析（workspace 链接挂在 shell 下，不在仓库根）。
const shellRequire = createRequire(path.join(shellDir, "package.json"));

const { default: packages } = (await import(
  pathToFileURL(path.join(shellDir, "front.modules.ts")).href
)) as { default: string[] };

/**
 * 每个 page 的 entry 必须真的能解析到文件。
 *
 * `file:` 依赖是 pnpm 在安装时**硬链接**过来的：改已有文件会立刻生效（同一个 inode），
 * 但**新增的文件要等重装才会出现在依赖里**。于是「模块加了新页面但没在 shell 重装」
 * 的后果是——manifest 读到了（manifest.ts 是老文件，硬链接，永远同步），页面文件却不在，
 * 生成的 `import()` 指向一个不存在的模块。踩过一次：页面写完了、typecheck 全绿、
 * 产物里根本没有它。
 *
 * 这里提前做 shell 构建期会做的那次解析，把失败挪到有明确修复指令的地方。
 */
function assertEntryResolvable(pkg: string, entry: string) {
  const spec = `${pkg}/pages/${entry}`;
  try {
    shellRequire.resolve(spec);
  } catch {
    throw new Error(
      `[registry] ${pkg} 的 manifest 声明了页面 "${entry}"，但 ${spec} 解析不到。\n` +
        `  多半是模块仓新增了页面而 shell 这边没重装（file: 依赖不会自动带上新文件）。\n` +
        `  修复：在 neton-application-front 仓库根跑 pnpm install`,
    );
  }
}

/**
 * `file:` 依赖的副本必须跟模块仓的源码一样全。
 *
 * [assertEntryResolvable] 只看得见「页面入口」，看不见模块内部新增的文件。今天就栽在
 * 这上面：payment 模块抽了个 `src/lib/freeze.ts` 给两个页面共用，页面入口都还在、
 * 产品 shell 的 typecheck 也全绿，但上游 shell 里那份副本没有这个文件，
 * 报的是「Type 'unknown' is not assignable to ReactNode」——跟真实原因（副本缺文件）
 * 毫无关系的错，够查一阵子。
 *
 * 所以这里直接比对文件清单：源码有、副本没有 → 当场说清楚是装的问题。
 */
function assertInstalledCopyIsComplete(pkg: string) {
  const deps = JSON.parse(readFileSync(path.join(shellDir, "package.json"), "utf8")).dependencies ?? {};
  const spec: string | undefined = deps[pkg];
  if (!spec?.startsWith("file:")) return; // 只有本地 file: 依赖会有这个问题
  const sourceDir = path.resolve(shellDir, spec.slice("file:".length));
  const installedDir = path.dirname(shellRequire.resolve(`${pkg}/manifest`)).replace(/\/src$/, "");
  const list = (root: string): string[] => {
    const out: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), rel);
        else out.push(rel);
      }
    };
    try { walk(path.join(root, "src"), ""); } catch { /* 没有 src 就当空 */ }
    return out;
  };
  const missing = list(sourceDir).filter((f) => !list(installedDir).includes(f));
  if (missing.length > 0) {
    throw new Error(
      `[registry] ${pkg} 装到 shell 里的副本缺文件：${missing.slice(0, 5).join(", ")}` +
        `${missing.length > 5 ? ` …共 ${missing.length} 个` : ""}\n` +
        `  file: 依赖是安装时硬链接过去的，改已有文件会同步，**新增文件不会**。\n` +
        `  修复：在本仓库根跑 pnpm install`,
    );
  }
}

interface Loaded { pkg: string; manifest: FrontModuleManifest; }
const loaded: Loaded[] = [];
for (const pkg of packages) {
  assertInstalledCopyIsComplete(pkg);
  const manifestPath = shellRequire.resolve(`${pkg}/manifest`);
  const mod = await import(pathToFileURL(manifestPath).href);
  const manifest: FrontModuleManifest | undefined = mod.default ?? mod.manifest;
  if (!manifest) throw new Error(`[registry] ${pkg} 未从 ./manifest 导出默认 manifest`);
  loaded.push({ pkg, manifest });
}

// ---- 校验 ----
const ids = new Map<string, string>();
const pageKeys = new Map<string, string>();
const pagePaths = new Map<string, string>();
for (const { pkg, manifest } of loaded) {
  if (ids.has(manifest.id))
    throw new Error(`[registry] 重复模块 id "${manifest.id}"：${ids.get(manifest.id)} vs ${pkg}`);
  ids.set(manifest.id, pkg);
  const major = Number(String(manifest.contractVersion).split(".")[0]);
  if (major !== SHELL_CONTRACT_MAJOR)
    throw new Error(
      `[registry] ${pkg} contractVersion=${manifest.contractVersion} 与 shell contract major=${SHELL_CONTRACT_MAJOR} 不兼容`,
    );
  for (const p of manifest.pages) {
    if (pageKeys.has(p.key))
      throw new Error(`[registry] 重复 page key "${p.key}"：${pageKeys.get(p.key)} vs ${pkg}`);
    pageKeys.set(p.key, pkg);
    if (pagePaths.has(p.path))
      throw new Error(`[registry] 重复路由 "${p.path}"：${pagePaths.get(p.path)} vs ${pkg}`);
    pagePaths.set(p.path, pkg);
    assertEntryResolvable(pkg, p.entry);
  }
}
for (const { pkg, manifest } of loaded)
  for (const r of manifest.requires ?? [])
    if (!ids.has(r)) throw new Error(`[registry] ${pkg} requires "${r}" 未安装`);

// ---- 语言包（评审 R12）：模块 id 即命名空间，`<pkg>/locales/<entry>` 必须能解析 ----
const localeEntries: string[] = [];
for (const { pkg, manifest } of loaded) {
  if (!manifest.locales?.length) continue;
  const langs = manifest.locales.map((l) => {
    const spec = `${pkg}/locales/${l.entry}`;
    try {
      shellRequire.resolve(spec);
    } catch {
      throw new Error(`[registry] ${pkg} 声明了语言包 ${l.lang} → ${spec}，但解析不到（新增文件后需在仓库根 pnpm install）`);
    }
    return `    ${JSON.stringify(l.lang)}: () => import(${JSON.stringify(spec)}),`;
  });
  localeEntries.push(`  ${JSON.stringify(manifest.id)}: {\n${langs.join("\n")}\n  },`);
}

// ---- 生成 ----
const entries = loaded.flatMap(({ pkg, manifest }) =>
  manifest.pages.map((p) => `  ${JSON.stringify(p.key)}: () => import(${JSON.stringify(`${pkg}/pages/${p.entry}`)}),`),
);
const out = `/* 自动生成：pnpm registry（scripts/generate-registry.mts）。禁止手改。 */
import type { FrontModuleManifest } from "@neton/application-front-contract";
import type { LocaleRegistry } from "@neton/application-front-runtime/i18n";
import type * as React from "react";

export const installedModules: FrontModuleManifest[] = ${JSON.stringify(
  loaded.map((l) => l.manifest),
  null,
  2,
)};

export const pageRegistry: Record<string, () => Promise<{ default: React.ComponentType }>> = {
${entries.join("\n")}
};

/** 模块语言包：命名空间（模块 id）→ 语言 → loader。随模块懒加载。 */
export const localeRegistry: LocaleRegistry = {
${localeEntries.join("\n")}
};
`;
const genDir = path.join(shellDir, "src/generated");
await mkdir(genDir, { recursive: true });
await writeFile(path.join(genDir, "modules.generated.ts"), out);
console.log(
  `[registry] ok — ${loaded.length} module(s), ${pageKeys.size} page(s) → src/generated/modules.generated.ts`,
);
