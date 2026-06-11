import { cn } from "@/lib/utils";

type OrbitPageIdentityProps = {
  /** Loose bookmarks still in the Orbit queue. */
  queueTotal?: number;
  className?: string;
};

/** Text-only module label — the large page watermark carries the Orbit mark. */
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
    <div
      className={cn("min-w-0 shrink-0", className)}
      aria-label={
        queueLabel ? `Orbit triage queue, ${queueLabel}` : "Orbit triage queue"
      }
    >
      <p className="heading-font truncate text-sm font-bold tracking-tight text-foreground">
        Orbit
      </p>
      {queueLabel ? (
        <p className="hidden truncate text-2xs font-medium tabular-nums text-muted-foreground sm:block">
          {queueLabel}
        </p>
      ) : null}
    </div>
  );
}
