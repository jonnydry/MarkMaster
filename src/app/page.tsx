import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OrbitalAuthExperience } from "@/components/auth/orbital-auth-experience";

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return <OrbitalAuthExperience />;
}
