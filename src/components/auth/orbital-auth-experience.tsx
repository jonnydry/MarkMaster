"use client";

import { signIn } from "next-auth/react";
import { GrokMark } from "@/components/brands/grok-mark";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import { Button } from "@/components/ui/button";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import { TWITTER_PROVIDER_ID } from "@/lib/constants";

type FeatureRow = {
  step: string;
  title: string;
  description: string;
  emphasized: boolean;
  badge?: string;
};

const FEATURE_ROWS: readonly FeatureRow[] = [
  {
    step: "01",
    title: "Grok tags and sorts for you",
    description:
      "Grok‑4 proposes up to three tags and a collection home for each un‑sorted bookmark. You review every move before it lands.",
    emphasized: true,
    badge: "Grok",
  },
  {
    step: "02",
    title: "Search everything",
    description:
      "Find any bookmark by text, author, or your own notes — even when you only remember a fragment.",
    emphasized: false,
  },
  {
    step: "03",
    title: "Tag by topic",
    description:
      "Group related saves so the important ones stay easy to find instead of drifting down the feed.",
    emphasized: false,
  },
  {
    step: "04",
    title: "Curate collections",
    description:
      "Build sets of related posts you can revisit privately or share as a clean public page.",
    emphasized: false,
  },
] as const;

const CURRENT_YEAR = new Date().getFullYear();

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function OrbitRings({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 240"
      aria-hidden="true"
      className={className}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse
        cx="160"
        cy="120"
        rx="148"
        ry="48"
        transform="rotate(-22 160 120)"
        stroke="currentColor"
        strokeOpacity="0.22"
      />
      <ellipse
        cx="160"
        cy="120"
        rx="108"
        ry="32"
        transform="rotate(16 160 120)"
        stroke="currentColor"
        strokeOpacity="0.16"
      />
      <ellipse
        cx="160"
        cy="120"
        rx="64"
        ry="20"
        transform="rotate(-44 160 120)"
        stroke="currentColor"
        strokeOpacity="0.12"
      />
      <circle cx="160" cy="120" r="14" fill="currentColor" fillOpacity="0.07" />
      <circle cx="160" cy="120" r="3" fill="currentColor" />
    </svg>
  );
}

function handleSignIn() {
  void signIn(TWITTER_PROVIDER_ID, { callbackUrl: "/dashboard" });
}

export function OrbitalAuthExperience({
  errorMessage,
}: {
  errorMessage?: string | null;
}) {
  return (
    <div className="dark relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute left-[-140px] top-[140px] size-[520px] rounded-full blur-[18px]"
          style={{
            background:
              "radial-gradient(circle, rgba(73,123,255,0.22) 0%, rgba(73,123,255,0.10) 34%, rgba(18,19,21,0) 74%)",
          }}
        />
        <div
          className="absolute right-[-180px] top-[90px] size-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(247,249,252,0.08) 0%, rgba(18,19,21,0) 68%)",
          }}
        />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-end px-4 pt-5 sm:px-8 sm:pt-7 lg:px-12 lg:pt-8">
        <button
          type="button"
          onClick={handleSignIn}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          Sign in
          <ArrowRightIcon className="size-3.5 opacity-70" />
        </button>
      </header>

      <main className="relative z-[1] mx-auto flex w-full max-w-[1440px] flex-1 items-center px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <div className="grid w-full grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_480px]">
          <section className="flex min-w-0 items-center lg:pr-4 xl:pr-10">
            <div className="w-full max-w-[700px]">
              <div className="flex flex-col items-start gap-8 lg:gap-10">
                <div className="flex flex-col items-start gap-6">
                  <div className="animate-fade-in-up stagger-1 flex items-center gap-6">
                    <MarkMasterLogo
                      width={120}
                      height={120}
                      priority
                      className="-ml-2 h-20 w-20 drop-shadow-[0_12px_28px_rgba(74,123,255,0.35)] sm:h-28 sm:w-28 lg:h-[120px] lg:w-[120px]"
                    />
                    <span className="heading-font text-[3rem] font-bold tracking-[-0.03em] text-foreground sm:text-[4rem] lg:text-[4.5rem]">
                      MarkMaster
                    </span>
                  </div>
                  <div className="space-y-4">
                    <p
                      className="animate-fade-in-up stagger-2 inline-flex items-center gap-2 text-[11.5px] uppercase tracking-[0.2em] text-muted-foreground/90 sm:text-[12.5px]"
                    >
                      <span className="inline-flex size-1.5 rounded-full bg-primary/80 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]" />
                      Your saved posts, finally organized
                    </p>
                    <h1 className="animate-fade-in-up stagger-3 heading-font max-w-[700px] text-[3.5rem] font-semibold leading-[0.95] tracking-[-0.04em] text-foreground sm:text-[4.25rem] lg:text-[5rem] lg:leading-[5.25rem]">
                      A home for your X bookmarks.
                    </h1>
                    <p className="animate-fade-in-up stagger-4 max-w-[580px] text-[1.125rem] leading-[1.8] font-light text-muted-foreground sm:text-[1.25rem] lg:text-[1.375rem] lg:leading-[1.8]">
                      Grok auto-tags and sorts your saves so you can find them
                      fast — without leaving your bookmarks in a black box.
                    </p>
                  </div>
                </div>

                <div className="animate-fade-in-up stagger-5 flex max-w-[600px] items-start gap-4 rounded-[24px] border border-primary/20 bg-primary/[0.04] p-5 backdrop-blur-sm sm:p-6">
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-primary shadow-[0_0_16px_rgba(59,130,246,0.25)]">
                    <GrokMark className="size-4" title="Grok" />
                  </span>
                  <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground/90">
                      AI-assisted, not AI-replaced
                    </span>{" "}
                    — Grok suggests, you approve. Nothing gets sorted without your say.
                    <span className="mt-2 block text-[13px] text-muted-foreground/75">
                      Scans run with{" "}
                      <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11.5px] text-foreground/80">
                        store: false
                      </code>{" "}
                      — your bookmarks aren&apos;t retained for training.
                    </span>
                  </p>
                </div>

                {errorMessage && (
                  <div
                    role="alert"
                    className="animate-fade-in max-w-[600px] rounded-[24px] border border-destructive/30 bg-destructive/10 p-5 text-[14.5px] leading-relaxed text-destructive sm:p-6"
                  >
                    {errorMessage}
                  </div>
                )}

                <div className="animate-fade-in-up stagger-6 flex flex-col items-start gap-4">
                  <Button
                    size="lg"
                    onClick={handleSignIn}
                    className="group h-[60px] rounded-full border-0 bg-primary px-8 text-[1.05rem] font-semibold text-primary-foreground shadow-[0_16px_40px_rgba(74,123,255,0.35)] transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_20px_48px_rgba(74,123,255,0.45)]"
                  >
                    <XLogoMark
                      className="mr-2.5 size-[22px] text-primary-foreground"
                      title={undefined}
                    />
                    Sign in with X
                    <ArrowRightIcon className="ml-1.5 size-[18px] opacity-80 transition-transform group-hover:translate-x-1" />
                  </Button>

                  <p className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground/90">
                    <span className="size-1.5 shrink-0 rounded-full bg-emerald shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    Read-only bookmark access — no posting, no feed clutter.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside
            className="animate-fade-in-up stagger-3 relative isolate hidden overflow-hidden rounded-[34px] border border-foreground/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-[10px] lg:flex lg:flex-col"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
            }}
          >
            <OrbitRings
              className="pointer-events-none absolute -right-20 -top-6 h-[280px] w-[360px] text-primary/55"
            />
            <OrbitRings
              className="pointer-events-none absolute -bottom-24 -left-16 h-[240px] w-[320px] -scale-x-100 text-foreground/30"
            />

            <div className="relative z-10 border-b border-foreground/10 px-[32px] py-[30px]">
              <p className="text-[12.5px] uppercase tracking-[0.18em] text-muted-foreground/75">
                How it works
              </p>
              <h2 className="heading-font mt-[12px] max-w-[340px] text-[32px] leading-[1.1] font-semibold tracking-[-0.01em] text-foreground">
                Let Grok do the sorting.
              </h2>
              <p className="mt-3.5 max-w-[360px] text-[15px] leading-relaxed text-muted-foreground/85">
                Import your X bookmarks, review Grok&apos;s suggestions, and build
                a searchable library you control.
              </p>
            </div>

            <div className="relative z-10 px-[32px]">
              {FEATURE_ROWS.map((feature) => (
                <div
                  key={feature.step}
                  className="flex items-start gap-[20px] border-t border-foreground/10 py-[18px] first:border-t-0"
                >
                  <div
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14.5px] font-semibold ${
                      feature.emphasized
                        ? "bg-primary/20 text-primary/85 ring-1 ring-primary/30"
                        : "bg-foreground/5 text-muted-foreground"
                    }`}
                  >
                    {feature.step}
                    {feature.emphasized ? (
                      <span
                        aria-hidden
                        className="absolute -right-1.5 -top-1.5 inline-flex size-[18px] items-center justify-center rounded-full border border-background bg-primary text-primary-foreground"
                      >
                        <GrokMark className="size-2.5" title={undefined} />
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 space-y-1.5 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="heading-font text-[17.5px] leading-[22px] font-semibold tracking-[-0.005em] text-foreground">
                        {feature.title}
                      </h3>
                      {feature.badge ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-primary/85">
                          <GrokMark className="size-3" title={undefined} />
                          {feature.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="max-w-[320px] text-[14.5px] leading-relaxed text-muted-foreground/80">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-[1440px] px-4 pb-5 sm:px-8 sm:pb-6 lg:px-12 lg:pb-8">
        <div className="flex flex-col gap-2 border-t border-foreground/[0.06] pt-5 text-[12.5px] text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {CURRENT_YEAR} MarkMaster · Built for people who save too much.
          </p>
          <p className="font-mono text-[11.5px] uppercase tracking-[0.2em] text-muted-foreground/50">
            MarkMaster
          </p>
        </div>
      </footer>
    </div>
  );
}
