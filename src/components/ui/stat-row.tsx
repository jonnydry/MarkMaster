import { cn } from "@/lib/utils";

export type StatRowSize = "sm" | "base" | "lg";

interface StatRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  size?: StatRowSize;
  /** Apply the heading font to the value. Defaults to true. */
  headingFont?: boolean;
  /** Apply tabular-nums to the value. Defaults to true. */
  tabularNums?: boolean;
  /** Wrapper className (e.g. a tone tint that cascades to label/value). */
  className?: string;
  /** Extra classes on the value <dd> (e.g. text color, break-words). */
  valueClassName?: string;
}

const sizeClass: Record<StatRowSize, string> = {
  sm: "text-sm font-semibold",
  base: "text-base font-semibold",
  lg: "text-lg font-semibold",
};

/**
 * Canonical label-over-value stat row. Renders a <div> for use inside a <dl>.
 * Consolidates the HeroStat / SignalRow / OrbitStatusRow / SettingsHero
 * stat patterns onto one typography contract.
 */
export function StatRow({
  label,
  value,
  hint,
  size = "lg",
  headingFont = true,
  tabularNums = true,
  className,
  valueClassName,
}: StatRowProps) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5",
          sizeClass[size],
          headingFont && "heading-font",
          tabularNums && "tabular-nums",
          valueClassName
        )}
      >
        {value}
      </dd>
      {hint ? (
        <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>
      ) : null}
    </div>
  );
}
