"use client";

import * as React from "react";
import { KitLabelsProvider, type KitLabels } from "@neton/application-front-kit";
import { I18nProvider, i18nConfigFromEnv, useFormat, useT } from "@neton/application-front-runtime/i18n";
import { runtimeCatalogs } from "@neton/application-front-runtime/messages";
import { localeRegistry } from "@/generated/modules.generated";
import { shellCatalogs } from "@/messages";

const config = i18nConfigFromEnv();
const catalogs = { ...runtimeCatalogs, ...shellCatalogs };

/** 根部的客户端 Provider：国际化（宿主 / 运行时词条静态打入，模块词条随模块懒加载）。 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider config={config} registry={localeRegistry} catalogs={catalogs}>
      <KitLabelsBridge>{children}</KitLabelsBridge>
    </I18nProvider>
  );
}

/** 把当前语言的 kit 文案注入 front-kit（kit 自身不依赖 i18n 实现）。 */
function KitLabelsBridge({ children }: { children: React.ReactNode }) {
  const t = useT("kit");
  const fmt = useFormat();
  const labels = React.useMemo<KitLabels>(() => ({
    emptyTitle: t("emptyTitle"),
    emptyDescription: t("emptyDescription"),
    total: (count) => t("total", { count }),
    perPage: (size) => t("perPage", { size }),
    previous: t("previous"),
    next: t("next"),
    goTo: t("goTo"),
    pageNumber: t("pageNumber"),
    pageSuffix: t("pageSuffix"),
    moreActions: t("moreActions"),
    close: (title) => t("close", { title }),
    confirm: t("confirm"),
    cancel: t("cancel"),
    processing: t("processing"),
    formatNumber: (value) => fmt.number(value),
  }), [t, fmt]);
  return <KitLabelsProvider labels={labels}>{children}</KitLabelsProvider>;
}
