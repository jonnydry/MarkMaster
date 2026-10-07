#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  BLOCKED_HOSTS,
  SESSION_MAX_AGE,
  readState,
  refreshFixture,
} from "./lib.mjs";
import {
  COLLECTION_BOOKMARK,
  COLLECTION_NAME,
  FEED_BOOKMARK,
  HIGHLIGHTS,
  NOTE_TEXT,
  TAG_DESIGN,
  TAG_RESEARCH,
} from "../../../../scripts/verify-fixture.mjs";

const VIEWPORTS = [
  { id: "desktop", width: 1280, height: 800, touch: false },
  { id: "mobile-375", width: 375, height: 812, touch: true },
  { id: "mobile-390", width: 390, height: 844, touch: true },
];

const RENAMED_TAG = "Field notes";

const FEATURES = [
  "dashboard-feed",
  "collections",
  "orbit",
  "bookmark-card",
  "settings-tags",
  "tag-audit",
];

const args = process.argv.slice(2);
const onlyFeature = flag("--feature") ?? "all";
const onlyViewport = flag("--viewport") ?? "all";

const state = readState();
if (!state || state.stopped || !state.appOrigin) {
  console.error("No running verify instance.");
  console.error("Fix: node .cursor/skills/verify-markmaster/bin/launch.mjs");
  process.exit(1);
}

const features = onlyFeature === "all" ? FEATURES : [onlyFeature];
const viewports = onlyViewport === "all" ? VIEWPORTS : VIEWPORTS.filter((item) => item.id === onlyViewport);
if (viewports.length === 0 || features.some((name) => !FEATURES.includes(name))) {
  console.error("Unknown feature or viewport.");
  console.error(`Features: ${FEATURES.join(", ")}`);
  console.error(`Viewports: ${VIEWPORTS.map((item) => item.id).join(", ")}`);
  process.exit(1);
}

const summary = {
  runId: state.runId,
  origin: state.appOrigin,
  results: [],
};
const externalHits = [];

mkdirSync(state.evidenceDir, { recursive: true });

for (const viewport of viewports) {
  const fresh = await refreshFixture(readState());
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.touch,
    isMobile: viewport.touch,
    deviceScaleFactor: viewport.touch ? 2 : 1,
  });
  await context.addCookies(
    fresh.sessionCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: fresh.appOrigin,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    }))
  );
  await context.addInitScript(() => {
    localStorage.setItem("markmaster-sidebar-expanded", "true");
    localStorage.setItem("markmaster-discovery-hidden", "false");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  const bucket = createBucket(page, viewport.id);

  for (const feature of features) {
    const dir = path.join(state.evidenceDir, viewport.id);
    mkdirSync(dir, { recursive: true });
    bucket.reset();
    let ok = false;
    let detail = "";
    try {
      detail = await runFeature(page, fresh.appOrigin, feature, dir);
      const measure = await measureScroll(page);
      writeFileSync(
        path.join(dir, `${feature}.measure.json`),
        `${JSON.stringify(measure, null, 2)}\n`
      );
      if (!measure.ok) {
        throw new Error(
          `Horizontal scroll: scrollWidth ${measure.scrollWidth} > innerWidth ${measure.innerWidth}`
        );
      }
      const noisy = bucket.consoleErrors.filter((line) => !isBlockedNoise(line));
      if (noisy.length > 0) {
        throw new Error(`Console errors: ${noisy.slice(0, 3).join(" | ")}`);
      }
      if (bucket.pageErrors.length > 0) {
        throw new Error(`Page error: ${bucket.pageErrors[0]}`);
      }
      const serverErrors = bucket.httpErrors.filter((line) => /^5\d\d /.test(line));
      if (serverErrors.length > 0) {
        throw new Error(`HTTP ${serverErrors[0]}`);
      }
      ok = true;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
      try {
        await page.screenshot({ path: path.join(dir, `${feature}-failed.png`) });
      } catch {
        /* page may already be closed */
      }
    }
    writeFileSync(
      path.join(dir, `${feature}.console.json`),
      `${JSON.stringify({ console: bucket.consoleErrors, page: bucket.pageErrors }, null, 2)}\n`
    );
    writeFileSync(
      path.join(dir, `${feature}.network.json`),
      `${JSON.stringify({ blocked: bucket.blocked, http: bucket.httpErrors }, null, 2)}\n`
    );
    externalHits.push(...bucket.externalResponses);
    summary.results.push({ viewport: viewport.id, feature, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${viewport.id} ${feature}${ok ? "" : `: ${detail}`}`);
  }

  await browser.close();
}

const serverLog = readServerLog(state.nextLog);
summary.serverExternal = serverLog;
if (serverLog.length > 0) {
  summary.results.push({
    viewport: "server",
    feature: "external-calls",
    ok: false,
    detail: serverLog.slice(0, 3).join(" | "),
  });
}
if (externalHits.length > 0) {
  summary.results.push({
    viewport: "browser",
    feature: "external-calls",
    ok: false,
    detail: externalHits.slice(0, 3).join(" | "),
  });
}

writeFileSync(path.join(state.evidenceDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
const failed = summary.results.filter((item) => !item.ok);
console.log(`Summary ${path.join(state.evidenceDir, "summary.json")}`);
console.log(`${summary.results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);

function flag(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function createBucket(page, viewportId) {
  const bucket = {
    consoleErrors: [],
    pageErrors: [],
    blocked: [],
    httpErrors: [],
    externalResponses: [],
    reset() {
      this.consoleErrors = [];
      this.pageErrors = [];
      this.blocked = [];
      this.httpErrors = [];
    },
  };
  page.on("console", (message) => {
    if (message.type() === "error") bucket.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    bucket.pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    const url = response.url();
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      return;
    }
    if (isExternalHost(host)) {
      bucket.externalResponses.push(`${response.status()} ${url}`);
    }
    if (response.status() >= 400 && host === "127.0.0.1") {
      bucket.httpErrors.push(`${response.status()} ${url}`);
    }
  });
  page.context().route("**/*", async (route) => {
    let host = "";
    try {
      host = new URL(route.request().url()).hostname;
    } catch {
      await route.abort();
      return;
    }
    if (isExternalHost(host)) {
      bucket.blocked.push(`${viewportId} ${route.request().url()}`);
      await route.abort();
      return;
    }
    await route.continue();
  });
  return bucket;
}

function isExternalHost(host) {
  if (host === "127.0.0.1" || host === "localhost" || host === "[::1]") return false;
  return true;
}

function isBlockedNoise(line) {
  if (/ERR_FAILED|ERR_BLOCKED|net::ERR|blocked by Playwright|Failed to load resource/i.test(line)) {
    return true;
  }
  // Headless Chrome sometimes destroys the map worker while the canvas stays up.
  // The unsupported-browser heading is a separate failure.
  return line.startsWith("[OrbitMapHost] Worker crashed:");
}

async function runFeature(page, origin, feature, dir) {
  if (feature === "dashboard-feed") return driveDashboard(page, origin, dir);
  if (feature === "collections") return driveCollections(page, origin, dir);
  if (feature === "settings-tags") return driveSettings(page, origin, dir);
  if (feature === "orbit") return driveOrbit(page, origin, dir);
  if (feature === "bookmark-card") return driveBookmarkCard(page, origin, dir);
  if (feature === "tag-audit") return driveTagAudit(page, origin, dir);
  throw new Error(`No driver for ${feature}`);
}

async function driveDashboard(page, origin, dir) {
  await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Bookmarks" }).waitFor();
  await page.getByText(FEED_BOOKMARK.tweetText).waitFor();
  const discovery = page.getByRole("region", { name: "Discovery" });
  await discovery.waitFor();
  const strip = discovery.locator('[aria-label="Untouched high-engagement saves"]');
  await strip.waitFor();
  const stripText = await strip.evaluate((element) => element.textContent ?? "");
  if (!stripText.includes("Verify highlight:")) {
    throw new Error("Discovery strip did not include a seeded highlight.");
  }
  await page.screenshot({ path: path.join(dir, "dashboard-feed.png") });
  return "Discovery strip shows a seeded highlight and the feed shows the tagged bookmark.";
}

async function driveCollections(page, origin, dir) {
  await openNav(page, origin, "Collections", "/collections");
  await page.getByRole("region", { name: "Collections overview" }).waitFor();
  await page
    .getByRole("region", { name: "Collections overview" })
    .getByText("In a collection", { exact: true })
    .waitFor();
  await clickUntilUrl(
    page,
    async () => {
      await page
        .getByRole("button", { name: `Open collection ${COLLECTION_NAME}` })
        .filter({ visible: true })
        .click({ noWaitAfter: true });
    },
    /\/collections\/[^/?#]+/,
    async () => {
      await page.getByText(COLLECTION_BOOKMARK.tweetText).filter({ visible: true }).first().waitFor();
    }
  );
  await page.screenshot({ path: path.join(dir, "collections.png") });
  return "Reading list opens and shows the seeded bookmark.";
}

async function driveSettings(page, origin, dir) {
  await openNav(page, origin, "Settings", "/settings");
  const tagsLink = page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("link", { name: "Tags", exact: true })
    .filter({ visible: true })
    .first();
  await tagsLink.click();
  await page.locator("#tags").waitFor();
  const search = page.getByRole("textbox", { name: "Search tags" }).filter({ visible: true }).first();
  await search.fill(TAG_RESEARCH);
  await page.locator("#tags").getByText(TAG_RESEARCH, { exact: true }).waitFor();
  await page.locator("#tags").getByText(/\d+ bookmarks?/).first().waitFor();
  const edit = page.getByRole("button", { name: `Edit tag ${TAG_RESEARCH}` }).filter({ visible: true }).first();
  await edit.hover();
  await edit.click();
  const editor = page.locator("#tags input").nth(1);
  await editor.waitFor();
  const value = await editor.inputValue();
  if (value !== TAG_RESEARCH) {
    throw new Error(`Tag editor value was ${value}`);
  }
  await editor.fill(RENAMED_TAG);
  if ((await editor.inputValue()) !== RENAMED_TAG) {
    throw new Error("Tag editor did not accept the new name.");
  }
  await search.click();
  await page.locator("#tags").getByRole("button", { name: "Save", exact: true }).waitFor({ state: "hidden" });
  await search.fill(RENAMED_TAG);
  await page.locator("#tags").getByText(RENAMED_TAG, { exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#tags").waitFor();
  const searchAfter = page.getByRole("textbox", { name: "Search tags" }).filter({ visible: true }).first();
  await searchAfter.fill(RENAMED_TAG);
  await page.locator("#tags").getByText(RENAMED_TAG, { exact: true }).waitFor();
  await page.locator("#tags").getByRole("button", { name: `Edit tag ${RENAMED_TAG}` }).waitFor();
  await searchAfter.fill(TAG_RESEARCH);
  await page.locator("#tags").getByText(/No tags match .*Research/).waitFor();
  await searchAfter.fill(RENAMED_TAG);
  await page.locator("#tags").getByText(RENAMED_TAG, { exact: true }).waitFor();
  await page.screenshot({ path: path.join(dir, "settings-tags.png") });
  return "Blurring the tag editor saves Field notes, and the new name is still there after reload.";
}

async function driveOrbit(page, origin, dir) {
  await openNav(page, origin, "Orbit", "/orbit");
  await queueHighlight(page).waitFor();
  await page.getByRole("button", { name: "Scan mode" }).click();
  await page.getByText("Auto-tag needs TYPESAFE_API_KEY.").waitFor();
  const autoTag = page.getByRole("button", { name: /Auto-tag \d/ });
  if (await autoTag.isEnabled()) {
    throw new Error("Auto-tag was enabled without TYPESAFE_API_KEY.");
  }
  await page.screenshot({ path: path.join(dir, "orbit-mode.png") });
  await page.keyboard.press("Escape");
  await page.getByText("Auto-tag needs TYPESAFE_API_KEY.").waitFor({ state: "hidden" });
  await clickUntilUrl(
    page,
    async () => {
      await page
        .getByRole("group", { name: "Orbit view" })
        .getByRole("link", { name: "Map" })
        .click({ noWaitAfter: true });
    },
    /\/orbit\/map/,
    async () => {
      await page.getByRole("heading", { name: "Orbit map" }).waitFor();
    }
  );
  const canvas = page.locator("canvas").first();
  const fallback = page.getByRole("heading", { name: "Graph requires a modern browser" });
  await canvas.waitFor({ timeout: 20_000 });
  if (await fallback.isVisible().catch(() => false)) {
    throw new Error("Orbit map fell back to the unsupported-browser state.");
  }
  await page.screenshot({ path: path.join(dir, "orbit-map.png") });
  await clickUntilUrl(
    page,
    async () => {
      await page
        .getByRole("group", { name: "Orbit view" })
        .getByRole("link", { name: "Queue" })
        .click({ noWaitAfter: true });
    },
    /\/orbit\/?(?:\?.*)?$/,
    async () => {
      await queueHighlight(page).waitFor();
    }
  );
  return "Mode menu shows auto-tag locked, and Queue/Map both open.";
}

async function driveTagAudit(page, origin, dir) {
  await page.goto(`${origin}/orbit/audit`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Tag audit" }).waitFor();
  await page.getByText(FEED_BOOKMARK.tweetText).waitFor();
  await page.getByText("Design is a weak match for this post.").waitFor();
  await page.getByText("Design fits this post better than Research.").waitFor();
  const removeBox = page.getByRole("checkbox", {
    name: `Remove ${TAG_DESIGN}`,
  });
  await removeBox.waitFor();
  if (!(await removeBox.isChecked())) {
    throw new Error("The seeded removal was not checked.");
  }
  await removeBox.click();
  if (await removeBox.isChecked()) {
    throw new Error("The removal checkbox stayed checked.");
  }
  await page.screenshot({ path: path.join(dir, "tag-audit.png") });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Tag audit" }).waitFor();
  const after = page.getByRole("checkbox", { name: `Remove ${TAG_DESIGN}` });
  await after.waitFor();
  if (!(await after.isChecked())) {
    throw new Error("A reload kept a checkbox the server does not store.");
  }
  return "The audit lists a removal and a swap. Unchecking is local, and a reload checks the row again.";
}

async function driveBookmarkCard(page, origin, dir) {
  await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Bookmarks" }).waitFor();
  const search = page.getByRole("textbox", { name: /Search bookmarks/ });
  if (await search.isVisible()) {
    await search.fill(FEED_BOOKMARK.authorUsername);
  }
  const card = page
    .locator(`[aria-label*="${FEED_BOOKMARK.authorDisplayName}"]`)
    .filter({ visible: true })
    .first();
  await card.waitFor();
  const before = await assertActionsInsideCard(page, card);
  writeFileSync(path.join(dir, "bookmark-card.actions.json"), `${JSON.stringify(before, null, 2)}\n`);
  await card.getByRole("button", { name: "Add tags" }).click();
  const tagDialog = page.getByRole("dialog", { name: "Manage tags" });
  await tagDialog.waitFor();
  const research = tagDialog.getByRole("button", { name: TAG_RESEARCH, exact: true });
  await research.click();
  await tagDialog.locator(`button[aria-pressed="true"]`, { hasText: TAG_RESEARCH }).waitFor();
  await page.screenshot({ path: path.join(dir, "bookmark-card-tags.png") });
  await page.keyboard.press("Escape");
  await card.getByText(TAG_RESEARCH).waitFor();

  await card.getByRole("button", { name: "Add note" }).click();
  const noteDialog = page.getByRole("dialog", { name: "Add note" });
  await noteDialog.getByRole("textbox").fill(NOTE_TEXT);
  await noteDialog.getByRole("button", { name: "Save", exact: true }).click();
  await card.getByText(NOTE_TEXT).waitFor();

  await card.getByRole("button", { name: "Add to collection" }).click();
  const collectionDialog = page.getByRole("dialog", { name: "Add to collection" });
  const readingList = collectionDialog.getByRole("button", { name: new RegExp(COLLECTION_NAME) });
  await readingList.click();
  await collectionDialog
    .locator('button[aria-pressed="true"]', { hasText: COLLECTION_NAME })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  const searchAgain = page.getByRole("textbox", { name: /Search bookmarks/ });
  if (await searchAgain.isVisible()) {
    await searchAgain.fill(FEED_BOOKMARK.authorUsername);
  }
  const reloaded = page
    .locator(`[aria-label*="${FEED_BOOKMARK.authorDisplayName}"]`)
    .filter({ visible: true })
    .first();
  await reloaded.getByText(NOTE_TEXT).waitFor();
  await reloaded.getByText(TAG_RESEARCH).waitFor();
  await assertActionsInsideCard(page, reloaded);
  await page.screenshot({ path: path.join(dir, "bookmark-card.png") });
  return "Tag, note, and collection membership stay on the card after reload.";
}

async function assertActionsInsideCard(page, card) {
  const width = page.viewportSize()?.width ?? 0;
  if (width > 390) return { checked: false, width };
  const box = await card.evaluate((element) => {
    const actions = element.querySelector("[data-bookmark-card-actions]");
    const cardBox = element.getBoundingClientRect();
    if (!actions) {
      return { ok: false, reason: "missing actions", cardRight: cardBox.right };
    }
    const actionBox = actions.getBoundingClientRect();
    const buttons = [...actions.querySelectorAll("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      const inside = rect.left >= cardBox.left - 0.5 && rect.right <= cardBox.right + 0.5;
      return {
        name: button.getAttribute("aria-label"),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        inside,
      };
    });
    const actionsInside =
      actionBox.left >= cardBox.left - 0.5 && actionBox.right <= cardBox.right + 0.5;
    return {
      ok: actionsInside && buttons.length > 0 && buttons.every((button) => button.inside),
      cardLeft: Math.round(cardBox.left),
      cardRight: Math.round(cardBox.right),
      actionsLeft: Math.round(actionBox.left),
      actionsRight: Math.round(actionBox.right),
      buttons,
    };
  });
  if (!box.ok) {
    throw new Error(`Card actions overflow the card: ${JSON.stringify(box)}`);
  }
  return { checked: true, width, ...box };
}

function queueHighlight(page) {
  return page
    .locator("[data-orbit-row-id]")
    .filter({ hasText: HIGHLIGHTS[0].tweetText, visible: true })
    .first();
}

async function openNav(page, origin, label, pathname) {
  if (!page.url().startsWith(origin)) {
    await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  }
  const pattern = new RegExp(`${pathname.replace("/", "\\/")}(?:\\/)?(?:\\?.*)?$`);
  await clickUntilUrl(page, () => followNav(page, label), pattern);
}

async function followNav(page, label) {
  const back = page.getByRole("button", { name: "Back to collections" }).filter({ visible: true });
  if ((await back.count()) > 0) {
    await back.first().click({ noWaitAfter: true });
    await page.waitForURL(/\/collections\/?(?:\?.*)?$/, { timeout: 15_000, waitUntil: "commit" });
  }
  const dialog = page.getByRole("dialog", { name: "Sidebar navigation" });
  const menuOpen = await dialog.isVisible().catch(() => false);
  const direct = page.getByRole("link", { name: label, exact: true }).filter({ visible: true }).first();
  if (!menuOpen && (await direct.isVisible().catch(() => false))) {
    await direct.click({ noWaitAfter: true });
    return;
  }
  if (!menuOpen) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await dialog.waitFor();
  }
  await dialog.getByRole("link", { name: label, exact: true }).click({ noWaitAfter: true });
}

async function clickUntilUrl(page, perform, url, settle) {
  let lastError = new Error("Navigation did not reach the expected URL.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await perform();
      await page.waitForURL(url, { timeout: 15_000, waitUntil: "commit" });
      if (settle) await settle();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
  }
  throw lastError;
}

async function measureScroll(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const scrollWidth = Math.max(root.scrollWidth, document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0);
    const innerWidth = window.innerWidth;
    return {
      scrollWidth,
      innerWidth,
      bodyScrollWidth: document.body?.scrollWidth ?? 0,
      documentScrollWidth: document.documentElement.scrollWidth,
      ok: scrollWidth <= innerWidth,
    };
  });
}

function readServerLog(logPath) {
  try {
    const text = readFileSync(logPath, "utf8");
    return text
      .split("\n")
      .filter((line) => BLOCKED_HOSTS.some((host) => line.includes(host)))
      .slice(0, 20);
  } catch {
    return [];
  }
}
