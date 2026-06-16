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
  type SetThemeMessage,
  type FocusOnMessage,
  type SetSelectionMessage,
  type SetHighlightMessage,
  type SetSearchMessage,
  type WheelMessage,
  type DoubleClickMessage,
  type LayoutUpdatedMessage,
  type CameraState,
  collectTransferables,
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
} from 'pixi.js';
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
  getOrbitMapEdgeLodAlpha,
  getOrbitMapViewBounds,
  isInOrbitMapViewBounds,
  type OrbitMapViewBounds,
} from './orbit-map-lod';
import {
  declutterOrbitMapLabels,
  getOrbitMapLabelPriority,
  ORBIT_MAP_LABEL_CELL_SIZE,
  type OrbitMapLabelCandidate,
} from './orbit-map-labels';
import { findClosestOrbitMapNode, getOrbitMapHitPadding } from './orbit-map-hit-test';
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
  buildOrbitMapStarfield,
  createOrbitMapGlowTexture,
  createOrbitMapVignetteSprite,
} from './orbit-map-scene';

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

// Current graph data and filter (stored in worker)
let currentGraph: OrbitGraphPayload | null = null;
let currentFilter: GraphFilter = 'all';
let perf = createOrbitMapPerfLogger(false);

// Pixi containers for organization
let backgroundContainer: Container | null = null; // Screen-space vignette (not camera-transformed)
let starfieldContainer: Container | null = null;  // Distant stars with parallax
let linksContainer: Container | null = null;
let glowContainer: Container | null = null;       // Cluster halos + hub glows (camera space)
let nodesContainer: Container | null = null;
let ringsContainer: Container | null = null;      // Selection / neighbor highlight rings
let labelsContainer: Container | null = null;
let effectsContainer: Container | null = null;    // Temporary effects (pulses, flights)
let linkGraphics: Graphics | null = null;
let ringGraphics: Graphics | null = null;
let vignetteSprite: Sprite | null = null;
let glowTexture: Texture | null = null;
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
const STARFIELD_PARALLAX = 0.35;
const HUB_GLOW_ALPHA = 0.22;

// Labels
const labelMap = new Map<string, BitmapText>();

// Graph scene data (positions come from the deterministic cluster layout)
let nodeData: MapNode[] = [];
let nodeById = new Map<string, MapNode>();
let linkData: MapLink[] = [];
let clusters = new Map<string, OrbitMapCluster>();
/** Nodes currently visible under filter + LOD (the hit-testable set). */
let hitTestNodes: MapNode[] = [];

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
  type: 'assign' | 'pulse' | 'return';
  nodeId: string;
  startTime: number;
  duration: number;
  targetX?: number;
  targetY?: number;
  fromX?: number;
  fromY?: number;
}

const activeAnimations: MapAnimation[] = [];
let renderLoopRunning = false;

function getPalette() {
  return getOrbitMapPalette(colorMode);
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
    currentSelection = selection;
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

/** Handle incoming messages from the main thread. */
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

  colorMode = msg.colorMode ?? 'dark';
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
      resolution: msg.dpr,
      antialias: true,
      backgroundColor: palette.background,
      autoDensity: true,
    }).then(() => {
      isInitialized = true;
      const initMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
          initStartedAt
      );
      perf.mark('worker:init:ready', { initMs });

      // Install a BitmapFont once for fast, high-quality labels
      BitmapFont.install({
        name: 'OrbitLabel',
        style: {
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: LABEL_BASE_FONT_SIZE,
          fill: palette.labelDefault,
        },
        chars: BitmapFontManager.ASCII,
      });

      // Rendering is driven on demand (interactions, animations, camera).
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
  updateNodeStyles();
}

function handleSetTheme(msg: SetThemeMessage) {
  if (msg.colorMode === colorMode) return;
  colorMode = msg.colorMode;
  applyColorMode();
}

function applyColorMode() {
  const palette = getPalette();
  if (app) {
    app.renderer.background.color = palette.background;
  }
  refreshBackgroundAtmosphere();
  if (currentGraph) {
    rebuildLinkDataFromGraph();
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

  vignetteSprite = createOrbitMapVignetteSprite(colorMode);
  backgroundContainer.addChildAt(vignetteSprite, 0);
  layoutVignette(app.renderer.width, app.renderer.height);
  buildOrbitMapStarfield(starfieldContainer, colorMode);
}

function handleSetGraph(msg: SetGraphMessage) {
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
  }

  applyActiveSearch();
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
      results: [],
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
    results,
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

function handleDestroy() {
  interactions.reset();
  cancelCameraAnimation();
  renderLoopRunning = false;
  activeAnimations.length = 0;
  labelMap.clear();
  nodeGraphicsMap.clear();
  glowSpriteMap.clear();
  haloSpriteMap.clear();
  nodeById.clear();
  clusters.clear();
  hitTestNodes = [];
  adjacency.clear();
  searchIndex = [];
  activeSearchQuery = '';
  lastStructureKey = '';
  highlightedNodeIds = null;
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

  if (!vignetteSprite) {
    vignetteSprite = createOrbitMapVignetteSprite(colorMode);
    backgroundContainer.addChild(vignetteSprite);
  }
  layoutVignette(app.renderer.width, app.renderer.height);
  buildOrbitMapStarfield(starfieldContainer, colorMode);
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
  if (linksContainer) linksContainer.removeChildren();
  if (glowContainer) {
    for (const glow of glowSpriteMap.values()) glow.destroy();
    for (const halo of haloSpriteMap.values()) halo.destroy();
    glowSpriteMap.clear();
    haloSpriteMap.clear();
    glowContainer.removeChildren();
  }
  if (nodesContainer) nodesContainer.removeChildren();
  if (ringsContainer) ringsContainer.removeChildren();
  if (labelsContainer) {
    for (const label of labelMap.values()) label.destroy();
    labelMap.clear();
    labelsContainer.removeChildren();
  }
  if (effectsContainer) effectsContainer.removeChildren();
  linkGraphics = null;
  ringGraphics = null;
  nodeGraphicsMap.clear();
  nodeById.clear();
  activeAnimations.length = 0;

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
    visual: getOrbitMapNodeVisualStyle(node),
  }));

  // Deterministic two-phase layout: anchor constellation + bookmark orbits.
  const layout = computeOrbitMapClusterLayout(
    nodeData.map(({ id, kind, radius }) => ({ id, kind, radius })),
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
  if (!linksContainer || !nodesContainer || !ringsContainer || !glowContainer) {
    return;
  }

  linkGraphics = new Graphics();
  linksContainer.addChild(linkGraphics);

  ringGraphics = new Graphics();
  ringsContainer.addChild(ringGraphics);

  // Cluster halos go in first so hub glows render above them.
  if (glowTexture) {
    for (const cluster of clusters.values()) {
      if (cluster.memberCount === 0) continue;
      const anchorDatum = nodeById.get(cluster.anchorId);
      if (!anchorDatum) continue;
      const halo = new Sprite(glowTexture);
      halo.anchor.set(0.5);
      halo.tint = anchorDatum.visual.color;
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
    const visualStyle = datum.visual;
    if (visualStyle.isHub && glowTexture) {
      const glow = new Sprite(glowTexture);
      glow.anchor.set(0.5);
      glow.tint = visualStyle.color;
      glow.alpha = HUB_GLOW_ALPHA;
      const glowSize = datum.radius * 6;
      glow.width = glowSize;
      glow.height = glowSize;
      glow.position.set(datum.x, datum.y);
      glowContainer.addChild(glow);
      glowSpriteMap.set(datum.id, glow);
    }
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

    const baseVisual = getOrbitMapNodeVisualStyle(datum.node);
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
            color: mixOrbitMapColors(baseVisual.color, accent, 0.55),
            strokeColor: mixOrbitMapColors(baseVisual.strokeColor, accent, 0.4),
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
    g.circle(0, 0, datum.radius + 1.5);
    g.fill({ color: visualStyle.color, alpha: 0.16 });
    g.stroke({
      width: visualStyle.strokeWidth,
      color: visualStyle.strokeColor,
      alpha: 0.6,
    });
    g.circle(0, 0, Math.max(3.2, datum.radius * 0.44));
    g.fill({ color: visualStyle.color, alpha: 1 });
    g.stroke({ width: 1, color: palette.hubInnerStroke, alpha: 0.43 });
  } else {
    g.circle(0, 0, datum.radius);
    g.fill({ color: visualStyle.color, alpha: 1 });
    g.stroke({
      width: visualStyle.strokeWidth,
      color: visualStyle.strokeColor,
      alpha: 0.6,
    });
  }
}

function redrawNodeGraphics(datum: MapNode) {
  const g = nodeGraphicsMap.get(datum.id);
  if (!g) return;

  drawNodeShape(g, datum);
  g.position.set(datum.x, datum.y);

  const glow = glowSpriteMap.get(datum.id);
  if (datum.visual.isHub && glowTexture && glow) {
    glow.tint = datum.visual.color;
    const glowSize = datum.radius * 6;
    glow.width = glowSize;
    glow.height = glowSize;
    glow.position.set(datum.x, datum.y);
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
    datum.visual = getOrbitMapNodeVisualStyle(graphNode);

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
      g.alpha = alpha * getEntranceFactor(datum, entranceElapsed);
      g.position.set(datum.x, datum.y);
      g.scale.set(datum.scale || 1);
    }

    const glow = glowSpriteMap.get(datum.id);
    if (glow) {
      glow.visible = visible;
      if (visible) {
        glow.alpha =
          HUB_GLOW_ALPHA * alpha * getEntranceFactor(datum, entranceElapsed);
        glow.position.set(datum.x, datum.y);
      }
    }
  }

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

  if (linksContainer) {
    linksContainer.alpha =
      entranceElapsed === null
        ? 1
        : easeOrbitMapOutCubic(Math.min(entranceElapsed / 800, 1));
  }

  drawLinks(focusContext, bounds);
  drawRings(focusContext);
  updateLabels(focusContext);
  renderEffects();

  applyCameraTransform();
  app.renderer.render(app.stage);
}

function drawLinks(focusContext: FocusContext, bounds: OrbitMapViewBounds | null) {
  if (!linkGraphics) return;

  const edgeLodAlpha = getOrbitMapEdgeLodAlpha(camera.zoom);
  linkGraphics.clear();

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

    let linkAlpha = !focusContext.activeId
      ? 0.14
      : touchesActive
        ? focusContext.hasSelection
          ? 0.86
          : 0.42
        : focusContext.hasSelection
          ? 0.075
          : 0.085;
    if (!touchesActive) linkAlpha *= edgeLodAlpha;

    const linkWidth = touchesActive
      ? focusContext.hasSelection
        ? 2.05
        : 1.35
      : 0.85;
    const linkColor = touchesActive
      ? mixOrbitMapColors(link.color, getPalette().linkHighlightMix, 0.45)
      : link.color;

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

    linkGraphics.moveTo(sx, sy);
    linkGraphics.quadraticCurveTo(cx, cy, tx, ty);
    linkGraphics.stroke({ width: linkWidth, color: linkColor, alpha: linkAlpha });
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

  const active = nodeById.get(focusContext.activeId);
  if (active) {
    const ringColor = currentSelection ? 0xfacc15 : 0x38bdf8;
    ringGraphics.circle(active.x, active.y, active.radius + 10);
    ringGraphics.stroke({ width: 5, color: ringColor, alpha: 0.2 });
    ringGraphics.circle(active.x, active.y, active.radius + 6);
    ringGraphics.stroke({ width: 2.4, color: ringColor, alpha: 0.98 });
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

    label.style.fill = getOrbitMapLabelFill(
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
  label.alpha = isActive ? 0.88 : isNeighbor ? 0.72 : camera.zoom < 1.15 ? 0.56 : 0.74;
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
        pulse.circle(datum.x, datum.y, pulseRadius);
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

      // Faded ghost at the original position.
      const ghost = new Graphics();
      ghost.circle(anim.fromX, anim.fromY, datum.radius * 0.85);
      ghost.fill({ color: 0x64748b, alpha: 0.14 });
      ghost.stroke({ width: 1, color: 0x64748b, alpha: 0.25 });
      effectsContainer!.addChild(ghost);
    }
  });
}

/* ============================================================
   RENDER LOOP (drives animations + the entrance fade)
   ============================================================ */

function startRenderLoop() {
  if (renderLoopRunning || !app) return;
  renderLoopRunning = true;

  const tick = () => {
    if (!app) {
      renderLoopRunning = false;
      return;
    }

    updateAnimations();
    updateNodeStyles();

    if (activeAnimations.length > 0 || entranceStartedAt !== null) {
      requestAnimationFrame(tick);
    } else {
      renderLoopRunning = false;
      // Drag returns / assign flights may have moved nodes — sync the minimap.
      sendLayoutUpdate(true);
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

    const progress = getOrbitMapAnimationProgress(anim, now);

    if (
      (anim.type === 'assign' || anim.type === 'return') &&
      anim.fromX !== undefined && anim.fromY !== undefined &&
      anim.targetX !== undefined && anim.targetY !== undefined
    ) {
      const t = easeOrbitMapOutCubic(progress);
      datum.x = anim.fromX + (anim.targetX - anim.fromX) * t;
      datum.y = anim.fromY + (anim.targetY - anim.fromY) * t;

      if (anim.type === 'assign') {
        datum.scale = progress < 1 ? 1.13 : undefined;
      }

      if (progress >= 1) {
        toRemove.push(index);
        if (anim.type === 'assign') {
          delete datum.scale;
          pushPulse(anim.nodeId);
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

  const closest = findClosestOrbitMapNode(
    hitTestNodes,
    { x: worldX, y: worldY },
    getOrbitMapHitPadding(camera.zoom)
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
    currentSelection = selection;
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
  currentSelection = msg.selection;
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
  currentSelection = { id: selection.id, kind: selection.kind };
  updateNodeStyles();
  postToMain({
    type: MainMessageType.SELECTION_CHANGED,
    protocolVersion: 1,
    selection: currentSelection,
  });

  frameSelection(currentSelection);
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

  camera.zoom = getOrbitMapFitZoom(bounds, getCameraConfig());
  camera.x = (width / 2) - ((bounds.minX + bounds.maxX) / 2) * camera.zoom;
  camera.y = (height / 2) - ((bounds.minY + bounds.maxY) / 2) * camera.zoom;
  constrainCamera();
}

/* ============================================================ */
