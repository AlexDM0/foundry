# Known gaps

> **Question:** Where does the code as built fall short of its intent or its own words, and how do I work with it?
> **Time:** 5 minutes for the index; 1 minute per entry.
> **Read first:** [Overview](../concepts/overview.md), [Glossary](../glossary.md).
> **Next:** [Runbook](../operations/runbook.md), [State machines](../data-model/state-machines.md),
> [Backlog](../backlog.md).

## In one screen

This page lists every known place where the code at commit 70ce56de differs from what its comments, prompts, help text
or rules say, or from what a reader would expect. It is the only page that explains a defect, and nothing here is a
plan: agreed work lives in the [backlog](../backlog.md).

Five bugs can leave work waiting for no visible reason. Check these first when a [ticket](../glossary.md#ticket) stops
moving:

- `forge merges` shows an [Airlock](../glossary.md#airlock) staying in phase `gating`, and no
  [job](../glossary.md#job) or ticket on the [board](../glossary.md#board) advances: [a merged-tree gate blocks the
  Pass](#gap-merge-gate-blocks-pass).
- A ticket keeps its `parked:<cause>` [ticket hold](../glossary.md#ticket-hold) after User answers its `parked`
  [decision](../glossary.md#decision): [the hold stays](#gap-answering-parked-does-not-unhold).
- A ticket stays `in-review` after User answers its [waiver](../glossary.md#waiver): [the answer has no
  effect](#gap-waiver-answer-has-no-effect).
- `forge jobs` shows a job stuck `launching`, or a `quiet-job` [incident](../glossary.md#incident) is open
  on a job whose transcript is empty (`forge job attach <J> --json` lists no `lines`): the job's
  [session](../glossary.md#session) never started. Either [its Watcher was not retried](#gap-spawn-never-retried), or
  [its Watcher ended first](#gap-launching-job-stranded).
- The [Bridge](../glossary.md#bridge) shows a past usage reset and incidents stay undelivered: [the stale marker stops
  delivery](#gap-stale-usage-marker-stops-delivery).

![A ladder from one root, nothing is moving. If an Airlock stays in phase gating, which merges shows and agents see as queued, a merged-tree gate is stalling the Pass: kill the gate process. If the ticket holds parked and its decision is closed, run ticket unhold. If the ticket is in-review with a job awaiting-answer and its waiver answered, the route depends on whether User granted or refused: see the entry. If a job is stuck launching, or a quiet-job incident is open on a job with an empty transcript, its session never started: run oversee restart, and job stop if it stays stuck. If open incidents stay undelivered and resetsAt is past, delete the usage marker.](../figures/known-gaps/five-silent-stalls.png)

*Read down from the top: the first symptom that applies names the stall and its way out.*

## How to read an entry

Every entry has the fields Expected, Does, Effect, Instead, Evidence, Established and Severity. Entries in the
Agent-facing text group use Text says and Code does for the first two. Established says how the entry is known:
**read** from the code, **probed** in a scratch repository, or by a **test**. An entry established by reading was not
exercised on a live board.

- **bug**: behaviour differs from the stated intent, and a ticket or a person can be affected.
- **misleading text**: the behaviour is fine or defensible, and a text that people or agents read says otherwise.
- **leftover**: unreachable or unread code or prose with no effect at runtime.

`<id>` is a ticket id, `<J>` a job id and `<I>` an incident id. `<data>`, `<worktrees>` and `<monitor>` are the folders
named in the [Glossary](../glossary.md#reading-names).

## Index

| Gap | Group | Severity | Summary |
| --- | --- | --- | --- |
| [gap-waiver-answer-has-no-effect](#gap-waiver-answer-has-no-effect) | Lifecycle | bug | Answering a waiver changes nothing; review keeps waiting |
| [gap-merge-agents-skip-customs](#gap-merge-agents-skip-customs) | Lifecycle | bug | [Airlock](../glossary.md#airlock) agents skip [Customs](../glossary.md#customs), but for V10 |
| [gap-landed-worktrees-stay](#gap-landed-worktrees-stay) | Lifecycle | bug | Landed ticket [worktrees](../glossary.md#worktree) and branches are never removed |
| [gap-refused-merge-relaunches-review](#gap-refused-merge-relaunches-review) | Lifecycle | bug | A refused merge relaunches a review while undecided |
| [gap-malformed-ticket-answer-v6](#gap-malformed-ticket-answer-v6) | Lifecycle | bug | Answering `malformed-ticket` fails the job's own Customs |
| [gap-merge-gate-blocks-pass](#gap-merge-gate-blocks-pass) | Lifecycle | bug | A merged-tree gate stalls the whole [Pass](../glossary.md#pass) |
| [gap-clear-all-reuses-ticket-ids](#gap-clear-all-reuses-ticket-ids) | Lifecycle | misleading text | `clear --all` restarts ticket ids at 001 |
| [gap-group-tickets-missing-from-ready-ids](#gap-group-tickets-missing-from-ready-ids) | Lifecycle | misleading text | The ready list omits tickets the Playbook launches |
| [gap-answering-parked-does-not-unhold](#gap-answering-parked-does-not-unhold) | Lifecycle | bug | Answering `parked` leaves the hold in place |
| [gap-held-target-retries-unbounded](#gap-held-target-retries-unbounded) | Lifecycle | bug | An untracked file makes a held target retry forever |
| [gap-refresh-gate-default-loops](#gap-refresh-gate-default-loops) | Lifecycle | bug | A refresh's gate incident keeps reopening |
| [gap-failed-review-rounds-replaced](#gap-failed-review-rounds-replaced) | Lifecycle | bug | `review-stats` drops a failed review round |
| [gap-customs-red-leaves-input-open](#gap-customs-red-leaves-input-open) | Lifecycle | bug | A Customs red leaves the session input open |
| [gap-job-stop-misses-merge](#gap-job-stop-misses-merge) | Lifecycle | bug | `job stop` does not stop a merge |
| [gap-ticket-model-not-launched](#gap-ticket-model-not-launched) | Lifecycle | bug | A ticket's `model` and `effort` are shown and never launched |
| [gap-review-round-counts-bare-headings](#gap-review-round-counts-bare-headings) | Lifecycle | bug | A hand-started bar's round ignores code-written reviews |
| [gap-round-verdict-mixes-runs](#gap-round-verdict-mixes-runs) | Lifecycle | bug | A further review round is judged against an earlier run |
| [gap-outside-ref-move-fails-job](#gap-outside-ref-move-fails-job) | Lifecycle | bug | An outside ref move fails every live job at V14 |
| [gap-unreadable-pipeline-passes-merge-gate](#gap-unreadable-pipeline-passes-merge-gate) | Lifecycle | bug | A pipeline unreadable at gate time gates nothing |
| [gap-proposal-overwrites-malformed-pipeline](#gap-proposal-overwrites-malformed-pipeline) | Lifecycle | bug | An accepted proposal replaces a malformed `pipeline.json` |
| [gap-checks-not-set-stays-open](#gap-checks-not-set-stays-open) | Lifecycle | bug | Setting a pipeline does not close `checks-not-set` |
| [gap-older-pipeline-holds](#gap-older-pipeline-holds) | Lifecycle | bug | A version 1 `pipeline.json` holds the board until it is set up again |
| [gap-overseer-decisions-have-no-options](#gap-overseer-decisions-have-no-options) | Lifecycle | misleading text | `decide <E> a` is refused on most Overseer decisions |
| [gap-setup-failed-default-not-allowed](#gap-setup-failed-default-not-allowed) | Lifecycle | misleading text | `gate retry` cannot settle a merge's `setup-failed` |
| [gap-quiet-job-decisions-stack](#gap-quiet-job-decisions-stack) | Lifecycle | bug | A silent job opens one more decision per quiet cycle |
| [gap-install-hold-lets-merges-land](#gap-install-hold-lets-merges-land) | Lifecycle | misleading text | Airlocks keep landing while launches are held |
| [gap-customs-fail-open-edges](#gap-customs-fail-open-edges) | Lifecycle | bug | Two Customs and gate reads pass when git fails |
| [gap-twice-run-judges-a-changed-snapshot](#gap-twice-run-judges-a-changed-snapshot) | Lifecycle | bug | A proposal's prepare output lands on its first gate |
| [gap-clear-keeps-live-jobs](#gap-clear-keeps-live-jobs) | Lifecycle | bug | `clear` leaves live jobs without their log records |
| [gap-row-with-ticket-and-review-of](#gap-row-with-ticket-and-review-of) | Lifecycle | bug | A row can hold both `ticket` and `reviewOf` |
| [gap-incident-answer-not-delivered](#gap-incident-answer-not-delivered) | Agents and control | bug | An incident's answer never reaches the session |
| [gap-escalated-question-of-ended-job](#gap-escalated-question-of-ended-job) | Agents and control | bug | An escalated question of an ended job reaches nobody |
| [gap-assistant-job-moves-refused-at-hatch](#gap-assistant-job-moves-refused-at-hatch) | Agents and control | bug | The [Hatch](../glossary.md#hatch) refuses the [Assistant](../glossary.md#assistant)'s job-targeting moves |
| [gap-pipeline-agent-advise-filing](#gap-pipeline-agent-advise-filing) | Agents and control | bug | The [pipeline agent](../glossary.md#pipeline-agent)'s advised filing cannot succeed |
| [gap-live-pipeline-agent-under-older-name](#gap-live-pipeline-agent-under-older-name) | Agents and control | bug | A live pipeline agent job an earlier release started makes `progress.json` unreadable |
| [gap-session-profiles-weaker](#gap-session-profiles-weaker) | Agents and control | bug | Assistant, [product owner](../glossary.md#product-owner) and pipeline agent run weaker denies |
| [gap-refused-relayed-command-partial](#gap-refused-relayed-command-partial) | Agents and control | bug | A refused relayed command keeps its changes |
| [gap-hatch-order-random](#gap-hatch-order-random) | Agents and control | bug | Queued requests of a job apply in random order |
| [gap-subagents-always-empty](#gap-subagents-always-empty) | Agents and control | leftover | The profile's `subagents` field is always empty |
| [gap-launch-file-deny-one-level](#gap-launch-file-deny-one-level) | Agents and control | bug | The launch-file read deny misses process Watchers |
| [gap-usage-misses-job-sessions](#gap-usage-misses-job-sessions) | Agents and control | misleading text | `usage` never shows any [Overseer](../glossary.md#overseer) job session |
| [gap-hatch-folder-edit-write-unnamed](#gap-hatch-folder-edit-write-unnamed) | Agents and control | bug | No deny rule names another Hatch folder |
| [gap-later-job-branch-unheld](#gap-later-job-branch-unheld) | Agents and control | bug | A job can move a later job's branch |
| [gap-overseer-git-runs-repository-config](#gap-overseer-git-runs-repository-config) | Agents and control | bug | Overseer git runs repository-config commands |
| [gap-session-githooks-unguarded](#gap-session-githooks-unguarded) | Agents and control | bug | A `.githooks` write goes unseen |
| [gap-guard-hook-start-failure](#gap-guard-hook-start-failure) | Agents and control | bug | The network guard fails open at start |
| [gap-gate-network-unfiltered](#gap-gate-network-unfiltered) | Agents and control | bug | A gate's `--network` is unchecked and unenforced |
| [gap-gate-writes-unchecked-for-sessions](#gap-gate-writes-unchecked-for-sessions) | Agents and control | bug | The gate `writes` rule misses sessions |
| [gap-bash-group-survives-kill](#gap-bash-group-survives-kill) | Agents and control | bug | A Bash command outlives a session that died with its Watcher |
| [gap-429-result-not-read](#gap-429-result-not-read) | Agents and control | bug | An error `result` moves a job like a clean one |
| [gap-gate-commit-not-unsigned](#gap-gate-commit-not-unsigned) | Agents and control | bug | A gate that commits fails on a signing repository |
| [gap-allowed-moves-cannot-succeed](#gap-allowed-moves-cannot-succeed) | Agents and control | misleading text | `job-fresh` is listed where it cannot apply |
| [gap-second-refresh-loses-answers](#gap-second-refresh-loses-answers) | Agents and control | bug | Only the replaced session's answers carry over a refresh |
| [gap-refused-intake-resume-strands-drafts](#gap-refused-intake-resume-strands-drafts) | Agents and control | bug | A failed intake resume starts no fresh session |
| [gap-assistant-stop-withdraws-nothing](#gap-assistant-stop-withdraws-nothing) | Agents and control | bug | Stopping an Assistant loses what it was delivered |
| [gap-wind-down-count-one-ahead](#gap-wind-down-count-one-ahead) | Agents and control | bug | After a wind-down each chat closes one `result` early |
| [gap-stale-usage-marker-stops-delivery](#gap-stale-usage-marker-stops-delivery) | Runtime | bug | A past [usage marker](../glossary.md#usage-marker) stops incident delivery |
| [gap-restart-now-dropped](#gap-restart-now-dropped) | Runtime | bug | `oversee restart --now` loses its flag |
| [gap-baton-pass-builds-no-bridge](#gap-baton-pass-builds-no-bridge) | Runtime | misleading text | A [Baton pass](../glossary.md#baton-pass) proves no Bridge build |
| [gap-stop-dropped-during-baton-pass](#gap-stop-dropped-during-baton-pass) | Runtime | bug | A stop during a Baton pass is dropped |
| [gap-spawn-never-retried](#gap-spawn-never-retried) | Runtime | bug | A Watcher that fails to start is not retried |
| [gap-launching-job-stranded](#gap-launching-job-stranded) | Runtime | bug | A job whose Watcher ended stays `launching` |
| [gap-reboot-mid-install-ends-job](#gap-reboot-mid-install-ends-job) | Runtime | bug | A lost install Watcher ends the job |
| [gap-regrouping-report-unread](#gap-regrouping-report-unread) | Runtime | leftover | Three `RegroupingReport` fields have no reader |
| [gap-leftover-worktree-answer-removes-nothing](#gap-leftover-worktree-answer-removes-nothing) | Runtime | bug | Answering `leftover-worktree` removes nothing |
| [gap-install-change-strands-incidents](#gap-install-change-strands-incidents) | Runtime | bug | An install change strands undelivered incidents |
| [gap-nothing-is-ever-removed](#gap-nothing-is-ever-removed) | Runtime | bug | Job folders, bundles and Baton pass files accumulate |
| [gap-hold-past-stale-window](#gap-hold-past-stale-window) | Runtime | bug | A long [lock hold](../glossary.md#lock-hold) can lose the lock mid-way |
| [gap-login-item-no-keepalive](#gap-login-item-no-keepalive) | Runtime | misleading text | The login item does not restart a crashed Overseer |
| [gap-scaling-whole-log-and-bodies](#gap-scaling-whole-log-and-bodies) | Runtime | bug | Costs grow with the log and every ticket body |
| [gap-lost-process-child-runs-on](#gap-lost-process-child-runs-on) | Runtime | bug | A lost process Watcher's child runs on |
| [gap-stop-of-merge-agent-sends-no-frame](#gap-stop-of-merge-agent-sends-no-frame) | Runtime | bug | `job stop` of some jobs sends no frame |
| [gap-misshapen-request-stops-the-pass](#gap-misshapen-request-stops-the-pass) | Runtime | bug | A misshapen request stops every Pass |
| [gap-board-state-session-id](#gap-board-state-session-id) | Runtime | bug | Live facts read the wrong session of a carried-on job |
| [gap-signal-during-take-back-rebind](#gap-signal-during-take-back-rebind) | Runtime | bug | A signal during the take-back rebind ends the old Overseer |
| [gap-baton-failure-record-throws](#gap-baton-failure-record-throws) | Runtime | bug | A throw while recording a failure leaves nobody driving |
| [gap-pass-memory-effects-lost](#gap-pass-memory-effects-lost) | Runtime | bug | A crash between hold and effect loses three effects |
| [gap-fingerprint-omits-files](#gap-fingerprint-omits-files) | Runtime | bug | A hand edit of a ticket starts no Pass |
| [gap-settled-fingerprint-hides-a-write](#gap-settled-fingerprint-hides-a-write) | Runtime | bug | A write after the hold can go unacted on |
| [gap-merge-gate-outlives-its-overseer](#gap-merge-gate-outlives-its-overseer) | Runtime | bug | A dead Overseer's gate runs on beside its rerun |
| [gap-recycled-group-can-be-signalled](#gap-recycled-group-can-be-signalled) | Runtime | bug | An age check can pass on a reused group id |
| [gap-managed-block-unseen-on-idle-group](#gap-managed-block-unseen-on-idle-group) | Runtime | bug | A managed block on an idle group goes unseen |
| [gap-unmatched-subagent-counted-twice](#gap-unmatched-subagent-counted-twice) | Runtime | bug | A subagent with no `.meta.json` counts twice in live facts |
| [gap-live-budget-ignores-red-handoff](#gap-live-budget-ignores-red-handoff) | Runtime | bug | The API shows the role's budget during a resume |
| [gap-route-throw-has-no-csp](#gap-route-throw-has-no-csp) | Runtime | bug | A throw in a route answers Bun's bare 500 |
| [gap-detached-start-loses-its-error](#gap-detached-start-loses-its-error) | Runtime | bug | `oversee --detach` drops the child's error output |
| [gap-job-stop-while-install-held](#gap-job-stop-while-install-held) | Bridge | bug | Stop stays enabled while the API answers 423 |
| [gap-stream-down-flicker](#gap-stream-down-flicker) | Bridge | bug | Controls re-enable when the stream is reopened after closing |
| [gap-queued-ticket-display-word](#gap-queued-ticket-display-word) | Bridge | misleading text | A queued ticket's status word contradicts its lane |
| [gap-waiting-on-links-run-together](#gap-waiting-on-links-run-together) | Bridge | bug | Waiting-on links show with no separator |
| [gap-stored-tab-never-restored](#gap-stored-tab-never-restored) | Bridge | bug | The remembered tab is erased at load |
| [gap-header-notice-bare-kind](#gap-header-notice-bare-kind) | Bridge | bug | A header notice falls through to its kind |
| [gap-reconnect-reload-check-skipped](#gap-reconnect-reload-check-skipped) | Bridge | bug | A reconnect can keep a Bridge on old code |
| [gap-init-marker-window](#gap-init-marker-window) | Install and CLI | misleading text | `init` writes its install marker ninth, not first |
| [gap-help-text-stale](#gap-help-text-stale) | Install and CLI | misleading text | Help says low tickets wait; they do not |
| [gap-worker-filing-omits-type](#gap-worker-filing-omits-type) | Agent-facing text | misleading text | Prompts omit the required `--type` |
| [gap-ticket-body-template](#gap-ticket-body-template) | Agent-facing text | misleading text | The ticket body template lacks a Brief |
| [gap-red-handoff-says-baton-pass](#gap-red-handoff-says-baton-pass) | Agent-facing text | misleading text | The red-handoff message says Baton pass |
| [gap-checks-line-wording](#gap-checks-line-wording) | Agent-facing text | misleading text | Agent texts describe gates as one line |
| [gap-reference-omits-job-kinds](#gap-reference-omits-job-kinds) | Agent-facing text | misleading text | The installed `reference.md` lists five of eight job kinds |
| [gap-found-in-review-unprompted](#gap-found-in-review-unprompted) | Agent-facing text | misleading text | Reviewers are not told to stamp `--found-in-review` |
| [gap-product-owner-told-both](#gap-product-owner-told-both) | Agent-facing text | misleading text | A product owner's two texts disagree on asking |
| [gap-dead-code-and-unused-states](#gap-dead-code-and-unused-states) | Leftovers | leftover | Code and states production never reaches |
| [gap-stale-prose-in-code](#gap-stale-prose-in-code) | Leftovers | leftover | Comments, config and docs that misstate the build |

## Lifecycle

<a id="gap-waiver-answer-has-no-effect"></a>

### Answering a waiver has no effect

![Two lanes from User's ruling. Grant: ticket edit --force writes each A<n>. Waived line, User answers the decision, runs job fresh, and a fresh review runs. Refuse: User answers first, then runs job stop, moves the ticket to in-progress and unholds it, and a build launches.](../figures/known-gaps/waiver-by-hand.png)

*The two routes differ in order: only a grant edits the ticket, and it does so before the answer.*

- **Expected:** a `waiver` decision granted writes the items waived and queues the ticket to merge; refused, the review
  ends and the ticket goes back to its [builder](../glossary.md#builder). `ReviewOutcome.answerWaiver` says so.
- **Does:** nothing acts on the answer. `answerWaiver` has no production caller. The `decision-answer` control runs
  `Board.answerDecisionInForm`, whose `AgentQuestions.afterAnswer` moves only a `waiting-for-answer` job, so the review
  job stays `awaiting-answer`.
- **Effect:** the decision closes, nothing is written, and the ticket stays `in-review` with a job on it. The job keeps
  its [launch slot](../glossary.md#launch-slot) until someone acts.
- **Instead:** do the steps the figure shows by hand. To grant, replace each waived item's line under `## Acceptance`
  with `A<n>. Waived: <reason>`, keeping its number, using `forge ticket edit <id> --force`. Answer the
  decision, then run `forge job fresh <J>`. To refuse, answer the decision, then run
  `forge job stop <J>`, `forge ticket status <id> in-progress` and
  `forge ticket unhold <id>`.
- **Evidence:** `src/services/lifecycle/ReviewOutcome.ts` `answerWaiver`; `src/lib/tracker-model/AgentQuestions.ts`
  `afterAnswer`; `src/services/control/DecisionControls.ts` `answerDecision`.
- **Established:** read; the steps to refuse probed in a scratch repository. **Severity:** bug.

<a id="gap-merge-agents-skip-customs"></a>

### Merge agents skip Customs

- **Expected:** every [role](../glossary.md#role) clears its Customs checks. `CUSTOMS_CHECKS` numbers them V1 to V16 and
  lists a column for `airlock-agent`, among them [V13](../architecture/customs-and-gates.md) (agent config untouched)
  and V14 (only own refs moved).
- **Does:** `clearCustoms` runs for build and review jobs through `JobLaunch` and for pipeline agents through `PipelineAgentSessions`.
  `Airlocks` reads a [merge agent](../glossary.md#merge-agent)'s [report](../glossary.md#report) directly with
  `sessionReadingOf`. No caller passes the `airlock-agent` column. Of the checks, only V10 (merge resolved) runs, after
  a conflict, through `MergeRun.resolutionIsSound`.
- **Effect:** a merge agent's report is not schema-checked by Customs, and V13 and V14 never hold it. A merge agent
  that fixed a red merged tree meets no check at all. Call budgets and the merged-tree gate still apply.
- **Instead:** treat the merged-tree gate as the only verification of an Airlock agent's work.
- **Evidence:** `src/services/lifecycle/Customs.ts` `CUSTOMS_CHECKS`, `clearCustoms`;
  `src/services/overseer/Airlocks.ts` `settleAirlockAgent`; `src/services/lifecycle/MergeRun.ts`
  `resolutionIsSound`.
- **Established:** read. **Severity:** bug.

<a id="gap-landed-worktrees-stay"></a>

### Landed ticket worktrees and branches stay

- **Expected:** the comment on `RefMovesAllowed.removedAfterLandings` describes branches "the Overseer deletes after a
  landing".
- **Does:** `cleanUpAfterLanding` removes a refresh worktree and a released [group](../glossary.md#group). Nothing
  removes `<worktrees>/ticket-<id>` or branch `ticket-<id>`. `deleteMergedBranch` and `BranchIntegration.removeWorktree`
  have no production caller.
- **Effect:** every landed ticket leaves a full checkout and a branch on disk.
- **Instead:** after a landing run `git worktree remove <worktrees>/ticket-<id>` and `git branch -d ticket-<id>`.
- **Evidence:** `src/services/overseer/Airlocks.ts` `cleanUpAfterLanding`; `src/lib/git/BranchIntegration.ts`
  `deleteMergedBranch`, `removeWorktree`; `src/services/lifecycle/Customs.ts` `RefMovesAllowed`.
- **Established:** read. **Severity:** bug.

<a id="gap-refused-merge-relaunches-review"></a>

### A refused merge relaunches a review

- **Expected:** a refused merge waits for User's answer. The comment on `mergeQueueStepsOf` says "it waits for the
  answer".
- **Does:** the Playbook does not treat an open `merge-refused` decision as a reason to wait, so it starts a review.
  `merge-refused` is not in `TICKET_HOLDING_DECISION_KINDS`, and `mergeRefusalAwaitsUser` guards only
  `mergeQueueStepsOf`, which returns nothing when a review phase is set. The ticket is `in-review`, unqueued, unheld and
  jobless, so `candidateOf` yields `launch-review` while the decision is open.
- **Effect:** a review starts, and spends tokens, on a ticket whose merge User has not ruled on. The relaunched review
  reuses the released round's number, so its `review-recorded` line replaces the released line in `review-stats`; see
  [failed review rounds](#gap-failed-review-rounds-replaced).
- **Instead:** expect a review to be running by the time User sees the decision, because the next
  [Pass](../glossary.md#pass) launches it. To stop it, run `forge job stop <J>`, which also sets the ticket
  hold `stopped by User (J<n>)`, then `forge ticket unhold <id>` once the decision is settled.
  `forge ticket hold <id>` helps only while no review has launched, for example while launches are held: a
  hold stops no running job.
- **Evidence:** `src/lib/tracker-model/Playbook.ts` `TICKET_HOLDING_DECISION_KINDS`, `mergeRefusalAwaitsUser`,
  `candidateOf`, `ticketIsHeld`; `src/lib/tracker-model/JobControls.ts` `requestJobStop`;
  `src/lib/tracker-model/Playbook.reviewPhase.spec.ts` covers only the no-review case.
- **Established:** read. **Severity:** bug.

<a id="gap-malformed-ticket-answer-v6"></a>

### Answering `malformed-ticket` fails the job's Customs

- **Expected:** an agent that finds its ticket unclear opens a `malformed-ticket` incident, and the answer lets it carry
  on and finish.
- **Does:** `AgentQuestions.answerIncident` appends the answer under `## Questions` while the job is live. `start.json`
  records `bodyHashAtLaunch` once, so [V6](../architecture/customs-and-gates.md) (ticket body unchanged) at that job's
  end refuses `ticket-body-changed`. V6 is not in `RESUMABLE_CUSTOMS_CHECKS`, so the job ends `failed`.
- **Effect:** the agent's work counts as a [failed pass](../glossary.md#failed-pass), and the ticket gets a fresh
  [attempt](../glossary.md#attempt). A session blocked on its question never gets that far:
  [the answer is not delivered](#gap-incident-answer-not-delivered), so this reaches a session that reports anyway.
- **Instead:** run `forge incident escalate <I>`. The answer then travels as a decision, which leaves the
  body alone.
- **Evidence:** `src/lib/tracker-model/AgentQuestions.ts` `answerIncident`; `src/services/overseer/JobLaunch.ts`
  `recordJobStart`, `RESUMABLE_CUSTOMS_CHECKS`; `src/services/lifecycle/Customs.ts` `ticketBodyUnchanged`.
- **Established:** read. **Severity:** bug.

<a id="gap-merge-gate-blocks-pass"></a>

### A merged-tree gate blocks the Pass

![One Pass from left to right: read, lock hold, effects, then a long airlocks.sweep that awaits the prepare steps, the wait for a gate slot and the gate, with no timeout and no lock held. Nobody drives during that span. An API write lands in the store during it and goes no further. Hatch requests, Watcher events and answers wait at the end of the span and reach one later Pass.](../figures/known-gaps/merge-gate-stalls-the-pass.png)

*Everything on the board waits at the right edge of the shaded span.*

- **Expected:** a slow merged-tree gate, one of the gates the Airlock runs on the merged result, affects only its
  [target](../glossary.md#target)'s [merge queue](../glossary.md#merge-queue). Ticket gates run in their own Watchers
  for this reason.
- **Does:** `runOnePass` awaits `airlocks.sweep()`, and `runGate` awaits `GateRun.runPipeline` in the Overseer's
  process. That await covers the prepare steps, the wait for a [gate slot](../glossary.md#gate-slot) and the gates.
  `GateRun` applies no timeout. Wake-ups during that time coalesce into one later Pass.
- **Effect:** while it runs, the board applies no Hatch request, Watcher event or answer delivery. An agent's command
  prints `queued <requestId>`. Commands through the API still write, and nothing acts on them. `afterPass` does not
  run, so the Bridge updates only on a sweep's `publishState`, each `OVERSEER_SWEEP_SECONDS`, and lags the log. A fast
  gate can stall the board too, while other boards' gates hold every gate slot.
- **Instead:** keep gates short. If a gate hangs, read its `run` line in `<data>/pipeline.json` and list the matches
  with `pgrep -lf '<part of the line>'`, which reads its pattern as a regular expression. Ticket gates and other boards'
  gates can run the same line, so confirm with `lsof -a -d cwd -p <pid>` that the working directory is the Airlock's
  worktree (`<worktrees>/ticket-<id>`, or `<worktrees>/refresh-group-<name>` for a refresh) or a folder in it. The gate
  has its own process group: `ps -o pgid= -p <pid>` prints it, `kill -- -<pgid>` ends the gate with its children, and
  the gate then reads `cannot-run`. If no such process exists, look in `<monitor>/gate-slots/`, whose `slot-<k>` files
  name each holder. The Overseer takes `forge oversee stop` but finishes only when the Pass ends. The CLI
  polls `OVERSEER_STOP_TRIES` (40) times, `OVERSEER_STOP_INTERVAL_MILLISECONDS` (250) apart, then refuses
  `overseer-still-live`; the stop still happens once the gate ends.
- **Evidence:** `src/services/overseer/DrivePass.ts` `runOnePass`, `gateMergedTree`; `src/services/overseer/Airlocks.ts`
  `runGate`; `src/services/lifecycle/GateRun.ts` `runPipeline`, `runGate`; `cli/overseer/OverseerRemote.ts`
  `waitForTheBatonToGo`, `stopTheLiveOverseer`; `cli/overseer/OverseerForeground.ts` `publishState`.
- **Established:** read; the Bridge lag seen in a scratch run. **Severity:** bug.

<a id="gap-clear-all-reuses-ticket-ids"></a>

### `clear --all` reuses ticket ids

- **Expected:** `CLAUDE.md` says ticket ids are never reused or gap-filled.
- **Does:** tickets have no stored counter. `nextTicketId` derives the next id from ticket files and rows, and
  `clear --all` removes both. A scratch board filed #001 and #002, ran `clear --all --yes`, and the next filing was
  #001. `cli/HelpText.ts` states this restart as intended, so the rule and the help disagree.
- **Effect:** old ids in commits, branches and notes then name a different ticket.
- **Instead:** use `forge clear` without `--all` on a board with history.
- **Evidence:** `src/services/tracker/TicketStore.ts` `nextTicketId`; `src/lib/tracker-model/TrackerChanges.ts`
  `clearTracker`.
- **Established:** probed. **Severity:** misleading text.

<a id="gap-group-tickets-missing-from-ready-ids"></a>

### Group tickets are missing from the ready ids

- **Expected:** `readyTicketIds` lists what can start. A comment says a run over the whole board must not build a ticket
  of a group awaiting its release.
- **Does:** `DispatchQueries.withoutGroupRunTickets` drops those tickets from `readyTickets`. The Playbook builds them
  regardless: `Board` hands it every ticket, and `targetOf` sends them to the group's branch.
- **Effect:** `status`, the Next line and the Bridge's ready marks can say "nothing ready" while such a ticket launches.
- **Instead:** read `forge jobs` and the ticket's own status for a group ticket.
- **Evidence:** `src/lib/tracker-model/DispatchQueries.ts` `readyTickets`, `withoutGroupRunTickets`;
  `src/lib/tracker-model/Playbook.ts` `launchStepsOf`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-answering-parked-does-not-unhold"></a>

### Answering `parked` does not unhold

- **Expected:** an answered parked ticket continues, or something says it will not.
- **Does:** `AgentQuestions.afterAnswer` returns nothing for a decision with no job unless it is an `agent-question`. A
  `parked` decision has `jobId` null. The `parked:<cause>` hold stays and the answer is only logged. That holds for a
  `parked` decision carrying an agent's questions too: the answer reaches neither a session nor `## Questions`.
- **Effect:** the question leaves the Questions tab and the ticket stays held, with nothing saying so.
- **Instead:** run `forge ticket unhold <id>`, or use Unhold in the Bridge. That starts a fresh attempt.
- **Evidence:** `src/lib/tracker-model/AgentQuestions.ts` `afterAnswer`; `src/lib/tracker-model/Board.ts`
  `answerDecision`. The fixture `src/lib/tracker-model/testing/LifecycleWorld.ts` unholds by hand after answering.
- **Established:** read. **Severity:** bug.

<a id="gap-held-target-retries-unbounded"></a>

### A held target's retries are unbounded

- **Expected:** a target held for a dirty checkout stays held until the checkout can take the landing.
- **Does:** `recheckHeldTargets` lifts the hold at each sweep once the checkout is on its branch with no tracked
  changes: `uncommittedPathsOf` passes `--untracked-files=no`. An untracked file can still block the fast-forward,
  because `blockingFilesOf` counts it. `allocate` then merges the ticket again, the landing refuses `dirty-checkout`,
  and `freeSlot` requeues it with cause `target-held`. Nothing counts these rounds.
- **Effect:** the same ticket merges and is refused again and again, and that target lands nothing. The other way
  round, a target held for a dirty checkout stays held while any tracked file is changed, even once the blocking files
  are gone. `heldTargets` lives in memory, so a restart lifts the hold.
- **Instead:** move or delete the files the `dirty-main-checkout` notice names, and commit or restore other tracked
  changes.
- **Evidence:** `src/services/overseer/Airlocks.ts` `recheckHeldTargets`, `uncommittedPathsOf`, `allocate`;
  `src/lib/git/BranchIntegration.ts` `blockingFilesOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-refresh-gate-default-loops"></a>

### A refresh's gate incident keeps reopening

- **Expected:** the second default of a `setup-failed` or `gate-cannot-run` incident on a merge parks its ticket, and
  the Airlock aborts. The header of `Airlocks.ts` says nothing loops.
- **Does:** a refresh has no ticket, so `defaultIncident` parks nothing and `defaultWasTakenBefore`, which matches on
  tickets, never reads true. `advanceTheSlot` finds no parked ticket and no open incident, so `runGate` gates the same
  tree again and opens the same incident. A red refresh gate does not loop: it aborts the refresh and opens
  `merge-refused`.
- **Effect:** the loop runs while an Assistant is running or can come up, and the Airlock stays held. The default waits
  for a turn to close, so the gate reruns once per turn. Each run also [blocks the Pass](#gap-merge-gate-blocks-pass).
- **Instead:** correct the gate or the prepare step so the gate can run.
- **Evidence:** `src/services/overseer/Airlocks.ts` `advanceTheSlot`, `runGate`;
  `src/lib/tracker-model/IncidentMoves.ts` `defaultIncident`; `src/lib/tracker-model/Playbook.ts` `incidentDefaultStepsOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-failed-review-rounds-replaced"></a>

### Failed review rounds leave the tables

- **Expected:** `review-stats` counts every [review round](../glossary.md#review-round) a ticket had. The comment on
  `reviewStatisticsOf` limits replacement to a round recorded again after a `main-moved` rebase or a `checks-failed`
  fix.
- **Does:** `reviewStatisticsOf` keeps the latest `review-recorded` line per ticket and round number.
  `nextReviewRoundOf` restarts at 1 when a ticket returns from a builder, so a re-review's line replaces the failed
  review's. Replacement goes by round number alone, so a failed round numbered above the re-review's last round has
  nothing to replace it: it stays, and being older becomes the ticket's first kept line. A review relaunched after a
  refused merge reuses the released round's number, because `nextReviewRoundOf` counts only `round-granted` endings, so
  its line replaces the released one.
- **Effect:** the findings and claims of a failed round usually drop out of every table, while its review tokens stay.
  Serious findings per ticket read low, and tokens per finding read high. A failed round above the re-review's last
  number stays instead and supplies the change size, and a same-number relaunch after a refused merge replaces the
  released line.
- **Instead:** read the `review-recorded` lines in `<data>/log.jsonl` for a ticket's whole history.
- **Evidence:** `src/lib/tracker-model/ReviewStatistics.ts` `reviewStatisticsOf`; `src/lib/tracker-model/Playbook.ts`
  `nextReviewRoundOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-customs-red-leaves-input-open"></a>

### A Customs red leaves the session input open

- **Expected:** a resumed job runs in one session, because the instance that reported has its input closed.
- **Does:** `deliverBuildJobFrames` closes input only for a job in `in-customs` or `gating` when its effects run. A job
  that a Customs red moves on, or that ends from `in-customs`, has left those states by then.
- **Effect:** the instance that reported stays alive, and a resume runs beside it. It stays alive after the job ends
  too.
- **Instead:** no verb closes that input, so nothing can be done at a terminal.
- **Evidence:** `src/services/overseer/JobLaunch.ts` `deliverBuildJobFrames`, `runBuildJobEffects`, `verifyAndRoute`.
- **Established:** probed with the fake agent and a V15 red: the job ended `red-resumes-spent` with three instances
  `live` and no `input-closed` marker. How a real vendor session behaves beside its resume was not tested. **Severity:**
  bug.

<a id="gap-job-stop-misses-merge"></a>

### `job stop` does not stop a merge

- **Expected:** `forge job stop <J>` on a merge job stops the merge.
- **Does:** `requestJobStop` moves the job to `stopping` and sets a ticket hold, and the Airlock reads neither that
  state nor that hold, nor `stopRequest`.
- **Effect:** the merge runs on to its next exit and may land. The ticket is then delivered with the
  `stopped by User (J<n>)` hold still on it.
- **Instead:** run `forge ticket park <id> -- <reason>`: the Airlock reads a `parked:` ticket hold.
- **Evidence:** `src/lib/tracker-model/JobControls.ts` `requestJobStop`; `src/services/overseer/Airlocks.ts`
  `advanceTheSlot`.
- **Established:** probed against the Airlock harness: the job ended `landed`. **Severity:** bug.

<a id="gap-ticket-model-not-launched"></a>

### A ticket's model and effort never reach a launch

- **Expected:** `cli/HelpText.ts` says `--model` and `--effort` name what the agents building and reviewing a ticket run
  on, and `ticket agent` changes them.
- **Does:** `LaunchSettings.launchSettingsOf` takes each role's pair from the pipeline's `agents`, else the role's
  default.
  `TicketDefaultsUtil.agentModelOf` and `agentEffortOf` feed status documents, `review-stats` and `ticket agent`, and no
  launch reads them.
- **Effect:** a ticket filed `--model haiku` builds on `WORKER_MODEL`, while `status`, `ticket show` and the `byBuilder`
  table of `review-stats` report `haiku`.
- **Instead:** read a ticket's model and effort as labels. Set each role's through the pipeline's `agents`.
- **Evidence:** `src/services/overseer/LaunchSettings.ts` `launchSettingsOf`; `src/services/overseer/DrivePass.ts`,
  the launch request;
  `src/lib/tracker-model/utils/TicketDefaultsUtil.ts`; `cli/HelpText.ts`.
- **Established:** read. **Severity:** bug.

<a id="gap-review-round-counts-bare-headings"></a>

### A hand-started review bar counts bare headings

- **Expected:** a hand-started [review bar](../glossary.md#review-bar) takes the round after the reviews already
  written.
- **Does:** `TicketBodyUtil.reviewSectionCountOf` matches only a bare `## Review` (`REVIEW_SECTION_HEADING_PATTERN`).
  `ReviewOutcome.reviewSectionOf` writes `## Review <round>`, so code-written sections never count.
  `TicketAcceptanceUtil.REVIEW_HEADING` does accept the number. The Playbook is unaffected: it uses its own
  `nextReviewRoundOf`.
- **Effect:** `task add` on a reviewed ticket and `ticket rereview --start-review` store round 1 after any number of
  code-written reviews.
- **Instead:** read the round from the ticket's `## Review <n>` headings, not from a hand-started bar.
- **Evidence:** `src/adapters/utils/TicketBodyUtil.ts`; `src/services/lifecycle/ReviewOutcome.ts` `reviewSectionOf`;
  `cli/tickets/ReviewBarRequest.ts`; `cli/tracking/task/TaskAdd.ts`.
- **Established:** read. **Severity:** bug.

<a id="gap-round-verdict-mixes-runs"></a>

### A round verdict reads rounds of earlier runs

- **Expected:** a verdict on a further review round compares the rounds of this run: its refusal reason is
  `previous-round-not-reviewed-in-this-run`.
- **Does:** `ReviewOutcome.recordedRoundsOf` passes every `review-recorded` line of the ticket, while
  `Playbook.nextReviewRoundOf` restarts rounds when a ticket returns from a builder. In `nextRoundVerdictOf`, `find`
  then returns the oldest line of that round number, and `findingsOfRoundsBefore` mixes the runs.
- **Effect:** a round request can be granted or refused on the findings of a run a builder has since replaced.
- **Instead:** nothing to do at a terminal. Read the ticket's `review-recorded` lines in `<data>/log.jsonl` to see what
  a verdict compared.
- **Evidence:** `src/lib/tracker-model/utils/RoundVerdictUtil.ts` `nextRoundVerdictOf`, `findingsOfRoundsBefore`;
  `src/services/lifecycle/ReviewOutcome.ts` `recordedRoundsOf`; `src/lib/tracker-model/Playbook.ts` `nextReviewRoundOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-outside-ref-move-fails-job"></a>

### A ref moved by hand fails a live job

- **Expected:** [V14](../architecture/customs-and-gates.md) fails a job for the refs that job moved.
- **Does:** `launchSnapshotOf` records every ref, remote-tracking refs and tags included, and `onlyOwnRefsMoved`
  compares all of them. `RefMovesAllowed` exempts the job's own branch, other jobs' branches and the Overseer's recorded
  landings, and has no case for a person. A pipeline agent's allowance is empty, so any ref moving during its session fails
  it.
- **Effect:** a commit on the main line, a `git fetch` that moves a remote-tracking ref, or a hand-deleted branch of a
  ticket that did not land ends each build and review job live across the move `failed`, cause `foreign-ref-moved`. V14
  is not in `RESUMABLE_CUSTOMS_CHECKS`, so each counts as a [failed pass](../glossary.md#failed-pass) and a fresh agent
  starts.
- **Instead:** with jobs live, leave the repository's refs alone. Check with `forge jobs` first.
- **Evidence:** `src/services/lifecycle/Customs.ts` `launchSnapshotOf`, `onlyOwnRefsMoved`, `refMovesAllowedOf`;
  `src/services/overseer/PipelineAgentSessions.ts` `settledOutcomeOf`; `src/services/overseer/JobLaunch.ts`
  `RESUMABLE_CUSTOMS_CHECKS`.
- **Established:** probed for a hand commit during a review, which ended that job `failed` and launched a second review;
  read for the rest. **Severity:** bug.

<a id="gap-unreadable-pipeline-passes-merge-gate"></a>

### An unreadable pipeline passes a merged-tree gate

- **Expected:** a merged tree lands only after the pipeline's gates pass.
- **Does:** `gateMergedTree` reads `pipeline.json` afresh. When the file is not readable it runs an empty `prepare` and
  `gates`, and `GateRun.runPipeline` over no gates answers `passed`. `airlocks.sweep` runs only while the Pass's Board
  holds a pipeline, so the window is the time between that hold and the gate.
- **Effect:** a merge can land ungated if `pipeline.json` turns malformed during that window.
- **Instead:** change the pipeline through the `gate` verbs, which write it atomically, not by hand while a merge is in
  phase `gating`.
- **Evidence:** `src/services/overseer/DrivePass.ts` `gateMergedTree`, `runOnePass`; `src/services/lifecycle/GateRun.ts`
  `runPipeline`.
- **Established:** read. **Severity:** bug.

<a id="gap-proposal-overwrites-malformed-pipeline"></a>

### Accepting a proposal overwrites a malformed pipeline

- **Expected:** a malformed `pipeline.json` is refused, not replaced: every `gate` verb refuses `malformed-pipeline`.
- **Does:** `inReadablePipeline` guards the `gate` verbs alone. `answerPipelineProposal` calls
  `PipelineAgentProposal.acceptProposal`, which calls the Board moves directly. `changedPipelineOf` starts from an empty
  pipeline when the Board read none, and the hold writes the file.
- **Effect:** an answer to a `pipeline-proposal` decision loses a hand-edited file that failed to parse.
- **Instead:** repair `<data>/pipeline.json`, or copy it aside, before accepting a proposal.
- **Evidence:** `src/services/control/SettingControls.ts` `inReadablePipeline`;
  `src/services/control/DecisionControls.ts` `answerPipelineProposal`; `src/services/lifecycle/PipelineAgentProposal.ts`
  `acceptProposal`; `src/lib/tracker-model/TrackerChanges.ts` `changedPipelineOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-checks-not-set-stays-open"></a>

### The `checks-not-set` decision stays open

- **Expected:** the `checks-not-set` decision closes once the board has a pipeline.
- **Does:** `Playbook.nextStepsOf` opens it while no pipeline is set, and nothing closes it. `gate none`, a `gate add`
  and an accepted proposal leave it open, and `answerPipelineProposal` touches only its own decision.
- **Effect:** the question stays on the Questions tab after it stopped applying. Answered with no pipeline set, it
  reopens and a fresh pipeline agent launches.
- **Instead:** once a pipeline is set, run `forge decide <E> -- <text>`.
- **Evidence:** `src/lib/tracker-model/Playbook.ts` `nextStepsOf`, `pipelineAgentAnsweredChecksNotSet`;
  `src/services/control/DecisionControls.ts` `answerPipelineProposal`; `cli/overseer/OverseerWording.ts`
  `decisionWordingOf`.
- **Established:** probed for `gate none`; read for an accepted proposal. **Severity:** bug.

<a id="gap-older-pipeline-holds"></a>

### A version 1 `pipeline.json` holds the board

- **Expected:** an update of the program keeps every board working.
- **Does:** `pipeline.json` format version 2 adds `version` and `phases`. A file an earlier release wrote has no
  `version`, so it reads as older; nothing converts it. The board reads it as no pipeline, and `gate list` and every
  `gate` write refuse it with `older-pipeline`.
- **Effect:** the board holds new work and resumes, as with no pipeline, until it is set up again. The owner accepted
  this hold.
- **Instead:** set the pipeline up again: delete `<data>/pipeline.json`, then add its gates again with the `gate` verbs.
- **Evidence:** `src/adapters/pipeline/PipelineFile.ts` `documentReadingOf`; `src/services/control/SettingControls.ts`
  `requireReadablePipeline`.
- **Established:** read. **Severity:** bug.

<a id="gap-overseer-decisions-have-no-options"></a>

### Most Overseer decisions offer no options

- **Expected:** `decide <E> <letters>` answers a decision, as `cli/HelpText.ts` describes.
- **Does:** `decisionWordingOf` gives every kind but `ready-drafts` and `pipeline-proposal` one question with
  `options: []`, so a letter has nothing to name.
- **Effect:** `decide E1 a` prints `Question 1 of decision E1 has 0 options` and answers nothing. Help does not warn of
  this.
- **Instead:** answer such a decision with `forge decide <E> -- <text>`.
- **Evidence:** `cli/overseer/OverseerWording.ts` `decisionWordingOf`;
  `src/adapters/utils/OperationRefusalWordingUtil.ts`.
- **Established:** probed. **Severity:** misleading text.

<a id="gap-setup-failed-default-not-allowed"></a>

### A merge's `setup-failed` default is a move no one may choose

- **Expected:** an incident's default move is one of the moves that incident allows.
- **Does:** `Airlocks.runGate` opens a merge job's `setup-failed` with `defaultMove` `gate-retry`, and
  `ALLOWED_MOVES_BY_INCIDENT_KIND` does not list `gate-retry` for that kind. With `--incident` the verb refuses
  `incident-move-not-allowed`. Without it `incidentForMove` finds no incident the move fits and `retryGate` returns
  `changed: false`.
- **Effect:** `forge gate retry <J>` exits 0 and changes nothing, while the same move as a default retries
  the gate.
- **Instead:** fix the prepare step and let the default retry the gate.
- **Evidence:** `src/services/overseer/Airlocks.ts` `runGate`, `MERGE_GATE_INCIDENT_KINDS`;
  `src/services/control/constants/AllowedMovesByIncidentKind.ts`; `src/services/control/IncidentControls.ts`
  `incidentForMove`; `src/services/control/RepairControls.ts` `retryGate`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-quiet-job-decisions-stack"></a>

### Quiet-job decisions stack up

- **Expected:** a silent job raises one question until someone answers it.
- **Does:** `openQuietJobIncidents` checks open incidents only. The default of `quiet-job` closes the incident and opens
  a `quiet-job` decision with `requestId` null, which `Decisions.openDecision` never matches to a standing one. The
  watch counts again from 0.
- **Effect:** a job that stays silent adds one more decision every `QUIET_JOB_SWEEPS` sweeps, each time its incident
  defaults.
- **Instead:** run `forge job fresh <J>` or `forge job stop <J>`, then answer the open
  decisions.
- **Evidence:** `src/services/overseer/IncidentRouter.ts` `createQuietJobWatch`, `openQuietJobIncidents`;
  `src/lib/tracker-model/IncidentMoves.ts` `defaultIncident`; `src/lib/tracker-model/Decisions.ts` `openDecision`.
- **Established:** read. **Severity:** bug.

<a id="gap-install-hold-lets-merges-land"></a>

### An install hold does not hold merges

- **Expected:** the `install-version-changed` notice says launches are held, which reads as the board standing still.
- **Does:** `Airlocks.dispatchIsStopped` reads only the stored state, `paused`. Under `held-by-install-change` an
  Airlock slot still opens, a merge job and its [merge agents](../glossary.md#merge-agent) still launch, and merges
  land. The Playbook holds only its own launches and resumes.
- **Effect:** work lands on the target, and an Airlock agent starts on the old install, while the board reads held.
- **Instead:** to hold merges too, run `forge oversee pause`.
- **Evidence:** `src/services/overseer/DrivePass.ts`, the `dispatchIsStopped` field; `src/services/overseer/Airlocks.ts`
  `allocate`; `src/lib/tracker-model/Playbook.ts` `nextStepsOf`; `cli/overseer/OverseerWording.ts` `noticeTextOf`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-customs-fail-open-edges"></a>

### Two checks fail open on a git error

- **Expected:** verification fails closed: `CLAUDE.md` says a decider returns a verdict and fails closed.
- **Does:** `noAiAttributionInRange` skips a commit whose message it cannot read. `GateRun.trackedChangesOf` answers an
  empty diff when `git diff` fails, so a gate that changed tracked files reads clean.
- **Effect:** a failing git hides an attribution trailer or a tree a gate changed. A gate that exits 0 passes.
- **Instead:** nothing to do at a terminal.
- **Evidence:** `src/services/lifecycle/Customs.ts` `noAiAttributionInRange`; `src/services/lifecycle/GateRun.ts`
  `trackedChangesOf`, `gateOutcomeOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-twice-run-judges-a-changed-snapshot"></a>

### The twice-run judges a snapshot its own lines changed

- **Expected:** `ProposalTwiceRun` judges each gate on the snapshot as committed, as the comment on `restoreSnapshot`
  says.
- **Does:** nothing restores tracked files after a prepare step, so a prepare step that changes one fails the first
  gate. `restoreSnapshot` runs `git checkout -- .`, so untracked output of a gate stays for the next one.
- **Effect:** a proposal can read `red` for a change its prepare step made, or `green` on output an earlier gate left.
- **Instead:** read the gate output in the `pipeline-proposal` decision before accepting it.
- **Evidence:** `src/services/lifecycle/ProposalTwiceRun.ts` `runOnce`, `restoreSnapshot`.
- **Established:** read. **Severity:** bug.

<a id="gap-clear-keeps-live-jobs"></a>

### `clear` keeps jobs and drops their log

- **Expected:** `clear` leaves a board the lifecycle can go on reading, or refuses.
- **Does:** `clearTracker` resets rows, `view` and `startedAt`. Jobs, decisions and incidents stay in `progress.json`,
  while `LogRecordCollector` keeps only what follows the last `tracker-cleared`, so a live job loses the `job-launched`
  record its counts read. `FailedPassUtil` also restarts at that record.
- **Effect:** a job live across a `clear` loses its counted history, and bounds that read the log start over.
- **Instead:** run `clear` only with no jobs live: stop the board, confirm with `forge jobs`, then clear.
  [Storage](../data-model/storage.md) shows what stays.
- **Evidence:** `src/lib/tracker-model/TrackerChanges.ts` `clearTracker`; `src/adapters/log/LogRecordCollector.ts`;
  `src/lib/tracker-model/utils/FailedPassUtil.ts`.
- **Established:** read. **Severity:** bug.

<a id="gap-row-with-ticket-and-review-of"></a>

### A row can carry both `ticket` and `reviewOf`

- **Expected:** a [review bar](../glossary.md#review-bar) has `reviewOf` and `ticket: null`, as
  [Entities](../data-model/entities.md) states.
- **Does:** `TaskRows.linkTicketToTask` and `addTask` do not check `reviewOf`, so `ticket link` gives a review bar a
  ticket. `ReviewBars.inProgressReviewBarsOf` matches `reviewOf` on any row, and `reviewBarRecordsOf` does not.
- **Effect:** such a row closes with a ticket move like a bar, and is left out of a ticket's review bars and its
  `review-stats` tokens.
- **Instead:** do not link a review bar to a ticket.
- **Evidence:** `src/lib/tracker-model/TaskRows.ts` `linkTicketToTask`, `addTask`;
  `src/lib/tracker-model/ReviewBars.ts` `inProgressReviewBarsOf`, `reviewBarRecordsOf`.
- **Established:** read. **Severity:** bug.

## Agents and control

<a id="gap-incident-answer-not-delivered"></a>

### An incident's answer never reaches the session

- **Expected:** answering a `system-question` or `malformed-ticket` incident delivers the answer to the session waiting
  on it, as answering a decision does.
- **Does:** `answerIncident` logs `incident-answered`, adds the request to `answeredRequestIds` and moves the job to
  `running`. `AnswerDelivery.answerOf` looks up `decision-answered` records alone, so it finds nothing and sends
  nothing. The request still counts as awaiting delivery, so `deliverResumeMessages` skips the job too.
- **Effect:** the job reads `running` while its session waits on a request nobody answers, until a `quiet-job` incident
  opens.
- **Instead:** run `forge incident escalate <I>` in place of an answer: the decision keeps the request, and
  its answer is delivered. For an incident already answered, run `forge job fresh <J>`.
- **Evidence:** `src/lib/tracker-model/AgentQuestions.ts` `answerIncident`; `src/services/overseer/AnswerDelivery.ts`
  `answerOf`, `answerAwaitsDelivery`; `src/services/overseer/JobResumption.ts` `deliverResumeMessages`.
- **Established:** read. **Severity:** bug.

<a id="gap-escalated-question-of-ended-job"></a>

### An escalated question of an ended job reaches nobody

- **Expected:** a question outlives its job: the ticket is held, and the answer goes under `## Questions` for the next
  agent.
- **Does:** `rebindQuestionsOfEndedJob` reads decisions only, so a question still open as an incident keeps its ended
  job's id. Escalating it, by hand or as its default, opens an `agent-question` decision with that id.
  `Playbook.ticketIsHeld` holds a ticket for a question only when its `jobId` is null, and `afterAnswer` writes to the
  ticket only then.
- **Effect:** the ticket is not held, so a fresh agent can start without the answer. The answer is only logged.
- **Instead:** write the answer into the ticket with
  `forge ticket edit <id> --force --append --body "<answer>"`.
- **Evidence:** `src/lib/tracker-model/AgentQuestions.ts` `rebindQuestionsOfEndedJob`, `afterAnswer`;
  `src/lib/tracker-model/Incidents.ts` `escalateIncident`; `src/lib/tracker-model/Playbook.ts` `ticketIsHeld`.
- **Established:** read. **Severity:** bug.

<a id="gap-assistant-job-moves-refused-at-hatch"></a>

### The Assistant's job moves are refused at the Hatch

- **Expected:** `Bouncer.JOB_TARGETING_KINDS` and `ALLOWED_MOVES_BY_INCIDENT_KIND` let the Assistant run `job-fresh`,
  `job-message` and `gate-retry`.
- **Does:** `HatchFormatUtil.requestReadingOf` refuses any command carrying `jobId` as `hatch-identity-mismatch`, before
  the [Bouncer](../glossary.md#bouncer) runs. Calling `requestOf` then `requestReadingOf` on `job-fresh` returned that
  [refusal](../glossary.md#refusal); `ticket-park` read clean.
- **Effect:** an incident whose useful move targets a job cannot be settled that way by the Assistant. It settles by
  another allowed move such as `ticket-park`, or by its [default move](../architecture/questions-and-incidents.md) when
  the Assistant's turn closes. The lab
  [walks an example](../interactive/ticket-journey.html#question-system/quiet-job-default).
- **Instead:** User runs the job move at a terminal with `--incident <I>`, which does not cross the Hatch.
- **Evidence:** `src/adapters/hatch/utils/HatchFormatUtil.ts` `requestReadingOf`; `src/services/control/Bouncer.ts`
  `JOB_TARGETING_KINDS`. `src/services/control/Bouncer.spec.ts` tests `verdictOf` alone.
- **Established:** probed. **Severity:** bug.

<a id="gap-pipeline-agent-advise-filing"></a>

### The pipeline agent's advised filing cannot work

- **Expected:** in `advise` mode the pipeline agent files each optimisation as a low draft ticket.
- **Does:** the prompt says `ticket add "<title>" --status draft --priority low`. `--status` is not in
  `ADD_OPTION_NAMES`, and `--type` is required, so the verb refuses it. A correct filing meets `Bouncer.verdictOf`,
  which has no branch for role `pipeline-agent` and refuses `command-not-allowed-for-role`.
- **Effect:** a pipeline agent cannot file anything. The report schema admits only filed optimisations, each with a
  `filedTicketId` or `hatchRequestId`, so an `advise` run listing any ends `failed` at
  [V12](../architecture/customs-and-gates.md) (filings are this job's). A run listing none reports nothing.
- **Instead:** read the optimisations in the session's transcript on the Bridge, which shows the session's text where
  `forge job attach <J>` does not, and file them by hand. Each entry's only free text is its `summary`; the
  report's `notes` field may also carry advice.
- **Evidence:** `cli/overseer/OverseerWording.ts` `PIPELINE_AGENT_MODE_INSTRUCTIONS`;
  `cli/tickets/TicketFilingSubcommands.ts` `ADD_OPTION_NAMES`; `src/services/control/Bouncer.ts` `verdictOf`;
  `src/services/lifecycle/Customs.ts` `filedFindingsWereFiledByThisJob`; `src/adapters/reports/ReportSchemas.ts`
  `FILED_OPTIMISATION`.
- **Established:** read. **Severity:** bug.

<a id="gap-live-pipeline-agent-under-older-name"></a>

### A live pipeline agent job from an earlier release is refused

- **Expected:** an update of the program keeps every board readable.
- **Does:** install version 28 renamed the pipeline agent's job kind and role. A `progress.json` that still holds a live
  job under the older name is refused with the older-format advice; nothing migrates it. The log keeps reading, since
  its older records read as `pipeline-agent` (`CLAUDE.md`, Deviations).
- **Effect:** `status` and every command that reads the board refuse until that job is gone.
- **Instead:** before the update, let the job end or stop it with `forge job stop <J>`; after it, stop it with an
  earlier release, as the advice says.
- **Evidence:** `src/adapters/progress/utils/StoredJobValidationUtil.ts` `jobProblem`;
  `src/adapters/log/utils/LogRecordMappingUtil.ts` `currentJobNameOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-session-profiles-weaker"></a>

### Session profiles are weaker than workers'

- **Expected:** Assistant, product owner and pipeline agent sessions run under the same denies as workers;
  `WorkerProfiles.profileOf` has branches with full denies for two of them.
- **Does:** production calls it only for `reviewer` and `builder`, in the Airlock too. Assistant, product owner and pipeline agent
  take the local `profileOf` in `DrivePass.ts`, which denies writes only to `<data>` and reads only to
  `<data>/overseer` and `<monitor>/watchers`.
- **Effect:** those sessions can read `~/.ssh`, `~/.aws`, `~/.gnupg` and each job's `launch-*.json`. The product owner
  also has `webNetworkDomains` `any`.
- **Instead:** run these roles only on machines and repositories where that read access is acceptable. See
  [Confinement](../architecture/confinement.md) for what runs.
- **Evidence:** `src/services/overseer/DrivePass.ts` `profileOf`, `launchProfileOf`;
  `src/services/overseer/WorkerProfiles.ts` `profileOf`, `deniedReadableRootsOf`;
  `src/services/overseer/IntakeSessions.ts` `productOwnerProfileOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-refused-relayed-command-partial"></a>

### A refused relayed command keeps its changes

- **Expected:** a refused command changes nothing. The `TicketMoves.moveTicket` comment says "a refused invocation
  writes nothing", and the refusal sentence says "Nothing was written".
- **Does:** that holds at a terminal, where a refusal aborts the [lock hold](../glossary.md#lock-hold). A relayed
  command, one an agent sends through the Hatch, runs inside the Pass's lock hold. `HatchInbox.replyOf` catches the
  refusal, and that lock hold commits whatever the command changed before it threw. `addTicket` files the ticket and
  then refuses in `setTicketNetwork`. `openDraft` opens the filing draft and then refuses `unreadable-file-in-the-way`.
- **Effect:** a [product owner](../glossary.md#product-owner) that relays `ticket add --network <non-public domain>`
  leaves a draft ticket filed behind a refused reply. One that relays `draft open` onto a malformed file's path leaves
  the filing draft on the board, and that file is overwritten, which the refusal exists to prevent.
- **Instead:** after a refused relayed command, read the board before retrying. Expect a retried filing to file twice.
- **Evidence:** `src/services/overseer/HatchInbox.ts` `replyOf`, `replyOfRefusal`;
  `src/services/control/TicketControls.ts` `addTicket`; `src/services/control/FilingControls.ts` `openDraft`;
  `src/lib/tracker-model/TicketMoves.ts` `moveTicket`.
- **Established:** probed: a scratch script ran both requests through `HatchInbox.applyPendingRequests` inside
  `writeTracker`. Each came back refused, with the ticket and the filing draft stored. The same `ticket add` at a
  terminal wrote nothing. **Severity:** bug.

<a id="gap-hatch-order-random"></a>

### Hatch order is random

- **Expected:** a job's relayed commands, those it sends through the Hatch, apply in the order the session wrote them.
- **Does:** `requestIdsIn` sorts file names, each id is a `randomUUID()`, and `applyPendingRequests` applies them in
  that order in one lock hold. A verb stops waiting after `HATCH_REPLY_TRIES` (20) looks,
  `HATCH_REPLY_INTERVAL_MILLISECONDS` (250) apart, prints `queued <requestId>` and exits 0.
- **Effect:** two requests of one job pending in the same Pass apply in random order. A strictly serial agent meets this
  too: during a slow Pass its first verb times out with `queued`, and its next queues beside it. Concurrent requests do
  the same.
- **Instead:** after `queued`, an agent confirms the request took effect before sending a dependent one. No verb reads a
  Hatch reply, so it checks the board through a read verb such as `ticket show` or `incidents`.
- **Evidence:** `src/services/overseer/HatchInbox.ts` `requestIdsIn`, `applyPendingRequests`; `cli/HatchUnderJob.ts`
  `answeredReplyOf`, `hatch`; `cli/constants/JobVerbs.ts` `READ_ONLY_VERBS_UNDER_A_JOB`.
- **Established:** read. **Severity:** bug.

<a id="gap-subagents-always-empty"></a>

### `subagents` is always empty

- **Expected:** a session's subagents run under the definitions its profile gives: `WorkerProfile.subagents` carries
  `READ_ONLY_SUBAGENT` and `EDITING_SUBAGENT`.
- **Does:** every profile sets `subagents: []`, so `agentsOf` renders `{}`. The `Agent` tool stays allowed.
- **Effect:** sessions use the vendor's default subagents. Probe P9 selected naming models in those definitions and
  forbidding the `model` parameter in text, and no text under `resources/` says so, while `permissions.allow` always
  holds `Agent`. This field is a different thing from the live subagent tally in `JobLiveFactsReader.ts`, which counts
  what a session really ran and works.
- **Instead:** nothing to do. Do not read an empty field as "this job runs no subagents".
- **Evidence:** `src/lib/claude-code/ClaudeCodeAdapter.ts` `agentsOf`; `src/services/overseer/WorkerProfiles.ts`
  `profileOf`; `src/services/overseer/DrivePass.ts` `profileOf`.
- **Established:** read. **Severity:** leftover.

<a id="gap-launch-file-deny-one-level"></a>

### The launch-file deny is one level deep

- **Expected:** a worker cannot read any Watcher's launch file.
- **Does:** `deniedReadableRootsOf` denies `<data>/jobs/*/launch-*.json`, and `*` matches one path segment. A process
  Watcher, which runs an install or a gate rather than an agent, has its launch file at
  `<data>/jobs/<J>/install/launch-1.json` or `<data>/jobs/<J>/gate-<n>/launch-1.json`.
- **Effect:** a confined worker can read what those Watchers run and where. No launch file holds a secret: each names
  an owner-only file under `<monitor>/watchers`, which stays read-denied.
- **Instead:** treat a process Watcher's launch file as readable by workers on the same board.
- **Evidence:** `src/services/overseer/WorkerProfiles.ts` `deniedReadableRootsOf`; `src/services/overseer/JobLaunch.ts`
  `spawnProcessWatcher`; `src/services/overseer/WatcherFleet.ts` `writeProcessLaunchFile`;
  `src/lib/watcher/WatcherSocketServer.ts`; `src/lib/watcher/Watcher.ts` `PROCESS_WATCHER_FRAMES`;
  `src/lib/claude-code/ClaudeCodeAdapter.ts` `sandboxOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-usage-misses-job-sessions"></a>

### `usage` misses job sessions

- **Expected:** help describes `usage` as "What this repository's subagents cost", which reads as including the board's
  agents.
- **Does:** no Overseer job session appears in `usage`. A job's top-level session is absent because
  `listSubagentTranscripts` lists subagents only. A job's subagents are absent because `usage` reads
  `transcriptFolderFor(repositoryRoot, configFolder)`, the vendor files a session under the slug of its working
  directory, and `workingDirectoryOf` always puts a job under `<worktrees>`. The config folder is `$CLAUDE_CONFIG_DIR`,
  else `~/.claude`. Only the job transcript reader, `findSessionSubagentTranscripts`, finds a session by its id in
  every folder under `<config folder>/projects/`.
- **Effect:** `usage` shows only subagents of interactive sessions opened at the repository root.
- **Instead:** use `--transcripts <config folder>/projects/<slug of the worktree>`, the config folder being
  `$CLAUDE_CONFIG_DIR` else `~/.claude`, for one worktree's subagents, and read
  [`review-stats`](../architecture/measurement.md) for job tokens.
- **Evidence:** `cli/HelpText.ts`; `cli/measurement/usage/UsageCommand.ts`; `src/lib/claude-code/ClaudeTranscripts.ts`
  `transcriptFolderFor`, `listSubagentTranscripts`; `src/services/overseer/DrivePass.ts` `workingDirectoryOf`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-hatch-folder-edit-write-unnamed"></a>

### No deny rule names another job's Hatch folder

- **Expected:** a job can write only its own Hatch folder, which is what identifies it.
- **Does:** `allowWrite` limits Bash, but the Edit and Write tools sit outside that sandbox, and `deniedWritableRootsOf`
  names no Hatch folder.
- **Effect:** a session can plant a request in another live job's folder, and the request then acts as that job.
- **Instead:** treat every session on a board as able to act as any other, and run only work that is acceptable under
  that.
- **Evidence:** `src/services/overseer/WorkerProfiles.ts` `deniedWritableRootsOf`;
  `src/lib/claude-code/ClaudeCodeAdapter.ts` `sandboxOf`, `denyRulesOf`; `src/services/overseer/HatchInbox.ts`
  `pendingRequestsOf`.
- **Established:** read, with one
  [scratch run](../development/overseer-claude-probe.md#a-scratch-run-outside-the-probe-record)
  under hand-written settings, in which the Write tool created the file. Acting on a planted request was not run.
  **Severity:** bug.

<a id="gap-later-job-branch-unheld"></a>

### A job can move a branch created after it launched

- **Expected:** no job moves another job's branch.
- **Does:** the launch deny list names the branches that exist at launch, and V14 exempts every other job's branch
  through `otherJobBranches`. A branch created later is on the first list for nobody and exempt from the second.
- **Effect:** a job can move such a branch, and neither layer notices.
- **Instead:** nothing to do in a job. Compare a ticket branch with its report's `headCommit` when one looks wrong.
- **Evidence:** `src/services/overseer/WorkerProfiles.ts` `deniedWritableRootsOf`; `src/services/lifecycle/Customs.ts`
  `onlyOwnRefsMoved`; `src/services/overseer/JobLaunch.ts`, `otherJobBranches`.
- **Established:** read. **Severity:** bug.

<a id="gap-overseer-git-runs-repository-config"></a>

### The Overseer's git runs commands set in repository config

- **Expected:** hooks-off stops an agent-controlled command from running in the Overseer's git.
- **Does:** `HOOKS_OFF_OVERRIDES` sets only `core.hooksPath`. A command in repository config, such as `core.fsmonitor`,
  still runs, and no deny rule names the config file.
- **Effect:** a session that edits that config gets a command run unsandboxed by the Overseer, for example at V4's
  `git status`.
- **Instead:** inspect `.git/config` when a session's report looks wrong.
- **Evidence:** `src/lib/git/GitProcess.ts` `HOOKS_OFF_OVERRIDES`; `src/services/overseer/WorkerProfiles.ts`
  `deniedWritableRootsOf`.
- **Established:** read; one
  [scratch run](../development/overseer-claude-probe.md#a-scratch-run-outside-the-probe-record)
  saw the Edit tool change that file. The two halves were not chained. **Severity:** bug.

<a id="gap-session-githooks-unguarded"></a>

### A write to the main checkout's `.githooks` goes unseen

- **Expected:** no session can change the hooks another session's commits run.
- **Does:** only the Bash sandbox covers `.githooks` in the repository root. No rule covers Edit or Write there, and V13
  looks at the job's own worktree and its launch digest.
- **Effect:** the next session's commit runs what was written.
- **Instead:** review changes to `.githooks` in the main checkout before running a board on it.
- **Evidence:** `src/services/overseer/WorkerProfiles.ts` `gitHooksDirectory`;
  `src/lib/claude-code/ClaudeCodeAdapter.ts` `denyRulesOf`; `src/services/lifecycle/Customs.ts`.
- **Established:** read; one
  [scratch run](../development/overseer-claude-probe.md#a-scratch-run-outside-the-probe-record)
  saw the Write tool create a file there. **Severity:** bug.

<a id="gap-guard-hook-start-failure"></a>

### The network guard fails open when it cannot start

- **Expected:** a guarded call is refused when the guard cannot judge it.
- **Does:** the `hook bash-domains` guard is a bare `forge` command found on the session's `PATH`. The
  program denies on any failure of its own, but a command that cannot start lets the call through.
- **Effect:** with the program off `PATH`, Bash has only its sandbox and WebFetch only the vendor's classifier.
- **Instead:** keep `forge` on the `PATH` the Overseer starts with.
- **Evidence:** `src/services/overseer/WorkerProfiles.ts` `networkDomainGuardOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-gate-network-unfiltered"></a>

### A gate's `--network` is neither checked nor enforced

- **Expected:** a gate reaches only the public domains it names.
- **Does:** `gate add --network` stores its domains without the public-domain check, and they join a worker's domain
  list. `gateConfinementOf` turns any domain into `network: true`, Seatbelt has no domain filter, and nothing reads
  `networkDomains`.
- **Effect:** a gate that names one domain reaches every address, and a builder inherits a domain nothing checked.
- **Instead:** name a domain on a gate only when that gate may reach everything.
- **Evidence:** `cli/gates/GatePipelineVerbs.ts`; `src/services/lifecycle/GateRun.ts` `gateConfinementOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-gate-writes-unchecked-for-sessions"></a>

### The gate `writes` rule does not bind sessions

- **Expected:** a folder refused for a gate's `writes` is refused everywhere.
- **Does:** the rule binds Seatbelt alone. `absoluteWritesOf` passes a gate's `writes` to a builder's sandbox with
  neither check, and no deny rule names a `bin` or `PATH` folder for Edit and Write.
- **Effect:** a folder dropped from the Seatbelt profile stays on the builder's Bash write list.
- **Instead:** keep `--writes` to folders a builder may write as well.
- **Evidence:** `src/services/overseer/WorkerProfiles.ts` `absoluteWritesOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-bash-group-survives-kill"></a>

### A Bash command outlives a session that died with its Watcher

- **Expected:** killing a session stops its work. Probe P7 selected killing every group among the descendants.
- **Does:** `treeMembersOf` walks the descendants through parent ids, and `stopTree` signals each group it lists, from
  `Watcher.ts`, `Regrouping.ts` and `LegacyWatcherReader.ts`. A Watcher lists before it closes stdin. The walk needs a
  live parent, so a tree whose leader died with its Watcher is not reachable. A Bash tool command leads its own process
  group, which P7 showed, and on POSIX nothing links it to the recorded job once its parent died.
- **Effect:** after a lost Watcher whose session also died, a running Bash command lives on, reparented to launchd, and
  can run beside a resumed job in the same worktree.
- **Instead:** after such a loss, look for the command with `pgrep -lf '<part of the line>'`, confirm its working
  directory with `lsof -a -d cwd -p <pid>`, and kill it.
- **Evidence:** `src/lib/process-identity/PosixProcessGroups.ts`; `src/lib/watcher/Watcher.ts`;
  `src/services/overseer/Regrouping.ts` `settleLostWatcher`; [the probe
  record](../development/overseer-claude-probe.md), P7.
- **Established:** read, with the vendor behaviour probed in P7. **Severity:** bug.

<a id="gap-429-result-not-read"></a>

### A 429 result is not read as a usage limit

- **Expected:** probe P10 selected treating an `is_error` result with `api_error_status` 429 as the limit, whatever its
  `subtype`.
- **Does:** `ClaudeStreamMapper.ts` never reads `api_error_status`, and no production code reads `result.isError`.
  `applyWatcherEvents` moves a running job to `in-customs` on any `result`. Only a top-level `rate_limit_event` counts
  as the limit through `UsageLimits.refusalOf`.
- **Effect:** with a subscription login the event comes first, the job is already `interrupted`, and the `result` moves
  nothing. With an API key login no event comes, as P10 saw, so the job reaches Customs with no report and ends
  `failed`, which counts as a [failed pass](../glossary.md#failed-pass) and holds nothing back.
- **Instead:** on an API key login, read the `result` line of a job that ended with no report: `api_error_status` 429
  means a limit, and pausing the board is the way to wait it out.
- **Evidence:** `src/lib/claude-code/ClaudeStreamMapper.ts` `resultEventsOf`, `usageWindowEventsOf`;
  `src/services/overseer/DrivePass.ts` `applyWatcherEvents`; `src/services/overseer/UsageLimits.ts` `refusalOf`; [the
  probe record](../development/overseer-claude-probe.md), P10.
- **Established:** read, with the vendor behaviour probed in P10. **Severity:** bug.

<a id="gap-gate-commit-not-unsigned"></a>

### A gate's commit is not made unsigned

- **Expected:** a gate runs what a session can run. Probe P15 selected `commit.gpgsign=false` for a process Watcher,
  since Seatbelt denies gpg its keyring.
- **Does:** only `ClaudeCodeAdapter.gitConfigurationOf` sets `commit.gpgsign=false`, and only for sessions.
  `GateRun.gateEnvironmentOf` removes job variables and adds nothing.
- **Effect:** on a repository that signs commits, a spec that commits fails inside a gate, and the failure reads as a
  red gate.
- **Instead:** in a gate line that commits, pass `git -c commit.gpgsign=false`.
- **Evidence:** `src/lib/claude-code/ClaudeCodeAdapter.ts` `gitConfigurationOf`; `src/services/lifecycle/GateRun.ts`
  `gateEnvironmentOf`; [the probe record](../development/overseer-claude-probe.md), P15.
- **Established:** read, with the vendor behaviour probed in P15. **Severity:** bug.

<a id="gap-allowed-moves-cannot-succeed"></a>

### The incident move table lists moves that cannot succeed

- **Expected:** a move `ALLOWED_MOVES_BY_INCIDENT_KIND` lists can settle that incident.
- **Does:** `job-lost` and Airlock-opened question incidents have `jobId` null, so `Bouncer.incidentMoveVerdictOf`
  refuses `job-fresh` with `incident-move-not-allowed`. `blocked`, `resume-failed` and an `out-of-calls` from a
  wound-down report end the job in the hold that opens the incident, so `Jobs.requireLiveJob` refuses `job-fresh` with
  `job-finished`.
- **Effect:** a reader of the table, or an Assistant taking a listed move, meets a refusal.
- **Instead:** use `ticket-park` on those incidents, followed by `ticket unhold` when a fresh attempt is wanted.
- **Evidence:** `src/services/control/constants/AllowedMovesByIncidentKind.ts`; `src/services/control/Bouncer.ts`
  `incidentMoveVerdictOf`; `src/lib/tracker-model/Jobs.ts` `requireLiveJob`; `src/lib/tracker-model/Playbook.ts`, the
  `job-lost` step.
- **Established:** read. **Severity:** misleading text.

<a id="gap-second-refresh-loses-answers"></a>

### A second intake refresh loses earlier answers

- **Expected:** a product owner's refresh keeps what User answered.
- **Does:** `JobControls.refreshIntake` carries only the `answeredRequestIds` of the job it replaces, and
  `carriedAnswers` of the earlier session are not read. After a reopening, the intake text is the reopening message:
  `messageJob` replaces it and clears `proposedDraftSets`.
- **Effect:** a second refresh starts without the answers given before the first, and a refresh after a reopening starts
  from that message alone.
- **Instead:** repeat what matters in the message that starts the refresh.
- **Evidence:** `src/lib/tracker-model/JobControls.ts` `refreshIntake`, `messageJob`.
- **Established:** read. **Severity:** bug.

<a id="gap-refused-intake-resume-strands-drafts"></a>

### A refused intake resume leaves its drafts

- **Expected:** a `resume-failed` incident's default brings a fresh session.
- **Does:** the job ends `replaced` before the incident opens. `IncidentMoves.freshAgentFor` finds no job and does
  nothing, and no `ready-drafts` decision opens. A message to the job is refused.
- **Effect:** the intake stops, and its draft tickets stay in the Kanban's Drafts group with nothing offering them.
- **Instead:** ready the drafts by hand with `forge ticket ready <id>`, or start a fresh `intake`.
- **Evidence:** `src/lib/tracker-model/IncidentMoves.ts` `freshAgentFor`, `defaultIncident`;
  `src/services/overseer/JobResumption.ts` `applyResumeFailure`.
- **Established:** read. **Severity:** bug.

<a id="gap-assistant-stop-withdraws-nothing"></a>

### `job stop` of an Assistant withdraws nothing

- **Expected:** what an ended Assistant was delivered goes to the next one, as `endDownAssistants` does for one that
  went down.
- **Does:** `job stop` ends the session with no withdrawal, so an incident it held keeps `deliveredInTurn`.
  `Playbook.turnIsClosed` reads a turn of a missing job as closed.
- **Effect:** that incident takes its default, cause `turn-closed`, and never reaches the fresh Assistant. An
  Airlock-holding kind defaults earlier, cause `no-assistant`, once the job is `stopping`.
- **Instead:** before stopping an Assistant, settle what `forge incidents` lists by hand.
- **Evidence:** `src/lib/tracker-model/Playbook.ts` `turnIsClosed`; `src/services/overseer/AssistantSession.ts`
  `endDownAssistants`; `src/lib/tracker-model/JobControls.ts` `requestJobStop`.
- **Established:** read. **Severity:** bug.

<a id="gap-wind-down-count-one-ahead"></a>

### A wound-down Assistant's turns count one ahead

- **Expected:** a numbered chat closes on its own `result`.
- **Does:** `deliverJobControls` writes the wind-down message as a turn, which ends in a `result` of its own.
  `AssistantSession.isIdle` and `turnObservationsOf` compare the count of `result`s with the chat number, so the count
  stays one ahead.
- **Effect:** a later chat reads closed as soon as it is sent, and its incidents take their default at the next Pass.
  The session counts as idle while it works, so the next chat can reach it mid-turn, and the quiet watch no longer sees
  it.
- **Instead:** do not wind down an Assistant. `job stop` ends it, with [its own
  cost](#gap-assistant-stop-withdraws-nothing).
- **Evidence:** `src/services/overseer/AssistantSession.ts` `isIdle`, `turnObservationsOf`;
  `src/services/overseer/JobControlDelivery.ts` `deliverJobControls`.
- **Established:** read. **Severity:** bug.

## Runtime

<a id="gap-stale-usage-marker-stops-delivery"></a>

### A stale usage marker stops incident delivery

![One marker file, usage-limit.json, feeds two readers over one time axis. Launches, through usageLimitHolds, are held up to resetsAt, then resume. Delivery runs only while usageResetsAt is null, and that value never reads the clock, so past that line there is no delivery and no context roll-over until User deletes the marker.](../figures/known-gaps/usage-marker-two-readers.png)

*The two readers agree until `resetsAt` and disagree from then on.*

- **Expected:** the machine-wide marker holds work until `resetsAt`, then stops mattering.
- **Does:** two readers of one value disagree after the reset. No code deletes `usage-limit.json`, and `usageResetsAtOf`
  returns its `resetsAt` without comparing to the clock. `runOnePass` calls `deliverIncidentsWhenIdle` only when that
  value is null. `usageLimitHolds` compares correctly, so launches resume.
- **Effect:** after the machine's first usage limit, a running Assistant receives no incident, and its context
  roll-over, the swap to a fresh Assistant past a token count, is skipped. Undelivered incidents take no default, so
  their tickets stay held. The Bridge shows the past reset.
- **Instead:** with `resetsAt` past, delete `<monitor>/usage-limit.json`, or stop the Assistant with
  `forge job stop <J>`. A fresh Assistant takes open incidents in its first message.
- **Evidence:** `src/services/overseer/UsageLimits.ts` `usageResetsAtOf`; `src/services/overseer/DrivePass.ts`
  `runOnePass`; `src/adapters/usage-marker/UsageMarkerFile.ts`; `cli/overseer/routes/BoardStateReader.ts` `usageOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-restart-now-dropped"></a>

### `oversee restart --now` is dropped

- **Expected:** `--now` does on a restart what it does on `oversee stop`: it also stops process Watchers. The verb takes
  the flag, and `onRuntimeCommand` logs it.
- **Does:** `CommandRoute` carries `now` to `onRuntimeCommand`, whose restart branch calls `lifetime.restart()` without
  it. Only `stopFor` uses `now`. The flag has an effect on the fallback path alone, where the API did not take the
  command and `restartTheOverseer` calls `stopTheLiveOverseer`.
- **Effect:** `--now` normally does nothing, without saying so.
- **Instead:** run `forge oversee stop --now`, then `forge oversee`.
- **Evidence:** `cli/overseer/OverseerForeground.ts` `onRuntimeCommand`; `cli/overseer/OverseerCommand.ts`
  `restartTheOverseer`.
- **Established:** read. **Severity:** bug.

<a id="gap-baton-pass-builds-no-bridge"></a>

### A Baton pass builds no Bridge

- **Expected:** a restart proves the Bridge builds before the old Overseer lets go. The step name `build-bundles` reads
  as the successor building its Watcher and page bundles.
- **Does:** `preparationSteps` pins only the Watcher bundle. The Bridge builds on the first `GET /`, in `pageFilesOf`.
- **Effect:** a Baton pass succeeds with a broken Bridge: the board keeps running and the Bridge fails to load.
- **Instead:** open the Bridge after a restart.
- **Evidence:** `cli/overseer/OverseerForeground.ts` `preparationSteps`; `src/services/overseer/OverseerServer.ts`
  `pageFilesOf`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-stop-dropped-during-baton-pass"></a>

### A stop during a Baton pass is dropped

![Swimlane with time running down. User runs oversee restart, so the old Overseer sets handingOver and a successor starts. User runs oversee stop, and the old Overseer drops it while the API still answers 200. The CLI polls the Baton generation. On baton-passed the successor drives at n+1 and the CLI prints Stopped. On taken-back the old Overseer drives at n+2 and the CLI prints Stopped. On kept-driving the generation stays at n and the CLI refuses overseer-still-live.](../figures/known-gaps/stop-during-baton-pass.png)

*Two of the three endings print Stopped with an Overseer still driving.*

- **Expected:** `oversee stop` stops the Overseer.
- **Does:** `onRuntimeCommand` drops the stop while `handingOver` is set, and the API still answers 200. Once the old
  Overseer has released, its listener is closed, so the CLI signals the process instead. The CLI then waits for that
  generation's [Baton](../glossary.md#baton) to go, and any change of generation ends the wait. On `baton-passed` the
  successor holds a higher generation. On `taken-back`, `Baton.acquireAbove` gives the same old Overseer a higher one.
  Either way the CLI prints "Stopped the Overseer". Only `kept-driving` leaves the generation alone, and the CLI refuses
  `overseer-still-live` once `OVERSEER_STOP_TRIES` (40) looks run out. A hand-over still under way by then is refused
  the same way. Apart from a Baton pass, a stop awaits `drivePass.idle()`, not `drivePass.stop()`, so a wake-up can
  start one more Pass until the listener closes.
- **Effect:** a confirmed stop can leave an Overseer running.
- **Instead:** run `forge oversee status` after a stop near a restart, and stop again.
- **Evidence:** `cli/overseer/routes/CommandRoute.ts` `answerControlCommand`; `cli/overseer/OverseerForeground.ts`
  `onRuntimeCommand`, `release`; `cli/overseer/OverseerRemote.ts` `stopTheLiveOverseer`, `waitForTheBatonToGo`;
  `src/services/overseer/BatonPass.ts` `handOverSteps`; `src/services/overseer/Baton.ts` `acquireAbove`.
- **Established:** read. **Severity:** bug.

<a id="gap-spawn-never-retried"></a>

### A spawn is never retried

- **Expected:** a Watcher that fails to start is tried again. The comment on `jobsNeedingAWatcher` assumes so, saying
  spawning twice is harmless because the claim is exclusive.
- **Does:** a Watcher that fails to start gets no second try from this Overseer. `spawnedInstances` records a spawn for
  the life of the `DrivePass`, and the filter excludes it. A Watcher that never claims its job (its bundle is gone, or
  it dies before it claims) is not spawned again until the next Overseer.
- **Effect:** a running build or review opens a `quiet-job` incident. A job with no worktree of its own (Assistant,
  product owner, pipeline agent or merge agent) stays `launching` with no signal, because `createQuietJobWatch` looks only at
  `running` jobs.
- **Instead:** run `forge oversee restart`. [Regrouping](../glossary.md#regrouping) lists the job, and the
  successor's first Pass spawns its Watcher.
- **Evidence:** `src/services/overseer/DrivePass.ts` `jobsNeedingAWatcher`, `spawnedInstances`;
  `src/services/overseer/IncidentRouter.ts` `createQuietJobWatch`.
- **Established:** read. **Severity:** bug.

<a id="gap-reboot-mid-install-ends-job"></a>

### A reboot mid-install ends the job

- **Expected:** Regrouping treats a reboot as nobody's fault, and work resumes.
- **Does:** `setupProgressOf` reads a `lost` process Watcher running the install as `install-failed`, whatever the
  cause. The job opens `setup-failed` and ends `stopped`.
- **Effect:** a reboot during an install costs the job and raises an incident, though the session never started.
- **Instead:** settle the `setup-failed` incident so the next attempt launches and reruns the install:
  `forge worktree repair <id> --step reinstall --incident <I>`. See the [`setup-failed`
  recipe](../operations/runbook.md#setup-failed).
- **Evidence:** `src/services/overseer/JobLaunch.ts` `setupProgressOf`, `processWatcherEnd`;
  `src/services/control/RepairControls.ts` `repairWorktree`.
- **Established:** read. **Severity:** bug.

<a id="gap-launching-job-stranded"></a>

### A job whose Watcher ended stays `launching`

- **Expected:** a job whose [Watcher](../glossary.md#watcher) ended before its session started is ended or tried again.
- **Does:** `applyWatcherEvents` acts on a gone Watcher only for a `running`, `waiting-for-answer` or `stopping` job.
  `jobsNeedingAWatcher` spawns only for an `unclaimed` instance, which an ended or lost Watcher is not. This reaches a
  job with no worktree of its own (Assistant, product owner, pipeline agent or merge agent), for example after a reboot.
- **Effect:** the job stays `launching`, across restarts too. A stranded Assistant still counts as live in
  `nextStepsOf`, so no fresh one boots and incidents wait for it.
- **Instead:** run `forge job stop <J>`. `oversee restart` does not help here, unlike [a Watcher that never
  claimed](#gap-spawn-never-retried).
- **Evidence:** `src/services/overseer/DrivePass.ts` `applyWatcherEvents`, `jobsNeedingAWatcher`;
  `src/lib/tracker-model/Playbook.ts` `nextStepsOf`; `src/lib/tracker-model/JobControls.ts` `requestJobStop`.
- **Established:** read. **Severity:** bug.

<a id="gap-regrouping-report-unread"></a>

### The Regrouping report is mostly unread

- **Expected:** what Regrouping found reaches someone; `RegroupingReport` holds it for the Overseer.
- **Does:** `DrivePass.regroup` reads `leftoverWorktrees` and `lost`. `OverseerForeground` discards the returned report,
  so `attached`, `legacyWatchers` and `respawnJobIds` have no reader. `replayedEntries` goes with `attached`.
- **Effect:** none on behaviour: the first Pass derives the same facts. The report does not show what was re-attached.
- **Instead:** read `overseer.log` and `forge oversee status` for the state after a start.
- **Evidence:** `src/services/overseer/Regrouping.ts` `RegroupingReport`; `src/services/overseer/DrivePass.ts`
  `regroup`; `cli/overseer/OverseerForeground.ts`.
- **Established:** read. **Severity:** leftover.

<a id="gap-leftover-worktree-answer-removes-nothing"></a>

### Answering `leftover-worktree` removes nothing

- **Expected:** answering the decision settles the folder, or says it does not.
- **Does:** no code reads the answer, so the decision closes and the folder stays. `openLeftoverWorktreeDecisions` skips
  a folder only while its decision is open, and `leftoverWorktreesOf` finds it again at the next start.
- **Effect:** the same decision returns at every Overseer start.
- **Instead:** remove the folder its context names, then answer. See the [Runbook](../operations/runbook.md).
- **Evidence:** `src/services/overseer/DrivePass.ts` `openLeftoverWorktreeDecisions`;
  `src/services/overseer/Regrouping.ts` `leftoverWorktreesOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-install-change-strands-incidents"></a>

### An install change strands undelivered incidents

- **Expected:** an open incident always reaches an Assistant or takes its default.
- **Does:** `nextStepsOf` skips `boot-assistant` while the install version differs, and `noAssistantCanComeUp` counts
  only a usage limit and failed boots. With no Assistant running, no incident defaults.
- **Effect:** every other undelivered incident waits, and its ticket stays held, until the install settles.
- **Instead:** run `forge update`.
- **Evidence:** `src/lib/tracker-model/Playbook.ts` `nextStepsOf`, `incidentDefaultStepsOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-nothing-is-ever-removed"></a>

### Nothing is ever removed

- **Expected:** a long-lived board keeps its data folder bounded.
- **Does:** no code removes `baton-pass-<n>.json`, old `watcher-<codeVersion>.js`, job folders, Watcher secret files,
  `<worktrees>/sessions/<J>/`, or Hatch folders. `Baton.ts` removes only old Baton files.
- **Effect:** disk use grows with every job, and each ended instance's owner-only secret file stays on disk.
- **Instead:** remove old job folders by hand once their jobs are settled. Keep folders of live jobs.
- **Evidence:** no such call in a search of `rmSync` and `unlinkSync` across `src/` and `cli/`;
  `src/services/overseer/WatcherFleet.ts` `writeLaunchFiles`. [On-disk atlas](../data-model/on-disk-atlas.md) lists each
  path.
- **Established:** read. **Severity:** bug.

<a id="gap-hold-past-stale-window"></a>

### A lock hold can outlive the stale window

- **Expected:** a holder keeps the lock until it releases.
- **Does:** the lock can be taken from a live holder once it is older than `LOCK_STALE_MILLISECONDS` (30000).
  `generationIsFree` frees a record past that age whether or not its holder is alive, and `acquiredAt` is never
  refreshed. `mutate` runs unfenced: `requireStillHeld` is a check before a write, not a conditional write. The timeline
  of a live stale holder in [Storage](../data-model/storage.md) draws this.
- **Effect:** a slow [lock hold](../glossary.md#lock-hold), such as one running git inside a Pass, can lose the lock. It
  fails `lock-taken-over`, exit 2, and effects outside the files are not undone. A narrow race remains between the check
  and the write.
- **Instead:** rerun the command. A failed Pass is retried on the next wake-up.
- **Evidence:** `src/services/tracker/TrackerLock.ts` `generationIsFree`, `lockHoldOf`;
  `src/services/tracker/HoldJournal.ts`.
- **Established:** read. **Severity:** bug.

<a id="gap-login-item-no-keepalive"></a>

### The login item has no keep-alive

- **Expected:** `cli/setup/LoginOverseer.ts` says the Overseer restarts after a reboot through this item. A reader may
  also expect it back after a crash.
- **Does:** the plist `setup.sh --login-overseer` writes (`cli/setup/DarwinAutostart.ts`) sets `RunAtLoad` and no
  `KeepAlive`. It runs `oversee --detach` once per login. The Windows Run entry also runs once per login. Only the
  Linux unit sets `Restart=on-failure`.
- **Effect:** an Overseer crash leaves the board undriven until someone starts one. Watchers and agents run on. The
  plist sets no `StandardOutPath` or `StandardErrorPath`, so a refused `oversee --detach` at login leaves no output.
- **Instead:** run `forge oversee --detach` after a crash.
- **Evidence:** `cli/setup/LoginOverseer.ts` `writeLoginOverseer`; `cli/setup/DarwinAutostart.ts`,
  `cli/setup/WindowsAutostart.ts`, `cli/setup/LinuxAutostart.ts`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-scaling-whole-log-and-bodies"></a>

### The log and ticket bodies scale with the board

- **Expected:** cost per operation stays roughly flat as a board ages.
- **Does:** every lock hold reads and rewrites the whole `log.jsonl`, and its journal carries it again. `fingerprintOf`
  hashes the whole progress file and log each Pass. A Watcher's [event log](../glossary.md#event-log) is read whole on
  each observation and each connection. A `board` event resends every rendered ticket body and the whole
  `questionHistory`.
- **Effect:** lock holds, Passes and Bridge updates slow as the log and tickets grow. Nothing truncates them but
  `clear`.
- **Instead:** run `forge clear` between phases of work on a very long-lived board. It wipes lifecycle
  memory, so run it with no jobs live; see [Storage](../data-model/storage.md).
- **Evidence:** `src/adapters/log/LogFileWriter.ts`; `src/services/tracker/TrackerPipeline.ts` `plannedHoldOf`;
  `src/services/overseer/DrivePass.ts` `fingerprintOf`; `src/services/overseer/WatcherFleet.ts` `eventsAfter`;
  `src/services/overseer/EventBroker.ts` `publishState`.
- **Established:** read. **Severity:** bug.

<a id="gap-lost-process-child-runs-on"></a>

### A lost process Watcher's child runs on

- **Expected:** when a Watcher is lost, its child process is stopped.
- **Does:** `settleLostWatcher` reaches only the job's agent Watcher. No code signals the child of a lost process
  Watcher.
- **Effect:** an install or gate can run on after its Watcher is gone.
- **Instead:** look for the process by its `run` line, as under [the blocked Pass](#gap-merge-gate-blocks-pass), with
  the job's worktree as its working directory, and kill its process group.
- **Evidence:** `src/services/overseer/Regrouping.ts` `settleLostWatcher`; `src/services/overseer/DrivePass.ts`, its one
  caller in a Pass.
- **Established:** read. **Severity:** bug.

<a id="gap-stop-of-merge-agent-sends-no-frame"></a>

### `job stop` of a merge agent sends no frame

- **Expected:** `job stop` stops the session, and the job ends.
- **Does:** `requestJobStop` moves the job to `stopping`, and `job fresh` of a merge agent does the same.
  `deliverBuildJobFrames` sends the stop for build and review jobs, and `deliverJobControls` for the Assistant,
  product owner and pipeline agent. A merge agent is none of them. `applyWatcherEvents` ends only session kinds from
  `stopping`, and `settleAirlockAgent` acts only on `running` or `in-customs`.
- **Effect:** the job reads `stopping` while its session runs on, and it stays `stopping` after the session ends. A
  merge agent's merge stalls in its Airlock slot with its call budget unchecked. A `job stop` of the parent merge job
  leaves both `stopping`.
- **Instead:** for a ticket's merge agent, run `forge ticket park <id> -- <reason>`. `parked:user` replaces
  the `stopped by User` hold, and the next sweep's `abortParkedMerge` aborts the merge, frees the slot and ends the
  agent `stopped`. A live session still needs its process ended by hand. A refresh's merge agent has no ticket, so no
  verb frees it, and a refresh's Airlock stays held.
- **Evidence:** `src/lib/tracker-model/JobControls.ts` `requestJobStop`; `src/services/overseer/JobLaunch.ts`
  `deliverBuildJobFrames`; `src/services/overseer/JobControlDelivery.ts` `deliverJobControls`;
  `src/services/overseer/DrivePass.ts` `applyWatcherEvents`; `src/services/overseer/Airlocks.ts`
  `settleAirlockAgent`, `advanceTheSlot`, `abortParkedMerge`, `freeSlot`.
- **Established:** probed through `AirlocksHarness` on the real `createAirlocks` for a ticket's merge agent; the
  refresh case read. **Severity:** bug.

<a id="gap-misshapen-request-stops-the-pass"></a>

### A misshapen Hatch request stops every Pass

- **Expected:** one bad request is refused and the board moves on.
- **Does:** `replyOfRefusal` rethrows anything but a `BoardRefusal` or an `OperationRefusal` with a detail, and nothing
  checks that a command's fields fit its `kind`. Code that fails on a missing field throws through the Pass's lock
  hold, so the request stays pending and the next Pass meets it again.
- **Effect:** one such file stops the board. A verb always builds a whole command, so this takes a session writing a
  request by hand.
- **Instead:** find the request with no reply under `<worktrees>/hatch/<J>/requests/` and delete it; `overseer.log`
  records the failed Passes. A terminal `job stop` of a job with no session clears it too, because that job leaves the
  board.
- **Evidence:** `src/services/overseer/HatchInbox.ts` `replyOf`, `replyOfRefusal`;
  `src/adapters/hatch/utils/HatchFormatUtil.ts` `requestReadingOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-board-state-session-id"></a>

### Live facts read the wrong session of a carried-on job

- **Expected:** a job's live facts look in the session the job runs in.
- **Does:** `BoardStateReader` computes `sessionId` from the job's own id and passes it only to
  `JobLiveFactsReader.liveFactsOf`, for the transcript fallback. A build carried on from a review runs in its owner
  job's session, which only `sessionOwnerJobIdOf` knows. `DrivePass` uses that; this reader does not. No board field
  shows the id.
- **Effect:** for such a job the fallback lists a session folder that does not exist, and a missing folder reads as
  empty. Subagents lost from the event log stay missing from that job's `subagents`, `tokens` and
  `toolCallsWithSubagents`, and nothing reports it.
- **Instead:** read `session_id` from the `system` init line of the job's `events-<instance>.ndjson`, then list
  `<session id>/subagents/` in the folder under `$CLAUDE_CONFIG_DIR/projects/` (else `~/.claude/projects/`) that holds
  it. `job attach` does not help: it reads the event
  logs, which are what lost them.
- **Evidence:** `cli/overseer/routes/BoardStateReader.ts`; `src/services/overseer/JobLiveFactsReader.ts`
  `lostSubagentsOf`; `src/services/overseer/ClaudeTranscripts.ts` `subagentFactsOf`;
  `src/services/overseer/JobResumption.ts` `sessionOwnerJobIdOf`.
- **Established:** read; the Instead line was not run on a live board. **Severity:** bug.

<a id="gap-signal-during-take-back-rebind"></a>

### A signal during the take-back rebind ends the old Overseer

- **Expected:** a stop signal ends the Overseer through its closing sequence. The comment on `stopListening` in
  `overseerLifetime` says the listener stays until the stop has finished.
- **Does:** on `taken-back`, `runOverseerInTheForeground` calls `stopListening` before `BatonPass.rebindAfterTakeBack`,
  and `onStopSignalOfThisProcess` unsubscribes with `process.off`. The next subscription is `overseerLifetime` inside
  `startServing`, after a bind and claim succeed. Until an attempt gets there, for up to `BATON_PASS_REBIND_TRIES` (40)
  tries `BATON_PASS_READY_INTERVAL_MILLISECONDS` (250) apart, SIGTERM or SIGINT meets no handler and the default action
  ends the process. A second `oversee restart` falling back to a signal can land here.
- **Effect:** the board is undriven with no record: the closing sequence is skipped, and Watchers run on.
- **Instead:** run `forge oversee --detach`, as after any crash.
- **Evidence:** `cli/overseer/OverseerForeground.ts` `runOverseerInTheForeground`, `overseerLifetime`, `startServing`;
  `cli/CommandContext.ts` `onStopSignalOfThisProcess`; `src/services/overseer/BatonPass.ts` `rebindAfterTakeBack`;
  [Baton](../architecture/baton.md).
- **Established:** read, plus a Bun probe of `process.on`, `process.off` and SIGTERM, which ended at exit 143.
  **Severity:** bug.

<a id="gap-baton-failure-record-throws"></a>

### A failed write of a Baton pass failure ends the Overseer

- **Expected:** a failed [Baton pass](../glossary.md#baton-pass) leaves the old Overseer driving and a `failed` report
  for the CLI to read.
- **Does:** `BatonPass.handOver` awaits `recordFailure` before it writes the report, and `recordBatonPassFailure` is a
  tracker write with no guard. A throw, for example on a tracker lock it cannot take, reaches the top of the process.
- **Effect:** the Overseer exits 2 with no successor and no report, so the board is undriven with no warning.
  `oversee restart` and `update` refuse `baton-pass-failed` with `no outcome within`.
- **Instead:** run `forge oversee status`. If it reads `down`, run `forge oversee --detach`.
- **Evidence:** `src/services/overseer/BatonPass.ts` `handOver`; `cli/overseer/OverseerForeground.ts`
  `recordBatonPassFailure`; [Baton](../architecture/baton.md).
- **Established:** read. **Severity:** bug.

<a id="gap-pass-memory-effects-lost"></a>

### Three effects live only in the Pass's memory

- **Expected:** a dead Overseer's lost effects come back from the board and its [markers](../glossary.md#marker).
- **Does:** three do not. A Hatch reply: `applyPendingRequests` logs `hatch-applied` in the hold and `writeReplies` runs
  after it, and the next Pass skips the request through `hatchRequestIsApplied`. A usage limit: its hits sit in
  `written.result`, the cursor has moved, and nothing reads `usage-limit-hit` back. Stop frames to `endedAssistantJobs`:
  the job is off the board, and `Regrouping.regroup` walks board jobs.
- **Effect:** after a crash or a Baton overtake in that window: the agent's verb prints `queued <requestId>` for a
  request that was applied, a limited job resumes unheld with its old Watcher unstopped, and an ended Assistant's
  session runs on.
- **Instead:** after a crash, read the board before retrying a queued verb. Stop an orphaned session by its process.
- **Evidence:** `src/services/overseer/DrivePass.ts` `runOnePass`, `stopLimitedJobs`;
  `src/services/overseer/HatchInbox.ts` `applyPendingRequests`, `writeReplies`; `src/services/overseer/UsageLimits.ts`
  `usageResetsAtOf`; `src/services/overseer/Regrouping.ts` `regroup`; [The Pass](../architecture/the-pass.md).
- **Established:** read. **Severity:** bug.

<a id="gap-fingerprint-omits-files"></a>

### The fingerprint omits files a Pass reads

- **Expected:** an unforced Pass skips only when nothing it reads has changed.
- **Does:** `fingerprintOf` hashes `progress.json`, `log.jsonl`, the usage marker, requests, build jobs, Watchers and
  tips. It omits ticket files, `pipeline.json`, epics, filing drafts and `installVersionChanged`.
- **Effect:** a hand edit of a ticket's frontmatter or of `pipeline.json`, or an install change, waits for another fact
  or a forced wake. A sweep forces one only with no Assistant live or a job quiet, so on an idle board `runtimeState`
  can stay `serving` while the manifest differs.
- **Instead:** after a hand edit, run `forge log "<note>"`, which changes the log and lets the next Pass
  through.
- **Evidence:** `src/services/overseer/DrivePass.ts` `fingerprintOf`, `sweep`, `runOnePass`; [The
  Pass](../architecture/the-pass.md).
- **Established:** read. **Severity:** bug.

<a id="gap-settled-fingerprint-hides-a-write"></a>

### A settled fingerprint can hide a late write

- **Expected:** a write that lands while a Pass runs gets one more Pass.
- **Does:** `runOnePass` takes `lastFingerprint` from an observation made after its effects. A write that lands after
  the hold read the board and before that observation is in the fingerprint and in no decision. The wake it caused is
  unforced, so the next Pass sees an equal hash and stops.
- **Effect:** the board sits on that write until another fact changes. A scratch run of `oversee pause`, three
  `ticket status` moves and `oversee resume` queued nothing for 105 seconds, across three sweeps, in one run of four.
- **Instead:** run `forge log "<note>"`, which released that run.
- **Evidence:** `src/services/overseer/DrivePass.ts` `runOnePass`, `wake`, `drain`, `sweep`.
- **Established:** read for the cause; the stall seen once in a scratch repository, and its cause there not proved.
  **Severity:** bug.

<a id="gap-merge-gate-outlives-its-overseer"></a>

### A merged-tree gate outlives its Overseer

- **Expected:** nothing that matters is a child of the Overseer, and a surviving child group is killed before work
  resumes.
- **Does:** a merged-tree gate runs from `gateMergedTree` through `GateRun.runGate`, `detached` in a process group of
  its own, under no Watcher. Nothing records that group. After a crash the next sweep gates the same tree again in the
  same worktree.
- **Effect:** two runs of one gate can overlap in one worktree, and the rerun can fail on what the first holds.
- **Instead:** after a crash during a gate, find the old run as under [the blocked Pass](#gap-merge-gate-blocks-pass)
  and kill its process group before starting an Overseer.
- **Evidence:** `src/services/lifecycle/GateRun.ts` `runGate`; `src/services/overseer/DrivePass.ts` `gateMergedTree`;
  `src/services/overseer/Airlocks.ts` `runGate`; [Failure and recovery](../architecture/failure-and-recovery.md).
- **Established:** read. **Severity:** bug.

<a id="gap-recycled-group-can-be-signalled"></a>

### A reused process group can be signalled

- **Expected:** a recycled group is never signalled.
- **Does:** `stopTree` refuses a leaderless group with a member older than the recorded leader. A group id reused in
  the same boot, whose own leader has exited, has only members younger than the recorded leader, so it passes the check.
- **Effect:** `settleLostWatcher` can send SIGKILL to a stranger's process group. It takes an id reused within one boot,
  after that id's own leader exited.
- **Instead:** nothing to do at a terminal.
- **Evidence:** `src/lib/process-identity/PosixProcessGroups.ts` `stopTree`;
  [Watchers](../architecture/watchers.md).
- **Established:** read. **Severity:** bug.

<a id="gap-managed-block-unseen-on-idle-group"></a>

### A group branch's managed block goes unseen

- **Expected:** no session launches onto a target holding a committed managed block.
- **Does:** `observe` checks the main line and the targets of live jobs. A group branch with no live job is not in that
  list, so the Playbook's check passes.
- **Effect:** the first launch onto that group is not held.
- **Instead:** after `update`, check group branches for the block with `git log -p <branch> -- CLAUDE.md` before their
  tickets launch.
- **Evidence:** `src/services/overseer/DrivePass.ts` `observe`; `src/lib/tracker-model/Playbook.ts`, the
  `targetsHoldingManagedBlock` checks.
- **Established:** read. **Severity:** bug.

<a id="gap-unmatched-subagent-counted-twice"></a>

### A subagent with no `.meta.json` counts twice

- **Expected:** each subagent counts once in a job's live facts.
- **Does:** `ClaudeTranscripts.subagentFactsOf` keys a transcript with no `.meta.json` by its agent id, and
  `lostSubagentsOf` skips by a set of `parentToolUseId`s, which never equals it.
- **Effect:** if the event log also holds that subagent, `withTranscriptSubagents` adds it again to `tokens`,
  `subagents` and `toolCallsWithSubagents`.
- **Instead:** read a job's live totals as an upper bound. Credited tokens come from elsewhere: see
  [Measurement](../architecture/measurement.md).
- **Evidence:** `src/services/overseer/ClaudeTranscripts.ts` `subagentFactsOf`;
  `src/services/overseer/JobLiveFactsReader.ts` `lostSubagentsOf`, `withTranscriptSubagents`.
- **Established:** read. **Severity:** bug.

<a id="gap-live-budget-ignores-red-handoff"></a>

### Live facts show the wrong budget during a resume

- **Expected:** a job's live `callBudget` is the budget it runs on.
- **Does:** `liveFactsOf` uses `JobLaunch.callBudgetOf`. A red-handoff resume runs on `RED_HANDOFF_RESUME_CALL_BUDGET`,
  which `attemptCallBudgetOf` applies.
- **Effect:** during a resume the Bridge and the API show the role's budget beside a count that restarted at the
  attempt's instance.
- **Instead:** during a resume, compare calls with `RED_HANDOFF_RESUME_CALL_BUDGET`.
- **Evidence:** `src/services/overseer/JobLiveFactsReader.ts` `liveFactsOf`; `src/services/overseer/JobLaunch.ts`
  `callBudgetOf`, `attemptCallBudgetOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-route-throw-has-no-csp"></a>

### A route that throws answers with no CSP

- **Expected:** the `OverseerServer.ts` header says every answer carries the Bridge's CSP.
- **Does:** no handler catches a route's throw. A malformed `progress.json` makes `GET /api/state` and
  `GET /api/summary` answer Bun's `text/plain` 500, `Something went wrong!`, with no CSP.
- **Effect:** the Bridge shows a failed read with no reason, and that answer leaves the page policy behind.
- **Instead:** run `forge status`, which reports a malformed store.
- **Evidence:** `src/services/overseer/OverseerServer.ts` `start`, `routeOf`.
- **Established:** probed. **Severity:** bug.

<a id="gap-detached-start-loses-its-error"></a>

### A detached start loses its refusal

- **Expected:** `overseer-did-not-start` points at `overseer.log` for the cause.
- **Does:** `startDetached` spawns with `stderr: 'ignore'`, and a refusal raised before the logger exists is not
  appended to the log.
- **Effect:** a cause such as `overseer-port-in-use` shows nowhere.
- **Instead:** run `forge oversee` in the foreground, as the refusal also advises, to see the cause.
- **Evidence:** `cli/overseer/OverseerRemote.ts` `startDetached`.
- **Established:** read. **Severity:** bug.

## Bridge

<a id="gap-job-stop-while-install-held"></a>

### Stop stays enabled while the install is held

![A grid of two Stop surfaces against three stages of an install change. Before update, a terminal job stop is refused and the Bridge's Stop gets 423. After update, if the Baton pass failed or was not taken, the terminal works and the Bridge still gets 423. After a Baton pass both work.](../figures/known-gaps/stop-by-install-stage.png)

*The terminal comes back at `update`, and the Bridge only once an Overseer on that code serves it.*

- **Expected:** after the [install version](../glossary.md#install-version) changes, the Overseer holds launches and
  answers most Bridge commands with HTTP 423 until a Baton pass. Stop and Wind down are marked as still working in that
  state.
- **Does:** `JobControls.tsx` on the Agents tab and `JobStopMenu.tsx` in the ticket form's More menu mark `job-stop`
  `answeredWhileInstallHeld` for both. `RUNTIME_COMMAND_KINDS` holds only `overseer-stop` and `overseer-restart`, so
  `job-stop` gets 423.
- **Effect:** the buttons look live and a click only raises the install banner again. The install-change swimlane in
  [CLI and install](../architecture/cli-and-install.md) draws the hold. While a Baton pass runs the state reads
  `passing-baton`, so `launchesHeld` is false and `POST /api/commands` takes commands until the listener closes.
- **Instead:** run these in order:
  1. `forge update`, which also asks the live Overseer for a Baton pass.
  2. `forge job stop <J>` at a terminal. Before `update` it is refused `install-version-mismatch`.
  3. If `update` reports that the Overseer did not take the Baton pass, or that it failed, run
     `forge oversee restart`.

  The Bridge buttons work once a successor serves.
- **Evidence:** `bridge/views/agents/JobControls.tsx`; `bridge/views/detail-panel/JobStopMenu.tsx`;
  `cli/overseer/routes/CommandRoute.ts` `RUNTIME_COMMAND_KINDS`,
  `answerControlCommand`; `cli/Main.ts` `COMMANDS_THE_INSTALL_CHECK_SPARES`; `cli/adoption/update/UpdateCommand.ts`
  `handTheLiveOverseerToTheCodeOnDisk`; `src/services/overseer/InstallChangeWatch.ts` `installVersionChanged`.
- **Established:** read. **Severity:** bug.

<a id="gap-stream-down-flicker"></a>

### Controls re-enable when the stream is reopened

![A timeline of the stream state and the controls. While the state is down the controls are disabled. REOPEN_DELAY_MILLISECONDS later the client reopens the stream and the state goes connecting, which BridgeApp does not count as down, so the controls are enabled and a click fails. The attempt's error event sets down again, and the cycle repeats.](../figures/known-gaps/controls-flash-on-reopen.png)

*Each `connecting` span is a window where a button looks live and is not.*

- **Expected:** with [the stream](../architecture/bridge.md) down, controls stay disabled until it is back.
- **Does:** when the browser gives up on `/api/events`, for example on a non-200 answer, `EventStreamClient` reopens the
  stream. The state goes `connecting`, and `BridgeApp` counts only `down` as down, so controls are enabled until that
  attempt's `error` event. A refused connection is unaffected: it stays `down`, and the browser retries on its own.
- **Effect:** while the browser keeps giving up, buttons flash enabled at each reopen, `REOPEN_DELAY_MILLISECONDS`
  (2000) apart, and a click then fails.
- **Instead:** wait for the down banner to clear.
- **Evidence:** `bridge/api/EventStreamClient.ts` `open`; `bridge/shell/BridgeApp.tsx` `streamIsDown`.
- **Established:** read, plus a headless Chrome probe: an `EventSource` on a refused port fired `error` with
  `readyState` 0 each time, so `connect` did not run again. **Severity:** bug.

<a id="gap-queued-ticket-display-word"></a>

### A queued ticket reads Reviewing or Awaiting review

- **Expected:** a ticket's status word says what it waits for, as its Kanban lane does.
- **Does:** `settleReviewPass` ends the review job and queues the merge, but only a move out of `in-review` or a release
  closes the review bar, so `displayStateFor` stays `reviewing` until the landing. With no review phase,
  `JobLaunch.settleGate` queues a ticket with no bar, and `DisplayStateWordingUtil` words `in-review` as Awaiting
  review. `KanbanModel.laneOf` puts both in the Merge queue lane.
- **Effect:** Progress reads Reviewing with no reviewer running, or Awaiting review with none coming, for a ticket
  Kanban shows queued. After `job stop` on a waiting review the word stays Reviewing too.
- **Instead:** trust the lane, or `forge merges`.
- **Evidence:** `src/services/lifecycle/ReviewOutcome.ts` `settleReviewPass`; `src/lib/tracker-model/DisplayQueries.ts`
  `displayStateFor`; `bridge/utils/DisplayStateWordingUtil.ts`; `bridge/views/kanban/KanbanModel.ts` `laneOf`.
- **Established:** read, with the log order and the chips seen on scratch boards: `review-bar-closed` comes after
  `ticket-delivered`. **Severity:** misleading text.

<a id="gap-waiting-on-links-run-together"></a>

### Waiting-on links run together

- **Expected:** a ticket's `waiting on` ids read as a list.
- **Does:** the `tickets` case in `DetailPanel` maps ids to links in one `<span>` with no separator.
- **Effect:** the panel reads `#001#004#011`.
- **Instead:** nothing is lost: each link works.
- **Evidence:** `bridge/views/detail-panel/DetailPanel.tsx`; `docs/images/bridge-tickets.png`.
- **Established:** read, and seen in a scratch screenshot. **Severity:** bug.

<a id="gap-stored-tab-never-restored"></a>

### The stored tab is never restored

- **Expected:** a bare URL opens the tab last used.
- **Does:** `useHashRoute` resolves the route on first render, when `boardStore` is null, and only a `hashchange` reads
  it again. `BridgeApp` then writes the default tab, which removes the stored key.
- **Effect:** the Bridge always opens on Kanban, and the preference is lost.
- **Instead:** keep a tab in the address bar, such as `#agents`.
- **Evidence:** `bridge/shell/HashRouter.ts` `useHashRoute`; `bridge/shell/BridgeApp.tsx`.
- **Established:** probed under happy-dom with fake services: stored `agents` on a bare URL gave `kanban` and an empty
  key. **Severity:** bug.

<a id="gap-header-notice-bare-kind"></a>

### The header shows `instructions-missing` as a bare word

- **Expected:** every notice reads as a sentence.
- **Does:** `noticeTextOf` in `HeaderModel.ts` has no case for `instructions-missing`, so its default returns the kind.
- **Effect:** the header says `instructions-missing`, naming neither the job nor the path.
- **Instead:** run `forge oversee status`, whose wording names both.
- **Evidence:** `bridge/shell/HeaderModel.ts` `noticeTextOf`; `cli/overseer/OverseerWording.ts` `noticeTextOf`.
- **Established:** read. **Severity:** bug.

<a id="gap-reconnect-reload-check-skipped"></a>

### A failed identity read skips the reload check

- **Expected:** a Bridge that reconnects to other code reloads.
- **Does:** `BridgeApp`'s reconnect effect reloads only when `fetchIdentity` answers and `knownCodeVersion` is set. A
  failed read, on return or at page load, skips the check with no retry.
- **Effect:** the page keeps running the old client against a successor.
- **Instead:** reload the page after a restart.
- **Evidence:** `bridge/shell/BridgeApp.tsx`, the `fetchIdentity` effects.
- **Established:** read. **Severity:** bug.

## Install and CLI

<a id="gap-init-marker-window"></a>

### `init` writes its install marker late

- **Expected:** a fresh `init` writes `session-instructions.md`, the file that marks the install, first, so a run cut
  short reads as unversioned and commands refuse. `cli/HelpText.ts` and the comment on `installedFilesArePresentIn` say
  so.
- **Does:** `writesTheBriefFirst` puts the briefs part first, but `session-instructions.md` is the ninth and last file
  in it, and `createTracker` has already run.
- **Effect:** after a crash between `progress.json` and that file, commands treat the install as current although files
  are missing, and refuse nothing. A scratch board with `session-instructions.md` and `version.json` removed filed a
  ticket at exit 0. The write-order strip in [CLI and install](../architecture/cli-and-install.md) marks this window.
- **Instead:** after an interrupted `init`, run `forge init` again. On an existing
  [tracker](../glossary.md#tracker) it refreshes and writes both files.
- **Evidence:** `cli/adoption/constants/ClaudeCodeInstall.ts`; `cli/adoption/TrackerRefresh.ts` `writeOrder`;
  `cli/adoption/init/InitCommand.ts`; `cli/InstallVersionCheck.ts` `installedFilesArePresentIn`.
- **Established:** probed. **Severity:** misleading text.

<a id="gap-help-text-stale"></a>

### Help text is stale

- **Expected:** `forge help` describes the build.
- **Does:** help says a low ticket is ready only once no normal or high ticket is left. In the code priority only orders
  launches: `readyTicketIdsOf` says "Priority only orders", and `candidateOrder` only sorts.
- **Effect:** a reader misjudges what starts next.
- **Instead:** read priority as launch order: a low ticket is as ready as any other. Where help and [the CLI
  reference](../cli.md) differ, trust the reference, except where an entry on this page reports it.
- **Evidence:** `cli/HelpText.ts`; `src/lib/tracker-model/utils/TicketDependencyUtil.ts` `readyTicketIdsOf`;
  `src/lib/tracker-model/Playbook.ts` `candidateOrder`. `resources/templates/Reference.md` repeats it: "builds after
  every normal and high ticket".
- **Established:** read. **Severity:** misleading text.

The other differences:

| Help says | Code does |
| --- | --- |
| Ready ids run high, then normal, each lowest id first | Priority, then readiness position, then id |
| `init` installs `assistant-brief.md` | The Assistant's text is `briefs/defaults/assistant.md` |
| `update` refreshes "three files beside the tracker" | Nine files: the briefs part of `ClaudeCodeInstall.ts` |
| Every command but `init`, `update`, `help` and `status` checks the install | `version` is spared too; `hook` and `oversee` run the check inside their own code (`cli/Main.ts`) |
| `usage` "regenerates no page" | No command regenerates a page |
| `usage`: `checks` counts runs "per edit instead of per batch" | `TranscriptUsageUtil` adds 1 per Bash command holding a test, type-check or lint fragment, with no per-edit rate |
| `usage --since` is "how a change in the way agents are briefed is measured" | `usage` reads subagents alone, so a builder's or reviewer's brief does not show in it: see [`usage`](#gap-usage-misses-job-sessions) |
| `session-instructions.md` is "written first" | It is the ninth file: see [the marker gap](#gap-init-marker-window) |
| The Next line ends `; overseer paused: wait for the user's go` | `NextLineUtil` prints `; Overseer paused:`, with a capital |

## Agent-facing text

These are reported, not edited. Each entry states what an agent is told and what the code does.

<a id="gap-worker-filing-omits-type"></a>

### Worker filing omits `--type`

- **Text says:** `BuildPrompt.md` and `ReviewPrompt.md` give `ticket add "<title>" --priority low`.
- **Code does:** `ticket add` refuses a filing with no `--type` before relaying it. A scratch `ticket add "<title>"`
  printed the usage line instead of filing.
- **Effect:** each agent's first filing is refused, and the refusal tells it the flag. It costs a call.
- **Instead:** an agent files with `--type ticket|bug|research --priority low`.
- **Evidence:** `resources/prompts/`; `cli/tickets/TicketFilingSubcommands.ts`.
- **Established:** probed. **Severity:** misleading text.

<a id="gap-ticket-body-template"></a>

### The ticket body template lacks a Brief

- **Text says:** `TicketBody.md` has Report, Wanted, Acceptance and Handoff, and its Handoff tells the implementer agent
  to fill the section.
- **Code does:** `readinessGapsOf` needs a non-empty `## Brief`, which the template lacks, so a default body is refused
  `brief-missing` at `ticket ready`. The builder never edits the ticket: `JobLaunch` writes `## Handoff` from its
  report.
- **Effect:** a ticket filed with no `--body` cannot be readied as filed.
- **Instead:** add a `## Brief` section before `forge ticket ready <id>`.
- **Evidence:** `resources/templates/TicketBody.md`; `src/adapters/tickets/utils/TicketAcceptanceUtil.ts`
  `readinessGapsOf`; `resources/prompts/BuildPrompt.md`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-red-handoff-says-baton-pass"></a>

### The red-handoff message says Baton pass

- **Text says:** `RedHandoffMessage.md`: "The Baton pass is in {{batonPassPath}}". The fill and `batonPassPathOf` carry
  the same word.
- **Code does:** that path is the [red-handoff note](../glossary.md#red-handoff), `gate-failure.md`. A Baton pass is the
  Overseer hand-over, unrelated to it. `BATON_PASS_OUTPUT_LIMITS` in `RedHandoff.ts` bounds that note under the same
  word.
- **Effect:** the agent reads the right file, under the wrong name.
- **Instead:** no agent workaround. A person reading the transcript takes it as the red-handoff note.
- **Evidence:** `resources/prompts/RedHandoffMessage.md`; `src/services/overseer/RedHandoff.ts` `batonPassPathOf`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-checks-line-wording"></a>

### Agent texts call the gates a checks line

- **Text says:** `ReviewPrompt.md` and `Reference.md` speak of a checks line.
- **Code does:** `pipeline.json` stores named gates with prepare steps. `GateRun.runPipeline` runs them one at a time,
  each in its own confinement. `PipelineUtil.checksLineOf` only joins them for display.
- **Effect:** an agent may run the joined line itself and see a result that differs from a gate's, which runs confined.
- **Instead:** no agent workaround. A person reading the prompt takes "checks line" as "the gates, in order".
- **Evidence:** `resources/prompts/`; `src/lib/tracker-model/utils/PipelineUtil.ts` `checksLineOf`;
  `src/services/lifecycle/GateRun.ts` `runPipeline`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-reference-omits-job-kinds"></a>

### The installed `reference.md` omits job kinds

- **Text says:** the installed `reference.md` names `build`, `review`, `merge`, `product-owner` and `assistant`.
- **Code does:** `JobKind` also has `merge-agent`, `refresh` and `pipeline-agent`.
- **Effect:** an agent reading `jobs` output meets kinds its `reference.md` does not explain.
- **Instead:** no agent workaround: agents in a tracked repository cannot read these pages. A person reviewing the
  transcript reads [Entities](../data-model/entities.md).
- **Evidence:** `resources/templates/Reference.md`, Jobs, decisions and incidents;
  `src/lib/tracker-model/@types/Job.ts`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-found-in-review-unprompted"></a>

### The review prompt omits `--found-in-review`

- **Text says:** `ReviewPrompt.md`, Filing what you find, gives `ticket add "<title>" --priority low` and never names
  `--found-in-review`. Only `Reference.md` does.
- **Code does:** `ReviewStatistics` counts *tickets filed from reviews* through `foundInReview`, and nothing else stamps
  it.
- **Effect:** that figure can read below the `filed` findings of the same reviews, though `filedTicketId` and
  `filedByJob` hold the facts.
- **Instead:** no agent workaround. A person reads the `filed` findings in `review-recorded` lines.
- **Evidence:** `resources/prompts/ReviewPrompt.md`; `resources/templates/Reference.md`;
  `src/lib/tracker-model/ReviewStatistics.ts`; `src/services/control/TicketControls.ts` `addTicket`.
- **Established:** read. **Severity:** misleading text.

<a id="gap-product-owner-told-both"></a>

### The product owner is told to ask and not to ask

- **Text says:** `ProductOwnerPrompt.md` says to ask User with AskUserQuestion whenever only User can settle something.
  `skills/agent-po/SKILL.md` says to ask nothing unless asked to grill.
- **Code does:** A product-owner session reads both, and nothing ranks them.
- **Effect:** the same request can bring questions in one session and none in the next.
- **Instead:** no agent workaround. User says which is wanted in the intake text.
- **Evidence:** `resources/prompts/ProductOwnerPrompt.md`; `skills/agent-po/SKILL.md`.
- **Established:** read. **Severity:** misleading text.

## Leftovers

Nothing in this section changes behaviour. All were established by reading, and all have severity leftover.

<a id="gap-dead-code-and-unused-states"></a>

### Dead code and unused states

<details>
<summary>Every item, where it sits and its status</summary>

| Item | Where | Status |
| --- | --- | --- |
| `Board.claimTickets` | `src/lib/tracker-model/TicketClaims.ts` | Only a test helper and specs call it; it alone writes a row's `agent` key, and its eight claim refusals are never printed |
| Job state `landing`, with `gating` to `landing` and `landing` to `stopping` or `ended` | `src/lib/tracker-model/constants/JobMoveLegality.ts` | `landing` occurs only as an Airlock phase |
| `merging` to `gating` | `JobMoveLegality.ts` | A merge job stays `merging` |
| `preparing` to `interrupted` | `JobMoveLegality.ts` | A setup failure ends the job |
| `preparing` to `stopping` | `JobMoveLegality.ts` | `requestJobStop` ends a `preparing` job in the same lock hold, and a product owner never prepares |
| `stopping` to `interrupted` | `JobMoveLegality.ts` | No caller interrupts a stopping job |
| `awaiting-answer` to `running` | `JobMoveLegality.ts` | A product owner leaves through `refresh-intake`; the table's comment calls this a resume, and the Playbook resumes only `interrupted` jobs |
| Ticket `in-progress` to `reviewed` | `src/lib/tracker-model/constants/TicketMoveLegality.ts` | Every caller reaching `reviewed` starts from `in-review` |
| `draft` as a source of `pending` | `TicketMoveLegality.ts` | `moveTicket` refuses `move-of-a-draft` first |
| Job outcome `cannot-resolve` | `src/lib/tracker-model/constants/JobStates.ts` | A report word; the job ends otherwise |
| `ALREADY_LANDED_OUTCOME` | `src/services/lifecycle/Landing.ts` | Exported, with no importer, so the `finish-board-side` case of the landing switch in `Airlocks.ts` is unreached |
| `pageScriptFailure` | `src/services/render/PagePayloadAssembly.ts` | Always null from `BoardState`; the Bridge has no reader |
| `report.schema.json` | `src/lib/claude-code/ClaudeCodeAdapter.ts` | Written; the argv passes the schema inline |
| `instructions-<n>.json` | `src/services/overseer/JobLaunch.ts` `recordInstructionsRead` | Written at each launch; nothing reads it |
| `report.json` in `SERVED_JOB_FILE_NAMES` | `src/shared/constants/OverseerLimits.ts` | Nothing writes it; that route finds nothing |
| `withLockIfFree` | `src/services/tracker/TrackerLock.ts` | No caller |
| `ReviewOutcome.answerWaiver` | `src/services/lifecycle/ReviewOutcome.ts` | Only its spec calls it; see [the waiver gap](#gap-waiver-answer-has-no-effect) |
| `deleteMergedBranch`, `removeWorktree` | `src/lib/git/BranchIntegration.ts` | No production caller; see [landed worktrees](#gap-landed-worktrees-stay) |
| `assistant` and `product-owner` branches of `profileOf` | `src/services/overseer/WorkerProfiles.ts` | Tested, never run; see [session profiles](#gap-session-profiles-weaker) |
| `READ_ONLY_SUBAGENT`, `EDITING_SUBAGENT` | `src/lib/claude-code/ClaudeCodeAdapter.ts` | Never rendered; see [`subagents`](#gap-subagents-always-empty) |
| `AgentLaunchRequest.firstMessage` | `src/lib/agent-launch/AgentLaunchRequest.ts` | Unread by `planOf`; the session takes it on standard input |
| The false branch of `TARGET_REF_DENIES_HOLD` | `src/services/overseer/Airlocks.ts` `settleMovedTarget` | The constant is true, so no `target-moved` decision opens. One that did would name no ticket: `openDecision` passes `[]`, and `BoardState.mergeTargetOf` filters on `decision.ticketIds`, so `targetMovedDecisionIds` could match nothing |
| The false branch of `CONTROL_RESPONSE_DELIVERS_ANSWERS` | `src/services/overseer/DrivePass.ts` | Reached only by specs through `deliversAnswersByControlResponse`: so are the `answer-delivery` cause, its branch in `applyWatcherEvents` and the marker `AnswerDelivery.deliverOne` writes first |
| `MergeQueueUtil.orderOf` | `src/lib/tracker-model/utils/MergeQueueUtil.ts` | Used for the forecast only; `Airlocks` `orderedPredictions` sorts with its own comparator, whose last tie-break differs in form, and no spec ties the two |
| `rebaseReworkedCodeLines` | `src/services/lifecycle/ReviewOutcome.ts` `settleReviewPass` | Always written as 0, so *rebase lines per ticket* always prints 0 |
| `REVIEW_VERDICTS` value `integrated` | `src/lib/tracker-model/constants/ReviewRecordVocabulary.ts` | Never written as a verdict, so *verdict integrated* always prints 0 |
| `result.isError`, `result.usageTotals`, `started.vendorVersion`, `started.tools` | `src/lib/claude-code/ClaudeStreamMapper.ts`, `src/lib/agent-launch/AgentSessionEvent.ts` | Mapped, with no production reader. The `event.isError` in `JobTranscript.ts` is the `tool-result` field |
| `agentDescriptionBeside`, `workflowRunIdentifierOf` | `src/lib/claude-code/ClaudeTranscripts.ts` | No production caller |
| `AgentAdapter.capabilities` | `src/lib/agent-launch/AgentAdapter.ts` | Set by both adapters; nothing reads it |
| `AGENT_BRIEF_PATH_IN_REPOSITORY`, `BUILDER_BRIEF_PATH_IN_REPOSITORY`, `REVIEW_BRIEF_PATH_IN_REPOSITORY` | `src/shared/constants/DispatchProtocol.ts` | No reader |
| `cached` on `gate-ran` | `src/services/overseer/JobLaunch.ts`, `Airlocks.ts`, `PipelineAgentSessions.ts` | Every writer passes false, so the `(cached)` text in `PipelineAgentSessions.ts` is reached only by an older log |
| `legacyWatcherJobIds` | `src/services/overseer/DrivePass.ts` | Computed each Pass; nothing reads it, and `BoardState` does not carry it |
| `OverseerRuntimeState` value `down` | `src/services/overseer/BoardState.ts` | No running Overseer publishes it, so the Bridge's `down` text cannot come from the board state. `oversee status` also prints `starting`, outside the type |
| `TranscriptRole` value `overseer` | `src/shared/@types/TranscriptEntry.ts` | `entriesOfLogEntry` never emits it |
| The label `Reviewing (round 2)` | `bridge/utils/DisplayStateWordingUtil.ts` | A row reaches `re-review` only through the `ticket rereview` verb, so on the Overseer's path a granted round reads Reviewing |
| `review-record-without-a-review-bar`, `review-bar-without-a-round` | `src/lib/tracker-model/ReviewBars.ts` | Never printed: only the Overseer records a review, after opening the bar itself |
| `review-record-on-a-row-that-is-not-a-review-bar`, `review-record-on-a-bar-outside-the-bundle` | `ReviewBars.ts` | Never printed: no caller names a bundle bar |
| `IncidentMoves.requireQuestionIncident`, its `incident-not-a-question` branch | `src/lib/tracker-model/IncidentMoves.ts` | Never printed: `requireIncidentAllows` refuses first on the same two kinds |
| The Bouncer's `hatch-identity-mismatch` rung | `src/services/control/Bouncer.ts` | `HatchFormatUtil.requestReadingOf` checks the same fields first |
| `overseer-control-is-runtime-only` | `src/services/control/OverseerControls.ts` | Never printed: the API route, `oversee stop` and the Bouncer each stop those commands earlier |
| `OTHER_VERBS_OF_CONTROL_KIND` entry `job wind-down` | `cli/constants/JobVerbs.ts` | `RELAYED_VERBS_UNDER_A_JOB` in `cli/Main.ts` reads only `RELAYED_VERB_OF_CONTROL_KIND`, so the verb is refused `verb-not-relayable`; the Bouncer refuses `job-stop` from every role anyway |
| `HATCH_FORMAT_VERSION` | `src/adapters/hatch/utils/HatchFormatUtil.ts`, `src/services/overseer/HatchInbox.ts` | Declared twice |
| `BRIEF_MARKER_PATTERN` | `cli/BinarySmoke.integration.spec.ts` | Strips nothing: no installed file holds a `row:`, `ticket:` or `review:` marker line |

</details>

<a id="gap-stale-prose-in-code"></a>

### Stale prose in code and docs

<details>
<summary>Every place, what it says and what is true</summary>

| Where | Says | Truth |
| --- | --- | --- |
| `cli/measurement/usage/UsageCommand.ts` header | Names `cli/measurement/hook/HookCommand.ts` | The file is `cli/hooks/HookCommand.ts`, and no hook records an agent as it stops |
| `eslint.config.js`, the devDependencies rule | Lists the testing folders | It omits `src/adapters/reports/testing/` and `src/services/overseer/testing/`, while `CLAUDE.md` says the testing folders may import devDependencies |
| `cli/MonitorRegistryIsolation.integration.spec.ts`, `isTestCode` | What counts as test code | It omits `.dom.tsx`, which `eslint.config.js` counts |
| `cli/testing/CliProcess.ts` header | Lists its callers | It omits `cli/Main.spec.ts` and `cli/overseer/OverseerApi.integration.spec.ts` |
| `cli/tickets/constants/TicketUsage.ts`, `TICKET_USAGE` | The usage lines list each verb's flags | They omit `--json` on `ticket add`, `ticket deliver` and `ticket release-of`. `cli/HelpText.flags.spec.ts` does not hold this text |
| `src/shared/rework/constants/CommentSyntaxes.ts`, `ReworkCountUtil.ts` headers | `agent-progress rework` | No such command; `ReviewOutcome.ts` calls it |
| `src/ImportDirection.spec.ts`, `src/testing/ImportGraph.ts` headers | Root, page and Bridge programs | The graph reads two configs |
| `src/ProductNameLiterals.spec.ts` header | A marker "the dispatcher writes" | No such component |
| `bridge/@types/ConversationDocuments.ts` header | The Bridge's project compiles no tracker-model file | It compiles them |
| `bridge/utils/DependencyGraphUtil.ts` header | The Waves tab; `PageBoard.readyTicketIds` | No such tab or field name |
| `src/services/tracker/TicketStore.ts` header | `status` or `render` | `COMMAND_TABLE` has no `render` |
| `cli/InstallVersionCheck.ts`, `cli/Main.spec.ts` headers | Four spared commands | Five, `version` included |
| `src/adapters/usage-marker/UsageMarkerFile.ts`, `src/shared/@types/ControlCommand.ts` | "orchestrator delivery", "an orchestrator readies", "the orchestrator must name one" | The Assistant |
| `src/services/overseer/BatonPass.ts`, `HandOverRequest.release` | Closes "the Watcher connections" | `release` in `cli/overseer/OverseerForeground.ts` closes the data-folder watch and the listener; no Watcher is sent anything |
| `src/lib/claude-code/ClaudeTranscripts.ts`, `transcriptFolderFor` | "every worktree resolves to one folder" | The vendor files a session started in a worktree under that worktree's slug; see [`usage`](#gap-usage-misses-job-sessions) |
| `src/services/overseer/DrivePass.ts`, the comments on `OverseerNotice` and `launchProfileOf` | "later tickets" add the other notice kinds and the other roles' profiles | Both exist: `noticesOf` raises every kind, and the local `profileOf` serves [the session roles](#gap-session-profiles-weaker) |
| `CLAUDE.md`, Deviations | A stored `dispatcherState` `finished` reads as `stopped` | No TypeScript names `dispatcherState`; it survives in `cli/FrozenInstalledSurface.json` |
| `CLAUDE.md`, Runtime | Every write of a file a reader may hold open goes through the atomic-file package | `<step>-verdict.json`, `gate.log`, `start.json`, `pipeline-agent-start.json`, `waiver-proposals.json`, `worktree-failure.txt` and `process-sandbox.sb` use plain `writeFileSync`. Readers catch a bad parse, except `gate.log`, which the job-file route serves |
| `CLAUDE.md`, Runtime | Each clock exception says so in a comment at its site | `elapsedSinceText`, `statisticsOf` in `HeaderModel.ts`, `oldestFirst` in `UsageAgents.ts`, `spanOf` in `EpicUtil.ts`, `usageResetsAtOf` and `markHits` carry none. `createAssistantQuietWatch` has a comment and no Deviations row |
| `CLAUDE.md`, The page | The render service builds the payload from the same Board queries `status --json` prints | `boardFactsOf` shares only `epicRollups`, `readyTicketEntries` and `openDraftSummaries` with `cli/StatusDocuments.ts` |
| `CLAUDE.md`, Command surface | This checkout's tracker is live | `PRODUCT_NAMES` sets the data folder to `.forge`, and no checkout of this branch holds one |
| `CLAUDE.md`, Tests | `src/LintRules.spec.ts` plants each mechanised rule | It plants no form of `import/extensions`, `import/enforce-node-protocol-usage` or `react-hooks/exhaustive-deps` |
| `CLAUDE.md`, Tests | The binary is spawned only through `cli/testing/CliProcess.ts` | `src/services/overseer/InstallChangeWatch.spec.ts` spawns it through `versionsFromTheBinary`, with its working directory in the checkout |
| `CLAUDE.md`, Tests | Every spec works under the scratch root | `startAgentProgress` in `cli/testing/CliProcess.ts` skips the `ROOT_OVERRIDE_VARIABLES` check `runAgentProgress` makes |
| `docs/cli.md` and `resources/templates/Reference.md`, Exit codes, row 1 | The commands the install check refuses are all but `init`, `update`, `help`, `status`, `version`, `oversee status` and `oversee stop` | `cli/Main.ts` also spares a verb relayed under a job, and `hook` runs the check its own way. The two copies change together under `cli/ReferenceCopies.spec.ts` |
| `docs/cli.md` and `resources/templates/Reference.md`, the ticket `task` row | `null` for a draft, and for an old low ticket | `TaskRows.removeTask` sets it null on any status: see [Entities](../data-model/entities.md) |
| `src/adapters/utils/OperationRefusalWordingUtil.ts`, `tokens-without-a-row`, `lowering-a-ticket-that-is-not-pending` | A low ticket has no row until it is started | `ticket ready` gives a row at any priority |
| `OperationRefusalWordingUtil.ts`, `worktree-repair-failed`, `worktree-has-uncommitted-work` | "Nothing was written" | Only the tracker is untouched: a `recreate` may have saved its patch, and git may have done part of the step |
| `OperationRefusalWordingUtil.ts`, `job-finished` from `intake close` or `job message` | "is finished, and a finished job is never continued" | The job may still be `stopping` |
| `OperationRefusalWordingUtil.ts`, `baton-pass-failed` from `update` or `oversee restart` after the old Overseer let go | "The old Overseer keeps driving" | Both print before it has its port back. If that fails, it exits and nobody drives |
| `baton-pass-failed` with `could not be bound again`, at step `bind-port` | "The old Overseer keeps driving" | `lostPortRefusal` throws it as the Overseer exits: nobody drives. Run `oversee --detach` |
| `baton-pass-failed` with `no outcome within`, at step `serve` of code `unknown` | "The Baton pass ... failed" | No outcome was read in time, and the pass may still end either way |
| `OperationRefusalWordingUtil.ts`, `role-command-refused` from a terminal or the Bridge | "The Overseer refused the relayed" | For `incident-move-not-allowed` the rule ran in the command: no Overseer and no relay |
| `OperationRefusalWordingUtil.ts`, `review-record-on-a-row-that-is-not-a-review-bar` | Use the `agent-progress row:` line of your prompt | No file writes that line, and the sentence is [never printed](#gap-dead-code-and-unused-states) |
| `cli/adoption/update/UpdateCommand.ts`, `cli/overseer/OverseerRemote.ts`, docblocks | A failed Baton pass leaves "the old Overseer still driving" | False after `released`: the outcome is `taken-back`, and an undriven exit is possible |
| `src/services/overseer/WatcherFleet.ts` `sendFramesOnce`, `JobControlDelivery.ts` header, `JobResumption.ts` `deliverFirstMessages` and `deliverResumeMessages` | A frame or line is never sent twice, across a restart too; the marker comes once the Watcher took it | The marker is written after the send, so a crash between the two repeats it, and `sendFrames` returns true on connect, so a dropped frame also gets a marker |
| `src/lib/tracker-model/Playbook.ts` header | Reads no clock, and every count comes from the log | `crashResumesAreSpent` reads the stored `job.crashResumes`, `freeSlotsOf` counts `facts.jobs`, and the usage check compares `limits.now` |
| `src/services/control/ControlService.ts` header | Records only, never spawning, signalling or reconciling | `repairWorktree` runs git in the hold through `WorktreeRepair` |
| `src/services/lifecycle/Customs.ts` header, `Customs.spec.ts` header | V1 to V15 | `CUSTOMS_CHECKS` runs to V16 |
| `src/adapters/reports/ReportSchemas.ts` header | Three report schemas | Four |
| `src/lib/agent-launch/WorkerProfile.ts`, `gitHooksDirectory` | The folder's `commit-msg` refuses an attribution trailer | `.githooks/` holds only `pre-commit`, and nothing installs one |
| `src/services/overseer/ProcessWatcherSandbox.ts` header | The caller keeps its gate cache in memory | No gate cache exists |
| `src/services/overseer/JobLaunch.ts`, `someBuildJobAwaitsAPass` | "its gate judged from the cache" | No cache exists |
| `src/services/overseer/JobLaunch.ts`, the `running` case | "only a first attempt opens `out-of-calls`" | The test is `workingOffARedHandoff`, not the attempt number |
| `src/lib/tracker-model/ReviewStatistics.ts`, `reviewStatisticsOf` | Names `main-moved` and `checks-failed` | Those are `ReleaseRefusalReason` values, and `settleReviewPass` has no such path: see [failed review rounds](#gap-failed-review-rounds-replaced) |
| `src/lib/watcher/constants/WatcherProtocol.ts`, `EVENT_LOG_FORMAT_VERSION` | `{sequence, origin, line}` | `EventLog.ts` also writes `at` |
| `src/lib/claude-code/ClaudeCodeAdapter.ts` header | The Watcher writes the files | `WatcherFleet.writeLaunchFiles` does, from `DrivePass.launchWatcher` |
| `src/services/overseer/Regrouping.ts`, `settleLostWatcher` | An Overseer dying after the kill reads the same cause again | Only after the store: the kill comes first, so a death between the two reads `agent-crashed` |
| `src/lib/tracker-model/@types/Task.ts`, `reviewOf` | A free-standing row is given it from its name at ingestion | `ProgressFileMappingUtil.taskOf` only copies the stored key |
| `src/lib/tracker-model/@types/Job.ts`, `attempt` | A fresh agent after a failed pass or a replaced job is one attempt on | True of build jobs alone: a review stores its round there, and an Airlock its launch count |
| `src/services/overseer/WatcherFleet.ts`, `reapEndedHostsIn` | An identifier that says host | It reaps ended Watchers |
| `src/lib/tracker-model/utils/TicketChartUtil.ts`, `seededFilingOf` | A draft is never seeded | `clearTracker` seeds a draft with a linked row |
| `src/services/overseer/OverseerServer.ts`, `OverseerRoutes.events` | `null` until the first state was published | `startServing` assigns the broker first, so `/api/events` answers 200 and stays silent in between |
| `src/services/overseer/JobLiveFactsReader.ts`, `JobLiveFacts.calls` | The count its call budget is held against | False after a red handoff: `JobLaunch.sessionReadingOf` restarts at the attempt's instance |
| `src/services/lifecycle/ProposalTwiceRun.ts`, `restoreSnapshot` | The next gate judges the snapshot as committed | See [the twice-run](#gap-twice-run-judges-a-changed-snapshot) |
| `src/services/tracker/Workspace.ts`, `src/testing/TrackerIsolation.ts`, `TrackerIsolation.spec.ts`, `cli/InitRootOverride.integration.spec.ts` headers | `AGENT_PROGRESS_ROOT` | This build reads `FORGE_ROOT` |
| `src/services/tracker/MonitorRegistration.ts`, `cli/RegisterWrittenTracker.integration.spec.ts` headers | `~/.agent-progress-monitor/projects.json` | The folder follows `PRODUCT_NAMES.MONITOR_FOLDER` |
| `cli/MonitorRegistryIsolation.integration.spec.ts`, its default-context test | Checks the home's registry path | It names `.agent-progress-monitor`, not `MONITOR_FOLDER`, so under this build the assertion cannot fail |
| `src/testing/InheritedEnvironment.ts` header | Serves a `src/lib/` spec | Its importers are `cli/overseer/OverseerBuildJob.spec.ts` and `cli/overseer/OverseerBuildJob.integration.spec.ts` |
| `cli/testing/CutoverSmoke.ts` header, `CutoverSmokeUtil.ts`, `CutoverSmokeUtil.spec.ts` | The owner runs it before unholding the release ticket; Acceptance items 1 to 5 | This branch never merges, so no such ticket exists |
| `cli/testing/CutoverSmokeUtil.ts`, `STATUS_OF_TICKET_MOVE` | Maps `ticket-approved` to `approved` | `TICKET_STATUSES` has `reviewed`, not `approved` |
| `cli/testing/CutoverSmokeUtil.ts`, `questionVerdictOf` | "escalated by the Assistant" | A default logs `incident-escalated` too, so a PASS does not prove the Assistant acted |
| `src/services/render/MarkdownRenderer.ts`, `PagePayloadAssembly.ts` headers | A document opened over `file://`; the page's islands | The Overseer serves the Bridge |
| `bridge/shell/BridgeApp.tsx`, above `progressNow` | Reads the clock once per board | The memo depends on `boardState`, so it runs on every slice event |
| Comments in `src/lib/tracker-model/Findings.ts`, `Board.ts`, `cli/overseer/OverseerForeground.ts` | The v16 leftovers | `submitFirstRunLeftovers` tests only for a first Overseer start, so it fires on any board |
| `.readme-graphics/README.md` | `agent-progress init` for the terminal images | The program under test is `forge` |

</details>

## What the documentation work left unchanged

The documentation work edited no source, prompt, skill, spec, `package.json`, `setup.sh`, `eslint.config.js` or
`CLAUDE.md`, so every entry above stands as found at commit 70ce56de. A reader might assume these were corrected:

- `CLAUDE.md` keeps the statements [the stale prose table](#gap-stale-prose-in-code) reports.
- `cli/HelpText.ts` keeps the text [the help entry](#gap-help-text-stale) reports.
- `resources/prompts/` and `resources/templates/` keep the wording the [Agent-facing text](#agent-facing-text) group
  reports.
- `src/adapters/utils/OperationRefusalWordingUtil.ts` keeps the sentences the stale prose table reports, and
  [Refusals](refusals.md) lists them as they print.
- `docs/cli.md` keeps the two rows of its copied sections the stale prose table reports, since each changes only
  together with `resources/templates/Reference.md`.
