"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { formatDateTime } from "@neton/application-front-runtime/types";
import {
  Button, DataTable, Drawer, Field, Input, PageHeader, RowActions, Select, StatusBadge,
  type DataColumn, type RowAction,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

interface TokenVO {
  id: number; userId: number; name: string; display: string;
  quotaBudget?: number | null; quotaUsed: number; expiresAt?: number | null;
  rpmLimit?: number | null; tpmLimit?: number | null; concurrencyLimit?: number | null;
  status: number; createdAt?: number | null; groupOverride?: string | null; groupAssigned?: number;
}
interface GroupVO { code: string; name: string; ratio: string }

/**
 * 令牌监管：按用户查看、停用、删除、指定专属计费组。
 * 后台不能建 Key —— Key 只能由用户本人在控制台创建，调用扣的是他自己的余额，明文也只给他本人看一次。
 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const [userId, setUserId] = React.useState("");
  const [rows, setRows] = React.useState<TokenVO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [groups, setGroups] = React.useState<GroupVO[]>([]);
  const [grouping, setGrouping] = React.useState<{ row: TokenVO; code: string } | null>(null);
  const [limiting, setLimiting] = React.useState<{ row: TokenVO; rpm: string; tpm: string; concurrency: string } | null>(null);
  React.useEffect(() => { apiFetch<GroupVO[]>("/admin/gateway/group/list").then(setGroups).catch(() => setGroups([])); }, []);

  const load = React.useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      setRows(await apiFetch<TokenVO[]>(`/admin/gateway/token/list-by-user/${userId}`));
    } catch (cause) { setError(describeError(cause)); } finally { setLoading(false); }
  }, [userId]);

  React.useEffect(() => { void load(); }, [load]);

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
    { key: "group", header: t("token.column.group"), cell: (r) => r.groupOverride ? <span><code className="text-xs">{r.groupOverride}</code> <span className="text-[11px] text-[var(--muted-foreground)]">{r.groupAssigned ? t("token.group.assigned") : t("token.group.selected")}</span></span> : <span className="text-[var(--muted-foreground)]">default</span> },
    { key: "status", header: t("common.field.status"), cell: (r) => <StatusBadge active={r.status === 1}>{r.status === 1 ? t("common.status.enabled") : t("common.status.disabled")}</StatusBadge> },
    { key: "createdAt", header: t("common.field.createdAt"), cell: (r) => formatDateTime(r.createdAt) },
    { key: "actions", header: t("common.field.actions"), cell: (row) => <RowActions primary={actions(row)} /> },
  ];

  async function saveGroup() {
    if (!grouping) return;
    try {
      await apiWrite<void>(`/admin/gateway/token/update-group?id=${grouping.row.id}&groupCode=${encodeURIComponent(grouping.code)}`, "PUT");
      setGrouping(null); void load();
    } catch (cause) { setError(describeError(cause)); }
  }

  const groupOptions = (current: string) => <>
    <option value="">{t("token.group.inherit")}</option>
    {current && !groups.some((g) => g.code === current) && <option value={current}>{current}</option>}
    {groups.map((g) => <option key={g.code} value={g.code}>{t("override.option.group", { code: g.code, name: g.name, ratio: g.ratio })}</option>)}
  </>;

  async function saveLimits() {
    if (!limiting) return;
    const num = (v: string) => (v.trim() ? Number(v) : null);
    try {
      await apiWrite<void>("/admin/gateway/token/update-limits", "PUT", { id: limiting.row.id, rpmLimit: num(limiting.rpm), tpmLimit: num(limiting.tpm), concurrencyLimit: num(limiting.concurrency) });
      setLimiting(null); void load();
    } catch (cause) { setError(describeError(cause)); }
  }

  const actions = (row: TokenVO): RowAction[] => [
    { label: t("token.action.limits"), onClick: () => setLimiting({ row, rpm: row.rpmLimit?.toString() ?? "", tpm: row.tpmLimit?.toString() ?? "", concurrency: row.concurrencyLimit?.toString() ?? "" }) },
    { label: t("token.action.group"), onClick: () => setGrouping({ row, code: row.groupAssigned ? row.groupOverride ?? "" : "" }) },
    row.status === 1
      ? { label: t("common.action.disable"), onClick: () => void setStatus(row, 0) }
      : { label: t("common.action.enable"), onClick: () => void setStatus(row, 1) },
    { label: t("common.action.delete"), danger: true, kind: "delete", onClick: async () => { await apiWrite<void>(`/admin/gateway/token/delete/${row.id}`, "DELETE"); void load(); } },
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("common.eyebrow")} title={t("token.title")} description={t("token.description")} />
      <div className="flex items-end gap-3">
        <Field label={t("common.field.userId")}><Input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-32" /></Field>
        <Button variant="outline" onClick={() => void load()}>{t("common.action.search")}</Button>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} error={error ?? undefined} />

      <Drawer open={limiting != null} onClose={() => setLimiting(null)} title={limiting ? t("token.limits.title", { name: limiting.row.name }) : ""}
        footer={<><Button variant="outline" onClick={() => setLimiting(null)}>{t("common.action.cancel")}</Button><Button onClick={() => void saveLimits()}>{t("common.action.save")}</Button></>}>
        {limiting && <div className="space-y-3">
          <Field label={t("token.field.rpmLimit")}><Input type="number" value={limiting.rpm} onChange={(e) => setLimiting({ ...limiting, rpm: e.target.value })} /></Field>
          <Field label={t("token.field.tpmLimit")}><Input type="number" value={limiting.tpm} onChange={(e) => setLimiting({ ...limiting, tpm: e.target.value })} /></Field>
          <Field label={t("token.field.concurrencyLimit")}><Input type="number" value={limiting.concurrency} onChange={(e) => setLimiting({ ...limiting, concurrency: e.target.value })} /></Field>
          <p className="text-xs text-[var(--muted-foreground)]">{t("token.limits.hint")}</p>
        </div>}
      </Drawer>

      <Drawer open={grouping != null} onClose={() => setGrouping(null)} title={grouping ? t("token.group.title", { name: grouping.row.name }) : ""}
        footer={<><Button variant="outline" onClick={() => setGrouping(null)}>{t("common.action.cancel")}</Button><Button onClick={() => void saveGroup()}>{t("common.action.save")}</Button></>}>
        {grouping && <div className="space-y-3">
          <Field label={t("token.field.group")}><Select value={grouping.code} onChange={(e) => setGrouping({ ...grouping, code: e.target.value })}>{groupOptions(grouping.code)}</Select></Field>
          <p className="text-xs text-[var(--muted-foreground)]">{t("token.group.hint")}</p>
        </div>}
      </Drawer>

    </div>
  );
}
