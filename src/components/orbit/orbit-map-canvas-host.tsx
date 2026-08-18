"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback, useSyncExternalStore } from 'react';
import { useTheme, useColorTheme } from '@/components/providers';
import { resolveOrbitMapCanvasTheme } from '@/lib/orbit-map-theme-colors';
import { getOrbitMapLivingEnabled } from '@/lib/orbit-map-living';
import { buildOrbitMapStructureKey } from '@/lib/orbit-map-structure-key';
import type { OrbitGraphPayload } from '@/types';
import { OrbitMapCanvasControls } from './orbit-map-canvas-controls';
import { OrbitMapMinimap, type OrbitMapMinimapProps } from './orbit-map-minimap';
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
  getSafeDpr,
  subscribeToDevicePixelRatioChanges,
} from '@/lib/orbit-worker-protocol';

interface OrbitMapCanvasHostProps {
  graph?: OrbitGraphPayload;
  data?: OrbitGraphPayload; // legacy prop support
  filter?: GraphFilter;
  onFilterChange?: (filter: GraphFilter) => void;
  selection?: OrbitMapSelection | null;
  focus?: OrbitMapFocus | null;
  /** Lowercased search query; worker builds index and highlights matches. */
  searchQuery?: string;
  onSearchResults?: (query: string, resultIds: string[]) => void;
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
  /** Hide the Loose filter when the fetched graph is already the queue. */
  hideLooseFilter?: boolean;
}

export interface OrbitMapCanvasHandle {
  focusOn: (input: string | { kind: string; id: string } | OrbitMapSelection) => void;
  resetView: () => void;
  animateAssign: (bookmarkId: string, anchorId: string) => Promise<void>;
  /** Radar sweep across the sky; the given nodes glint as the beam passes
   * (all bookmarks when omitted). For scan/triage visualizations. */
  playScanSweep: (nodeIds?: string[]) => void;
  /** Toggle living-map orbital motion after the worker is ready. */
  setLivingMap: (enabled: boolean) => void;
}

// Re-export shared types so pages can import them from this component (for backward compatibility)
export type { OrbitMapSelection, OrbitMapFocus, GraphFilter } from '@/lib/orbit-worker-protocol';

function getOrbitMapDebugPerfEnabled() {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    return window.localStorage.getItem('orbit-map-debug-perf') === '1';
  } catch {
    return false;
  }
}

function createOrbitMapCameraStore() {
  let camera: CameraState | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => camera,
    getServerSnapshot: () => null,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: CameraState) => {
      const previous = camera;
      if (
        previous &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.zoom === next.zoom
      ) {
        return;
      }
      camera = next;
      listeners.forEach((listener) => listener());
    },
  };
}

type OrbitMapCameraStore = ReturnType<typeof createOrbitMapCameraStore>;

function OrbitMapMinimapBound({
  cameraStore,
  ...props
}: Omit<OrbitMapMinimapProps, "camera"> & { cameraStore: OrbitMapCameraStore }) {
  const camera = useSyncExternalStore(
    cameraStore.subscribe,
    cameraStore.getSnapshot,
    cameraStore.getServerSnapshot
  );
  return <OrbitMapMinimap {...props} camera={camera} />;
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
    const { theme } = useTheme();
    const { colorTheme } = useColorTheme();
    const themeRef = useRef(theme);
    const colorThemeRef = useRef(colorTheme);
    themeRef.current = theme;
    colorThemeRef.current = colorTheme;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stageFocusRef = useRef<HTMLDivElement>(null);
    const didFocusStageRef = useRef(false);
    const workerRef = useRef<Worker | null>(null);
    const canvasTransferRetryRef = useRef(0);
    const [canvasInstance, setCanvasInstance] = useState(0);
    const [useFallback, setUseFallback] = useState(false);
    const [workerGeneration, setWorkerGeneration] = useState(0);
    const [internalFilter, setInternalFilter] = useState<GraphFilter>(filter ?? 'all');
    // Camera stays off React state so CAMERA_CHANGED (~15 Hz while panning)
    // only redraws the minimap. Keyboard pan/jump read the store snapshot.
    const cameraStoreRef = useRef<OrbitMapCameraStore | null>(null);
    if (cameraStoreRef.current === null) {
      cameraStoreRef.current = createOrbitMapCameraStore();
    }
    const cameraStore = cameraStoreRef.current;
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

    const themeColorsRef = useRef(resolveOrbitMapCanvasTheme(theme, colorTheme));
    const [themeColorsVersion, setThemeColorsVersion] = useState(0);

    const syncThemeColors = useCallback(() => {
      const resolved = resolveOrbitMapCanvasTheme(theme, colorTheme);
      themeColorsRef.current = resolved;
      return resolved;
    }, [theme, colorTheme]);

    useEffect(() => {
      syncThemeColors();
      setThemeColorsVersion((version) => version + 1);
    }, [syncThemeColors]);

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

          const { accentHex, backgroundHex } = resolveOrbitMapCanvasTheme(
            themeRef.current,
            colorThemeRef.current
          );

          // Send initialization message with transferred canvas
          const initMessage: WorkerMessage = {
            type: WorkerMessageType.INIT,
            protocolVersion: 1,
            canvas: offscreen,
            width: canvas.clientWidth,
            height: canvas.clientHeight,
            dpr: getSafeDpr(window.devicePixelRatio),
            debugPerf: getOrbitMapDebugPerfEnabled(),
            colorMode: themeRef.current,
            accentHex,
            backgroundHex,
            colorTheme: colorThemeRef.current,
            livingMap: getOrbitMapLivingEnabled(),
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
                  lastGraphKey.current = buildOrbitMapStructureKey(propsRef.current.graph);

                  // Then send the current filter
                  const readyFilter = propsRef.current.filter ?? 'all';
                  const filterMessage = {
                    type: WorkerMessageType.SET_FILTER,
                    protocolVersion: 1,
                    filter: readyFilter,
                  };
                  workerRef.current?.postMessage(filterMessage);
                  lastFilterRef.current = readyFilter;
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
                  cameraStore.set(msg.camera);
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
                propsRef.current.onSearchResults?.(
                  msg.query ?? '',
                  msg.resultIds ?? []
                );
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
                // Only unrecoverable failures (init) take down the map;
                // validation rejects and transient frame errors are logged
                // and survived rather than permanently swapping in the
                // unsupported-browser fallback.
                if (!msg.fatal) break;
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

    useEffect(() => {
      if (!workerRef.current || useFallback) return;
      const { accentHex, backgroundHex } = themeColorsRef.current;
      workerRef.current.postMessage({
        type: WorkerMessageType.SET_THEME,
        protocolVersion: 1,
        colorMode: theme,
        accentHex,
        backgroundHex,
        colorTheme,
      });
    }, [theme, colorTheme, useFallback, workerGeneration, themeColorsVersion]);

    // Send graph data + filter to worker whenever they change
    const lastGraphKey = useRef<string>("");
    const lastFilterRef = useRef<GraphFilter | null>(null);

    useEffect(() => {
      if (props.hideLooseFilter && activeFilter === "loose") {
        lastFilterRef.current = "all";
        if (filter === undefined) setInternalFilter("all");
        props.onFilterChange?.("all");
        postToWorker({
          type: WorkerMessageType.SET_FILTER,
          protocolVersion: 1,
          filter: "all",
        });
      }
    }, [activeFilter, filter, postToWorker, props.hideLooseFilter, props.onFilterChange]);

    useEffect(() => {
      if (!graph || useFallback || didFocusStageRef.current) return;
      didFocusStageRef.current = true;
      stageFocusRef.current?.focus({ preventScroll: true });
    }, [graph, useFallback]);

    useEffect(() => {
      if (!workerRef.current || useFallback || !graph) return;

      const graphKey = buildOrbitMapStructureKey(graph);

      if (lastGraphKey.current !== graphKey) {
        const graphMessage: SetGraphMessage = {
          type: WorkerMessageType.SET_GRAPH,
          protocolVersion: 1,
          graph,
        };

        workerRef.current.postMessage(graphMessage);
        lastGraphKey.current = graphKey;
      }

      if (lastFilterRef.current !== activeFilter) {
        workerRef.current.postMessage({
          type: WorkerMessageType.SET_FILTER,
          protocolVersion: 1,
          filter: activeFilter,
        });
        lastFilterRef.current = activeFilter;
      }
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

    // Page visibility → worker (pauses the living-map motion loop while hidden)
    useEffect(() => {
      if (useFallback) return;
      const handleVisibilityChange = () => {
        workerRef.current?.postMessage({
          type: WorkerMessageType.SET_VISIBILITY,
          protocolVersion: 1,
          visible: document.visibilityState === 'visible',
        });
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () =>
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [useFallback, workerGeneration]);

    // Forward resize to worker
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || useFallback || !workerRef.current) return;

      const postResize = (width: number, height: number) => {
        setViewportSize({ width, height });
        workerRef.current?.postMessage({
          type: WorkerMessageType.RESIZE,
          protocolVersion: 1,
          width,
          height,
          dpr: getSafeDpr(window.devicePixelRatio),
        });
      };

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        postResize(entry.contentRect.width, entry.contentRect.height);
      });

      observer.observe(canvas);
      const unsubscribeDpr = subscribeToDevicePixelRatioChanges(() => {
        const rect = canvas.getBoundingClientRect();
        postResize(rect.width, rect.height);
      });

      return () => {
        observer.disconnect();
        unsubscribeDpr();
      };
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

      const queuePointerMove = (e: PointerEvent) => {
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

      // Canvas hover. Capture already retargets drag moves here, so the
      // window listener below must ignore events whose target is the canvas.
      const handleCanvasPointerMove = (e: PointerEvent) => {
        queuePointerMove(e);
      };

      // Fallback for a drag that leaves the canvas if capture is lost.
      // Idle travel over sidebar/search must not hit-test.
      const handleWindowPointerMove = (e: PointerEvent) => {
        if (e.buttons === 0) return;
        if (e.target === canvas || (e.target instanceof Node && canvas.contains(e.target))) {
          return;
        }
        queuePointerMove(e);
      };

      let windowGestureListenersAttached = false;

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
        if (!windowGestureListenersAttached) return;
        window.removeEventListener('pointermove', handleWindowPointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        windowGestureListenersAttached = false;
      };

      const attachWindowGestureListeners = () => {
        if (windowGestureListenersAttached) return;
        window.addEventListener('pointermove', handleWindowPointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        windowGestureListenersAttached = true;
      };

      const detachWindowGestureListeners = () => {
        if (!windowGestureListenersAttached) return;
        window.removeEventListener('pointermove', handleWindowPointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        windowGestureListenersAttached = false;
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
        attachWindowGestureListeners();
      };

      const handlePointerLeave = () => {
        // Capture does not suppress pointerleave. During an active drag the
        // worker treats LEAVE as "cancel gesture" — skip it until pointerup.
        if (windowGestureListenersAttached) return;
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
      canvas.addEventListener('pointermove', handleCanvasPointerMove);
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
        detachWindowGestureListeners();
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handleCanvasPointerMove);
        canvas.removeEventListener('pointerleave', handlePointerLeave);
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('dblclick', handleDoubleClick);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
      };
    }, [useFallback, workerGeneration]);

    const handleFilterChange = (next: GraphFilter) => {
      lastFilterRef.current = next;
      if (filter === undefined) setInternalFilter(next);
      props.onFilterChange?.(next);
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

    const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Arrow keys pan, +/- zoom, 0 resets, Escape clears selection.
      // WASD is intentionally omitted to avoid clashing with the global
      // A (assign) / S shortcuts that are active while the canvas is focused.
      const key = event.key;
      const isPan =
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight';
      const isZoomIn = key === '+' || key === '=';
      const isZoomOut = key === '-' || key === '_';
      const isReset = key === '0';
      const isEscape = key === 'Escape';

      if (!isPan && !isZoomIn && !isZoomOut && !isReset && !isEscape) return;
      // Don't interfere with modifier combos (e.g. Cmd+/- for browser zoom).
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();

      if (isEscape) {
        props.onSelectionChange?.(null);
        return;
      }
      if (isReset) {
        handleResetView();
        return;
      }
      if (isZoomIn) {
        handleZoomIn();
        return;
      }
      if (isZoomOut) {
        handleZoomOut();
        return;
      }

      // Pan via SET_CAMERA, offset from the current camera.
      const camera = cameraStore.getSnapshot();
      const viewport = viewportSize;
      if (!camera || !viewport) return;
      const stepX = Math.max(40, viewport.width * 0.2);
      const stepY = Math.max(40, viewport.height * 0.2);
      let { x, y } = camera;
      if (key === 'ArrowRight') x -= stepX;
      else if (key === 'ArrowLeft') x += stepX;
      else if (key === 'ArrowDown') y -= stepY;
      else if (key === 'ArrowUp') y += stepY;
      postToWorker({
        type: WorkerMessageType.SET_CAMERA,
        protocolVersion: 1,
        camera: { x, y, zoom: camera.zoom },
      });
    };

    const handleMinimapJump = (worldX: number, worldY: number) => {
      if (!viewportSize) return;
      const zoom = cameraStore.getSnapshot()?.zoom ?? 1;
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
      playScanSweep: (nodeIds?: string[]) => {
        workerRef.current?.postMessage({
          type: WorkerMessageType.PLAY_SCAN_SWEEP,
          protocolVersion: 1,
          nodeIds: nodeIds ?? null,
        });
      },
      setLivingMap: (enabled: boolean) => {
        workerRef.current?.postMessage({
          type: WorkerMessageType.SET_LIVING_MAP,
          protocolVersion: 1,
          enabled,
        });
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
        ref={stageFocusRef}
        className={`${props.className ?? ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-inset`}
        role="application"
        aria-label="Orbit graph map — use arrow keys to pan, plus and minus to zoom, 0 to reset, Escape to clear selection"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
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
          hideLooseFilter={props.hideLooseFilter}
          filterControlsClassName={props.filterControlsClassName}
          zoomControlsClassName={props.zoomControlsClassName}
        />
        {graph && layoutVersion > 0 ? (
          <OrbitMapMinimapBound
            cameraStore={cameraStore}
            graph={graph}
            positions={latestPositionsRef.current}
            layoutVersion={layoutVersion}
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
