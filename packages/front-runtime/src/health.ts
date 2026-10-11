"use client";

import * as React from "react";
import { backendBaseUrl } from "./client";

export type ServiceHealth = "checking" | "ready" | "degraded";

/**
 * 后端就绪状态，来自 `/admin/system/health/ready` 的实际探测（数据库、Redis）。
 * 界面上的「服务正常」只能以它为准，不能写死（评审 R13）。页面不可见时不轮询。
 */
export function useServiceHealth(intervalMs = 60_000): ServiceHealth {
  const [health, setHealth] = React.useState<ServiceHealth>("checking");
  React.useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`${backendBaseUrl()}/admin/system/health/ready`, { cache: "no-store" })
        .then((res) => { if (!cancelled) setHealth(res.ok ? "ready" : "degraded"); })
        .catch(() => { if (!cancelled) setHealth("degraded"); });
    };
    check();
    const timer = setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", check);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [intervalMs]);
  return health;
}
