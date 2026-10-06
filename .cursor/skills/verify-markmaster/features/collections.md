# Collections

Collections lists the reader's lists and opens one list onto its bookmarks.

## Sub-features

- `collections-overview` shows the overview counts.
- `collections-open` opens `Reading list` from the list.
- `collections-item` shows the seeded bookmark on the detail page.

## How to get to it (user POV)

- Choose `Collections` in the sidebar.
- On a narrow window, choose `Open menu`, then `Collections`.
- Choose the card button `Open collection Reading list`.

## Driving it with verify-markmaster

Preconditions:

- Doctor prints `OK` for this run.
- The seed includes a collection named `Reading list` whose bookmark text is `Verify collection: reading list item about square geometry`.

- **Open the list.** Run `node .cursor/skills/verify-markmaster/bin/drive.mjs --feature collections --viewport desktop`. The region named `Collections overview` contains `In a collection`.
- **Open Reading list.** Choose the button named `Open collection Reading list`. The URL path starts with `/collections/` and the detail page shows the seeded bookmark text.
- **Mobile.** Repeat with `--viewport mobile-375` and `--viewport mobile-390`. Each measure file has `ok: true`.
- **Proof.** `collections.png` shows the open collection, with console, network, and measure files beside it.

## Gotchas

- Run this feature from the seed, before bookmark-card adds another post to Reading list. Drive reseeds at the start of each viewport, and this feature runs before bookmark-card.
- The card control is a button, not a link. Its accessible name is `Open collection Reading list`.
- An X folder card uses `Open X folder` instead. The seed does not create one.
- The first open of a collection can be dropped when `next dev` compiles the detail route and full-reloads `/collections`. Drive clicks `Open collection Reading list` again. The detail page shows the seeded bookmark text before the step passes.
