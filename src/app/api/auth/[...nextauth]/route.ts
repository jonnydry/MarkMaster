import { NextRequest } from "next/server";

import { handlers } from "@/lib/auth";
import { blockTwitterOAuthIfUnconfigured } from "@/lib/x-oauth-gate";

async function handle(req: NextRequest) {
  const blocked = await blockTwitterOAuthIfUnconfigured(req);
  if (blocked) return blocked;
  // GET and POST are the same Auth.js handler today. Dispatch by method so a
  // future split cannot send token exchange through the read path.
  return req.method === "POST" ? handlers.POST(req) : handlers.GET(req);
}

export const GET = handle;
export const POST = handle;
