import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again or contact support if the problem persists.",
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-[16rem] w-full max-w-md flex-col items-center justify-center text-center",
        className
      )}
      role="alert"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
