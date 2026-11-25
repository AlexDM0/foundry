# The design reference

What Gaia's page is designed to show and hold, as it is built now. Code, specs and rule files cite these documents by section, so each
citation resolves to text in this repository. The code decides: where a document and the code differ, the code's own specs settle it and
the document is corrected in the same change.

| Document | Holds | Cited as |
| --- | --- | --- |
| `screens.md` | The rules for every screen, the shell, and each screen by its mark (A1 to A4, B1 to B4, C2, C3): its purpose, its parts, every control and its effect, its states and its acceptance | "`docs/design/screens.md` A4", "B2 acceptance 3", "the shell" |
| `versions.md` | How the screens show a forge at a version this Gaia cannot fully use (U1 to U3, and U4's sheet of the shared parts), with the copy and the steps of Update forge | "`docs/design/versions.md` U2" |
| `components.md` | Gaia's design rules, its own tokens, its own parts under `page/components/`, how a state reaches a library tone, and the text pairs and contrast floors `page/StyleContract.spec.ts` holds | "`docs/design/components.md` 3.2", "section 4" |
| `board.md` | The tables and definitions the board's views under `page/board/` are built to | "`docs/design/board.md`", with the section's title |
| `tickets.md` | The Tickets view (artboard 0): its In draft, Active and Finished segments, each one's rows and actions, the segment it opens on, and its deviations | "`docs/design/tickets.md`", with the section's title |
| `board-menu.md` | The board's menu, the Progress entry grouping the Kanban, Waves and the Gantt, their routes and redirects, what is remembered, and the Kanban without drafts | "`docs/design/board-menu.md`", with the section's title |

## The artboards

Every screen was drawn before it was built, as an artboard with the screen's mark: A1 Attention, B2 the Forges view with its
controls in use, U1 to U3 the versions pages, U4 their parts sheet, and so on. The artboards are the owner's drawings and are kept
in the owner's Claude artifacts, not in this repository. Where a comment or a spec says "artboard A1", it means the drawing of the
screen that `screens.md` describes under that mark, or `versions.md` for U1 to U4, and the facts it relies on are in that section.
No fact is held by an artboard alone.

`page/testing/ArtboardScreens.tsx` builds each screen as the page paints it, from the fixture that holds the artboard's example data
(`page/testing/fixtures/`), and `page/Screens.visual.spec.ts` paints every one in the light and the dark theme. A person compares the
painted screen with its artboard by eye. The `designFile` of a screen there is the artboard's name among the owner's drawings.

## Keeping it true

- A section number, a screen's mark and an acceptance number never change once cited. An acceptance that no longer applies stays in
  place, marked withdrawn with its reason.
- A change to a screen's parts, copy, controls or states changes its section in the same change.
- Nothing here names a build plan, a work item or a file outside the repository as the source of a fact.
