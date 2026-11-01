# Watchers

> **Question:** What runs as what process, how do they find each other, and how does the Overseer reach an agent?
> **Time:** 20 minutes.
> **Read first:** [Overview](../concepts/overview.md), [Glossary](../glossary.md).
> **Next:** [Baton](baton.md), [Failure and recovery](failure-and-recovery.md), [Control](control-and-hatch.md).

## In one screen

The [Overseer](../glossary.md#overseer) learns from files and acts through one-shot socket frames, and it never stays
attached. That one rule is why an Overseer can die, restart or be replaced while agents keep working.

A [Watcher](../glossary.md#watcher) is a small detached process that runs one child: an agent, or a build or review
job's install or [gate](../glossary.md#gate) command. It logs every line to a file in the [job](../glossary.md#job)
folder, records how the child ended, and does not know an Overseer exists.

A job can run several Watchers in turn; each is one [instance](../glossary.md#watcher-instance), and `<n>` is its
number. The Overseer writes each instance a launch file, `launch-<n>.json`: what to run, where, the socket path and the
secret. The Watcher writes its record, `watcher-<n>.json`: its identity, its child and how the child ended.

The Overseer learns what happened from the record and the [event log](../glossary.md#event-log), read past a stored
[cursor](../glossary.md#cursor). To act, it connects to the Watcher's socket, sends a frame (one JSON line) and hangs
up.

Every Watcher and child survives the Overseer because each is spawned detached. A Watcher reads as live only while its
process identity (pid, start time, boot) still matches, never by a clock. A running agent that asks for a permission is
denied at once by a [standing reply](../glossary.md#standing-reply), so it never hangs on a prompt. Only a question to
the User waits for the Overseer.

![The Overseer reads the event log past a cursor stored in progress.json, and the record; the Watcher appends and replaces them. The Overseer prepares the launch file, which the Watcher reads once, and records each send in a marker. It acts only by opening the socket for one frame, so no connection stays attached.](../figures/watchers/reads-files-writes-socket.png)

*Every arrow but the one-shot frame touches a file, so nothing is lost when either side is missing.*

## The process tree

Each Watcher and each child leads its own operating-system session and process group, so a signal or death at one level
does not reach the next. A signal to an agent reaches its recorded group and stops there: Claude Code starts a Bash tool
command as the leader of [a second group](../development/overseer-claude-probe.md#process-groups), which the signal
misses.

![A login item or shell starts the Overseer. The Overseer spawns an agent Watcher, whose agent starts Bash tool commands that lead a process group of their own; a process Watcher with an install or gate child; an Airlock or onboarder gate child with no Watcher; and during a Baton pass a successor Overseer. Each sits in an operating-system session and process group of its own. Every Watcher and its child outlive the Overseer; the gate child with no Watcher has its output pipe close and loses its result.](../figures/watchers/process-tree.png)

*Everything with a Watcher keeps running when the Overseer dies; the gate child with no Watcher loses its result.*

> **As built.** A Bash command outlives a session that died with its Watcher; see
> [gap-bash-group-survives-kill](../reference/known-gaps.md#gap-bash-group-survives-kill).

| Process | Spawned by | Detachment | Who may signal it | Survives Overseer death |
| --- | --- | --- | --- | --- |
| Overseer | A shell, `OverseerRemote.startDetached` or the old Overseer; see below the table | `detached: true`, except a foreground Overseer | The CLI and the old Overseer; see below the table | Not applicable |
| Watcher | `WatcherFleet.spawnWatcher` | `detached: true`, `unref`, stdin ignored, stdout and stderr to `watcher-<n>.log` | Nobody | Yes |
| Agent child | `superviseChild` in `src/lib/watcher/Watcher.ts` | `detached: true`, so its group id is its pid | Its Watcher, on `stop`. The Overseer, SIGKILL to the group of a lost Watcher's child (`settleLostWatcher` in [Regrouping](../glossary.md#regrouping)), SIGTERM to the child of a [`legacy-watcher`](#the-pinned-bundle-and-compatibility) | Yes |
| Install or gate child | `superviseChild` under a [process Watcher](#process-watchers) | The same | Its Watcher, on `stop`. Nobody else | Yes |
| [Airlock](../glossary.md#airlock) or [onboarder](../glossary.md#onboarder) gate child | The Overseer itself, through `GateRun.runGate`; no Watcher | `detached: true`, stdin ignored, stdout and stderr piped to the Overseer | Nobody | Its process does, until it ends or a write to its closed pipe stops it. Its result is held only in the Overseer and is lost |

<details>
<summary>Who starts and signals an Overseer</summary>

| Started by | Detachment |
| --- | --- |
| A shell running `agent-progress-v2 oversee` | None: it stays in the shell's session |
| `OverseerRemote.startDetached` for `agent-progress-v2 oversee --detach`, which the login item runs, and for `agent-progress-v2 oversee restart` when no Baton pass happens | `detached: true` |
| The old Overseer in a [Baton pass](../glossary.md#baton-pass) | `detached: true` |

The CLI signals an Overseer with SIGTERM to its pid, or ends it by force where the port's `fallbackStopIsForced` holds,
after an identity check. The old Overseer signals a successor's
group with SIGKILL, identity checked.

</details>

No code signals a Watcher, and a Watcher has no signal handler. It ends when its child ended and its end was
acknowledged. A reboot ends all of them; [Failure and recovery](failure-and-recovery.md) says what follows.

## How they find each other

Every link is a file or a derivation, so a restarted process needs no memory of the old one.

| Who needs whom | Through | Identity check |
| --- | --- | --- |
| CLI to Overseer | Newest [`<data>`](../glossary.md#reading-names)`/overseer/baton-<n>.json`, holding port, URL and token file path | Pid, start and boot equal the record, see [Baton](baton.md) |
| Overseer to agent Watcher | `<data>/jobs/<J>/watcher-<n>.json` for liveness, `launch-<n>.json` for socket and secret; `n` is `job.watcherInstance` on the [board](../glossary.md#board) | `sameProcess` on the record's `watcher` identity |
| Overseer to [process Watcher](#process-watchers) | The same files in `<data>/jobs/<J>/<folder>/`, instance 1 | The same |
| Any process to a Watcher's socket | `socketPath` in the launch file | `watcherSecret` in `hello` |
| Watcher to Overseer | Nothing | Not applicable |
| Agent to Overseer | The [Hatch](../glossary.md#hatch) folder `<worktrees>/hatch/<J>/`, named by `AGENT_PROGRESS_V2_HATCH_DIRECTORY`; see [Control and Hatch](control-and-hatch.md) | The folder decides the job |
| Any monitor tool to the Overseer | The machine-wide registry [`<monitor>`](../glossary.md#reading-names)`/projects.json`, a pointer only; see [On-disk atlas](../data-model/on-disk-atlas.md) | None |

<details>
<summary>Overseer port derivation</summary>

`OverseerPort.preferredPortOf` takes the first four bytes of `sha256(trackerId)`, the id of the
[tracker](../glossary.md#tracker), modulo
`OVERSEER_PORT_COUNT` (100), above `PRODUCT_NAMES.OVERSEER_PORT_FIRST` (4930), so a bookmarked URL survives a restart.
`bindFirstFree` moves upward past `EADDRINUSE` for `OVERSEER_PORT_COUNT` ports in all, then refuses with
`overseer-port-in-use`. An explicit `--port` binds exactly that port, and `0` lets the system choose.

</details>

**Socket path.** `watcherSocketPathOf` gives `<monitor>/watchers/<16 hex>.sock`, the hex being the start of
`sha256(trackerId, jobId, instance)`. One path per instance means a lingering ended Watcher never holds its
successor's. The folder is mode 0700. A process Watcher hashes `<J>/<folder>` in place of the job id.

![A ruler up to WATCHER_SOCKET_PATH_LIMIT_BYTES (104) holds the home folder, 27 bytes of monitor folder, 10 of /watchers/, 16 hex digits, 5 of .sock and one terminating zero. Only the home varies, so it may take 45 bytes. A 46-byte home overflows the limit and the launch file reads as unreadable.](../figures/watchers/socket-path-budget.png)

*The name is hashed to stay short, which leaves the home path as the only part that can overflow.*

macOS keeps `WATCHER_SOCKET_PATH_LIMIT_BYTES` (104) bytes for a socket path, and `watcherLaunchOf` refuses a path that
does not fit.

> **Careful.** With a home path of 46 bytes or more, the Watcher ends `launch-unreadable` before any child runs.

**Session id.** A [session](../glossary.md#session), the agent's conversation, is named by `claudeSessionIdOf`, which is
deterministic and never stored: `sha256(scope, jobId)` shaped as a UUID with `UUID_NAME_HASH_VERSION` (`'8'`), the scope
being the tracker's id. A fresh launch passes `--session-id`, a resume `--resume`. A resume therefore needs only the job
id that [owns the session](#job-instance-session-and-attempt).

## Process identity

A pid alone proves nothing, because pids are reused. `ProcessIdentity` is
`{processId, startStamp, bootIdentity}`. The stamp is decimal text that only its own reader compares, through
`startedBefore`: on macOS the epoch seconds of `ps -o lstart=` in UTC under the C locale, on Linux the start ticks of
`/proc/<pid>/stat`, read with no subprocess. The boot comes from Linux's `boot_id` or macOS's `kern.bootsessionuuid`.
`identityOf` returns `null` rather than guess, on Linux also for a dead process still in the table, and `sameProcess`
compares all three fields. A Watcher of protocol 1 still stores the number `startEpochSeconds`; its decimal text is the
stamp.

Signals go to the recorded group, so whatever a child runs inside that group dies with it. `signalProcessGroup` looks
for proof that the id no longer names the recorded group, and sends nothing when it finds any.

![If the leader runs, the group is signalled only when its identity matches, otherwise identity-mismatch. If the leader is gone, the group needs members, the recorded boot and a readable, non-empty member list with no member older than the leader; failing gives group-gone, group-recycled or refused. A group that shows no sign of reuse is signalled, which proves nothing about the id.](../figures/watchers/signal-process-group.png)

*A leaderless group is the awkward case: there is no process left to compare, so the members are judged by age.*

A group outlives its leader while members remain, and its id cannot be reused while it has members. Once it empties,
the id can return as an unrelated group. Every real member of the recorded group started at or after its leader, so a
member older than the leader proves the id was reused. That is why `signalLeaderlessGroup` reads member start times.

A group that passes the checks can still fail at the signal itself: `ESRCH` reads `group-gone`, any other error
`refused`.

> **Careful.** The age check proves reuse one way only: a reused group whose own leader has exited in the same boot has
> only members younger than the recorded leader, so it is signalled.

## Protocol 1

Protocol 1 is one JSON object per line on a Unix socket, numbered `WATCHER_PROTOCOL_VERSION` (2, which only renamed the
start in the Watcher's record to `startStamp`; the frames are those of 1). A client, any process
on the socket, starts with `hello`.

| Watcher kind | Acting frames accepted | Acknowledgement of its end |
| --- | --- | --- |
| `agent` | `write`, `close-input`, `stop` | `close-input` |
| `process` | `stop` | `stop` |

<details>
<summary>Every frame, and what is refused</summary>

| Sender | Frame | Fields | Effect |
| --- | --- | --- | --- |
| Client | `hello` | `protocolVersion`, `sinceSequence`, `watcherSecret` | Answered by `welcome` and `history` |
| Client | `write` | `line`, holding no newline | Written to the child's stdin |
| Client | `close-input` | None | Closes the child's stdin |
| Client | `stop` | `graceMilliseconds` | Runs the [stop sequence](#stopping-a-child) |
| Watcher | `welcome` | `protocolVersion`, `watcherCodeVersion`, `jobId`, `lastSequence`, `state` | Names what the client reached |
| Watcher | `history` | `entries` | Log entries past `sinceSequence` |
| Watcher | `message` | `entry` | One entry, broadcast |
| Watcher | `state` | `state`, optional `end` | Activity change, broadcast |
| Watcher | `refused` | `reason`: `protocol` or `secret` | The Watcher then ends that connection |

**Refusals.** A first line that is not a `hello`, or a wrong protocol, is refused `protocol`. A wrong secret is refused
`secret`, compared with `timingSafeEqual`. After `hello`, a line that is not a frame, a second `hello` or a kind this
Watcher does not accept is refused `protocol`. A refusal costs that connection only; the Watcher runs on.

</details>

**Secret.** `writeLaunchFiles` draws `WATCHER_SECRET_BYTES` (24) random bytes per launch. The launch file is the only
file holding them.

**History and broadcast order.** `serveConnection` writes `welcome`, then `history`, then joins the client to the
broadcast, all in one event-loop turn, so no entry falls between the history and the first `message`. Before answering,
the Watcher syncs its log to disk and reads it whole, so `history` holds only durable entries.

> **As built.** Every connection costs an fsync and a full read of the log, and each [Pass](../glossary.md#pass) reads
> it whole too; see [known gaps](../reference/known-gaps.md#gap-scaling-whole-log-and-bodies).

**Who is listening.** Nothing in production reads a broadcast. `WatcherFleet.sendFrames` writes `hello` with
`sinceSequence` at `Number.MAX_SAFE_INTEGER`, so its history is empty, plus its frames, and half-closes.
`Regrouping.helloHistoryOf` hangs up once `history` arrives. `message` and `state` therefore reach only the test client
`src/testing/WatcherProtocolClient.ts`. `agent-progress-v2 job attach` and the [Bridge](../glossary.md#bridge)
transcript read event logs and connect to nothing.

![After hello the Watcher syncs and reads its log, then in one event-loop turn sends welcome and history and joins the client to the broadcast. WatcherFleet.sendFrames sends its frames and half-closes without reading an answer. Regrouping.helloHistoryOf hangs up at history. Only the test client stays for message and state.](../figures/watchers/protocol-1-clients.png)

*The opening is shared; where a client hangs up decides what it ever sees.*

### Sending a frame once

`sendFrames` returning `true` means it connected, not that the Watcher applied anything. A Watcher that refused the
frame, or ended a moment before, still counts. It waits at most `WATCHER_FRAME_TIMEOUT_MILLISECONDS` (2000) and leaves a
Watcher that is gone or silent alone.

`sendFramesOnce` adds a [marker](../glossary.md#marker) file: skip if the marker exists or the Watcher is not `live`,
send, and write the marker only after `true`. First and resume messages, answer lines and control frames follow the
same pattern.

![The Overseer checks the marker and liveness, then sends hello and the frames in one write and hangs up. The Watcher checks the secret and acts, and the Overseer writes the marker only once the send connected. An Overseer dying anywhere from the frame to the marker sends it again after a restart.](../figures/watchers/one-shot-send.png)

*The shaded span is the at-least-once window: the frame has left and no marker says so yet.*

A send that never connected is retried on a later Pass while the Watcher is live. A frame the Watcher received repeats
only if the Overseer dies after the send and before the marker is written. This is the at-least-once window.

Stopping a [merge agent](../glossary.md#merge-agent), an [onboarder](../glossary.md#onboarder), a usage-limited job or
an ended [Assistant](../glossary.md#assistant) goes through bare `sendFrames`, with no marker. So do the
acknowledgements from `reapEndedWatchers` and the `--now` stops of process Watchers.

> **As built.** One stop in `AnswerDelivery.deliverOne` writes its marker first, on the false branch of
> `CONTROL_RESPONSE_DELIVERS_ANSWERS`, which production never takes; see
> [known gaps](../reference/known-gaps.md#gap-dead-code-and-unused-states).

Which frames are sent when belongs to [Control and Hatch](control-and-hatch.md), and the at-most-once table to
[Failure and recovery](failure-and-recovery.md).

## One Watcher's life

A Watcher claims first and reports last, and those two ends make the rest safe: a double spawn is harmless and `end`
means the log is complete. The [State explorer](../interactive/state-explorer.html#machine=watcher) walks the states.
`runWatcher` takes `<job folder> <instance>`; invalid arguments exit 1 with nothing claimed.

![A Watcher creates its record exclusively, reads its launch file, listens, spawns its child and records running. After the child exits it syncs the log, records the end, lingers and exits 0. A taken claim exits 0 with no spawn, and an unreadable launch file, an unbindable socket or a failed spawn each record ended with no child and exit 1.](../figures/watchers/watcher-lifecycle.png)

*Left: the record's `state`. The red exits on the right ended with no child; a taken claim exits 0 before anything
starts.*

1. **Claim.** `createFileAtomically` makes `watcher-<n>.json` as `claimed`, holding the Watcher's identity. If the file
   exists, it exits 0 without spawning, so exactly one of two racing Watchers runs the child.
2. **Launch file.** It reads `launch-<n>.json` once. Unreadable ends `launch-unreadable`, exit 1.
3. **Listen before child.** The socket is up before the child exists, so no client finds a child it cannot reach. A
   bind failure ends `socket-unbindable`, exit 1.
4. **Spawn.** `argv` runs with no shell, `environment` is the child's whole environment, stdin is piped for an agent
   and ignored for a process. The child's stderr goes to `watcher-<n>.log`. Failure ends `spawn-failed`, exit 1, with
   no linger.
5. **Record.** The record becomes `running`, with `childProcess` and `childProcessGroupId`.
6. **Read.** Each stdout line is appended to the log and broadcast, and may trigger a standing reply.
7. **EOF, then exit.** The loop ends at stdout's EOF and then awaits the child's exit. A descendant holding stdout
   keeps the Watcher `running`.
8. **Sync, then `end`.** `syncAndClose` makes the log durable, and only then does the record gain `end`, either
   `exited` or `signalled`. A reader that sees `end` can trust the log is complete.
9. **Linger.** The Watcher keeps its socket until the acknowledgement frame arrives, or until it has counted
   `WATCHER_LINGER_FRAMES` (5) client lines. It closes the socket, waits for any stop timers to finish, and exits 0.

The linger is a count, never a time, and `hello` counts because a line is counted before it is judged. With no Overseer
an ended Watcher waits indefinitely, holding only its socket. `reapEndedWatchers` acknowledges every ended Watcher on
each Pass and when the Overseer stops.

`activity` is a separate overlay kept in memory. A frame's `state` field carries it, not the record's `state`: `idle`,
`busy` once a line arrives, `idle` again on `close-input`, `stopping`, `ended`. It is a Watcher-level fact only; the
Overseer derives job state from events.

> **As built.** A Watcher that never claims after its spawn is not spawned again by the same Overseer; see
> [known gaps](../reference/known-gaps.md#gap-spawn-never-retried).

## Stopping a child

The first `stop` to reach a running child runs both timers to their end, so a group member that survives SIGTERM still
gets SIGKILL, provided the group's identity check passes.

![After a stop frame the Watcher closes stdin at once, signals the group with SIGTERM after one grace and SIGKILL after a second grace. In case 1 a child that ignores everything dies at SIGKILL. In case 2 a child exits on closed stdin; one member dies at SIGTERM and one that ignores it dies at SIGKILL. The Watcher stays through both timers and exits once its end is acknowledged.](../figures/watchers/stop-timeline.png)

*The timers keep running after the child ends; only the group's checked identity decides whether a signal goes.*

`stopChild` lists the child's tree, closes stdin, and schedules both signals through `stopTree`, which signals every
listed group, so a group with its leader gone takes the [leaderless route](#process-identity). Each stage lists the tree
again; after SIGKILL the Watcher repeats it until the listing is empty or its attempts run out. Nothing goes to a group
that is gone or recycled, or for a child whose identity could not be read. The Watcher exits only once both timers have
run and its end is acknowledged, whichever comes last. A second `stop` is ignored.

The Overseer's `stop` for a job carries a grace of `SESSION_STOP_GRACE_MILLISECONDS` (5000), so SIGKILL comes at twice
that. `agent-progress-v2 oversee stop --now` sends grace 0 to process Watchers, through `stopLiveProcessWatchers`; see
[CLI reference](../cli.md).

> **Careful.** A child exiting by itself gets no group signal, because `signalChildGroup` runs only under a `stop`.
> Members it left behind are not swept unless a `stop` reaches it during the linger: an agent's ended Watcher still runs
> a `stop`, over the groups its last listing reaches, because `close-input` can end the child before the `stop` behind
> it. A process Watcher's `stop` after the end is only its acknowledgement.

## Standing replies

A session never hangs on a permission prompt, because the Watcher denies it with no Overseer involved.

![Every stdout line is logged with origin agent first. A can_use_tool line then matches a rule, so the Watcher logs the reply with origin watcher and writes the denial to stdin, and the agent continues; the permission request and the reply are both logged. The question tool matches no rule, so nothing is written and the agent waits. Only then does the Overseer matter, reading the log on a later Pass.](../figures/watchers/standing-reply-loop.png)

*The upper loop closes inside the Watcher, so it works with no Overseer up; the log entry comes first in both.*

The launch file carries `standingReplies`, and `standingReplyFor` tests each stdout line against them: every
`whenAllEqual` dotted path must hold its value and no `whenNoneEqual` path may. The reply is logged with origin
`watcher` and written to stdin.

The Claude adapter installs one rule, `DENY_EVERY_PERMISSION_BUT_A_QUESTION`, which spares only the question tool. What
follows a question belongs to [Questions and incidents](questions-and-incidents.md).

A line that is not a JSON object, matches no rule, or lacks a string `request_id` its template needs is never answered.
A process Watcher has no rules and no stdin.

## The event log

`events-<n>.ndjson` is one instance's append-only record: one JSON object per line, `{sequence, origin, line, at}`, in
`EVENT_LOG_FORMAT_VERSION` (1). `sequence` counts from 1 per instance. `at` is recorded and shown, never read to decide.
The atlas lists [each record and log file](../data-model/on-disk-atlas.md#watcher-records-and-event-logs).

| Origin | Meaning | Written |
| --- | --- | --- |
| `agent` | A line from the child's stdout, for either Watcher kind | In `superviseChild` |
| `client` | An acting frame, as its raw JSON | In `actOnFrame`, before acting, unless the Watcher has ended |
| `watcher` | A standing reply | In `superviseChild` |

The log is appended in place, so power loss can cut its last line short, and a reader ignores text after the last
newline. A malformed terminated line makes the whole reading `malformed`: `eventsAfter` reports it, the Pass logs it and
the job's events wait.

## Liveness

`live` means this Watcher process provably still runs, and `lost` means that cannot be proved; neither speaks for the
agent. `WatcherFleet.livenessOf` gives one verdict per instance, checked in this order, from the record and the process
table alone.

| Condition | Verdict |
| --- | --- |
| No `watcher-<n>.json` | `unclaimed` |
| The record has `end` | `ended`, even if the process lingers |
| The record is unreadable, or its `watcher` identity is `null` | `lost`: an unreadable record died mid-claim, since an atomic file is never half-read; a null identity could not be read at claim, and the Watcher may be running |
| The identity equals a running process | `live` |
| Otherwise: dead, pid reused, another boot, or an identity unreadable at this check | `lost` |

> **Careful.** The Overseer acts on `lost` by killing an agent child's group. A hung agent under a live Watcher stays
> `live`; for a running build or review, only the [`quiet-job` incident](../glossary.md#incident) catches it, see
> [Questions and incidents](questions-and-incidents.md).

What follows a `lost` verdict belongs to [The lost cause](failure-and-recovery.md#the-lost-cause).

## Job, instance, session and attempt

Three of the four words nest: an [attempt](../glossary.md#attempt) holds jobs and a job holds Watcher instances. A
session is the exception, because it can run across jobs, and one attempt can hold two sessions.

An attempt is one try at a [ticket](../glossary.md#ticket), a job the Overseer's unit, an instance one process, and a
session the agent's conversation.

![For ticket 003, attempt 1 holds job J1 with Watcher instances 1 and 2 under one session, each with its own event log and cursor. Review job J2 sends the work back, and job J3 resumes J1's session with --resume on its own instance 1. A failed pass starts attempt 2, where job J4 opens a fresh session on the same worktree.](../figures/watchers/job-instance-session-attempt.png)

*J3 has its own job folder and starts at instance 1, yet continues J1's conversation. A
[failed pass](../glossary.md#failed-pass) ends attempt 1 here.*

| Word | Identity | Starts anew when | Stored as |
| --- | --- | --- | --- |
| [Attempt](../glossary.md#attempt) | `attempt` on a [build job](../glossary.md#build-job), from 1 | A fresh agent replaces a failed one, except a successor to a job replaced on a [red handoff](../glossary.md#red-handoff), which keeps the attempt with a fresh session | `Job.attempt` and the board log's records |
| [Job](../glossary.md#job) | `J<n>`, never reused | The Overseer launches work | `Job` on the board, its folder under `<data>/jobs/` |
| [Watcher instance](../glossary.md#watcher-instance) | `watcherInstance`, from 1 within a job | A job resumes: it moves to `running` from a processless state (`PROCESSLESS_JOB_STATES`: `interrupted`, `awaiting-answer`) (`Jobs.moveJob`, see [State machines](../data-model/state-machines.md)), or an ended job is reopened (`reopenEndedJob`). A first launch stays on instance 1 | `watcher-<n>.json` and friends |
| [Session](../glossary.md#session) | `claudeSessionIdOf(scope, ownerJobId)` | A job owns no earlier session | Derived, never stored |

`Job.attempt` is a build's attempt only: a review job stores its round there, and merge and refresh jobs their own
attempt count.

**Cursor keyed by instance.** `eventCursor` is `{instance, sequence}`, written in the [hold](../glossary.md#hold) that
applied the events. The Pass reads past `sequence` only while `instance` equals `watcherInstance`; otherwise it reads
the current instance from 0. Each instance has its own log, so a resume needs no cursor reset.

**A session can span jobs.** A [review round](../glossary.md#review-round) can send a finished build back. The next
build job of that attempt then resumes the builder's session instead of opening its own.
`JobResumption.sessionOwnerJobIdOf` walks the `job-launched` and `job-ended` records in the board's
[log](../glossary.md#log). If the newest ended build of this attempt ended `built`, it returns the job that owns that
build's session. `launchWatcher` then passes the owner's session id and `--resume`, on a later job's first instance.
[Session identity](roles-and-launch.md#session-identity) has the launch side.

A fresh attempt gets its own session on the same [worktree](../glossary.md#worktree), `ticket-<id>`. The same attempt
can also hold two sessions, when a successor keeps the attempt after a red handoff.

> **As built.** The board state's `sessionId` comes from the job's own id, so for a build carried on from a review the
> owner job's id gives the real session; see [known gaps](../reference/known-gaps.md#gap-board-state-session-id).

## The pinned bundle and compatibility

A running Watcher never changes under its agent. At its start an Overseer runs `WatcherBundle.pinWatcherBundle`, which
bundles `watcher.ts` into one file, `<data>/overseer/watcher-<codeVersion>.js`, or keeps the file if that
[code version](../glossary.md#code-version) already exists.

![An Overseer on code A pins watcher-A.js and spawns instance 1, which runs that file across a landing and past a Baton pass or restart to an Overseer on code B. The later Overseer reads the older Watcher through its record and event log. A resumed instance 2 starts from watcher-B.js, so one session can run two code versions.](../figures/watchers/pinned-bundles.png)

*Several code versions run at once, and the board's Overseer is only the newest of them.*

A [landing](../glossary.md#landing), a pull or a `bun install` therefore changes nothing a Watcher runs. Each instance
uses the bundle of the Overseer that spawned it.

`src/lib/watcher/WatcherBundleClosure.spec.ts` holds the bundle's reach: its import closure stays inside
`src/lib/watcher/` and the two packages `Watcher.ts` declares, `src/lib/atomic-file` and `src/lib/process-identity`. Its
shipped files name no product and no vendor. Everything product-specific arrives in the launch file.

Watchers can outlive Overseers of later code, so the Overseer keeps a narrow contract with any Watcher: its record and
its event log. `LegacyWatcherReader` decides whether frames may go to a Watcher.

| Watcher's protocol | `attachmentOf` | How the Overseer treats it |
| --- | --- | --- |
| At or above `WATCHER_PROTOCOL_OLDEST_SUPPORTED` (1) | `attached` | Frames as usual |
| Below it | `legacy-watcher` | Sent no frame and not reaped. Watched through its files. A `stop` becomes SIGTERM to its recorded child group, identity checked |

`WATCHER_PROTOCOL_VERSION` is 2 and `WATCHER_PROTOCOL_OLDEST_SUPPORTED` 1, so no Watcher reads as `legacy-watcher`. A
Watcher answers only the `hello` of its own protocol, so the Overseer greets each in the version its record names, and
`readWatcherLaunch` reads any launch file from the oldest supported protocol to the current one.

An unreadable record stays `attached`, because only a protocol the record names can make a Watcher `legacy-watcher`.
Each event log is read in the format its record names, through the `EVENT_LOG_READERS` table, and a Baton pass's
successor proves it reads every live job's format before it reports ready; see [Baton](baton.md).

> **As built.** Bundles, like job folders, are never deleted; see
> [known gaps](../reference/known-gaps.md#gap-nothing-is-ever-removed).

## Process Watchers

A build or review job's install and gates run under the same binary with `kind: 'process'`, so such a gate outlives the
Overseer too. `JobLaunch.spawnProcessWatcher` writes a launch with no standing replies, sandboxes the argv when the
sandbox is usable, see [Confinement](confinement.md), and uses instance 1 of a folder of its own.

Airlock and onboarder gate runs have no Watcher, record or event log. The Overseer spawns them itself through
`GateRun.runGate` and reads their output through pipes, so their result dies with it. See
[Customs and gates](customs-and-gates.md) for where each gate runs and
[Failure and recovery](failure-and-recovery.md) for what follows.

![One job folder in two columns by agent Watcher instance. Instance 1 has install, gate-prepare, gate-1 and gate-2. Instance 2, after a red handoff, has gate-prepare-2, gate-1-2 and gate-2-2, and no install. Every folder holds launch-1, watcher-1 and events-1, because a process Watcher is always instance 1 of its folder.](../figures/watchers/process-watcher-folders.png)

*The folder suffix is the agent's instance; the files inside are always instance 1. The
[on-disk atlas](../data-model/on-disk-atlas.md) has the paths.*

A folder runs once, because `spawnProcessWatcher` leaves any claimed instance alone, so a lost process Watcher is read
as a result and never spawned again.

| Lost while running | Read by | Result |
| --- | --- | --- |
| `install` | `setupProgressOf` | `install-failed` |
| `gate-prepare` | `stepVerdictOf` | `setup-failed` |
| `gate-<k>` | `stepVerdictOf` | Exit code `null`, so `cannot-run` |

The meaning of those results belongs to [Customs and gates](customs-and-gates.md).

> **As built.** A lost process Watcher's child is never signalled, because `settleLostWatcher` reaches only the job's
> agent Watcher; see [known gaps](../reference/known-gaps.md#gap-lost-process-child-runs-on).

> **As built.** A reboot during an install ends the job; see
> [known gaps](../reference/known-gaps.md#gap-reboot-mid-install-ends-job).

## Invariants

1. No code signals a Watcher.
2. No connection between an Overseer and a Watcher outlasts one exchange.
3. A Watcher instance runs at most one child, because its record is created exclusively.
4. A Watcher writes only its job folder, its socket and its child's stdin.
5. A Watcher's socket listens before its child exists.
6. A record's `end` is written only after the event log is synced and closed.
7. After a child ends, a Watcher exits on a frame or a line count, never a timeout. Its stop graces delay signals and
   decide nothing.
8. A signal goes to a process group only after `signalProcessGroup` has checked its identity.
9. A `stop` that was acted on runs both timers to their end before the Watcher exits, each signal going only if the
   group's identity check passes.
10. Only the launch file holds a Watcher's secret.
11. An event log entry is never rewritten, and sequences are unique within an instance.
12. A Watcher's process identity is never on the board; the board holds only `watcherInstance` and `eventCursor`.
13. Every instance has its own socket path, event log and record.

## In the code

<details>
<summary>Concepts, paths, symbols and specs</summary>

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Watcher lifecycle | `src/lib/watcher/Watcher.ts` | `runWatcher` | `src/lib/watcher/Watcher.spec.ts` |
| Protocol 1 | `src/lib/watcher/WatcherSocketServer.ts` | `listenOnWatcherSocket` | `src/lib/watcher/Watcher.protocol.spec.ts` |
| Frames | `src/lib/watcher/@types/WatcherFrame.ts` | `ClientFrame`, `WatcherFrame` | `src/lib/watcher/WatcherFrames.spec.ts` |
| Protocol constants | `src/lib/watcher/constants/WatcherProtocol.ts` | `WATCHER_LINGER_FRAMES` | `src/lib/watcher/Watcher.protocol.spec.ts` |
| Standing replies | `src/lib/watcher/StandingReplies.ts` | `standingReplyFor` | `src/lib/watcher/StandingReplies.spec.ts` |
| Event log | `src/lib/watcher/EventLog.ts` | `eventLogEntriesOf` | `src/lib/watcher/EventLog.spec.ts` |
| Launch file | `src/lib/watcher/WatcherLaunch.ts` | `watcherLaunchOf` | `src/lib/watcher/WatcherLaunch.spec.ts` |
| Socket path | `src/lib/watcher/WatcherSocketPath.ts` | `watcherSocketPathOf` | `src/lib/watcher/WatcherSocketPath.spec.ts` |
| Overseer's side, liveness, sends | `src/services/overseer/WatcherFleet.ts` | `livenessOf`, `sendFrames`, `sendFramesOnce` | `src/services/overseer/WatcherFleet.spec.ts` |
| Pinned bundle | `src/services/overseer/WatcherBundle.ts` | `pinWatcherBundle` | `src/services/overseer/WatcherBundle.spec.ts` |
| Bundle closure | `watcher.ts` | `runWatcher` call | `src/lib/watcher/WatcherBundleClosure.spec.ts` |
| Compatibility | `src/services/overseer/LegacyWatcherReader.ts` | `attachmentOf` | `src/services/overseer/LegacyWatcherReader.spec.ts` |
| Session across jobs | `src/services/overseer/JobResumption.ts` | `sessionOwnerJobIdOf` | `src/services/overseer/JobResumption.spec.ts` |
| Session id | `src/lib/claude-code/ClaudeCodeAdapter.ts` | `claudeSessionIdOf` | `src/lib/claude-code/ClaudeCodeAdapter.spec.ts` |
| Process identity | `src/lib/process-identity/ProcessIdentity.ts` | `signalProcessGroup` | `src/lib/process-identity/ProcessIdentity.spec.ts` |
| Port | `src/services/overseer/OverseerPort.ts` | `preferredPortOf`, `bindFirstFree` | `src/services/overseer/OverseerServer.spec.ts` |
| Process Watchers | `src/services/overseer/JobLaunch.ts` | `spawnProcessWatcher` | `cli/overseer/OverseerBuildJob.spec.ts` |
| Gates with no Watcher | `src/services/lifecycle/GateRun.ts` | `runGate` | `src/services/lifecycle/GateRun.spec.ts` |

</details>
