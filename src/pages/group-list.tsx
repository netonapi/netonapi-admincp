"use client";
import { ResourcePage } from "@neton/application-front-resource";

/**
 * 计价组：倍率在这里，用户归属在 member。
 *
 * code 是稳定身份（渠道路由、令牌覆盖、计价三处都按它匹配），创建后不可改 ——
 * 后端对带不同 code 的更新回 409，所以下面把它留在可编辑字段里但写进标题提醒；
 * 真改了会拿到一句可操作的原因，不会静默改坏路由。
 * memberGroupId 留空 = 不参与会员组映射。数字输入框清空会得到 0 而不是 null，
 * 而 0 会被当成「映射到 id=0 的会员组」写进库，所以用 mapSave 归一成 null。
 */
export default function Page() { return <ResourcePage config={{ resourceKey: "gateway-group", eyebrow: "GATEWAY", title: "计价组", description: "计费分组与倍率。code 是稳定身份，创建后不可改（改了会被拒）；name 只是显示名。会员组映射留空表示不参与。", endpoint: "/gateway/group", listPath: "list", permissions: { page: "gateway:group:query", create: "gateway:group:create", update: "gateway:group:update", delete: "gateway:group:delete" }, mapSave: (r) => ({ ...r, memberGroupId: Number(r.memberGroupId) > 0 ? Number(r.memberGroupId) : null }), fields: [
  { key: "code", label: "code（创建后不可改）", required: true },
  { key: "name", label: "显示名", required: true },
  { key: "ratio", label: "倍率", defaultValue: "1.0", required: true },
  { key: "memberGroupId", label: "会员组 ID（留空=不映射）", type: "number" },
  { key: "description", label: "说明", type: "textarea", table: false },
] }} />; }
