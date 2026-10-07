/// <reference lib="webworker" />

/**
 * Orbit Map Web Worker
 *
 * Owns the entire visualization for maximum performance:
 * - Deterministic cluster layout (orbit-map-cluster-layout)
 * - Level-of-detail rendering with cluster halos (orbit-map-lod)
 * - Screen-space label decluttering (orbit-map-labels)
 * - PixiJS v8 rendering via OffscreenCanvas
 * - Hit testing, camera (incl. fly-to-frame), filters, animations
 *
 * The main thread only handles React state and forwards DOM events.
 */

import {
  Application,
  DOMAdapter,
  WebWorkerAdapter,
} from '@/lib/pixi-imports';

// Must be called before any other Pixi imports/usage in the worker
DOMAdapter.set(WebWorkerAdapter);

import {
  type WorkerMessage,
  type MainMessage,
  MainMessageType,
  WorkerMessageType,
  type InitMessage,
  type ResizeMessage,
  type SetGraphMessage,
  type SetFilterMessage,
  type CameraControlMessage,
  type PointerEventMessage,
  type AnimateAssignMessage,
  type FocusPulseMessage,
  type SetThemeMessage,
  type SetVisibilityMessage,
  type SetLivingMapMessage,
  type SetReplayMessage,
  type PlayScanSweepMessage,
  type FocusOnMessage,
  type SetSelectionMessage,
  type SetHighlightMessage,
  type SetSearchMessage,
  type WheelMessage,
  type DoubleClickMessage,
  type LayoutUpdatedMessage,
  type CameraState,
  collectTransferables,
  getSafeDpr,
  getHotPathWorkerMessageError,
  getWorkerMessageValidationError,
  isHotPathWorkerMessageType,
} from '@/lib/orbit-worker-protocol';

import { getTagOrbitGeometry, TAG_MARK_DIM_ALPHA } from '@/lib/tag-mark';
import type { OrbitGraphPayload, OrbitGraphNode } from '@/types';
import type { GraphFilter, OrbitMapSelection } from '@/lib/orbit-worker-protocol';
import {
  buildOrbitMapSearchIndex,
  searchOrbitMapIndex,
  type OrbitMapSearchIndexEntry,
} from '@/lib/orbit-map-search';
import {
  getOrbitMapPalette,
  type OrbitMapColorMode,
} from '@/lib/orbit-map-palette';
import { buildOrbitMapStructureKey } from '@/lib/orbit-map-structure-key';
import {
  Container,
  Graphics,
  Sprite,
  Texture,
  BitmapFont,
  BitmapFontManager,
  BitmapText,
} from '@/lib/pixi-imports';
import {
  clampOrbitMapZoom,
  constrainOrbitMapCameraState,
  getOrbitMapFitZoom,
  getOrbitMapFrameCameraState,
  getOrbitMapGraphBounds,
  type OrbitMapGraphBounds,
} from './orbit-map-camera';
import {
  computeOrbitMapClusterLayout,
  type OrbitMapCluster,
} from './orbit-map-cluster-layout';
import {
  getOrbitMapBookmarkLodAlpha,
  getOrbitMapClusterHaloAlpha,
  getOrbitMapViewBounds,
  isInOrbitMapViewBounds,
  ORBIT_MAP_LOD_FAR_MAX_ZOOM,
} from './orbit-map-lod';
import {
  declutterOrbitMapLabels,
  estimateOrbitMapLabelBox,
  getOrbitMapLabelPriority,
  getOrbitMapLabelScreenSize,
  ORBIT_MAP_LABEL_CELL_SIZE,
  type OrbitMapLabelCandidate,
} from './orbit-map-labels';
import { createOrbitMapSpatialIndex } from './orbit-map-hit-test';
import { createOrbitMapInteractions } from './orbit-map-interactions';
import { createOrbitMapPerfLogger } from './orbit-map-perf';
import {
  getOrbitMapNodeRadius,
  getOrbitMapNodeVisualStyle,
  getOrbitMapLabelText,
  shouldShowOrbitMapLabel,
  mixOrbitMapColors,
  type OrbitMapNodeVisualStyle,
} from './orbit-map-rendering';
import {
  easeOrbitMapOutCubic,
  getOrbitMapAnimationProgress,
} from './orbit-map-animation';
import {
  createOrbitMapDiscGlowTexture,
  hashOrbitMapStringToSeed,
} from './orbit-map-scene';
import { createOrbitMapLivingRuntime } from './orbit-map-living-runtime';
import { createOrbitMapScanSweep } from './orbit-map-scan-sweep';

/** Internal node type: original graph node + layout position + visuals. */
interface MapNode {
  id: string;
  kind: OrbitGraphNode['kind'];
  node: OrbitGraphNode;
  x: number;
  y: number;
  radius: number;
  visual: OrbitMapNodeVisualStyle;
  /** 0-based importance rank among hubs (by count); top hubs win label cells. */
  labelRank?: number;
  /** Per-node delay (ms) for the one-shot entrance fade-in. */
  entranceDelay?: number;
  scale?: number; // temporary scale during animations (e.g. flying node)
  /** Disc this bookmark orbits (its first tag/collection, or the core). */
  homeId?: string | null;
  /** Hubs: 0–1 share of recent saving (last 30 days); drives glow + Motion. */
  activity?: number;
}

/** Pre-resolved edge for rendering (loose edges are excluded). */
interface MapLink {
  source: MapNode;
  target: MapNode;
  kind: string;
  color: number;
}

// Basic Pixi Application instance (created on INIT)
let app: Application | null = null;
let isInitialized = false;
let destroyed = false;

// Current graph data and filter (stored in worker)
let currentGraph: OrbitGraphPayload | null = null;
let currentFilter: GraphFilter = 'all';
let perf = createOrbitMapPerfLogger(false);

// Pixi containers for organization (creation order = z-order)
let linksContainer: Container | null = null;      // Selection wash + relationship hairlines
let glowContainer: Container | null = null;       // Faint per-disc glows (camera space)
let nodesContainer: Container | null = null;
let ringsContainer: Container | null = null;      // Selection / neighbor highlight rings
let labelsContainer: Container | null = null;
let effectsContainer: Container | null = null;    // Temporary effects (pulses, flights)
let linkGraphics: Graphics | null = null;
let ringGraphics: Graphics | null = null;
// Pooled effect layers, cleared per frame instead of destroyed/recreated so
// animation frames don't churn Pixi objects (GC + GPU geometry pressure).
let effectsGraphics: Graphics | null = null;         // pulses, flight paths, ghosts
let effectsAdditiveGraphics: Graphics | null = null; // comet trails, scan sweep
let glowTexture: Texture | null = null;
const glowSpriteMap = new Map<string, Sprite>();

// One-shot entrance fade-in (per worker lifetime, i.e. per page visit)
let hasPlayedEntrance = false;
let entranceStartedAt: number | null = null;
const ENTRANCE_NODE_FADE_MS = 380;
const ENTRANCE_MAX_DELAY_MS = 420;
const ENTRANCE_BASE_DELAY_MS = 180;
const ENTRANCE_TOTAL_MS =
  ENTRANCE_BASE_DELAY_MS + ENTRANCE_MAX_DELAY_MS + ENTRANCE_NODE_FADE_MS;
/** Faint resting glow per disc, plus how much recent saving adds to it. */
const DISC_GLOW_BASE = { dark: 0.1, light: 0.1 };
const DISC_GLOW_ACTIVITY = { dark: 0.2, light: 0.16 };
/** Extra glow at far zoom, where the disc's dots have faded out. */
const DISC_GLOW_FAR_BOOST = 0.7;
/** Days a save counts as recent activity for a disc. */
const ACTIVITY_WINDOW_DAYS = 30;
/** Duration of the hairline trace-in after a selection lands. */
const EDGE_REVEAL_MS = 340;
/** Ambient frames (living motion, scan sweep) cap at ~30fps. */
const AMBIENT_FRAME_MIN_MS = 32;
/** Nodes scale from this factor to 1 during the entrance fade. */
const ENTRANCE_SCALE_START = 0.62;
/** Instant scale applied to the hovered node (no selection active). */
const HOVER_POP_SCALE = 1.06;

// === Arrivals + radar sweep ===
/** Max new bookmarks that spiral in on a refetch; more than this reads as
 * navigation (scope switch, first load, big import), not arrivals. */
const ARRIVAL_MAX = 12;
/** Stagger between consecutive arrivals. */
const ARRIVAL_STAGGER_MS = 260;
/** Arrival spiral duration (before per-arrival jitter). */
const ARRIVAL_DURATION_MS = 1600;
/** Turns (radians) an arrival makes around its disc while spiralling in. */
const ARRIVAL_TURNS = Math.PI * 1.15;
/** An arrival batch at least this big also plays the radar sweep. */
const SWEEP_ARRIVAL_THRESHOLD = 3;
/** Filing flight duration. */
const ASSIGN_FLIGHT_MS = 640;
/** Screen px a related bookmark leans toward a selected hub (Motion on). */
const SELECTION_LEAN_PX = 7;

// === Replay ===
/** Replay cutoff (days ago); bookmarks saved more recently are hidden. */
let replayCutoffDays: number | null = null;
/** Per disc: how many of its dots are visible at the current cutoff. */
const replayVisibleByHome = new Map<string, number>();
/** Days over which a bookmark fades in as the replay cutoff passes it. */
const REPLAY_FADE_DAYS = 8;
// Labels: names / handles / "+N", plus a count beside each hub name.
const labelMap = new Map<string, BitmapText>();
const countLabelMap = new Map<string, BitmapText>();
/** Hub names: semibold, foreground ink, canvas-coloured halo baked in. */
const LABEL_FONT = 'OrbitLabel';
/** Handles, counts and "+N": medium weight, muted, same halo. */
const LABEL_FONT_MUTED = 'OrbitLabelMuted';
/** Bitmap fonts installed so far (uninstalling a missing one warns). */
const installedLabelFonts = new Set<string>();
/** Geist, once the host hands us its URL; system UI until then. */
const LABEL_FONT_FAMILY = 'OrbitGeist';
const LABEL_FONT_STACK = `${LABEL_FONT_FAMILY}, system-ui, -apple-system, "Segoe UI", sans-serif`;
/** Screen gap between a disc's outer ring and its name. */
const HUB_LABEL_GAP_PX = 6;
/** Screen gap between a hub name and its count. */
const HUB_COUNT_GAP_PX = 5;

// Graph scene data (positions come from the deterministic cluster layout)
let nodeData: MapNode[] = [];
let nodeById = new Map<string, MapNode>();
let linkData: MapLink[] = [];
let clusters = new Map<string, OrbitMapCluster>();
/** Nodes currently visible under filter + LOD (the hit-testable set). */
let hitTestNodes: MapNode[] = [];
const hitIndex = createOrbitMapSpatialIndex<MapNode>();
/** Set when living motion moved dots since the last index rebuild. */
let hitIndexDirty = false;

// Camera state (position + zoom)
let camera = { x: 0, y: 0, zoom: 1 };
/** Bumped to cancel any in-flight camera animation. */
let cameraAnimationToken = 0;
/** Scope the camera was last auto-fitted for (preserved across refetches). */
let lastFittedScope: string | null = null;
/** True after the user pans, zooms, or flies to a cluster — skip resize refit. */
let cameraUserAdjusted = false;

// Simple map from node id to its Pixi Graphics object
const nodeGraphicsMap = new Map<string, Graphics>();

// Current selection for visual feedback (hover lives in `interactions`)
let currentSelection: OrbitMapSelection | null = null;

// Live search-match highlight (null = inactive). Non-members are dimmed.
let highlightedNodeIds: Set<string> | null = null;
let searchIndex: OrbitMapSearchIndexEntry[] = [];
let activeSearchQuery = '';
let lastStructureKey = '';

// Adjacency map for efficient neighbor highlighting
const adjacency = new Map<string, Set<string>>();

const LABEL_ZOOM_THRESHOLD = 0.6;
const LABEL_BASE_FONT_SIZE = 18;
const LABEL_MIN_WORLD_SCALE = 0.16;
const LABEL_MAX_WORLD_SCALE = 2.35;
let colorMode: OrbitMapColorMode = 'dark';
let accentHex: string | undefined;
let backgroundHex: string | undefined;
let colorThemeId: string | undefined;
const MIN_CAMERA_ZOOM = 0.12;
const MAX_CAMERA_ZOOM = 1.85;
const CAMERA_FRAME_PADDING = 72;
const CAMERA_NODE_PADDING = 18;
const MAX_FIT_ZOOM = 1.75;
/** Below this canvas width the initial view frames the queue, not everything. */
const PHONE_FIT_MAX_WIDTH = 640;
const PHONE_FIT_ZOOM_BOOST = 2;
/** Max zoom used when fly-to-framing a cluster (keeps small clusters comfy). */
const CLUSTER_FRAME_MAX_ZOOM = 1.25;
/** Minimum zoom after focusing an individual bookmark. */
const BOOKMARK_FOCUS_ZOOM = 1.05;
const WHEEL_DELTA_CAP = 90;
const WHEEL_ZOOM_SENSITIVITY = 0.00055;
const VIEW_CULL_MARGIN = 0.3;

// === Animation System (runs in worker) ===
interface MapAnimation {
  id: string;
  /**
   * assign — filing flight to the chosen disc; arrive — a new save spiralling
   * into its ring; return — a dropped node gliding home; pulse — ring pulse.
   */
  type: 'assign' | 'pulse' | 'return' | 'arrive';
  nodeId: string;
  startTime: number;
  duration: number;
  targetX?: number;
  targetY?: number;
  fromX?: number;
  fromY?: number;
  /** Quadratic control point for curved assign flights. */
  controlX?: number;
  controlY?: number;
  /** Hub that pulses when the animation lands. */
  anchorId?: string;
  /** Arrival spiral, in polar coordinates around its disc centre. */
  spiral?: {
    centerX: number;
    centerY: number;
    fromRadius: number;
    toRadius: number;
    fromAngle: number;
    toAngle: number;
  };
}

const activeAnimations: MapAnimation[] = [];
let renderLoopRunning = false;
/** Transient render-frame failures tolerated before the loop gives up. */
const MAX_CONSECUTIVE_FRAME_ERRORS = 30;
let consecutiveFrameErrors = 0;

/** Start of the in-flight edge trace-in (null once complete). */
let edgeRevealStartedAt: number | null = null;
/** Timestamp of the last ambient frame (30fps cap). */
let lastAmbientFrameAt = 0;

// === Cosmic event state ===
/** Bookmark ids present in the previous graph payload (meteor detection). */
let knownBookmarkIds: Set<string> | null = null;
/** Scope of the previous graph payload (scope switches don't rain meteors). */
let lastGraphScope: string | null = null;
/**
 * Central selection setter: a changed selection restarts the edge trace-in;
 * clearing the selection cancels it.
 */
function setCurrentSelectionState(selection: OrbitMapSelection | null) {
  const previousId = currentSelection?.id ?? null;
  currentSelection = selection;
  if (!selection) {
    edgeRevealStartedAt = null;
  } else if (selection.id !== previousId) {
    edgeRevealStartedAt = Date.now();
  }
}

function isEdgeRevealActive() {
  return edgeRevealStartedAt !== null;
}

/**
 * Palette objects are cached per theme: getPalette() is called from hot paths
 * (drawLinks, updateLabels run per frame) and allocating a fresh palette on
 * every call churns the GC for no reason. Invalidated whenever the theme
 * inputs change (INIT / SET_THEME).
 */
let cachedPalette: ReturnType<typeof getOrbitMapPalette> | null = null;

function invalidatePaletteCache() {
  cachedPalette = null;
}

function getPalette() {
  cachedPalette ??= getOrbitMapPalette(colorMode, accentHex, backgroundHex);
  return cachedPalette;
}

/**
 * Glows read as luminous on the space-black canvas via additive blending;
 * on the light canvas additive washes out, so fall back to normal.
 */
function getAdditiveBlendMode(): 'add' | 'normal' {
  return colorMode === 'light' ? 'normal' : 'add';
}

/** Point on a quadratic Bézier (per axis): a → control c → b at t. */
function getQuadraticPoint(a: number, c: number, b: number, t: number) {
  const inv = 1 - t;
  return inv * inv * a + 2 * inv * t * c + t * t * b;
}

/** Resting glow for a disc: faint, a little brighter with recent saves. */
function getHubGlowAlpha(datum: MapNode) {
  const mode = colorMode === 'light' ? 'light' : 'dark';
  return DISC_GLOW_BASE[mode] + DISC_GLOW_ACTIVITY[mode] * (datum.activity ?? 0);
}

/**
 * Two bitmap fonts with the halo baked in: glyphs are drawn in the label
 * colour with a stroke in the canvas colour, so names stay legible over dots
 * and lines without per-label backgrounds. Reinstalled on theme change (the
 * colours are baked) and once Geist has loaded in the worker.
 */
function ensureOrbitLabelFont() {
  const palette = getPalette();
  const resolution = Math.min(2, Math.max(1, app?.renderer.resolution ?? 1));
  const fonts = [
    { name: LABEL_FONT, fontWeight: '600', fill: palette.labelDefault },
    { name: LABEL_FONT_MUTED, fontWeight: '500', fill: palette.neutral },
  ] as const;
  for (const font of fonts) {
    if (installedLabelFonts.has(font.name)) {
      try {
        BitmapFont.uninstall(font.name);
      } catch {
        // Partial init.
      }
    }
    installedLabelFonts.add(font.name);
    BitmapFont.install({
      name: font.name,
      style: {
        fontFamily: LABEL_FONT_STACK,
        fontSize: LABEL_BASE_FONT_SIZE,
        fontWeight: font.fontWeight,
        fill: font.fill,
        stroke: { color: palette.background, width: 5, join: 'round' },
      },
      chars: BitmapFontManager.ASCII,
      resolution,
    });
  }
}

/** Loads Geist into the worker so labels match the app's type. */
async function loadLabelFont(url: string) {
  try {
    const face = new FontFace(LABEL_FONT_FAMILY, `url("${url}")`, {
      weight: '100 900',
      style: 'normal',
    });
    await face.load();
    self.fonts.add(face);
    if (!app || destroyed) return;
    ensureOrbitLabelFont();
    resetLabelPool();
    updateNodeStyles();
  } catch (error) {
    console.warn('[OrbitWorker] Label font unavailable; using system UI.', error);
  }
}

function resetLabelPool() {
  if (!labelsContainer) return;
  for (const pool of [labelMap, countLabelMap]) {
    for (const label of pool.values()) {
      labelsContainer.removeChild(label);
      label.destroy();
    }
    pool.clear();
  }
}

/** Send a message back to the main thread. */
function postToMain(msg: MainMessage, transfer: Transferable[] = []) {
  // Worker postMessage typing can be finicky across bundlers; use a narrow assertion
  (self as unknown as { postMessage: (message: MainMessage, transfer?: Transferable[]) => void })
    .postMessage(msg, transfer);
}

function postCameraChanged() {
  postToMain({
    type: MainMessageType.CAMERA_CHANGED,
    protocolVersion: 1,
    camera: { ...camera },
  });
}

let cameraRefreshRaf: number | null = null;
let wheelRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastCameraPostAt = 0;
const CAMERA_POST_MIN_MS = 66;

function postCameraChangedThrottled() {
  const now = Date.now();
  if (now - lastCameraPostAt < CAMERA_POST_MIN_MS) return;
  lastCameraPostAt = now;
  postCameraChanged();
}

function cancelScheduledCameraRefresh() {
  if (cameraRefreshRaf !== null) {
    cancelAnimationFrame(cameraRefreshRaf);
    cameraRefreshRaf = null;
  }
}

function refreshCameraDuringGesture() {
  if (!app) return;
  applyCameraTransform();
  app.renderer.render(app.stage);
  // This render just presented the stage; stamp the capped-frame clock so
  // a concurrently running ambient/living loop doesn't render again in the
  // same display frame (pan gestures stay 60fps, total renders don't stack).
  lastAmbientFrameAt = Date.now();
  postCameraChangedThrottled();
}

function scheduleCameraRefresh() {
  if (cameraRefreshRaf !== null) return;
  cameraRefreshRaf = requestAnimationFrame(() => {
    cameraRefreshRaf = null;
    refreshCameraDuringGesture();
  });
}

function scheduleGestureEndRefresh() {
  if (wheelRefreshTimer !== null) {
    clearTimeout(wheelRefreshTimer);
  }
  wheelRefreshTimer = setTimeout(() => {
    wheelRefreshTimer = null;
    cancelScheduledCameraRefresh();
    updateNodeStyles();
    postCameraChanged();
  }, 150);
}

/**
 * Send current node positions to the main thread (minimap, bounds).
 * Uses transferable Float32Array for performance.
 */
function sendLayoutUpdate(stabilized = true) {
  if (!nodeData.length) return;

  const nodeIds: string[] = new Array(nodeData.length);
  const positions = new Float32Array(nodeData.length * 2);

  for (let i = 0; i < nodeData.length; i++) {
    const n = nodeData[i];
    nodeIds[i] = n.id;
    positions[i * 2] = n.x;
    positions[i * 2 + 1] = n.y;
  }

  const msg: LayoutUpdatedMessage = {
    type: MainMessageType.LAYOUT_UPDATED,
    protocolVersion: 1,
    nodeIds,
    positions,
    stabilized,
    filter: currentFilter,
  };

  postToMain(msg, collectTransferables(msg));
}

function removeAnimationsFor(nodeId: string, type: MapAnimation['type']) {
  for (let i = activeAnimations.length - 1; i >= 0; i--) {
    if (activeAnimations[i].nodeId === nodeId && activeAnimations[i].type === type) {
      activeAnimations.splice(i, 1);
    }
  }
}

function pushPulse(nodeId: string, duration = 420) {
  removeAnimationsFor(nodeId, 'pulse');
  activeAnimations.push({
    id: `pulse-${nodeId}-${Date.now()}`,
    type: 'pulse',
    nodeId,
    startTime: Date.now(),
    duration,
  });
  startRenderLoop();
}

// Pointer interaction state machine (hover, selection clicks, panning,
// node dragging, drag-to-assign) — see orbit-map-interactions.ts.
const interactions = createOrbitMapInteractions<MapNode>({
  hasScene: () => Boolean(app && currentGraph && nodeData.length > 0),
  getNodeData: () => hitTestNodes,
  findHit: (point, padding) => {
    // Living frames move dots without a full style pass; re-index on demand.
    if (hitIndexDirty) {
      hitIndex.rebuild(hitTestNodes);
      hitIndexDirty = false;
    }
    return hitIndex.query(point, padding);
  },
  getNodeById: () => nodeById,
  getCamera: () => camera,
  panBy: (dx, dy) => {
    cancelCameraAnimation();
    cameraUserAdjusted = true;
    camera.x += dx;
    camera.y += dy;
    constrainCamera();
    scheduleCameraRefresh();
  },
  getSelection: () => currentSelection,
  setSelection: (selection) => {
    setCurrentSelectionState(selection);
    updateNodeStyles();
    postToMain({
      type: MainMessageType.SELECTION_CHANGED,
      protocolVersion: 1,
      selection,
    });
    // Clicking a hub flies the camera to frame its whole cluster.
    if (selection && (selection.kind === 'tag' || selection.kind === 'collection')) {
      frameSelection(selection);
    }
  },
  refreshNodeStyles: () => updateNodeStyles(),
  postToMain: (msg) => postToMain(msg),
  returnNodeTo: (nodeId, x, y) => {
    const datum = nodeById.get(nodeId);
    if (!datum) return;
    removeAnimationsFor(nodeId, 'return');
    activeAnimations.push({
      id: `return-${nodeId}-${Date.now()}`,
      type: 'return',
      nodeId,
      startTime: Date.now(),
      duration: 320,
      fromX: datum.x,
      fromY: datum.y,
      targetX: x,
      targetY: y,
    });
    startRenderLoop();
  },
  pulseNode: (nodeId) => pushPulse(nodeId),
  // Synced X folders are read-only, and re-dropping onto a hub the bookmark
  // already orbits would be a no-op whose "Undo" removes the real link.
  canDropOnto: (bookmarkId, hub) =>
    !(hub.node.kind === 'collection' && hub.node.variant === 'x_folder') &&
    !(adjacency.get(bookmarkId)?.has(hub.id) ?? false),
});

const living = createOrbitMapLivingRuntime({
  getNodeById: () => nodeById,
  getNodeData: () => nodeData,
  getDraggingNodeId: () => interactions.getDraggingNodeId(),
  getAnimatedNodeIds: () =>
    activeAnimations.length > 0
      ? new Set(activeAnimations.map((anim) => anim.nodeId))
      : null,
  hasApp: () => app !== null,
});

/** Disc activity lookup for the orrery (0 = still). */
const hubActivityOf = (anchorId: string) => nodeById.get(anchorId)?.activity ?? 0;

const sweep = createOrbitMapScanSweep({
  getNodeById: () => nodeById,
  getNodeData: () => nodeData,
  getGraphBounds,
  getMeteorLanding: (nodeId) => {
    for (const anim of activeAnimations) {
      if (anim.type === 'arrive' && anim.nodeId === nodeId && anim.spiral) {
        return getSpiralPoint(anim.spiral, 1);
      }
    }
    return null;
  },
  onStart: () => startRenderLoop(),
});

function isLivingActive() {
  return living.isActive();
}

function isSweepActive() {
  return sweep.isActive();
}

/** Handle incoming messages from the main thread. */
function handleMessage(event: MessageEvent<unknown>) {
  const raw = event.data;
  const rawType =
    raw && typeof raw === "object" && "type" in raw && typeof raw.type === "string"
      ? raw.type
      : null;
  const validationError = rawType && isHotPathWorkerMessageType(rawType)
    ? getHotPathWorkerMessageError(raw)
    : getWorkerMessageValidationError(raw);
  if (validationError) {
    postToMain({
      type: MainMessageType.ERROR,
      protocolVersion: 1,
      message: `Invalid worker message: ${validationError}`,
    });
    return;
  }

  const msg = event.data as WorkerMessage;

  if (destroyed) {
    postToMain({
      type: MainMessageType.ERROR,
      protocolVersion: 1,
      message: `Worker has been destroyed; ignoring ${msg.type}`,
    });
    return;
  }

  switch (msg.type) {
    case WorkerMessageType.INIT:
      handleInit(msg as InitMessage);
      break;

    case WorkerMessageType.RESIZE:
      handleResize(msg as ResizeMessage);
      break;

    case WorkerMessageType.SET_GRAPH:
      handleSetGraph(msg as SetGraphMessage);
      break;

    case WorkerMessageType.SET_FILTER:
      handleSetFilter(msg as SetFilterMessage);
      break;

    case WorkerMessageType.PAN:
    case WorkerMessageType.ZOOM:
    case WorkerMessageType.SET_CAMERA:
      handleCameraMessage(msg as CameraControlMessage);
      break;

    // Pointer events for hit-testing (hover + selection)
    case WorkerMessageType.POINTER_MOVE:
    case WorkerMessageType.POINTER_DOWN:
    case WorkerMessageType.POINTER_UP:
    case WorkerMessageType.POINTER_LEAVE:
      interactions.handlePointerEvent(msg as PointerEventMessage);
      break;

    case WorkerMessageType.ANIMATE_ASSIGN:
      handleAnimateAssign(msg as AnimateAssignMessage);
      break;

    case WorkerMessageType.FOCUS_PULSE:
      handleFocusPulse(msg as FocusPulseMessage);
      break;

    case WorkerMessageType.FOCUS_ON:
      handleFocusOn(msg as FocusOnMessage);
      break;

    case WorkerMessageType.SET_SELECTION:
      handleSetSelection(msg as SetSelectionMessage);
      break;

    case WorkerMessageType.SET_HIGHLIGHT: {
      const highlightMsg = msg as SetHighlightMessage;
      highlightedNodeIds = highlightMsg.nodeIds
        ? new Set(highlightMsg.nodeIds)
        : null;
      updateNodeStyles();
      break;
    }

    case WorkerMessageType.SET_SEARCH:
      handleSetSearch(msg as SetSearchMessage);
      break;

    case WorkerMessageType.RESET_VIEW:
      handleResetView();
      break;

    case WorkerMessageType.WHEEL:
      handleWheel(msg as WheelMessage);
      break;

    case WorkerMessageType.DOUBLE_CLICK:
      handleDoubleClick(msg as DoubleClickMessage);
      break;

    case WorkerMessageType.REQUEST_LAYOUT:
      sendLayoutUpdate(true);
      break;

    case WorkerMessageType.SET_THEME:
      handleSetTheme(msg as SetThemeMessage);
      break;

    case WorkerMessageType.SET_VISIBILITY:
      handleSetVisibility(msg as SetVisibilityMessage);
      break;

    case WorkerMessageType.SET_LIVING_MAP:
      handleSetLivingMap(msg as SetLivingMapMessage);
      break;

    case WorkerMessageType.SET_REPLAY:
      handleSetReplay(msg as SetReplayMessage);
      break;

    case WorkerMessageType.PLAY_SCAN_SWEEP:
      sweep.start((msg as PlayScanSweepMessage).nodeIds);
      break;

    case WorkerMessageType.DESTROY:
      handleDestroy();
      break;

    default:
      console.warn('[OrbitWorker] Unhandled message type:', msg.type);
  }
}

function handleInit(msg: InitMessage) {
  if (isInitialized) {
    console.warn('[OrbitWorker] Already initialized');
    return;
  }

  destroyed = false;
  colorMode = msg.colorMode ?? 'dark';
  accentHex = msg.accentHex;
  backgroundHex = msg.backgroundHex;
  colorThemeId = msg.colorTheme;
  invalidatePaletteCache();
  living.setEnabled(Boolean(msg.livingMap));
  const palette = getPalette();

  try {
    perf = createOrbitMapPerfLogger(Boolean(msg.debugPerf));
    const initStartedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    perf.mark('worker:init:start');

    app = new Application();

    app.init({
      canvas: msg.canvas,
      width: msg.width,
      height: msg.height,
      resolution: getSafeDpr(msg.dpr),
      antialias: true,
      backgroundColor: palette.background,
      autoDensity: true,
      // The worker only needs WebGL; skip the WebGPU auto-detect branch.
      preference: 'webgl',
    }).then(() => {
      isInitialized = true;
      const initMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
          initStartedAt
      );
      perf.mark('worker:init:ready', { initMs });

      // Bitmap fonts for fast labels; Geist swaps in once it has loaded.
      ensureOrbitLabelFont();
      if (msg.labelFontUrl) void loadLabelFont(msg.labelFontUrl);

      // Rendering is driven on demand (interactions, animations, camera).
      postToMain({ type: MainMessageType.READY, protocolVersion: 1, width: 0, height: 0 });
    }).catch((err) => {
      postToMain({
        type: MainMessageType.ERROR,
        protocolVersion: 1,
        message: 'Failed to initialize Pixi Application: ' + String(err),
        fatal: true,
      });
    });
  } catch (err) {
    postToMain({
      type: MainMessageType.ERROR,
      protocolVersion: 1,
      message: 'Worker initialization failed: ' + String(err),
      fatal: true,
    });
  }
}

function handleResize(msg: ResizeMessage) {
  if (!app || !isInitialized) return;

  if (msg.dpr !== undefined) {
    app.renderer.resolution = getSafeDpr(msg.dpr);
  }
  app.renderer.resize(msg.width, msg.height);
  // Overview stays framed when the canvas shrinks (e.g. 390px). Once the
  // user has panned or zoomed, only constrain so their view isn't yanked.
  if (currentGraph && nodeData.length > 0 && !cameraUserAdjusted) {
    autoFitCamera(msg.width, msg.height);
  } else {
    constrainCamera();
  }
  updateNodeStyles();
  postCameraChanged();
}

function handleSetVisibility(msg: SetVisibilityMessage) {
  if (living.isPageVisible() === msg.visible) return;
  living.setPageVisible(msg.visible);
  if (msg.visible) {
    // Orbits are pure functions of wall-clock time, so after a long hidden
    // stretch the sky simply resumes at its current configuration — like a
    // real sky. One style pass re-culls and restarts the loop.
    living.advanceOrbits(Date.now());
    updateNodeStyles();
  }
  // When hidden, the loop's continue-condition goes false and it winds down.
}

function handleSetLivingMap(msg: SetLivingMapMessage) {
  if (living.isEnabled() === msg.enabled) return;
  living.setEnabled(msg.enabled);
  if (msg.enabled) startRenderLoop();
  updateNodeStyles();
}

function handleSetTheme(msg: SetThemeMessage) {
  if (
    msg.colorMode === colorMode &&
    msg.accentHex === accentHex &&
    msg.backgroundHex === backgroundHex &&
    msg.colorTheme === colorThemeId
  ) {
    return;
  }
  colorMode = msg.colorMode;
  accentHex = msg.accentHex;
  backgroundHex = msg.backgroundHex;
  colorThemeId = msg.colorTheme;
  invalidatePaletteCache();
  applyColorMode();
}

function applyColorMode() {
  const palette = getPalette();
  if (app) {
    app.renderer.background.color = palette.background;
  }
  ensureOrbitLabelFont();
  resetLabelPool();
  const blendMode = getAdditiveBlendMode();
  for (const glow of glowSpriteMap.values()) glow.blendMode = blendMode;
  if (effectsAdditiveGraphics) effectsAdditiveGraphics.blendMode = blendMode;
  if (currentGraph) {
    reapplyAllNodeVisuals();
    rebuildLinkDataFromGraph();
  }
  updateNodeStyles();
  if (app) {
    app.renderer.render(app.stage);
  }
}

function reapplyAllNodeVisuals() {
  const palette = getPalette();
  for (const datum of nodeData) {
    datum.visual = getOrbitMapNodeVisualStyle(datum.node, palette);
  }
  applyBookmarkAccentColors();
  for (const datum of nodeData) {
    redrawNodeGraphics(datum);
  }
}

function handleSetGraph(msg: SetGraphMessage) {
  const previousBookmarkIds = knownBookmarkIds;
  const previousScope = lastGraphScope;

  currentGraph = msg.graph;
  searchIndex = buildOrbitMapSearchIndex(msg.graph.nodes);
  buildAdjacencyMap();

  const structureKey = buildOrbitMapStructureKey(msg.graph);
  const canUpdateInPlace =
    structureKey === lastStructureKey && nodeData.length > 0 && isInitialized;

  if (canUpdateInPlace) {
    updateSceneMetadata();
  } else {
    rebuildScene();
    lastStructureKey = structureKey;
    launchArrivals(previousBookmarkIds, previousScope);
  }

  knownBookmarkIds = new Set(
    msg.graph.nodes
      .filter((node) => node.kind === 'bookmark')
      .map((node) => node.id)
  );
  lastGraphScope = msg.graph.scope ?? 'library';

  if (replayCutoffDays !== null) recomputeReplayCounts();
  applyActiveSearch();
}

/**
 * New bookmarks in a refetched graph spiral in from beyond the map and settle
 * onto their ring (new saves land on the queue's innermost, newest ring).
 * Guarded so navigation moments (first graph, scope switch, bulk changes) stay
 * quiet: this fires for genuine arrivals — e.g. a sync landing while the map
 * is open.
 */
function launchArrivals(
  previousBookmarkIds: Set<string> | null,
  previousScope: string | null
) {
  if (!previousBookmarkIds || previousBookmarkIds.size === 0) return;
  if (!currentGraph || nodeData.length === 0) return;
  if ((currentGraph.scope ?? 'library') !== previousScope) return;

  const arrivals: MapNode[] = [];
  for (const datum of nodeData) {
    if (datum.kind !== 'bookmark') continue;
    if (previousBookmarkIds.has(datum.id)) continue;
    // Exceeding the cap means this is a bulk change — stay quiet entirely
    // rather than animating a token few while the rest pop in place.
    if (arrivals.length >= ARRIVAL_MAX) return;
    arrivals.push(datum);
  }
  if (arrivals.length === 0) return;

  const bounds = getGraphBounds();
  const entryDistance = bounds
    ? Math.max(
        Math.abs(bounds.minX),
        Math.abs(bounds.maxX),
        Math.abs(bounds.minY),
        Math.abs(bounds.maxY)
      ) + 360
    : 1600;

  const now = Date.now();
  arrivals.forEach((datum, index) => {
    const home = datum.homeId ? clusters.get(datum.homeId) : undefined;
    const centerX = home?.x ?? 0;
    const centerY = home?.y ?? 0;
    const toRadius = Math.hypot(datum.x - centerX, datum.y - centerY);
    const toAngle = Math.atan2(datum.y - centerY, datum.x - centerX);
    const seed = hashOrbitMapStringToSeed(datum.id);
    const direction = seed % 2 === 0 ? 1 : -1;
    const turns = ARRIVAL_TURNS + ((seed % 1000) / 1000) * 0.6;
    const spiral = {
      centerX,
      centerY,
      fromRadius: Math.max(toRadius, entryDistance - Math.hypot(centerX, centerY)),
      toRadius,
      fromAngle: toAngle - direction * turns,
      toAngle,
    };

    removeAnimationsFor(datum.id, 'arrive');
    // Park the node at its entry point until its (staggered) launch.
    const start = getSpiralPoint(spiral, 0);
    datum.x = start.x;
    datum.y = start.y;
    activeAnimations.push({
      id: `arrive-${datum.id}-${now}`,
      type: 'arrive',
      nodeId: datum.id,
      startTime: now + index * ARRIVAL_STAGGER_MS,
      duration: ARRIVAL_DURATION_MS + (seed % 400),
      anchorId: datum.homeId ?? undefined,
      spiral,
    });
  });

  if (arrivals.length >= SWEEP_ARRIVAL_THRESHOLD) {
    sweep.start(arrivals.map((datum) => datum.id));
  }
  startRenderLoop();
}

/** Point on an arrival spiral: fast from far out, slowing as it's captured. */
function getSpiralPoint(spiral: NonNullable<MapAnimation['spiral']>, progress: number) {
  const eased = easeOrbitMapOutCubic(Math.min(1, Math.max(0, progress)));
  const radius =
    spiral.toRadius + (spiral.fromRadius - spiral.toRadius) * Math.pow(1 - eased, 1.4);
  const angle = spiral.fromAngle + (spiral.toAngle - spiral.fromAngle) * eased;
  return {
    x: spiral.centerX + Math.cos(angle) * radius,
    y: spiral.centerY + Math.sin(angle) * radius,
  };
}

/* ============================================================
   REPLAY (the library growing, month by month)
   ============================================================ */

function handleSetReplay(msg: SetReplayMessage) {
  replayCutoffDays = msg.cutoffDays;
  recomputeReplayCounts();
  updateNodeStyles();
}

function recomputeReplayCounts() {
  replayVisibleByHome.clear();
  if (replayCutoffDays === null) return;
  for (const datum of nodeData) {
    if (datum.node.kind !== 'bookmark' || !datum.homeId) continue;
    if (getReplayFactor(datum) > 0) {
      replayVisibleByHome.set(datum.homeId, (replayVisibleByHome.get(datum.homeId) ?? 0) + 1);
    }
  }
}

/** 0–1 visibility of a node at the current replay cutoff (1 when off). */
function getReplayFactor(datum: MapNode): number {
  if (replayCutoffDays === null) return 1;
  const node = datum.node;
  if (node.kind === 'bookmark') {
    if (node.ageDays === undefined) return 1;
    return Math.min(1, Math.max(0, (node.ageDays - replayCutoffDays) / REPLAY_FADE_DAYS));
  }
  if (node.kind === 'overflow') return 0;
  if (node.kind === 'core') return 1;
  // Homes appear once they hold anything at this point in time.
  return (replayVisibleByHome.get(datum.id) ?? 0) > 0 ? 1 : 0;
}

function handleSetSearch(msg: SetSearchMessage) {
  activeSearchQuery = msg.query.trim().toLowerCase();
  applyActiveSearch();
}

function applyActiveSearch() {
  if (!activeSearchQuery) {
    highlightedNodeIds = null;
    updateNodeStyles();
    postToMain({
      type: MainMessageType.SEARCH_RESULTS,
      protocolVersion: 1,
      query: '',
      resultIds: [],
    });
    return;
  }

  const { results, highlightNodeIds } = searchOrbitMapIndex(
    searchIndex,
    activeSearchQuery
  );
  highlightedNodeIds =
    highlightNodeIds.length > 0 ? new Set(highlightNodeIds) : new Set();
  updateNodeStyles();
  postToMain({
    type: MainMessageType.SEARCH_RESULTS,
    protocolVersion: 1,
    query: activeSearchQuery,
    resultIds: results.map((node) => node.id),
  });
}

function buildAdjacencyMap() {
  adjacency.clear();
  focusNeighborCache = null;
  if (!currentGraph) return;

  currentGraph.edges.forEach((edge) => {
    if (edge.kind === 'bookmark-tag') {
      addEdge(edge.bookmarkId, edge.tagId);
      addEdge(edge.tagId, edge.bookmarkId);
    } else if (edge.kind === 'bookmark-collection') {
      addEdge(edge.bookmarkId, edge.collectionId);
      addEdge(edge.collectionId, edge.bookmarkId);
    } else if (edge.kind === 'overflow') {
      addEdge(edge.overflowId, edge.anchorId);
      addEdge(edge.anchorId, edge.overflowId);
    }
  });
}

function addEdge(a: string, b: string) {
  if (!adjacency.has(a)) adjacency.set(a, new Set());
  adjacency.get(a)!.add(b);
}

/**
 * Filters are pure visibility toggles — the layout never changes, so the
 * mental map survives switching between All / Loose / Recent.
 */
function handleSetFilter(msg: SetFilterMessage) {
  const nextFilter = msg.filter as GraphFilter;
  if (currentFilter === nextFilter) return;
  currentFilter = nextFilter;
  updateNodeStyles();
}

function matchesFilter(datum: MapNode): boolean {
  if (currentFilter === 'all') return true;
  if (datum.node.kind !== 'bookmark') return true;
  if (currentFilter === 'recent') return datum.node.recent;
  return !datum.node.affiliated;
}

function destroyContainerChildren(container: Container | null) {
  if (!container) return;
  for (const child of container.removeChildren()) {
    child.destroy({ children: true });
  }
}

function destroyGlowForNode(nodeId: string) {
  const glow = glowSpriteMap.get(nodeId);
  if (!glow) return;
  glow.parent?.removeChild(glow);
  glow.destroy({ texture: false, textureSource: false });
  glowSpriteMap.delete(nodeId);
}

/** Faint glow filling a hub's whole disc, in the hub's colour. */
function createGlowForNode(datum: MapNode) {
  if (!glowTexture || !glowContainer || glowSpriteMap.has(datum.id)) return;
  const glow = new Sprite(glowTexture);
  glow.anchor.set(0.5);
  glow.blendMode = getAdditiveBlendMode();
  glowContainer.addChild(glow);
  glowSpriteMap.set(datum.id, glow);
  layoutGlowForNode(datum);
}

function layoutGlowForNode(datum: MapNode) {
  const glow = glowSpriteMap.get(datum.id);
  if (!glow) return;
  const cluster = clusters.get(datum.id);
  const radius = (cluster?.radius ?? datum.radius * 3) + 22;
  glow.tint =
    datum.node.kind === 'collection' ? getPalette().neutral : datum.visual.color;
  glow.width = radius * 2;
  glow.height = radius * 2;
  glow.position.set(cluster?.x ?? datum.x, cluster?.y ?? datum.y);
  glow.alpha = getHubGlowAlpha(datum);
}

function handleDestroy() {
  destroyed = true;
  interactions.reset();
  cancelCameraAnimation();
  cancelScheduledCameraRefresh();
  if (wheelRefreshTimer !== null) {
    clearTimeout(wheelRefreshTimer);
    wheelRefreshTimer = null;
  }
  renderLoopRunning = false;
  activeAnimations.length = 0;

  destroyContainerChildren(effectsContainer);
  destroyContainerChildren(labelsContainer);
  destroyContainerChildren(ringsContainer);
  destroyContainerChildren(nodesContainer);
  destroyContainerChildren(glowContainer);
  destroyContainerChildren(linksContainer);

  for (const font of installedLabelFonts) {
    try {
      BitmapFont.uninstall(font);
    } catch {
      // Font may not have been installed if init failed midway.
    }
  }
  installedLabelFonts.clear();

  app?.destroy(false, {
    children: true,
    texture: true,
    textureSource: true,
    context: true,
  });

  currentGraph = null;
  nodeData = [];
  linkData = [];
  clusters.clear();
  hitTestNodes = [];
  hitIndex.rebuild([]);
  adjacency.clear();
  searchIndex = [];
  activeSearchQuery = '';
  lastStructureKey = '';
  highlightedNodeIds = null;
  currentSelection = null;
  lastFittedScope = null;
  cameraUserAdjusted = false;
  hasPlayedEntrance = false;
  entranceStartedAt = null;
  replayCutoffDays = null;
  replayVisibleByHome.clear();
  camera = { x: 0, y: 0, zoom: 1 };

  labelMap.clear();
  nodeGraphicsMap.clear();
  glowSpriteMap.clear();
  countLabelMap.clear();
  nodeById.clear();

  linksContainer = null;
  glowContainer = null;
  nodesContainer = null;
  ringsContainer = null;
  labelsContainer = null;
  effectsContainer = null;
  linkGraphics = null;
  ringGraphics = null;
  glowTexture = null;
  effectsGraphics = null;
  effectsAdditiveGraphics = null;
  living.reset();
  sweep.reset();
  edgeRevealStartedAt = null;
  knownBookmarkIds = null;
  lastGraphScope = null;
  app = null;
  isInitialized = false;
}

/* ============================================================
   SCENE CONSTRUCTION
   ============================================================ */

/** The canvas is a flat surface; only the shared glow texture is built. */
function buildBackground() {
  glowTexture = glowTexture ?? createOrbitMapDiscGlowTexture();
}

/**
 * Rebuilds the Pixi scene for a new graph payload. Positions come from the
 * deterministic cluster layout, so there is no ongoing simulation to manage.
 */
function rebuildScene() {
  if (!app || !currentGraph) return;
  const graphStartedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  // Clear scene
  destroyContainerChildren(linksContainer);
  if (glowContainer) {
    destroyContainerChildren(glowContainer);
    glowSpriteMap.clear();
  }
  destroyContainerChildren(nodesContainer);
  destroyContainerChildren(ringsContainer);
  if (labelsContainer) {
    destroyContainerChildren(labelsContainer);
    labelMap.clear();
    countLabelMap.clear();
  }
  destroyContainerChildren(effectsContainer);
  linkGraphics = null;
  ringGraphics = null;
  effectsGraphics = null;
  effectsAdditiveGraphics = null;
  nodeGraphicsMap.clear();
  nodeById.clear();
  activeAnimations.length = 0;

  // Container creation order defines z-order:
  // links → glow → nodes → rings → labels → effects
  if (!linksContainer) {
    linksContainer = new Container();
    app.stage.addChild(linksContainer);
  }
  if (!glowContainer) {
    glowContainer = new Container();
    app.stage.addChild(glowContainer);
  }
  if (!nodesContainer) {
    nodesContainer = new Container();
    app.stage.addChild(nodesContainer);
  }
  if (!ringsContainer) {
    ringsContainer = new Container();
    app.stage.addChild(ringsContainer);
  }
  buildBackground();
  if (!labelsContainer) {
    labelsContainer = new Container();
    app.stage.addChild(labelsContainer);
  }
  if (!effectsContainer) {
    effectsContainer = new Container();
    app.stage.addChild(effectsContainer);
  }

  const { nodes, edges } = currentGraph;
  perf.mark('graph:rebuild', { nodes: nodes.length, edges: edges.length });

  nodeData = nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    node,
    x: 0,
    y: 0,
    radius: getOrbitMapNodeRadius(node),
    visual: getOrbitMapNodeVisualStyle(node, getPalette()),
  }));

  // Deterministic two-phase layout: anchor constellation + bookmark orbits.
  const layout = computeOrbitMapClusterLayout(
    nodeData.map(({ id, kind, radius, node }) => ({
      id,
      kind,
      radius,
      recent: node.kind === 'bookmark' ? node.recent : false,
      age: node.kind === 'bookmark' ? node.ageDays : undefined,
    })),
    edges
  );
  clusters = layout.clusters;
  for (const datum of nodeData) {
    const position = layout.positions.get(datum.id);
    if (position) {
      datum.x = position.x;
      datum.y = position.y;
    }
    datum.homeId = layout.orbits.get(datum.id)?.anchorId ?? null;
  }

  nodeById = new Map(nodeData.map((datum) => [datum.id, datum]));
  applyHubLabelRanks();
  computeHubActivity();
  living.buildOrbitStates(layout.orbits, hubActivityOf);
  applyBookmarkAccentColors();
  interactions.resetSceneState();
  rebuildLinkDataFromGraph();

  buildScene();

  // Fit the camera once per scope; later refetches keep the user's view.
  const scopeKey = currentGraph.scope ?? 'library';
  if (lastFittedScope !== scopeKey) {
    autoFitCamera(app.renderer.width, app.renderer.height);
    lastFittedScope = scopeKey;
  } else {
    constrainCamera();
  }

  updateNodeStyles();
  postCameraChanged();

  // Schedule the one-shot entrance fade-in on the first graph of this visit.
  if (!hasPlayedEntrance && nodeData.length > 0) {
    hasPlayedEntrance = true;
    entranceStartedAt = Date.now();
    nodeData.forEach((datum, index) => {
      datum.entranceDelay = datum.visual.isHub
        ? 0
        : ENTRANCE_BASE_DELAY_MS + ((index * 7919) % ENTRANCE_MAX_DELAY_MS);
    });
    startRenderLoop();
  }

  sendLayoutUpdate(true);

  const firstRenderMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      graphStartedAt
  );
  perf.mark('graph:rebuild:ready', {
    firstRenderMs,
    visibleNodes: nodeData.length,
    visibleEdges: linkData.length,
  });
}

/**
 * Builds the persistent Pixi objects for the current graph: one Graphics per
 * node and one faint glow per disc. Per-frame updates mutate these instead of
 * recreating them.
 */
function buildScene() {
  if (
    !linksContainer ||
    !nodesContainer ||
    !ringsContainer ||
    !glowContainer ||
    !effectsContainer
  ) {
    return;
  }

  linkGraphics = new Graphics();
  linksContainer.addChild(linkGraphics);

  ringGraphics = new Graphics();
  ringsContainer.addChild(ringGraphics);

  effectsGraphics = new Graphics();
  effectsContainer.addChild(effectsGraphics);
  effectsAdditiveGraphics = new Graphics();
  effectsAdditiveGraphics.blendMode = getAdditiveBlendMode();
  effectsContainer.addChild(effectsAdditiveGraphics);

  for (const datum of nodeData) {
    const g = new Graphics();
    drawNodeShape(g, datum);

    g.position.set(datum.x, datum.y);
    nodesContainer.addChild(g);
    nodeGraphicsMap.set(datum.id, g);

    if (datum.visual.isHub) createGlowForNode(datum);
  }
}

/**
 * Share of each disc's bookmarks saved in the last 30 days, as 0–1. Quiet
 * discs rest at 0: a faint glow and, with Motion on, no rotation.
 */
function computeHubActivity() {
  const recentByHome = new Map<string, number>();
  for (const datum of nodeData) {
    if (datum.node.kind !== 'bookmark' || !datum.homeId) continue;
    const isRecent =
      datum.node.ageDays !== undefined
        ? datum.node.ageDays < ACTIVITY_WINDOW_DAYS
        : datum.node.recent;
    if (isRecent) {
      recentByHome.set(datum.homeId, (recentByHome.get(datum.homeId) ?? 0) + 1);
    }
  }
  for (const datum of nodeData) {
    if (!datum.visual.isHub) continue;
    const recent = recentByHome.get(datum.id) ?? 0;
    datum.activity = recent > 0 ? Math.min(1, 0.3 + recent / 14) : 0;
  }
}

function applyHubLabelRanks() {
  const hubDropTargets = nodeData.filter(
    (datum) => datum.kind === 'tag' || datum.kind === 'collection'
  );
  interactions.setHubDropTargets(hubDropTargets);

  const hubCount = (datum: MapNode) =>
    datum.node.kind === 'tag' || datum.node.kind === 'collection'
      ? datum.node.count
      : 0;
  [...hubDropTargets]
    .sort((a, b) => hubCount(b) - hubCount(a))
    .forEach((datum, rank) => {
      datum.labelRank = rank;
    });
  for (const datum of nodeData) {
    if (datum.kind === 'core') datum.labelRank = 0;
  }
}

/** Filed dots take a calm tint of their home tag; collection dots stay neutral. */
function applyBookmarkAccentColors() {
  const palette = getPalette();
  for (const datum of nodeData) {
    if (datum.node.kind !== 'bookmark' || !datum.node.affiliated) continue;
    const base = getOrbitMapNodeVisualStyle(datum.node, palette);
    const home = datum.homeId ? nodeById.get(datum.homeId) : undefined;
    if (!home || home.node.kind !== 'tag') {
      datum.visual = base;
      continue;
    }
    const color = mixOrbitMapColors(
      home.visual.color,
      base.color,
      colorMode === 'light' ? 0.18 : 0.3
    );
    datum.visual = { ...base, color, strokeColor: color };
  }
}

function rebuildLinkDataFromGraph() {
  if (!currentGraph) return;
  const palette = getPalette();
  linkData = [];
  for (const edge of currentGraph.edges) {
    if (edge.kind === 'loose') continue;
    const sourceId = 'bookmarkId' in edge ? edge.bookmarkId : edge.overflowId;
    const targetId =
      'tagId' in edge
        ? edge.tagId
        : 'collectionId' in edge
          ? edge.collectionId
          : edge.anchorId;
    const source = nodeById.get(sourceId);
    const target = nodeById.get(targetId);
    if (!source || !target) continue;
    linkData.push({
      source,
      target,
      kind: edge.kind,
      color:
        target.kind === 'tag' || target.kind === 'collection'
          ? target.visual.color
          : palette.linkFallback,
    });
  }
}

/**
 * Glyphs: tags are orbits in their colour (same trace as the UI), collections
 * are squares (X folders outlined, since they're read-only), the core is the
 * queue's accent ring. Filed bookmarks are filled dots; loose ones are hollow
 * rings. Each hub gets a knockout ring in the canvas colour so nearby dots
 * never touch it.
 */
function drawTagOrbit(g: Graphics, radius: number, color: number, name: string) {
  const mark = getTagOrbitGeometry(name, radius);
  g.circle(0, 0, mark.discRadius).fill({ color, alpha: TAG_MARK_DIM_ALPHA });
  g.arc(0, 0, mark.arcRadius, mark.start, mark.end).stroke({
    width: mark.arcWidth,
    color,
    cap: 'butt',
  });
  g.rect(mark.head.x, mark.head.y, mark.head.size, mark.head.size).fill({ color });
}

function drawNodeShape(g: Graphics, datum: MapNode) {
  g.clear();
  const { color, strokeWidth } = datum.visual;
  const background = getPalette().background;
  const r = datum.radius;
  const node = datum.node;

  switch (node.kind) {
    case 'tag':
      g.circle(0, 0, r + 3).fill({ color: background });
      drawTagOrbit(g, r, color, node.name);
      break;
    case 'collection': {
      g.circle(0, 0, r + 3).fill({ color: background });
      const half = r * 0.82;
      if (node.variant === 'x_folder') {
        g.roundRect(-half, -half, half * 2, half * 2, 2)
          .fill({ color: background })
          .stroke({ width: strokeWidth, color });
      } else {
        g.roundRect(-half, -half, half * 2, half * 2, 2).fill({ color });
      }
      break;
    }
    case 'core':
      g.circle(0, 0, r + 3).fill({ color: background });
      g.circle(0, 0, r).stroke({ width: strokeWidth, color });
      g.circle(0, 0, Math.max(3, r * 0.34)).fill({ color });
      break;
    case 'bookmark': {
      const dotRadius = r * (node.recent ? 0.7 : 0.62);
      if (node.affiliated) {
        g.circle(0, 0, dotRadius).fill({ color });
      } else {
        g.circle(0, 0, dotRadius - strokeWidth / 2).stroke({ width: strokeWidth, color });
      }
      break;
    }
    case 'overflow':
      // Drawn as "+N" text by the label layer.
      break;
  }
}

function redrawNodeGraphics(datum: MapNode) {
  const g = nodeGraphicsMap.get(datum.id);
  if (!g) return;

  drawNodeShape(g, datum);
  g.position.set(datum.x, datum.y);

  const glow = glowSpriteMap.get(datum.id);
  if (datum.visual.isHub) {
    if (!glow) createGlowForNode(datum);
    else layoutGlowForNode(datum);
  } else if (glow) {
    destroyGlowForNode(datum.id);
  }
}

/**
 * Preserves layout positions and Pixi objects when only node metadata changed
 * (titles, counts, colors, recency) but topology stayed the same. Visuals are
 * compared after home tints are applied, so an unchanged dot isn't redrawn
 * (and a tinted dot is never left drawn in its untinted base colour).
 */
function updateSceneMetadata() {
  if (!app || !currentGraph) return;

  perf.mark('graph:update-metadata', {
    nodes: currentGraph.nodes.length,
    edges: currentGraph.edges.length,
  });

  const previous = new Map<
    string,
    { radius: number; visual: OrbitMapNodeVisualStyle; node: OrbitGraphNode }
  >();
  for (const graphNode of currentGraph.nodes) {
    const datum = nodeById.get(graphNode.id);
    if (!datum) continue;
    previous.set(datum.id, { radius: datum.radius, visual: datum.visual, node: datum.node });
    datum.node = graphNode;
    datum.radius = getOrbitMapNodeRadius(graphNode);
    datum.visual = getOrbitMapNodeVisualStyle(graphNode, getPalette());
  }

  nodeData = currentGraph.nodes.map((node) => nodeById.get(node.id)!);
  applyHubLabelRanks();
  computeHubActivity();
  living.retune(hubActivityOf);
  applyBookmarkAccentColors();

  for (const datum of nodeData) {
    const before = previous.get(datum.id);
    const node = datum.node;
    const shapeChanged =
      !before ||
      before.radius !== datum.radius ||
      before.visual.color !== datum.visual.color ||
      before.visual.strokeColor !== datum.visual.strokeColor ||
      before.visual.strokeWidth !== datum.visual.strokeWidth ||
      before.visual.isHub !== datum.visual.isHub ||
      (node.kind === 'bookmark' &&
        before.node.kind === 'bookmark' &&
        (node.recent !== before.node.recent || node.affiliated !== before.node.affiliated));
    if (shapeChanged) redrawNodeGraphics(datum);
    else if (datum.visual.isHub) layoutGlowForNode(datum);
  }
  rebuildLinkDataFromGraph();

  updateNodeStyles();
  sendLayoutUpdate(true);
}

/* ============================================================
   STYLING / RENDERING (filter + LOD + focus dimming)
   ============================================================ */

/**
 * What the pointer or selection is about. For a hub, "neighbors" also
 * include the other homes its bookmarks belong to, so those stay lit and
 * named while the rest of the map dims.
 */
function getFocusContext() {
  const activeId = currentSelection?.id || interactions.getHover()?.id || null;
  return {
    activeId,
    hasSelection: Boolean(currentSelection),
    neighborIds: activeId ? getFocusNeighbors(activeId) : EMPTY_ID_SET,
  };
}

const EMPTY_ID_SET: ReadonlySet<string> = new Set<string>();
let focusNeighborCache: { id: string; ids: Set<string> } | null = null;

function getFocusNeighbors(activeId: string): ReadonlySet<string> {
  if (focusNeighborCache?.id === activeId) return focusNeighborCache.ids;
  const direct = adjacency.get(activeId) ?? new Set<string>();
  const active = nodeById.get(activeId);
  const ids = new Set(direct);
  if (active && (active.kind === 'tag' || active.kind === 'collection')) {
    for (const memberId of direct) {
      for (const otherId of adjacency.get(memberId) ?? []) {
        if (otherId === activeId) continue;
        const other = nodeById.get(otherId);
        if (other && (other.kind === 'tag' || other.kind === 'collection')) ids.add(otherId);
      }
    }
  }
  focusNeighborCache = { id: activeId, ids };
  return ids;
}

type FocusContext = ReturnType<typeof getFocusContext>;

/** Progress (0–1, eased) of the hairline trace-in after a selection lands. */
function getSelectionSettle() {
  if (edgeRevealStartedAt === null) return 1;
  return easeOrbitMapOutCubic(Math.min(1, (Date.now() - edgeRevealStartedAt) / EDGE_REVEAL_MS));
}

/**
 * With Motion on, bookmarks that live in another disc but also belong to the
 * selected hub lean toward it, so the ties show up as movement before any
 * label is read. World-space offset, or null.
 */
function getSelectionLean(datum: MapNode, focusContext: FocusContext) {
  if (!living.isEnabled() || !focusContext.hasSelection || !focusContext.activeId) return null;
  if (datum.node.kind !== 'bookmark') return null;
  const active = nodeById.get(focusContext.activeId);
  if (!active || (active.kind !== 'tag' && active.kind !== 'collection')) return null;
  if (datum.homeId === active.id || !adjacency.get(active.id)?.has(datum.id)) return null;
  const dx = active.x - datum.x;
  const dy = active.y - datum.y;
  const len = Math.hypot(dx, dy) || 1;
  const amount = (SELECTION_LEAN_PX / Math.max(camera.zoom, 0.05)) * getSelectionSettle();
  return { x: (dx / len) * amount, y: (dy / len) * amount };
}

/**
 * Combined visibility for a node: filter toggle × LOD ramp × focus dimming.
 * Active, highlighted, and selection-neighbor bookmarks bypass the LOD ramp
 * so search and selection spotlight matches at any zoom.
 */
function getNodeAlpha(
  datum: MapNode,
  focusContext: FocusContext,
  bookmarkLodAlpha: number
) {
  const replay = getReplayFactor(datum);
  if (replay <= 0) return 0;
  return replay * getBaseNodeAlpha(datum, focusContext, bookmarkLodAlpha);
}

function getBaseNodeAlpha(
  datum: MapNode,
  focusContext: FocusContext,
  bookmarkLodAlpha: number
) {
  if (!matchesFilter(datum)) return 0;

  const node = datum.node;
  const isActive = datum.id === focusContext.activeId;
  const isNeighbor = focusContext.neighborIds.has(datum.id);
  const isAssignedBookmark = node.kind === 'bookmark' && node.affiliated;

  let lodFactor = 1;
  if (datum.kind === 'bookmark' || datum.kind === 'overflow') {
    const spotlighted =
      isActive ||
      (highlightedNodeIds?.has(datum.id) ?? false) ||
      (focusContext.activeId !== null && isNeighbor);
    lodFactor =
      currentFilter !== 'all' || spotlighted ? 1 : bookmarkLodAlpha;
    if (lodFactor <= 0.004) return 0;
    // Freshness: stale bookmarks settle into a calmer, dimmer register
    // (never while spotlighted — focus always wins).
    if (!spotlighted && node.kind === 'bookmark' && !node.recent) {
      lodFactor *= 0.85;
    }
  }

  // Search highlight dominates: matches at full strength, the rest recede.
  if (highlightedNodeIds && !isActive) {
    const focusAlpha = highlightedNodeIds.has(datum.id)
      ? 1.0
      : datum.visual.isHub
        ? 0.22
        : 0.14;
    return focusAlpha * lodFactor;
  }

  if (focusContext.activeId) {
    if (isActive) return 1.0;
    if (isNeighbor) return (focusContext.hasSelection ? 0.94 : 0.78) * lodFactor;
    const dimmed = focusContext.hasSelection
      ? datum.visual.isHub ? 0.34 : isAssignedBookmark ? 0.18 : 0.24
      : datum.visual.isHub ? 0.26 : isAssignedBookmark ? 0.16 : 0.22;
    return dimmed * lodFactor;
  }
  return lodFactor;
}

/** Entrance fade factor for a node (1 once the entrance has finished). */
function getEntranceFactor(datum: MapNode, entranceElapsed: number | null) {
  if (entranceElapsed === null) return 1;
  const delay = datum.entranceDelay ?? 0;
  const t = Math.min(
    Math.max((entranceElapsed - delay) / ENTRANCE_NODE_FADE_MS, 0),
    1
  );
  return easeOrbitMapOutCubic(t);
}

/**
 * Refreshes all interaction/zoom-dependent visuals (filter + LOD visibility,
 * dimming, halos, links, rings, labels) without rebuilding the scene. Cheap
 * enough to run on every hover, pan, zoom, and selection change.
 */
function updateNodeStyles() {
  if (!app || !nodesContainer) return;

  const focusContext = getFocusContext();
  const zoom = camera.zoom;
  const bookmarkLodAlpha = getOrbitMapBookmarkLodAlpha(zoom);
  // Far out, dots fade and the disc glow stands in for them.
  const glowFarBoost =
    currentFilter === 'all'
      ? 1 + DISC_GLOW_FAR_BOOST * getOrbitMapClusterHaloAlpha(zoom)
      : 1;
  const bounds = getOrbitMapViewBounds(
    camera,
    app.renderer.width,
    app.renderer.height,
    VIEW_CULL_MARGIN
  );
  const entranceElapsed =
    entranceStartedAt !== null ? Date.now() - entranceStartedAt : null;
  if (entranceElapsed !== null && entranceElapsed >= ENTRANCE_TOTAL_MS) {
    entranceStartedAt = null;
  }

  const hoverId = focusContext.hasSelection
    ? null
    : interactions.getHover()?.id ?? null;

  hitTestNodes = [];
  for (const datum of nodeData) {
    const g = nodeGraphicsMap.get(datum.id);
    if (!g) continue;

    const alpha = getNodeAlpha(datum, focusContext, bookmarkLodAlpha);
    const isActive = datum.id === focusContext.activeId;
    if (alpha > 0.01) hitTestNodes.push(datum);

    const visible =
      alpha > 0.01 &&
      (isActive || isInOrbitMapViewBounds(datum.x, datum.y, bounds));
    g.visible = visible;
    if (visible) {
      const entranceFactor = getEntranceFactor(datum, entranceElapsed);
      g.alpha = alpha * entranceFactor;
      const lean = getSelectionLean(datum, focusContext);
      g.position.set(datum.x + (lean?.x ?? 0), datum.y + (lean?.y ?? 0));
      let scale = datum.scale || 1;
      // Entrance: nodes pop from ENTRANCE_SCALE_START to full size as they fade in.
      if (entranceElapsed !== null) {
        scale *= ENTRANCE_SCALE_START + (1 - ENTRANCE_SCALE_START) * entranceFactor;
      }
      if (datum.id === hoverId) scale *= HOVER_POP_SCALE;
      g.scale.set(scale);
    }

    const glow = glowSpriteMap.get(datum.id);
    if (glow) {
      glow.visible = alpha > 0.01;
      if (glow.visible) {
        glow.alpha =
          getHubGlowAlpha(datum) *
          glowFarBoost *
          alpha *
          getEntranceFactor(datum, entranceElapsed);
      }
    }
  }
  hitIndex.rebuild(hitTestNodes);

  if (linksContainer) {
    linksContainer.alpha =
      entranceElapsed === null
        ? 1
        : easeOrbitMapOutCubic(Math.min(entranceElapsed / 800, 1));
  }

  drawLinks(focusContext);
  drawRings(focusContext);
  updateLabels(focusContext);
  renderEffects();

  applyCameraTransform();
  app.renderer.render(app.stage);

  // Living-map orbits keep the loop alive. No-op if already running.
  if (isLivingActive()) startRenderLoop();
}

/**
 * Selection wash + relationship hairlines. Nothing is drawn at rest: every
 * bookmark already sits in its home's disc. Selecting (or hovering) a node
 * draws neutral hairlines to the other homes involved, traced in from the
 * bookmark end after a selection lands.
 */
function drawLinks(focusContext: FocusContext) {
  if (!linkGraphics) return;
  linkGraphics.clear();

  const activeId = focusContext.activeId;
  const active = activeId ? nodeById.get(activeId) : undefined;
  if (!active) return;

  const palette = getPalette();
  const px = 1 / Math.max(0.05, camera.zoom);

  // Soft accent wash inside a selected hub's disc (drawn under the dots).
  const cluster = clusters.get(active.id);
  if (focusContext.hasSelection && cluster) {
    linkGraphics
      .circle(cluster.x, cluster.y, cluster.radius + 8)
      .fill({ color: palette.glow, alpha: colorMode === 'light' ? 0.05 : 0.08 });
  }

  let reveal = 1;
  if (edgeRevealStartedAt !== null) {
    const rawReveal = Math.min(1, (Date.now() - edgeRevealStartedAt) / EDGE_REVEAL_MS);
    if (rawReveal >= 1) edgeRevealStartedAt = null;
    reveal = easeOrbitMapOutCubic(rawReveal);
  }

  const isHome = (node: MapNode | undefined): node is MapNode =>
    Boolean(node && (node.kind === 'tag' || node.kind === 'collection'));
  const segments: Array<[MapNode, MapNode]> = [];
  if (active.kind === 'bookmark') {
    for (const hubId of adjacency.get(active.id) ?? []) {
      const hub = nodeById.get(hubId);
      if (isHome(hub)) segments.push([active, hub]);
    }
  } else if (isHome(active)) {
    for (const memberId of adjacency.get(active.id) ?? []) {
      const member = nodeById.get(memberId);
      if (!member || member.kind !== 'bookmark' || !matchesFilter(member)) continue;
      if (member.homeId === active.id) {
        // Lives in this disc: point to its other homes.
        for (const otherId of adjacency.get(member.id) ?? []) {
          const other = nodeById.get(otherId);
          if (otherId !== active.id && isHome(other)) segments.push([member, other]);
        }
      } else {
        // Lives in another disc but belongs here too.
        segments.push([member, active]);
      }
    }
  }
  if (segments.length === 0) return;

  for (const [source, target] of segments) {
    const lean = getSelectionLean(source, focusContext);
    const sx = source.x + (lean?.x ?? 0);
    const sy = source.y + (lean?.y ?? 0);
    const tx = target.x;
    const ty = target.y;
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const bend = len * 0.1;
    const cx = (sx + tx) / 2 - (dy / len) * bend;
    const cy = (sy + ty) / 2 + (dx / len) * bend;
    linkGraphics.moveTo(sx, sy);
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * reveal;
      linkGraphics.lineTo(getQuadraticPoint(sx, cx, tx, t), getQuadraticPoint(sy, cy, ty, t));
    }
  }
  linkGraphics.stroke({
    width: px,
    color: palette.labelDefault,
    alpha: focusContext.hasSelection
      ? colorMode === 'light' ? 0.42 : 0.34
      : colorMode === 'light' ? 0.28 : 0.22,
    cap: 'round',
  });
}

/**
 * Selection is the app's state glow: a crisp accent ring around the chosen
 * disc (or bookmark), with the soft wash drawn by drawLinks. Hover gets a
 * neutral outline. A bookmark dragged over a hub shows the success ring.
 */
function drawRings(focusContext: FocusContext) {
  if (!ringGraphics) return;
  ringGraphics.clear();
  const palette = getPalette();
  const px = 1 / Math.max(0.05, camera.zoom);

  const dropTargetId = interactions.getDropTargetId();
  if (dropTargetId) {
    const target = nodeById.get(dropTargetId);
    const cluster = target ? clusters.get(target.id) : undefined;
    if (target) {
      const x = cluster?.x ?? target.x;
      const y = cluster?.y ?? target.y;
      const radius = (cluster?.radius ?? target.radius) + 8;
      ringGraphics
        .circle(x, y, radius)
        .fill({ color: palette.success, alpha: 0.08 })
        .stroke({ width: 2 * px, color: palette.success, alpha: 0.95 });
    }
  }

  const active = focusContext.activeId ? nodeById.get(focusContext.activeId) : undefined;
  if (!active) return;
  const cluster = clusters.get(active.id);
  const x = cluster?.x ?? active.x;
  const y = cluster?.y ?? active.y;
  const radius = cluster ? cluster.radius + 8 : active.radius + 4;

  if (focusContext.hasSelection) {
    ringGraphics.circle(x, y, radius).stroke({ width: 1.5 * px, color: palette.glow, alpha: 0.9 });
  } else {
    ringGraphics
      .circle(x, y, radius)
      .stroke({ width: px, color: palette.labelDefault, alpha: 0.35 });
  }
}

/**
 * Labels with screen-space decluttering (each label's real box, greedy by
 * priority). Hub names sit under their disc with the count beside them;
 * "+N" sits on the disc's rim; bookmark handles appear above their dot once
 * zoomed in or focused.
 */
function updateLabels(focusContext: FocusContext) {
  if (!labelsContainer || !app) return;

  const zoom = Math.max(camera.zoom, 0.01);
  const bookmarkLodAlpha = getOrbitMapBookmarkLodAlpha(zoom);
  const candidates: OrbitMapLabelCandidate[] = [];
  const planned = new Map<string, { datum: MapNode; isActive: boolean; isNeighbor: boolean }>();

  for (const datum of nodeData) {
    if (!matchesFilter(datum) || getReplayFactor(datum) <= 0) continue;
    const isActive = datum.id === focusContext.activeId;
    const isNeighbor = focusContext.neighborIds.has(datum.id);
    const node = datum.node;
    const priority = getOrbitMapLabelPriority(datum.kind, {
      isActive,
      isSelectedNeighbor: focusContext.hasSelection && isNeighbor,
      importanceRank: datum.labelRank,
      recent: node.kind === 'bookmark' ? node.recent : false,
    });

    if (datum.visual.isHub) {
      const size = getOrbitMapLabelScreenSize(true, isActive ? 'active' : 'default');
      const nameBox = estimateOrbitMapLabelBox(getOrbitMapLabelText(node), size);
      const count = getHubCountText(datum);
      const countWidth = count
        ? HUB_COUNT_GAP_PX + estimateOrbitMapLabelBox(count, size - 1.5).width
        : 0;
      const { x, rimY } = getHubLabelAnchor(datum);
      candidates.push({
        id: datum.id,
        x: x * zoom + camera.x,
        y: rimY * zoom + camera.y + HUB_LABEL_GAP_PX + nameBox.height,
        width: nameBox.width + countWidth,
        height: nameBox.height,
        priority,
      });
    } else if (node.kind === 'overflow') {
      if (bookmarkLodAlpha < 0.25 && !isActive && !isNeighbor) continue;
      const box = estimateOrbitMapLabelBox(getOrbitMapLabelText(node), 11);
      candidates.push({
        id: datum.id,
        x: datum.x * zoom + camera.x + box.width / 2,
        y: datum.y * zoom + camera.y + box.height / 2,
        width: box.width,
        height: box.height,
        priority,
      });
    } else {
      const eligible = shouldShowOrbitMapLabel(datum.kind, zoom, LABEL_ZOOM_THRESHOLD, {
        isActive,
        isSelectedNeighbor: focusContext.hasSelection && isNeighbor,
        importanceRank: datum.labelRank,
      });
      if (!eligible) continue;
      const box = estimateOrbitMapLabelBox(
        getOrbitMapLabelText(node),
        getOrbitMapLabelScreenSize(false, getLabelState(isActive, isNeighbor))
      );
      candidates.push({
        id: datum.id,
        x: datum.x * zoom + camera.x,
        y: (datum.y - getBookmarkLabelWorldOffset(datum)) * zoom + camera.y,
        width: box.width,
        height: box.height,
        priority,
      });
    }
    planned.set(datum.id, { datum, isActive, isNeighbor });
  }

  const winners = declutterOrbitMapLabels(candidates, {
    cellSize: ORBIT_MAP_LABEL_CELL_SIZE,
    width: app.renderer.width,
    height: app.renderer.height,
  });

  // Pool labels: hide out-of-view winners (don't destroy+recreate on every
  // pan/zoom tick — that was a multi-allocation-per-frame hot path).
  for (const [nodeId, label] of labelMap) {
    if (!winners.has(nodeId)) label.visible = false;
  }
  for (const [nodeId, label] of countLabelMap) {
    if (!winners.has(nodeId)) label.visible = false;
  }

  for (const nodeId of winners) {
    const plan = planned.get(nodeId);
    if (!plan) continue;
    const { datum, isActive, isNeighbor } = plan;
    const dimmed = focusContext.hasSelection && !isActive && !isNeighbor;

    if (datum.visual.isHub) {
      const size = getOrbitMapLabelScreenSize(true, isActive ? 'active' : 'default');
      const name = getPooledLabel(labelMap, nodeId, LABEL_FONT, getOrbitMapLabelText(datum.node));
      const countText = getHubCountText(datum);
      const count = countText
        ? getPooledLabel(countLabelMap, nodeId, LABEL_FONT_MUTED, countText)
        : null;
      placeHubLabel(name, count, datum, size, dimmed ? 0.45 : 1);
      continue;
    }

    if (datum.node.kind === 'overflow') {
      const label = getPooledLabel(labelMap, nodeId, LABEL_FONT_MUTED, getOrbitMapLabelText(datum.node));
      label.anchor.set(0, 0.5);
      label.scale.set(getLabelWorldScale(11));
      label.position.set(datum.x + 2 / Math.max(camera.zoom, 0.01), datum.y);
      label.alpha = dimmed ? 0.45 : 1;
      continue;
    }

    const label = getPooledLabel(labelMap, nodeId, LABEL_FONT_MUTED, getOrbitMapLabelText(datum.node));
    positionLabel(label, datum, focusContext);
  }
}

/** A pooled BitmapText for `nodeId`, created on first use and shown. */
function getPooledLabel(
  pool: Map<string, BitmapText>,
  nodeId: string,
  fontFamily: string,
  text: string
): BitmapText {
  let label = pool.get(nodeId);
  if (!label) {
    // fontSize must match the installed size, or Pixi scales glyphs to its
    // 26px default and every label renders ~1.4x larger than planned.
    label = new BitmapText({ text, style: { fontFamily, fontSize: LABEL_BASE_FONT_SIZE } });
    pool.set(nodeId, label);
    labelsContainer?.addChild(label);
  } else if (label.text !== text) {
    label.text = text;
  }
  label.visible = true;
  return label;
}

/** Keeps a label a steady on-screen size while its container follows zoom. */
function getLabelWorldScale(screenSize: number) {
  return Math.max(
    LABEL_MIN_WORLD_SCALE,
    Math.min(
      LABEL_MAX_WORLD_SCALE,
      screenSize / (LABEL_BASE_FONT_SIZE * Math.max(camera.zoom, 0.01))
    )
  );
}

function getHubCountText(datum: MapNode): string | null {
  const node = datum.node;
  let count =
    node.kind === 'tag' || node.kind === 'collection'
      ? node.count
      : node.kind === 'core'
        ? node.looseBookmarks
        : null;
  if (count === null) return null;
  if (replayCutoffDays !== null) {
    // Scale the real total by the share of this disc's dots shown so far.
    const members = clusters.get(datum.id)?.memberCount ?? 0;
    const visible = replayVisibleByHome.get(datum.id) ?? 0;
    count = members > 0 ? Math.round((count * visible) / members) : 0;
  }
  return count.toLocaleString('en-US');
}

/** Hub names sit centred under the disc's outer ring. */
function getHubLabelAnchor(datum: MapNode) {
  const cluster = clusters.get(datum.id);
  return {
    x: cluster?.x ?? datum.x,
    rimY: (cluster?.y ?? datum.y) + (cluster?.radius ?? datum.radius),
  };
}

/** Name + count, centred as a pair under the disc. */
function placeHubLabel(
  name: BitmapText,
  count: BitmapText | null,
  datum: MapNode,
  size: number,
  alpha: number
) {
  const zoom = Math.max(camera.zoom, 0.01);
  const { x, rimY } = getHubLabelAnchor(datum);
  const top = rimY + HUB_LABEL_GAP_PX / zoom;

  name.anchor.set(0, 0);
  name.scale.set(getLabelWorldScale(size));
  name.alpha = alpha;
  let total = name.width;
  if (count) {
    count.anchor.set(0, 1);
    count.scale.set(getLabelWorldScale(size - 1.5));
    count.alpha = alpha;
    total += HUB_COUNT_GAP_PX / zoom + count.width;
  }
  const left = x - total / 2;
  name.position.set(left, top);
  if (count) {
    // Bottom-align the smaller count with the name.
    count.position.set(left + name.width + HUB_COUNT_GAP_PX / zoom, top + name.height * 0.86);
  }
}

/** Bookmark handles sit centred just above their dot. */
function positionLabel(
  label: BitmapText,
  datum: MapNode,
  focusContext: FocusContext
) {
  const isActive = datum.id === focusContext.activeId;
  const isNeighbor = focusContext.neighborIds.has(datum.id);
  label.anchor.set(0.5, 1);
  label.position.set(datum.x, datum.y - getBookmarkLabelWorldOffset(datum));
  label.scale.set(
    getLabelWorldScale(getOrbitMapLabelScreenSize(false, getLabelState(isActive, isNeighbor)))
  );
  label.alpha = isActive || isNeighbor ? 1 : 0.9;
}

function getLabelState(isActive: boolean, isNeighbor: boolean) {
  return isActive ? 'active' : isNeighbor ? 'neighbor' : 'default';
}

/** World-space gap between a bookmark's centre and its handle's baseline. */
function getBookmarkLabelWorldOffset(datum: MapNode) {
  return datum.radius * 0.7 + 4 / Math.max(camera.zoom, 0.01);
}

function renderEffects() {
  if (!effectsGraphics || !effectsAdditiveGraphics) return;

  effectsGraphics.clear();
  effectsAdditiveGraphics.clear();
  const palette = getPalette();
  const px = 1 / Math.max(0.05, camera.zoom);

  activeAnimations.forEach((anim) => {
    if (anim.type === 'pulse') {
      const datum = nodeById.get(anim.nodeId);
      if (!datum) return;
      const progress = getOrbitMapAnimationProgress(anim);
      const cluster = clusters.get(datum.id);
      const base = cluster ? cluster.radius + 8 : datum.radius + 4;
      // Two soft rings expanding from the disc edge.
      for (let i = 0; i < 2; i++) {
        const ringProgress = Math.max(0, progress * 1.3 - i * 0.3);
        if (ringProgress <= 0 || ringProgress >= 1) continue;
        effectsGraphics!
          .circle(datum.x, datum.y, base + easeOrbitMapOutCubic(ringProgress) * 26)
          .stroke({ width: 1.5 * px, color: palette.glow, alpha: (1 - ringProgress) * 0.7 });
      }
      return;
    }

    if (anim.type === 'arrive' && anim.spiral) {
      const datum = nodeById.get(anim.nodeId);
      const progress = getOrbitMapAnimationProgress(anim);
      if (!datum || progress <= 0) return;
      const trailSteps = 14;
      for (let k = 1; k <= trailSteps; k++) {
        const t = progress - k * 0.012;
        if (t <= 0) break;
        const point = getSpiralPoint(anim.spiral, t);
        effectsAdditiveGraphics!
          .circle(point.x, point.y, Math.max(0.6, datum.radius * 0.6 * (1 - k / (trailSteps + 1))))
          .fill({ color: palette.glow, alpha: 0.45 * (1 - k / (trailSteps + 1)) });
      }
      return;
    }

    if (
      anim.type === 'assign' &&
      anim.fromX !== undefined && anim.fromY !== undefined &&
      anim.targetX !== undefined && anim.targetY !== undefined
    ) {
      const datum = nodeById.get(anim.nodeId);
      if (!datum) return;

      const controlX = anim.controlX ?? (anim.fromX + anim.targetX) / 2;
      const controlY = anim.controlY ?? (anim.fromY + anim.targetY) / 2;

      // Short fading trail behind the flying dot. Samples in eased-progress
      // space, so it stretches while fast and tightens on arrival.
      const eased = easeOrbitMapOutCubic(
        Math.max(0, getOrbitMapAnimationProgress(anim))
      );
      const trailSteps = 10;
      for (let k = 1; k <= trailSteps; k++) {
        const t = eased - k * 0.03;
        if (t <= 0) break;
        effectsAdditiveGraphics!
          .circle(
            getQuadraticPoint(anim.fromX, controlX, anim.targetX, t),
            getQuadraticPoint(anim.fromY, controlY, anim.targetY, t),
            Math.max(0.6, datum.radius * 0.6 * (1 - k / (trailSteps + 1)))
          )
          .fill({ color: palette.glow, alpha: 0.45 * (1 - k / (trailSteps + 1)) });
      }
    }
  });

  sweep.render(effectsAdditiveGraphics, palette.glow, mixOrbitMapColors);
}

/* ============================================================
   RENDER LOOP (drives animations + the entrance fade)
   ============================================================ */

/**
 * Living-map frame: everything the ambient frame does, plus orbital node and
 * label position sync and an edge redraw that tracks the moving bookmarks.
 * Every LIVING_REFRESH_MS a full style pass re-culls and re-declutters labels;
 * between refreshes this path allocates nothing. Layout is not posted here —
 * hubs barely move, and a full LAYOUT_UPDATED would rebuild React + minimap.
 */
function renderLivingFrame(now: number) {
  if (!app) return;

  if (living.shouldRefreshStyles(now)) {
    updateNodeStyles();
    return;
  }

  const focusContext = getFocusContext();

  for (const nodeId of living.orbitingIds()) {
    const g = nodeGraphicsMap.get(nodeId);
    if (!g || !g.visible) continue;
    const datum = nodeById.get(nodeId);
    if (!datum) continue;
    const lean = getSelectionLean(datum, focusContext);
    g.position.set(datum.x + (lean?.x ?? 0), datum.y + (lean?.y ?? 0));
  }
  hitIndexDirty = true;

  for (const [nodeId, label] of labelMap) {
    if (!label.visible || !living.hasOrbit(nodeId)) continue;
    const datum = nodeById.get(nodeId);
    if (datum) positionLabel(label, datum, focusContext);
  }

  drawLinks(focusContext);
  drawRings(focusContext);
  renderEffects();
  app.renderer.render(app.stage);
}

/** Cheap per-frame path for the scan sweep: only the effects layer changes. */
function renderAmbientFrame() {
  if (!app) return;
  renderEffects();
  app.renderer.render(app.stage);
}

function startRenderLoop() {
  if (renderLoopRunning || !app) return;
  renderLoopRunning = true;
  consecutiveFrameErrors = 0;

  const tickFrame = () => {
    const now = Date.now();
    const livingActive = isLivingActive();

    const hadAnimations = activeAnimations.length > 0;
    updateAnimations();

    // Heavy path (uncapped): one-shot flights, the entrance, and the edge
    // trace-in restyle real node/link state every frame. Orbits advance
    // only on frames that render, so no motion work is discarded.
    if (
      activeAnimations.length > 0 ||
      entranceStartedAt !== null ||
      isEdgeRevealActive()
    ) {
      if (livingActive) living.advanceOrbits(now);
      updateNodeStyles();
      requestAnimationFrame(tick);
      return;
    }

    if (hadAnimations) {
      // One-shot animations just finished (possibly with the ambient loop
      // still alive): settle styles and sync moved nodes to the minimap.
      if (livingActive) living.advanceOrbits(now);
      updateNodeStyles();
      sendLayoutUpdate(true);
      requestAnimationFrame(tick);
      return;
    }

    // Capped path (~30fps): living motion and the radar sweep only mutate
    // node positions and the effects/ring layers — half the GPU work,
    // invisible for motion this slow. Pauses while the page is hidden.
    if (livingActive || (living.isPageVisible() && isSweepActive())) {
      if (now - lastAmbientFrameAt >= AMBIENT_FRAME_MIN_MS) {
        lastAmbientFrameAt = now;
        if (livingActive) {
          living.advanceOrbits(now);
          renderLivingFrame(now);
        } else {
          renderAmbientFrame();
        }
      }
      requestAnimationFrame(tick);
      return;
    }

    // Drag returns / assign flights may have moved nodes — sync the minimap.
    updateNodeStyles();
    sendLayoutUpdate(true);
    renderLoopRunning = false;
  };

  const tick = () => {
    if (!app) {
      renderLoopRunning = false;
      return;
    }
    try {
      tickFrame();
      consecutiveFrameErrors = 0;
    } catch (error) {
      // A transient frame error (GPU reset, context loss mid-frame) must
      // not escape to worker.onerror — the host treats that as fatal and
      // permanently swaps the map for the unsupported-browser fallback.
      // Log, retry, and only stop the loop on a persistent failure.
      consecutiveFrameErrors += 1;
      console.error('[OrbitWorker] Render frame failed:', error);
      if (consecutiveFrameErrors >= MAX_CONSECUTIVE_FRAME_ERRORS) {
        renderLoopRunning = false;
        return;
      }
      requestAnimationFrame(tick);
    }
  };

  tick();
}

/**
 * Per-frame animation updater. Interpolates assign flights and drag returns,
 * and cleans up finished pulses.
 */
function updateAnimations() {
  if (activeAnimations.length === 0) return;

  const now = Date.now();
  const toRemove: number[] = [];

  activeAnimations.forEach((anim, index) => {
    const datum = nodeById.get(anim.nodeId);
    if (!datum) {
      toRemove.push(index);
      return;
    }

    // Staggered starts (arrival batches) park at t = 0 until their turn.
    const progress = Math.max(0, getOrbitMapAnimationProgress(anim, now));

    if (anim.type === 'arrive' && anim.spiral) {
      const point = getSpiralPoint(anim.spiral, progress);
      datum.x = point.x;
      datum.y = point.y;
      if (progress >= 1) {
        toRemove.push(index);
        // Landed on its ring — re-phase so motion continues from here.
        living.rebaseOrbitTheta(anim.nodeId);
        pushPulse(anim.anchorId ?? anim.nodeId, 520);
      }
      return;
    }

    if (
      (anim.type === 'assign' || anim.type === 'return') &&
      anim.fromX !== undefined && anim.fromY !== undefined &&
      anim.targetX !== undefined && anim.targetY !== undefined
    ) {
      const t = easeOrbitMapOutCubic(progress);
      if (
        anim.type !== 'return' &&
        anim.controlX !== undefined &&
        anim.controlY !== undefined
      ) {
        datum.x = getQuadraticPoint(anim.fromX, anim.controlX, anim.targetX, t);
        datum.y = getQuadraticPoint(anim.fromY, anim.controlY, anim.targetY, t);
      } else {
        datum.x = anim.fromX + (anim.targetX - anim.fromX) * t;
        datum.y = anim.fromY + (anim.targetY - anim.fromY) * t;
      }

      if (anim.type === 'assign') {
        datum.scale = progress < 1 ? 1.13 : undefined;
      }

      if (progress >= 1) {
        toRemove.push(index);
        if (anim.type === 'assign') {
          // The node docked onto a different disc; its old orbit no longer
          // applies — hold position until the refetch rebuilds orbits.
          living.releaseOrbit(anim.nodeId);
          delete datum.scale;
          pushPulse(anim.anchorId ?? anim.nodeId);
          postToMain({
            type: MainMessageType.ANIMATE_ASSIGN_COMPLETE,
            protocolVersion: 1,
            bookmarkId: anim.nodeId,
          });
        }
      }
    }

    if (anim.type === 'pulse' && progress >= 1) {
      const g = nodeGraphicsMap.get(anim.nodeId);
      if (g) g.scale.set(1);
      toRemove.push(index);
    }
  });

  for (let i = toRemove.length - 1; i >= 0; i--) {
    activeAnimations.splice(toRemove[i], 1);
  }
}

/* ============================================================
   CAMERA (pan / zoom / fly-to-frame)
   ============================================================ */

function cancelCameraAnimation() {
  cameraAnimationToken++;
}

/** Smoothly animates the camera to `target`, cancelable by any manual input. */
function animateCameraTo(
  target: CameraState,
  duration: number,
  onArrive?: () => void
) {
  if (!app) return;
  const token = ++cameraAnimationToken;
  const start = { ...camera };
  const startTime = Date.now();

  const step = () => {
    if (token !== cameraAnimationToken || !app) return;
    const progress = Math.min((Date.now() - startTime) / duration, 1);
    const eased = easeOrbitMapOutCubic(progress);

    camera.x = start.x + (target.x - start.x) * eased;
    camera.y = start.y + (target.y - start.y) * eased;
    camera.zoom = start.zoom + (target.zoom - start.zoom) * eased;
    constrainCamera();
    updateNodeStyles();
    postCameraChanged();

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      onArrive?.();
    }
  };

  step();
}

function getClusterFrameCameraState(
  anchorId: string,
  fallbackX: number,
  fallbackY: number
): CameraState {
  const cluster = clusters.get(anchorId);
  const radius = Math.max(cluster?.radius ?? 0, 90);
  const cx = cluster?.x ?? fallbackX;
  const cy = cluster?.y ?? fallbackY;
  return getOrbitMapFrameCameraState(
    { minX: cx - radius, maxX: cx + radius, minY: cy - radius, maxY: cy + radius },
    { ...getCameraConfig(), maxFitZoom: CLUSTER_FRAME_MAX_ZOOM }
  );
}

/**
 * Fly-to-frame for a selection: hubs frame their entire cluster, bookmarks
 * zoom in close enough to read the neighborhood, core recenters the map.
 */
function frameSelection(selection: OrbitMapSelection) {
  if (!app) return;
  const target = nodeById.get(selection.id);
  if (!target) return;
  cameraUserAdjusted = true;

  const width = app.renderer.width;
  const height = app.renderer.height;
  let desired: CameraState;

  switch (selection.kind) {
    case 'tag':
    case 'collection':
      desired = getClusterFrameCameraState(selection.id, target.x, target.y);
      break;
    case 'overflow': {
      const overflow = target.node;
      if (overflow.kind !== 'overflow') return;
      const anchor = nodeById.get(overflow.anchorId);
      desired = getClusterFrameCameraState(
        overflow.anchorId,
        anchor?.x ?? target.x,
        anchor?.y ?? target.y
      );
      break;
    }
    case 'core': {
      const zoom = clampZoom(Math.max(camera.zoom, 0.5));
      desired = {
        x: width / 2 - target.x * zoom,
        y: height / 2 - target.y * zoom,
        zoom,
      };
      break;
    }
    case 'bookmark': {
      const zoom = clampZoom(Math.max(camera.zoom, BOOKMARK_FOCUS_ZOOM));
      desired = {
        x: width / 2 - target.x * zoom,
        y: height / 2 - target.y * zoom,
        zoom,
      };
      break;
    }
    default: {
      const exhaustive: never = selection.kind;
      return exhaustive;
    }
  }

  animateCameraTo(constrainCameraState(desired), 420, () => {
    pushPulse(selection.id, 380);
  });
}

function handleCameraMessage(msg: CameraControlMessage) {
  if (!app) return;
  cancelCameraAnimation();
  cameraUserAdjusted = true;

  switch (msg.type) {
    case WorkerMessageType.PAN: {
      camera.x += msg.dx;
      camera.y += msg.dy;
      interactions.setCursor('grabbing');
      break;
    }

    case WorkerMessageType.ZOOM: {
      const { factor, focalX, focalY } = msg;
      const screenX = focalX ?? (app.renderer.width / 2);
      const screenY = focalY ?? (app.renderer.height / 2);

      const worldX = (screenX - camera.x) / camera.zoom;
      const worldY = (screenY - camera.y) / camera.zoom;
      const newZoom = clampZoom(camera.zoom * factor);

      camera.x = screenX - worldX * newZoom;
      camera.y = screenY - worldY * newZoom;
      camera.zoom = newZoom;
      break;
    }

    case WorkerMessageType.SET_CAMERA: {
      if (msg.camera) {
        camera.x = msg.camera.x ?? camera.x;
        camera.y = msg.camera.y ?? camera.y;
        camera.zoom =
          msg.camera.zoom !== undefined ? clampZoom(msg.camera.zoom) : camera.zoom;
      }
      break;
    }

    default: {
      const exhaustive: never = msg;
      return exhaustive;
    }
  }

  constrainCamera();
  scheduleCameraRefresh();
  scheduleGestureEndRefresh();
}

function handleWheel(msg: WheelMessage) {
  if (!app) return;
  cancelCameraAnimation();
  cameraUserAdjusted = true;

  const normalizedDelta = Math.max(
    -WHEEL_DELTA_CAP,
    Math.min(WHEEL_DELTA_CAP, msg.deltaY)
  );
  const factor = Math.exp(-normalizedDelta * WHEEL_ZOOM_SENSITIVITY);
  const screenX = msg.x;
  const screenY = msg.y;

  const worldX = (screenX - camera.x) / camera.zoom;
  const worldY = (screenY - camera.y) / camera.zoom;
  const newZoom = clampZoom(camera.zoom * factor);

  camera.x = screenX - worldX * newZoom;
  camera.y = screenY - worldY * newZoom;
  camera.zoom = newZoom;
  constrainCamera();

  scheduleCameraRefresh();
  scheduleGestureEndRefresh();
}

function handleResetView() {
  if (!app || nodeData.length === 0) return;

  const bounds = getGraphBounds();
  if (!bounds) return;

  cameraUserAdjusted = false;
  const fit = getOrbitMapFrameCameraState(bounds, getCameraConfig());
  animateCameraTo(constrainCameraState(fit), 380);
}

/**
 * Double-click: bookmarks open on the dashboard, hubs select + fly-to-frame,
 * empty space zooms in toward the cursor.
 */
function handleDoubleClick(msg: DoubleClickMessage) {
  if (!app || !currentGraph || nodeData.length === 0) return;

  const worldX = (msg.x - camera.x) / camera.zoom;
  const worldY = (msg.y - camera.y) / camera.zoom;

  const closest = hitIndex.query(
    { x: worldX, y: worldY },
    Math.max(10, 14 / camera.zoom)
  );

  if (closest?.node.kind === 'bookmark') {
    postToMain({
      type: MainMessageType.OPEN_BOOKMARK,
      protocolVersion: 1,
      bookmarkId: closest.id,
    });
    return;
  }

  if (closest && (closest.node.kind === 'tag' || closest.node.kind === 'collection')) {
    const selection: OrbitMapSelection = { id: closest.id, kind: closest.node.kind };
    setCurrentSelectionState(selection);
    updateNodeStyles();
    postToMain({
      type: MainMessageType.SELECTION_CHANGED,
      protocolVersion: 1,
      selection,
    });
    frameSelection(selection);
    return;
  }

  // Empty space: animated zoom-in toward the cursor.
  const newZoom = clampZoom(camera.zoom * 1.7);
  if (newZoom === camera.zoom) return;
  cameraUserAdjusted = true;
  const target = constrainCameraState({
    x: msg.x - worldX * newZoom,
    y: msg.y - worldY * newZoom,
    zoom: newZoom,
  });
  animateCameraTo(target, 320);
}

/* ============================================================
   SELECTION / FOCUS / ASSIGN COMMANDS
   ============================================================ */

function handleSetSelection(msg: SetSelectionMessage) {
  setCurrentSelectionState(msg.selection);
  updateNodeStyles();
}

/**
 * Filing flight: the bookmark arcs from where it is to the near edge of the
 * disc it's being filed into, then that hub pulses. The refetched graph then
 * slots it into the ring for its age.
 */
function handleAnimateAssign(msg: AnimateAssignMessage) {
  const { bookmarkId, anchorId, duration = ASSIGN_FLIGHT_MS } = msg;

  const bookmarkDatum = nodeById.get(bookmarkId);
  const anchorDatum = nodeById.get(anchorId);

  if (!bookmarkDatum || !anchorDatum) {
    console.warn('[OrbitWorker] Cannot animate assign - nodes not found');
    return;
  }

  removeAnimationsFor(bookmarkId, 'assign');
  removeAnimationsFor(bookmarkId, 'return');
  delete bookmarkDatum.scale;

  const cluster = clusters.get(anchorId);
  const centerX = cluster?.x ?? anchorDatum.x;
  const centerY = cluster?.y ?? anchorDatum.y;
  const landRadius = cluster ? Math.max(anchorDatum.radius + 12, cluster.radius - 8) : 0;
  const approach = Math.atan2(bookmarkDatum.y - centerY, bookmarkDatum.x - centerX);
  const targetX = centerX + Math.cos(approach) * landRadius;
  const targetY = centerY + Math.sin(approach) * landRadius;

  // Curved flight: perpendicular bend off the straight line, side chosen
  // deterministically per bookmark so repeat assigns fly the same arc.
  const dx = targetX - bookmarkDatum.x;
  const dy = targetY - bookmarkDatum.y;
  const len = Math.hypot(dx, dy);
  const side = hashOrbitMapStringToSeed(bookmarkId) % 2 === 0 ? 1 : -1;
  const bend = len * 0.22 * side;

  activeAnimations.push({
    id: `assign-${bookmarkId}-${Date.now()}`,
    type: 'assign',
    nodeId: bookmarkId,
    startTime: Date.now(),
    duration,
    fromX: bookmarkDatum.x,
    fromY: bookmarkDatum.y,
    targetX,
    targetY,
    controlX: (bookmarkDatum.x + targetX) / 2 - (len > 1 ? (dy / len) * bend : 0),
    controlY: (bookmarkDatum.y + targetY) / 2 + (len > 1 ? (dx / len) * bend : 0),
    anchorId,
  });

  startRenderLoop();
}

function handleFocusPulse(msg: FocusPulseMessage) {
  const { nodeId, duration = 750 } = msg;
  if (!nodeById.has(nodeId)) return;
  pushPulse(nodeId, duration);
}

function handleFocusOn(msg: FocusOnMessage) {
  const selection = msg.selection;
  if (!selection || !nodeData.length || !app) return;
  if (!nodeById.has(selection.id)) return;

  // Update selection state immediately so neighbor highlighting reacts.
  const nextSelection: OrbitMapSelection = { id: selection.id, kind: selection.kind };
  setCurrentSelectionState(nextSelection);
  updateNodeStyles();
  postToMain({
    type: MainMessageType.SELECTION_CHANGED,
    protocolVersion: 1,
    selection: nextSelection,
  });

  frameSelection(nextSelection);
}

self.onmessage = handleMessage;

/* ============================================================
   CAMERA HELPERS
   ============================================================ */

function applyCameraTransform() {
  const tx = camera.x;
  const ty = camera.y;
  const scale = camera.zoom;

  for (const container of [
    linksContainer,
    glowContainer,
    nodesContainer,
    ringsContainer,
    labelsContainer,
    effectsContainer,
  ]) {
    if (!container) continue;
    container.position.set(tx, ty);
    container.scale.set(scale);
  }

}

function getCameraConfig() {
  return {
    minZoom: MIN_CAMERA_ZOOM,
    maxZoom: MAX_CAMERA_ZOOM,
    maxFitZoom: MAX_FIT_ZOOM,
    framePadding: CAMERA_FRAME_PADDING,
    nodePadding: CAMERA_NODE_PADDING,
    viewportWidth: app?.renderer.width ?? 0,
    viewportHeight: app?.renderer.height ?? 0,
  };
}

function getGraphBounds(): OrbitMapGraphBounds | null {
  return getOrbitMapGraphBounds(nodeData, CAMERA_NODE_PADDING);
}

function clampZoom(nextZoom: number): number {
  return clampOrbitMapZoom(nextZoom, getGraphBounds(), getCameraConfig());
}

function constrainCamera() {
  camera = constrainCameraState(camera);
}

function constrainCameraState(nextCamera: typeof camera): typeof camera {
  return constrainOrbitMapCameraState(
    nextCamera,
    getGraphBounds(),
    getCameraConfig()
  );
}

function autoFitCamera(width: number, height: number) {
  cameraUserAdjusted = false;
  if (!currentGraph || nodeData.length === 0) {
    camera = { x: 0, y: 0, zoom: 1 };
    return;
  }

  const bounds = getGraphBounds();
  if (!bounds) return;

  const fitZoom = getOrbitMapFitZoom(bounds, getCameraConfig());
  if (width < PHONE_FIT_MAX_WIDTH) {
    // Phones: fitting a whole library makes every disc unreadably small.
    // Open on the queue at a size you can read and tap; pinch out for the rest.
    camera.zoom = Math.min(MAX_FIT_ZOOM, Math.max(fitZoom, fitZoom * PHONE_FIT_ZOOM_BOOST));
    const coreDatum = nodeData.find((datum) => datum.kind === 'core');
    const focusX = coreDatum?.x ?? (bounds.minX + bounds.maxX) / 2;
    const focusY = coreDatum?.y ?? (bounds.minY + bounds.maxY) / 2;
    camera.x = width / 2 - focusX * camera.zoom;
    camera.y = height * 0.52 - focusY * camera.zoom;
    constrainCamera();
    return;
  }

  // Large libraries keep the overview inside the hub-first LOD band, so the
  // initial constellation reads clearly and the whole graph is one small
  // zoom-out away.
  camera.zoom = Math.min(
    MAX_FIT_ZOOM,
    Math.max(
      fitZoom,
      Math.min(ORBIT_MAP_LOD_FAR_MAX_ZOOM * 0.96, fitZoom * 1.22)
    )
  );
  camera.x = (width / 2) - ((bounds.minX + bounds.maxX) / 2) * camera.zoom;
  camera.y = (height / 2) - ((bounds.minY + bounds.maxY) / 2) * camera.zoom;
  constrainCamera();
}

/* ============================================================ */
