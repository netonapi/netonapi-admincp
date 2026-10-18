"use client";
import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import {
  Button, DataTable, Field, Input, PageHeader,
  type DataColumn,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";

interface Settlement {
  id: number; settlementId: string; userId: number; tokenId: number;
  requestModel: string; endpoint: string; status: string; retryAction?: string | null;
  reservedAmount: number; charged: number; attempts: number;
  lastError?: string | null; createdAt?: number | null;
}

interface TickResponse {
  claimed: number; finalized: number; released: number; manualReview: number; retried: number;
}

/**
 * 待人工处理的结算。这些记录仍持有用户预留额度——网关在调用上游后失联，
 * 无法判断上游是否已计费，所以既不自动扣款也不自动退款，必须人工裁定。
 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const [rows, setRows] = React.useState<Settlement[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState<TickResponse | null>(null);
  const [lookup, setLookup] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setRows(await apiFetch<Settlement[]>("/admin/gateway/settlement/manual-review"));
    } catch (cause) { setError(describeError(cause)); } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function runTick() {
    setError(null);
    try {
      setTick(await apiWrite<TickResponse>("/admin/gateway/settlement/tick", "POST", {}));
      void load();
    } catch (cause) { setError(describeError(cause)); }
  }

  async function find() {
    if (!lookup.trim()) return;
    setError(null);
    try {
      const one = await apiFetch<Settlement | null>(`/admin/gateway/settlement/get/${lookup.trim()}`);
      setRows(one ? [one] : []);
    } catch (cause) { setError(describeError(cause)); }
  }

  const columns: DataColumn<Settlement>[] = [
    { key: "settlementId", header: "结算号", cell: (r) => r.settlementId },
    { key: "userId", header: "用户", cell: (r) => r.userId },
    { key: "requestModel", header: "模型", cell: (r) => r.requestModel },
    { key: "status", header: "状态", cell: (r) => r.status },
    { key: "retryAction", header: "当时动作", cell: (r) => r.retryAction ?? "-" },
    { key: "reservedAmount", header: "占用预留 μUSD", cell: (r) => r.reservedAmount },
    { key: "attempts", header: "尝试次数", cell: (r) => r.attempts },
    { key: "lastError", header: "最后错误", cell: (r) => r.lastError ?? "-" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="GATEWAY"
        title="结算待处理"
        description="仍持有用户预留额度的结算：网关调用上游后失联，无法确定上游是否已计费，需人工裁定后再扣款或退款。"
      />
      {error ? <p role="alert">{error}</p> : null}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", margin: "12px 0" }}>
        <Button onClick={() => void runTick()}>立即执行恢复</Button>
        <Button onClick={() => void load()}>刷新</Button>
        <Field label="按结算号查询"><Input value={lookup} onChange={(e) => setLookup(e.target.value)} /></Field>
        <Button onClick={() => void find()}>查询</Button>
      </div>
      {tick ? (
        <p>
          本次恢复：取件 {tick.claimed}、结算 {tick.finalized}、释放 {tick.released}、
          转人工 {tick.manualReview}、重试 {tick.retried}
        </p>
      ) : null}
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.settlementId} />
    </div>
  );
}
