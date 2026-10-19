"use client";
import * as React from "react";
import { apiFetch } from "@neton/application-front-runtime/client";
import { useQuery } from "@neton/application-front-runtime/client-context";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader, StatusBadge, type DataColumn } from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

interface PeriodStat { requests: number; errors: number; charged: number; cost: number; promptTokens: number; completionTokens: number; activeUsers: number }
interface DailyStat { date: string; requests: number; errors: number; charged: number; cost: number }
interface ModelStat { model: string; requests: number; charged: number; cost: number }
interface UserStat { userId: number; requests: number; charged: number }
interface ChannelStat { channelId: number; name: string; status: number; requests: number; errors: number; cost: number; lastProbeAt?: number | null; lastProbeMs?: number | null; lastProbeOk?: number | null; lastProbeError?: string | null }
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

/** 纯 SVG 柱状图：概览只要看趋势，不值得为它引一个图表库。 */
function BarChart({ points, valueOf, format }: { points: DailyStat[]; valueOf: (d: DailyStat) => number; format: (n: number) => string }) {
  const t = useT("gateway");
  if (points.length === 0) return <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{t("overview.chart.empty")}</p>;
  const w = 720, h = 140, pad = 24, bw = Math.max(4, (w - pad * 2) / points.length - 4);
  const max = Math.max(1, ...points.map(valueOf));
  return (
    <svg viewBox={`0 0 ${w} ${h + 28}`} width="100%" height={h + 28} role="img" aria-label={t("overview.chart.ariaLabel")}>
      {points.map((p, i) => {
        const v = valueOf(p); const bh = Math.round((v / max) * h);
        const x = pad + i * ((w - pad * 2) / points.length);
        return (
          <g key={p.date}>
            <rect x={x} y={h - bh} width={bw} height={bh} rx={2} fill="currentColor" opacity={0.7}><title>{`${p.date}: ${format(v)}`}</title></rect>
            {points.length <= 31 || i % 7 === 0 ? <text x={x + bw / 2} y={h + 16} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}>{p.date.slice(5)}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

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

const CHANNEL_STATUS: Record<number, string> = { 1: "common.status.enabled", 0: "common.status.disabled", 2: "common.status.suspended" };

export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const [days, setDays] = React.useState(7);
  const query = useQuery({ queryKey: ["gateway-overview", days], queryFn: () => apiFetch<Overview>(`/admin/gateway/info/overview?days=${days}`), refetchInterval: 60_000 });
  const d = query.data;

  const dailyCols: DataColumn<DailyStat>[] = [
    { key: "date", header: t("overview.column.date"), cell: (r) => r.date },
    { key: "requests", header: t("overview.column.requests"), cell: (r) => fmt(r.requests) },
    { key: "errors", header: t("overview.column.errorRate"), cell: (r) => pct(r.errors, r.requests) },
    { key: "charged", header: t("overview.column.revenue"), cell: (r) => usd(r.charged) },
    { key: "cost", header: t("overview.column.cost"), cell: (r) => usd(r.cost) },
    { key: "margin", header: t("overview.column.margin"), cell: (r) => margin(r.charged, r.cost) },
  ];
  const modelCols: DataColumn<ModelStat>[] = [
    { key: "model", header: t("common.field.model"), cell: (r) => r.model },
    { key: "requests", header: t("overview.column.requests"), cell: (r) => fmt(r.requests) },
    { key: "charged", header: t("overview.column.revenue"), cell: (r) => usd(r.charged) },
    { key: "cost", header: t("overview.column.cost"), cell: (r) => usd(r.cost) },
    { key: "margin", header: t("overview.column.margin"), cell: (r) => margin(r.charged, r.cost) },
  ];
  const userCols: DataColumn<UserStat>[] = [
    { key: "userId", header: t("common.field.user"), cell: (r) => `#${r.userId}` },
    { key: "requests", header: t("overview.column.requests"), cell: (r) => fmt(r.requests) },
    { key: "charged", header: t("overview.column.spend"), cell: (r) => usd(r.charged) },
  ];
  const channelCols: DataColumn<ChannelStat>[] = [
    { key: "name", header: t("overview.column.channel"), cell: (r) => r.name },
    { key: "status", header: t("common.field.status"), cell: (r) => <StatusBadge active={r.status === 1}>{CHANNEL_STATUS[r.status] ? t(CHANNEL_STATUS[r.status]) : String(r.status)}</StatusBadge> },
    { key: "requests", header: t("overview.column.requests"), cell: (r) => fmt(r.requests) },
    { key: "errors", header: t("overview.column.errorRate"), cell: (r) => pct(r.errors, r.requests) },
    { key: "cost", header: t("overview.column.cost"), cell: (r) => usd(r.cost) },
    { key: "probe", header: t("overview.column.probe"), cell: (r) => r.lastProbeOk == null ? t("overview.probe.untested") : r.lastProbeOk === 1 ? `${r.lastProbeMs ?? "?"} ms` : <span title={r.lastProbeError ?? ""} style={{ color: "var(--destructive, #c00)" }}>{t("channel.probe.unreachable")}</span> },
  ];

  const grid = (cols: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 12, margin: "12px 0" });

  return (
    <div>
      <PageHeader eyebrow={t("common.eyebrow")} title={t("overview.title")} description={t("overview.description")}
        actions={<div style={{ display: "flex", gap: 6 }}>{[1, 7, 30].map((n) => <Button key={n} variant={days === n ? "default" : "outline"} onClick={() => setDays(n)}>{n === 1 ? t("overview.range.today") : t("overview.range.days", { days: n })}</Button>)}</div>} />
      {query.error ? <Alert tone="error">{describeError(query.error)}</Alert> : null}
      {d && (d.manualReviewSettlements > 0 || d.suspendedChannels > 0) ? (
        <Alert tone="warning" style={{ marginTop: 12 }}>
          {t("overview.attention.title")}{d.manualReviewSettlements > 0 ? t("overview.attention.settlements", { count: d.manualReviewSettlements }) : null}
          {d.manualReviewSettlements > 0 && d.suspendedChannels > 0 ? t("overview.attention.separator") : null}
          {d.suspendedChannels > 0 ? t("overview.attention.channels", { count: d.suspendedChannels }) : null}
        </Alert>
      ) : null}

      <div style={grid(4)}>
        <Stat label={t("overview.stat.todayRequests")} value={d ? fmt(d.today.requests) : "—"} hint={d ? t("overview.stat.requestsHint", { errorRate: pct(d.today.errors, d.today.requests), activeUsers: d.today.activeUsers }) : null} />
        <Stat label={t("overview.stat.todayRevenue")} value={d ? usd(d.today.charged) : "—"} hint={d ? t("overview.stat.revenueHint", { cost: usd(d.today.cost), margin: margin(d.today.charged, d.today.cost) }) : null} />
        <Stat label={days === 1 ? t("overview.stat.todayRequests") : t("overview.stat.periodRequests", { days })} value={d ? fmt(d.period.requests) : "—"} hint={d ? t("overview.stat.requestsHint", { errorRate: pct(d.period.errors, d.period.requests), activeUsers: d.period.activeUsers }) : null} />
        <Stat label={days === 1 ? t("overview.stat.todayRevenue") : t("overview.stat.periodRevenue", { days })} value={d ? usd(d.period.charged) : "—"} hint={d ? t("overview.stat.periodRevenueHint", { cost: usd(d.period.cost), margin: margin(d.period.charged, d.period.cost), tokens: fmt(d.period.promptTokens + d.period.completionTokens) }) : null} />
      </div>

      <div style={grid(2)}>
        <Card>
          <CardHeader><CardTitle>{t("overview.card.dailyRevenue")}</CardTitle></CardHeader>
          <CardContent><BarChart points={d?.daily ?? []} valueOf={(x) => x.charged} format={usd} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("overview.card.dailyRequests")}</CardTitle></CardHeader>
          <CardContent><BarChart points={d?.daily ?? []} valueOf={(x) => x.requests} format={fmt} /></CardContent>
        </Card>
      </div>
      <Card style={{ margin: "12px 0" }}>
        <CardHeader><CardTitle>{t("overview.card.daily")}</CardTitle></CardHeader>
        <CardContent><DataTable columns={dailyCols} rows={d?.daily ?? []} rowKey={(r) => r.date} loading={query.isPending} /></CardContent>
      </Card>
      <div style={grid(2)}>
        <Card>
          <CardHeader><CardTitle>{t("overview.card.topModels")}</CardTitle></CardHeader>
          <CardContent><DataTable columns={modelCols} rows={d?.topModels ?? []} rowKey={(r) => r.model} loading={query.isPending} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("overview.card.topUsers")}</CardTitle></CardHeader>
          <CardContent><DataTable columns={userCols} rows={d?.topUsers ?? []} rowKey={(r) => r.userId} loading={query.isPending} /></CardContent>
        </Card>
      </div>
      <Card style={{ margin: "12px 0" }}>
        <CardHeader><CardTitle>{t("overview.card.channels")}</CardTitle></CardHeader>
        <CardContent><DataTable columns={channelCols} rows={d?.channels ?? []} rowKey={(r) => r.channelId} loading={query.isPending} /></CardContent>
      </Card>
    </div>
  );
}
