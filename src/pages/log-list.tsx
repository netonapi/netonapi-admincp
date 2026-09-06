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
const TX_LABEL: Record<string, string> = {
  grant: "发放", consume: "消费", refund: "退款", redeem: "兑换", invite: "邀请奖励", revoke: "运营撤回",
};

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
  const n = Number(value);
  const hint = value.trim() !== "" && Number.isFinite(n)
    ? `= ${usd(n)}（${n.toLocaleString("en-US")} μUSD）`
    : "1000000 μUSD = 1 美元";
  return <div className="space-y-1">
    <Input type="number" min={1} step={1} value={value} placeholder="例如 30000" onChange={(e) => onChange(e.target.value)} />
    <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
  </div>;
}

/**
 * 额度运维：按用户查余额与台账、发放、撤回。
 *
 * 为什么长在「用量日志」页里而不是单独一页：gateway:quota:get / grant / revoke 三个权限在
 * 菜单种子里都是挂在 '用量日志' 这个二级菜单下的按钮级权限（V001 / V005 / V006），而侧栏与
 * 路由表都只认菜单行 —— 单独开一页就得再建一个菜单节点，那会让同一套额度运维的权限分散在
 * 两处，运营授权时漏勾一处就是「能撤回但看不见余额」。取舍的完整理由写在 V006 的脚本头注释里。
 *
 * 日志表沿用 ResourcePage 原样渲染，这块附加在它下面：日志表的分页与筛选是现成能跑的，
 * 手写重造只会引入回归，而这三个权限此前在管理台里根本没有入口（运营只能 curl）。
 */
function QuotaOps() {
  const canRead = usePermission("gateway:quota:get");
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
      setError((cause as Error).message); setAccount(null); setTxs([]);
    } finally { setLoading(false); }
  }

  async function submit() {
    if (!account || op == null) return;
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) { setError("金额必须是正整数（μUSD）"); return; }
    if (!ref.trim()) { setError("凭据 ref 不能为空：它是防重复提交的幂等键"); return; }
    setSaving(true); setError(null);
    try {
      const body = { userId: account.userId, amount: amt, ref: ref.trim() };
      if (op === "grant") {
        const balance = await apiWrite<number>("/admin/gateway/quota/grant", "POST", body);
        setNotice(`已发放 ${usd(amt)}（${amt} μUSD），ref=${ref.trim()}，发放后余额 ${usd(balance)}`);
      } else {
        const r = await apiWrite<RevokeResultVO>("/admin/gateway/quota/revoke", "POST", body);
        setNotice(`已撤回 ${usd(r.revokedAmount)}（${r.revokedAmount} μUSD），ref=${r.ref}，撤回后余额 ${usd(r.balance)}、可用 ${usd(r.available)}`);
      }
      setOp(null); setAmount(""); setRef(""); setConfirming(false);
      await lookup(account.userId);
    } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }

  const txColumns: DataColumn<TxVO>[] = [
    { key: "createdAt", header: "时间", cell: (r) => formatDateTime(r.createdAt) },
    {
      key: "type", header: "类型", cell: (r) => r.type === "revoke"
        // 撤回与消费都是负数行，成因完全不同（一个是平台收错发出去的钱，一个是用户真用掉了）。
        // 不标出来的话，「这个客户账上为什么是负的」就得去翻请求日志才能回答。
        ? <span className="text-xs font-semibold text-red-700">{TX_LABEL[r.type] ?? r.type}</span>
        : (TX_LABEL[r.type] ?? r.type),
    },
    {
      key: "amount", header: "变动 μUSD", cell: (r) => <span className={r.amount < 0 ? "text-red-700" : undefined}>
        {r.amount > 0 ? "+" : ""}{r.amount.toLocaleString("en-US")}
        <span className="ml-1 text-xs text-[var(--muted-foreground)]">{usd(r.amount)}</span>
      </span>,
    },
    { key: "balanceAfter", header: "变动后余额", cell: (r) => <span className={r.balanceAfter < 0 ? "text-red-700" : undefined}>{r.balanceAfter.toLocaleString("en-US")}</span> },
    { key: "ref", header: "凭据", cell: (r) => r.ref ? <code className="text-xs">{r.ref}</code> : "-" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>额度运维</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Input type="number" min={1} step={1} value={uid} placeholder="用户 ID"
              onChange={(e) => { setUid(e.target.value); setAccount(null); setTxs([]); setNotice(null); }} />
          </div>
          {canRead && <Button variant="outline" disabled={!uidValid || loading} onClick={() => void lookup(targetUid)}>
            {loading ? "查询中…" : "查余额与台账"}
          </Button>}
          {canGrant && <Button disabled={!account} onClick={() => { setError(null); setNotice(null); setAmount(""); setRef("manual:"); setOp("grant"); }}>发放</Button>}
          {canRevoke && <Button variant="outline" disabled={!account} onClick={() => { setError(null); setNotice(null); setAmount(""); setRef("revoke:"); setOp("revoke"); }}>撤回</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[var(--muted-foreground)]">
          先按用户 ID 查出账户，才能发放或撤回。查一个从未有过额度账户的 ID 会顺手建一条零余额账户
          （后端 account() 是 create-or-read），无害但会在库里留下垃圾行，确认 ID 无误再查。
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}
        {account && <div className="grid gap-3 sm:grid-cols-3">
          {[["余额", account.balance], ["在途预留", account.reservedBalance], ["可用余额", available]].map(([label, v]) => (
            <div key={label as string} className="rounded-lg border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">{label as string}（μUSD）</div>
              <div className={`text-lg font-semibold ${(v as number) < 0 ? "text-red-700" : undefined}`}>
                {(v as number).toLocaleString("en-US")}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">{usd(v as number)}</div>
            </div>
          ))}
        </div>}
        {account && available < 0 && <Alert tone="warning">
          可用余额为负（{usd(available)}）。这是撤回或后付费结算造成的欠费，不是数据错误：
          该用户的新请求会被网关拒掉（402 insufficient_quota），下次充值先填平这个坑；
          已经占用的在途预留不受影响，撤回也拦不住已经打到上游的那些请求。
        </Alert>}
        {account && <DataTable columns={txColumns} rows={txs} rowKey={(r) => r.id} loading={loading}
          emptyTitle="这个用户还没有台账" emptyDescription="发放、消费、退款、兑换、邀请奖励与撤回都会在这里留一行，只增不改。" />}

        {op && <Card className="border-dashed">
          <CardHeader><CardTitle>{op === "grant" ? `发放额度给用户 ${account?.userId ?? ""}` : `撤回用户 ${account?.userId ?? ""} 的额度`}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {op === "revoke" && <Alert tone="warning">
              撤回是无条件扣减：金额超过余额也会照扣，余额会转负（这是刻意的，否则误发的额度被用户
              赶紧花掉就再也收不回来了）。撤回不动在途预留，也拦不住已经打到上游的请求。
            </Alert>}
            <Field label={`金额（μUSD，正整数${op === "revoke" ? "，超过余额也会照扣" : ""}）`}>
              <AmountField value={amount} onChange={setAmount} />
            </Field>
            <Field label="凭据 ref（幂等键，必填）">
              <Input value={ref} placeholder={op === "grant" ? "manual:<工单号>" : "revoke:<工单号>"} onChange={(e) => setRef(e.target.value)} />
            </Field>
            <p className="text-xs text-[var(--muted-foreground)]">
              同一个 ref 只会入账一次，重复提交不会重复动钱。前端把它设成必填，是因为手动发放若不带 ref
              就没有幂等键，双击一次就是双发（后端仍允许 ref 为空，那是给充值、兑换这些自带凭据的
              程序化调用方留的，不是给手填的）。填工单号既防重复也留下审计线索。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setOp(null); setConfirming(false); }}>取消</Button>
              {op === "grant"
                ? <Button disabled={saving} onClick={() => void submit()}>{saving ? "提交中…" : "确认发放"}</Button>
                : <Button variant="outline" disabled={saving} onClick={() => setConfirming(true)}>{saving ? "提交中…" : "确认撤回"}</Button>}
            </div>
          </CardContent>
        </Card>}
      </CardContent>

      <ConfirmDialog open={confirming} pending={saving} title={`确认撤回用户 ${account?.userId ?? ""} 的 ${amount ? usd(Number(amount)) : ""}`}
        description="撤回直接从用户余额里扣钱，允许把余额扣成负数，且台账只增不改、事后无法编辑。确认金额与工单号无误再提交；提交后若发现填错，只能再发放一笔冲正，撤回本身撤销不了。"
        confirmLabel="确认撤回" onCancel={() => setConfirming(false)} onConfirm={() => void submit()} />
    </Card>
  );
}

export default function Page() {
  return <div className="space-y-4">
    <ResourcePage config={{ resourceKey: "gateway-log", eyebrow: "GATEWAY", title: "用量日志", description: "逐请求用量与收入/成本（μUSD）。", endpoint: "/gateway/log", listPath: "page", permissions: { page: "gateway:log:list" }, fields: [
      { key: "userId", label: "用户", type: "number" },
      { key: "requestModel", label: "请求模型" },
      { key: "upstreamModel", label: "上游模型" },
      { key: "channelId", label: "渠道", type: "number" },
      { key: "promptTokens", label: "输入 tokens", type: "number" },
      { key: "completionTokens", label: "输出 tokens", type: "number" },
      { key: "charged", label: "收入 μUSD", type: "number" },
      { key: "cost", label: "成本 μUSD", type: "number" },
      { key: "stream", label: "流式", type: "select", format: "status", options: [ { label: "是", value: 1 }, { label: "否", value: 0 } ] },
      { key: "status", label: "状态" },
      { key: "createdAt", label: "时间", format: "date" },
    ] }} />
    <QuotaOps />
  </div>;
}
