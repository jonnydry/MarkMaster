import React, { useRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESET_COLORS } from "@/lib/constants";
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
      aria-label={`Select color ${color}`}
      aria-pressed={selected}
      className={`h-6 w-6 rounded-full border transition-transform ${
        selected
          ? "scale-105 border-foreground ring-2 ring-foreground/30 ring-offset-2 ring-offset-surface-2"
          : "border-black/10"
      }`}
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
      className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
        index > 0 ? "border-t border-hairline-soft" : ""
      }`}
    >
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
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
        className="h-8 min-w-[12rem] flex-1 border-hairline-soft bg-surface-1"
        onKeyDown={(e) => e.key === "Enter" && onSave(tag.id, name.trim(), color)}
      />
      <Button
        size="sm"
        className="shadow-sm"
        onClick={() => onSave(tag.id, name.trim(), color)}
      >
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
});
