"use client";

import * as React from "react";
import { WorkspaceStore } from "./store";
import { canonicalSearch } from "./route";
import type { WorkspaceInstance, WorkspaceLocation, WorkspaceSnapshot } from "./types";

const StoreContext = React.createContext<WorkspaceStore | null>(null);
const InstanceContext = React.createContext<WorkspaceInstance | null>(null);

export function WorkspaceStoreProvider({ store, children }: { store: WorkspaceStore; children: React.ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useWorkspaceStore(): WorkspaceStore {
  const store = React.useContext(StoreContext);
  if (!store) throw new Error("useWorkspaceStore 必须在 WorkspaceStoreProvider 内使用");
  return store;
}

export function useWorkspace(): WorkspaceSnapshot {
  const store = useWorkspaceStore();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function WorkspaceInstanceProvider({ instance, children }: { instance: WorkspaceInstance; children: React.ReactNode }) {
  return <InstanceContext.Provider value={instance}>{children}</InstanceContext.Provider>;
}

/**
 * 当前实例自己的路由。
 *
 * 🔴 业务页面**只能**用它读参数，不得直读 `window.location`，也不得用宿主的
 * `usePathname()/useSearchParams()`。原因：保活后内存里同时活着多个实例，
 * 而地址栏只有一个；更要命的是 Activity 由隐藏转可见会重新执行 effect ——
 * 直读全局地址的页面会在被切回来的瞬间把自己重新指向**当前激活页签**的地址，
 * 表现为「旧组件配上别人的数据」。
 */
export function useWorkspaceRoute(): WorkspaceLocation & { instanceId: string } {
  const instance = React.useContext(InstanceContext);
  if (!instance) throw new Error("useWorkspaceRoute 必须在工作区实例内使用");
  return React.useMemo(
    () => ({ ...instance.location, instanceId: instance.instanceId }),
    [instance.location, instance.instanceId],
  );
}

export interface WorkspaceNavigation {
  /** 打开地址：命中同资源则激活既有页签，否则新建。 */
  open(href: string, opts?: { forceNew?: boolean }): void;
  /** 同一资源另开一个页签。 */
  openNew(href: string): void;
  /** 更新**当前实例**的视图状态（翻页/筛选/切 section），不新增历史条目。 */
  replaceView(next: { search?: Record<string, string | number | null | undefined>; hash?: string }): void;
  back(): void;
  close(instanceId?: string): void;
  setTitle(title: string): void;
  setDirty(dirty: boolean): void;
}

export function useWorkspaceNavigation(): WorkspaceNavigation {
  const store = useWorkspaceStore();
  const instance = React.useContext(InstanceContext);
  return React.useMemo<WorkspaceNavigation>(() => ({
    open: (href, opts) => { store.open(href, { forceNew: opts?.forceNew }); },
    openNew: (href) => { store.open(href, { forceNew: true }); },
    replaceView: (next) => {
      if (!instance) return;
      const params = new URLSearchParams(instance.location.search);
      for (const [key, value] of Object.entries(next.search ?? {})) {
        if (value === null || value === undefined || value === "") params.delete(key);
        else params.set(key, String(value));
      }
      const search = canonicalSearch(params.toString());
      const hash = next.hash ?? instance.location.hash;
      store.updateLocation(instance.instanceId, `${instance.location.pathname}${search}${hash}`);
    },
    back: () => { window.history.back(); },
    close: (instanceId) => { store.close(instanceId ?? instance?.instanceId ?? ""); },
    setTitle: (title) => { if (instance) store.setTitle(instance.instanceId, title); },
    setDirty: (dirty) => { if (instance) store.setDirty(instance.instanceId, dirty); },
  }), [store, instance]);
}

/**
 * 发布页签标题。
 *
 * 走 render 阶段的 store 写入而不是 effect —— Activity 显示时会重挂 effect，
 * 用 effect 发布会让标题在每次切回来时抖一下。传空串表示"还不知道"，
 * 此时页签沿用注册表默认标题（首帧和加载失败也因此始终有名字）。
 */
export function useTabTitle(title: string | null | undefined): void {
  const store = useWorkspaceStore();
  const instance = React.useContext(InstanceContext);
  const text = title?.trim();
  React.useMemo(() => {
    if (instance && text) store.setTitle(instance.instanceId, text);
  }, [store, instance, text]);
}

/** 标记未保存内容：关闭需确认，且不受任何容量策略回收。 */
export function useWorkspaceDirty(dirty: boolean): void {
  const store = useWorkspaceStore();
  const instance = React.useContext(InstanceContext);
  React.useEffect(() => {
    if (!instance) return;
    store.setDirty(instance.instanceId, dirty);
  }, [store, instance, dirty]);
}

export function instanceTitle(instance: WorkspaceInstance): string {
  return instance.publishedTitle || instance.defaultTitle || "页面";
}
