# Dashboard feed and highlights

The dashboard lists saved posts and, above that list, a Discovery strip of untouched high-engagement saves.

## Sub-features

- `feed-open` shows the bookmark feed for the signed-in user.
- `highlights-strip` shows the Discovery carousel of untouched saves.
- `feed-row` shows a tagged bookmark in the same feed.

## How to get to it (user POV)

- Open `http://127.0.0.1:3100/dashboard`.
- Choose `Bookmarks` in the sidebar.
- On a narrow window, choose `Open menu`, then `Bookmarks`.

## Driving it with verify-markmaster

Preconditions:

- Doctor prints `OK` for this run.
- The database contains the highlight whose author is `Ada Marker` and the bookmark text `Verify feed: tagged design note for card actions`.

- **Open the feed.** Go to the dashboard. Run `node .cursor/skills/verify-markmaster/bin/drive.mjs --feature dashboard-feed --viewport desktop`. The heading `Bookmarks` is present.
- **Highlights strip.** The region named `Discovery` contains the strip labelled `Untouched high-engagement saves`. The strip text includes a seeded `Verify highlight:` post. The visible slide can be any of the four untouched authors, because the mix is shuffled.
- **Tagged row.** The feed contains `Verify feed: tagged design note for card actions`.
- **Mobile.** Run the same command with `--viewport mobile-375` and again with `--viewport mobile-390`. Each `measure.json` has `ok: true`.
- **Proof.** The run writes `dashboard-feed.png` plus the console, network, and measure files for that viewport.

## Gotchas

- The strip is hidden when `localStorage` key `markmaster-discovery-hidden` is `true`. Drive sets it to `false` before navigation.
- The carousel itself scrolls sideways. That scroller is not document scroll. Fail only when `documentElement` or `body` `scrollWidth` exceeds `innerWidth`.
- Highlight cards are untouched posts. A tagged or collected bookmark does not appear in the raw strip.
- The feed heading `Bookmarks` is visually hidden and still exposed as a heading.
