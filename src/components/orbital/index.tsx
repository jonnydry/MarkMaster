// Canonical Orbital primitives + thin reusable components
// This is the single source of truth for authoring surfaces under the futuristic minimalism language
// when `data-theme="orbital"` is active.
//
// All new code (and progressive refactors) should import from here:
//   import { orbital, OrbitalCard, TelemetryStat, MissionControlHeader, OrbitalBadge, OrbitalMenu, OrbitalActionPill } from '@/components/orbital'
//
// Visuals are strictly gated behind the orbital theme layer. Default app colors are untouched.

import { cn } from '@/lib/utils';
import React from 'react';

export type OrbitalTone = 'cyan' | 'bronze' | 'emerald';

export const orbital = {
  // Glassmorphism panel with inner cyan glow + fine grain (only visible under orbital theme)
  glass: 'glass-orbital rounded-sm',

  // Expressive telemetry label (JetBrains Mono, tight tracking, uppercase intent)
  label: 'text-mono-label tracking-[0.14em]',

  // Primary data / metric / reasoning text (tabular-nums, strong presence)
  data: 'text-mono-data font-mono tabular-nums',

  // Tone-aware badge for confidence, status, tags
  badge: (tone: OrbitalTone) =>
    tone === 'cyan'
      ? 'border-primary/40 bg-primary/10 text-primary'
      : tone === 'bronze'
      ? 'border-bronze/30 bg-bronze/10 text-bronze'
      : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',

  // Subtle pill / tag container
  pill: 'inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary',

  // Icon treatment
  icon: 'bg-primary/10 text-primary',

  // === New surfaces for the Orbit redesign (clean list + slide-in + overlays) ===

  // Compact floating contextual menu (vertical, used for quick actions on list rows)
  menu: 'rounded-sm border border-hairline-soft bg-[var(--surface-1)] shadow-xl py-1 text-[13px] min-w-[136px]',

  // Individual actionable item inside an orbital menu
  menuItem: 'flex items-center gap-2.5 px-3 py-1.5 text-[var(--foreground)] hover:bg-primary/5 active:bg-primary/10 cursor-pointer transition-colors',

  // Ultra-light floating action pill / cluster (for hover or selection states on rows)
  actionPill: 'inline-flex items-center gap-px rounded-full border border-primary/20 bg-[var(--surface-1)]/95 px-1 py-0.5 shadow-sm backdrop-blur',

  // Section label inside slide-in panels and inspectors (e.g. "TAGS", "DECISIONS")
  sectionLabel: 'text-mono-label text-primary/60 tracking-[0.16em] mb-1.5',

  // Base styles for the right-edge slide-in review panel
  slideIn: 'glass-orbital border-l-2 border-primary/40 shadow-[-14px_0_40px_-16px_rgba(0,0,0,0.65)]',
};

// Thin reusable components — the preferred way to build consistent mission-control surfaces

// Generic glass panel / card
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

// Telemetry / metric stat pair (value + label)
export function TelemetryStat({
  value,
  label,
  // tone reserved for future variant styling (cyan/bronze etc under orbital)
  tone = 'cyan',
  className,
}: {
  value: React.ReactNode;
  label: string;
  tone?: OrbitalTone;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className={cn(orbital.data, 'text-lg font-medium leading-none')}>
        {value}
      </div>
      <div className={cn(orbital.label, 'text-[10px] text-primary/70')}>
        {label}
      </div>
    </div>
  );
}

// Small status / confidence badge
export function OrbitalBadge({
  children,
  tone = 'cyan',
  className,
}: {
  children: React.ReactNode;
  tone?: OrbitalTone;
  className?: string;
}) {
  return (
    <span className={cn(orbital.badge(tone), 'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', className)}>
      {children}
    </span>
  );
}

// Standard mission-control section header (left queue / right inspector style)
export function MissionControlHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between border-b border-primary/20 pb-2', className)}>
      <div className={cn(orbital.label, 'text-primary/80')}>{title}</div>
      {right}
    </div>
  );
}

// Promoted OrbitalRings — three independently rotating tilted ellipses + breathing nucleus + optional telemetry particles.
// Animations + effects only apply under .theme-orbital / data-theme="orbital" (neutral on default experience).
// Use via canonical import: import { OrbitalRings } from '@/components/orbital'
// Props support telemetry variants as planned in Master Unification.
// Note: animation speeds are fixed canonical CSS durations (ring-rotate-slow/medium/fast + nucleus-breath in globals.css) for performance + reduced-motion safety. `animated` toggle + tone/size/particles provide the variant surface. (speed prop deferred per bounded scope; no behavioral change to existing usage.)
export interface OrbitalRingsProps {
  className?: string;
  /** Tone controls the glow tint via currentColor (cyan = primary orbital glow, bronze = warm accent) */
  tone?: OrbitalTone;
  /** Enable/disable CSS animations (rotations + breath). Default true. Respects reduced-motion globally. */
  animated?: boolean;
  /** Show sparse telemetry / particle dots for extra "living system" variant */
  showParticles?: boolean;
  /** Visual scale preset */
  size?: 'sm' | 'md' | 'lg';
}

export function OrbitalRings({
  className,
  tone = 'cyan',
  animated = true,
  showParticles = false,
  size = 'md',
}: OrbitalRingsProps) {
  const toneClass = tone === 'bronze' ? 'text-bronze' : tone === 'emerald' ? 'text-emerald-400' : 'text-primary';
  const sizeClass =
    size === 'sm' ? 'h-24 w-32' : size === 'lg' ? 'h-80 w-[28rem]' : 'h-48 w-64';

  return (
    <svg
      viewBox="0 0 320 240"
      aria-hidden="true"
      className={cn(toneClass, sizeClass, className)}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Slow outer ring */}
      <g className={animated ? 'orbital-ring-slow' : undefined}>
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
      {/* Medium ring */}
      <g className={animated ? 'orbital-ring-medium' : undefined}>
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
      {/* Fast inner ring */}
      <g className={animated ? 'orbital-ring-fast' : undefined}>
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
      {/* Breathing nucleus (center orb) */}
      <g className={animated ? 'orbital-nucleus' : undefined}>
        <circle cx="160" cy="120" r="14" fill="currentColor" fillOpacity="0.07" />
        <circle cx="160" cy="120" r="3" fill="currentColor" />
      </g>
      {/* Optional sparse telemetry particles (subtle static dots for the "living constellation" variant) */}
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

// Re-export the primitives object for direct usage where needed
export { orbital as primitives };

// === Thin components for the new Orbit surfaces ===

// Floating contextual menu container (pairs with orbital.menu)
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
    <div
      className={cn(orbital.menu, 'orbital-menu', className)}
      {...props}
    >
      {children}
    </div>
  );
}

// Ultra-light action pill / icon cluster (pairs with orbital.actionPill)
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
    <div
      className={cn(orbital.actionPill, 'orbital-action-pill', className)}
      {...props}
    >
      {children}
    </div>
  );
}
