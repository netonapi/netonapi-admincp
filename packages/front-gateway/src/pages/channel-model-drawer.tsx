"use client";

import * as React from "react";
import { Alert, Button, Drawer, Field, Input } from "@neton/application-front-kit";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission, useQuery } from "@neton/application-front-runtime/client-context";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

interface ChannelModel {
  model: string;
  costDiscount?: string | null;
  enabled: boolean;
}

function ModelRow({ channelId, row, editable, onSave }: {
  channelId: number; row: ChannelModel; editable: boolean; onSave(): void;
}) {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const [discount, setDiscount] = React.useState(row.costDiscount ?? "");
  const [enabled, setEnabled] = React.useState(row.enabled);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const changed = discount.trim() !== (row.costDiscount ?? "") || enabled !== row.enabled;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiWrite("/admin/gateway/channel/model-config", "PUT", {
        channelId, model: row.model, costDiscount: discount.trim() || null, enabled,
      });
      onSave();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save} className="space-y-2 p-3">
    <code className="break-all text-sm">{row.model}</code>
    <div className="flex flex-wrap items-end gap-3">
      <div className="max-w-48">
        <Field label={t("channel.field.costDiscount")}>
          <Input inputMode="decimal" value={discount} placeholder={t("channel.placeholder.costDiscount")}
            disabled={!editable || saving} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 py-2 text-sm">
        <input type="checkbox" checked={enabled} disabled={!editable || saving || (!enabled && !discount.trim())}
          onChange={(e) => setEnabled(e.target.checked)} />
        {t("channel.models.enable")}
      </label>
      {editable && <Button type="submit" variant="outline" disabled={saving || !changed || (enabled && !discount.trim())}>
        {saving ? t("common.action.saving") : t("common.action.save")}
      </Button>}
    </div>
    {error && <Alert tone="error">{error}</Alert>}
  </form>;
}

export function ChannelModelDrawer({ channel, onClose, onSave }: {
  channel: { id: number; name: string }; onClose(): void; onSave(): void;
}) {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const editable = usePermission("gateway:channel:update");
  const [search, setSearch] = React.useState("");
  const query = useQuery({
    queryKey: ["gateway-channel-models", channel.id],
    queryFn: () => apiFetch<ChannelModel[]>(`/admin/gateway/channel/model-config/${channel.id}`),
  });
  const rows = query.data?.filter((row) => row.model.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  return <Drawer open onClose={onClose} title={t("channel.models.title", { name: channel.name })}
    description={t("channel.hint.costDiscount")} widthClassName="max-w-3xl">
    <div className="space-y-3">
      <Field label={t("common.field.model")}>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} />
      </Field>
      {query.error && <Alert tone="error">{describeError(query.error)}</Alert>}
      {query.isPending && <p role="status" className="text-sm">{t("channel.models.loading")}</p>}
      {query.data && !rows.length && <p className="text-sm text-[var(--muted-foreground)]">{t("channel.models.empty")}</p>}
      <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {rows.map((row) => <ModelRow key={JSON.stringify([row.model, row.costDiscount, row.enabled])}
          channelId={channel.id} row={row} editable={editable} onSave={() => { void query.refetch(); onSave(); }} />)}
      </div>
    </div>
  </Drawer>;
}
