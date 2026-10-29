"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission } from "@neton/application-front-runtime/client-context";
import { formatDateTime } from "@neton/application-front-runtime/types";
import { Alert, Button, Drawer, Field, Input } from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

export interface CostChannel {
  id: number; name: string; costSource?: string | null; costDiscount?: string | null;
  costSyncedAt?: number | null; costSyncError?: string | null;
}
interface CostRow {
  id: number; channelId: number; model: string; inputPrice: string; outputPrice: string; cacheReadPrice: string; cacheWritePrice: string;
  perRequestPrice?: number | null; tiers?: string | null; source: string; stale: number; updatedAt: number;
}
interface PendingRow { id: number; model: string; before?: string | null; after?: string | null; createdAt?: number | null }
interface CostList { costs: CostRow[]; pending: PendingRow[] }
interface SyncResult { updated: number; pending: number; stale: number; error?: string | null }

const EMPTY = { model: "", inputPrice: "", outputPrice: "", cacheReadPrice: "0", cacheWritePrice: "0" };

function inOut(snapshot?: string | null): string {
  if (!snapshot) return "-";
  try { const o = JSON.parse(snapshot) as Record<string, unknown>; return `$${o.input ?? "0"} / $${o.output ?? "0"}`; } catch { return "-"; }
}

/**
 * 渠道的实际成本价：每个对外模型一行（来源、是否过期），可手填 / 删除；上游价目渠道可立即同步，
 * 并处理同步时挂起的异常变动（大幅涨跌或变 0）。没有成本行的模型按「官方价 × 折扣」计成本。
 */
export function ChannelCostDrawer({ channel, onClose }: { channel: CostChannel | null; onClose: () => void }) {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const canUpdate = usePermission("gateway:channel:update");
  const [data, setData] = React.useState<CostList | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!channel) return;
    setError(null);
    try { setData(await apiFetch<CostList>(`/admin/gateway/channel-cost/list?channelId=${channel.id}`)); }
    catch (cause) { setError(describeError(cause)); }
  }, [channel]);
  React.useEffect(() => { setData(null); setNotice(null); setForm(null); void load(); }, [load]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null);
    try { await action(); if (done) setNotice(done); await load(); }
    catch (cause) { setError(describeError(cause)); }
    finally { setBusy(false); }
  }

  async function syncNow() {
    if (!channel) return;
    setBusy(true); setError(null);
    try {
      const r = await apiWrite<SyncResult>(`/admin/gateway/channel-cost/sync?channelId=${channel.id}`, "POST", {});
      setNotice(r.error ? t("channelCost.sync.failed", { error: r.error }) : t("channelCost.sync.done", { updated: r.updated, pending: r.pending, stale: r.stale }));
      await load();
    } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  }

  const upstream = channel?.costSource === "upstream";
  return (
    <Drawer open={channel != null} onClose={onClose} title={channel ? t("channelCost.title", { name: channel.name }) : ""}
      description={upstream ? t("channelCost.description.upstream") : t("channelCost.description.official", { discount: channel?.costDiscount ?? "1" })}
      footer={<Button variant="outline" onClick={onClose}>{t("common.action.close")}</Button>}>
      {channel && <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}
        {upstream && <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3 text-xs">
          <span>
            {channel.costSyncedAt ? t("channelCost.lastSync", { time: formatDateTime(channel.costSyncedAt) }) : t("channelCost.neverSynced")}
            {channel.costSyncError && <span className="block text-red-600">{t("channelCost.syncError", { error: channel.costSyncError })}</span>}
          </span>
          {canUpdate && <Button variant="outline" disabled={busy} onClick={() => void syncNow()}>{t("channelCost.action.sync")}</Button>}
        </div>}

        {data && data.pending.length > 0 && <div className="space-y-2">
          <div className="text-xs font-semibold text-amber-700">{t("channelCost.pending.title", { count: data.pending.length })}</div>
          {data.pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:bg-amber-950/30">
              <span className="min-w-0"><code>{p.model}</code> <span className="tabular-nums text-[var(--muted-foreground)]">{inOut(p.before)} → {inOut(p.after)}</span></span>
              {canUpdate && <span className="flex shrink-0 gap-1">
                <Button variant="outline" disabled={busy} onClick={() => void run(() => apiWrite(`/admin/gateway/channel-cost/pending/${p.id}/accept`, "POST", {}))}>{t("channelCost.pending.accept")}</Button>
                <Button variant="ghost" disabled={busy} onClick={() => void run(() => apiWrite(`/admin/gateway/channel-cost/pending/${p.id}/ignore`, "POST", {}))}>{t("channelCost.pending.ignore")}</Button>
              </span>}
            </div>
          ))}
          <p className="text-[11px] text-[var(--muted-foreground)]">{t("channelCost.pending.hint")}</p>
        </div>}

        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {data && data.costs.length === 0 && <p className="p-3 text-xs text-[var(--muted-foreground)]">{t("channelCost.empty")}</p>}
          {data?.costs.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 text-xs">
              <span className="min-w-0">
                <code>{c.model}</code>
                <span className="ml-2 tabular-nums">{c.perRequestPrice != null ? t("price.perRequest", { price: (c.perRequestPrice / 1e6).toFixed(4) }) : `$${c.inputPrice} / $${c.outputPrice}`}</span>
                <span className="ml-2 text-[var(--muted-foreground)]">{t(`channelCost.source.${c.source}`)}{c.tiers ? ` · ${t("channelCost.tiered")}` : ""}</span>
                {c.stale === 1 && <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">{t("channelCost.stale")}</span>}
              </span>
              {canUpdate && <span className="flex shrink-0 gap-1">
                <Button variant="ghost" disabled={busy} onClick={() => setForm({ model: c.model, inputPrice: c.inputPrice, outputPrice: c.outputPrice, cacheReadPrice: c.cacheReadPrice, cacheWritePrice: c.cacheWritePrice })}>{t("channelCost.action.edit")}</Button>
                <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(t("channelCost.delete.confirm", { model: c.model }))) void run(() => apiWrite(`/admin/gateway/channel-cost/delete?channelId=${channel.id}&model=${encodeURIComponent(c.model)}`, "DELETE")); }}>{t("common.action.delete")}</Button>
              </span>}
            </div>
          ))}
        </div>

        {canUpdate && !form && <Button variant="outline" onClick={() => setForm({ ...EMPTY })}>{t("channelCost.action.add")}</Button>}
        {form && <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <Field label={t("common.field.model")}><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("price.field.inputPrice")}><Input value={form.inputPrice} onChange={(e) => setForm({ ...form, inputPrice: e.target.value })} /></Field>
            <Field label={t("price.field.outputPrice")}><Input value={form.outputPrice} onChange={(e) => setForm({ ...form, outputPrice: e.target.value })} /></Field>
            <Field label={t("price.field.cacheReadPrice")}><Input value={form.cacheReadPrice} onChange={(e) => setForm({ ...form, cacheReadPrice: e.target.value })} /></Field>
            <Field label={t("price.field.cacheWritePrice")}><Input value={form.cacheWritePrice} onChange={(e) => setForm({ ...form, cacheWritePrice: e.target.value })} /></Field>
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)]">{t("channelCost.manual.hint")}</p>
          <div className="flex gap-2">
            <Button disabled={busy || !form.model.trim() || !form.inputPrice || !form.outputPrice}
              onClick={() => void run(async () => { await apiWrite("/admin/gateway/channel-cost/manual", "PUT", { channelId: channel.id, ...form, model: form.model.trim() }); setForm(null); })}>{t("common.action.save")}</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>{t("common.action.cancel")}</Button>
          </div>
        </div>}
      </div>}
    </Drawer>
  );
}
