import { cn } from "@/lib/utils";

type OrbitPageIdentityBaseProps = {
  title: string;
  subtitle?: string;
  ariaLabel: string;
  className?: string;
};

/** Shared module title — Orbit's identity lives here, not in background art. */
export function OrbitPageIdentityBase({
  title,
  subtitle,
  ariaLabel,
  className,
}: OrbitPageIdentityBaseProps) {
  return (
    <div
      className={cn("min-w-0 shrink-0", className)}
      aria-label={ariaLabel}
    >
      <p className="heading-font truncate text-lg leading-6 font-bold tracking-tight text-foreground">
        {title}
      </p>
      {subtitle ? (
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

type OrbitPageIdentityProps = {
  /** Loose bookmarks still in the Orbit queue. */
  queueTotal?: number;
  className?: string;
};

/** Orbit triage queue identity — the hybrid tagging instrument. */
export function OrbitPageIdentity({
  queueTotal,
  className,
}: OrbitPageIdentityProps) {
  const queueLabel =
    queueTotal === undefined
      ? null
      : queueTotal > 0
        ? `${queueTotal.toLocaleString()} in queue`
        : "Queue clear";
  const subtitle = queueLabel
    ? `Hybrid tagging · ${queueLabel}`
    : "Hybrid tagging";

  return (
    <OrbitPageIdentityBase
      title="Orbit"
      subtitle={subtitle}
      ariaLabel={
        queueLabel
          ? `Orbit hybrid tagging, ${queueLabel}`
          : "Orbit hybrid tagging"
      }
      className={className}
    />
  );
}

type OrbitMapIdentityProps = {
  className?: string;
};

/** Compact identity for map console chrome over the Pixi stage. */
export function OrbitMapIdentity({ className }: OrbitMapIdentityProps) {
  return (
    <div
      className={cn("min-w-0 shrink-0", className)}
      aria-label="Orbit living graph"
    >
      <p className="heading-font truncate text-sm leading-4 font-bold tracking-tight text-foreground">
        Orbit
      </p>
      <p className="truncate text-2xs text-muted-foreground">
        Living graph
      </p>
    </div>
  );
}
