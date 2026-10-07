/**
 * Shared vitest setup. DOM-only stubs are gated on `document` so node-env
 * tests are unaffected.
 */
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  await import("@testing-library/jest-dom/vitest");

  afterEach(() => {
    cleanup();
  });

  // Node 25+ defines its own global `localStorage`, which is undefined unless
  // Node runs with --localstorage-file, and it shadows jsdom's. Restore
  // jsdom's storage; on older Node (CI's 20.x) this is a no-op.
  const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
  if (typeof window.localStorage === "undefined" && jsdomWindow?.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: jsdomWindow.localStorage,
    });
  }

  // Browser APIs base-ui relies on that jsdom doesn't ship.
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (typeof Element.prototype.scrollIntoView === "undefined") {
    Element.prototype.scrollIntoView = () => {};
  }
}
