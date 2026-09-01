"use client";
import { ResourcePage } from "@neton/application-front-resource";
export default function Page() { return <ResourcePage config={{ resourceKey: "gateway-channel", eyebrow: "GATEWAY", title: "上游渠道", description: "LLM 上游渠道：类型、分组、模型清单、端点能力、权重与成本折扣。", endpoint: "/gateway/channel", listPath: "list", permissions: { page: "gateway:channel:list", create: "gateway:channel:create", update: "gateway:channel:update", delete: "gateway:channel:delete" }, fields: [
  { key: "name", label: "名称", required: true },
  { key: "type", label: "类型", type: "select", defaultValue: "openai_compatible", options: [
    { label: "OpenAI 兼容", value: "openai_compatible" }, { label: "Anthropic", value: "anthropic" },
    { label: "Gemini", value: "gemini" }, { label: "Azure OpenAI", value: "azure_openai" } ] },
  { key: "baseUrl", label: "Base URL", required: true },
  { key: "groups", label: "分组", defaultValue: "default" },
  { key: "models", label: "模型清单(逗号分隔)", type: "textarea" },
  { key: "capabilities", label: "端点能力(逗号分隔)", defaultValue: "chat", placeholder: "chat,embeddings" },
  { key: "modelMapping", label: "模型映射 JSON", type: "textarea", table: false },
  { key: "paramOverride", label: "参数覆盖 JSON", type: "textarea", table: false },
  { key: "priority", label: "优先级", type: "number", defaultValue: 0 },
  { key: "weight", label: "权重", type: "number", defaultValue: 1 },
  { key: "costDiscount", label: "成本折扣", defaultValue: "1.0" },
  { key: "proxyUrl", label: "代理", table: false },
  { key: "status", label: "状态", type: "select", defaultValue: 1, format: "status", options: [
    { label: "启用", value: 1 }, { label: "禁用", value: 0 }, { label: "自动挂起", value: 2 } ] },
  { key: "remark", label: "备注", type: "textarea", table: false },
] }} />; }
