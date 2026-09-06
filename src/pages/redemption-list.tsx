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
 * - 列表返回的是**完整码**（后端 format() 只是加分隔符，不是打码）。所以「明文只展示一次」
 *   在这里并不成立：拿到 gateway:redemption:list 的人就能读到所有未使用的码并自行兑换。
 *   在后端加脱敏之前，这条权限不能给只读审计角色 —— 页面下方也照实写了，不假装有保护。
 * - 批次可能**半失败**：logic 逐张插入，中途失败会把已插入的留下并抛 500，消息里带批次号。
 *   apiWrite 抛的就是后端 message，所以那句话会原样显示给运营，据此按批次号回查即可，
 *   不需要前端猜哪些成功了。
 */
export default function Page() {
  const canCreate = usePermission("gateway:redemption:create");
  const canGet = usePermission("gateway:redemption:get");
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
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(page, pageSize, filters); }, [load, page, pageSize, filters]);

  async function generate() {
    const quotaMicro = Number(gen.quotaMicro);
    const count = Number(gen.count || "1");
    // 只做形状校验。上限（单次 1000 张、备注 255 字）交给后端说，前端抄一份常量只会随版本漂。
    if (!Number.isInteger(quotaMicro) || quotaMicro <= 0) { setError("面额必须是正整数（μUSD）"); return; }
    if (!Number.isInteger(count) || count <= 0) { setError("数量必须是正整数"); return; }
    const body: Record<string, unknown> = { quotaMicro, count };
    if (gen.expiresAt) {
      const at = new Date(gen.expiresAt).getTime();
      if (Number.isNaN(at)) { setError("过期时间格式不对"); return; }
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
    } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }

  async function openStats(batchId: string) {
    setError(null);
    try { setStats(await apiFetch<StatsVO>(`/admin/gateway/redemption/stats/${encodeURIComponent(batchId)}`)); }
    catch (cause) { setError((cause as Error).message); }
  }

  async function disableOne(row: CodeVO) {
    try {
      await apiWrite<CodeVO>(`/admin/gateway/redemption/disable/${row.id}`, "POST");
      setRevoking(null);
      await load(page, pageSize, filters);
    } catch (cause) { setError((cause as Error).message); setRevoking(null); }
  }

  async function disableBatch() {
    const bid = stopBatchId.trim();
    if (!bid) { setError("请填写要整批作废的批次号"); return; }
    try {
      const vo = await apiWrite<{ batchId: string; disabled: number }>("/admin/gateway/redemption/disable-batch", "POST", { batchId: bid });
      setBatchStop(false);
      // disabled=0 是合法结果（这批本来就全用完或已作废），不是失败，所以要把它说出来而不是静默。
      setStopBatchId("");
      const next = { batchId: vo.batchId, status: "" };
      setDraft(next); setFilters(next); setPage(1);
      setNotice(`批次 ${vo.batchId} 整批作废完成：本次作废 ${vo.disabled} 张（0 表示这批本来就没有未使用的码）。`);
    } catch (cause) { setError((cause as Error).message); setBatchStop(false); }
  }

  const actions = (row: CodeVO): RowAction[] => [
    ...(canGet && row.batchId ? [{ label: "批次", kind: "list" as const, onClick: () => void openStats(row.batchId as string) }] : []),
    ...(canDisable && row.status === 0
      ? [{ label: "作废", danger: true, kind: "disable" as const, onClick: () => setRevoking(row) }]
      : []),
  ];

  const columns: DataColumn<CodeVO>[] = [
    { key: "id", header: "ID", cell: (r) => r.id },
    { key: "code", header: "兑换码", cell: (r) => <code className="text-xs">{r.code}</code> },
    { key: "quotaMicro", header: "面额", cell: (r) => <span className="tabular-nums">{usd(r.quotaMicro)}</span> },
    { key: "status", header: "状态", cell: (r) => <StatusBadge active={r.status === 0}>{r.statusText}</StatusBadge> },
    { key: "batchId", header: "批次", cell: (r) => (r.batchId ? <code className="text-xs">{r.batchId}</code> : "-") },
    { key: "usedUserId", header: "兑换人", cell: (r) => r.usedUserId ?? "-" },
    { key: "usedAt", header: "兑换时间", cell: (r) => formatDateTime(r.usedAt) },
    { key: "expiresAt", header: "过期时间", cell: (r) => formatDateTime(r.expiresAt) },
    { key: "note", header: "备注", cell: (r) => r.note || "-" },
    ...((canGet || canDisable) ? [{
      key: "ops", header: "操作", headerClassName: "text-right", className: "text-right",
      cell: (row: CodeVO) => <RowActions primary={actions(row)} />,
    } satisfies DataColumn<CodeVO>] : []),
  ];

  const plannedTotal = Number(gen.quotaMicro) > 0 && Number(gen.count || "1") > 0
    ? Number(gen.quotaMicro) * Number(gen.count || "1") : 0;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="GATEWAY" title="兑换码"
        description="预付卡：用户自助兑换后额度直接入账。作废只能作废未使用的码；整批作废用于码外泄时止损。"
        actions={<>
          {canCreate && <Button onClick={() => { setError(null); setGenerating(true); }}>生成批次</Button>}
          {canDisable && <Button variant="outline" onClick={() => { setError(null); setStopBatchId(filters.batchId); setBatchStop(true); }}>整批作废</Button>}
          <Button variant="outline" onClick={() => void load(page, pageSize, filters)} disabled={loading}>刷新</Button>
        </>} />

      {notice && <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs text-[var(--foreground)]">{notice}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      <FilterPanel onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1"><Field label="批次号">
            <Input value={draft.batchId} placeholder="留空=全部批次" onChange={(e) => setDraft({ ...draft, batchId: e.target.value })} />
          </Field></div>
          <div className="min-w-40"><Field label="状态">
            <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">全部</option>
              <option value="0">未使用</option>
              <option value="1">已使用</option>
              <option value="2">已作废</option>
            </Select>
          </Field></div>
          <Button type="button" variant="ghost" onClick={() => { const n = { batchId: "", status: "" }; setDraft(n); setFilters(n); setPage(1); }}>重置</Button>
          <Button type="submit">查询</Button>
        </div>
      </FilterPanel>

      <section className="front-surface overflow-hidden rounded-xl">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} />
        <Pagination page={page} pageSize={pageSize} total={total} loading={loading}
          onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      <p className="text-xs text-[var(--muted-foreground)]">
        注意：列表返回的是完整兑换码，不是脱敏值 —— 能看这一页的人就能兑换其中任何一张未使用的码。
        在后端加脱敏之前，不要把 gateway:redemption:list 授予只读审计角色。
        「状态」列的过期判定由后端算，前端不重复实现。
      </p>

      <Drawer open={generating} onClose={() => setGenerating(false)} title="生成兑换码批次"
        footer={<><Button variant="outline" onClick={() => setGenerating(false)}>取消</Button>
          <Button onClick={() => void generate()} disabled={saving}>{saving ? "生成中…" : "生成"}</Button></>}>
        <div className="space-y-4">
          <Field label="单张面额（μUSD，1000000 = 1 美元）">
            <Input type="number" min={1} value={gen.quotaMicro} onChange={(e) => setGen({ ...gen, quotaMicro: e.target.value })} />
          </Field>
          <Field label="数量（单次上限由后端定，超出会回一句可操作的原因）">
            <Input type="number" min={1} value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} />
          </Field>
          {plannedTotal > 0 && <p className="text-xs text-[var(--muted-foreground)]">
            本批总面额 ≈ {usd(plannedTotal)}（全部被兑换时的负债上限）。
          </p>}
          <Field label="过期时间（留空=永不过期）">
            <Input type="datetime-local" value={gen.expiresAt} onChange={(e) => setGen({ ...gen, expiresAt: e.target.value })} />
          </Field>
          <Field label="备注（活动名 / 审批单号）">
            <Textarea value={gen.note} onChange={(e) => setGen({ ...gen, note: e.target.value })} />
          </Field>
        </div>
      </Drawer>

      <Drawer open={issued != null} onClose={() => setIssued(null)}
        title={issued && issued.codes.length > 0 ? `批次 ${issued.batchId} 已生成 ${issued.codes.length} 张` : `批次 ${issued?.batchId ?? ""}`}
        description="复制后立即分发；列表里也能查到这些码（后端未脱敏），所以别把它当成一次性密钥。"
        footer={<Button onClick={() => setIssued(null)}>关闭</Button>}>
        {issued && issued.codes.length > 0 && (
          <div className="space-y-3">
            <code className="block max-h-80 overflow-auto break-all rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs leading-6">
              {issued.codes.join("\n")}
            </code>
            <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(issued.codes.join("\n"))}>复制全部</Button>
          </div>
        )}
      </Drawer>

      <Drawer open={stats != null} onClose={() => setStats(null)} title={`批次 ${stats?.batchId ?? ""} 核销情况`}
        footer={<Button variant="outline" onClick={() => setStats(null)}>关闭</Button>}>
        {stats && <dl className="overflow-hidden rounded-xl border border-[var(--border)]">
          {[
            ["总数", String(stats.total)],
            ["未使用", String(stats.unused)],
            ["已使用", String(stats.used)],
            ["已作废", String(stats.disabled)],
            ["已过期", String(stats.expired)],
            ["单张面额", `${usd(stats.quotaMicro)}（${stats.quotaMicro} μUSD）`],
            ["已核销总额", `${usd(stats.redeemedMicro)}（${stats.redeemedMicro} μUSD）`],
            ["未核销负债", usd(stats.quotaMicro * stats.unused)],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-[var(--border)] p-3 last:border-0">
              <dt className="text-xs font-semibold text-[var(--muted-foreground)]">{k}</dt>
              <dd className="break-all text-sm text-[var(--foreground)]">{v}</dd>
            </div>
          ))}
        </dl>}
      </Drawer>

      <ConfirmDialog open={revoking != null} title={`作废兑换码 ${revoking?.code ?? ""}`}
        description="作废后这张码兑不出去，且不能恢复（后端没有反向操作）。已使用的码不会被作废。"
        confirmLabel="确认作废" onCancel={() => setRevoking(null)} onConfirm={() => revoking && void disableOne(revoking)} />

      <Drawer open={batchStop} onClose={() => setBatchStop(false)} title="整批作废"
        description="码外泄时的止损入口：只作废该批次里未使用的码，已使用的不动。"
        footer={<><Button variant="outline" onClick={() => setBatchStop(false)}>取消</Button>
          <Button variant="destructive" onClick={() => void disableBatch()}>确认整批作废</Button></>}>
        <div className="space-y-3">
          <Field label="批次号"><Input value={stopBatchId} onChange={(e) => setStopBatchId(e.target.value)} /></Field>
          <p className="text-xs text-[var(--muted-foreground)]">
            作废 0 张是合法结果（这批本来就全用完或已作废），不会报错。
          </p>
        </div>
      </Drawer>
    </div>
  );
}
