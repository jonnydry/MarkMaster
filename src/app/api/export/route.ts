import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { exportQuerySchema } from "@/lib/validations";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import {
  CSV_EXPORT_HEADER,
  formatBookmarkCsvRow,
  formatBookmarkJsonRecord,
  iterateBookmarkExportBatches,
} from "@/lib/bookmark-export";

function exportFilename(format: "csv" | "json") {
  const date = new Date().toISOString().slice(0, 10);
  return `markmaster-bookmarks-${date}.${format}`;
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = exportQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  const { format } = parsed.data;

  const rateLimitResult = await checkRateLimit("api:read", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (format === "csv") {
          controller.enqueue(encoder.encode(CSV_EXPORT_HEADER));

          for await (const batch of iterateBookmarkExportBatches(user.id)) {
            const rows = batch.map(formatBookmarkCsvRow).join("\n");
            controller.enqueue(encoder.encode(`${rows}\n`));
          }
        } else {
          controller.enqueue(encoder.encode("[\n"));
          let first = true;

          for await (const batch of iterateBookmarkExportBatches(user.id)) {
            for (const bookmark of batch) {
              const prefix = first ? "" : ",\n";
              first = false;
              controller.enqueue(
                encoder.encode(
                  `${prefix}${JSON.stringify(formatBookmarkJsonRecord(bookmark), null, 2)}`
                )
              );
            }
          }

          controller.enqueue(encoder.encode("\n]"));
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv" : "application/json",
      "Content-Disposition": `attachment; filename="${exportFilename(format)}"`,
    },
  });
}
