# Measurement: what reviews catch and what agents cost

> **Question:** Which numbers does this system keep about itself, where does each come from, how do I read them?
> **Time:** 15 minutes.
> **Read first:** [Build and review](build-and-review.md), for what a [review round](../glossary.md#review-round) is.
> **Next:** [CLI reference](../cli.md), [Roles](roles-and-launch.md), [Bounds](../reference/deciders-and-bounds.md).

## In one screen

![Three sources feed two printouts. The reviewer's report, the branch diff and filing commands give log lines and ticket keys, Watcher event logs give row tokens, and vendor transcripts reach the usage rows through UsageAgents. A crossed-out arrow shows that neither printout reaches the Playbook, while the review-recorded line itself feeds the round verdict and the rounds-not-converging Overseer notice.](../figures/measurement/where-the-numbers-come-from.png)

*Only the printed output is crossed out. The `review-recorded` line under it still feeds the round verdict and an
Overseer notice.*

The system answers two questions about itself, with one read-only command each.

- `agent-progress-v2 review-stats` asks whether review pays. It adds up the review rounds the [log](../glossary.md#log)
  recorded, joined to token counts and to the bugs that later named a [ticket](../glossary.md#ticket) as their cause.
- `agent-progress-v2 usage` asks how subagents behaved. It reads the transcripts Claude Code, the agent vendor, writes
  under `~/.claude/projects/`, and prints one row per agent.

Neither command takes the [lock](../glossary.md#lock-hold), writes a file or renders anything, and no decision reads
what they print. The log's `review-recorded` lines, one per settled review round, are different: the
[round verdict](../glossary.md#round-verdict) reads them, and so does an [Overseer](../glossary.md#overseer) notice.

The numbers have three sources: those log lines and ticket keys, [row](../glossary.md#row) token counts from
[Watcher](../glossary.md#watcher) [event logs](../glossary.md#event-log), and vendor transcripts. They do not have to
agree. Three limits matter most:

- `review-stats` has no significance test, so a small sample proves little.
- A re-review replaces the line of the same round number, so a failed round usually vanishes from its tables.
- By default `usage` shows no [job](../glossary.md#job)'s agents.

## Neither command touches the board

Code and one scratch run both confirm this: no lock, no write, no caller outside the command.

| Claim | Why it holds |
| --- | --- |
| They take no lock and write nothing | `reviewStatsCommand` reads through `requireTracker`, as `status` does, and `usageCommand` reads only transcript files. Neither calls `writeTracker`. |
| They leave [`<data>`](../glossary.md#reading-names) unchanged | A scratch run left every file in `<data>` with the same checksum, and the review-stats spec asserts the same. |
| Nothing else reads their results | `reviewStatisticsOf` has one production caller, the command. `TranscriptCohortUtil` is imported only by `cli/measurement/usage/`. The Overseer shares the lib's transcript reading for live job facts, `src/services/overseer/ClaudeTranscripts.ts`, and that path never reaches these commands. |
| They stay read-only under a job | Both are in `READ_ONLY_VERBS_UNDER_A_JOB`, the list of verbs that take no lock and write nothing. |

> **Careful.** The printed tables steer nothing, but the `review-recorded` line under them does. `settleReviewPass`
> passes the ticket's recorded rounds to the round verdict, and `nonConvergingTicketIdsOf` reads the newest line for the
> Overseer's `rounds-not-converging` notice (`noticesOf` in `src/services/overseer/DrivePass.ts`). The
> [Playbook](../glossary.md#playbook) reads no such line. Changing a field of that record changes behaviour. Changing
> `ReviewStatistics.ts` does not.

## Where review numbers start

One record holds nearly everything: `recordReview` writes one `review-recorded` line when a review round settles. Code
measures some of its fields and the reviewer claims the rest, and a reader should weigh them differently.
`settleReviewPass` runs only after [Customs](../glossary.md#customs) and the [gates](../glossary.md#gate) passed the
reviewer's [report](../glossary.md#report), so a review round that failed them leaves no line. The field list is in
[the log kinds table](../cli.md).

| Part | Fields | Supplied by | How far to trust it |
| --- | --- | --- | --- |
| Round | `round` | The ticket's in-progress [review bar](../glossary.md#review-bar), `reviewBarRound` | Code fact. |
| Verdict | `verdict` | `settleReviewPass`, mapping the move it chose: `released` queued the merge, `round-requested` got another review round, `does-not-hold` went back to a [builder](../glossary.md#builder), `not-released` asked User for a [waiver](../glossary.md#waiver) | Code fact, frozen at the moment of recording. |
| Start | `reviewStartCommit` | The commit the review job started on | Code fact. With no readable start record it falls back to the reported head, so rework reads 0 and the builder change absorbs the reviewer's fixes. |
| Rework | `fixReworkedCodeLines`, `totalReworkedCodeLines`, `rebaseReworkedCodeLines` | `ReworkCountUtil` over the diff from the start commit to HEAD, for the first two | Measured, code lines only. An unreadable range, such as one holding a merge commit, records 0, so a zero does not prove an empty diff. |
| Builder change | `builderChangedFiles`, `builderInsertions`, `builderDeletions` | `readChangeSize`, `git diff --shortstat` of the job's [target](../glossary.md#target) against the start commit | Measured, every line in the diff, including docs and tests. A git failure records 0, so the ticket lands in the smallest bucket. |
| Claims | `item`, `result`, `handoffContradicted` | The reviewer's report | Reviewer's judgement. The `note` goes to the ticket's `## Review` section, not the log. |
| [Findings](../glossary.md#finding) | `class`, `severity`, `file`, `summary`, `evidence`, `outcome`, and `commit` or `filedTicketId` | The reviewer's report; `ticketIdFiledByRequest` resolves a filing named only by its [Hatch](../glossary.md#hatch) request id | Reviewer's judgement. The words come from `ReviewRecordVocabulary.ts`. |

![Git graph. The target runs on past the merge base to commits no diff counts, and the branch leaves at the merge base for the review start commit, then HEAD. Merge base to start commit is the builder change, every line, from a three-dot diff, and start commit to HEAD is the rework, code lines only.](../figures/measurement/two-diffs-at-the-start-commit.png)

*The three-dot diff starts at the merge base, so commits on the target past it are never part of the builder change.*

Customs checks a finding against the schema and checks that a `filed` finding names a low-priority ticket this job
filed. No check compares a severity with the code, so *serious findings* counts what reviewers called
[serious](../glossary.md#serious-finding).

> **As built.** *rebase lines per ticket* and *verdict integrated* always print 0. See [dead
> code](../reference/known-gaps.md#gap-dead-code-and-unused-states).

A `not-released` line stays `not-released` whatever later happens to the waiver. See [answering a
waiver](../reference/known-gaps.md#gap-waiver-answer-has-no-effect).

## Cause links tie a later ticket to a review

The log alone cannot show a bug that arrived later, so two ticket keys carry that link. Both sit on the later ticket and
name the earlier one.

![Bug 021 names delivered ticket 003 in introducedBy and counts as escaped after a clean last round, because 003's last review round was clean; a dashed branch shows the serious case. Ticket 022 names 003 in foundInReview and counts as filed from reviews, whatever 003's status or last round.](../figures/measurement/cause-links.png)

*Read the two lanes apart. `introducedBy` charges a miss to a delivered ticket; `foundInReview` credits a catch.*

| Key | Means | Set with | Who can set it | Refused when |
| --- | --- | --- | --- | --- |
| [`introducedBy`](../glossary.md#introducedby) | The [delivered](../glossary.md#delivered) ticket whose change introduced this bug | `ticket add --introduced-by`, `ticket introduced-by` | `ticket add`: anyone who may file. `ticket introduced-by`: outside a job only, as the Hatch does not relay it. | The ticket is not a bug, the cause is itself, missing, or not `delivered`. |
| [`foundInReview`](../glossary.md#foundinreview) | The ticket whose review found this one | `ticket add --found-in-review` only | Anyone who may file | The named ticket does not exist. |

`TicketLinks.ts` holds the refusals, which run when a ticket is filed and on each `ticket introduced-by`. An empty cause
removes the key and logs `ticket-introduced-by-set` without a value.

A worker's filing carries both links. Under a job, `ticket add` builds the same `ticket-add` command and relays it
through the Hatch. The [Bouncer](../glossary.md#bouncer)'s `workerFilingIsShaped` refuses other flags on a worker's
filing and lets the two links through, and `addTicket` copies them onto the ticket.

> **Careful.** Nothing stamps `foundInReview`. The Overseer records `filedByJob` on a worker's filing, but the link
> exists only if the filer passes the flag, and `resources/prompts/ReviewPrompt.md` does not mention it. *Tickets filed
> from reviews* can therefore read lower than the `filed` findings behind it. A traced `introducedBy` has the same
> dependency: a bug nobody traced counts nowhere.

## How to read `review-stats`

Use the tables to compare columns with enough tickets in them. They describe; they do not prove review pays. Each
figure is a count over reviewers' own words and each ticket's latest review rounds, on
[recorded tickets](../glossary.md#recorded-ticket) only.

A round restarts at 1 once a ticket went back to a builder (`nextReviewRoundOf`), and `ReviewStatistics` keeps only the
latest line for each ticket and round number. So a re-review's line replaces the failed review's line. The printed
label *review passes* counts kept lines.

![One ticket's review-recorded lines above its review bars, oldest first. The first round 1 does-not-hold is replaced, so no table reads it, while change size reads the first kept line, serious or clean the last, and findings, claims, fix lines and rounds every kept line. Review tokens read every review bar, so the replaced round's tokens stay.](../figures/measurement/review-lines-into-figures.png)

*Tokens keep the replaced round while its findings go, so a rate of tokens over findings runs high after a failed
round.*

> **As built.** A re-review's line replaces the failed one, and a failed round above the re-review's last number stays.
> See [failed review rounds](../reference/known-gaps.md#gap-failed-review-rounds-replaced).

![Log order: round 1 round-requested, round 2 does-not-hold, the ticket goes back to a builder, then round 1 released. Only the first round 1 is replaced, so the kept lines are the failed round 2, then round 1 released. The failed line supplies change size and the last line supplies serious or clean.](../figures/measurement/review-rounds-kept-by-number.png)

*The failed round stays in the tables, while the re-review's line decides serious or clean.*

### What the figures leave out

A ticket with no `review-recorded` line appears only in the closing sentence of the output, and a log line naming a
ticket the [board](../glossary.md#board) no longer holds is dropped. The escaped-bug figures count delivered tickets
only, while every other figure counts tickets still in flight.

*Serious* describes what a ticket's last kept review round found, not what it left in, and *clean* means that round had
no serious finding. A reviewer fixes what it finds in the branch's change, so "last review serious" does not mean a
ticket shipped with a known defect. It means its final review round still found one.

### What each figure supports

Each figure's exact definition is the `review-stats` row of [the CLI reference](../cli.md). Every figure below leaves
out replaced rounds, except tokens, which keep them.

| The question | Figures to read | What it supports | What it cannot show |
| --- | --- | --- | --- |
| Does review catch real defects? | *serious findings per ticket*, *findings class*, *verdict does-not-hold* | How often the kept rounds report defects, and of which kind | Whether each one was real: the severity is the reviewer's word. |
| What does a catch cost? | *review tokens per serious finding*, *review tokens per ticket* | The review spend behind each kept serious finding | The worth of a finding. A rate over no serious finding is `-`. |
| Does review miss things? | *escaped bugs per delivered*, serious against clean | Traced [escaped bugs](../glossary.md#escaped-bug) per delivered ticket, split by how the last kept round ended | Untraced bugs, and bugs that have not surfaced yet. Recent tickets look cleaner. |
| Are builders' [Handoffs](../glossary.md#handoff) honest? | *claims contradicting the handoff* | How often a reviewer's measurement disagreed with a Handoff in a kept round | Which Handoffs nobody tested. A replaced round is the round most likely to hold contradicted claims. |
| Is review converging? | *rounds per ticket*, *fix lines per ticket* | How much the kept rounds rework | Rework the builder did after a failed review round. |

A small example shows how little a small sample says. This is real output from a scratch board of three tickets: two
reviewed and delivered, and the bug filed against one of them. It is cut to the lines that matter here. One bug against
one clean ticket prints a rate of 1.00.

```text
All recorded tickets
                                        all
tickets recorded                        2
review passes                           2
serious findings per ticket             0.50
review tokens per ticket                400000
builder tokens per ticket               1600000
review tokens per serious finding       800000
delivered, last review serious          1
escaped bugs, last review serious       0
delivered, last review clean            1
escaped bugs, last review clean         1
escaped bugs per delivered, clean       1.00

1 ticket has no recorded review and is left out.
```

The bug itself has no `review-recorded` line, so it is the one ticket that closing sentence counts.

### The splits

Each split repeats the same figures for one way of cutting the tickets. A column appears only when it has a ticket, and
nothing prints a sample warning, so read *tickets recorded* first in every column. The split names and the bucket names
are `--json` values; the text prints the titles below and line ranges such as `<=50 lines`.

| Split | Printed as | Split on | Read it with care because |
| --- | --- | --- | --- |
| `byType` | By ticket type | The ticket's stored `type` | Bugs and tickets differ in size, so a difference may be size. |
| `byChangeSize` | By builder change size | The first kept line's `builderInsertions` plus `builderDeletions`, bucketed by `ChangeSizeBuckets.ts` | The count is every changed line, while the fix lines beside it are code only. A big generated file puts a ticket in the largest bucket, and rework on a ticket that went back to a builder pushes it upward. |
| `byBuilder` | By builder model and effort | The ticket's `model` and `effort` as they read at print time, defaults filled in | It reads the ticket's settings, not a launch record, and columns usually differ in what was assigned to them. |

[Change size](../glossary.md#change-size) comes from the first kept line in log position, not from round 1. That line is
the builder's original change only for a ticket that never went back to a builder. On any other ticket it usually runs
up to a re-review's start commit, so it also counts the builder's rework and earlier reviewers' fixes. A failed round
that stayed runs up to its own start commit instead, which holds those fixes but none of the rework. Either way
`byChangeSize` over-sizes reworked tickets.

![Git graph. The branch leaves the target at the merge base and runs through the builder's commits to the first start commit, the first reviewer's fixes, the builder's rework and the second start commit. The kept line's builder change runs from the merge base to the second start commit, so it covers the fixes and the rework as well as the builder's original change.](../figures/measurement/change-size-after-a-rework.png)

*A re-review measures up to its own start commit, so the earlier fixes count as builder change.*

## What `usage` reaches

By default `usage` reports subagents of [sessions](../glossary.md#session) that ran at the repository root. It never
reads a session's own transcript, so no Overseer job session appears. `--transcripts` reaches one
[worktree](../glossary.md#worktree)'s subagents, which for a ticket worktree means every job that ran there, told apart
only by `sessionIdentifier` under `--json` and the brief excerpt.

It prints one row per agent, oldest first, then an `All` cohort line; `--since` adds two more cohort lines. This is
output from a scratch repository with its cohort line cut short. [The CLI reference](../cli.md) defines every column.

```text
started       calls  end context input    output  browser  over 200k  bash edits checks  nested   brief
10-02 11:12   3      52k         125k     2.7k    0        0%         0          1       0        Explore the role editor and list where focus is lost
10-02 16:40   4      250k        700k     3.6k    0        70%        1          2       0        Fix the double-click handler in the role table

All: 2 agents, median 3.5 calls, median end context 151k, mean input 412.5k, mean output 3.1k, ...
```

![A grid of transcript kinds against where the session ran. At the repository root the session's subagents, workflow agents included, are read and its own transcript is not. A job session's own transcript is never read, and its subagents are read only when --transcripts names that worktree's folder.](../figures/measurement/what-usage-reaches.png)

*The top row stays gray whatever the flags: `usage` has no way to read a session's own transcript.*

Two things produce this shape. `transcriptFolderFor` turns one path into one folder under `~/.claude/projects/`, and
`usageCommand` gives it the repository root, while the vendor files a session under its own working directory. Every
job runs under `<worktrees>`: `ticket-<id>`, a [refresh](../glossary.md#refresh) worktree, an
[onboarder](../glossary.md#onboarder) snapshot or `sessions/<job>`. Then
`listSubagentTranscripts` keeps only files named `agent-*.jsonl` under `<session>/subagents/`, with workflow runs under
`subagents/workflows/<run>/`, so a session's own `<session>.jsonl` never qualifies.

`--transcripts <folder>` replaces the folder and not the filter. How the vendor lays these files out is in [the Claude
probe](../development/overseer-claude-probe.md).

> **As built.** A job's builder or reviewer never appears, so `usage` cannot tell how the board's own agents behave. See
> [`usage` misses job sessions](../reference/known-gaps.md#gap-usage-misses-job-sessions).

> **Careful.** `usage` in `/api/state` and the `usage` server-sent event are a different thing with the same name: the
> vendor's usage window. See [Failure and recovery](failure-and-recovery.md).

### The three behaviour columns

Three columns show context size, edits made through the shell and verification runs without anyone opening a
transcript. Treat a high value as a reason to look, since two of them match command text.

| Column | What the code counts | What to keep in mind |
| --- | --- | --- |
| `over 200k` | The share of the agent's input sent on calls whose context passed `OVERSIZED_CONTEXT_THRESHOLD_TOKENS` (200000). `--json` carries the raw token count. | It sums calls, so no text matching is involved. |
| `bash edits` | Bash commands containing a fragment of `BASH_EDIT_SCRIPT_FRAGMENTS`, such as `<<`, `python3 ` or `sed -i` | A read-only `python3` script or a heredoc to a command counts as an edit. |
| `checks` | Bash commands containing a fragment of `VERIFICATION_RUN_FRAGMENTS`, once per command | It is a raw count, not a rate per edit, and `bun test` on one file counts like a full run. |

### Cohorts and `--since`

The cohort lines are the part of `usage` built for comparing. `--since` splits the agents at one instant and prints a
line for each side; [the CLI reference](../cli.md) lists the `<when>` forms. It compares subagents only: root sessions'
subagents by default, or one worktree's subagents with `--transcripts`. A change to what a builder or reviewer session
is told cannot be measured this way, because `usage` never reads those sessions.

![Six agents as bars over time, with a vertical --since line. Two start and end before the line, one starts before it and runs across, and two start after it. Those three and an agent with no readable stamp reach the Before line and the two later agents reach the Since line, so only the start stamp decides.](../figures/measurement/since-splits-agents-by-start.png)

*An agent still running at the instant counts as before it.*

`TranscriptCohortUtil` reports calls and end context as medians, so one runaway agent does not move the typical figure.
It reports token figures as means, because a bill is a sum. An unstamped agent lands on the `Before` line so that it can
never count as evidence that a change helped. A before-and-after comparison shows that something
moved. It cannot rule out that the work itself changed.

## Three sources that do not have to agree

The numbers come from three places, and each counts something different. Token crediting is described in [Roles and
launch](roles-and-launch.md).

| | `review-stats` tokens | `usage` lines | `review-stats` everything else |
| --- | --- | --- | --- |
| Source | Row `tokens` in `progress.json` | Vendor transcripts | `review-recorded` lines and ticket keys |
| Written by | `EndedJobTokens` from Watcher event logs, when a job ends | The vendor, as a session runs | `settleReviewPass`, and filers |
| Covers | Ticket jobs and their subagents | Subagents in one folder | Settled review rounds |
| Counts output tokens | No: the credit is `totalInputTokens` | Yes, in its own column | Not applicable |

![By default no agent's tokens reach both commands. Build jobs, merge agents and review jobs reach a token column and never usage, and their subagents count in the same column and reach usage only with --transcripts. A root session's subagent reaches usage and neither token column.](../figures/measurement/which-report-sees-whose-tokens.png)

*Only an amber cell brings one agent into both commands, so a ticket's numbers never add up across them.*

*Builder tokens* is the ticket's own row, so it holds every non-review job on the ticket, not only the builder. *Review
tokens* covers the free-standing rows with `reviewOf`. A figure set by hand with `--tokens` replaces a row's value, and
the tables cannot tell it from a credit.

## Invariants

1. `review-stats` and `usage` take no lock, write no file and render nothing.
2. No decision reads the output of either command.
3. A review round has a `review-recorded` line only if it passed Customs and its gates.
4. One round number counts once per ticket: the latest line replaces any earlier one, and a round number recurs after a
   ticket went back to a builder.
5. The in-memory board model `Board` sets `introducedBy` only on a bug, naming another ticket that is `delivered` at
   that moment.
6. `ReviewStatistics` is pure over the `Board` records and the log it is given.
7. A ratio over nothing is `null` in `--json` and `-` in the text; a per-ticket figure over no tickets is 0.
8. `usage` reads only `agent-*.jsonl` transcripts under a session's `subagents/` folder, workflow runs included.

## In the code

| Concept | Path | Symbol | Held by |
| --- | --- | --- | --- |
| The review figures | `src/lib/tracker-model/ReviewStatistics.ts` | `ReviewStatistics.reviewStatisticsOf` | `src/lib/tracker-model/ReviewStatistics.spec.ts` |
| The command and its read-only claim | `cli/measurement/review-stats/ReviewStatsCommand.ts` | `reviewStatsCommand` | `cli/measurement/review-stats/ReviewStatsCommand.spec.ts` |
| The printed tables | `cli/measurement/review-stats/ReviewStatsText.ts` | `reviewStatsTextOf` | `cli/measurement/review-stats/ReviewStatsCommand.spec.ts` |
| Recording a review round | `src/services/lifecycle/ReviewOutcome.ts` | `settleReviewPass` | `src/services/lifecycle/ReviewOutcome.spec.ts` |
| Writing the line | `src/lib/tracker-model/ReviewBars.ts` | `recordReview` | `src/lib/tracker-model/ReviewStatistics.spec.ts` |
| Its vocabulary | `src/lib/tracker-model/constants/ReviewRecordVocabulary.ts` | `REVIEW_VERDICTS`, `REVIEW_FINDING_SEVERITIES` | Schema: `src/lib/tracker-model/constants/LogRecordSchema.ts` |
| Cause links | `src/lib/tracker-model/TicketLinks.ts` | `TicketLinks` | `cli/tickets/TicketCommand.introducedBy.spec.ts` |
| Change size buckets | `src/lib/tracker-model/constants/ChangeSizeBuckets.ts` | `CHANGE_SIZE_BUCKETS` | `src/lib/tracker-model/ReviewStatistics.spec.ts` |
| The transcript folder | `src/lib/claude-code/ClaudeTranscripts.ts` | `transcriptFolderFor`, `listSubagentTranscripts` | `src/lib/claude-code/ClaudeTranscripts.spec.ts` |
| One agent's figures | `src/lib/claude-code/utils/TranscriptUsageUtil.ts` | `transcriptProfileOf` | `src/lib/claude-code/utils/TranscriptUsageUtil.spec.ts` |
| Cohorts | `src/lib/claude-code/utils/TranscriptCohortUtil.ts` | `cohortSummaryOf`, `cohortSplitAt` | `src/lib/claude-code/utils/TranscriptCohortUtil.spec.ts` |
| The `usage` command | `cli/measurement/usage/UsageCommand.ts` | `usageCommand` | `cli/measurement/usage/UsageCommand.spec.ts` |
| Rows into tokens | `src/services/overseer/EndedJobTokens.ts` | `creditJobsEndedInTheHold` | `src/services/overseer/EndedJobTokens.spec.ts` |
