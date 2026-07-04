export type GridBookmarkPosition = {
  id: string;
  top: number;
  left: number;
};

const GRID_COLUMN_X_TOLERANCE_PX = 40;

function clusterGridColumns(
  cards: readonly GridBookmarkPosition[],
  columnTolerance = GRID_COLUMN_X_TOLERANCE_PX
): GridBookmarkPosition[][] {
  const columns: GridBookmarkPosition[][] = [];
  const sortedByLeft = [...cards].sort(
    (a, b) => a.left - b.left || a.top - b.top
  );

  for (const card of sortedByLeft) {
    const column = columns.find(
      (existing) =>
        Math.abs(existing[0].left - card.left) <= columnTolerance
    );
    if (column) {
      column.push(card);
    } else {
      columns.push([card]);
    }
  }

  columns.sort((a, b) => a[0].left - b[0].left);
  for (const column of columns) {
    column.sort((a, b) => a.top - b.top);
  }

  return columns;
}

/** Row-major reading order for CSS-column masonry (left-to-right, then down). */
export function sortGridBookmarksRowMajor(
  cards: readonly GridBookmarkPosition[]
): string[] {
  if (cards.length === 0) return [];

  const columns = clusterGridColumns(cards);
  const maxRows = Math.max(...columns.map((column) => column.length), 0);
  const orderedIds: string[] = [];

  for (let row = 0; row < maxRows; row += 1) {
    for (const column of columns) {
      const card = column[row];
      if (card) orderedIds.push(card.id);
    }
  }

  return orderedIds;
}

export function offsetInVisualOrder(
  orderedIds: readonly string[],
  currentId: string | null,
  offset: -1 | 1
): string | null {
  if (orderedIds.length === 0) return null;

  const currentIndex = currentId ? orderedIds.indexOf(currentId) : -1;
  const nextIndex =
    currentIndex === -1
      ? 0
      : Math.max(0, Math.min(orderedIds.length - 1, currentIndex + offset));

  return orderedIds[nextIndex] ?? null;
}

export function getGridBookmarkIdsInVisualOrder(): string[] {
  if (typeof document === "undefined") return [];

  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-grid-bookmark-card]")
  );

  const positions = cards
    .map((element) => {
      const id =
        element.getAttribute("data-dashboard-bookmark-id") ??
        element.getAttribute("data-grid-bookmark-card");
      if (!id) return null;

      const rect = element.getBoundingClientRect();
      return { id, top: rect.top, left: rect.left };
    })
    .filter((position): position is GridBookmarkPosition => position !== null);

  return sortGridBookmarksRowMajor(positions);
}

export function resolveBookmarkNavigationId(options: {
  layout: "list" | "grid";
  bookmarkIds: readonly string[];
  currentId: string | null;
  offset: -1 | 1;
}): string | null {
  const { layout, bookmarkIds, currentId, offset } = options;
  if (bookmarkIds.length === 0) return null;

  if (layout === "grid") {
    const visualOrder = getGridBookmarkIdsInVisualOrder().filter((id) =>
      bookmarkIds.includes(id)
    );
    const orderedIds =
      visualOrder.length > 0
        ? visualOrder
        : bookmarkIds.filter((id): id is string => Boolean(id));
    return offsetInVisualOrder(orderedIds, currentId, offset);
  }

  const currentIndex = currentId
    ? bookmarkIds.findIndex((id) => id === currentId)
    : -1;
  const nextIndex =
    currentIndex === -1
      ? 0
      : Math.max(0, Math.min(bookmarkIds.length - 1, currentIndex + offset));

  return bookmarkIds[nextIndex] ?? null;
}
