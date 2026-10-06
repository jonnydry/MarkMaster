# Settings tags

Settings lists every tag, filters them, and opens an editor for one tag.

## Sub-features

- `tags-section` scrolls to the Tags section.
- `tags-search` filters the list to `Research`.
- `tags-edit` opens the editor with the current name and cancels without saving.

## How to get to it (user POV)

- Choose `Settings` in the sidebar, or `Open menu` then `Settings`.
- In the navigation named `Settings sections`, choose `Tags`.
- Use the searchbox named `Search tags`.
- Choose `Edit tag Research`.

## Driving it with verify-markmaster

Preconditions:

- Doctor prints `OK` for this run.
- The seed includes a tag named `Research` on one bookmark.

- **Open Tags.** Run `node .cursor/skills/verify-markmaster/bin/drive.mjs --feature settings-tags --viewport desktop`. Choose the visible `Tags` link inside `Settings sections`. The element `#tags` is on screen.
- **Search.** Fill `Search tags` with `Research`. The visible row says `1 bookmark`.
- **Edit and cancel.** Choose `Edit tag Research`. The editor textbox value is `Research`. Choose `Cancel`. The name stays `Research`.
- **Mobile.** Repeat with `--viewport mobile-375` and `--viewport mobile-390`. Each measure file has `ok: true`.
- **Proof.** `settings-tags.png` shows the filtered list, with console, network, and measure files beside it.

## Gotchas

- Desktop and mobile each render a `Settings sections` navigation. Click the one that is visible.
- On a wide window the edit button is painted only while the row is hovered. It remains in the accessibility tree. Hover the row, then click.
- Leaving the editor blurs it and cancels. Click `Cancel` inside the row. Do not click `Save` unless you intend to rename the tag.
- The sidebar also lists tag names. Those links are not the settings editor.
- Collection detail does not render `Open menu`. After opening a collection, choose `Back to collections`, then `Open menu` on a narrow window, then `Settings`.
