# End-to-end smoke with real Claude sessions

> **Question:** How do I prove the whole lifecycle on real sessions, and read the result?
> **Time:** 10 minutes.
> **Read first:** [Overview](../concepts/overview.md), [Ticket lifecycle](../concepts/ticket-lifecycle.md).
> **Next:** [Guards and testing](guards-and-testing.md),
> [Failure and recovery](../architecture/failure-and-recovery.md).

## In one screen

The smoke is the one test that spends real [sessions](../glossary.md#session); the owner runs it by hand, outside
`bun test`. It drives two planted [tickets](../glossary.md#ticket) from filing to [delivered](../glossary.md#delivered)
on a throwaway [board](../glossary.md#board), with no person at the keyboard. On the way it kills the
[Overseer](../glossary.md#overseer) with `kill -9` and restarts it once. It proves five things, in its output's order:

1. Both tickets travel the whole path, from filing through build, review and merge to delivered.
2. [Agents](../glossary.md#agent) outlive a killed and a restarted Overseer.
3. A merge conflict resolves and [lands](../glossary.md#landing).
4. Each question reaches the right answerer: User or the [Assistant](../glossary.md#assistant).
5. The live event stream shows every ticket move and [job](../glossary.md#job) launch.

From a checkout of the code under test, `bun cli/testing/CutoverSmoke.ts --with-real-claude` uses Claude subscription
quota on at least six sessions and drives for up to `DEFAULT_TIMEOUT_MINUTES` (120).

The script's narration, the run log, goes to the terminal and the main checkout's `.claude/.evidence/cutover-smoke/`.
Exit 0 means all five held; it does not cover leaked [Watchers](../glossary.md#watcher), which the run log counts.

![Swimlane of one smoke run, time running down, with a right column naming the item that judges each row. The main path readies two tickets, then builds, reviews and merges them to two deliveries, with a planted question answered by the script and another settled through the Assistant, and a planted conflict settled by the ticket's reviewer in the Airlock. At the first poll that sees a build running, the script kills the Overseer and restarts it; both builds keep running, and item 2 watches the first one seen on one Watcher instance.](../figures/cutover-smoke/one-run-meets-each-mechanism.png)

*Notice that the script plays both User and the attacker, and that each row is judged in the right column.*

## Before running

![Three places. The checkout under test supplies the script and agent-progress.ts. The scratch root holds a bin folder with the shim and the repository, whose data folder is the board, where the Overseer, the Watchers and the sessions run. Sessions reach the entry point through the shim; the script spawns each verb directly, in the repository. The main checkout receives only the evidence folder.](../figures/cutover-smoke/one-run-touches-three-places.png)

*Notice that nothing tracked in the checkout under test changes, and that the evidence goes to the main checkout, not
to the scratch root.*

The script runs every command in the scratch repository, so it never reads or writes this repository's
[tracker](../glossary.md#tracker). `<scratch root>` is a fresh folder under the temporary folder; the run log's last
line names the repository inside it.

The main checkout is the checkout that holds the shared `.git` folder. From a worktree, it is not the folder the script
runs in. A clone is its own main checkout. Run from the main checkout, the two boxes are one folder and only the ignored
evidence folder changes.

| Needs | Why |
| --- | --- |
| A checkout of the code under test, after `bun install` | A scratch clone or a worktree. The shim runs that checkout's `agent-progress.ts` and comes first on the children's `PATH`, so sessions reach it with no `bun link`. |
| `claude` on `PATH`, signed in | `HOME` stays real, since `claude` signs in from it. |
| `.claude/` git-ignored in the main checkout | Otherwise the script refuses: `git check-ignore` guards the evidence folder. In the owner's checkout the ignore lives in `.git/info/exclude`, which a clone does not copy, so a standalone clone passes `--main-checkout <a checkout that ignores .claude/>`. |
| This build's side-by-side names ([glossary](../glossary.md)) | Nothing to set; `CutoverSmokeUtil.refusalOf` refuses a build under the released names. |

The children inherit the environment minus `FORGE_FAKE_AGENT`, `FORGE_JOB_ID`,
`FORGE_HATCH_DIRECTORY` and `FORGE_ROOT`, so a shell setting one of them cannot redirect or fake
the run.

## Running it

`cutover` in these file names is the code's name for this smoke.

```bash
bun cli/testing/CutoverSmoke.ts --with-real-claude [--timeout-minutes 120] [--main-checkout <path>] \
  [--model sonnet] [--effort medium]
```

| Flag | Effect |
| --- | --- |
| `--with-real-claude` | The opt-in. Without it the script refuses at exit 1. |
| `--timeout-minutes <n>` | Stops the drive after `n` minutes, default `DEFAULT_TIMEOUT_MINUTES` (120). |
| `--main-checkout <path>` | Where the evidence folder lives. Default: the main checkout. |
| `--model`, `--effort` | Go on `ticket add` for both tickets. |

> **Careful.** `--model` and `--effort` reach the ticket file and no launch. Every session runs on the settings
> `LaunchSettings.launchSettingsOf` returns from the [pipeline](../glossary.md#pipeline)'s `agents`, and the smoke's
> pipeline names none. The two flags change neither what is spent nor what is proved.

Exit codes: 0 when items 1 to 5 all hold; 1 on a refusal, when any item fails, or when the script throws before any
verdict.

## What one run does

The script stands in for User, in three steps from `runCutoverSmoke`: Prepare, Plant and Drive. The script spawns each
verb directly as `bun agent-progress.ts <verb>`; the run log prints it as `forge <verb>`. Only the sessions
go through the shim.

**Prepare.** `prepare` commits `README.md` and `palette.txt`, runs `init --no-hooks` and commits the ignores it wrote.
It adds three [gates](../glossary.md#gate) (`readme`, `palette`, `palette-file`). It writes a `review` phase straight
into the scratch `pipeline.json`, since no command writes one and a pipeline without it queues a built ticket for merge
with no reviewer. It then sets `concurrency 2` and `oversee pause`, starts `oversee --detach` and connects an SSE client
to `/api/events`.

**Plant.** `fileAndReadyTickets` files and readies two tickets while the Overseer is paused, then runs `oversee resume`,
so one [Pass](../glossary.md#pass) launches both from one main tip. Both tickets append a line at the end of
`palette.txt`. That plants a textual conflict whose resolution keeps both lines. Two values for one line would leave the
[merge agent](../glossary.md#merge-agent) no resolution that keeps both sides, and a `cannot-resolve` report
[refuses the merge](../architecture/airlocks-and-groups.md).

| Ticket | Title | Its brief tells the [builder](../glossary.md#builder) to | Which opens |
| --- | --- | --- | --- |
| #001 | Choose the palette colour | Ask with AskUserQuestion, header `colour` | An `agent-question` [decision](../glossary.md#decision), which the script answers with `decide <id> a` |
| #002 | Name the palette shade | Ask with the reserved header `ticket` | A `malformed-ticket` [incident](../glossary.md#incident), left to the Assistant |

An ordinary question goes to User, played here by the script; a question under a reserved header reports a ticket
defect, which goes to the Assistant. [Questions and incidents](../architecture/questions-and-incidents.md) holds the
rule.

If the Assistant escalates, the incident becomes an `agent-question` decision, answered the same way. A default takes
the same escalation path when the Assistant makes no move.

> **As built.** When the Assistant answers rather than escalates, the answer changes the ticket body under a live job:
> [known gap](../reference/known-gaps.md#gap-malformed-ticket-answer-v6).

![Git graph of two ticket branches leaving one target tip, each adding its line at the end of palette.txt, with each build's gate logging a gate-ran record. The first landing moves the target to a tree already gated, so it adds no run. The second conflicts, the reviewer's merge commit in the Airlock keeps both lines, and that resolved tree gets the third gate-ran before it lands. Both landings fast-forward.](../figures/cutover-smoke/planted-conflict.png)

*Notice that only the resolved tree has not been gated: the conflict is what supplies item 1's third run.*

**Drive.** `driveToDelivery` polls every `POLL_INTERVAL_MILLISECONDS` (10 000) and logs each change of the tickets and
jobs. Each poll answers the open `agent-question` decisions. The loop ends when both tickets are `delivered`, when the
deadline passes, or when a decision of any kind but `agent-question` opens.

Inside the loop, once, at the first poll that sees a build job `running`, `regroupAroundRunningBuild` attacks. It sends
`kill -9` to the process the newest [Baton](../glossary.md#baton) names and runs `oversee --detach` for a
[Regrouping](../glossary.md#regrouping). After `SETTLE_AFTER_REGROUPING_MILLISECONDS` (30 000) it runs `oversee restart`
for a [Baton pass](../glossary.md#baton-pass), then waits `SETTLE_AFTER_RESTART_MILLISECONDS` (20 000). A builder must
spend a turn before it asks, so the attack usually comes before any question is answered.

![Strip of the attack, time running right. Kill -9 opens a first stream gap, during which oversee --detach runs, and the gap closes when the stream reopens. A settle wait follows and the script takes a first reading of the Watcher. Oversee restart opens a second gap, which also closes when the stream reopens, then a second settle wait and a second reading. No decision is answered anywhere in the strip.](../figures/cutover-smoke/attack-timeline.png)

*Notice that each Watcher reading follows a settle wait, so it sees what the kill or the restart left.*

When the loop ends, `stopEverything` runs `job stop --all`, waits up to `STOPPING_JOB_TRIES` (60) seconds for the
stopped jobs, runs `oversee stop --now` and kills the Watchers still running in the scratch board.

## What it asserts

Each verdict comes from one `CutoverSmokeUtil` function.

![Four sources feed five verdict functions. What the script saw around the kill, which no file stores, feeds item 2. The board log feeds items 1, 3, 4 and 5; the SSE events received and the stream gaps, which no file stores either, feed item 5 as well. All five verdicts join at one check: exit 0 only when verdicts.length is 5 and every one passed, and exit 1 otherwise.](../figures/cutover-smoke/four-sources-feed-five-verdicts.png)

*Notice that no file stores item 2's observation: the logs and the scratch board keep part of it, and the live Watcher
check is lost.*

| Item | Proves | Holds when | Function |
| --- | --- | --- | --- |
| 1 | The whole path | Each ticket had a `builder` and a `reviewer` launched and was delivered; landings at least equal the tickets; no two merges held one [target](../glossary.md#target) at once; at least `MINIMUM_PASSED_GATE_RUNS` (3) `gate-ran` records with `outcome` `passed` | `deliveryVerdictOf` |
| 2 | Agents outlive the Overseer | The Watcher lived through the kill and the restart; the job folder holds no second [Watcher instance](../glossary.md#watcher-instance); no further build job launched on the ticket; `oversee restart` exited 0 | `regroupingVerdictOf` |
| 3 | Merge conflicts resolve | A `merge-agent` job ended `resolved` and its parent merge job then logged `merge-landed` | `conflictVerdictOf` |
| 4 | Questions reach the right answerer | #001's decision was answered and #001 finished at or after the answer; #002's incident logged `incident-answered` or `incident-escalated` | `questionVerdictOf` |
| 5 | The live stream shows moves and launches | Each `ticket-readied`, `ticket-started`, `ticket-finished` or `ticket-delivered` record logged while the stream was connected showed as its status in a `board` event, and each job launched then appeared in a `job` event | `eventVerdictOf` |

Five cases make a verdict read differently from its table row.

- **Item 1, the third gate run.** A `gate-ran` record is one run of all three gates over one tree, so the 3 means three
  trees: two builds and the resolved merge. A clean first landing reuses its build's result through
  `mergedTreeWasLastPassed`, so the third run normally comes from the resolved merge, and a failed item 3 normally
  leaves item 1 short of runs. A rework adds a further run, so item 1 can still reach three without a conflict.
- **Item 2, a build that finishes in time.** A Watcher that has exited still passes if its job logged no
  `job-interrupted`: the build finished on its own.
- **Item 4, who acted.** The verdict counts `incident-answered` or `incident-escalated`. An Assistant turn that closes
  or spends its budget with no move, or no Assistant at all, also logs `incident-escalated` through
  `IncidentMoves.defaultIncident`. So a `PASS`, including its words `escalated by the Assistant`, does not prove the
  Assistant acted. The record names no actor: to tell the cases apart, look for the `incident escalate` call in the
  Assistant job's `events-<n>.ndjson`. Only an incident closed by another move, such as `ticket-park`, fails; that logs
  `incident-handled` alone.
- **Item 5, `ticket-approved` is never checked.** The script maps `ticket-approved` to `approved`, which is no ticket
  status. On this path the same-stamp `ticket-delivered` overtakes it, so the move is never asked of the stream. A lone
  `ticket-approved` would fail as `no board event showed #<id> approved`.
- **Item 5, what is not asked of the stream.** When two moves of one ticket share a timestamp, only the later one must
  appear, because an event carries the state a whole Pass left. Records inside the gaps from the kill and the restart
  to the reconnection are skipped, with a one-second margin. Any other move kind, such as `ticket-reopened`, is not
  asked.

The run log also prints `item 6` at the start. It is the script's own guard, restating the program and scratch root,
and is never judged. `runCutoverSmoke` requires five verdicts.

## What it spends

A run uses Claude subscription quota. One that ends well launches at least six sessions: two builders, two reviewers,
one reviewer resumed in the Airlock and the Assistant, which boots with the first Pass whether or not it has work. Each
extra
[review round](../glossary.md#review-round), rework or resumed job adds to that. An Assistant that answers rather than
escalates adds a second #002 builder, through the known gap above. Models, efforts and
[call budgets](../glossary.md#call-budget) are those of [Roles and launching](../architecture/roles-and-launch.md);
`--timeout-minutes` bounds the wall clock.

The script leaves the scratch repository behind for reading and names it on the run log's last line. Delete it once
read.

## Reading the evidence

Read the run log's tail first, find how the run ended, then follow the failing item. The stem below is
`<main checkout>/.claude/.evidence/cutover-smoke/cutover-smoke-<stamp>`, and the run log's first line names it. Two
files carry the word log: the run log is `<stem>.log`, and the board log is `<stem>-log.jsonl`.

```text
item 1: PASS — #001 and #002 delivered after build and review; 2 ordered landings; 3 passed gate runs
item 2: PASS — job J2 kept Watcher instance 1 alive through kill -9, a new run and oversee restart
item 3: PASS — Airlock agent J8 resolved merge J7, which landed
item 4: PASS — decision E1 answered and #001 built on; incident I1 escalated by the Assistant
item 5: PASS — every ticket move in a board event; job states seen: J2 launching>preparing>running>waiting-for-answer>gating>ended; ...
PASSED; scratch repository kept at <scratch root>/repository: remove it once read
```

Only the run log grows during a run. The script writes the three `<stem>-` files once, when the run ends.

| File | Holds | Read it for |
| --- | --- | --- |
| `<stem>.log`, the run log | The script's narration: each mutating and setup command with its exit code and output, cut to `LOGGED_OUTPUT_CHARACTERS` (1500); the polls are silent and show only as changes of tickets and jobs; the Watcher counts at the stop; the verdicts | The story of the run |
| `<stem>-log.jsonl`, the board log | A copy of the board's [log](../glossary.md#log) | Checking a verdict against its records |
| `<stem>-overseer.log` | A copy of [`<data>`](../glossary.md)`/overseer.log` | What the Overseer said around a kill or a failed launch |
| `<stem>-events.ndjson` | Every SSE event received: `kind`, `receivedAt`, `data` | Item 5 |
| `<scratch root>/repository` | The whole board: `<data>/jobs/J<n>/`, ticket files, git history | A job's `watcher-<n>.json` and `events-<n>.ndjson`, the session's lines ([atlas](../data-model/on-disk-atlas.md)) |

After any run, read the Watcher counts. At the stop the run log counts two groups of leftover Watchers. Watchers of
ended jobs should be 0: the Overseer reaps those, and any other number is a leak. No item judges this count, so a run
can exit 0 with a leak: read this line even when the run exits 0. Watchers of jobs still live, such as the Assistant's,
outlive the Overseer by design.

Run this from the main checkout to print the newest run's skeleton from its board log:

```bash
stem=$(ls -t .claude/.evidence/cutover-smoke/*.log | grep -v -- '-overseer\.log$' | head -1)
stem=${stem%.log}
jq -r 'select(.kind | test("^(job-launched|job-ended|merge-|decision-|incident-)"))
  | [.at, .kind, (.jobId // .decisionId // .incidentId // "-"),
     (.fields.role // .fields.outcome // .fields.kind // "-")]
  | @tsv' "$stem-log.jsonl"
```

### When an item fails

A failed item is often a symptom.

![Decision tree from the run log's tail. In order: no item 1 to 5 lines means the script threw before the tickets were ready, a line starting The smoke stopped with item lines means it threw during the drive and item 2 is forced to fail, a line saying a decision only User may take names the kind that stopped it, and Timed out after means the deadline passed. The last three still print item lines, and those are symptoms. Only a run that went on to the end has item lines to read directly: too few passed gate runs means read item 3 first, and any other FAIL is looked up in the table below.](../figures/cutover-smoke/read-a-failed-run.png)

*Notice that three of the four early endings print item lines that are symptoms, so read the ending first.*

Every item still gets a verdict on those three endings, usually failing. At a timeout `stopEverything` stops the live
jobs where they stand. The kinds a decision can name, among them `parked`, `merge-refused` and `landing-refused`, are
defined in [Questions and incidents](../architecture/questions-and-incidents.md).

The table holds every `FAIL` detail the script can print. One item line may join several with `;`.

| A `FAIL` that says | Means | Look at |
| --- | --- | --- |
| `#<id> had no builder` | The ticket never launched a build, or the run stopped first | Board log: `job-launched`. Run log: the ticket lines |
| `#<id> had no reviewer` | The build never reached review, or the run stopped first | Board log: the builder's `job-ended`. Run log: the `A decision only User may take` line |
| `<n> landings for 2 tickets`, `#<id> was not delivered` | A merge was refused, or the run stopped first | Board log: `decision-opened` kinds, `job-ended` `cause` of the merge job |
| `two merges held one target at once` | A `merge-started` came before the merge job holding that target ended | Board log: `merge-started` and `job-ended` of both merge jobs |
| `<n> passed gate runs, fewer than 3` | No merge gated a fresh tree | Item 3 first |
| `no build ran to regroup around` | The run stopped before any poll saw a build `running`, or the script threw during the drive, the Regrouping included | Run log: `The smoke stopped:`. Then `<stem>-overseer.log` |
| `the Watcher died with the Overseer` | The agent did not outlive the kill | Board log: `job-interrupted` and its `cause`. Scratch board: the job's `watcher-<n>.json` |
| `the Watcher died in the Baton pass` | The agent did not outlive the restart | The same two, after the `oversee restart` line in the run log |
| `moved to Watcher instance <n>` | The job was resumed in another Watcher | Board log: `job-resumed` |
| `<n> more build jobs launched on the ticket` | The Overseer launched a further build on the watched ticket during the attack | Board log: `job-launched` and the first job's `job-ended` |
| `oversee restart exited <n>` | The Baton pass did not complete | Run log: the `oversee restart` line and its output. Then `<stem>-overseer.log` |
| `0 Airlock agent jobs` | No merge conflicted, often because a ticket never reached its merge | Board log: `predictedConflictFiles` on `merge-started` |
| `<n> Airlock agent jobs, none resolved ...`, for `n` above 0 | An Airlock agent ran, but it did not resolve or its merge did not land | Board log: `job-ended` of the Airlock agent and its parent merge job |
| `no agent-question decision opened`, `no malformed-ticket incident opened` | The builder did not ask as briefed | Scratch board: `<data>/jobs/J<n>/events-<n>.ndjson` of the builder job, named by its `job-launched` record |
| `decision <id> was never answered` | The run stopped before a poll answered it | Run log: the `decide` lines and the stop |
| `#<id> was not finished after its answer` | No `ticket-finished` came at or after the answer | Board log: `decision-answered`, `ticket-finished`, the builder's `job-ended` |
| `incident <id> was neither answered nor escalated` | The incident was still open when the run stopped, or another move closed it | Board log: the incident's records. Scratch board: `<data>/jobs/J<n>/events-<n>.ndjson` of the Assistant job, named by its `job-launched` record |
| `no board event showed ...`, `no job event for ...` | A record has no matching event | `<stem>-events.ndjson` |

## Invariants

1. The board under test lives in a fresh scratch repository under the temporary folder; no command runs against this
   repository's tracker.
2. No run starts without `--with-real-claude` and the side-by-side names.
3. Exit 0 requires exactly five verdicts, all holding.
4. The script answers only `agent-question` decisions; anything only User may take ends the run.
5. Every verdict that fails names what is missing, so a verdict line is never vacuous.

## In the code

| Concept | Path | Symbol | Held by |
| --- | --- | --- | --- |
| The run | `cli/testing/CutoverSmoke.ts` | `runCutoverSmoke`, `createSmoke` | Not a spec; run by hand |
| Refusal before anything runs | `cli/testing/CutoverSmokeUtil.ts` | `CutoverSmokeUtil.refusalOf` | `cli/testing/CutoverSmokeUtil.spec.ts` |
| Evidence location | `cli/testing/CutoverSmokeUtil.ts` | `CutoverSmokeUtil.evidenceFolderOf` | `cli/testing/CutoverSmokeUtil.spec.ts` |
| Items 1 to 5 | `cli/testing/CutoverSmokeUtil.ts` | `deliveryVerdictOf`, `regroupingVerdictOf`, `conflictVerdictOf`, `questionVerdictOf`, `eventVerdictOf` | `cli/testing/CutoverSmokeUtil.spec.ts` |
| Reserved question headers | `src/services/overseer/QuestionRouting.ts` | `INCIDENT_KIND_OF_RESERVED_HEADER` | `src/services/overseer/QuestionRouting.spec.ts` |
| Scratch root | `src/testing/ScratchWorkspace.ts` | `createCanonicalScratchDirectory` | Not held; a test helper |
