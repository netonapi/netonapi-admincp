"use client";
import * as React from "react";
import { ResourcePage, type ResourceRecord } from "@neton/application-front-resource";
import { apiWrite } from "@neton/application-front-runtime/client";
import { useQueryClient } from "@neton/application-front-runtime/client-context";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT, type Translate } from "@neton/application-front-runtime/i18n";

interface ProbeResult { ok: boolean; status?: number | null; latencyMs: number; model: string; upstreamModel: string; upstreamPath: string; error?: string | null }

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
      : t("channel.probe.failed", { ...params, error: r.error ?? "—" }));
  } catch (cause) {
    window.alert(t("channel.probe.requestFailed", { error: describeError(cause) }));
  }
}

interface ModelsResult { ok: boolean; status?: number | null; models: string[]; error?: string | null }

/**
 * 拉取上游模型清单并并入渠道的 models：新增的追加在后面，已有的保持原顺序。
 * 一步确认再写库 —— 上游列出来的往往包含大量用不上的模型（embedding、旧版本、微调号），
 * 全量覆盖会把运营精心挑过的清单冲掉，所以只做「并入」，删由运营手动编辑。
 */
async function pullModels(row: ResourceRecord, done: () => Promise<void>, describeError: (error: unknown) => string, t: Translate) {
  const name = String(row.name ?? row.id);
  try {
    const r = await apiWrite<ModelsResult>(`/admin/gateway/channel/models/${row.id}`, "POST", {});
    if (!r.ok) { window.alert(t("channel.pull.failed", { name, status: r.status ?? t("channel.noResponse"), error: r.error ?? "—" })); return; }
    const current = String(row.models ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    const fresh = r.models.filter((m) => !current.includes(m));
    if (fresh.length === 0) { window.alert(t("channel.pull.upToDate", { name, count: r.models.length })); return; }
    const preview = fresh.slice(0, 40).join("\n") + (fresh.length > 40 ? `\n${t("channel.pull.more", { count: fresh.length })}` : "");
    if (!window.confirm(t("channel.pull.confirm", { name, count: fresh.length, preview }))) return;
    // 只发 UpdateChannelRequest 认识的字段：后端 @Body 对未知键直接 400，整行连 status/createdAt 一起发会被拒
    const keep = ["id", "name", "type", "baseUrl", "groups", "capabilities", "modelMapping", "paramOverride", "priority", "weight", "proxyUrl", "apiVersion", "costDiscount", "remark"] as const;
    const body: Record<string, unknown> = {};
    for (const k of keep) if (row[k] !== undefined) body[k] = row[k];
    body.models = [...current, ...fresh].join(",");
    await apiWrite("/admin/gateway/channel/update", "PUT", body);
    await done();
  } catch (cause) {
    window.alert(t("channel.pull.requestFailed", { error: describeError(cause) }));
  }
}

export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const queryClient = useQueryClient();
  const refresh = React.useCallback(() => queryClient.invalidateQueries({ queryKey: ["gateway-channel"] }), [queryClient]);
  return <ResourcePage config={{ resourceKey: "gateway-channel",
  rowActions: (row) => ({ more: [
    { label: t("channel.action.probe"), kind: "retry", onClick: () => { void probe(row.id, String(row.name ?? row.id), describeError, t); } },
    { label: t("channel.action.pullModels"), kind: "download", onClick: () => { void pullModels(row, refresh, describeError, t); } },
  ] }), eyebrow: t("common.eyebrow"), title: t("channel.title"), description: t("channel.description"), endpoint: "/gateway/channel", errorNamespace: "gateway", listPath: "list", permissions: { page: "gateway:channel:query", create: "gateway:channel:create", update: "gateway:channel:update", delete: "gateway:channel:delete" }, fields: [
  { key: "name", label: t("common.field.name"), required: true },
  { key: "type", label: t("channel.field.type"), type: "select", defaultValue: "openai_compatible", options: [
    { label: t("channel.type.openaiCompatible"), value: "openai_compatible" }, { label: "Anthropic", value: "anthropic" },
    { label: "Gemini", value: "gemini" }, { label: "Azure OpenAI", value: "azure_openai" },
    { label: t("channel.type.bedrock"), value: "bedrock" }, { label: t("channel.type.vertexAnthropic"), value: "vertex_anthropic" }, { label: t("channel.type.vertexGemini"), value: "vertex_gemini" } ] },
  { key: "baseUrl", label: "Base URL", required: true },
  { key: "groups", label: t("channel.field.groups"), defaultValue: "default" },
  { key: "models", label: t("channel.field.models"), type: "textarea" },
  { key: "capabilities", label: t("channel.field.capabilities"), defaultValue: "chat", placeholder: "chat,embeddings,images,rerank,audio" },
  { key: "modelMapping", label: t("channel.field.modelMapping"), type: "textarea", table: false },
  { key: "paramOverride", label: t("channel.field.paramOverride"), type: "textarea", table: false },
  { key: "priority", label: t("channel.field.priority"), type: "number", defaultValue: 0 },
  { key: "weight", label: t("channel.field.weight"), type: "number", defaultValue: 1 },
  { key: "costDiscount", label: t("channel.field.costDiscount"), defaultValue: "1.0" },
  { key: "proxyUrl", label: t("channel.field.proxyUrl"), table: false },
  { key: "apiVersion", label: t("channel.field.apiVersion"), table: false, placeholder: t("channel.placeholder.apiVersion") },
  { key: "providerConfig", label: t("channel.field.providerConfig"), type: "textarea", table: false, placeholder: t("channel.placeholder.providerConfig") },
  { key: "lastProbeMs", label: t("channel.field.lastProbeMs"), type: "number", editable: false },
  { key: "lastProbeOk", label: t("channel.field.lastProbeOk"), type: "select", format: "status", editable: false, options: [ { label: t("channel.probe.reachable"), value: 1 }, { label: t("channel.probe.unreachable"), value: 0 } ] },
  { key: "lastProbeError", label: t("channel.field.lastProbeError"), type: "textarea", editable: false, table: false },
  { key: "status", label: t("common.field.status"), type: "select", defaultValue: 1, format: "status", options: [
    { label: t("common.status.enabled"), value: 1 }, { label: t("common.status.disabled"), value: 0 }, { label: t("common.status.suspended"), value: 2 } ] },
  { key: "remark", label: t("common.field.remark"), type: "textarea", table: false },
] }} />;
}
