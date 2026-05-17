import { NextRequest, NextResponse } from "next/server";

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
export const recentCspViolations: Array<{
  timestamp: string;
  report: CspReport;
}> = [];

/**
 * CSP Violation Reporting Endpoint
 *
 * Receives Content-Security-Policy violation reports from the browser.
 * Logs them in a human-readable format and stores the last 50 for debugging.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let rawBody: any;

    // Support both modern and legacy CSP report formats
    if (contentType.includes("application/csp-report")) {
      // Legacy format (older browsers)
      rawBody = await req.json();
    } else {
      // Modern format: { "csp-report": { ... } }
      const body = await req.json();
      rawBody = body["csp-report"] || body;
    }

    const report = rawBody as CspReport;

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

    return NextResponse.json({ status: "ok" }, { status: 204 });
  } catch (error) {
    console.error("[CSP Report] Failed to parse report:", error);
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }
}

export async function GET() {
  // Return recent CSP violations for the debug page
  return NextResponse.json({
    violations: recentCspViolations,
    count: recentCspViolations.length,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
