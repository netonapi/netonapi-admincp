"use client";

import * as React from "react";
import { KitNavigationProvider, PortalHostProvider } from "@neton/application-front-kit";
import { WorkspaceInstanceProvider, instanceTitle, useWorkspace, useWorkspaceStore } from "./context";
import type { WorkspaceInstance, WorkspacePage } from "./types";

class InstanceErrorBoundary extends React.Component<
  { title: string; children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <div className="font-semibold">「{this.props.title}」渲染失败</div>
        <div className="mt-2 break-all text-xs">{this.state.error.message}</div>
        <button type="button" className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold" onClick={() => this.setState({ error: null })}>
          重试
        </button>
      </div>
    );
  }
}

/** 组件按 pageKey 缓存：同一页面的多个实例共用一次模块加载。 */
const componentCache = new Map<string, React.ComponentType>();
const loadingCache = new Map<string, Promise<void>>();

function usePageComponent(page: WorkspacePage | undefined): React.ComponentType | null {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const key = page?.key;
  const cached = key ? componentCache.get(key) ?? null : null;

  React.useEffect(() => {
    if (!page || componentCache.has(page.key)) return;
    let cancelled = false;
    let pending = loadingCache.get(page.key);
    if (!pending) {
      pending = page.load().then((mod) => { componentCache.set(page.key, mod.default); });
      loadingCache.set(page.key, pending);
    }
    pending.finally(() => { if (!cancelled) force(); });
    return () => { cancelled = true; };
  }, [page]);

  return cached;
}

function InstanceFrame({ instance, page, visible }: { instance: WorkspaceInstance; page: WorkspacePage | undefined; visible: boolean }) {
  const Component = usePageComponent(page);
  const portalRef = React.useRef<HTMLDivElement>(null);
  const getPortal = React.useCallback(() => portalRef.current, []);

  return (
    <WorkspaceInstanceProvider instance={instance}>
      <PortalHostProvider container={getPortal}>
        {/*
          每实例独立滚动容器。Activity 隐藏保留 DOM，所以 scrollTop 天然保住，
          不需要手动记录/恢复滚动位置。挂在 shell 共用的 <main> 上则做不到。
        */}
        <div
          data-workspace-instance={instance.instanceId}
          data-workspace-active={visible ? "true" : "false"}
          className="h-full overflow-auto"
        >
          <div className="mx-auto w-full max-w-[1640px] p-4 md:p-6 lg:p-8">
            <InstanceErrorBoundary title={instanceTitle(instance)}>
              {Component ? <Component /> : (
                <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
                  正在加载页面…
                </div>
              )}
            </InstanceErrorBoundary>
          </div>
          <div ref={portalRef} data-workspace-portal={instance.instanceId} />
        </div>
      </PortalHostProvider>
    </WorkspaceInstanceProvider>
  );
}

/**
 * 持久实例宿主。
 *
 * 用 `<Activity>` 而不是 `display:none`：后者只藏 DOM，effect 继续跑，N 个页签
 * 就是 N 份定时器/订阅/observer 在后台空转。Activity 隐藏时**卸载 effect、保留
 * state 与 DOM**，显示时重挂 effect —— 这是实测确认过的语义，也是本设计的地基。
 *
 * 这里没有任何自动回收：已打开的实例只有 close() 能销毁。
 */
export function WorkspaceHost({ pages }: { pages: WorkspacePage[] }) {
  const { instances, activeId } = useWorkspace();
  const store = useWorkspaceStore();
  const pageMap = React.useMemo(() => new Map(pages.map((p) => [p.key, p])), [pages]);
  // front-kit 里的 RowActions / KitLink 通过这个适配器走工作区导航，
  // 不再整页跳转（它们是列表页「详情」按钮的实际出口）。
  const kitNavigation = React.useMemo(() => ({ open: (href: string) => { store.open(href); } }), [store]);

  return (
    <KitNavigationProvider navigation={kitNavigation}>
      {instances.map((instance) => {
        const visible = instance.instanceId === activeId;
        return (
          <React.Activity key={instance.instanceId} mode={visible ? "visible" : "hidden"}>
            <div className={visible ? "h-full" : "hidden"}>
              <InstanceFrame instance={instance} page={pageMap.get(instance.pageKey)} visible={visible} />
            </div>
          </React.Activity>
        );
      })}
    </KitNavigationProvider>
  );
}

/** 关闭前的未保存确认由调用方决定；这里只暴露判据。 */
export function useCloseGuard() {
  const store = useWorkspaceStore();
  const { instances } = useWorkspace();
  return React.useCallback((instanceId: string): boolean => {
    const target = instances.find((i) => i.instanceId === instanceId);
    if (target?.dirty && !window.confirm(`「${instanceTitle(target)}」有未保存内容，仍要关闭吗？`)) return false;
    store.close(instanceId);
    return true;
  }, [store, instances]);
}
