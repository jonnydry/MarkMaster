/**
 * Orbit Map Web Worker — Message Protocol
 *
 * Strongly-typed, versioned protocol for bidirectional communication between:
 *   - Main thread (React components, DOM event listeners, OrbitMapCanvas)
 *   - Web Worker (OffscreenCanvas rendering, d3-force or custom layout simulation,
 *     hit-testing, camera management, animations, visibility filtering)
 *
 * Design goals:
 * - OffscreenCanvas transferred exactly once on INIT (high-perf zero-copy drawing)
 * - Graph data (OrbitGraphPayload) transferred via structured clone on load/update
 * - High-frequency input (pointer, wheel, touch) forwarded with minimal overhead
 * - Discrete commands: focusOn, resetView, animateAssign, zoom, pan, filter etc.
 * - Worker owns authoritative CameraState, node positions, hover/selection hit tests
 * - Transferables used aggressively: OffscreenCanvas + Float32Array for positions
 * - Fully versionable via PROTOCOL_VERSION (bump on breaking changes)
 * - Clean discriminated unions for excellent DX and exhaustiveness checking
 *
 * Usage (main thread):
 *   worker.postMessage(msg as WorkerMessage, transferList);
 *
 * Usage (worker):
 *   self.onmessage = (e) => { const msg = e.data as WorkerMessage; ... }
 *   self.postMessage(reply as MainMessage, transferList);
 *
 * @see src/components/orbit/orbit-map-canvas-host.tsx
 * @see types/index.ts for OrbitGraph* types
 */

import type { OrbitGraphPayload, OrbitGraphNode } from "@/types";

/* ------------------------------------------------------------------ */
/* Version & Message Type Constants                                   */
/* ------------------------------------------------------------------ */

export const PROTOCOL_VERSION = 1 as const;

export function getSafeDpr(value?: number): number {
  if (!value || !Number.isFinite(value) || value <= 0) return 1;
  return Math.min(value, 2);
}

const DPR_BAND_EPSILON = 0.001;

/**
 * Notify when `window.devicePixelRatio` changes — including fractional shifts that
 * keep the same clamped render DPR. Uses a tight resolution band (not a single
 * `(resolution: Xdppx)` query, which tracks min-resolution and misses in-band
 * changes) plus viewport resize fallbacks.
 */
export function subscribeToDevicePixelRatioChanges(
  onChange: () => void
): () => void {
  if (typeof window === "undefined") return () => {};

  let lastRawDpr = window.devicePixelRatio;
  let disposeBandListener: (() => void) | null = null;

  const syncAfterChange = () => {
    onChange();
    armResolutionBandListener();
  };

  const armResolutionBandListener = () => {
    disposeBandListener?.();
    disposeBandListener = null;

    if (typeof window.matchMedia !== "function") return;

    const raw = window.devicePixelRatio;
    if (!Number.isFinite(raw) || raw <= 0) return;

    const min = Math.max(0, raw - DPR_BAND_EPSILON);
    const max = raw + DPR_BAND_EPSILON;
    const mediaQuery = window.matchMedia(
      `(min-resolution: ${min}dppx) and (max-resolution: ${max}dppx)`
    );

    const handleBandChange = () => {
      const nextRaw = window.devicePixelRatio;
      if (nextRaw === lastRawDpr) return;
      lastRawDpr = nextRaw;
      syncAfterChange();
    };

    mediaQuery.addEventListener("change", handleBandChange);
    disposeBandListener = () =>
      mediaQuery.removeEventListener("change", handleBandChange);
  };

  const notifyIfRawChanged = () => {
    const raw = window.devicePixelRatio;
    if (raw === lastRawDpr) return;
    lastRawDpr = raw;
    syncAfterChange();
  };

  window.addEventListener("resize", notifyIfRawChanged);
  window.visualViewport?.addEventListener("resize", notifyIfRawChanged);

  armResolutionBandListener();

  return () => {
    disposeBandListener?.();
    window.removeEventListener("resize", notifyIfRawChanged);
    window.visualViewport?.removeEventListener("resize", notifyIfRawChanged);
  };
}

/**
 * Message types sent FROM main thread TO worker.
 * Use these constants instead of magic strings for type safety.
 */
export const WorkerMessageType = {
  // Lifecycle / setup
  INIT: "INIT",
  SET_GRAPH: "SET_GRAPH",
  RESIZE: "RESIZE",

  // High-frequency interaction events (pointer events + wheel + touch)
  POINTER_DOWN: "POINTER_DOWN",
  POINTER_MOVE: "POINTER_MOVE",
  POINTER_UP: "POINTER_UP",
  POINTER_LEAVE: "POINTER_LEAVE",
  WHEEL: "WHEEL",
  TOUCH_START: "TOUCH_START",
  TOUCH_MOVE: "TOUCH_MOVE",
  TOUCH_END: "TOUCH_END",
  DOUBLE_CLICK: "DOUBLE_CLICK",

  // Discrete camera / view controls (from buttons, keyboard arrows, +/-)
  PAN: "PAN",
  ZOOM: "ZOOM",

  // State synchronization from main (external selection from rail/URL/search, filter buttons)
  SET_FILTER: "SET_FILTER",
  SET_SELECTION: "SET_SELECTION",
  SET_CAMERA: "SET_CAMERA",
  SET_HIGHLIGHT: "SET_HIGHLIGHT",
  /** Live graph search — worker owns index + canvas highlight. */
  SET_SEARCH: "SET_SEARCH",

  // Imperative commands (exposed via OrbitMapCanvasHandle)
  FOCUS_ON: "FOCUS_ON",
  RESET_VIEW: "RESET_VIEW",
  ANIMATE_ASSIGN: "ANIMATE_ASSIGN",
  FOCUS_PULSE: "FOCUS_PULSE",
  SET_THEME: "SET_THEME",
  /** Page visibility — pauses the living-map motion loop while hidden. */
  SET_VISIBILITY: "SET_VISIBILITY",
  /** Play the radar sweep effect (optionally glinting specific nodes). */
  PLAY_SCAN_SWEEP: "PLAY_SCAN_SWEEP",

  // Lifecycle
  DESTROY: "DESTROY",

  // Optional future: request bulk data back
  REQUEST_LAYOUT: "REQUEST_LAYOUT",
} as const;

export type WorkerMessageType =
  (typeof WorkerMessageType)[keyof typeof WorkerMessageType];

/**
 * Message types sent FROM worker TO main thread.
 */
export const MainMessageType = {
  // Lifecycle
  READY: "READY",
  ERROR: "ERROR",

  // Derived state / events detected by worker (hit testing, simulation)
  SELECTION_CHANGED: "SELECTION_CHANGED",
  HOVER_CHANGED: "HOVER_CHANGED",
  CAMERA_CHANGED: "CAMERA_CHANGED",
  LAYOUT_UPDATED: "LAYOUT_UPDATED",
  CURSOR_CHANGED: "CURSOR_CHANGED",

  // Async command completion
  ANIMATE_ASSIGN_COMPLETE: "ANIMATE_ASSIGN_COMPLETE",

  // Side effects requested by worker (e.g. open bookmark on double-click)
  OPEN_BOOKMARK: "OPEN_BOOKMARK",

  /** Ranked dropdown matches for the current search query. */
  SEARCH_RESULTS: "SEARCH_RESULTS",

  // A bookmark node was dragged and dropped onto a tag/collection hub
  NODE_DROPPED: "NODE_DROPPED",
} as const;

export type MainMessageType =
  (typeof MainMessageType)[keyof typeof MainMessageType];

/* ------------------------------------------------------------------ */
/* Shared Helper Types                                                */
/* ------------------------------------------------------------------ */

export type GraphFilter = "all" | "loose" | "recent";

/**
 * Camera / view transform state. All values in world space + CSS pixels.
 * Origin of world is (0,0) at center of canvas when camera is at {x:0, y:0, zoom:1}.
 */
export interface CameraState {
  /** Horizontal pan offset (positive = world content moves right relative to view) */
  x: number;
  /** Vertical pan offset (positive = world content moves down) */
  y: number;
  /** Zoom scale factor (1.0 = 100%). Clamped between MIN_ZOOM and MAX_ZOOM in worker. */
  zoom: number;
}

/**
 * Selection / hover identity used throughout the Orbit map UI.
 * Matches the public API of OrbitMapCanvas.
 */
export interface OrbitMapSelection {
  kind: "tag" | "collection" | "bookmark" | "core" | "overflow";
  id: string;
}

/**
 * Focus payload used when a bookmark is predicted to belong to a particular anchor.
 */
export interface OrbitMapFocus {
  bookmarkId: string;
  predictedAnchorId: string;
}

/**
 * Touch point representation (identifier + CSS-pixel coordinates relative to canvas).
 */
export interface TouchPoint {
  identifier: number;
  x: number;
  y: number;
}

/**
 * Efficient bulk position transfer payload.
 * `positions` is a transferable Float32Array laid out as [x0, y0, x1, y1, ..., xN, yN].
 * Length must be exactly nodeIds.length * 2.
 */
export interface PositionTransfer {
  nodeIds: string[];
  positions: Float32Array;
}

/* ------------------------------------------------------------------ */
/* Worker-bound Messages (Main → Worker)                              */
/* ------------------------------------------------------------------ */

export interface InitMessage {
  type: typeof WorkerMessageType.INIT;
  protocolVersion: number;
  /** OffscreenCanvas instance. MUST be transferred via the second argument to postMessage. */
  canvas: OffscreenCanvas;
  /** CSS pixel dimensions of the canvas element */
  width: number;
  height: number;
  /** Device pixel ratio (for backing store + crisp text/lines) */
  dpr: number;
  /** Optional camera to restore (e.g. from a saved view) */
  initialCamera?: CameraState;
  /** Development-only internal timing logs; ignored by production builds. */
  debugPerf?: boolean;
  /** App color mode — drives canvas background and label contrast. */
  colorMode?: "light" | "dark";
  /** Active accent hex (e.g. "#2563eb") read from `--primary`. */
  accentHex?: string;
  /** Canvas clear color from `--background`. */
  backgroundHex?: string;
  /** Active color theme id (e.g. "ember") for atmosphere refresh. */
  colorTheme?: string;
  /**
   * Enables the living map: analytic orbital motion, sun corona. On by
   * default; host-side gated on the `orbit-map-living` localStorage opt-out
   * and `prefers-reduced-motion`.
   */
  livingMap?: boolean;
}

export interface SetGraphMessage {
  type: typeof WorkerMessageType.SET_GRAPH;
  protocolVersion: number;
  /**
   * Full graph payload. The worker derives node/link data and computes a
   * deterministic cluster layout — no persisted positions are needed.
   */
  graph: OrbitGraphPayload;
}

export interface ResizeMessage {
  type: typeof WorkerMessageType.RESIZE;
  protocolVersion: number;
  width: number;
  height: number;
  dpr?: number;
}

// --- Pointer Events (mouse/pen) — coordinates are CSS pixels relative to canvas top-left ---
export interface PointerDownMessage {
  type: typeof WorkerMessageType.POINTER_DOWN;
  protocolVersion: number;
  x: number;
  y: number;
  button: number; // 0 = primary, 2 = secondary, etc.
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export interface PointerMoveMessage {
  type: typeof WorkerMessageType.POINTER_MOVE;
  protocolVersion: number;
  x: number;
  y: number;
  /** Buttons bitmask (1=left, 4=right, etc.) */
  buttons: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface PointerUpMessage {
  type: typeof WorkerMessageType.POINTER_UP;
  protocolVersion: number;
  x: number;
  y: number;
  button: number;
}

export interface PointerLeaveMessage {
  type: typeof WorkerMessageType.POINTER_LEAVE;
  protocolVersion: number;
}

export interface WheelMessage {
  type: typeof WorkerMessageType.WHEEL;
  protocolVersion: number;
  deltaY: number;
  /** Cursor position in CSS pixels relative to canvas top-left */
  x: number;
  y: number;
  ctrlKey?: boolean;
}

// --- Touch Events (for pan + pinch-zoom) ---
export interface TouchStartMessage {
  type: typeof WorkerMessageType.TOUCH_START;
  protocolVersion: number;
  touches: TouchPoint[];
  changedTouches: TouchPoint[];
}

export interface TouchMoveMessage {
  type: typeof WorkerMessageType.TOUCH_MOVE;
  protocolVersion: number;
  touches: TouchPoint[];
  changedTouches: TouchPoint[];
}

export interface TouchEndMessage {
  type: typeof WorkerMessageType.TOUCH_END;
  protocolVersion: number;
  touches: TouchPoint[];
  changedTouches: TouchPoint[];
}

export interface DoubleClickMessage {
  type: typeof WorkerMessageType.DOUBLE_CLICK;
  protocolVersion: number;
  /** CSS pixels relative to canvas */
  x: number;
  y: number;
}

// --- View manipulation (from zoom buttons, keyboard, etc.) ---
export interface PanMessage {
  type: typeof WorkerMessageType.PAN;
  protocolVersion: number;
  /** Delta in canvas CSS pixels. Camera pan is screen-space, so the worker applies it directly. */
  dx: number;
  dy: number;
}

export interface ZoomMessage {
  type: typeof WorkerMessageType.ZOOM;
  protocolVersion: number;
  /** Multiplicative zoom factor (e.g. 1.25 to zoom in, 0.8 to zoom out) */
  factor: number;
  /** Optional focal point in canvas CSS pixels. If omitted, zooms toward canvas center. */
  focalX?: number;
  focalY?: number;
}

// --- State sync ---
export interface SetFilterMessage {
  type: typeof WorkerMessageType.SET_FILTER;
  protocolVersion: number;
  filter: GraphFilter;
}

export interface SetSelectionMessage {
  type: typeof WorkerMessageType.SET_SELECTION;
  protocolVersion: number;
  selection: OrbitMapSelection | null;
}

export interface SetCameraMessage {
  type: typeof WorkerMessageType.SET_CAMERA;
  protocolVersion: number;
  camera: CameraState;
}

/**
 * Highlights a set of nodes (e.g. live search matches) by dimming everything
 * else. Pass null to clear.
 */
export interface SetHighlightMessage {
  type: typeof WorkerMessageType.SET_HIGHLIGHT;
  protocolVersion: number;
  nodeIds: string[] | null;
}

export interface SetSearchMessage {
  type: typeof WorkerMessageType.SET_SEARCH;
  protocolVersion: number;
  /** Lowercased, trimmed query from the main thread. Empty clears search. */
  query: string;
}

// --- High-level commands (from OrbitMapCanvasHandle and search/rail) ---
export interface FocusOnMessage {
  type: typeof WorkerMessageType.FOCUS_ON;
  protocolVersion: number;
  selection: OrbitMapSelection;
}

export interface ResetViewMessage {
  type: typeof WorkerMessageType.RESET_VIEW;
  protocolVersion: number;
}

export interface AnimateAssignMessage {
  type: typeof WorkerMessageType.ANIMATE_ASSIGN;
  protocolVersion: number;
  bookmarkId: string;
  anchorId: string;
  duration?: number;
  /** Correlates with ANIMATE_ASSIGN_COMPLETE response for promise resolution */
  requestId?: string;
}

export interface RequestLayoutMessage {
  type: typeof WorkerMessageType.REQUEST_LAYOUT;
  protocolVersion: number;
}

export interface DestroyMessage {
  type: typeof WorkerMessageType.DESTROY;
  protocolVersion: number;
}

export interface FocusPulseMessage {
  type: typeof WorkerMessageType.FOCUS_PULSE;
  protocolVersion: number;
  nodeId: string;
  duration?: number;
}

export interface SetThemeMessage {
  type: typeof WorkerMessageType.SET_THEME;
  protocolVersion: number;
  colorMode: "light" | "dark";
  /** Active accent hex (e.g. "#2563eb") read from `--primary`. */
  accentHex?: string;
  /** Canvas clear color from `--background`. */
  backgroundHex?: string;
  /** Active color theme id (e.g. "ember") for atmosphere refresh. */
  colorTheme?: string;
}

export interface SetVisibilityMessage {
  type: typeof WorkerMessageType.SET_VISIBILITY;
  protocolVersion: number;
  visible: boolean;
}

/**
 * Plays a radar sweep across the sky: a beam rotates once around the core
 * and the given nodes glint as it passes them (all bookmarks when omitted).
 * Used by scan/triage flows to visualize the AI pass over the library.
 */
export interface PlayScanSweepMessage {
  type: typeof WorkerMessageType.PLAY_SCAN_SWEEP;
  protocolVersion: number;
  nodeIds?: string[] | null;
}

export type WorkerMessage =
  | InitMessage
  | SetGraphMessage
  | ResizeMessage
  | PointerDownMessage
  | PointerMoveMessage
  | PointerUpMessage
  | PointerLeaveMessage
  | WheelMessage
  | TouchStartMessage
  | TouchMoveMessage
  | TouchEndMessage
  | DoubleClickMessage
  | PanMessage
  | ZoomMessage
  | SetFilterMessage
  | SetSelectionMessage
  | SetCameraMessage
  | SetHighlightMessage
  | SetSearchMessage
  | FocusOnMessage
  | ResetViewMessage
  | AnimateAssignMessage
  | RequestLayoutMessage
  | DestroyMessage
  | FocusPulseMessage
  | SetThemeMessage
  | SetVisibilityMessage
  | PlayScanSweepMessage;

// Grouped unions for handler typing
export type CameraControlMessage =
  | PanMessage
  | ZoomMessage
  | SetCameraMessage;

export type PointerEventMessage =
  | PointerDownMessage
  | PointerMoveMessage
  | PointerUpMessage
  | PointerLeaveMessage;

/* ------------------------------------------------------------------ */
/* Main-bound Messages (Worker → Main)                                */
/* ------------------------------------------------------------------ */

export interface ReadyMessage {
  type: typeof MainMessageType.READY;
  protocolVersion: number;
  width: number;
  height: number;
}

export interface ErrorMessage {
  type: typeof MainMessageType.ERROR;
  protocolVersion: number;
  message: string;
  stack?: string;
}

export interface SelectionChangedMessage {
  type: typeof MainMessageType.SELECTION_CHANGED;
  protocolVersion: number;
  selection: OrbitMapSelection | null;
}

export interface HoverChangedMessage {
  type: typeof MainMessageType.HOVER_CHANGED;
  protocolVersion: number;
  selection: OrbitMapSelection | null;
  /**
   * Canvas-local CSS pixel coordinates of the hovered node (from top-left of canvas container).
   * Main thread uses these directly for absolute positioning of the bookmark hover card
   * overlay inside the relative container. Only present for bookmark hovers.
   */
  canvasX?: number;
  canvasY?: number;
}

export interface CameraChangedMessage {
  type: typeof MainMessageType.CAMERA_CHANGED;
  protocolVersion: number;
  camera: CameraState;
}

/**
 * Bulk layout / position update from worker (e.g. after simulation tick or stabilization).
 * `positions` Float32Array MUST be transferred (zero-copy).
 */
export interface LayoutUpdatedMessage {
  type: typeof MainMessageType.LAYOUT_UPDATED;
  protocolVersion: number;
  nodeIds: string[];
  /** Transfer this array — do not copy! Interleaved [x0,y0, x1,y1, ...] */
  positions: Float32Array;
  /** True when force simulation has cooled down / stabilized */
  stabilized?: boolean;
  /** Current filter that was used for this layout snapshot */
  filter?: GraphFilter;
}

export interface CursorChangedMessage {
  type: typeof MainMessageType.CURSOR_CHANGED;
  protocolVersion: number;
  cursor: "default" | "grab" | "grabbing" | "pointer";
}

export interface AnimateAssignCompleteMessage {
  type: typeof MainMessageType.ANIMATE_ASSIGN_COMPLETE;
  protocolVersion: number;
  bookmarkId: string;
  /** Matches requestId from the original ANIMATE_ASSIGN message, if provided */
  requestId?: string;
}

export interface OpenBookmarkMessage {
  type: typeof MainMessageType.OPEN_BOOKMARK;
  protocolVersion: number;
  bookmarkId: string;
}

/**
 * Emitted when the user drags a bookmark node onto a tag or collection hub.
 * The main thread performs the actual assignment (and offers undo).
 */
export interface NodeDroppedMessage {
  type: typeof MainMessageType.NODE_DROPPED;
  protocolVersion: number;
  bookmarkId: string;
  anchorId: string;
  anchorKind: "tag" | "collection";
}

export interface SearchResultsMessage {
  type: typeof MainMessageType.SEARCH_RESULTS;
  protocolVersion: number;
  /** Echo of the query this payload was computed for (stale-guard on main). */
  query: string;
  results: OrbitGraphNode[];
}

/** Union of all messages the worker may send to the main thread. */
export type MainMessage =
  | ReadyMessage
  | ErrorMessage
  | SelectionChangedMessage
  | HoverChangedMessage
  | CameraChangedMessage
  | LayoutUpdatedMessage
  | CursorChangedMessage
  | AnimateAssignCompleteMessage
  | OpenBookmarkMessage
  | NodeDroppedMessage
  | SearchResultsMessage;

/* ------------------------------------------------------------------ */
/* Utility Type Guards (optional but convenient)                      */
/* ------------------------------------------------------------------ */

type MessageRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MessageRecord {
  return typeof value === "object" && value !== null;
}

function hasProtocolVersion(msg: MessageRecord): msg is MessageRecord & { protocolVersion: number } {
  return "protocolVersion" in msg && typeof msg.protocolVersion === "number";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTouchPoint(value: unknown): value is TouchPoint {
  return (
    isRecord(value) &&
    isFiniteNumber(value.identifier) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  );
}

function isTouchPointArray(value: unknown): value is TouchPoint[] {
  return Array.isArray(value) && value.every(isTouchPoint);
}

function isCameraState(value: unknown): value is CameraState {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.zoom)
  );
}

function isOrbitMapSelection(value: unknown): value is OrbitMapSelection {
  return (
    isRecord(value) &&
    (value.kind === "tag" ||
      value.kind === "collection" ||
      value.kind === "bookmark" ||
      value.kind === "core" ||
      value.kind === "overflow") &&
    typeof value.id === "string"
  );
}

function isGraphFilter(value: unknown): value is GraphFilter {
  return value === "all" || value === "loose" || value === "recent";
}

function isColorMode(value: unknown): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

function hasObjectField(msg: MessageRecord, field: string): boolean {
  return isRecord(msg[field]);
}

function finiteNumberFieldError(msg: MessageRecord, field: string): string | null {
  return isFiniteNumber(msg[field]) ? null : `${String(msg.type)}.${field} must be a finite number`;
}

function optionalFiniteNumberFieldError(msg: MessageRecord, field: string): string | null {
  return msg[field] === undefined || isFiniteNumber(msg[field])
    ? null
    : `${String(msg.type)}.${field} must be a finite number when provided`;
}

function stringFieldError(msg: MessageRecord, field: string): string | null {
  return typeof msg[field] === "string" ? null : `${String(msg.type)}.${field} must be a string`;
}

function optionalStringFieldError(msg: MessageRecord, field: string): string | null {
  return msg[field] === undefined || typeof msg[field] === "string"
    ? null
    : `${String(msg.type)}.${field} must be a string when provided`;
}

function validatePointerMessage(msg: MessageRecord): string | null {
  if (msg.type === WorkerMessageType.POINTER_LEAVE) return null;
  return (
    finiteNumberFieldError(msg, "x") ??
    finiteNumberFieldError(msg, "y") ??
    (msg.type === WorkerMessageType.POINTER_MOVE
      ? finiteNumberFieldError(msg, "buttons")
      : finiteNumberFieldError(msg, "button"))
  );
}

export function getWorkerMessageValidationError(msg: unknown): string | null {
  if (!isRecord(msg)) return "Worker message must be an object";
  if (typeof msg.type !== "string") return "Worker message type must be a string";
  if (!hasProtocolVersion(msg)) return `${msg.type}.protocolVersion must be ${PROTOCOL_VERSION}`;
  if (msg.protocolVersion !== PROTOCOL_VERSION) {
    return `${msg.type}.protocolVersion ${msg.protocolVersion} is not supported`;
  }

  switch (msg.type) {
    case WorkerMessageType.INIT:
      return (
        ("canvas" in msg ? null : "INIT.canvas is required") ??
        finiteNumberFieldError(msg, "width") ??
        finiteNumberFieldError(msg, "height") ??
        finiteNumberFieldError(msg, "dpr") ??
        (msg.colorMode === undefined || isColorMode(msg.colorMode)
          ? null
          : "INIT.colorMode must be light or dark") ??
        optionalStringFieldError(msg, "accentHex") ??
        optionalStringFieldError(msg, "backgroundHex") ??
        optionalStringFieldError(msg, "colorTheme") ??
        (msg.livingMap === undefined || typeof msg.livingMap === "boolean"
          ? null
          : "INIT.livingMap must be a boolean when provided")
      );

    case WorkerMessageType.RESIZE:
      return (
        finiteNumberFieldError(msg, "width") ??
        finiteNumberFieldError(msg, "height") ??
        optionalFiniteNumberFieldError(msg, "dpr")
      );

    case WorkerMessageType.SET_GRAPH:
      return hasObjectField(msg, "graph") ? null : "SET_GRAPH.graph must be an object";

    case WorkerMessageType.POINTER_DOWN:
    case WorkerMessageType.POINTER_MOVE:
    case WorkerMessageType.POINTER_UP:
    case WorkerMessageType.POINTER_LEAVE:
      return validatePointerMessage(msg);

    case WorkerMessageType.WHEEL:
      return (
        finiteNumberFieldError(msg, "deltaY") ??
        finiteNumberFieldError(msg, "x") ??
        finiteNumberFieldError(msg, "y")
      );

    case WorkerMessageType.TOUCH_START:
    case WorkerMessageType.TOUCH_MOVE:
    case WorkerMessageType.TOUCH_END:
      return isTouchPointArray(msg.touches) && isTouchPointArray(msg.changedTouches)
        ? null
        : `${msg.type}.touches and changedTouches must be touch point arrays`;

    case WorkerMessageType.DOUBLE_CLICK:
      return finiteNumberFieldError(msg, "x") ?? finiteNumberFieldError(msg, "y");

    case WorkerMessageType.PAN:
      return finiteNumberFieldError(msg, "dx") ?? finiteNumberFieldError(msg, "dy");

    case WorkerMessageType.ZOOM:
      return (
        finiteNumberFieldError(msg, "factor") ??
        optionalFiniteNumberFieldError(msg, "focalX") ??
        optionalFiniteNumberFieldError(msg, "focalY")
      );

    case WorkerMessageType.SET_FILTER:
      return isGraphFilter(msg.filter) ? null : "SET_FILTER.filter must be all, loose, or recent";

    case WorkerMessageType.SET_SELECTION:
      return msg.selection === null || isOrbitMapSelection(msg.selection)
        ? null
        : "SET_SELECTION.selection must be a selection or null";

    case WorkerMessageType.SET_CAMERA:
      return isCameraState(msg.camera) ? null : "SET_CAMERA.camera must be a camera state";

    case WorkerMessageType.SET_HIGHLIGHT:
      return msg.nodeIds === null || isStringArray(msg.nodeIds)
        ? null
        : "SET_HIGHLIGHT.nodeIds must be a string array or null";

    case WorkerMessageType.SET_SEARCH:
      return stringFieldError(msg, "query");

    case WorkerMessageType.FOCUS_ON:
      return isOrbitMapSelection(msg.selection) ? null : "FOCUS_ON.selection must be a selection";

    case WorkerMessageType.RESET_VIEW:
    case WorkerMessageType.REQUEST_LAYOUT:
    case WorkerMessageType.DESTROY:
      return null;

    case WorkerMessageType.ANIMATE_ASSIGN:
      return (
        stringFieldError(msg, "bookmarkId") ??
        stringFieldError(msg, "anchorId") ??
        optionalFiniteNumberFieldError(msg, "duration") ??
        optionalStringFieldError(msg, "requestId")
      );

    case WorkerMessageType.FOCUS_PULSE:
      return stringFieldError(msg, "nodeId") ?? optionalFiniteNumberFieldError(msg, "duration");

    case WorkerMessageType.SET_THEME:
      return (
        (isColorMode(msg.colorMode) ? null : "SET_THEME.colorMode must be light or dark") ??
        optionalStringFieldError(msg, "accentHex") ??
        optionalStringFieldError(msg, "backgroundHex") ??
        optionalStringFieldError(msg, "colorTheme")
      );

    case WorkerMessageType.SET_VISIBILITY:
      return typeof msg.visible === "boolean"
        ? null
        : "SET_VISIBILITY.visible must be a boolean";

    case WorkerMessageType.PLAY_SCAN_SWEEP:
      return msg.nodeIds === undefined ||
        msg.nodeIds === null ||
        isStringArray(msg.nodeIds)
        ? null
        : "PLAY_SCAN_SWEEP.nodeIds must be a string array or null";

    default:
      return `Unknown worker message type: ${msg.type}`;
  }
}

export function isWorkerMessage(msg: unknown): msg is WorkerMessage {
  return getWorkerMessageValidationError(msg) === null;
}

export function isMainMessage(msg: unknown): msg is MainMessage {
  return (
    isRecord(msg) &&
    "type" in msg &&
    hasProtocolVersion(msg) &&
    msg.protocolVersion === PROTOCOL_VERSION
  );
}

// Convenience narrowing helpers (use with discriminated unions)
export function isInitMessage(msg: WorkerMessage): msg is InitMessage {
  return msg.type === WorkerMessageType.INIT;
}

export function isSetGraphMessage(msg: WorkerMessage): msg is SetGraphMessage {
  return msg.type === WorkerMessageType.SET_GRAPH;
}

export function isLayoutUpdatedMessage(msg: MainMessage): msg is LayoutUpdatedMessage {
  return msg.type === MainMessageType.LAYOUT_UPDATED;
}

// ... (additional narrowers can be added by consumers as needed)

/**
 * Example transfer list builder for messages containing transferables.
 * Usage:
 *   const transfer: Transferable[] = [];
 *   if (isInitMessage(msg)) transfer.push(msg.canvas);
 *   if (isLayoutUpdatedMessage(msg)) transfer.push(msg.positions);
 *   worker.postMessage(msg, transfer);
 */
export function collectTransferables(msg: WorkerMessage | MainMessage): Transferable[] {
  const list: Transferable[] = [];
  if ("canvas" in msg && msg.canvas instanceof OffscreenCanvas) {
    list.push(msg.canvas);
  }
  if ("positions" in msg && msg.positions instanceof Float32Array) {
    list.push(msg.positions.buffer);
  }
  return list;
}

export type { OrbitGraphPayload, OrbitGraphNode } from "@/types";
