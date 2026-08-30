import React, { useRef, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESET_COLORS, getColorName } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TagWithCount } from "@/types";

interface ColorSwatchProps {
  color: string;
  selected: boolean;
  onClick: () => void;
}

const ColorSwatch = React.memo(function ColorSwatch({
  color,
  selected,
  onClick,
}: ColorSwatchProps) {
  return (
    <button
      type="button"
      aria-label={`Select color ${getColorName(color)}`}
      aria-pressed={selected}
      className={cn(
        "size-6 rounded-full border transition-transform motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        selected
          ? "scale-105 border-foreground ring-2 ring-ring/45"
          : "border-hairline-soft hover:scale-105"
      )}
      style={{ backgroundColor: color }}
      onClick={onClick}
    />
  );
});

interface TagEditRowProps {
  tag: TagWithCount;
  index: number;
  initialName: string;
  initialColor: string;
  onSave: (tagId: string, name: string, color: string) => void;
  onCancel: () => void;
}

export const TagEditRow = React.memo(function TagEditRow({
  tag,
  index,
  initialName,
  initialColor,
  onSave,
  onCancel,
}: TagEditRowProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const rowRef = useRef<HTMLDivElement>(null);
  const colorOptions = useMemo(
    () => (PRESET_COLORS.includes(color) ? PRESET_COLORS : [color, ...PRESET_COLORS]),
    [color]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const nextFocus = e.relatedTarget as Node | null;
      if (nextFocus && rowRef.current?.contains(nextFocus)) {
        return;
      }
      onCancel();
    },
    [onCancel]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel]
  );

  return (
    <div
      ref={rowRef}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn(
        "animate-slide-down-fade flex flex-col gap-3 bg-accent-soft/40 px-4 py-4 sm:flex-row sm:items-center",
        index > 0 && "border-t border-hairline-soft"
      )}
    >
      <div className="flex flex-wrap gap-1.5">
        {colorOptions.map((c) => (
          <ColorSwatch
            key={c}
            color={c}
            selected={color === c}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-9 min-w-0 flex-1 border-hairline-soft bg-surface-1 sm:min-w-[12rem]"
        onKeyDown={(e) => e.key === "Enter" && onSave(tag.id, name.trim(), color)}
      />
      <div className="flex shrink-0 gap-2">
        <Button size="sm" onClick={() => onSave(tag.id, name.trim(), color)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
});
