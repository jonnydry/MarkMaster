import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";

type NoCollectionMatchesProps = {
  onClear: () => void;
};

export function NoCollectionMatches({ onClear }: NoCollectionMatchesProps) {
  return (
    <div className="px-6 py-12 text-center">
      <Search className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 text-sm font-semibold text-foreground">
        No matching collections
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Try a different search or filter.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={onClear}
      >
        Clear filters
      </Button>
    </div>
  );
}
