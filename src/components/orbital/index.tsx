"use client";

// Canonical Orbital primitives + thin reusable components
// Import: import { orbital, OrbitalMenu, OrbitalRings } from '@/components/orbital'

import { cn } from "@/lib/utils";
import { orbitalTypography } from "@/lib/typography";
import React from "react";

export type OrbitalTone = "cyan" | "bronze" | "emerald";

/** Shared Orbit chrome primitives (row menu, action pill, labels). */
export const orbital = {
  label: orbitalTypography.label,
  data: orbitalTypography.data,
  // Flat floating menu: popover + strong hairline, no shadow or blur.
  menu: "rounded-sm border border-hairline-strong bg-popover py-1 text-[13px] min-w-[136px]",
  menuItem:
    "flex items-center gap-2.5 px-3 py-1.5 text-foreground hover:bg-hover active:bg-hover cursor-pointer transition-colors",
  actionPill:
    "inline-flex items-center gap-px rounded-sm border border-hairline-soft bg-popover px-1 py-0.5",
};

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
        ? "text-success"
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
    <div className={cn(orbital.menu, className)} {...props}>
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
    <div className={cn(orbital.actionPill, className)} {...props}>
      {children}
    </div>
  );
}
