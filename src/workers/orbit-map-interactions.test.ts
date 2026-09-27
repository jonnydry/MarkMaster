import { describe, expect, it, vi } from "vitest";

import {
  MainMessageType,
  WorkerMessageType,
  type OrbitMapSelection,
} from "@/lib/orbit-worker-protocol";

import { createOrbitMapInteractions } from "./orbit-map-interactions";

type TestNode = {
  id: string;
  x: number;
  y: number;
  radius: number;
  node: { kind: OrbitMapSelection["kind"] };
};

function setup(options: { canDropOnto?: (bookmarkId: string, hub: TestNode) => boolean } = {}) {
  const nodes: TestNode[] = [
    { id: "tag-a", x: 0, y: 0, radius: 20, node: { kind: "tag" } },
    { id: "tag-b", x: 200, y: 0, radius: 20, node: { kind: "tag" } },
    { id: "bm", x: 100, y: 100, radius: 4, node: { kind: "bookmark" } },
  ];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const deps = {
    hasScene: () => true,
    getNodeData: () => nodes,
    getNodeById: () => nodeById,
    getCamera: () => ({ x: 0, y: 0, zoom: 1 }),
    panBy: vi.fn(),
    getSelection: () => null,
    setSelection: vi.fn(),
    refreshNodeStyles: vi.fn(),
    postToMain: vi.fn(),
    returnNodeTo: vi.fn(),
    pulseNode: vi.fn(),
    canDropOnto: options.canDropOnto,
  };
  const interactions = createOrbitMapInteractions<TestNode>(deps);
  interactions.setHubDropTargets(nodes.filter((node) => node.node.kind === "tag"));

  const down = (x: number, y: number) =>
    interactions.handlePointerEvent({
      type: WorkerMessageType.POINTER_DOWN,
      protocolVersion: 1,
      x,
      y,
      button: 0,
    });
  const move = (x: number, y: number) =>
    interactions.handlePointerEvent({
      type: WorkerMessageType.POINTER_MOVE,
      protocolVersion: 1,
      x,
      y,
      buttons: 1,
    });
  const up = (x: number, y: number) =>
    interactions.handlePointerEvent({
      type: WorkerMessageType.POINTER_UP,
      protocolVersion: 1,
      x,
      y,
      button: 0,
    });

  const droppedMessages = () =>
    deps.postToMain.mock.calls
      .map(([msg]) => msg)
      .filter((msg) => msg.type === MainMessageType.NODE_DROPPED);

  return { deps, nodeById, down, move, up, droppedMessages };
}

describe("createOrbitMapInteractions", () => {
  it("pans instead of dragging when the press starts on a hub", () => {
    const { deps, nodeById, down, move, up } = setup();

    down(0, 0);
    move(30, 0);
    up(30, 0);

    expect(deps.panBy).toHaveBeenCalledWith(30, 0);
    expect(nodeById.get("tag-a")).toMatchObject({ x: 0, y: 0 });
    expect(deps.returnNodeTo).not.toHaveBeenCalled();
    expect(deps.setSelection).not.toHaveBeenCalled();
  });

  it("still selects a hub on a click that doesn't travel", () => {
    const { deps, down, up } = setup();

    down(0, 0);
    up(0, 0);

    expect(deps.setSelection).toHaveBeenCalledWith({ id: "tag-a", kind: "tag" });
  });

  it("drops a dragged bookmark onto an eligible hub", () => {
    const { down, move, up, droppedMessages } = setup();

    down(100, 100);
    move(150, 50);
    move(200, 0);
    up(200, 0);

    expect(droppedMessages()).toEqual([
      expect.objectContaining({
        bookmarkId: "bm",
        anchorId: "tag-b",
        anchorKind: "tag",
      }),
    ]);
  });

  it("ignores hubs the bookmark can't drop onto and glides it back", () => {
    const { deps, down, move, up, droppedMessages } = setup({
      canDropOnto: (_bookmarkId, hub) => hub.id !== "tag-a",
    });

    down(100, 100);
    move(50, 50);
    move(0, 0);
    up(0, 0);

    expect(droppedMessages()).toEqual([]);
    expect(deps.returnNodeTo).toHaveBeenCalledWith("bm", 100, 100);
  });
});
