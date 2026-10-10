/**
 * 发行版模块装配清单 —— 对标服务端 ksp neton.modules（spec §4）。
 *
 * 不装 front-platform（开放平台）：它的 API 管理 / 客户端 / 计费记录 / 调用日志 / 统计分析
 * 与 AI 网关是同一件事的两套实现，并排放着只会让运营不知道该查哪个「调用日志」。
 * 按 ENGINEERING_RULES §6.3「删除目录、API、菜单和依赖，而不是只隐藏入口」摘掉依赖，
 * 对应的菜单行由 module-gateway 的 V012 迁移停用。后端 module-platform 仍在装配里
 * （/platform/order 是它的对外订单接口），只是管理台不再提供它的页面。
 */
export default [
  "@neton/application-front-system",
  "@neton/application-front-gateway",
  "@neton/application-front-infra",
  "@neton/application-front-account",
  "@neton/application-front-member",
  "@neton/application-front-payment",
];
