"use client";

import type { ReactNode } from "react";

// Mirror sonner's toast API without importing sonner in the main bundle.
// The actual sonner module is loaded on the first toast call; the <Toaster />
// component is mounted lazily by the same signal.

type ToastMessage = string | ReactNode;
type ToastOptions = Record<string, unknown>;

interface SonnerToastApi {
  success: (message: ToastMessage, options?: ToastOptions) => string | number;
  error: (message: ToastMessage, options?: ToastOptions) => string | number;
  info: (message: ToastMessage, options?: ToastOptions) => string | number;
  warning: (message: ToastMessage, options?: ToastOptions) => string | number;
  message: (message: ToastMessage, options?: ToastOptions) => string | number;
  loading: (message: ToastMessage, options?: ToastOptions) => string | number;
  promise: <T>(
    promise: Promise<T>,
    msgs: Record<string, ToastMessage>,
    options?: ToastOptions
  ) => Promise<T>;
  custom: (jsx: (id: string | number) => ReactNode, options?: ToastOptions) => string | number;
  dismiss: (toastId?: string | number) => void;
}

interface QueuedCall {
  method: keyof SonnerToastApi;
  args: unknown[];
}

let sonnerApi: SonnerToastApi | null = null;
const queue: QueuedCall[] = [];
let loadPromise: Promise<SonnerToastApi> | null = null;
let hasRequestedMount = false;

export const mountListeners = new Set<() => void>();

function requestMount() {
  if (!hasRequestedMount) {
    hasRequestedMount = true;
    mountListeners.forEach((cb) => cb());
  }
}

async function loadSonner(): Promise<SonnerToastApi> {
  if (sonnerApi) return sonnerApi;
  if (loadPromise) return loadPromise;

  loadPromise = import("sonner").then((mod) => {
    sonnerApi = mod.toast as unknown as SonnerToastApi;
    // Flush any calls that arrived before sonner loaded.
    while (queue.length > 0) {
      const call = queue.shift();
      if (!call) continue;
      const fn = sonnerApi[call.method];
      if (typeof fn === "function") {
        (fn as (...args: unknown[]) => unknown).apply(sonnerApi, call.args);
      }
    }
    return sonnerApi;
  });

  return loadPromise;
}

function proxyMethod<K extends keyof SonnerToastApi>(method: K): SonnerToastApi[K] {
  return ((...args: unknown[]) => {
    requestMount();

    if (sonnerApi) {
      const fn = sonnerApi[method];
      return (fn as (...args: unknown[]) => unknown).apply(sonnerApi, args);
    }

    queue.push({ method, args });
    void loadSonner();
    return undefined;
  }) as SonnerToastApi[K];
}

export const toast: SonnerToastApi = {
  success: proxyMethod("success"),
  error: proxyMethod("error"),
  info: proxyMethod("info"),
  warning: proxyMethod("warning"),
  message: proxyMethod("message"),
  loading: proxyMethod("loading"),
  promise: proxyMethod("promise"),
  custom: proxyMethod("custom"),
  dismiss: proxyMethod("dismiss"),
};
