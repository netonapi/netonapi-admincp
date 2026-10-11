"use client";

import * as React from "react";
import { useT } from "@neton/application-front-runtime/i18n";

const CHECK_INTERVAL_MS = 30_000;

type BuildVersionResponse = { version?: string };

async function fetchBuildVersion(signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(`/api/build-version?_=${Date.now()}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as BuildVersionResponse;
    return body.version?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 已打开的后台不会随发布自动换掉内存中的 JS。定时比较服务器 BUILD_ID，发现
 * 新发行版后阻止继续操作，避免旧页面引用已被替换的模块资源而永久停在加载态。
 */
export function BuildUpdateGuard() {
  const t = useT("shell");
  const initialVersion = React.useRef<string | null>(null);
  const checking = React.useRef(false);
  const [updateAvailable, setUpdateAvailable] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();

    const check = async () => {
      if (checking.current || controller.signal.aborted) return;
      checking.current = true;
      const current = await fetchBuildVersion(controller.signal);
      checking.current = false;
      if (!current || controller.signal.aborted) return;
      if (initialVersion.current === null) {
        initialVersion.current = current;
        return;
      }
      if (current !== initialVersion.current) setUpdateAvailable(true);
    };

    void check();
    const timer = window.setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="system-update-title"
        aria-describedby="system-update-description"
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--foreground)] shadow-2xl"
      >
        <div id="system-update-title" className="text-lg font-semibold">{t("update.title")}</div>
        <p id="system-update-description" className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {t("update.body")}
        </p>
        <button
          type="button"
          autoFocus
          className="mt-6 h-10 w-full rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          onClick={() => window.location.reload()}
        >
          {t("update.reload")}
        </button>
      </div>
    </div>
  );
}
