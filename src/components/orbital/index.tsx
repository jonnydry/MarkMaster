"use client";

// Canonical Orbital primitives + thin reusable components
// Import: import { orbital, OrbitalCard, TelemetryStat, ... } from '@/components/orbital'

import { cn } from "@/lib/utils";
import { orbitalTypography } from "@/lib/typography";
import { useTypography } from "@/hooks/use-typography";
import React from "react";

export type OrbitalTone = "cyan" | "bronze" | "emerald";

/** Shared surface primitives for elevated panels and auth chrome. */
export const orbital = {
  glass: "glass-orbital rounded-sm",
  label: orbitalTypography.label,
  data: orbitalTypography.data,
  badge: (tone: OrbitalTone) =>
    tone === "cyan"
      ? "border-primary/40 bg-primary/10 text-primary"
      : tone === "bronze"
        ? "border-bronze/30 bg-bronze/10 text-bronze"
        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-600",
  pill: "inline-flex items-center gap-1 rounded-sm border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary",
  icon: "bg-primary/10 text-primary",
  menu: "rounded-sm border border-hairline-soft bg-[var(--surface-1)] shadow-xl py-1 text-[13px] min-w-[136px]",
  menuItem:
    "flex items-center gap-2.5 px-3 py-1.5 text-[var(--foreground)] hover:bg-primary/5 active:bg-primary/10 cursor-pointer transition-colors",
  actionPill:
    "inline-flex items-center gap-px rounded-sm border border-primary/20 bg-[var(--surface-1)]/95 px-1 py-0.5 shadow-sm backdrop-blur",
  sectionLabel: orbitalTypography.sectionLabel,
  slideIn:
    "glass-orbital orbital-slide-in-shadow border-l-2 border-primary/40",
};

export function OrbitalCard({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <div className={cn(orbital.glass, className)} {...props}>
      {children}
    </div>
  );
}

export function TelemetryStat({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: string;
  /** Reserved for future tone-specific stat styling */
  tone?: OrbitalTone;
  className?: string;
}) {
  const t = useTypography();
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className={cn(t.data, "text-lg font-medium leading-none")}>{value}</div>
      <div className={cn(t.label, "text-2xs text-primary/70")}>{label}</div>
    </div>
  );
}

export function OrbitalBadge({
  children,
  tone = "cyan",
  className,
}: {
  children: React.ReactNode;
  tone?: OrbitalTone;
  className?: string;
}) {
  const t = useTypography();
  return (
    <span
      className={cn(
        orbital.badge(tone),
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.08em]",
        t.monoNative && t.label,
        className
      )}
    >
      {children}
    </span>
  );
}

export function MissionControlHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
}) {
  const t = useTypography();
  return (
    <div
      className={cn(
        "mb-3 flex items-center justify-between border-b border-primary/20 pb-2",
        className
      )}
    >
      <div className={cn(t.label, "text-primary/80")}>{title}</div>
      {right}
    </div>
  );
}

export interface OrbitalRingsProps {
  className?: string;
  tone?: OrbitalTone;
  animated?: boolean;
  showParticles?: boolean;
  size?: "sm" | "md" | "lg";
}

export function OrbitalRings({
  className,
  tone = "cyan",
  animated = true,
  showParticles = false,
  size = "md",
}: OrbitalRingsProps) {
  const toneClass =
    tone === "bronze"
      ? "text-bronze"
      : tone === "emerald"
        ? "text-emerald-400"
        : "text-primary";
  const sizeClass =
    size === "sm" ? "h-24 w-32" : size === "lg" ? "h-80 w-[28rem]" : "h-48 w-64";

  return (
    <svg
      viewBox="0 0 320 240"
      aria-hidden="true"
      className={cn(toneClass, sizeClass, className)}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <g className={animated ? "orbital-ring-slow" : undefined}>
        <ellipse
          cx="160"
          cy="120"
          rx="148"
          ry="48"
          transform="rotate(-22 160 120)"
          stroke="currentColor"
          strokeOpacity="0.22"
        />
      </g>
      <g className={animated ? "orbital-ring-medium" : undefined}>
        <ellipse
          cx="160"
          cy="120"
          rx="108"
          ry="32"
          transform="rotate(16 160 120)"
          stroke="currentColor"
          strokeOpacity="0.16"
        />
      </g>
      <g className={animated ? "orbital-ring-fast" : undefined}>
        <ellipse
          cx="160"
          cy="120"
          rx="64"
          ry="20"
          transform="rotate(-44 160 120)"
          stroke="currentColor"
          strokeOpacity="0.12"
        />
      </g>
      <g className={animated ? "orbital-nucleus" : undefined}>
        <circle cx="160" cy="120" r="14" fill="currentColor" fillOpacity="0.07" />
        <circle cx="160" cy="120" r="3" fill="currentColor" />
      </g>
      {showParticles && (
        <>
          <circle cx="80" cy="95" r="1.5" fill="currentColor" fillOpacity="0.35" />
          <circle cx="240" cy="145" r="1.2" fill="currentColor" fillOpacity="0.28" />
          <circle cx="120" cy="165" r="1.8" fill="currentColor" fillOpacity="0.32" />
        </>
      )}
    </svg>
  );
}

export { orbital as primitives };

export function OrbitalMenu({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <div className={cn(orbital.menu, "orbital-menu", className)} {...props}>
      {children}
    </div>
  );
}

export function OrbitalActionPill({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <div className={cn(orbital.actionPill, "orbital-action-pill", className)} {...props}>
      {children}
    </div>
  );
}
