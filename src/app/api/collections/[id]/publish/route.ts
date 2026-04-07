import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Posting to X is disabled in this read-only build. Share collections with a public link instead.",
    },
    { status: 501 }
  );
}
