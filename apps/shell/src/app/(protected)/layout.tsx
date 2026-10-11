"use client";

import * as React from "react";
import { fetchSession, type SessionResult } from "@neton/application-front-runtime/client";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";
import { buildNav } from "@neton/application-front-runtime/menu";
import { WorkspaceRoot } from "@/components/workspace-root";

/**
 * 受保护布局。
 *
 * 会话守卫在客户端：凭据是后端下发的 HttpOnly Cookie，前端读不到也不需要读，
 * 「有没有登录」由 `fetchSession()` 的结果回答，而不是靠本地有没有 token 猜。
 *
 * 只有明确的「未登录」才回登录页（评审 R15）。后端不可达、代理返回 5xx 是暂时的，
 * 显示可重试的错误 —— 不能因为一次网络抖动把正在工作的人踢出去。
 *
 * 这里刻意不做服务端渲染的重定向：管理后台不需要 SSR，三个发行版共用同一份静态宿主。
 * 布局跨路由不卸载，工作区根挂在这里，页面实例的寿命才不受宿主路由影响；
 * `children` 被刻意忽略，内容一律由工作区宿主渲染。
 */
export default function ProtectedLayout() {
  const t = useT("runtime");
  const describeError = useDescribeError();
  const [session, setSession] = React.useState<SessionResult | null>(null);

  const check = React.useCallback(() => {
    setSession(null);
    fetchSession().then((res) => {
      if (res.state === "anonymous") {
        window.location.href = "/login";
        return;
      }
      setSession(res);
    });
  }, []);
  React.useEffect(check, [check]);

  if (session?.state === "authenticated") {
    return <WorkspaceRoot info={session.info} nav={buildNav(session.info.menus)} />;
  }
  if (session?.state === "unavailable") {
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--background)] px-6 text-center text-sm">
        <div className="font-semibold text-[var(--foreground)]">{t("session.unavailable")}</div>
        <div className="text-xs text-[var(--muted-foreground)]">{describeError(session.error)}</div>
        {session.error.details.requestId && (
          <div className="text-[11px] text-[var(--muted-foreground)]">{t("error.requestId", { id: session.error.details.requestId })}</div>
        )}
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={check} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold">{t("session.retry")}</button>
          <a href="/login" className="rounded-lg px-3 py-1.5 text-xs text-[var(--muted-foreground)]">{t("session.backToLogin")}</a>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">
      {t("session.checking")}
    </div>
  );
}
