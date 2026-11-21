# The board: what its views are built to

A forge's board is Gaia's own, drawn under `page/board/` and styled under `page/styles/board/`. This file holds the rules the
board's code and specs are built to, where the rule is a table or a definition rather than a sentence in one component. Each
section names the code that holds it. The views themselves are described by their code and specs; the artboards (A0 to A7 and
the `Mono` artboards) are the owner's drawings, kept in the owner's Claude artifacts.

## Display states: tone and shape

Every badge, dot, pill, meter and state-coloured element of the board takes its look from one table, so the design system knows
no state of the board. A look is a state tone of the design system, the shape of the state's dot, and four flags: a dashed edge,
a pulse while the work is under way, a check on finished work, a label struck through.

Built in: `page/board/utils/StateToneUtil.ts`, `page/board/utils/JobStateUtil.ts`.
Held by: `page/board/utils/StateToneUtil.spec.ts`.

| Display state | Tone | Dot | Dashed edge | Pulses | Checked | Struck |
| --- | --- | --- | --- | --- | --- | --- |
| `draft` | `accent-outline` | `dashed-ring` | yes | no | no | no |
| `ready-for-review` | `accent-outline` | `dashed-ring` | yes | no | no | no |
| `committed` | `neutral` | `dashed-ring` | yes | no | no | no |
| `in-progress` | `accent` | `solid` | no | yes | no | no |
| `paused` | `neutral` | `solid` | no | no | no | no |
| `in-review` | `info-outline` | `ring` | yes | no | no | no |
| `reviewing` | `info` | `solid` | no | yes | no | no |
| `re-review` | `info-deep` | `solid` | no | yes | no | no |
| `reviewed` | `success` | `solid` | no | no | no | no |
| `delivered` | `ink` | `solid` | no | no | yes | no |
| `abandoned` | `muted` | `ring` | no | no | no | yes |
| `network-outage` (a job that waits) | `neutral` | `dashed-ring` | yes | no | no | no |
| `not-supervised` (a job that waits) | `neutral` | `dashed-ring` | yes | no | no | no |

- Work not yet started has a dashed edge and a dashed ring; work waiting for review a dashed edge and a ring.
- A dot takes the tone and the dot shape. A state pill takes only the dashed edge and the struck label; its colours come from the
  head it sits in. A `state` tag takes the tone and the dot shape.
- An absent state has no tone, so its element reads the colours around it.
- A ready ticket, one nothing holds back, is the plain `accent` look: solid dot, no flag.
- An interrupted job that waits on a network outage or on a lost supervision (`lease-ended`) looks as `network-outage` or
  `not-supervised`: dashed and neutral, never the failure tone. A job interrupted by any other cause, and a job that resumed,
  look as their job state.

A job state looks like the display state nearest its meaning:

| Job state | Looks like |
| --- | --- |
| `launching`, `preparing` | `committed` |
| `running` | `in-progress` |
| `waiting-for-answer`, `awaiting-answer`, `interrupted`, `stopping` | `paused` |
| `in-customs`, `gating`, `merging-main` | `in-review` |
| `merging`, `landing` | `reviewed` |

## Kanban lanes and card shapes

The Kanban has six lanes, in this order, and no lane of the drafts' own. A lane's head takes its colours from the display state
it names.

Built in: `page/board/views/kanban/KanbanModel.ts`.
Held by: `page/board/views/kanban/KanbanModel.spec.ts`.

| Lane | Head colours of | Tickets in it | Empty text | Head hover leads with |
| --- | --- | --- | --- | --- |
| Ready | `committed` | `draft`, `ready-for-review`, `committed` | "Nothing waiting to start." | – |
| Building | `in-progress` | `in-progress` | "Nothing being built." | – |
| In review | `reviewing` | `in-review` | "Nothing in review." | – |
| Merge queue | `reviewed` | `reviewed`, and any ticket queued for the merge | "Nothing awaiting merge." | "by priority" |
| Done | `delivered` | `delivered` | "Nothing done yet." | "newest first" |
| Abandoned | `abandoned` | `abandoned` | "Nothing abandoned." | "newest first" |

A card waits for a person or never started in the states `draft`, `ready-for-review`, `paused`, `in-review` and `abandoned`, and
is drawn dashed. A card in `in-progress`, `reviewing` or `re-review` pulses while the board is live.

## The dependency model

The Waves tab, the epic cards and the Kanban's wave order share one model of the tickets' dependencies. Which ticket is ready is
the forge's, served in the board's ready tickets; a wave says only what stands in front of a ticket.

Built in: `page/board/utils/DependencyGraphUtil.ts`, `page/board/@types/DependencyGraph.ts`.
Held by: `page/board/utils/DependencyGraphUtil.spec.ts`.

- **Settled.** A ticket whose forge fact `settlesADependency` is true no longer holds its dependents back. An abandoned ticket
  leaves the graph.
- **Open.** Any other ticket of the graph. An open ticket enters the waves unless it is a `draft`, a `ready-for-review` ticket or
  a `committed` ticket whose resolved priority is `low`. A ticket left out of the waves is drawn in no wave, yet still holds its
  dependents back.
- **Wave.** An open ticket's wave is the length of the longest chain of open dependencies in front of it, measured over every
  open ticket, those left out of the waves too. Wave 0 is labelled "Now", wave n "Wave n+1". A wave can be empty, its tickets
  all waiting on one left out of the waves. A wave of exactly one ticket is narrow: the bottleneck signal.
- **Held.** The open tickets in the waves that wait on a ticket, directly or further down the chain. A ticket two paths reach is
  held once.
- **Upstream.** Every ticket a ticket depends on, directly or further up the chain.
- **Pace path.** The chain from the last wave back to the first: in the last wave the ticket that holds the most, then in each
  earlier wave the dependency it was measured through that holds the most. A tie goes to the lowest id. Within a wave the pace
  path's ticket comes first, then the ticket that holds the most, then the lowest id.
- **Unlocks.** The direct dependents in the waves that can start the moment a ticket finishes: every open dependency they have is
  that ticket or upstream of it.
- **Cross-epic link.** A dependency whose two tickets have different primary epics; a ticket's primary epic is its first.
- **Slots.** The board's concurrency limit, passed in and shown as is.
- A cycle is cut where it closes, an unknown id is ignored, and an empty board gives an empty graph; none of them throws.

## Agent-written HTML in a sandboxed frame

Agent-written HTML reaches the DOM only as the `srcdoc` of one frame, whose `sandbox` attribute is exactly
`allow-same-origin allow-popups allow-popups-to-escape-sandbox`. Without `allow-scripts` nothing in the HTML runs;
`allow-same-origin` lets the page size the frame to its content and lets the frame load the page's own stylesheets; every link
opens in a new tab. The frame follows the page's theme. The frame's document is built through the DOM, so every value the page
sets reaches it as text or as an attribute, never as markup, and a planted image, script or link is no element of the board's
own document.

Built in: `page/board/sandboxed-html/SandboxedHtmlFrame.tsx`, `page/board/sandboxed-html/SandboxedHtmlDocument.ts`.
Held by: `page/board/sandboxed-html/SandboxedHtmlDocument.dom.tsx`, `page/board/views/detail-panel/DetailPanel.dom.tsx`,
`page/board/views/epics/EpicsView.dom.tsx`.

| Placement | Where | Frame title |
| --- | --- | --- |
| A ticket's body | the ticket detail panel, a row's detail, the question panel's background column | "Description of <ticket title>" |
| An epic's description | an epic card, inside a disclosure; the frame is built only once the disclosure opens, and a description that says no more than its summary offers no disclosure | "<epic title> description" |
| The constitution's preview | the Constitution step | "Constitution preview" |

## The pipeline flow: what a node opens

A double-click or Enter on a step of the pipeline flow opens what the forge serves as the node's `dialogTarget`. While a question
that the node names is open, the node opens that question first, and its own dialog waits for the answer.

Built in: `page/board/views/pipeline/flow/PipelineFlowModel.ts` (`openActionOf`), `page/board/views/pipeline/flow/StepCard.tsx`,
`page/board/views/pipeline/gates/GateRow.tsx`, `page/board/views/pipeline/dialogs/PipelineDialogs.tsx`.
Held by: `page/board/views/pipeline/flow/PipelineFlowModel.spec.ts`, `page/board/views/pipeline/dialogs/GateDialog.dom.tsx`.

| Node or row | Opens | Its open label |
| --- | --- | --- |
| Ticket creation, Builder | the agent step dialog | "Open the <step> step" |
| Review | the review step dialog | "Open the Review step" |
| The re-review after the review gates | the review step dialog, at its re-review section | "Open the Re-review step" |
| Merge main into the tree before review | nothing: nothing on it is set; its derived meter's tooltip names the Builder step | none |
| Merge main into the tree before Human code review, and in the Airlock | the merge step dialog | "Open the Merge main into the tree step" |
| The re-review after either of those merges | the merge step dialog, at its re-review section | "Open the Re-review step" |
| A Gates step | that phase's gates table | "Show the <phase> gates" |
| A switch (Human ticket review, Human code review), an outcome or the target | nothing | none |
| A gate row of a gates table | the Gate dialog for that gate, in that table's phase | – |
| A prepare row | the Gate dialog for that prepare step | – |

A gate pill on a step card opens nothing. "Add <phase> gate" and "Add prepare step" open the Gate dialog empty.

## The pipeline artboards and their fixtures

Each pipeline spec reads one whole board from `page/board/testing/PipelineFixture.ts`, by name; no view keeps fixtures of its own.
A fixture named by an artboard's mark is that artboard's state, and a suffix names a variant of it (`A2-question-open`).

| Mark | The state it draws |
| --- | --- |
| A0 | Setup: no pipeline yet |
| A0b | Resuming a setup |
| A1 | Research: the pipeline agent reads the repository |
| A2 | Pipeline design: the proposal and its questions |
| A3 | The agent step dialog |
| A3b | The constitution |
| A4 | The first Apply |
| A5 | The flow goes live |
| A6 | Editing a running board's pipeline |
| A6b | Apply changes: the change list |
| A7 | The minimal pipeline |
| `Mono…` | A forge over entities: `MonoEntities`, `MonoEntitiesFold`, `MonoResearch`, `MonoConstitution`, `MonoDesignEntity`, `MonoDesignForge`, `MonoCrossing`, `MonoCopyGates`, `MonoApply`, `MonoAssignTickets`, `MonoEditing`, `MonoApplyChanges`, `MonoLive`; fixtures `mono-design`, `mono-editing`, `mono-live` and `page/board/testing/EntitiesStepFixture.ts` |

The fixtures named `flow-…`, `profile-…` and `header-…` are states of the flow, of a gate profile and of the header that no
artboard draws as a whole.

## Flint on the board

Flint answers the board in three ways. Each trigger is a pure function in a model file with a plain spec; a component only
registers the habitat and sends what the model gives. Flint answers a cue only while it lives in the habitat that sends it.

| Way | For | How |
| --- | --- | --- |
| Copy | What one job does now | The agent panel's copy intent, from the job's kind, state and facts. |
| Cue | A change that belongs to one view | The view registers a habitat with a suggestion per cue and sends the cue when its facts change. |
| Board occasion | A change of the whole board, wherever Flint is | One model compares the last reading of the board with the next and gives the occasions; the host performs the first. |

### Flint slots: the cue of a slot that stands for jobs

A Flint slot stands for the agent its screen shows. A slot that stands for jobs (the Kanban's activity strip, the Agents view's
job panel, the ticket detail's state card) takes its cue from the job:

- a running job whose role is `reviewer`, `re-reviewer` or `conflict-re-reviewer` reviews (`agent-reviews`); a job stored without
  a role reviews when its kind is `review`;
- every other running job writes (`agent-writes`);
- no job, and a job that does not run (it launches, gates, waits on User, was interrupted, stops or ended), is idle
  (`agent-is-idle`);
- a slot of several jobs follows the first running job in the order given, the strip's order, and is idle when none runs.

Built in: `page/board/utils/FlintSlotCueUtil.ts`, `page/board/flint/FlintSlotCues.ts`, `page/board/flint/FlintSlotHabitats.ts`.
Held by: `page/board/utils/FlintSlotCueUtil.spec.ts`, `page/board/flint/FlintSlotHabitats.spec.ts`.

### Flint in the agent panel: copy and cues

In the Agents view Flint is one of the crew. It copies the selected job while that job has something to copy, else the first job
that has. The copy intent of a job is the first row that matches:

| Job fact | Intent |
| --- | --- |
| state `interrupted` and `interruption` is `usage-limit` | `out-of-fuel` |
| `silentSweeps` more than 0 | `listen` |
| `stopRequest` is `wind-down` | `wind-down` |
| state `launching` | `strike-spark` |
| state `preparing` | `fasten` |
| state `waiting-for-answer` or `awaiting-answer` | `ask` |
| state `in-customs` | `customs` |
| state `gating` | `gate-run` |
| state `merging`, Airlock phase `merge-in` | `merge` |
| state `merging`, Airlock phase `resolving` | `conflict` |
| state `merging`, Airlock phase `gating` | `gate-run` |
| state `merging`, Airlock phase `fixing` | `type-busy` |
| state `merging` with Airlock phase `landing`, or state `landing` | `airlock` |
| state `running`, kind `build` | `type` |
| state `running`, kind `review` | `review` |
| state `running`, kind `product-owner` | `interview` |
| state `running`, kind `pipeline-agent` | `survey` |
| state `running`, kind `merge` or `merge-agent` | `merge` |
| state `running`, kind `refresh` | `fasten` |
| state `running`, kind `assistant` | `research` |

`strike-spark` and `wind-down` are one actions: each shows one time for a job, through its cue, and the copy then takes the next
row that matches. A job that appears launching is answered by its `strike-spark` alone, not greeted.

The cues of the agent panel, each once per change between two payloads, in this order:

| Change | Cue | Response |
| --- | --- | --- |
| A job enters the interruption `handoff-red` | `gate-failed` | `gate-failed` |
| A job's `crashResumes` goes up | `job-resumed-after-crash` | `crash-resume` |
| A job's `stopRequest` becomes `stop` | `job-stop-requested` | `forced-stop` |
| A job's `stopRequest` becomes `fresh` | `job-fresh-requested` | `molt` |
| A job ends with outcome `landed` or `integrated` | `job-landed` | `ship` |
| `agentsInFlight` goes up and stays below the limit, while no job launches | `slot-filled` | `slots` |
| `agentsInFlight` reaches the limit while a ready ticket that is not held waits, and no job launches | `no-slot-free` | `slots-full` |

Besides these, a job that appears is waved to (`agent-appears`), some agent with work to copy is copied (`agent-works`), and with
every agent idle while Hephaestus serves and is not paused Flint reads the playbook (`all-agents-idle`, `playbook`).

Built in: `page/board/views/agents/AgentPanelSpriteModel.ts`, `page/board/views/agents/AgentPanelSpriteHabitat.ts`.
Held by: `page/board/views/agents/AgentPanelSpriteModel.spec.ts`.

### Flint's board occasions

Each row that a change of the board matches is an occasion, in this order; the host performs the first. A steady pose stays until
the next occasion or cue. The first board is no change.

| Change from one reading of the board to the next | Intent |
| --- | --- |
| The event stream's connection becomes `down` | `unplugged` |
| Hephaestus's state becomes `down` | `bank-fire` |
| Hephaestus's state becomes `passing-baton`, or its `generation` goes up after a board that showed no pass | `baton-pass` |
| The `generation` went up and jobs are in flight | `regroup` |
| `usage` gets a `resetsAt` | `out-of-fuel` |
| `usage` loses its `resetsAt` | `refuel` |
| `paused` becomes true | `hold` |
| An incident opens, unless Flint lives in the questions habitat | `intercept` |
| An incident settles, unless Flint lives in the questions habitat | `happy` |
| A newer Apply of the pipeline is read | `happy` |
| Hephaestus refused one more command | `refuse` |
| The connection comes back `live` from `down` | `wave` |

A `connecting` stream is no settled state: the last settled connection is kept in its place, so a stream that keeps reopening is
unplugged once. The `watcher-spark` attendant shows one spark per agent in flight, at most 4; it is set on each board, not as an
occasion.

Built in: `page/board/flint/BoardOccasionModel.ts`, `page/board/flint/UseBoardOccasions.ts`.
Held by: `page/board/flint/BoardOccasionModel.spec.ts`.

### Flint's habitats on the board views

Each view below marks its root as a workplace of Flint, registers a habitat and sends these cues, each row once per change between
two payloads, in the order of the table. A behaviour that takes one of the view's elements is performed through Flint's handle
with that element, only while Flint lives in the habitat; with the element not on the page its fallback cue is sent. The facts a
view mounts with are no change.

| Habitat (views) | Change | Cue | Response |
| --- | --- | --- | --- |
| `questions` (Questions, question panel) | A decision is open and none is selected | `decision-waits` | `ask` |
| | The same, after User selected another decision than the oldest two times while the oldest stayed the oldest | `oldest-decision-passed` | `ask-knock` |
| | An incident with a default move opens | `incident-opened` | `incident-fuse` |
| | An incident is handled, answered or takes its default move | `incident-settled` | `happy` |
| | A decision opened as a `waiver` is answered | `waiver-answered` | `waiver` |
| | Any other decision is answered | `decision-answered` | `happy` |
| `merge-queue` (Merge queue) | A target's Airlock gets a holder | `airlock-taken` | `airlock` |
| | A candidate's forecast against its target becomes `conflicting` | `conflict-predicted` | `conflict` |
| | A ticket joins a target's order | `ticket-queued` | `chain` |
| `tickets` (Tickets, Kanban) | A ticket goes from `draft` to `committed` | `draft-readied` | `ink-draft` |
| | A ticket appears that no review found and that names no bug source | `ticket-filed` | `make-ticket` |
| | A ticket's resolved priority changes | `priority-changed` | `reorder` |
| | A ticket's `dependsOn` gets an id | `dependency-added` | `chain` |
| | A ticket's `hold` is set | `ticket-held` | `hold` |
| | A ticket becomes `delivered` | `ticket-delivered` | `ship` |
| | A ticket with `foundInReview` and no `introducedBy` appears | `review-filed-a-ticket` | `bug-jar` |
| | A ticket with `introducedBy` appears | – | `chase-bug` from the row or card of the ticket it names; `escaped-bug` (`bug-source-is-not-shown`) when that is not on the page |
| `epics` (Epics) | A ticket's `epics` gets a key | `ticket-joined-an-epic` | `ribbon` |
| `timeline` (Progress) | A ticket becomes `in-progress` | – | `lay-bar-along` the row of the ticket's own task; `lay-bar` (`started-bar-is-not-shown`) when that row is not shown |
| `chat` (Intake) | A filing draft's state becomes `researching`, or a draft appears researching | `draft-is-researching` | `research` |

Built in: `page/board/flint/UseHabitatHappenings.ts`, `page/board/flint/QuestionsSpriteModel.ts`,
`page/board/flint/TicketsSpriteModel.ts`, `page/board/views/merge-queue/MergeQueueSpriteModel.ts`,
`page/board/views/epics/EpicsSpriteModel.ts`, `page/board/views/progress/TimelineSpriteModel.ts`,
`page/board/views/intake/IntakeSpriteModel.ts`, and each habitat's `*SpriteHabitat.ts`.
Held by: the `*SpriteModel.spec.ts` beside each model, `page/board/flint/UseHabitatHappenings.dom.tsx`.
