# NetonAPI 管理台

NetonAPI 运营侧前端（仓库 `netonapi/netonapi-frontend`，本地目录同名）：渠道、模型定价、
令牌、用户、结算与审计的后台。React 19 + Next.js 16 App Router，pnpm workspace，BFF 代理模式。

后端是 [`netonapi-backend`](https://github.com/netonapi/netonapi-backend)（默认
`http://localhost:8800`（开发模式下 `next.config.ts` 把 `/admin` `/app` `/v1` 等路由组重写到它，管理台与 API 同源，不需要 Caddy））；部署与密钥说明见 `nanogate` 仓的
[`DEPLOY.md`](https://github.com/zoujiaqing/nanogate/blob/main/DEPLOY.md)。

| | |
|---|---|
| 前端 | React 19.2 · Next.js 16（App Router）· Tailwind 4 · TanStack Query 5 |
| 包管理 | pnpm workspace（`apps/*` + `packages/*`），lockfile 已提交 |
| 语言 | TypeScript 5.7（`tsc --noEmit` 为门禁） |
| 开发端口 | `3000`（Next.js 默认，`next dev` 未带 `-p`） |
| 许可 | [Apache-2.0](./LICENSE) |

## 结构

- `apps/shell`（`@neton/application-front-shell`）—— Next.js 壳：登录、后端菜单驱动的导航、
  受保护的 catch-all 路由 `(protected)/[...slug]`
- `packages/front-contract` —— 模块契约（manifest / 贡献点 / 版本协议）
- `packages/front-runtime` —— envelope HTTP client、会话、菜单树、权限
- `packages/front-kit` —— UI 组件的唯一属地（shadcn / Base UI 只进这里）
- `packages/front-resource` —— 通用 CRUD 资源渲染器：声明字段（`ResourceField[]`）就得到
  列表 / 筛选 / 抽屉表单页，数据走 envelope API

业务页面不在本仓：它们由 canonical 的前端模块仓提供，`apps/shell` 只做装配；
`front-resource` 提供的是这些页面共用的通用 CRUD 渲染器。

## 模块装配

`apps/shell/front.modules.ts` 是装配清单的唯一来源（对标服务端的 `ksp neton.modules`），
`scripts/generate-registry.mts` 据此生成 `src/generated/` 下的页面注册表：

```
@neton/application-front-{system,gateway,infra,member,payment,platform}
```

六个模块都以 `file:../../../../Neton/neton-application-front-*` 引入，所以本仓必须正好落在
持有 `Neton/` 的那层目录的**两层深处**：

```
projects/
├── Neton/
│   └── neton-application-front-{system,gateway,infra,member,payment,platform}/
└── <workspace>/
    ├── netonapi-backend/   # 后端
    └── netonapi-frontend/  # ← 本仓
```

> ⚠️ **现在从干净 clone 出发装不起来。** 六个模块仓里
> `neton-application-front-gateway`、`-member`、`-payment`、`-platform` 目前是私有仓
> （`-system`、`-infra` 是公开的）。没有那四个仓的读权限，`pnpm install` 会在解析 `file:`
> 依赖时失败。在它们转公开之前，公开本仓只意味着「源码可读」，不意味着「人人可自建」。
> 其中 `front-gateway` 才是 NetonAPI 的运营页面所在。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm registry      # 由 front.modules.ts 生成页面注册表（predev / prebuild 会自动跑）
pnpm dev           # http://localhost:3000，后端地址用 NETON_BACKEND_URL 覆盖
pnpm typecheck     # 先 registry 再 tsc --noEmit
pnpm build
```

两个坑，都踩过：

- **`allowBuilds`**：`pnpm-workspace.yaml` 必须放行 `esbuild`（`pnpm registry` 走 tsx）与
  `sharp`（Next 图片优化）的 postinstall。留着脚手架占位文本，pnpm 11 会报
  `ERR_PNPM_IGNORED_BUILDS` 并以 exit 1 结束 install——CI 第一步就红。
- **`file:` 依赖是拷贝进 store 的**：`node_modules/.pnpm/…@file+…` 里是一份副本，
  拉完 canonical 模块仓的新提交后必须重装（`pnpm install`）才看得到变化，否则你会在旧代码上调试。

## 认证与代理

浏览器**拿不到** JWT：

1. `POST /api/auth/login` → 转发到后端 `/admin/system/auth/login`，把 `accessToken` 写成
   HttpOnly + `SameSite=Lax` 的 Cookie（`secure` 仅在 `NODE_ENV=production` 下打开），
   `maxAge` 取自后端返回的 `expiresTime`（下限 60s，兜底 8h）。
2. 所有业务请求走 `/api/backend/<path>`，由 Next 服务端取出 Cookie、加
   `Authorization: Bearer …` 后转发到 `NETON_BACKEND_URL`（`cache: no-store`，
   原样回传上游的状态码与 content-type）。没有 Cookie 时代理直接回 401，不去打扰后端。

后端 CORS 是硬编码的 `*`（`allowCredentials = false`），所以别指望用跨站页面直连后端绕过这层代理。

## 许可

Apache-2.0 —— 见 [LICENSE](./LICENSE)。
