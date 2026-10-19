"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { formatDateTime } from "@neton/application-front-runtime/types";
import {
  Button, DataTable, Drawer, Field, Input, PageHeader, RowActions, StatusBadge,
  type DataColumn, type RowAction,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

interface TokenVO {
  id: number; userId: number; name: string; display: string;
  quotaBudget?: number | null; quotaUsed: number; expiresAt?: number | null;
  rpmLimit?: number | null; tpmLimit?: number | null; concurrencyLimit?: number | null;
  status: number; createdAt?: number | null;
}

interface IssuedTokenVO { id: number; key: string; display: string }

/** 令牌管理：创建后明文只展示一次（后端仅存哈希）。 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const [userId, setUserId] = React.useState("1");
  const [rows, setRows] = React.useState<TokenVO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", quotaBudget: "", rpmLimit: "", tpmLimit: "", concurrencyLimit: "" });
  const [issued, setIssued] = React.useState<IssuedTokenVO | null>(null);

  const load = React.useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      setRows(await apiFetch<TokenVO[]>(`/admin/gateway/token/list-by-user/${userId}`));
    } catch (cause) { setError(describeError(cause)); } finally { setLoading(false); }
  }, [userId]);

  React.useEffect(() => { void load(); }, [load]);

  async function create() {
    setError(null);
    try {
      const body: Record<string, unknown> = { userId: Number(userId), name: form.name };
      if (form.quotaBudget) body.quotaBudget = Number(form.quotaBudget);
      // 限流留空 = 不限；不限意味着单个令牌可打爆上游配额，建议至少设 RPM
      if (form.rpmLimit) body.rpmLimit = Number(form.rpmLimit);
      if (form.tpmLimit) body.tpmLimit = Number(form.tpmLimit);
      if (form.concurrencyLimit) body.concurrencyLimit = Number(form.concurrencyLimit);
      const vo = await apiWrite<IssuedTokenVO>(`/admin/gateway/token/create`, "POST", body);
      setIssued(vo); setCreating(false); setForm({ name: "", quotaBudget: "", rpmLimit: "", tpmLimit: "", concurrencyLimit: "" });
      void load();
    } catch (cause) { setError(describeError(cause)); }
  }

  async function setStatus(row: TokenVO, status: number) {
    await apiWrite<void>(`/admin/gateway/token/update-status?id=${row.id}&status=${status}`, "PUT");
    void load();
  }

  const columns: DataColumn<TokenVO>[] = [
    { key: "id", header: "ID", cell: (r) => r.id },
    { key: "name", header: t("common.field.name"), cell: (r) => r.name },
    { key: "display", header: t("token.column.display"), cell: (r) => r.display },
    { key: "quotaUsed", header: t("token.column.quotaUsed"), cell: (r) => r.quotaUsed },
    { key: "quotaBudget", header: t("token.column.quotaBudget"), cell: (r) => r.quotaBudget ?? t("common.unlimited") },
    { key: "rpmLimit", header: "RPM", cell: (r) => r.rpmLimit ?? t("common.unlimited") },
    { key: "tpmLimit", header: "TPM", cell: (r) => r.tpmLimit ?? t("common.unlimited") },
    { key: "concurrencyLimit", header: t("token.column.concurrencyLimit"), cell: (r) => r.concurrencyLimit ?? t("common.unlimited") },
    { key: "status", header: t("common.field.status"), cell: (r) => <StatusBadge active={r.status === 1}>{r.status === 1 ? t("common.status.enabled") : t("common.status.disabled")}</StatusBadge> },
    { key: "createdAt", header: t("common.field.createdAt"), cell: (r) => formatDateTime(r.createdAt) },
    { key: "actions", header: t("common.field.actions"), cell: (row) => <RowActions primary={actions(row)} /> },
  ];

  const actions = (row: TokenVO): RowAction[] => [
    row.status === 1
      ? { label: t("common.action.disable"), onClick: () => void setStatus(row, 0) }
      : { label: t("common.action.enable"), onClick: () => void setStatus(row, 1) },
    { label: t("common.action.delete"), danger: true, kind: "delete", onClick: async () => { await apiWrite<void>(`/admin/gateway/token/delete/${row.id}`, "DELETE"); void load(); } },
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("common.eyebrow")} title={t("token.title")} description={t("token.description")}
        actions={<Button onClick={() => setCreating(true)}>{t("token.action.create")}</Button>} />
      <div className="flex items-end gap-3">
        <Field label={t("common.field.userId")}><Input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-32" /></Field>
        <Button variant="outline" onClick={() => void load()}>{t("common.action.search")}</Button>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} error={error ?? undefined} />

      <Drawer open={creating} onClose={() => setCreating(false)} title={t("token.drawer.createTitle", { userId })}
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>{t("common.action.cancel")}</Button><Button onClick={() => void create()} disabled={!form.name}>{t("common.action.create")}</Button></>}>
        <div className="space-y-4">
          <Field label={t("common.field.name")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t("token.field.quotaBudget")}><Input value={form.quotaBudget} onChange={(e) => setForm({ ...form, quotaBudget: e.target.value })} /></Field>
          <Field label={t("token.field.rpmLimit")}><Input value={form.rpmLimit} onChange={(e) => setForm({ ...form, rpmLimit: e.target.value })} /></Field>
          <Field label={t("token.field.tpmLimit")}><Input value={form.tpmLimit} onChange={(e) => setForm({ ...form, tpmLimit: e.target.value })} /></Field>
          <Field label={t("token.field.concurrencyLimit")}><Input value={form.concurrencyLimit} onChange={(e) => setForm({ ...form, concurrencyLimit: e.target.value })} /></Field>
        </div>
      </Drawer>

      <Drawer open={issued != null} onClose={() => setIssued(null)} title={t("token.issued.title")}
        footer={<Button onClick={() => setIssued(null)}>{t("token.issued.saved")}</Button>}>
        {issued && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">{t("token.issued.hint")}</p>
            <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">{issued.key}</code>
          </div>
        )}
      </Drawer>
    </div>
  );
}
