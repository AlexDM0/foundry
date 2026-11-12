# Control: one contract, three doors

> **Question:** How does any change reach the board, from User, a session or a button?
> **Time:** 20 minutes.
> **Read first:** [Overview](../concepts/overview.md), [The Pass](the-pass.md), [Storage](../data-model/storage.md).
> **Next:** [Confinement](confinement.md), [Questions and incidents](questions-and-incidents.md), [CLI](../cli.md).

## In one screen

There are three doors to the [board](../glossary.md#board): User types a CLI verb (`forge ticket add`), a
confined agent [session](../glossary.md#session) runs the same verb, or User presses a button in the
[Bridge](../glossary.md#bridge). All three end in `ControlService.apply`, inside one
[lock hold](../glossary.md#lock-hold) of `writeTracker` (below, "the hold"). Every control a session or the Bridge can
issue is one `ControlCommand`, a plain JSON value, and so is nearly every change User makes.

![Three doors. A verb at a terminal takes the lock itself, Overseer up or down. A session writes a Hatch request, read by a live Overseer and checked by the Bouncer inside its hold. The Bridge posts to the Overseer's API. All three reach ControlService.apply inside one writeTracker hold, which writes the board and the log.](../figures/control-and-hatch/three-doors.png)

*Notice that the Bouncer sits on one door, and that only the terminal door avoids the dashed box.*

`ControlService.apply` only records. It spawns and signals nothing, except that `worktree-repair` runs git in the hold.
The [Overseer](../glossary.md#overseer) reads what was recorded and carries it out, so a verb at a terminal works with
the Overseer down. Only `overseer-stop` and `overseer-restart` go to the live Overseer instead.

A session cannot write [`<data>`](../glossary.md#reading-names), so it cannot take the lock. It drops a request file in
its [Hatch](../glossary.md#hatch) folder, and the Overseer applies the request in its own hold. The
[Bouncer](../glossary.md#bouncer) stands at this door only and decides what the [job](../glossary.md#job)'s
[role](../glossary.md#role) may do. Identity is the folder: a request that names a job or a role is refused for naming
it. The folder holds against Bash only; [Identity is a folder](#identity-is-a-folder) shows the path that stays open.

## One contract

`ControlCommand` is one union of 65 kinds, counted from `CONTROL_COMMAND_KINDS`. Each value is plain
JSON, so it survives a Hatch file or an HTTP body unchanged. A ticket is named as it was written (`3`, `003`, `#3`) and
resolved inside the hold by `ticketIdOfReference`. Eleven applier files implement the kinds, and a `satisfies` check on
`CONTROL_APPLIERS` fails the type-check if a kind has no applier.

A few verbs only User runs by hand, such as `log` and `ticket status`, have no command
(`NOT_RELAYABLE_MUTATING_VERBS` in `cli/ControlContract.spec.ts`). They never cross the Hatch or the API.

| Applier file in `src/services/control/` | Kinds | Reaches an applier through a Hatch |
| --- | --- | --- |
| `TicketControls.ts` (11) | `ticket-add`, `ticket-edit`, `ticket-depends`, `ticket-priority`, `ticket-epic`, `ticket-abandon`, `ticket-ready`, `ticket-submit`, `ticket-network`, `ticket-hold`, `ticket-unhold` | All but `ticket-ready`, `ticket-submit` and the last two |
| `FilingControls.ts` (10) | `epic-add`, `draft-open`, `draft-claim`, `draft-release`, `draft-note`, `draft-ask`, `draft-answer`, `draft-drop`, `draft-close`, `draft-abandon` | All, [product owner](../glossary.md#product-owner) only |
| `IncidentControls.ts` (4) | `ticket-park`, `incident-answer`, `incident-note`, `incident-escalate` | All, [Assistant](../glossary.md#assistant) only |
| `DecisionControls.ts` (1) | `decision-answer` | None |
| `JobControls.ts` (9) | `job-stop`, `job-fresh`, `job-stop-all`, `job-message`, `intake-start`, `pipeline-agent-advise`, `intake-close`, `intake-title`, `question-options` | `intake-close`, `intake-title` and `question-options` only |
| `RepairControls.ts` (2) | `worktree-repair`, `gate-retry` | `worktree-repair` only |
| `OverseerControls.ts` (4) | `overseer-pause`, `overseer-resume`, `overseer-stop`, `overseer-restart` | None |
| `SettingControls.ts` (7) | `concurrency-set`, `pipeline-prepare-step-set`, `pipeline-gate-add`, `pipeline-gate-order`, `pipeline-gates-none`, `pipeline-gate-remove`, `pipeline-approval-set` | None |
| `AirlockControls.ts` (2) | `merge-accept`, `merge-update` | None |
| `PipelineSetupControls.ts` (10) | `pipeline-setup-start`, `pipeline-setup-billing`, `pipeline-setup-step`, `pipeline-setup-start-over`, `pipeline-setup-answer`, `pipeline-constitution-edit`, `pipeline-update-start`, `pipeline-draft-edit`, `pipeline-draft-undo`, `pipeline-draft-discard` | None |
| `PipelineAgentControls.ts` (5) | `pipeline-finding-record`, `pipeline-question-ask`, `pipeline-constitution-draft`, `pipeline-draft-propose`, `pipeline-step-ready` | All, [pipeline agent](../glossary.md#pipeline-agent) only |

So 30 of the 65 kinds can get through the Hatch at all, for some role. The other 35 are User's alone: their verbs
still relay, and the Overseer refuses them in its hold.

`ControlService.apply` returns one of two outcomes. It is `done`, unless the applier's result says `changed: false`, and
then it is `nothing-to-do`: the Board found the change already made, as a `gate-retry` with no
[incident](../glossary.md#incident) to settle. Anything else leaves as a [refusal](../glossary.md#refusal), which
carries a code and facts; only the CLI words it. [Refusals](../reference/refusals.md) holds every wording.

`overseer-stop` and `overseer-restart` are the two kinds that never apply. Their verbs talk to the live Overseer, and
the API route diverts them before the hold. `ControlService.apply` refuses both `overseer-control-is-runtime-only`, so
they are never mistaken for a board change.

## Records only

A control depends on no running process, so User can stop, redirect or answer work while the Overseer is down, and
the next [Pass](../glossary.md#pass) acts on the stored result. That holds because `ControlService` writes the board and
the [log](../glossary.md#log) and never spawns, signals or reconciles.

The doors differ in who opens the hold:

| Door | Who opens the hold | With the Overseer down |
| --- | --- | --- |
| Terminal verb | The verb, through `openTrackerForWriting` | Works; the Overseer acts when it starts |
| Hatch request | The Overseer, in the Pass | The file waits; the verb prints `queued` |
| `POST /api/commands` | The Overseer's route, in a hold of its own | No server to answer |

After the hold, a terminal verb nudges a live Overseer and the API route wakes it, so the Pass runs at once. Neither is
needed: `DataFolderWatch` sees the write anyway. The route's token, statuses and bodies are in [Overseer
API](../reference/overseer-api.md).

## How a recorded control reaches a session

A control writes the board in one step and reaches a live session in another. Nothing in the hold touches a session.
`JobControlDelivery.deliverJobControls` runs after each Pass hold and turns what is stored into frames for each job's
[Watcher](../glossary.md#watcher). A frame is one message the Overseer sends to a Watcher's socket;
[Watchers](watchers.md) lists them. A [marker](../glossary.md#marker) records that a frame went out.

![A job control is recorded in a hold. If no Overseer is up it waits on disk. After a later Pass hold, deliverJobControls walks each job's frames. A frame with a marker is skipped and the next one is tried. If the Watcher is not live or did not take the frame, the job's remaining frames wait for a later Pass. Otherwise the Watcher takes the frame and the marker is written; the Watcher hands it to the session and nothing acknowledges that. A crash before the marker sends the frame again. With no frames left, delivery moves to the next job.](../figures/control-and-hatch/control-to-session.png)

*Notice that the marker comes last: a crash before it resends the frame, and a restart after it skips the frame.*

Each control becomes one or two frames, each with its own marker. A wind-down asks a running session to finish and
report instead of killing it; a stop ends it. The `stop` frame carries `SESSION_STOP_GRACE_MILLISECONDS` (5000).

<details>
<summary>Every control, its frames and its markers</summary>

| Control | What the hold stored | Frame and marker, in send order |
| --- | --- | --- |
| `job message` | A `job-messaged` log record | A chat line, marker `message-<count>`, `<count>` numbering that job's messages in log order |
| `job wind-down` | `stopRequest: wind-down` | While `running`, the [wind-down](../glossary.md#wind-down) turn as a chat line, marker `wind-down` |
| `job stop` of an Assistant or product owner | State `stopping`, `stopRequest: stop` | `close-input`, marker `input-closed-<instance>`; then `stop`, marker `stop-<instance>` |
| An Assistant or product owner job moved to `stopping` with no stop request, as `intake close` | State `stopping` | `close-input` only |
| `job stop` or `job fresh` of a [build job](../glossary.md#build-job) or review job | State `stopping` | `stop`, marker `stop-sent` in the job folder (`stop-sent-<instance>` past the first instance), from `JobLaunch.deliverBuildJobFrames` |
| `job stop` of a [merge agent](../glossary.md#merge-agent) or [pipeline agent](../glossary.md#pipeline-agent), `job fresh` of a merge agent | State `stopping` | No frame: neither `deliverJobControls` nor `deliverBuildJobFrames` covers these kinds |

`<instance>` is the [Watcher instance](../glossary.md#watcher-instance). Every marker but `stop-sent` is an empty file
in the job folder's `control-frames/`.

</details>

> **As built.** A `job stop` of a merge agent or pipeline agent changes its state and sends no frame:
> [no stop frame](../reference/known-gaps.md#gap-stop-of-merge-agent-sends-no-frame).

Three rules govern delivery:

- **In order, inside `deliverJobControls`.** Its frames for a job go out in the table's order, and `deliverInOrder`
  stops at the first one not taken, so none overtakes another. A build or review job's `stop` is outside this order:
  `deliverBuildJobFrames` sends it earlier in the Pass, and a message not yet taken does not hold it back.
- **Live Watchers only.** A frame waits until `WatcherFleet.sendFramesOnce` finds its Watcher live. A frame still
  waiting when its job leaves the board is never sent.
- **The marker comes last.** It is written once `sendFrames` answers true, which is what "took the frame" means: the
  Watcher accepted the connection and the frames were written to it. No acknowledgement comes back. A crash between the
  send and the marker sends the frame again, so a session can get a frame twice. A Watcher that drops the connection
  after accepting it loses the frame, and the marker is still written. [Failure and
  recovery](failure-and-recovery.md) sets this beside the other deliveries, and the compatibility section of
  [Watchers](watchers.md) has the exception for a Watcher below the supported protocol.

![Pass 1 of a session job being stopped: message-1 is taken and marked, message-2 is not taken, so message-3, close-input and stop wait. In Pass 2 the marker skips message-1, delivery resumes at message-2 and takes the rest. A build job's stop goes out earlier in the Pass through deliverBuildJobFrames, so a message not yet taken holds nothing back.](../figures/control-and-hatch/frame-queue.png)

*Notice that a later Pass resumes at the frame that stalled, and that a build job's `stop` never joins this queue.*

An Assistant is the exception for messages. `JobControlDelivery` skips them, and `AssistantSession` numbers each as a
chat when the Assistant is idle. See [Assistant and intake](assistant-and-intake.md).

## Why the Hatch exists

`<data>` is write-denied to every session, so a session cannot take the lock.
[Who may write what](confinement.md#who-may-write-what) lists what enforces that. The Hatch is the session's one way
out, and it uses files rather than a socket: a request survives an Overseer that is down, restarting or mid [Baton
pass](../glossary.md#baton-pass), and the sandbox needs to open nothing but one folder. [Identity is a
folder](#identity-is-a-folder) draws who writes what.

```text
<worktrees>/hatch/J<n>/requests/<requestId>.json   the session writes, atomically
<worktrees>/hatch/J<n>/replies/<requestId>.json    the Overseer writes, atomically, after the hold commits
```

[`<worktrees>`](../glossary.md#reading-names) is the worktrees folder and `J<n>` is the job id.

```json
{
  "hatchFormatVersion": 1,
  "requestId": "0b7c41de-5a0e-4e6e-9f20-3a1d7e52c9aa",
  "command": {
    "kind": "ticket-add", "title": "Double-click a role to edit it", "type": "bug", "priority": "low",
    "dependsOn": [], "epics": [], "network": [], "introducedBy": null, "foundInReview": null, "bodyText": null
  },
  "bodyText": "## Report\nA double-click does nothing.\n"
}
```

A reply is `{hatchFormatVersion, requestId, outcome, ticketIds}` for `done` and `nothing-to-do`, or
`{hatchFormatVersion, requestId, outcome: "refused", status, detail}`. A body travels beside its command for
`ticket-add`, `ticket-edit`, `epic-add` and the constitution of `pipeline-constitution-draft`, and `requestReadingOf`
puts it back.

## The session side

A relayed verb writes a request, waits briefly, and prints the outcome. `queued` promises the request is kept and
decided at most once, not that it succeeds; a session never repeats it.

One verb has one code path. It parses its arguments as usual, builds its `ControlCommand`, then calls
`hatchWhenUnderJob(context, command)`. Outside a job that call returns at once and the verb goes on to the
[tracker](../glossary.md#tracker). Under a job it never returns: it ends the verb through `HatchConcluded` or a refusal.

A process is under a job when both `FORGE_JOB_ID` and `FORGE_HATCH_DIRECTORY` are set
(`jobContextOfThisProcess`); one alone counts as no job. A relayed verb skips the install-version check, because the
Overseer applies it.

The verb writes the request, then looks for the reply `HATCH_REPLY_TRIES` (20) times, the first at once and the others
`HATCH_REPLY_INTERVAL_MILLISECONDS` (250) apart.

| What the verb finds | It prints | Exit |
| --- | --- | --- |
| `done` or `nothing-to-do` | That word, the request id and any tickets | 0 |
| `refused` | The refusal, worded as a direct run words it | 1, or 2 for `unrepaired` |
| A reply it cannot read | `malformed-hatch-reply` | 2 |
| No reply in time | `queued <requestId>` | 0 |

![Sequence across session, Overseer, board and Hatch folder. The session writes the request and looks for a reply up to HATCH_REPLY_TRIES times. The Overseer reads it outside the lock, then in its hold runs the request checks, the Bouncer and ControlService, and recordHatchApplied logs hatch-applied whether a rung refused or the command applied. After the commit it writes the reply. Two alternatives follow. If the tries run out first, the session prints queued at exit 0, a later Pass decides the request and nobody reads the reply. If it is still looking when the reply lands, it prints done or nothing-to-do at exit 0, or a refusal at exit 1 or 2. A crash after the commit leaves the request applied with no reply.](../figures/control-and-hatch/hatch-sequence.png)

*Notice that `queued` means no answer yet: the request may still apply or be refused, and the session never reads
which.*

`queued` is exit 0 on purpose, and the session goes on working. The request stays in the folder and a later Pass decides
it, once, while its job stays in a readable state. If the job leaves that state first, the request is dropped. A repeat
would be a second request with its own id.

A reviewer whose filing came back `queued` has no ticket id yet, so its [report](../glossary.md#report) gives
`hatchRequestId` instead of `filedTicketId`, and [Customs](../glossary.md#customs) finds the ticket through the
`hatch-applied` record (`ticketIdFiledByRequest`).

## The Overseer side

The Overseer applies each request once, in its hold, before Watcher events, and writes the reply only after the commit.
[The Pass](the-pass.md) has the order of a whole Pass. A request written before a turn's `result`, the event that closes
a session's turn, is seen in the same Pass as that event and applies first. So an Assistant's move written before its
turn ended applies before the incident's default move, what code does to an incident nobody moved, is considered. See
[Questions and incidents](questions-and-incidents.md).

Outside the lock, `HatchInbox.pendingRequestsOf` lists every request with no reply, for each job in a readable state. A
write in a Hatch folder wakes the Pass. `HATCH_READABLE_STATES` holds `launching`, `preparing`, `running`,
`waiting-for-answer`, `interrupted`, `awaiting-answer`, `in-customs` and `stopping`. A job in any other state has
nothing a session could still be waiting on, and its folder is not read. A request naming another numeric format
version is left for an Overseer that reads it, after a Baton pass.

In the hold, `applyPendingRequests` takes each request. It skips one whose job left the board or a readable state, or
whose id `hatchRequestIsApplied` finds. Otherwise it runs `replyOf` and always calls `recordHatchApplied`, which logs a
`hatch-applied` record of the request id, command kind and outcome, even for a refusal. That record is what makes a
request apply once whatever its verdict.

> **As built.** Two queued requests of one job apply in file-name order, which is not write order:
> [random order](../reference/known-gaps.md#gap-hatch-order-random).

Replies are written after the hold commits, never inside it. A request can be applied and get no reply, if the Overseer
crashes or loses the [Baton](../glossary.md#baton) after the commit. At the next Pass `hatchRequestIsApplied` skips it,
so no reply comes, the session sees `queued` and the effect stands. A lost reply never causes a second apply.

What a refusal does to the hold depends on where it happens:

| What stops the command | The hold | `hatch-applied` | Afterwards |
| --- | --- | --- | --- |
| A refusal at the terminal or the API | Abandoned; nothing stored | None | The caller sees the refusal |
| A refusal in `replyOf` | The Pass hold commits; what the applier changed stays | Logged | The reply reaches the session |
| Any other throw, in the Bouncer or an applier | The whole Pass hold fails | None | Nothing commits. Every later Pass reads the same request and fails the same way, so the board stops moving until the file is removed |

> **As built.** So what an applier changed before refusing stays on the board:
> [partial relayed commands](../reference/known-gaps.md#gap-refused-relayed-command-partial).

> **Careful.** `replyOf` turns only a `BoardRefusal` or an `OperationRefusal` with a detail into a reply, and only
> around `ControlService.apply`. Nothing checks that a command's fields fit its `kind`, so one misshapen request stops
> every Pass. A verb always builds a whole command, but a session can cause this by writing a request by hand.

> **As built.** One such file stops the board:
> [a misshapen request](../reference/known-gaps.md#gap-misshapen-request-stops-the-pass).

## Identity is a folder

![Session J7 writes a request into its own folder hatch/J7/requests/. Its Bash is stopped at another job's Hatch folder by the sandbox, but its Edit and Write tools get through, because no deny rule names that folder, and a request planted there acts as that job. At the data folder the sandbox stops Bash and a deny rule stops Edit and Write. The Overseer reads the request from the folder, maps folder J7 to the job record, which gives role builder, and writes the reply to hatch/J7/replies/. A request claiming role reviewer is refused hatch-identity-mismatch.](../figures/control-and-hatch/folder-is-credential.png)

*Notice that the role arrives from the job record, by way of the folder, and that the coral arrow reaches another job's
folder all the same.*

The Overseer learns who sent a request from one thing: the folder it was found in, mapped to that job's record.
Everything a request claims about itself is treated as forgery. `sandbox.filesystem.allowWrite` names only the job's own
Hatch folder, so a verb, which writes through Bash, reaches no other. The folder is the credential against Bash.

> **As built.** The Edit and Write tools are outside the sandbox and no deny rule names another job's Hatch folder, so a
> request can be planted there and acts as that job:
> [the other Hatch folder](../reference/known-gaps.md#gap-hatch-folder-edit-write-unnamed).

![A request naming another numeric version is left for a later Overseer, with no refusal. Any other request climbs a ladder of six rungs in order: parses, claims no identity, well formed, id equals file name, Bouncer admits, applier accepts. The rungs refuse malformed-hatch-request, hatch-identity-mismatch, malformed-hatch-request, hatch-identity-mismatch, role-command-refused with a reason, and board-refusal or the applier's detail. Past all six the command is applied.](../figures/control-and-hatch/refusal-ladder.png)

*Notice that a claimed identity is refused before the request's other fields are checked, and long before the role is
read.*

The first three rungs are `HatchFormatUtil.requestReadingOf`, and they run before the Overseer knows the command's kind
is real. `jobId` and `role` are refused on the request or its command, `admission` on the command, since only the
Bouncer stamps one. The fourth rung catches a request copied from another folder: its body names an id other than its
file name. The file name is the id the session waits on.

The fifth rung's reasons are the `RoleCommandRefusalReason` union. [Refusals](../reference/refusals.md) holds their
wording, and [The Bouncer](#the-bouncer) holds their conditions. The last rung is anything the applier refuses,
including a `BoardRefusal` wrapped as `board-refusal`.

## Which verbs run under a job

Under a job, `jobRouteOf` sends each verb one of three ways before anything else runs. Counts are at commit 029f32c9;
`cli/HatchUnderJob.spec.ts` holds the lists exact over all 89 verbs `cli/CommandTable.ts` answers. The Assistant's and
product owner's moves are in
[What each session may do through its Hatch](assistant-and-intake.md#what-each-session-may-do-through-its-hatch).

![Four verbs meet jobRouteOf. ticket show exits there and runs directly, read-only. log is refused there with verb-not-relayable. decide and ticket add become a Hatch request and meet the Bouncer. decide is refused role-command-refused, and ticket add from a builder is admitted to ControlService.apply.](../figures/control-and-hatch/two-checks.png)

*Notice that the two checks sit in series: relayed does not mean allowed.*

| Route | Count | Verbs (after `forge`) |
| --- | --- | --- |
| Direct, read-only | 21 | `help`, `status`, `usage`, `review-stats`, `version`, `ticket show`, `ticket list`, `epic show`, `epic list`, `draft show`, `draft list`, `hook bash-domains`, `hook session-start`, `oversee status`, `decisions`, `incidents`, `merges`, `jobs`, `job show`, `job attach`, `gate list` |
| Relayed through the Hatch | 46 | The verb of each kind in `RELAYED_VERB_OF_CONTROL_KIND`; `job stop` serves two kinds |
| Refused `verb-not-relayable`, exit 1 | 22 | `init`, `update`, `task`, `log`, `range`, `clear`, `open`, `await`, bare `hook`, bare `oversee`, `ticket reopen`, `ticket deliver`, `ticket status`, `ticket rereview`, `ticket link`, `ticket introduced-by`, `ticket size`, `ticket agent`, `ticket release-of`, `epic edit`, `epic remove`, `job wind-down` |

Four refusals surprise people:

- `log` is refused. A session cannot write a free line to the log; what it does is logged by the code around it.
- `job wind-down` is refused, though `job stop --all --wind-down` relays. `jobRouteOf` reads only
  `RELAYED_VERB_OF_CONTROL_KIND`, and `OTHER_VERBS_OF_CONTROL_KIND` is not in it. A `job-stop` carries `jobId`, so the
  second rung refuses it `hatch-identity-mismatch`; `job stop --all` relays as `job-stop-all`, which the Bouncer refuses
  from every role.
- `open` is refused because it launches a browser and registers the dashboard, though it writes no tracker file.
- `ticket reopen`, `ticket status` and the other User-only ticket verbs are refused: they are User's overrides.

`decide`, `concurrency` and `oversee pause` all relay, and the Bouncer refuses them from every role. The relay is
uniform so that one verb has one code path; the Bouncer is where the rule lives.

## The Bouncer

`Bouncer.verdictOf` is a pure table: a job record and a command go in, and a verdict comes out, admitted (perhaps
stamped) or refused with a reason. The job record is built fresh in the hold by `relayingJobOf`, with the tickets the
job filed and the incidents delivered to it. The Bouncer first refuses any command carrying a field only the Overseer
decides (`jobId`, `role`, `admission`), excepting `jobId` on the `JOB_TARGETING_KINDS`, an exception no request reaches,
because the second rung refused the `jobId` already.

> **As built.** So the Assistant's job-targeting moves never reach the Bouncer's table: [Assistant job
> moves](../reference/known-gaps.md#gap-assistant-job-moves-refused-at-hatch).

An admission can stamp the command. `filedByJob` is the ticket frontmatter key naming the job that filed it, and
`finderTicketIds` are the job's tickets, which a [finding](../glossary.md#finding) waits for in `dependsOn` and whose
first group it joins.

| Role | Admits | Stamps |
| --- | --- | --- |
| `builder`, `reviewer`, in the Airlock too | `ticket-add`, shaped as a low finding: priority `low`, and no `model`, `effort`, `group`, `dependsOn`, `epics` or `network`. At most `WORKER_FILINGS_PER_JOB` (10). And `question-options`. | `filedByJob`, and the job's tickets as `finderTicketIds`; `question-options` gets its `jobId` from the folder |
| `product-owner` | `ticket-add`; `intake-close`; `intake-title`; `question-options`; `ticket-depends`; `epic-add`; every `draft-*` kind. On a [draft ticket](../glossary.md#draft-ticket) it filed: `ticket-edit`, `ticket-priority`, `ticket-network`, `ticket-epic`, `ticket-abandon`. Never `ticket-ready`. | `filedByJob`; `intake-close`, `intake-title` and `question-options` get their `jobId` from the folder |
| `assistant` | Only a command naming an `incidentId` delivered to this job, if that incident's kind allows the move | Nothing |
| `pipeline-agent` | `pipeline-finding-record`, `pipeline-question-ask`, `pipeline-constitution-draft`, `pipeline-draft-propose`, `pipeline-step-ready`, each only while the job is the agent of the open setup record; and `question-options`. Never a ticket verb, a gate profile or a pipeline check. | `jobId` from the folder, and `setupId`, the open setup record whose `agentJobId` is this job; a request naming a `setupId` is refused `hatch-identity-mismatch` |
| no role (a job that runs no agent) | Nothing | Nothing |

Each refusal carries one reason:

| Condition | Reason |
| --- | --- |
| A command carrying `jobId`, `role` or `admission` (only reachable behind the second rung, which refuses these first) | `hatch-identity-mismatch` |
| A worker's filing is misshapen | `worker-filing-flag` |
| A worker is past its limit | `worker-filing-limit` |
| A product owner's move names a ticket that is not its own draft | `not-own-draft` |
| An Assistant's move is outside a delivered incident, or its kind does not allow the move | `incident-move-not-allowed` |
| A pipeline agent's move names its own `setupId` | `hatch-identity-mismatch` |
| A pipeline agent's job is the agent of no open setup record | `job-serves-no-setup` |
| Anything else | `command-not-allowed-for-role` |

![A matrix of five callers against the nine applier families, with the number of kinds each may run. User at a terminal reaches all 47. Worker roles reach one Ticket kind. The product owner reaches 7 Ticket kinds, all 10 Filing kinds and 1 Job kind. The Assistant reaches all 4 Incident kinds and 1 Repair kind; its table also allows 2 Job kinds and 1 Repair kind, which the second rung refuses at the Hatch. Every other role reaches nothing.](../figures/control-and-hatch/reach-by-role.png)

*Notice that no two session roles share a family except Ticket.*

Stamps are why these keys can be trusted against a session. On the Hatch door only a Bouncer admission
stamps `filedByJob` and `finderTicketIds`, and a request cannot carry `admission`. A worker cannot set the finding's
`dependsOn` or `group` itself: its filing carrying either is refused `worker-filing-flag`. The API route checks only
that `kind` is known and does not strip `admission`, so the keys are trusted against sessions, not against a token
holder.

What a finding does after its filing is in [Assistant and intake](assistant-and-intake.md#the-findings-path).

One part of the Bouncer applies at every door. `Bouncer.incidentMoveVerdictOf` is shared with User:
`requireIncidentAllows` calls it for every caller naming an incident, so a `ticket park --incident` at a terminal obeys
the same table. The table itself, by incident kind, is in [Questions and incidents](questions-and-incidents.md).

## Moves worth a sentence

These moves have a rule a caller can trip on.

- **`job-stop`, wind-down.** A stop ends the job's session and a wind-down asks it to finish, though
  [not on a merge job](../reference/known-gaps.md#gap-job-stop-misses-merge). Each sets a
  [ticket hold](../glossary.md#ticket-hold) on the job's ticket, `stopped by User (J<n>)` or
  `wound down by User (J<n>)`, which the [Playbook](../glossary.md#playbook) never undoes. A job with no live session
  (`SESSIONLESS_STATES`) ends at once under `stop`, except a product owner, which always goes through `stopping`.
  Stopping a product owner withdraws its open [decisions](../glossary.md#decision). `job-stop-all` also pauses the
  Overseer and reaches only build, review and product-owner jobs (`STOPPABLE_BY_ALL_KINDS`).
- **`job-fresh`.** It replaces a job's agent: a stop ending `replaced`, so the Playbook launches the next
  [attempt](../glossary.md#attempt) on the same [worktree](../glossary.md#worktree). A job with no live session takes
  the same early end. It sets no ticket hold. A job with no ticket is refused `job-has-no-ticket`.
- **`job-message`.** It sends a job a chat line. Naming an incident, it refuses `job-is-product-owner` and
  `job-awaits-user-answer`, so a move can never talk over User. Without an incident, `reopenEndedJob` reopens a closed
  product owner, which resumes with the text. Any other finished job is refused `job-finished`.
- **`gate-retry`.** It settles an incident and changes nothing else, so the [Airlock](../glossary.md#airlock) gates
  the merged tree again or the
  Playbook launches the ticket's next attempt. With none open it answers `nothing-to-do`.

`worktree-repair` runs git inside the hold, so no launch can race the repair. It takes a step, and `recreate` and
`unlock` first refuse `worktree-in-use` while any job of the ticket
is on the board. A failed git step is refused `worktree-repair-failed`. The next launch creates a removed worktree again
from its branch.

<details>
<summary>What each repair step does</summary>

| Step | What it does in the hold |
| --- | --- |
| `prune` | `git worktree prune` |
| `reinstall` | Nothing on disk; the next launch reruns the [prepare steps](../glossary.md#prepare-step) |
| `recreate` | Saves tracked and untracked changes as `recreate-<next>.patch` in the job folder, `<next>` one above the highest there, then `git worktree remove --force`. Refused `worktree-has-uncommitted-work` if changes cannot be saved |
| `unlock` | Removes the stale `index.lock` |

</details>

## Adding a mutation

`cli/ControlContract.spec.ts` is a two-way guard, so a new verb cannot quietly bypass the contract and a stale entry
fails as loudly as a missing one.

![Three columns: ControlCommand kinds, the mutating verbs the command table answers, and NOT_RELAYABLE_MUTATING_VERBS. A kind links to its verb, and a list entry links to its verb. contractViolationsOf fails in four cases: a kind whose verb the table does not answer, a list entry the table does not answer, a verb with neither a kind nor a list entry, and a verb placed twice.](../figures/control-and-hatch/contract-guard.png)

*Notice that a verb's home is its kinds or a list, never neither and never both.*

To add a mutation:

1. Add a member to `ControlCommand`, plain JSON only.
2. Add its applier to the family's file. It records only and refuses with a wordless detail. The `satisfies` on
   `CONTROL_APPLIERS` fails until it exists.
3. Add its verb to `RELAYED_VERB_OF_CONTROL_KIND`, a `Record` that fails the type-check until it does.
4. Add the verb as [CLAUDE.md](../../CLAUDE.md) asks of a new command. Its handler calls `hatchWhenUnderJob` before
   `openTrackerForWriting`, and applies through `ControlService.apply`.
5. Add its arguments to `ARGUMENTS_OF_KIND` in `cli/HatchUnderJob.spec.ts`, typed to need every kind.
6. If a role may run it, add it to the `Bouncer` and to `Bouncer.spec.ts`. Otherwise nothing: refusal is the default.
7. Update [the CLI reference](../cli.md), and word any new refusal.

A mutating verb that should never relay goes on `NOT_RELAYABLE_MUTATING_VERBS` instead, as a verb User runs by hand.

## Invariants

1. Every kind but `overseer-stop` and `overseer-restart` reaches the board through `ControlService.apply`, inside a
   `writeTracker` hold.
2. An applier spawns nothing and signals nothing; `worktree-repair` alone runs git, inside the hold.
3. Every kind but `overseer-stop` and `overseer-restart` can apply with no Overseer running, at a terminal.
4. A session issues a control only through a Hatch folder, as a file; it takes no lock. Which folder is not guaranteed:
   [the other Hatch folder](../reference/known-gaps.md#gap-hatch-folder-edit-write-unnamed). Its questions and reports
   reach the board as events the Overseer reads: see [Questions and incidents](questions-and-incidents.md).
5. A request's job and role come from its folder; a request naming either is refused.
6. A request is applied at most once, and every request `replyOf` decides gets a `hatch-applied` record, refused ones
   included.
7. A reply is written only after the hold that decided it committed.
8. On the Hatch door only a Bouncer admission stamps `filedByJob` and `finderTicketIds`, and a request cannot carry
   `admission`.
9. `incidentMoveVerdictOf` binds every caller naming an incident, User included.
10. The frames `deliverJobControls` sends for a job are taken in order, and any frame's marker exists only after
    `sendFrames` answered true.

## In the code

| Concept | Path | Symbol | Held by |
| --- | --- | --- | --- |
| The contract | `src/shared/@types/ControlCommand.ts` | `ControlCommand` | `cli/ControlContract.spec.ts` |
| The one path | `src/services/control/ControlService.ts` | `ControlService.apply`, `CONTROL_COMMAND_KINDS` | `src/services/control/ControlService.spec.ts` |
| Terminal door | `cli/OpenTrackerForWriting.ts` | `openTrackerForWriting` | `cli/HatchUnderJob.spec.ts` |
| API door | `cli/overseer/routes/CommandRoute.ts` | `answerControlCommand` | `cli/overseer/routes/CommandRoute.spec.ts` |
| Verb routes | `cli/Main.ts`, `cli/constants/JobVerbs.ts` | `jobRouteOf`, `READ_ONLY_VERBS_UNDER_A_JOB`, `RELAYED_VERB_OF_CONTROL_KIND` | `cli/HatchUnderJob.spec.ts` |
| Session side | `cli/HatchUnderJob.ts` | `hatchWhenUnderJob`, `HatchConcluded` | `cli/HatchUnderJob.spec.ts` |
| Hatch files | `src/adapters/hatch/HatchFolder.ts`, `src/adapters/hatch/@types/HatchFormat.ts` | `writeHatchRequest`, `HatchRequest`, `HatchReply` | `cli/HatchUnderJob.spec.ts` |
| First three rungs | `src/adapters/hatch/utils/HatchFormatUtil.ts` | `requestReadingOf`, `replyReadingOf` | `src/adapters/hatch/utils/HatchFormatUtil.spec.ts` |
| Overseer side | `src/services/overseer/HatchInbox.ts` | `pendingRequestsOf`, `applyPendingRequests`, `replyOf`, `writeReplies` | `cli/overseer/OverseerDrivePass.spec.ts` |
| Role table | `src/services/control/Bouncer.ts` | `verdictOf`, `incidentMoveVerdictOf` | `src/services/control/Bouncer.spec.ts` |
| Reaching a session | `src/services/overseer/JobControlDelivery.ts`, `src/services/overseer/WatcherFleet.ts` | `deliverJobControls`, `sendFramesOnce` | `src/services/overseer/JobControlDelivery.integration.spec.ts` |
| A build job's stop | `src/services/overseer/JobLaunch.ts` | `deliverBuildJobFrames` | `src/services/overseer/JobLaunch.integration.spec.ts` |
| Worktree repair | `src/services/control/WorktreeRepair.ts` | `WorktreeRepair.repair` | `src/services/control/WorktreeRepair.spec.ts` |
