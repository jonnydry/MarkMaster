// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmDialogMock = vi.hoisted(() => vi.fn(async () => true));
const signInMock = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/confirm-dialog", () => ({
  confirmDialog: confirmDialogMock,
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { SettingsXAppPanel } from "./settings-x-app-panel";

const emptyStatus = {
  configured: false,
  unreadable: false,
  clientIdLast4: null,
  secretLast4: null,
  hostAppFallback: false,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SettingsXAppPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmDialogMock.mockResolvedValue(true);
  });

  it("saves credentials, then shows a last-4 hint instead of the secret", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(emptyStatus))
      .mockResolvedValueOnce(
        json({
          configured: true,
          unreadable: false,
          clientIdLast4: "1234",
          secretLast4: "zzzz",
          hostAppFallback: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SettingsXAppPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Settings/);
    expect(
      await screen.findByText(
        `${window.location.origin}/api/auth/callback/twitter`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save credentials" })).toBeDisabled();

    await user.type(screen.getByLabelText("Client ID"), "client-user-1-1111");
    await user.type(screen.getByLabelText("Client secret"), "secret-user-1-zzzz");
    await user.click(screen.getByRole("button", { name: "Save credentials" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(String(init.body)).toContain("secret-user-1-zzzz");
    expect(await screen.findByText(/Secret ends in zzzz/)).toBeInTheDocument();
    expect(screen.getByLabelText("Client secret")).toHaveValue("");
    expect(screen.queryByText("secret-user-1-zzzz")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotate credentials" })).toBeDisabled();
    expect(toastSuccess).toHaveBeenCalledWith("X app credentials saved");
  });

  it("removes credentials only after confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          configured: true,
          unreadable: false,
          clientIdLast4: "1234",
          secretLast4: "zzzz",
          hostAppFallback: false,
        }),
      )
      .mockResolvedValueOnce(json(emptyStatus));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SettingsXAppPanel />);

    expect(await screen.findByText(/Secret ends in zzzz/)).toBeInTheDocument();
    confirmDialogMock.mockResolvedValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    confirmDialogMock.mockResolvedValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
    expect(await screen.findByText(/Removed/)).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("X app credentials removed");
  });

  it("reconnects with the stored app and can clear an unreadable pair", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json({
        configured: false,
        unreadable: true,
        clientIdLast4: null,
        secretLast4: null,
        hostAppFallback: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { unmount } = render(<SettingsXAppPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Reconnect X/ })).not.toBeInTheDocument();
    unmount();

    fetchMock.mockResolvedValueOnce(
      json({
        configured: true,
        unreadable: false,
        clientIdLast4: "1234",
        secretLast4: "zzzz",
        hostAppFallback: false,
      }),
    );
    render(<SettingsXAppPanel />);
    await user.click(await screen.findByRole("button", { name: /Reconnect X/ }));
    expect(signInMock).toHaveBeenCalledWith("twitter", {
      callbackUrl: `${window.location.pathname}${window.location.search}`,
    });
  });

  it("shows the setup prompt from the fail-closed redirect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          ...emptyStatus,
          hostAppFallback: true,
        }),
      ),
    );
    render(<SettingsXAppPanel promptSetup />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /will not use the host app/i,
    );
  });

  it("shows a load error and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(json(emptyStatus));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SettingsXAppPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/will not use the host app/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
