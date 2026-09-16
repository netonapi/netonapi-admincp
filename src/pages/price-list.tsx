"use client";
import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { apiWrite } from "@neton/application-front-runtime/client";
import { useQueryClient } from "@neton/application-front-runtime/client-context";
import { Alert, Button, Drawer, Field, Textarea } from "@neton/application-front-kit";

interface ImportItem { model: string; inputPrice: string; outputPrice: string; cacheReadPrice?: string; cacheWritePrice?: string }
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
    });
    if (Array.isArray(raw)) return raw.map((o) => { const r = o as Record<string, unknown>; return fromObj(String(r.model ?? ""), r); });
    return Object.entries(raw as Record<string, unknown>).map(([model, v]) => fromObj(model, (v ?? {}) as Record<string, unknown>));
  }
  return t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    const [model, inputPrice = "0", outputPrice = "0", cacheReadPrice, cacheWritePrice] = l.split(/[,\t ]+/).filter(Boolean);
    return { model, inputPrice, outputPrice, cacheReadPrice, cacheWritePrice };
  });
}

export default function Page() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [overwrite, setOverwrite] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  async function submit() {
    setError(null); setResult(null);
    let items: ImportItem[];
    try { items = parsePriceSheet(text); } catch (cause) { setError(`解析失败：${(cause as Error).message}`); return; }
    if (items.length === 0) { setError("没有可导入的条目"); return; }
    setBusy(true);
    try {
      const r = await apiWrite<ImportResult>("/admin/gateway/price/import", "POST", { items, overwrite });
      setResult(r);
      if (r.errors.length === 0) { await queryClient.invalidateQueries({ queryKey: ["gateway-price"] }); }
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  return <>
    <ResourcePage config={{ resourceKey: "gateway-price", eyebrow: "GATEWAY", title: "模型定价", description: "官方价（USD/1M tokens）与售价覆盖；变更即时生效。", endpoint: "/gateway/price", listPath: "list", permissions: { page: "gateway:price:list", create: "gateway:price:create", update: "gateway:price:update", delete: "gateway:price:delete" },
      headerActions: <Button variant="outline" onClick={() => { setOpen(true); setResult(null); setError(null); }}>批量导入</Button>,
      fields: [
      { key: "model", label: "模型", required: true },
      { key: "inputPrice", label: "输入价", defaultValue: "0", required: true },
      { key: "outputPrice", label: "输出价", defaultValue: "0", required: true },
      { key: "cacheReadPrice", label: "缓存读", defaultValue: "0" },
      { key: "cacheWritePrice", label: "缓存写", defaultValue: "0" },
      { key: "perRequestPrice", label: "按次(μUSD)", type: "number", table: false },
      { key: "defaultMaxOutputTokens", label: "默认输出上限", type: "number", table: false },
      { key: "source", label: "价源" },
    ] }} />
    <Drawer open={open} onClose={() => setOpen(false)} title="批量导入定价" description="按 model 去重后逐条写入；有一条不合法则整批不写。价格单位 USD / 1M tokens。"
      footer={<><Button variant="ghost" onClick={() => setOpen(false)}>关闭</Button><Button onClick={() => void submit()} disabled={busy || text.trim() === ""}>{busy ? "导入中…" : "导入"}</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {result && (result.errors.length > 0
          ? <Alert tone="error">未写入任何条目：<br />{result.errors.map((e) => <span key={e}>{e}<br /></span>)}</Alert>
          : <Alert tone="info">导入完成：新增 {result.created}，更新 {result.updated}，跳过 {result.skipped}。</Alert>)}
        <Field label="价目表">
          <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"每行一条：model 输入价 输出价 [缓存读 缓存写]\n例如：\ngpt-4o 2.5 10 1.25\nclaude-sonnet-4 3 15 0.3 3.75\n\n也可以直接粘贴 JSON：[{\"model\":\"gpt-4o\",\"inputPrice\":\"2.5\",\"outputPrice\":\"10\"}]\n或 {\"gpt-4o\":{\"input\":2.5,\"output\":10}}"} />
        </Field>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          覆盖已有模型的价格（取消勾选则只补新模型，已调过的价不动）
        </label>
      </div>
    </Drawer>
  </>;
}
