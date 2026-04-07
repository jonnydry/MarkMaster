"use client";

import Link from "next/link";
import { Bookmark, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    title: "Search",
    outcome: "Find fast",
    desc: "Full-text search across posts, authors, and the notes you attach.",
  },
  {
    title: "Tags",
    outcome: "Stay sorted",
    desc: "Categories and tags so saves stay legible as the pile grows.",
  },
  {
    title: "Collections",
    outcome: "Curate",
    desc: "Ordered lists of saves you can keep tidy and revisit later.",
  },
  {
    title: "Share",
    outcome: "Publish",
    desc: "Public links for a set when you want to share it outside your account.",
  },
  {
    title: "Analytics",
    outcome: "See patterns",
    desc: "Who you save and when—useful signal, not dashboard theater.",
  },
  {
    title: "Synced archive",
    outcome: "Keep history",
    desc: "Bookmarks you already synced stay queryable in MarkMaster as your X feed moves on.",
  },
] as const;

/** X dark-mode–style marketing tokens (aligned with X / Grok surfaces) */
const x = {
  bg: "#000000",
  border: "#2f3336",
  text: "#e7e9ea",
  textSecondary: "#71767b",
  textDim: "#536471",
  blue: "#1d9bf0",
  buttonBg: "#e7e9ea",
  buttonFg: "#0f1419",
} as const;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

export function LandingExperience() {
  const [headerActive, setHeaderActive] = useState(false);

  useEffect(() => {
    const onScroll = () => setHeaderActive(window.scrollY > 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="min-h-screen font-sans selection:bg-[#1d9bf0]/30"
      style={{ backgroundColor: x.bg, color: x.text }}
    >
      <header
        className={cn(
          "sticky top-0 z-50 border-b transition-[border-color,background-color] duration-200 ease-out",
          headerActive ? "border-[#3f4444]" : "border-[#2f3336]",
        )}
        style={{ backgroundColor: x.bg }}
      >
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:h-[52px] sm:px-6">
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 items-center justify-center rounded-full sm:size-9"
              style={{ backgroundColor: x.blue }}
            >
              <Bookmark
                className="size-4 sm:size-[18px]"
                strokeWidth={2}
                style={{ color: "#ffffff" }}
              />
            </div>
            <span
              className="text-lg font-bold tracking-[-0.03em] sm:text-[19px]"
              style={{ color: x.text }}
            >
              MarkMaster
            </span>
          </div>
          <Link
            href="/login"
            className={cn("rounded-full", focusRing)}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full border px-3.5 text-[13px] font-bold bg-transparent hover:bg-white/[0.06] sm:h-[34px] sm:px-4 sm:text-sm"
              style={{
                borderColor: x.textDim,
                color: x.text,
              }}
            >
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main>
        <section
          className="border-b border-[#2f3336] px-4 pb-16 pt-14 sm:px-6 md:pb-20 md:pt-16"
          style={{ borderColor: x.border }}
        >
          <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
            <p
              className="text-[13px] font-medium uppercase tracking-[0.14em] sm:text-[14px]"
              style={{ color: x.blue }}
            >
              Bookmark tooling for X
            </p>
            <h1
              className="mt-4 text-[1.75rem] font-bold leading-[1.14] tracking-[-0.035em] text-balance sm:text-[2.125rem] sm:leading-[1.12] md:text-[2.25rem]"
              style={{ color: x.text }}
            >
              Search every bookmark you saved on X.
            </h1>
            <p
              className="mt-4 text-[15px] font-normal leading-relaxed sm:text-base"
              style={{ color: x.textSecondary }}
            >
              Read-only sync from your account—then tags, collections, and
              full-text recall. Your data stays in your workspace.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:mt-9">
              <Link href="/login" className={cn("rounded-full", focusRing)}>
                <Button
                  className="h-10 gap-2 rounded-full px-6 text-[14px] font-bold transition-opacity hover:opacity-90 sm:h-11 sm:px-7 sm:text-[15px]"
                  style={{
                    backgroundColor: x.buttonBg,
                    color: x.buttonFg,
                  }}
                >
                  Continue with X
                  <ArrowRight className="size-3.5 sm:size-4" strokeWidth={2.5} />
                </Button>
              </Link>
              <a
                href="#capabilities"
                className={cn(
                  "text-[13px] font-semibold transition-colors hover:text-[#e7e9ea]",
                  focusRing,
                  "rounded-sm px-1 py-0.5",
                )}
                style={{ color: x.textDim }}
              >
                How it works →
              </a>
            </div>
          </div>
        </section>

        <section
          id="capabilities"
          className="scroll-mt-[52px] border-t border-[#2f3336] px-4 py-14 sm:px-6 md:py-16"
        >
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col gap-5 pb-8 md:flex-row md:items-end md:justify-between md:gap-8 md:pb-10">
              <div className="max-w-xl">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: x.textSecondary }}
                >
                  Capabilities
                </p>
                <h2
                  className="mt-2 text-lg font-bold leading-tight tracking-[-0.02em] sm:text-[19px]"
                  style={{ color: x.text }}
                >
                  One surface. Six jobs your saves actually need.
                </h2>
              </div>
              <p
                className="max-w-[240px] text-[13px] leading-snug md:text-right"
                style={{ color: x.textDim }}
              >
                Tight scope—no fluff between you and what you saved.
              </p>
            </div>

            <ul className="divide-y divide-[#2f3336] border-t border-[#2f3336]">
              {FEATURES.map(({ title, outcome, desc }, i) => (
                <li
                  key={title}
                  className="flex flex-col gap-1 py-4 md:grid md:grid-cols-[1.75rem_7rem_5.75rem_1fr] md:items-baseline md:gap-x-5 md:gap-y-0 md:py-[14px]"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 md:contents">
                    <span
                      className="w-7 shrink-0 text-[11px] font-semibold tabular-nums md:w-auto md:pt-0.5"
                      style={{ color: x.textDim }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3
                      className="min-w-0 text-[15px] font-bold"
                      style={{ color: x.text }}
                    >
                      {title}
                    </h3>
                    <p
                      className="text-[11px] font-semibold uppercase tracking-[0.1em] md:min-w-[5.5rem]"
                      style={{ color: x.blue }}
                    >
                      {outcome}
                    </p>
                  </div>
                  <p
                    className="pl-10 text-[14px] font-normal leading-snug md:col-start-4 md:row-start-1 md:pl-0 md:leading-relaxed"
                    style={{ color: x.textSecondary }}
                  >
                    {desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-[#2f3336] px-4 py-14 sm:px-6 md:py-16">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <h2
              className="text-lg font-bold leading-tight tracking-[-0.02em] sm:text-[19px]"
              style={{ color: x.text }}
            >
              Authorize once. Use your saves on purpose.
            </h2>
            <Link href="/login" className={cn("mt-5 rounded-full", focusRing)}>
              <Button
                className="h-10 rounded-full px-6 text-[14px] font-bold transition-opacity hover:opacity-90 sm:h-11 sm:px-7 sm:text-[15px]"
                style={{
                  backgroundColor: x.buttonBg,
                  color: x.buttonFg,
                }}
              >
                Sign in with X
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#2f3336] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 text-[13px] leading-snug sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex flex-col gap-1" style={{ color: x.textSecondary }}>
            <span className="font-semibold text-[#e7e9ea]">MarkMaster</span>
            <span style={{ color: x.textDim }}>Bookmarks for X · not affiliated with X Corp.</span>
          </div>
          <p className="max-w-sm" style={{ color: x.textDim }}>
            OAuth read access to bookmarks and profile only. Hosting and
            retention follow your deployment.
          </p>
        </div>
      </footer>
    </div>
  );
}
