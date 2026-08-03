import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { AuthSessionProvider, QueryProvider } from "@/components/providers";
import { appFixedViewportClassName } from "@/lib/app-layout";
import { cn } from "@/lib/utils";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.dbUser) redirect("/login?error=SessionUnavailable");
  return (
    <div className={cn(appFixedViewportClassName, "flex flex-col")}>
      <QueryProvider>
        <AuthSessionProvider session={session}>
          <AuthenticatedShell>{children}</AuthenticatedShell>
        </AuthSessionProvider>
      </QueryProvider>
    </div>
  );
}
