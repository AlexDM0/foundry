# The Baton: one driver, and handing over

> **Question:** How is there at most one driver per board, and how does later code take over without touching an agent?
> **Time:** 18 minutes.
> **Read first:** [Overview](../concepts/overview.md), [Watchers](watchers.md).
> **Next:** [Failure and recovery](failure-and-recovery.md), [CLI and install](cli-and-install.md),
> [Runbook](../operations/runbook.md).

## In one screen

The [Baton](../glossary.md#baton) decides which [Overseer](../glossary.md#overseer) drives a
[board](../glossary.md#board). Each start exclusively creates `baton-<n>.json` in the `overseer` folder of
[`<data>`](../glossary.md#reading-names) and never rewrites it. That number is its
[generation](../glossary.md#generation): the next after the newest file, or 1. The newest one naming a live process is
the Overseer.

Every agent [session](../glossary.md#session) and every [job](../glossary.md#job) [gate](../glossary.md#gate) runs
under a detached [Watcher](../glossary.md#watcher), so an Overseer can stop, crash or be replaced while agents work. A
merge gate in the [Pass](../glossary.md#pass) is the exception ([Failure and recovery](failure-and-recovery.md)).

The [Baton pass](../glossary.md#baton-pass) replaces a running Overseer with the code on disk. A successor proves that
code first, holding neither the port nor a Baton; only then does the old Overseer stop its Passes and close its
listener, which this document calls letting go. If the successor fails before that, the old Overseer never stopped. If
it fails after, the old Overseer takes the board back.

Rare paths leave no Overseer, such as a port that cannot be bound again. That lasts until the next
`agent-progress-v2 oversee`, and Watchers keep running.

![Time runs down across the old Overseer, the baton-pass file, the successor and the Watchers. The old Overseer writes requested and spawns the successor; the successor proves the code and writes ready; the old Overseer lets go and writes released; from letting go until the successor holds generation n+1, shaded, nobody drives; the successor binds the port, takes generation n+1, regroups, runs its first forced Pass and writes serving; the old Overseer exits. Watchers run throughout and are not stopped.](../figures/baton/baton-pass.png)

*The proof sits above the shaded gap: the board is undriven only after the successor has shown it can read
`progress.json` and each job's Watcher files.*

## Generations: the newest wins

**At most one Overseer starts effects, because a Pass runs its effects only after a fence finds its generation newest,
and the exclusive create admits one claimant per number.** Nobody edits a Baton file. Only the holder of the newest
generation removes one: its own at `release`, lower ones after a claim.

![Six rows show the overseer folder over time. A crash leaves a dead baton-1; of two racing starters one takes baton-2 and the other is refused overseer-contended. A Baton pass takes the next number with acquireAbove beside a live holder and removes the lower file, and after a failed successor the old Overseer takes n+2, so the highest number decides, and it is the Overseer only while it names a live process.](../figures/baton/generations.png)

*The highest number decides, and a dead one lets the next starter in. A failed successor costs a number, and the
skipped number harms nothing.*

A clean stop removes the last file, so numbering restarts at 1; the number orders only the Overseers that overlap.

The record, `BatonRecord`, names who holds the generation and how to reach it.

<details>
<summary>The record's fields</summary>

| Field | Why it is there |
| --- | --- |
| `processId`, `processStartStamp`, `bootIdentity` | The full process identity. A reused pid or a reboot reads as dead. An Overseer of older code stored the start as the number `processStartEpochSeconds`, read as its decimal text. |
| `port`, `url` | Where the API listens. |
| `tokenFile` | The path of the API token. The Baton never holds the token. |
| `codeVersion`, `installVersion` | What this Overseer runs. `agent-progress-v2 update` compares them with the disk. |
| `watcherProtocolVersion` | The protocol this Overseer's Watchers speak. |

</details>

`newestBatonOf` reads only the highest number and answers `none`, `live` or `dead`. An unreadable newest file reads as
dead, because it was created whole and only damage makes it unreadable.

| Operation | Who calls it | What it does |
| --- | --- | --- |
| `acquire` | An ordinary start; a successor after `predecessor-gone` | Refuses `already-running` beside a live newest. Otherwise creates newest + 1. |
| `acquireAbove(floor)` | A Baton pass only | Creates floor + 1 while the old holder is still alive. Answers `contended` if anything above the floor exists. |
| `requireNewestGeneration` | Each fence point below | Throws `baton-taken` once a newer generation exists. |
| `release` | The holder's last act at a stop | Unlinks its own generation, unless a newer one exists. |

These are verdicts; a start prints them as `overseer-already-running` and `overseer-contended`.

Both claims end the same way: exclusive create, a check that nothing newer appeared, then removal of every lower
generation. Losing either step answers `contended`. This is why two starters after a reboot both judge the old Baton
dead and exactly one drives.

**An Overseer can be overtaken while alive.** A damaged Baton file or an identity misread makes a live Overseer look
dead, and the next starter takes the next generation. Baton fences then stop the older process. A Baton fence compares
generations; it is not the [tracker](../glossary.md#tracker) lock's [fence](../glossary.md#fence).

![One Pass of an older generation found overtaken at its fence, time running right. Its main lock hold commits, the fence finds a newer Baton file, and the Overseer ends baton-taken with exit 2 and runs no effect. The newer generation's Pass reads the board, that commit included, and derives and runs the effects.](../figures/baton/overtaken-overseer-strip.png)

*The commit gets through; the effects do not, and whoever runs next derives them from that commit.*

| Fence point | Reached | Effect on an overtaken Overseer |
| --- | --- | --- |
| After the main tracker write (the [lock hold](../glossary.md#lock-hold)), before effects | Each Pass (`runOnePass`) | The Pass stops; no effect runs; the Overseer ends `baton-taken`. |
| Inside the mutation of each Airlock lock hold | Each [Airlock](../glossary.md#airlock) hold | The lock hold refuses before it changes anything. |
| `fs.watch` on the overseer folder | Any change there (`overseerLifetime`) | Ends `baton-taken`: an idle one at once, a busy one when its running Pass finishes. |

> **Careful.** The fences narrow the overlap and do not close it. The main lock hold has no fence at its start, so an
> overtaken Overseer can commit one last tracker write, and only the tracker lock serialises it. That commit is safe
> because effects are derived from the board by whoever runs next ([The Pass](the-pass.md)). An Overseer overtaken right
> after a Pass's fence finishes that effect batch alongside the newer generation, and API commands keep committing until
> its listener closes.

An overtaken Overseer exits 2 without calling `release`, writing nothing to the Baton folder. On its way out it still
acknowledges Watchers whose child already ended and closes its listener; those two steps write no stored state.

## Start: bind, then take the Baton

**The Baton is claimed only after the port is bound, because the record names the port and is never rewritten.** A
Baton written first would need editing, or would name a port its holder might fail to get. A starter that binds and
then loses the Baton stops its listener and refuses. Nothing else of it remains but, at most, a Baton file below the
newest, which the next claim removes. Which port it tries is [Watchers](watchers.md)' topic. Commands from here on
drop the `agent-progress-v2` program name.

![Three spans run left to right. Holding nothing, a start runs its checks, reads its identity and pins the bundle, and a failure is a refusal. Holding the port, the API answers while commands get 401 and the event stream 404, and a failed claim stops the listener and refuses. Holding port and Baton, it writes the token and the tracker and runs the forced Pass, and a failure stops everything and calls release.](../figures/baton/start-holdings.png)

*Each failure gives back the port and the Baton it holds, so the next start can claim.*

| Step | What happens | On failure |
| --- | --- | --- |
| 1 | `oversee` checks the [install version](../glossary.md#install-version), finds the workspace and chooses the port. | Refused, nothing started. |
| 2 | `runOverseerInTheForeground` creates the overseer folder and the owner-only folder `<monitor>/watchers/<trackerId>/`, checks for a live Overseer and reads its own identity. | `overseer-already-running`, or `overseer-identity-unreadable`. |
| 3 | It pins the Watcher bundle, `watcher-<codeVersion>.js`. | `watcher-bundle-failed`. |
| 4 | `OverseerServer.start` binds the port. The API answers, but commands get 401 and the event stream gets 404 `not-ready`. | `overseer-port-in-use`. |
| 5 | It takes the Baton. | Listener stops; `overseer-already-running` or `overseer-contended`. |
| 6 | It writes a **fresh token** to that owner-only folder, starts the stop signals and the Baton watch. | From here any throw stops everything and calls `release`. |
| 7 | One tracker write records `overseer-started`. On a board's first start `Board.submitFirstRunLeftovers` runs in it too, moving every unheld low `pending` ticket to `ready-for-review` ([Assistant and intake](assistant-and-intake.md)). | |
| 8 | It adds its entry to the [`<monitor>`](../glossary.md#reading-names) registry, writes the `progress.html` stub (a file that says where the live board is), logs and prints the URL. | |
| 9 | It creates the drive Pass (the object that runs each Pass) and the data folder watch, then calls `regroup`. | |

The token is fresh on every start, so a process that held the last Overseer's token holds nothing. Callers read it
from `tokenFile` per request.

**The start ends with a forced Pass.** `regroup` runs [Regrouping](../glossary.md#regrouping), then runs one Pass that
ignores the unchanged-[fingerprint](../glossary.md#fingerprint) shortcut, and awaits it. That Pass catches up on
everything that happened while the board had no driver, from each Watcher's stored [cursor](../glossary.md#cursor).

**`--detach` runs the same command in the background.** `OverseerRemote.startDetached` spawns it in its own process
group with its streams dropped, then polls `OVERSEER_READY_TRIES` (40) times, `OVERSEER_READY_INTERVAL_MILLISECONDS`
(250) apart, for a live Baton of that exact pid whose `/api/identity` answers. It prints the URL, or refuses
`overseer-did-not-start`. The Overseer writes `<data>/overseer.log` itself. The identity answers 503 `starting` until
the folder watch has started, and only then does the Overseer register its URL and write the page stub, so a command
run right after `--detach` never waits on that start.

The repository's setup script, `setup.sh --login-overseer <repository>`, writes a macOS login item running
`oversee --detach`, so the Overseer returns after a reboot.

> **As built.** The login item starts once per login: see
> [gap-login-item-no-keepalive](../reference/known-gaps.md#gap-login-item-no-keepalive).

## Stop: every path leaves the agents running

**A stop ends the Overseer and nothing an agent depends on.**

![oversee stop, the Bridge Stop button and a signal all enter one chain: stop watching, wait for the running Pass and any landing, acknowledge ended Watchers, close the listener, record the stop, Baton gone. SIGKILL or a crash skips the chain and leaves a Baton that reads dead. Agent sessions and their Watchers keep running on every path. Process Watchers keep running too, unless --now stops them, with no grace, after the wait for the Pass.](../figures/baton/stop-paths-converge.png)

*Three ways in, one way through. The Baton goes last, so a start stays refused until the stop has finished writing.*

Recording the stop logs `overseer-stopped` with reason `stopped`, removes the Overseer's entry from the `<monitor>`
registry and writes the `progress.html` stub as down. The listener is still open during the wait for the Pass, so a
command applied before it closes can wake one more Pass. The paths differ only in how they arrive:

| Path | How it reaches the Overseer | Difference |
| --- | --- | --- |
| `oversee stop` | `overseer-stop` to the API with the token; if the API does not take it, SIGTERM to the pid the Baton names, identity checked, or a forced end where the port's `fallbackStopIsForced` holds. | Skips the install check, so an Overseer whose install changed can still be stopped. A forced end runs no listener, so once the Baton names a dead process the CLI records the stop, removes the registry entry, writes the stub and releases the Baton, and reports the forced end. |
| `oversee stop --now` | The same, with `now` set. | Also sends `stop` with no grace to live process Watchers (installs and gates). Over the fallback `now` is lost. |
| [Bridge](../glossary.md#bridge) Stop button | `overseer-stop` with `now` false. | Same as `oversee stop`. |
| SIGTERM, SIGINT, SIGHUP or, on Windows, SIGBREAK | The process's own signal listener. | Same as `oversee stop`. The listener stays subscribed, so a second signal joins the same stop. During a Baton pass a signal is logged and has no effect, except during the take-back rebind, when no listener is subscribed and the signal kills the process as a crash would. |
| SIGKILL or a crash | None. | No closing sequence. See the [crash matrix](failure-and-recovery.md#crash-matrix). |

> **As built.** A stop sent during a Baton pass is dropped, and the CLI can still print that it stopped: see
> [gap-stop-dropped-during-baton-pass](../reference/known-gaps.md#gap-stop-dropped-during-baton-pass).

The stopping CLI polls `OVERSEER_STOP_TRIES` (40) times, `OVERSEER_STOP_INTERVAL_MILLISECONDS` (250) apart, for the
Baton to go. If a long [landing](../glossary.md#landing) outlasts that, it refuses `overseer-still-live`, and the stop
carries on regardless.

What each thing does after a stop:

| Thing | After a stop |
| --- | --- |
| Agent sessions and their Watchers | Keep running, even under `--now`. |
| Process Watchers (installs, job gates) | Keep running; `--now` stops them. A [`legacy-watcher`](#compatibility-watchers-from-older-code-keep-running), one on an older protocol, is left alone by `--now`. |
| Questions, reports, events | Wait in files for the next Overseer's cursor. |
| Stored `overseerState` (paused or running) | Unchanged. |
| The Baton file | Removed. The next `oversee` starts cleanly, at generation 1. |

## Noticing an update: an install change stops launches, a code change only shows

**The Overseer notices that the disk changed and never restarts itself.** `InstallChangeWatch` learns the disk's
versions by running the on-disk binary's `version --json` as a child, at each [sweep](../glossary.md#sweep) and whenever
the [main line](../glossary.md#main-line)'s tip moves. It reads the manifest, `<data>/version.json`, on every look. A
binary that gives no answer changes nothing.

Two versions are compared; [CLI and install](cli-and-install.md) explains why both exist.

| What differs | Effect | User sees |
| --- | --- | --- |
| Install version on disk, or the manifest | Launches and resumes stop; `POST /api/commands` [answers 423](../reference/overseer-api.md#commands), except `overseer-stop` and `overseer-restart`. During a Baton pass the state reads `passing-baton` and the route no longer answers 423. | State `held-by-install-change` ([State machines](../data-model/state-machines.md)), [notice](../glossary.md#notice) `install-version-changed`. |
| [Code version](../glossary.md#code-version) alone | Nothing stops. | Notice `new-code`; the Bridge offers Restart. |

The code version is a content hash of the shipping files (`CodeVersion.onDisk`). A spec, a timestamp or a checkout's
path never changes it.

User or `update` then moves the board to that code. `update` writes the installed files and the manifest, then
ends with a Baton pass when the live Baton's code or install version differs from the disk. A failed Baton pass exits 1,
and what `update` installed stands. If the API does not take the command, `update` prints advice and exits 0; the live
Overseer stays on its code until `oversee restart`.

## The checked Baton pass

**The Baton pass is a conversation through one file, `<data>/overseer/baton-pass-<n>.json`, which both Overseers write
in turn.** It starts from `oversee restart`, from `update`, or from the Bridge's Restart button. `n` is the generation
being handed over. Each write replaces the file whole, so a reader sees one report or the one before it. The
[State explorer](../interactive/state-explorer.html#machine=baton-pass) walks its states, and
[Derived durations](../reference/deciders-and-bounds.md#derived-durations) turns its tries into time.

| Step | Old Overseer, generation n | Successor | Report | Who drives |
| --- | --- | --- | --- | --- |
| 1 | Takes `overseer-restart`, enters [`passing-baton`](../data-model/state-machines.md), and writes the report before it answers the command. | | `requested` | Old |
| 2 | Spawns `oversee --successor-of n --port <its port>`, detached, standard error appended to `overseer.log`. | Starts. | | Old |
| 3 | Keeps running Passes. Waits `BATON_PASS_READY_TRIES` (120). | Runs the proof below, holding no Baton and writing only its bundle. | | Old |
| 4 | | Writes the report. | `ready` | Old |
| 5 | Sees `ready` and lets go: stops its watches, lets a running Pass finish, starts no other, logs `overseer-stopped` reason `baton-passed`, closes the listener. Its Baton file stays. | Waits for `released`, up to `BATON_PASS_RELEASE_TRIES` (240). | | **Nobody** |
| 6 | Writes the report. Waits `BATON_PASS_RELEASE_TRIES` (240) for `serving`. | Sees it. | `released` | **Nobody** |
| 7 | | Binds the port, `acquireAbove(n)` takes n+1 and removes n, writes a fresh token, logs `overseer-started`. | | **Nobody** |
| 8 | | `regroup`: Regrouping, then the first forced Pass. | | Successor |
| 9 | | Writes the report after that Pass. | `serving` | Successor |
| 10 | Sees `serving`, logs and exits 0. | | | Successor |

All these tries are `BATON_PASS_READY_INTERVAL_MILLISECONDS` (250) apart.

### The proof: what the successor checks before it holds anything

`preparationSteps` runs these in order and stops at the first that throws:

| Step name | What it proves |
| --- | --- |
| `build-bundles` | The Watcher entry bundles. |
| `read-board` | `progress.json` reads into a Board. Tickets and the log are not read, so a fault there first shows at step `regroup`. |
| `read-jobs` | Every job has a readable [Watcher instance](../glossary.md#watcher-instance) and cursor. |
| `read-watcher-files` | Each job's current Watcher instance, if claimed, has a readable file in an event-log format this code reads, and its log is not malformed. Watchers in a job's subfolders are not checked. |
| `install-version` | The manifest matches this code's install version. |

> **As built.** The proof does not cover the Bridge, which builds on the first page request: see
> [gap-baton-pass-builds-no-bridge](../reference/known-gaps.md#gap-baton-pass-builds-no-bridge).

### The undriven gap: the port can have one holder

![Time runs right through the reports requested, ready, released and serving. The old Overseer drives until it lets go between ready and released, nobody drives until the successor has claimed, then the successor drives. The port and the API go first and return when the successor binds. The Baton file stays n, naming the live old process, until the successor claims n+1, so an ordinary oversee is refused overseer-already-running throughout.](../figures/baton/who-holds-what.png)

*The Baton row never goes free, and that is what refuses an ordinary start while nobody drives.*

The URL has to survive, so the old listener must close before the successor binds. Watchers run through the gap. Only
`acquireAbove`, reached through `released`, may claim beside the live old process.

### Outcomes: the old Overseer's verdict

The verdict is `BatonPassOutcome`. On every failure the old Overseer records the failure first and then writes the final
`failed` report, so whoever reads the outcome finds it already logged. It also keeps the failure in memory as
`batonPassWarning`.

| Outcome | Meaning | The old Overseer then |
| --- | --- | --- |
| `baton-passed` | The successor reported `serving`. | Exits 0. |
| `kept-driving` | The failure was seen before the old Overseer let go. | Starts its stop signals and Baton watch again, clears `passing-baton`, wakes a forced Pass. |
| `taken-back` | The failure came after it let go. | Waits for the successor to be gone, rebinds the same port, takes n+2, and serves as at a start. |

![The normal path runs requested, written by the old Overseer, then ready by the successor, released by the old Overseer and serving by the successor. successor-failed peels off before released, from a proof step or a release that came too late, and after released from a start-up failure. Both lead to failed, which the old Overseer writes after logging the failure. A dashed edge shows a late release overwriting a report from step await-release.](../figures/baton/report-file-states.png)

*`released` can overwrite a failure the old Overseer never saw, which is why that case surfaces as a dead successor.*

`predecessor-gone` is the successor's own verdict (`SuccessorAdmission`), reached when the old Overseer dies while it
waits. It then claims with `acquire`, as after a crash. The successor is then the only driver left, and its own report
is the file's last word; if it fails too, recovery is the next `oversee`.

> **Careful.** A first Pass that throws is logged and does not fail the Baton pass: the successor still reports
> `serving`. `serving` proves the successor started, not that its Pass works.

### What the callers do

Callers learn the outcome by polling the Baton pass file, so a failure reaches them only through that file.
`oversee restart` and `update` poll it, `BATON_PASS_OUTCOME_TRIES` (600) times, and print the outcome.

`restart` needs no live API. If the API does not take the command, it stops that Overseer and starts one detached on
the same port. If none is live, it starts one.

A second `overseer-restart` during a Baton pass is harmless. While the API is up the command is answered and ignored,
and its sender reads the running Baton pass's outcome. During the undriven gap the API is down, so the second
`oversee restart` takes the fallback and exits 1, `overseer-did-not-start` or `overseer-still-live`. The running Baton
pass is unaffected, unless the fallback's SIGTERM lands during the take-back rebind
([When a Baton pass fails](#when-a-baton-pass-fails)).

> **As built.** `--now` on `oversee restart` has no effect on a Baton pass: see
> [gap-restart-now-dropped](../reference/known-gaps.md#gap-restart-now-dropped).

### What a successful Baton pass changes

Only the process changes. Everything a client or a Watcher depends on carries over or is read again.

<details>
<summary>What each thing does through a successful Baton pass</summary>

| Thing | Result |
| --- | --- |
| Port and URL | Kept. |
| Generation | n+1. Event ids carry the generation, so a Bridge reconnect gets a whole `board`. |
| API token | Fresh. The Bridge fetches it again after a 401. |
| In-memory Pass state | Gone. Everything the Pass needs is re-derived from files. |
| `batonPassWarning` | `oversee status` and the Bridge show it for the life of that process. A later failure replaces it, and any process that replaces this one starts without it. |
| Watchers and agents | Not stopped or restarted. The old Overseer sends nothing; the successor's Regrouping says `hello` from the stored cursor. |
| `baton-pass-<n>.json` | Left in place. |

</details>

## When a Baton pass fails

**Most failures end with an Overseer on the board; the rows marked Nobody do not.** In the source's words, "Nothing lets
go before the new code has started" (`src/services/overseer/BatonPass.ts`). A failure seen before the old Overseer lets
go leaves it driving. Once it has let go, it is still alive and takes the board back. The
[Failure lab](../interactive/failure-lab.html#fail-a-baton-pass) lets each failure happen.

![A decision ladder. A successor not spawned, or with no ready report in time, ends kept-driving. An old Overseer gone while the successor waits ends predecessor-gone, and the successor is then the only driver left, so a failed start there leaves nobody driving. A successor serving in time ends baton-passed. Otherwise the old Overseer starts again on the port: success ends taken-back under n+2, and failure exits 1 with no Overseer returning.](../figures/baton/baton-pass-failures.png)

*Green hands the board to an Overseer. The red box is reachable only after the old Overseer has let go and the port
never came back.*

A failing successor names the step it reached. Steps are the proof steps, plus `spawn` and `report-ready` (seen by the
old Overseer), `await-release`, `bind-port`, `take-baton`, `regroup` and `serve`.

| Failure | Seen through | Result | Reported step | Driver after |
| --- | --- | --- | --- | --- |
| The successor cannot be spawned | `successor === null` | `kept-driving` | `spawn` | Old |
| The successor dies before any report, such as an unreadable board at start-up | Its identity is gone | `kept-driving` | `report-ready` | Old |
| A proof step throws | `successor-failed` | `kept-driving` | That step | Old |
| The successor stays silent past `BATON_PASS_READY_TRIES` | Tries run out; it is killed, identity checked | `kept-driving` | `report-ready` | Old |
| The old Overseer dies while the successor waits | `predecessorIsLive` is false | `predecessor-gone` | None | Successor, under `acquire`; if that start fails, **Nobody** |
| Letting go outlasts the successor's `BATON_PASS_RELEASE_TRIES`, as with a long landing | The successor gives up at step `await-release` and exits. The old Overseer's `released` then overwrites that report, so it sees only a dead successor | `taken-back` | `serve` | Old, n+2 |
| After `released`: bind, Baton or anything later in start-up fails, a held tracker lock included | `successor-failed`, `afterRelease` true | `taken-back` | `bind-port`, `take-baton` or `regroup` | Old, n+2 |
| The successor dies, or stays silent past `BATON_PASS_RELEASE_TRIES`, after `released` | Its identity is gone, or tries run out and it is killed | `taken-back` | `serve` | Old, n+2 |
| The rebind fails for `BATON_PASS_REBIND_TRIES` (40) tries | `rebindAfterTakeBack`, then `lostPortRefusal` | Exit 1, `baton-pass-failed` | `bind-port` | **Nobody**, unless an ordinary start claimed first |
| A stop signal during the take-back rebind | No listener is subscribed | Killed by the signal, as a crash | None | **Nobody**, with no record |
| The old Overseer's tracker write throws while it lets go, for example on a tracker lock it cannot take | `release` throws | Exit 2 | None | Successor, as `predecessor-gone` |
| The tracker write that records a failure throws | `recordFailure` throws | Exit 2, no `failed` report | None | **Nobody**, with no warning |

> **As built.** A signal during the take-back rebind ends the old Overseer: see
> [gap-signal-during-take-back-rebind](../reference/known-gaps.md#gap-signal-during-take-back-rebind).

**The port-lost exit is an ordinary crash in effect.** It logs `baton-pass-failed` naming the port and exits 1. Watchers
keep running. The Baton folder holds either a dead Baton or nothing, depending on how far the successor got, and the
next `oversee` takes the board. The registry and the `progress.html` stub still name the old URL, because this path
skips the closing sequence. Any failing start during the rebind counts here, not only a held port.

An ordinary `oversee` can win the board during a take-back: once a successor that took n+1 has failed, no live process
names the newest Baton. The rebind then overtakes that starter or loses to it.

> **Careful.** `oversee restart` reads `failed` as soon as `taken-back` is decided, before the rebind has finished, so
> its exit 1 can precede a port-lost exit. Only `oversee status` shows the end state
> ([Runbook](../operations/runbook.md)).

## Refusals

**Every refusal here but the three exit-2 states is one User can act on.** Exit 2 means a state the tool does not
repair. Every printed [refusal](../glossary.md#refusal) is listed in [Refusals](../reference/refusals.md).

| Refusal | Exit | Raised when |
| --- | --- | --- |
| `overseer-already-running` | 1 | A start finds a live newest Baton, or `acquire` does. |
| `overseer-contended` | 1 | A claim lost the exclusive create, or a newer generation appeared. |
| `overseer-port-in-use` | 1 | No candidate port was free, or a given port was taken. |
| `overseer-did-not-start` | 1 | A detached child exited or did not answer in time. |
| `overseer-still-live` | 1 | `oversee stop` saw the Baton stay live past its tries. |
| `baton-pass-failed` | 1 | A Baton pass did not end `baton-passed`, or the successor process gave up. |
| `baton-taken` | 2 | An Overseer's generation was overtaken. |
| `overseer-identity-unreadable` | 2 | The process's own start and boot cannot be read. |
| `watcher-bundle-failed` | 2 | The Watcher entry did not bundle. Inside a Baton pass this becomes step `build-bundles`. |

## Compatibility: Watchers from older code keep running

**A Baton pass never strands a Watcher, because Watchers run pinned code and speak through files.** Each Watcher runs
the bundle its Overseer pinned, so replacing the program changes nothing under it ([Watchers](watchers.md) shows the
bundle's life). The successor then reads Watchers on older bundles within these bounds:

| Case | What happens |
| --- | --- |
| Protocol within `WATCHER_PROTOCOL_OLDEST_SUPPORTED` (1) and `WATCHER_PROTOCOL_VERSION` (2) | Attached as usual, greeted in the version its record names. |
| Protocol below the window | A `legacy-watcher`: sent no frame and read from its files. A job stop reaches it as a signal to its recorded process group; `--now` does not. |
| A job's current Watcher instance on an event-log format this code cannot read | The proof step `read-watcher-files` fails, so the Baton pass ends before `released` and the old code keeps reading it. |

`LegacyWatcherReader` keeps one reader per event-log format a running Watcher may have written. At this commit
both protocol bounds and `EVENT_LOG_FORMAT_VERSION` (1) sit at 1, so neither of the last two rows occurs for a Watcher
this code pinned.

## Invariants

1. At most one process passes `requireNewestGeneration` for a board at any moment.
2. A Baton file is created whole and never rewritten.
3. Only the holder of the newest generation removes a Baton file: its own at `release`, lower ones after a claim.
4. A Baton names a port that was bound before the Baton existed.
5. The Overseer never restarts itself.
6. The hand-over itself asks nothing of a Watcher: the only contact is the successor's ordinary Regrouping and its
   Passes.
7. The old Overseer lets go only after the successor reported `ready`.
8. No stop path but `--now` touches a Watcher with a live child, and `--now` touches only process Watchers.
9. The successor holds no Baton and writes only its bundle and its reports until it reads `released` or finds its
   predecessor gone.
10. A failure the old Overseer handles is logged before its outcome is readable from the Baton pass file.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Generations | `src/services/overseer/Baton.ts` | `acquire`, `acquireAbove`, `newestBatonOf` | `src/services/overseer/Baton.spec.ts` |
| Fence | `src/services/overseer/Baton.ts`, `src/services/overseer/DrivePass.ts` | `requireNewestGeneration`, `runOnePass` | `cli/overseer/OverseerCommand.integration.spec.ts`, `src/services/overseer/CrashMatrix.spec.ts` |
| Start and serving | `cli/overseer/OverseerForeground.ts` | `runOverseerInTheForeground`, `startServing` | `cli/overseer/OverseerCommand.integration.spec.ts` |
| Stop and detach, from outside | `cli/overseer/OverseerRemote.ts` | `stopTheLiveOverseer`, `startDetached` | `cli/overseer/OverseerCommand.integration.spec.ts` |
| Process Watchers at a stop | `src/services/overseer/WatcherFleet.ts` | `stopLiveProcessWatchers`, `reapEndedWatchers` | `cli/overseer/OverseerCommand.integration.spec.ts` |
| Baton pass, old side | `src/services/overseer/BatonPass.ts` | `handOver`, `rebindAfterTakeBack` | `src/services/overseer/BatonPass.spec.ts` |
| Baton pass, successor side | `src/services/overseer/BatonPass.ts`, `cli/overseer/OverseerForeground.ts` | `prepareAndAwaitRelease`, `preparationSteps`, `startAsSuccessor` | `src/services/overseer/BatonPass.spec.ts` |
| Baton pass, the callers | `cli/overseer/OverseerRemote.ts`, `cli/adoption/update/UpdateCommand.ts` | `handOverTheLiveOverseer`, `handTheLiveOverseerToTheCodeOnDisk` | `cli/overseer/OverseerCommand.integration.spec.ts` |
| Watchers through a Baton pass | `src/services/overseer/CrashMatrix.integration.spec.ts` | `run restart mid-session or mid-gate` | The same |
| Update noticed | `src/services/overseer/InstallChangeWatch.ts` | `createInstallChangeWatch`, `versionsFromTheBinary` | `src/services/overseer/InstallChangeWatch.spec.ts` |
| Code version | `src/services/overseer/CodeVersion.ts` | `CodeVersion.onDisk` | `src/services/overseer/CodeVersion.spec.ts` |
| Watcher compatibility | `src/services/overseer/LegacyWatcherReader.ts`, `src/services/overseer/WatcherBundle.ts` | `attachmentOf`, `pinWatcherBundle` | `src/services/overseer/LegacyWatcherReader.spec.ts`, `src/services/overseer/WatcherBundle.integration.spec.ts` |
