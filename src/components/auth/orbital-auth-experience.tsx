"use client";

import "@/styles/auth.css";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import Image from "next/image";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import { sendJson } from "@/lib/fetch-json";
import { TWITTER_PROVIDER_ID } from "@/lib/constants";

const CURRENT_YEAR = new Date().getFullYear();
const SPLASH_BACKGROUND_IMAGE_URL = "/rocket-launch-background.png";

async function handleSignIn(
  callbackUrl: string,
  resetSession: boolean,
  ownApp: { clientId: string; clientSecret: string } | null
) {
  if (ownApp) {
    await sendJson("/api/auth/x-app", {
      method: "POST",
      body: ownApp,
    });
  }
  if (resetSession) {
    await signOut({ redirect: false });
  }
  await signIn(TWITTER_PROVIDER_ID, { callbackUrl });
}

export function OrbitalAuthExperience({
  callbackUrl = "/dashboard",
  errorMessage,
  resetSession = false,
  requiresOwnXApp = false,
}: {
  callbackUrl?: string;
  errorMessage?: string | null;
  resetSession?: boolean;
  /** Hosted deployment: sign-in must use the visitor's own X app, not AUTH_TWITTER_*. */
  requiresOwnXApp?: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSignIn() {
    setFormError(null);
    if (requiresOwnXApp && (!clientId.trim() || !clientSecret.trim())) {
      setFormError("Paste your X app client ID and secret before signing in.");
      return;
    }
    setSubmitting(true);
    try {
      await handleSignIn(
        callbackUrl,
        resetSession,
        requiresOwnXApp ? { clientId, clientSecret } : null
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not start sign-in.");
      setSubmitting(false);
    }
  }
  return (
    <div className="auth-splash dark relative isolate flex min-w-0 flex-col text-foreground">
      <div
        aria-hidden="true"
        className="auth-splash__scene pointer-events-none absolute inset-0 -z-10"
      >
        <div className="auth-splash__flight">
          <div className="auth-splash__plate">
            <Image
              src={SPLASH_BACKGROUND_IMAGE_URL}
              alt=""
              fill
              priority
              sizes="100vw"
              className="auth-splash__rocket object-cover"
            />
            <div className="auth-splash__burn" />
          </div>
        </div>
        <div className="auth-splash__scrim absolute inset-0" />
      </div>

      <main className="auth-splash__main auth-splash__inset-x scrollbar-thin relative z-[1] mx-auto w-full max-w-[1200px]">
        <div className="auth-splash__hero">
          <div className="auth-splash__brand-row animate-fade-in-up stagger-1 flex items-center">
            <MarkMasterLogo
              width={40}
              height={40}
              priority
              decorative
              className="auth-splash__brand-logo shrink-0"
            />
            <span className="auth-splash__wordmark heading-font font-semibold leading-none text-foreground">
              MarkMaster
            </span>
          </div>

          <h1 className="auth-splash__headline animate-fade-in-up stagger-2 heading-font font-bold text-foreground">
            <span className="block">Put your X bookmarks</span>
            <span className="block text-primary">in Orbit</span>
          </h1>

          <p className="auth-splash__lead animate-fade-in-up stagger-3 text-muted-foreground">
            Orbit tags your saves using your own tags or a starter set.
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="auth-splash__error animate-fade-in rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-sm leading-relaxed text-destructive"
            >
              {errorMessage}
            </div>
          )}

          <div className="auth-splash__cta animate-fade-in-up stagger-4 flex flex-col items-start">
            {requiresOwnXApp ? (
              <div className="grid w-full max-w-sm gap-2">
                <div className="space-y-1">
                  <Label htmlFor="login-x-client-id">X app client ID</Label>
                  <Input
                    id="login-x-client-id"
                    name="x-client-id"
                    autoComplete="off"
                    spellCheck={false}
                    value={clientId}
                    disabled={submitting}
                    onChange={(event) => setClientId(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="login-x-client-secret">X app client secret</Label>
                  <Input
                    id="login-x-client-secret"
                    name="x-client-secret"
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    value={clientSecret}
                    disabled={submitting}
                    onChange={(event) => setClientSecret(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
            {formError ? (
              <p className="max-w-sm text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <Button
              type="button"
              onClick={() => void onSignIn()}
              disabled={submitting}
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

          <footer className="auth-splash__footer text-[13px] text-muted-foreground">
            © {CURRENT_YEAR} MarkMaster · Built for people who save too much.
          </footer>
        </div>
      </main>
    </div>
  );
}
