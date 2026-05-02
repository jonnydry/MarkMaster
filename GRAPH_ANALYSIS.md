# Orbit Graph — Deep-dive Analysis & Improvement Roadmap

## How it works today

### 1. Data pipeline (`/api/orbit/graph`)
- Queries **all** tags, collections, total bookmark count, and up to **1,500** most-recent bookmarks (hard cap 4,000).
- Builds a bipartite graph:
  - **Nodes:** core hub (`orbit-index`), tags, collections, bookmarks, overflow markers.
  - **Edges:** `bookmark→tag`, `bookmark→collection`, `loose bookmark→core`.
- Overflow nodes track how many bookmarks exist in a tag/collection but were truncated by the node cap.
- Returns everything in a single JSON payload (~can be large).

### 2. Force simulation (`OrbitMapCanvas`)
- **D3 force layout** with:
  - `forceLink` — different distances/strengths per edge type (loose bookmarks have very weak links to core).
  - `forceManyBody` — stronger repulsion for anchors, weak for bookmarks.
  - `forceCollide` — prevents overlap.
  - `forceCenter` — light gravity to origin.
- Nodes seeded in a random disc so first paint isn't a "violent explosion."
- Simulation stops when alpha < 0.01; render loop backs off to 120ms timeouts when idle.
- **Canvas 2D rendering** (not SVG) for performance — essential at 1,500 nodes.
- **Obsidian-style dimming:** when you hover/select a node, only that node + its 1-hop neighbors are fully bright; everything else fades to ~18% opacity.

### 3. Map page (`/orbit/map`)
- Full-screen canvas + a 300px sidebar **rail** showing details for the selected/hovered node.
- Search bar filters nodes by name/author/title.
- URL-synced selection state (`?select=` + `?kind=` + `?bookmark=`).
- Actions from the rail: **Assign** bookmark to tag/collection, open on dashboard.

### 4. Integration with Orbit queue
- Main Orbit page links to graph with deep-link params (`?focus=` + `?anchor=`).
- Mini-map drawer shows a live preview with a **pulse animation** around the predicted destination tag/collection.
- After applying a scan, the graph is invalidated and refetched.

---

## What's working well
1. **Canvas performance** — Handles 1,500 nodes smoothly.
2. **Interaction model** — Pan, zoom, touch pinch, keyboard nav, hit-testing all feel solid.
3. **Dim-the-rest highlighting** — Clean, readable focus mechanism.
4. **URL-synced selection** — Refreshing preserves your selected node.
5. **Search** — Fast client-side filtering with keyboard-navigable dropdown.
6. **Integration flow** — The graph isn't an island; it connects to triage actions.

---

## Current pain points & missed opportunities

### A. Very low information density
- **Bookmarks are anonymous dots.** You can't tell what any bookmark is about without clicking it. At any zoom level other than "very close," the graph is just a cloud of undifferentiated particles.
- **No hover preview.** In Obsidian, hovering a graph node shows a tooltip/popover with the note title. Here you get nothing — you must click and look at the rail.
- **No media thumbnails.** Bookmarks often have images; the graph ignores this rich signal entirely.

### B. No semantic clustering — it's a hairball
- The graph is **bipartite only** (bookmark ↔ tag/collection). There are **no bookmark-to-bookmark edges** even when two bookmarks share 3 tags.
- Tags that frequently co-occur aren't connected either, so there's no "topic neighborhood" effect.
- Without community structure, large libraries look like a tangled mess rather than an organized map.

### C. The overflow concept is invisible
- Overflow nodes are **filtered out of rendering entirely.** If a tag has 500 bookmarks but only 50 are rendered, you see a small dot with no visual indication of the hidden mass.
- Users get no sense of the true scale of their library from the visual alone.

### D. No filtering or view modes
- You can't say "show me only loose bookmarks" or "only bookmarks from the last 7 days."
- No multi-select tag filtering (e.g., "show only bookmarks tagged 'AI' AND 'Papers'").
- Search hides non-matches; it doesn't "dim and spotlight" them while keeping context.

### E. Layout doesn't persist
- Every reload re-seeds nodes randomly. The mental map you built last time is gone.
- No deterministic seeding, no localStorage caching of positions.

### F. Wasted temporal signal
- The API marks bookmarks as `recent` (≤14 days) but the visual doesn't use this beyond a slightly larger dot radius.
- No way to see "what's new" at a glance, or browse bookmarks chronologically in the spatial layout.

### G. Limited actionable intelligence on the graph itself
- Grok's scan suggestions exist only in the Orbit queue page. On the graph, there's **no visual indication** that a bookmark has a pending AI-suggested tag or collection.
- No "ghost edges" showing predicted moves.

### H. Mobile rail dominates
- On smaller screens the 300px rail takes up most of the viewport, leaving the canvas cramped.
- No full-screen graph mode.

---

## Recommended improvements (ranked by impact / effort)

### 1. Bookmark hover cards (High impact, Low effort)
On hover over a bookmark node, render a small floating card near the cursor with:
- Author avatar + `@username`
- Truncated tweet text (first ~120 chars)
- Tiny colored dots for its tags
- Media thumbnail if available

This turns the graph from a "mystery cloud" into a browsable surface.

### 2. Add bookmark-to-bookmark edges (High impact, Medium effort)
When two bookmarks share ≥2 tags (or 1 collection), draw a very faint edge between them (`stroke-opacity: 0.06`, thin line). Use a much weaker link force than tag edges.

**Effect:** Related bookmarks naturally clump together. Topic clusters emerge organically without any backend changes.

### 3. Persist layout with deterministic seeding (Medium impact, Low effort)
- Hash the bookmark ID into a fixed angle + radius for initial seeding, instead of `Math.random()`.
- Cache `{nodeId: {x, y}}` in `localStorage` after the simulation cools. On reload, restore positions for existing nodes and only seed new ones.

**Effect:** The graph becomes a stable, learnable space.

### 4. Visual overflow indicators (Medium impact, Low effort)
- Instead of filtering out overflow nodes, render them as a **halo ring** or **badge count** around the anchor node.
- Example: a tag dot with `+450` in a small pill next to it.
- Or vary anchor node opacity/size based on total vs. rendered count.

### 5. Filter controls toolbar (Medium impact, Medium effort)
Add a small floating toolbar above the canvas:
- **Toggle:** "Loose only" — hides all affiliated bookmarks and tag/collection anchors except core.
- **Toggle:** "Recent only" — dims bookmarks older than 14 days.
- **Toggle:** "Show ghost suggestions" — renders pending Grok suggestions as dashed edges.
- **Time slider:** Filter bookmarks by `bookmarkedAt` range.

### 6. Tag-to-tag co-occurrence edges (Medium impact, Medium effort)
On the backend, compute tag co-occurrence counts (how many bookmarks share both tags). Add `tag-tag` edges when co-occurrence ≥ some threshold.

**Effect:** Tags form constellations. You can see that "AI" and "ML" are close, or that "React" and "Next.js" cluster together.

### 7. Community detection + cluster coloring (High impact, High effort)
- Run a lightweight community detection algorithm (e.g., Louvain) on the backend over the graph edges.
- Assign each bookmark/tag a cluster ID. Color nodes softly by cluster.
- This is the single biggest readability win for large libraries.

### 8. Level-of-detail zoom rendering (High impact, High effort)
- At zoom < 0.5, group nearby bookmarks into **heat-map blobs** or draw convex hulls around tag clusters.
- At zoom > 1.5, reveal bookmark text labels.
- This mimics how Google Maps works — you don't see every building until you're close.

### 9. Bookmark media thumbnails (Medium impact, Medium effort)
- At zoom > 1.2, draw a tiny 20×20 thumbnail (from `bookmark.media[0]`) instead of a plain dot for bookmarks that have media.
- Makes the graph instantly more visual and scannable.

### 10. Full-screen graph mode (Low impact, Low effort)
- Add a full-screen button that hides the rail and maximizes the canvas.
- Especially useful on mobile and smaller laptops.

---

## Quick-win priority order

If you want maximum user value with minimal engineering:

1. **Hover cards** — immediately makes the graph useful.
2. **Deterministic layout seeding** — makes it feel stable.
3. **Bookmark-to-bookmark edges** — makes clusters appear "for free."
4. **Filter toggles** (loose only, recent only) — solves real user tasks.
5. **Overflow halos** — fixes the "where is everything?" confusion.

These five together would transform the graph from a decorative visualization into a genuine browsing and triage tool.
