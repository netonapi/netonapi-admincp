export * from "./types";
export * from "./route";
export { WorkspaceStore, type WorkspaceStoreOptions } from "./store";
export {
  WorkspaceStoreProvider,
  WorkspaceInstanceProvider,
  useWorkspace,
  useWorkspaceStore,
  useWorkspaceRoute,
  useWorkspaceNavigation,
  useTabTitle,
  useWorkspaceDirty,
  instanceTitle,
  type WorkspaceNavigation,
} from "./context";
export { buildWorkspacePages, type PageLoaderRegistry } from "./pages";
export { WorkspaceHost, useCloseGuard } from "./host";
export { WorkspaceLink, useWorkspaceLinkDelegation, type WorkspaceLinkProps } from "./link";
export { createBrowserHistoryHost } from "./host-history";
