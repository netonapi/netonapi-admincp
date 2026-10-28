"use client";
import * as React from "react";
import { apiFetch } from "@neton/application-front-runtime/client";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Input, PageHeader, type DataColumn } from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";
import { PriceRulesEditor, STATUS_TONE, discountText, pricePair, type Combo, type PriceItems } from "./price-rules-editor";

interface Row {
  model: string; displayName?: string | null; official: PriceItems; price: PriceItems; discountBp?: number | null;
  source: string; mode?: string | null; tiered: boolean; access: string; worst?: Combo | null;
}
interface Group { groupCode: string; groupName: string; groupRatio: string; rows: Row[] }
interface Account { id: number; username?: string | null; nickname?: string | null }

/** 查用户时「没有这个用户名」：本地文案，与接口错误区分开。 */
class UserNotFound extends Error {}

const SOURCE_TONE: Record<string, string> = {
  USER: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  GROUP: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  PLATFORM: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

/**
 * 用户定价（docs/gateway-pricing-spec.md §4.3）：查一个用户在他各计费分组下的价目表——能用哪些模型、官方价、他的价格、
 * 相当于官方价几折、价格来自哪（用户规则 / 分组规则 / 平台价）、最差毛利——并给他设定价规则。
 * 价目表与转发、/v1/models 同一个查价口径：这里看到的就是他调用时会扣的。
 */
export default function Page() {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const [input, setInput] = React.useState("");
  const [user, setUser] = React.useState<Account | null>(null);
  const [book, setBook] = React.useState<Group[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function resolve(v: string): Promise<Account> {
    if (/^\d+$/.test(v)) return { id: Number(v) };
    const page = await apiFetch<{ list: Account[] }>(`/admin/account/user/page?pageNo=1&pageSize=10&username=${encodeURIComponent(v)}`);
    const hit = page.list.find((u) => u.username === v);
    if (!hit) throw new UserNotFound(t("userPrice.notFound", { user: v }));
    return hit;
  }

  const loadBook = React.useCallback(async (id: number) => {
    setBook(await apiFetch<Group[]>(`/admin/gateway/price-rule/pricebook?userId=${id}`));
  }, []);

  async function lookup() {
    const v = input.trim();
    if (!v) return;
    setLoading(true); setError(null); setBook(null); setUser(null);
    try { const u = await resolve(v); setUser(u); await loadBook(u.id); }
    catch (cause) { setError(cause instanceof UserNotFound ? cause.message : describeError(cause)); }
    finally { setLoading(false); }
  }

  const columns: DataColumn<Row>[] = [
    { key: "model", header: t("common.field.model"), cell: (r) => <div>
      {r.displayName ? <><div className="text-sm font-medium">{r.displayName}</div><code className="text-[11px] text-[var(--muted-foreground)]">{r.model}</code></> : <code className="text-xs">{r.model}</code>}
      {r.access === "RULES_ONLY" && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t("rule.restricted")}</span>}
    </div> },
    { key: "official", header: t("rule.column.official"), cell: (r) => <span className="tabular-nums text-xs text-[var(--muted-foreground)]">{pricePair(r.official, t)}</span> },
    { key: "price", header: t("userPrice.column.price"), cell: (r) => <span className="tabular-nums text-xs font-medium">{pricePair(r.price, t)}{r.tiered ? <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">{t("userPrice.tiered")}</span> : null}</span> },
    { key: "discount", header: t("rule.column.discount"), cell: (r) => discountText(r.discountBp, t) },
    { key: "source", header: t("userPrice.column.source"), cell: (r) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${SOURCE_TONE[r.source] ?? ""}`}>{t(`userPrice.source.${r.source}`)}</span> },
    { key: "worst", header: t("rule.column.margin"), cell: (r) => r.worst
      ? <span className="inline-flex flex-col gap-0.5"><span className={`inline-flex w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.worst.status] ?? ""}`}>{(r.worst.marginBp / 100).toFixed(1)}%</span><span className="text-[11px] text-[var(--muted-foreground)]">{r.worst.channelName}</span></span>
      : <span className="text-xs text-[var(--muted-foreground)]">-</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("common.eyebrow")} title={t("userPrice.title")} description={t("userPrice.description")} />
      <div className="flex items-end gap-2">
        <div className="w-64"><Input value={input} placeholder={t("userPrice.placeholder")} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }} /></div>
        <Button variant="outline" onClick={() => void lookup()} disabled={loading || !input.trim()}>{loading ? t("userPrice.searching") : t("userPrice.lookup")}</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {user && book && <>
        <p className="text-sm text-[var(--muted-foreground)]">{t("userPrice.who", { id: user.id, name: user.username ?? user.nickname ?? "" })}</p>
        {book.map((g) => (
          <Card key={g.groupCode}>
            <CardHeader><CardTitle>{t("userPrice.groupTitle", { name: g.groupName, code: g.groupCode, ratio: g.groupRatio })}</CardTitle></CardHeader>
            <CardContent>
              <DataTable columns={columns} rows={g.rows} rowKey={(r) => r.model} loading={false}
                emptyTitle={t("userPrice.emptyTitle")} emptyDescription={t("userPrice.emptyDescription")} />
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle>{t("userPrice.rulesTitle")}</CardTitle></CardHeader>
          <CardContent>
            <PriceRulesEditor subjectType="USER" subjectId={String(user.id)} onChanged={() => void loadBook(user.id)} />
          </CardContent>
        </Card>
      </>}
    </div>
  );
}
