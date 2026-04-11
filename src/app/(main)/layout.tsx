import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
