import type { WorkspaceHostAdapter } from "./types";

/** 我们在 history.state 上的命名空间。绝不整体覆盖 state —— 宿主的内部字段也在里面。 */
const NS = "__neton_workspace";

interface WorkspaceHistoryState { instanceId: string }

function readNs(state: unknown): WorkspaceHistoryState | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[NS];
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>).instanceId;
  return typeof id === "string" ? { instanceId: id } : null;
}

/**
 * 浏览器 History 宿主适配器。
 *
 * 🔴 只能走 `window.history.pushState/replaceState` 这两个**公开 API**，
 * 不要缓存 original 引用绕过去，也不要改用 Navigation API。
 *
 * 原因（Next 16 App Router 实测）：它给 pushState/replaceState 打了补丁，会把
 * 自己的内部字段合并进我们传的 state；而它的 popstate 处理里有一条
 * 「条目 state 上没有它的内部标记 → `window.location.reload()`」。
 * 一旦有任何路径绕过补丁写了历史，用户按后退就是整页刷新，
 * 工作区里所有实例连同未保存内容一起没。行为回归见 gate2 用例
 * 「后退不得触发 load 事件」。
 *
 * 我们只读写自己命名空间下的字段，不读也不写宿主的内部字段。
 */
export function createBrowserHistoryHost(): WorkspaceHostAdapter {
  return {
    read() {
      return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    },
    readInstanceId() {
      return readNs(window.history.state)?.instanceId ?? null;
    },
    push(href, instanceId) {
      const prev = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.pushState({ ...prev, [NS]: { instanceId } }, "", href);
    },
    replace(href, instanceId) {
      const prev = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.replaceState({ ...prev, [NS]: { instanceId } }, "", href);
    },
    subscribe(listener) {
      const onPop = () => {
        const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        listener(href, readNs(window.history.state)?.instanceId ?? null);
      };
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    },
  };
}
