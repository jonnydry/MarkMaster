import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OrbitalAuthExperience } from "@/components/auth/orbital-auth-experience";
import { getSafeRelativeCallbackUrl } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Sign-in could not be completed. Please try again or contact the app administrator.",
  Configuration: "Sign-in is temporarily unavailable. Please try again later.",
  SessionUnavailable:
    "Your session could not be loaded. Sign in again to reconnect your library.",
  Verification: "The sign-in link is invalid or has expired.",
  Default: "Something went wrong during sign-in. Try again.",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    callbackUrl?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.dbUser) redirect("/dashboard");

  const { error, callbackUrl: rawCallbackUrl } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const callbackUrl = getSafeRelativeCallbackUrl(rawCallbackUrl, "/dashboard");
  const errorMessage = errorCode
    ? AUTH_ERROR_MESSAGES[errorCode] ?? AUTH_ERROR_MESSAGES.Default
    : null;

  return (
    <OrbitalAuthExperience
      callbackUrl={callbackUrl}
      errorMessage={errorMessage}
      resetSession={Boolean(session && !session.dbUser)}
    />
  );
}
