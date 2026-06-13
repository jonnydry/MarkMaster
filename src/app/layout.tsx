import type { Metadata } from "next";
import Script from "next/script";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { defaultFontVariables } from "@/lib/app-fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarkMaster — X Bookmark Manager",
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
        <Script
          id="markmaster-theme-init"
          src="/theme-init"
          strategy="beforeInteractive"
        />
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
