import { cn } from "@/lib/utils";

type OrbitMapPageIdentityProps = {
  className?: string;
};

/** Text-only module label — the page watermark carries the Orbit mark. */
export function OrbitMapPageIdentity({ className }: OrbitMapPageIdentityProps) {
  return (
    <div
      className={cn("min-w-0 shrink-0", className)}
      aria-label="Orbit graph"
    >
      <p className="heading-font truncate text-sm font-bold tracking-tight text-foreground">
        Graph
      </p>
      <p className="hidden truncate text-2xs font-medium text-muted-foreground sm:block">
        Tag &amp; collection map
      </p>
    </div>
  );
}
