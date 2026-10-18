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
    if (!Number.isInteger(userId) || userId <= 0) { setError("userId 必须是正整数"); return; }
    if (!form.groupCode.trim()) { setError("请选择或填写计价组 code"); return; }
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
    ...(canUpdate ? [{ label: "改价", tone: "primary" as const, onClick: () => { setError(null); setForm({ editing: true, userId: String(row.userId), groupCode: row.groupCode, remark: row.remark ?? "" }); } }] : []),
    ...(canDelete ? [{ label: "撤销", danger: true, kind: "delete" as const, onClick: () => setRevoking(row) }] : []),
  ];

  const columns: DataColumn<OverrideVO>[] = [
    { key: "userId", header: "用户 ID", cell: (r) => r.userId },
    { key: "groupCode", header: "计价组", cell: (r) => <code className="text-xs">{r.groupCode}</code> },
    { key: "ratio", header: "倍率", cell: (r) => ratioOf(r.groupCode) ?? "-" },
    { key: "remark", header: "备注", cell: (r) => r.remark || "-" },
    { key: "updatedAt", header: "更新时间", cell: (r) => formatDateTime(r.updatedAt) },
    ...((canUpdate || canDelete) ? [{ key: "actions", header: "操作", headerClassName: "text-right", className: "text-right", cell: (row: OverrideVO) => <RowActions primary={actions(row)} /> } satisfies DataColumn<OverrideVO>] : []),
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
      <option value="">请选择</option>
      {!known && current.groupCode !== "" && <option value={current.groupCode}>{current.groupCode}（已不在组列表中）</option>}
      {groups.map((g) => <option key={g.code} value={g.code}>{g.code}（{g.name}，×{g.ratio}）</option>)}
    </Select>;
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="GATEWAY" title="用户计价例外" description="给单个用户指定计费组（大客户谈判价）。优先级高于会员组映射，低于令牌覆盖。撤销后该用户回到会员组或 default，不是「不计费」。"
        actions={<>{canCreate && <Button onClick={() => { setError(null); setForm({ ...EMPTY }); }}>新增例外</Button>}<Button variant="outline" onClick={() => void load()}>刷新</Button></>} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.userId} loading={loading} error={error ?? undefined} />

      <Drawer open={form != null} onClose={() => setForm(null)}
        title={`${form?.editing ? "改价" : "新增例外"}${form?.editing ? `（用户 ${form.userId}）` : ""}`}
        footer={<><Button variant="outline" onClick={() => setForm(null)}>取消</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : "保存"}</Button></>}>
        {form && <div className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <Field label="用户 ID">
            {form.editing
              ? <Input value={form.userId} readOnly className="bg-[var(--muted)]" />
              : <Input type="number" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />}
          </Field>
          {!form.editing && <p className="text-xs text-[var(--muted-foreground)]">
            后端无法校验这个 ID 是否真有此人（gateway 编译期看不见 member）。填错一位不会报错，
            客户照旧按 default 计价 —— 保存后请在列表里核对一遍。
          </p>}
          <Field label="计价组">{renderGroupCodePicker(form)}</Field>
          {ratioOf(form.groupCode) && <p className="text-xs text-[var(--muted-foreground)]">
            倍率 ×{ratioOf(form.groupCode)}：保存后这位用户的请求按它计价，会员组映射与 default 都不再参与；令牌级覆盖仍高于它。
          </p>}
          <Field label="备注（合同号 / 审批人 / 有效期口径，最多 256 字）">
            <Textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </Field>
        </div>}
      </Drawer>

      <ConfirmDialog open={revoking != null} title={`撤销用户 ${revoking?.userId ?? ""} 的计价例外`}
        description="撤销是硬删：谈过的价与备注里的合同号在本表里不再留痕（结算快照只留倍率，不留是哪个组、也不留是哪一层解析出的）。撤销后该用户回到会员组映射或 default。"
        confirmLabel="确认撤销" onCancel={() => setRevoking(null)} onConfirm={() => revoking && void revoke(revoking)} />
    </div>
  );
}
