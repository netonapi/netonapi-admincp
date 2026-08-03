/**
 * 构建期模块注册表生成（NETON_APPLICATION_FRONT_SPEC §5 / §10）。
 * 读 apps/shell/front.modules.ts → 校验 manifest → 生成
 * apps/shell/src/generated/modules.generated.ts（静态 import()，Next 可分析拆包）。
 * 任何校验失败即抛错中断构建。
 */
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

interface Loaded { pkg: string; manifest: FrontModuleManifest; }
const loaded: Loaded[] = [];
for (const pkg of packages) {
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

// ---- 生成 ----
const entries = loaded.flatMap(({ pkg, manifest }) =>
  manifest.pages.map((p) => `  ${JSON.stringify(p.key)}: () => import(${JSON.stringify(`${pkg}/pages/${p.entry}`)}),`),
);
const out = `/* 自动生成：pnpm registry（scripts/generate-registry.mts）。禁止手改。 */
import type { FrontModuleManifest } from "@neton/application-front-contract";
import type * as React from "react";

export const installedModules: FrontModuleManifest[] = ${JSON.stringify(
  loaded.map((l) => l.manifest),
  null,
  2,
)};

export const pageRegistry: Record<string, () => Promise<{ default: React.ComponentType }>> = {
${entries.join("\n")}
};
`;
const genDir = path.join(shellDir, "src/generated");
await mkdir(genDir, { recursive: true });
await writeFile(path.join(genDir, "modules.generated.ts"), out);
console.log(
  `[registry] ok — ${loaded.length} module(s), ${pageKeys.size} page(s) → src/generated/modules.generated.ts`,
);
