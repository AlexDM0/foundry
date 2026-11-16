# Backlog: agreed, not started

> **Question:** What is agreed and not started, and why does it wait?  
> **Time:** 2 minutes.  
> **Read first:** [CLAUDE.md](../CLAUDE.md).

## In one screen

Four items are open: four internal moves around `src/services/tracker/TicketStore.ts` and
`src/services/tracker/TrackerPipeline.ts` that put [ticket](glossary.md#ticket) reading and writing on the
[Board](glossary.md#board), which wait for the next change that touches them; two steps of an
[incident](glossary.md#incident)'s trail that the log records nowhere, which wait for a log record of their own; a
pipeline gap the setup work left open, which waits for the next change to the `gate` writes; and one part of Flint,
the sprite of the agents, that waits for the owner's design.

Two things stay out of the `code-lifecycle` [epic](glossary.md#epic), a Copilot worker adapter and a cross-project
overview, and return only as a new decision of the owner's.

## The TicketStore moves step 7 left

These four moves change no behaviour, so none earns a change of its own: each waits for the next change to the code it
touches. The conventions refactor, a finished restructuring of the codebase, left them undone when it closed its
seventh step.

| Move | Must keep | Waits for |
| --- | --- | --- |
| `createTicket`'s initial frontmatter moves to a util in `src/lib/tracker-model/utils/` or a Board method. | Nothing beyond its behaviour. | The next change to ticket filing |
| `forge ticket show` (`cli/tickets/TicketReadingSubcommands.ts`) reads through `board.ticketByReference` in place of `readTicket`. | The command reads with no lock and no Board, so it works on an unreadable `progress.json` or [log](glossary.md#log). Reaching a Board goes through `requireTracker` (`src/services/tracker/TrackerReader.ts`), which refuses both. The move keeps that behaviour or drops it on purpose. | The next change to `ticket show` |
| `nextTicketId` takes the ticket ids that [rows](glossary.md#row) name from the Board, replacing `ticketIdsNamedByTaskRows`, which reads `progress.json` a second time. | Nothing beyond its behaviour. | The next change to ticket filing |
| A Board query replaces `TrackerChange.deleteAllTicketFilesAfterwards` in `src/services/tracker/TrackerPipeline.ts`. | Reaching malformed ticket and epic files, which `listTickets` and `listEpics` keep out of the Board, and the deleted-ticket count `forge clear` prints. | The next change to `forge clear --all` |

## Incident trail steps with no log record

The Bridge's incident drawer and the Assistant's rail draw an incident's trail from the board and the log alone. Two
steps the board designs drew have no record to read, so the trail leaves them out.

| Step | Why it has no source | Waits for |
| --- | --- | --- |
| The delivery of a settled incident: delivered to the Assistant J1 in chat 14 | The open incident carries `deliveredInTurn`, but no log record notes the delivery, so it goes with the incident once settled. | A delivery record in the log, such as `incident-delivered` with the job and the chat |
| The fresh agent a `job-fresh` default started: fresh builder J2 took #001 | `job-fresh` logs `job-stop-requested` under the old job; the new job is launched later and names no incident. | The launch of a replacing job naming the incident it answers |

## A pipeline gap the setup work left open

The pipeline setup plan meant to close this gap; its items did not change this code path.

| Gap | Change | Waits for |
| --- | --- | --- |
| The `checks-not-set` decision stays open | The `gate` writes that make the board's pipeline set (`gate none`, `gate add`, `gate prepare`) withdraw an open `checks-not-set` decision, as Apply does. | The next change to the `gate` writes in `src/lib/tracker-model/TrackerChanges.ts` |

## Flint parts not built

The build of Flint (`packages/flint/`, and its host in `bridge/flint/`) took steps 1 to 8 of the design handoff, and
forge 1.1 the brain of step 9 on the Overseer's side ([Flint's brain](reference/overseer-api.md#flint-brain)). One part
of the handoff is agreed and not built.

| Part | Why it waits | Waits for |
| --- | --- | --- |
| Look at the composer: the chat habitat's answer to "the user types", and the look after the doubt of "the agent asks a question". The composer sends the `user-is-typing` cue, which only wakes Flint. | No intent of the fixed list looks at an element, and neither the playground nor `02-animations.md` gives a look's motion. | A look in the playground, and a `look` intent with the element the habitat names |

## Out of the code-owned lifecycle epic

The `code-lifecycle` epic, built on the branch `group-code-lifecycle`, moved a ticket's lifecycle into code, the
[Overseer](glossary.md#overseer). It deliberately leaves out two things. Neither is deferred work waiting its turn
here: each returns only as a new decision of the owner's.

- **The Copilot worker adapter**, with an `forge workers --vendor` command and a `workerVendor` board key; neither
  exists. The Overseer launches Claude Code and nothing else: `AgentAdapter` in `src/lib/agent-launch/AgentAdapter.ts`
  is the launcher port, and `CLAUDE_CODE_ADAPTER` in `src/lib/claude-code/ClaudeCodeAdapter.ts` is its one production
  adapter. Launching and [session](glossary.md#session) streams sit behind that port, so a second vendor adds an adapter
  there.
- **A cross-project overview.** Each repository's Overseer serves only its own board. The view across boards stays
  a monitor's, a separate program; its contract with this build is under [The monitor
  contract](reference/overseer-api.md#the-monitor-contract). agent-progress keeps no machine-wide process.
