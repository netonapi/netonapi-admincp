import type { FrontModuleManifest } from "@neton/application-front-contract";
import type { WorkspacePage } from "./types";

export type PageLoaderRegistry = Record<string, () => Promise<{ default: React.ComponentType }>>;

/**
 * manifest + 构建期 loader 注册表 → 工作区页面表。
 *
 * 标题优先级：manifest 显式 `title` > 后端菜单名 > 路径末段。
 * 后端菜单名对列表/配置这类页面最准确（运营改菜单名，页签跟着变），
 * manifest 的 title 留给菜单里没有的 standalone 详情页。
 */
export function buildWorkspacePages(
  modules: FrontModuleManifest[],
  registry: PageLoaderRegistry,
  menuTitleByPath: Record<string, string> = {},
): WorkspacePage[] {
  const pages: WorkspacePage[] = [];
  for (const module of modules) {
    for (const page of module.pages) {
      const load = registry[page.key];
      if (!load) continue;
      pages.push({
        key: page.key,
        path: page.path,
        identity: page.identity ?? [],
        title: page.title ?? menuTitleByPath[page.path] ?? fallbackTitle(page.path),
        standalone: Boolean(page.standalone),
        load,
      });
    }
  }
  // 静态段优先于 `:param` 段：`/pay/app` 必须先于 `/privchat/user/:id` 之类的
  // 同长度模式被尝试，否则字面量路径可能被参数模式抢先匹配。
  pages.sort((a, b) => paramCount(a.path) - paramCount(b.path));
  return pages;
}

function paramCount(path: string): number {
  return path.split("/").filter((s) => s.startsWith(":")).length;
}

function fallbackTitle(path: string): string {
  const segments = path.split("/").filter(Boolean).filter((s) => !s.startsWith(":"));
  return segments[segments.length - 1] ?? "页面";
}
