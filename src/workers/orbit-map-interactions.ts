/**
 * Pointer interaction state machine for the Orbit map worker: hover,
 * click-select, drag-to-pan, node dragging, and drag-to-assign (dropping a
 * bookmark onto a tag/collection hub). Owns all transient pointer state so
 * the worker entry point stays focused on scene/render orchestration.
 */

import {
  MainMessageType,
  WorkerMessageType,
  type CursorChangedMessage,
  type MainMessage,
  type OrbitMapSelection,
  type PointerEventMessage,
} from '@/lib/orbit-worker-protocol';

import { findClosestOrbitMapNode, type OrbitMapHitTestNode } from './orbit-map-hit-test';

// A press only becomes a drag after the cursor travels past this many screen
// pixels; otherwise pointer-up is treated as a click.
const DRAG_THRESHOLD_PX = 4;

/** Minimal structural view of a simulation node the state machine needs. */
export interface OrbitMapInteractionNode extends OrbitMapHitTestNode {
  node: { kind: OrbitMapSelection['kind'] };
  fx?: number;
  fy?: number;
}

export interface OrbitMapInteractionDeps<TNode extends OrbitMapInteractionNode> {
  /** True once the scene (app + graph + nodes) is ready for hit-testing. */
  hasScene(): boolean;
  getNodeData(): TNode[];
  getNodeById(): Map<string, TNode>;
  getCamera(): { x: number; y: number; zoom: number };
  /** Apply a screen-space pan (camera math, render, CAMERA_CHANGED post). */
  panBy(dx: number, dy: number): void;
  getSelection(): OrbitMapSelection | null;
  /** Set selection, restyle nodes, and post SELECTION_CHANGED. */
  setSelection(selection: OrbitMapSelection | null): void;
  refreshNodeStyles(): void;
  postToMain(msg: MainMessage): void;
  getSimulation(): { alphaTarget(target: number): unknown } | null;
  kickSimulation(alpha: number): void;
  startSimulationLoop(): void;
  /** Arrival feedback pulse on a hub after a successful drop. */
  pulseNode(nodeId: string): void;
}

function isSameHover(
  a: { id: string; kind: string } | null,
  b: { id: string; kind: string } | null
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.kind === b.kind;
}

export function createOrbitMapInteractions<TNode extends OrbitMapInteractionNode>(
  deps: OrbitMapInteractionDeps<TNode>
) {
  let isPointerDown = false;
  let isPanning = false;
  let panDragLast: { x: number; y: number } | null = null;
  let panStart: { x: number; y: number } | null = null;
  let panMoved = false;
  let dragCandidate: { id: string; startX: number; startY: number } | null = null;
  let draggingNodeId: string | null = null;
  let dropTargetId: string | null = null;
  let hubDropTargets: TNode[] = [];
  let currentHover: { id: string; kind: string } | null = null;
  let currentCursor: CursorChangedMessage['cursor'] = 'default';

  function setCursor(cursor: CursorChangedMessage['cursor']) {
    if (currentCursor === cursor) return;
    currentCursor = cursor;
    deps.postToMain({
      type: MainMessageType.CURSOR_CHANGED,
      protocolVersion: 1,
      cursor,
    });
  }

  /** Starts dragging a node: pin it to the cursor and reheat the simulation. */
  function beginNodeDrag(nodeId: string, worldX: number, worldY: number) {
    const datum = deps.getNodeById().get(nodeId);
    if (!datum || !deps.getSimulation()) return;

    draggingNodeId = nodeId;
    dropTargetId = null;
    datum.fx = worldX;
    datum.fy = worldY;

    // Keep the simulation warm for the whole drag so connected nodes follow.
    deps.getSimulation()?.alphaTarget(0.3);
    deps.kickSimulation(0.3);
  }

  function moveNodeDrag(worldX: number, worldY: number) {
    const datum = draggingNodeId ? deps.getNodeById().get(draggingNodeId) : null;
    if (!datum) return;

    datum.fx = worldX;
    datum.fy = worldY;

    // Drag-to-assign: bookmarks can be dropped onto tag/collection hubs.
    if (datum.node.kind === 'bookmark') {
      const target = findClosestOrbitMapNode(
        hubDropTargets,
        { x: worldX, y: worldY },
        14
      );
      dropTargetId = target ? target.id : null;
    }
  }

  /** Ends a node drag; when `commit` is true a hub drop posts NODE_DROPPED. */
  function endNodeDrag(commit: boolean) {
    if (!draggingNodeId) return;
    const datum = deps.getNodeById().get(draggingNodeId);

    if (commit && dropTargetId && datum?.node.kind === 'bookmark') {
      const target = deps.getNodeById().get(dropTargetId);
      const anchorKind = target?.node.kind;
      if (target && (anchorKind === 'tag' || anchorKind === 'collection')) {
        deps.postToMain({
          type: MainMessageType.NODE_DROPPED,
          protocolVersion: 1,
          bookmarkId: draggingNodeId,
          anchorId: dropTargetId,
          anchorKind,
        });

        // Arrival feedback on the hub.
        deps.pulseNode(dropTargetId);
      }
    }

    if (datum) {
      delete datum.fx;
      delete datum.fy;
    }
    draggingNodeId = null;
    dropTargetId = null;
    deps.getSimulation()?.alphaTarget(0);
    deps.startSimulationLoop();
  }

  function handlePointerEvent(msg: PointerEventMessage) {
    if (!deps.hasScene()) return;

    // PointerLeaveMessage doesn't carry coordinates, so we handle it separately
    if (msg.type === WorkerMessageType.POINTER_LEAVE) {
      endNodeDrag(false);
      isPointerDown = false;
      isPanning = false;
      panDragLast = null;
      panStart = null;
      panMoved = false;
      dragCandidate = null;
      if (currentHover) {
        currentHover = null;
        deps.refreshNodeStyles();
        deps.postToMain({
          type: MainMessageType.HOVER_CHANGED,
          protocolVersion: 1,
          selection: null,
        });
      }
      setCursor('default');
      return;
    }

    const { type, x, y } = msg;
    const camera = deps.getCamera();
    const nodeData = deps.getNodeData();

    // Convert screen → world
    const worldX = (x - camera.x) / camera.zoom;
    const worldY = (y - camera.y) / camera.zoom;

    if (type === WorkerMessageType.POINTER_MOVE) {
      // Active node drag: pin the node to the cursor and track drop targets.
      if (draggingNodeId && isPointerDown) {
        moveNodeDrag(worldX, worldY);
        setCursor('grabbing');
        return;
      }

      // Promote a pressed node into a drag once past the movement threshold.
      if (dragCandidate && isPointerDown && !draggingNodeId) {
        const travelled = Math.hypot(
          x - dragCandidate.startX,
          y - dragCandidate.startY
        );
        if (travelled > DRAG_THRESHOLD_PX) {
          beginNodeDrag(dragCandidate.id, worldX, worldY);
          setCursor('grabbing');
        }
        return;
      }

      if (isPanning && isPointerDown && panDragLast) {
        const dx = x - panDragLast.x;
        const dy = y - panDragLast.y;
        panDragLast = { x, y };
        if (
          panStart &&
          Math.hypot(x - panStart.x, y - panStart.y) > DRAG_THRESHOLD_PX
        ) {
          panMoved = true;
        }
        deps.panBy(dx, dy);
        setCursor('grabbing');
        return;
      }

      const closest = findClosestOrbitMapNode(
        nodeData,
        { x: worldX, y: worldY },
        10
      );
      const newHover = closest
        ? { id: closest.id, kind: closest.node.kind }
        : null;

      if (!isSameHover(newHover, currentHover)) {
        currentHover = newHover;
        deps.refreshNodeStyles();

        deps.postToMain({
          type: MainMessageType.HOVER_CHANGED,
          protocolVersion: 1,
          selection: newHover,
          canvasX: x,
          canvasY: y,
        });
      }

      if (isPointerDown) {
        setCursor('grabbing');
      } else if (newHover) {
        setCursor('pointer');
      } else {
        setCursor('grab');
      }
      return;
    }

    if (type === WorkerMessageType.POINTER_DOWN) {
      isPointerDown = true;
      panMoved = false;

      const closest = findClosestOrbitMapNode(
        nodeData,
        { x: worldX, y: worldY },
        10
      );

      if (closest) {
        // Selection happens on pointer-up so a drag doesn't also select.
        dragCandidate = { id: closest.id, startX: x, startY: y };
        isPanning = false;
        panDragLast = null;
        panStart = null;
        setCursor('pointer');
      } else {
        dragCandidate = null;
        isPanning = true;
        panDragLast = { x, y };
        panStart = { x, y };
        setCursor('grabbing');
      }
      return;
    }

    if (type === WorkerMessageType.POINTER_UP) {
      const wasDragging = Boolean(draggingNodeId);
      const clickedNodeId = !wasDragging && dragCandidate ? dragCandidate.id : null;
      const wasEmptyClick = !wasDragging && !dragCandidate && isPanning && !panMoved;
      const didPan = isPanning && panMoved;

      if (wasDragging) {
        endNodeDrag(true);
      }

      isPointerDown = false;
      isPanning = false;
      panDragLast = null;
      panStart = null;
      panMoved = false;
      dragCandidate = null;

      if (clickedNodeId) {
        const datum = deps.getNodeById().get(clickedNodeId);
        if (datum) {
          deps.setSelection({ id: datum.id, kind: datum.node.kind });
        }
      } else if (wasEmptyClick && deps.getSelection()) {
        deps.setSelection(null);
      } else if (didPan) {
        // Refresh viewport-culled labels for the newly visible area.
        deps.refreshNodeStyles();
      }

      const closest = findClosestOrbitMapNode(
        nodeData,
        { x: worldX, y: worldY },
        10
      );
      setCursor(closest ? 'pointer' : 'grab');
    }
  }

  return {
    handlePointerEvent,
    setCursor,
    setHubDropTargets(nodes: TNode[]) {
      hubDropTargets = nodes;
    },
    /** Drops drag/press state when the scene is rebuilt under the pointer. */
    resetSceneState() {
      draggingNodeId = null;
      dropTargetId = null;
      dragCandidate = null;
    },
    /** Full reset for worker teardown. */
    reset() {
      isPointerDown = false;
      isPanning = false;
      panDragLast = null;
      panStart = null;
      panMoved = false;
      dragCandidate = null;
      draggingNodeId = null;
      dropTargetId = null;
      hubDropTargets = [];
      currentHover = null;
      currentCursor = 'default';
    },
    getHover: () => currentHover,
    getDropTargetId: () => dropTargetId,
  };
}
