"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkMasterLogo } from "@/components/markmaster-logo";

const FEATURES = [
  {
    title: "Search",
    outcome: "Find fast",
    desc: "Full-text search across posts, authors, and your notes.",
  },
  {
    title: "Tags",
    outcome: "Stay sorted",
    desc: "Color-coded labels. Filter your archive in one click.",
  },
  {
    title: "Collections",
    outcome: "Curate",
    desc: "Ordered, shareable lists. Keep topics organized over time.",
  },
  {
    title: "Notes",
    outcome: "Remember why",
    desc: "Annotations stay attached to every save, forever.",
  },
  {
    title: "Analytics",
    outcome: "See patterns",
    desc: "Who you save, when, and what type. Real reading habits.",
  },
  {
    title: "Sync",
    outcome: "Keep history",
    desc: "Bookmarks stay permanently. One-way read sync from X.",
  },
] as const;

const FEATURE_ICONS: Record<string, string> = {
  Search: "🔍",
  Tags: "🏷️",
  Collections: "📁",
  Notes: "📝",
  Analytics: "📊",
  Sync: "🔄",
};

export function LandingExperience() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-8 sm:px-12">
          <div className="flex items-center gap-3">
            <MarkMasterLogo width={36} height={36} className="shrink-0" priority />
            <span className="text-[17px] font-bold tracking-[-0.02em] heading-font">
              MarkMaster
            </span>
          </div>
          <Link href="/login">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg px-4 text-sm font-medium"
            >
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-emerald/[0.03] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/[0.04] rounded-full blur-[120px] pointer-events-none" />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-8 py-16 sm:grid-cols-2 sm:px-12 sm:py-24">
          <div className="flex flex-col justify-center gap-6 animate-fade-in">
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary animate-fade-in stagger-1">
                Your bookmark archive
              </p>
              <h1 className="text-3xl sm:text-[2.75rem] font-extrabold leading-tight sm:leading-[1.06] tracking-tight sm:tracking-[-0.03em] heading-font animate-fade-in stagger-2">
                Every save,
                <br />
                <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent sm:bg-gradient-to-r sm:from-foreground sm:to-muted-foreground">
                  impossible to lose.
                </span>
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground animate-fade-in stagger-3">
                MarkMaster keeps every post you save on X in a searchable,
                taggable archive. Your reading history, organized. Forever.
              </p>
            </div>

            <div className="flex flex-col gap-3 animate-fade-in stagger-4">
              <Link href="/login">
                <Button
                  size="lg"
                  className="h-11 gap-2 rounded-lg px-6 text-sm font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 transition-shadow"
                >
                  Connect with X
                  <ArrowRight className="size-4" strokeWidth={2.5} />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground/60">
                Read-only access &middot; Your data stays yours
              </p>
            </div>
          </div>

          <div className="animate-fade-in-up stagger-3 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/[0.04] dark:shadow-black/20">
            <div className="flex items-center gap-3 border-b border-border px-5 py-3 bg-secondary/80">
              <MarkMasterLogo width={32} height={32} className="shrink-0" priority />
              <span className="text-sm font-semibold text-foreground">
                MarkMaster
              </span>
              <div className="ml-auto flex gap-2">
                <div className="h-7 w-20 rounded-lg bg-muted-foreground/10" />
                <div className="h-7 w-20 rounded-lg bg-primary" />
              </div>
            </div>

            <div>
              <div className="flex gap-4 border-b border-border px-5 py-4">
                <div className="size-10 shrink-0 rounded-full bg-muted-foreground/10" />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      Lenny Rachitsky
                    </span>
                    <div className="flex size-4 items-center justify-center rounded-full bg-primary text-[6px] font-bold text-primary-foreground">
                      ✓
                    </div>
                    <span className="text-xs text-muted-foreground">
                      @lennysan
                    </span>
                    <span className="text-xs text-muted-foreground/50">·</span>
                    <span className="text-xs text-muted-foreground">3 days</span>
                  </div>
                  <p className="mb-2 text-sm leading-snug text-muted-foreground">
                    The best product writing does two jobs at once: it teaches the
                    feature and tells the user how to feel about progress.
                  </p>
                  <div className="mb-2 flex gap-1.5">
                    {["copywriting", "product"].map((t) => (
                      <span
                        key={t}
                        className="rounded-md px-2 py-0.5 text-xs bg-primary/10 text-primary font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground/50">
                    <span>↩ 122</span>
                    <span>↻ 41</span>
                    <span>♡ 1.8K</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 border-b border-border px-5 py-4">
                <div className="size-10 shrink-0 rounded-full bg-muted-foreground/10" />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      Packy McCormick
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @packyM
                    </span>
                    <span className="text-xs text-muted-foreground/50">·</span>
                    <span className="text-xs text-muted-foreground">1 week</span>
                  </div>
                  <div className="mb-2 flex gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 text-sm leading-snug text-muted-foreground">
                        A good market map is less about categorizing competitors and
                        more about exposing whitespace where new behavior is forming.
                      </p>
                      <div className="rounded-md border-l-2 border-l-note px-3 py-2 bg-secondary/60">
                        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                          Note
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Great framing for positioning section of launch doc.
                        </p>
                      </div>
                    </div>
                    <div className="h-16 w-28 shrink-0 rounded-xl bg-muted-foreground/10" />
                  </div>
                  <div className="flex gap-1.5">
                    {["strategy", "positioning"].map((t) => (
                      <span
                        key={t}
                        className="rounded-md px-2 py-0.5 text-xs bg-primary/10 text-primary font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-5 py-3">
                <div className="size-8 shrink-0 rounded-full bg-muted-foreground/10" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">
                      Dan Martens
                    </span>
                    <span className="text-xs text-muted-foreground">@danmartens</span>
                    <span className="text-xs text-muted-foreground/50">·</span>
                    <span className="text-xs text-muted-foreground">2 weeks</span>
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">
                    The main job of a landing page headline is to make people feel
                    like they&apos;ve found what they were looking for.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
          <div className="mb-12 flex items-end justify-between gap-8">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                What you get
              </p>
              <h2 className="text-2xl sm:text-[1.75rem] font-extrabold tracking-[-0.02em] heading-font">
                Everything a serious saver needs.
              </h2>
            </div>
            <p className="hidden max-w-xs text-right text-sm leading-relaxed text-muted-foreground/60 sm:block">
              Built around the actual workflow of people who read and save on X. Not
              a social clone.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ title, outcome, desc }, i) => (
              <div
                key={title}
                className={`group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200 animate-fade-in stagger-${i + 1}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{FEATURE_ICONS[title]}</span>
                    <h3 className="text-base font-bold heading-font">
                      {title}
                    </h3>
                  </div>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                    {outcome}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="px-8 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MarkMasterLogo width={28} height={28} className="shrink-0" />
            <span className="text-sm font-semibold text-muted-foreground heading-font">
              MarkMaster
            </span>
          </div>
          <p className="text-xs text-muted-foreground/50">
            Not affiliated with X Corp. &middot; OAuth read-only access.
          </p>
        </div>
      </footer>
    </div>
  );
}