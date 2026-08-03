"use client";

import "@/styles/auth.css";

import { signIn, signOut } from "next-auth/react";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import { TWITTER_PROVIDER_ID } from "@/lib/constants";

const CURRENT_YEAR = new Date().getFullYear();
const SPLASH_BACKGROUND_IMAGE_URL = "/rocket-launch-background.png";

async function handleSignIn(callbackUrl: string, resetSession: boolean) {
  if (resetSession) {
    await signOut({ redirect: false });
  }
  await signIn(TWITTER_PROVIDER_ID, { callbackUrl });
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
    <div className="auth-splash dark relative isolate flex min-w-0 flex-col bg-background text-foreground selection:bg-primary/30">
      <div
        aria-hidden="true"
        className="auth-splash__backdrop pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage: [
            "linear-gradient(90deg, rgba(0,4,11,0.82) 0%, rgba(0,4,11,0.62) 34%, rgba(0,4,11,0.16) 52%, rgba(0,4,11,0.62) 100%)",
            "linear-gradient(180deg, rgba(0,4,11,0.30) 0%, rgba(0,4,11,0.08) 40%, rgba(0,4,11,0.78) 100%)",
            `url(${SPLASH_BACKGROUND_IMAGE_URL})`,
          ].join(", "),
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_58%,rgba(10,132,255,0.20)_0%,rgba(10,132,255,0.08)_21%,rgba(0,4,11,0)_48%)]"
      />

      <main className="auth-splash__main auth-splash__inset-x scrollbar-thin relative z-[1] mx-auto w-full max-w-[1440px]">
        <div className="auth-splash__hero">
          <div className="auth-splash__brand-row animate-fade-in-up stagger-1 flex items-center">
            <MarkMasterLogo
              width={56}
              height={56}
              priority
              decorative
              className="auth-splash__brand-logo shrink-0"
            />
            <span className="auth-splash__wordmark heading-font font-extrabold leading-none text-foreground">
              MarkMaster
            </span>
          </div>

          <h1 className="auth-splash__headline animate-fade-in-up stagger-2 heading-font font-extrabold text-foreground">
            <span className="block">Put your X bookmarks</span>
            <span className="block text-primary">in Orbit</span>
          </h1>

          <p className="auth-splash__lead animate-fade-in-up stagger-3 font-light text-muted-foreground">
            Grok auto-tags your saves. Orbit maps them into a living graph.
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="auth-splash__error animate-fade-in rounded-sm border border-destructive/40 bg-destructive/15 p-4 text-[14.5px] leading-relaxed text-destructive-foreground sm:p-5"
            >
              {errorMessage}
            </div>
          )}

          <div className="auth-splash__cta animate-fade-in-up stagger-4 flex flex-col items-start">
            <Button
              type="button"
              variant="highlight"
              onClick={() => void handleSignIn(callbackUrl, resetSession)}
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

            <p className="auth-splash__trust text-muted-foreground">
              Read-only bookmark access. No posting, no feed clutter.
            </p>
          </div>
        </div>
      </main>

      <footer className="auth-splash__footer auth-splash__inset-x mx-auto w-full max-w-[1440px] text-center text-[13px] text-muted-foreground/70">
        © {CURRENT_YEAR} MarkMaster · Built for people who save too much.
      </footer>
    </div>
  );
}
