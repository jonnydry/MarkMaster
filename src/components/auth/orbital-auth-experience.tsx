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
  icon: "grok" | "search" | "tag" | "collection";
};

const FEATURE_ROWS: readonly FeatureRow[] = [
  {
    step: "01",
    title: "Grok tags and sorts for you",
    icon: "grok",
  },
  {
    step: "02",
    title: "Search everything",
    icon: "search",
  },
  {
    step: "03",
    title: "Tag by topic",
    icon: "tag",
  },
  {
    step: "04",
    title: "Curate collections",
    icon: "collection",
  },
] as const;

const CURRENT_YEAR = new Date().getFullYear();
const SPLASH_BACKGROUND_IMAGE_URL = "/rocket-launch-background.png";

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

function FeatureIcon({
  icon,
  className,
}: {
  icon: FeatureRow["icon"];
  className?: string;
}) {
  if (icon === "grok") {
    return <GrokMark className={className} title={undefined} />;
  }

  if (icon === "search") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m16.2 16.2 4 4" />
      </svg>
    );
  }

  if (icon === "tag") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.5 13.5 13.5 20.5a2.2 2.2 0 0 1-3.1 0L3 13.1V3h10.1l7.4 7.4a2.2 2.2 0 0 1 0 3.1Z" />
        <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" />
      <path d="M8 8h8M8 12h8" />
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
    <div className="dark relative isolate flex min-h-screen flex-col overflow-hidden bg-[#00040B] text-foreground selection:bg-primary/30">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: [
            "linear-gradient(90deg, rgba(0,4,11,0.82) 0%, rgba(0,4,11,0.62) 34%, rgba(0,4,11,0.16) 52%, rgba(0,4,11,0.62) 100%)",
            "linear-gradient(180deg, rgba(0,4,11,0.30) 0%, rgba(0,4,11,0.08) 40%, rgba(0,4,11,0.78) 100%)",
            `url(${SPLASH_BACKGROUND_IMAGE_URL})`,
          ].join(", "),
          backgroundPosition: "center bottom, center bottom, center bottom",
          backgroundRepeat: "no-repeat, no-repeat, no-repeat",
          backgroundSize: "cover, cover, cover",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_58%,rgba(10,132,255,0.20)_0%,rgba(10,132,255,0.08)_21%,rgba(0,4,11,0)_48%)]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-end px-5 pt-5 sm:px-8 sm:pt-7 lg:px-[72px] lg:pt-8">
        <button
          type="button"
          onClick={handleSignIn}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold text-white/90 shadow-[0_1px_20px_rgba(0,0,0,0.45)] transition-colors hover:bg-white/10 hover:text-white"
        >
          Sign in
          <ArrowRightIcon className="size-4 opacity-80" />
        </button>
      </header>

      <main className="relative z-[1] mx-auto flex w-full max-w-[1440px] flex-1 items-center px-5 pb-10 pt-8 sm:px-8 sm:pt-10 lg:px-[72px] lg:pb-12 lg:pt-10">
        <div className="grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,520px)_minmax(340px,400px)] lg:justify-between lg:gap-8">
          <section className="min-w-0">
            <div className="flex max-w-[540px] flex-col items-start">
              <div className="animate-fade-in-up stagger-1 flex items-center gap-5 sm:gap-6">
                <span className="grid size-[70px] shrink-0 place-items-center rounded-full border border-primary/45 bg-primary/10 shadow-[0_0_42px_rgba(10,132,255,0.42)] backdrop-blur-sm sm:size-[82px] lg:size-[88px]">
                  <MarkMasterLogo
                    width={82}
                    height={82}
                    priority
                    className="h-[54px] w-[54px] drop-shadow-[0_0_18px_rgba(10,132,255,0.72)] sm:h-[64px] sm:w-[64px] lg:h-[68px] lg:w-[68px]"
                  />
                </span>
                <span className="heading-font text-[2.45rem] font-extrabold leading-none tracking-[-0.05em] text-white drop-shadow-[0_3px_24px_rgba(0,0,0,0.9)] sm:text-[3.2rem] lg:text-[3.35rem]">
                  MarkMaster
                </span>
              </div>

              <h1 className="animate-fade-in-up stagger-2 heading-font mt-14 max-w-[540px] text-[3.35rem] font-extrabold leading-[0.98] tracking-[-0.055em] text-white drop-shadow-[0_5px_34px_rgba(0,0,0,0.9)] sm:text-[4.25rem] lg:mt-[78px] lg:text-[4.55rem]">
                <span className="block">Put your X bookmarks in</span>
                <span className="block text-primary drop-shadow-[0_0_32px_rgba(10,132,255,0.56)]">
                  Orbit
                </span>
              </h1>

              <p className="animate-fade-in-up stagger-3 mt-7 max-w-[455px] text-[1.075rem] font-light leading-[1.75] text-[#D4DDEA] drop-shadow-[0_2px_18px_rgba(0,0,0,0.85)] sm:text-[1.18rem]">
                Grok auto-tags and sorts your saves so you can find them fast
                without leaving your bookmarks in a black box.
              </p>

              {errorMessage && (
                <div
                  role="alert"
                  className="animate-fade-in mt-7 max-w-[520px] rounded-[24px] border border-destructive/40 bg-destructive/15 p-5 text-[14.5px] leading-relaxed text-destructive-foreground shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-md sm:p-6"
                >
                  {errorMessage}
                </div>
              )}

              <div className="animate-fade-in-up stagger-4 mt-9 flex flex-col items-start gap-4">
                <Button
                  size="lg"
                  onClick={handleSignIn}
                  className="group h-[58px] rounded-full border border-white/10 bg-primary px-7 text-[1rem] font-bold text-primary-foreground shadow-[0_18px_52px_rgba(10,132,255,0.42),inset_0_1px_0_rgba(255,255,255,0.24)] transition-all hover:-translate-y-0.5 hover:bg-primary/95 hover:shadow-[0_22px_60px_rgba(10,132,255,0.52)] sm:h-[62px] sm:px-8 sm:text-[1.05rem]"
                >
                  <XLogoMark
                    className="mr-2.5 size-[22px] text-primary-foreground"
                    title={undefined}
                  />
                  Sign in with X
                  <ArrowRightIcon className="ml-2 size-[18px] opacity-85 transition-transform group-hover:translate-x-1" />
                </Button>

                <p className="flex items-center gap-2.5 text-[13.5px] text-[#B8C6DA] drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_12px_rgba(10,132,255,0.7)]" />
                  Read-only bookmark access. No posting, no feed clutter.
                </p>
              </div>
            </div>
          </section>

          <aside
            className="animate-fade-in-up stagger-3 relative isolate min-w-0 overflow-hidden rounded-[34px] border border-white/15 bg-[#071427]/65 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_90px_rgba(0,0,0,0.52)] backdrop-blur-xl sm:p-8 lg:p-8"
            style={{
              background:
                "linear-gradient(180deg, rgba(12,18,30,0.82) 0%, rgba(4,12,24,0.70) 100%)",
            }}
          >
            <OrbitRings
              className="pointer-events-none absolute -right-24 top-14 h-[260px] w-[360px] text-primary/35"
            />

            <div className="relative z-10">
              <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-[#A9B9D1]">
                HOW IT WORKS
              </p>
              <h2 className="heading-font mt-5 max-w-[320px] text-[2.25rem] font-extrabold leading-[1.08] tracking-[-0.05em] text-white drop-shadow-[0_2px_22px_rgba(0,0,0,0.76)] sm:text-[2.45rem]">
                Let Grok do the sorting.
              </h2>
              <p className="mt-5 max-w-[310px] text-[1rem] leading-[1.7] text-[#C2CEE0]">
                Import your X bookmarks, review Grok&apos;s suggestions, and build a
                searchable library you control.
              </p>
            </div>

            <div className="relative z-10 mt-8 flex flex-col">
              {FEATURE_ROWS.map((feature) => (
                <div
                  key={feature.step}
                  className="group flex items-center gap-4 border-t border-white/[0.06] py-4 first:border-t-0"
                >
                  <span className="font-mono text-[13px] font-medium text-white/40">
                    {feature.step}
                  </span>
                  <FeatureIcon icon={feature.icon} className="size-[16px] text-white/60" />
                  <h3 className="min-w-0 text-[15px] font-semibold tracking-[-0.01em] text-white/90">
                    {feature.title}
                  </h3>
                </div>
              ))}
            </div>

            <div className="relative z-10 mt-8 flex items-start gap-3.5 rounded-[22px] border border-primary/20 bg-primary/[0.08] p-4 text-[13.5px] leading-relaxed text-[#BFD0E7]">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/15 text-primary">
                <GrokMark className="size-4" title="Grok" />
              </span>
              <p>
                <span className="font-semibold text-white">
                  AI-assisted, not AI-replaced.
                </span>{" "}
                Grok suggests tags and collections; you approve every move.
                Scans run with{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-white/90">
                  store: false
                </code>
                .
              </p>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-[1440px] px-5 pb-6 text-center text-[13px] text-[#AEBBD0]/70 sm:px-8 lg:px-[72px] lg:pb-8">
        © {CURRENT_YEAR} MarkMaster · Built for people who save too much.
      </footer>
    </div>
  );
}
