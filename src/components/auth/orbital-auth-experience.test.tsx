// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut } from "next-auth/react";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));

import { OrbitalAuthExperience } from "./orbital-auth-experience";

const LEAD =
  "Orbit tags your saves using your own tags or a starter set.";
const TRUST = "Read-only bookmark access. No posting, no feed clutter.";

describe("OrbitalAuthExperience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("describes tagging as the user's tags or a starter set", () => {
    render(<OrbitalAuthExperience />);

    expect(screen.getByText(LEAD)).toBeInTheDocument();
    expect(screen.getByText(TRUST)).toBeInTheDocument();
    expect(screen.queryByText(/Grok auto-tags/)).not.toBeInTheDocument();
    expect(screen.queryByText(/auto-tags your saves/)).not.toBeInTheDocument();
  });

  it("starts bootstrap sign-in without asking for an X app", async () => {
    const user = userEvent.setup();
    render(<OrbitalAuthExperience />);

    expect(screen.queryByLabelText("X app client ID")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sign in with x/i }));

    expect(signIn).toHaveBeenCalledWith("twitter", { callbackUrl: "/dashboard" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("stores the visitor's X app before hosted sign-in and refuses to start without it", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const order: string[] = [];
    vi.mocked(signOut).mockImplementation(async () => {
      order.push("signOut");
    });
    vi.mocked(signIn).mockImplementation(async () => {
      order.push("signIn");
    });

    render(<OrbitalAuthExperience requiresOwnXApp resetSession />);
    await user.click(screen.getByRole("button", { name: /sign in with x/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/paste your x app/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("X app client ID"), "client-id-1234");
    await user.type(screen.getByLabelText("X app client secret"), "secret-value-1234");
    await user.click(screen.getByRole("button", { name: /sign in with x/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/x-app",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          clientId: "client-id-1234",
          clientSecret: "secret-value-1234",
        }),
      }),
    );
    expect(order).toEqual(["signOut", "signIn"]);
    expect(signIn).toHaveBeenCalledWith("twitter", { callbackUrl: "/dashboard" });
  });
});
