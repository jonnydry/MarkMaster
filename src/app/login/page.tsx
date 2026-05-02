import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OrbitalAuthExperience } from "@/components/auth/orbital-auth-experience";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Sign-in was denied. If this keeps happening, check that PostgreSQL is running, migrations are applied, and ENCRYPTION_KEY is set in .env.",
  Configuration:
    "Auth isn’t configured correctly (for example AUTH_SECRET or provider credentials).",
  Verification: "The sign-in link is invalid or has expired.",
  Default: "Something went wrong during sign-in. Try again.",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session) redirect("/dashboard");

  const { error } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const errorMessage = errorCode
    ? AUTH_ERROR_MESSAGES[errorCode] ??
      `${AUTH_ERROR_MESSAGES.Default} (${errorCode})`
    : null;

  return <OrbitalAuthExperience errorMessage={errorMessage} />;
}
