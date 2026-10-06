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
        "relative size-6 rounded-full border transition-transform motion-reduce:transition-none after:absolute after:-inset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        selected
          ? "scale-105 border-foreground ring-2 ring-ring/45"
          : "border-hairline-soft hover:scale-105"
      )}
      style={{ backgroundColor: color }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    />
  );
});

interface TagEditRowProps {
  tag: TagWithCount;
  index: number;
  initialName: string;
  initialColor: string;
  onSave: (tagId: string, name: string, color: string) => void | Promise<void>;
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
  const saveInFlight = useRef(false);
  const escapeCancels = useRef(false);
  const colorOptions = useMemo(
    () => (PRESET_COLORS.includes(color) ? PRESET_COLORS : [color, ...PRESET_COLORS]),
    [color]
  );

  const commitSave = useCallback(() => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    let pending: void | Promise<void>;
    try {
      pending = onSave(tag.id, name.trim(), color);
    } catch (error) {
      saveInFlight.current = false;
      throw error;
    }
    void Promise.resolve(pending).finally(() => {
      saveInFlight.current = false;
    });
  }, [color, name, onSave, tag.id]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (escapeCancels.current) {
        escapeCancels.current = false;
        return;
      }
      const nextFocus = e.relatedTarget as Node | null;
      if (nextFocus && rowRef.current?.contains(nextFocus)) {
        return;
      }
      const trimmed = name.trim();
      if (trimmed === "" || (trimmed === initialName.trim() && color === initialColor)) {
        onCancel();
        return;
      }
      commitSave();
    },
    [color, commitSave, initialColor, initialName, name, onCancel]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        escapeCancels.current = true;
        setName(initialName);
        setColor(initialColor);
        onCancel();
      }
    },
    [initialColor, initialName, onCancel]
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
        onKeyDown={(e) => {
          if (e.key === "Enter") commitSave();
        }}
      />
      <div className="flex shrink-0 gap-2">
        <Button size="sm" onMouseDown={(event) => event.preventDefault()} onClick={commitSave}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
});
