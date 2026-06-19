"use client"

import { useEffect, useState, type CSSProperties } from "react"
import dynamic from "next/dynamic"
import { useTheme } from "@/components/providers"
import { mountListeners } from "@/lib/toast"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import type { ToasterProps } from "sonner"

const Sonner = dynamic(
  () => import("sonner").then((mod) => mod.Toaster),
  { ssr: false }
)

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const onToastRequested = () => setMounted(true)
    mountListeners.add(onToastRequested)
    return () => {
      mountListeners.delete(onToastRequested)
    }
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "rounded-sm border border-hairline-strong bg-popover text-popover-foreground shadow-none",
          actionButton:
            "rounded-sm bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton:
            "rounded-sm border border-hairline-soft bg-transparent text-muted-foreground hover:bg-accent-soft",
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
          "--normal-border": "var(--hairline-strong)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
