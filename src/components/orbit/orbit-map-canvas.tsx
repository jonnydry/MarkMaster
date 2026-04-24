"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  OrbitGraphEdge,
  OrbitGraphNode,
  OrbitGraphPayload,
} from "@/types";

export interface OrbitMapSelection {
  kind: "tag" | "collection" | "bookmark" | "core" | "overflow";
  id: string;
}

export interface OrbitMapFocus {
  bookmarkId: string;
  predictedAnchorId: string;
}

export interface OrbitMapCanvasHandle {
  focusOn: (selection: OrbitMapSelection) => void;
  animateAssign: (bookmarkId: string, anchorId: string) => Promise<void>;
  resetView: () => void;
}

interface OrbitMapCanvasProps {
  data: OrbitGraphPayload;
  selection: OrbitMapSelection | null;
  onSelectionChange: (selection: OrbitMapSelection | null) => void;
  onHoverChange?: (selection: OrbitMapSelection | null) => void;
  onOpenBookmark?: (bookmarkId: string) => void;
  focus?: OrbitMapFocus | null;
  className?: string;
}

type NodeDatum = SimulationNodeDatum & {
  node: OrbitGraphNode;
  radius: number;
  assignAnimation?: {
    startedAt: number;
    durationMs: number;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
  };
};

type LinkDatum = SimulationLinkDatum<NodeDatum> & {
  edge: OrbitGraphEdge;
  kind: OrbitGraphEdge["kind"];
};

const DPR_CAP = 2;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const BG_COLOR = "#0b0f1a";
// Obsidian-style muted palette.
const COLOR_ANCHOR_TAG = "#9ca3af";
const COLOR_ANCHOR_COLLECTION = "#60a5fa";
const COLOR_ANCHOR_X_FOLDER = "#38bdf8";
const COLOR_BOOKMARK = "#cbd5f5";
const COLOR_BOOKMARK_LOOSE = "#fbbf24";
const COLOR_LINK = "rgba(148, 163, 184, ";

function isAnchorKind(kind: OrbitGraphNode["kind"]): boolean {
  return kind === "tag" || kind === "collection" || kind === "core";
}

function getNodeRadius(node: OrbitGraphNode): number {
  switch (node.kind) {
    case "core":
      // Rendered, but small — Obsidian-style graphs have no hub pill.
      return 5;
    case "tag":
      return 6 + Math.min(Math.sqrt(node.count) * 1.9, 14);
    case "collection":
      return 7 + Math.min(Math.sqrt(node.count) * 2.1, 16);
    case "bookmark":
      return node.recent ? 3.2 : 2.8;
    case "overflow":
      return 4;
    default:
      node satisfies never;
      return 3;
  }
}

function getAnchorColor(node: OrbitGraphNode): string {
  if (node.kind === "tag") return node.color;
  if (node.kind === "collection") {
    return node.variant === "x_folder"
      ? COLOR_ANCHOR_X_FOLDER
      : COLOR_ANCHOR_COLLECTION;
  }
  if (node.kind === "core") return COLOR_ANCHOR_TAG;
  return COLOR_ANCHOR_TAG;
}

function getAnchorLabel(node: OrbitGraphNode): string | null {
  switch (node.kind) {
    case "tag":
      return node.name;
    case "collection":
      return node.name;
    case "core":
      return "Orbit";
    default:
      return null;
  }
}

function getNodeIdentity(node: OrbitGraphNode): OrbitMapSelection {
  switch (node.kind) {
    case "core":
      return { kind: "core", id: node.id };
    case "tag":
      return { kind: "tag", id: node.id };
    case "collection":
      return { kind: "collection", id: node.id };
    case "bookmark":
      return { kind: "bookmark", id: node.id };
    case "overflow":
      return { kind: "overflow", id: node.id };
    default:
      node satisfies never;
      return { kind: "core", id: "orbit-index" };
  }
}

function normalizeLinkEndpoint(
  value: NodeDatum | string | number | undefined
): NodeDatum | null {
  if (!value) return null;
  if (typeof value === "object") return value as NodeDatum;
  return null;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return [148, 163, 184];
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ];
}

export const OrbitMapCanvas = forwardRef<
  OrbitMapCanvasHandle,
  OrbitMapCanvasProps
>(function OrbitMapCanvas(
  {
    data,
    selection,
    onSelectionChange,
    onHoverChange,
    onOpenBookmark,
    focus,
    className,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<Simulation<NodeDatum, LinkDatum> | null>(null);
  const nodesRef = useRef<NodeDatum[]>([]);
  const linksRef = useRef<LinkDatum[]>([]);
  const nodesByIdRef = useRef<Map<string, NodeDatum>>(new Map());
  // Adjacency map: node id -> set of 1-hop neighbor ids. Used for the
  // Obsidian-style dim-the-rest highlight.
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 });
  const hoverRef = useRef<NodeDatum | null>(null);
  const selectionRef = useRef<OrbitMapSelection | null>(selection);
  const focusRef = useRef<OrbitMapFocus | null>(focus ?? null);
  const isDraggingRef = useRef<{ x: number; y: number; moved: boolean } | null>(
    null
  );
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true);
  const touchRef = useRef<{
    ids: number[];
    startX: number;
    startY: number;
    startViewX: number;
    startViewY: number;
    startZoom: number;
    startDist: number;
    moved: boolean;
  } | null>(null);

  // Filter the raw graph to just nodes we want to render. Overflow markers
  // disappear — the rail surfaces the truncation count instead.
  const renderableData = useMemo(() => {
    const allowedNodeIds = new Set<string>();
    const nodes = data.nodes.filter((node) => {
      if (node.kind === "overflow") return false;
      allowedNodeIds.add(node.id);
      return true;
    });
    const edges = data.edges.filter((edge) => {
      if (edge.kind === "overflow") return false;
      if (edge.kind === "loose") {
        return allowedNodeIds.has(edge.bookmarkId);
      }
      if (edge.kind === "bookmark-tag") {
        return (
          allowedNodeIds.has(edge.bookmarkId) && allowedNodeIds.has(edge.tagId)
        );
      }
      if (edge.kind === "bookmark-collection") {
        return (
          allowedNodeIds.has(edge.bookmarkId) &&
          allowedNodeIds.has(edge.collectionId)
        );
      }
      return false;
    });
    return { nodes, edges };
  }, [data]);

  const applyCursor = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (isDraggingRef.current?.moved) {
      container.style.cursor = "grabbing";
      return;
    }
    const hovered = hoverRef.current;
    if (hovered) {
      const kind = hovered.node.kind;
      if (
        kind === "bookmark" ||
        kind === "tag" ||
        kind === "collection" ||
        kind === "core"
      ) {
        container.style.cursor = "pointer";
        return;
      }
    }
    container.style.cursor = "grab";
  }, []);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    focusRef.current = focus ?? null;
  }, [focus]);

  // --- build nodes + links + simulation when data changes ---
  useEffect(() => {
    const prevById = nodesByIdRef.current;

    const nextNodes: NodeDatum[] = renderableData.nodes.map((node) => {
      const existing = prevById.get(node.id);
      const radius = getNodeRadius(node);
      return {
        ...existing,
        node,
        radius,
        x: existing?.x,
        y: existing?.y,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        fx: existing?.fx,
        fy: existing?.fy,
      };
    });

    const nextById = new Map(nextNodes.map((node) => [node.node.id, node]));
    nodesByIdRef.current = nextById;

    const adjacency = new Map<string, Set<string>>();
    const pushAdj = (a: string, b: string) => {
      let bucket = adjacency.get(a);
      if (!bucket) {
        bucket = new Set();
        adjacency.set(a, bucket);
      }
      bucket.add(b);
    };

    const nextLinks: LinkDatum[] = renderableData.edges.flatMap((edge) => {
      let sourceId: string | null = null;
      let targetId: string | null = null;

      switch (edge.kind) {
        case "bookmark-tag":
          sourceId = edge.bookmarkId;
          targetId = edge.tagId;
          break;
        case "bookmark-collection":
          sourceId = edge.bookmarkId;
          targetId = edge.collectionId;
          break;
        case "loose":
          sourceId = edge.bookmarkId;
          targetId = "orbit-index";
          break;
        case "overflow":
          return [];
        default:
          edge satisfies never;
      }

      if (!sourceId || !targetId) return [];
      const source = nextById.get(sourceId);
      const target = nextById.get(targetId);
      if (!source || !target) return [];

      pushAdj(sourceId, targetId);
      pushAdj(targetId, sourceId);

      return [
        {
          source,
          target,
          edge,
          kind: edge.kind,
        },
      ];
    });

    nodesRef.current = nextNodes;
    linksRef.current = nextLinks;
    adjacencyRef.current = adjacency;

    // Obsidian-like layout: no radial rings, no pinned hub. Light center
    // force + repulsion + collision keeps the graph legible.
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const simulation = forceSimulation<NodeDatum, LinkDatum>(nextNodes)
      .alphaDecay(0.025)
      .velocityDecay(0.38)
      .force(
        "link",
        forceLink<NodeDatum, LinkDatum>(nextLinks)
          .id((node) => node.node.id)
          .distance((link) => {
            switch (link.kind) {
              case "bookmark-tag":
                return 60;
              case "bookmark-collection":
                return 68;
              case "loose":
                return 140;
              default:
                return 80;
            }
          })
          .strength((link) => {
            switch (link.kind) {
              case "bookmark-tag":
                return 0.6;
              case "bookmark-collection":
                return 0.55;
              case "loose":
                return 0.04;
              default:
                return 0.2;
            }
          })
      )
      .force(
        "charge",
        forceManyBody<NodeDatum>().strength((node) => {
          switch (node.node.kind) {
            case "core":
              return -180;
            case "tag":
            case "collection":
              return -260;
            default:
              return -35;
          }
        })
      )
      .force(
        "collide",
        forceCollide<NodeDatum>()
          .radius((node) => node.radius + 3)
          .strength(0.8)
      )
      .force("center", forceCenter(0, 0).strength(0.06))
    .on("tick", () => {
      needsRenderRef.current = true;
    });

    // Seed unseeded nodes in a loose disc so the first paint doesn't show a
    // violent explosion.
    for (const node of nextNodes) {
      if (node.x === undefined || node.y === undefined) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 120 + Math.random() * 200;
        node.x = Math.cos(angle) * radius;
        node.y = Math.sin(angle) * radius;
      }
    }

    simulationRef.current = simulation;
    simulation.alpha(0.9).restart();

    return () => {
      simulation.stop();
    };
  }, [renderableData]);

  // --- resize observer ---
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(rect.width, 320),
        height: Math.max(rect.height, 320),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // --- visibility pause to conserve CPU ---
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && simulationRef.current) {
        simulationRef.current
          .alpha(Math.max(simulationRef.current.alpha(), 0.08))
          .restart();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // --- paint loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, DPR_CAP);
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const hasActiveSimulation = () => {
      const sim = simulationRef.current;
      return sim ? sim.alpha() > 0.01 : false;
    };

    const hasFocusPulse = () => {
      return focusRef.current !== null;
    };

    const render = () => {
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const adjacency = adjacencyRef.current;
      const now = performance.now();

      // Animate simple straight-line assignments.
      let animating = false;
      for (const node of nodes) {
        const animation = node.assignAnimation;
        if (!animation) continue;
        animating = true;
        const t = Math.min(
          (now - animation.startedAt) / animation.durationMs,
          1
        );
        const eased = easeInOutCubic(t);
        const x =
          animation.startX + (animation.targetX - animation.startX) * eased;
        const y =
          animation.startY + (animation.targetY - animation.startY) * eased;
        node.fx = x;
        node.fy = y;
        node.x = x;
        node.y = y;
        if (t >= 1) {
          node.fx = undefined;
          node.fy = undefined;
          node.assignAnimation = undefined;
          if (simulationRef.current) {
            simulationRef.current.alpha(0.2).restart();
          }
        }
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Solid background — no gradient rings.
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, size.width, size.height);

      const view = viewRef.current;
      ctx.translate(size.width / 2 + view.x, size.height / 2 + view.y);
      ctx.scale(view.zoom, view.zoom);

      const selectionNow = selectionRef.current;
      const hoverNow = hoverRef.current;

      // Determine which node is "active" for highlight. Selection wins; hover
      // is the fallback so you can explore without committing.
      let activeId: string | null = null;
      if (selectionNow) activeId = selectionNow.id;
      else if (hoverNow) activeId = hoverNow.node.id;

      const neighbors = activeId ? adjacency.get(activeId) ?? null : null;
      const isDimmed = (id: string): boolean => {
        if (!activeId) return false;
        if (id === activeId) return false;
        if (neighbors && neighbors.has(id)) return false;
        return true;
      };

      // --- draw links ---
      const linkRgb = COLOR_LINK;
      ctx.lineWidth = 0.6 / view.zoom;
      for (const link of links) {
        const source = normalizeLinkEndpoint(link.source);
        const target = normalizeLinkEndpoint(link.target);
        if (!source || !target) continue;
        if (source.x === undefined || source.y === undefined) continue;
        if (target.x === undefined || target.y === undefined) continue;

        const touchesActive =
          activeId !== null &&
          (source.node.id === activeId || target.node.id === activeId);

        let alpha = 0.18;
        if (activeId) {
          alpha = touchesActive ? 0.6 : 0.06;
        }
        ctx.strokeStyle = `${linkRgb}${alpha})`;
        ctx.lineWidth = (touchesActive ? 1 : 0.6) / view.zoom;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }

      // --- draw bookmarks first so anchors sit on top ---
      for (const datum of nodes) {
        if (datum.node.kind !== "bookmark") continue;
        if (datum.x === undefined || datum.y === undefined) continue;

        const dimmed = isDimmed(datum.node.id);
        const isActive = activeId === datum.node.id;
        const loose = !datum.node.affiliated;
        const [r, g, b] = hexToRgb(loose ? COLOR_BOOKMARK_LOOSE : COLOR_BOOKMARK);
        const alpha = dimmed ? 0.18 : isActive ? 1 : 0.85;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.arc(datum.x, datum.y, datum.radius, 0, Math.PI * 2);
        ctx.fill();

        if (isActive) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
          ctx.lineWidth = 1.4 / view.zoom;
          ctx.arc(datum.x, datum.y, datum.radius + 2.4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // --- draw anchors (core, tags, collections) as dots with labels ---
      const labelFont = `${11 / view.zoom}px 'Inter', ui-sans-serif, system-ui, sans-serif`;
      for (const datum of nodes) {
        if (!isAnchorKind(datum.node.kind)) continue;
        if (datum.x === undefined || datum.y === undefined) continue;

        const dimmed = isDimmed(datum.node.id);
        const isActive = activeId === datum.node.id;
        const accent = getAnchorColor(datum.node);
        const [r, g, b] = accent.startsWith("#")
          ? hexToRgb(accent)
          : [148, 163, 184];
        const alpha = dimmed ? 0.22 : 1;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.arc(datum.x, datum.y, datum.radius, 0, Math.PI * 2);
        ctx.fill();

        if (isActive) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
          ctx.lineWidth = 1.4 / view.zoom;
          ctx.arc(datum.x, datum.y, datum.radius + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        const label = getAnchorLabel(datum.node);
        if (!label) continue;

        ctx.font = labelFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const labelAlpha = dimmed ? 0.25 : isActive ? 1 : 0.78;
        ctx.fillStyle = `rgba(226, 232, 240, ${labelAlpha})`;
        ctx.fillText(label, datum.x, datum.y + datum.radius + 4 / view.zoom);
      }

      // --- focus pulse on a predicted anchor (arrival target) ---
      const focusNow = focusRef.current;
      if (focusNow) {
        const anchor = nodesByIdRef.current.get(focusNow.predictedAnchorId);
        if (anchor && anchor.x !== undefined && anchor.y !== undefined) {
          const phase = (now / 900) % 1;
          const pulseRadius = anchor.radius + 6 + phase * 22;
          const pulseAlpha = 0.4 * (1 - phase);
          ctx.beginPath();
          ctx.strokeStyle = `rgba(147, 197, 253, ${pulseAlpha})`;
          ctx.lineWidth = 1.4 / view.zoom;
          ctx.arc(anchor.x, anchor.y, pulseRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();

      // Decide whether we need another frame immediately or can back off.
      const needsImmediate =
        needsRenderRef.current ||
        animating ||
        hasActiveSimulation() ||
        hasFocusPulse() ||
        isDraggingRef.current !== null ||
        touchRef.current !== null;

      needsRenderRef.current = false;

      if (needsImmediate) {
        rafRef.current = requestAnimationFrame(render);
      } else {
        timeoutRef.current = window.setTimeout(() => {
          rafRef.current = requestAnimationFrame(render);
        }, 120);
      }
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [size.height, size.width]);

  // --- hit testing ---
  const findNodeAt = useCallback(
    (clientX: number, clientY: number): NodeDatum | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const view = viewRef.current;
      const localX =
        (clientX - rect.left - rect.width / 2 - view.x) / view.zoom;
      const localY =
        (clientY - rect.top - rect.height / 2 - view.y) / view.zoom;

      // Iterate in reverse so anchors (drawn last) win ties.
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i];
        if (node.x === undefined || node.y === undefined) continue;
        const dx = localX - node.x;
        const dy = localY - node.y;
        const hitRadius = Math.max(node.radius + 4, isAnchorKind(node.node.kind) ? 10 : 4);
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          return node;
        }
      }
      return null;
    },
    []
  );

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      containerRef.current?.focus({ preventScroll: true });
      isDraggingRef.current = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      setIsDragging(true);
      needsRenderRef.current = true;
      applyCursor();
    },
    [applyCursor]
  );

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const drag = isDraggingRef.current;
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) {
          drag.moved = true;
          applyCursor();
        }
        if (drag.moved) {
          viewRef.current.x += dx;
          viewRef.current.y += dy;
          drag.x = event.clientX;
          drag.y = event.clientY;
          needsRenderRef.current = true;
        }
        return;
      }

      const hovered = findNodeAt(event.clientX, event.clientY);
      if (hovered !== hoverRef.current) {
        hoverRef.current = hovered;
        needsRenderRef.current = true;
        applyCursor();
        if (onHoverChange) {
          onHoverChange(hovered ? getNodeIdentity(hovered.node) : null);
        }
      }
    },
    [applyCursor, findNodeAt, onHoverChange]
  );

  const handleMouseUp = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const drag = isDraggingRef.current;
      isDraggingRef.current = null;
      setIsDragging(false);
      needsRenderRef.current = true;
      if (drag && !drag.moved) {
        const hit = findNodeAt(event.clientX, event.clientY);
        if (hit) {
          onSelectionChange(getNodeIdentity(hit.node));
        } else {
          onSelectionChange(null);
        }
      }
      applyCursor();
    },
    [applyCursor, findNodeAt, onSelectionChange]
  );

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = null;
    setIsDragging(false);
    needsRenderRef.current = true;
    if (hoverRef.current) {
      hoverRef.current = null;
      onHoverChange?.(null);
    }
    applyCursor();
  }, [applyCursor, onHoverChange]);

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      needsRenderRef.current = true;
      const hit = findNodeAt(event.clientX, event.clientY);
      if (hit && hit.node.kind === "bookmark" && onOpenBookmark) {
        onOpenBookmark(hit.node.id);
      }
    },
    [findNodeAt, onOpenBookmark]
  );

  // --- touch handlers ---
  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      container.focus({ preventScroll: true });

      const touches = event.touches;
      if (touches.length === 1) {
        const t = touches[0];
        touchRef.current = {
          ids: [t.identifier],
          startX: t.clientX,
          startY: t.clientY,
          startViewX: viewRef.current.x,
          startViewY: viewRef.current.y,
          startZoom: viewRef.current.zoom,
          startDist: 0,
          moved: false,
        };
      } else if (touches.length === 2) {
        const t1 = touches[0];
        const t2 = touches[1];
        const dist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY
        );
        touchRef.current = {
          ids: [t1.identifier, t2.identifier],
          startX: (t1.clientX + t2.clientX) / 2,
          startY: (t1.clientY + t2.clientY) / 2,
          startViewX: viewRef.current.x,
          startViewY: viewRef.current.y,
          startZoom: viewRef.current.zoom,
          startDist: dist,
          moved: false,
        };
      }
    },
    []
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!touchRef.current) return;
      event.preventDefault();

      const touches = event.touches;
      const state = touchRef.current;

      if (touches.length === 1 && state.ids.length === 1) {
        const t = touches[0];
        const dx = t.clientX - state.startX;
        const dy = t.clientY - state.startY;
        if (!state.moved && Math.abs(dx) + Math.abs(dy) > 6) {
          state.moved = true;
        }
        viewRef.current.x = state.startViewX + dx;
        viewRef.current.y = state.startViewY + dy;
        needsRenderRef.current = true;
      } else if (touches.length === 2 && state.ids.length === 2) {
        const t1 = touches[0];
        const t2 = touches[1];
        const dist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY
        );
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;

        if (!state.moved && Math.abs(dist - state.startDist) > 6) {
          state.moved = true;
        }

        if (state.startDist > 0) {
          const container = containerRef.current;
          const rect = container?.getBoundingClientRect();
          const rectCenterX = rect ? rect.left + rect.width / 2 : 0;
          const rectCenterY = rect ? rect.top + rect.height / 2 : 0;

          const nextZoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, state.startZoom * (dist / state.startDist))
          );

          const worldX = (midX - rectCenterX - state.startViewX) / state.startZoom;
          const worldY = (midY - rectCenterY - state.startViewY) / state.startZoom;

          viewRef.current.zoom = nextZoom;
          viewRef.current.x = midX - rectCenterX - worldX * nextZoom;
          viewRef.current.y = midY - rectCenterY - worldY * nextZoom;
          needsRenderRef.current = true;
        }
      }
    },
    []
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const state = touchRef.current;
      if (!state) return;
      needsRenderRef.current = true;

      const remaining = event.touches;
      // If we transitioned from 2 fingers to 1, reset state to avoid jumps.
      if (remaining.length === 1 && state.ids.length === 2) {
        const t = remaining[0];
        touchRef.current = {
          ids: [t.identifier],
          startX: t.clientX,
          startY: t.clientY,
          startViewX: viewRef.current.x,
          startViewY: viewRef.current.y,
          startZoom: viewRef.current.zoom,
          startDist: 0,
          moved: false,
        };
        return;
      }

      if (remaining.length === 0) {
        if (!state.moved) {
          // Treat as a tap.
          const lastTouch = event.changedTouches[0];
          if (lastTouch) {
            const hit = findNodeAt(lastTouch.clientX, lastTouch.clientY);
            if (hit) {
              onSelectionChange(getNodeIdentity(hit.node));
            } else {
              onSelectionChange(null);
            }
          }
        }
        touchRef.current = null;
      }
    },
    [findNodeAt, onSelectionChange]
  );

  // Native wheel listener with `{ passive: false }` so we can actually
  // `preventDefault()` zoom gestures and stop the outer scroll container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const view = viewRef.current;
      const deltaScale = event.ctrlKey ? 0.01 : 0.0015;
      const delta = -event.deltaY * deltaScale;
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, view.zoom * (1 + delta))
      );

      const cursorX = event.clientX - rect.left - rect.width / 2;
      const cursorY = event.clientY - rect.top - rect.height / 2;
      const worldX = (cursorX - view.x) / view.zoom;
      const worldY = (cursorY - view.y) / view.zoom;

      view.zoom = nextZoom;
      view.x = cursorX - worldX * nextZoom;
      view.y = cursorY - worldY * nextZoom;
      needsRenderRef.current = true;
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

  // --- keyboard panning/zoom ---
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container || document.activeElement !== container) return;
      const view = viewRef.current;
      const panStep = 40;
      switch (event.key) {
        case "ArrowLeft":
          view.x += panStep;
          needsRenderRef.current = true;
          event.preventDefault();
          break;
        case "ArrowRight":
          view.x -= panStep;
          needsRenderRef.current = true;
          event.preventDefault();
          break;
        case "ArrowUp":
          view.y += panStep;
          needsRenderRef.current = true;
          event.preventDefault();
          break;
        case "ArrowDown":
          view.y -= panStep;
          needsRenderRef.current = true;
          event.preventDefault();
          break;
        case "+":
        case "=":
          view.zoom = Math.min(MAX_ZOOM, view.zoom * 1.1);
          needsRenderRef.current = true;
          event.preventDefault();
          break;
        case "-":
        case "_":
          view.zoom = Math.max(MIN_ZOOM, view.zoom / 1.1);
          needsRenderRef.current = true;
          event.preventDefault();
          break;
        case "Escape":
          onSelectionChange(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelectionChange]);

  const handleZoomIn = useCallback(() => {
    const view = viewRef.current;
    view.zoom = Math.min(MAX_ZOOM, view.zoom * 1.25);
    needsRenderRef.current = true;
  }, []);

  const handleZoomOut = useCallback(() => {
    const view = viewRef.current;
    view.zoom = Math.max(MIN_ZOOM, view.zoom / 1.25);
    needsRenderRef.current = true;
  }, []);

  const handleResetView = useCallback(() => {
    viewRef.current = { x: 0, y: 0, zoom: 1 };
    needsRenderRef.current = true;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focusOn(target) {
        const datum = nodesByIdRef.current.get(target.id);
        if (!datum || datum.x === undefined || datum.y === undefined) return;
        const view = viewRef.current;
        view.x = -datum.x * view.zoom;
        view.y = -datum.y * view.zoom;
      },
      resetView() {
        viewRef.current = { x: 0, y: 0, zoom: 1 };
      },
      async animateAssign(bookmarkId, anchorId) {
        const bookmark = nodesByIdRef.current.get(bookmarkId);
        const anchor = nodesByIdRef.current.get(anchorId);
        if (!bookmark || !anchor) return;
        if (
          bookmark.x === undefined ||
          bookmark.y === undefined ||
          anchor.x === undefined ||
          anchor.y === undefined
        ) {
          return;
        }

        bookmark.assignAnimation = {
          startedAt: performance.now(),
          durationMs: 520,
          startX: bookmark.x,
          startY: bookmark.y,
          targetX: anchor.x,
          targetY: anchor.y,
        };

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 540);
        });
      },
    }),
    []
  );

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Orbit map"
      tabIndex={0}
      data-dragging={isDragging ? "true" : undefined}
      className={cn(
        "relative h-full w-full select-none overflow-hidden rounded-[28px] border border-white/10 outline-none touch-none overscroll-contain focus-visible:ring-2 focus-visible:ring-primary/60",
        className
      )}
      style={{ cursor: "grab", backgroundColor: BG_COLOR }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Zoom controls */}
      <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col gap-1.5">
        <div className="pointer-events-auto inline-flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={handleZoomIn}
            className="inline-flex h-9 w-9 items-center justify-center text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Plus className="size-4" />
          </button>
          <span className="h-px w-full bg-white/10" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={handleZoomOut}
            className="inline-flex h-9 w-9 items-center justify-center text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Minus className="size-4" />
          </button>
          <span className="h-px w-full bg-white/10" />
          <button
            type="button"
            aria-label="Reset view"
            onClick={handleResetView}
            className="inline-flex h-9 w-9 items-center justify-center text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
