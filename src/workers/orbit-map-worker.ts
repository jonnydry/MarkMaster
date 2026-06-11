/// <reference lib="webworker" />

/**
 * Orbit Map Web Worker
 *
 * This worker owns the entire visualization for maximum performance:
 * - Graph data model
 * - Force-directed simulation (d3-force or future replacement)
 * - PixiJS v8 rendering via OffscreenCanvas
 * - Hit testing, camera, filters, animations
 *
 * The main thread only handles React state and forwards DOM events.
 */

import { DOMAdapter, WebWorkerAdapter } from 'pixi.js';
import { Application } from 'pixi.js';

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
  type FocusOnMessage,
  type SetSelectionMessage,
  type SetHighlightMessage,
  type WheelMessage,
  type DoubleClickMessage,
  type LayoutUpdatedMessage,
  collectTransferables,
} from '@/lib/orbit-worker-protocol';

import type { OrbitGraphPayload, OrbitGraphNode, OrbitGraphEdge } from '@/types';
import type { GraphFilter, OrbitMapSelection } from '@/lib/orbit-worker-protocol';
import {
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  BitmapFont,
  BitmapFontManager,
  BitmapText,
} from 'pixi.js';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  forceCenter,
  type Simulation,
} from 'd3-force';
import {
  clampOrbitMapZoom,
  constrainOrbitMapCameraState,
  getOrbitMapFitZoom,
  getOrbitMapGraphBounds,
  type OrbitMapGraphBounds,
} from './orbit-map-camera';
import {
  getSeededOrbitMapPosition,
  isFiniteOrbitMapPosition,
} from './orbit-map-layout';
import { findClosestOrbitMapNode } from './orbit-map-hit-test';
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
  shouldContinueOrbitMapLoop,
} from './orbit-map-animation';

/**
 * Internal simulation node type used by d3-force and the renderer.
 * Contains the original graph node + runtime simulation fields.
 */
interface SimulationNode {
  id: string;
  kind: OrbitGraphNode['kind'];
  node: OrbitGraphNode;
  x?: number;
  y?: number;
  radius: number;
  visual: OrbitMapNodeVisualStyle;
  /** 0-based importance rank among hubs (by count); top hubs always show labels. */
  labelRank?: number;
  /** Per-node delay (ms) for the one-shot entrance fade-in. */
  entranceDelay?: number;
  recent?: boolean;
  affiliated?: boolean;
  fx?: number;
  fy?: number;
  scale?: number; // temporary scale during animations (e.g. flying node)
}

/**
 * Internal link type used by d3-force.
 */
interface SimulationLink {
  source: string | SimulationNode;
  target: string | SimulationNode;
  kind: string;
  /** Cached edge color (derived from the hub endpoint) — set in rebuildScene. */
  color?: number;
}

/**
 * Converts an OrbitGraphEdge into a SimulationLink if it should be included
 * in the force simulation (i.e., not 'loose' and both ends are visible).
 */
function edgeToLink(edge: OrbitGraphEdge, visibleNodeIds: Set<string>): SimulationLink | null {
  if (edge.kind === 'loose') return null;

  let source: string;
  let target: string;

  if ('bookmarkId' in edge) {
    source = edge.bookmarkId;
  } else {
    source = edge.overflowId;
  }

  if ('tagId' in edge) {
    target = edge.tagId;
  } else if ('collectionId' in edge) {
    target = edge.collectionId;
  } else {
    target = edge.anchorId;
  }

  if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) {
    return null;
  }

  return {
    source,
    target,
    kind: edge.kind,
  };
}

// Basic Pixi Application instance (created on INIT)
let app: Application | null = null;
let isInitialized = false;

// Current graph data and filter (stored in worker)
let currentGraph: OrbitGraphPayload | null = null;
let currentFilter: GraphFilter = 'all';
let currentInitialPositions = new Map<string, { x: number; y: number }>();
let perf = createOrbitMapPerfLogger(false);

// Pointer interaction state machine (hover, selection clicks, panning,
// node dragging, drag-to-assign) — see orbit-map-interactions.ts.
const interactions = createOrbitMapInteractions<SimulationNode>({
  hasScene: () => Boolean(app && currentGraph && nodeData.length > 0),
  getNodeData: () => nodeData,
  getNodeById: () => nodeById,
  getCamera: () => camera,
  panBy: (dx, dy) => {
    camera.x += dx;
    camera.y += dy;
    constrainCamera();
    applyCameraTransform();
    if (app) app.renderer.render(app.stage);

    // Keep the main thread (minimap, URL sync) in step with drag panning.
    postToMain({
      type: MainMessageType.CAMERA_CHANGED,
      protocolVersion: 1,
      camera: { ...camera },
    });
  },
  getSelection: () => currentSelection,
  setSelection: (selection) => {
    currentSelection = selection;
    updateNodeStyles();
    postToMain({
      type: MainMessageType.SELECTION_CHANGED,
      protocolVersion: 1,
      selection,
    });
  },
  refreshNodeStyles: () => updateNodeStyles(),
  postToMain: (msg) => postToMain(msg),
  getSimulation: () => simulation,
  kickSimulation: (alpha) => kickSimulation(alpha),
  startSimulationLoop: () => startSimulationLoop(),
  pulseNode: (nodeId) => {
    const existingPulse = activeAnimations.findIndex(
      (a) => a.nodeId === nodeId && a.type === 'pulse'
    );
    if (existingPulse !== -1) activeAnimations.splice(existingPulse, 1);
    activeAnimations.push({
      id: `pulse-${nodeId}-${Date.now()}`,
      type: 'pulse',
      nodeId,
      startTime: Date.now(),
      duration: 420,
    });
  },
});

// Pixi containers for organization
let backgroundContainer: Container | null = null; // Screen-space vignette (not camera-transformed)
let starfieldContainer: Container | null = null;  // Distant stars with parallax (fractional camera follow)
let linksContainer: Container | null = null;
let glowContainer: Container | null = null;       // Soft glow sprites under hub nodes (camera space)
let nodesContainer: Container | null = null;
let ringsContainer: Container | null = null; // Selection / neighbor highlight rings (drawn in world space)
let labelsContainer: Container | null = null;
let effectsContainer: Container | null = null; // For temporary effects like pulses and animations
let linkGraphics: Graphics | null = null;
let ringGraphics: Graphics | null = null;
let vignetteSprite: Sprite | null = null;
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
const STARFIELD_PARALLAX = 0.35;
const HUB_GLOW_ALPHA = 0.22;

// Label management for LOD
const labelMap = new Map<string, Text | BitmapText>(); // nodeId -> Text or BitmapText object

// d3-force simulation (runs in the worker)
let simulation: Simulation<SimulationNode, SimulationLink> | null = null;
let nodeData: SimulationNode[] = [];
let nodeById = new Map<string, SimulationNode>();
let linkData: SimulationLink[] = [];

// Whether the manual rAF tick loop is currently running. The d3 internal
// timer is never used — all ticks are driven from startSimulationLoop — so
// anything that raises alpha must also ensure the loop is alive (kickSimulation).
let simulationLoopRunning = false;

// Camera state (position + zoom)
let camera = { x: 0, y: 0, zoom: 1 };

// Simple map from node id to its Pixi Graphics object
const nodeGraphicsMap = new Map<string, Graphics>();

// Current selection for visual feedback (hover lives in `interactions`)
let currentSelection: OrbitMapSelection | null = null;

// Live search-match highlight (null = inactive). Non-members are dimmed.
let highlightedNodeIds: Set<string> | null = null;

// Adjacency map for efficient neighbor highlighting
const adjacency = new Map<string, Set<string>>();

// Label visibility thresholds (based on zoom level)
const LABEL_ZOOM_THRESHOLD = 0.6;           // Below this, only top-ranked hubs keep their labels.
const LABEL_BASE_FONT_SIZE = 18;
const LABEL_MIN_WORLD_SCALE = 0.16;
const LABEL_MAX_WORLD_SCALE = 2.35;
const GRAPH_BACKGROUND_COLOR = 0x000000;
const MIN_CAMERA_ZOOM = 0.12;
const MAX_CAMERA_ZOOM = 1.85;
const CAMERA_FRAME_PADDING = 72;
const CAMERA_NODE_PADDING = 18;
const MAX_FIT_ZOOM = 1.75;
const WHEEL_DELTA_CAP = 90;
const WHEEL_ZOOM_SENSITIVITY = 0.00055;

// === Animation System (runs in worker) ===
interface Animation {
  id: string;
  type: 'assign' | 'pulse';
  nodeId: string;
  startTime: number;
  duration: number;
  targetX?: number;
  targetY?: number;
  fromX?: number;
  fromY?: number;
}

const activeAnimations: Animation[] = [];

/**
 * Send a message back to the main thread.
 */
function postToMain(msg: MainMessage, transfer: Transferable[] = []) {
  // Worker postMessage typing can be finicky across bundlers; use a narrow assertion
  (self as unknown as { postMessage: (message: MainMessage, transfer?: Transferable[]) => void })
    .postMessage(msg, transfer);
}

/**
 * Send current node positions to the main thread.
 * Uses transferable Float32Array for performance.
 */
function sendLayoutUpdate(stabilized = false) {
  if (!nodeData.length) return;

  const nodeIds: string[] = new Array(nodeData.length);
  const positions = new Float32Array(nodeData.length * 2);

  for (let i = 0; i < nodeData.length; i++) {
    const n = nodeData[i];
    nodeIds[i] = n.id;
    positions[i * 2] = n.x ?? 0;
    positions[i * 2 + 1] = n.y ?? 0;
  }

  const msg: LayoutUpdatedMessage = {
    type: MainMessageType.LAYOUT_UPDATED,
    protocolVersion: 1,
    nodeIds,
    positions,
    stabilized,
    filter: currentFilter,
  };

  const transfer = collectTransferables(msg);
  postToMain(msg, transfer);
}

/**
 * Handle incoming messages from the main thread.
 */
function handleMessage(event: MessageEvent<WorkerMessage>) {
  const msg = event.data;

  if (msg.protocolVersion !== 1) {
    console.warn('[OrbitWorker] Protocol version mismatch');
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
      sendLayoutUpdate(false);
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

  try {
    perf = createOrbitMapPerfLogger(Boolean(msg.debugPerf));
    const initStartedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    perf.mark('worker:init:start');

    // Create Pixi Application with the transferred OffscreenCanvas
    app = new Application();

    // Note: In Pixi v8, we use async init
    app.init({
      canvas: msg.canvas,           // The OffscreenCanvas transferred from main
      width: msg.width,
      height: msg.height,
      resolution: msg.dpr,
      antialias: true,
      backgroundColor: GRAPH_BACKGROUND_COLOR,
      autoDensity: true,
    }).then(() => {
      isInitialized = true;
      const initMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
          initStartedAt
      );
      perf.mark('worker:init:ready', { initMs });

      // Install a BitmapFont once for fast, high-quality labels (major performance win vs regular Text)
      BitmapFont.install({
        name: 'OrbitLabel',
        style: {
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: LABEL_BASE_FONT_SIZE,
          fill: 0xe2e8f0,
        },
        // Charset constants live on BitmapFontManager in Pixi v8 (BitmapFont has no static ASCII).
        chars: BitmapFontManager.ASCII,
      });

      // Basic ticker (the real render + simulation loop is driven from startSimulationLoop)
      app!.ticker.add(() => {});

      // Notify main thread (width/height can be 0 if not critical at this stage)
      postToMain({ type: MainMessageType.READY, protocolVersion: 1, width: 0, height: 0 });

    }).catch((err) => {
      postToMain({
        type: MainMessageType.ERROR,
        protocolVersion: 1,
        message: 'Failed to initialize Pixi Application: ' + String(err),
      });
    });
  } catch (err) {
    postToMain({
      type: MainMessageType.ERROR,
      protocolVersion: 1,
      message: 'Worker initialization failed: ' + String(err),
    });
  }
}

function handleResize(msg: ResizeMessage) {
  if (!app || !isInitialized) return;

  app.renderer.resize(msg.width, msg.height);
  layoutVignette(msg.width, msg.height);
  constrainCamera();
  applyCameraTransform();
  app.renderer.render(app.stage);
}

function handleSetGraph(msg: SetGraphMessage) {
  currentGraph = msg.graph;
  currentInitialPositions = new Map(
    Object.entries(msg.initialPositions ?? {}).filter(
      (entry): entry is [string, { x: number; y: number }] =>
        isFiniteOrbitMapPosition(entry[1])
    )
  );

  // Build adjacency map for neighbor highlighting
  buildAdjacencyMap();

  rebuildScene();
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

function handleSetFilter(msg: SetFilterMessage) {
  const nextFilter = msg.filter as GraphFilter;
  if (currentFilter === nextFilter) return;
  currentFilter = nextFilter;
  // Carry current positions over so the filtered scene warm-starts in place
  // instead of re-running the layout from scratch.
  captureCurrentPositions();
  rebuildScene();
}

/** Snapshots live simulation positions into the initial-positions map. */
function captureCurrentPositions() {
  for (const datum of nodeData) {
    const position = { x: datum.x ?? NaN, y: datum.y ?? NaN };
    if (isFiniteOrbitMapPosition(position)) {
      currentInitialPositions.set(datum.id, position);
    }
  }
}

function handleDestroy() {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
  interactions.reset();
  simulationLoopRunning = false;
  activeAnimations.length = 0;
  labelMap.clear();
  nodeGraphicsMap.clear();
  glowSpriteMap.clear();
  nodeById.clear();
  adjacency.clear();
  backgroundContainer = null;
  starfieldContainer = null;
  glowContainer = null;
  vignetteSprite = null;
  glowTexture = null;
  app?.destroy();
  app = null;
  isInitialized = false;
}

/* ============================================================
   ATMOSPHERE (vignette, starfield, hub glow)
   ============================================================ */

/** Renders a radial gradient onto an OffscreenCanvas and wraps it in a Texture. */
function createRadialGradientTexture(
  size: number,
  stops: Array<[number, string]>
): Texture {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.WHITE;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/** Mulberry32 — tiny deterministic PRNG so the starfield is stable per session. */
function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds the vignette + starfield once per worker lifetime. */
function buildBackground() {
  if (!app || !backgroundContainer || !starfieldContainer) return;

  glowTexture =
    glowTexture ??
    createRadialGradientTexture(64, [
      [0, 'rgba(255,255,255,0.85)'],
      [0.35, 'rgba(255,255,255,0.28)'],
      [1, 'rgba(255,255,255,0)'],
    ]);

  if (!vignetteSprite) {
    const vignetteTexture = createRadialGradientTexture(256, [
      [0, 'rgba(30,41,59,0.5)'],
      [0.55, 'rgba(15,23,42,0.22)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    vignetteSprite = new Sprite(vignetteTexture);
    vignetteSprite.anchor.set(0.5);
    backgroundContainer.addChild(vignetteSprite);
  }
  layoutVignette(app.renderer.width, app.renderer.height);

  if (starfieldContainer.children.length === 0) {
    const random = createSeededRandom(0x0c0ffee);
    const stars = new Graphics();
    for (let i = 0; i < 240; i++) {
      const x = (random() - 0.5) * 6000;
      const y = (random() - 0.5) * 6000;
      const radius = 0.4 + random() * 1.0;
      const blue = random() > 0.7;
      stars.circle(x, y, radius);
      stars.fill({
        color: blue ? 0x93c5fd : 0xffffff,
        alpha: 0.05 + random() * 0.14,
      });
    }
    starfieldContainer.addChild(stars);
  }
}

function layoutVignette(width: number, height: number) {
  if (!vignetteSprite) return;
  vignetteSprite.position.set(width / 2, height / 2);
  const diameter = Math.max(width, height) * 1.5;
  vignetteSprite.width = diameter;
  vignetteSprite.height = diameter;
}

/**
 * One-shot entrance fade-in: hubs first, bookmarks staggered in behind them.
 * Runs from the simulation tick loop; restores normal styling when done.
 */
function applyEntranceProgress() {
  if (entranceStartedAt === null) return;

  const elapsed = Date.now() - entranceStartedAt;
  const focusContext = getFocusContext();

  for (const datum of nodeData) {
    const delay = datum.entranceDelay ?? 0;
    const t = Math.min(
      Math.max((elapsed - delay) / ENTRANCE_NODE_FADE_MS, 0),
      1
    );
    const factor = easeOrbitMapOutCubic(t);
    const g = nodeGraphicsMap.get(datum.id);
    if (g) g.alpha = getNodeAlpha(datum, focusContext) * factor;
    const glow = glowSpriteMap.get(datum.id);
    if (glow) glow.alpha = HUB_GLOW_ALPHA * factor;
  }

  if (linksContainer) {
    linksContainer.alpha = easeOrbitMapOutCubic(Math.min(elapsed / 800, 1));
  }

  if (elapsed >= ENTRANCE_TOTAL_MS) {
    entranceStartedAt = null;
    if (linksContainer) linksContainer.alpha = 1;
    updateNodeStyles();
  }
}

/**
 * Rebuilds the Pixi scene and starts the force-directed simulation inside the worker.
 * This is the main performance win — the heavy d3-force work no longer blocks the main thread.
 */
function rebuildScene() {
  if (!app || !currentGraph) return;
  const graphStartedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  // Stop previous simulation
  if (simulation) {
    simulation.stop();
    simulation = null;
  }

  // Clear scene
  if (linksContainer) linksContainer.removeChildren();
  if (glowContainer) {
    for (const glow of glowSpriteMap.values()) {
      glow.destroy();
    }
    glowSpriteMap.clear();
    glowContainer.removeChildren();
  }
  if (nodesContainer) nodesContainer.removeChildren();
  if (ringsContainer) ringsContainer.removeChildren();
  if (labelsContainer) {
    for (const label of labelMap.values()) {
      label.destroy();
    }
    labelMap.clear();
    labelsContainer.removeChildren();
  }
  if (effectsContainer) effectsContainer.removeChildren();
  linkGraphics = null;
  ringGraphics = null;
  nodeGraphicsMap.clear();
  nodeById.clear();

  // Container creation order defines z-order:
  // background → starfield → links → glow → nodes → rings → labels → effects
  if (!backgroundContainer) {
    backgroundContainer = new Container();
    app.stage.addChild(backgroundContainer);
  }
  if (!starfieldContainer) {
    starfieldContainer = new Container();
    app.stage.addChild(starfieldContainer);
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
    app!.stage.addChild(labelsContainer);
  }
  if (!effectsContainer) {
    effectsContainer = new Container();
    app.stage.addChild(effectsContainer);
  }

  const { nodes, edges } = currentGraph;
  perf.mark('graph:set', {
    nodes: nodes.length,
    edges: edges.length,
  });

  // Visibility filter (runs on raw graph nodes before we enrich them into SimulationNodes)
  const isNodeVisible = (node: OrbitGraphNode): boolean => {
    if (currentFilter === 'all') return true;
    if (node.kind === 'bookmark') {
      // These fields may exist on enriched nodes; use optional chaining for safety
      const simNode = node as OrbitGraphNode & { recent?: boolean; affiliated?: boolean };
      if (currentFilter === 'recent') return simNode.recent ?? false;
      if (currentFilter === 'loose') return !(simNode.affiliated ?? false);
    }
    return true;
  };

  const visibleNodes: OrbitGraphNode[] = [];
  const visibleNodeIds = new Set<string>();
  for (const node of nodes) {
    if (!isNodeVisible(node)) continue;
    visibleNodes.push(node);
    visibleNodeIds.add(node.id);
  }

  // Prepare nodes for d3-force using our internal SimulationNode type.
  // Track how many nodes already have known positions so we can warm-start
  // the simulation instead of re-exploding a layout the user has seen before.
  let positionedCount = 0;
  nodeData = visibleNodes.map((node) => {
    const datum: SimulationNode = {
      id: node.id,
      kind: node.kind,
      node,
      radius: getOrbitMapNodeRadius(node),
      visual: getOrbitMapNodeVisualStyle(node),
    };

    // Use persisted positions if available (from server or previous layout)
    const initialPosition = currentInitialPositions.get(node.id);
    const simNode = node as OrbitGraphNode & { x?: number; y?: number };
    if (initialPosition) {
      datum.x = initialPosition.x;
      datum.y = initialPosition.y;
      positionedCount++;
    } else if (
      typeof simNode.x === 'number' &&
      Number.isFinite(simNode.x) &&
      typeof simNode.y === 'number' &&
      Number.isFinite(simNode.y)
    ) {
      datum.x = simNode.x;
      datum.y = simNode.y;
      positionedCount++;
    } else {
      const pos = getSeededOrbitMapPosition(node.id);
      datum.x = pos.x;
      datum.y = pos.y;
    }
    return datum;
  });
  nodeById = new Map(nodeData.map((datum) => [datum.id, datum]));
  const hubDropTargets = nodeData.filter(
    (datum) => datum.kind === 'tag' || datum.kind === 'collection'
  );
  interactions.setHubDropTargets(hubDropTargets);

  // Hub importance ranks: the most-connected hubs keep labels at any zoom.
  const hubCount = (datum: SimulationNode) =>
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

  // Tint bookmarks by their dominant tag (fallback: collection) color so
  // clusters read as colored constellations instead of uniform gray.
  for (const datum of nodeData) {
    if (datum.kind !== 'bookmark') continue;
    const neighbors = adjacency.get(datum.id);
    if (!neighbors) continue;
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
    if (accent !== null) {
      datum.visual = {
        ...datum.visual,
        color: mixOrbitMapColors(datum.visual.color, accent, 0.55),
        strokeColor: mixOrbitMapColors(datum.visual.strokeColor, accent, 0.4),
      };
    }
  }
  interactions.resetSceneState();
  const warmStart =
    nodeData.length > 0 && positionedCount / nodeData.length >= 0.8;

  // Build links using a helper for clarity
  linkData = [];
  for (const edge of edges) {
    const link = edgeToLink(edge, visibleNodeIds);
    if (link) linkData.push(link);
  }

  // Create and configure d3-force simulation (this is the heavy work now off the main thread)
  simulation = forceSimulation(nodeData)
    .alphaDecay(0.022)
    .velocityDecay(0.38)
    .force(
      'link',
      forceLink(linkData)
        .id((d) => (d as SimulationNode).id)
        .distance((link) => {
          const typedLink = link as SimulationLink;
          switch (typedLink.kind) {
            case 'bookmark-tag': return 58;
            case 'bookmark-collection': return 66;
            case 'loose': return 135;
            case 'bookmark-bookmark': return 40;
            default: return 75;
          }
        })
        .strength((link) => {
          const typedLink = link as SimulationLink;
          switch (typedLink.kind) {
            case 'bookmark-tag': return 0.65;
            case 'bookmark-collection': return 0.58;
            case 'loose': return 0.035;
            case 'bookmark-bookmark': return 0.12;
            default: return 0.22;
          }
        })
    )
    .force(
      'charge',
      forceManyBody().strength((d) => {
        const node = d as SimulationNode;
        switch (node.node.kind) {
          case 'core': return -130;
          case 'tag':
          case 'collection': return -190;
          default: return -24;
        }
      })
    )
    .force(
      'x',
      forceX().strength((d) => ((d as SimulationNode).node.kind === 'bookmark' ? 0.028 : 0.06))
    )
    .force(
      'y',
      forceY().strength((d) => ((d as SimulationNode).node.kind === 'bookmark' ? 0.028 : 0.06))
    )
    .force(
      'collide',
      forceCollide()
        .radius((d) => (d as SimulationNode).radius + 4)
        .strength(0.82)
    )
    .force('center', forceCenter(0, 0).strength(0.055));

  // Cache per-link colors now that forceLink has resolved endpoints to nodes.
  // Edges inherit the color of their hub endpoint so clusters read as colored
  // threads; everything else keeps the neutral slate.
  for (const link of linkData) {
    const target = resolveLinkNode(link.target);
    link.color =
      target && (target.kind === 'tag' || target.kind === 'collection')
        ? target.visual.color
        : 0x334155;
  }

  // We drive ticks manually via requestAnimationFrame; kill the internal timer
  // d3 starts on creation so the simulation never advances twice per frame.
  simulation.stop();
  simulation.alpha(warmStart ? 0.1 : 1);

  // Initial render + auto fit
  buildScene();
  autoFitCamera(app.renderer.width, app.renderer.height);
  updateNodeStyles();

  // Broadcast the fitted camera so the minimap viewport is correct on load.
  postToMain({
    type: MainMessageType.CAMERA_CHANGED,
    protocolVersion: 1,
    camera: { ...camera },
  });

  // Schedule the one-shot entrance fade-in on the first graph of this visit.
  if (!hasPlayedEntrance && nodeData.length > 0) {
    hasPlayedEntrance = true;
    entranceStartedAt = Date.now();
    nodeData.forEach((datum, index) => {
      datum.entranceDelay = datum.visual.isHub
        ? 0
        : ENTRANCE_BASE_DELAY_MS + ((index * 7919) % ENTRANCE_MAX_DELAY_MS);
    });
    applyEntranceProgress();
  }
  const firstRenderMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      graphStartedAt
  );
  perf.mark('graph:first-render', {
    firstRenderMs,
    visibleNodes: nodeData.length,
    visibleEdges: linkData.length,
    warmStart: warmStart ? 1 : 0,
  });

  // Start the simulation loop inside the worker. Any loop left over from a
  // previous graph bails out on its next frame (it no longer owns `simulation`).
  simulationLoopRunning = false;
  startSimulationLoop();
}

/**
 * Builds the persistent Pixi scene for the current graph: one Graphics object
 * per node plus shared link/ring layers. Called only when the graph or filter
 * changes — per-frame and per-interaction updates mutate these objects instead
 * of recreating them (see updateNodeStyles).
 */
function buildScene() {
  if (!linksContainer || !nodesContainer || !ringsContainer) return;

  linksContainer.removeChildren();
  nodesContainer.removeChildren();
  ringsContainer.removeChildren();
  nodeGraphicsMap.clear();

  linkGraphics = new Graphics();
  linkGraphics.alpha = 1;
  linksContainer.addChild(linkGraphics);

  ringGraphics = new Graphics();
  ringsContainer.addChild(ringGraphics);

  for (const datum of nodeData) {
    const g = new Graphics();
    const visualStyle = datum.visual;

    if (visualStyle.isHub) {
      g.circle(0, 0, datum.radius + 1.5);
      g.fill({ color: visualStyle.color, alpha: 0.16 });
      g.stroke({
        width: visualStyle.strokeWidth,
        color: visualStyle.strokeColor,
        alpha: 0.6,
      });
      g.circle(0, 0, Math.max(3.2, datum.radius * 0.44));
      g.fill({ color: visualStyle.color, alpha: 1 });
      g.stroke({ width: 1, color: 0xffffff, alpha: 0.43 });
    } else {
      g.circle(0, 0, datum.radius);
      g.fill({ color: visualStyle.color, alpha: 1 });
      g.stroke({
        width: visualStyle.strokeWidth,
        color: visualStyle.strokeColor,
        alpha: 0.6,
      });
    }

    g.position.set(datum.x ?? 0, datum.y ?? 0);
    nodesContainer.addChild(g);
    nodeGraphicsMap.set(datum.id, g);

    // Soft glow halo under hubs, tinted to match.
    if (visualStyle.isHub && glowTexture && glowContainer) {
      const glow = new Sprite(glowTexture);
      glow.anchor.set(0.5);
      glow.tint = visualStyle.color;
      glow.alpha = HUB_GLOW_ALPHA;
      const glowSize = datum.radius * 6;
      glow.width = glowSize;
      glow.height = glowSize;
      glow.position.set(datum.x ?? 0, datum.y ?? 0);
      glowContainer.addChild(glow);
      glowSpriteMap.set(datum.id, glow);
    }
  }
}

/**
 * Computes the dimming alpha for a node given the current hover/selection
 * focus. The emphasis the old full-rebuild renderer baked into fills is now
 * applied via the node's container alpha; rings carry the active emphasis.
 */
function getNodeAlpha(
  datum: SimulationNode,
  focusContext: ReturnType<typeof getFocusContext>
) {
  const node = datum.node;
  const isActive = datum.id === focusContext.activeId;
  const isNeighbor = focusContext.neighborIds.has(datum.id);
  const isAssignedBookmark = node.kind === 'bookmark' && node.affiliated;

  // Search highlight dominates: matches at full strength, the rest recede.
  if (highlightedNodeIds && !isActive) {
    return highlightedNodeIds.has(datum.id)
      ? 1.0
      : datum.visual.isHub
        ? 0.22
        : 0.14;
  }

  if (focusContext.activeId) {
    if (isActive) return 1.0;
    if (isNeighbor) return focusContext.hasSelection ? 0.94 : 0.78;
    if (focusContext.hasSelection) {
      return datum.visual.isHub ? 0.34 : isAssignedBookmark ? 0.18 : 0.24;
    }
    return datum.visual.isHub ? 0.26 : isAssignedBookmark ? 0.16 : 0.22;
  }
  if (camera.zoom < 0.26 && node.kind === 'bookmark') {
    return node.affiliated ? 0.5 : 0.7;
  }
  return 1.0;
}

/** Draws the active-selection and hub-neighbor highlight rings in world space. */
function drawRings(focusContext = getFocusContext()) {
  if (!ringGraphics) return;

  ringGraphics.clear();

  // Candidate hub while a bookmark is being dragged toward it
  const dropTargetId = interactions.getDropTargetId();
  if (dropTargetId) {
    const target = nodeById.get(dropTargetId);
    if (target) {
      ringGraphics.circle(target.x ?? 0, target.y ?? 0, target.radius + 12);
      ringGraphics.stroke({ width: 4, color: 0x34d399, alpha: 0.22 });
      ringGraphics.circle(target.x ?? 0, target.y ?? 0, target.radius + 7);
      ringGraphics.stroke({ width: 2.2, color: 0x34d399, alpha: 0.95 });
    }
  }

  if (!focusContext.activeId) return;

  const active = nodeById.get(focusContext.activeId);
  if (active) {
    const ringColor = currentSelection ? 0xfacc15 : 0x38bdf8;
    ringGraphics.circle(active.x ?? 0, active.y ?? 0, active.radius + 10);
    ringGraphics.stroke({ width: 5, color: ringColor, alpha: 0.2 });
    ringGraphics.circle(active.x ?? 0, active.y ?? 0, active.radius + 6);
    ringGraphics.stroke({ width: 2.4, color: ringColor, alpha: 0.98 });
  }

  if (focusContext.hasSelection) {
    for (const neighborId of focusContext.neighborIds) {
      const neighbor = nodeById.get(neighborId);
      if (!neighbor || !neighbor.visual.isHub) continue;
      ringGraphics.circle(
        neighbor.x ?? 0,
        neighbor.y ?? 0,
        neighbor.radius + 5
      );
      ringGraphics.stroke({ width: 1.6, color: 0x60a5fa, alpha: 0.58 });
    }
  }
}

/** Creates, destroys, and styles labels for the current zoom + focus (LOD). */
function updateLabels(focusContext = getFocusContext()) {
  if (!labelsContainer) return;

  const bounds = getLabelViewBounds();

  // First, remove labels for nodes that no longer qualify for the current LOD.
  for (const [nodeId, label] of labelMap) {
    const datum = nodeById.get(nodeId);
    const shouldKeep = datum
      ? shouldRenderLabel(datum, focusContext, bounds)
      : false;
    if (!shouldKeep) {
      labelsContainer.removeChild(label);
      label.destroy();
      labelMap.delete(nodeId);
    }
  }

  // Now create or update labels for nodes that should have them
  for (const datum of nodeData) {
    const node = datum.node;
    const nodeId = datum.id;

    const isActive = datum.id === focusContext.activeId;
    const isNeighbor = focusContext.neighborIds.has(nodeId);

    if (!shouldRenderLabel(datum, focusContext, bounds)) continue;

    const labelText = getOrbitMapLabelText(node);

    let label = labelMap.get(nodeId);

    if (!label) {
      // Create new label using BitmapText for much better performance.
      // In Pixi v8 the installed BitmapFont is referenced via style.fontFamily
      // (its install `name`), not the v7 `fontName` property.
      label = new BitmapText({
        text: labelText,
        style: {
          fontFamily: 'OrbitLabel',
        },
      });

      label.anchor.set(0.5, 1); // bottom center
      labelMap.set(nodeId, label);
      labelsContainer.addChild(label);
    } else if (label.text !== labelText) {
      label.text = labelText;
    }

    label.style.fill = isActive ? 0xf8fafc : isNeighbor ? 0xcbd5e1 : 0xe2e8f0;
    label.style.fontWeight = isActive ? '600' : '400';

    positionLabel(label, datum, focusContext);
  }
}

/**
 * Refreshes interaction-dependent visuals (dimming, rings, links, labels)
 * without rebuilding the scene. Cheap enough to run on every hover, zoom,
 * and selection change.
 */
function updateNodeStyles() {
  if (!app || !nodesContainer) return;

  const focusContext = getFocusContext();

  for (const datum of nodeData) {
    const g = nodeGraphicsMap.get(datum.id);
    if (!g) continue;
    const alpha = getNodeAlpha(datum, focusContext);
    g.alpha = alpha;
    // Keep positions in sync even when the tick loop is idle (e.g. a kick
    // moved nodes between interactions).
    g.position.set(datum.x ?? 0, datum.y ?? 0);

    const glow = glowSpriteMap.get(datum.id);
    if (glow) {
      glow.alpha = HUB_GLOW_ALPHA * alpha;
      glow.position.set(datum.x ?? 0, datum.y ?? 0);
    }
  }

  drawLinks(focusContext);
  drawRings(focusContext);
  updateLabels(focusContext);
  renderEffects();

  applyCameraTransform();
  app.renderer.render(app.stage);
}

function resolveLinkNode(endpoint: string | SimulationNode): SimulationNode | undefined {
  return typeof endpoint === 'string' ? nodeById.get(endpoint) : endpoint;
}

function getFocusContext() {
  const activeId = currentSelection?.id || interactions.getHover()?.id || null;
  return {
    activeId,
    hasSelection: Boolean(currentSelection),
    neighborIds: activeId ? adjacency.get(activeId) || new Set<string>() : new Set<string>(),
  };
}

interface LabelViewBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * World-space rect covering the viewport plus a half-viewport margin on each
 * side. Bookmark labels outside it are skipped — there can be over a thousand
 * bookmarks, and labels are only meaningful near the visible area.
 */
function getLabelViewBounds(): LabelViewBounds | null {
  if (!app) return null;
  const margin = 0.5;
  const width = app.renderer.width / camera.zoom;
  const height = app.renderer.height / camera.zoom;
  const minX = -camera.x / camera.zoom - width * margin;
  const minY = -camera.y / camera.zoom - height * margin;
  return {
    minX,
    minY,
    maxX: minX + width * (1 + margin * 2),
    maxY: minY + height * (1 + margin * 2),
  };
}

function shouldRenderLabel(
  datum: SimulationNode,
  focusContext: ReturnType<typeof getFocusContext>,
  bounds: LabelViewBounds | null = null
) {
  const isActive = datum.id === focusContext.activeId;
  const isNeighbor = focusContext.neighborIds.has(datum.id);

  if (bounds && datum.kind === 'bookmark' && !isActive) {
    const x = datum.x ?? 0;
    const y = datum.y ?? 0;
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
      return false;
    }
  }

  return shouldShowOrbitMapLabel(
    datum.node.kind,
    camera.zoom,
    LABEL_ZOOM_THRESHOLD,
    {
      isActive,
      isSelectedNeighbor: focusContext.hasSelection && isNeighbor,
      importanceRank: datum.labelRank,
    }
  );
}

function drawLinks(focusContext = getFocusContext()) {
  if (!linkGraphics) return;

  linkGraphics.clear();
  linkData.forEach((link) => {
    const source = resolveLinkNode(link.source);
    const target = resolveLinkNode(link.target);
    if (!source || !target) return;

    const touchesActive =
      Boolean(focusContext.activeId) &&
      (source.id === focusContext.activeId || target.id === focusContext.activeId);
    const linkAlpha = !focusContext.activeId
      ? 0.14
      : touchesActive
        ? focusContext.hasSelection
          ? 0.86
          : 0.42
        : focusContext.hasSelection
          ? 0.075
          : 0.085;
    const linkWidth = touchesActive
      ? focusContext.hasSelection
        ? 2.05
        : 1.35
      : 0.85;
    const baseColor = link.color ?? 0x334155;
    const linkColor = touchesActive
      ? mixOrbitMapColors(baseColor, 0xffffff, 0.45)
      : baseColor;

    const sx = source.x ?? 0;
    const sy = source.y ?? 0;
    const tx = target.x ?? 0;
    const ty = target.y ?? 0;
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    // Gentle quadratic curve (perpendicular bend ~8% of length) so dense
    // clusters read as organic threads rather than a wireframe.
    const bend = len * 0.08;
    const cx = (sx + tx) / 2 - (dy / len) * bend;
    const cy = (sy + ty) / 2 + (dx / len) * bend;

    linkGraphics!.moveTo(sx, sy);
    linkGraphics!.quadraticCurveTo(cx, cy, tx, ty);
    linkGraphics!.stroke({ width: linkWidth, color: linkColor, alpha: linkAlpha });
  });
}

function positionLabel(
  label: Text | BitmapText,
  datum: SimulationNode,
  focusContext = getFocusContext()
) {
  const isActive = datum.id === focusContext.activeId;
  const isNeighbor = focusContext.neighborIds.has(datum.id);

  label.x = datum.x ?? 0;
  label.y = (datum.y ?? 0) - (datum.radius + (isActive ? 9 : 7));

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
  label.alpha = isActive ? 0.88 : isNeighbor ? 0.72 : camera.zoom < 1.15 ? 0.5 : 0.74;
}

function updateLabelPositions() {
  for (const [nodeId, label] of labelMap) {
    const datum = nodeById.get(nodeId);
    if (datum) {
      positionLabel(label, datum);
    }
  }
}

function renderEffects() {
  if (!effectsContainer) return;

  effectsContainer.removeChildren();

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

        const pulse = new Graphics();
        pulse.circle(datum.x ?? 0, datum.y ?? 0, pulseRadius);
        pulse.stroke({ width: 3, color: 0x38bdf8, alpha: pulseAlpha });
        effectsContainer!.addChild(pulse);
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
      anim.type === 'assign' &&
      anim.fromX !== undefined && anim.fromY !== undefined &&
      anim.targetX !== undefined && anim.targetY !== undefined
    ) {
      const datum = nodeById.get(anim.nodeId);
      if (!datum) return;

      // Elegant flight path line.
      const flight = new Graphics();
      flight.moveTo(anim.fromX, anim.fromY);
      flight.lineTo(anim.targetX, anim.targetY);
      flight.stroke({ width: 2.2, color: 0x64748b, alpha: 0.28 });
      effectsContainer!.addChild(flight);

      // More visible faded ghost at the original position.
      const ghost = new Graphics();
      ghost.circle(anim.fromX, anim.fromY, datum.radius * 0.85);
      ghost.fill({ color: 0x64748b, alpha: 0.14 });
      ghost.stroke({ width: 1, color: 0x64748b, alpha: 0.25 });
      effectsContainer!.addChild(ghost);
    }
  });
}

/**
 * Runs the manual simulation + render loop inside the worker. Alpha is set by
 * the caller (rebuildScene for cold/warm starts, kickSimulation for reheats).
 * No-ops when a loop is already running for the current simulation.
 */
function startSimulationLoop() {
  const activeSimulation = simulation;
  if (!activeSimulation || !app || simulationLoopRunning) return;
  simulationLoopRunning = true;

  let layoutUpdateTickCounter = 0;
  const LAYOUT_UPDATE_INTERVAL = 35; // send layout every ~35 ticks while running
  const simulationStartedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const tick = () => {
    // A newer graph owns the loop now (or the worker was destroyed) — bail
    // without touching simulationLoopRunning, which the new loop manages.
    if (simulation !== activeSimulation) return;

    activeSimulation.tick();

    // Update animations (assign flights, pulses, etc.)
    updateAnimations();
    drawLinks();
    drawRings();

    // Update Pixi positions from simulation data
    nodeData.forEach((datum) => {
      const g = nodeGraphicsMap.get(datum.id);
      if (g) {
        g.position.set(datum.x ?? 0, datum.y ?? 0);
        g.scale.set(datum.scale || 1);
      }
      const glow = glowSpriteMap.get(datum.id);
      if (glow) {
        glow.position.set(datum.x ?? 0, datum.y ?? 0);
      }
    });
    applyEntranceProgress();
    updateLabelPositions();
    renderEffects();

    if (app) {
      applyCameraTransform();
      app.renderer.render(app.stage);
    }

    // === LAYOUT_UPDATED sending ===
    layoutUpdateTickCounter++;
    const isStable = activeSimulation.alpha() < 0.05 && activeAnimations.length === 0;

    if (layoutUpdateTickCounter >= LAYOUT_UPDATE_INTERVAL || isStable) {
      sendLayoutUpdate(isStable);
      layoutUpdateTickCounter = 0;
    }

    const stillAnimating = shouldContinueOrbitMapLoop(
      activeSimulation.alpha(),
      activeAnimations.length
    );

    if (stillAnimating) {
      requestAnimationFrame(tick);
    } else {
      simulationLoopRunning = false;
      // Send one final stabilized layout update
      sendLayoutUpdate(true);
      const settledMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
          simulationStartedAt
      );
      perf.mark('simulation:settled', {
        settledMs,
        nodes: nodeData.length,
        edges: linkData.length,
      });
    }
  };

  tick();
}

/**
 * Reheats the simulation to at least `alpha` and ensures the render loop is
 * alive so the reaction is actually drawn (the loop stops once settled).
 */
function kickSimulation(alpha: number) {
  if (!simulation) return;
  simulation.alpha(Math.max(simulation.alpha(), alpha));
  startSimulationLoop();
}

/* ============================================================
   CAMERA MESSAGE HANDLER (Pan / Zoom / Set Camera)
   ============================================================ */

function handleCameraMessage(msg: CameraControlMessage) {
  if (!app) return;

  let cameraChanged = false;
  let sceneNeedsRefresh = false;

  switch (msg.type) {
    case WorkerMessageType.PAN: {
      camera.x += msg.dx;
      camera.y += msg.dy;
      constrainCamera();
      cameraChanged = true;

      // User is actively panning (from pointer drag or other controls like buttons)
      interactions.setCursor('grabbing');
      break;
    }

    case WorkerMessageType.ZOOM: {
      // Protocol shape: { factor, focalX?, focalY? }
      // focalX/focalY are in screen pixels (same as the old x/y)
      const { factor, focalX, focalY } = msg;

      const screenX = focalX ?? (app!.renderer.width / 2);
      const screenY = focalY ?? (app!.renderer.height / 2);

      const worldX = (screenX - camera.x) / camera.zoom;
      const worldY = (screenY - camera.y) / camera.zoom;

      const newZoom = clampZoom(camera.zoom * factor);

      camera.x = screenX - worldX * newZoom;
      camera.y = screenY - worldY * newZoom;
      camera.zoom = newZoom;
      constrainCamera();
      cameraChanged = true;
      sceneNeedsRefresh = true;
      break;
    }

    case WorkerMessageType.SET_CAMERA: {
      if (msg.camera) {
        const previousZoom = camera.zoom;
        camera.x = msg.camera.x ?? camera.x;
        camera.y = msg.camera.y ?? camera.y;
        camera.zoom =
          msg.camera.zoom !== undefined ? clampZoom(msg.camera.zoom) : camera.zoom;
        constrainCamera();
        cameraChanged = true;
        sceneNeedsRefresh = previousZoom !== camera.zoom;
      }
      break;
    }
  }

  if (cameraChanged) {
    if (sceneNeedsRefresh) {
      updateNodeStyles();
    } else {
      applyCameraTransform();
      app.renderer.render(app.stage);
    }

    // Notify main thread about camera change (for minimap, URL sync, etc.)
    postToMain({
      type: 'CAMERA_CHANGED',
      protocolVersion: 1,
      camera: { ...camera },
    });
  }
}

/* ============================================================
   HIT-TESTING + SELECTION / HOVER (runs in worker for best performance)
   ============================================================ */

function handleSetSelection(msg: SetSelectionMessage) {
  currentSelection = msg.selection;
  updateNodeStyles();
}

function handleResetView() {
  if (!app || nodeData.length === 0) return;

  const bounds = getGraphBounds();
  if (!bounds) return;

  const nextZoom = getFitZoom(bounds);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  camera.zoom = nextZoom;
  camera.x = app.renderer.width / 2 - cx * nextZoom;
  camera.y = app.renderer.height / 2 - cy * nextZoom;
  constrainCamera();

  updateNodeStyles();

  postToMain({
    type: MainMessageType.CAMERA_CHANGED,
    protocolVersion: 1,
    camera: { ...camera },
  });
}

function handleWheel(msg: WheelMessage) {
  if (!app) return;

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

  updateNodeStyles();

  postToMain({
    type: MainMessageType.CAMERA_CHANGED,
    protocolVersion: 1,
    camera: { ...camera },
  });
}

function handleDoubleClick(msg: DoubleClickMessage) {
  if (!app || !currentGraph || nodeData.length === 0) return;

  const worldX = (msg.x - camera.x) / camera.zoom;
  const worldY = (msg.y - camera.y) / camera.zoom;

  const closest = findClosestOrbitMapNode(
    nodeData,
    { x: worldX, y: worldY },
    10
  );

  if (closest?.node.kind === "bookmark") {
    postToMain({
      type: MainMessageType.OPEN_BOOKMARK,
      protocolVersion: 1,
      bookmarkId: closest.id,
    });
  }
}

/* ============================================================
   ANIMATION SYSTEM (Assign + Focus Pulse)
   ============================================================ */

function handleAnimateAssign(msg: AnimateAssignMessage) {
  const { bookmarkId, anchorId, duration = 520 } = msg;

  const bookmarkDatum = nodeById.get(bookmarkId);
  const anchorDatum = nodeById.get(anchorId);

  if (!bookmarkDatum || !anchorDatum) {
    console.warn('[OrbitWorker] Cannot animate assign - nodes not found');
    return;
  }

  // Remove any existing assign animation for this node
  const existingIndex = activeAnimations.findIndex(a => a.nodeId === bookmarkId && a.type === 'assign');
  if (existingIndex !== -1) activeAnimations.splice(existingIndex, 1);

  const animation: Animation = {
    id: `assign-${bookmarkId}-${Date.now()}`,
    type: 'assign',
    nodeId: bookmarkId,
    startTime: Date.now(),
    duration,
    fromX: bookmarkDatum.x,
    fromY: bookmarkDatum.y,
    targetX: anchorDatum.x,
    targetY: anchorDatum.y,
  };

  activeAnimations.push(animation);

  // Temporarily fix the node position during animation (we'll restore after)
  bookmarkDatum.fx = anchorDatum.x;
  bookmarkDatum.fy = anchorDatum.y;

  // Clear any previous temporary scale (from pulse or previous animation)
  delete bookmarkDatum.scale;

  // Give the simulation a little kick so other nodes react
  kickSimulation(0.3);
}

function handleFocusPulse(msg: FocusPulseMessage) {
  const { nodeId, duration = 750 } = msg;

  const datum = nodeById.get(nodeId);
  if (!datum) return;

  // Remove existing pulse on this node
  const existingIndex = activeAnimations.findIndex(a => a.nodeId === nodeId && a.type === 'pulse');
  if (existingIndex !== -1) activeAnimations.splice(existingIndex, 1);

  const animation: Animation = {
    id: `pulse-${nodeId}-${Date.now()}`,
    type: 'pulse',
    nodeId,
    startTime: Date.now(),
    duration,
  };

  activeAnimations.push(animation);

  // Make sure the render loop is alive so the pulse actually draws even when
  // the simulation has already settled.
  startSimulationLoop();
}

function handleFocusOn(msg: FocusOnMessage) {
  const selection = msg.selection;
  if (!selection || !nodeData.length || !app) return;

  // Capture app in a local variable so TypeScript knows it's non-null inside the animation closure
  const currentApp = app;

  // Find the target node in our simulation data
  const target = nodeById.get(selection.id);
  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
    return;
  }

  // Update selection state immediately so neighbor highlighting and labels react
  currentSelection = { id: selection.id, kind: selection.kind };

  const currentZoom = camera.zoom || 1;

  // Calculate target camera position to center the node
  const targetCamera = constrainCameraState({
    x: (currentApp.renderer.width / 2) - (target.x * currentZoom),
    y: (currentApp.renderer.height / 2) - (target.y * currentZoom),
    zoom: currentZoom,
  });

  const startX = camera.x;
  const startY = camera.y;
  const startTime = Date.now();
  const duration = 350; // ms

  // Smoothly animate the camera toward the target.
  const animateCamera = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOrbitMapOutCubic(progress);

    camera.x = startX + (targetCamera.x - startX) * eased;
    camera.y = startY + (targetCamera.y - startY) * eased;
    camera.zoom = targetCamera.zoom;
    constrainCamera();

    applyCameraTransform();
    currentApp.renderer.render(currentApp.stage);

    if (progress < 1) {
      requestAnimationFrame(animateCamera);
    } else {
      // Snap to final position
      camera.x = targetCamera.x;
      camera.y = targetCamera.y;
      camera.zoom = targetCamera.zoom;
      constrainCamera();
      applyCameraTransform();
      currentApp.renderer.render(currentApp.stage);

      // Trigger a small pulse on the focused node for clear visual feedback
      const pulseDuration = 380;
      const existingPulseIndex = activeAnimations.findIndex(
        a => a.nodeId === selection.id && a.type === 'pulse'
      );
      if (existingPulseIndex !== -1) {
        activeAnimations.splice(existingPulseIndex, 1);
      }

      activeAnimations.push({
        id: `pulse-${selection.id}-${Date.now()}`,
        type: 'pulse',
        nodeId: selection.id,
        startTime: Date.now(),
        duration: pulseDuration,
      });

      // Stronger simulation kick now that the camera has arrived
      kickSimulation(0.35);

      // Notify main thread
      postToMain({
        type: MainMessageType.CAMERA_CHANGED,
        protocolVersion: 1,
        camera: { ...camera },
      });
    }
  };

  animateCamera();

  // Initial simulation kick so nodes start reacting to the focus action
  kickSimulation(0.2);

  // Notify selection change
  postToMain({
    type: MainMessageType.SELECTION_CHANGED,
    protocolVersion: 1,
    selection: currentSelection,
  });
}

/**
 * Per-frame animation updater (called from the simulation tick).
 * Handles visual interpolation for assign flights and cleanup for pulses.
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

    const progress = getOrbitMapAnimationProgress(anim, now);

    if (
      anim.type === "assign" &&
      anim.fromX !== undefined && anim.fromY !== undefined &&
      anim.targetX !== undefined && anim.targetY !== undefined
    ) {
      // Ease the visual position of the node along the flight path
      const t = easeOrbitMapOutCubic(progress);
      datum.x = anim.fromX + (anim.targetX - anim.fromX) * t;
      datum.y = anim.fromY + (anim.targetY - anim.fromY) * t;

      // Keep the force simulation locked at the target (set in handleAnimateAssign)
      datum.fx = anim.targetX;
      datum.fy = anim.targetY;

      // Give a nice "flying" scale during the animation
      if (progress < 1) {
        datum.scale = 1.13;
      } else {
        delete datum.scale;
      }

      if (progress >= 1) {
        // Release the lock so the node can settle naturally with the sim
        delete datum.fx;
        delete datum.fy;

        toRemove.push(index);

        // Trigger a nice arrival pulse on the node
        const pulseDuration = 420;
        const existingPulse = activeAnimations.findIndex(
          a => a.nodeId === anim.nodeId && a.type === 'pulse'
        );
        if (existingPulse !== -1) activeAnimations.splice(existingPulse, 1);

        activeAnimations.push({
          id: `pulse-${anim.nodeId}-${Date.now()}`,
          type: 'pulse',
          nodeId: anim.nodeId,
          startTime: Date.now(),
          duration: pulseDuration,
        });

        // Stronger simulation kick on arrival so nearby nodes react nicely
        kickSimulation(0.45);

        // Notify the main thread (OrbitMapCanvasHost can resolve its promise)
        postToMain({
          type: MainMessageType.ANIMATE_ASSIGN_COMPLETE,
          protocolVersion: 1,
          bookmarkId: anim.nodeId,
        });
      }
    }

    if (anim.type === "pulse") {
      if (progress >= 1) {
        // Restore any temporary scale applied during the pulse drawing
        const g = nodeGraphicsMap.get(anim.nodeId);
        if (g) {
          g.scale.set(1);
        }
        toRemove.push(index);
      }
    }
  });

  // Remove completed animations (reverse order to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    activeAnimations.splice(toRemove[i], 1);
  }
}

self.onmessage = handleMessage;

/* ============================================================
   CAMERA HELPERS (Phase B)
   ============================================================ */

function applyCameraTransform() {
  // We apply camera to the containers so everything moves together
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

  // Distant stars follow the camera at a fraction of its speed for depth.
  if (starfieldContainer) {
    starfieldContainer.position.set(
      tx * STARFIELD_PARALLAX,
      ty * STARFIELD_PARALLAX
    );
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

function getFitZoom(bounds: OrbitMapGraphBounds): number {
  if (!app) return MIN_CAMERA_ZOOM;
  return getOrbitMapFitZoom(bounds, getCameraConfig());
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

function autoFitCamera(width: number, height: number, preservePrevious = false) {
  if (!currentGraph || nodeData.length === 0) {
    camera = { x: 0, y: 0, zoom: 1 };
    return;
  }

  // If we already have a reasonable camera and the graph hasn't changed much, keep it
  if (preservePrevious && camera.zoom > 0.3 && camera.zoom < 4) {
    return;
  }

  const bounds = getGraphBounds();
  if (!bounds) return;

  camera.zoom = getFitZoom(bounds);
  camera.x = (width / 2) - ((bounds.minX + bounds.maxX) / 2) * camera.zoom;
  camera.y = (height / 2) - ((bounds.minY + bounds.maxY) / 2) * camera.zoom;
  constrainCamera();
}

/* ============================================================ */
