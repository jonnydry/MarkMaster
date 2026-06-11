"use client";

import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge } from "@/components/ui/chip";
import { ToolbarSegmentControl } from "@/components/toolbar/toolbar-primitives";
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/auth";
import type { OrbitXaiStatusPayload } from "@/types";

export const SETTINGS_SECTIONS = [
  { id: "connection", label: "Connection" },
  { id: "orbit-grok", label: "Orbit Grok" },
  { id: "appearance", label: "Appearance" },
  { id: "export", label: "Export" },
  { id: "tags", label: "Tags" },
  { id: "account", label: "Account" },
] as const;

export function SettingsNav({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Settings sections"
      className={cn("space-y-0.5", className)}
    >
      {SETTINGS_SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className={cn(
            "block rounded-sm px-2.5 py-1.5 text-sm text-muted-foreground transition-colors",
            "hover:bg-accent-soft/70 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

export function SettingsHero({
  user,
  tagCount,
  collectionCount,
}: {
  user: DbUser | undefined;
  tagCount: number;
  collectionCount: number;
}) {
  const lastSyncLabel = user?.lastSyncAt
    ? `Synced ${formatDistanceToNow(new Date(user.lastSyncAt), { addSuffix: true })}`
    : "Not synced yet";

  return (
    <section className="flex min-w-0 items-center gap-3 border-b border-hairline-soft pb-5">
      <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-hairline-soft bg-surface-2">
        {user?.profileImageUrl ? (
          <Image
            src={user.profileImageUrl}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
            {user?.username?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold heading-font">
          {user?.displayName ?? user?.username ?? "Your account"}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {user?.username ? `@${user.username}` : "Connect X to sync bookmarks"}
          <span className="text-muted-foreground/60"> · </span>
          {lastSyncLabel}
        </p>
      </div>
      <dl className="hidden shrink-0 gap-4 text-right sm:flex">
        <div>
          <dt className="text-xs text-muted-foreground">Tags</dt>
          <dd className="text-sm font-semibold tabular-nums">{tagCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Collections</dt>
          <dd className="text-sm font-semibold tabular-nums">
            {collectionCount.toLocaleString()}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  badge,
  action,
  children,
  className,
  tone = "default",
}: {
  id: string;
  icon?: LucideIcon;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "danger";
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 border-b border-hairline-soft pb-8 last:border-b-0 last:pb-0", className)}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {Icon ? (
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  tone === "danger" ? "text-destructive" : "text-muted-foreground"
                )}
                aria-hidden
              />
            ) : null}
            <h2
              className={cn(
                "text-sm font-semibold heading-font",
                tone === "danger" && "text-destructive"
              )}
            >
              {title}
            </h2>
            {badge}
          </div>
          {description ? (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  children,
  divider = true,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between",
        divider && "border-t border-hairline-soft first:border-t-0 first:pt-0 last:pb-0"
      )}
    >
      <div className="min-w-0 sm:max-w-[62%]">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0 sm:ml-4">{children}</div>
    </div>
  );
}

export const settingsSurfaceClass =
  "surface-inset";

export function SettingsSegment<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <ToolbarSegmentControl
      value={value}
      options={options}
      onChange={onChange}
      aria-label={ariaLabel}
      variant="library"
      size="md"
    />
  );
}

export function OrbitReadyBadge({
  status,
}: {
  status: OrbitXaiStatusPayload | undefined;
}) {
  if (!status) {
    return (
      <StatusBadge tone="neutral" className="font-normal">
        Checking
      </StatusBadge>
    );
  }

  const ready = status.state === "ready";
  return (
    <StatusBadge
      tone={ready ? "success" : "warning"}
      dot={
        <span
          className={cn("size-1.5 rounded-full", ready ? "bg-emerald-500" : "bg-amber-500")}
          aria-hidden
        />
      }
    >
      {ready ? "Ready" : "Needs attention"}
    </StatusBadge>
  );
}
