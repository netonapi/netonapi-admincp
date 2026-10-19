"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission } from "@neton/application-front-runtime/client-context";
import { formatDateTime } from "@neton/application-front-runtime/types";
import {
  Button, ConfirmDialog, DataTable, Drawer, Field, Input, PageHeader, RowActions, Select, Textarea,
  type DataColumn, type RowAction,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

interface OverrideVO {
  userId: number; groupCode: string; remark?: string | null;
  createdAt?: number | null; updatedAt?: number | null;
}
interface GroupVO { id: number; code: string; name: string; ratio: string }

interface FormState { editing: boolean; userId: string; groupCode: string; remark: string }
const EMPTY: FormState = { editing: false, userId: "", groupCode: "", remark: "" };

/**
 * 用户级计价例外（大客户谈判价）。手写而不是套 ResourcePage，因为主键是 userId 而不是自增 id：
 * ResourcePage 用「主键是否为 0」区分新增与编辑，而这里的主键是运营手填的，填完就非 0，
 * 会被判成编辑 —— 于是永远建不出新行、删除路径也会拼成 delete/undefined。
 *
 * 两处刻意的取舍：
 * - 编辑时 userId 只读。它是定位键，后端按它找行且从不改它，所以在表单里改 userId
 *   等于去改另一个人的例外（那个人没有例外时是 404）。要换人只能撤销再新建。
 * - 计价组列表是**尽力而为**：拉它需要 gateway:group:list，只被授予例外权限的运营会 403。
 *   拉不到就把 groupCode 退回文本输入，页面本身照常可用 —— 不能因为一个可选的下拉框
 *   把整页打挂。后端对悬空 code 有 400 守卫，所以文本输入也不会写坏数据。
 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const canCreate = usePermission("gateway:group-override:create");
  const canUpdate = usePermission("gateway:group-override:update");
  const canDelete = usePermission("gateway:group-override:delete");
  const [rows, setRows] = React.useState<OverrideVO[]>([]);
  const [groups, setGroups] = React.useState<GroupVO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [revoking, setRevoking] = React.useState<OverrideVO | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setRows(await apiFetch<OverrideVO[]>("/admin/gateway/group-override/list"));
    } catch (cause) { setError(describeError(cause)); } finally { setLoading(false); }
    try {
      setGroups(await apiFetch<GroupVO[]>("/admin/gateway/group/list"));
    } catch { setGroups([]); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const ratioOf = (code: string) => groups.find((g) => g.code === code)?.ratio;

  async function save() {
    if (!form) return;
    const userId = Number(form.userId);
    if (!Number.isInteger(userId) || userId <= 0) { setError(t("error.USER_ID_INVALID")); return; }
    if (!form.groupCode.trim()) { setError(t("override.error.groupCodeRequired")); return; }
    setSaving(true); setError(null);
    try {
      const body = { userId, groupCode: form.groupCode.trim(), remark: form.remark.trim() || null };
      await apiWrite<unknown>(`/admin/gateway/group-override/${form.editing ? "update" : "create"}`, form.editing ? "PUT" : "POST", body);
      setForm(null);
      await load();
    } catch (cause) { setError(describeError(cause)); } finally { setSaving(false); }
  }

  async function revoke(row: OverrideVO) {
    try {
      await apiWrite<unknown>(`/admin/gateway/group-override/delete/${row.userId}`, "DELETE");
      setRevoking(null);
      await load();
    } catch (cause) { setError(describeError(cause)); setRevoking(null); }
  }

  const actions = (row: OverrideVO): RowAction[] => [
    ...(canUpdate ? [{ label: t("override.action.edit"), tone: "primary" as const, onClick: () => { setError(null); setForm({ editing: true, userId: String(row.userId), groupCode: row.groupCode, remark: row.remark ?? "" }); } }] : []),
    ...(canDelete ? [{ label: t("override.action.revoke"), danger: true, kind: "delete" as const, onClick: () => setRevoking(row) }] : []),
  ];

  const columns: DataColumn<OverrideVO>[] = [
    { key: "userId", header: t("common.field.userId"), cell: (r) => r.userId },
    { key: "groupCode", header: t("override.field.group"), cell: (r) => <code className="text-xs">{r.groupCode}</code> },
    { key: "ratio", header: t("common.field.ratio"), cell: (r) => ratioOf(r.groupCode) ?? "-" },
    { key: "remark", header: t("common.field.remark"), cell: (r) => r.remark || "-" },
    { key: "updatedAt", header: t("override.column.updatedAt"), cell: (r) => formatDateTime(r.updatedAt) },
    ...((canUpdate || canDelete) ? [{ key: "actions", header: t("common.field.actions"), headerClassName: "text-right", className: "text-right", cell: (row: OverrideVO) => <RowActions primary={actions(row)} /> } satisfies DataColumn<OverrideVO>] : []),
  ];

  /**
   * 组下拉框只在真拿到列表时用，否则退回文本输入（见上面的取舍）。
   * 已存的 groupCode 若不在列表里（组被软删，或列表还是刷新前的旧数据），补一个占位项把它显示出来：
   * 让「这一行指向的组已经查不到」这个状态可见，比让下拉框默默显示空白强 —— 空白会被读成「没选」。
   */
  function renderGroupCodePicker(current: FormState) {
    if (groups.length === 0) {
      return <Input value={current.groupCode} placeholder="default" onChange={(e) => setForm({ ...current, groupCode: e.target.value })} />;
    }
    const known = groups.some((g) => g.code === current.groupCode);
    return <Select value={current.groupCode} onChange={(e) => setForm({ ...current, groupCode: e.target.value })}>
      <option value="">{t("override.option.placeholder")}</option>
      {!known && current.groupCode !== "" && <option value={current.groupCode}>{t("override.option.missing", { code: current.groupCode })}</option>}
      {groups.map((g) => <option key={g.code} value={g.code}>{t("override.option.group", { code: g.code, name: g.name, ratio: g.ratio })}</option>)}
    </Select>;
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("common.eyebrow")} title={t("override.title")} description={t("override.description")}
        actions={<>{canCreate && <Button onClick={() => { setError(null); setForm({ ...EMPTY }); }}>{t("override.action.create")}</Button>}<Button variant="outline" onClick={() => void load()}>{t("common.action.refresh")}</Button></>} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.userId} loading={loading} error={error ?? undefined} />

      <Drawer open={form != null} onClose={() => setForm(null)}
        title={form?.editing ? t("override.drawer.editTitle", { userId: form.userId }) : t("override.action.create")}
        footer={<><Button variant="outline" onClick={() => setForm(null)}>{t("common.action.cancel")}</Button><Button onClick={() => void save()} disabled={saving}>{saving ? t("common.action.saving") : t("common.action.save")}</Button></>}>
        {form && <div className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <Field label={t("common.field.userId")}>
            {form.editing
              ? <Input value={form.userId} readOnly className="bg-[var(--muted)]" />
              : <Input type="number" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />}
          </Field>
          {!form.editing && <p className="text-xs text-[var(--muted-foreground)]">
            {t("override.hint.userId")}
          </p>}
          <Field label={t("override.field.group")}>{renderGroupCodePicker(form)}</Field>
          {ratioOf(form.groupCode) && <p className="text-xs text-[var(--muted-foreground)]">
            {t("override.hint.ratio", { ratio: ratioOf(form.groupCode) })}
          </p>}
          <Field label={t("override.field.remark")}>
            <Textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </Field>
        </div>}
      </Drawer>

      <ConfirmDialog open={revoking != null} title={t("override.revoke.title", { userId: revoking?.userId ?? "" })}
        description={t("override.revoke.description")}
        confirmLabel={t("override.revoke.confirm")} onCancel={() => setRevoking(null)} onConfirm={() => revoking && void revoke(revoking)} />
    </div>
  );
}
