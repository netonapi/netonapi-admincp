"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { usePermission } from "@neton/application-front-runtime/client-context";
import { Alert, Button, Drawer, Field, Textarea } from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useT } from "@neton/application-front-runtime/i18n";

export interface KeyChannel { id: number; name: string; type?: string | null }
interface ChannelKey { id: number; display: string; status: number; failCount: number; lastError?: string | null }

/**
 * 粘贴框里的 Key 拆成一条条：一行一个；以 `{` 开头时整段是一份服务账号 JSON（Vertex），本身跨多行，不能按行拆。
 */
export function splitKeys(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  if (trimmed.startsWith("{")) return [trimmed];
  return trimmed.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
}

/** 不同渠道类型的 Key 写法不一样，提示跟着类型走。 */
export function keyPlaceholderKey(type?: string | null): string {
  if (type === "bedrock") return "channel.placeholder.keysBedrock";
  if (type === "vertex_anthropic" || type === "vertex_gemini") return "channel.placeholder.keysVertex";
  return "channel.placeholder.keys";
}

/**
 * 渠道的 API Key：列出（只显示掩码）、追加、删除。一条渠道可挂多把 Key，请求在可用的 Key 间轮换；
 * 连续失败的 Key 会被自动禁用，「恢复渠道」会把它们复位。
 */
export function ChannelKeyDrawer({ channel, onClose }: { channel: KeyChannel | null; onClose: () => void }) {
  const t = useT("gateway");
  const describeError = useDescribeError("gateway");
  const canUpdate = usePermission("gateway:channel:update");
  const [keys, setKeys] = React.useState<ChannelKey[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!channel) return;
    setError(null);
    try { setKeys(await apiFetch<ChannelKey[]>(`/admin/gateway/channel/keys/${channel.id}`)); }
    catch (cause) { setError(describeError(cause)); }
  }, [channel]);
  React.useEffect(() => { setKeys(null); setDraft(""); setNotice(null); void load(); }, [load]);

  async function add() {
    if (!channel) return;
    const list = splitKeys(draft);
    if (list.length === 0) return;
    setBusy(true); setError(null); setNotice(null);
    let added = 0;
    try {
      for (const apiKey of list) { await apiWrite<number>(`/admin/gateway/channel/keys/${channel.id}/add`, "POST", { apiKey }); added++; }
      setDraft("");
      setNotice(t("channelKey.added", { count: added }));
    } catch (cause) {
      setError(added > 0 ? t("channelKey.partial", { added, error: describeError(cause) }) : describeError(cause));
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function remove(key: ChannelKey) {
    if (!window.confirm(t("channelKey.delete.confirm", { key: key.display }))) return;
    setBusy(true); setError(null); setNotice(null);
    try { await apiWrite(`/admin/gateway/channel/keys/delete/${key.id}`, "DELETE"); await load(); }
    catch (cause) { setError(describeError(cause)); }
    finally { setBusy(false); }
  }

  return (
    <Drawer open={channel != null} onClose={onClose} title={channel ? t("channelKey.title", { name: channel.name }) : ""}
      description={t("channelKey.description")}
      footer={<Button variant="outline" onClick={onClose}>{t("common.action.close")}</Button>}>
      {channel && <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}
        {keys && keys.length === 0 && <Alert tone="warning">{t("channelKey.empty")}</Alert>}

        {keys && keys.length > 0 && <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-2 p-2.5 text-xs">
              <span className="min-w-0">
                <code className="break-all">{k.display}</code>
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${k.status === 1 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {t(k.status === 1 ? "channelKey.status.active" : "channelKey.status.disabled")}
                </span>
                {k.failCount > 0 && <span className="ml-2 text-[var(--muted-foreground)]">{t("channelKey.failCount", { count: k.failCount })}</span>}
                {k.lastError && <span className="block break-all text-[11px] text-red-600">{k.lastError}</span>}
              </span>
              {canUpdate && <Button variant="ghost" disabled={busy} onClick={() => void remove(k)}>{t("common.action.delete")}</Button>}
            </div>
          ))}
        </div>}

        {canUpdate && <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
          <Field label={t("channelKey.addLabel")}>
            <Textarea value={draft} rows={4} placeholder={t(keyPlaceholderKey(channel.type))} onChange={(e) => setDraft(e.target.value)} />
          </Field>
          <Button disabled={busy || splitKeys(draft).length === 0} onClick={() => void add()}>{t("channelKey.action.add")}</Button>
        </div>}
      </div>}
    </Drawer>
  );
}
