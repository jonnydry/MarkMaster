# Bookmark card actions

A feed card can take a tag, a note, and a collection without leaving the dashboard.

## Sub-features

- `card-tag` applies an existing tag from the card.
- `card-note` saves a note on the card.
- `card-collect` adds the card to an existing collection.
- `card-persist` shows the tag and note after a reload.

## How to get to it (user POV)

- Open the dashboard.
- If the card is below the fold, search `bea_curator`.
- On the card from `Bea Curator`, choose `Add tags`, `Add note`, or `Add to collection`.

## Driving it with verify-markmaster

Preconditions:

- Doctor prints `OK` for this run.
- The feed contains `Verify feed: tagged design note for card actions` with the tag `Design`.
- The library already has the tag `Research` and the collection `Reading list`.
- Drive reseeds before the viewport, so this recipe starts from that seed even if an earlier feature mutated the database.

- **Add a tag.** Choose `Add tags` on the Bea Curator card. Run `node .cursor/skills/verify-markmaster/bin/drive.mjs --feature bookmark-card --viewport desktop`. The dialog named `Manage tags` opens. Choose `Research`. That button's `aria-pressed` becomes `true`.
- **Close and see the chip.** Press Escape. The card shows `Research`.
- **Add a note.** Choose `Add note`. The dialog is named `Add note`. Fill the textbox with `Verify note: keep this with the design tag` and choose `Save`. The card shows that sentence.
- **Add to a collection.** Choose `Add to collection`. The dialog is named `Add to collection`. Choose the button whose name contains `Reading list`. Its `aria-pressed` becomes `true`.
- **Reload.** Reload the dashboard. The same card still shows the note and `Research`.
- **Mobile.** Repeat with `--viewport mobile-375` and `--viewport mobile-390`. Each measure file has `ok: true`.
- **Proof.** Shots `bookmark-card-tags.png` and `bookmark-card.png` sit next to the console, network, and measure files.

## Gotchas

- `Open on X` leaves the app. Do not click it. The driver aborts `x.com` anyway.
- Choosing `Research` again removes it. Run this recipe from a fresh seed.
- The card root is a labelled generic element, not a button. Scope the action buttons to the element whose accessible name contains `Bea Curator`.
- `Add note` is the accessible name until a note exists. After the save, the same control is named `Edit note`.
