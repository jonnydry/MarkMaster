import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";

export function OrbitHeaderLogoAccent() {
  return (
    <div
      className="pointer-events-none absolute right-16 top-3 z-0 hidden w-[240px] sm:block"
      aria-hidden
    >
      <div className="relative h-[4.75rem] w-full overflow-hidden">
        <div className="absolute right-3 top-1/2 size-28 -translate-y-1/2 rounded-full bg-primary/15 blur-2xl" />
        <OrbitLogoMark className="absolute right-0 top-1/2 size-28 -translate-y-1/2 opacity-[0.12]" />
        <OrbitLogoMark className="absolute right-12 top-1/2 size-16 -translate-y-1/2 opacity-80 drop-shadow-[0_0_22px_color-mix(in_srgb,var(--primary)_42%,transparent)]" />
      </div>
    </div>
  );
}
