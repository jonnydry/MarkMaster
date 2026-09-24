import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ErrorStateLayout = "page" | "panel" | "inline" | "stage";

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  layout?: ErrorStateLayout;
  className?: string;
}

const layoutShell: Record<ErrorStateLayout, string> = {
  page: "mx-auto flex min-h-[16rem] w-full max-w-md flex-col items-center justify-center text-center",
  panel:
    "mx-auto w-full max-w-md surface-card p-5 text-center",
  inline:
    "flex w-full flex-wrap items-center justify-between gap-2 rounded-sm border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive",
  stage: "mx-auto max-w-md space-y-3 text-center",
};

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again or contact support if the problem persists.",
  action,
  layout = "page",
  className,
}: ErrorStateProps) {
  const isStage = layout === "stage";
  const showIcon = layout === "page";

  const titleClass = cn(
    layout === "panel"
      ? "text-base font-semibold text-foreground"
      : layout === "inline"
        ? "font-medium"
        : "text-lg font-semibold",
    isStage && "text-lg font-semibold tracking-tight text-foreground",
    !isStage && layout !== "inline" && layout !== "panel" && "heading-font text-foreground"
  );

  const descriptionClass = cn(
    layout === "panel" ? "mt-1 text-xs" : "mt-1.5 max-w-xs text-sm leading-6",
    "text-muted-foreground"
  );

  return (
    <div className={cn(layoutShell[layout], className)} role="alert">
      {showIcon ? (
        <div className="mb-3 flex items-center justify-center text-destructive">
          <AlertTriangle className="size-7" strokeWidth={1.5} aria-hidden="true" />
        </div>
      ) : null}

      {layout === "inline" ? (
        <>
          <span className={titleClass}>{title}</span>
          {action}
        </>
      ) : (
        <>
          <h2 className={titleClass}>{title}</h2>
          {description ? <p className={descriptionClass}>{description}</p> : null}
          {action ? (
            <div className={layout === "panel" ? "mt-3" : "mt-4"}>{action}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
