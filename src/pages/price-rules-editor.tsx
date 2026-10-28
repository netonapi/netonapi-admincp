"use client";
import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission } from "@neton/application-front-runtime/client-context";
import {
  Alert, Button, ConfirmDialog, DataTable, Drawer, Field, Input, RowActions,
  type DataColumn, type RowAction,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

/**
 * 定价规则编辑（docs/gateway-pricing-spec.md §4.3）：「分组或用户 × 模型」的约定价，以官方价为锚。
 * 「用户定价」页与「计价分组 → 按模型定价」共用。保存前实时预览最终价、相当于官方价几折与最差毛利，亏本不能保存。
 */

export interface PriceItems { input: string; output: string; cacheRead: string; cacheWrite: string; perRequest?: number | null }
export interface Combo { groupCode: string; channelName: string; marginBp: number; status: string; revenue: number; cost: number; dimension: string }
interface RuleRow {
  id: number; subjectType: string; subjectId: string; model: string; mode: string; discount?: string | null; prices?: string | null; remark?: string | null;
  official?: PriceItems | null; price?: PriceItems | null; discountBp?: number | null; status: string; worst?: Combo | null;
}
interface Preview { price: PriceItems; discountBp?: number | null; status: string; worst?: Combo | null; combos: Combo[]; groups: string[] }
interface ModelOption { model: string; displayName?: string | null; listed: number; tiers?: string | null; perRequestPrice?: number | null; inputPrice: string; outputPrice: string; access?: string }

type Mode = "OFFICIAL_DISCOUNT" | "FIXED" | "PLATFORM";
interface Form { models: string[]; mode: Mode; discount: string; input: string; output: string; cacheRead: string; cacheWrite: string; perRequest: string; remark: string; editing: boolean }
const EMPTY: Form = { models: [], mode: "OFFICIAL_DISCOUNT", discount: "0.8", input: "", output: "", cacheRead: "", cacheWrite: "", perRequest: "", remark: "", editing: false };

export const STATUS_TONE: Record<string, string> = {
  LOSS: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  THIN: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  OK: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  UNSERVED: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

/** 万分位 → 「7 折」「7.5 折」；≥ 10000 → 「1.08 倍」。 */
export function discountText(bp: number | null | undefined, t: (k: string, v?: Record<string, unknown>) => string): string {
  if (bp == null) return "-";
  if (bp >= 10000) return t("rule.times", { x: String(Number((bp / 10000).toFixed(2))) });
  // 中文按「折」（÷1000：7000 → 7 折），英文按百分比（÷100：7000 → 70%），换算尺度由语言包给
  const scale = Number(t("rule.discountScale")) || 1000;
  return t("rule.zhe", { x: String(Number((bp / scale).toFixed(2))) });
}

export function pricePair(p: PriceItems | null | undefined, t: (k: string, v?: Record<string, unknown>) => string): string {
  if (!p) return "-";
  if (p.perRequest != null) return t("rule.perRequest", { price: (p.perRequest / 1e6).toFixed(4) });
  return `$${p.input} / $${p.output}`;
}

export function PriceRulesEditor({ subjectType, subjectId, onChanged }: { subjectType: "GROUP" | "USER"; subjectId: string; onChanged?: () => void }) {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const canUpdate = usePermission("gateway:price:update");
  const [rules, setRules] = React.useState<RuleRow[] | null>(null);
  const [models, setModels] = React.useState<ModelOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<Form | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [results, setResults] = React.useState<string[]>([]);
  const [deleting, setDeleting] = React.useState<RuleRow | null>(null);
  const [query, setQuery] = React.useState("");

  const load = React.useCallback(async () => {
    setError(null);
    try { setRules(await apiFetch<RuleRow[]>(`/admin/gateway/price-rule/list?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}`)); }
    catch (cause) { setError(describeError(cause)); setRules([]); }
  }, [subjectType, subjectId]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    apiFetch<ModelOption[]>("/admin/gateway/price/list").then((l) => setModels(l.filter((m) => m.listed === 1).sort((a, b) => a.model.localeCompare(b.model)))).catch(() => setModels([]));
  }, []);

  const one = form && form.models.length === 1 ? models.find((m) => m.model === form.models[0]) : undefined;
  const perRequestModel = one?.perRequestPrice != null;

  function body(f: Form, model: string) {
    const prices: Record<string, string | number> = {};
    if (f.mode === "FIXED") {
      if (models.find((m) => m.model === model)?.perRequestPrice != null) { if (f.perRequest.trim()) prices.perRequest = Math.round(Number(f.perRequest) * 1e6); }
      else {
        if (f.input.trim()) prices.input = f.input.trim();
        if (f.output.trim()) prices.output = f.output.trim();
        if (f.cacheRead.trim()) prices.cacheRead = f.cacheRead.trim();
        if (f.cacheWrite.trim()) prices.cacheWrite = f.cacheWrite.trim();
      }
    }
    return {
      subjectType, subjectId, model, mode: f.mode,
      discount: f.mode === "OFFICIAL_DISCOUNT" ? f.discount.trim() : null,
      prices: f.mode === "FIXED" ? JSON.stringify(prices) : null,
      remark: f.remark.trim() || null,
    };
  }

  // 单个模型时实时预览（防抖）：最终价、相当于官方价几折、最差毛利
  React.useEffect(() => {
    if (!form || form.models.length !== 1) { setPreview(null); setPreviewError(null); return; }
    const timer = window.setTimeout(async () => {
      try { setPreview(await apiWrite<Preview>("/admin/gateway/price-rule/preview", "POST", body(form, form.models[0]))); setPreviewError(null); }
      catch (cause) { setPreview(null); setPreviewError(describeError(cause)); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form]);

  function openNew() { setResults([]); setPreview(null); setForm({ ...EMPTY }); setQuery(""); }
  function openEdit(r: RuleRow) {
    let p: Record<string, unknown> = {};
    try { p = r.prices ? JSON.parse(r.prices) as Record<string, unknown> : {}; } catch { p = {}; }
    const s = (v: unknown) => (v == null ? "" : String(v));
    setResults([]);
    setForm({
      models: [r.model], mode: r.mode as Mode, discount: r.discount ?? "0.8",
      input: s(p.input), output: s(p.output), cacheRead: s(p.cacheRead), cacheWrite: s(p.cacheWrite),
      perRequest: p.perRequest != null ? String(Number(p.perRequest) / 1e6) : "", remark: r.remark ?? "", editing: true,
    });
  }

  async function save() {
    if (!form || form.models.length === 0) return;
    setSaving(true); setResults([]);
    const out: string[] = [];
    for (const m of form.models) {
      try {
        const r = await apiWrite<Preview>("/admin/gateway/price-rule/save", "PUT", body(form, m));
        out.push(t("rule.saved", { model: m, status: t(`rule.status.${r.status}`) }));
      } catch (cause) { out.push(t("rule.saveFailed", { model: m, error: describeError(cause) })); }
    }
    setSaving(false);
    await load(); onChanged?.();
    if (out.every((line) => !line.includes("✗")) && form.models.length === 1) { setForm(null); return; }
    setResults(out);
  }

  async function remove(r: RuleRow) {
    try {
      await apiWrite<void>(`/admin/gateway/price-rule/delete?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}&model=${encodeURIComponent(r.model)}`, "DELETE");
      setDeleting(null); await load(); onChanged?.();
    } catch (cause) { setError(describeError(cause)); setDeleting(null); }
  }

  const modeText = (r: { mode: string; discount?: string | null }) =>
    r.mode === "OFFICIAL_DISCOUNT" ? t("rule.mode.discountShort", { zhe: discountText(Math.round(Number(r.discount) * 10000), t) })
      : r.mode === "FIXED" ? t("rule.mode.fixedShort") : t("rule.mode.platformShort");

  const actions = (r: RuleRow): RowAction[] => canUpdate ? [
    { label: t("common.action.edit"), kind: "edit", onClick: () => openEdit(r) },
    { label: t("common.action.delete"), kind: "delete", danger: true, onClick: () => setDeleting(r) },
  ] : [];

  const columns: DataColumn<RuleRow>[] = [
    { key: "model", header: t("common.field.model"), cell: (r) => <code className="text-xs">{r.model}</code> },
    { key: "mode", header: t("rule.column.mode"), cell: (r) => modeText(r) },
    { key: "official", header: t("rule.column.official"), cell: (r) => <span className="tabular-nums text-xs text-[var(--muted-foreground)]">{pricePair(r.official, t)}</span> },
    { key: "price", header: t("rule.column.price"), cell: (r) => <span className="tabular-nums text-xs">{pricePair(r.price, t)}</span> },
    { key: "discount", header: t("rule.column.discount"), cell: (r) => discountText(r.discountBp, t) },
    { key: "status", header: t("rule.column.margin"), cell: (r) => <span className="inline-flex flex-col gap-0.5">
      <span className={`inline-flex w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status] ?? ""}`}>{t(`rule.status.${r.status}`)}</span>
      {r.worst && <span className="text-[11px] text-[var(--muted-foreground)]">{t("rule.worst", { channel: r.worst.channelName, margin: (r.worst.marginBp / 100).toFixed(1) })}</span>}
    </span> },
    { key: "remark", header: t("common.field.remark"), cell: (r) => <span className="text-xs text-[var(--muted-foreground)]">{r.remark ?? "-"}</span> },
    { key: "actions", header: t("common.field.actions"), headerClassName: "text-right", className: "text-right", cell: (r) => <RowActions primary={actions(r)} /> },
  ];

  const shownModels = models.filter((m) => !query.trim() || m.model.toLowerCase().includes(query.trim().toLowerCase()));
  const anyTiered = form ? form.models.some((m) => models.find((x) => x.model === m)?.tiers) : false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted-foreground)]">{t(subjectType === "USER" ? "rule.hint.user" : "rule.hint.group")}</p>
        {canUpdate && <Button size="sm" onClick={openNew}>{t("rule.action.add")}</Button>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <DataTable columns={columns} rows={rules ?? []} rowKey={(r) => r.id} loading={rules === null}
        emptyTitle={t("rule.empty.title")} emptyDescription={t("rule.empty.description")} />

      <Drawer open={form != null} onClose={() => setForm(null)} title={form?.editing ? t("rule.editTitle") : t("rule.addTitle")}
        description={t("rule.formDescription")} widthClassName="max-w-xl"
        footer={<><Button variant="outline" onClick={() => setForm(null)}>{t("common.action.cancel")}</Button>
          <Button onClick={() => void save()} disabled={saving || !form || form.models.length === 0 || preview?.status === "LOSS"}>{saving ? t("common.action.saving") : t("common.action.save")}</Button></>}>
        {form && <div className="space-y-4">
          <Field label={t("rule.field.models")}>
            {form.editing ? <code className="text-sm">{form.models[0]}</code> : <div className="rounded-lg border border-[var(--border)]">
              <div className="border-b border-[var(--border)] p-2"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("rule.field.search")} className="h-8" /></div>
              <div className="max-h-48 overflow-y-auto p-1">
                {shownModels.map((m) => (
                  <label key={m.model} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--muted)]">
                    <input type="checkbox" checked={form.models.includes(m.model)}
                      onChange={(e) => setForm({ ...form, models: e.target.checked ? [...form.models, m.model] : form.models.filter((x) => x !== m.model) })} />
                    <code>{m.model}</code>
                    <span className="ml-auto tabular-nums text-[var(--muted-foreground)]">{m.perRequestPrice != null ? t("rule.perRequest", { price: (m.perRequestPrice / 1e6).toFixed(4) }) : `$${m.inputPrice} / $${m.outputPrice}`}</span>
                    {m.access === "RULES_ONLY" && <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t("rule.restricted")}</span>}
                  </label>
                ))}
              </div>
            </div>}
            {form.models.length > 1 && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("rule.batch", { count: form.models.length })}</p>}
          </Field>

          <div className="space-y-2">
            {(["OFFICIAL_DISCOUNT", "FIXED", "PLATFORM"] as const).map((m) => {
              const disabled = m === "FIXED" && (form.models.length !== 1 || anyTiered);
              return (
                <label key={m} className={`flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm ${disabled ? "opacity-50" : ""}`}>
                  <input type="radio" name="rule-mode" checked={form.mode === m} disabled={disabled} onChange={() => setForm({ ...form, mode: m })} className="mt-0.5" />
                  <span><span className="font-medium">{t(`rule.mode.${m}`)}</span><br /><span className="text-xs text-[var(--muted-foreground)]">{t(`rule.modeHint.${m}`)}</span></span>
                </label>
              );
            })}
          </div>

          {form.mode === "OFFICIAL_DISCOUNT" && <Field label={t("rule.field.discount")}>
            <Input value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} inputMode="decimal" />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{Number(form.discount) > 0 ? t("rule.discountMeans", { zhe: discountText(Math.round(Number(form.discount) * 10000), t) }) : ""}</p>
          </Field>}
          {form.mode === "FIXED" && (perRequestModel
            ? <Field label={t("rule.field.perRequest")}><Input value={form.perRequest} onChange={(e) => setForm({ ...form, perRequest: e.target.value })} inputMode="decimal" /></Field>
            : <div className="grid grid-cols-2 gap-3">
              <Field label={t("price.field.inputPrice")}><Input value={form.input} onChange={(e) => setForm({ ...form, input: e.target.value })} inputMode="decimal" /></Field>
              <Field label={t("price.field.outputPrice")}><Input value={form.output} onChange={(e) => setForm({ ...form, output: e.target.value })} inputMode="decimal" /></Field>
              <Field label={t("price.field.cacheReadPrice")}><Input value={form.cacheRead} placeholder={t("rule.field.followPlaceholder")} onChange={(e) => setForm({ ...form, cacheRead: e.target.value })} inputMode="decimal" /></Field>
              <Field label={t("price.field.cacheWritePrice")}><Input value={form.cacheWrite} placeholder={t("rule.field.followPlaceholder")} onChange={(e) => setForm({ ...form, cacheWrite: e.target.value })} inputMode="decimal" /></Field>
            </div>)}
          <Field label={t("common.field.remark")}><Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder={t("rule.field.remarkPlaceholder")} /></Field>

          {previewError && <Alert tone="error">{previewError}</Alert>}
          {preview && <div className="space-y-2 rounded-lg border border-[var(--border)] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>{t("rule.preview.price", { price: pricePair(preview.price, t), zhe: discountText(preview.discountBp, t) })}</span>
              <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[preview.status] ?? ""}`}>{t(`rule.status.${preview.status}`)}</span>
            </div>
            {preview.groups.length > 0 && <p className="text-xs text-[var(--muted-foreground)]">{t("rule.preview.groups", { groups: preview.groups.join(", ") })}</p>}
            {preview.combos.map((c, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>{t("rule.preview.combo", { channel: c.channelName, group: c.groupCode })}</span>
                <span className={c.status === "LOSS" ? "text-red-600" : c.status === "THIN" ? "text-amber-600" : "text-[var(--muted-foreground)]"}>{t("rule.preview.margin", { margin: (c.marginBp / 100).toFixed(1) })}</span>
              </div>
            ))}
            {preview.status === "LOSS" && <p className="text-xs text-red-600">{t("rule.preview.loss")}</p>}
          </div>}
          {results.length > 0 && <Alert tone={results.some((l) => l.includes("✗")) ? "warning" : "info"}>{results.map((l) => <div key={l}>{l}</div>)}</Alert>}
        </div>}
      </Drawer>

      <ConfirmDialog open={deleting != null} title={t("rule.delete.title", { model: deleting?.model ?? "" })} description={t("rule.delete.description")}
        confirmLabel={t("common.action.delete")} onCancel={() => setDeleting(null)} onConfirm={() => deleting && void remove(deleting)} />
    </div>
  );
}
