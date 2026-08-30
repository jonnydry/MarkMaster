import { NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Invalidate every JWT session for the current user by bumping
 * User.sessionVersion. Existing cookies (including the caller's) fail the
 * next sessionVersion revalidation, within SESSION_REVALIDATE_INTERVAL_MS.
 * The caller is expected to follow up with a local signOut().
 */
export async function POST() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
