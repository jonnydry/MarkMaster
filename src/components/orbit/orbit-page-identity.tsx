import { cn } from "@/lib/utils";

type OrbitPageIdentityBaseProps = {
  title: string;
  subtitle?: string;
  ariaLabel: string;
  className?: string;
};

/** Shared text-only module label — the page watermark carries the Orbit mark. */
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
      <p className="heading-font truncate text-sm font-bold tracking-tight text-foreground">
        {title}
      </p>
      {subtitle ? (
        <p className="hidden truncate text-2xs font-medium tabular-nums text-muted-foreground sm:block">
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

/** Orbit triage queue identity. */
export function OrbitPageIdentity({
  queueTotal,
  className,
}: OrbitPageIdentityProps) {
  const queueLabel =
    queueTotal === undefined
      ? null
      : queueTotal > 0
        ? `${queueTotal.toLocaleString()} waiting`
        : "Queue clear";

  return (
    <OrbitPageIdentityBase
      title="Orbit"
      subtitle={queueLabel ?? undefined}
      ariaLabel={
        queueLabel ? `Orbit triage queue, ${queueLabel}` : "Orbit triage queue"
      }
      className={className}
    />
  );
}
