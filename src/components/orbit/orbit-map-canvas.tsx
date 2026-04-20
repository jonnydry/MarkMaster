"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import { cn } from "@/lib/utils";
import type {
  OrbitGraphEdge,
  OrbitGraphNode,
  OrbitGraphPayload,
} from "@/types";

export type OrbitMapPreset = "orbit" | "recent" | "category";

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
  preset: OrbitMapPreset;
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
  pinned?: boolean;
  anchorAngle?: number;
  assignAnimation?: {
    startedAt: number;
    durationMs: number;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    controlX: number;
    controlY: number;
  };
};

type LinkDatum = SimulationLinkDatum<NodeDatum> & {
  edge: OrbitGraphEdge;
  kind: OrbitGraphEdge["kind"];
};

const DPR_CAP = 2;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.75;

function getNodeRadius(node: OrbitGraphNode): number {
  switch (node.kind) {
    case "core":
      return 58;
    case "tag":
      return 28 + Math.min(Math.sqrt(node.count) * 3.2, 26);
    case "collection":
      return 30 + Math.min(Math.sqrt(node.count) * 3.4, 30);
    case "bookmark":
      return node.recent ? 5.2 : 4.2;
    case "overflow":
      return 14;
    default:
      node satisfies never;
      return 6;
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

function sameSelection(
  a: OrbitMapSelection | null,
  b: OrbitMapSelection | null
) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

function mixColor(hex: string, mix: number) {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return hex;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const blend = (c: number) => Math.round(c * (1 - mix) + 255 * mix);
  return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
}

function withAlpha(hex: string, alpha: number) {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return hex;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function normalizeLinkEndpoint(
  value: NodeDatum | string | number | undefined
): NodeDatum | null {
  if (!value) return null;
  if (typeof value === "object") return value as NodeDatum;
  return null;
}

export const OrbitMapCanvas = forwardRef<
  OrbitMapCanvasHandle,
  OrbitMapCanvasProps
>(function OrbitMapCanvas(
  {
    data,
    preset,
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

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 });
  const hoverRef = useRef<NodeDatum | null>(null);
  const selectionRef = useRef<OrbitMapSelection | null>(selection);
  const presetRef = useRef<OrbitMapPreset>(preset);
  const focusRef = useRef<OrbitMapFocus | null>(focus ?? null);
  const isDraggingRef = useRef<{ x: number; y: number; moved: boolean } | null>(
    null
  );
  const visibleRef = useRef<boolean>(true);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    focusRef.current = focus ?? null;
  }, [focus]);

  // --- build nodes + links + simulation when data changes ---
  useEffect(() => {
    const prevById = nodesByIdRef.current;

    const nextNodes: NodeDatum[] = data.nodes.map((node) => {
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

    const nextLinks: LinkDatum[] = data.edges.flatMap((edge) => {
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
          sourceId = edge.overflowId;
          targetId = edge.anchorId;
          break;
        default:
          edge satisfies never;
      }

      if (!sourceId || !targetId) return [];
      const source = nextById.get(sourceId);
      const target = nextById.get(targetId);
      if (!source || !target) return [];

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

    // Seed initial positions for anchors (core, tags, collections) using a
    // radial layout so the first paint looks orbital before the simulation
    // settles.
    const ringAnchors: NodeDatum[] = [];
    for (const node of nextNodes) {
      if (node.node.kind === "core") {
        if (node.x === undefined || node.y === undefined) {
          node.x = 0;
          node.y = 0;
        }
        continue;
      }
      if (node.node.kind === "tag" || node.node.kind === "collection") {
        ringAnchors.push(node);
      }
    }
    const anchorCount = ringAnchors.length;
    ringAnchors.forEach((anchor, anchorIndex) => {
      const anchorNode = anchor.node;
      if (anchorNode.kind !== "tag" && anchorNode.kind !== "collection") {
        return;
      }
      const angle =
        anchor.anchorAngle ??
        (anchorCount > 0 ? (anchorIndex / anchorCount) * Math.PI * 2 : 0);
      anchor.anchorAngle = angle;
      if (anchor.x === undefined || anchor.y === undefined) {
        let ring: number;
        if (anchorNode.kind === "tag") {
          ring = 240;
        } else if (anchorNode.variant === "x_folder") {
          ring = 380;
        } else {
          ring = 320;
        }
        anchor.x = Math.cos(angle) * ring;
        anchor.y = Math.sin(angle) * ring;
      }
    });

    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const simulation = forceSimulation<NodeDatum, LinkDatum>(nextNodes)
      .alphaDecay(0.02)
      .velocityDecay(0.32)
      .force(
        "link",
        forceLink<NodeDatum, LinkDatum>(nextLinks)
          .id((node) => node.node.id)
          .distance((link) => {
            switch (link.kind) {
              case "bookmark-tag":
                return 80;
              case "bookmark-collection":
                return 95;
              case "loose":
                return 260;
              case "overflow":
                return 32;
              default:
                return 100;
            }
          })
          .strength((link) => {
            switch (link.kind) {
              case "bookmark-tag":
                return 0.55;
              case "bookmark-collection":
                return 0.5;
              case "loose":
                return 0.015;
              case "overflow":
                return 0.7;
              default:
                return 0.1;
            }
          })
      )
      .force(
        "charge",
        forceManyBody<NodeDatum>().strength((node) => {
          switch (node.node.kind) {
            case "core":
              return -900;
            case "tag":
            case "collection":
              return -480;
            case "overflow":
              return -120;
            default:
              return -28;
          }
        })
      )
      .force(
        "collide",
        forceCollide<NodeDatum>().radius((node) => node.radius + 4).strength(0.85)
      )
      .force("center", forceCenter(0, 0).strength(0.04))
      .force(
        "radial",
        forceRadial<NodeDatum>(
          (node) => {
            switch (node.node.kind) {
              case "core":
                return 0;
              case "tag":
                return 260;
              case "collection":
                return node.node.variant === "x_folder" ? 400 : 330;
              case "bookmark":
                return node.node.affiliated ? 180 : 520;
              case "overflow":
                return 40;
              default:
                return 300;
            }
          },
          0,
          0
        ).strength((node) => {
          switch (node.node.kind) {
            case "core":
              return 1;
            case "tag":
            case "collection":
              return 0.35;
            case "bookmark":
              return node.node.affiliated ? 0.04 : 0.12;
            case "overflow":
              return 0.9;
            default:
              return 0.05;
          }
        })
      );

    // Pin the core to the origin so the rest of the graph truly "orbits".
    const core = nextById.get("orbit-index");
    if (core) {
      core.fx = 0;
      core.fy = 0;
    }

    simulationRef.current = simulation;
    simulation.alpha(0.9).restart();

    return () => {
      simulation.stop();
    };
  }, [data]);

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
      visibleRef.current = !document.hidden;
      if (!document.hidden && simulationRef.current) {
        simulationRef.current.alpha(Math.max(simulationRef.current.alpha(), 0.08)).restart();
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

    const render = () => {
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const now = performance.now();

      // Animate "rocket arc" assignments.
      for (const node of nodes) {
        const animation = node.assignAnimation;
        if (!animation) continue;
        const t = Math.min(
          (now - animation.startedAt) / animation.durationMs,
          1
        );
        const eased = easeInOutCubic(t);
        const oneMinus = 1 - eased;
        const x =
          oneMinus * oneMinus * animation.startX +
          2 * oneMinus * eased * animation.controlX +
          eased * eased * animation.targetX;
        const y =
          oneMinus * oneMinus * animation.startY +
          2 * oneMinus * eased * animation.controlY +
          eased * eased * animation.targetY;
        node.fx = x;
        node.fy = y;
        node.x = x;
        node.y = y;
        if (t >= 1) {
          node.fx = undefined;
          node.fy = undefined;
          node.assignAnimation = undefined;
          if (simulationRef.current) {
            simulationRef.current.alpha(0.25).restart();
          }
        }
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background.
      const gradient = ctx.createRadialGradient(
        size.width / 2,
        size.height / 2,
        0,
        size.width / 2,
        size.height / 2,
        Math.max(size.width, size.height) / 1.2
      );
      gradient.addColorStop(0, "rgba(20, 32, 62, 0.9)");
      gradient.addColorStop(0.5, "rgba(10, 15, 29, 0.98)");
      gradient.addColorStop(1, "rgba(5, 8, 18, 1)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size.width, size.height);

      const view = viewRef.current;
      ctx.translate(size.width / 2 + view.x, size.height / 2 + view.y);
      ctx.scale(view.zoom, view.zoom);

      // Decorative orbit rings around core.
      ctx.lineWidth = 1 / view.zoom;
      ctx.strokeStyle = "rgba(148, 197, 255, 0.08)";
      for (const radius of [200, 320, 440, 560]) {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      const selectionNow = selectionRef.current;
      const hoverNow = hoverRef.current;

      // Collect bookmark ids affiliated with the focused anchor (if any) so
      // we can brighten them while fading everyone else.
      let focusAnchorId: string | null = null;
      if (selectionNow?.kind === "tag" || selectionNow?.kind === "collection") {
        focusAnchorId = selectionNow.id;
      } else if (
        hoverNow &&
        (hoverNow.node.kind === "tag" || hoverNow.node.kind === "collection")
      ) {
        focusAnchorId = hoverNow.node.id;
      }

      const highlightedBookmarkIds = new Set<string>();
      if (focusAnchorId) {
        for (const link of links) {
          const source = normalizeLinkEndpoint(link.source);
          const target = normalizeLinkEndpoint(link.target);
          if (!source || !target) continue;
          if (
            (source.node.id === focusAnchorId &&
              target.node.kind === "bookmark") ||
            (target.node.id === focusAnchorId &&
              source.node.kind === "bookmark")
          ) {
            const bookmarkNode =
              source.node.kind === "bookmark" ? source : target;
            highlightedBookmarkIds.add(bookmarkNode.node.id);
          }
        }
      }

      // Draw links.
      for (const link of links) {
        const source = normalizeLinkEndpoint(link.source);
        const target = normalizeLinkEndpoint(link.target);
        if (!source || !target) continue;
        if (source.x === undefined || source.y === undefined) continue;
        if (target.x === undefined || target.y === undefined) continue;

        let alpha = 0.1;
        let color = "rgba(148, 197, 255, 1)";

        switch (link.kind) {
          case "bookmark-tag": {
            const tagNode = target.node.kind === "tag" ? target.node : source.node;
            if (tagNode.kind === "tag") {
              color = tagNode.color;
            }
            alpha = 0.16;
            break;
          }
          case "bookmark-collection":
            color = "rgba(96, 165, 250, 1)";
            alpha = 0.18;
            break;
          case "loose":
            color = "rgba(148, 197, 255, 1)";
            alpha = 0.05;
            break;
          case "overflow":
            color = "rgba(148, 197, 255, 1)";
            alpha = 0.15;
            break;
        }

        if (focusAnchorId) {
          const touchesFocus =
            source.node.id === focusAnchorId ||
            target.node.id === focusAnchorId;
          alpha = touchesFocus ? Math.max(alpha, 0.55) : alpha * 0.25;
        }

        const [r, g, b] = color.startsWith("#")
          ? [
              parseInt(color.slice(1, 3), 16),
              parseInt(color.slice(3, 5), 16),
              parseInt(color.slice(5, 7), 16),
            ]
          : (color.match(/\d+/g) ?? ["148", "197", "255"]).map((value) =>
              Number(value)
            );

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = (link.kind === "overflow" ? 1.4 : 1) / view.zoom;

        // Gently curve the line so the whole field reads as orbital arcs.
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const curvature = 0.08;
        const controlX = midX + -dy * curvature;
        const controlY = midY + dx * curvature;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
        ctx.stroke();
      }

      // Draw bookmark + overflow nodes first so anchors sit on top.
      for (const datum of nodes) {
        if (datum.x === undefined || datum.y === undefined) continue;
        if (datum.node.kind !== "bookmark" && datum.node.kind !== "overflow") {
          continue;
        }

        const isHovered = hoverNow === datum;
        const isSelected = sameSelection(
          selectionNow,
          getNodeIdentity(datum.node)
        );
        const fade =
          focusAnchorId && !highlightedBookmarkIds.has(datum.node.id) && !isSelected
            ? 0.25
            : 1;

        if (datum.node.kind === "bookmark") {
          const glow = datum.node.recent || !datum.node.affiliated;
          const baseColor = datum.node.affiliated
            ? "148, 197, 255"
            : "125, 211, 252";

          if (glow) {
            ctx.beginPath();
            ctx.fillStyle = `rgba(${baseColor}, ${0.12 * fade})`;
            ctx.arc(datum.x, datum.y, datum.radius + 4, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.beginPath();
          ctx.fillStyle = `rgba(${baseColor}, ${(isSelected || isHovered ? 0.95 : 0.75) * fade})`;
          ctx.arc(datum.x, datum.y, datum.radius, 0, Math.PI * 2);
          ctx.fill();

          if (!datum.node.affiliated) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(96, 165, 250, ${0.85 * fade})`;
            ctx.lineWidth = 1 / view.zoom;
            ctx.arc(datum.x, datum.y, datum.radius + 1.6, 0, Math.PI * 2);
            ctx.stroke();
          }

          if (isSelected) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
            ctx.lineWidth = 1.6 / view.zoom;
            ctx.arc(datum.x, datum.y, datum.radius + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          const remaining = datum.node.kind === "overflow" ? datum.node.remaining : 0;
          ctx.beginPath();
          ctx.fillStyle = `rgba(148, 197, 255, ${0.12 * fade})`;
          ctx.arc(datum.x, datum.y, datum.radius + 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = `rgba(148, 197, 255, ${0.25 * fade})`;
          ctx.arc(datum.x, datum.y, datum.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(226, 240, 255, ${0.95 * fade})`;
          ctx.font = `${11 / view.zoom}px 'IBM Plex Mono', ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            remaining > 99 ? "99+" : `+${remaining}`,
            datum.x,
            datum.y
          );
        }
      }

      // Draw anchor cards (core, tags, collections).
      for (const datum of nodes) {
        if (datum.x === undefined || datum.y === undefined) continue;
        if (
          datum.node.kind !== "core" &&
          datum.node.kind !== "tag" &&
          datum.node.kind !== "collection"
        ) {
          continue;
        }

        const isHovered = hoverNow === datum;
        const isSelected = sameSelection(
          selectionNow,
          getNodeIdentity(datum.node)
        );
        const emphasized = isHovered || isSelected;

        if (datum.node.kind === "core") {
          ctx.beginPath();
          const coreGradient = ctx.createRadialGradient(
            datum.x,
            datum.y,
            0,
            datum.x,
            datum.y,
            datum.radius + 40
          );
          coreGradient.addColorStop(0, "rgba(96, 165, 250, 0.55)");
          coreGradient.addColorStop(0.6, "rgba(37, 99, 235, 0.12)");
          coreGradient.addColorStop(1, "rgba(37, 99, 235, 0)");
          ctx.fillStyle = coreGradient;
          ctx.arc(datum.x, datum.y, datum.radius + 40, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.fillStyle = "rgba(17, 27, 51, 0.92)";
          ctx.strokeStyle = emphasized
            ? "rgba(191, 219, 254, 0.95)"
            : "rgba(96, 165, 250, 0.65)";
          ctx.lineWidth = 1.4 / view.zoom;
          ctx.arc(datum.x, datum.y, datum.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "rgba(226, 240, 255, 0.72)";
          ctx.font = `${10 / view.zoom}px 'IBM Plex Mono', ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("CORE GRAPH", datum.x, datum.y - 8);
          ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
          ctx.font = `600 ${15 / view.zoom}px 'Sora', system-ui, sans-serif`;
          ctx.fillText("Orbit index", datum.x, datum.y + 10);
          continue;
        }

        // Pill anchor for tags / collections.
        const eyebrow =
          datum.node.kind === "tag"
            ? "TAG CLUSTER"
            : datum.node.variant === "x_folder"
              ? "X FOLDER"
              : "COLLECTION";
        const label =
          datum.node.kind === "tag" ? datum.node.name : datum.node.name;
        const accent =
          datum.node.kind === "tag"
            ? datum.node.color
            : datum.node.variant === "x_folder"
              ? "#38bdf8"
              : "#60a5fa";

        ctx.font = `600 ${13 / view.zoom}px 'Sora', system-ui, sans-serif`;
        const labelWidth = ctx.measureText(label).width;
        const paddingX = 14 / view.zoom;
        const paddingY = 10 / view.zoom;
        const width = Math.max(labelWidth + paddingX * 2, 120 / view.zoom);
        const height = 44 / view.zoom;
        const x = datum.x - width / 2;
        const y = datum.y - height / 2;
        const radius = 14 / view.zoom;

        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();

        ctx.fillStyle = emphasized
          ? "rgba(26, 38, 66, 0.96)"
          : "rgba(18, 26, 48, 0.9)";
        ctx.fill();
        ctx.lineWidth = 1.2 / view.zoom;
        ctx.strokeStyle = emphasized
          ? mixColor(accent, 0.25)
          : withAlpha(accent, 0.45);
        ctx.stroke();

        ctx.fillStyle = "rgba(226, 240, 255, 0.55)";
        ctx.font = `${9 / view.zoom}px 'IBM Plex Mono', ui-monospace, monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(eyebrow, x + paddingX, y + paddingY + 1);

        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.font = `600 ${13 / view.zoom}px 'Sora', system-ui, sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(label, x + paddingX, y + height - paddingY);

        // Small accent dot.
        ctx.beginPath();
        ctx.fillStyle = accent;
        ctx.arc(
          x + width - paddingX,
          y + paddingY + 1,
          3 / view.zoom,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Focus pulse: when a bookmark has a predicted destination, pulse the
      // anchor and draw a dotted arc from the bookmark to that anchor. Drives
      // the "suggestions pulse in the map" journey state.
      const focusNow = focusRef.current;
      if (focusNow) {
        const bookmark = nodesByIdRef.current.get(focusNow.bookmarkId);
        const anchor = nodesByIdRef.current.get(focusNow.predictedAnchorId);

        if (
          anchor &&
          anchor.x !== undefined &&
          anchor.y !== undefined
        ) {
          const phase = (now / 900) % 1;
          const pulseRadius = anchor.radius + 8 + phase * 28;
          const pulseAlpha = 0.55 * (1 - phase);

          ctx.beginPath();
          ctx.strokeStyle = `rgba(191, 219, 254, ${pulseAlpha})`;
          ctx.lineWidth = 2 / view.zoom;
          ctx.arc(anchor.x, anchor.y, pulseRadius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.strokeStyle = "rgba(147, 197, 253, 0.85)";
          ctx.lineWidth = 1.8 / view.zoom;
          ctx.arc(anchor.x, anchor.y, anchor.radius + 6, 0, Math.PI * 2);
          ctx.stroke();

          if (
            bookmark &&
            bookmark.x !== undefined &&
            bookmark.y !== undefined
          ) {
            const dx = anchor.x - bookmark.x;
            const dy = anchor.y - bookmark.y;
            const midX = (bookmark.x + anchor.x) / 2;
            const midY = (bookmark.y + anchor.y) / 2;
            const controlX = midX + -dy * 0.25;
            const controlY = midY + dx * 0.25;

            ctx.save();
            ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
            ctx.strokeStyle = "rgba(147, 197, 253, 0.7)";
            ctx.lineWidth = 1.4 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(bookmark.x, bookmark.y);
            ctx.quadraticCurveTo(controlX, controlY, anchor.x, anchor.y);
            ctx.stroke();
            ctx.restore();

            // Travelling highlight along the arc — reads as a small orbiting
            // spark.
            const t = phase;
            const oneMinus = 1 - t;
            const travelX =
              oneMinus * oneMinus * bookmark.x +
              2 * oneMinus * t * controlX +
              t * t * anchor.x;
            const travelY =
              oneMinus * oneMinus * bookmark.y +
              2 * oneMinus * t * controlY +
              t * t * anchor.y;

            ctx.beginPath();
            ctx.fillStyle = "rgba(191, 219, 254, 0.95)";
            ctx.arc(travelX, travelY, 2.6 / view.zoom, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
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

      // Iterate in reverse so anchors (drawn last) get priority.
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i];
        if (node.x === undefined || node.y === undefined) continue;
        const dx = localX - node.x;
        const dy = localY - node.y;
        const hitRadius =
          node.node.kind === "tag" || node.node.kind === "collection"
            ? Math.max(node.radius, 36)
            : node.radius + 2;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          return node;
        }
      }
      return null;
    },
    []
  );

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    isDraggingRef.current = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const drag = isDraggingRef.current;
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          drag.moved = true;
          viewRef.current.x += dx;
          viewRef.current.y += dy;
          drag.x = event.clientX;
          drag.y = event.clientY;
        }
        return;
      }

      const hovered = findNodeAt(event.clientX, event.clientY);
      if (hovered !== hoverRef.current) {
        hoverRef.current = hovered;
        if (onHoverChange) {
          onHoverChange(hovered ? getNodeIdentity(hovered.node) : null);
        }
      }
    },
    [findNodeAt, onHoverChange]
  );

  const handleMouseUp = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const drag = isDraggingRef.current;
      isDraggingRef.current = null;
      setIsDragging(false);
      if (drag && !drag.moved) {
        const hit = findNodeAt(event.clientX, event.clientY);
        if (hit) {
          onSelectionChange(getNodeIdentity(hit.node));
        } else {
          onSelectionChange(null);
        }
      }
    },
    [findNodeAt, onSelectionChange]
  );

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = null;
    setIsDragging(false);
    if (hoverRef.current) {
      hoverRef.current = null;
      onHoverChange?.(null);
    }
  }, [onHoverChange]);

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const hit = findNodeAt(event.clientX, event.clientY);
      if (hit && hit.node.kind === "bookmark" && onOpenBookmark) {
        onOpenBookmark(hit.node.id);
      }
    },
    [findNodeAt, onOpenBookmark]
  );

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const view = viewRef.current;
    const delta = -event.deltaY * 0.0015;
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
          event.preventDefault();
          break;
        case "ArrowRight":
          view.x -= panStep;
          event.preventDefault();
          break;
        case "ArrowUp":
          view.y += panStep;
          event.preventDefault();
          break;
        case "ArrowDown":
          view.y -= panStep;
          event.preventDefault();
          break;
        case "+":
        case "=":
          view.zoom = Math.min(MAX_ZOOM, view.zoom * 1.1);
          event.preventDefault();
          break;
        case "-":
        case "_":
          view.zoom = Math.max(MIN_ZOOM, view.zoom / 1.1);
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

  // --- preset camera ---
  useEffect(() => {
    const view = viewRef.current;
    switch (preset) {
      case "orbit":
        view.x = 0;
        view.y = 0;
        view.zoom = 1;
        break;
      case "recent":
        view.x = 0;
        view.y = size.height * 0.18;
        view.zoom = 1.25;
        break;
      case "category":
        view.x = 0;
        view.y = 0;
        view.zoom = 0.7;
        break;
    }
  }, [preset, size.height]);

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

        const dx = anchor.x - bookmark.x;
        const dy = anchor.y - bookmark.y;
        const midX = (bookmark.x + anchor.x) / 2;
        const midY = (bookmark.y + anchor.y) / 2;
        const controlX = midX + -dy * 0.35;
        const controlY = midY + dx * 0.35;

        bookmark.assignAnimation = {
          startedAt: performance.now(),
          durationMs: 650,
          startX: bookmark.x,
          startY: bookmark.y,
          targetX: anchor.x,
          targetY: anchor.y,
          controlX,
          controlY,
        };

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 680);
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
      className={cn(
        "relative h-full w-full select-none overflow-hidden rounded-[28px] border border-white/10 bg-[#070b1a] outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        isDragging ? "cursor-grabbing" : "cursor-grab",
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
});
