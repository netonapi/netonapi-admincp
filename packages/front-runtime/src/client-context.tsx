"use client";

import * as React from "react";
import { isPermitted } from "./permission";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { PermissionInfo } from "./types";

/**
 * 会话快照。
 *
 * shell 在进入受保护区时取一次，之后**页面切换只读这份快照，不再打后端**。
 * 旧的 fork 实现里 layout 和 catch-all 各拉一次、且每次导航都重拉 —— 那是
 * 切页签时可感知延迟的直接来源。
 */
export interface FrontClientContextValue {
  permissions: string[];
  roles: string[];
  user: PermissionInfo["user"];
  menus: PermissionInfo["menus"];
}

const FrontClientContext = React.createContext<FrontClientContextValue | null>(null);


export function FrontClientProvider({
  children,
  permissions,
  roles,
  user,
  menus,
}: FrontClientContextValue & { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 15_000,
      },
    },
  }));

  const contextValue = React.useMemo(() => ({ permissions, roles, user, menus }), [permissions, roles, user, menus]);

  return (
    <QueryClientProvider client={queryClient}>
      <FrontClientContext.Provider value={contextValue}>
        {children}
      </FrontClientContext.Provider>
    </QueryClientProvider>
  );
}

export function useFrontClient(): FrontClientContextValue {
  const value = React.useContext(FrontClientContext);
  if (!value) throw new Error("useFrontClient must be used inside FrontClientProvider");
  return value;
}

/** 会话快照（用户、角色、权限点、菜单树）。页面直接读，不要自己再去拉。 */
export function useSession(): FrontClientContextValue {
  return useFrontClient();
}

export function usePermission(permission?: string): boolean {
  const { permissions } = useFrontClient();
  if (!permission) return true;
  return isPermitted(permissions, permission);
}

export { useMutation, useQuery, useQueryClient };
