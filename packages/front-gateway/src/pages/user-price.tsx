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

/** 表格里的一行：价目表里的模型（可调用），或调不通的上架模型——LOCKED（限定开放、还没开放给他）/ UNSERVED（这个分组没有渠道承载）。 */
interface Line extends Row { locked?: boolean }

/** 查用户时「没有这个用户」：本地文案，与接口错误区分开。 */
class UserNotFound extends Error {}

const accountName = (a: Account | undefined) => a?.username || a?.nickname || "";

/**
 * 用户定价（docs/gateway-pricing-spec.md §4.3）：给单个用户按模型打折，只做这一件事。
 *
 * - 列表：所有有协议价的用户；搜索任意用户进入详情。
 * - 详情：一张表列出全部上架模型——官方价、他的价格、折扣、价格来源（标准价 / 分组价 / 协议价）、毛利，
 *   行尾【协议定价】设折扣，可批量。调不通的模型也列出并标明原因（未开放 / 暂无渠道），不把行藏掉。
 *   价格跟着 Key 的分组走：default 分组始终可看（他随时能建一把不绑分组的 Key），他的 Key 所在分组各一个页签。
 *
 * 折扣按官方价计（「官方价 7 折」），存成定价规则 OFFICIAL_DISCOUNT；开放存成 PLATFORM。
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

function UserDetail({ user, onBack }: { user: Account; onBack: () => void }) {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const canUpdate = usePermission("gateway:price:update");
  const divisor = Number(t("userPrice.discountDivisor")) || 10;
  const [book, setBook] = React.useState<Group[] | null>(null);
  const [catalog, setCatalog] = React.useState<ModelOption[]>([]);
  const [groupCode, setGroupCode] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<{ models: string[]; value: string } | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [results, setResults] = React.useState<string[]>([]);
  const [rules, setRules] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [b, prices, own] = await Promise.all([
        apiFetch<Group[]>(`/admin/gateway/price-rule/pricebook?userId=${user.id}`),
        apiFetch<ModelOption[]>("/admin/gateway/price/list").catch(() => [] as ModelOption[]),
        apiFetch<{ model: string; mode: string }[]>(`/admin/gateway/price-rule/list?subjectType=USER&subjectId=${user.id}`).catch(() => []),
      ]);
      setBook(b);
      // 默认看他 Key 最多的那个分组（都没有就是 default）
      setGroupCode((cur) => (cur && b.some((g) => g.groupCode === cur) ? cur
        : [...b].sort((x, y) => (y.keys ?? 0) - (x.keys ?? 0))[0]?.groupCode ?? null));
      setCatalog(prices.filter((m) => m.listed === 1).sort((a, c) => a.model.localeCompare(c.model)));
      setRules(Object.fromEntries(own.map((r) => [r.model, r.mode])));
    } catch (cause) { setError(describeError(cause)); setBook([]); }
  }, [user.id]);
  React.useEffect(() => { void load(); }, [load]);

  const group = book?.find((g) => g.groupCode === groupCode) ?? null;
  /** 全部上架模型：价目表里有的照它（可调用），没有的标出原因（限定开放未开放 / 这个分组没有渠道承载）。 */
  const lines: Line[] = React.useMemo(() => {
    if (!group) return [];
    const inBook = new Map(group.rows.map((r) => [r.model, r]));
    return catalog.map((m): Line => {
      const r = inBook.get(m.model);
      if (r) return r;
      const official = { input: m.inputPrice, output: m.outputPrice, cacheRead: "0", cacheWrite: "0", perRequest: m.perRequestPrice ?? null };
      const closed = m.access === "RULES_ONLY" && !rules[m.model];
      return { model: m.model, displayName: m.displayName, tiered: false, access: m.access ?? "ALL", official, price: official,
        source: closed ? "LOCKED" : "UNSERVED", locked: closed, mode: rules[m.model] ?? null };
    });
  }, [group, catalog, rules]);

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

  /** 他有自己的规则（协议价或开放）——不论这个分组有没有渠道承载。 */
  const isOwn = (r: Line) => r.source === "USER" || rules[r.model] != null;
  const openEditor = (r: Line) => {
    setResults([]);
    const current = rules[r.model] === "OFFICIAL_DISCOUNT" && r.source === "USER" && r.discountBp ? toInput(r.discountBp) : "";
    setEditing({ models: [r.model], value: current });
  };
  const actions = (r: Line): RowAction[] => {
    if (!canUpdate) return [];
    if (r.locked) return [{ label: t("userPrice.action.unlock"), kind: "enable", onClick: () => void unlock([r.model]) },
      { label: t("userPrice.action.set"), kind: "edit", tone: "primary", onClick: () => openEditor(r) }];
    if (!isOwn(r)) return [{ label: t("userPrice.action.set"), kind: "edit", tone: "primary", onClick: () => openEditor(r) }];
    // 取消 = 删掉他的规则；「限定开放」的模型删掉后他就看不到了
    return [{ label: t("userPrice.action.change"), kind: "edit", tone: "primary", onClick: () => openEditor(r) },
      { label: r.access === "RULES_ONLY" ? t("userPrice.action.lock") : t("userPrice.action.restore"), kind: "delete", danger: true, onClick: () => void restore([r.model]) }];
  };

  const SOURCE_STYLE: Record<string, string> = {
    USER: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    GROUP: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    PLATFORM: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    LOCKED: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    UNSERVED: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  };
  const sourceCell = (r: Line) => <span className="inline-flex flex-col gap-0.5">
    <span className={`inline-flex w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLE[r.source] ?? ""}`}>{t(`userPrice.source.${r.source}`)}</span>
    {r.source === "UNSERVED" && isOwn(r) && <span className="text-[11px] text-[var(--muted-foreground)]">{t("userPrice.source.ownHere")}</span>}
  </span>;

  const allOn = lines.length > 0 && lines.every((r) => selected.includes(r.model));
  const toggle = (m: string, on: boolean) => setSelected((s) => on ? [...s, m] : s.filter((x) => x !== m));
  const unavailable = (r: Line) => r.source === "LOCKED" || r.source === "UNSERVED";
  const columns: DataColumn<Line>[] = [
    ...(canUpdate ? [{ key: "pick", header: <Checkbox checked={allOn} onCheckedChange={(v) => setSelected(v === true ? lines.map((r) => r.model) : [])} />,
      cell: (r: Line) => <Checkbox checked={selected.includes(r.model)} onCheckedChange={(v) => toggle(r.model, v === true)} /> } satisfies DataColumn<Line>] : []),
    { key: "model", header: t("common.field.model"), cell: (r) => <div>
      {r.displayName ? <><div className="text-sm font-medium">{r.displayName}</div><code className="text-[11px] text-[var(--muted-foreground)]">{r.model}</code></> : <code className="text-xs">{r.model}</code>}
      {r.access === "RULES_ONLY" && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t("rule.restricted")}</span>}
    </div> },
    { key: "official", header: t("rule.column.official"), cell: (r) => <span className="tabular-nums text-xs text-[var(--muted-foreground)]">{pricePair(r.official, t)}</span> },
    { key: "price", header: t("userPrice.column.price"), cell: (r) => unavailable(r) ? <span className="text-xs text-[var(--muted-foreground)]">-</span>
      : <span className="tabular-nums text-xs font-medium">{pricePair(r.price, t)}{r.tiered ? <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">{t("userPrice.tiered")}</span> : null}</span> },
    { key: "discount", header: t("userPrice.column.discount"), cell: (r) => unavailable(r) ? <span className="text-xs text-[var(--muted-foreground)]">-</span>
      : <span className={r.source === "USER" ? "font-medium" : "text-[var(--muted-foreground)]"}>{r.source === "USER" && r.mode === "PLATFORM" ? t("userPrice.unlocked") : offText(r.discountBp)}</span> },
    { key: "source", header: t("userPrice.column.source"), cell: sourceCell },
    { key: "margin", header: t("rule.column.margin"), cell: (r) => r.worst
      ? <span className={`inline-flex w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.worst.status] ?? ""}`}>{(r.worst.marginBp / 100).toFixed(1)}%</span>
      : <span className="text-xs text-[var(--muted-foreground)]">-</span> },
    ...(canUpdate ? [{ key: "actions", header: t("common.field.actions"), headerClassName: "text-right", className: "text-right", cell: (r: Line) => <RowActions primary={actions(r)} /> } satisfies DataColumn<Line>] : []),
  ];

  const picked = lines.filter((r) => selected.includes(r.model));
  const pickedLocked = picked.filter((r) => r.locked).map((r) => r.model);
  const pickedOwn = picked.filter(isOwn).map((r) => r.model);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("userPrice.title")} title={t("userPrice.who", { id: user.id, name: accountName(user) })} description={t("userPrice.detailDescription")}
        actions={<Button variant="outline" onClick={onBack}>{t("userPrice.action.back")}</Button>} />
      {error && <Alert tone="error">{error}</Alert>}
      {book && book.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--muted-foreground)]">{t("userPrice.groupSwitch")}</span>
        {book.map((g) => <Button key={g.groupCode} size="sm" variant={g.groupCode === groupCode ? "default" : "outline"} onClick={() => setGroupCode(g.groupCode)}>
          {t("userPrice.groupTab", { name: g.groupName, ratio: g.groupRatio, keys: g.keys ?? 0 })}
        </Button>)}
      </div>}
      {group && <p className="text-xs text-[var(--muted-foreground)]">{t("userPrice.groupHint", { name: group.groupName, keys: group.keys ?? 0 })}</p>}
      {canUpdate && selected.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
        <span>{t("userPrice.selected", { count: selected.length })}</span>
        <Button size="sm" onClick={() => { setResults([]); setEditing({ models: picked.map((r) => r.model), value: "" }); }}>{t("userPrice.action.setBatch")}</Button>
        {pickedLocked.length > 0 && <Button size="sm" variant="outline" onClick={() => void unlock(pickedLocked)} disabled={saving}>{t("userPrice.action.unlockBatch", { count: pickedLocked.length })}</Button>}
        {pickedOwn.length > 0 && <Button size="sm" variant="outline" onClick={() => void restore(pickedOwn)} disabled={saving}>{t("userPrice.action.restoreBatch", { count: pickedOwn.length })}</Button>}
        <Button size="sm" variant="ghost" onClick={() => setSelected([])}>{t("common.action.cancel")}</Button>
      </div>}
      {results.length > 0 && !editing && <Alert tone="warning">{results.map((l) => <div key={l}>{l}</div>)}</Alert>}
      <Card><CardContent className="p-0">
        <DataTable columns={columns} rows={lines} rowKey={(r) => r.model} loading={book === null}
          emptyTitle={t("userPrice.emptyTitle")} emptyDescription={t("userPrice.emptyDescription")} />
      </CardContent></Card>

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
