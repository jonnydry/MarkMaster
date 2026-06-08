import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDbUser } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { debugAccessDeniedResponse } from "@/lib/debug-access";
import { readJsonBody } from "@/lib/request-body";
import { checkRateLimit } from "@/lib/rate-limit";

interface CspReport {
  "blocked-uri"?: string;
  "document-uri"?: string;
  "effective-directive"?: string;
  "violated-directive"?: string;
  "original-policy"?: string;
  "source-file"?: string;
  "line-number"?: number;
  "column-number"?: number;
  "disposition"?: "enforce" | "report";
  "script-sample"?: string;
  "status-code"?: number;
}

// In-memory store for recent CSP violations (useful for the debug page)
const MAX_RECENT_VIOLATIONS = 50;
const MAX_CSP_REPORT_BODY_BYTES = 16 * 1024;
const cspReportSchema = z.object({
  "blocked-uri": z.string().trim().max(2048).optional(),
  "document-uri": z.string().trim().max(2048).optional(),
  "effective-directive": z.string().trim().max(120).optional(),
  "violated-directive": z.string().trim().max(120).optional(),
  "original-policy": z.string().trim().max(4096).optional(),
  "source-file": z.string().trim().max(2048).optional(),
  "line-number": z.number().int().min(0).max(1_000_000).optional(),
  "column-number": z.number().int().min(0).max(1_000_000).optional(),
  disposition: z.enum(["enforce", "report"]).optional(),
  "script-sample": z.string().trim().max(240).optional(),
  "status-code": z.number().int().min(0).max(999).optional(),
});
export const recentCspViolations: Array<{
  timestamp: string;
  report: CspReport;
}> = [];

/**
 * CSP Violation Reporting Endpoint
 *
 * - POST: Receives reports from the browser (public, as browsers send these unauthenticated).
 * - GET:  Returns recent violations for the internal debug UI.
 *         Requires authentication. In production this fails closed unless
 *         OWNER_USER_ID is set and matches the caller (see debug-access.ts).
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit public CSP report ingestion to prevent abuse / log flooding
    const ip = getClientIp(req.headers);
    const rate = await checkRateLimit("csp-report", `csp:${ip}`);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many reports" }, { status: 429 });
    }

    const body = await readJsonBody(req, MAX_CSP_REPORT_BODY_BYTES);
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: body.status });
    }

    const rawBody = body.data;
    const reportInput =
      rawBody && typeof rawBody === "object" && "csp-report" in rawBody
        ? (rawBody as { "csp-report": unknown })["csp-report"]
        : rawBody;
    const parsed = cspReportSchema.safeParse(reportInput);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid report",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const report = parsed.data as CspReport;

    // Store for the debug UI
    recentCspViolations.unshift({
      timestamp: new Date().toISOString(),
      report,
    });

    // Keep only the most recent violations
    if (recentCspViolations.length > MAX_RECENT_VIOLATIONS) {
      recentCspViolations.length = MAX_RECENT_VIOLATIONS;
    }

    // Human-readable logging
    const directive = report["effective-directive"] || report["violated-directive"] || "unknown";
    const blocked = report["blocked-uri"] || "unknown";
    const source = report["source-file"]
      ? `${report["source-file"]}:${report["line-number"] || "?"}:${report["column-number"] || "?"}`
      : "inline or eval";

    console.warn("\n[CSP Violation]");
    console.warn(`  Directive      : ${directive}`);
    console.warn(`  Blocked URI    : ${blocked}`);
    console.warn(`  Source         : ${source}`);
    console.warn(`  Disposition    : ${report["disposition"] || "enforce"}`);
    if (report["script-sample"]) {
      console.warn(`  Script Sample  : ${report["script-sample"].substring(0, 120)}`);
    }
    console.warn("");

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[CSP Report] Failed to parse report:", error);
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }
}

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fail-closed in production (requires OWNER_USER_ID match); owner-only in dev when set.
  const denied = debugAccessDeniedResponse(user);
  if (denied) return denied;

  // Return recent CSP violations for the debug page (authenticated users only)
  return NextResponse.json({
    violations: recentCspViolations,
    count: recentCspViolations.length,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
