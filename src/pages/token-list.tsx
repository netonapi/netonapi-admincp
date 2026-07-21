"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { formatDateTime } from "@neton/application-front-runtime/types";
import {
  Button, DataTable, Drawer, Field, Input, PageHeader, RowActions, StatusBadge,
  type DataColumn, type RowAction,
} from "@neton/application-front-kit";

interface TokenVO {
  id: number; userId: number; name: string; display: string;
  quotaBudget?: number | null; quotaUsed: number; expiresAt?: number | null;
  status: number; createdAt?: number | null;
}

interface IssuedTokenVO { id: number; key: string; display: string }

/** 令牌管理：创建后明文只展示一次（后端仅存哈希）。 */
export default function Page() {
  const [userId, setUserId] = React.useState("1");
  const [rows, setRows] = React.useState<TokenVO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", quotaBudget: "" });
  const [issued, setIssued] = React.useState<IssuedTokenVO | null>(null);

  const load = React.useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      setRows(await apiFetch<TokenVO[]>(`/admin/gateway/token/list-by-user/${userId}`));
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  }, [userId]);

  React.useEffect(() => { void load(); }, [load]);

  async function create() {
    setError(null);
    try {
      const body: Record<string, unknown> = { userId: Number(userId), name: form.name };
      if (form.quotaBudget) body.quotaBudget = Number(form.quotaBudget);
      const vo = await apiWrite<IssuedTokenVO>(`/admin/gateway/token/create`, "POST", body);
      setIssued(vo); setCreating(false); setForm({ name: "", quotaBudget: "" });
      void load();
    } catch (cause) { setError((cause as Error).message); }
  }

  async function setStatus(row: TokenVO, status: number) {
    await apiWrite<void>(`/admin/gateway/token/update-status?id=${row.id}&status=${status}`, "PUT");
    void load();
  }

  const columns: DataColumn<TokenVO>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "名称" },
    { key: "display", header: "令牌" },
    { key: "quotaUsed", header: "已用 μUSD" },
    { key: "quotaBudget", header: "预算 μUSD", render: (r) => r.quotaBudget ?? "不限" },
    { key: "status", header: "状态", render: (r) => <StatusBadge value={r.status} /> },
    { key: "createdAt", header: "创建时间", render: (r) => formatDateTime(r.createdAt) },
    { key: "actions", header: "操作", render: (row) => <RowActions actions={actions(row)} /> },
  ];

  const actions = (row: TokenVO): RowAction[] => [
    row.status === 1
      ? { label: "禁用", onClick: () => void setStatus(row, 0) }
      : { label: "启用", onClick: () => void setStatus(row, 1) },
    { label: "删除", tone: "danger", onClick: async () => { await apiWrite<void>(`/admin/gateway/token/delete/${row.id}`, "DELETE"); void load(); } },
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="GATEWAY" title="API 令牌" description="sk- 令牌仅存哈希；明文只在创建时展示一次。"
        actions={<Button onClick={() => setCreating(true)}>创建令牌</Button>} />
      <div className="flex items-end gap-3">
        <Field label="用户 ID"><Input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-32" /></Field>
        <Button variant="outline" onClick={() => void load()}>查询</Button>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} error={error ?? undefined} />

      <Drawer open={creating} onClose={() => setCreating(false)} title={`为用户 ${userId} 创建令牌`}
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>取消</Button><Button onClick={() => void create()} disabled={!form.name}>创建</Button></>}>
        <div className="space-y-4">
          <Field label="名称" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="预算 μUSD（留空不限）"><Input value={form.quotaBudget} onChange={(e) => setForm({ ...form, quotaBudget: e.target.value })} /></Field>
        </div>
      </Drawer>

      <Drawer open={issued != null} onClose={() => setIssued(null)} title="令牌已创建——明文仅此一次"
        footer={<Button onClick={() => setIssued(null)}>我已保存</Button>}>
        {issued && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">请立即复制保存，关闭后无法再次查看：</p>
            <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">{issued.key}</code>
          </div>
        )}
      </Drawer>
    </div>
  );
}
