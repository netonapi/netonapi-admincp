import type { NextConfig } from "next";
import frontModules from "./front.modules";

/**
 * 本机开发不经 Caddy：管理台靠 cookie 且后端 CORS 不带凭据，所以 API 必须同源。
 * 开发模式下把后端路由组重写到本机后端（默认 8800），生产镜像仍由 Caddy 分流，这里不生效。
 */
const devBackend = process.env.NETON_DEV_BACKEND_URL ?? "http://localhost:8800";
const backendGroups = ["admin", "app", "manage", "platform", "v1", "v1beta", "health"];

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return backendGroups.map((g) => ({ source: `/${g}/:path*`, destination: `${devBackend}/${g}/:path*` }));
  },
  transpilePackages: [
    "@neton/application-front-contract",
    "@neton/application-front-workspace",
    "@neton/application-front-runtime",
    "@neton/application-front-kit",
    "@neton/application-front-resource",
    ...frontModules,
  ],
};

export default config;
