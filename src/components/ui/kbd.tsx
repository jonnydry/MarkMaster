import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded-sm border border-hairline-strong bg-background/60 px-1.5 py-0.5 text-center text-xs font-semibold text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
