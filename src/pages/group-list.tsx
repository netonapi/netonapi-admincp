"use client";
import * as React from "react";
import { ResourcePage, type ResourceField } from "@neton/application-front-resource";
import { apiFetch } from "@neton/application-front-runtime/client";
import { useT } from "@neton/application-front-runtime/i18n";

/**
 * 计价组：一把 API Key 绑一个分组，分组决定走哪些渠道、按什么倍率计价。
 * 「用户可选」的分组所有用户建 Key 时都能选；不开放的只给运营单独开给的用户（用户专属分组 / 会员组映射）。
 *
 * code 是稳定身份（渠道路由、令牌覆盖、计价三处都按它匹配），创建后不可改 ——
 * 后端对带不同 code 的更新回 409，所以下面把它留在可编辑字段里但写进标题提醒；
 * 真改了会拿到 GROUP_CODE_IMMUTABLE（按 error.* 词条翻译），不会静默改坏路由。
 * memberGroupId 留空 = 不参与会员组映射。数字输入框清空会得到 0 而不是 null，
 * 而 0 会被当成「映射到 id=0 的会员组」写进库，所以用 mapSave 归一成 null。
 *
 * 会员组用下拉框选（拉 member 的会员组列表）：手填 id 容易填错，而填错的后果是那批会员按错误的倍率扣费。
 * 拉不到列表（没装 member 模块、或没有 member:group:query 权限）就退回数字输入。
 */
export default function Page() {
  const t = useT("gateway");
  const [memberGroups, setMemberGroups] = React.useState<{ id: number; name: string }[] | null>(null);
  React.useEffect(() => {
    apiFetch<{ id: number; name: string }[]>("/admin/member/group/list-all-simple").then(setMemberGroups).catch(() => setMemberGroups(null));
  }, []);
  const memberField: ResourceField = memberGroups && memberGroups.length > 0
    ? { key: "memberGroupId", label: t("group.field.memberGroupId"), type: "select", options: [{ label: t("group.option.noMemberGroup"), value: "" }, ...memberGroups.map((g) => ({ label: `${g.name} (#${g.id})`, value: g.id }))] }
    : { key: "memberGroupId", label: t("group.field.memberGroupId"), type: "number" };
  return <ResourcePage config={{ resourceKey: "gateway-group", eyebrow: t("common.eyebrow"), title: t("group.title"), description: t("group.description"), endpoint: "/gateway/group", errorNamespace: "gateway", listPath: "list", permissions: { page: "gateway:group:query", create: "gateway:group:create", update: "gateway:group:update", delete: "gateway:group:delete" }, mapSave: (r) => ({ ...r, memberGroupId: Number(r.memberGroupId) > 0 ? Number(r.memberGroupId) : null, selectable: Number(r.selectable) === 1 ? 1 : 0 }), fields: [
  { key: "code", label: t("group.field.code"), required: true },
  { key: "name", label: t("group.field.name"), required: true },
  { key: "ratio", label: t("group.field.ratio"), defaultValue: "1.0", required: true },
  { key: "selectable", label: t("group.field.selectable"), type: "select", defaultValue: 0, options: [{ label: t("group.selectable.yes"), value: 1 }, { label: t("group.selectable.no"), value: 0 }] },
  memberField,
  { key: "description", label: t("group.field.description"), type: "textarea", table: false, placeholder: t("group.placeholder.description") },
] }} />; }
