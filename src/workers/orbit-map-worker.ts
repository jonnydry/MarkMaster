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
  type WheelMessage,
  type DoubleClickMessage,
  type CursorChangedMessage,
  type LayoutUpdatedMessage,
  collectTransferables,
} from '@/lib/orbit-worker-protocol';

import type { OrbitGraphPayload, OrbitGraphNode, OrbitGraphEdge } from '@/types';
import type { GraphFilter, OrbitMapSelection } from '@/lib/orbit-worker-protocol';
import { Container, Graphics, Text, BitmapFont, BitmapFontManager, BitmapText } from 'pixi.js';
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
import { createOrbitMapPerfLogger } from './orbit-map-perf';
import {
  getOrbitMapNodeRadius,
  getOrbitMapNodeVisualStyle,
  getOrbitMapLabelText,
  shouldShowOrbitMapLabel,
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

// Cursor state for CURSOR_CHANGED messages
let isPointerDown = false;
let isPanning = false;
let panDragLast: { x: number; y: number } | null = null;
let currentCursor: CursorChangedMessage['cursor'] = 'default';

function postCursorChange(cursor: CursorChangedMessage['cursor']) {
  if (currentCursor === cursor) return;
  currentCursor = cursor;
  postToMain({
    type: MainMessageType.CURSOR_CHANGED,
    protocolVersion: 1,
    cursor,
  });
}

// Pixi containers for organization
let linksContainer: Container | null = null;
let nodesContainer: Container | null = null;
let labelsContainer: Container | null = null;
let effectsContainer: Container | null = null; // For temporary effects like pulses and animations
let linkGraphics: Graphics | null = null;

// Label management for LOD
const labelMap = new Map<string, Text | BitmapText>(); // nodeId -> Text or BitmapText object

// d3-force simulation (runs in the worker)
let simulation: Simulation<SimulationNode, SimulationLink> | null = null;
let nodeData: SimulationNode[] = [];
let linkData: SimulationLink[] = [];

// Camera state (position + zoom)
let camera = { x: 0, y: 0, zoom: 1 };

// Simple map from node id to its Pixi Graphics object
const nodeGraphicsMap = new Map<string, Graphics>();

// Current interaction state (hover / selection) for visual feedback
let currentHover: { id: string; kind: string } | null = null;
let currentSelection: OrbitMapSelection | null = null;

// Adjacency map for efficient neighbor highlighting
const adjacency = new Map<string, Set<string>>();

function isSameOrbitMapHover(
  a: { id: string; kind: string } | null,
  b: { id: string; kind: string } | null
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.kind === b.kind;
}

// Label visibility thresholds (based on zoom level)
const LABEL_ZOOM_THRESHOLD = 0.95;          // Below this, hide text labels and let the graph read as structure.
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
      handlePointerEvent(msg as PointerEventMessage);
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
  rebuildScene();
}

function handleDestroy() {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
  activeAnimations.length = 0;
  labelMap.clear();
  nodeGraphicsMap.clear();
  adjacency.clear();
  app?.destroy();
  app = null;
  isInitialized = false;
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
  if (nodesContainer) nodesContainer.removeChildren();
  if (labelsContainer) {
    for (const label of labelMap.values()) {
      label.destroy();
    }
    labelMap.clear();
    labelsContainer.removeChildren();
  }
  if (effectsContainer) effectsContainer.removeChildren();
  linkGraphics = null;
  nodeGraphicsMap.clear();

  if (!linksContainer) {
    linksContainer = new Container();
    app.stage.addChild(linksContainer);
  }
  if (!nodesContainer) {
    nodesContainer = new Container();
    app.stage.addChild(nodesContainer);
  }
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

  // Prepare nodes for d3-force using our internal SimulationNode type
  nodeData = visibleNodes.map((node) => {
    const datum: SimulationNode = {
      id: node.id,
      kind: node.kind,
      node,
      radius: getOrbitMapNodeRadius(node),
    };

    // Use persisted positions if available (from server or previous layout)
    const initialPosition = currentInitialPositions.get(node.id);
    const simNode = node as OrbitGraphNode & { x?: number; y?: number };
    if (initialPosition) {
      datum.x = initialPosition.x;
      datum.y = initialPosition.y;
    } else if (
      typeof simNode.x === 'number' &&
      Number.isFinite(simNode.x) &&
      typeof simNode.y === 'number' &&
      Number.isFinite(simNode.y)
    ) {
      datum.x = simNode.x;
      datum.y = simNode.y;
    } else {
      const pos = getSeededOrbitMapPosition(node.id);
      datum.x = pos.x;
      datum.y = pos.y;
    }
    return datum;
  });

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

  // Initial render + auto fit
  autoFitCamera(app.renderer.width, app.renderer.height);
  renderSceneFromSimulation();
  applyCameraTransform();
  const firstRenderMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      graphStartedAt
  );
  perf.mark('graph:first-render', {
    firstRenderMs,
    visibleNodes: nodeData.length,
    visibleEdges: linkData.length,
  });

  // Start the simulation loop inside the worker
  startSimulationLoop();
}

/** Renders nodes and links from the current simulation state */
function renderSceneFromSimulation() {
  if (!linksContainer || !nodesContainer) return;

  linksContainer.removeChildren();
  nodesContainer.removeChildren();
  nodeGraphicsMap.clear();

  const focusContext = getFocusContext();

  linkGraphics = new Graphics();
  linkGraphics.alpha = 1;
  linksContainer.addChild(linkGraphics);
  drawLinks(focusContext);

  nodeData.forEach((datum) => {
    const g = new Graphics();
    const node = datum.node;

    const visualStyle = getOrbitMapNodeVisualStyle(node);

    // === Neighbor Dimming Logic ===
    const isActive = datum.id === focusContext.activeId;
    const isNeighbor = focusContext.neighborIds.has(datum.id);
    const isAssignedBookmark = node.kind === 'bookmark' && node.affiliated;

    let alpha = 1.0;
    let strokeAlpha = 0.6;

    if (focusContext.activeId) {
      if (isActive) {
        alpha = 1.0;
        strokeAlpha = 0.96;
      } else if (isNeighbor) {
        alpha = focusContext.hasSelection ? 0.94 : 0.78;
        strokeAlpha = focusContext.hasSelection ? 0.82 : 0.6;
      } else {
        if (focusContext.hasSelection) {
          alpha = visualStyle.isHub ? 0.34 : isAssignedBookmark ? 0.18 : 0.24;
          strokeAlpha = visualStyle.isHub ? 0.24 : 0.2;
        } else {
          alpha = visualStyle.isHub ? 0.26 : isAssignedBookmark ? 0.16 : 0.22;
          strokeAlpha = visualStyle.isHub ? 0.2 : 0.16;
        }
      }
    } else if (camera.zoom < 0.26 && node.kind === 'bookmark') {
      alpha = node.affiliated ? 0.5 : 0.7;
      strokeAlpha = 0.24;
    }

    if (visualStyle.isHub) {
      g.circle(0, 0, datum.radius + 1.5);
      g.fill({ color: visualStyle.color, alpha: alpha * 0.16 });
      g.stroke({
        width: visualStyle.strokeWidth,
        color: visualStyle.strokeColor,
        alpha: Math.max(strokeAlpha, 0.42) * alpha,
      });
      g.circle(0, 0, Math.max(3.2, datum.radius * 0.44));
      g.fill({ color: visualStyle.color, alpha });
      g.stroke({ width: 1, color: 0xffffff, alpha: strokeAlpha * 0.72 });
    } else {
      g.circle(0, 0, datum.radius);
      g.fill({ color: visualStyle.color, alpha });
      g.stroke({
        width: visualStyle.strokeWidth,
        color: visualStyle.strokeColor,
        alpha: strokeAlpha,
      });
    }

    // Stronger ring for active node
    if (isActive) {
      const ringColor = currentSelection ? 0xfacc15 : 0x38bdf8;
      g.circle(0, 0, datum.radius + 10);
      g.stroke({ width: 5, color: ringColor, alpha: 0.2 });
      g.circle(0, 0, datum.radius + 6);
      g.stroke({ width: 2.4, color: ringColor, alpha: 0.98 });
    } else if (isNeighbor && focusContext.hasSelection && visualStyle.isHub) {
      g.circle(0, 0, datum.radius + 5);
      g.stroke({ width: 1.6, color: 0x60a5fa, alpha: 0.58 });
    }

    g.position.set(datum.x ?? 0, datum.y ?? 0);
    nodesContainer!.addChild(g);
    nodeGraphicsMap.set(datum.id, g);
  });

  renderEffects();

  // === Label Rendering with Level of Detail (LOD) ===
  if (!labelsContainer) {
    labelsContainer = new Container();
    app!.stage.addChild(labelsContainer);
  }

  // First, remove labels for nodes that no longer qualify for the current LOD.
  for (const [nodeId, label] of labelMap) {
    const datum = nodeData.find((d) => d.id === nodeId);
    const node = datum?.node;

    let shouldKeep = false;

    if (node && datum) {
      shouldKeep = shouldRenderLabel(datum, focusContext);
    }

    if (!shouldKeep) {
      labelsContainer.removeChild(label);
      label.destroy();
      labelMap.delete(nodeId);
    }
  }

  // Now create or update labels for nodes that should have them
  nodeData.forEach((datum) => {
    const node = datum.node;
    const nodeId = datum.id;

    const isActive = datum.id === focusContext.activeId;
    const isNeighbor = focusContext.neighborIds.has(nodeId);

    if (!shouldRenderLabel(datum, focusContext)) {
      return;
    }

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
      labelsContainer!.addChild(label);
    } else {
      // Update existing label if needed
      if (label.text !== labelText) {
        label.text = labelText;
      }
    }

    label.style.fill = isActive ? 0xf8fafc : isNeighbor ? 0xcbd5e1 : 0xe2e8f0;
    label.style.fontWeight = isActive ? '600' : '400';

    positionLabel(label, datum, focusContext);
  });

  if (app) {
    applyCameraTransform();
    app.renderer.render(app.stage);
  }
}

function resolveLinkNode(endpoint: string | SimulationNode): SimulationNode | undefined {
  return typeof endpoint === 'string'
    ? nodeData.find((node) => node.id === endpoint)
    : endpoint;
}

function getFocusContext() {
  const activeId = currentSelection?.id || currentHover?.id || null;
  return {
    activeId,
    hasSelection: Boolean(currentSelection),
    neighborIds: activeId ? adjacency.get(activeId) || new Set<string>() : new Set<string>(),
  };
}

function shouldRenderLabel(
  datum: SimulationNode,
  focusContext: ReturnType<typeof getFocusContext>
) {
  const isActive = datum.id === focusContext.activeId;
  const isNeighbor = focusContext.neighborIds.has(datum.id);

  return shouldShowOrbitMapLabel(
    datum.node.kind,
    camera.zoom,
    LABEL_ZOOM_THRESHOLD,
    {
      isActive,
      isSelectedNeighbor: focusContext.hasSelection && isNeighbor,
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
      ? 0.16
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
    const linkColor = touchesActive ? 0xcbd5e1 : 0x334155;

    linkGraphics!.moveTo(source.x ?? 0, source.y ?? 0);
    linkGraphics!.lineTo(target.x ?? 0, target.y ?? 0);
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
    const datum = nodeData.find((node) => node.id === nodeId);
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
      const datum = nodeData.find((d) => d.id === anim.nodeId);
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
      const datum = nodeData.find((d) => d.id === anim.nodeId);
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

/** Runs the simulation inside the worker */
function startSimulationLoop() {
  const activeSimulation = simulation;
  if (!activeSimulation || !app) return;

  let layoutUpdateTickCounter = 0;
  const LAYOUT_UPDATE_INTERVAL = 35; // send layout every ~35 ticks while running
  const simulationStartedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const tick = () => {
    activeSimulation.tick();

    // Update animations (assign flights, pulses, etc.)
    updateAnimations();
    drawLinks();

    // Update Pixi positions from simulation data
    nodeData.forEach((datum) => {
      const g = nodeGraphicsMap.get(datum.id);
      if (g) {
        g.position.set(datum.x ?? 0, datum.y ?? 0);
        g.scale.set(datum.scale || 1);
      }
    });
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

  activeSimulation.alpha(1).restart();
  tick();
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
      postCursorChange('grabbing');
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
      renderSceneFromSimulation();
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
  renderSceneFromSimulation();
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

  renderSceneFromSimulation();

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

  renderSceneFromSimulation();

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

function handlePointerEvent(msg: PointerEventMessage) {
  if (!app || !currentGraph || nodeData.length === 0) return;

  // PointerLeaveMessage doesn't carry coordinates, so we handle it separately
  if (msg.type === WorkerMessageType.POINTER_LEAVE) {
    isPointerDown = false;
    isPanning = false;
    panDragLast = null;
    if (currentHover) {
      currentHover = null;
      renderSceneFromSimulation();
      postToMain({
        type: MainMessageType.HOVER_CHANGED,
        protocolVersion: 1,
        selection: null,
      });
    }
    postCursorChange('default');
    return;
  }

  const { type, x, y } = msg;

  // Convert screen → world
  const worldX = (x - camera.x) / camera.zoom;
  const worldY = (y - camera.y) / camera.zoom;

  const closest = findClosestOrbitMapNode(
    nodeData,
    { x: worldX, y: worldY },
    10
  );

  const newHover = closest ? { id: closest.id, kind: closest.node.kind } : null;

  if (type === WorkerMessageType.POINTER_MOVE) {
    if (isPanning && isPointerDown && panDragLast) {
      const dx = x - panDragLast.x;
      const dy = y - panDragLast.y;
      panDragLast = { x, y };
      camera.x += dx;
      camera.y += dy;
      constrainCamera();
      applyCameraTransform();
      app.renderer.render(app.stage);
      postCursorChange("grabbing");
      return;
    }

    if (!isSameOrbitMapHover(newHover, currentHover)) {
      currentHover = newHover;
      renderSceneFromSimulation();

      postToMain({
        type: MainMessageType.HOVER_CHANGED,
        protocolVersion: 1,
        selection: newHover,
        canvasX: x,
        canvasY: y,
      });
    }

    if (isPointerDown) {
      postCursorChange("grabbing");
    } else if (newHover) {
      postCursorChange("pointer");
    } else {
      postCursorChange("grab");
    }
  }

  if (type === WorkerMessageType.POINTER_DOWN) {
    isPointerDown = true;

    if (newHover) {
      isPanning = false;
      panDragLast = null;
      currentSelection = newHover;
      renderSceneFromSimulation();

      postToMain({
        type: MainMessageType.SELECTION_CHANGED,
        protocolVersion: 1,
        selection: newHover,
      });
      postCursorChange("pointer");
    } else {
      isPanning = true;
      panDragLast = { x, y };
      postCursorChange("grabbing");
    }
  }

  if (type === WorkerMessageType.POINTER_UP) {
    isPointerDown = false;
    isPanning = false;
    panDragLast = null;

    if (newHover) {
      postCursorChange("pointer");
    } else {
      postCursorChange("grab");
    }
  }
}

/* ============================================================
   ANIMATION SYSTEM (Assign + Focus Pulse)
   ============================================================ */

function handleAnimateAssign(msg: AnimateAssignMessage) {
  const { bookmarkId, anchorId, duration = 520 } = msg;

  const bookmarkDatum = nodeData.find((d) => d.id === bookmarkId);
  const anchorDatum = nodeData.find((d) => d.id === anchorId);

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
  if (simulation) {
    simulation.alpha(0.3).restart();
  }
}

function handleFocusPulse(msg: FocusPulseMessage) {
  const { nodeId, duration = 750 } = msg;

  const datum = nodeData.find((d) => d.id === nodeId);
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
}

function handleFocusOn(msg: FocusOnMessage) {
  const selection = msg.selection;
  if (!selection || !nodeData.length || !app) return;

  // Capture app in a local variable so TypeScript knows it's non-null inside the animation closure
  const currentApp = app;

  // Find the target node in our simulation data
  const target = nodeData.find((d) => d.id === selection.id);
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
      if (simulation) {
        simulation.alpha(0.35).restart();
      }

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
  if (simulation) {
    simulation.alpha(0.2).restart();
  }

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
    const datum = nodeData.find((d) => d.id === anim.nodeId);
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
        if (simulation) {
          simulation.alpha(0.45).restart();
        }

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
    nodesContainer,
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
