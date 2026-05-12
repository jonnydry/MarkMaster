export const ORBIT_RECENT_PAGE_SIZE = 12;
export const ORBIT_ALL_PAGE_SIZE = 20;

export type OrbitIntent = "oldest" | "backlog";
export type OrbitView = "recent" | "all";
export type OrbitSortDirection = "asc" | "desc";

export interface BuildOrbitIntentHrefArgs {
  intent: OrbitIntent;
  orbitQueueCount: number;
  untaggedOldestAt?: string | null;
}

export interface OrbitUrlState {
  intent: OrbitIntent | null;
  view: OrbitView;
  page: number;
  sortDirection: OrbitSortDirection;
  queueCount: number | null;
  oldestAt: string | null;
  stateKey: string;
}

type SearchParamsLike = {
  get(name: string): string | null;
  toString(): string;
};

function positiveInteger(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;

  return parsed;
}

function normalizedQueueCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function parseIntent(value: string | null): OrbitIntent | null {
  return value === "oldest" || value === "backlog" ? value : null;
}

function parseView(value: string | null): OrbitView | null {
  return value === "all" || value === "recent" ? value : null;
}

export function buildOrbitIntentHref({
  intent,
  orbitQueueCount,
  untaggedOldestAt,
}: BuildOrbitIntentHrefArgs): string {
  const queueCount = normalizedQueueCount(orbitQueueCount);
  if (queueCount === 0) return "/orbit";

  const params = new URLSearchParams();
  params.set("intent", intent);
  params.set("queueCount", queueCount.toString());

  if (intent === "oldest") {
    params.set("view", "all");
    params.set("sort", "oldest");
    params.set("page", "1");

    const oldestAt = toDateOnly(untaggedOldestAt);
    if (oldestAt) {
      params.set("oldestAt", oldestAt);
    }
  } else {
    params.set(
      "view",
      queueCount > ORBIT_RECENT_PAGE_SIZE ? "all" : "recent"
    );
    params.set("sort", "newest");
    if (queueCount > ORBIT_RECENT_PAGE_SIZE) {
      params.set("page", "1");
    }
  }

  return `/orbit?${params.toString()}`;
}

export function parseOrbitUrlState(
  searchParams: SearchParamsLike | string | null | undefined
): OrbitUrlState {
  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : searchParams;

  const get = (key: string) => params?.get(key) ?? null;
  const intent = parseIntent(get("intent"));
  const queueCount = positiveInteger(get("queueCount"));
  const requestedView = parseView(get("view"));
  const oldestRequested = intent === "oldest" || get("sort") === "oldest";

  const view: OrbitView = oldestRequested
    ? "all"
    : requestedView ??
      (intent === "backlog" &&
      queueCount !== null &&
      queueCount > ORBIT_RECENT_PAGE_SIZE
        ? "all"
        : "recent");

  return {
    intent,
    view,
    page: view === "all" ? positiveInteger(get("page")) ?? 1 : 1,
    sortDirection: oldestRequested ? "asc" : "desc",
    queueCount,
    oldestAt: toDateOnly(get("oldestAt")),
    stateKey: params?.toString() ?? "",
  };
}
