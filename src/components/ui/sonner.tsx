"use client"

import type { CSSProperties } from "react"
import { useTheme, useOrbitalTheme } from "@/components/providers"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { orbital } from "@/components/orbital"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  const { isOrbital } = useOrbitalTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={cn(
        "toaster group",
        isOrbital && "[&_[data-title]]:font-mono [&_[data-title]]:text-xs [&_[data-title]]:uppercase [&_[data-title]]:tracking-[0.12em] [&_[data-description]]:font-mono [&_[data-description]]:text-[11px] [&_[data-description]]:normal-case [&_[data-description]]:tracking-normal"
      )}
      toastOptions={{
        classNames: {
          toast: cn(isOrbital && orbital.glass),
          title: cn(isOrbital && orbital.label, "normal-case"),
          description: cn(isOrbital && "text-muted-foreground"),
        },
      }}
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
