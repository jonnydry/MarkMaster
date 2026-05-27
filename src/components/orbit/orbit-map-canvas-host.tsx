"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import type { OrbitGraphPayload } from '@/types';
import { OrbitMapCanvas as LegacyOrbitMapCanvas } from './orbit-map-canvas';
import { OrbitMapCanvasControls } from './orbit-map-canvas-controls';
import { loadOrbitMapPositions } from '@/lib/orbit-map-layout-storage';

// Import protocol types (including shared UI types)
import {
  type WorkerMessage,
  type SetGraphMessage,
  WorkerMessageType,
  MainMessageType,
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
  onSelectionChange?: (selection: OrbitMapSelection | null) => void;
  onHoverChange?: (hover: OrbitMapSelection | null, position?: { x: number; y: number }) => void;
  onOpenBookmark?: (bookmarkId: string) => void;
  /** Called whenever the worker sends an updated layout (useful for persistence) */
  onLayoutUpdated?: (positions: Record<string, { x: number; y: number }>) => void;
  className?: string;
  filterControlsClassName?: string;
  zoomControlsClassName?: string;
  /** Persists layout positions per graph scope (library vs orbit). */
  layoutScope?: string;
}

export interface OrbitMapCanvasHandle {
  focusOn: (input: string | { kind: string; id: string } | OrbitMapSelection) => void;
  resetView: () => void;
  animateAssign: (bookmarkId: string, anchorId: string) => Promise<void>;
  /**
   * Returns the most recent node positions received from the worker.
   * These may include mid-simulation (non-stabilized) positions.
   * Use `onLayoutUpdated` + `initialPositions` for high-quality persisted layouts.
   */
  getLatestPositions: () => Record<string, { x: number; y: number }>;
}

// Re-export shared types so pages can import them from this component (for backward compatibility)
export type { OrbitMapSelection, OrbitMapFocus, GraphFilter } from '@/lib/orbit-worker-protocol';

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
    const [useFallback, setUseFallback] = useState(false);
    const [internalFilter, setInternalFilter] = useState<GraphFilter>(filter ?? 'all');
    const activeFilter = filter ?? internalFilter;
    const layoutScope = props.layoutScope ?? 'library';

    useEffect(() => {
      const loaded = loadOrbitMapPositions(layoutScope);
      stablePositionsRef.current = loaded;
      latestPositionsRef.current = { ...loaded };
    }, [layoutScope]);

    useEffect(() => {
      if (filter) setInternalFilter(filter);
    }, [filter]);

    const postToWorker = useCallback((msg: WorkerMessage) => {
      workerRef.current?.postMessage(msg);
    }, []);

    // Stores the most recent node positions received from the worker (live, may be mid-simulation).
    const latestPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

    // Stores only high-quality, stabilized layout snapshots.
    // These are preferred for restoring layout across refreshes.
    const stablePositionsRef = useRef<Record<string, { x: number; y: number }>>({});

    /**
     * Returns the best available positions for nodes in the given graph.
     * Prefers stabilized positions when available, falls back to the most recent live positions.
     */
    const getRelevantPositions = (graph: OrbitGraphPayload): Record<string, { x: number; y: number }> => {
      const positions: Record<string, { x: number; y: number }> = {};
      const stable = stablePositionsRef.current;
      const latest = latestPositionsRef.current;

      for (const node of graph.nodes) {
        if (stable[node.id]) {
          positions[node.id] = stable[node.id];
        } else if (latest[node.id]) {
          positions[node.id] = latest[node.id];
        }
      }
      return positions;
    };

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

      let worker: Worker;

      try {
        worker = new Worker(
          new URL('../../workers/orbit-map-worker.ts', import.meta.url),
          { type: 'module' }
        );
        workerRef.current = worker;

        // Transfer control of the canvas to the worker
        const offscreen = canvas.transferControlToOffscreen();

        // Send initialization message with transferred canvas
        const initMessage: WorkerMessage = {
          type: WorkerMessageType.INIT,
          protocolVersion: 1,
          canvas: offscreen,
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          dpr: window.devicePixelRatio || 1,
        };

        worker.postMessage(initMessage, [offscreen]);

        // Listen for messages from worker
        worker.onmessage = (event: MessageEvent) => {
          const msg = event.data;

          switch (msg.type) {
            case MainMessageType.READY:
              if (propsRef.current.graph && propsRef.current.graph.nodes.length > 0) {
                // Send graph cleanly, including any known positions for layout stability
                const initialPositions = getRelevantPositions(propsRef.current.graph);
                const graphMessage: SetGraphMessage = {
                  type: WorkerMessageType.SET_GRAPH,
                  protocolVersion: 1,
                  graph: propsRef.current.graph,
                  ...(Object.keys(initialPositions).length > 0 && { initialPositions }),
                };
                workerRef.current?.postMessage(graphMessage);
                lastGraphKey.current = `${propsRef.current.graph.nodes.length}-${propsRef.current.graph.edges.length}`;

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
                // Could expose via a prop later for minimap / URL sync
                // console.log('[OrbitMapHost] Camera changed:', msg.camera);
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

            case MainMessageType.LAYOUT_UPDATED:
              if (msg.nodeIds && msg.positions) {
                const updated: Record<string, { x: number; y: number }> = {};

                for (let i = 0; i < msg.nodeIds.length; i++) {
                  updated[msg.nodeIds[i]] = {
                    x: msg.positions[i * 2],
                    y: msg.positions[i * 2 + 1],
                  };
                }

                // Always keep the most recent positions (live updates)
                latestPositionsRef.current = {
                  ...latestPositionsRef.current,
                  ...updated,
                };

                // Only update the stable snapshot when the worker says the layout has settled
                if (msg.stabilized) {
                  stablePositionsRef.current = {
                    ...stablePositionsRef.current,
                    ...updated,
                  };

                  // Notify parent for persistence (e.g. localStorage)
                  propsRef.current.onLayoutUpdated?.({ ...stablePositionsRef.current });
                }
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
        };
      } catch (err) {
        console.error('[OrbitMapHost] Failed to create worker:', err);
        setUseFallback(true);
      }

      // Cleanup
      return () => {
        const container = canvas?.parentElement;
        if (container) container.style.cursor = 'default';
        if (workerRef.current) {
          workerRef.current.postMessage({ type: WorkerMessageType.DESTROY, protocolVersion: 1 });
          workerRef.current.terminate();
          workerRef.current = null;
        }
      };
    }, []);

    // Send graph data + filter to worker whenever they change
    const lastGraphKey = useRef<string>("");

    useEffect(() => {
      if (!workerRef.current || useFallback || !graph) return;

      const graphKey = `${graph.nodes.length}-${graph.edges.length}`;

      const graphChanged = lastGraphKey.current !== graphKey;

      if (graphChanged) {
        // Send full graph, including any known positions for layout stability
        const initialPositions = getRelevantPositions(graph);
        const graphMessage: SetGraphMessage = {
          type: WorkerMessageType.SET_GRAPH,
          protocolVersion: 1,
          graph,
          ...(Object.keys(initialPositions).length > 0 && { initialPositions }),
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
    }, [graph, activeFilter, filter, useFallback]);

    useEffect(() => {
      if (!workerRef.current || useFallback) return;
      workerRef.current.postMessage({
        type: WorkerMessageType.SET_SELECTION,
        protocolVersion: 1,
        selection: props.selection ?? null,
      });
    }, [props.selection, useFallback]);

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
    }, [props.focus, useFallback]);

    // Forward resize to worker
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || useFallback || !workerRef.current) return;

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;

        workerRef.current?.postMessage({
          type: WorkerMessageType.RESIZE,
          protocolVersion: 1,
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      });

      observer.observe(canvas);

      return () => observer.disconnect();
    }, [useFallback]);

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

      const handlePointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
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
        send({
          type: WorkerMessageType.POINTER_MOVE,
          protocolVersion: 1,
          x,
          y,
          buttons: e.buttons,
        });
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
        send({
          type: WorkerMessageType.POINTER_LEAVE,
          protocolVersion: 1,
        });
      };

      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const { x, y } = canvasPoint(e.clientX, e.clientY);
        send({
          type: WorkerMessageType.WHEEL,
          protocolVersion: 1,
          deltaY: e.deltaY,
          x,
          y,
          ctrlKey: e.ctrlKey,
        });
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

      let lastTouchDist = 0;
      let lastTouchX = 0;
      let lastTouchY = 0;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastTouchDist = Math.hypot(dx, dy);
        } else if (e.touches.length === 1) {
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
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
        } else if (e.touches.length === 1) {
          const dx = e.touches[0].clientX - lastTouchX;
          const dy = e.touches[0].clientY - lastTouchY;
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
          send({
            type: WorkerMessageType.PAN,
            protocolVersion: 1,
            dx,
            dy,
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
        canvas.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointerleave', handlePointerLeave);
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('dblclick', handleDoubleClick);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
      };
    }, [useFallback]);

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

      getLatestPositions: () => ({ ...latestPositionsRef.current }),
    }), []);

    // If we need to fall back, render the original legacy component
    if (useFallback) {
      return (
        <LegacyOrbitMapCanvas
          ref={ref}
          data={props.graph!}
          selection={props.selection ?? null}
          focus={props.focus}
          onSelectionChange={props.onSelectionChange ?? (() => {})}
          onHoverChange={props.onHoverChange}
          onOpenBookmark={props.onOpenBookmark}
          className={props.className}
        />
      );
    }

    return (
      <div
        className={props.className}
        role="application"
        aria-label="Orbit graph map"
        style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none' }}
      >
        <canvas
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
      </div>
    );
  }
);

export default OrbitMapCanvasHost;
