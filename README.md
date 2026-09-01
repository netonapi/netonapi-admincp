# neton-application-front

通用后台前端 base distribution（React 19 + Next.js 16 App Router），对标服务端
`neton-application` 的 distribution fork 模型。规范见
`privchat-docs/spec/07-application/NETON_APPLICATION_FRONT_SPEC.md`。

- `apps/shell` — Next.js 壳：登录（HttpOnly Cookie）、后端菜单驱动导航、受保护 catch-all 路由
- `packages/front-contract` — 模块契约（manifest / 贡献点 / 版本协议）
- `packages/front-runtime` — envelope HTTP client、会话、菜单树、权限
- `packages/front-kit` — UI 组件唯一属地（shadcn/Base UI 只进这里）
- `packages/front-module-system` — 内置 system 模块（对标服务端 in-tree module-system）

```bash
pnpm install
pnpm registry   # 由 apps/shell/front.modules.ts 生成页面注册表（prebuild 自动跑）
pnpm dev        # NETON_BACKEND_URL 默认 http://localhost:7080
```
