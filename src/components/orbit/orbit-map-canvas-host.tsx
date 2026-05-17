"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import type { OrbitGraphPayload } from '@/types';
import { OrbitMapCanvas as LegacyOrbitMapCanvas } from './orbit-map-canvas'; // Fallback

// Import protocol types (including shared UI types)
import {
  type WorkerMessage,
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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const [useFallback, setUseFallback] = React.useState(false);

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
              console.log('[OrbitMapHost] Worker ready');
              if (props.graph && props.graph.nodes.length > 0) {
                // Send graph cleanly, including any known positions for layout stability
                const initialPositions = getRelevantPositions(props.graph);
                const graphMessage: any = {
                  type: WorkerMessageType.SET_GRAPH,
                  protocolVersion: 1,
                  graph: props.graph,
                  ...(Object.keys(initialPositions).length > 0 && { initialPositions }),
                };
                workerRef.current?.postMessage(graphMessage);
                lastGraphKey.current = `${props.graph.nodes.length}-${props.graph.edges.length}`;

                // Then send the current filter
                const filterMessage = {
                  type: WorkerMessageType.SET_FILTER,
                  protocolVersion: 1,
                  filter: props.filter,
                };
                workerRef.current?.postMessage(filterMessage);
              }
              break;

            case MainMessageType.CAMERA_CHANGED:
              if (msg.camera) {
                // Could expose via a prop later for minimap / URL sync
                // console.log('[OrbitMapHost] Camera changed:', msg.camera);
              }
              break;

            case MainMessageType.SELECTION_CHANGED:
              props.onSelectionChange?.(msg.selection ?? null);
              break;

            case MainMessageType.HOVER_CHANGED:
              props.onHoverChange?.(
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
                props.onOpenBookmark?.(msg.bookmarkId);
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
                  props.onLayoutUpdated?.({ ...stablePositionsRef.current });
                }
              }
              break;

            case MainMessageType.CURSOR_CHANGED: {
              // Apply cursor to the container for better UX (visible even near canvas edges)
              const container = canvasRef.current?.parentElement;
              if (container) {
                container.style.cursor = msg.cursor;
              }
              break;
            }

            case MainMessageType.ERROR: {
              console.error('[OrbitMapHost] Worker error:', msg);
              const container = canvasRef.current?.parentElement;
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
          if (canvasRef.current) canvasRef.current.style.cursor = 'default';
          setUseFallback(true);
          worker.terminate();
        };
      } catch (err) {
        console.error('[OrbitMapHost] Failed to create worker:', err);
        setUseFallback(true);
      }

      // Cleanup
      return () => {
        const container = canvasRef.current?.parentElement;
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
      if (!workerRef.current || useFallback || !props.graph) return;

      const graphKey = `${props.graph.nodes.length}-${props.graph.edges.length}`;

      const graphChanged = lastGraphKey.current !== graphKey;

      if (graphChanged) {
        // Send full graph, including any known positions for layout stability
        const initialPositions = getRelevantPositions(props.graph);
        const graphMessage: any = {
          type: WorkerMessageType.SET_GRAPH,
          protocolVersion: 1,
          graph: props.graph,
          ...(Object.keys(initialPositions).length > 0 && { initialPositions }),
        };

        workerRef.current.postMessage(graphMessage);
        lastGraphKey.current = graphKey;
      }

      // Always send (or re-send) the current filter after graph is set
      const filterMessage = {
        type: WorkerMessageType.SET_FILTER,
        protocolVersion: 1,
        filter: props.filter,
      };

      workerRef.current.postMessage(filterMessage);
    }, [props.graph, props.filter, useFallback]);

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

    // === Event Forwarding for Pan & Zoom (to the worker) ===
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || useFallback || !workerRef.current) return;

      let isDragging = false;
      let lastX = 0;
      let lastY = 0;

      const sendMessage = (msg: WorkerMessage) => {
        workerRef.current?.postMessage(msg);
      };

      // Mouse / Pointer events for pan
      const handlePointerDown = (e: PointerEvent) => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      };

      const handlePointerMove = (e: PointerEvent) => {
        if (!isDragging) return;

        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        sendMessage({
          type: WorkerMessageType.PAN,
          protocolVersion: 1,
          dx,
          dy,
        });
      };

      const handlePointerUp = (e: PointerEvent) => {
        isDragging = false;
        canvas.releasePointerCapture(e.pointerId);
      };

      // Wheel for zoom (with cursor position)
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const delta = e.deltaY < 0 ? 1.1 : 0.9;

        sendMessage({
          type: WorkerMessageType.ZOOM,
          protocolVersion: 1,
          factor: delta,
          focalX: x,
          focalY: y,
        });  // Now matches ZoomMessage interface
      };

      // Touch support (basic pinch + pan)
      let lastTouchDist = 0;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastTouchDist = Math.hypot(dx, dy);
        } else if (e.touches.length === 1) {
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();

        if (e.touches.length === 2) {
          // Pinch zoom
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);

          const rect = canvas.getBoundingClientRect();
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

          const delta = dist > lastTouchDist ? 1.06 : 0.94;
          lastTouchDist = dist;

          sendMessage({
            type: WorkerMessageType.ZOOM,
            protocolVersion: 1,
            factor: delta,
            focalX: cx,
            focalY: cy,
          });  // Now matches ZoomMessage interface
        } else if (e.touches.length === 1) {
          // Single finger pan
          const dx = e.touches[0].clientX - lastX;
          const dy = e.touches[0].clientY - lastY;
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;

          sendMessage({
            type: WorkerMessageType.PAN,
            protocolVersion: 1,
            dx,
            dy,
          });
        }
      };

      // Attach listeners
      canvas.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

      return () => {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
      };
    }, [useFallback]);

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

        return new Promise((resolve, reject) => {
          let timeoutId: number | undefined;

          const cleanup = () => {
            workerRef.current?.removeEventListener('message', handleMessage);
            if (timeoutId) clearTimeout(timeoutId);
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
          timeoutId = window.setTimeout(() => {
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
          // @ts-ignore - Legacy fallback component has a completely different prop interface
          ref={ref as any}
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
      <div className={props.className} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            touchAction: 'none', // Important for smooth touch gestures
          }}
        />
        {/* DOM overlays (hover cards, etc.) will be rendered here by the parent */}
      </div>
    );
  }
);

export default OrbitMapCanvasHost;
