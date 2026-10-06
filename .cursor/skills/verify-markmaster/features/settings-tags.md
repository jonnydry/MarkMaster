# Settings tags

Settings lists every tag, filters them, and opens an editor for one tag.

## Sub-features

- `tags-section` scrolls to the Tags section.
- `tags-search` filters the list to `Research`.
- `tags-edit` opens the editor with the current name.
- `tags-blur-save` renames the tag when focus leaves the row, and the new name survives a reload.

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
- **Search.** Fill `Search tags` with `Research`. The row name is `Research` and it shows a bookmark count. A fresh seed says `1 bookmark`. After bookmark-card in the same viewport, the count is `2 bookmarks` because that feature also applies `Research`.
- **Edit.** Choose `Edit tag Research`. The editor textbox value is `Research`.
- **Save on blur.** Replace the name with `Field notes`. Click the search box, which is outside the edit row. Do not click `Save`. The editor closes and the list shows `Field notes`.
- **Reload.** Reload settings. Search `Field notes`. The row is still there, and `Edit tag Field notes` is present. Search `Research`. The section says no tags match.
- **Mobile.** Repeat with `--viewport mobile-375` and `--viewport mobile-390`. Each measure file has `ok: true`.
- **Proof.** `settings-tags.png` shows `Field notes` after the reload, with console, network, and measure files beside it.

## Gotchas

- Desktop and mobile each render a `Settings sections` navigation. Click the one that is visible.
- On a wide window the edit button is painted only while the row is hovered. It remains in the accessibility tree. Hover the row, then click.
- Focus leaving the row saves a changed name. That is the same commit as the `Save` button. `Escape` restores `Research` and does not save. `Cancel` also discards the typed name.
- An empty name, or a name and color that did not change, closes the editor without a save.
- This feature renames `Research`, so it runs after bookmark-card in a full drive. A single-feature run reseeds first.
- The sidebar also lists tag names. Those links are not the settings editor.
- Collection detail does not render `Open menu`. After opening a collection, choose `Back to collections`, then `Open menu` on a narrow window, then `Settings`.
