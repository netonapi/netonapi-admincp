"use client";

import * as React from "react";
import { fetchSession } from "@neton/application-front-runtime/client";
import { buildNav } from "@neton/application-front-runtime/menu";
import type { PermissionInfo } from "@neton/application-front-runtime/types";
import { WorkspaceRoot } from "@/components/workspace-root";

/**
 * 受保护布局。
 *
 * 会话守卫在客户端：凭据是后端下发的 HttpOnly Cookie，前端读不到也不需要读，
 * 「有没有登录」由 `fetchSession()` 的结果回答，而不是靠本地有没有 token 猜。
 *
 * 这里刻意不做服务端渲染的重定向 —— 管理后台不需要 SSR，而放弃它换来的是三个
 * 发行版共用同一份 shell（静态导出宿主没有 server component 可以在渲染前读
 * Cookie）。将来面向终端用户、真的需要 SSR 的应用另说，那是另一套宿主。
 *
 * 布局跨路由不卸载，工作区根挂在这里，页面实例的寿命才不受宿主路由影响；
 * `children` 被刻意忽略，内容一律由工作区宿主渲染。
 */
export default function ProtectedLayout() {
  const [info, setInfo] = React.useState<PermissionInfo | null>(null);

  React.useEffect(() => {
    fetchSession().then((res) => {
      if (res.code !== 0 || !res.data) {
        window.location.href = "/login";
        return;
      }
      setInfo(res.data);
    });
  }, []);

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">
        正在验证会话…
      </div>
    );
  }
  return <WorkspaceRoot info={info} nav={buildNav(info.menus)} />;
}
