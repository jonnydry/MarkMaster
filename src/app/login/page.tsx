"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Sign-in was denied. If this keeps happening, check that PostgreSQL is running, migrations are applied, and ENCRYPTION_KEY is set in .env.",
  Configuration:
    "Auth isn’t configured correctly (for example AUTH_SECRET or provider credentials).",
  Verification: "The sign-in link is invalid or has expired.",
  Default: "Something went wrong during sign-in. Try again.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const errorMessage = error
    ? AUTH_ERROR_MESSAGES[error] ?? `${AUTH_ERROR_MESSAGES.Default} (${error})`
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="text-center mb-8">
          <Bookmark className="w-10 h-10 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Welcome to MarkMaster</h1>
          <p className="text-muted-foreground">
            Sign in with your X account to get started
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        )}

        <Button
          className="w-full h-12 text-base gap-3"
          onClick={() => signIn("twitter", { callbackUrl: "/dashboard" })}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Sign in with X
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-6">
          We request read access to your bookmarks and profile.
          <br />
          This build does not request posting permissions.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
