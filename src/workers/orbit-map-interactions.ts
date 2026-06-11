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

import {
  findClosestOrbitMapNode,
  getOrbitMapHitPadding,
  type OrbitMapHitTestNode,
} from './orbit-map-hit-test';

// A press only becomes a drag after the cursor travels past this many screen
// pixels; otherwise pointer-up is treated as a click.
const DRAG_THRESHOLD_PX = 4;

/** Minimal structural view of a map node the state machine needs. */
export interface OrbitMapInteractionNode extends OrbitMapHitTestNode {
  node: { kind: OrbitMapSelection['kind'] };
}

export interface OrbitMapInteractionDeps<TNode extends OrbitMapInteractionNode> {
  /** True once the scene (app + graph + nodes) is ready for hit-testing. */
  hasScene(): boolean;
  /** Nodes eligible for hit-testing (visible under the current filter/LOD). */
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
  /** Animate a node back to its layout position after an uncommitted drag. */
  returnNodeTo(nodeId: string, x: number, y: number): void;
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
  let dragOrigin: { x: number; y: number } | null = null;
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

  /** Starts dragging a node: remember its layout position, pin to cursor. */
  function beginNodeDrag(nodeId: string, worldX: number, worldY: number) {
    const datum = deps.getNodeById().get(nodeId);
    if (!datum) return;

    draggingNodeId = nodeId;
    dragOrigin = { x: datum.x ?? 0, y: datum.y ?? 0 };
    dropTargetId = null;
    datum.x = worldX;
    datum.y = worldY;
    deps.refreshNodeStyles();
  }

  function moveNodeDrag(worldX: number, worldY: number) {
    const datum = draggingNodeId ? deps.getNodeById().get(draggingNodeId) : null;
    if (!datum) return;

    datum.x = worldX;
    datum.y = worldY;

    // Drag-to-assign: bookmarks can be dropped onto tag/collection hubs.
    if (datum.node.kind === 'bookmark') {
      const target = findClosestOrbitMapNode(
        hubDropTargets,
        { x: worldX, y: worldY },
        getOrbitMapHitPadding(deps.getCamera().zoom, 14)
      );
      dropTargetId = target ? target.id : null;
    }
    deps.refreshNodeStyles();
  }

  /** Ends a node drag; when `commit` is true a hub drop posts NODE_DROPPED. */
  function endNodeDrag(commit: boolean) {
    if (!draggingNodeId) return;
    const datum = deps.getNodeById().get(draggingNodeId);
    const origin = dragOrigin;

    let committed = false;
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
        committed = true;
      }
    }

    // Uncommitted drags glide back to their layout slot; committed drops stay
    // put until the assign animation / graph refetch repositions the node.
    if (!committed && datum && origin) {
      deps.returnNodeTo(datum.id, origin.x, origin.y);
    }

    draggingNodeId = null;
    dragOrigin = null;
    dropTargetId = null;
    deps.refreshNodeStyles();
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
        getOrbitMapHitPadding(camera.zoom)
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
        getOrbitMapHitPadding(camera.zoom)
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
        getOrbitMapHitPadding(camera.zoom)
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
      dragOrigin = null;
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
      dragOrigin = null;
      dropTargetId = null;
      hubDropTargets = [];
      currentHover = null;
      currentCursor = 'default';
    },
    getHover: () => currentHover,
    getDropTargetId: () => dropTargetId,
  };
}
