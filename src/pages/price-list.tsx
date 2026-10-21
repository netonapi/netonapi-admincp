"use client";
import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission } from "@neton/application-front-runtime/client-context";
import {
  Alert, Button, ConfirmDialog, DataTable, Drawer, Field, Input, PageHeader, RowActions, Select, Textarea,
  type DataColumn, type RowAction,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";
import { formatDateTime } from "@neton/application-front-runtime/types";

interface ImportItem { model: string; inputPrice: string; outputPrice: string; cacheReadPrice?: string; cacheWritePrice?: string; defaultMaxOutputTokens?: number }
interface ImportResult { created: number; updated: number; skipped: number; errors: string[]; heldForLoss?: string[] }

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

interface Combo {
  groupCode: string; groupRatio: string; channelId: number; channelName: string; costDiscount: string;
  costModel: string; dimension: string; revenue: number; cost: number; marginBp: number; status: string;
}
interface CheckRow {
  id: number; model: string; mode: "FOLLOW" | "MODEL_MARKUP" | "CUSTOM" | "INVALID"; modelMarkup?: string | null;
  officialInput: string; officialOutput: string; saleInput: string; saleOutput: string;
  perRequestPrice?: number | null; salePerRequest?: number | null;
  status: "OK" | "THIN" | "LOSS" | "UNSERVED" | "INVALID"; worst?: Combo | null; flagged: Combo[]; comboCount: number;
}
interface CheckResult { markup: string; minMargin: string; loss: number; thin: number; ok: number; unserved: number; rows: CheckRow[] }
interface PriceRow {
  id: number; model: string; inputPrice: string; outputPrice: string; cacheReadPrice: string; cacheWritePrice: string;
  perRequestPrice?: number | null; defaultMaxOutputTokens?: number | null; saleOverride?: string | null; source?: string;
}

interface OfficialForm { id: number; model: string; inputPrice: string; outputPrice: string; cacheReadPrice: string; cacheWritePrice: string; perRequestPrice: string; defaultMaxOutputTokens: string }
const EMPTY_OFFICIAL: OfficialForm = { id: 0, model: "", inputPrice: "0", outputPrice: "0", cacheReadPrice: "0", cacheWritePrice: "0", perRequestPrice: "", defaultMaxOutputTokens: "" };

interface CalRow {
  model: string; status: "SAME" | "CHANGED" | "NOT_FOUND" | "NEW" | "UNPARSABLE"; note?: string | null; sourceKey?: string | null;
  currentInput?: string | null; currentOutput?: string | null; sourceInput?: string | null; sourceOutput?: string | null;
  sourceCacheRead?: string | null; currentCacheRead?: string | null; changeBp: number; wouldLose: boolean;
}
interface CalPreview { format: string; url: string; fetched: number; rows: CalRow[]; error?: string | null }
interface HistoryRow { id: number; model: string; action: string; before?: string | null; after?: string | null; operatorId?: number | null; createdAt?: number | null }

type SaleMode = "follow" | "markup" | "custom";
interface SaleForm { row: PriceRow; mode: SaleMode; markup: string; input: string; output: string; cacheRead: string; cacheWrite: string }

const STATUS_TONE: Record<string, string> = {
  LOSS: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  INVALID: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  THIN: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  OK: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  UNSERVED: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

function pct(bp: number): string { return `${(bp / 100).toFixed(1)}%`; }

/** 预览用：价格串 × 倍率。只用于抽屉里的即时预览，实际售价以后端计算为准。 */
function times(price: string, ratio: string): string {
  const p = Number(price), r = Number(ratio);
  if (!Number.isFinite(p) || !Number.isFinite(r)) return "-";
  return String(Math.round(p * r * 1e6) / 1e6);
}

function parseOverride(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v as Record<string, unknown> : {}; } catch { return {}; }
}

/**
 * 模型定价：一张表看清「官方价 → 售价 → 最坏情况下的毛利」。
 *
 * 毛利按实际会发生的每个「分组 × 渠道」组合算（后端 /price/check）：VIP 分组打折、
 * 渠道折扣大于 1、渠道把模型映射成别的上游模型，都会让某个组合亏本，而保存价格时的闸门看不到这些。
 * 售价只有三种方式：跟随全站加价率、本模型单独的加价率、逐项填固定售价 —— 大多数模型用第一种就够了。
 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const canCreate = usePermission("gateway:price:create");
  const canUpdate = usePermission("gateway:price:update");
  const canDelete = usePermission("gateway:price:delete");
  const [check, setCheck] = React.useState<CheckResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | "problem">("all");
  const [keyword, setKeyword] = React.useState("");
  const [official, setOfficial] = React.useState<OfficialForm | null>(null);
  const [sale, setSale] = React.useState<SaleForm | null>(null);
  const [detail, setDetail] = React.useState<CheckRow | null>(null);
  const [deleting, setDeleting] = React.useState<CheckRow | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [overwrite, setOverwrite] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [cal, setCal] = React.useState<CalPreview | null>(null);
  const [calOpen, setCalOpen] = React.useState(false);
  const [calLoading, setCalLoading] = React.useState(false);
  const [calPicked, setCalPicked] = React.useState<Set<string>>(new Set());
  const [calResult, setCalResult] = React.useState<ImportResult | null>(null);
  const [calShowSame, setCalShowSame] = React.useState(false);
  const [history, setHistory] = React.useState<{ model: string; rows: HistoryRow[] } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setCheck(await apiFetch<CheckResult>("/admin/gateway/price/check")); }
    catch (cause) { setError(describeError(cause)); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const modeLabel = (r: CheckRow) =>
    r.mode === "MODEL_MARKUP" ? t("price.mode.modelMarkup", { markup: r.modelMarkup ?? "" })
      : r.mode === "CUSTOM" ? t("price.mode.custom")
      : r.mode === "INVALID" ? t("price.status.INVALID")
      : t("price.mode.follow", { markup: check?.markup ?? "" });

  const comboText = (c: Combo) => t("price.combo", {
    group: c.groupCode, ratio: c.groupRatio, channel: c.channelName, discount: c.costDiscount,
    dimension: t(`price.dimension.${c.dimension}`),
    costModel: c.costModel,
  });

  async function submitImport() {
    setImportError(null); setResult(null);
    let items: ImportItem[];
    try { items = parsePriceSheet(text); } catch (cause) { setImportError(t("price.import.parseFailed", { error: (cause as Error).message })); return; }
    if (items.length === 0) { setImportError(t("price.import.empty")); return; }
    setBusy(true);
    try {
      const r = await apiWrite<ImportResult>("/admin/gateway/price/import", "POST", { items, overwrite });
      setResult(r);
      if (r.errors.length === 0) await load();
    } catch (cause) { setImportError(describeError(cause)); } finally { setBusy(false); }
  }

  async function openOfficial(row?: CheckRow) {
    setFormError(null);
    if (!row) { setOfficial({ ...EMPTY_OFFICIAL }); return; }
    try {
      const p = await apiFetch<PriceRow>(`/admin/gateway/price/get/${row.id}`);
      setOfficial({
        id: p.id, model: p.model, inputPrice: p.inputPrice, outputPrice: p.outputPrice, cacheReadPrice: p.cacheReadPrice,
        cacheWritePrice: p.cacheWritePrice, perRequestPrice: p.perRequestPrice != null ? String(p.perRequestPrice) : "",
        defaultMaxOutputTokens: p.defaultMaxOutputTokens != null ? String(p.defaultMaxOutputTokens) : "",
      });
    } catch (cause) { setError(describeError(cause)); }
  }

  async function saveOfficial() {
    if (!official) return;
    setSaving(true); setFormError(null);
    // 不带 saleOverride：后端据此保留这个模型原来的售价设置，改官方价不会把单独设的售价冲掉
    const body = {
      id: official.id, model: official.model.trim(), inputPrice: official.inputPrice, outputPrice: official.outputPrice,
      cacheReadPrice: official.cacheReadPrice || "0", cacheWritePrice: official.cacheWritePrice || "0",
      perRequestPrice: official.perRequestPrice.trim() ? Number(official.perRequestPrice) : null,
      defaultMaxOutputTokens: official.defaultMaxOutputTokens.trim() ? Number(official.defaultMaxOutputTokens) : null,
    };
    try {
      await apiWrite<unknown>(`/admin/gateway/price/${official.id ? "update" : "create"}`, official.id ? "PUT" : "POST", body);
      setOfficial(null); await load();
    } catch (cause) { setFormError(describeError(cause)); } finally { setSaving(false); }
  }

  async function openSale(row: CheckRow) {
    setFormError(null);
    try {
      const p = await apiFetch<PriceRow>(`/admin/gateway/price/get/${row.id}`);
      const o = parseOverride(p.saleOverride);
      const fixed = ["input", "output", "cacheRead", "cacheWrite"].some((k) => o[k] !== undefined);
      const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
      setSale({
        row: p, mode: fixed ? "custom" : o.markup !== undefined ? "markup" : "follow",
        markup: str(o.markup) || (check?.markup ?? "1"),
        input: str(o.input) || row.saleInput, output: str(o.output) || row.saleOutput,
        cacheRead: str(o.cacheRead), cacheWrite: str(o.cacheWrite),
      });
    } catch (cause) { setError(describeError(cause)); }
  }

  async function saveSale() {
    if (!sale) return;
    const p = sale.row;
    // 按次计价的设置（perRequest）不在这个抽屉里编辑，原样保留
    const kept = parseOverride(p.saleOverride);
    const override: Record<string, unknown> = {};
    if ("perRequest" in kept) override.perRequest = kept.perRequest;
    if (sale.mode === "markup") override.markup = sale.markup.trim();
    if (sale.mode === "custom") {
      for (const [k, v] of [["input", sale.input], ["output", sale.output], ["cacheRead", sale.cacheRead], ["cacheWrite", sale.cacheWrite]] as const) {
        if (v.trim()) override[k] = v.trim();
      }
    }
    setSaving(true); setFormError(null);
    try {
      await apiWrite<unknown>("/admin/gateway/price/update", "PUT", {
        id: p.id, model: p.model, inputPrice: p.inputPrice, outputPrice: p.outputPrice, cacheReadPrice: p.cacheReadPrice,
        cacheWritePrice: p.cacheWritePrice, perRequestPrice: p.perRequestPrice ?? null, defaultMaxOutputTokens: p.defaultMaxOutputTokens ?? null,
        saleOverride: Object.keys(override).length ? JSON.stringify(override) : "",
      });
      setSale(null); await load();
    } catch (cause) { setFormError(describeError(cause)); } finally { setSaving(false); }
  }

  /** 校准预览：默认勾选「有变化且不会亏本」和「渠道已承载、价源有价」的模型；会亏本的不默认勾，先去调售价。 */
  async function openCalibrate() {
    setCalOpen(true); setCal(null); setCalResult(null); setCalLoading(true);
    try {
      // 走「检查价源」：与每天的定时检查同一入口，顺带留一条检查记录（概览与告警据此提示待确认的变动）
      const p = await apiWrite<CalPreview>("/admin/gateway/price/sync", "POST", {});
      setCal(p);
      setCalPicked(new Set(p.rows.filter((r) => (r.status === "CHANGED" && !r.wouldLose) || r.status === "NEW").map((r) => r.model)));
    } catch (cause) { setCal({ format: "", url: "", fetched: 0, rows: [], error: describeError(cause) }); }
    finally { setCalLoading(false); }
  }

  async function applyCalibrate() {
    setBusy(true);
    try {
      const r = await apiWrite<ImportResult>("/admin/gateway/price/calibrate/apply", "POST", { models: [...calPicked] });
      setCalResult(r);
      await load();
    } catch (cause) { setCalResult({ created: 0, updated: 0, skipped: 0, errors: [describeError(cause)] }); }
    finally { setBusy(false); }
  }

  async function openHistory(row: CheckRow) {
    try { setHistory({ model: row.model, rows: await apiFetch<HistoryRow[]>(`/admin/gateway/price/history?model=${encodeURIComponent(row.model)}`) }); }
    catch (cause) { setError(describeError(cause)); }
  }

  /** 调价记录里一行的「从 → 到」：只列变了的字段。 */
  function historyDiff(h: HistoryRow): string {
    const b = parseOverride(h.before), a = parseOverride(h.after);
    const keys = ["input", "output", "cacheRead", "cacheWrite", "perRequest", "saleOverride"];
    const parts = keys.filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
      .map((k) => `${t(`price.history.field.${k}`)} ${b[k] ?? "-"} → ${a[k] ?? "-"}`);
    return parts.join("；") || "-";
  }

  async function remove(row: CheckRow) {
    try { await apiWrite<unknown>(`/admin/gateway/price/delete/${row.id}`, "DELETE"); setDeleting(null); await load(); }
    catch (cause) { setError(describeError(cause)); setDeleting(null); }
  }

  const rows = (check?.rows ?? []).filter((r) =>
    (filter === "all" || r.status === "LOSS" || r.status === "THIN" || r.status === "INVALID") &&
    (!keyword.trim() || r.model.toLowerCase().includes(keyword.trim().toLowerCase())));

  const actions = (row: CheckRow): RowAction[] => [
    ...(canUpdate ? [{ label: t("price.action.sale"), tone: "primary" as const, onClick: () => void openSale(row) }] : []),
    ...(row.flagged.length ? [{ label: t("price.action.detail"), onClick: () => setDetail(row) }] : []),
    ...(canUpdate ? [{ label: t("price.action.editOfficial"), onClick: () => void openOfficial(row) }] : []),
  ];
  const more = (row: CheckRow): RowAction[] => [
    { label: t("price.action.history"), onClick: () => void openHistory(row) },
    ...(canDelete ? [{ label: t("common.action.delete"), danger: true, kind: "delete" as const, onClick: () => setDeleting(row) }] : []),
  ];

  const columns: DataColumn<CheckRow>[] = [
    { key: "model", header: t("common.field.model"), cell: (r) => <code className="text-xs">{r.model}</code> },
    { key: "official", header: t("price.column.official"), cell: (r) => r.perRequestPrice != null ? t("price.perRequest", { price: (r.perRequestPrice / 1e6).toFixed(4) }) : <span className="tabular-nums">${r.officialInput} / ${r.officialOutput}</span> },
    { key: "mode", header: t("price.column.mode"), cell: (r) => <span className="text-xs">{modeLabel(r)}</span> },
    { key: "sale", header: t("price.column.sale"), cell: (r) => r.salePerRequest != null ? t("price.perRequest", { price: (r.salePerRequest / 1e6).toFixed(4) }) : r.saleInput ? <span className="tabular-nums">${r.saleInput} / ${r.saleOutput}</span> : "-" },
    { key: "worst", header: t("price.column.worst"), cell: (r) => r.worst ? <div className="space-y-0.5"><div className="tabular-nums text-xs font-medium">{pct(r.worst.marginBp)}</div><div className="text-[11px] text-[var(--muted-foreground)]">{comboText(r.worst)}</div></div> : <span className="text-xs text-[var(--muted-foreground)]">{t("price.noChannel")}</span> },
    { key: "status", header: t("common.field.status"), cell: (r) => <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status] ?? ""}`}>{t(`price.status.${r.status}`)}</span> },
    { key: "actions", header: t("common.field.actions"), headerClassName: "text-right", className: "text-right", cell: (row: CheckRow) => <RowActions primary={actions(row)} more={more(row)} /> },
  ];

  const saleMarkupPreview = sale && sale.mode !== "custom"
    ? { input: times(sale.row.inputPrice, sale.mode === "markup" ? sale.markup : check?.markup ?? "1"), output: times(sale.row.outputPrice, sale.mode === "markup" ? sale.markup : check?.markup ?? "1") }
    : null;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("common.eyebrow")} title={t("price.title")} description={t("price.description")}
        actions={<>
          {canCreate && <Button onClick={() => void openOfficial()}>{t("price.action.create")}</Button>}
          {canCreate && <Button variant="outline" onClick={() => { setOpen(true); setResult(null); setImportError(null); }}>{t("price.action.import")}</Button>}
          {canUpdate && <Button variant="outline" onClick={() => void openCalibrate()}>{t("price.action.calibrate")}</Button>}
          <Button variant="outline" onClick={() => void load()}>{t("common.action.refresh")}</Button>
        </>} />

      {check && <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
        <span>{t("price.summary.policy", { markup: check.markup, minMargin: check.minMargin })} <a href="/system/setting" className="text-xs text-[var(--primary)] hover:underline">{t("price.summary.change")}</a></span>
        <span className="text-red-600">{t("price.summary.loss", { count: check.loss })}</span>
        <span className="text-amber-600">{t("price.summary.thin", { count: check.thin })}</span>
        <span className="text-emerald-600">{t("price.summary.ok", { count: check.ok })}</span>
        <span className="text-[var(--muted-foreground)]">{t("price.summary.unserved", { count: check.unserved })}</span>
        <div className="ml-auto flex items-center gap-2">
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t("price.filter.keyword")} className="h-8 w-48" />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as "all" | "problem")} className="h-8">
            <option value="all">{t("price.filter.all")}</option>
            <option value="problem">{t("price.filter.problem")}</option>
          </Select>
        </div>
      </div>}

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} error={error ?? undefined} />

      <Drawer open={official != null} onClose={() => setOfficial(null)}
        title={official?.id ? t("price.official.editTitle", { model: official.model }) : t("price.action.create")}
        description={t("price.official.description")}
        footer={<><Button variant="outline" onClick={() => setOfficial(null)}>{t("common.action.cancel")}</Button><Button onClick={() => void saveOfficial()} disabled={saving}>{saving ? t("common.action.saving") : t("common.action.save")}</Button></>}>
        {official && <div className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label={t("common.field.model")}><Input value={official.model} readOnly={official.id !== 0} onChange={(e) => setOfficial({ ...official, model: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("price.field.inputPrice")}><Input value={official.inputPrice} onChange={(e) => setOfficial({ ...official, inputPrice: e.target.value })} /></Field>
            <Field label={t("price.field.outputPrice")}><Input value={official.outputPrice} onChange={(e) => setOfficial({ ...official, outputPrice: e.target.value })} /></Field>
            <Field label={t("price.field.cacheReadPrice")}><Input value={official.cacheReadPrice} onChange={(e) => setOfficial({ ...official, cacheReadPrice: e.target.value })} /></Field>
            <Field label={t("price.field.cacheWritePrice")}><Input value={official.cacheWritePrice} onChange={(e) => setOfficial({ ...official, cacheWritePrice: e.target.value })} /></Field>
            <Field label={t("price.field.perRequestPrice")}><Input type="number" value={official.perRequestPrice} onChange={(e) => setOfficial({ ...official, perRequestPrice: e.target.value })} /></Field>
            <Field label={t("price.field.defaultMaxOutputTokens")}><Input type="number" value={official.defaultMaxOutputTokens} onChange={(e) => setOfficial({ ...official, defaultMaxOutputTokens: e.target.value })} /></Field>
          </div>
        </div>}
      </Drawer>

      <Drawer open={sale != null} onClose={() => setSale(null)}
        title={sale ? t("price.sale.title", { model: sale.row.model }) : ""}
        description={t("price.sale.description")}
        footer={<><Button variant="outline" onClick={() => setSale(null)}>{t("common.action.cancel")}</Button><Button onClick={() => void saveSale()} disabled={saving}>{saving ? t("common.action.saving") : t("common.action.save")}</Button></>}>
        {sale && <div className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <p className="text-xs text-[var(--muted-foreground)]">{t("price.sale.official", { input: sale.row.inputPrice, output: sale.row.outputPrice })}</p>
          <div className="space-y-2">
            {(["follow", "markup", "custom"] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
                <input type="radio" name="sale-mode" checked={sale.mode === m} onChange={() => setSale({ ...sale, mode: m })} className="mt-0.5" />
                <span><span className="font-medium">{t(`price.sale.mode.${m}`, { markup: check?.markup ?? "1" })}</span><br /><span className="text-xs text-[var(--muted-foreground)]">{t(`price.sale.hint.${m}`)}</span></span>
              </label>
            ))}
          </div>
          {sale.mode === "markup" && <Field label={t("price.sale.markup")}><Input value={sale.markup} onChange={(e) => setSale({ ...sale, markup: e.target.value })} /></Field>}
          {sale.mode === "custom" && <div className="grid grid-cols-2 gap-3">
            <Field label={t("price.field.inputPrice")}><Input value={sale.input} onChange={(e) => setSale({ ...sale, input: e.target.value })} /></Field>
            <Field label={t("price.field.outputPrice")}><Input value={sale.output} onChange={(e) => setSale({ ...sale, output: e.target.value })} /></Field>
            <Field label={t("price.field.cacheReadPrice")}><Input value={sale.cacheRead} placeholder={t("price.sale.followPlaceholder")} onChange={(e) => setSale({ ...sale, cacheRead: e.target.value })} /></Field>
            <Field label={t("price.field.cacheWritePrice")}><Input value={sale.cacheWrite} placeholder={t("price.sale.followPlaceholder")} onChange={(e) => setSale({ ...sale, cacheWrite: e.target.value })} /></Field>
          </div>}
          {saleMarkupPreview && <p className="text-xs">{t("price.sale.preview", saleMarkupPreview)}</p>}
          <p className="text-xs text-[var(--muted-foreground)]">{t("price.sale.afterSave")}</p>
        </div>}
      </Drawer>

      <Drawer open={detail != null} onClose={() => setDetail(null)} title={detail ? t("price.detail.title", { model: detail.model }) : ""}
        description={t("price.detail.description")}
        footer={<Button variant="outline" onClick={() => setDetail(null)}>{t("common.action.close")}</Button>}>
        {detail && <div className="space-y-2">
          {detail.flagged.map((c) => (
            <div key={`${c.groupCode}-${c.channelId}`} className="rounded-lg border border-[var(--border)] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{comboText(c)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[c.status] ?? ""}`}>{t(`price.status.${c.status}`)} {pct(c.marginBp)}</span>
              </div>
              <div className="mt-1 tabular-nums text-[var(--muted-foreground)]">{t("price.detail.numbers", { revenue: (c.revenue / 1e6).toString(), cost: (c.cost / 1e6).toString() })}</div>
            </div>
          ))}
          <p className="pt-2 text-xs text-[var(--muted-foreground)]">{t("price.detail.fix")}</p>
        </div>}
      </Drawer>


      <Drawer open={calOpen} onClose={() => setCalOpen(false)} title={t("price.cal.title")}
        description={cal?.url ? t("price.cal.source", { format: cal.format, url: cal.url, count: cal.fetched }) : t("price.cal.description")}
        footer={<><Button variant="ghost" onClick={() => setCalOpen(false)}>{t("common.action.close")}</Button><Button onClick={() => void applyCalibrate()} disabled={busy || calPicked.size === 0}>{busy ? t("common.action.submitting") : t("price.cal.apply", { count: calPicked.size })}</Button></>}>
        <div className="space-y-3">
          {calLoading && <p className="text-sm text-[var(--muted-foreground)]">{t("price.cal.loading")}</p>}
          {cal?.error && <Alert tone="error">{t("price.cal.failed", { error: cal.error })}</Alert>}
          {calResult && (calResult.errors.length > 0
            ? <Alert tone="error">{calResult.errors.join("；")}</Alert>
            : <Alert tone="info">{t("price.import.done", { created: calResult.created, updated: calResult.updated, skipped: calResult.skipped })}{calResult.heldForLoss?.length ? <><br />{t("price.sync.held", { models: calResult.heldForLoss.join(", ") })}</> : null}</Alert>)}
          {cal && !cal.error && <>
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
              <span>{t("price.cal.counts", { changed: cal.rows.filter((r) => r.status === "CHANGED").length, fresh: cal.rows.filter((r) => r.status === "NEW").length, missing: cal.rows.filter((r) => r.status === "NOT_FOUND").length })}</span>
              <label className="flex items-center gap-1"><input type="checkbox" checked={calShowSame} onChange={(e) => setCalShowSame(e.target.checked)} />{t("price.cal.showSame")}</label>
            </div>
            <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {cal.rows.filter((r) => calShowSame || r.status === "CHANGED" || r.status === "NEW" || r.status === "UNPARSABLE").map((r) => {
                const selectable = r.status === "CHANGED" || r.status === "NEW";
                return (
                  <label key={r.model} className="flex items-start gap-2 p-2.5 text-xs">
                    <input type="checkbox" disabled={!selectable} checked={calPicked.has(r.model)} className="mt-0.5"
                      onChange={(e) => { const next = new Set(calPicked); if (e.target.checked) next.add(r.model); else next.delete(r.model); setCalPicked(next); }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <code>{r.model}</code>
                        <span className={r.status === "NEW" ? "text-[var(--primary)]" : r.changeBp > 0 ? "text-red-600" : r.changeBp < 0 ? "text-emerald-600" : "text-[var(--muted-foreground)]"}>
                          {r.status === "NEW" ? t("price.cal.status.NEW") : r.status === "CHANGED" ? `${r.changeBp > 0 ? "+" : ""}${(r.changeBp / 100).toFixed(1)}%` : t(`price.cal.status.${r.status}`)}
                        </span>
                      </span>
                      <span className="mt-0.5 block tabular-nums text-[var(--muted-foreground)]">
                        {r.status === "NEW" ? t("price.cal.newPrice", { input: r.sourceInput ?? "0", output: r.sourceOutput ?? "0" })
                          : r.status === "NOT_FOUND" ? t("price.cal.notFound")
                          : r.status === "UNPARSABLE" ? t("price.cal.unparsable")
                          : t("price.cal.diff", { from: `${r.currentInput} / ${r.currentOutput}`, to: `${r.sourceInput} / ${r.sourceOutput}` })}
                        {r.sourceKey && r.sourceKey !== r.model ? ` · ${t("price.cal.matched", { key: r.sourceKey })}` : ""}
                      </span>
                      {r.wouldLose && <span className="mt-0.5 block text-amber-600">{t("price.cal.wouldLose")}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </>}
        </div>
      </Drawer>

      <Drawer open={history != null} onClose={() => setHistory(null)} title={history ? t("price.history.title", { model: history.model }) : ""}
        footer={<Button variant="outline" onClick={() => setHistory(null)}>{t("common.action.close")}</Button>}>
        {history && (history.rows.length === 0
          ? <p className="text-sm text-[var(--muted-foreground)]">{t("price.history.empty")}</p>
          : <div className="space-y-2">{history.rows.map((h) => (
              <div key={h.id} className="rounded-lg border border-[var(--border)] p-3 text-xs">
                <div className="flex justify-between"><span className="font-medium">{t(`price.history.action.${h.action}`)}</span><span className="text-[var(--muted-foreground)]">{formatDateTime(h.createdAt)}{h.operatorId ? ` · #${h.operatorId}` : ""}</span></div>
                <div className="mt-1 break-all text-[var(--muted-foreground)]">{historyDiff(h)}</div>
              </div>))}</div>)}
      </Drawer>

      <ConfirmDialog open={deleting != null} title={t("price.delete.title", { model: deleting?.model ?? "" })} description={t("price.delete.description")}
        confirmLabel={t("common.action.delete")} onCancel={() => setDeleting(null)} onConfirm={() => deleting && void remove(deleting)} />

      <Drawer open={open} onClose={() => setOpen(false)} title={t("price.import.title")} description={t("price.import.description")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.action.close")}</Button><Button onClick={() => void submitImport()} disabled={busy || text.trim() === ""}>{busy ? t("price.import.importing") : t("price.import.submit")}</Button></>}>
        <div className="space-y-4">
          {importError && <Alert tone="error">{importError}</Alert>}
          {result && (result.errors.length > 0
            ? <Alert tone="error">{t("price.import.rejected")}<br />{result.errors.map((e) => <span key={e}>{e}<br /></span>)}</Alert>
            : <Alert tone="info">{t("price.import.done", { created: result.created, updated: result.updated, skipped: result.skipped })}{result.heldForLoss?.length ? <><br />{t("price.sync.held", { models: result.heldForLoss.join(", ") })}</> : null}</Alert>)}
          <Field label={t("price.import.sheet")}>
            <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("price.import.placeholder")} />
          </Field>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            {t("price.import.overwrite")}
          </label>
        </div>
      </Drawer>
    </div>
  );
}
