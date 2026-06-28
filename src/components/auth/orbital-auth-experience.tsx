"use client";

import "@/styles/auth.css";

import { signIn } from "next-auth/react";
import { GrokMark } from "@/components/brands/grok-mark";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import { Button } from "@/components/ui/button";
import { ArrowRight, FolderOpen, Search, Tag } from "lucide-react";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { TWITTER_PROVIDER_ID } from "@/lib/constants";
import { OrbitalRings } from "@/components/orbital";
import { SANS_SECTION_LABEL } from "@/lib/typography";

type FeatureRow = {
  step: string;
  title: string;
  icon: "grok" | "search" | "tag" | "collection" | "graph";
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
  {
    step: "05",
    title: "Explore the interactive graph and manually tag or collect",
    icon: "graph",
  },
] as const;

const CURRENT_YEAR = new Date().getFullYear();
const SPLASH_BACKGROUND_IMAGE_URL = "/rocket-launch-background.png";

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
    return <Search className={className} aria-hidden="true" />;
  }

  if (icon === "tag") {
    return <Tag className={className} aria-hidden="true" />;
  }

  if (icon === "graph") {
    return <OrbitLogoMark className={className} aria-hidden="true" />;
  }

  return <FolderOpen className={className} aria-hidden="true" />;
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
    <div className="auth-splash dark relative isolate flex min-w-0 flex-col bg-background text-foreground selection:bg-primary/30">
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

      <header className="auth-splash__header auth-splash__inset-x mx-auto flex w-full max-w-[1440px] items-center justify-end">
        <Button
          type="button"
          variant="highlight"
          onClick={handleSignIn}
          className="highlight-search-shell relative h-9 gap-2 overflow-hidden px-4 text-[15px]"
        >
          <XLogoMark
            className="size-4 shrink-0 text-foreground"
            title={undefined}
          />
          Sign in
          <ArrowRight className="size-4 shrink-0 opacity-85" aria-hidden="true" />
        </Button>
      </header>

      <main className="auth-splash__main auth-splash__inset-x scrollbar-thin relative z-[1] mx-auto w-full max-w-[1440px]">
        <div className="auth-splash__main-inner">
          <div className="auth-splash__grid grid w-full min-w-0 grid-cols-1 items-center lg:grid-cols-[minmax(0,520px)_minmax(340px,400px)] lg:justify-between">
          <section className="min-w-0">
            <div className="flex max-w-[540px] flex-col items-start">
              <div className="auth-splash__brand-row animate-fade-in-up stagger-1 flex items-center">
                <span className="auth-splash__brand-badge shrink-0 rounded-full border border-primary/45 bg-primary/10 backdrop-blur-sm">
                  <MarkMasterLogo
                    width={56}
                    height={56}
                    priority
                    decorative
                    className="auth-splash__brand-logo"
                  />
                </span>
                <span className="auth-splash__wordmark heading-font font-extrabold leading-none text-foreground">
                  MarkMaster
                </span>
              </div>

              <h1 className="auth-splash__headline animate-fade-in-up stagger-2 heading-font max-w-[540px] font-extrabold text-foreground">
                <span className="block">Put your X bookmarks in</span>
                <span className="block text-primary">
                  Orbit
                </span>
              </h1>

              <p className="auth-splash__lead animate-fade-in-up stagger-3 max-w-[455px] font-light text-muted-foreground">
                Grok auto-tags your saves, then Orbit maps them into a living
                graph — pan the links between tags and collections, drag to
                reassign, and watch clusters form.
              </p>

              {errorMessage && (
                <div
                  role="alert"
                  className="auth-splash__error animate-fade-in max-w-[520px] rounded-sm border border-destructive/40 bg-destructive/15 p-4 text-[14.5px] leading-relaxed text-destructive-foreground sm:p-5"
                >
                  {errorMessage}
                </div>
              )}

              <div className="auth-splash__cta animate-fade-in-up stagger-4 flex flex-col items-start">
                <Button
                  type="button"
                  variant="highlight"
                  onClick={handleSignIn}
                  className="auth-splash__primary-button highlight-search-shell group relative w-full gap-2.5 overflow-hidden sm:w-auto"
                >
                  <XLogoMark
                    className="size-[22px] shrink-0 text-foreground"
                    title={undefined}
                  />
                  Sign in with X
                  <ArrowRight
                    className="size-[18px] shrink-0 opacity-85"
                    aria-hidden="true"
                  />
                </Button>

                <p className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  Read-only bookmark access. No posting, no feed clutter.
                </p>
              </div>
            </div>
          </section>

          <aside
            className="auth-splash__aside surface-overlay animate-fade-in-up stagger-3 relative isolate min-w-0 overflow-hidden"
          >
            <OrbitalRings
              className="auth-splash__aside-rings pointer-events-none absolute -right-24 text-primary/35"
            />

            <div className="relative z-10">
              <p className={SANS_SECTION_LABEL}>How it works</p>
              <h2 className="auth-splash__aside-title heading-font max-w-[320px] font-extrabold text-foreground">
                Let Grok do the sorting.
              </h2>
              <p className="auth-splash__aside-copy max-w-[310px] text-muted-foreground">
                Import your X bookmarks, review Grok&apos;s suggestions, and build a
                searchable library you control.
              </p>
            </div>

            <div className="auth-splash__feature-list relative z-10 flex flex-col">
              {FEATURE_ROWS.map((feature) => (
                <div
                  key={feature.step}
                  className="auth-splash__feature-row group flex items-center border-t border-hairline-soft first:border-t-0"
                >
                  <span className="font-mono text-[13px] font-medium text-muted-foreground">
                    {feature.step}
                  </span>
                  <FeatureIcon icon={feature.icon} className="size-[16px] shrink-0 text-foreground/65" />
                  <h3 className="auth-splash__feature-title min-w-0 font-semibold text-foreground">
                    {feature.title}
                  </h3>
                </div>
              ))}
            </div>

            <div className="auth-splash__note surface-inset-strong relative z-10 flex items-start border-primary/20 text-muted-foreground">
              <span className="auth-splash__note-icon mt-0.5 flex shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/15 text-primary">
                <GrokMark className="size-3.5" title="Grok" />
              </span>
              <p>
                <span className="font-semibold text-foreground">
                  AI-assisted, not AI-replaced.
                </span>{" "}
                Grok suggests tags and collections; you approve every move.
                Scans run with{" "}
                <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-foreground">
                  store: false
                </code>
                .
              </p>
            </div>
          </aside>
          </div>
        </div>
      </main>

      <footer className="auth-splash__footer auth-splash__inset-x mx-auto w-full max-w-[1440px] text-center text-[13px] text-muted-foreground/70">
        © {CURRENT_YEAR} MarkMaster · Built for people who save too much.
      </footer>
    </div>
  );
}
