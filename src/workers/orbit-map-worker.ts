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

import type { OrbitGraphPayload, OrbitGraphNode } from '@/types';
import type { GraphFilter, OrbitMapSelection } from '@/lib/orbit-worker-protocol';
import {
  buildOrbitMapSearchIndex,
  searchOrbitMapIndex,
  type OrbitMapSearchIndexEntry,
} from '@/lib/orbit-map-search';
import {
  getOrbitMapLabelFill,
  getOrbitMapPalette,
  parseHexColorToNumber,
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
  getOrbitMapClusterRingRadii,
  type OrbitMapCluster,
} from './orbit-map-cluster-layout';
import {
  getOrbitMapBookmarkLodAlpha,
  getOrbitMapClusterHaloAlpha,
  getOrbitMapEdgeLodAlpha,
  getOrbitMapViewBounds,
  isInOrbitMapViewBounds,
  ORBIT_MAP_LOD_FAR_MAX_ZOOM,
  type OrbitMapViewBounds,
} from './orbit-map-lod';
import {
  declutterOrbitMapLabels,
  getOrbitMapLabelPriority,
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
  applyOrbitMapStarfieldParallax,
  buildOrbitMapStarfield,
  createOrbitMapGlowTexture,
  createOrbitMapNebulaTexture,
  createOrbitMapSeededRandom,
  createOrbitMapVignetteSprite,
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

// Pixi containers for organization
let backgroundContainer: Container | null = null; // Screen-space vignette (not camera-transformed)
let starfieldContainer: Container | null = null;  // Distant stars with layered parallax
let nebulaContainer: Container | null = null;     // Per-cluster nebula haze (camera space)
let linksContainer: Container | null = null;
let glowContainer: Container | null = null;       // Cluster halos + hub glows (camera space)
let nodesContainer: Container | null = null;
let ringsContainer: Container | null = null;      // Selection / neighbor highlight rings
let labelsContainer: Container | null = null;
let effectsContainer: Container | null = null;    // Temporary effects (pulses, flights)
let linkGraphics: Graphics | null = null;
let ringGraphics: Graphics | null = null;
/** Star-chart lines between related hubs; visible only at far zoom. */
let constellationGraphics: Graphics | null = null;
// Pooled effect layers, cleared per frame instead of destroyed/recreated so
// animation frames don't churn Pixi objects (GC + GPU geometry pressure).
let effectsGraphics: Graphics | null = null;         // pulses, flight paths, ghosts
let effectsAdditiveGraphics: Graphics | null = null; // flow particles, comet trails
let vignetteSprite: Sprite | null = null;
let glowTexture: Texture | null = null;
let nebulaTexture: Texture | null = null;
const glowSpriteMap = new Map<string, Sprite>();
const haloSpriteMap = new Map<string, Sprite>();

// One-shot entrance fade-in (per worker lifetime, i.e. per page visit)
let hasPlayedEntrance = false;
let entranceStartedAt: number | null = null;
const ENTRANCE_NODE_FADE_MS = 380;
const ENTRANCE_MAX_DELAY_MS = 420;
const ENTRANCE_BASE_DELAY_MS = 180;
const ENTRANCE_TOTAL_MS =
  ENTRANCE_BASE_DELAY_MS + ENTRANCE_MAX_DELAY_MS + ENTRANCE_NODE_FADE_MS;
const HUB_GLOW_ALPHA_DARK = 0.3;
const HUB_GLOW_ALPHA_LIGHT = 0.38;
/** Clusters below this size don't get a nebula haze. */
const NEBULA_MIN_CLUSTER_MEMBERS = 3;
/** Segments per focused edge when drawing its color gradient. */
const GRADIENT_EDGE_SEGMENTS = 10;
/** Energy-flow particles: travel period, per-edge count, and edge cap. */
const FLOW_PARTICLE_PERIOD_MS = 1400;
const FLOW_PARTICLES_PER_EDGE = 2;
const FLOW_MAX_EDGES = 60;
/** Rotation speed (radians/second) of the selection reticle arcs. */
const SELECTION_RING_SPIN = 1.4;
/** Rotation speed (radians/second) of the dashed cluster boundary ring. */
const CLUSTER_RING_SPIN = 0.3;
/** Duration of the edge trace-in after a selection lands. */
const EDGE_REVEAL_MS = 340;
/** Ambient frames (reticle spin, particles, breathing) cap at ~30fps; the
 * motion is slow enough that this halves GPU work with no visible cost. */
const AMBIENT_FRAME_MIN_MS = 32;
/** Period of the selected hub's glow breathing. */
const GLOW_BREATH_PERIOD_MS = 2400;
/** Nodes scale from this factor to 1 during the entrance fade. */
const ENTRANCE_SCALE_START = 0.62;
/** Instant scale applied to the hovered node (no selection active). */
const HOVER_POP_SCALE = 1.06;

/** Hubs must share at least this many bookmarks to be constellation-linked. */
const CONSTELLATION_MIN_SHARED = 2;
/** Cap on constellation lines (strongest pairs win). */
const CONSTELLATION_MAX_LINES = 40;

// === Cosmic events (meteors + radar sweep) ===
/** Max new bookmarks that fly in as meteors on a refetch; more than this
 * reads as navigation (scope switch, first load), not arrivals. */
const METEOR_MAX_ARRIVALS = 12;
/** Stagger between consecutive meteor launches. */
const METEOR_STAGGER_MS = 140;
/** Meteor flight duration (before per-meteor jitter). */
const METEOR_DURATION_MS = 950;
/** A meteor batch at least this big also plays the radar sweep. */
const SWEEP_METEOR_THRESHOLD = 3;
// Labels
const labelMap = new Map<string, BitmapText>();

// Graph scene data (positions come from the deterministic cluster layout)
let nodeData: MapNode[] = [];
let nodeById = new Map<string, MapNode>();
let linkData: MapLink[] = [];
let clusters = new Map<string, OrbitMapCluster>();
/** Nodes currently visible under filter + LOD (the hit-testable set). */
let hitTestNodes: MapNode[] = [];
const hitIndex = createOrbitMapSpatialIndex<MapNode>();

// Camera state (position + zoom)
let camera = { x: 0, y: 0, zoom: 1 };
/** Bumped to cancel any in-flight camera animation. */
let cameraAnimationToken = 0;
/** Scope the camera was last auto-fitted for (preserved across refetches). */
let lastFittedScope: string | null = null;

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
  type: 'assign' | 'pulse' | 'return' | 'meteor';
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
}

const activeAnimations: MapAnimation[] = [];
let renderLoopRunning = false;
/** Transient render-frame failures tolerated before the loop gives up. */
const MAX_CONSECUTIVE_FRAME_ERRORS = 30;
let consecutiveFrameErrors = 0;

/** Focused-edge curves cached by drawLinks for the energy-flow particles. */
interface FocusedEdgeCurve {
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  color: number;
}
const focusedEdgeCurves: FocusedEdgeCurve[] = [];

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

function getPalette() {
  return getOrbitMapPalette(colorMode, accentHex, backgroundHex);
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

function getHubGlowAlpha() {
  return colorMode === 'light' ? HUB_GLOW_ALPHA_LIGHT : HUB_GLOW_ALPHA_DARK;
}

function getPaletteAccent(): number {
  return parseHexColorToNumber(accentHex, colorMode === 'light' ? 0x2563eb : 0x2f6fed);
}

/** White glyphs + per-label tint so theme switches stay legible. */
function ensureOrbitLabelFont() {
  try {
    BitmapFont.uninstall('OrbitLabel');
  } catch {
    // First install or partial init.
  }
  BitmapFont.install({
    name: 'OrbitLabel',
    style: {
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: LABEL_BASE_FONT_SIZE,
      fill: 0xffffff,
    },
    chars: BitmapFontManager.ASCII,
  });
}

function resetLabelPool() {
  if (!labelsContainer) return;
  for (const label of labelMap.values()) {
    labelsContainer.removeChild(label);
    label.destroy();
  }
  labelMap.clear();
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
  findHit: (point, padding) => hitIndex.query(point, padding),
  getNodeById: () => nodeById,
  getCamera: () => camera,
  panBy: (dx, dy) => {
    cancelCameraAnimation();
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
});

const living = createOrbitMapLivingRuntime({
  getNodeById: () => nodeById,
  getNodeData: () => nodeData,
  getDraggingNodeId: () => interactions.getDraggingNodeId(),
  getAnimatedNodeIds: () =>
    activeAnimations.length > 0
      ? new Set(activeAnimations.map((anim) => anim.nodeId))
      : null,
  getGlowContainer: () => glowContainer,
  getGlowTexture: () => glowTexture,
  getAdditiveBlendMode,
  hasApp: () => app !== null,
});

const sweep = createOrbitMapScanSweep({
  getNodeById: () => nodeById,
  getNodeData: () => nodeData,
  getGraphBounds,
  getMeteorLanding: (nodeId) => {
    for (const anim of activeAnimations) {
      if (
        anim.type === 'meteor' &&
        anim.nodeId === nodeId &&
        anim.targetX !== undefined &&
        anim.targetY !== undefined
      ) {
        return { x: anim.targetX, y: anim.targetY };
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

      // Install a BitmapFont once for fast, high-quality labels
      ensureOrbitLabelFont();

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
  layoutVignette(msg.width, msg.height);
  constrainCamera();
  updateNodeStyles();
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
  if (msg.enabled) {
    living.buildSunCorona();
    startRenderLoop();
  } else {
    living.clearSunCorona();
  }
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
  applyColorMode();
}

function applyColorMode() {
  const palette = getPalette();
  if (app) {
    app.renderer.background.color = palette.background;
  }
  ensureOrbitLabelFont();
  resetLabelPool();
  refreshBackgroundAtmosphere();
  const blendMode = getAdditiveBlendMode();
  for (const glow of glowSpriteMap.values()) glow.blendMode = blendMode;
  for (const halo of haloSpriteMap.values()) halo.blendMode = blendMode;
  living.setFlareBlendMode(blendMode);
  if (effectsAdditiveGraphics) effectsAdditiveGraphics.blendMode = blendMode;
  buildNebulaField();
  if (currentGraph) {
    reapplyAllNodeVisuals();
    rebuildLinkDataFromGraph();
    buildConstellations();
  }
  updateNodeStyles();
  if (app) {
    app.renderer.render(app.stage);
  }
}

function refreshBackgroundAtmosphere() {
  if (!app || !backgroundContainer || !starfieldContainer) return;

  if (vignetteSprite) {
    backgroundContainer.removeChild(vignetteSprite);
    vignetteSprite.destroy({ texture: true });
    vignetteSprite = null;
  }

  vignetteSprite = createOrbitMapVignetteSprite(colorMode, getPaletteAccent());
  backgroundContainer.addChildAt(vignetteSprite, 0);
  layoutVignette(app.renderer.width, app.renderer.height);
  buildOrbitMapStarfield(starfieldContainer, colorMode, getPaletteAccent());
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
    launchMeteorArrivals(previousBookmarkIds, previousScope);
  }

  knownBookmarkIds = new Set(
    msg.graph.nodes
      .filter((node) => node.kind === 'bookmark')
      .map((node) => node.id)
  );
  lastGraphScope = msg.graph.scope ?? 'library';

  applyActiveSearch();
}

/**
 * New bookmarks in a refetched graph streak in from beyond the belt as
 * meteors instead of popping into place. Guarded so navigation moments
 * (first graph, scope switch, bulk changes) stay quiet: this fires for
 * genuine arrivals — e.g. a sync landing while the map is open.
 */
function launchMeteorArrivals(
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
    // Exceeding the cap means this is a bulk change (import, big sync) —
    // navigation-scale, not arrivals. Stay quiet entirely rather than
    // raining a token 12 meteors while the rest pop in place.
    if (arrivals.length >= METEOR_MAX_ARRIVALS) return;
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
      ) *
        1.2 +
      240
    : 1600;

  const now = Date.now();
  arrivals.forEach((datum, index) => {
    // Radial entry roughly from the node's own direction, skewed so the
    // streak crosses some sky before capture.
    const seed = hashOrbitMapStringToSeed(datum.id);
    const targetX = datum.x;
    const targetY = datum.y;
    const baseAngle = Math.atan2(targetY, targetX);
    const entryAngle = baseAngle + (((seed % 1000) / 1000) - 0.5) * 0.9;
    const fromX = Math.cos(entryAngle) * entryDistance;
    const fromY = Math.sin(entryAngle) * entryDistance;
    const dx = targetX - fromX;
    const dy = targetY - fromY;
    const len = Math.hypot(dx, dy);
    const side = seed % 2 === 0 ? 1 : -1;
    const bend = len * 0.12 * side;

    removeAnimationsFor(datum.id, 'meteor');
    // Park the node at its entry point until its (staggered) launch.
    datum.x = fromX;
    datum.y = fromY;
    activeAnimations.push({
      id: `meteor-${datum.id}-${now}`,
      type: 'meteor',
      nodeId: datum.id,
      startTime: now + index * METEOR_STAGGER_MS,
      duration: METEOR_DURATION_MS + (seed % 400),
      fromX,
      fromY,
      targetX,
      targetY,
      controlX: (fromX + targetX) / 2 - (len > 1 ? (dy / len) * bend : 0),
      controlY: (fromY + targetY) / 2 + (len > 1 ? (dx / len) * bend : 0),
    });
  });

  if (arrivals.length >= SWEEP_METEOR_THRESHOLD) {
    sweep.start(arrivals.map((datum) => datum.id));
  }
  startRenderLoop();
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

function createGlowForNode(datum: MapNode) {
  if (!glowTexture || !glowContainer || glowSpriteMap.has(datum.id)) return;
  const glow = new Sprite(glowTexture);
  glow.anchor.set(0.5);
  glow.tint = datum.visual.color;
  glow.blendMode = getAdditiveBlendMode();
  glow.alpha = getHubGlowAlpha();
  const glowSize = datum.radius * 6;
  glow.width = glowSize;
  glow.height = glowSize;
  glow.position.set(datum.x, datum.y);
  glowContainer.addChild(glow);
  glowSpriteMap.set(datum.id, glow);
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
  destroyContainerChildren(nebulaContainer);
  destroyContainerChildren(starfieldContainer);
  destroyContainerChildren(backgroundContainer);

  try {
    BitmapFont.uninstall('OrbitLabel');
  } catch {
    // Font may not have been installed if init failed midway.
  }

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
  hasPlayedEntrance = false;
  entranceStartedAt = null;
  camera = { x: 0, y: 0, zoom: 1 };

  labelMap.clear();
  nodeGraphicsMap.clear();
  glowSpriteMap.clear();
  haloSpriteMap.clear();
  nodeById.clear();

  backgroundContainer = null;
  starfieldContainer = null;
  nebulaContainer = null;
  linksContainer = null;
  constellationGraphics = null;
  glowContainer = null;
  nodesContainer = null;
  ringsContainer = null;
  labelsContainer = null;
  effectsContainer = null;
  linkGraphics = null;
  ringGraphics = null;
  vignetteSprite = null;
  glowTexture = null;
  nebulaTexture = null;
  effectsGraphics = null;
  effectsAdditiveGraphics = null;
  living.reset();
  sweep.reset();
  focusedEdgeCurves.length = 0;
  edgeRevealStartedAt = null;
  knownBookmarkIds = null;
  lastGraphScope = null;
  app = null;
  isInitialized = false;
}

/* ============================================================
   SCENE CONSTRUCTION
   ============================================================ */

function layoutVignette(width: number, height: number) {
  if (!vignetteSprite) return;
  vignetteSprite.position.set(width / 2, height / 2);
  const diameter = Math.max(width, height) * 1.5;
  vignetteSprite.width = diameter;
  vignetteSprite.height = diameter;
}

/** Builds the vignette + starfield once per worker lifetime. */
function buildBackground() {
  if (!app || !backgroundContainer || !starfieldContainer) return;

  glowTexture = glowTexture ?? createOrbitMapGlowTexture();
  const accent = getPaletteAccent();

  if (!vignetteSprite) {
    vignetteSprite = createOrbitMapVignetteSprite(colorMode, accent);
    backgroundContainer.addChild(vignetteSprite);
  }
  layoutVignette(app.renderer.width, app.renderer.height);
  buildOrbitMapStarfield(starfieldContainer, colorMode, accent);
}

/**
 * Faint tinted haze behind each sizable cluster, in the hub's color: gives
 * the far-zoom view a galaxy-map depth and signals cluster identity before
 * labels are readable. Static sprites — no per-frame cost.
 */
function buildNebulaField() {
  if (!nebulaContainer) return;
  destroyContainerChildren(nebulaContainer);
  if (clusters.size === 0) return;

  nebulaTexture = nebulaTexture ?? createOrbitMapNebulaTexture();
  const blendMode = getAdditiveBlendMode();
  const baseAlpha = colorMode === 'light' ? 0.09 : 0.085;

  for (const cluster of clusters.values()) {
    if (cluster.memberCount < NEBULA_MIN_CLUSTER_MEMBERS) continue;
    const anchorDatum = nodeById.get(cluster.anchorId);
    if (!anchorDatum) continue;

    const random = createOrbitMapSeededRandom(
      hashOrbitMapStringToSeed(cluster.anchorId)
    );
    // Two overlapping puffs (one large centered-ish, one smaller offset) so
    // the haze reads organic rather than concentric with the halo.
    for (let i = 0; i < 2; i++) {
      const sprite = new Sprite(nebulaTexture);
      sprite.anchor.set(0.5);
      sprite.tint = anchorDatum.visual.color;
      sprite.blendMode = blendMode;
      const angle = random() * Math.PI * 2;
      const dist = random() * cluster.radius * (i === 0 ? 0.3 : 0.75);
      const size =
        cluster.radius * (i === 0 ? 3.4 + random() * 0.9 : 2.1 + random() * 0.7);
      sprite.width = size;
      sprite.height = size;
      sprite.position.set(
        cluster.x + Math.cos(angle) * dist,
        cluster.y + Math.sin(angle) * dist
      );
      sprite.alpha = baseAlpha * (i === 0 ? 1 : 0.8);
      nebulaContainer.addChild(sprite);
    }
  }
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
  destroyContainerChildren(nebulaContainer);
  destroyContainerChildren(linksContainer);
  if (glowContainer) {
    destroyContainerChildren(glowContainer);
    glowSpriteMap.clear();
    haloSpriteMap.clear();
  }
  destroyContainerChildren(nodesContainer);
  destroyContainerChildren(ringsContainer);
  if (labelsContainer) {
    destroyContainerChildren(labelsContainer);
    labelMap.clear();
  }
  destroyContainerChildren(effectsContainer);
  linkGraphics = null;
  ringGraphics = null;
  constellationGraphics = null;
  effectsGraphics = null;
  effectsAdditiveGraphics = null;
  living.discardCoronaSprites();
  nodeGraphicsMap.clear();
  nodeById.clear();
  activeAnimations.length = 0;

  // Container creation order defines z-order:
  // background → starfield → nebula → links → glow → nodes → rings → labels → effects
  if (!backgroundContainer) {
    backgroundContainer = new Container();
    app.stage.addChild(backgroundContainer);
  }
  if (!starfieldContainer) {
    starfieldContainer = new Container();
    app.stage.addChild(starfieldContainer);
  }
  if (!nebulaContainer) {
    nebulaContainer = new Container();
    app.stage.addChild(nebulaContainer);
  }
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
  }
  living.buildOrbitStates(layout.orbits);

  nodeById = new Map(nodeData.map((datum) => [datum.id, datum]));
  applyHubLabelRanks();
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
 * node, hub glows, and one soft halo per cluster (the far-zoom stand-in for
 * its bookmarks). Per-frame updates mutate these instead of recreating them.
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

  // Constellation lines sit under the bookmark edges.
  constellationGraphics = new Graphics();
  linksContainer.addChild(constellationGraphics);
  buildConstellations();

  linkGraphics = new Graphics();
  linksContainer.addChild(linkGraphics);

  ringGraphics = new Graphics();
  ringsContainer.addChild(ringGraphics);

  effectsGraphics = new Graphics();
  effectsContainer.addChild(effectsGraphics);
  effectsAdditiveGraphics = new Graphics();
  effectsAdditiveGraphics.blendMode = getAdditiveBlendMode();
  effectsContainer.addChild(effectsAdditiveGraphics);

  buildNebulaField();

  // Cluster halos go in first so hub glows render above them.
  if (glowTexture) {
    for (const cluster of clusters.values()) {
      if (cluster.memberCount === 0) continue;
      const anchorDatum = nodeById.get(cluster.anchorId);
      if (!anchorDatum) continue;
      const halo = new Sprite(glowTexture);
      halo.anchor.set(0.5);
      halo.tint = anchorDatum.visual.color;
      halo.blendMode = getAdditiveBlendMode();
      const size = cluster.radius * 2.6;
      halo.width = size;
      halo.height = size;
      halo.position.set(cluster.x, cluster.y);
      halo.alpha = 0;
      glowContainer.addChild(halo);
      haloSpriteMap.set(cluster.anchorId, halo);
    }
  }

  for (const datum of nodeData) {
    const g = new Graphics();
    drawNodeShape(g, datum);

    g.position.set(datum.x, datum.y);
    nodesContainer.addChild(g);
    nodeGraphicsMap.set(datum.id, g);

    // Soft glow under hubs, tinted to match.
    if (datum.visual.isHub) {
      createGlowForNode(datum);
    }
  }

  living.buildSunCorona();
}

/**
 * Star-chart lines between hubs that share bookmarks, drawn once per scene
 * (hubs never move). updateNodeStyles fades the whole layer in only at far
 * zoom, where clusters read as constellations — zero per-frame draw cost.
 */
function buildConstellations() {
  if (!constellationGraphics || !currentGraph) return;
  constellationGraphics.clear();

  // Count shared bookmarks per hub pair.
  const bookmarkHubs = new Map<string, string[]>();
  for (const edge of currentGraph.edges) {
    if (edge.kind !== 'bookmark-tag' && edge.kind !== 'bookmark-collection') {
      continue;
    }
    const hubId = edge.kind === 'bookmark-tag' ? edge.tagId : edge.collectionId;
    const list = bookmarkHubs.get(edge.bookmarkId);
    if (list) list.push(hubId);
    else bookmarkHubs.set(edge.bookmarkId, [hubId]);
  }

  const pairWeights = new Map<string, number>();
  for (const hubIds of bookmarkHubs.values()) {
    for (let i = 0; i < hubIds.length; i++) {
      for (let j = i + 1; j < hubIds.length; j++) {
        const key =
          hubIds[i] < hubIds[j]
            ? `${hubIds[i]}|${hubIds[j]}`
            : `${hubIds[j]}|${hubIds[i]}`;
        pairWeights.set(key, (pairWeights.get(key) ?? 0) + 1);
      }
    }
  }

  const strongest = [...pairWeights.entries()]
    .filter(([, weight]) => weight >= CONSTELLATION_MIN_SHARED)
    .sort((a, b) => b[1] - a[1])
    .slice(0, CONSTELLATION_MAX_LINES);

  const starColor = getPalette().labelNeighbor;
  for (const [key, weight] of strongest) {
    const [aId, bId] = key.split('|');
    const a = nodeById.get(aId);
    const b = nodeById.get(bId);
    if (!a || !b) continue;
    constellationGraphics.moveTo(a.x, a.y);
    constellationGraphics.lineTo(b.x, b.y);
    constellationGraphics.stroke({
      width: 1,
      color: starColor,
      alpha:
        (colorMode === 'light' ? 0.18 : 0.1) +
        Math.min(colorMode === 'light' ? 0.22 : 0.16, weight * 0.03),
    });
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

function applyBookmarkAccentColors() {
  for (const datum of nodeData) {
    if (datum.kind !== 'bookmark') continue;
    const neighbors = adjacency.get(datum.id);
    if (!neighbors) continue;

    const baseVisual = getOrbitMapNodeVisualStyle(datum.node, getPalette());
    let accent: number | null = null;
    let collectionAccent: number | null = null;
    for (const neighborId of neighbors) {
      const hub = nodeById.get(neighborId);
      if (!hub) continue;
      if (hub.kind === 'tag') {
        accent = hub.visual.color;
        break;
      }
      if (hub.kind === 'collection' && collectionAccent === null) {
        collectionAccent = hub.visual.color;
      }
    }
    accent = accent ?? collectionAccent;
    datum.visual =
      accent !== null
        ? {
            ...baseVisual,
            color: mixOrbitMapColors(
              baseVisual.color,
              accent,
              colorMode === 'light' ? 0.52 : 0.62
            ),
            strokeColor: mixOrbitMapColors(
              baseVisual.strokeColor,
              accent,
              colorMode === 'light' ? 0.4 : 0.5
            ),
          }
        : baseVisual;
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

function drawNodeShape(g: Graphics, datum: MapNode) {
  g.clear();
  const visualStyle = datum.visual;
  const palette = getPalette();

  if (visualStyle.isHub) {
    const hubFillAlpha = colorMode === 'light' ? 0.38 : 0.24;
    const hubStrokeAlpha = colorMode === 'light' ? 0.96 : 0.78;
    g.circle(0, 0, datum.radius + 1.5);
    g.fill({ color: visualStyle.color, alpha: hubFillAlpha });
    g.stroke({
      width: visualStyle.strokeWidth,
      color: visualStyle.strokeColor,
      alpha: hubStrokeAlpha,
    });
    g.circle(0, 0, Math.max(3.2, datum.radius * 0.44));
    g.fill({ color: visualStyle.color, alpha: 1 });
    g.stroke({ width: 1, color: palette.hubInnerStroke, alpha: 0.43 });
  } else {
    const nodeStrokeAlpha = colorMode === 'light' ? 0.92 : 0.72;
    g.circle(0, 0, datum.radius);
    g.fill({ color: visualStyle.color, alpha: 1 });
    g.stroke({
      width: visualStyle.strokeWidth,
      color: visualStyle.strokeColor,
      alpha: nodeStrokeAlpha,
    });
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
    const nextGlow = glowSpriteMap.get(datum.id);
    if (glowTexture && nextGlow) {
      nextGlow.tint = datum.visual.color;
      const glowSize = datum.radius * 6;
      nextGlow.width = glowSize;
      nextGlow.height = glowSize;
      nextGlow.position.set(datum.x, datum.y);
    }
  } else if (glow) {
    destroyGlowForNode(datum.id);
  }
}

/**
 * Preserves layout positions and Pixi objects when only node metadata changed
 * (titles, counts, colors) but topology stayed the same.
 */
function updateSceneMetadata() {
  if (!app || !currentGraph) return;

  perf.mark('graph:update-metadata', {
    nodes: currentGraph.nodes.length,
    edges: currentGraph.edges.length,
  });

  let hubVisualChanged = false;

  for (const graphNode of currentGraph.nodes) {
    const datum = nodeById.get(graphNode.id);
    if (!datum) continue;

    const previousRadius = datum.radius;
    const previousVisual = datum.visual;
    datum.node = graphNode;
    datum.radius = getOrbitMapNodeRadius(graphNode);
    datum.visual = getOrbitMapNodeVisualStyle(graphNode, getPalette());

    if (
      datum.radius !== previousRadius ||
      datum.visual.color !== previousVisual.color ||
      datum.visual.strokeColor !== previousVisual.strokeColor ||
      datum.visual.strokeWidth !== previousVisual.strokeWidth ||
      datum.visual.isHub !== previousVisual.isHub
    ) {
      if (datum.kind === 'tag' || datum.kind === 'collection') {
        hubVisualChanged = true;
      }
      redrawNodeGraphics(datum);
    }
  }

  nodeData = currentGraph.nodes.map((node) => nodeById.get(node.id)!);
  applyHubLabelRanks();
  applyBookmarkAccentColors();
  if (hubVisualChanged) {
    for (const datum of nodeData) {
      if (datum.kind === 'bookmark') redrawNodeGraphics(datum);
    }
  }
  rebuildLinkDataFromGraph();

  updateNodeStyles();
  sendLayoutUpdate(true);
}

/* ============================================================
   STYLING / RENDERING (filter + LOD + focus dimming)
   ============================================================ */

function getFocusContext() {
  const activeId = currentSelection?.id || interactions.getHover()?.id || null;
  return {
    activeId,
    hasSelection: Boolean(currentSelection),
    neighborIds: activeId ? adjacency.get(activeId) || new Set<string>() : new Set<string>(),
  };
}

type FocusContext = ReturnType<typeof getFocusContext>;

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
  const haloLodAlpha =
    currentFilter === 'all' ? getOrbitMapClusterHaloAlpha(zoom) : 0;
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
      g.position.set(datum.x, datum.y);
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
      glow.visible = visible;
      if (visible) {
        glow.alpha =
          getHubGlowAlpha() * alpha * getEntranceFactor(datum, entranceElapsed);
        glow.position.set(datum.x, datum.y);
      }
    }
  }
  hitIndex.rebuild(hitTestNodes);

  // Cluster halos: the far-zoom stand-in for each hub's bookmarks.
  for (const [anchorId, halo] of haloSpriteMap) {
    const cluster = clusters.get(anchorId);
    const anchorDatum = nodeById.get(anchorId);
    if (!cluster || !anchorDatum) {
      halo.visible = false;
      continue;
    }
    const anchorAlpha = getNodeAlpha(anchorDatum, focusContext, 1);
    const intensity = 0.14 + Math.min(0.2, cluster.memberCount * 0.004);
    const alpha =
      haloLodAlpha *
      intensity *
      anchorAlpha *
      getEntranceFactor(anchorDatum, entranceElapsed);
    halo.visible =
      alpha > 0.005 && isInOrbitMapViewBounds(cluster.x, cluster.y, bounds);
    if (halo.visible) halo.alpha = alpha;
  }

  const atmosphereAlpha =
    entranceElapsed === null
      ? 1
      : easeOrbitMapOutCubic(Math.min(entranceElapsed / 800, 1));
  if (linksContainer) linksContainer.alpha = atmosphereAlpha;
  if (nebulaContainer) {
    // Depth cue: nebulae are strongest far out and recede as dots take over.
    nebulaContainer.alpha =
      atmosphereAlpha * (0.45 + 0.55 * getOrbitMapClusterHaloAlpha(zoom));
  }
  if (constellationGraphics) {
    // Star-chart band: constellation lines exist only at galaxy zoom.
    constellationGraphics.alpha =
      atmosphereAlpha * getOrbitMapClusterHaloAlpha(zoom);
  }

  drawLinks(focusContext, bounds);
  drawRings(focusContext);
  updateLabels(focusContext);
  renderEffects();

  applyCameraTransform();
  app.renderer.render(app.stage);

  // Time-based visuals (living-map orbits, reticle spin, edge particles)
  // keep the loop alive. No-op if already running.
  if (hasAmbientMotion() || isLivingActive()) startRenderLoop();
}

function drawLinks(focusContext: FocusContext, bounds: OrbitMapViewBounds | null) {
  if (!linkGraphics) return;

  const edgeLodAlpha = getOrbitMapEdgeLodAlpha(camera.zoom);
  const palette = getPalette();
  linkGraphics.clear();
  focusedEdgeCurves.length = 0;

  // Living map redraws ambient edges every motion frame; straight two-tone
  // spokes skip the curve tessellation and read naturally in an orrery.
  // (Focused edges keep their gradient curves in both modes.)
  const fastEdges = isLivingActive();

  // Trace-in: after a selection lands, focused edges sweep bookmark→hub over
  // EDGE_REVEAL_MS. Cleared here on the frame that draws the full length so
  // the loop condition and the drawn state can't disagree.
  let reveal = 1;
  if (edgeRevealStartedAt !== null) {
    const rawReveal = Math.min(
      1,
      (Date.now() - edgeRevealStartedAt) / EDGE_REVEAL_MS
    );
    if (rawReveal >= 1) edgeRevealStartedAt = null;
    reveal = easeOrbitMapOutCubic(rawReveal);
  }

  for (const link of linkData) {
    const { source, target } = link;
    if (!matchesFilter(source) || !matchesFilter(target)) continue;

    const touchesActive =
      Boolean(focusContext.activeId) &&
      (source.id === focusContext.activeId || target.id === focusContext.activeId);

    // LOD: non-focused edges dissolve as you zoom out.
    if (!touchesActive && edgeLodAlpha <= 0.02) continue;
    // Viewport culling: skip edges entirely outside the visible area.
    if (
      !touchesActive &&
      !isInOrbitMapViewBounds(source.x, source.y, bounds) &&
      !isInOrbitMapViewBounds(target.x, target.y, bounds)
    ) {
      continue;
    }

    const sx = source.x;
    const sy = source.y;
    const tx = target.x;
    const ty = target.y;
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;

    // Gentle quadratic curve (perpendicular bend ~8% of length) so dense
    // clusters read as organic threads rather than a wireframe.
    const bend = len * 0.08;
    const cx = (sx + tx) / 2 - (dy / len) * bend;
    const cy = (sy + ty) / 2 + (dx / len) * bend;

    if (touchesActive) {
      // Focused edges get a smooth bookmark→hub color gradient, drawn as a
      // short polyline with per-segment interpolated color.
      const startColor = mixOrbitMapColors(
        source.visual.color,
        palette.linkHighlightMix,
        0.3
      );
      const endColor = mixOrbitMapColors(link.color, palette.linkHighlightMix, 0.5);
      const linkAlpha = focusContext.hasSelection ? 0.86 : 0.42;
      const linkWidth = focusContext.hasSelection ? 2.05 : 1.35;

      let prevX = sx;
      let prevY = sy;
      for (let s = 1; s <= GRADIENT_EDGE_SEGMENTS; s++) {
        const segmentStart = (s - 1) / GRADIENT_EDGE_SEGMENTS;
        if (segmentStart >= reveal) break;
        // The segment at the sweep front fades in as the sweep crosses it.
        const tipFade = Math.min(1, (reveal - segmentStart) * GRADIENT_EDGE_SEGMENTS);
        const t = s / GRADIENT_EDGE_SEGMENTS;
        const nextX = getQuadraticPoint(sx, cx, tx, t);
        const nextY = getQuadraticPoint(sy, cy, ty, t);
        linkGraphics.moveTo(prevX, prevY);
        linkGraphics.lineTo(nextX, nextY);
        linkGraphics.stroke({
          width: linkWidth,
          color: mixOrbitMapColors(
            startColor,
            endColor,
            (s - 0.5) / GRADIENT_EDGE_SEGMENTS
          ),
          alpha: linkAlpha * tipFade,
          cap: 'round',
        });
        prevX = nextX;
        prevY = nextY;
      }

      // Cache the curve so the energy-flow particles can travel it.
      if (focusContext.hasSelection && focusedEdgeCurves.length < FLOW_MAX_EDGES) {
        focusedEdgeCurves.push({ sx, sy, cx, cy, tx, ty, color: endColor });
      }
      continue;
    }

    let linkAlpha = !focusContext.activeId
      ? colorMode === 'light'
        ? 0.38
        : 0.14
      : focusContext.hasSelection
        ? colorMode === 'light'
          ? 0.2
          : 0.075
        : colorMode === 'light'
          ? 0.24
          : 0.085;
    linkAlpha *= edgeLodAlpha;

    const ambientLinkWidth = colorMode === 'light' ? 1.05 : 0.85;

    // Ambient edges: two-tone gradient by splitting the curve at t=0.5 —
    // bookmark-colored near the bookmark, hub-colored near the hub.
    const sourceColor = mixOrbitMapColors(source.visual.color, link.color, 0.2);

    if (fastEdges) {
      const midX = (sx + tx) / 2;
      const midY = (sy + ty) / 2;
      linkGraphics.moveTo(sx, sy);
      linkGraphics.lineTo(midX, midY);
      linkGraphics.stroke({ width: ambientLinkWidth, color: sourceColor, alpha: linkAlpha });
      linkGraphics.moveTo(midX, midY);
      linkGraphics.lineTo(tx, ty);
      linkGraphics.stroke({ width: ambientLinkWidth, color: link.color, alpha: linkAlpha });
    } else {
      const midX = (sx + 2 * cx + tx) / 4;
      const midY = (sy + 2 * cy + ty) / 4;
      linkGraphics.moveTo(sx, sy);
      linkGraphics.quadraticCurveTo((sx + cx) / 2, (sy + cy) / 2, midX, midY);
      linkGraphics.stroke({ width: ambientLinkWidth, color: sourceColor, alpha: linkAlpha });
      linkGraphics.moveTo(midX, midY);
      linkGraphics.quadraticCurveTo((cx + tx) / 2, (cy + ty) / 2, tx, ty);
      linkGraphics.stroke({ width: ambientLinkWidth, color: link.color, alpha: linkAlpha });
    }
  }
}

/** Draws the active-selection and hub-neighbor highlight rings in world space. */
function drawRings(focusContext: FocusContext) {
  if (!ringGraphics) return;

  ringGraphics.clear();

  // Candidate hub while a bookmark is being dragged toward it
  const dropTargetId = interactions.getDropTargetId();
  if (dropTargetId) {
    const target = nodeById.get(dropTargetId);
    if (target) {
      ringGraphics.circle(target.x, target.y, target.radius + 12);
      ringGraphics.stroke({ width: 4, color: 0x34d399, alpha: 0.22 });
      ringGraphics.circle(target.x, target.y, target.radius + 7);
      ringGraphics.stroke({ width: 2.2, color: 0x34d399, alpha: 0.95 });
    }
  }

  if (!focusContext.activeId) return;

  // Orbit-shell guides: when a hub is selected, draw the cluster's actual
  // bookmark rings (matching the layout geometry) plus a slowly rotating
  // dashed boundary ring, tinted with the hub's color.
  if (
    currentSelection &&
    (currentSelection.kind === 'tag' || currentSelection.kind === 'collection')
  ) {
    const cluster = clusters.get(currentSelection.id);
    const anchor = nodeById.get(currentSelection.id);
    if (cluster && anchor && cluster.memberCount > 0) {
      const guideColor = anchor.visual.color;
      for (const shellRadius of getOrbitMapClusterRingRadii(
        anchor.radius,
        cluster.radius
      )) {
        ringGraphics.circle(cluster.x, cluster.y, shellRadius);
        ringGraphics.stroke({ width: 1, color: guideColor, alpha: 0.1 });
      }

      const dashAngle = (Date.now() % 3600000) / 1000 * CLUSTER_RING_SPIN;
      const boundaryRadius = cluster.radius + 8;
      for (let d = 0; d < 12; d++) {
        const dashStart = dashAngle + (d * Math.PI * 2) / 12;
        ringGraphics.arc(
          cluster.x,
          cluster.y,
          boundaryRadius,
          dashStart,
          dashStart + 0.22
        );
        ringGraphics.stroke({
          width: 1.2,
          color: guideColor,
          alpha: 0.4,
          cap: 'round',
        });
      }
    }
  }

  const active = nodeById.get(focusContext.activeId);
  if (active) {
    const ringColor = currentSelection ? 0xfacc15 : 0x38bdf8;
    if (focusContext.hasSelection) {
      // Selection reticle: soft halo ring + counter-rotating arcs, animated
      // by the ambient render loop that runs while a selection exists.
      const angle = (Date.now() % 3600000) / 1000 * SELECTION_RING_SPIN;
      ringGraphics.circle(active.x, active.y, active.radius + 10);
      ringGraphics.stroke({ width: 5, color: ringColor, alpha: 0.16 });
      for (const offset of [0, Math.PI]) {
        ringGraphics.arc(
          active.x,
          active.y,
          active.radius + 6,
          angle + offset,
          angle + offset + 2.1
        );
        ringGraphics.stroke({ width: 2.4, color: ringColor, alpha: 0.95, cap: 'round' });
      }
      ringGraphics.arc(
        active.x,
        active.y,
        active.radius + 10.5,
        -angle * 0.6,
        -angle * 0.6 + 1.2
      );
      ringGraphics.stroke({ width: 1.6, color: ringColor, alpha: 0.55, cap: 'round' });
    } else {
      ringGraphics.circle(active.x, active.y, active.radius + 10);
      ringGraphics.stroke({ width: 5, color: ringColor, alpha: 0.2 });
      ringGraphics.circle(active.x, active.y, active.radius + 6);
      ringGraphics.stroke({ width: 2.4, color: ringColor, alpha: 0.98 });
    }
  }

  if (focusContext.hasSelection) {
    for (const neighborId of focusContext.neighborIds) {
      const neighbor = nodeById.get(neighborId);
      if (!neighbor || !neighbor.visual.isHub) continue;
      ringGraphics.circle(neighbor.x, neighbor.y, neighbor.radius + 5);
      ringGraphics.stroke({ width: 1.6, color: 0x60a5fa, alpha: 0.58 });
    }
  }
}

/**
 * Labels with screen-space decluttering: hubs are always candidates,
 * bookmarks/overflow join above their LOD zoom, then a coarse grid keeps only
 * the highest-priority label per cell so nothing ever overlaps.
 */
function updateLabels(focusContext: FocusContext) {
  if (!labelsContainer || !app) return;

  const zoom = camera.zoom;
  const width = app.renderer.width;
  const height = app.renderer.height;

  const candidates: OrbitMapLabelCandidate[] = [];
  const candidateById = new Map<string, MapNode>();

  for (const datum of nodeData) {
    if (!matchesFilter(datum)) continue;
    const isActive = datum.id === focusContext.activeId;
    const isNeighbor = focusContext.neighborIds.has(datum.id);

    let eligible: boolean;
    if (datum.visual.isHub) {
      eligible = true;
    } else {
      eligible = shouldShowOrbitMapLabel(datum.kind, zoom, LABEL_ZOOM_THRESHOLD, {
        isActive,
        isSelectedNeighbor: focusContext.hasSelection && isNeighbor,
        importanceRank: datum.labelRank,
      });
    }
    if (!eligible) continue;

    candidates.push({
      id: datum.id,
      x: datum.x * zoom + camera.x,
      y: datum.y * zoom + camera.y,
      priority: getOrbitMapLabelPriority(datum.kind, {
        isActive,
        isSelectedNeighbor: focusContext.hasSelection && isNeighbor,
        importanceRank: datum.labelRank,
        recent: datum.node.kind === 'bookmark' ? datum.node.recent : false,
      }),
    });
    candidateById.set(datum.id, datum);
  }

  const winners = declutterOrbitMapLabels(candidates, {
    cellSize: ORBIT_MAP_LABEL_CELL_SIZE,
    width,
    height,
  });

  // Pool labels: hide out-of-view winners (don't destroy+recreate on every
  // pan/zoom tick — that was a multi-allocation-per-frame hot path).
  for (const [nodeId, label] of labelMap) {
    if (!winners.has(nodeId)) {
      label.visible = false;
    }
  }

  for (const nodeId of winners) {
    const datum = candidateById.get(nodeId);
    if (!datum) continue;
    const isActive = datum.id === focusContext.activeId;
    const isNeighbor = focusContext.neighborIds.has(nodeId);
    const labelText = getOrbitMapLabelText(datum.node);

    let label = labelMap.get(nodeId);
    if (!label) {
      label = new BitmapText({
        text: labelText,
        style: { fontFamily: 'OrbitLabel' },
      });
      label.anchor.set(0.5, 1); // bottom center
      labelMap.set(nodeId, label);
      labelsContainer.addChild(label);
    } else if (label.text !== labelText) {
      label.text = labelText;
    }

    label.tint = getOrbitMapLabelFill(
      getPalette(),
      isActive ? 'active' : isNeighbor ? 'neighbor' : 'default'
    );
    label.style.fontWeight = isActive ? '600' : '400';
    label.visible = true;

    positionLabel(label, datum, focusContext);
  }
}

function positionLabel(
  label: BitmapText,
  datum: MapNode,
  focusContext: FocusContext
) {
  const isActive = datum.id === focusContext.activeId;
  const isNeighbor = focusContext.neighborIds.has(datum.id);

  label.x = datum.x;
  label.y = datum.y - (datum.radius + (isActive ? 9 : 7));

  // Keep labels relatively stable on screen while their container follows camera zoom.
  const desiredScreenSize = isActive ? 9.2 : isNeighbor ? 8.4 : 8;
  const labelScale = Math.max(
    LABEL_MIN_WORLD_SCALE,
    Math.min(
      LABEL_MAX_WORLD_SCALE,
      desiredScreenSize / (LABEL_BASE_FONT_SIZE * Math.max(camera.zoom, 0.01))
    )
  );
  label.scale.set(labelScale);
  label.alpha =
    colorMode === 'light'
      ? 1
      : isActive
        ? 0.88
        : isNeighbor
          ? 0.72
          : camera.zoom < 1.15
            ? 0.56
            : 0.74;
}

function renderEffects() {
  if (!effectsGraphics || !effectsAdditiveGraphics) return;

  effectsGraphics.clear();
  effectsAdditiveGraphics.clear();

  // Energy-flow particles: bright dots travel bookmark→hub along the
  // selected node's edges (curves cached by drawLinks). They hold off while
  // the edge trace-in is still revealing the edges.
  if (currentSelection && !isEdgeRevealActive() && focusedEdgeCurves.length > 0) {
    const now = Date.now();
    const particleRadius = 2.3 / Math.max(0.55, Math.sqrt(camera.zoom));

    for (let edgeIndex = 0; edgeIndex < focusedEdgeCurves.length; edgeIndex++) {
      const curve = focusedEdgeCurves[edgeIndex];
      for (let p = 0; p < FLOW_PARTICLES_PER_EDGE; p++) {
        // Golden-ratio phase offsets so particles don't march in lockstep.
        const phase = (edgeIndex * 0.618 + p / FLOW_PARTICLES_PER_EDGE) % 1;
        const t = (now / FLOW_PARTICLE_PERIOD_MS + phase) % 1;
        const alpha = Math.sin(Math.PI * t) * 0.8;
        if (alpha < 0.03) continue;
        effectsAdditiveGraphics.circle(
          getQuadraticPoint(curve.sx, curve.cx, curve.tx, t),
          getQuadraticPoint(curve.sy, curve.cy, curve.ty, t),
          particleRadius
        );
        effectsAdditiveGraphics.fill({
          color: mixOrbitMapColors(curve.color, 0xffffff, 0.35),
          alpha,
        });
      }
    }
  }

  activeAnimations.forEach((anim) => {
    if (anim.type === 'pulse') {
      const datum = nodeById.get(anim.nodeId);
      if (!datum) return;

      const progress = getOrbitMapAnimationProgress(anim);

      // Multiple expanding rings with nice easing and falloff.
      for (let i = 0; i < 5; i++) {
        const ringProgress = Math.max(0, (progress * 1.7) - (i * 0.18));
        if (ringProgress <= 0) continue;

        const pulseRadius = datum.radius + (ringProgress * 48);
        const pulseAlpha = (1 - ringProgress) * (0.8 - i * 0.11);

        effectsGraphics!.circle(datum.x, datum.y, pulseRadius);
        effectsGraphics!.stroke({ width: 3, color: 0x38bdf8, alpha: pulseAlpha });
      }

      // Subtle breathing scale on the node itself during the pulse.
      const g = nodeGraphicsMap.get(anim.nodeId);
      if (g) {
        const breath =
          1 + Math.sin(progress * Math.PI * 3.5) * 0.09 * (1 - progress);
        g.scale.set(breath);
      }
    }

    if (
      (anim.type === 'assign' || anim.type === 'meteor') &&
      anim.fromX !== undefined && anim.fromY !== undefined &&
      anim.targetX !== undefined && anim.targetY !== undefined
    ) {
      const datum = nodeById.get(anim.nodeId);
      if (!datum) return;

      const controlX = anim.controlX ?? (anim.fromX + anim.targetX) / 2;
      const controlY = anim.controlY ?? (anim.fromY + anim.targetY) / 2;

      if (anim.type === 'assign') {
        // Curved flight path line.
        effectsGraphics!.moveTo(anim.fromX, anim.fromY);
        effectsGraphics!.quadraticCurveTo(
          controlX,
          controlY,
          anim.targetX,
          anim.targetY
        );
        effectsGraphics!.stroke({ width: 2, color: 0x64748b, alpha: 0.24 });

        // Faded ghost at the original position.
        effectsGraphics!.circle(anim.fromX, anim.fromY, datum.radius * 0.85);
        effectsGraphics!.fill({ color: 0x64748b, alpha: 0.14 });
        effectsGraphics!.stroke({ width: 1, color: 0x64748b, alpha: 0.25 });
      }

      // Comet trail behind the flying node. Samples in eased-progress space,
      // so the trail stretches while fast and tightens on arrival. Meteors
      // burn hotter and longer than assign flights.
      const eased = easeOrbitMapOutCubic(
        Math.max(0, getOrbitMapAnimationProgress(anim))
      );
      const isMeteor = anim.type === 'meteor';
      const trailColor = mixOrbitMapColors(
        datum.visual.color,
        isMeteor ? 0xfff7ed : 0xffffff,
        isMeteor ? 0.6 : 0.4
      );
      const trailSteps = isMeteor ? 10 : 7;
      const trailSpacing = isMeteor ? 0.035 : 0.05;
      for (let k = 1; k <= trailSteps; k++) {
        const t = eased - k * trailSpacing;
        if (t <= 0) break;
        effectsAdditiveGraphics!.circle(
          getQuadraticPoint(anim.fromX, controlX, anim.targetX, t),
          getQuadraticPoint(anim.fromY, controlY, anim.targetY, t),
          Math.max(0.6, datum.radius * (0.9 - k * (0.8 / trailSteps)))
        );
        effectsAdditiveGraphics!.fill({
          color: trailColor,
          alpha: (isMeteor ? 0.6 : 0.5) * (1 - k / (trailSteps + 1)),
        });
      }
    }
  });

  if (effectsAdditiveGraphics) {
    sweep.render(
      effectsAdditiveGraphics,
      getPaletteAccent(),
      mixOrbitMapColors
    );
  }
}

/* ============================================================
   RENDER LOOP (drives animations + the entrance fade)
   ============================================================ */

/** True while time-based ambient visuals (selection reticle spin + edge
 * particles) should keep the loop alive after one-shot animations finish.
 * Hidden pages have no ambient motion — the loop must wind down. */
function hasAmbientMotion() {
  return living.isPageVisible() && currentSelection !== null && nodeData.length > 0;
}

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
    if (datum) g.position.set(datum.x, datum.y);
  }

  for (const [nodeId, label] of labelMap) {
    if (!label.visible || !living.hasOrbit(nodeId)) continue;
    const datum = nodeById.get(nodeId);
    if (datum) positionLabel(label, datum, focusContext);
  }

  if (currentSelection) {
    const glow = glowSpriteMap.get(currentSelection.id);
    if (glow && glow.visible) {
      const breathPhase =
        ((now % GLOW_BREATH_PERIOD_MS) / GLOW_BREATH_PERIOD_MS) * Math.PI * 2;
      glow.alpha = getHubGlowAlpha() * (1 + 0.22 * Math.sin(breathPhase));
    }
  }

  drawLinks(
    focusContext,
    getOrbitMapViewBounds(
      camera,
      app.renderer.width,
      app.renderer.height,
      VIEW_CULL_MARGIN
    )
  );
  drawRings(focusContext);
  renderEffects();
  app.renderer.render(app.stage);
}

/**
 * Cheap per-frame path for ambient motion: only the reticle arcs, flow
 * particles, and glow breathing change, so skip the full style/label/link
 * recompute and just mutate those layers. No allocations on this path.
 */
function renderAmbientFrame() {
  if (!app) return;

  // The selected hub's glow breathes gently (updateNodeStyles resets the
  // alpha whenever a real style pass runs).
  if (currentSelection) {
    const glow = glowSpriteMap.get(currentSelection.id);
    if (glow && glow.visible) {
      const breathPhase =
        ((Date.now() % GLOW_BREATH_PERIOD_MS) / GLOW_BREATH_PERIOD_MS) *
        Math.PI * 2;
      glow.alpha = getHubGlowAlpha() * (1 + 0.22 * Math.sin(breathPhase));
    }
  }

  drawRings(getFocusContext());
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
      if (livingActive) {
        living.advanceOrbits(now);
        living.animateCorona(now);
      }
      updateNodeStyles();
      requestAnimationFrame(tick);
      return;
    }

    if (hadAnimations) {
      // One-shot animations just finished (possibly with the ambient loop
      // still alive): settle styles and sync moved nodes to the minimap.
      if (livingActive) {
        living.advanceOrbits(now);
        living.animateCorona(now);
      }
      updateNodeStyles();
      sendLayoutUpdate(true);
      requestAnimationFrame(tick);
      return;
    }

    // Capped path (~30fps): orbital drift, reticle spin, particles, glow
    // breathing, and the radar sweep only mutate the effects/ring layers
    // (plus orbit positions when living) — half the GPU work, invisible
    // for motion this slow. The sweep runs here too instead of forcing
    // full style passes. All of it pauses while the page is hidden.
    if (livingActive || hasAmbientMotion() || (living.isPageVisible() && isSweepActive())) {
      if (now - lastAmbientFrameAt >= AMBIENT_FRAME_MIN_MS) {
        lastAmbientFrameAt = now;
        if (livingActive) {
          living.advanceOrbits(now);
          living.animateCorona(now);
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

    // Staggered starts (meteor batches) park at t = 0 until their turn.
    const progress = Math.max(0, getOrbitMapAnimationProgress(anim, now));

    if (
      (anim.type === 'assign' || anim.type === 'return' || anim.type === 'meteor') &&
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
          // The node docked onto a different hub; its old orbit no longer
          // applies — hold position until the refetch rebuilds orbits.
          living.releaseOrbit(anim.nodeId);
          delete datum.scale;
          pushPulse(anim.nodeId);
          postToMain({
            type: MainMessageType.ANIMATE_ASSIGN_COMPLETE,
            protocolVersion: 1,
            bookmarkId: anim.nodeId,
          });
        } else if (anim.type === 'meteor') {
          // Meteor landed on the node's shell — re-phase so drift continues
          // from the capture point. Return flights skip this: orbit state was
          // never changed during the drag and still matches the cluster.
          living.rebaseOrbitTheta(anim.nodeId);
          pushPulse(anim.nodeId, 520);
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

function handleAnimateAssign(msg: AnimateAssignMessage) {
  const { bookmarkId, anchorId, duration = 520 } = msg;

  const bookmarkDatum = nodeById.get(bookmarkId);
  const anchorDatum = nodeById.get(anchorId);

  if (!bookmarkDatum || !anchorDatum) {
    console.warn('[OrbitWorker] Cannot animate assign - nodes not found');
    return;
  }

  removeAnimationsFor(bookmarkId, 'assign');
  removeAnimationsFor(bookmarkId, 'return');
  delete bookmarkDatum.scale;

  // Curved flight: perpendicular bend off the straight line, side chosen
  // deterministically per bookmark so repeat assigns fly the same arc.
  const dx = anchorDatum.x - bookmarkDatum.x;
  const dy = anchorDatum.y - bookmarkDatum.y;
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
    targetX: anchorDatum.x,
    targetY: anchorDatum.y,
    controlX:
      (bookmarkDatum.x + anchorDatum.x) / 2 - (len > 1 ? (dy / len) * bend : 0),
    controlY:
      (bookmarkDatum.y + anchorDatum.y) / 2 + (len > 1 ? (dx / len) * bend : 0),
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
    nebulaContainer,
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

  // Each starfield depth layer follows the camera at its own fraction of
  // camera speed, so pans read as dimensional.
  if (starfieldContainer) {
    applyOrbitMapStarfieldParallax(starfieldContainer, tx, ty);
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
  if (!currentGraph || nodeData.length === 0) {
    camera = { x: 0, y: 0, zoom: 1 };
    return;
  }

  const bounds = getGraphBounds();
  if (!bounds) return;

  const fitZoom = getOrbitMapFitZoom(bounds, getCameraConfig());
  // Large libraries contain distant bookmark satellites that make a literal
  // all-node fit feel undersized. Expand the overview while staying in the
  // hub-first LOD band, so the initial constellation reads clearly and the
  // complete graph remains one small zoom-out away.
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
