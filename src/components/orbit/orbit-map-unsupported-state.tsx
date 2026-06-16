import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { orbitHairlineBorder, orbitMetaMuted } from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

export function OrbitMapUnsupportedState() {

  return (
    <div
      className={cn(
        "flex h-full min-h-[320px] w-full items-center justify-center rounded-sm border p-6",
        orbitHairlineBorder(),
        "bg-background"
      )}
    >
      <div className="max-w-sm text-center">
        <span className="mx-auto inline-flex size-10 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <AlertTriangle className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          Graph requires a modern browser
        </h2>
        <p className={cn("mt-2 text-sm leading-6", orbitMetaMuted())}>
          Orbit Graph uses a worker-powered canvas for smooth navigation. Update
          your browser or return to the Orbit queue.
        </p>
        <Link
          href="/orbit"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-4")}
        >
          Open Orbit queue
        </Link>
      </div>
    </div>
  );
}
