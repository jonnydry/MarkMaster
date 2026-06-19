import { cn } from "@/lib/utils";
import { OrbitPageIdentityBase } from "@/components/orbit/orbit-page-identity";

type OrbitMapPageIdentityProps = {
  className?: string;
};

/** Text-only module label — the page watermark carries the Orbit mark. */
export function OrbitMapPageIdentity({ className }: OrbitMapPageIdentityProps) {
  return (
    <OrbitPageIdentityBase
      title="Graph"
      subtitle="Tag & collection map"
      ariaLabel="Orbit graph"
      className={cn(className)}
    />
  );
}
