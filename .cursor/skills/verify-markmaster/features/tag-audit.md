# Tag audit

Orbit can list tags already on bookmarks and propose a removal or a swap. Nothing on the bookmark changes until Apply.

## Sub-features

- `tag-audit-list` shows the seeded removal and the seeded swap.
- `tag-audit-uncheck` clears one checkbox in the session. A reload checks it again, because the choice is not stored.

## How to get to it (user POV)

- Open `/orbit/audit`, or choose `Audit` in the group named `Orbit view`.

## Driving it with verify-markmaster

Preconditions:

- Doctor prints `OK` for this run.
- The seed includes an open tag audit. Do not choose `Review tags` or `Review again`. Those buttons call Jev and Grok.

- **Open the review.** Run `node .cursor/skills/verify-markmaster/bin/drive.mjs --feature tag-audit --viewport desktop`. The heading is `Tag audit`. The page shows `Verify feed: tagged design note for card actions`, `Design is a weak match for this post.`, and `Design fits this post better than Research.`
- **Uncheck the removal.** Clear the checkbox named `Remove Design`. It is unchecked immediately. Reload. The same checkbox is checked again.
- **Mobile.** Repeat with `--viewport mobile-375`. `measure.json` has `ok: true`.
- **Proof.** `tag-audit.png` shows the list with the removal unchecked. Console, network, and measure files are written beside it.

## Gotchas

- `Review tags` starts a model run. The verify server has empty TypeSafe and xAI keys, so that button fails closed. The seed is the review.
- The Queue, Map, and Audit labels are icon-only below the `sm` breakpoint. The accessible name is still the label.
- Settings tags runs after this feature when the full drive is used, and it renames `Research`. This feature does not depend on that name surviving a later feature.
