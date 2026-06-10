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

import type { OrbitGraphPayload } from "@/types";

/* ------------------------------------------------------------------ */
/* Version & Message Type Constants                                   */
/* ------------------------------------------------------------------ */

export const PROTOCOL_VERSION = 1 as const;

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

  // Imperative commands (exposed via OrbitMapCanvasHandle)
  FOCUS_ON: "FOCUS_ON",
  RESET_VIEW: "RESET_VIEW",
  ANIMATE_ASSIGN: "ANIMATE_ASSIGN",
  FOCUS_PULSE: "FOCUS_PULSE",

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
}

export interface SetGraphMessage {
  type: typeof WorkerMessageType.SET_GRAPH;
  protocolVersion: number;
  /** Full graph payload. Worker will derive internal node/link data structures. */
  graph: OrbitGraphPayload;
  /**
   * Optional persisted node positions (from localStorage or previous LAYOUT_UPDATED).
   * Keys are node ids; values are world coordinates. Worker should prefer these
   * over seeded random positions for layout stability across reloads.
   */
  initialPositions?: Record<string, { x: number; y: number }>;
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

/** Union of all messages the main thread may send to the worker. */
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
  | FocusOnMessage
  | ResetViewMessage
  | AnimateAssignMessage
  | RequestLayoutMessage
  | DestroyMessage
  | FocusPulseMessage;

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
  | NodeDroppedMessage;

/* ------------------------------------------------------------------ */
/* Utility Type Guards (optional but convenient)                      */
/* ------------------------------------------------------------------ */

function hasProtocolVersion(msg: object): msg is { protocolVersion: number } {
  return "protocolVersion" in msg && typeof msg.protocolVersion === "number";
}

export function isWorkerMessage(msg: unknown): msg is WorkerMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    hasProtocolVersion(msg) &&
    msg.protocolVersion === PROTOCOL_VERSION
  );
}

export function isMainMessage(msg: unknown): msg is MainMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
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
