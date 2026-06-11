import { describe, expect, it } from "vitest";

import {
  computeOrbitMapClusterLayout,
  type OrbitMapLayoutNodeInput,
} from "./orbit-map-cluster-layout";
import type { OrbitGraphEdge } from "@/types";

function core(): OrbitMapLayoutNodeInput {
  return { id: "orbit-index", kind: "core", radius: 13 };
}

function tag(id: string): OrbitMapLayoutNodeInput {
  return { id, kind: "tag", radius: 9 };
}

function bookmark(id: string): OrbitMapLayoutNodeInput {
  return { id, kind: "bookmark", radius: 5.5 };
}

function tagEdge(bookmarkId: string, tagId: string): OrbitGraphEdge {
  return { kind: "bookmark-tag", bookmarkId, tagId };
}

/** Two tags with dedicated bookmark clusters plus shared + loose bookmarks. */
function buildFixture() {
  const nodes: OrbitMapLayoutNodeInput[] = [core(), tag("tag-a"), tag("tag-b")];
  const edges: OrbitGraphEdge[] = [];

  for (let i = 0; i < 20; i++) {
    nodes.push(bookmark(`a-${i}`));
    edges.push(tagEdge(`a-${i}`, "tag-a"));
  }
  for (let i = 0; i < 14; i++) {
    nodes.push(bookmark(`b-${i}`));
    edges.push(tagEdge(`b-${i}`, "tag-b"));
  }
  // Multi-anchor bookmarks connected to both tags.
  for (let i = 0; i < 3; i++) {
    nodes.push(bookmark(`shared-${i}`));
    edges.push(tagEdge(`shared-${i}`, "tag-a"));
    edges.push(tagEdge(`shared-${i}`, "tag-b"));
  }
  // Loose bookmarks with no anchors.
  for (let i = 0; i < 6; i++) {
    nodes.push(bookmark(`loose-${i}`));
  }

  return { nodes, edges };
}

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number } = { x: 0, y: 0 }
) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("computeOrbitMapClusterLayout", () => {
  it("is deterministic: same input produces identical positions", () => {
    const { nodes, edges } = buildFixture();
    const first = computeOrbitMapClusterLayout(nodes, edges);
    const second = computeOrbitMapClusterLayout(nodes, edges);

    expect(first.positions.size).toBe(second.positions.size);
    for (const [id, position] of first.positions) {
      expect(second.positions.get(id)).toEqual(position);
    }
    expect(first.constellationRadius).toBe(second.constellationRadius);
  });

  it("places every node at a finite position, with the core at the origin", () => {
    const { nodes, edges } = buildFixture();
    const { positions } = computeOrbitMapClusterLayout(nodes, edges);

    for (const node of nodes) {
      const position = positions.get(node.id);
      expect(position).toBeDefined();
      expect(Number.isFinite(position!.x)).toBe(true);
      expect(Number.isFinite(position!.y)).toBe(true);
    }
    expect(positions.get("orbit-index")).toEqual({ x: 0, y: 0 });
  });

  it("places single-anchor bookmarks on orbit rings inside their cluster", () => {
    const { nodes, edges } = buildFixture();
    const { positions, clusters } = computeOrbitMapClusterLayout(nodes, edges);

    const cluster = clusters.get("tag-a")!;
    expect(cluster.memberCount).toBe(20);

    const anchorPosition = positions.get("tag-a")!;
    for (let i = 0; i < 20; i++) {
      const position = positions.get(`a-${i}`)!;
      const distance = dist(position, anchorPosition);
      // Outside the hub itself, inside the cluster's enclosing radius.
      expect(distance).toBeGreaterThan(9);
      expect(distance).toBeLessThanOrEqual(cluster.radius + 0.001);
    }
  });

  it("keeps anchor clusters from overlapping", () => {
    const { nodes, edges } = buildFixture();
    const { clusters } = computeOrbitMapClusterLayout(nodes, edges);

    const a = clusters.get("tag-a")!;
    const b = clusters.get("tag-b")!;
    const centerDistance = dist(a, b);
    expect(centerDistance).toBeGreaterThanOrEqual((a.radius + b.radius) * 0.9);
  });

  it("places multi-anchor bookmarks between their anchors", () => {
    const { nodes, edges } = buildFixture();
    const { positions } = computeOrbitMapClusterLayout(nodes, edges);

    const a = positions.get("tag-a")!;
    const b = positions.get("tag-b")!;
    const centroid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    for (let i = 0; i < 3; i++) {
      const position = positions.get(`shared-${i}`)!;
      // Centroid + bounded jitter + a few relax passes.
      expect(dist(position, centroid)).toBeLessThan(120);
    }
  });

  it("places loose bookmarks in a band outside the constellation", () => {
    const { nodes, edges } = buildFixture();
    const { positions, constellationRadius } = computeOrbitMapClusterLayout(
      nodes,
      edges
    );

    for (let i = 0; i < 6; i++) {
      const position = positions.get(`loose-${i}`)!;
      expect(dist(position)).toBeGreaterThan(constellationRadius);
    }
  });

  it("handles graphs with no anchors (all loose)", () => {
    const nodes: OrbitMapLayoutNodeInput[] = [
      core(),
      bookmark("loose-1"),
      bookmark("loose-2"),
    ];
    const { positions, clusters } = computeOrbitMapClusterLayout(nodes, []);

    expect(clusters.size).toBe(0);
    expect(positions.get("orbit-index")).toEqual({ x: 0, y: 0 });
    expect(dist(positions.get("loose-1")!)).toBeGreaterThan(100);
    expect(positions.get("loose-1")).not.toEqual(positions.get("loose-2"));
  });
});
