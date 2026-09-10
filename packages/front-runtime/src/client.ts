"use client";

/**
 * 浏览器侧后端访问。
 *
 * 会话凭据是**后端下发的 HttpOnly Cookie**，不是前端保管的 token：
 * 后台是纯前端应用，token 一旦落进 localStorage，任何一次 XSS 都能读走并带走整个
 * 会话；HttpOnly Cookie 脚本读不到，浏览器自动附带，前端根本不必经手它。
 *
 * 因此这里没有任何「取 token / 存 token」的概念，只有 `credentials: "include"`，
 * 以及「401 就回登录页」。后端同时保留 `Authorization` 头这条路（移动端、服务间
 * 调用），两者互不影响。
 */
import type { Envelope, PermissionInfo } from "./types";

/**
 * 后端基址：构建期注入 `NEXT_PUBLIC_NETON_BACKEND_URL`，缺省同源。
 *
 * 🔴 用 Cookie 之后这个值不能随便改成跨源地址：跨源要携带 Cookie 需要后端配
 * `Access-Control-Allow-Credentials` 且 Cookie 必须 `SameSite=None; Secure`。
 * 当前部署是 nginx 同源反代 `/admin/`，保持同源即可。
 */
export function backendBaseUrl(): string {
  return process.env.NEXT_PUBLIC_NETON_BACKEND_URL ?? "";
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  window.location.href = "/login";
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("unauthorized");
  }
  const body = (await res.json()) as Envelope<T>;
  if (body.code !== 0) throw new Error(body.message || `请求失败(code=${body.code})`);
  return body.data as T;
}

export function apiWrite<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  data?: unknown,
): Promise<T> {
  return apiFetch<T>(path, {
    method,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

/**
 * 会话快照。进入受保护区时取一次，之后页面切换只读这份快照，不再打后端。
 *
 * 它同时充当会话守卫：拿得到就是已登录，401 就是没登录 —— 前端不再需要
 * 「本地有没有 token」这种它其实答不准的判断。
 */
export async function fetchSession(): Promise<Envelope<PermissionInfo>> {
  try {
    const res = await fetch(`${backendBaseUrl()}/admin/system/auth/get-permission-info`, {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) return { code: 401, message: "unauthorized" };
    return (await res.json()) as Envelope<PermissionInfo>;
  } catch {
    return { code: -1, message: "backend unreachable" };
  }
}

/** 登录：成功后会话 Cookie 由后端下发，前端不接触 token。 */
export async function login(username: string, password: string): Promise<Envelope<unknown>> {
  const res = await fetch(`${backendBaseUrl()}/admin/system/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  return (await res.json()) as Envelope<unknown>;
}

/** 退出：后端清 Cookie。即使请求失败也要回登录页，避免停在一个操作不了的界面。 */
export async function logout(): Promise<void> {
  try {
    await fetch(`${backendBaseUrl()}/admin/system/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } finally {
    redirectToLogin();
  }
}
