# Runbook

> **Question:** Something needs me: what do I check and what do I do?
> **Time:** 2 minutes for one recipe; read the first screen once beforehand.
> **Read first:** [Running a board](running-a-board.md).
> **Next:** [Refusals](../reference/refusals.md).

## In one screen

Run these from the repository root, in this order, then follow the table. None of them takes a lock or changes anything.

```bash
forge oversee status   # is the Overseer up, paused, held; its notices and warnings
forge status           # rows, recent log, and the Next line
forge jobs             # live jobs, then a footer, then defaulted-incident warnings
forge decisions        # what waits on you
forge incidents        # what waits on the Assistant
forge merges           # Airlock holders and the merge queue
tail -n 40 .forge/overseer.log
```

`oversee status` reports the [Overseer](../glossary.md#overseer) and any [notice](../glossary.md#notice). `status` shows
the [board](../glossary.md#board)'s [rows](../glossary.md#row) and its [Next line](../glossary.md#next-line). `jobs`
lists each [job](../glossary.md#job), and `merges` shows who holds an [Airlock](../glossary.md#airlock) and what is in
the [merge queue](../glossary.md#merge-queue). [Decisions](../glossary.md#decision) wait on you and
[incidents](../glossary.md#incident) wait on the [Assistant](../glossary.md#assistant); an incident that nobody settles
takes its default move.

| You see or want | Go to |
| --- | --- |
| A command printed a [refusal](../glossary.md#refusal) | [Refusals](../reference/refusals.md) |
| A command printed `cannot be read`, even `status` | [Stored file damage](#stored-file-damage) |
| Why this one [ticket](../glossary.md#ticket) will not start | [One ticket will not start](#one-ticket-will-not-start) |
| A ticket or the whole board stands still | [Not moving](#not-moving) |
| Every board on the machine stopped | [Usage limit](#usage-limit) |
| A [session](../glossary.md#session) seems to do nothing | [An agent looks stuck](#an-agent-looks-stuck) |
| You want to stop something | [Which control to reach for](#which-control-to-reach-for) |
| A [gate](../glossary.md#gate) stays red | [A gate keeps failing](#a-gate-keeps-failing) |
| A ticket is [parked](../glossary.md#park) or [held](../glossary.md#hold) | [A parked ticket](#a-parked-ticket) |
| `decisions` lists something | [Decisions](#decisions) |
| An `outage` decision is open | [Outage](#outage) |
| `merges` shows a holder that does not move | [A merge is stuck](#a-merge-is-stuck) |
| `jobs` warns that an incident took its default; the Bridge shows it in the incident line | [No Assistant](#no-assistant) |
| A process or the machine died | [Something died](#something-died) |
| A `notice:` or a refusal names `update` | [Updating](#updating) |

Three rules keep you out of trouble. Answering a decision often changes nothing by itself; the [Decisions](#decisions)
table gives the follow-up. `running` says a [Watcher](../glossary.md#watcher) lives, never that its
[agent](../glossary.md#agent) works. Every control below works with the Overseer down: it records at once and the
Overseer acts when it starts.

Replace the example ids `003`, `J7`, `E3`, `I2`, and fill in anything in `<...>`. A fenced block is a sequence: run all
of it, unless the sentence above it calls it a list. Where you must choose, each choice is its own table cell or code
span, which pastes alone. Prose shortens `forge oversee status` to `oversee status`. Names in capitals are
constants. `<data>` and friends:
[Reading names](../glossary.md#reading-names). Flags: [CLI reference](../cli.md).

## Not moving

Work down the ladder and stop at the first rung that fails. A rung further down cannot help until it clears. No command
reports which rung stopped a ticket, so you check them yourself.

![A ladder of thirteen checks in three groups, each naming the section that fixes it. Six board-wide: Overseer up, not paused, pipeline set, no usage limit, install unchanged, no outage. Five for the ticket: not a draft ticket, no hold or merge mark, no waiver, ended job's question or incident naming it, branch and target clean, dependencies settled. Two of capacity: launch slot free, and ranked within the free launch slots, which no command shows. Passing all thirteen launches the ticket on the next Pass.](../figures/runbook/not-moving.png)

*Notice the last group: a ticket waiting there has nothing wrong with it.*

### Nothing launches at all

**You see:** tickets are ready and `jobs` lists no [build job](../glossary.md#build-job).

| Confirm with | What it shows | Cause | Fix |
| --- | --- | --- | --- |
| `forge oversee status` | `overseer: down` | No Overseer, so no [Pass](../glossary.md#pass) runs. | `forge oversee --detach` |
| `forge oversee status` | `; paused` at the end of the first line (`status` adds it to the [Next line](../glossary.md#next-line)) | Someone paused, or the board never left its default: a fresh board is paused (`DEFAULT_OVERSEER_STATE`). | `forge oversee resume` |
| `forge gate list` | no pipeline | No [pipeline](../glossary.md#pipeline), or a malformed one. A `checks-not-set` decision is open; no agent starts by itself. | Run `forge pipeline setup` and Apply its record, or run `forge gate add <name> -- <command>` or `forge gate none`; see [Stored file damage](#stored-file-damage) for a malformed file. |
| `jq -r .resetsAt ~/.forge-monitor/usage-limit.json` | a time ahead of the clock | A [usage limit](#usage-limit). | Wait for the reset. |
| `forge oversee status` | [`notice: the install version changed`](../glossary.md#notice) | The program on disk has another [install version](../glossary.md#install-version). | [Update](#updating). |
| `forge decisions` | `outage` | Crashes on different tickets in a row paused the board. | [Outage](#outage). |

Paused differs from the other rows. It stops new work only: an interrupted job still resumes. The others also stop
resumes.

```bash
forge oversee --detach
forge oversee resume
```

**Avoid:** after `init`, remember the second command. The board does not start itself.

### One ticket will not start

**You see:** other tickets move, or the board is otherwise healthy, and this one stands still.

```bash
forge ticket show 003   # status, held:, waits on:
forge decisions
forge incidents
forge merges
forge oversee status
```

| Cause | How it shows | Fix |
| --- | --- | --- |
| Still a [draft ticket](../glossary.md#draft-ticket) | status `draft` | `forge ticket ready 003` |
| A hold | a `held:` line | Decode it in [A parked ticket](#a-parked-ticket). |
| Merge mark | the ticket is queued in `merges` | Nothing to fix: it waits for its [Airlock](../glossary.md#airlock), never for another review. See [A merge is stuck](#a-merge-is-stuck). |
| Agent-configuration touch | a `branch-touches-agent-config` decision | See [Decisions](#decisions). |
| An open [`waiver`](../glossary.md#waiver), or an `agent-question` whose job ended | `decisions` names the ticket | See [Decisions](#decisions). |
| An [incident](../glossary.md#incident) naming it, of any kind | `incidents` names the ticket | Wait for the Assistant or a default, or make the move yourself. Each incident lists its allowed moves. |
| Committed [managed block](../glossary.md#managed-block) on its [target](../glossary.md#target) | `notice: launches onto main wait` | Commit the `CLAUDE.md` change `update` made, on that target. |
| Unsettled dependency | a `waits on:` entry that is neither [`reviewed`](../glossary.md#reviewed) nor [`delivered`](../glossary.md#delivered) | Finish it, or `forge ticket depends 003 --remove 004`. An `abandoned` dependency stays unsettled. |
| No free [launch slot](../glossary.md#launch-slot) | `jobs` lists as many build and review lines as `concurrency` prints | Wait, or raise it with `forge concurrency 3`. A job waiting for an answer or interrupted keeps its launch slot. |
| Candidates rank ahead | a free launch slot goes to another ticket | Wait, or `forge ticket priority 003 high`. |

Priority never blocks a ticket; it only orders candidates. The Pass gives the order.

> **As built.** Help words priority as a block. A
> [group](../glossary.md#group) ticket can be absent from the ready list.

## An agent looks stuck

Read the job's state first; it decides everything else. No check tells a hung session from a quiet one: the
[event log](../glossary.md#event-log) shows only how long it has been silent, never why.

**You see:** a job in `jobs` whose ticket has not changed for a long time.

![Flow for a job that looks stuck. Waiting on an answer, in state waiting-for-answer or awaiting-answer: answer with decide or incident answer; a waiver also needs job fresh. State interrupted: wait for the resume on the next Pass, unless a board hold applies. Any other state but running, such as launching, in-customs or gating: the Overseer is moving the job. Running with an event log that moved lately: wait. Running and silent, which fits a long tool call or a hang: send job message, which costs one turn. With no reply, choose one: job fresh tries again with a new job id, or job stop gives up for now and holds the ticket.](../figures/runbook/quiet-agent-triage.png)

*Notice that no box tells a hung agent from a quiet one: no check does. Silence is the only signal.*

A job waiting on an answer with no decision listed waits on an incident: wait for the Assistant, or run
`forge incident answer I2 -- "..."`.

```bash
forge jobs
tail -n 1 .forge/jobs/J7/events-1.ndjson | jq -r .at   # when it last said anything
tail -n 20 .forge/jobs/J7/watcher-1.log                # Watcher and agent stderr
```

The `1` in these paths is the `watcher` number on the job's line in `jobs`: each resume starts the next
[instance](../glossary.md#watcher-instance). To follow the session itself:

```bash
forge job attach J7   # replays, then follows; Ctrl-C leaves it running
```

**Cause:** a long tool call, a question, or a hang. After `QUIET_JOB_SWEEPS` [sweeps](../glossary.md#sweep) with no
output, the Overseer opens a `quiet-job` incident. It only asks; it stops nothing.

**Fix:** send a message first. With no reply, run one of the other two.

| When | Run | What happens |
| --- | --- | --- |
| First | `forge job message J7 -- "Report where you are and what blocks you."` | The session gets one more turn. |
| No reply, try again | `forge job fresh J7` | The job ends and a fresh agent takes the [worktree](../glossary.md#worktree). The next [attempt](../glossary.md#attempt) has a new job id, so `job stop J7` no longer applies. |
| No reply, stop it | `forge job stop J7` | The job ends and the ticket is held until `ticket unhold`. |

**Avoid:** never signal a Watcher or its agent yourself. See [What never to do](#what-never-to-do).

### Which control to reach for

Pick the control whose last column you are willing to do.

![Six controls by what ends, what happens to the ticket and what brings it back, least to undo first. job fresh ends one session now, holds nothing and needs nothing. oversee pause ends nothing and stops new work until oversee resume. oversee stop ends only the Overseer while sessions run on, until oversee --detach. job wind-down ends one session after it reports and holds the ticket until ticket unhold. job stop ends one session now and holds the ticket until ticket unhold. job stop --all ends every build, review and intake session, pauses the board and holds each ticket, until oversee resume and ticket unhold on each.](../figures/runbook/stop-controls.png)

*Notice that only `job fresh` needs no follow-up, and that `oversee stop` ends no agent at all.*

The costs the grid leaves out:

| Control | Cost |
| --- | --- |
| `job fresh` | The session's context. `REPLACED_JOBS_BEFORE_JOB_LOST` replacements in a row open `job-lost`, whose default parks. |
| `oversee pause` | Interrupted jobs still resume, and an Airlock already held finishes its merge. |
| `oversee stop` | No Pass runs, so finished sessions wait in their logs. `--now` also stops gates and installs. |
| `job wind-down` | A [wind-down](../glossary.md#wind-down) spends the session's remaining calls on reporting. A `wound-down` report opens `out-of-calls`. |
| `job stop` | Uncommitted work stays in the worktree; the session does not. An already held ticket keeps its hold. |
| `job stop --all` | Reaches build, review and product-owner jobs. It leaves the Assistant and Airlock agents alone. Add `--wind-down` for the softer form. |

> **Careful.** A `job stop` of a merge or [refresh](../glossary.md#refresh) job is not an Airlock abort; use the moves
> in [A merge is stuck](#a-merge-is-stuck), or `ticket park`.

### Out of calls

**You see:** a job ended `stopped` or `wound-down`, and an `out-of-calls` incident.

**Confirm:** `forge incidents`.

**Cause:** the session used its [call budget](../glossary.md#call-budget), got the wind-down message and ran past
`WIND_DOWN_GRACE_CALLS`, or reported `wound-down` itself.

**Fix:** usually nothing. The first `out-of-calls` incident on a ticket takes its default, a fresh agent. The second
parks the ticket. If it parks, the ticket is too large: split it, then run
`forge ticket abandon 003 --reason "Split into smaller tickets"`, or `ticket unhold` it to try once more.

**Avoid:** tickets a [builder](../glossary.md#builder) cannot finish within `BUILDER_API_CALL_BUDGET`; split them when
filing.

## A gate keeps failing

A red gate is cheap: the same session is resumed with the failure in hand. Only when its resumes
are spent does anything reach you.

### A red gate

**You see:** a job `interrupted` then running again, or a ticket held `parked:red-resumes-spent`.

```bash
cat .forge/jobs/J7/gate-failure.md     # the gate, command, commit, exit code, output excerpt
cat .forge/jobs/J7/gate.log            # the full red output of a gate
forge gate list
```

**Cause:** the code fails the gate, or the gate itself is flaky or depends on something the sandbox denies. A gate that
exits 0 and changes a tracked file also counts as red. A [Customs](../glossary.md#customs) refusal a session can repair
(no commit, a dirty worktree, stale gate claims) takes the same path: `gate-failure.md` then names the check, and no
`gate.log` is written. `RED_HANDOFF_RESUMES_BEFORE_PARKING` bounds the resumes.

**Fix:** while resumes remain, wait. Once parked, read `gate-failure.md`, correct what the gate needs (the ticket's
[Brief](../glossary.md#brief), or the gate with `gate add`, which replaces a gate of the same name in place), then start
a fresh attempt.

```bash
forge ticket unhold 003
```

**Avoid:** `gate remove` to get a ticket through. Gates are the only thing a [landing](../glossary.md#landing) proves.

### `cannot-run`

**You see:** a `gate-cannot-run` incident; the job ended `stopped`.

**Confirm:** `forge incidents`, then `forge gate list`.

**Cause:** the gate's process exited 126 or 127, or a signal killed it: a missing tool, a wrong path, or a Watcher lost
mid-gate. It says nothing about the code.

**Fix:** correct the command, then retry. Retrying alone repeats the failure. The first `gate-cannot-run` incident on a
ticket takes its default, `gate retry`. The second parks the ticket.

```bash
forge gate add <name> -- <corrected command>
forge gate retry J7
```

### `setup-failed`

**You see:** a `setup-failed` incident, the job ended `stopped`, or `jobs` printing a warning that it took its default
(the Bridge shows it in the incident line).

This block is a list: pick the line for the step that failed.

```bash
cat .forge/jobs/J7/worktree-failure.txt                       # git's error, when the worktree failed
cat .forge/jobs/J7/gate.log                                   # a gating prepare step's output
jq -r .line .forge/jobs/J7/install/events-1.ndjson | tail -n 40   # the install output
```

**Cause:** the worktree could not be created, the install line failed, or a gating [prepare
step](../glossary.md#prepare-step) failed. A reboot during an install ends the same way.

**Fix:** by what the file says. The first `setup-failed` incident on a ticket takes its default, `worktree-repair`, and
the next attempt launches. The second parks it `parked:setup-failed`: repair, then `ticket unhold`.

| What you find | Step |
| --- | --- |
| git names a stale or missing worktree registration | `forge worktree repair 003 --step prune` |
| `index.lock` exists | `forge worktree repair 003 --step unlock` |
| A half-finished dependency install, nothing wrong with the tree | `forge worktree repair 003 --step reinstall` |
| The worktree itself is damaged | `forge worktree repair 003 --step recreate` |
| The install command is wrong | `forge gate prepare <name> -- <command>`, then one of the above |

`recreate` saves changes to `<data>/jobs/<J>/recreate-<n>.patch` first and refuses when it cannot. `recreate` and
`unlock` are refused while any job names the ticket.

**Avoid:** deleting a worktree folder by hand. `recreate` keeps the patch.

## A parked ticket

A hold stops launches whatever its text says. Parking adds a decision, but answering that decision lifts nothing:
`ticket unhold` does.

**You see:** a `held:` line in `ticket show`, usually with a `parked` decision.

| The `held:` text | What happened | Do this first |
| --- | --- | --- |
| `parked:failed-passes` | `FAILED_PASSES_BEFORE_PARKING` [failed passes](../glossary.md#failed-pass) | `jq` the [log](../glossary.md#log) (see [Logs worth a line](#logs-worth-a-line)) for each `job-ended` cause. |
| `parked:red-resumes-spent` | [Red handoffs](../glossary.md#red-handoff) or sent-back reviews ran out | Read `gate-failure.md` or the newest `## Review` section. |
| `parked:job-lost` and other incident kinds | The incident defaulted or was parked | Read the incident's record in `log.jsonl`. |
| `parked:user` | `ticket park` | Your own reason is in the decision. |
| `parked:merge-gate-red` | A merge aborted: the merged tree stayed red after the agent's resumes | Fix what fails on the branch. |
| `parked:target-moved` | The target moved under the merge too often | Stop commits landing outside the Overseer. |
| `landing-refused:<reason>` | The landing refused the ticket's [Acceptance](../glossary.md#acceptance) | Fix the `## Acceptance` section. |
| `stopped by User (J<n>)`, `wound down by User (J<n>)` | You asked | Decide whether you still want it. |
| `awaiting answer (E<n>)` | Its job ended with a question open | Answer `E<n>`: that lifts the hold. |
| Any other text | `ticket hold` | Yours to read. |

**Fix:** remove the cause, then unhold.

```bash
forge decide E3 -- "Brief corrected, restarting"
forge ticket unhold 003
```

![ticket unhold only clears the hold, and what follows depends on where the ticket stands. pending: an ordinary candidate. in-progress: a fresh build attempt in the same worktree, with failed passes reset. in-review with a review phase: a new review and no builder. in-review with no review phase, or still queued: it queues to, or returns to, its Airlock. Each still has to pass the Not moving ladder.](../figures/runbook/unhold-outcomes.png)

*Notice that an `in-review` ticket gets no builder, so any fix must already be committed on the branch.*

While a job of the ticket is live, for example after a `ticket hold` set during a run, `ticket unhold` starts nothing.
A fresh build attempt works in the same worktree, uncommitted changes included. A builder sent back by review no longer
resumes its old session, so the ticket does not park again at once.

A Gantt row has its own pause, separate from the board's. If you paused the ticket's row by hand, `ticket unhold` prints
a `task start <row>` line: run it, because the Overseer never resumes a paused row.

**`ticket park` or `ticket hold`:**

| | `ticket hold 003 --reason "..."` | `ticket park 003 -- "..."` |
| --- | --- | --- |
| Hold | your text | `parked:user` |
| Decision | none | a `parked` decision carrying your reason, so it shows in `decisions` |
| Existing hold | refused `ticket-already-held` | replaced |
| Use it for | "not yet", a note to yourself | "someone must look at this" |

Neither stops a running agent. A hold set while a job runs takes effect at the next launch; use `job stop` to end it.

## Decisions

Answer every open decision, but know which answers act. Three kinds act on your answer. Every other answer only closes
the decision: that can lift a launch block the decision itself imposed, but the real work is the follow-up below.

**You see:** a count in the `jobs` footer, or entries in `decisions`.

```bash
forge decisions
```

| The decision has | Answer with |
| --- | --- |
| Lettered options | `forge decide E3 b` |
| No options, or you want free text | `forge decide E3 -- "Reverted it"` |

> **Careful.** Decisions the Overseer opens with no options refuse letters: `Question 1 of decision E3 has 0 options`.
> Answer those with `--` and text.

| Kind | What the answer does | What you do |
| --- | --- | --- |
| `agent-question` | Delivered to the session, or written under `## Questions` and lifts `awaiting answer` | Answer. |
| `pipeline-proposal` | Nothing: a retired kind, withdrawn at the next Pass | Set the pipeline up with `forge pipeline setup`. |
| `parked` | Closes it | `ticket unhold`, as in [A parked ticket](#a-parked-ticket). |
| `outage` | Closes it; closing is required but not enough | Follow [Outage](#outage). |
| `checks-not-set` | Closes it | Set the pipeline with `forge pipeline setup` and its Apply, which withdraws it; or with `gate add` or `gate none`, then answer. Answered with no pipeline, it opens again on the next Pass. |
| `merge-refused` | Closes it | Read its context, fix the branch. With a review phase a review relaunches regardless; `ticket hold` first if you want it to wait. Without one, the ticket queues again once answered. |
| `landing-refused` | Closes it | Fix `## Acceptance`, then `ticket unhold`. |
| `waiver` | Closes it, lifting the launch block | The review job stays `awaiting-answer` and keeps its launch slot. Run `forge job fresh J7` for another review. |
| `branch-touches-agent-config` | Closes it, lifting the launch block until another job on the ticket ends | Revert the `.claude/`, `.mcp.json` or hooks change on the ticket's branch first, or the next verification refuses it again. |
| `quiet-job` | Closes it | Follow [An agent looks stuck](#an-agent-looks-stuck). |
| `leftover-worktree` | Closes it | Inspect the folder its context names, remove it, then answer. A folder still there opens the decision again at the next Overseer start. |
| `forced-stop-refused` | Closes it, lifting the launch block on its tickets | End the processes its context names, then answer. |
| `api-key-not-set` | Nothing: a Pass withdraws it once the key is set | Set `ANTHROPIC_API_KEY` in the Overseer's environment and restart it. |
| `api-authentication-failed` | Closes it, lifting the hold on every launch, resume and Assistant boot | Fix the API key, then answer. |
| `budget-reached` | Closes it, lifting the launch block on its tickets, or on the Assistant's boot | Raise the budget, or accept the stop, then answer. |

## A merge is stuck

The merge queue is one line per target, and one job at a time holds its Airlock. `merges`
shows the holder and its phase, and the phase says who you wait for.

```bash
forge merges
forge incidents
forge oversee status
```

| Phase | Who you wait for | If it does not move |
| --- | --- | --- |
| `merge-in` | The Overseer's git step | A failure opens `merge-refused`. |
| `resolving` | The ticket's last worker, its newest ended builder or [reviewer](../glossary.md#reviewer), resumed as a [merge agent](../glossary.md#merge-agent) | Its budget ends it. `merge-refused` opens. |
| `re-reviewing` | A conflict re-reviewer of a resolution larger than the merge train's threshold | Its budget ends it, or a claim that does not hold refuses the merge: `merge-refused` opens. |
| `gating` | The merged-tree gate | Red resumes the merge agent, or parks `merge-gate-red` once its resumes are spent. A gate that cannot run opens `gate-cannot-run`: correct the gate, then `forge gate retry J7`. A failed prepare step opens `setup-failed`, where `gate retry` does nothing: correct the step and wait for its default to gate the tree again. A second default parks the ticket. |
| `fixing` | The same merge agent, resumed with the red handoff | Red past its resumes aborts and parks. |
| `landing` | The compare-and-swap | See the table below. |

A merge agent cannot ask you: it resolves or reports `cannot-resolve`, which opens `merge-refused`. To stop a merge,
run `forge ticket park 003`; the Airlock aborts the merge on the next Pass.

| You see | Cause | Fix |
| --- | --- | --- |
| `notice: landings on main wait: the main checkout is on ...` or `...changes to <files> block the fast-forward` (`dirty-main-checkout`) | Your main checkout is off the [main line](../glossary.md#main-line), or the fast-forward would overwrite files. Builds and reviews launch on; landings do not. | `git switch main`, and commit or stash tracked changes. The notice clears on the next Pass only when no tracked change remains at all, even an unrelated one. |
| A ticket requeues repeatedly, then `parked:target-moved` | The main line moved outside the Overseer (`target-moved`). It requeues silently until `TARGET_MOVED_MERGES_BEFORE_PARKING`. | Stop direct commits on the main line, then run `forge ticket unhold 003`. |
| `merge-refused` decision | A merge agent gave up, a group refresh conflicted, or a release is behind its group. | See [Decisions](#decisions). |
| `landing-refused:<reason>`, `landing-refused` decision | The Acceptance is unnumbered, unaccounted for, or waived only in review. | See [Decisions](#decisions). |
| Everything looks frozen during `gating` | The merged-tree gate runs inside the Pass, so no Pass runs meanwhile. | Wait for the gate. Replies and answers follow it. |
| A pause and nothing merges | A paused board opens no Airlock; one already held finishes. | `forge oversee resume` |

**Avoid:** working in the main checkout while tickets land. File a ticket instead, so the change lands through the
Overseer.

## Something died

Nearly everything here recovers without you, because a Pass rereads files.

| What died | What happens by itself | What you do |
| --- | --- | --- |
| An agent | Next Pass interrupts it `agent-crashed` and resumes the session, `JOB_RESUMES_BEFORE_FRESH` times, then replaces it. | Nothing, unless [Outage](#outage) fires. |
| A Watcher | Next Pass records why the Watcher was lost, kills any surviving agent group, and resumes as for an agent. | Nothing. |
| The Overseer | Watchers and agents run on. Nothing is lost. | `forge oversee --detach` |
| The machine | Every Watcher reads `lost`, cause `reboot`, which counts toward no bound. Sessions resume by id once an Overseer starts. | Start the Overseer, unless a login item does. |

![Three columns under a band labelled nobody drives. Keeps running: agents, whose permission prompts are still denied, and Watchers. Waits for the next start: Hatch requests, results and questions in the event logs, and your commands such as decide, job stop and ticket hold, recorded at once. Absent until then: the Pass, so no launch or landing, and the Bridge. oversee --detach starts the Overseer, which reads all that waited.](../figures/runbook/overseer-down.png)

*Notice that only the driving stops: your commands and [Hatch](../glossary.md#hatch) requests stand for the start.*

The [Bridge](../glossary.md#bridge) comes back with the Overseer. `forge open` starts one when none runs, and opens
the Bridge.

A login item is optional and restarts nothing after a crash, only at login. From the agent-progress
checkout, passing the tracked repository:

```bash
./setup.sh --login-overseer /path/to/repository
```

### Starting the Overseer is refused

| Refusal | Cause | Fix |
| --- | --- | --- |
| `overseer-already-running` | One is live; the message has its URL. | Use it, or run `forge oversee stop` first. |
| `overseer-contended` | Another start won the race. | `forge oversee status` |
| `overseer-port-in-use` | The derived range or your `--port` is taken. | `forge oversee --detach --port 0` |
| `overseer-did-not-start` | The detached process exited. | Run `forge oversee` in the foreground to see why; read `overseer.log`. |
| `overseer-identity-unreadable` | The process's start and boot could not be read from the sources the refusal names: `ps` and `sysctl` on macOS, `/proc` on Linux. | Check those sources work on this machine. |
| `watcher-bundle-failed` | `watcher.ts` did not bundle. | In the forge checkout, run `bun install`. |
| `baton-taken` | A newer Overseer took the [Baton](../glossary.md#baton) from this one while it ran. | Nothing: that one drives. |
| `install-version-mismatch` | Files of another install version. | [Update](#updating). |

`oversee stop` refused `overseer-still-live`: the process did not exit. Read its process id from `oversee status` and
`kill` it. An Overseer dying is an ordinary crash.

### Lock refusals

| Refusal | Cause | Fix |
| --- | --- | --- |
| `tracker-lock-held` | Another command held `<data>/.lock` past every retry. | Run the command again. If nothing else is running and it repeats, remove the path the message names. |
| `lock-taken-over` | This command held the lock past `LOCK_STALE_MILLISECONDS` and another took it over. | Run it again; the next holder finishes what was committed. |
| `malformed-hold-journal` | `<data>/hold-journal.json` cannot be read. | See [Stored file damage](#stored-file-damage). |
| `hold-journal-unremovable` | The write finished, but `<data>/hold-journal.json` could not be removed. | Close what holds it and run a command; that command finishes it. |

### Logs worth a line

This block is a list: pick one line.

```bash
tail -n 40 .forge/overseer.log                                # what the Overseer did and why a Pass failed
jq -c 'select(.ticketId == "003" or (.fields.ticketIds? // [] | index("003")))' .forge/log.jsonl | tail -n 20
jq -r 'select(.kind == "job-ended") | [.at, .jobId, .fields.outcome, .fields.cause] | @tsv' .forge/log.jsonl | tail
tail -n 1 .forge/jobs/J7/events-1.ndjson | jq -r .at          # the job's last sign of life
tail -n 20 .forge/jobs/J7/watcher-1.log                       # Watcher and child stderr
ls -t .forge/jobs/J7/watcher-*.log | head -n 1 | xargs tail -n 20   # the same, for a job that left jobs
jq -r 'select(.kind == "job-launched" and .fields.kind == "assistant") | .jobId' .forge/log.jsonl | tail -n 1   # the newest Assistant job
cat .forge/jobs/J7/gate.log                                   # red gate output
ls -t .forge/overseer/baton-pass-*.json | head -n 1 | xargs jq .   # the newest Baton pass, as both sides wrote it
```

`jobs` prints the Watcher instance of a live job. Each resume starts the next instance, so `-1` then goes stale; the
`ls -t` line finds the newest for any job.

## Usage limit, outage, no Assistant

These three stop or degrade work for a reason outside any ticket: wait out the first, clear the cause of the second, and
fix the boot failure of the third.

### Usage limit

**You see:** every board on the machine stops launching and resuming; a job that met the limit reads `interrupted`,
others run until they meet it.

**Confirm:** `jq . ~/.forge-monitor/usage-limit.json`, and compare `resetsAt` with the clock.

**Cause:** the vendor refused requests. The [usage marker](../glossary.md#usage-marker) is machine-wide, so one board's
limit holds them all, and open incidents default because no Assistant can come up.

**Fix:** wait. A timer wakes a Pass at the reset and sessions resume by id. The limit counts toward no bound.

> **As built.** The marker stays after its reset and stops delivery to a running Assistant.

### Outage

**You see:** an `outage` decision, and `paused` in `oversee status`.

**Cause:** `CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING` agents crashed on different tickets back to back. Suspect the
vendor, the network or this machine rather than the tickets. A crash on the same ticket restarts the count, and a
reboot is no crash.

**Fix:** list the crashed jobs with the `job-ended` line in [Logs worth a line](#logs-worth-a-line), and read each one's
newest Watcher log with the `ls -t` line there. Then do both of these. Answering alone leaves the board paused, and
resuming alone leaves the open decision holding launches and resumes.

```bash
forge decide E3 -- "Network back"
forge oversee resume
```

### No Assistant

**You see:** `jobs` lists no `assistant` job and prints `warning: incident I2 took its default`; the Bridge counts it in
the incident line above the header.

**Cause:** the Assistant failed to boot `FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING` times, or a usage limit is on. Every
incident has a default, so nothing hangs, but each takes the cautious path without judgement. To read why, find the
newest Assistant job and its newest Watcher log with the `job-launched` and `ls -t` lines in
[Logs worth a line](#logs-worth-a-line).

**Fix:** fix the boot failure, usually the vendor CLI or its login. The Overseer retries the boot by itself. Until then
make the moves yourself: `incidents` lists what each kind allows.

## Stored file damage

Damage is rare, because every store write is an atomic rename. There are no backups; these are the repairs.

**Stop first:** run `forge oversee stop` so no Pass reads a half-repaired file. A broken `progress.json`,
`log.jsonl` or `hold-journal.json` stops a Pass at its first read. A broken pipeline, ticket or
[epic](../glossary.md#epic) does not: Passes run on without it. Agents keep running meanwhile.

| File | What you see | Fix |
| --- | --- | --- |
| `progress.json` | `cannot be read: <reason>`, exit 2, from every command that reads it, `status` included | Open it, repair the field the reason names. This is the one case for editing it by hand. |
| `log.jsonl` | `The log cannot be read: <reason>`, exit 2. `decisions`, `incidents` and `oversee status` still read. | Find the line with the command below, then repair it, or delete it if it holds nothing you need. Every bound is counted from this file, so a deleted line can change a count. |
| A ticket | `ticket list` reports it malformed; it is skipped. | Repair the frontmatter in an editor. A file name and `id` that disagree, or a duplicate `id`, count as malformed. |
| An epic | `epic list` reports it; refused `unreadable-file-in-the-way` when in the way | Repair or delete `<data>/epics/<key>.md`. |
| `pipeline.json` | `gate` verbs refuse `malformed-pipeline`; the board reads no pipeline, so launches stop and `checks-not-set` opens | Repair it, or delete it and set gates again. Unknown keys are malformed. |
| `hold-journal.json` | `malformed-hold-journal`, exit 2, on every write; `status` warns | Repair it to finish the write, or remove it to leave that write unfinished. Then compare `progress.json` with the tickets. |

```bash
bun -e 'const lines = (await Bun.file(".forge/log.jsonl").text()).split("\n"); lines.forEach((line, i) => { if (line === "") return; try { JSON.parse(line); } catch { console.log(i + 1, line.slice(0, 120)); } });'
```

That line finds broken JSON only. A valid line of an unknown kind is refused too, and the refusal's reason names it.

## Updating

Update when `oversee status` says so, not on a schedule. Agents do not notice a successful update.

| You see | Meaning | Urgency |
| --- | --- | --- |
| `notice: new code: run ... update` | The code changed, the install did not. Nothing is held. | When convenient. |
| `notice: the install version changed, so launches are held` | State `held-by-install-change`. Launches and resumes wait, and the Bridge refuses controls. Until `update`, `job stop` and the other board commands are refused `install-version-mismatch`; `oversee stop` still works. | Soon: the board stands still. |
| A command refused `install-version-mismatch` | Installed files differ from the program. | Run `forge update` at once. |

```bash
forge update
forge oversee status
git status --short CLAUDE.md .gitignore   # commit what update changed here
```

`update` refreshes installed files and leaves the [tracker](../glossary.md#tracker) alone. Its last step hands a live
Overseer to the code on disk: it prints `Handing the Overseer at ...`, then `Overseer handed over to code ...`. The URL
stays and no Watcher is touched. Reload the Bridge. With no live Overseer the step is skipped. If `update` prints
`did not take the Baton pass`, run `forge oversee restart`, which stops and restarts that Overseer. If
`update` reports it removed the managed block, commit
`CLAUDE.md`: launches onto that target wait for it. A `.gitignore` change from `update` needs a commit too.

> **As built.** If the Bridge fails to load after that reload, the board still runs: keep working from commands.
> A stop in the Bridge is refused while held: run `update`, then `job stop`.
> A stop sent during a [Baton pass](../glossary.md#baton-pass) is dropped.

**A failed Baton pass:** `update` or `oversee restart` exits 1 with `baton-pass-failed`.
What `update` installed stands, and the old Overseer keeps driving with a `warning:` line in `oversee status`. Read the
step in that line and `overseer.log`, fix it, and run `forge oversee restart`. If the install version moved,
the old Overseer stays held until a Baton pass succeeds.

**The undriven exit:** if the incoming Overseer fails after the old one gave up its port, and the old one cannot bind
that port again, the old one exits and no Overseer drives the board. `overseer.log` ends
`This Overseer exits with no Overseer on the board.` Watchers run on. Start one:

```bash
forge oversee --detach
```

**`update` is refused `install-version-mismatch`, `from a newer forge`:** the board's installed files are
newer than the program. Update the program in the forge checkout with `git pull` and `bun install`, then run
`forge update` again in the tracked repository.

## Cleaning up by hand

The Overseer removes coordination files and never removes records of work: job folders, worktrees, branches and logs
grow until you delete them.

**Do it with no build or review job live.** Customs compares every ref against its launch
snapshot, so a branch you delete while a job runs can fail that job with `foreign-ref-moved`. Landed branches are
exempt; others are not.

```bash
forge oversee pause
forge jobs
```

Wait until `jobs` lists no build or review job.

A landed ticket keeps its worktree and branch. Remove them only once it is
`delivered`:

```bash
git worktree remove .forge-worktrees/ticket-003
git branch -d ticket-003
```

| Thing | Safe when | How |
| --- | --- | --- |
| `<data>/jobs/<J>/` | Its ticket is delivered or abandoned and the job has left `jobs`. Costs its transcript and `gate.log`. | `rm -rf` the folder |
| `<worktrees>/sessions/<J>/`, `<worktrees>/hatch/<J>/` | The job has left `jobs` | `rm -rf` the folder |
| `<data>/overseer/watcher-<codeVersion>.js` | Its name differs from the `in memory` code version `oversee status` prints, and `jobs` lists no build or review job | `rm` the file |
| `<data>/overseer/baton-pass-<n>.json` | No Baton pass runs | `rm` the file |
| `<data>/overseer.log` | Any time the Overseer is stopped | `: > .forge/overseer.log` |

Keep `git branch -d`, never `-D`: its refusal tells you the branch holds work the main line lacks. Finish with
`forge oversee resume`.

## A scratch board for trying things

Try a recipe on a throwaway repository, never on a live board. Use a temporary folder: a board there stays off this
machine's project list.

```bash
mkdir -p "$TMPDIR/scratch-board" && cd "$TMPDIR/scratch-board"
git init -b main && git commit --allow-empty -m "First commit"
forge init --project "Example Storefront" --no-hooks
git add .gitignore && git commit -m "Ignore the tracker"
forge gate none
forge ticket add "Double-click a role to edit it" --type ticket
forge ticket edit 001 --append --body "## Brief

Try a recipe on this ticket."
forge ticket ready 001
FORGE_FAKE_AGENT=1 forge oversee --detach
forge oversee resume
```

`ticket ready` refuses a ticket with no Brief, so the `ticket edit` line adds one. `FORGE_FAKE_AGENT=1`
launches a scripted agent that spends no subscription. It ends without a valid [report](../glossary.md#report), so
`ticket show 001` soon reads `parked:failed-passes`.

Only `FORGE_ROOT` points a command at it from elsewhere. `AGENT_PROGRESS_ROOT` is silently ignored, so the
command walks up from your current folder and can reach your real board.

```bash
FORGE_ROOT="$TMPDIR/scratch-board" forge status
```

Stop the scratch Overseer when you finish, from the scratch folder: `forge oversee stop`. Session Watchers
keep running; [Changing the code](../development/contributing.md) has the full teardown.

## What never to do

| Never | Why | Instead |
| --- | --- | --- |
| Edit `progress.json` by hand on a healthy board | Commands own it, and a command mid-write overwrites your edit. | Use a verb; `forge ticket status` covers moves the named verbs refuse. Damage is [the exception](#stored-file-damage). |
| Kill a Watcher or its agent | A lost Watcher counts as a crash toward the bounds. | `forge job stop J7` or `forge job fresh J7` |
| Delete a live job's folder | The Overseer reads the job through it, and it alone holds the launch file. | Wait until the job has left `jobs`. |
| Delete a Baton or Baton pass file of a live Overseer | The Baton is how everything finds the Overseer and proves there is one. | `forge oversee stop` |
| Run `clear` casually | It discards every row and the log, and each bound and count is read from that log. `clear --all` also deletes tickets and epics, and ticket ids restart. It does not check for a live Overseer. | `forge ticket abandon 003 --reason "No longer wanted"`, or a [scratch board](#a-scratch-board-for-trying-things). |
| Run `ticket deliver --by-hand` to force a landing | It marks the ticket delivered and logs it, but merges and lands nothing, and it is refused while an Overseer is live. | Fix the merge. It is for work landed outside the Overseer. |
| Commit directly to the main line while tickets land | Each landing is a compare-and-swap, and a moved target requeues, then parks. | File a ticket. |

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Launch order and holds | `src/lib/tracker-model/Playbook.ts` | `nextStepsOf` (`resumesAreHeld`, `newWorkIsHeld`), `candidateOf`, `ticketIsHeld`, `candidateOrder`, `freeSlotsOf` | `src/lib/tracker-model/Board.lifecycle.spec.ts` |
| Default paused state | `src/lib/tracker-model/constants/OverseerStates.ts` | `DEFAULT_OVERSEER_STATE` | `src/lib/tracker-model/constants/OverseerStates.spec.ts` |
| Stop controls | `src/lib/tracker-model/JobControls.ts` | `requestJobStop`, `stopAllJobs` | `src/services/control/JobControls.spec.ts` |
| What an unhold starts | `src/lib/tracker-model/Playbook.ts` | `candidateOf`, `mergeQueueStepsOf` | `src/lib/tracker-model/Board.lifecycle.spec.ts` |
| Quiet job count | `src/services/overseer/IncidentRouter.ts` | `createQuietJobWatch` | `src/services/overseer/IncidentRouter.spec.ts` |
| Decision answers | `src/services/control/DecisionControls.ts` | `answerDecision` | `cli/decisions/DecisionCommands.spec.ts` |
| Worktree repairs | `src/services/control/WorktreeRepair.ts` | `WorktreeRepair.repair` | `src/services/control/WorktreeRepair.spec.ts` |
| Held landing targets | `src/services/overseer/Airlocks.ts` | `recheckHeldTargets`, `settleMovedTarget` | `src/services/overseer/Airlocks.spec.ts` |
| Notices | `src/services/overseer/DrivePass.ts` | `OverseerNotice`, `noticesOf` | `cli/overseer/OverseerDrivePass.spec.ts` |
| Refusal wording | `src/adapters/utils/OperationRefusalWordingUtil.ts` | `messageOf` | `src/adapters/utils/OperationRefusalWordingUtil.boardRefusal.spec.ts` |
| Hand-over from `update` | `cli/adoption/update/UpdateCommand.ts` | `handTheLiveOverseerToTheCodeOnDisk` | `src/services/overseer/BatonPass.spec.ts` |
