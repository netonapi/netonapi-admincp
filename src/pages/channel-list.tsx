"use client";
import * as React from "react";
import { ResourcePage, type ResourceRecord } from "@neton/application-front-resource";
import { apiWrite } from "@neton/application-front-runtime/client";
import { useQueryClient } from "@neton/application-front-runtime/client-context";

interface ProbeResult { ok: boolean; status?: number | null; latencyMs: number; model: string; upstreamModel: string; upstreamPath: string; error?: string | null }

/**
 * 连通性探测：用渠道自己的协议/代理/Key 打一条最小请求（后端不计费、不记日志、不动 Key 状态）。
 * 结果用 alert 直接摆出来 —— 这是运营配完渠道后的一次性验证动作，不值得为它建一个抽屉。
 */
async function probe(id: number, name: string) {
  try {
    const r = await apiWrite<ProbeResult>(`/admin/gateway/channel/probe/${id}`, "POST", {});
    window.alert(r.ok
      ? `渠道「${name}」连通：HTTP ${r.status}，${r.latencyMs} ms\n模型 ${r.model} → 上游 ${r.upstreamModel}\n路径 ${r.upstreamPath}`
      : `渠道「${name}」探测失败：HTTP ${r.status ?? "无响应"}，${r.latencyMs} ms\n模型 ${r.model} → 上游 ${r.upstreamModel}\n路径 ${r.upstreamPath}\n\n上游原话：${r.error ?? "—"}`);
  } catch (cause) {
    window.alert(`探测请求失败：${(cause as Error).message}`);
  }
}

interface ModelsResult { ok: boolean; status?: number | null; models: string[]; error?: string | null }

/**
 * 拉取上游模型清单并并入渠道的 models：新增的追加在后面，已有的保持原顺序。
 * 一步确认再写库 —— 上游列出来的往往包含大量用不上的模型（embedding、旧版本、微调号），
 * 全量覆盖会把运营精心挑过的清单冲掉，所以只做「并入」，删由运营手动编辑。
 */
async function pullModels(row: ResourceRecord, done: () => Promise<void>) {
  const name = String(row.name ?? row.id);
  try {
    const r = await apiWrite<ModelsResult>(`/admin/gateway/channel/models/${row.id}`, "POST", {});
    if (!r.ok) { window.alert(`渠道「${name}」拉取模型失败：HTTP ${r.status ?? "无响应"}\n\n${r.error ?? "—"}\n\n很多 OpenAI 兼容站不实现 /v1/models，此时请手动填写模型清单。`); return; }
    const current = String(row.models ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    const fresh = r.models.filter((m) => !current.includes(m));
    if (fresh.length === 0) { window.alert(`渠道「${name}」上游共 ${r.models.length} 个模型，清单里都已经有了。`); return; }
    const preview = fresh.slice(0, 40).join("\n") + (fresh.length > 40 ? `\n… 共 ${fresh.length} 个` : "");
    if (!window.confirm(`渠道「${name}」上游有 ${fresh.length} 个清单里没有的模型：\n\n${preview}\n\n全部并入该渠道的模型清单？（已有的保持不变，不需要的之后可在编辑里删掉）`)) return;
    // 只发 UpdateChannelRequest 认识的字段：后端 @Body 对未知键直接 400，整行连 status/createdAt 一起发会被拒
    const keep = ["id", "name", "type", "baseUrl", "groups", "capabilities", "modelMapping", "paramOverride", "priority", "weight", "proxyUrl", "apiVersion", "costDiscount", "remark"] as const;
    const body: Record<string, unknown> = {};
    for (const k of keep) if (row[k] !== undefined) body[k] = row[k];
    body.models = [...current, ...fresh].join(",");
    await apiWrite("/admin/gateway/channel/update", "PUT", body);
    await done();
  } catch (cause) {
    window.alert(`拉取模型失败：${(cause as Error).message}`);
  }
}

export default function Page() {
  const queryClient = useQueryClient();
  const refresh = React.useCallback(() => queryClient.invalidateQueries({ queryKey: ["gateway-channel"] }), [queryClient]);
  return <ResourcePage config={{ resourceKey: "gateway-channel",
  rowActions: (row) => ({ more: [
    { label: "测试连通", kind: "retry", onClick: () => { void probe(row.id, String(row.name ?? row.id)); } },
    { label: "拉取模型", kind: "download", onClick: () => { void pullModels(row, refresh); } },
  ] }), eyebrow: "GATEWAY", title: "上游渠道", description: "LLM 上游渠道：类型、分组、模型清单、端点能力、权重与成本折扣。", endpoint: "/gateway/channel", listPath: "list", permissions: { page: "gateway:channel:list", create: "gateway:channel:create", update: "gateway:channel:update", delete: "gateway:channel:delete" }, fields: [
  { key: "name", label: "名称", required: true },
  { key: "type", label: "类型", type: "select", defaultValue: "openai_compatible", options: [
    { label: "OpenAI 兼容", value: "openai_compatible" }, { label: "Anthropic", value: "anthropic" },
    { label: "Gemini", value: "gemini" }, { label: "Azure OpenAI", value: "azure_openai" },
    { label: "AWS Bedrock（Anthropic 模型）", value: "bedrock" }, { label: "Vertex AI（Anthropic 模型）", value: "vertex_anthropic" }, { label: "Vertex AI（Gemini）", value: "vertex_gemini" } ] },
  { key: "baseUrl", label: "Base URL", required: true },
  { key: "groups", label: "分组", defaultValue: "default" },
  { key: "models", label: "模型清单(逗号分隔)", type: "textarea" },
  { key: "capabilities", label: "端点能力(逗号分隔)", defaultValue: "chat", placeholder: "chat,embeddings,images,rerank,audio" },
  { key: "modelMapping", label: "模型映射 JSON", type: "textarea", table: false },
  { key: "paramOverride", label: "参数覆盖 JSON", type: "textarea", table: false },
  { key: "priority", label: "优先级", type: "number", defaultValue: 0 },
  { key: "weight", label: "权重", type: "number", defaultValue: 1 },
  { key: "costDiscount", label: "成本折扣", defaultValue: "1.0" },
  { key: "proxyUrl", label: "代理", table: false },
  { key: "apiVersion", label: "API 版本（仅 Azure）", table: false, placeholder: "2024-10-21，留空用默认；部署名取模型映射的目标名" },
  { key: "providerConfig", label: "厂商参数 JSON（Vertex 必填）", type: "textarea", table: false, placeholder: "Vertex: {\"project\":\"my-gcp-project\",\"location\":\"us-east5\"}；Bedrock 可留空（region 从 Base URL 推）" },
  { key: "lastProbeMs", label: "测速(ms)", type: "number", editable: false },
  { key: "lastProbeOk", label: "测速结果", type: "select", format: "status", editable: false, options: [ { label: "通", value: 1 }, { label: "不通", value: 0 } ] },
  { key: "lastProbeError", label: "最近失败原因", type: "textarea", editable: false, table: false },
  { key: "status", label: "状态", type: "select", defaultValue: 1, format: "status", options: [
    { label: "启用", value: 1 }, { label: "禁用", value: 0 }, { label: "自动挂起", value: 2 } ] },
  { key: "remark", label: "备注", type: "textarea", table: false },
] }} />;
}
