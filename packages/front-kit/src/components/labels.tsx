"use client";

import * as React from "react";

/**
 * kit 组件自带的界面文案（评审 R12）。kit 不依赖任何 i18n 实现：宿主按当前语言注入，
 * 没有注入时用中文默认值。与 Portal / 导航的注入方式一致。
 */
export interface KitLabels {
  emptyTitle: string;
  emptyDescription: string;
  total: (count: string) => string;
  perPage: (size: number) => string;
  previous: string;
  next: string;
  goTo: string;
  pageNumber: string;
  pageSuffix: string;
  moreActions: string;
  close: (title: string) => string;
  confirm: string;
  cancel: string;
  processing: string;
  /** 数字按当前语言分组（如 12,345）。 */
  formatNumber: (value: number) => string;
}

export const defaultKitLabels: KitLabels = {
  emptyTitle: "没有匹配的数据",
  emptyDescription: "请调整查询条件后重试",
  total: (count) => `共 ${count} 条`,
  perPage: (size) => `${size} 条/页`,
  previous: "上一页",
  next: "下一页",
  goTo: "前往",
  pageNumber: "页码",
  pageSuffix: "页",
  moreActions: "更多操作",
  close: (title) => `关闭${title}`,
  confirm: "确认",
  cancel: "取消",
  processing: "处理中…",
  formatNumber: (value) => new Intl.NumberFormat("zh-CN").format(value),
};

const KitLabelsContext = React.createContext<KitLabels>(defaultKitLabels);

export function KitLabelsProvider({ labels, children }: { labels: KitLabels; children: React.ReactNode }) {
  return <KitLabelsContext.Provider value={labels}>{children}</KitLabelsContext.Provider>;
}

export function useKitLabels(): KitLabels {
  return React.useContext(KitLabelsContext);
}
