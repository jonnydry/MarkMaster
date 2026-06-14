import { NextResponse } from "next/server";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const syncSettingsBodySchema = z.object({
  syncXFolders: z.boolean(),
});

export async function PATCH(req: Request) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = syncSettingsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "syncXFolders must be a boolean" },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { syncXFolders: parsed.data.syncXFolders },
    select: { syncXFolders: true },
  });

  return NextResponse.json(updated);
}
