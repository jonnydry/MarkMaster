"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import { TWITTER_PROVIDER_ID } from "@/lib/constants";

const SIGNAL_CHIPS = [
  "Find the signal",
  "Tag with intent",
  "Keep collections in orbit",
] as const;

const FEATURE_ROWS = [
  {
    step: "01",
    title: "Surface the right post fast",
    description:
      "Search by text, author, or note whenever something slips out of immediate view.",
    emphasized: true,
  },
  {
    step: "02",
    title: "Tag the signal",
    description:
      "Group bookmarks by topic so the important ones keep their place instead of disappearing back into the feed.",
    emphasized: false,
  },
  {
    step: "03",
    title: "Build collections with gravity",
    description:
      "Pull related posts into curated sets you can revisit privately or share as a clean public collection.",
    emphasized: false,
  },
] as const;

function XBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function OrbitalAuthExperience({
  errorMessage,
}: {
  errorMessage?: string | null;
}) {
  return (
    <div className="dark relative min-h-screen overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
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

      <main className="relative mx-auto flex min-h-screen w-full max-w-[1440px] items-center px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-12">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-9 xl:grid-cols-[minmax(0,1fr)_460px]">
          <section className="flex min-w-0 items-center lg:pr-4 xl:pr-10">
            <div className="w-full max-w-[700px]">
              <div className="flex flex-col items-start gap-8 lg:gap-[34px]">
                <div className="flex flex-col items-start gap-5 lg:gap-[22px]">
                  <MarkMasterLogo
                    width={184}
                    height={184}
                    priority
                    className="h-36 w-36 drop-shadow-[0_18px_40px_rgba(74,123,255,0.24)] sm:h-40 sm:w-40 lg:h-44 lg:w-44 xl:h-[184px] xl:w-[184px]"
                  />

                  <div className="space-y-3">
                    <p className="max-w-[700px] text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[13px] sm:leading-4">
                      Bring your saved posts into orbit
                    </p>
                    <h1 className="heading-font max-w-[700px] text-[3.25rem] leading-[0.98] font-semibold tracking-[-0.06em] text-foreground sm:text-[4.15rem] lg:text-[4.875rem] lg:leading-[5rem]">
                      MarkMaster: an orbital view of your X bookmarks.
                    </h1>
                    <p className="max-w-[620px] text-lg leading-8 font-light text-muted-foreground sm:text-xl lg:text-[22px] lg:leading-[34px]">
                      MarkMaster gives your X bookmarks an off-world home they
                      deserve, so the good ideas stay visible, searchable, and
                      easy to return to.
                    </p>
                  </div>

                  {errorMessage && (
                    <div
                      role="alert"
                      className="max-w-[620px] rounded-[20px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
                    >
                      {errorMessage}
                    </div>
                  )}

                  <div className="flex max-w-[700px] flex-wrap gap-3">
                    {SIGNAL_CHIPS.map((chip) => (
                      <div
                        key={chip}
                        className="rounded-full border border-foreground/10 bg-foreground/5 px-4 py-[11px] text-[15px] leading-5 text-muted-foreground"
                      >
                        {chip}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-[18px]">
                  <Button
                    size="lg"
                    className="h-14 rounded-full border-0 bg-primary px-6 text-base font-semibold text-primary-foreground shadow-[0_14px_32px_rgba(74,123,255,0.28)] hover:bg-primary/90"
                    onClick={() =>
                      signIn(TWITTER_PROVIDER_ID, { callbackUrl: "/dashboard" })
                    }
                  >
                    <XBrandIcon />
                    Sign in with X
                  </Button>

                  <p className="flex max-w-[520px] items-start gap-3 text-sm leading-5 text-muted-foreground">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald" />
                    Read-only bookmark access. No posting permissions, no feed
                    clutter.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside
            className="hidden overflow-hidden rounded-[34px] border border-foreground/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-[10px] lg:flex lg:flex-col"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
            }}
          >
            <div className="border-b border-foreground/10 px-[30px] py-[30px]">
              <p className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground/60">
                Why orbit works
              </p>
              <h2 className="heading-font mt-[14px] max-w-[300px] text-[32px] leading-10 font-semibold text-foreground">
                Your saves enter a working orbit.
              </h2>
              <p className="mt-[14px] max-w-[340px] text-[15px] leading-6 text-muted-foreground/80">
                Built for people who save too much to leave good ideas drifting
                in the timeline.
              </p>
            </div>

            <div className="px-[30px] py-2">
              {FEATURE_ROWS.map((feature) => (
                <div
                  key={feature.step}
                  className="flex items-start gap-[18px] border-t border-foreground/10 py-5"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${
                      feature.emphasized
                        ? "bg-primary/20 text-primary/80"
                        : "bg-foreground/5 text-muted-foreground"
                    }`}
                  >
                    {feature.step}
                  </div>

                  <div className="space-y-2">
                    <h3 className="heading-font text-[18px] leading-[22px] font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="max-w-[300px] text-[15px] leading-6 text-muted-foreground/80">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
