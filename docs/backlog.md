# Backlog: agreed, not started

> **Question:** What is agreed and not started, and why does it wait?  
> **Time:** 2 minutes.  
> **Read first:** [CLAUDE.md](../CLAUDE.md).  
> **Next:** [Known gaps](reference/known-gaps.md), which lists the defects; a gap is not agreed work.

## In one screen

Three items are open: four internal moves around `src/services/tracker/TicketStore.ts` and
`src/services/tracker/TrackerPipeline.ts` that put [ticket](glossary.md#ticket) reading and writing on the
[Board](glossary.md#board), which wait for the next change that touches them; two steps of an
[incident](glossary.md#incident)'s trail that the log records nowhere, which wait for a log record of their own; and
two known gaps the pipeline setup plan meant to close, which wait for the next change to the code they name.

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

## Pipeline gaps the setup work left open

The pipeline setup plan meant to close these two [known gaps](reference/known-gaps.md); its items changed neither
code path.

| Gap | Change | Waits for |
| --- | --- | --- |
| [An unreadable pipeline passes a merged-tree gate](reference/known-gaps.md#gap-unreadable-pipeline-passes-merge-gate) | `gateMergedTree` in `src/services/overseer/DrivePass.ts` ends the gate run `gate-cannot-run` on an older or malformed `pipeline.json`, in place of running no gates. | The next change to `gateMergedTree` |
| [The `checks-not-set` decision stays open](reference/known-gaps.md#gap-checks-not-set-stays-open) | The `gate` writes that make the board's pipeline set (`gate none`, `gate add`, `gate prepare`) withdraw an open `checks-not-set` decision, as Apply does. | The next change to the `gate` writes in `src/lib/tracker-model/TrackerChanges.ts` |

## Out of the code-owned lifecycle epic

The `code-lifecycle` epic, built on the branch `group-code-lifecycle`, moved a ticket's lifecycle into code, the
[Overseer](glossary.md#overseer). It deliberately leaves out two things. Neither is deferred work waiting its turn
here: each returns only as a new decision of the owner's.

- **The Copilot worker adapter**, with an `forge workers --vendor` command and a `workerVendor` board key;
  neither exists. The Overseer launches Claude Code and nothing else: `AgentAdapter` in
  `src/lib/agent-launch/AgentAdapter.ts` is the launcher port, and `CLAUDE_CODE_ADAPTER` in
  `src/lib/claude-code/ClaudeCodeAdapter.ts` is its one production adapter. Launching and
  [session](glossary.md#session) streams sit behind that port, so a second vendor adds an adapter there; Claude Code
  assumptions outside the port are listed in [Porting](development/porting.md).
- **A cross-project overview.** Each repository's Overseer serves only its own board. The view across boards stays
  agent-dashboard's, a separate program; its contract with this build is under
  [The agent-dashboard contract](development/porting.md#the-agent-dashboard-contract). agent-progress keeps no
  machine-wide process.
