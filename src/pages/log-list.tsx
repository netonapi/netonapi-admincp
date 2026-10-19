"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission } from "@neton/application-front-runtime/client-context";
import { formatDateTime } from "@neton/application-front-runtime/types";
import {
  Alert, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, DataTable, Field, Input,
  type DataColumn,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

interface AccountVO {
  userId: number; balance: number; reservedBalance: number; version: number;
  createdAt?: number | null; updatedAt?: number | null;
}
interface TxVO {
  id: number; userId: number; type: string; amount: number; balanceAfter: number;
  ref?: string | null; createdAt?: number | null;
}
interface RevokeResultVO {
  userId: number; balance: number; reservedBalance: number; available: number;
  revokedAmount: number; ref: string;
}

/** 台账 type → 中文。未知类型原样显示，别渲染成空白：后端将来加一种 type，
 *  这里至少要让人看见那个串，而不是以为这一行没有类型。 */
const TX_TYPES = new Set(["grant", "consume", "refund", "redeem", "invite", "revoke"]);

/** μUSD → 美元。与 redemption-list 的 usd() 同一套约定，但多一处符号处理：
 *  兑换码面额恒非负，而撤回能把余额打成负数（QuotaLogic.revoke 是无条件扣、允许转负），
 *  负数走 toLocaleString 会得到 "$-0.05" 这种把货币符号夹在中间的形状，所以先取绝对值再贴符号。 */
function usd(micro: number): string {
  const v = Math.abs(micro) / 1_000_000;
  const s = `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 6 : 2 })}`;
  return micro < 0 ? `-${s}` : s;
}

/** 手输金额旁的实时换算。整块 UI 里最值钱的一行提示：全站金额都是裸 μUSD，
 *  把 30000 读成「三万美元」而不是「三美分」正是撤回功能要收拾的那种误发。 */
function AmountField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT("gateway");
  const n = Number(value);
  const hint = value.trim() !== "" && Number.isFinite(n)
    ? t("log.amount.converted", { usd: usd(n), micro: n.toLocaleString("en-US") })
    : t("log.amount.unitHint");
  return <div className="space-y-1">
    <Input type="number" min={1} step={1} value={value} placeholder={t("log.amount.placeholder")} onChange={(e) => onChange(e.target.value)} />
    <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
  </div>;
}

/**
 * 额度运维：按用户查余额与台账、发放、撤回。
 *
 * 为什么长在「用量日志」页里而不是单独一页：gateway:quota:query / grant / revoke 三个权限在
 * 菜单种子里都是挂在 '用量日志' 这个二级菜单下的按钮级权限（V001 / V005 / V006），而侧栏与
 * 路由表都只认菜单行 —— 单独开一页就得再建一个菜单节点，那会让同一套额度运维的权限分散在
 * 两处，运营授权时漏勾一处就是「能撤回但看不见余额」。取舍的完整理由写在 V006 的脚本头注释里。
 *
 * 日志表沿用 ResourcePage 原样渲染，这块附加在它下面：日志表的分页与筛选是现成能跑的，
 * 手写重造只会引入回归，而这三个权限此前在管理台里根本没有入口（运营只能 curl）。
 */
function QuotaOps() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const txLabel = (type: string) => (TX_TYPES.has(type) ? t(`log.tx.${type}`) : type);
  const canRead = usePermission("gateway:quota:query");
  const canGrant = usePermission("gateway:quota:grant");
  const canRevoke = usePermission("gateway:quota:revoke");

  const [uid, setUid] = React.useState("");
  const [account, setAccount] = React.useState<AccountVO | null>(null);
  const [txs, setTxs] = React.useState<TxVO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [op, setOp] = React.useState<"grant" | "revoke" | null>(null);
  const [amount, setAmount] = React.useState("");
  const [ref, setRef] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // 三个权限一个都没有就整块不渲染，但日志表照旧可用。所有 hook 都在这个 return 之前调用完毕，
  // 否则就是条件调用 hook。
  if (!canRead && !canGrant && !canRevoke) return null;

  const targetUid = Number(uid);
  const uidValid = Number.isInteger(targetUid) && targetUid > 0;
  const available = account ? account.balance - account.reservedBalance : 0;

  async function lookup(nextUid: number) {
    setLoading(true); setError(null); setNotice(null);
    try {
      const acc = await apiFetch<AccountVO>(`/admin/gateway/quota/get-by-user/${nextUid}`);
      setAccount(acc);
      try {
        setTxs(await apiFetch<TxVO[]>(`/admin/gateway/quota/transactions/${nextUid}`));
      } catch {
        // 台账拉不到不该连带把余额也藏起来：余额是这次查询的主结果。
        setTxs([]);
      }
    } catch (cause) {
      setError(describeError(cause)); setAccount(null); setTxs([]);
    } finally { setLoading(false); }
  }

  async function submit() {
    if (!account || op == null) return;
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) { setError(t("log.quota.error.amount")); return; }
    if (!ref.trim()) { setError(t("log.quota.error.ref")); return; }
    setSaving(true); setError(null);
    try {
      const body = { userId: account.userId, amount: amt, ref: ref.trim() };
      if (op === "grant") {
        const balance = await apiWrite<number>("/admin/gateway/quota/grant", "POST", body);
        setNotice(t("log.quota.granted", { usd: usd(amt), micro: amt, ref: ref.trim(), balance: usd(balance) }));
      } else {
        const r = await apiWrite<RevokeResultVO>("/admin/gateway/quota/revoke", "POST", body);
        setNotice(t("log.quota.revoked", { usd: usd(r.revokedAmount), micro: r.revokedAmount, ref: r.ref, balance: usd(r.balance), available: usd(r.available) }));
      }
      setOp(null); setAmount(""); setRef(""); setConfirming(false);
      await lookup(account.userId);
    } catch (cause) { setError(describeError(cause)); } finally { setSaving(false); }
  }

  const txColumns: DataColumn<TxVO>[] = [
    { key: "createdAt", header: t("common.field.time"), cell: (r) => formatDateTime(r.createdAt) },
    {
      key: "type", header: t("log.tx.column.type"), cell: (r) => r.type === "revoke"
        // 撤回与消费都是负数行，成因完全不同（一个是平台收错发出去的钱，一个是用户真用掉了）。
        // 不标出来的话，「这个客户账上为什么是负的」就得去翻请求日志才能回答。
        ? <span className="text-xs font-semibold text-red-700">{txLabel(r.type)}</span>
        : txLabel(r.type),
    },
    {
      key: "amount", header: t("log.tx.column.amount"), cell: (r) => <span className={r.amount < 0 ? "text-red-700" : undefined}>
        {r.amount > 0 ? "+" : ""}{r.amount.toLocaleString("en-US")}
        <span className="ml-1 text-xs text-[var(--muted-foreground)]">{usd(r.amount)}</span>
      </span>,
    },
    { key: "balanceAfter", header: t("log.tx.column.balanceAfter"), cell: (r) => <span className={r.balanceAfter < 0 ? "text-red-700" : undefined}>{r.balanceAfter.toLocaleString("en-US")}</span> },
    { key: "ref", header: t("log.tx.column.ref"), cell: (r) => r.ref ? <code className="text-xs">{r.ref}</code> : "-" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{t("log.quota.title")}</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Input type="number" min={1} step={1} value={uid} placeholder={t("common.field.userId")}
              onChange={(e) => { setUid(e.target.value); setAccount(null); setTxs([]); setNotice(null); }} />
          </div>
          {canRead && <Button variant="outline" disabled={!uidValid || loading} onClick={() => void lookup(targetUid)}>
            {loading ? t("log.quota.searching") : t("log.quota.lookup")}
          </Button>}
          {canGrant && <Button disabled={!account} onClick={() => { setError(null); setNotice(null); setAmount(""); setRef("manual:"); setOp("grant"); }}>{t("log.quota.grant")}</Button>}
          {canRevoke && <Button variant="outline" disabled={!account} onClick={() => { setError(null); setNotice(null); setAmount(""); setRef("revoke:"); setOp("revoke"); }}>{t("log.quota.revoke")}</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[var(--muted-foreground)]">
          {t("log.quota.hint")}
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}
        {account && <div className="grid gap-3 sm:grid-cols-3">
          {[[t("log.quota.balance"), account.balance], [t("log.quota.reserved"), account.reservedBalance], [t("log.quota.available"), available]].map(([label, v]) => (
            <div key={label as string} className="rounded-lg border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">{t("log.quota.microLabel", { label: label as string })}</div>
              <div className={`text-lg font-semibold ${(v as number) < 0 ? "text-red-700" : undefined}`}>
                {(v as number).toLocaleString("en-US")}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">{usd(v as number)}</div>
            </div>
          ))}
        </div>}
        {account && available < 0 && <Alert tone="warning">
          {t("log.quota.negative", { available: usd(available) })}
        </Alert>}
        {account && <DataTable columns={txColumns} rows={txs} rowKey={(r) => r.id} loading={loading}
          emptyTitle={t("log.tx.emptyTitle")} emptyDescription={t("log.tx.emptyDescription")} />}

        {op && <Card className="border-dashed">
          <CardHeader><CardTitle>{op === "grant" ? t("log.quota.grantTitle", { userId: account?.userId ?? "" }) : t("log.quota.revokeTitle", { userId: account?.userId ?? "" })}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {op === "revoke" && <Alert tone="warning">
              {t("log.quota.revokeWarning")}
            </Alert>}
            <Field label={op === "revoke" ? t("log.quota.amountLabel.revoke") : t("log.quota.amountLabel.grant")}>
              <AmountField value={amount} onChange={setAmount} />
            </Field>
            <Field label={t("log.quota.refLabel")}>
              <Input value={ref} placeholder={op === "grant" ? t("log.quota.refPlaceholder.grant") : t("log.quota.refPlaceholder.revoke")} onChange={(e) => setRef(e.target.value)} />
            </Field>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t("log.quota.refHint")}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setOp(null); setConfirming(false); }}>{t("common.action.cancel")}</Button>
              {op === "grant"
                ? <Button disabled={saving} onClick={() => void submit()}>{saving ? t("common.action.submitting") : t("log.quota.confirmGrant")}</Button>
                : <Button variant="outline" disabled={saving} onClick={() => setConfirming(true)}>{saving ? t("common.action.submitting") : t("log.quota.confirmRevoke")}</Button>}
            </div>
          </CardContent>
        </Card>}
      </CardContent>

      <ConfirmDialog open={confirming} pending={saving} title={t("log.quota.revokeConfirm.title", { userId: account?.userId ?? "", amount: amount ? usd(Number(amount)) : "" })}
        description={t("log.quota.revokeConfirm.description")}
        confirmLabel={t("log.quota.confirmRevoke")} onCancel={() => setConfirming(false)} onConfirm={() => void submit()} />
    </Card>
  );
}

export default function Page() {
  const t = useT("gateway");
  return <div className="space-y-4">
    <ResourcePage config={{ resourceKey: "gateway-log", eyebrow: t("common.eyebrow"), title: t("log.title"), description: t("log.description"), endpoint: "/gateway/log", errorNamespace: "gateway", listPath: "page", permissions: { page: "gateway:log:query" }, fields: [
      { key: "userId", label: t("common.field.user"), type: "number" },
      { key: "requestModel", label: t("log.field.requestModel") },
      { key: "upstreamModel", label: t("log.field.upstreamModel") },
      { key: "channelId", label: t("log.field.channelId"), type: "number" },
      { key: "promptTokens", label: t("log.field.promptTokens"), type: "number" },
      { key: "completionTokens", label: t("log.field.completionTokens"), type: "number" },
      { key: "charged", label: t("log.field.charged"), type: "number" },
      { key: "cost", label: t("log.field.cost"), type: "number" },
      { key: "stream", label: t("log.field.stream"), type: "select", format: "status", options: [ { label: t("common.yes"), value: 1 }, { label: t("common.no"), value: 0 } ] },
      { key: "status", label: t("common.field.status") },
      { key: "createdAt", label: t("common.field.time"), format: "date" },
    ] }} />
    <QuotaOps />
  </div>;
}
