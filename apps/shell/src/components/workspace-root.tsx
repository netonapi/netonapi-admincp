"use client";

import * as React from "react";
import {
  WorkspaceStore,
  WorkspaceLabelsProvider,
  WorkspaceStoreProvider,
  buildWorkspacePages,
  createBrowserHistoryHost,
  type WorkspaceLabels,
  type WorkspacePage,
  type WorkspaceUiAdapter,
} from "@neton/application-front-workspace";
import { KitNavigationProvider, PortalHostProvider } from "@neton/application-front-kit";
import { useIsDefaultLocale, useLookupAcross, useT } from "@neton/application-front-runtime/i18n";
import { buildRouteMap } from "@neton/application-front-runtime/menu";
import type { PermissionInfo } from "@neton/application-front-runtime/types";
import { installedModules, pageRegistry } from "@/generated/modules.generated";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@neton/application-front-runtime/menu";

/** 本发行版用 front-kit：把它的弹层宿主与导航注入工作区（工作区自身不认识任何 UI 包）。 */
const UI: WorkspaceUiAdapter = {
  PortalHostProvider,
  NavigationProvider: KitNavigationProvider,
};

/** 工作台不是任何模块的页面，作为内置页注入页面表，好让它也是一个正常实例。 */
function homePage(title: string): WorkspacePage {
  return {
    key: "__home",
    path: "/",
    identity: [],
    title,
    standalone: true,
    load: () => import("@/components/dashboard").then((m) => ({ default: m.default })),
  };
}

/**
 * 工作区根。
 *
 * 这里是整个前端唯一持有页面实例的地方 —— 它挂在受保护布局下，布局跨路由不卸载，
 * 因此实例的寿命由 store 决定而不是由宿主路由决定。
 */
export function WorkspaceRoot({ info, nav }: { info: PermissionInfo; nav: NavItem[] }) {
  const t = useT("shell");
  const homeTitle = t("nav.home");
  const labels = React.useMemo<WorkspaceLabels>(() => ({
    loading: t("workspace.loading"),
    renderFailed: (title) => t("workspace.renderFailed", { title }),
    loadFailed: (title) => t("workspace.loadFailed", { title }),
    staleVersion: t("workspace.staleVersion"),
    retry: t("workspace.retry"),
    reload: t("workspace.reload"),
    confirmCloseDirty: (title) => t("workspace.confirmCloseDirty", { title }),
  }), [t]);
  // 非默认语言：菜单名与页签标题取各模块词条里的 `menu.<页面 key>` / `menu.<菜单路径>` / `title.<页面 key>`。
  // 默认语言直接用后端菜单名 —— 运营在后台改过的名字照样生效。
  const isDefaultLocale = useIsDefaultLocale();
  const lookup = useLookupAcross(React.useMemo(() => installedModules.map((m) => m.id), []));
  const routeMap = React.useMemo(() => buildRouteMap(info.menus), [info.menus]);
  const translateMenu = React.useCallback((path: string, name: string) => {
    if (isDefaultLocale) return name;
    const key = routeMap[path];
    return (key && lookup(`menu.${key}`)) || lookup(`menu.${path}`) || name;
  }, [isDefaultLocale, lookup, routeMap]);
  const translatedNav = React.useMemo(() => {
    const walk = (items: NavItem[]): NavItem[] => items.map((item) => ({
      ...item,
      name: translateMenu(item.path, item.name),
      children: item.children ? walk(item.children) : undefined,
    }));
    return walk(nav);
  }, [nav, translateMenu]);

  const pages = React.useMemo(() => {
    // 菜单名是列表/配置类页面最准确的页签标题（运营改菜单名，页签跟着变）。
    const titles: Record<string, string> = {};
    const nameByKey = new Map<string, string>();
    const walk = (nodes: PermissionInfo["menus"]) => {
      for (const node of nodes) {
        if (node.component) nameByKey.set(node.component, node.name);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(info.menus);
    for (const [path, key] of Object.entries(routeMap)) {
      const name = nameByKey.get(key);
      if (name) titles[path] = translateMenu(path, name);
    }
    const modules = isDefaultLocale ? installedModules : installedModules.map((m) => ({
      ...m,
      pages: m.pages.map((p) => (p.title ? { ...p, title: lookup(`title.${p.key}`) ?? p.title } : p)),
    }));
    return [homePage(homeTitle), ...buildWorkspacePages(modules, pageRegistry, titles)];
  }, [info.menus, homeTitle, routeMap, translateMenu, isDefaultLocale, lookup]);

  const [store] = React.useState(() => new WorkspaceStore({
    pages,
    host: createBrowserHistoryHost(),
    homeHref: "/",
    pinHome: true,
    // 按身份域 + 用户隔离：换人登录不会恢复出上一个人的页签（评审 R19）。
    persist: { scope: `admin:${info.user.userId}` },
  }));

  React.useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  // 语言切换或词条加载完成后页面表会变：已打开的页签原样保留，只更新默认标题（不丢未保存内容）。
  React.useEffect(() => { store.updatePages(pages); }, [store, pages]);

  return (
    <WorkspaceStoreProvider store={store}>
      <WorkspaceLabelsProvider labels={labels}>
      <AppShell
        items={translatedNav}
        user={info.user}
        roles={info.roles}
        permissions={info.permissions}
        menus={info.menus}
        pages={pages}
        ui={UI}
      />
      </WorkspaceLabelsProvider>
    </WorkspaceStoreProvider>
  );
}
