import type { Metadata } from "next";
import { Inter, JetBrains_Mono, DM_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/lib/auth";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MarkMaster — X Bookmark Manager",
  description:
    "Search, tag, annotate, and curate your X bookmarks with a local synced archive.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${dmSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('markmaster-theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark')}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers session={session}>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
