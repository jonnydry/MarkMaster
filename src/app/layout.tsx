import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { ThemeInitScript } from "@/components/theme-init-script";
import { Toaster } from "@/components/ui/sonner";
import { defaultFontVariables } from "@/lib/app-fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MarkMaster — X Bookmark Manager",
    template: "%s | MarkMaster",
  },
  description:
    "Search, tag, annotate, and curate your X bookmarks with a local synced archive.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${defaultFontVariables} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full min-w-0 flex-col overflow-x-hidden">
        <ThemeInitScript />
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
