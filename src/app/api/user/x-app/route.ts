import { NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import {
  encryptXAppCredentials,
  parseXAppCredentialInput,
  xAppCredentialStatus,
  xAppStatusFromRow,
} from "@/lib/x-app-credentials";
import {
  X_APP_PENDING_COOKIE,
  xAppPendingCookieOptions,
} from "@/lib/x-app-pending";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The signed-in user's own X Developer app.
 * Reads and writes are `where: { id: sessionUser.id }` only.
 * Responses include a last-4 hint, never the secret or the full client id.
 */
export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await xAppCredentialStatus(user.id);
  return NextResponse.json(status, { headers: NO_STORE });
}

export async function PUT(req: Request) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const record =
    body.data && typeof body.data === "object"
      ? (body.data as { clientId?: unknown; clientSecret?: unknown })
      : {};
  const parsed = parseXAppCredentialInput({
    clientId: record.clientId,
    clientSecret: record.clientSecret,
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const encrypted = encryptXAppCredentials(parsed.clientId, parsed.clientSecret);
  await prisma.user.update({
    where: { id: user.id },
    data: encrypted,
    select: { id: true },
  });

  return NextResponse.json(
    xAppStatusFromRow(user.id, encrypted),
    { headers: NO_STORE }
  );
}

export async function DELETE() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { xClientId: null, xClientSecret: null },
    select: { id: true },
  });

  const response = NextResponse.json(await xAppCredentialStatus(user.id), {
    headers: NO_STORE,
  });
  response.cookies.set(X_APP_PENDING_COOKIE, "", xAppPendingCookieOptions(0));
  return response;
}
