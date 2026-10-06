# Orbit auto-tag and Mode

Orbit lists untouched bookmarks. The Mode menu explains review versus auto-tag. The Queue/Map switch moves between the list and the map.

## Sub-features

- `orbit-queue` shows an untouched bookmark in the queue.
- `mode-menu` opens the menu labelled `Scan mode`.
- `auto-tag-locked` shows auto-tag disabled, with the reason `Auto-tag needs TYPESAFE_API_KEY.`
- `orbit-map` opens the map from the `Orbit view` switch and returns to the queue.

## How to get to it (user POV)

- Choose `Orbit` in the sidebar, or `Open menu` then `Orbit`.
- Choose the `Mode` button (accessible name `Scan mode`) on the queue.
- Choose `Map` or `Queue` in the group named `Orbit view`.

## Driving it with verify-markmaster

Preconditions:

- Doctor prints `OK` for this run.
- `TYPESAFE_API_KEY` is empty.
- The queue contains `Verify highlight: untouched high engagement save about local archives`.

- **Open the queue.** Run `node .cursor/skills/verify-markmaster/bin/drive.mjs --feature orbit --viewport desktop`. The queue shows the Ada Marker highlight text.
- **Open Mode.** Choose the button named `Scan mode`. The menu contains `Auto-tag needs TYPESAFE_API_KEY.` The auto-tag button is disabled.
- **Do not start it.** Do not choose `Start auto-tag`. A disabled row is the proof. An enabled row means the server has a TypeSafe key and the run is invalid.
- **Open the map.** Press Escape. In the group named `Orbit view`, choose `Map`. The heading `Orbit map` is present.
- **Return to the queue.** Choose `Queue` in that same group. The URL path is `/orbit` and the highlight text is back.
- **Mobile.** Repeat with `--viewport mobile-375` and `--viewport mobile-390`. Each measure file has `ok: true`.
- **Proof.** `orbit-mode.png` shows the open Mode menu. `orbit-map.png` shows the map. Console, network, and measure files are written beside them.

## Gotchas

- The Mode menu is absent when the queue is empty. The seed leaves four untouched bookmarks so the menu renders.
- That highlight sentence also sits in the Discovery strip and in pages kept mounted off screen. Drive reads it from the queue row, not from the first match on the page.
- Auto-tag calls TypeSafe only after `Start auto-tag`. With an empty key the product keeps the row disabled. Do not set a key to make the row clickable.
- Headless Chrome can log `[OrbitMapHost] Worker crashed: ErrorEvent` while the canvas stays on screen. Drive still records that line. The run fails when the heading `Graph requires a modern browser` is visible, or when no canvas is mounted. An uncaught page error fails the run.
- `Orbit view` is the Queue/Map switch. `Scan mode` is the Mode menu. They are different controls.
- The first open of `/orbit/map` can be dropped when `next dev` compiles the map and full-reloads `/orbit`. Drive chooses `Map` again. The heading `Orbit map` is present before the step passes. The map URL may include `?scope=orbit`.
