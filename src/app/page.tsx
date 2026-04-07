import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LandingExperience } from "@/components/landing/landing-experience";

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return <LandingExperience />;
}
