import { cva, type VariantProps } from "class-variance-authority";

import {
  highlightActiveClass,
  highlightInteractiveClass,
} from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        highlight: cn(
          highlightActiveClass,
          highlightInteractiveClass,
          "border font-semibold [a]:hover:opacity-100"
        ),
        outline:
          "border-hairline-strong bg-transparent hover:border-primary/35 hover:bg-accent-soft hover:text-foreground aria-expanded:border-primary/25 aria-expanded:bg-primary/10 aria-expanded:text-foreground",
        secondary:
          "border-hairline-soft bg-transparent text-secondary-foreground hover:border-primary/25 hover:bg-accent-soft aria-expanded:bg-accent-soft aria-expanded:text-accent-foreground",
        ghost:
          "hover:bg-accent-soft hover:text-foreground aria-expanded:bg-accent-soft aria-expanded:text-foreground",
        ink: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs in-data-[slot=button-group]:rounded-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-sm px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // Icon variants keep their visual size but extend the hit area to
        // ~44px with an absolute after: inset (same recipe as Checkbox/Switch).
        icon: "relative size-8 after:absolute after:-inset-1.5",
        "icon-xs":
          "relative size-6 rounded-sm after:absolute after:-inset-2.5 in-data-[slot=button-group]:rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "relative size-7 rounded-sm after:absolute after:-inset-2 in-data-[slot=button-group]:rounded-sm",
        "icon-lg": "size-9",
        "icon-xl": "relative size-10 after:absolute after:-inset-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export function buttonVariantClassName(
  variant?: ButtonVariantProps["variant"],
  size?: ButtonVariantProps["size"],
  className?: string
) {
  return cn(buttonVariants({ variant, size }), className);
}
