"use client";

import * as React from "react";
import { useT } from "@neton/application-front-runtime/i18n";
import { useServiceHealth } from "@neton/application-front-runtime/health";

/** 服务状态徽标：以后端就绪探针为准，不写死「正常」。 */
export function ServiceStatus({ detail = false, className }: { detail?: boolean; className?: string }) {
  const t = useT("shell");
  const health = useServiceHealth();
  const dot = health === "ready" ? "bg-emerald-500" : health === "degraded" ? "bg-amber-500" : "bg-zinc-400";
  const label = health === "ready" ? t("status.ready") : health === "degraded" ? t("status.degraded") : t("status.checking");
  return (
    <span role="status" className={className ?? "flex items-center gap-2"}>
      <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <span>
        <span className="block">{label}</span>
        {detail && health !== "checking" && (
          <span className="mt-0.5 block text-[11px] text-[var(--muted-foreground)]">
            {health === "ready" ? t("status.readyDetail") : t("status.degradedDetail")}
          </span>
        )}
      </span>
    </span>
  );
}
