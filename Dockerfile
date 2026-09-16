# NanoGate 管理台镜像。
#
# 构建上下文与后端镜像相同：**同时含 `Neton/` 与 `NewGate/` 的那一层**（compose 里 `context: ..`）：
#   docker build -f NewGate/newgate-front/Dockerfile -t nanogate-front:latest .
#
# 为什么要复刻宿主布局：apps/shell/package.json 用 `file:../../../../Neton/<repo>` 引 canonical 包，
# 相对路径写死了，镜像内必须让 fork 落在 /src/NewGate/newgate-front、依赖落在同层的 /src/Neton/。
#
# 为什么只 COPY 显式子路径而不 COPY 整个仓：各仓本地都有 85–480M 的 node_modules，而父目录级
# .dockerignore 无法版本化。BuildKit 只同步 COPY 引用到的路径，所以逐个列出 src/package.json
# 就把 node_modules 排除在上下文之外了。需要 BuildKit（Docker ≥ 23 默认启用）。
#
# 未做 `output: "standalone"`：standalone 的文件追踪对 pnpm `file:` 硬链接依赖偶有遗漏，
# 在实机验证前先用完整安装跑 `next start`——镜像大一些，但失败面最小。
FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
ENV NEXT_TELEMETRY_DISABLED=1
# 注意：不要在 install/build 前设 NODE_ENV=production，否则 pnpm 会跳过构建必需的 devDependencies。

# ── canonical 基础包（neton-application-front/packages/*）──
COPY Neton/neton-application-front/packages/front-contract/package.json  /src/Neton/neton-application-front/packages/front-contract/package.json
COPY Neton/neton-application-front/packages/front-contract/src           /src/Neton/neton-application-front/packages/front-contract/src
COPY Neton/neton-application-front/packages/front-kit/package.json       /src/Neton/neton-application-front/packages/front-kit/package.json
COPY Neton/neton-application-front/packages/front-kit/src                /src/Neton/neton-application-front/packages/front-kit/src
COPY Neton/neton-application-front/packages/front-resource/package.json  /src/Neton/neton-application-front/packages/front-resource/package.json
COPY Neton/neton-application-front/packages/front-resource/src           /src/Neton/neton-application-front/packages/front-resource/src
COPY Neton/neton-application-front/packages/front-runtime/package.json   /src/Neton/neton-application-front/packages/front-runtime/package.json
COPY Neton/neton-application-front/packages/front-runtime/src            /src/Neton/neton-application-front/packages/front-runtime/src
COPY Neton/neton-application-front/packages/front-workspace/package.json /src/Neton/neton-application-front/packages/front-workspace/package.json
COPY Neton/neton-application-front/packages/front-workspace/src          /src/Neton/neton-application-front/packages/front-workspace/src

# ── canonical 管理台模块（六个）──
COPY Neton/neton-application-front-gateway/package.json  /src/Neton/neton-application-front-gateway/package.json
COPY Neton/neton-application-front-gateway/tsconfig.json /src/Neton/neton-application-front-gateway/tsconfig.json
COPY Neton/neton-application-front-gateway/src           /src/Neton/neton-application-front-gateway/src
COPY Neton/neton-application-front-infra/package.json    /src/Neton/neton-application-front-infra/package.json
COPY Neton/neton-application-front-infra/tsconfig.json   /src/Neton/neton-application-front-infra/tsconfig.json
COPY Neton/neton-application-front-infra/src             /src/Neton/neton-application-front-infra/src
COPY Neton/neton-application-front-member/package.json   /src/Neton/neton-application-front-member/package.json
COPY Neton/neton-application-front-member/tsconfig.json  /src/Neton/neton-application-front-member/tsconfig.json
COPY Neton/neton-application-front-member/src            /src/Neton/neton-application-front-member/src
COPY Neton/neton-application-front-payment/package.json  /src/Neton/neton-application-front-payment/package.json
COPY Neton/neton-application-front-payment/tsconfig.json /src/Neton/neton-application-front-payment/tsconfig.json
COPY Neton/neton-application-front-payment/src           /src/Neton/neton-application-front-payment/src
COPY Neton/neton-application-front-platform/package.json  /src/Neton/neton-application-front-platform/package.json
COPY Neton/neton-application-front-platform/tsconfig.json /src/Neton/neton-application-front-platform/tsconfig.json
COPY Neton/neton-application-front-platform/src           /src/Neton/neton-application-front-platform/src
COPY Neton/neton-application-front-system/package.json   /src/Neton/neton-application-front-system/package.json
COPY Neton/neton-application-front-system/tsconfig.json  /src/Neton/neton-application-front-system/tsconfig.json
COPY Neton/neton-application-front-system/src            /src/Neton/neton-application-front-system/src

# ── 本仓 ──
WORKDIR /src/NewGate/newgate-front
COPY NewGate/newgate-front/package.json NewGate/newgate-front/pnpm-workspace.yaml NewGate/newgate-front/pnpm-lock.yaml \
     NewGate/newgate-front/tsconfig.base.json NewGate/newgate-front/turbo.json ./
COPY NewGate/newgate-front/scripts ./scripts
COPY NewGate/newgate-front/apps/shell/package.json NewGate/newgate-front/apps/shell/next.config.ts \
     NewGate/newgate-front/apps/shell/front.modules.ts NewGate/newgate-front/apps/shell/postcss.config.mjs \
     NewGate/newgate-front/apps/shell/tsconfig.json ./apps/shell/
COPY NewGate/newgate-front/apps/shell/public ./apps/shell/public
COPY NewGate/newgate-front/apps/shell/src    ./apps/shell/src

# 锁文件与合并后的 package.json 一致时 --frozen-lockfile 才会过；不一致说明本仓漏提交了 lockfile，不是镜像的问题。
RUN pnpm install --frozen-lockfile
# 管理台在浏览器里直连后端，基址由构建期 NEXT_PUBLIC_NETON_BACKEND_URL 决定；留空 = 同源，
# 由边缘反代（deploy/Caddyfile）把 /admin /app /v1 等前缀分流到后端。这是唯一能过 cookie 认证的方式：
# 后端 CORS 硬编码 allowedOrigins=* 且 allowCredentials=false，跨源请求浏览器不会带 cookie。
ARG NEXT_PUBLIC_NETON_BACKEND_URL=
ENV NEXT_PUBLIC_NETON_BACKEND_URL=$NEXT_PUBLIC_NETON_BACKEND_URL
# prebuild 钩子会先跑 scripts/generate-registry.mts 生成 src/generated（该目录不入库）
RUN pnpm --filter @neton/application-front-shell build

WORKDIR /src/NewGate/newgate-front/apps/shell
ENV PORT=3000
EXPOSE 3000
# /api/build-version 由上游合入：读 .next/BUILD_ID，构建成功后必然可用，适合当就绪探针
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/build-version >/dev/null 2>&1 || exit 1
CMD ["pnpm", "exec", "next", "start", "-p", "3000"]
