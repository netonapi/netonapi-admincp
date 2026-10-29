"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission } from "@neton/application-front-runtime/client-context";
import type { PageResponse } from "@neton/application-front-runtime/types";
import { formatDateTime } from "@neton/application-front-runtime/types";
import {
  Button, ConfirmDialog, DataTable, Drawer, Field, FilterPanel, Input, PageHeader,
  Pagination, RowActions, Select, StatusBadge, Textarea,
  type DataColumn, type RowAction,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

interface CodeVO {
  id: number; code: string; quotaMicro: number; status: number; statusText: string;
  usedUserId?: number | null; usedAt?: number | null; expiresAt?: number | null;
  batchId?: string | null; note?: string | null; createdBy?: number | null; createdAt?: number | null;
}
interface GeneratedVO { batchId: string; count: number; quotaMicro: number; expiresAt?: number | null; note?: string | null; codes: string[] }
interface StatsVO {
  batchId: string; total: number; unused: number; used: number; disabled: number;
  expired: number; quotaMicro: number; redeemedMicro: number;
}

/** μUSD → 美元。全站 gateway 前端的额度列都是裸 μUSD（见 token-list / log-list），
 *  只有这里换算：面额是运营手填的，填错一个数量级就是真金白银，值得多一行提示。 */
function usd(micro: number): string {
  const v = micro / 1_000_000;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 6 : 2 })}`;
}

const EMPTY_GEN = { quotaMicro: "", count: "1", expiresAt: "", note: "" };

/**
 * 兑换码（预付卡）。手写而不是套 ResourcePage，因为后端根本不是 CRUD：
 * 只有 generate / page / stats / disable / disable-batch，没有 create、update、delete，
 * ResourcePage 的路径约定（create / update / delete/{id}）一条都对不上。
 *
 * 两处要如实说明的地方：
 * - 列表返回的是**脱敏码**（后端 redact()：保首尾两组、中间两组打 `*`）。完整明文只在
 *   /generate 那一刻下发一次，之后管理端任何响应都给不出来 —— 所以「明文只展示一次」在这里
 *   是成立的，gateway:redemption:list 可以交给只读审计角色。首尾两组留着是因为客服要能拿
 *   客户电话里念的码对上库里哪一行，客户不会报 id。代价是运营弄丢了生成时那份导出就找不
 *   回来，处置与 API 令牌同纪律：整批作废 + 重新生成，不找回。
 * - 批次可能**半失败**：logic 逐张插入，中途失败会把已插入的留下并抛 500（服务端日志带批次号）。
 *   列表按创建倒序，已入库的那部分连同批次号就在最上面，运营据此整批作废后重新生成即可。
 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const canCreate = usePermission("gateway:redemption:create");
  const canGet = usePermission("gateway:redemption:query");
  const canDisable = usePermission("gateway:redemption:disable");

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [draft, setDraft] = React.useState({ batchId: "", status: "" });
  const [filters, setFilters] = React.useState(draft);

  const [rows, setRows] = React.useState<CodeVO[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [generating, setGenerating] = React.useState(false);
  const [gen, setGen] = React.useState(EMPTY_GEN);
  const [saving, setSaving] = React.useState(false);
  const [issued, setIssued] = React.useState<GeneratedVO | null>(null);
  const [stats, setStats] = React.useState<StatsVO | null>(null);
  const [revoking, setRevoking] = React.useState<CodeVO | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [batchStop, setBatchStop] = React.useState(false);
  const [stopBatchId, setStopBatchId] = React.useState("");

  const load = React.useCallback(async (nextPage: number, nextSize: number, f: { batchId: string; status: string }) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ pageNo: String(nextPage), pageSize: String(nextSize) });
      if (f.batchId.trim()) params.set("batchId", f.batchId.trim());
      if (f.status !== "") params.set("status", f.status);
      const data = await apiFetch<PageResponse<CodeVO>>(`/admin/gateway/redemption/page?${params}`);
      setRows(data.list); setTotal(data.total);
    } catch (cause) { setError(describeError(cause)); } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(page, pageSize, filters); }, [load, page, pageSize, filters]);

  async function generate() {
    const quotaMicro = Number(gen.quotaMicro);
    const count = Number(gen.count || "1");
    // 只做形状校验。上限（单次 1000 张、备注 255 字）交给后端说，前端抄一份常量只会随版本漂。
    if (!Number.isInteger(quotaMicro) || quotaMicro <= 0) { setError(t("redemption.error.quota")); return; }
    if (!Number.isInteger(count) || count <= 0) { setError(t("redemption.error.count")); return; }
    const body: Record<string, unknown> = { quotaMicro, count };
    if (gen.expiresAt) {
      const at = new Date(gen.expiresAt).getTime();
      if (Number.isNaN(at)) { setError(t("redemption.error.expiresAt")); return; }
      body.expiresAt = at;
    }
    if (gen.note.trim()) body.note = gen.note.trim();
    setSaving(true); setError(null);
    try {
      const vo = await apiWrite<GeneratedVO>("/admin/gateway/redemption/generate", "POST", body);
      setIssued(vo); setGenerating(false); setGen(EMPTY_GEN);
      // 落到刚生成的那一批上：运营接下来要做的第一件事就是核对这批。
      const next = { batchId: vo.batchId, status: "" };
      setDraft(next); setFilters(next); setPage(1);
    } catch (cause) { setError(describeError(cause)); } finally { setSaving(false); }
  }

  async function openStats(batchId: string) {
    setError(null);
    try { setStats(await apiFetch<StatsVO>(`/admin/gateway/redemption/stats/${encodeURIComponent(batchId)}`)); }
    catch (cause) { setError(describeError(cause)); }
  }

  async function disableOne(row: CodeVO) {
    try {
      await apiWrite<CodeVO>(`/admin/gateway/redemption/disable/${row.id}`, "POST");
      setRevoking(null);
      await load(page, pageSize, filters);
    } catch (cause) { setError(describeError(cause)); setRevoking(null); }
  }

  async function disableBatch() {
    const bid = stopBatchId.trim();
    if (!bid) { setError(t("redemption.error.batchIdRequired")); return; }
    try {
      const vo = await apiWrite<{ batchId: string; disabled: number }>("/admin/gateway/redemption/disable-batch", "POST", { batchId: bid });
      setBatchStop(false);
      // disabled=0 是合法结果（这批本来就全用完或已作废），不是失败，所以要把它说出来而不是静默。
      setStopBatchId("");
      const next = { batchId: vo.batchId, status: "" };
      setDraft(next); setFilters(next); setPage(1);
      setNotice(t("redemption.batchStop.done", { batchId: vo.batchId, disabled: vo.disabled }));
    } catch (cause) { setError(describeError(cause)); setBatchStop(false); }
  }

  const actions = (row: CodeVO): RowAction[] => [
    ...(canGet && row.batchId ? [{ label: t("redemption.action.batch"), kind: "list" as const, onClick: () => void openStats(row.batchId as string) }] : []),
    ...(canDisable && row.status === 0
      ? [{ label: t("redemption.action.disable"), danger: true, kind: "disable" as const, onClick: () => setRevoking(row) }]
      : []),
  ];

  const columns: DataColumn<CodeVO>[] = [
    { key: "id", header: "ID", cell: (r) => r.id },
    { key: "code", header: t("redemption.column.code"), cell: (r) => <code className="text-xs">{r.code}</code> },
    { key: "quotaMicro", header: t("redemption.column.quota"), cell: (r) => <span className="tabular-nums">{usd(r.quotaMicro)}</span> },
    { key: "status", header: t("common.field.status"), cell: (r) => <StatusBadge active={r.status === 0}>{r.statusText}</StatusBadge> },
    { key: "batchId", header: t("redemption.column.batchId"), cell: (r) => (r.batchId ? <code className="text-xs">{r.batchId}</code> : "-") },
    { key: "usedUserId", header: t("redemption.column.usedUserId"), cell: (r) => r.usedUserId ?? "-" },
    { key: "usedAt", header: t("redemption.column.usedAt"), cell: (r) => formatDateTime(r.usedAt) },
    { key: "expiresAt", header: t("redemption.column.expiresAt"), cell: (r) => formatDateTime(r.expiresAt) },
    { key: "note", header: t("common.field.remark"), cell: (r) => r.note || "-" },
    ...((canGet || canDisable) ? [{
      key: "ops", header: t("common.field.actions"), headerClassName: "text-right", className: "text-right",
      cell: (row: CodeVO) => <RowActions primary={actions(row)} />,
    } satisfies DataColumn<CodeVO>] : []),
  ];

  const plannedTotal = Number(gen.quotaMicro) > 0 && Number(gen.count || "1") > 0
    ? Number(gen.quotaMicro) * Number(gen.count || "1") : 0;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("common.eyebrow")} title={t("redemption.title")}
        description={t("redemption.description")}
        actions={<>
          {canCreate && <Button onClick={() => { setError(null); setGenerating(true); }}>{t("redemption.action.generate")}</Button>}
          {canDisable && <Button variant="outline" onClick={() => { setError(null); setStopBatchId(filters.batchId); setBatchStop(true); }}>{t("redemption.action.disableBatch")}</Button>}
          <Button variant="outline" onClick={() => void load(page, pageSize, filters)} disabled={loading}>{t("common.action.refresh")}</Button>
        </>} />

      {notice && <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs text-[var(--foreground)]">{notice}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      <FilterPanel onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1"><Field label={t("redemption.field.batchId")}>
            <Input value={draft.batchId} placeholder={t("redemption.placeholder.batchId")} onChange={(e) => setDraft({ ...draft, batchId: e.target.value })} />
          </Field></div>
          <div className="min-w-40"><Field label={t("common.field.status")}>
            <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">{t("redemption.status.all")}</option>
              <option value="0">{t("redemption.status.unused")}</option>
              <option value="1">{t("redemption.status.used")}</option>
              <option value="2">{t("redemption.status.disabled")}</option>
            </Select>
          </Field></div>
          <Button type="button" variant="ghost" onClick={() => { const n = { batchId: "", status: "" }; setDraft(n); setFilters(n); setPage(1); }}>{t("common.action.reset")}</Button>
          <Button type="submit">{t("common.action.search")}</Button>
        </div>
      </FilterPanel>

      <section className="front-surface overflow-hidden rounded-xl">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} />
        <Pagination page={page} pageSize={pageSize} total={total} loading={loading}
          onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      <p className="text-xs text-[var(--muted-foreground)]">
        {t("redemption.hint.redacted")}
      </p>

      <Drawer open={generating} onClose={() => setGenerating(false)} title={t("redemption.generate.title")}
        footer={<><Button variant="outline" onClick={() => setGenerating(false)}>{t("common.action.cancel")}</Button>
          <Button onClick={() => void generate()} disabled={saving}>{saving ? t("redemption.generate.generating") : t("redemption.generate.submit")}</Button></>}>
        <div className="space-y-4">
          <Field label={t("redemption.generate.quota")}>
            <Input type="number" min={1} value={gen.quotaMicro} onChange={(e) => setGen({ ...gen, quotaMicro: e.target.value })} />
          </Field>
          <Field label={t("redemption.generate.count")}>
            <Input type="number" min={1} value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} />
          </Field>
          {plannedTotal > 0 && <p className="text-xs text-[var(--muted-foreground)]">
            {t("redemption.generate.total", { total: usd(plannedTotal) })}
          </p>}
          <Field label={t("redemption.generate.expiresAt")}>
            <Input type="datetime-local" value={gen.expiresAt} onChange={(e) => setGen({ ...gen, expiresAt: e.target.value })} />
          </Field>
          <Field label={t("redemption.generate.note")}>
            <Textarea value={gen.note} onChange={(e) => setGen({ ...gen, note: e.target.value })} />
          </Field>
        </div>
      </Drawer>

      <Drawer open={issued != null} onClose={() => setIssued(null)}
        title={issued && issued.codes.length > 0 ? t("redemption.issued.title", { batchId: issued.batchId, count: issued.codes.length }) : t("redemption.issued.batch", { batchId: issued?.batchId ?? "" })}
        description={t("redemption.issued.description")}
        footer={<Button onClick={() => setIssued(null)}>{t("common.action.close")}</Button>}>
        {issued && issued.codes.length > 0 && (
          <div className="space-y-3">
            <code className="block max-h-80 overflow-auto break-all rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs leading-6">
              {issued.codes.join("\n")}
            </code>
            <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(issued.codes.join("\n"))}>{t("redemption.issued.copyAll")}</Button>
          </div>
        )}
      </Drawer>

      <Drawer open={stats != null} onClose={() => setStats(null)} title={t("redemption.stats.title", { batchId: stats?.batchId ?? "" })}
        footer={<Button variant="outline" onClick={() => setStats(null)}>{t("common.action.close")}</Button>}>
        {stats && <dl className="overflow-hidden rounded-xl border border-[var(--border)]">
          {[
            [t("redemption.stats.total"), String(stats.total)],
            [t("redemption.status.unused"), String(stats.unused)],
            [t("redemption.status.used"), String(stats.used)],
            [t("redemption.status.disabled"), String(stats.disabled)],
            [t("redemption.status.expired"), String(stats.expired)],
            [t("redemption.stats.quota"), t("redemption.stats.usdWithMicro", { usd: usd(stats.quotaMicro), micro: stats.quotaMicro })],
            [t("redemption.stats.redeemed"), t("redemption.stats.usdWithMicro", { usd: usd(stats.redeemedMicro), micro: stats.redeemedMicro })],
            [t("redemption.stats.outstanding"), usd(stats.quotaMicro * stats.unused)],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-[var(--border)] p-3 last:border-0">
              <dt className="text-xs font-semibold text-[var(--muted-foreground)]">{k}</dt>
              <dd className="break-all text-sm text-[var(--foreground)]">{v}</dd>
            </div>
          ))}
        </dl>}
      </Drawer>

      <ConfirmDialog open={revoking != null} title={t("redemption.disable.title", { id: revoking?.id ?? 0, code: revoking?.code ?? "" })}
        description={t("redemption.disable.description")}
        confirmLabel={t("redemption.disable.confirm")} onCancel={() => setRevoking(null)} onConfirm={() => revoking && void disableOne(revoking)} />

      <Drawer open={batchStop} onClose={() => setBatchStop(false)} title={t("redemption.action.disableBatch")}
        description={t("redemption.batchStop.description")}
        footer={<><Button variant="outline" onClick={() => setBatchStop(false)}>{t("common.action.cancel")}</Button>
          <Button variant="destructive" onClick={() => void disableBatch()}>{t("redemption.batchStop.confirm")}</Button></>}>
        <div className="space-y-3">
          <Field label={t("redemption.field.batchId")}><Input value={stopBatchId} onChange={(e) => setStopBatchId(e.target.value)} /></Field>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t("redemption.batchStop.hint")}
          </p>
        </div>
      </Drawer>
    </div>
  );
}
