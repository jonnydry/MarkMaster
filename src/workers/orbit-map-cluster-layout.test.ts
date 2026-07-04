import { describe, expect, it } from "vitest";

import {
  computeOrbitMapClusterLayout,
  getOrbitMapClusterRingRadii,
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

  it("keeps very large loose bands from creating near-overlapping bookmarks", () => {
    const looseCount = 2000;
    const nodes: OrbitMapLayoutNodeInput[] = [core()];
    for (let i = 0; i < looseCount; i++) {
      nodes.push(bookmark(`loose-${i}`));
    }

    const { positions } = computeOrbitMapClusterLayout(nodes, []);
    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < looseCount; i++) {
      const a = positions.get(`loose-${i}`)!;
      for (let j = i + 1; j < looseCount; j++) {
        const b = positions.get(`loose-${j}`)!;
        minDistance = Math.min(minDistance, dist(a, b));
      }
    }

    expect(minDistance).toBeGreaterThan(10);
  });
});

describe("orbit geometry", () => {
  it("reproduces every ring position exactly at t = 0", () => {
    const { nodes, edges } = buildFixture();
    const { positions, orbits } = computeOrbitMapClusterLayout(nodes, edges);

    for (let i = 0; i < 20; i++) {
      const orbit = orbits.get(`a-${i}`)!;
      expect(orbit).toBeDefined();
      expect(orbit.anchorId).toBe("tag-a");
      expect(orbit.ringIndex).toBeGreaterThanOrEqual(0);
      const position = positions.get(`a-${i}`)!;
      expect(orbit.centerX + Math.cos(orbit.theta) * orbit.radius).toBeCloseTo(
        position.x,
        6
      );
      expect(orbit.centerY + Math.sin(orbit.theta) * orbit.radius).toBeCloseTo(
        position.y,
        6
      );
    }
  });

  it("gives loose bookmarks a belt orbit through their relaxed position", () => {
    const { nodes, edges } = buildFixture();
    const { positions, orbits } = computeOrbitMapClusterLayout(nodes, edges);

    for (let i = 0; i < 6; i++) {
      const orbit = orbits.get(`loose-${i}`)!;
      expect(orbit).toBeDefined();
      expect(orbit.ringIndex).toBe(-1);
      expect(orbit.anchorId).toBeNull();
      expect(orbit.centerX).toBe(0);
      const position = positions.get(`loose-${i}`)!;
      expect(Math.cos(orbit.theta) * orbit.radius).toBeCloseTo(position.x, 6);
      expect(Math.sin(orbit.theta) * orbit.radius).toBeCloseTo(position.y, 6);
    }
  });

  it("gives multi-anchor bookmarks no orbit", () => {
    const { nodes, edges } = buildFixture();
    const { orbits } = computeOrbitMapClusterLayout(nodes, edges);
    for (let i = 0; i < 3; i++) {
      expect(orbits.has(`shared-${i}`)).toBe(false);
    }
  });

  it("places recent bookmarks on the innermost shells", () => {
    const { nodes, edges } = buildFixture();
    // Mark a scattered handful of tag-a members recent (fewer than one ring).
    const recentIds = new Set(["a-3", "a-8", "a-13", "a-17", "a-19"]);
    const withRecency = nodes.map((node) =>
      recentIds.has(node.id) ? { ...node, recent: true } : node
    );
    const { orbits } = computeOrbitMapClusterLayout(withRecency, edges);

    const allRadii = [];
    for (let i = 0; i < 20; i++) {
      allRadii.push(orbits.get(`a-${i}`)!.radius);
    }
    const innermost = Math.min(...allRadii);
    for (const id of recentIds) {
      expect(orbits.get(id)!.radius).toBe(innermost);
    }
  });
});

describe("getOrbitMapClusterRingRadii", () => {
  it("matches the shells bookmarks are actually placed on", () => {
    const { nodes, edges } = buildFixture();
    const { positions, clusters } = computeOrbitMapClusterLayout(nodes, edges);

    const cluster = clusters.get("tag-a")!;
    const radii = getOrbitMapClusterRingRadii(9, cluster.radius);
    expect(radii.length).toBeGreaterThan(0);

    // Every single-anchor bookmark of the cluster sits on one of the shells.
    const anchorPos = positions.get("tag-a")!;
    for (let i = 0; i < 20; i++) {
      const bookmarkPos = positions.get(`a-${i}`)!;
      const distance = dist(bookmarkPos, anchorPos);
      const onShell = radii.some((radius) => Math.abs(distance - radius) < 0.5);
      expect(onShell).toBe(true);
    }
  });

  it("returns no shells for clusters too small to hold a ring", () => {
    expect(getOrbitMapClusterRingRadii(8, 20)).toEqual([]);
  });

  it("caps the shell count for degenerate radii", () => {
    expect(getOrbitMapClusterRingRadii(8, 100000).length).toBeLessThanOrEqual(12);
  });
});
