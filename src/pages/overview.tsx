"use client";
import * as React from "react";
import { apiFetch } from "@neton/application-front-runtime/client";
import { useQuery } from "@neton/application-front-runtime/client-context";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader, StatusBadge, type DataColumn } from "@neton/application-front-kit";

interface PeriodStat { requests: number; errors: number; charged: number; cost: number; promptTokens: number; completionTokens: number; activeUsers: number }
interface DailyStat { date: string; requests: number; errors: number; charged: number; cost: number }
interface ModelStat { model: string; requests: number; charged: number; cost: number }
interface UserStat { userId: number; requests: number; charged: number }
interface ChannelStat { channelId: number; name: string; status: number; requests: number; errors: number; cost: number }
interface Overview {
  today: PeriodStat; period: PeriodStat; days: number; daily: DailyStat[];
  topModels: ModelStat[]; topUsers: UserStat[]; channels: ChannelStat[];
  manualReviewSettlements: number; suspendedChannels: number; generatedAt: number;
}

/** μUSD → 美元；概览只看量级，两位小数够了。 */
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(2)}`;
const pct = (part: number, total: number) => (total === 0 ? "—" : `${((part / total) * 100).toFixed(1)}%`);
const margin = (charged: number, cost: number) => (charged === 0 ? "—" : `${(((charged - cost) / charged) * 100).toFixed(0)}%`);
const fmt = (n: number) => n.toLocaleString("zh-CN");

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
        {hint ? <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

const CHANNEL_STATUS: Record<number, string> = { 1: "启用", 0: "禁用", 2: "自动挂起" };

export default function Page() {
  const [days, setDays] = React.useState(7);
  const query = useQuery({ queryKey: ["gateway-overview", days], queryFn: () => apiFetch<Overview>(`/admin/gateway/info/overview?days=${days}`), refetchInterval: 60_000 });
  const d = query.data;

  const dailyCols: DataColumn<DailyStat>[] = [
    { key: "date", header: "日期(UTC)", cell: (r) => r.date },
    { key: "requests", header: "请求", cell: (r) => fmt(r.requests) },
    { key: "errors", header: "错误率", cell: (r) => pct(r.errors, r.requests) },
    { key: "charged", header: "收入", cell: (r) => usd(r.charged) },
    { key: "cost", header: "成本", cell: (r) => usd(r.cost) },
    { key: "margin", header: "毛利率", cell: (r) => margin(r.charged, r.cost) },
  ];
  const modelCols: DataColumn<ModelStat>[] = [
    { key: "model", header: "模型", cell: (r) => r.model },
    { key: "requests", header: "请求", cell: (r) => fmt(r.requests) },
    { key: "charged", header: "收入", cell: (r) => usd(r.charged) },
    { key: "cost", header: "成本", cell: (r) => usd(r.cost) },
    { key: "margin", header: "毛利率", cell: (r) => margin(r.charged, r.cost) },
  ];
  const userCols: DataColumn<UserStat>[] = [
    { key: "userId", header: "用户", cell: (r) => `#${r.userId}` },
    { key: "requests", header: "请求", cell: (r) => fmt(r.requests) },
    { key: "charged", header: "消费", cell: (r) => usd(r.charged) },
  ];
  const channelCols: DataColumn<ChannelStat>[] = [
    { key: "name", header: "渠道", cell: (r) => r.name },
    { key: "status", header: "状态", cell: (r) => <StatusBadge active={r.status === 1}>{CHANNEL_STATUS[r.status] ?? String(r.status)}</StatusBadge> },
    { key: "requests", header: "请求", cell: (r) => fmt(r.requests) },
    { key: "errors", header: "错误率", cell: (r) => pct(r.errors, r.requests) },
    { key: "cost", header: "成本", cell: (r) => usd(r.cost) },
  ];

  const grid = (cols: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 12, margin: "12px 0" });

  return (
    <div>
      <PageHeader eyebrow="GATEWAY" title="网关概览" description="请求、收入、成本与毛利；数据来自用量日志，按 UTC 日切，每分钟自动刷新。"
        actions={<div style={{ display: "flex", gap: 6 }}>{[1, 7, 30].map((n) => <Button key={n} variant={days === n ? "default" : "outline"} onClick={() => setDays(n)}>{n === 1 ? "今天" : `${n} 天`}</Button>)}</div>} />
      {query.error ? <Alert tone="error">{(query.error as Error).message}</Alert> : null}
      {d && (d.manualReviewSettlements > 0 || d.suspendedChannels > 0) ? (
        <Alert tone="warning" style={{ marginTop: 12 }}>
          需要处理：{d.manualReviewSettlements > 0 ? `${d.manualReviewSettlements} 笔结算待人工裁定（仍占用用户预留额度）` : null}
          {d.manualReviewSettlements > 0 && d.suspendedChannels > 0 ? "；" : null}
          {d.suspendedChannels > 0 ? `${d.suspendedChannels} 条渠道被自动挂起` : null}
        </Alert>
      ) : null}

      <div style={grid(4)}>
        <Stat label="今日请求" value={d ? fmt(d.today.requests) : "—"} hint={d ? `错误率 ${pct(d.today.errors, d.today.requests)} · 活跃用户 ${d.today.activeUsers}` : null} />
        <Stat label="今日收入" value={d ? usd(d.today.charged) : "—"} hint={d ? `成本 ${usd(d.today.cost)} · 毛利率 ${margin(d.today.charged, d.today.cost)}` : null} />
        <Stat label={`${days === 1 ? "今日" : `近 ${days} 天`}请求`} value={d ? fmt(d.period.requests) : "—"} hint={d ? `错误率 ${pct(d.period.errors, d.period.requests)} · 活跃用户 ${d.period.activeUsers}` : null} />
        <Stat label={`${days === 1 ? "今日" : `近 ${days} 天`}收入`} value={d ? usd(d.period.charged) : "—"} hint={d ? `成本 ${usd(d.period.cost)} · 毛利率 ${margin(d.period.charged, d.period.cost)} · tokens ${fmt(d.period.promptTokens + d.period.completionTokens)}` : null} />
      </div>

      <Card style={{ margin: "12px 0" }}>
        <CardHeader><CardTitle>按日</CardTitle></CardHeader>
        <CardContent><DataTable columns={dailyCols} rows={d?.daily ?? []} rowKey={(r) => r.date} loading={query.isPending} /></CardContent>
      </Card>
      <div style={grid(2)}>
        <Card>
          <CardHeader><CardTitle>模型 Top 10</CardTitle></CardHeader>
          <CardContent><DataTable columns={modelCols} rows={d?.topModels ?? []} rowKey={(r) => r.model} loading={query.isPending} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>用户 Top 10（按消费）</CardTitle></CardHeader>
          <CardContent><DataTable columns={userCols} rows={d?.topUsers ?? []} rowKey={(r) => r.userId} loading={query.isPending} /></CardContent>
        </Card>
      </div>
      <Card style={{ margin: "12px 0" }}>
        <CardHeader><CardTitle>渠道</CardTitle></CardHeader>
        <CardContent><DataTable columns={channelCols} rows={d?.channels ?? []} rowKey={(r) => r.channelId} loading={query.isPending} /></CardContent>
      </Card>
    </div>
  );
}
