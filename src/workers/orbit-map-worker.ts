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
  type CursorChangedMessage,
  collectTransferables,
} from '@/lib/orbit-worker-protocol';

import type { OrbitGraphPayload, OrbitGraphNode, OrbitGraphEdge } from '@/types';
import type { GraphFilter, OrbitMapSelection } from '@/lib/orbit-worker-protocol';
import { Container, Graphics, Text, BitmapFont, BitmapText } from 'pixi.js';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, forceCenter } from 'd3-force';

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
 * Deterministic position based on node ID.
 * Used when no persisted positions are available.
 * This gives stable but spread-out initial layouts across refreshes.
 */
function seededPosition(id: string): { x: number; y: number } {
  // FNV-1a 32-bit hash
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // Convert hash into two pseudo-random values in [0, 1)
  const x = ((hash >>> 0) % 100000) / 100000;
  const y = (((hash >>> 16) ^ (hash >>> 0)) % 100000) / 100000;

  // Map to a reasonable world space
  return {
    x: (x - 0.5) * 900,   // -450 .. +450
    y: (y - 0.5) * 700,   // -350 .. +350
  };
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

// Cursor state for CURSOR_CHANGED messages
let isPointerDown = false;
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

// Label management for LOD
const labelMap = new Map<string, Text | BitmapText>(); // nodeId -> Text or BitmapText object

// d3-force simulation (runs in the worker)
let simulation: any = null;
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

// Label visibility thresholds (based on zoom level)
const LABEL_ZOOM_THRESHOLD = 0.6;           // Below this, only show important labels (tags, collections, core)
const LABEL_ZOOM_BOOKMARK_THRESHOLD = 1.8;  // Below this, hide bookmark labels to avoid clutter

/**
 * Checks if a world-space position is visible in the current camera view.
 * Adds some margin so labels don't pop in/out at the edges.
 */
function isNodeInView(worldX: number, worldY: number, margin = 150): boolean {
  if (!app) return true;

  const { width, height } = app.renderer;

  // Convert screen edges to world space
  const left   = (-camera.x) / camera.zoom;
  const right  = (width - camera.x) / camera.zoom;
  const top    = (-camera.y) / camera.zoom;
  const bottom = (height - camera.y) / camera.zoom;

  return (
    worldX >= left - margin &&
    worldX <= right + margin &&
    worldY >= top - margin &&
    worldY <= bottom + margin
  );
}

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
  (self as unknown as { postMessage: (message: any, transfer?: Transferable[]) => void })
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

  const msg: any = {
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

    case WorkerMessageType.REQUEST_LAYOUT:
      sendLayoutUpdate(false);
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
    // Create Pixi Application with the transferred OffscreenCanvas
    app = new Application();

    // Note: In Pixi v8, we use async init
    app.init({
      canvas: msg.canvas,           // The OffscreenCanvas transferred from main
      width: msg.width,
      height: msg.height,
      resolution: msg.dpr,
      antialias: true,
      backgroundColor: 0x0b0f1a,    // Dark background matching the app theme
      autoDensity: true,
    }).then(() => {
      isInitialized = true;

      // Install a BitmapFont once for fast, high-quality labels (major performance win vs regular Text)
      BitmapFont.install({
        name: 'OrbitLabel',
        style: {
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
          fontSize: 12,
          fill: 0xe2e8f0,
        },
        // @ts-ignore - Pixi v8 BitmapFont charset API
        chars: BitmapFont.ASCII,
      });

      // Basic ticker (the real render + simulation loop is driven from startSimulationLoop)
      app!.ticker.add(() => {});

      // Notify main thread (width/height can be 0 if not critical at this stage)
      postToMain({ type: MainMessageType.READY, protocolVersion: 1, width: 0, height: 0 });

      console.log('[OrbitWorker] Initialized successfully with OffscreenCanvas + BitmapFont');
    }).catch((err) => {
      postToMain({
        type: MainMessageType.ERROR,
        protocolVersion: 1,
        message: 'Failed to initialize Pixi Application: ' + String(err),
      });
    });
  } catch (err) {
    postToMain({
      type: 'ERROR',
      protocolVersion: 1,
      message: 'Worker initialization failed: ' + String(err),
    });
  }
}

function handleResize(msg: ResizeMessage) {
  if (!app || !isInitialized) return;

  app.renderer.resize(msg.width, msg.height);
}

function handleSetGraph(msg: SetGraphMessage) {
  currentGraph = msg.graph;

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
  currentFilter = msg.filter as GraphFilter;
  rebuildScene();
}

/**
 * Rebuilds the Pixi scene and starts the force-directed simulation inside the worker.
 * This is the main performance win — the heavy d3-force work no longer blocks the main thread.
 */
function rebuildScene() {
  if (!app || !currentGraph) return;

  // Stop previous simulation
  if (simulation) {
    simulation.stop();
    simulation = null;
  }

  // Clear scene
  if (linksContainer) linksContainer.removeChildren();
  if (nodesContainer) nodesContainer.removeChildren();
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

  const visibleNodes = nodes.filter(isNodeVisible);
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  // Prepare nodes for d3-force using our internal SimulationNode type
  nodeData = visibleNodes.map((node) => {
    const datum: SimulationNode = {
      id: node.id,
      kind: node.kind,
      node,
      radius: node.kind === 'bookmark' ? 6 : node.kind === 'tag' ? 10 : 8,
    };

    // Use persisted positions if available (from server or previous layout)
    const simNode = node as OrbitGraphNode & { x?: number; y?: number };
    if (typeof simNode.x === 'number' && typeof simNode.y === 'number') {
      datum.x = simNode.x;
      datum.y = simNode.y;
    } else {
      const pos = seededPosition(node.id);
      datum.x = pos.x;
      datum.y = pos.y;
    }
    return datum;
  });

  // Build links using a helper for clarity
  linkData = edges
    .map((edge) => edgeToLink(edge, visibleNodeIds))
    .filter((link): link is SimulationLink => link !== null);

  // Create and configure d3-force simulation (this is the heavy work now off the main thread)
  simulation = forceSimulation(nodeData)
    .alphaDecay(0.022)
    .velocityDecay(0.38)
    .force(
      'link',
      forceLink(linkData)
        .id((d: any) => d.id)
        .distance((link: any) => {
          switch (link.kind) {
            case 'bookmark-tag': return 58;
            case 'bookmark-collection': return 66;
            case 'loose': return 135;
            case 'bookmark-bookmark': return 40;
            default: return 75;
          }
        })
        .strength((link: any) => {
          switch (link.kind) {
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
      forceManyBody().strength((d: any) => {
        switch (d.node.kind) {
          case 'core': return -130;
          case 'tag':
          case 'collection': return -190;
          default: return -24;
        }
      })
    )
    .force(
      'x',
      forceX().strength((d: any) => (d.node.kind === 'bookmark' ? 0.028 : 0.06))
    )
    .force(
      'y',
      forceY().strength((d: any) => (d.node.kind === 'bookmark' ? 0.028 : 0.06))
    )
    .force(
      'collide',
      forceCollide()
        .radius((d: any) => d.radius + 4)
        .strength(0.82)
    )
    .force('center', forceCenter(0, 0).strength(0.055));

  // Initial render + auto fit
  autoFitCamera(app.renderer.width, app.renderer.height);
  renderSceneFromSimulation();
  applyCameraTransform();

  // Start the simulation loop inside the worker
  startSimulationLoop();
}

/** Renders nodes and links from the current simulation state */
function renderSceneFromSimulation() {
  if (!linksContainer || !nodesContainer) return;

  linksContainer.removeChildren();
  nodesContainer.removeChildren();
  nodeGraphicsMap.clear();

  const linkGraphics = new Graphics();
  linkGraphics.alpha = 0.28;

  linkData.forEach((link) => {
    const source = nodeData.find((n) => n.id === link.source);
    const target = nodeData.find((n) => n.id === link.target);
    if (source && target) {
      linkGraphics.moveTo(source.x ?? 0, source.y ?? 0);
      linkGraphics.lineTo(target.x ?? 0, target.y ?? 0);
    }
  });
  linkGraphics.stroke({ width: 1.2, color: 0x475569 });
  linksContainer.addChild(linkGraphics);

  // Determine active node for neighbor highlighting (prefer selection over hover)
  const activeId = currentSelection?.id || currentHover?.id || null;
  const neighborIds = activeId ? (adjacency.get(activeId) || new Set()) : new Set();

  nodeData.forEach((datum) => {
    // View-frustum culling for nodes (big win on large graphs when zoomed in)
    if (!isNodeInView(datum.x ?? 0, datum.y ?? 0)) {
      return;
    }

    const g = new Graphics();
    const node = datum.node;

    let color = 0x60a5fa;
    switch (node.kind) {
      case 'core': color = 0xfacc15; break;
      case 'tag': color = parseInt(node.color.replace('#', ''), 16) || 0x22c55e; break;
      case 'collection': color = node.variant === 'x_folder' ? 0xa78bfa : 0xf472b6; break;
      case 'bookmark': color = node.recent ? 0x38bdf8 : 0x64748b; break;
      case 'overflow': color = 0xf97316; break;
    }

    // === Neighbor Dimming Logic ===
    const isActive = datum.id === activeId;
    const isNeighbor = neighborIds.has(datum.id);

    let alpha = 1.0;
    let strokeAlpha = 0.6;

    if (activeId) {
      if (isActive) {
        alpha = 1.0;
        strokeAlpha = 0.9;
      } else if (isNeighbor) {
        alpha = 0.9;
        strokeAlpha = 0.7;
      } else {
        // Non-neighbor → strongly dim
        alpha = 0.12;
        strokeAlpha = 0.15;
      }
    }

    g.circle(datum.x ?? 0, datum.y ?? 0, datum.radius);
    g.fill({ color, alpha });
    g.stroke({ width: 1, color: 0xffffff, alpha: strokeAlpha });

    // Stronger ring for active node
    if (isActive) {
      const ring = new Graphics();
      const ringColor = currentSelection ? 0xfacc15 : 0x38bdf8;
      ring.circle(datum.x ?? 0, datum.y ?? 0, datum.radius + 6);
      ring.stroke({ width: 2.5, color: ringColor, alpha: 0.95 });
      nodesContainer!.addChild(ring);
    }

    // === Animation Effects (Pulse + Assign Flight) ===
    // These are drawn every frame from the effects container
    if (effectsContainer) {
      effectsContainer.removeChildren();

      activeAnimations.forEach((anim) => {
        if (anim.type === 'pulse') {
          const datum = nodeData.find((d: any) => d.id === anim.nodeId);
          if (!datum) return;

          const elapsed = Date.now() - anim.startTime;
          const progress = Math.min(elapsed / anim.duration, 1);

          // Multiple expanding rings with nice easing and falloff
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

          // Subtle breathing scale on the node itself during the pulse
          const g = nodeGraphicsMap.get(anim.nodeId);
          if (g) {
            const breath = 1 + Math.sin(progress * Math.PI * 3.5) * 0.09 * (1 - progress);
            g.scale.set(breath);
          }
        }

        if (
          anim.type === 'assign' &&
          anim.fromX !== undefined && anim.fromY !== undefined &&
          anim.targetX !== undefined && anim.targetY !== undefined
        ) {
          const datum = nodeData.find((d: any) => d.id === anim.nodeId);
          if (!datum) return;

          // Elegant flight path line
          const flight = new Graphics();
          flight.moveTo(anim.fromX, anim.fromY);
          flight.lineTo(anim.targetX, anim.targetY);
          flight.stroke({ width: 2.2, color: 0x64748b, alpha: 0.28 });
          effectsContainer!.addChild(flight);

          // More visible faded ghost at the original position
          const ghost = new Graphics();
          ghost.circle(anim.fromX, anim.fromY, datum.radius * 0.85);
          ghost.fill({ color: 0x64748b, alpha: 0.14 });
          ghost.stroke({ width: 1, color: 0x64748b, alpha: 0.25 });
          effectsContainer!.addChild(ghost);
        }
      });
    }

    nodesContainer!.addChild(g);
    nodeGraphicsMap.set(datum.id, g);
  });

  // === Label Rendering with Level of Detail (LOD) ===
  if (!labelsContainer) {
    labelsContainer = new Container();
    app!.stage.addChild(labelsContainer);
  }

  const showAllLabels = camera.zoom >= LABEL_ZOOM_BOOKMARK_THRESHOLD;
  const showImportantLabels = camera.zoom >= LABEL_ZOOM_THRESHOLD;

  const activeIds = new Set<string>();
  if (currentHover) activeIds.add(currentHover.id);
  if (currentSelection) activeIds.add(currentSelection.id);

  // First, remove labels for nodes that no longer qualify (LOD + culling)
  for (const [nodeId, label] of labelMap) {
    const datum = nodeData.find((d) => d.id === nodeId);
    const node = datum?.node;

    let shouldKeep = false;

    if (node && datum) {
      const isActive = activeIds.has(nodeId);
      const inView = isNodeInView(datum.x ?? 0, datum.y ?? 0);

      if (node.kind === 'core' || node.kind === 'tag' || node.kind === 'collection') {
        shouldKeep = (showImportantLabels || isActive) && inView;
      } else if (node.kind === 'bookmark') {
        shouldKeep = (showAllLabels || isActive) && inView;
      }
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

    const isActive = activeIds.has(nodeId);
    const inView = isNodeInView(datum.x ?? 0, datum.y ?? 0);

    let shouldShowLabel = false;

    if (node.kind === 'core' || node.kind === 'tag' || node.kind === 'collection') {
      shouldShowLabel = (showImportantLabels || isActive) && inView;
    } else if (node.kind === 'bookmark') {
      shouldShowLabel = (showAllLabels || isActive) && inView;
    }

    if (!shouldShowLabel) return;

    const labelText = node.kind === 'bookmark'
      ? (node.title || node.authorUsername || 'Bookmark')
      : (node.kind === 'tag' || node.kind === 'collection' ? node.name : 'Node');

    let label = labelMap.get(nodeId);

    if (!label) {
      // Create new label using BitmapText for much better performance
      // @ts-ignore - Pixi v8 BitmapText constructor differences
      label = new BitmapText({
        text: labelText,
        style: {
          fontName: 'OrbitLabel',
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
      label.style.fill = isActive ? 0xffffff : 0xe2e8f0;
      label.style.fontWeight = isActive ? '600' : '400';
    }

    // Position label above the node, accounting for camera
    const labelY = (datum.y ?? 0) - (datum.radius + 8);
    label.x = datum.x ?? 0;
    label.y = labelY;

    // Keep label size relatively stable on screen (counter camera zoom)
    const desiredScreenSize = node.kind === 'bookmark' ? 11 : 12;
    const labelScale = Math.max(0.6, Math.min(2.2, desiredScreenSize / camera.zoom));
    label.scale.set(labelScale);

    // Fade labels slightly when zoomed out
    label.alpha = camera.zoom < 0.9 ? 0.75 : 1.0;
  });

  if (app) {
    applyCameraTransform();
    app.renderer.render(app.stage);
  }
}

/** Runs the simulation inside the worker */
function startSimulationLoop() {
  if (!simulation || !app) return;

  let layoutUpdateTickCounter = 0;
  const LAYOUT_UPDATE_INTERVAL = 35; // send layout every ~35 ticks while running

  const tick = () => {
    simulation.tick();

    // Update animations (assign flights, pulses, etc.)
    updateAnimations();

    // Update Pixi positions from simulation data
    nodeData.forEach((datum) => {
      const g = nodeGraphicsMap.get(datum.id);
      if (g) {
        g.x = datum.x ?? 0;
        g.y = datum.y ?? 0;
        g.scale.set(datum.scale || 1);
      }
    });

    if (app) {
      applyCameraTransform();
      app.renderer.render(app.stage);
    }

    // === LAYOUT_UPDATED sending ===
    layoutUpdateTickCounter++;
    const isStable = simulation.alpha() < 0.05 && activeAnimations.length === 0;

    if (layoutUpdateTickCounter >= LAYOUT_UPDATE_INTERVAL || isStable) {
      sendLayoutUpdate(isStable);
      layoutUpdateTickCounter = 0;
    }

    const stillAnimating = simulation.alpha() > 0.008 || activeAnimations.length > 0;

    if (stillAnimating) {
      requestAnimationFrame(tick);
    } else {
      console.log('[OrbitWorker] Simulation cooled down');
      // Send one final stabilized layout update
      sendLayoutUpdate(true);
    }
  };

  simulation.alpha(1).restart();
  tick();
}

/* ============================================================
   CAMERA MESSAGE HANDLER (Pan / Zoom / Set Camera)
   ============================================================ */

function handleCameraMessage(msg: CameraControlMessage) {
  if (!app) return;

  let cameraChanged = false;

  switch (msg.type) {
    case WorkerMessageType.PAN: {
      const dx = msg.dx / camera.zoom;
      const dy = msg.dy / camera.zoom;
      camera.x += dx;
      camera.y += dy;
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

      const newZoom = Math.max(0.1, Math.min(8, camera.zoom * factor));

      camera.x = screenX - worldX * newZoom;
      camera.y = screenY - worldY * newZoom;
      camera.zoom = newZoom;
      cameraChanged = true;
      break;
    }

    case WorkerMessageType.SET_CAMERA: {
      if (msg.camera) {
        camera.x = msg.camera.x ?? camera.x;
        camera.y = msg.camera.y ?? camera.y;
        camera.zoom = msg.camera.zoom ?? camera.zoom;
        cameraChanged = true;
      }
      break;
    }
  }

  if (cameraChanged) {
    applyCameraTransform();
    app.renderer.render(app.stage);

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

function handlePointerEvent(msg: PointerEventMessage) {
  if (!app || !currentGraph || nodeData.length === 0) return;

  // PointerLeaveMessage doesn't carry coordinates, so we handle it separately
  if (msg.type === WorkerMessageType.POINTER_LEAVE) {
    isPointerDown = false;
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

  // Find closest node within interaction radius
  let closest: SimulationNode | null = null;
  let minDist = Infinity;

  for (const datum of nodeData) {
    const dx = (datum.x ?? 0) - worldX;
    const dy = (datum.y ?? 0) - worldY;
    const dist = Math.hypot(dx, dy);

    if (dist < minDist && dist <= datum.radius + 10) {
      minDist = dist;
      closest = datum;
    }
  }

  const newHover = closest ? { id: closest.id, kind: closest.node.kind } : null;

  if (type === WorkerMessageType.POINTER_MOVE) {
    if (JSON.stringify(newHover) !== JSON.stringify(currentHover)) {
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

    // Cursor logic during move
    if (isPointerDown) {
      postCursorChange('grabbing');
    } else if (newHover) {
      postCursorChange('pointer');
    } else {
      postCursorChange('grab'); // hovering background → ready to pan
    }
  }

  if (type === WorkerMessageType.POINTER_DOWN) {
    isPointerDown = true;

    if (newHover) {
      currentSelection = newHover;
      renderSceneFromSimulation();

      postToMain({
        type: MainMessageType.SELECTION_CHANGED,
        protocolVersion: 1,
        selection: newHover,
      });
      postCursorChange('pointer');
    } else {
      // Starting to pan the map
      postCursorChange('grabbing');
    }
  }

  if (type === WorkerMessageType.POINTER_UP) {
    isPointerDown = false;

    if (newHover) {
      postCursorChange('pointer');
    } else {
      postCursorChange('grab'); // still over background → ready to pan
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
  const targetCameraX = (currentApp.renderer.width / 2) - (target.x * currentZoom);
  const targetCameraY = (currentApp.renderer.height / 2) - (target.y * currentZoom);

  const startX = camera.x;
  const startY = camera.y;
  const startTime = Date.now();
  const duration = 350; // ms

  // Smoothly animate the camera toward the target using easeOutCubic
  const animateCamera = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic

    camera.x = startX + (targetCameraX - startX) * eased;
    camera.y = startY + (targetCameraY - startY) * eased;

    applyCameraTransform();
    currentApp.renderer.render(currentApp.stage);

    if (progress < 1) {
      requestAnimationFrame(animateCamera);
    } else {
      // Snap to final position
      camera.x = targetCameraX;
      camera.y = targetCameraY;
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
    const datum = nodeData.find((d: any) => d.id === anim.nodeId);
    if (!datum) {
      toRemove.push(index);
      return;
    }

    const elapsed = now - anim.startTime;
    const progress = Math.min(elapsed / anim.duration, 1);

    if (
      anim.type === "assign" &&
      anim.fromX !== undefined && anim.fromY !== undefined &&
      anim.targetX !== undefined && anim.targetY !== undefined
    ) {
      // Ease the visual position of the node along the flight path
      const t = easeOutCubic(progress);
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

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

self.onmessage = handleMessage;

/* ============================================================
   CAMERA HELPERS (Phase B)
   ============================================================ */

function applyCameraTransform() {
  if (!linksContainer || !nodesContainer) return;

  // We apply camera to the containers so everything moves together
  const tx = camera.x;
  const ty = camera.y;
  const scale = camera.zoom;

  linksContainer.position.set(tx, ty);
  linksContainer.scale.set(scale);

  nodesContainer.position.set(tx, ty);
  nodesContainer.scale.set(scale);
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

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  nodeData.forEach((d: any) => {
    if (typeof d.x === 'number' && typeof d.y === 'number') {
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      minY = Math.min(minY, d.y);
      maxY = Math.max(maxY, d.y);
    }
  });

  const graphWidth = maxX - minX || 1;
  const graphHeight = maxY - minY || 1;

  // Dynamic padding based on graph size
  const padding = Math.min(80, Math.max(30, Math.min(width, height) * 0.08));

  const scaleX = (width - padding * 2) / graphWidth;
  const scaleY = (height - padding * 2) / graphHeight;

  // More conservative max zoom for large graphs
  const maxZoom = graphWidth < 400 && graphHeight < 400 ? 4.0 : 2.8;
  const newZoom = Math.min(scaleX, scaleY, maxZoom);

  camera.zoom = Math.max(newZoom, 0.12);

  // Center the graph
  camera.x = (width / 2) - ((minX + maxX) / 2) * camera.zoom;
  camera.y = (height / 2) - ((minY + maxY) / 2) * camera.zoom;
}

/* ============================================================ */

console.log('[OrbitWorker] Worker script loaded');