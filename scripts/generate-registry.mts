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
    // entry 必须真能解析。上面几道校的都是 manifest 自己说了什么，这一道校它说的东西在不在：
    // 生成的 registry 是 `import("<pkg>/pages/<entry>")`，解析不到要等到 Next 构建才炸，
    // 而且报的是 module-not-found，看不出跟 manifest 有关。
    // 触发方式通常不是写错文件名，而是模块仓以 `file:` 依赖装进来：pnpm 只链接 install 当时
    // 存在的文件，之后在模块仓里新增的页面不会自己出现在 node_modules 里。而 manifest 是
    // 原地改的（同一个 inode），新 key 立刻可见 —— 于是表现为「manifest 有 8 页、
    // node_modules 里只有 5 页」，而本脚本原本对此一无所知。
    try {
      shellRequire.resolve(`${pkg}/pages/${p.entry}`);
    } catch {
      throw new Error(
        `[registry] ${pkg} 的 page "${p.key}" 指向 ./pages/${p.entry}，但该文件从 shell 解析不到。` +
          `若这是模块仓里新增的页面：file: 依赖是 install 时链接的，新增文件不会自动出现，` +
          `请在本仓重新执行一次 install。`,
      );
    }
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
