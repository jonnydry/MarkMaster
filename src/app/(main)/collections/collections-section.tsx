import type { ReactNode } from "react";

type CollectionsSectionProps = {
  title: string;
  count: number;
  children: ReactNode;
};

export function CollectionsSection({
  title,
  count,
  children,
}: CollectionsSectionProps) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="grid gap-2 xl:grid-cols-2">{children}</div>
    </section>
  );
}
