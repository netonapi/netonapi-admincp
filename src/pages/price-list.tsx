"use client";
import { ResourcePage } from "@neton/application-front-resource";
export default function Page() { return <ResourcePage config={{ resourceKey: "gateway-price", eyebrow: "GATEWAY", title: "模型定价", description: "官方价（USD/1M tokens）与售价覆盖；变更即时生效。", endpoint: "/gateway/price", listPath: "list", permissions: { page: "gateway:price:list", create: "gateway:price:create", update: "gateway:price:update", delete: "gateway:price:delete" }, fields: [
  { key: "model", label: "模型", required: true },
  { key: "inputPrice", label: "输入价", defaultValue: "0", required: true },
  { key: "outputPrice", label: "输出价", defaultValue: "0", required: true },
  { key: "cacheReadPrice", label: "缓存读", defaultValue: "0" },
  { key: "cacheWritePrice", label: "缓存写", defaultValue: "0" },
  { key: "perRequestPrice", label: "按次(μUSD)", type: "number", table: false },
  { key: "defaultMaxOutputTokens", label: "默认输出上限", type: "number", table: false },
  { key: "source", label: "价源" },
] }} />; }
