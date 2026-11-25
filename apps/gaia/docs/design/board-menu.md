# The board menu and the Progress views

The board's menu over every board view, the Progress entry that groups the Kanban, Waves and the Gantt, their routes, and the Kanban
without drafts. The menu's look is taken from the "Tickets, one segment at a time" artboard (its board nav); the behaviour is the
owner's.

Built in: `page/board/shell/BoardRouter.ts`, `page/board/shell/Header.tsx`, `page/board/shell/BoardApp.tsx`,
`page/shared/HashRouter.ts`, `page/board/views/kanban/KanbanModel.ts` and `KanbanView.tsx`, and the design system's `Tabs` and `Menu`.
Held by: their specs beside them.

## The menu

The entries, in this order: Tickets · Progress · Epics · Agents · Questions · Assistant · Intake · Pipeline.

- Each entry is a page tab of the design system's `Tabs`: 40px row, tab-size words, ink-muted at rest, ink at weight 600 over a 2px ink
  underline while it is the current page.
- An entry that counts what waits on User shows its count after its label in the waiting tone (the artboard's orange pill): Tickets
  counts the drafts and the tickets for User's review (attention kinds `draft-ticket`, `filing-draft`, `review`), Progress the merges
  to accept (`merge-accept`), Questions its open decisions (escalated in the error tone), the Assistant its incidents in grey. A zero
  count shows nothing. The accessible name says what the count means: "Tickets, 3 wait on User".
- Epics stays hidden on a board without epics, and on a board with no readable pipeline Pipeline is the only entry, as before.
- A ticket's documents page stands under Tickets: Tickets is the current entry there.

## The Progress entry

As drawn: the label "Progress", then a muted sub-label after a dot naming a view ("· Kanban", weight 400 even while current), then a
10px chevron caret button beside it, named "Progress views".

- **The label names the view the entry opens:** the open Progress view, else the one this viewer opened last on this forge, else the
  Kanban. A click on the entry opens that view.
- **The menu** lists the Progress views the board shows, in the order Kanban, Waves, Gantt, the open one pressed; a choice opens it.
  Waves is left out on a board where no ticket depends on another, as its view is.
- **It opens** while a mouse rests on the entry (the label or the caret), and closes when the mouse leaves the entry and its menu. The
  caret opens it for the keyboard and touch: Enter or Space on the caret, or a tap. Opened by the caret, or by a press on the caret of a
  menu a resting mouse opened, it stays open until Esc (focus back on the caret), a press or focus outside, or a choice. A touch on the
  entry opens nothing by itself, so a tap on the label follows the link.
- The caret is the library `Menu`'s `caret` trigger: its popover is the library's dialog of item buttons, as every menu in Gaia is. The
  artboard's `aria-haspopup="menu"` is drawn as `aria-haspopup="dialog"` for that reason (deviation, below).

Today's Progress view is the **Gantt**: its title row reads "Gantt", and its chart is named "Gantt chart".

## Routes

| Route | Opens |
| --- | --- |
| `#forge/<trackerId>/progress/kanban[/<item>]` | The Kanban; `merge-queue` its Merge queue detail, `ticket/<id>` a ticket's detail over it |
| `#forge/<trackerId>/progress/waves[/<item>]` | Waves |
| `#forge/<trackerId>/progress/gantt[/<item>]` | The Gantt, today's Progress view |
| `#forge/<trackerId>/tickets/ticket/<ticketId>` | A ticket's detail on Tickets; the place a served ticket target opens |
| `#forge/<trackerId>/tickets/draft/<draftId>` | A draft's detail on Tickets; the place a served draft target opens |

Old links keep working. Each is read as the route it named, and the address is replaced by that route's own fragment, with no new
history entry, so Back never returns to the old link:

| Old link | Redirected to |
| --- | --- |
| `kanban[/<item>]` | `progress/kanban[/<item>]` |
| `kanban/ticket/<id>[/<section>]`, `kanban/draft/<id>` | `tickets/ticket/<id>[/<section>]`, `tickets/draft/<id>` |
| `waves[/<item>]` | `progress/waves[/<item>]` |
| `progress[/<item>]` | `progress/gantt[/<item>]` |

A place the server names in the fleet document (an attention entry's or an activity entry's board route) is read the same way. A stored
tab written before the views were grouped (`progress`) opens the view it named.

## What is remembered

Per forge and per viewer, in this browser's storage through the board's preference store (`page/board/preferences/PreferenceStore.ts`):

- `gaia:board:<trackerId>:tab` — the tab shown last, opened by a forge link that names no tab; the first entry, Tickets, is the default.
- `gaia:board:<trackerId>:progress-view` — the Progress view shown last; the Kanban, the default, removes the key.

## The Kanban without drafts

- Lanes, in order: Ready, Building, In review, Merge queue, Done, Abandoned (folded by default). Ready holds `committed` tickets only.
- No draft ticket, no ticket for User's review and no filing draft is on the Kanban: Tickets holds them. Ready has no "Ready for review"
  or "Drafts" group; the Merge queue's "Waiting for User's accept" group still leads its lane.
- While any of them waits on User, the head shows a link to Tickets' In draft (`tickets/in-draft`) under the title row, in the link
  (orange) ink at weight 600: "1 draft waits on you", "3 drafts wait on you". It counts the same attention entries as the Tickets count,
  where the forge lists no draft whose spec or plan agent is still writing it.

## Deviations from the artboard

- The caret's menu announces a dialog, not a menu: it is the library's one menu part, whose items are buttons in a dialog with Esc and
  outside dismissal, so every menu in Gaia reads and works alike.
- The artboard's "New request" button at the right of the menu row is not built: the owner's decisions name no behaviour for it, so the
  row's end keeps the finished-work filter over the views that show finished work (`tickets.md`, "Not built").
