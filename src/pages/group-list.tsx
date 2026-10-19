"use client";
import { ResourcePage } from "@neton/application-front-resource";
import { useT } from "@neton/application-front-runtime/i18n";

/**
 * 计价组：倍率在这里，用户归属在 member。
 *
 * code 是稳定身份（渠道路由、令牌覆盖、计价三处都按它匹配），创建后不可改 ——
 * 后端对带不同 code 的更新回 409，所以下面把它留在可编辑字段里但写进标题提醒；
 * 真改了会拿到 GROUP_CODE_IMMUTABLE（按 error.* 词条翻译），不会静默改坏路由。
 * memberGroupId 留空 = 不参与会员组映射。数字输入框清空会得到 0 而不是 null，
 * 而 0 会被当成「映射到 id=0 的会员组」写进库，所以用 mapSave 归一成 null。
 */
export default function Page() {
  const t = useT("gateway");
  return <ResourcePage config={{ resourceKey: "gateway-group", eyebrow: t("common.eyebrow"), title: t("group.title"), description: t("group.description"), endpoint: "/gateway/group", errorNamespace: "gateway", listPath: "list", permissions: { page: "gateway:group:query", create: "gateway:group:create", update: "gateway:group:update", delete: "gateway:group:delete" }, mapSave: (r) => ({ ...r, memberGroupId: Number(r.memberGroupId) > 0 ? Number(r.memberGroupId) : null }), fields: [
  { key: "code", label: t("group.field.code"), required: true },
  { key: "name", label: t("group.field.name"), required: true },
  { key: "ratio", label: t("group.field.ratio"), defaultValue: "1.0", required: true },
  { key: "memberGroupId", label: t("group.field.memberGroupId"), type: "number" },
  { key: "description", label: t("group.field.description"), type: "textarea", table: false },
] }} />; }
