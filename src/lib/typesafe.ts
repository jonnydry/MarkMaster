import "server-only";

import { TypeSafeClient } from "@typesafe-ai/sdk";

export const DEFAULT_TYPESAFE_MODEL = "jev-latest";

export function isTypeSafeConfigured() {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

export function getTypeSafeModel() {
  return process.env.TYPESAFE_DEFAULT_MODEL?.trim() || DEFAULT_TYPESAFE_MODEL;
}

export function getTypeSafeModelSource(): "default" | "environment" {
  return process.env.TYPESAFE_DEFAULT_MODEL?.trim() ? "environment" : "default";
}

let client: TypeSafeClient | undefined;

export function getTypeSafeClient() {
  if (!isTypeSafeConfigured()) {
    throw new Error("TYPESAFE_API_KEY is not set.");
  }
  if (!client) {
    client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY?.trim(),
      defaultModel: getTypeSafeModel(),
      logLevel: "warn",
    });
  }
  return client;
}

/** Test-only: drop the lazy client after env changes. */
export function resetTypeSafeClientForTests() {
  client = undefined;
}
