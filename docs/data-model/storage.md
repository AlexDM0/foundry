# How a write commits

> **Question:** How do the board files and the log change as one transaction, and what does a reader see after a crash
> at any point?
> **Time:** 20 minutes.
> **Read first:** [Entities](entities.md).
> **Next:** [On-disk atlas](on-disk-atlas.md), [The Pass](../architecture/the-pass.md).

## In one screen

A [tracker](../glossary.md#tracker) keeps three stores (see [Entities](entities.md)). Two, the
[board](../glossary.md#board) files and the [log](../glossary.md#log), change as one transaction with no database
underneath; [job](../glossary.md#job) folders stay outside. `writeTracker` gives every change one shape: take the lock,
read everything into a `Board`, the in-memory model of a repository's work, change it in `mutate`, then commit a list of
whole files. That run is a **[lock hold](../glossary.md#lock-hold)**.

The commit point is one atomic rename: `hold-journal.json` landing whole, with the full next text of every file. A
process crash before it leaves every tracker file unchanged; git work already done in `mutate` stays. A process crash
after it means the next lock holder replays the journal, so the change happens anyway. A power loss is excluded: see
the [atomic-file package](#the-atomic-file-package).

Readers take no lock. Each file is whole, yet two files can disagree during a commit, and for longer after a crash,
until the next lock holder replays. The log is also an input: counts, order and once-only guards are derived from it,
so `agent-progress-v2 clear`, which cuts the log back to its own record, resets them.

![A vertical sequence of one lock hold. Take the lock, read into a Board, mutate, write the journal to a temporary file, then the commit point where hold-journal.json lands whole, followed by progress.json, then pipeline.json, tickets, epics, filing drafts and log.jsonl when changed, journal removal and release. A process crash above the commit point leaves tracker files unchanged; one below it is finished by the next lock holder. A refusal during mutate writes nothing.](../figures/storage/hold-write-order.png)
*Every tracker change above the line is lost by a process crash. Everything below the line is finished by whoever comes
next.*

## The write sequence

Every tracker change goes through `writeTracker`, in this order. `agent-progress-v2 init` is the one exception:
`createTracker` takes the same lock and creates `progress.json` and an empty `log.jsonl` without a journal. A mutating
command under a job does not call `writeTracker` itself: its verb ends at the
[Hatch](../glossary.md#hatch), and the [Overseer](../glossary.md#overseer) applies it in a [Pass](../glossary.md#pass)'s
lock hold. See [Control and Hatch](../architecture/control-and-hatch.md). The CLI reference states the order under
[Conventions](../cli.md#conventions).

A `refused` [refusal](../glossary.md#refusal) is one the caller can act on (exit 1); `unrepaired` means the store needs
repair or a retry (exit 2). [Exit codes](../cli.md#exit-codes) has the full list.

| Step | What happens | If it stops here |
| --- | --- | --- |
| 1. Lock | `withLock` takes the next `generation-<n>` record. | Retries, then `tracker-lock-held`. |
| 2. Replay | `replayHoldJournal` finishes any journal left on disk. | A malformed journal refuses as `unrepaired`. |
| 3. Read | `requireTracker` reads the board files and the log, `openBoard` builds the `Board`. | An unreadable `progress.json` or `log.jsonl` refuses as `unrepaired`; other broken files are skipped. |
| 4. Mutate | The caller's `mutate` changes the `Board` and logs records in memory. | A refusal or throw writes no tracker file. Replay in step 2 stands, and git work in `mutate` stays. |
| 5. Plan | `plannedHoldOf` turns the result into an ordered file list. | Nothing is written yet. |
| 6. Commit | `commitHold` writes the journal, each file, then removes the journal. | See [A crash at any point](#a-crash-at-any-point). |
| 7. Release | `release` creates the next generation as `released`, however steps 2 to 6 ended. | The next taker finds the process gone. |

The file list has a fixed order, and only `progress.json` is always on it:

| Position | File | On the list when |
| --- | --- | --- |
| 1 | `progress.json` | Always. |
| 2 | `pipeline.json` | A [`gate`](../glossary.md#gate) verb, or an accepted `pipeline-proposal`, changed it. |
| 3 | [Ticket](../glossary.md#ticket) files | The `Board` changed them. |
| 4 | [Epic](../glossary.md#epic) files | The `Board` changed or removed one. Writes come before removals. |
| 5 | [Filing draft](../glossary.md#filing-draft) files | The `Board` changed or removed one. Writes come before removals. |
| 6 | Every ticket and epic file | Only on `agent-progress-v2 clear --all`: all of them are removed, malformed ones included. |
| 7 | `log.jsonl` | The lock hold logged at least one record. |

Two reasons fix that order. The log goes last, so a log line never describes an unstored change. `progress.json` goes
first, so it is never behind the tickets it names.

> **Why.** Every write happens under one lock hold, so two commands never interleave. The lock is taken by creating the
> next record, never by renaming or rewriting one, so no step replaces a record another process may have written, and
> exactly one waiter wins. Whole files in a fixed order keep the store readable by hand and by tools that know nothing
> of the journal.

## The hold journal

The [hold journal](../glossary.md#hold-journal) is a redo log with one entry per file. It carries each file's whole next
text, or a removal, never a diff. `log.jsonl` is on it in full. Its format is under [Files on
disk](../cli.md#files-on-disk) in the CLI reference.

**The commit point is the journal's rename.** `createHoldJournalWriter`
(`src/adapters/hold-journal/HoldJournalWriter.ts`) writes through the atomic-file package, so a journal on disk is
always whole. From that moment the lock hold is decided, whatever happens to its process. A command that fails at exit 2
after the commit point, on a full disk for example, still leaves its journal, and the next lock holder finishes the
write that command reported as failed.

**A journal that stays fails the hold.** Left behind unannounced, it would replay over whatever is hand-edited next, so
a removal that fails for any reason but a journal already gone refuses with `hold-journal-unremovable`, `unrepaired`.
The next lock holder replays it and tries the removal again.

**Replay is idempotent.** `replayHoldJournal` rewrites or removes each file verbatim, then removes the journal. A second
replay yields the same bytes. Replay parses nothing but the journal itself, so a log with a blank line or reordered keys
is written back byte for byte. Every acquisition through `withLock` replays first, so no holder ever reads a
half-applied lock hold.

**A journal is trusted whole or not at all.** Its paths have one wire form: the writer stores forward slashes on every
platform. `HoldJournalIngestion` reads each entry through a path check: relative to
[`<data>`](../glossary.md#reading-names), no backslash, no Windows drive prefix, no empty, `.` or `..` segment. Any bad
entry, a wrong `version`
or broken JSON makes the whole journal `malformed`, and none of its files is handed out. `replayHoldJournal` then
refuses with `malformed-hold-journal`, `unrepaired`, before anything reads a possibly torn board. Every write stops
until someone repairs or removes the file.

**Reading it takes no lock.** `readHoldJournal` never throws. `agent-progress-v2 status` calls it to name a malformed
journal on standard error, and replays nothing. Only a lock holder replays.

## A crash at any point

Every promise here about a crash means a process crash; a power loss may lose a landed rename (see [The atomic-file
package](#the-atomic-file-package)). Each file stays whole, because each write is an atomic rename. What can differ is
one file against another, and a reader sees that difference as a staircase. Which effects are lost with the stores is
in [Failure and recovery](../architecture/failure-and-recovery.md). The
[Failure lab](../interactive/failure-lab.html#cut-a-hold-short) cuts a lock hold short at each step.

![A matrix with one row per crash point and one column per file. Before the journal lands every file is old and no journal exists. Once it lands the journal is present and the files turn new one at a time, progress.json first and log.jsonl last. After the journal goes every file is new and no journal exists. In the five rows between them the files disagree. In all seven rows with the journal present, the next lock holder replays it.](../figures/storage/torn-state-staircase.png)
*Read a row left to right: green files are ahead of gray ones. The outer bracket covers every row a replay finishes.*

| The holder dies | The next lock holder |
| --- | --- |
| Before the journal lands | Has nothing to replay. |
| Journal landed, no file written | Writes every file, removes the journal. |
| After `progress.json`, before the tickets | Finishes the rest from the journal. |
| After `log.jsonl`, before the journal goes | Rewrites the same bytes, removes the journal. |
| After the journal goes, before release | Finds the process gone and takes the lock. |

> **Careful.** Readers take no lock, so the middle rows are visible. `status` and the [Bridge](../glossary.md#bridge)'s
> board state can read `progress.json` from one lock hold beside a log from the one before. The same mix shows for the
> moment a healthy commit takes. The Pass's read step, `observe` in `src/services/overseer/DrivePass.ts`, reads
> `progress.json` and `pipeline.json` without the lock; its [Playbook](../glossary.md#playbook) then works on the
> `Board` read under the lock after replay. `cli/HoldJournalCrash.integration.spec.ts` asserts the torn state, then the repair.

## The lock

The lock is a folder of numbered [generation](../glossary.md#generation) records, `<data>/.lock/generation-<n>`, one
writer at a time across processes. A record holds `state` (`held` or `released`), `processId` and `acquiredAt`. It is
created exclusively and never rewritten.

![Three timelines of generation records. A holds generation 7 and releases by creating generation 8 as released. When B dies, its record stays, and C sees the process gone and creates generation 10. When live holder D goes stale, E creates generation 13; both believe they hold until D's next fence refuses lock-taken-over, and D writes no further tracker file.](../figures/storage/lock-generations.png)
*Taking over and releasing are the same act: creating the next number. No step replaces a record another process may
have written.*

Taking the lock is creating the generation after the newest, once the newest is free. `generationIsFree` decides:

| Newest record | Free? |
| --- | --- |
| `released` | Yes. |
| `held`, its process gone | Yes. |
| `held`, `acquiredAt` more than `LOCK_STALE_MILLISECONDS` (30000) old | Yes, even with a live holder. |
| `held`, stamped in the future by a live holder | No, it never goes stale. |
| Unreadable, or `acquiredAt` does not parse | Only once the file's mtime is older than the same bound. |
| A `stat` that errors, or a folder that cannot be listed | No, it fails closed. |

![One acquisition as a straight path: list the folder, judge the newest free, create the next record exclusively, list again, remove lower records, lock held. A newest record that is not free means sleep, then retry. A failed create or a higher number gives contended: retry at once. Both spend an attempt, and with none left the taker refuses tracker-lock-held, unrepaired, exit 2.](../figures/storage/taking-the-lock.png)
*Only one create can succeed while a number exists, and the second listing catches a number reused after removal, so the
file system decides the race, not a clock.*

Waiting is bounded: `withLock` makes `LOCK_RETRY_COUNT` (50) attempts, and when the newest record is not free the taker
sleeps `LOCK_RETRY_INTERVAL_MILLISECONDS` (100) before its next attempt. `withLockAt` in
`src/services/tracker/TrackerLock.ts` is the same lock on any folder, used for
[`<monitor>/.lock`](../glossary.md#reading-names) by `src/services/tracker/MonitorRegistration.ts`, and it replays no
journal. `withLockIfFree` returns the verdict `held` at once instead of waiting.

> **As built.** Nothing calls `withLockIfFree`. See [the
> leftovers](../reference/known-gaps.md#gap-dead-code-and-unused-states).

The [fence](../glossary.md#fence) limits what a stale live holder can write: `requireStillHeld` refuses
`lock-taken-over`, `unrepaired`, once any higher generation exists. `commitHold` calls it before the journal, before
each file and before removing the journal.

![Three lanes, holder D, holder E and tracker files, with time running down. D writes its journal and files, then stalls past LOCK_STALE_MILLISECONDS. E creates generation 13, replays D's journal, removes it, and writes its own journal at the same path. D wakes and its fence refuses lock-taken-over before the removal, so the unlink that would have removed E's journal never runs. D's release create fails, or lands below the newest record.](../figures/storage/takeover-mid-commit.png)
*The journal has one fixed path, `holdJournalFilePathOf`, so a removal after a takeover would hit the successor's
journal.*

Takers ignore a release record below the newest.

The stale and retry values are under [Locks](../reference/deciders-and-bounds.md#locks).

The project's rule is that a clock decides nothing. Staleness is one listed exception ([Deciders and
bounds](../reference/deciders-and-bounds.md#clock-exceptions)), and it compares against a time the tool itself wrote.

> **As built.** `acquiredAt` is never refreshed, `mutate` runs unfenced, and a fence is a check before a write, not a
> conditional write. `acquiredAt` is stamped before the first attempt, so time spent waiting counts against the stale
> window. See [a hold past the stale window](../reference/known-gaps.md#gap-hold-past-stale-window).

## What runs inside a lock hold

The journal makes tracker files atomic, and nothing else. `mutate` also runs git and everything
[Customs](../glossary.md#customs) asks of git, whose effects sit outside the transaction, and it reads event logs, which
spends the lock's time.

| Work | Site |
| --- | --- |
| Customs' git commands on a finished job | `verifyAndRoute` in `src/services/overseer/JobLaunch.ts`, `clearCustoms` |
| An Overseer-made empty commit for a [review round](../glossary.md#review-round) with no changes | `commitNoChanges` in `src/services/lifecycle/ReviewOutcome.ts` |
| The [landing](../glossary.md#landing) on a [target](../glossary.md#target) | `Landing.landOnTarget` in `src/services/lifecycle/Landing.ts`, called from a lock hold in `src/services/overseer/Airlocks.ts` |
| Removing an [onboarder](../glossary.md#onboarder)'s snapshot [worktree](../glossary.md#worktree) | `applySettledOnboarders` in `src/services/overseer/Onboarding.ts` |
| A worktree repair | `repairWorktree` in `src/services/control/RepairControls.ts` |
| Reading each [Watcher instance](../glossary.md#watcher-instance)'s [event log](../glossary.md#event-log) for token credit | `creditEndedJob` in `src/services/overseer/EndedJobTokens.ts` |

![Three lanes: holder, tracker files, git. Inside a lock hold, mutate runs a git command and the commit lands on the target at once, while Board changes stay in memory. A crash or tripped fence before the journal loses the Board changes and leaves the files unchanged, and the commit stays. A later lock hold repeats the step, landOnTarget answers already-landed, and the journal records the landing.](../figures/storage/git-outside-the-transaction.png)
*Nothing rolls git back, so every git step inside a lock hold has to tolerate being run twice.*

Three consequences follow.

1. **Waiters feel git's speed.** A command arriving during a slow lock hold retries for its bounded wait, then exits 2
   with `tracker-lock-held`. The lock hold it waited on carries on.
2. **Git effects survive a lost lock hold.** A refusal or crash after a git command leaves that commit or ref in place.
   Landing tolerates this by asking git first: `landOnTarget` answers `already-landed` for a commit the target holds.
3. **A long lock hold can lose its lock.** Past the stale bound, a waiter takes over. The old holder's next fence is
   the one in `commitHold`, so it runs `mutate` to the end, then throws, and its `Board` changes are discarded. In a
   Pass, `drain` in `src/services/overseer/DrivePass.ts` catches the throw, logs it and leaves the work for the next
   wake-up.

[The Pass](../architecture/the-pass.md#inside-the-hold) lists which steps run inside a lock hold and which run after it.

## The log as an input

`log.jsonl` is state. The `Board` receives the stored records at construction and reads them with this lock hold's
records appended, so a rule sees its own lock hold's events. A restart derives the same answer, and no clock enters it.

![Log record kinds on the left feed three clusters of derived facts. ticket-readied, ticket-reopened and merge-queued give ready order and merge order, which decide which ticket launches or lands first. job-launched, job-ended, job-resumed and incident-opened give attempts and review round, failed passes, red-handoff resumes, consecutive replacements and Assistant boots, which decide when a retry stops. incident-defaulted, hatch-applied and agent-stopped give an incident's default action taken once, request applied once and tokens already credited, so nothing applies twice. tracker-cleared, from a User clearing, keeps only the records from it on, so a dashed line restarts all three clusters.](../figures/storage/log-as-input.png)
*Delete a log line and a fact changes.*

The facts below steer the lifecycle. The folded table lists other readers, and it is not exhaustive.

| Derived fact | Records read | Reader |
| --- | --- | --- |
| Ready order | `ticket-readied`, `ticket-reopened` positions | `readinessPositionByTicketId` in `src/lib/tracker-model/DispatchQueries.ts` |
| Merge order | `merge-queued` positions | `mergeCandidatesOf` in `src/lib/tracker-model/AirlockClaims.ts` |
| [Failed passes](../glossary.md#failed-pass) | `job-launched`, `job-ended`, status moves, `ticket-unheld` | `FailedPassUtil.failedPassesOf` |
| [Red-handoff](../glossary.md#red-handoff) resumes | `job-resumed` with the red cause, reviews ending `does-not-hold` | `handoffCycleResumesOf` in `src/lib/tracker-model/Playbook.ts` |
| Consecutive replacements of a ticket's job | `job-ended` `replaced`, [`incident-opened`](../glossary.md#incident) `job-lost` | `replacedInARowOf`, same file |
| Whether an outage decision is due | `job-interrupted` crash causes, verified endings, `overseer-set`, `decision-opened` of kind `outage` | `outageIsDue`, same file |
| [Assistant](../glossary.md#assistant) boots | `job-ended` on `assistant` jobs since `overseer-started` | `failedAssistantBootsOf`, same file |
| Review round | `job-ended` `round-granted` since `ticket-finished` | `nextReviewRoundOf`, same file |
| Build, merge and [refresh](../glossary.md#refresh) [attempts](../glossary.md#attempt) | `job-launched` | `lastBuildAttemptOf` in `src/lib/tracker-model/Playbook.ts`; `mergeAttemptsOf`, `claimRefreshSlot` in `src/lib/tracker-model/AirlockClaims.ts` |
| An incident's default action, taken once | `incident-defaulted` after a same-kind `incident-opened` | `defaultWasTakenBefore` in `src/lib/tracker-model/IncidentMoves.ts` |
| Reopening an ended job | Its `job-launched` and every instance record | `reopenEndedJob` in `src/lib/tracker-model/Jobs.ts` |
| Hatch request applied once | `hatch-applied` | `hatchRequestIsApplied`, same file |
| Landings on a target | `merge-landed` | `recordedLandingsOn` in `src/lib/tracker-model/AirlockClaims.ts` |
| Tokens already credited | `agent-stopped` | `TokenCrediting.tokensStillToCreditOf` in `src/services/lifecycle/TokenCrediting.ts` |

<details>
<summary>Other readers of the log</summary>

| Derived fact | Records read | Reader |
| --- | --- | --- |
| Ref moves Customs allows | `job-launched`, `job-ended` with a landing outcome | `refMovesAllowedOf` in `src/services/lifecycle/Customs.ts` |
| Findings filed by this job | `ticket-filed`, `hatch-applied` | `filedFindingsWereFiledByThisJob`, same file |
| Retried build's start | `job-launched`, `job-ended` `failed` | `retriedFailedBuildJobIdOf`, same file |
| A tree's gate passed | `gate-ran` | `landMerge` in `src/services/control/AirlockControls.ts`, `mergedTreeWasLastPassed` in `src/services/overseer/Airlocks.ts` |
| Consecutive target moves | `job-ended` with the target-moved cause | `targetMovesInARowOf` in `src/services/overseer/Airlocks.ts` |
| Airlock agents launched and resumed | `job-launched`, `job-resumed` | `launchesUnder`, `redResumesOf`, same file |
| [Builder](../glossary.md#builder) returns from review | `job-ended`, `ticket-unheld` | `builderReturnsFromReview` in `src/lib/tracker-model/Playbook.ts` |
| Red handoff carries to a fresh [session](../glossary.md#session) | `job-interrupted`, `job-ended` `replaced` | `redHandoffCarriesOver`, same file |
| One onboarder per `checks-not-set` | `decision-opened`, `job-launched` | `onboarderAnsweredChecksNotSet`, same file |
| Session owner of a resumed job | `job-launched`, `job-ended` | `sessionOwnerJobIdOf` in `src/services/overseer/JobResumption.ts` |
| An agent-config decision answered | `decision-opened`, `decision-answered`, `job-ended` | `agentConfigHitIsSettled` in `src/services/overseer/JobLaunch.ts` |
| Non-converging reviews | `review-recorded`, `ticket-delivered`, `ticket-abandoned` | `nonConvergingTicketIdsOf` in `src/services/lifecycle/ReviewOutcome.ts` |
| Answer text to deliver | `decision-answered` | `answerOf` in `src/services/overseer/AnswerDelivery.ts` |
| Message numbering | `job-messaged` | `deliverJobControls` in `src/services/overseer/JobControlDelivery.ts` |
| Chain of intake jobs and carried answers | `job-launched`, `decision-answered`, `job-reopened` | `intakeChainOf`, `refreshIntake` in `src/lib/tracker-model/JobControls.ts` |
| First Overseer start | `overseer-started`, with `overseerFirstStartedAt` in `progress.json` | `submitFirstRunLeftovers` in `src/lib/tracker-model/Findings.ts` |
| A job's ended outcome | `job-launched`, `job-ended` | `endedJobOutcomeOf` in `src/lib/tracker-model/Jobs.ts` |
| Defaulted incidents since the last start | `overseer-started`, `incident-defaulted` | `defaultedIncidentsOf` in `src/services/overseer/IncidentRouter.ts` |
| Text of a reopening | `job-reopened` | `reopenTextOf` in `src/services/overseer/JobResumption.ts` |
| The session a job replaces | `job-launched`, `job-interrupted`, `job-ended` | `earlierSessionWasReplaced`, `redHandoffTakenOverOf`, same file |
| The Assistant's incident history | Every record naming an incident | `incidentHistoryOf` in `src/services/overseer/AssistantBoot.ts` |
| User's messages to an Assistant | `job-messaged` | `userMessagesOf` in `src/services/overseer/AssistantSession.ts` |
| An onboarder's gate history | `gate-ran` | `onboardingFactsOf` in `src/services/overseer/Onboarding.ts` |
| The job a worktree patch belongs to | `job-launched` | `jobIdForPatchOf` in `src/services/control/RepairControls.ts` |
| Tickets showing the attribution notice | `job-launched`, `job-ended` with the attribution cause | `attributionTicketIdsOf` in `src/services/overseer/JobLaunch.ts` |
| What wakes a waiting `await` | `decision-opened`, `incident-escalated` | `wakingRecordsAfter` in `cli/tracking/await/AwaitCommand.ts` |
| A finished job's record | `job-launched`, `job-ended` | `finishedJobOf` in `cli/jobs/JobCommand.ts` |
| Review statistics | `review-recorded` | `reviewStatisticsOf` in `src/lib/tracker-model/ReviewStatistics.ts` |
| The merges report | `merge-queued` | `mergesReportOf` in `cli/merges/MergesCommand.ts` |
| The Bridge's question history | Decision and incident records, Assistant and product-owner job records | `questionHistoryOf` in `src/services/overseer/BoardState.ts` |
| The Bridge's ended jobs | `job-launched`, `job-ended` | `endedJobsOf`, same file |
| The log in the page payload | Every record | `assemblePagePayload` in `src/services/render/PagePayloadAssembly.ts` |

</details>

Membership of the [merge queue](../glossary.md#merge-queue) is `mergeQueued` on the [row](../glossary.md#row) in
`progress.json`; the `merge-queued` record gives only the position. What the reports mean is in
[Measurement](../architecture/measurement.md).

Because of this, **`clear` wipes lifecycle memory**: failed passes, attempts, resumes, once-only guards and ready order
all start again from the `tracker-cleared` record.

![Before and after clear, side by side. Before, progress.json holds rows, jobs, decisions and incidents, a job's crashResumes and overseerFirstStartedAt, and log.jsonl holds job-launched, job-ended and every other record. After, rows are reseeded from surviving tickets, jobs, decisions, incidents, crashResumes and overseerFirstStartedAt survive, and the log holds only tracker-cleared. A kept live job has a broken link to its missing job-launched record.](../figures/storage/clear-cuts-the-log.png)
*The kept job still points into the log, and what it points at is gone.*

> **Careful.** `clearTracker` in `src/lib/tracker-model/TrackerChanges.ts` empties `tasks` and resets `startedAt` and
> `view`. It leaves any jobs, [decisions](../glossary.md#decision) and incidents in `progress.json`, so a live job loses
> the launch record its counts read. A job's `crashResumes` and `overseerFirstStartedAt`, which
> `submitFirstRunLeftovers` reads to tell the first Overseer start, are stored in `progress.json`, so they survive a
> restart and `clear`.

## How the log is written

The log is never appended. Each lock hold that logged something writes the stored records plus its own as one whole-file
atomic rewrite, through the journal like any file. `LogRecordCollector.recordsToWrite` decides what the file holds:

| The lock hold logged | `log.jsonl` afterwards |
| --- | --- |
| Nothing | Stays as it is. `recordsToWrite` returns `null`. |
| Records | Stored records, then this lock hold's. |
| A `tracker-cleared` | Only the records from the last clearing on. |

The read is as strict as `progress.json`. `LogFileIngestion` parses every line and checks it against
`LOG_RECORD_SCHEMA`; one malformed line makes the whole log `unreadable`, rather than silently shorter, and the reason
names the file and line. A shorter log would mean wrong counts. A missing file reads as empty, blank lines are skipped
and a last line without a newline still reads. Record kinds are listed under [Files on disk](../cli.md#files-on-disk) in
the CLI reference.

> **As built.** Every lock hold reads the whole log; each one that logged rewrites it, and the journal carries it a
> second time. See [whole log and bodies](../reference/known-gaps.md#gap-scaling-whole-log-and-bodies).

## What breaks and what still works

A broken file costs what depends on it. A broken `progress.json` or `log.jsonl` stops the tracker, a broken journal
stops every write, a broken `pipeline.json` stops board work, and a broken ticket, epic or filing draft is skipped and
named. The full list of files is in the [atlas](on-disk-atlas.md); the wording of each refusal is in
[Refusals](../reference/refusals.md). The atlas also lists the
[job files that must be readable](on-disk-atlas.md#job-files-that-must-be-readable).

Which formats keep content they do not know, and which refuse it, is in
[Preservation and strictness](entities.md#preservation-and-strictness).

![A matrix of broken files against status, progress-only reads, any write and the Pass. A malformed progress.json stops all four. A malformed log.jsonl stops all but progress-only reads. A malformed hold-journal.json stops writes and the Pass while status works and names it. A malformed pipeline.json leaves reads working, gate verbs refuse, and board work waits on the User. A malformed ticket, epic or filing draft is skipped and named. A malformed event log holds only that job.](../figures/storage/broken-file-blast-radius.png)
*Read down a column to see what one reader survives. Red stays in the top four rows.*

Progress-only reads are the commands that go through `requireProgressFile`, such as `decisions`: they read
`progress.json` and no log. A broken `progress.json` stops a Pass at `observe`; a broken log or journal stops it when
its lock hold opens. `progress.json` and `log.jsonl` are the exception to the Stored files rule in
[CLAUDE.md](../../CLAUDE.md): `status` exits 2 naming the file and its reason, held by
`cli/UnreadableTrackerWording.spec.ts`. The same rule covers older files.

<details>
<summary>Every stored format: write mode, read, version check and what a malformed file costs</summary>

| File | Write mode | Read | Version check | When malformed | What still works |
| --- | --- | --- | --- | --- | --- |
| `progress.json` | Atomic; `init` exclusive | Strict, keeps unknown keys | Equals `CURRENT_PROGRESS_FILE_VERSION` | `unreadable-tracker`, exit 2 | No command that reads the board, `status` included. |
| `log.jsonl` | Atomic, whole file | Strict | None, kinds checked | `unreadable-tracker`, exit 2 | Reads through `requireProgressFile`, such as `concurrency`, `decisions`, `incidents`, `oversee status`. No write. |
| `hold-journal.json` | Atomic | Strict, whole or nothing | Equals `HOLD_JOURNAL_FORMAT_VERSION` | `malformed-hold-journal`, exit 2 | Every lock-free read. `status` names it. No write. |
| `pipeline.json` | Atomic | Strict, refuses unknown keys | None | Board reads no pipeline; `gate` verbs refuse `malformed-pipeline` | Reads and CLI moves work. The board behaves as if no pipeline were set: launches, resumes, merge-queue steps and [Airlock](../glossary.md#airlock) [sweeps](../glossary.md#sweep) stop, `checks-not-set` opens and an onboarder launches. An accepted `pipeline-proposal` is not guarded: it writes a whole pipeline over the malformed file, starting from empty. |
| Ticket file | Atomic | One line-oriented parse, keeps unknown lines | None | Skipped and reported | Every other ticket. Its id stays spent. |
| Epic file | Atomic | Keeps unknown lines | None | Skipped and reported | Every other epic. |
| Filing draft file | Atomic | Keeps unknown keys | Equals `CURRENT_DRAFT_FILE_VERSION` | Skipped and reported | Every other filing draft. |
| `generation-<n>` | Exclusive | Tolerant | None | Judged on its mtime, then free | The lock, after the stale bound. |
| `version.json` | Atomic, written last | Strict | Against `INSTALL_VERSION` | Reads as a mismatch | Commands the version check exempts. |
| [`events-<instance>.ndjson`](../glossary.md#event-log) | Append in place | Ignores an unterminated last line | [Watcher](../glossary.md#watcher)'s own format version | That job's events wait, logged by the Pass | Every other job. |
| `overseer.log` | Append in place | Nothing parses it | None | Not applicable | Everything. |
| `projects.json` | Atomic, under `<monitor>/.lock` | Keeps unknown keys | Supported version | Readable entries written back, reported on stderr | The command keeps its exit code. |
| `usage-limit.json` | Atomic | Strict | None | Read as no [marker](../glossary.md#usage-marker), logged by the Pass | Launches go on. |

</details>

## The atomic-file package

`src/lib/atomic-file/AtomicFile.ts` is the one way to replace a board file, the log or the journal. Five calls:

| Call | Mechanism | Used for |
| --- | --- | --- |
| `writeFileAtomically` | Temporary file beside the target, `fsync`, rename. Follows a symlink, keeps the mode. | Almost every stored file. |
| `writeFileAtomicallyThroughLinks` | The same, at the end of a possibly dangling link chain. | `CLAUDE.md` and `.gitignore` in a tracked repository. |
| `createFileAtomically` | The complete temporary file is hard-linked into place, which fails on an existing target. Where the link fails for another reason, as on FAT, exFAT and some shares, the target is created by exclusive open, so a reader can see part of it. | Generation records, `init`'s `progress.json`, the Watcher record claim. |
| `createWholeFileAtomically` | The same link with no fallback: a failed link is thrown, so a reader sees the file whole or absent. | [Baton](../glossary.md#baton) records, since a partial one reads as dead. |
| `removeHeldFile` | Removes a file, throwing what held it. | The hold journal, the files it removes, gate slots. |

On Windows a rename or removal failing with `EPERM`, `EBUSY` or `EACCES` is retried, since something else may hold the
file: `HELD_FILE_RETRY_TRIES` tries, the waits growing by `HELD_FILE_RETRY_STEP_MILLISECONDS`, under 2 seconds in all
and with the lock held throughout. Past the last try the failure is thrown as it is. Every other platform tries once.

Two files bypass this package and append in place, both listed under Deviations in [CLAUDE.md](../../CLAUDE.md).

| File | Written by | Why it appends |
| --- | --- | --- |
| `events-<instance>.ndjson` | The Watcher, `fsync`ed before its `end` is written | A reader ignores a cut-short last line. |
| `overseer.log` | The Overseer, one line per write | A log someone tails is never replaced. |

The temporary file sits beside the target because a rename across filesystems is a copy. `createFileAtomically` answers
`already-exists` instead of throwing, which is how a lost race reads. A process killed mid-write leaves a
`<target>.<pid>.<random>.tmp` file; the store listings match on `.md` and `.json` and do not see it.

The `fsync` covers the file's contents, not the folder that holds the rename. So a process crash cannot lose a landed
rename, but a power loss may.

Some working files sit outside these calls: step verdicts and `start.json` in a job folder, review proposals and gate
slot files use plain `writeFileSync`, so they can be cut short. The [atlas](on-disk-atlas.md#write-modes) lists each
write mode.

## Invariants

1. Every change the tool makes to `progress.json`, a ticket, an epic, a filing draft, `pipeline.json` or `log.jsonl`
   after `init` goes through `writeTracker` and `commitHold`.
2. A refusal or throw before `commitHold` writes no tracker file. A replay in step 2 stands, and git work in `mutate`
   stays.
3. After a process crash, once `hold-journal.json` exists, every file it lists ends up with exactly the journaled bytes,
   unless someone removes the journal by hand.
4. No holder reads a board file or the log while a whole journal sits on disk: replay runs first, and a malformed one
   refuses.
5. A log line never describes a change that is not stored. `log.jsonl` is the last file a lock hold writes.
6. Every file `commitHold` writes, and the journal, is always whole.
7. A generation record is never rewritten, and only a process that created a higher one removes it.
8. A holder that sees a higher generation writes no tracker file further; only its release record may follow.
9. A clock decides only lock staleness here, against a stamp the tool wrote.

## In the code

| Concept | Path | Symbol | Held by |
| --- | --- | --- | --- |
| The write sequence | `src/services/tracker/TrackerPipeline.ts` | `writeTracker`, `plannedHoldOf` | `src/services/tracker/TrackerPipeline.spec.ts` |
| Commit and replay | `src/services/tracker/HoldJournal.ts` | `commitHold`, `replayHoldJournal`, `readHoldJournal` | `src/services/tracker/HoldJournal.spec.ts` |
| Writing the journal | `src/adapters/hold-journal/HoldJournalWriter.ts` | `createHoldJournalWriter` | `cli/HoldJournalCrash.integration.spec.ts` |
| A killed holder, across processes | `cli/HoldJournalCrash.integration.spec.ts` | `killedHolderSource` | Itself |
| Journal format and path check | `src/adapters/hold-journal/HoldJournalIngestion.ts` | `HoldJournalIngestion`, `pathStaysInsideTheDataFolder` | `src/adapters/hold-journal/HoldJournalIngestion.spec.ts` |
| The lock and the fence | `src/services/tracker/TrackerLock.ts` | `withLock`, `withLockAt`, `generationIsFree`, `lockHoldOf` | `src/services/tracker/TrackerLock.spec.ts` |
| A landing that tolerates a repeat | `src/services/lifecycle/Landing.ts` | `Landing.landOnTarget` | `src/services/lifecycle/Landing.spec.ts` |
| The Pass's read step and loop | `src/services/overseer/DrivePass.ts` | `observe`, `drain` | `src/services/overseer/CrashMatrix.spec.ts` |
| Clearing the board | `src/lib/tracker-model/TrackerChanges.ts` | `clearTracker` | `src/lib/tracker-model/Board.clear.spec.ts` |
| Lock-free reads | `src/services/tracker/TrackerReader.ts` | `readTracker`, `requireTracker`, `requireProgressFile` | `src/services/tracker/TrackerReader.spec.ts` |
| Every path of a tracker | `src/services/tracker/Workspace.ts` | `workspacePathsFor`, `findWorkspace` | `src/services/tracker/Workspace.integration.spec.ts` |
| What the log file holds | `src/adapters/log/LogRecordCollector.ts` | `createLogRecordCollector` | `src/adapters/log/LogRecordCollector.spec.ts` |
| Strict log read | `src/adapters/log/LogFileIngestion.ts`, `src/adapters/log/LogRecordProblem.ts` | `LogFileIngestion`, `logRecordProblemOf` | `src/adapters/log/LogFileIngestion.spec.ts` |
| Failed passes as a log reading | `src/lib/tracker-model/utils/FailedPassUtil.ts` | `FailedPassUtil.failedPassesOf` | `src/lib/tracker-model/utils/FailedPassUtil.spec.ts` |
| Progress file read and write | `src/adapters/progress/` | `ProgressFileIngestion`, `createProgressFileWriter` | `src/adapters/progress/ProgressFileIngestion.spec.ts` |
| Atomic writes | `src/lib/atomic-file/AtomicFile.ts` | `writeFileAtomically`, `createFileAtomically` | `src/lib/atomic-file/AtomicFile.spec.ts` |
