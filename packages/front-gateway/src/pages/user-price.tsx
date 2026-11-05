"use client";
import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission } from "@neton/application-front-runtime/client-context";
import { formatDateTime } from "@neton/application-front-runtime/types";
import {
  Alert, Button, Card, CardContent, Checkbox, DataTable, Drawer, Field, Input, PageHeader, RowActions,
  type DataColumn, type RowAction,
} from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";
import { STATUS_TONE, pricePair, type Combo, type PriceItems } from "./price-rules-editor";

interface Row {
  model: string; displayName?: string | null; official: PriceItems; price: PriceItems; discountBp?: number | null;
  source: string; mode?: string | null; tiered: boolean; access: string; worst?: Combo | null;
}
interface Group { groupCode: string; groupName: string; groupRatio: string; rows: Row[]; keys?: number }
interface Account { id: number; username?: string | null; nickname?: string | null }
interface UserRow { userId: number; models: number; updatedAt?: number | null }
interface ModelOption { model: string; displayName?: string | null; listed: number; access?: string; inputPrice: string; outputPrice: string; perRequestPrice?: number | null }
interface Preview { price: PriceItems; discountBp?: number | null; status: string; worst?: Combo | null }


/** 查用户时「没有这个用户」：本地文案，与接口错误区分开。 */
class UserNotFound extends Error {}

const accountName = (a: Account | undefined) => a?.username || a?.nickname || "";

/**
 * 协议定价（docs/gateway-pricing-spec.md §4.3）：给单个用户按模型打折，只做这一件事。
 *
 * - 列表：所有有协议价的用户；搜索任意用户进入详情。
 * - 详情：一张表列出他能调用的全部模型——官方价、他的价格、折扣、价格来源（全站价 / 分组价 / 协议价）、毛利，
 *   行尾【协议定价】设折扣，可批量。能调用 = 他各分组（default + Key 所在分组）价目表的并集；
 *   同一模型在不同分组价格不同时逐个分组列出。限定开放还没开放给他的模型不进主表，从「开放限定模型」进入。
 *
 * 折扣按官方价计（「官方价 7 折」），存成定价规则 OFFICIAL_DISCOUNT；开放存成 PLATFORM（按全站价）。
 * 输入单位跟语言走：中文填「折」（7 = 7 折），英文填百分比（70 = 70%），换算系数在语言包 userPrice.discountDivisor。
 * 价格与扣费口径与转发、/v1/models 同一份价目表：这里看到的就是他调用时会扣的。
 */
export default function Page() {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const [users, setUsers] = React.useState<UserRow[] | null>(null);
  const [names, setNames] = React.useState<Record<number, Account>>({});
  const [input, setInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [user, setUser] = React.useState<Account | null>(null);

  const loadUsers = React.useCallback(async () => {
    setError(null);
    try {
      const list = await apiFetch<UserRow[]>("/admin/gateway/price-rule/users");
      setUsers(list);
      // 用户名尽力而为：没有账号查看权限时只显示 ID
      const found = await Promise.all(list.map((u) => apiFetch<Account | null>(`/admin/account/user/get/${u.userId}`).catch(() => null)));
      setNames(Object.fromEntries(found.filter((a): a is Account => a != null).map((a) => [a.id, a])));
    } catch (cause) { setError(describeError(cause)); setUsers([]); }
  }, []);
  React.useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function open() {
    const v = input.trim();
    if (!v) return;
    setSearching(true); setError(null);
    try {
      if (/^\d+$/.test(v)) {
        const a = await apiFetch<Account | null>(`/admin/account/user/get/${v}`).catch(() => null);
        setUser(a ?? { id: Number(v) });
      } else {
        const page = await apiFetch<{ list: Account[] }>(`/admin/account/user/page?pageNo=1&pageSize=10&username=${encodeURIComponent(v)}`);
        const hit = page.list.find((u) => u.username === v);
        if (!hit) throw new UserNotFound(t("userPrice.notFound", { user: v }));
        setUser(hit);
      }
      setInput("");
    } catch (cause) { setError(cause instanceof UserNotFound ? cause.message : describeError(cause)); }
    finally { setSearching(false); }
  }

  if (user) return <UserDetail user={user} onBack={() => { setUser(null); void loadUsers(); }} />;

  const columns: DataColumn<UserRow>[] = [
    { key: "user", header: t("userPrice.column.user"), cell: (r) => <span><span className="font-medium">{accountName(names[r.userId]) || "-"}</span> <span className="text-xs text-[var(--muted-foreground)]">#{r.userId}</span></span> },
    { key: "models", header: t("userPrice.column.models"), cell: (r) => t("userPrice.modelCount", { count: r.models }) },
    { key: "updatedAt", header: t("userPrice.column.updatedAt"), cell: (r) => formatDateTime(r.updatedAt) },
    { key: "actions", header: t("common.field.actions"), headerClassName: "text-right", className: "text-right",
      cell: (r) => <RowActions primary={[{ label: t("userPrice.action.view"), kind: "view", tone: "primary", onClick: () => setUser(names[r.userId] ?? { id: r.userId }) }]} /> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("common.eyebrow")} title={t("userPrice.title")} description={t("userPrice.description")} />
      <div className="flex items-end gap-2">
        <div className="w-64"><Input value={input} placeholder={t("userPrice.placeholder")} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void open(); }} /></div>
        <Button onClick={() => void open()} disabled={searching || !input.trim()}>{searching ? t("userPrice.searching") : t("userPrice.lookup")}</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Card><CardContent className="p-0">
        <DataTable columns={columns} rows={users ?? []} rowKey={(r) => r.userId} loading={users === null} minWidth={640}
          emptyTitle={t("userPrice.list.emptyTitle")} emptyDescription={t("userPrice.list.emptyDescription")} />
      </CardContent></Card>
    </div>
  );
}

/** 主表一行：他能调用的一个模型，以及它在他各分组下的报价（多数情况只有 default 一个）。 */
interface Line { model: string; displayName?: string | null; access: string; official: PriceItems; quotes: { group: Group; row: Row }[] }

function UserDetail({ user, onBack }: { user: Account; onBack: () => void }) {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const canUpdate = usePermission("gateway:price:update");
  const divisor = Number(t("userPrice.discountDivisor")) || 10;
  const [book, setBook] = React.useState<Group[] | null>(null);
  const [catalog, setCatalog] = React.useState<ModelOption[]>([]);
  const [rules, setRules] = React.useState<Record<string, { mode: string; discount?: string | null }>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<{ models: string[]; value: string } | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [results, setResults] = React.useState<string[]>([]);
  const [othersOpen, setOthersOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [b, prices, own] = await Promise.all([
        apiFetch<Group[]>(`/admin/gateway/price-rule/pricebook?userId=${user.id}`),
        apiFetch<ModelOption[]>("/admin/gateway/price/list").catch(() => [] as ModelOption[]),
        apiFetch<{ model: string; mode: string; discount?: string | null }[]>(`/admin/gateway/price-rule/list?subjectType=USER&subjectId=${user.id}`).catch(() => []),
      ]);
      setBook(b);
      setCatalog(prices.filter((m) => m.listed === 1));
      setRules(Object.fromEntries(own.map((r) => [r.model, { mode: r.mode, discount: r.discount }])));
    } catch (cause) { setError(describeError(cause)); setBook([]); }
  }, [user.id]);
  React.useEffect(() => { void load(); }, [load]);

  /** 他能调用的模型 = 他各分组（default + Key 所在分组）价目表的并集；只有一个分组时就是那一张。 */
  const lines: Line[] = React.useMemo(() => {
    const byModel = new Map<string, Line>();
    for (const g of book ?? []) for (const r of g.rows) {
      const cur = byModel.get(r.model) ?? { model: r.model, displayName: r.displayName, access: r.access, official: r.official, quotes: [] };
      cur.quotes.push({ group: g, row: r });
      byModel.set(r.model, cur);
    }
    return [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model));
  }, [book]);
  const callable = React.useMemo(() => new Set(lines.map((l) => l.model)), [lines]);
  /** 主表之外：限定开放还没开放给他的；以及设过协议价、但现在哪个分组都调不通的。 */
  const others = React.useMemo(() => catalog.filter((m) => !callable.has(m.model) && (m.access === "RULES_ONLY" || rules[m.model])), [catalog, callable, rules]);

  /** 万分位 → 输入框里的数（中文 7000 → 7，英文 → 70）。 */
  const toInput = (bp: number) => String(Number(((bp / 10000) * divisor).toFixed(2)));
  const offText = (bp: number | null | undefined) => bp == null ? "-" : bp === 10000 ? t("userPrice.full") : t("userPrice.off", { x: toInput(bp) });
  const ratioOf = (value: string) => Number(value) / divisor;
  const valid = (value: string) => { const x = Number(value); return Number.isFinite(x) && x > 0 && x <= divisor; };

  const ruleBody = (model: string, mode: "OFFICIAL_DISCOUNT" | "PLATFORM", value?: string) => ({
    subjectType: "USER", subjectId: String(user.id), model, mode,
    discount: mode === "OFFICIAL_DISCOUNT" ? String(Number(ratioOf(value ?? "").toFixed(4))) : null, prices: null, remark: null,
  });

  // 单个模型时实时预览（防抖）：他的价格与最差毛利，亏本不能保存
  React.useEffect(() => {
    if (!editing || editing.models.length !== 1 || !valid(editing.value)) { setPreview(null); setPreviewError(null); return; }
    const timer = window.setTimeout(async () => {
      try { setPreview(await apiWrite<Preview>("/admin/gateway/price-rule/preview", "POST", ruleBody(editing.models[0], "OFFICIAL_DISCOUNT", editing.value))); setPreviewError(null); }
      catch (cause) { setPreview(null); setPreviewError(describeError(cause)); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [editing]);

  async function apply(models: string[], write: (model: string) => Promise<unknown>) {
    setSaving(true); setResults([]);
    const failed: string[] = [];
    for (const m of models) {
      try { await write(m); } catch (cause) { failed.push(t("rule.saveFailed", { model: m, error: describeError(cause) })); }
    }
    setSaving(false); setSelected([]);
    await load();
    setResults(failed);
    return failed.length === 0;
  }

  const setDiscount = async () => {
    if (!editing || !valid(editing.value)) return;
    const done = await apply(editing.models, (m) => apiWrite("/admin/gateway/price-rule/save", "PUT", ruleBody(m, "OFFICIAL_DISCOUNT", editing.value)));
    if (done) setEditing(null);
  };
  const restore = (models: string[]) => apply(models, (m) =>
    apiWrite(`/admin/gateway/price-rule/delete?subjectType=USER&subjectId=${user.id}&model=${encodeURIComponent(m)}`, "DELETE"));
  const unlock = (models: string[]) => apply(models, (m) => apiWrite("/admin/gateway/price-rule/save", "PUT", ruleBody(m, "PLATFORM")));

  const negotiated = (model: string) => rules[model]?.mode === "OFFICIAL_DISCOUNT" || rules[model]?.mode === "FIXED";
  const openEditor = (model: string) => {
    setResults([]);
    const r = rules[model];
    const current = r?.mode === "OFFICIAL_DISCOUNT" && r.discount ? String(Number((Number(r.discount) * divisor).toFixed(2))) : "";
    setEditing({ models: [model], value: current });
  };
  const actions = (l: Line): RowAction[] => {
    if (!canUpdate) return [];
    if (!negotiated(l.model)) return [{ label: t("userPrice.action.set"), kind: "edit", tone: "primary", onClick: () => openEditor(l.model) }];
    // 取消协议价 = 删掉他的规则；「限定开放」的模型删掉后他就调不了了，所以改成「按全站价开放」而不是删
    return [{ label: t("userPrice.action.change"), kind: "edit", tone: "primary", onClick: () => openEditor(l.model) },
      { label: t("userPrice.action.restore"), kind: "delete", danger: true,
        onClick: () => void (l.access === "RULES_ONLY" ? unlock([l.model]) : restore([l.model])) }];
  };

  const SOURCE_STYLE: Record<string, string> = {
    USER: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    GROUP: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    PLATFORM: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  };
  /** 「开放」规则（PLATFORM）按全站价计，来源显示成全站价；只有折扣 / 固定价才算协议价。 */
  const sourceOf = (r: Row) => (r.source === "USER" && r.mode === "PLATFORM" ? "PLATFORM" : r.source);
  const multi = (l: Line) => l.quotes.length > 1 && new Set(l.quotes.map((q) => `${pricePair(q.row.price, t)}|${sourceOf(q.row)}`)).size > 1;
  /** 各分组报价一致时只显示一个；不一致时逐个分组列出（分组名：值）。 */
  const perGroup = (l: Line, render: (r: Row) => React.ReactNode) => multi(l)
    ? <div className="space-y-0.5">{l.quotes.map((q) => <div key={q.group.groupCode} className="flex items-center gap-1.5 whitespace-nowrap"><span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">{q.group.groupName}</span>{render(q.row)}</div>)}</div>
    : render(l.quotes[0].row);

  const worstOf = (l: Line) => l.quotes.map((q) => q.row.worst).filter((w): w is Combo => w != null).sort((a, b) => a.marginBp - b.marginBp)[0];
  const allOn = lines.length > 0 && lines.every((l) => selected.includes(l.model));
  const toggle = (m: string, on: boolean) => setSelected((s) => on ? [...s, m] : s.filter((x) => x !== m));
  const columns: DataColumn<Line>[] = [
    ...(canUpdate ? [{ key: "pick", header: <Checkbox checked={allOn} onCheckedChange={(v) => setSelected(v === true ? lines.map((l) => l.model) : [])} />,
      cell: (l: Line) => <Checkbox checked={selected.includes(l.model)} onCheckedChange={(v) => toggle(l.model, v === true)} /> } satisfies DataColumn<Line>] : []),
    { key: "model", header: t("common.field.model"), cell: (l) => <div>
      {l.displayName ? <><div className="text-sm font-medium">{l.displayName}</div><code className="text-[11px] text-[var(--muted-foreground)]">{l.model}</code></> : <code className="text-xs">{l.model}</code>}
      {l.access === "RULES_ONLY" && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t("rule.restricted")}</span>}
    </div> },
    { key: "official", header: t("rule.column.official"), cell: (l) => <span className="tabular-nums text-xs text-[var(--muted-foreground)]">{pricePair(l.official, t)}</span> },
    { key: "price", header: t("userPrice.column.price"), cell: (l) => perGroup(l, (r) => <span className="tabular-nums text-xs font-medium">{pricePair(r.price, t)}{r.tiered ? <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">{t("userPrice.tiered")}</span> : null}</span>) },
    { key: "discount", header: t("userPrice.column.discount"), cell: (l) => perGroup(l, (r) => <span className={sourceOf(r) === "USER" ? "font-medium" : "text-[var(--muted-foreground)]"}>{offText(r.discountBp)}</span>) },
    { key: "source", header: t("userPrice.column.source"), cell: (l) => perGroup(l, (r) => <span className={`inline-flex w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLE[sourceOf(r)] ?? ""}`}>{t(`userPrice.source.${sourceOf(r)}`)}</span>) },
    { key: "margin", header: t("rule.column.margin"), cell: (l) => { const w = worstOf(l); return w
      ? <span className={`inline-flex w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[w.status] ?? ""}`}>{(w.marginBp / 100).toFixed(1)}%</span>
      : <span className="text-xs text-[var(--muted-foreground)]">-</span>; } },
    ...(canUpdate ? [{ key: "actions", header: t("common.field.actions"), headerClassName: "text-right", className: "text-right", cell: (l: Line) => <RowActions primary={actions(l)} /> } satisfies DataColumn<Line>] : []),
  ];

  const pickedOwn = selected.filter(negotiated);
  const keyGroups = (book ?? []).filter((g) => (g.keys ?? 0) > 0);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("userPrice.title")} title={t("userPrice.who", { id: user.id, name: accountName(user) })} description={t("userPrice.detailDescription")}
        actions={<>{canUpdate && others.length > 0 && <Button variant="outline" onClick={() => setOthersOpen(true)}>{t("userPrice.action.others", { count: others.length })}</Button>}
          <Button variant="outline" onClick={onBack}>{t("userPrice.action.back")}</Button></>} />
      {error && <Alert tone="error">{error}</Alert>}
      {keyGroups.some((g) => g.groupCode !== "default") && <p className="text-xs text-[var(--muted-foreground)]">
        {t("userPrice.keyGroups", { groups: keyGroups.map((g) => t("userPrice.keyGroup", { name: g.groupName, ratio: g.groupRatio, keys: g.keys ?? 0 })).join("、") })}
      </p>}
      {canUpdate && selected.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
        <span>{t("userPrice.selected", { count: selected.length })}</span>
        <Button size="sm" onClick={() => { setResults([]); setEditing({ models: [...selected], value: "" }); }}>{t("userPrice.action.setBatch")}</Button>
        {pickedOwn.length > 0 && <Button size="sm" variant="outline" disabled={saving} onClick={() => {
          const restricted = new Set(lines.filter((l) => l.access === "RULES_ONLY").map((l) => l.model));
          void apply(pickedOwn, (m) => restricted.has(m) ? apiWrite("/admin/gateway/price-rule/save", "PUT", ruleBody(m, "PLATFORM"))
            : apiWrite(`/admin/gateway/price-rule/delete?subjectType=USER&subjectId=${user.id}&model=${encodeURIComponent(m)}`, "DELETE"));
        }}>{t("userPrice.action.restoreBatch", { count: pickedOwn.length })}</Button>}
        <Button size="sm" variant="ghost" onClick={() => setSelected([])}>{t("common.action.cancel")}</Button>
      </div>}
      {results.length > 0 && !editing && <Alert tone="warning">{results.map((l) => <div key={l}>{l}</div>)}</Alert>}
      <Card><CardContent className="p-0">
        <DataTable columns={columns} rows={lines} rowKey={(l) => l.model} loading={book === null}
          emptyTitle={t("userPrice.emptyTitle")} emptyDescription={t("userPrice.emptyDescription")} />
      </CardContent></Card>

      <Drawer open={othersOpen} onClose={() => setOthersOpen(false)} title={t("userPrice.others.title")} description={t("userPrice.others.description")}>
        <div className="space-y-2">
          {others.map((m) => <div key={m.model} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
            <span><code className="text-xs">{m.model}</code><span className="ml-2 text-xs text-[var(--muted-foreground)]">{rules[m.model] ? t("userPrice.others.noChannel") : t("userPrice.others.restricted")}</span></span>
            {rules[m.model]
              ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void restore([m.model])}>{t("userPrice.action.restore")}</Button>
              : <Button size="sm" disabled={saving} onClick={() => void unlock([m.model])}>{t("userPrice.action.unlock")}</Button>}
          </div>)}
          {others.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">{t("userPrice.others.empty")}</p>}
        </div>
      </Drawer>

      <Drawer open={editing != null} onClose={() => setEditing(null)}
        title={editing && editing.models.length === 1 ? t("userPrice.drawer.titleOne", { model: editing.models[0] }) : t("userPrice.drawer.titleMany", { count: editing?.models.length ?? 0 })}
        description={t("userPrice.drawer.description")}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>{t("common.action.cancel")}</Button>
          <Button onClick={() => void setDiscount()} disabled={saving || !editing || !valid(editing.value) || preview?.status === "LOSS"}>{saving ? t("common.action.saving") : t("common.action.save")}</Button></>}>
        {editing && <div className="space-y-4">
          <Field label={t("userPrice.field.discount")} hint={t("userPrice.field.discountHint")}>
            <div className="flex items-center gap-2">
              <Input autoFocus value={editing.value} inputMode="decimal" className="w-28" onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") void setDiscount(); }} />
              <span className="text-sm text-[var(--muted-foreground)]">{t("userPrice.discountUnit")}</span>
            </div>
          </Field>
          {editing.value.trim() !== "" && !valid(editing.value) && <p className="text-xs text-red-600">{t("userPrice.field.discountInvalid", { max: divisor })}</p>}
          {previewError && <Alert tone="error">{previewError}</Alert>}
          {preview && <div className="space-y-1 rounded-lg border border-[var(--border)] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>{t("userPrice.preview", { price: pricePair(preview.price, t) })}</span>
              <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[preview.status] ?? ""}`}>{t(`rule.status.${preview.status}`)}</span>
            </div>
            {preview.worst && <p className="text-xs text-[var(--muted-foreground)]">{t("rule.worst", { channel: preview.worst.channelName, margin: (preview.worst.marginBp / 100).toFixed(1) })}</p>}
            {preview.status === "LOSS" && <p className="text-xs text-red-600">{t("rule.preview.loss")}</p>}
          </div>}
          {editing.models.length > 1 && <p className="text-xs text-[var(--muted-foreground)]">{t("userPrice.drawer.batchHint")}</p>}
          {results.length > 0 && <Alert tone="warning">{results.map((l) => <div key={l}>{l}</div>)}</Alert>}
        </div>}
      </Drawer>
    </div>
  );
}
