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
      <a
        href="#app-main-content"
        className="sr-only rounded-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border focus:border-hairline-strong focus:bg-popover focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-popover-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
      >
        Skip to content
      </a>
      <QueryProvider>
        <AuthSessionProvider session={session}>
          <AuthenticatedShell>{children}</AuthenticatedShell>
        </AuthSessionProvider>
      </QueryProvider>
    </div>
  );
}
