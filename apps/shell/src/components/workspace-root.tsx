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
import { useT } from "@neton/application-front-runtime/i18n";
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
  const pages = React.useMemo(() => {
    // 菜单名是列表/配置类页面最准确的页签标题（运营改菜单名，页签跟着变）。
    const titles: Record<string, string> = {};
    const routeMap = buildRouteMap(info.menus);
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
      if (name) titles[path] = name;
    }
    return [homePage(homeTitle), ...buildWorkspacePages(installedModules, pageRegistry, titles)];
  }, [info.menus, homeTitle]);

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

  return (
    <WorkspaceStoreProvider store={store}>
      <WorkspaceLabelsProvider labels={labels}>
      <AppShell
        items={nav}
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
