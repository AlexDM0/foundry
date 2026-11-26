# Tickets

The board's Tickets view: every ticket of a forge, from its first draft to its landing, in three segments. The look is taken from
artboard 0 of the spec and plan design ("Tickets, one segment at a time", `TicketsSegmented.dc.html`, 1680 × 1180, light, drawn over the
Gaia v2 board frame); its dark theme is Gaia's tokens' dark values. The behaviour is the owner's.

Built in: `page/board/views/tickets/` (`TicketsView.tsx`, `TicketsModel.ts`, `InDraftModel.ts`, `ActiveTicketsModel.ts`,
`FinishedTicketsModel.ts` and the segment parts) and `page/board/shared/tickets/` (`TicketSegmentUtil.ts`, `TicketRowFactsUtil.ts`,
`DraftRowsModel.ts`, `IntakeSessionsModel.ts`, which the documents and intake views read too), styled by `page/styles/board/tickets.css`, and the design
system's `SegmentedControl` (its `accentedCount`). Held by: their specs beside them, and `page/Screens.visual.spec.ts`, which paints
artboard 0 from `page/testing/fixtures/storefront-tickets-board.ts` (`page/testing/ArtboardScreens.tsx`, `TICKETS_SCREENS`).

## The head

- The title "Tickets" in the display role, as the page's `h2`, and under it the lead "Every ticket of this forge, from its first draft to
  its landing."
- Under the title row, 16px apart, one line: the segments In draft · Active · Finished, each with its count; the search of the shown
  segment ("Search in draft", "Search active", "Search finished"); and, while In draft is shown, at the line's far end in the small muted
  ink: "Opens on In draft while something there waits on you."
- The counts: In draft counts the tickets being written, the tickets for User's review and the filing drafts (not the intakes); Active
  every active ticket; Finished every finished ticket, the window's and the earlier ones. In draft's count is accented, a pill in the
  waiting orange, while something there waits on User: a draft, a filing draft or an intake's question. Its accessible name says so:
  "In draft, 5, something waits on you".
- Each segment keeps its own search while the view is open. A query of digits (with or without `#`) looks for an id alone; any other query
  looks through the row's words (title, epic, and in Active its stage and agent).

## Which segment opens

1. The segment the route names: `tickets/in-draft`, `tickets/active` or `tickets/finished`, so a link (such as a documents page's way back)
   opens that segment. A route naming a segment while the view is open shows it; a detail item (`tickets/ticket/<id>`) keeps the segment.
   A choice of segment under a route that names one moves the route to the chosen segment, so a reload, a copied link or Back never
   opens a segment User left.
2. Else In draft while something there waits on User.
3. Else the segment this viewer chose last on this forge: `gaia:board:<trackerId>:tickets-segment`, through the board's preference store
   (the same store as the Progress view's memory, `board-menu.md`). Choosing In draft, the default, removes the key.
4. Else In draft.

## Where a ticket stands

| Status | Segment |
| --- | --- |
| `draft`, `ready-for-review` | In draft |
| `committed`, `in-progress`, `in-review`, `reviewed` | Active |
| `delivered`, `abandoned` | Finished |

The filing drafts (`facts.drafts`) stand in In draft too. Where a draft stands is the forge's (`draft` on the board's ticket: its stage,
what waits on User, its agent and its wait start, `docs/forge-requirements.md` V15); the view only words it.

## In draft

Panels 16px apart, each a card on the surface with a 1px strong line and an 8px radius.

### Running intakes

First, one panel per live product-owner session, its border in the accent edge. One line: a pulsing orange dot, the job id in mono, the
role "INTAKE" in orange mono small capitals, the session's title (weight 600), then muted "N drafts · running for 9m" ("no drafts yet" with
none). At the line's end: "Waiting on you · N questions" in the waiting orange (weight 600) while the session asks, and "Open intake",
a dense button linking to `intake/<jobId>`. The search never hides an intake.

### Waiting on you

The head: "WAITING ON YOU" in orange small capitals and the count in orange mono. Columns: Id (mono, orange link), Ticket (title at weight
500 over its epic line: the epic's rounded square in its colour, its title, and "· from J5", the job that filed it), Writing (the stage
track), What waits on you (orange, weight 600), the one action (a dense primary button), Since (mono, muted). Rows run oldest wait first.

| What waits | Says | Action | Opens |
| --- | --- | --- | --- |
| A question of the spec or plan agent (`answer`) | "2 questions from the spec agent" | Answer | The document page of that document, `documents/ticket/<id>/<spec\|plan>` |
| An agent's edit to apply (`proposal`) | "The spec agent's edit to review" | Open spec / Open plan | The document page |
| The document's approval (`approval`) | "Approve spec v3", "Approve plan v1" (the head version) | Open spec / Open plan | The document page |
| A ticket in `ready-for-review`, either route | "Ticket to review" | Review ticket | The ticket's detail, `tickets/ticket/<id>` |
| A one-ticket route draft (no `draft` facts) | "Draft to make ready" | Open ticket | The ticket's detail |
| A filing draft in `waiting` | "2 questions to answer" | Answer | The draft's detail, `tickets/draft/<id>` |

The id links where the action does for a document; a filing draft's to its detail. Since: the wait's age under an hour ("6m"), else the
clock it began at ("13:05"), as the artboard draws both.

### Agent writing

The head "AGENT WRITING" in muted small capitals and its count. The rows line up with the waiting ones (no column head of their own). The
fourth column holds the agent: a pulsing orange dot (teal for a review), the job id in mono at weight 600, its role in mono small capitals
("SPEC AGENT", "PLAN AGENT"), its tokens ("18k tokens"); then "Watch", a dense quiet button opening the document page with its agent at
work; then how long the agent has run, to the second ("4m 12s"), in ink at weight 600. A draft no agent writes yet shows a dashed grey dot
and "NO AGENT YET", and no Watch. A filing draft being researched names who holds it; one whose session ended shows "READY TO RESUME"
beside the dashed dot.

### The stage track

Each stage is a 3px bar over its name, 6px apart, as wide as the column allows:

| Stage status | Bar | Name |
| --- | --- | --- |
| done | ink-muted | "✓ Spec", ink-muted |
| waits on User | dashed, the waiting orange | orange, weight 600 |
| an agent writes it | solid orange | ink, weight 600 |
| not reached | strong line | ink-4 |

Tracks: the spec-then-plan route draws Spec, Plan; a ticket in review on it adds Ticket review after both checked. The one-ticket route
draws Shape → Ticket review: a ticket in review has Shape done and Ticket review waiting; a draft waits at Shape.

## Active

One panel, the stage table. Columns: Id, Ticket, Stage (a quiet badge in its state's look), Agent, Epic, Since. Rows: tickets with an agent
first, then the rest, each part by id. A click, Enter or Space on a row opens the ticket's detail in place, as its id link does.

| Holds the ticket | Stage | Agent | Since |
| --- | --- | --- | --- |
| A question of its agent (`E<n>`, no document) | "Asks E2", dashed orange | "J3 builder asks you", dashed orange dot | "asked 4m" |
| A running job | its display state's label ("In progress", "Reviewing") | "J2 builder · 84k tokens", pulsing dot | its run, "12m 04s" |
| A ticket it waits on, while committed | "Waits on #012" | "no agent yet" | "ready 10:31" |
| Nothing | its display state's label ("To do") | "no agent yet" | "ready 09:40" (committed), "since 11:20" otherwise |

The agent text is set as the artboard sets it: in the role's mono small capitals.

## Finished

One panel, the history. Columns: Id, Ticket, Outcome (a quiet "Done" or "Abandoned" badge), Epic, Landed ("today 13:05", "11-11 16:20").
It shows the tickets the board's finished-work window lets through, latest closed first; it absorbs the Gantt's old "Finished work" card.
Under the table, while the window hides any: "35 earlier tickets · show all", where "show all" widens the board's window to all, as the
filter line's own choice does. A search looks through every finished ticket. An abandoned title is struck through.

## Empty segments

"No ticket is being written.", "No ticket is under way.", "No ticket finished in the last day." (the window's phrase); while a search
narrows: "No draft matches the search.", "No active ticket matches the search.", "No finished ticket matches the search." In draft says
so beside an intake too, which no search hides.

## Deviations from the artboard

- **Stage words are the board's own.** Active's stage reads the board's display state labels ("In progress", "To do") where the artboard
  writes "Building": one word for a state across every view.
- **The intake line names drafts, not requests.** The forge serves one request text per intake session and no request count, and the
  splitter's sketches and "Write out N tickets" are out of scope; the line says the drafts the session filed and how long it has run.
- **Ids are the forge's.** An intake and a ticket's origin are named by the job id ("J8", "from J5"); the forge serves no `I<n>`. A ticket
  no job filed shows no origin.
- **The In draft count leaves the intakes out:** it counts tickets and filing drafts, the things that become tickets.
- **Since is one rule:** an age under an hour, a clock from then on, which reproduces the artboard's mixed "6m" and "13:05".
- **A ticket in review on the spec-then-plan route** keeps its checked Spec and Plan before Ticket review, which the artboard does not draw.
- **The Finished history follows the board's finished-work window** and "show all" widens it, so the filter line at the menu's end and the
  history always agree.
- **The segments' focus and press** are the design system's `SegmentedControl` (an outlined tray, the pressed segment in ink) rather than
  the artboard's grey tray with a white pressed segment, as every segmented choice in Gaia.

## Not built

- The artboard's "New request" button at the menu row's end: the owner's decisions name no behaviour for it.
- The intake's sketches and "Write out N tickets": the intake as a splitter is out of scope.
