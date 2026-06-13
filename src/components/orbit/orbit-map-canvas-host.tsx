"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import type { OrbitGraphPayload, OrbitGraphNode } from '@/types';
import { OrbitMapCanvasControls } from './orbit-map-canvas-controls';
import { OrbitMapMinimap } from './orbit-map-minimap';
import { OrbitMapUnsupportedState } from './orbit-map-unsupported-state';

// Import protocol types (including shared UI types)
import {
  type WorkerMessage,
  type SetGraphMessage,
  WorkerMessageType,
  MainMessageType,
  type CameraState,
  type GraphFilter,
  type OrbitMapSelection,
  type OrbitMapFocus,
} from '@/lib/orbit-worker-protocol';

interface OrbitMapCanvasHostProps {
  graph?: OrbitGraphPayload;
  data?: OrbitGraphPayload; // legacy prop support
  filter?: GraphFilter;
  selection?: OrbitMapSelection | null;
  focus?: OrbitMapFocus | null;
  /** Lowercased search query; worker builds index and highlights matches. */
  searchQuery?: string;
  onSearchResults?: (query: string, results: OrbitGraphNode[]) => void;
  onSelectionChange?: (selection: OrbitMapSelection | null) => void;
  onHoverChange?: (hover: OrbitMapSelection | null, position?: { x: number; y: number }) => void;
  onOpenBookmark?: (bookmarkId: string) => void;
  /** Called when a bookmark node is dragged and dropped onto a tag/collection hub */
  onNodeDropped?: (
    bookmarkId: string,
    anchorId: string,
    anchorKind: 'tag' | 'collection'
  ) => void;
  className?: string;
  filterControlsClassName?: string;
  zoomControlsClassName?: string;
}

export interface OrbitMapCanvasHandle {
  focusOn: (input: string | { kind: string; id: string } | OrbitMapSelection) => void;
  resetView: () => void;
  animateAssign: (bookmarkId: string, anchorId: string) => Promise<void>;
}

// Re-export shared types so pages can import them from this component (for backward compatibility)
export type { OrbitMapSelection, OrbitMapFocus, GraphFilter } from '@/lib/orbit-worker-protocol';

function getOrbitMapGraphKey(graph: OrbitGraphPayload) {
  const stats = graph.stats;
  return [
    graph.scope ?? 'library',
    graph.generatedAt,
    graph.nodeCap,
    graph.nodes.length,
    graph.edges.length,
    stats.totalBookmarks,
    stats.affiliatedBookmarks,
    stats.looseBookmarks,
    stats.renderedBookmarks,
    stats.truncatedBookmarks,
    stats.tagCount,
    stats.userCollectionCount,
    stats.xFolderCount,
  ].join(':');
}

function getOrbitMapDebugPerfEnabled() {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    return window.localStorage.getItem('orbit-map-debug-perf') === '1';
  } catch {
    return false;
  }
}

function isCanvasTransferReuseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('transferControlToOffscreen') ||
    message.includes('Cannot transfer control') ||
    (error instanceof DOMException && error.name === 'InvalidStateError')
  );
}

const OrbitMapCanvasHost = forwardRef<OrbitMapCanvasHandle, OrbitMapCanvasHostProps>(
  function OrbitMapCanvasHost(rawProps, ref) {
    // Support legacy `data` prop for backward compatibility during migration
    const props = {
      ...rawProps,
      graph: rawProps.graph ?? rawProps.data,
    };
    const graph = props.graph;
    const filter = props.filter;
    const propsRef = useRef(props);
    propsRef.current = props;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const canvasTransferRetryRef = useRef(0);
    const [canvasInstance, setCanvasInstance] = useState(0);
    const [useFallback, setUseFallback] = useState(false);
    const [workerGeneration, setWorkerGeneration] = useState(0);
    const [internalFilter, setInternalFilter] = useState<GraphFilter>(filter ?? 'all');
    // Minimap inputs: live camera, viewport size, and a version counter that
    // bumps when fresh node positions arrive.
    const [minimapCamera, setMinimapCamera] = useState<CameraState | null>(null);
    const [layoutVersion, setLayoutVersion] = useState(0);
    // LAYOUT_UPDATED arrives per simulation tick; coalesce minimap redraws to
    // one per frame so the simulation doesn't trigger per-message repaints.
    const minimapRafRef = useRef<number | null>(null);
    const bumpLayoutVersion = useCallback(() => {
      if (minimapRafRef.current !== null) return;
      minimapRafRef.current = requestAnimationFrame(() => {
        minimapRafRef.current = null;
        setLayoutVersion((version) => version + 1);
      });
    }, []);
    const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);
    const activeFilter = filter ?? internalFilter;

    useEffect(() => {
      if (filter) setInternalFilter(filter);
    }, [filter]);

    const postToWorker = useCallback((msg: WorkerMessage) => {
      workerRef.current?.postMessage(msg);
    }, []);

    // Most recent node positions from the worker's deterministic layout
    // (drives the minimap; nothing is persisted).
    const latestPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

    // Check for OffscreenCanvas support + create worker
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Feature detection
      if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') {
        console.warn('[OrbitMap] OffscreenCanvas or Worker not supported. Using fallback.');
        setUseFallback(true);
        return;
      }

      let initTimer: number | null = window.setTimeout(() => {
        initTimer = null;
        let pendingWorker: Worker | null = null;

        try {
          pendingWorker = new Worker(
            new URL('../../workers/orbit-map-worker.ts', import.meta.url),
            { type: 'module' }
          );

          // Transfer control of the canvas to the worker
          const offscreen = canvas.transferControlToOffscreen();
          const worker = pendingWorker;
          pendingWorker = null;
          workerRef.current = worker;

          // Send initialization message with transferred canvas
          const initMessage: WorkerMessage = {
            type: WorkerMessageType.INIT,
            protocolVersion: 1,
            canvas: offscreen,
            width: canvas.clientWidth,
            height: canvas.clientHeight,
            dpr: window.devicePixelRatio || 1,
            debugPerf: getOrbitMapDebugPerfEnabled(),
          };

          worker.postMessage(initMessage, [offscreen]);
          canvasTransferRetryRef.current = 0;
          setWorkerGeneration((generation) => generation + 1);

          // Listen for messages from worker
          worker.onmessage = (event: MessageEvent) => {
            const msg = event.data;

            switch (msg.type) {
              case MainMessageType.READY:
                if (propsRef.current.graph && propsRef.current.graph.nodes.length > 0) {
                  const graphMessage: SetGraphMessage = {
                    type: WorkerMessageType.SET_GRAPH,
                    protocolVersion: 1,
                    graph: propsRef.current.graph,
                  };
                  workerRef.current?.postMessage(graphMessage);
                  lastGraphKey.current = getOrbitMapGraphKey(propsRef.current.graph);

                  // Then send the current filter
                  const filterMessage = {
                    type: WorkerMessageType.SET_FILTER,
                    protocolVersion: 1,
                    filter: propsRef.current.filter ?? 'all',
                  };
                  workerRef.current?.postMessage(filterMessage);
                }
                if (propsRef.current.selection) {
                  workerRef.current?.postMessage({
                    type: WorkerMessageType.SET_SELECTION,
                    protocolVersion: 1,
                    selection: propsRef.current.selection,
                  });
                }
                break;

              case MainMessageType.CAMERA_CHANGED:
                if (msg.camera) {
                  setMinimapCamera(msg.camera);
                }
                break;

              case MainMessageType.SELECTION_CHANGED:
                propsRef.current.onSelectionChange?.(msg.selection ?? null);
                break;

              case MainMessageType.HOVER_CHANGED:
                propsRef.current.onHoverChange?.(
                  msg.selection ?? null,
                  msg.canvasX !== undefined && msg.canvasY !== undefined
                    ? { x: msg.canvasX, y: msg.canvasY }
                    : undefined
                );
                break;

              case MainMessageType.ANIMATE_ASSIGN_COMPLETE:
                // The promise in animateAssign now listens directly for this message.
                break;

              case MainMessageType.OPEN_BOOKMARK:
                if (msg.bookmarkId) {
                  propsRef.current.onOpenBookmark?.(msg.bookmarkId);
                }
                break;

              case MainMessageType.NODE_DROPPED:
                if (msg.bookmarkId && msg.anchorId) {
                  propsRef.current.onNodeDropped?.(
                    msg.bookmarkId,
                    msg.anchorId,
                    msg.anchorKind
                  );
                }
                break;

              case MainMessageType.SEARCH_RESULTS:
                propsRef.current.onSearchResults?.(msg.query ?? '', msg.results ?? []);
                break;

              case MainMessageType.LAYOUT_UPDATED:
                if (msg.nodeIds && msg.positions) {
                  const updated: Record<string, { x: number; y: number }> = {};

                  for (let i = 0; i < msg.nodeIds.length; i++) {
                    updated[msg.nodeIds[i]] = {
                      x: msg.positions[i * 2],
                      y: msg.positions[i * 2 + 1],
                    };
                  }

                  latestPositionsRef.current = updated;

                  // Let the minimap redraw with the fresh positions
                  bumpLayoutVersion();
                }
                break;

              case MainMessageType.CURSOR_CHANGED: {
                // Apply cursor to the container for better UX (visible even near canvas edges)
                const container = canvas.parentElement;
                if (container) {
                  container.style.cursor = msg.cursor;
                }
                break;
              }

              case MainMessageType.ERROR: {
                console.error('[OrbitMapHost] Worker error:', msg);
                const container = canvas.parentElement;
                if (container) container.style.cursor = 'default';
                setUseFallback(true);
                worker.terminate();
                if (workerRef.current === worker) workerRef.current = null;
                break;
              }

              default:
                // Unknown message type
                break;
            }
          };

          worker.onerror = (err) => {
            console.error('[OrbitMapHost] Worker crashed:', err);
            canvas.style.cursor = 'default';
            setUseFallback(true);
            worker.terminate();
            if (workerRef.current === worker) workerRef.current = null;
          };
        } catch (err) {
          pendingWorker?.terminate();
          if (isCanvasTransferReuseError(err) && canvasTransferRetryRef.current < 1) {
            canvasTransferRetryRef.current += 1;
            setCanvasInstance((instance) => instance + 1);
            return;
          }
          console.error('[OrbitMapHost] Failed to create worker:', err);
          setUseFallback(true);
        }
      }, 0);

      // Cleanup
      return () => {
        if (initTimer !== null) {
          window.clearTimeout(initTimer);
          initTimer = null;
        }
        const container = canvas?.parentElement;
        if (container) container.style.cursor = 'default';
        if (minimapRafRef.current !== null) {
          cancelAnimationFrame(minimapRafRef.current);
          minimapRafRef.current = null;
        }
        if (workerRef.current) {
          workerRef.current.postMessage({ type: WorkerMessageType.DESTROY, protocolVersion: 1 });
          workerRef.current.terminate();
          workerRef.current = null;
        }
      };
    }, [canvasInstance, bumpLayoutVersion]);

    // Send graph data + filter to worker whenever they change
    const lastGraphKey = useRef<string>("");

    useEffect(() => {
      if (!workerRef.current || useFallback || !graph) return;

      const graphKey = getOrbitMapGraphKey(graph);

      const graphChanged = lastGraphKey.current !== graphKey;

      if (graphChanged) {
        const graphMessage: SetGraphMessage = {
          type: WorkerMessageType.SET_GRAPH,
          protocolVersion: 1,
          graph,
        };

        workerRef.current.postMessage(graphMessage);
        lastGraphKey.current = graphKey;
      }

      // Always send (or re-send) the current filter after graph is set
      const filterMessage = {
        type: WorkerMessageType.SET_FILTER,
        protocolVersion: 1,
        filter,
      };

      workerRef.current.postMessage({
        ...filterMessage,
        filter: activeFilter,
      });
    }, [graph, activeFilter, filter, useFallback, workerGeneration]);

    useEffect(() => {
      if (!workerRef.current || useFallback) return;
      workerRef.current.postMessage({
        type: WorkerMessageType.SET_SELECTION,
        protocolVersion: 1,
        selection: props.selection ?? null,
      });
    }, [props.selection, useFallback, workerGeneration]);

    useEffect(() => {
      if (!workerRef.current || useFallback) return;
      workerRef.current.postMessage({
        type: WorkerMessageType.SET_SEARCH,
        protocolVersion: 1,
        query: props.searchQuery ?? '',
      });
    }, [props.searchQuery, useFallback, workerGeneration]);

    useEffect(() => {
      if (!workerRef.current || useFallback || !props.focus) return;
      workerRef.current.postMessage({
        type: WorkerMessageType.FOCUS_ON,
        protocolVersion: 1,
        selection: { kind: 'bookmark', id: props.focus.bookmarkId },
      });
      workerRef.current.postMessage({
        type: WorkerMessageType.FOCUS_PULSE,
        protocolVersion: 1,
        nodeId: props.focus.predictedAnchorId,
      });
    }, [props.focus, useFallback, workerGeneration]);

    // Forward resize to worker
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || useFallback || !workerRef.current) return;

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;

        setViewportSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
        workerRef.current?.postMessage({
          type: WorkerMessageType.RESIZE,
          protocolVersion: 1,
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      });

      observer.observe(canvas);

      return () => observer.disconnect();
    }, [useFallback, workerGeneration]);

    const canvasPoint = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    // Pointer, wheel, and touch → worker (hit-test + pan + zoom)
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || useFallback || !workerRef.current) return;

      const send = (msg: WorkerMessage) => {
        workerRef.current?.postMessage(msg);
      };

      let pendingPointerMove: WorkerMessage | null = null;
      let pointerMoveFrame: number | null = null;
      let pendingWheel:
        | { deltaY: number; x: number; y: number; ctrlKey?: boolean }
        | null = null;
      let wheelFrame: number | null = null;

      const flushPointerMove = () => {
        pointerMoveFrame = null;
        if (!pendingPointerMove) return;
        send(pendingPointerMove);
        pendingPointerMove = null;
      };

      const flushWheel = () => {
        wheelFrame = null;
        if (!pendingWheel) return;
        send({
          type: WorkerMessageType.WHEEL,
          protocolVersion: 1,
          deltaY: pendingWheel.deltaY,
          x: pendingWheel.x,
          y: pendingWheel.y,
          ctrlKey: pendingWheel.ctrlKey,
        });
        pendingWheel = null;
      };

      const handlePointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (pointerMoveFrame !== null) {
          window.cancelAnimationFrame(pointerMoveFrame);
          pointerMoveFrame = null;
          pendingPointerMove = null;
        }
        const { x, y } = canvasPoint(e.clientX, e.clientY);
        canvas.setPointerCapture(e.pointerId);
        send({
          type: WorkerMessageType.POINTER_DOWN,
          protocolVersion: 1,
          x,
          y,
          button: e.button,
        });
      };

      const handlePointerMove = (e: PointerEvent) => {
        const { x, y } = canvasPoint(e.clientX, e.clientY);
        pendingPointerMove = {
          type: WorkerMessageType.POINTER_MOVE,
          protocolVersion: 1,
          x,
          y,
          buttons: e.buttons,
        };
        if (pointerMoveFrame === null) {
          pointerMoveFrame = window.requestAnimationFrame(flushPointerMove);
        }
      };

      const handlePointerUp = (e: PointerEvent) => {
        const { x, y } = canvasPoint(e.clientX, e.clientY);
        send({
          type: WorkerMessageType.POINTER_UP,
          protocolVersion: 1,
          x,
          y,
          button: e.button,
        });
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* capture may already be released */
        }
      };

      const handlePointerLeave = () => {
        if (pointerMoveFrame !== null) {
          window.cancelAnimationFrame(pointerMoveFrame);
          pointerMoveFrame = null;
          pendingPointerMove = null;
        }
        send({
          type: WorkerMessageType.POINTER_LEAVE,
          protocolVersion: 1,
        });
      };

      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const { x, y } = canvasPoint(e.clientX, e.clientY);
        pendingWheel = {
          deltaY: (pendingWheel?.deltaY ?? 0) + e.deltaY,
          x,
          y,
          ctrlKey: e.ctrlKey,
        };
        if (wheelFrame === null) {
          wheelFrame = window.requestAnimationFrame(flushWheel);
        }
      };

      const handleDoubleClick = (e: MouseEvent) => {
        const { x, y } = canvasPoint(e.clientX, e.clientY);
        send({
          type: WorkerMessageType.DOUBLE_CLICK,
          protocolVersion: 1,
          x,
          y,
        });
      };

      // Single-finger gestures are handled by the pointer events above (the
      // browser fires pointer events for touches); only pinch-zoom needs the
      // raw touch stream. Panning here too would double-apply the gesture.
      let lastTouchDist = 0;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastTouchDist = Math.hypot(dx, dy);
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          const rect = canvas.getBoundingClientRect();
          const cx =
            (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const cy =
            (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          const factor = dist > lastTouchDist ? 1.06 : 0.94;
          lastTouchDist = dist;
          send({
            type: WorkerMessageType.ZOOM,
            protocolVersion: 1,
            factor,
            focalX: cx,
            focalY: cy,
          });
        }
      };

      canvas.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointerleave', handlePointerLeave);
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('dblclick', handleDoubleClick);
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

      return () => {
        if (pointerMoveFrame !== null) {
          window.cancelAnimationFrame(pointerMoveFrame);
        }
        if (wheelFrame !== null) {
          window.cancelAnimationFrame(wheelFrame);
        }
        canvas.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointerleave', handlePointerLeave);
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('dblclick', handleDoubleClick);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
      };
    }, [useFallback, workerGeneration]);

    const handleFilterChange = (next: GraphFilter) => {
      setInternalFilter(next);
      postToWorker({
        type: WorkerMessageType.SET_FILTER,
        protocolVersion: 1,
        filter: next,
      });
    };

    const handleZoomIn = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      postToWorker({
        type: WorkerMessageType.ZOOM,
        protocolVersion: 1,
        factor: 1.2,
        focalX: rect.width / 2,
        focalY: rect.height / 2,
      });
    };

    const handleZoomOut = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      postToWorker({
        type: WorkerMessageType.ZOOM,
        protocolVersion: 1,
        factor: 0.85,
        focalX: rect.width / 2,
        focalY: rect.height / 2,
      });
    };

    const handleResetView = () => {
      postToWorker({
        type: WorkerMessageType.RESET_VIEW,
        protocolVersion: 1,
      });
    };

    const handleMinimapJump = (worldX: number, worldY: number) => {
      if (!viewportSize) return;
      const zoom = minimapCamera?.zoom ?? 1;
      postToWorker({
        type: WorkerMessageType.SET_CAMERA,
        protocolVersion: 1,
        camera: {
          x: viewportSize.width / 2 - worldX * zoom,
          y: viewportSize.height / 2 - worldY * zoom,
          zoom,
        },
      });
    };

    // Helper to normalize various focusOn input formats into a proper OrbitMapSelection
    const normalizeToSelection = (input: string | { kind: string; id: string } | OrbitMapSelection): OrbitMapSelection => {
      if (typeof input === 'string') {
        return { kind: 'bookmark', id: input };
      }
      return input as OrbitMapSelection;
    };

    // Expose imperative handle (will forward to worker in later phases)
    useImperativeHandle(ref, () => ({
      focusOn: (input: string | { kind: string; id: string } | OrbitMapSelection) => {
        if (workerRef.current) {
          const selection = normalizeToSelection(input);
          workerRef.current.postMessage({
            type: WorkerMessageType.FOCUS_ON,
            protocolVersion: 1,
            selection,
          });
        } else {
          console.warn('focusOn called before worker ready');
        }
      },
      resetView: () => {
        if (workerRef.current) {
          workerRef.current.postMessage({
            type: WorkerMessageType.RESET_VIEW,
            protocolVersion: 1,
          });
        }
      },
      animateAssign: async (bookmarkId: string, anchorId: string) => {
        if (!workerRef.current) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          const cleanup = () => {
            workerRef.current?.removeEventListener('message', handleMessage);
            window.clearTimeout(timeoutId);
          };

          const handleMessage = (event: MessageEvent) => {
            const msg = event.data;
            if (
              msg.type === 'ANIMATE_ASSIGN_COMPLETE' &&
              msg.bookmarkId === bookmarkId
            ) {
              cleanup();
              resolve();
            }
          };

          workerRef.current?.addEventListener('message', handleMessage);

          // Safety timeout (5 seconds) in case the animation never completes
          const timeoutId = window.setTimeout(() => {
            cleanup();
            console.warn(`[OrbitMapHost] animateAssign for ${bookmarkId} timed out`);
            resolve(); // resolve anyway to not hang the caller
          }, 5000);

          workerRef.current?.postMessage({
            type: WorkerMessageType.ANIMATE_ASSIGN,
            protocolVersion: 1,
            bookmarkId,
            anchorId,
          });
        });
      },
    }), []);

    // If we need to fall back, render a small unsupported-browser state.
    if (useFallback) {
      return <OrbitMapUnsupportedState />;
    }

    return (
      <div
        className={props.className}
        role="application"
        aria-label="Orbit graph map"
        style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none' }}
      >
        <canvas
          key={canvasInstance}
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            touchAction: 'none',
          }}
        />
        <OrbitMapCanvasControls
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          filterControlsClassName={props.filterControlsClassName}
          zoomControlsClassName={props.zoomControlsClassName}
        />
        {graph && layoutVersion > 0 ? (
          <OrbitMapMinimap
            graph={graph}
            positions={latestPositionsRef.current}
            layoutVersion={layoutVersion}
            camera={minimapCamera}
            viewport={viewportSize}
            onJump={handleMinimapJump}
            className="absolute bottom-[4.25rem] left-4 z-10 hidden lg:block"
          />
        ) : null}
      </div>
    );
  }
);

export default OrbitMapCanvasHost;
