"use client";

import * as React from "react";
import { ApiError } from "./client";
import { useT } from "./i18n";

/**
 * 把错误变成给人看的话（评审 R12/R15）。
 *
 * 优先级：后端机器码的翻译（`errors.code.*`）→ 错误类别的通用说明（`errors.kind.*`）。
 * 后端返回的英文句子只在找不到任何翻译时才原样显示，并且永远不显示原始异常堆栈。
 */
export function useDescribeError(): (error: unknown) => string {
  const t = useT("errors");
  return React.useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      const code = error.machineCode;
      if (code && t.has(`code.${code}`)) return t(`code.${code}`);
      if (error.kind === "rate_limited" && error.details.retryAfterSeconds !== undefined) {
        return t("kind.rate_limited_after", { seconds: error.details.retryAfterSeconds });
      }
      if (error.kind === "business" || error.kind === "validation") {
        // 业务失败的具体原因只有后端知道；没有机器码时退回后端给的说明。
        return error.details.fieldErrors?.map((f) => f.message).join("；") || error.message || t(`kind.${error.kind}`);
      }
      return t(`kind.${error.kind}`);
    }
    return t("kind.business");
  }, [t]);
}
