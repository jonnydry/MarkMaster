"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/lib/toast";
import { RefreshCw, RotateCcw, AlertTriangle } from "lucide-react";

interface RateLimitInfo {
  action: string;
  description: string;
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  resetInSeconds: number;
  resetAt: string;
}

interface RateLimitResponse {
  userId: string;
  timestamp: string;
  limits: RateLimitInfo[];
}

interface CspReportResponse {
  note: string;
}

export default function RateLimitsDebugPage() {
  const [rateLimitData, setRateLimitData] = useState<RateLimitResponse | null>(null);
  const [cspData, setCspData] = useState<CspReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);

  const fetchAll = async (options?: { showLoading?: boolean }) => {
    if (options?.showLoading !== false) {
      setLoading(true);
    }
    try {
      const [rateRes, cspRes] = await Promise.all([
        fetch("/api/debug/rate-limits"),
        fetch("/api/csp-report"),
      ]);

      if (rateRes.ok) {
        const rateJson: RateLimitResponse = await rateRes.json();
        setRateLimitData(rateJson);
      }

      if (cspRes.ok) {
        const cspJson: CspReportResponse = await cspRes.json();
        setCspData(cspJson);
      }
    } catch (error) {
      toast.error("Failed to load debug data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const resetLimit = async (action: string) => {
    setResetting(action);
    try {
      const res = await fetch("/api/debug/rate-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error("Reset failed");

      toast.success(`Rate limit for "${action}" has been reset`);
      await fetchAll();
    } catch {
      toast.error(`Failed to reset "${action}"`);
    } finally {
      setResetting(null);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void fetchAll({ showLoading: false });
    });
  }, []);

  if (loading && !rateLimitData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security & Rate Limit Debug</h1>
          <p className="text-muted-foreground">
            Internal debugging tools for development and security auditing.
          </p>
        </div>
        <Button onClick={() => void fetchAll()} variant="outline" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh All
        </Button>
      </div>

      {/* Rate Limits Section */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-xl font-semibold">Rate Limits</h2>
          {rateLimitData && (
            <span className="text-xs text-muted-foreground">
              User: {rateLimitData.userId}
            </span>
          )}
        </div>

        {rateLimitData ? (
          <div className="grid gap-6 md:grid-cols-2">
            {rateLimitData.limits.map((limit) => {
              const used = limit.limit - limit.remaining;
              const usagePercent = Math.min((used / limit.limit) * 100, 100);

              return (
                <Card key={limit.action}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="capitalize">{limit.action}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resetLimit(limit.action)}
                        disabled={!!resetting}
                      >
                        {resetting === limit.action ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                        <span className="ml-2">Reset</span>
                      </Button>
                    </CardTitle>
                    <CardDescription>{limit.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span>Usage</span>
                        <span>
                          {used} / {limit.limit}
                        </span>
                      </div>
                      <Progress value={usagePercent} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Remaining</div>
                        <div className="font-medium text-lg">{limit.remaining}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Resets in</div>
                        <div className="font-medium text-lg">
                          {limit.resetInSeconds > 0
                            ? `${Math.floor(limit.resetInSeconds / 60)}m ${limit.resetInSeconds % 60}s`
                            : "Now"}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Resets at: {new Date(limit.resetAt).toLocaleTimeString()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground">Failed to load rate limit data.</p>
        )}
      </div>

      {/* CSP Violations Section */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            CSP Violations
          </h2>
        </div>

        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            {cspData?.note ??
              'CSP violations are written to server logs with the "[csp-violation]" prefix.'}
          </CardContent>
        </Card>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        Tip: Use this page while testing to monitor rate limits and catch CSP issues early.
      </div>
    </div>
  );
}
