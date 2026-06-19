import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type CollectionsSectionProps = {
  icon: LucideIcon;
  title: string;
  count: number;
  children: ReactNode;
};

export function CollectionsSection({
  icon: Icon,
  title,
  count,
  children,
}: CollectionsSectionProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {title}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground/60">
          {count}
        </span>
      </div>
      <div className="grid gap-2 xl:grid-cols-2">{children}</div>
    </section>
  );
}
