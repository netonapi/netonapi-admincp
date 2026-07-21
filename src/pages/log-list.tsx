"use client";
import { ResourcePage } from "@neton/application-front-resource";
export default function Page() { return <ResourcePage config={{ resourceKey: "gateway-log", eyebrow: "GATEWAY", title: "用量日志", description: "逐请求用量与收入/成本（μUSD）。", endpoint: "/gateway/log", listPath: "page", permissions: { page: "gateway:log:list" }, fields: [
  { key: "userId", label: "用户", type: "number" },
  { key: "requestModel", label: "请求模型" },
  { key: "upstreamModel", label: "上游模型" },
  { key: "channelId", label: "渠道", type: "number" },
  { key: "promptTokens", label: "输入 tokens", type: "number" },
  { key: "completionTokens", label: "输出 tokens", type: "number" },
  { key: "charged", label: "收入 μUSD", type: "number" },
  { key: "cost", label: "成本 μUSD", type: "number" },
  { key: "stream", label: "流式", type: "select", format: "status", options: [ { label: "是", value: 1 }, { label: "否", value: 0 } ] },
  { key: "status", label: "状态" },
  { key: "createdAt", label: "时间", format: "date" },
] }} />; }
