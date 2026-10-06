// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  it("describes tagging as the user's tags or a starter set", () => {
    render(<OrbitalAuthExperience />);

    expect(screen.getByText(LEAD)).toBeInTheDocument();
    expect(screen.getByText(TRUST)).toBeInTheDocument();
    expect(screen.queryByText(/Grok auto-tags/)).not.toBeInTheDocument();
    expect(screen.queryByText(/auto-tags your saves/)).not.toBeInTheDocument();
  });
});
