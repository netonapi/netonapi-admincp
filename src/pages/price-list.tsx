"use client";
import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { apiWrite } from "@neton/application-front-runtime/client";
import { useQueryClient } from "@neton/application-front-runtime/client-context";
import { Alert, Button, Drawer, Field, Textarea } from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

interface ImportItem { model: string; inputPrice: string; outputPrice: string; cacheReadPrice?: string; cacheWritePrice?: string; defaultMaxOutputTokens?: number }
interface ImportResult { created: number; updated: number; skipped: number; errors: string[] }

/**
 * 价目表解析。两种输入：
 * - 每行一条：`model 输入价 输出价 [缓存读 缓存写]`，逗号 / 制表符 / 空格分隔，`#` 开头是注释；
 * - JSON：数组 `[{model,inputPrice,outputPrice,...}]`，或对象 `{"gpt-4o": {"input": 2.5, "output": 10}}`
 *   （后者是各家价目表最常见的形状，键名 input/output/inputPrice/outputPrice 都认）。
 * 价格单位与表里一致：USD / 1M tokens。
 */
export function parsePriceSheet(text: string): ImportItem[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith("[") || t.startsWith("{")) {
    const raw: unknown = JSON.parse(t);
    const pick = (o: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null) return String(o[k]); return undefined; };
    const fromObj = (model: string, o: Record<string, unknown>): ImportItem => ({
      model,
      inputPrice: pick(o, "inputPrice", "input", "prompt") ?? "0",
      outputPrice: pick(o, "outputPrice", "output", "completion") ?? "0",
      cacheReadPrice: pick(o, "cacheReadPrice", "cacheRead", "cache_read", "cached_input"),
      cacheWritePrice: pick(o, "cacheWritePrice", "cacheWrite", "cache_write"),
      defaultMaxOutputTokens: (() => { const v = pick(o, "defaultMaxOutputTokens", "maxOutput", "max_output_tokens"); return v ? Number(v) : undefined; })(),
    });
    if (Array.isArray(raw)) return raw.map((o) => { const r = o as Record<string, unknown>; return fromObj(String(r.model ?? ""), r); });
    return Object.entries(raw as Record<string, unknown>).map(([model, v]) => fromObj(model, (v ?? {}) as Record<string, unknown>));
  }
  return t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    const [model, inputPrice = "0", outputPrice = "0", cacheReadPrice, cacheWritePrice, maxOut] = l.split(/[,\t ]+/).filter(Boolean);
    return { model, inputPrice, outputPrice, cacheReadPrice, cacheWritePrice, defaultMaxOutputTokens: maxOut ? Number(maxOut) : undefined };
  });
}

export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [overwrite, setOverwrite] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  /** 立即从 NEWGATE_PRICE_SYNC_URL 拉一次（定时任务每天也会拉）。没配 URL 后端回 PRICE_SYNC_NOT_CONFIGURED。 */
  async function syncNow() {
    try {
      const r = await apiWrite<ImportResult>("/admin/gateway/price/sync", "POST", {});
      window.alert(r.errors.length ? t("price.sync.failedList", { errors: r.errors.join("\n") }) : t("price.sync.done", { created: r.created, updated: r.updated, skipped: r.skipped }));
      await queryClient.invalidateQueries({ queryKey: ["gateway-price"] });
    } catch (cause) { window.alert(t("price.sync.failed", { error: describeError(cause) })); }
  }

  async function submit() {
    setError(null); setResult(null);
    let items: ImportItem[];
    try { items = parsePriceSheet(text); } catch (cause) { setError(t("price.import.parseFailed", { error: (cause as Error).message })); return; }
    if (items.length === 0) { setError(t("price.import.empty")); return; }
    setBusy(true);
    try {
      const r = await apiWrite<ImportResult>("/admin/gateway/price/import", "POST", { items, overwrite });
      setResult(r);
      if (r.errors.length === 0) { await queryClient.invalidateQueries({ queryKey: ["gateway-price"] }); }
    } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  }

  return <>
    <ResourcePage config={{ resourceKey: "gateway-price", eyebrow: t("common.eyebrow"), title: t("price.title"), description: t("price.description"), endpoint: "/gateway/price", errorNamespace: "gateway", listPath: "list", permissions: { page: "gateway:price:query", create: "gateway:price:create", update: "gateway:price:update", delete: "gateway:price:delete" },
      headerActions: <div style={{ display: "flex", gap: 8 }}>
        <Button variant="outline" onClick={() => { setOpen(true); setResult(null); setError(null); }}>{t("price.action.import")}</Button>
        <Button variant="outline" onClick={() => void syncNow()}>{t("price.action.sync")}</Button>
      </div>,
      fields: [
      { key: "model", label: t("common.field.model"), required: true },
      { key: "inputPrice", label: t("price.field.inputPrice"), defaultValue: "0", required: true },
      { key: "outputPrice", label: t("price.field.outputPrice"), defaultValue: "0", required: true },
      { key: "cacheReadPrice", label: t("price.field.cacheReadPrice"), defaultValue: "0" },
      { key: "cacheWritePrice", label: t("price.field.cacheWritePrice"), defaultValue: "0" },
      { key: "perRequestPrice", label: t("price.field.perRequestPrice"), type: "number", table: false },
      { key: "defaultMaxOutputTokens", label: t("price.field.defaultMaxOutputTokens"), type: "number", table: false },
      { key: "source", label: t("price.field.source"), editable: false },
    ] }} />
    <Drawer open={open} onClose={() => setOpen(false)} title={t("price.import.title")} description={t("price.import.description")}
      footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.action.close")}</Button><Button onClick={() => void submit()} disabled={busy || text.trim() === ""}>{busy ? t("price.import.importing") : t("price.import.submit")}</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {result && (result.errors.length > 0
          ? <Alert tone="error">{t("price.import.rejected")}<br />{result.errors.map((e) => <span key={e}>{e}<br /></span>)}</Alert>
          : <Alert tone="info">{t("price.import.done", { created: result.created, updated: result.updated, skipped: result.skipped })}</Alert>)}
        <Field label={t("price.import.sheet")}>
          <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t("price.import.placeholder")} />
        </Field>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          {t("price.import.overwrite")}
        </label>
      </div>
    </Drawer>
  </>;
}
