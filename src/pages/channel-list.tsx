"use client";
import * as React from "react";
import { ResourcePage, type ResourceRecord } from "@neton/application-front-resource";
import { apiWrite } from "@neton/application-front-runtime/client";
import { useQueryClient } from "@neton/application-front-runtime/client-context";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT, type Translate } from "@neton/application-front-runtime/i18n";

interface ProbeResult { ok: boolean; status?: number | null; latencyMs: number; model: string; upstreamModel: string; upstreamPath: string; error?: string | null; errorCode?: string | null }

/** 目标被出站策略拒绝时后端给机器码（errorCode），按 error.<CODE> 翻译；其余失败显示上游原话。 */
function failureText(r: { error?: string | null; errorCode?: string | null }, t: Translate): string {
  if (r.errorCode) return t.has(`error.${r.errorCode}`) ? t(`error.${r.errorCode}`) : r.errorCode;
  return r.error ?? "—";
}

/**
 * 连通性探测：用渠道自己的协议/代理/Key 打一条最小请求（后端不计费、不记日志、不动 Key 状态）。
 * 结果用 alert 直接摆出来 —— 这是运营配完渠道后的一次性验证动作，不值得为它建一个抽屉。
 */
async function probe(id: number, name: string, describeError: (error: unknown) => string, t: Translate) {
  try {
    const r = await apiWrite<ProbeResult>(`/admin/gateway/channel/probe/${id}`, "POST", {});
    const params = { name, status: r.status ?? t("channel.noResponse"), latencyMs: r.latencyMs, model: r.model, upstreamModel: r.upstreamModel, upstreamPath: r.upstreamPath };
    window.alert(r.ok
      ? t("channel.probe.ok", { ...params, status: String(r.status) })
      : t("channel.probe.failed", { ...params, error: failureText(r, t) }));
  } catch (cause) {
    window.alert(t("channel.probe.requestFailed", { error: describeError(cause) }));
  }
}

/** 手动恢复：渠道重新启用，被自动禁用的 Key 复位（失败计数清零）。手动禁用的 Key 不动。 */
async function revive(row: ResourceRecord, done: () => Promise<void>, describeError: (error: unknown) => string, t: Translate) {
  const name = String(row.name ?? row.id);
  if (!window.confirm(t("channel.revive.confirm", { name }))) return;
  try {
    await apiWrite(`/admin/gateway/channel/revive/${row.id}`, "PUT", {});
    await done();
    window.alert(t("channel.revive.done", { name }));
  } catch (cause) {
    window.alert(t("channel.revive.failed", { error: describeError(cause) }));
  }
}

interface ModelsResult { ok: boolean; status?: number | null; models: string[]; error?: string | null; errorCode?: string | null }

/**
 * 拉取上游模型清单，后端记进渠道的「上游支持的模型」（supportedModels）。只是给模型挑上游时的候选，
 * 不并进服务清单：对外提供哪些模型、由哪个上游承载，在「模型与定价」里按模型设置（docs/model-catalog-design.md）。
 */
async function pullModels(row: ResourceRecord, done: () => Promise<void>, describeError: (error: unknown) => string, t: Translate) {
  const name = String(row.name ?? row.id);
  try {
    const r = await apiWrite<ModelsResult>(`/admin/gateway/channel/models/${row.id}`, "POST", {});
    if (!r.ok) { window.alert(t("channel.pull.failed", { name, status: r.status ?? t("channel.noResponse"), error: failureText(r, t) })); return; }
    await done();
    window.alert(t("channel.models.pulled", { count: r.models.length }));
  } catch (cause) {
    window.alert(t("channel.pull.requestFailed", { error: describeError(cause) }));
  }
}

import { ChannelCostDrawer, type CostChannel } from "./channel-cost-drawer";
import { ChannelKeyDrawer, splitKeys, type KeyChannel } from "./channel-key-drawer";

export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const queryClient = useQueryClient();
  const refresh = React.useCallback(() => queryClient.invalidateQueries({ queryKey: ["gateway-channel"] }), [queryClient]);
  const [costChannel, setCostChannel] = React.useState<CostChannel | null>(null);
  const [keyChannel, setKeyChannel] = React.useState<KeyChannel | null>(null);
  return <><ResourcePage config={{ resourceKey: "gateway-channel",
  rowActions: (row) => ({ primary: [
    // 行内直接摆「Key」和资源页追加的「编辑」（最多两个），其余进「更多」
    { label: t("channel.action.keys"), onClick: () => setKeyChannel(row as unknown as KeyChannel) },
  ], more: [
    { label: t("channel.action.cost"), onClick: () => setCostChannel(row as unknown as CostChannel) },
    { label: t("channel.action.probe"), kind: "retry", onClick: () => { void probe(row.id, String(row.name ?? row.id), describeError, t); } },
    { label: t("channel.action.pullModels"), kind: "download", onClick: () => { void pullModels(row, refresh, describeError, t); } },
    { label: t("channel.action.revive"), kind: "retry", onClick: () => { void revive(row, refresh, describeError, t); } },
  ] }), eyebrow: t("common.eyebrow"), title: t("channel.title"), description: t("channel.description"), endpoint: "/gateway/channel", errorNamespace: "gateway", listPath: "list", permissions: { page: "gateway:channel:query", create: "gateway:channel:create", update: "gateway:channel:update", delete: "gateway:channel:delete" }, fields: [
  { key: "name", label: t("common.field.name"), required: true },
  { key: "type", label: t("channel.field.type"), type: "select", defaultValue: "openai_compatible", options: [
    { label: t("channel.type.openaiCompatible"), value: "openai_compatible" }, { label: "Anthropic", value: "anthropic" },
    { label: "Gemini", value: "gemini" }, { label: "Azure OpenAI", value: "azure_openai" },
    { label: t("channel.type.bedrock"), value: "bedrock" }, { label: t("channel.type.vertexAnthropic"), value: "vertex_anthropic" }, { label: t("channel.type.vertexGemini"), value: "vertex_gemini" } ] },
  { key: "baseUrl", label: "Base URL", required: true },
  // 新建时一并给出初始 Key（可多把）；已有渠道的 Key 在行操作「Key」里增删
  { key: "keys", label: t("channel.field.keys"), type: "textarea", table: false, createOnly: true, placeholder: t("channel.placeholder.keysCreate") },
  { key: "groups", label: t("channel.field.groups"), defaultValue: "default" },
  { key: "models", label: t("channel.field.models"), type: "textarea", placeholder: t("channel.placeholder.models") },
  { key: "supportedModels", label: t("channel.field.supportedModels"), type: "textarea", editable: false, table: false },
  { key: "capabilities", label: t("channel.field.capabilities"), defaultValue: "chat", placeholder: "chat,embeddings,images,rerank,audio" },
  { key: "modelMapping", label: t("channel.field.modelMapping"), type: "textarea", table: false },
  { key: "paramOverride", label: t("channel.field.paramOverride"), type: "textarea", table: false },
  { key: "priority", label: t("channel.field.priority"), type: "number", defaultValue: 0 },
  { key: "weight", label: t("channel.field.weight"), type: "number", defaultValue: 1 },
  { key: "costSource", label: t("channel.field.costSource"), type: "select", defaultValue: "official", options: [
    { label: t("channel.costSource.official"), value: "official" }, { label: t("channel.costSource.upstream"), value: "upstream" }, { label: t("channel.costSource.manual"), value: "manual" } ] },
  { key: "costDiscount", label: t("channel.field.costDiscount"), defaultValue: "1.0" },
  { key: "upstreamPricingFormat", label: t("channel.field.upstreamPricingFormat"), type: "select", table: false, options: [
    { label: t("channel.pricingFormat.none"), value: "" }, { label: t("channel.pricingFormat.newapi"), value: "newapi" }, { label: "OpenRouter", value: "openrouter" } ] },
  { key: "upstreamPricingUrl", label: t("channel.field.upstreamPricingUrl"), table: false, placeholder: t("channel.placeholder.upstreamPricingUrl") },
  { key: "upstreamGroupRatio", label: t("channel.field.upstreamGroupRatio"), table: false, defaultValue: "1" },
  { key: "upstreamCreditRate", label: t("channel.field.upstreamCreditRate"), table: false, defaultValue: "1", placeholder: t("channel.placeholder.upstreamCreditRate") },
  { key: "proxyUrl", label: t("channel.field.proxyUrl"), table: false },
  { key: "apiVersion", label: t("channel.field.apiVersion"), table: false, placeholder: t("channel.placeholder.apiVersion") },
  { key: "providerConfig", label: t("channel.field.providerConfig"), type: "textarea", table: false, placeholder: t("channel.placeholder.providerConfig") },
  { key: "lastProbeMs", label: t("channel.field.lastProbeMs"), type: "number", editable: false },
  { key: "lastProbeOk", label: t("channel.field.lastProbeOk"), type: "select", format: "status", editable: false, options: [ { label: t("channel.probe.reachable"), value: 1 }, { label: t("channel.probe.unreachable"), value: 0 } ] },
  { key: "lastProbeError", label: t("channel.field.lastProbeError"), type: "textarea", editable: false, table: false },
  { key: "status", label: t("common.field.status"), type: "select", defaultValue: 1, format: "status", options: [
    { label: t("common.status.enabled"), value: 1 }, { label: t("common.status.disabled"), value: 0 }, { label: t("common.status.suspended"), value: 2 } ] },
  { key: "remark", label: t("common.field.remark"), type: "textarea", table: false },
 ], mapSave: (record) => {
    // 后端要的是 Key 数组；编辑时 keys 不在表单里（createOnly），原样不带
    if (record.id || record.keys === undefined) return record;
    return { ...record, keys: splitKeys(String(record.keys ?? "")) };
  } }} />
  <ChannelKeyDrawer channel={keyChannel} onClose={() => setKeyChannel(null)} />
  <ChannelCostDrawer channel={costChannel} onClose={() => { setCostChannel(null); void refresh(); }} />
  </>;
}
