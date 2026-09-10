import type { ResolvedRoute, WorkspaceLocation, WorkspacePage } from "./types";

/**
 * 规范化查询串：按键排序。
 *
 * 目的只有一个 —— 让 `?a=1&b=2` 和 `?b=2&a=1` 算同一个资源。不做这一步，
 * 同一个页面会因为参数顺序不同开出两个页签（旧实现的真实症状之一）。
 */
export function canonicalSearch(search: string): string {
  const params = new URLSearchParams(search);
  const entries = [...params.entries()].filter(([, v]) => v !== "");
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const next = new URLSearchParams(entries);
  const text = next.toString();
  return text ? `?${text}` : "";
}

/** `:name` 只匹配单个非空 segment；不匹配返回 null。 */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i += 1) {
    const part = expected[i]!;
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(actual[i]!);
    else if (part !== actual[i]) return null;
  }
  return params;
}

export function parseLocation(href: string, params: Record<string, string>): WorkspaceLocation {
  const url = new URL(href, "http://workspace.local");
  const search = canonicalSearch(url.search);
  const query: Record<string, string> = {};
  new URLSearchParams(search).forEach((value, key) => { query[key] = value; });
  return {
    pathname: url.pathname.replace(/\/+$/, "") || "/",
    search,
    hash: url.hash,
    params,
    query,
    href: `${url.pathname.replace(/\/+$/, "") || "/"}${search}${url.hash}`,
  };
}

/**
 * 资源身份：`pageKey::name=value|name=value`（按 identity 声明顺序）。
 *
 * identity 为空的页面（列表页等）是单例：翻页、改筛选都落在同一个页签上。
 */
export function resourceKeyOf(page: WorkspacePage, location: WorkspaceLocation): string {
  if (!page.identity.length) return `${page.key}::`;
  const parts = page.identity.map((name) => {
    const value = location.params[name] ?? location.query[name] ?? "";
    return `${name}=${value}`;
  });
  return `${page.key}::${parts.join("|")}`;
}

/** 默认标题：把 `:name` 占位换成实际参数值。 */
export function defaultTitleOf(page: WorkspacePage, location: WorkspaceLocation): string {
  return page.title.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) =>
    location.params[name] ?? location.query[name] ?? "");
}

/** 地址 → 页面 + 位置 + 资源身份。命中不了任何已安装页面返回 null。 */
export function resolveRoute(pages: WorkspacePage[], href: string): ResolvedRoute | null {
  const url = new URL(href, "http://workspace.local");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  for (const page of pages) {
    const params = matchPath(page.path, pathname);
    if (!params) continue;
    const location = parseLocation(href, params);
    return {
      page,
      location,
      resourceKey: resourceKeyOf(page, location),
      defaultTitle: defaultTitleOf(page, location),
    };
  }
  return null;
}
