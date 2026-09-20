import { afterEach, describe, expect, it } from "vitest";

import {
  getTypeSafeModel,
  getTypeSafeModelSource,
  isTypeSafeConfigured,
  resetTypeSafeClientForTests,
} from "@/lib/typesafe";

const ORIGINAL = {
  TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
  TYPESAFE_DEFAULT_MODEL: process.env.TYPESAFE_DEFAULT_MODEL,
};

function restore(key: keyof typeof ORIGINAL) {
  const value = ORIGINAL[key];
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

afterEach(() => {
  restore("TYPESAFE_API_KEY");
  restore("TYPESAFE_DEFAULT_MODEL");
  resetTypeSafeClientForTests();
});

describe("TypeSafe client helpers", () => {
  it("reports configuration from TYPESAFE_API_KEY", () => {
    delete process.env.TYPESAFE_API_KEY;
    expect(isTypeSafeConfigured()).toBe(false);

    process.env.TYPESAFE_API_KEY = " ts-test ";
    expect(isTypeSafeConfigured()).toBe(true);
  });

  it("uses jev-latest unless TYPESAFE_DEFAULT_MODEL is set", () => {
    delete process.env.TYPESAFE_DEFAULT_MODEL;
    expect(getTypeSafeModel()).toBe("jev-latest");
    expect(getTypeSafeModelSource()).toBe("default");

    process.env.TYPESAFE_DEFAULT_MODEL = "jev-custom";
    expect(getTypeSafeModel()).toBe("jev-custom");
    expect(getTypeSafeModelSource()).toBe("environment");
  });
});
