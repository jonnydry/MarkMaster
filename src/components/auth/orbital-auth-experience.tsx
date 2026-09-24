"use client";

import "@/styles/auth.css";

import { signIn, signOut } from "next-auth/react";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import { TWITTER_PROVIDER_ID } from "@/lib/constants";
import { cn } from "@/lib/utils";

const CURRENT_YEAR = new Date().getFullYear();

async function handleSignIn(callbackUrl: string, resetSession: boolean) {
  if (resetSession) {
    await signOut({ redirect: false });
  }
  await signIn(TWITTER_PROVIDER_ID, { callbackUrl });
}

type GlimpseRow = {
  name: string;
  handle: string;
  text: string;
  tag: string;
  selected?: boolean;
};

/** Static, illustrative rows — not user data. */
const GLIMPSE_ROWS: GlimpseRow[] = [
  {
    name: "Design Notes",
    handle: "@designnotes",
    text: "A field guide to spacing systems that survive real product work.",
    tag: "Design systems",
  },
  {
    name: "Systems Weekly",
    handle: "@systemsweekly",
    text: "Postgres indexes, explained with the queries that actually need them.",
    tag: "Databases",
    selected: true,
  },
  {
    name: "Research Digest",
    handle: "@researchdigest",
    text: "Thread: the ten papers worth reading on retrieval this year.",
    tag: "Reading list",
  },
  {
    name: "Indie Makers",
    handle: "@indiemakers",
    text: "How we priced our first product — and what we'd change.",
    tag: "Business",
  },
];

function ProductGlimpse() {
  return (
    <div
      aria-hidden="true"
      className="auth-splash__glimpse surface-card overflow-hidden text-left"
    >
      <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-3">
        <span className="text-[13px] font-semibold text-foreground">Orbit</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          4 to review
        </span>
      </div>
      <ul>
        {GLIMPSE_ROWS.map((row) => (
          <li
            key={row.handle}
            className={cn(
              "flex gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0",
              row.selected && "state-selected"
            )}
          >
            <span className="mt-0.5 size-8 shrink-0 rounded-full bg-surface-3" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-semibold text-foreground">{row.name}</span>{" "}
                <span className="text-muted-foreground">{row.handle}</span>
              </p>
              <p className="mt-0.5 text-sm leading-5 text-foreground">
                {row.text}
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs",
                  row.selected
                    ? "border-primary/30 text-foreground"
                    : "border-hairline-soft text-muted-foreground"
                )}
              >
                {row.tag}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrbitalAuthExperience({
  callbackUrl = "/dashboard",
  errorMessage,
  resetSession = false,
}: {
  callbackUrl?: string;
  errorMessage?: string | null;
  resetSession?: boolean;
}) {
  return (
    <div className="auth-splash relative isolate flex min-w-0 flex-col bg-background text-foreground">
      <div
        aria-hidden="true"
        className="auth-splash__horizon pointer-events-none absolute inset-0 -z-10"
      />

      <header className="auth-splash__header auth-splash__inset-x mx-auto flex w-full max-w-[1200px] items-center">
        <div className="auth-splash__brand-row flex items-center">
          <MarkMasterLogo
            width={28}
            height={28}
            priority
            decorative
            className="auth-splash__brand-logo shrink-0"
          />
          <span className="auth-splash__wordmark heading-font font-semibold leading-none text-foreground">
            MarkMaster
          </span>
        </div>
      </header>

      <main className="auth-splash__main auth-splash__inset-x scrollbar-thin relative z-[1] mx-auto w-full max-w-[1200px]">
        <div className="auth-splash__layout">
          <div className="auth-splash__hero">
            <h1 className="auth-splash__headline animate-fade-in-up stagger-1 heading-font font-bold text-foreground">
              <span className="block">Put your X bookmarks</span>
              <span className="block text-primary">in Orbit</span>
            </h1>

            <p className="auth-splash__lead animate-fade-in-up stagger-2 text-muted-foreground">
              Grok auto-tags your saves. Orbit maps them into a living graph.
            </p>

            {errorMessage && (
              <div
                role="alert"
                className="auth-splash__error animate-fade-in rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-sm leading-relaxed text-destructive"
              >
                {errorMessage}
              </div>
            )}

            <div className="auth-splash__cta animate-fade-in-up stagger-3 flex flex-col items-start">
              <Button
                type="button"
                onClick={() => void handleSignIn(callbackUrl, resetSession)}
                className="auth-splash__primary-button w-full gap-2.5 sm:w-auto"
              >
                <XLogoMark className="size-[18px] shrink-0" title={undefined} />
                Sign in with X
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </Button>

              <p className="auth-splash__trust text-muted-foreground">
                Read-only bookmark access. No posting, no feed clutter.
              </p>
            </div>
          </div>

          <div className="auth-splash__glimpse-wrap animate-fade-in-up stagger-4">
            <ProductGlimpse />
          </div>
        </div>
      </main>

      <footer className="auth-splash__footer auth-splash__inset-x mx-auto w-full max-w-[1200px] text-center text-[13px] text-muted-foreground">
        © {CURRENT_YEAR} MarkMaster · Built for people who save too much.
      </footer>
    </div>
  );
}
