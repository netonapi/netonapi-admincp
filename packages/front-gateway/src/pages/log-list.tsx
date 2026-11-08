"use client";

import { ResourcePage } from "@neton/application-front-resource";
import { useT } from "@neton/application-front-runtime/i18n";

export default function Page() {
  const t = useT("gateway");
  return <ResourcePage config={{ resourceKey: "gateway-log", eyebrow: t("common.eyebrow"), title: t("log.title"), description: t("log.description"), endpoint: "/gateway/log", errorNamespace: "gateway", listPath: "page", permissions: { page: "gateway:log:query" }, fields: [
      { key: "userId", label: t("common.field.user"), type: "number" },
      { key: "requestModel", label: t("log.field.requestModel") },
      { key: "upstreamModel", label: t("log.field.upstreamModel") },
      { key: "channelId", label: t("log.field.channelId"), type: "number" },
      { key: "promptTokens", label: t("log.field.promptTokens"), type: "number" },
      { key: "completionTokens", label: t("log.field.completionTokens"), type: "number" },
      { key: "charged", label: t("log.field.charged"), type: "number" },
      { key: "cost", label: t("log.field.cost"), type: "number" },
      { key: "stream", label: t("log.field.stream"), type: "select", format: "status", options: [ { label: t("common.yes"), value: 1 }, { label: t("common.no"), value: 0 } ] },
      { key: "status", label: t("common.field.status") },
      { key: "createdAt", label: t("common.field.time"), format: "date" },
    ] }} />;
}
