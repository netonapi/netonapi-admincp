"use client";

import { WorkspaceLink } from "@neton/application-front-workspace";
import { AppWindow, ArrowUpRight, Boxes, KeyRound, Menu as MenuIcon, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { useSession } from "@neton/application-front-runtime/client-context";
import { useFormat, useT } from "@neton/application-front-runtime/i18n";
import { buildNav, type NavItem } from "@neton/application-front-runtime/menu";
import { installedModules } from "@/generated/modules.generated";

function leafItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => item.children?.length ? leafItems(item.children) : [item]);
}

export default function Dashboard() {
  const info = useSession();
  const t = useT("shell");
  const fmt = useFormat();
  const nav = buildNav(info.menus);
  const pages = leafItems(nav);
  const hour = new Date().getHours();
  const greeting = t(hour < 6 ? "dashboard.greetingNight" : hour < 12 ? "dashboard.greetingMorning" : hour < 18 ? "dashboard.greetingAfternoon" : "dashboard.greetingEvening");
  const stats = [
    { label: t("dashboard.modules"), value: installedModules.length, note: t("dashboard.modulesNote"), icon: Boxes, color: "bg-[var(--primary-soft)] text-[var(--primary)]" },
    { label: t("dashboard.pages"), value: pages.length, note: t("dashboard.pagesNote"), icon: MenuIcon, color: "bg-[var(--primary-soft)] text-[var(--primary)]" },
    { label: t("dashboard.roles"), value: info.roles.length, note: info.roles[0] || t("dashboard.noRole"), icon: UsersRound, color: "bg-[var(--primary-soft)] text-[var(--primary)]" },
    { label: t("dashboard.permissions"), value: info.permissions.length, note: t("dashboard.permissionsNote"), icon: KeyRound, color: "bg-[var(--primary-soft)] text-[var(--primary)]" },
  ];

  return (
    <div className="space-y-5">
      <section className="front-surface relative overflow-hidden rounded-xl px-6 py-7 md:px-8 md:py-9">
        <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border-[34px] border-[var(--foreground)]/[0.035]" />
        <div className="absolute right-32 top-8 h-28 w-28 rounded-full bg-[var(--foreground)]/[0.03] blur-2xl" />
        <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-[var(--primary)]">
              <Sparkles size={12} /> {t("nav.home")}
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)] md:text-3xl">{greeting}, {info.user.nickname || info.user.username}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">{t("dashboard.ready")}</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><ShieldCheck size={19} /></span>
            <span className="block text-xs font-semibold text-[var(--foreground)]">{t("dashboard.sessionValid")}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, note, icon: Icon, color }) => (
          <article key={label} className="front-surface rounded-xl p-5 transition-transform hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}><Icon size={17} /></span>
            </div>
            <div className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">{fmt.number(value)}</div>
            <div className="mt-2 text-xs text-[var(--muted-foreground)]">{note}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="front-surface rounded-xl p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div><h2 className="text-base font-bold text-[var(--foreground)]">{t("dashboard.shortcuts")}</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("dashboard.shortcutsNote")}</p></div>
            <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--primary)]">{fmt.number(pages.length)}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {pages.slice(0, 6).map((page, index) => (
              <WorkspaceLink key={page.path} to={page.path} className="group flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:bg-[var(--muted)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-sm font-bold text-[var(--foreground)]">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[var(--foreground)]">{page.name}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">{page.path}</span></span>
                <ArrowUpRight size={15} className="text-[var(--muted-foreground)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
              </WorkspaceLink>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.35)] md:p-6">
          <h2 className="text-base font-bold text-[var(--foreground)]">{t("dashboard.distribution")}</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("dashboard.distributionNote")}</p>
          <div className="mt-5 space-y-3">
            {installedModules.map((module) => (
              <div key={module.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-white"><AppWindow size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-[var(--foreground)]">{module.id}</span><span className="block text-xs text-[var(--muted-foreground)]">contract {module.contractVersion}</span></span>
                <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-[var(--primary-soft)] p-4 text-xs leading-5 text-[var(--muted-foreground)]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--primary)]" />
            {t("dashboard.visibility")}
          </div>
        </div>
      </section>
    </div>
  );
}
