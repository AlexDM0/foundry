# Failure and recovery

> **Question:** For anything that can die or stall, what survives, what notices, and what happens next?
> **Time:** 15 minutes; the crash matrix is for lookup.
> **Read first:** [The Pass and the Playbook](the-pass.md), [Watchers](watchers.md),
> [State machines](../data-model/state-machines.md).
> **Next:** [Baton](baton.md), [Questions](questions-and-incidents.md),
> [Runbook](../operations/runbook.md#something-died).

## In one screen

Recovery is not a mode. The [board](../glossary.md#board) lives in files, each [agent](../glossary.md#agent) runs
under a [Watcher](../glossary.md#watcher) that outlives the [Overseer](../glossary.md#overseer), and every
[Pass](../glossary.md#pass) derives what to do from those files alone. A new Overseer runs its ordinary Pass with a
stale [cursor](../glossary.md#cursor).

![A matrix of five things that can die against six columns, where the board survives every row. In-flight work survives except a gate or install whose process Watcher is lost, by a kill or a reboot, and a lock hold either completes or never happened. Only a session's agent or Watcher death counts as a crash, as agent-crashed or watcher-lost; a lost gate or install Watcher, a dead Overseer, a reboot and a dead lock holder never count.](../figures/failure-and-recovery/who-survives-what.png)

*Notice the board column, which loses nothing committed, the two red in-flight cells, where a lost gate or install
costs its job, and the last column, where only two deaths count as crashes.*

- The next Pass notices: it reads the files and the Watcher records, so nothing watches for death.
- A dead [session](../glossary.md#session) resumes in its [worktree](../glossary.md#worktree). Too many crashes on
  one [job](../glossary.md#job) replace its session; too many across [tickets](../glossary.md#ticket) pause the board.
- A dead Overseer costs time and three effects held only in its Pass's memory; see [The Pass](the-pass.md). Nothing
  restarts it after a crash: User runs `agent-progress-v2 oversee`.
- A reboot costs a resume, never a crash count. A [gate](../glossary.md#gate) or install runs under a
  [process Watcher](watchers.md), which has no session to resume, so losing it, by a reboot or a kill, costs its job.
- A usage limit holds every board on the machine until the vendor's reset: no new ticket, no resume.
- A stall is not a death: a hung agent, repeated replacement or a crash run opens an [incident](../glossary.md#incident)
  or [decision](../glossary.md#decision) for the [Assistant](../glossary.md#assistant) or User.

The [Failure lab](../interactive/failure-lab.html#kill-the-overseer) kills a process and shows what the next Pass does.

## Recovery is the ordinary Pass

There is little recovery code to read. The next Overseer takes the [Baton](../glossary.md#baton), then runs the same
`runOnePass` as always. Most lost effects come back because the query that first produced them gives the same answer;
three do not, see [The Pass](the-pass.md), which lists every effect and how it returns.

![An event log strip with sequences 1 to 9, whose stored cursor stands at 4 when the Overseer dies. The Watcher goes on writing 5 to 9 while nobody drives. The next Pass reads past the cursor, applies the entries in one lock hold and moves the cursor to 9 in that lock hold.](../figures/failure-and-recovery/stale-cursor.png)

*Notice that the cursor moves in the same [lock hold](../glossary.md#lock-hold) that applies the events, so no crash can
separate the two.*

While the Overseer is down, Watchers keep logging and keep answering [standing replies](../glossary.md#standing-reply).
A job's closing `result` waits in its [event log](../glossary.md#event-log), and its session stays up because nobody
closed its input. Questions wait, and [Hatch](../glossary.md#hatch) requests queue. Commands that write through their
own lock hold, such as answering a decision, still work.

## Regrouping as built

[Regrouping](../glossary.md#regrouping) is three things: it finds leftover worktrees, it probes each Watcher, and it
runs one forced Pass. `Regrouping.regroup` reads and acts outside the lock, then `DrivePass.regroup` wakes the first
Pass, forced so that it runs even with nothing observed as changed.

Liveness is one verdict per Watcher from its record and the process table; see [Watchers](watchers.md#liveness). `lost`
means not provably live, and `unclaimed` means no Watcher took the instance yet.

| Watcher of a job with a [role](../glossary.md#role) | What `regroup` does | Report field |
| --- | --- | --- |
| `live`, on a protocol older than this Overseer accepts | Notes it; its events are read from files | `legacyWatchers` |
| `live` | Says `hello` from the cursor and takes the `history` answer | `attached` |
| `lost` | Settles the cause, killing a surviving child group | `lost` |
| `unclaimed`, awaiting its spawn | Names the job | `respawnJobIds` |

`leftoverWorktreesOf` lists folders under [`<worktrees>`](../glossary.md#reading-names) that no job, branch or Overseer
folder owns. Each opens one `leftover-worktree` decision, keyed by the folder, so a second start opens no second one
while the first is open.

> **As built.** The answer closes the decision and the folder stays, so a folder still there opens a new decision at the
> next start; see [the answer removes nothing](../reference/known-gaps.md#gap-leftover-worktree-answer-removes-nothing).
> `DrivePass.regroup` reads only `leftoverWorktrees` and `lost`, and `lost` only for a log line. The real work of the
> other fields is done again by the forced Pass from the same files; see
> [the unread Regrouping report](../reference/known-gaps.md#gap-regrouping-report-unread).

## Interruption and resume

A job that loses its process moves to `interrupted` with a cause; the [Playbook](../glossary.md#playbook) then decides
whether it resumes. Two waiting states differ by a process: `waiting-for-answer` has a live session paused on a
question, and `awaiting-answer` has none. Job states and their legal moves are in
[State machines](../data-model/state-machines.md).

### How a process end settles

`applyWatcherEvents` plays the log before it looks at the process, so a report in the log beats a dead Watcher.

![Two runs of one job whose Watcher is lost. With a result in the log, playing the events moves the job to in-customs, so no branch of the second stage matches and Customs settles it. With no result, the job is still running when the end is settled, so branch 5 interrupts it.](../figures/failure-and-recovery/events-before-the-end.png)

*Notice that the same dead Watcher gives two outcomes: the first stage decides what the second can match.*

The first stage reads each new event:

- A top-level usage [refusal](../glossary.md#refusal) interrupts a `running` job, so the error `result` after it closes
  nothing.
- `started` moves the job to `running`.
- A question opens its decision or incident; see [Questions](questions-and-incidents.md).
- `result` ends only a turn for the two session jobs (`SESSION_JOB_KINDS`), the Assistant and the
  [product owner](../glossary.md#product-owner), which have no closing [report](../glossary.md#report). A `result` moves
  any other job to `in-customs`, the state where its report is settled: [Customs](../glossary.md#customs) for a build or
  review, the [Airlock](../glossary.md#airlock) for a [merge agent](../glossary.md#merge-agent), onboarding for an
  [onboarder](../glossary.md#onboarder).

Then the first matching branch settles the end of the process.

| Order | Condition | Result |
| --- | --- | --- |
| 1 | `running`, resumed instance, session exited by itself, never `started` | Ended `replaced`, incident `resume-failed` |
| 2 | Watcher gone, `stopping`, a session job other than the product owner | Ended `closed` |
| 3 | Specs only: Watcher gone, no closing result, `running`, answer stop [marker](../glossary.md#marker) present | `interrupted`, `answer-delivery` |
| 4 | Exit 0, no closing result, `running`, `build` or `review` | Ended `failed`, cause `no-report`: a [failed pass](../glossary.md#failed-pass) |
| 5 | Watcher gone, no closing result, `running` or `waiting-for-answer` | `interrupted`: the settled cause if lost, else `agent-crashed` |

> **As built.** Only specs reach branch 3 and `answer-delivery`; see
> [dead code and unused states](../reference/known-gaps.md#gap-dead-code-and-unused-states).

### Causes

The causes are `InterruptionCause`. A resume after a crash cause adds one to the job's `crashResumes`; at
`JOB_RESUMES_BEFORE_FRESH` the job is replaced by a fresh session. Crash causes also feed the outage run, crashes back
to back on different tickets, which pauses the board (see [When work stalls](#when-work-stalls-rather-than-dies)). Only
the two in `CRASH_INTERRUPTION_CAUSES` do either.

| Cause | Means | Set by | Adds to `crashResumes` | Feeds an outage | Playbook response |
| --- | --- | --- | --- | --- | --- |
| `agent-crashed` | The session died with no closing result | Branch 5, or `settleLostWatcher` | Yes | Yes, if the job has tickets | Resume, then replace |
| `watcher-lost` | The Watcher vanished and its session was killed | `settleLostWatcher` | Yes | Yes, if the job has tickets | Resume, then replace |
| `reboot` | The machine restarted | `settleLostWatcher` | No | No | Resume, whatever the count |
| `answer-delivery` | The Overseer stopped the session to carry an answer in; see [Questions](questions-and-incidents.md#answer-delivery) | Branch 3 | No | No | Resume, carrying the answer |
| `usage-limit` | The vendor refused at a limit | `UsageLimits.interruptLimitedJob` | No | No | Resume after the reset |
| `handoff-red` | A [red handoff](../glossary.md#red-handoff): the same session goes back to fix it | A red gate or Customs check; a resumed session past its [call budget](../glossary.md#call-budget); a red gate in a [merge-fix](../glossary.md#merge-fix) job | No, its own bound | No | Resume, then [park](../glossary.md#park); see [build and review](build-and-review.md) |

An Assistant is ended instead of resumed, whatever its cause.

### What the Playbook does

`crashBoundStepsOf` applies that response in order, per `interrupted` job:

| Job | Step |
| --- | --- |
| `product-owner` | Resume when free. Past `JOB_RESUMES_BEFORE_FRESH`, `await-answer` with a question open, else `refresh-intake` |
| Cause `handoff-red` | Resume while `RED_HANDOFF_RESUMES_BEFORE_PARKING` allows, else `park` |
| `assistant` | `replace-job`; `endDownAssistants` normally ends it first |
| Crash, `crashResumes` at `JOB_RESUMES_BEFORE_FRESH` | `replace-job`: ended `replaced`; a build's next [attempt](../glossary.md#attempt) or a review's same round takes the same worktree; a merge agent's [Airlock slot](../glossary.md#airlock-slot) is freed as `orphaned` |
| Resumes blocked, or the job awaits an answer | Nothing; it waits |
| Otherwise | `resume-job` |

A usage limit, an install change, no [pipeline](../glossary.md#pipeline) or an outage blocks every resume
(`resumesAreHeld`). A committed [managed block](../glossary.md#managed-block), a touched agent config or an open
question blocks one job's. A board paused by User blocks new work and no resume. The ladder from resume to fresh session
to `job-lost` is drawn in [Build and review](build-and-review.md).

### The resume

A resume is a move from `interrupted` to `running`. `Jobs.moveJob` adds one to `watcherInstance`, the
[Watcher instance](../glossary.md#watcher-instance), adds one to `crashResumes` for a crash cause only, and logs
`job-resumed`. The cursor is keyed by instance, so the new instance reads from sequence 0, and the old instance's log
stays on disk.

The next spawn runs `--resume <sessionId>` in the same folder. The agent's task is never repeated. Once the Watcher is
live, the session gets one first line through the socket, the first of these that applies:

1. An awaiting answer.
2. User's reopening text.
3. The red-handoff message.
4. The plain resume message.

A fresh job after a `replaced` one is told that the worktree holds an earlier session's changes
(`JobResumption.earlierSessionWasReplaced`).

## The lost cause

A lost session Watcher gets one stored cause: a later reading gets the same label and sends no second signal, and if
the Overseer dies before its lock hold interrupts the job, its successor reads the cause the kill found.

![A decision ladder: a stored cause is read back, otherwise a recorded boot that differs gives reboot with nothing signalled, a recorded child group a SIGKILL reaches gives watcher-lost, and anything else gives agent-crashed. Only the last two count as crashes. The answer is stored once.](../figures/failure-and-recovery/lost-cause.png)

*Notice that the kill comes before the store, and a reread of the store sends no signal.*

`settleLostWatcher` runs in both Regrouping and every Pass's `observe`, and reads `watcher-<n>.lost-cause` first. The
file protects only once written: an Overseer dying between the kill and the store leaves its successor nothing to
signal, so that reading is `agent-crashed`, which counts the same as `watcher-lost`. A record that cannot be read at
all also falls through to `agent-crashed`. A group kill is identity-checked, so a reused process id is never signalled;
see [Watchers](watchers.md).

## Crash matrix

Nearly every death ends in a resume or a re-run from files; the rows name the exceptions. `CM` names a case in
`src/services/overseer/CrashMatrix.spec.ts` and `src/services/overseer/CrashMatrix.integration.spec.ts` by the start of
its title; other specs are named; `read` means established by reading the code, with no spec proving the row.

<details>
<summary>The agent and its Watcher</summary>

| What dies | What notices | What happens | Proved by |
| --- | --- | --- | --- |
| Agent exits mid-turn, no result | Watcher records the end | `interrupted`, `agent-crashed`, resumed | CM `agent exits mid-turn` |
| Agent exits 0 with no report | Watcher records the end | Ended `failed`, `no-report` | `cli/overseer/OverseerBuildJob.spec.ts`, `a session ending without a report` |
| Agent exits with its result, Overseer down | Forced Pass reads the log | `in-customs`, no interruption | CM `agent exits with its closing result` |
| Agent crashes past `JOB_RESUMES_BEFORE_FRESH` | Playbook | Ended `replaced`, a build's fresh attempt on the same worktree; `REPLACED_JOBS_BEFORE_JOB_LOST` in a row open `job-lost` | CM `a job crash-resumed twice` |
| Vendor cannot take the resume | Branch 1 | Ended `replaced`, `resume-failed`, default fresh job with the earlier-session note | CM `a resume the vendor cannot take` |
| Watcher dies, agent alive | Liveness reads `lost` | Group killed first, `watcher-lost`, resumed in place | CM `watcher dies with its agent alive` |
| Watcher and agent die | Liveness reads `lost` | `agent-crashed`, resumed | CM `watcher and agent die` |
| Recorded child id reused by another process | `ProcessSupervision.stopTree` | Nothing signalled, `agent-crashed` | CM `a reused pid is never signalled` |
| Watcher dies during its [claim](../glossary.md#claim) | Liveness reads `lost` | No child recorded, `agent-crashed` | read: `WatcherFleet.livenessOf` |
| Session's Watcher ends or is lost, before `started`, while the job is `launching` | Nothing | Stays `launching`; see [the stranded job](../reference/known-gaps.md#gap-launching-job-stranded) | read: `applyWatcherEvents`, `jobsNeedingAWatcher`, `Playbook.nextStepsOf` |
| Hung agent under a live Watcher | [Sweep](../glossary.md#sweep) count | Incident `quiet-job` | `src/services/overseer/IncidentRouter.spec.ts` |
| Watcher below the protocol window | Regrouping | Watched from its files, stopped by its group | CM `overseer updated while Watchers run` |

</details>

<details>
<summary>The Overseer and the machine</summary>

| What dies | What notices | What happens | Proved by |
| --- | --- | --- | --- |
| Overseer, Watchers running | The next start | Attaches from the stored cursor, nothing interrupted | CM `overseer dies: the Watchers keep running` |
| Overseer, question answered while down | Forced Pass | Replayed with no second decision; the live Watcher takes the `control_response` | CM `a question answered while the Overseer is down` |
| Overseer, Assistant mid-turn | Forced Pass | Session continues; its turn's result closes the turn that delivers an incident to it | CM `Assistant mid-turn, Overseer restarted` |
| Overseer, after the lock hold, before `markHits` | Nothing | No marker and no stop frame: the next Overseer resumes the job unheld, the next refusal marks the limit, and other boards are not held until then | read: `stopLimitedJobs` |
| Overseer, before the stop frame to an Assistant ended down | Nothing | Its Watcher and session stay up, and nothing looks at them | read: `runOnePass` |
| Overseer, before a Hatch reply | The verb stops waiting | See [at most once](#at-most-once) and [the Overseer side](control-and-hatch.md#the-overseer-side) | read: `HatchInbox.writeReplies` |
| Overseer, a job's cursor quiet | Nothing | The in-memory sweep count starts again; a `quiet-job` comes later, never falsely | read: `createQuietJobWatch` |
| Reboot during a build, three times | Boot identity | Three resumes of one session, none counted, no fresh agent | CM `three reboots in a row` |
| Reboot, question open | Boot identity | Waits interrupted; the resume carries the answer | CM `a question pending when the machine reboots` |
| Reboot, malformed-ticket incident open | Boot identity | One incident survives, and its answer resumes the job | CM `a worker reports a malformed ticket` |
| Reboot, product owner at its question | Boot identity | Waits, then resumes by id once answered | CM `a product owner interrupted by a reboot` |
| [Baton pass](../glossary.md#baton-pass), sessions running | Successor | No Watcher is told anything; the successor attaches from the cursor | CM `run restart mid-session or mid-gate` |
| Old Overseer during a Baton pass | Successor | See [When a Baton pass fails](baton.md#when-a-baton-pass-fails) | `src/services/overseer/BatonPass.spec.ts` |

</details>

<details>
<summary>Mid-lock-hold, mid-launch, mid-gate</summary>

| Where it stops | State left | What happens next | Proved by |
| --- | --- | --- | --- |
| Lock hold, dies before its [journal](../glossary.md#hold-journal) | Nothing written | The lock hold never happened: a Pass derives it again, a command's change is lost | read: `commitHold` |
| Lock hold, journal written, some files written | Torn store | Next lock holder replays the journal first; see [storage](../data-model/storage.md#a-crash-at-any-point) | CM `the next lock holder replays` |
| Stale holder, taken over before its journal | Nothing written | Refuses `lock-taken-over`, `unrepaired` | CM `taken over before its journal` |
| Stale holder, taken over after its journal | Journal committed | Writes no further file; the successor replays | CM `taken over after its journal` |
| Launch, after the lock hold, before the spawn | `launching` or `running`, `unclaimed` | Same instance spawned | CM `overseer dies after the hold that launched` |
| Launch, build job before its worktree | `preparing`, no folder | Next Pass creates the worktree | read: `runBuildJobEffects` |
| Launch, install running | `preparing`, install Watcher live | Install finishes; its end is read from files | read: `setupProgressOf` |
| Launch, spawned, not yet claimed | Two Watchers may start | One claim wins; the other exits 0 | read: `runWatcher` |
| Launch, claimed, first message unsent | `first-message-<n>.txt` stored | Sent once the Watcher is live | CM `a fresh session takes its first message` |
| Job gate, Overseer dies | Gate Watcher runs on | Verdict read from files and stored by tree | read: `stepVerdictOf` |
| Job gate, gate Watcher lost | `gating` | See [process Watchers](#process-watchers-under-loss) | read: `stepVerdictOf`, `settleGate` |
| Merge gate, Overseer dies | Phase `gating`, no `gate-ran` | The next Airlock sweep gates the tree again; the [gate slot](../glossary.md#gate-slot) of the dead holder is freed by the next acquirer; nothing kills the old gate's own process group | read: `runGate`; `src/services/overseer/GateRunSlots.spec.ts` |

</details>

<details>
<summary>Each Airlock phase, and landing</summary>

The Airlock phase is stored on the merge job, one lock hold per phase, so a restart continues
where the phase says. The worktree is the other half of the state.

| Phase | Left on disk | What happens next | Proved by |
| --- | --- | --- | --- |
| `merge-in` | No merge started | Merges in | read: `runMergeIn` |
| `merge-in` | Clean merge finished, phase not moved | `already-descends`, goes on to `gating` | read: `mergeIn` |
| `merge-in` | Merge in progress, no live holder | `merge --abort`, reset to the recorded tip, ended `stopped` `orphaned`, requeued | CM `mid-merge with no live holder` |
| `merge-in`, group [refresh](../glossary.md#refresh) | Merge in progress | Aborted, temporary worktree removed, never two refreshes | CM `a refresh mid-merge with no live holder` |
| `resolving` | [Resolver](../glossary.md#resolver) live or interrupted | Airlock slot kept; the resolver resumes into the merge on disk | CM `restart during a live or interrupted resolver` |
| `resolving` | Resolver ended unusable | Airlock slot freed as `orphaned` | read: `runResolving` |
| `reviewing-resolution`, `fixing` | Agent live or interrupted | Airlock slot kept, same as a resolver | read: `runAirlockAgent` |
| `reviewing-resolution`, `fixing` | Agent ended, launches spent | Airlock slot freed as `orphaned` | read: `runAirlockAgent` |
| `gating` | Merged tree | Gated again unless `mergedTreeWasLastPassed` | read: `runGate` |
| [`landing`](../glossary.md#landing), [target](../glossary.md#target) moved first | Tip differs, not an ancestor | Requeued from the branch tip, never landed on the moved tip | CM `target moved by hand` |
| `landing`, after the fast-forward | Commit in the target, board not written | Ancestry says `already-landed`, and the board side finishes | CM `crash after the fast-forward` |
| `landing`, [group](../glossary.md#group) ticket | Same, on the group tip | Ticket approved, one `merge-landed` | CM `crash after a group ticket's fast-forward` |
| `landing`, release | Same, on the [main line](../glossary.md#main-line) | The whole bundle is delivered | CM `crash after the release's fast-forward` |

</details>

<details>
<summary>Assistant and product owner</summary>

| What happens | Result | Proved by |
| --- | --- | --- |
| Assistant down during the turn that delivers an incident | Ended `replaced`, cause `assistant-down`, never resumed; a fresh one's first message carries the incident | CM `Assistant down during a delivery turn` |
| No Assistant can come up | Every incident defaults; the next boot waits for a sweep | CM `no Assistant can come up` |
| Product owner stopped by User at its question | Decision withdrawn, ended `closed`, never resumed by itself | CM `a product owner stopped by User` |
| Product owner closed, then messaged by User | Resumes by id, the message first | CM `a product owner closed by its own intake-close` |
| Product owner replaced past the bound, question open | Waits `awaiting-answer`; a fresh one takes its [draft tickets](../glossary.md#draft-ticket) and answers | CM `a product owner replaced past the bound` |

</details>

## Reboot

A reboot costs a resume, never a crash count, and only a session gets that resume. Each Watcher record holds a boot
identity from `ProcessIdentity.identityOf`. After a reboot the identity differs, so the Baton reads dead and every
Watcher reads `lost`. `settleLostWatcher` stores `reboot` and signals nothing, because no recorded process can be alive.

The Overseer comes back when User runs `agent-progress-v2 oversee` or the optional login item does; see
[install](cli-and-install.md).

![A fan-out from one root: the boot identity differs, so every Watcher is lost with cause reboot. A running job is interrupted and resumed by id. A waiting-for-answer job is interrupted until answered, then resumed. A preparing job whose install was running ends stopped with a setup-failed incident. A gating job whose gate was running ends stopped with a gate-cannot-run incident. A launching job whose session never started stays launching.](../figures/failure-and-recovery/reboot-by-job-state.png)

*Notice that the first two amber branches keep the session and the red ones cost the job. The third keeps nothing
moving: [a known gap](../reference/known-gaps.md#gap-launching-job-stranded).*

The first Pass leaves `crashResumes` alone. A session waiting on a question stays interrupted while `jobAwaitsAnAnswer`
holds, and the answer is its first line. A lost [prepare step](../glossary.md#prepare-step) ends the job like a lost
gate, with its incident in [process Watchers](#process-watchers-under-loss).

> **As built.** A reboot during an install ends the job; see
> [a reboot mid-install ends the job](../reference/known-gaps.md#gap-reboot-mid-install-ends-job). A Watcher that dies
> before its claim is not spawned again within one Overseer's life; see
> [a spawn is never retried](../reference/known-gaps.md#gap-spawn-never-retried). The login item starts the Overseer
> once per login; see [no keep-alive](../reference/known-gaps.md#gap-login-item-no-keepalive).

## At most once

Most actions a crash could repeat happen at most once. Frames and answers are the deliberate exception: at least once,
because a lost frame is worse than a repeated one. A frame is a line of control sent to a session through its Watcher's
socket. An Overseer crash repeats a frame rather than losing it, because the [delivery marker](../glossary.md#marker)
comes after the send. The marker proves only that the send connected, so a Watcher dying after the connect can lose
the frame; [Watchers](watchers.md#sending-a-frame-once) draws the order. Every effect and its order is in
[The Pass](the-pass.md#effects-come-after-the-commit).

| Crash cost | Double action | Guard | Question it answers | Where | What can still happen |
| --- | --- | --- | --- | --- | --- |
| None | An event applied twice | Cursor set in the lock hold that applies it | Is it past the stored cursor? | `applyWatcherEvents`, `setJobEventCursor` | Nothing |
| None | A question asked twice | Request id already open, answered or in `answeredRequestIds` | Is it open or answered already? | `QuestionRouting.openQuestion`, `questionRequestStanding` | Nothing |
| None | Tokens credited twice | Credit only growth past the largest logged total | How much is credited? | `TokenCrediting.tokensStillToCreditOf` | Nothing |
| None | A landing done twice | Commit is an ancestor of the target tip | Is the commit in already? | `Landing.movedTargetVerdictOf` | Nothing |
| Absorbed | A lock hold written twice | [Fence](../glossary.md#fence) before each file, then the journal | Is the lock still held? | `TrackerLock.lockHoldOf`, `src/services/tracker/HoldJournal.ts` | A replay rewrites the same bytes |
| Absorbed | Two Overseers acting | [Generation](../glossary.md#generation) check after the lock hold and in each Airlock lock hold | Is this Overseer still the newest? | `Baton.requireNewestGeneration` | One extra main lock hold, then no effects; see [The Pass](the-pass.md) |
| Absorbed | A Watcher spawned twice | Exclusive create of the Watcher file | Who created the record? | `runWatcher`, `createFileAtomically` | A second process starts and exits 0 |
| Reply lost | A Hatch request applied twice | `hatch-applied` record | Is it logged as applied? | `HatchInbox.applyPendingRequests` | The reply can be lost; the verb prints `queued <requestId>` |
| Repeats | A frame sent twice | Marker written after the send connected | Did the send connect? | `WatcherFleet.sendFramesOnce`, `JobResumption` | A crash between send and marker repeats it |
| Repeats | An answer delivered twice | `answer-<digest>.delivered` | Did the send to this job connect? | `AnswerDelivery.deliverOne` | The same window as a frame |

## Process Watchers under loss

An install or gate has no session to resume, so losing its Watcher ends the job and opens an incident.

`JobLaunch.processWatcherEnd` reports `lost` for a killed or rebooted process Watcher. The job ends `stopped`, which is
never a failed pass. Nothing signals a lost process Watcher's child, so after a kill it runs on while the job ends.

| Lost step | Reads as | Job | Incident, default |
| --- | --- | --- | --- |
| Install | `install-failed` | Ended `stopped` | `setup-failed`, `worktree-repair` |
| Prepare step | `setup-failed` | Ended `stopped` | `setup-failed`, `worktree-repair` |
| Gate | `cannot-run` (`GateRun.gateOutcomeOf`, exit code null) | Ended `stopped`, cause `gate-cannot-run` | `gate-cannot-run`, `gate-retry` |

While the incident is open the ticket launches nothing. The second default of one of these kinds parks the ticket; see
[Questions and incidents](questions-and-incidents.md). What a gate verdict means is in
[Customs and gates](customs-and-gates.md). A merge gate runs inside the Overseer and has no Watcher to lose.

## Usage limits

A usage limit is the one failure that crosses boards. Only a top-level refusal counts: `UsageLimits.refusalOf` ignores
a per-window warning and a window rejected under allowed overage.

![Time runs down across four lanes: a session on board A meets a top-level refusal, and Overseer A interrupts the job in its lock hold, where the usage hold starts for board A, writes the marker first, then sends the stop frame. Overseer B reads the marker at its next Pass, where its hold starts, and starts no new tickets, while its running jobs go on. Both set a timer, and at the reset both run a forced Pass: A resumes by id, B launches again.](../figures/failure-and-recovery/usage-limit.png)

*Notice the marker goes out before the stop frames, so another board's next Pass can stop new tickets even if this
Overseer dies mid-stop.*

The lock hold that reads the refusal interrupts the job with cause `usage-limit` and logs `usage-limit-hit`.
`usageResetsAtOf` takes the later of the marker and this Pass's hits, so a limit met in this lock hold already stops
launches decided in the same lock hold. `markHits` writes the [usage marker](../glossary.md#usage-marker) in
[`<monitor>`](../glossary.md#reading-names) only when that moves the reset later, so no Overseer shortens a limit
another board met. A malformed marker reads as no limit and is logged.

While `usageLimitHolds` is true, the Playbook starts no new build or review, resumes nothing, and boots no Assistant or
onboarder, and every open incident takes its default with cause `no-assistant`. Four things
still launch:

- An Airlock keeps running: `airlocks.sweep` has no usage check, so it can launch its merge agents.
- A job already `preparing` still launches: `JobLaunch.applyObservation` moves it to `running`, and `launchWatcher` has
  no usage check.
- A product owner past `JOB_RESUMES_BEFORE_FRESH`, or `awaiting-answer` with no question, is refreshed:
  `productOwnerStepsOf` returns `refresh-intake` before it reads `resumesAreHeld`.
- What User starts: `intake-start`, `onboarder-advise` and a message reopening a closed product owner go through the
  [control path](control-and-hatch.md), which has no usage check, and `jobsNeedingAWatcher` spawns them.

Sessions on other boards that are already running go on until they meet a refusal of their own. `usageLimitHolds` and
`scheduleThePassAtTheReset` are exceptions to the [clock rule](../../CLAUDE.md), because the vendor names its reset as a
time; see [Deciders and bounds](../reference/deciders-and-bounds.md). A delay too long for a timer is
capped, and the Pass it wakes schedules the rest.

> **As built.** The marker is never removed, and a passed reset still stops incident delivery to an idle Assistant; see
> [the stale usage marker](../reference/known-gaps.md#gap-stale-usage-marker-stops-delivery).

## When work stalls rather than dies

These paths end with User or a default, not a resume. Each incident's full row is in
[Questions and incidents](questions-and-incidents.md).

| Situation | What notices | What happens |
| --- | --- | --- |
| Outage | `Playbook.outageIsDue`: `CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING` counted crashes on different tickets back to back | Board paused, `outage` decision, every resume blocked |
| Quiet job | Sweeps with an unmoved cursor on a `running` build or review, `QUIET_JOB_SWEEPS` | Incident `quiet-job`, whose default opens a decision. Counted in memory. Sweeps are timed, so this is one more exception to the [clock rule](../../CLAUDE.md), and it only asks User |
| `job-lost` | `REPLACED_JOBS_BEFORE_JOB_LOST` replaced jobs in a row on a ticket | Incident with default `ticket-park`; the ticket launches nothing meanwhile |
| Assistant down | `endDownAssistants`, for any interruption or a mid-turn quiet count | Ended `replaced`, or `failed` before its first `result`; delivered incidents go out again to a fresh one |
| Assistant cannot boot | `FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING` failed boots in a row | Every open incident defaults `no-assistant`; a new boot waits for a sweep |
| Airlock incident, no Assistant running | `incidentDefaultStepsOf`, for `merge-gate-failed` and `resolution-over-threshold` | Defaults at once, so a target's Airlock never waits for a boot |

An outage run crosses tickets, where the other two `in a row` counts stay on one ticket or on the Assistant. Three
records clear it: a verified job ending, the Overseer being set back to `running`, and an opened `outage` decision.

![A strip of log records with the run length under each: a crash on #003 gives 1, a second crash on #003 stays at 1, a verified job ending gives 0. A crash on #003 gives 1 and a crash on #007 gives 2, which reaches CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING. The Overseer is then paused and an outage decision opens.](../figures/failure-and-recovery/outage-run.png)

*Notice that the same crash twice never adds up: a run grows only when the ticket changes.*

## Tokens after a death

A replay credits nothing twice, because a job is credited only what its total grew past its largest logged
`agent-stopped` record. A job a command's own lock hold ended has no such record, so the next Pass credits it. The rules
are in [Roles and launch](roles-and-launch.md).

## Invariants

1. Every decision a restart needs is on disk. An Overseer's memory holds only retries, delays and three post-hold
   effects. A restart tries again and loses nothing else; see [The Pass](the-pass.md).
2. A Pass does not know whether it follows a crash, apart from being forced first.
3. The cursor and the board change it describes commit in one lock hold.
4. Only `watcher-lost` and `agent-crashed` add to `crashResumes` or to an outage run.
5. A lost session Watcher has one cause, stored once, and a surviving child group is killed before its job resumes. A
   Bash command [leads a group of its own](../reference/known-gaps.md#gap-bash-group-survives-kill).
6. A resume runs in the same folder and is told it was interrupted; it never gets its task again.
7. An Assistant is never resumed: a fresh one takes what it was delivered.
8. A delivery marker is written only after the send connected, so an Overseer crash repeats a frame or answer rather
   than losing it.
9. The usage marker's reset only moves later.

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Start of an Overseer | `src/services/overseer/Regrouping.ts` | `regroup` | `src/services/overseer/Regrouping.integration.spec.ts` |
| Lost cause | `src/services/overseer/Regrouping.ts` | `settleLostWatcher` | `src/services/overseer/CrashMatrix.integration.spec.ts` |
| End of a process | `src/services/overseer/DrivePass.ts` | `applyWatcherEvents` | `src/services/overseer/CrashMatrix.spec.ts` |
| Causes | `src/lib/tracker-model/constants/JobStates.ts` | `CRASH_INTERRUPTION_CAUSES` | `src/lib/tracker-model/constants/JobStates.spec.ts` |
| Playbook response | `src/lib/tracker-model/Playbook.ts` | `crashBoundStepsOf`, `outageIsDue` | `src/lib/tracker-model/Playbook.spec.ts`, `src/lib/tracker-model/Playbook.interleavings.spec.ts` |
| The resume | `src/lib/tracker-model/Jobs.ts` | `moveJob` | `src/lib/tracker-model/Board.jobs.spec.ts` |
| Resume messages | `src/services/overseer/JobResumption.ts` | `deliverResumeMessages` | `src/services/overseer/JobResumption.integration.spec.ts` |
| Answers | `src/services/overseer/AnswerDelivery.ts` | `deliverAnswers` | `src/services/overseer/CrashMatrix.spec.ts` |
| Usage limits | `src/services/overseer/UsageLimits.ts` | `markHits` | `src/services/overseer/UsageLimits.spec.ts`, `cli/overseer/OverseerDrivePass.spec.ts` |
| Quiet jobs | `src/services/overseer/IncidentRouter.ts` | `createQuietJobWatch` | `src/services/overseer/IncidentRouter.spec.ts` |
| Assistant down | `src/services/overseer/AssistantSession.ts` | `endDownAssistants` | `src/services/overseer/AssistantSession.spec.ts` |
| Airlock restart | `src/services/overseer/Airlocks.ts` | `advanceTheSlot` | `src/services/overseer/CrashMatrix.integration.spec.ts` |
| Landing twice | `src/services/lifecycle/Landing.ts` | `landOnTarget` | `src/services/lifecycle/Landing.spec.ts` |
| Tokens | `src/services/overseer/EndedJobTokens.ts` | `creditJobsTheLogEndedUncredited` | `src/services/overseer/EndedJobTokens.spec.ts` |
