import { Button } from "@/components/ui/button";

interface DashboardErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export function DashboardErrorState({ message, onRetry }: DashboardErrorStateProps) {
  return (
    <div className="flex items-center justify-center h-64 px-6">
      <div className="text-center space-y-3 max-w-md">
        <p className="text-lg font-medium">Bookmarks could not be loaded</p>
        <p className="text-sm text-muted-foreground">
          {message ?? "Please try again."}
        </p>
        <Button onClick={onRetry} size="sm">
          Retry
        </Button>
      </div>
    </div>
  );
}
