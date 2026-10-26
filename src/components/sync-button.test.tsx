// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-sync-status", () => ({
  useSyncStatus: () => ({
    data: { currentRun: null, recentRuns: [], reauthorizedAt: null },
    refetch: vi.fn(),
    isError: false,
  }),
}));

vi.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => true,
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

import { SyncButton } from "./sync-button";

describe("SyncButton X app prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("points a fail-closed sync at Settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Add your X Developer app client ID and secret in Settings.",
          code: "X_APP_CREDENTIALS_REQUIRED",
          settingsPath: "/settings?xApp=required#sync",
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SyncButton lastSyncAt={null} layout="icon" />);
    await user.click(screen.getByRole("button", { name: "Sync bookmarks" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bookmarks/sync",
      expect.objectContaining({ method: "POST" }),
    );
    const action = toastError.mock.calls[0]?.[1]?.action as {
      label: string;
      onClick: () => void;
    };
    expect(toastError).toHaveBeenCalledWith(
      "X app credentials required",
      expect.objectContaining({
        description: expect.stringMatching(/will not use the host app/),
        action: expect.objectContaining({ label: "Open Settings" }),
      }),
    );

    const assign = vi.fn();
    const location = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...location, assign },
    });
    action.onClick();
    expect(assign).toHaveBeenCalledWith("/settings?xApp=required#sync");
    Object.defineProperty(window, "location", { configurable: true, value: location });
  });
});
