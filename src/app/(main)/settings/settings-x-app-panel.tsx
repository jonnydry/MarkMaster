"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import { sendJson } from "@/lib/fetch-json";
import { toast } from "@/lib/toast";
import { TWITTER_PROVIDER_ID } from "@/lib/constants";
import { X_APP_CREDENTIALS_REQUIRED_MESSAGE } from "@/lib/x-app-shared";

type XAppStatus = {
  configured: boolean;
  unreadable: boolean;
  clientIdLast4: string | null;
  secretLast4: string | null;
  hostAppFallback: boolean;
};

function subscribeToOrigin() {
  return () => {};
}

function readOrigin() {
  return window.location.origin;
}

function readOriginOnServer() {
  return "";
}

export function SettingsXAppPanel({ promptSetup = false }: { promptSetup?: boolean }) {
  const [status, setStatus] = useState<XAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const origin = useSyncExternalStore(subscribeToOrigin, readOrigin, readOriginOnServer);
  const callbackUrl = `${origin}/api/auth/callback/twitter`;

  const applyStatus = useCallback((next: XAppStatus) => {
    setStatus(next);
    setLoadError(null);
    setLoading(false);
  }, []);

  const applyLoadError = useCallback((error: unknown) => {
    setLoadError(error instanceof Error ? error.message : "Could not load X app credentials.");
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    sendJson<XAppStatus>("/api/user/x-app", { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) applyStatus(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) applyLoadError(error);
      });
    return () => controller.abort();
  }, [applyLoadError, applyStatus, reloadKey]);

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    setReloadKey((key) => key + 1);
  }

  const showRequired =
    promptSetup ||
    (status !== null && !status.configured && !status.hostAppFallback && !status.unreadable);

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const next = await sendJson<XAppStatus>("/api/user/x-app", {
        method: "PUT",
        body: { clientId, clientSecret },
      });
      setStatus(next);
      setClientId("");
      setClientSecret("");
      setNotice("Saved. The secret is stored encrypted and is not shown again.");
      toast.success("X app credentials saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save X app credentials.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    const confirmed = await confirmDialog({
      title: "Remove X app credentials?",
      description:
        "Sync and reconnect stop using this app. On the hosted site, this account cannot fall back to the host app.",
      confirmLabel: "Remove credentials",
      destructive: true,
    });
    if (!confirmed) return;

    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const next = await sendJson<XAppStatus>("/api/user/x-app", { method: "DELETE" });
      setStatus(next);
      setClientId("");
      setClientSecret("");
      setNotice("Removed. Save a new client ID and secret before syncing.");
      toast.success("X app credentials removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove X app credentials.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function handleReconnect() {
    const callback =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/settings";
    void signIn(TWITTER_PROVIDER_ID, { callbackUrl: callback });
  }

  const canSave = clientId.trim().length > 0 && clientSecret.trim().length > 0 && !saving;

  return (
    <div className="border-b border-hairline-soft pb-3">
      <p className="text-sm font-medium text-foreground">X Developer app</p>
      <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground">
        Paste the client ID and secret from your own app at developer.x.com.
        Callback URL{" "}
        <span className="font-data text-foreground">{callbackUrl}</span>.
        Scopes: tweet.read, users.read, bookmark.read, offline.access.
        Reconnect X after you save or rotate so new tokens belong to this app.
      </p>

      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Checking saved credentials…</p>
      ) : null}

      {loadError ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" role="alert">
          <p className="text-xs text-destructive">{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={retryLoad}>
            Try again
          </Button>
        </div>
      ) : null}

      {status?.unreadable ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          Saved credentials could not be read. Remove them and enter the client ID and secret again.
        </p>
      ) : null}

      {showRequired ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {X_APP_CREDENTIALS_REQUIRED_MESSAGE}
        </p>
      ) : null}

      {status && !status.configured && status.hostAppFallback && !status.unreadable ? (
        <p className="mt-3 text-xs text-muted-foreground">
          This install uses the host X app until you save your own. Saving replaces it for this account only.
        </p>
      ) : null}

      {status?.configured ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          Saved. Client ID ends in {status.clientIdLast4}. Secret ends in {status.secretLast4}.
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="x-app-client-id">Client ID</Label>
          <Input
            id="x-app-client-id"
            name="x-client-id"
            autoComplete="off"
            spellCheck={false}
            value={clientId}
            disabled={saving}
            placeholder={status?.configured ? `Saved · ••••${status.clientIdLast4}` : "Client ID"}
            onChange={(event) => setClientId(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="x-app-client-secret">Client secret</Label>
          <Input
            id="x-app-client-secret"
            name="x-client-secret"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={clientSecret}
            disabled={saving}
            placeholder={status?.configured ? "Saved · enter a new secret to rotate" : "Client secret"}
            onChange={(event) => setClientSecret(event.target.value)}
          />
        </div>
      </div>

      {formError ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canSave} onClick={() => void handleSave()}>
          {saving ? "Saving…" : status?.configured ? "Rotate credentials" : "Save credentials"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving || (!status?.configured && !status?.unreadable)}
          onClick={() => void handleClear()}
        >
          Remove
        </Button>
        {status?.configured ? (
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={handleReconnect}>
            <XLogoMark className="size-4 shrink-0" title={undefined} />
            Reconnect X
          </Button>
        ) : null}
      </div>
    </div>
  );
}
