# Hephaestus, Talos and Gaia: the forge core apart from its interface

Nothing here is built. Statements about today's code come from forge at `ddeb7707`.

## 1. The shape

Today one process, the Overseer, does two jobs: it runs the pipeline, and it serves the interface (the Bridge page, its
HTTP API, browser sessions, rendered HTML). This plan separates the two and renames the parts.

- **The forge** is Hephaestus and Talos, with the CLI as its command surface. It is headless, it has a version, it owns the
  data model and the stored formats, and it runs the whole flow alone.
  - **Hephaestus** is the Overseer, renamed, without the interface. One per board. It runs the pipeline and talks to the
    operating system and to Talos.
  - **Talos** takes the Watcher's place. One per board: the commander of every agent and every other child process of
    that board. It starts them, keeps their event logs and reports back.
- **Gaia** is the one interface server of a machine. It inventories the local forges, displays them and forwards the
  user's instructions. It facilitates the forges; no forge needs it.
- **One narrow path joins them:** the API that Hephaestus serves, with versioned reads and one command endpoint. Gaia
  never touches the store. It runs the forge's CLI only for what it runs today: starting, stopping and setting up a
  forge. Inside the forge, the CLI and Hephaestus meet in the store.

![Gaia sends commands to Hephaestus's API and reads documents and events from it, and runs the CLI to start, stop and
set up a forge. Inside the forge, the CLI writes commands to the store, Hephaestus watches the store and writes state,
and Hephaestus drives Talos, which commands every child process of the board.](figures/hephaestus-talos/layers.png)

The Bridge as a separate program goes away: its views become part of Gaia, in one design. The name Zeus is reserved for a future allocator
of tickets across the forges of a team; nothing of it is built.

## 2. Decisions

1. The Overseer becomes Hephaestus, without the interface. Talos takes the Watcher's place.
2. Hephaestus and Talos are the forge. They have no interface, they own the data models and the stored formats, they
   have a version, and they run the entire flow without Gaia.
3. Stored formats are versioned, as they are in agent-progress.
4. One Talos per board commands every agent of that board, in place of one Watcher per job instance. It is a separate
   process and outlives a Hephaestus restart. Hephaestus supports one Talos version.
5. Talos is lightweight: it starts agents with the context it is given, and it reports questions and state back.
6. Talos has a protocol version of its own, apart from its package version, bumped when Talos's interface changes. The
   handshake carries the version that Hephaestus requires. A Talos of another version quits and the right one starts.
7. Talos quits cleanly when it has to quit: it waits for each agent's turn to end, for at most 10 seconds of real time.
   Losing a few turns per agent in the worst case is acceptable.
8. Talos persists its state either way. An agent that it recorded as paused is resumed automatically.
9. Talos holds a supervision lease of one minute, measured in real time, which Hephaestus renews every 15 seconds. A
   Talos that Hephaestus has not contacted for one minute stops its agents.
10. The lease counts the time a machine spent asleep, but sleep alone stops no agent. After a wake, Talos waits one
    renewal interval for Hephaestus to make contact before it stops its agents, or two where the interval is shorter
    than five seconds. A sleeping laptop on which nothing crashed causes no interruption and no recovery.
11. The forge cannot ask the user anything by itself. A user question halts its ticket, is persisted so it survives a
    reboot, and is never decided by the forge. The forge follows a fixed, programmed workflow, and the user is a step
    in it. The forge keeps each question with its context, its choices and a recommendation, and Gaia shows it. The
    session that asked is parked and frees its slot; the answer resumes it.
12. The forge is robust against reboots: what the pipeline decides from is persisted, not held in memory.
13. Every start is a recovery, but recovery is not automatic: the forge makes its record truthful by itself and waits
    for an instruction before it starts interrupted work again.
14. A crash is a bug. It is fixed, not retried. A crash of Talos stops everything of its board. A crashed forge leaves
    a log complete enough to trace the crash back, Gaia alerts the user, and the forge stays off until the user starts
    it again.
15. A network error does not end an agent. The agent's own retry handles it; Talos has no retry of its own. When
    those retries run out, Talos recognises that the agent ended on a network outage and reports it, and Gaia shows
    it.
16. The forge uses ports and adapters for three things: the operating system (macOS first), the agent (Claude Code
    first) and storage (local files first; a database later).
17. A remote, shared setup for a team is not built. The design only keeps it possible.
18. There is one interface server, in Gaia. Gaia inventories, displays and forwards instructions. It shows local forges
    only; a read-only status view of remote forges may come later.
19. Gaia reads a local forge through a small, versioned read API and forwards instructions through the forge's command
    endpoint, kept beside it. Forge and Gaia stay released apart,
    meeting only through system versions, as the monorepo design has them.
20. A forge is self-contained. It sets its own number of agents and it comes back after a reboot by its own means. Gaia
    may start a forge as a facilitation, never as a responsibility. The machine-wide agent limit stays, and Gaia may
    offer a control for it.
21. Gaia warns when a forge goes down.
22. Outside Hephaestus, state changes through a command: a CLI verb, as with agent-progress, or the forge's command
    endpoint.
23. Intake and pipeline setup are sessions the forge hosts, and both can also be invoked as a skill in the user's own
    agent. They deliver files or call CLI commands.
24. The Assistant does not start by default. What it should own is decided later from accumulated data.
25. Flint's brain is left out of the core.
26. Eventually, all of the user's work is done through Gaia.
27. Gaia and the Bridge become one design and one interface, a unified whole. A single forge can be maximized, also in
    a browser tab of its own. Nothing is embedded by iframe.
28. `apps/forge` stays the home of the core, and the Bridge's code moves into Gaia.
29. The lease stops agents only: an install or gate line runs to its end. A gate runs for at most 15 minutes of real
    time and is then stopped.
30. An agent that crashed while the forge did not is resumed twice. After that its job waits for an instruction;
    nothing starts it again by itself.
31. Gaia shows the running and the newest version of Hephaestus and of Talos, and offers to restart each cleanly.
32. Nothing that exists has to be kept. Forge runs nowhere that matters yet, so stored names, stored formats and
    installed surfaces change outright, and existing boards are set up anew.
33. A new package is an architectural decision, taken before the work starts. A ticket names the packages it may
    create, and a running builder never introduces one.
34. No forge does this refactoring. Orchestrated Opus sessions in this repository do it, outside both trackers.

## 3. The forge

### 3.1 Hephaestus

One process per board, started by the user, by the forge's own login item, or by Gaia on request. It keeps what the
Overseer does today, minus everything that serves a client.

![Inside Hephaestus. Gaia reaches it through the API server; hosted agents reach it through the Hatch inbox,
which relays their CLI verbs. One control service applies every command. The pipeline loop runs one pass at a time and drives the
job lifecycle, the Airlocks, and presence and recovery. Below it are the operating system port, the agent port, the
store port and Talos.](figures/hephaestus-talos/hephaestus.png)

| Responsibility | Today's code (paths from `apps/forge/`) |
| --- | --- |
| Take in tickets from the store and judge readiness from state | `src/services/tracker/`, `src/lib/tracker-model/` |
| The pipeline loop: one serial pass at a time, following the Playbook inside one hold | `src/services/overseer/DrivePass.ts`, `src/lib/tracker-model/Playbook.ts` |
| Job lifecycle: worktree, install line, builder, Customs, gates, Handoff | `src/services/overseer/JobLaunch.ts`, `src/services/lifecycle/` |
| Airlocks: merge in, gate the merged tree, land by compare-and-swap; the constitution commit | `src/services/overseer/Airlocks.ts`, `ConstitutionCommits.ts` |
| Agent launch: the vendor adapter renders the launch plan and every input line | `src/lib/agent-launch/`, `src/lib/claude-code/`, `JobControlDelivery.ts`, `AnswerDelivery.ts` |
| Talos: start it at the required protocol version, reconnect to it at start, hand it launch plans, renew its lease | `WatcherFleet.ts`, `WatcherBundle.ts`, `Regrouping.ts`, all replaced |
| Machine-wide caps: agent slots, gate slots, the usage marker | `AgentSlots.ts`, `GateRunSlots.ts`, `MachineAgentLimit.ts`, `UsageLimits.ts` |
| Apply commands, from the store and from agents under a job (the Hatch, judged by the Bouncer) | `src/services/control/`, `HatchInbox.ts` |
| The Baton: one Hephaestus per board, and the checked pass to a successor | `Baton.ts`, `BatonPass.ts` |
| Confinement plans for sessions and for gate lines | `WorkerProfiles.ts`, `ProcessWatcherSandbox.ts`, `src/lib/gate-confinement/` |

Changed or new in Hephaestus:

- **Presence.** The Baton record already holds the process identity, its start stamp, the boot identity and the code
  version (`Baton.ts`). What is missing is a heartbeat, and a record that a stop or a Baton pass completed.
- **Recovery on instruction.** Today the Playbook resumes interrupted jobs by itself. This plan reverses that
  (section 7).
- **Lease renewal** to Talos, every 15 seconds (section 3.2).

The HTTP server shrinks to what Gaia needs (section 8): the reads (versions, identity and presence, the documents, the
event, job and gate-profile streams, job files and pictures) and the command endpoint, on the loopback address.
Versions, identity and the summary are open today; the rest sits behind the token. Leaving Hephaestus, for Gaia or for
nowhere: browser sessions and session codes, the Bridge bundle build, Markdown rendering to HTML, and Flint's brain.

### 3.2 Talos

One process per board, the commander of every child process of that board: the agents, and the install and gate
lines. It is detached and outlives a Hephaestus restart. It stays lightweight and knows no vendor: Hephaestus hands it
a launch plan, and Talos starts the child from it and reports back.

![Inside Talos. Hephaestus reaches it over one socket. A protocol part does the handshake at one protocol version and a
lease part counts one minute between renewals. A launcher, an input relay and a stopper act on the children. An output
reader writes each child's event log and a child record persists each child's identity and status. Its children are
agent sessions, gate lines and install lines.](figures/hephaestus-talos/talos.png)

| Responsibility | Today, in each Watcher (`src/lib/watcher/`) |
| --- | --- |
| Start each child from the launch plan it is given, in a process group of its own | One Watcher process per child (`Watcher.ts`, `WatcherLaunch.ts`) |
| Append every line a child writes to its standard output to that child's event log, synced to disk when a client asks for the durable entries and at the close | `events-<instance>.ndjson` |
| Report each child's state and an agent's question to Hephaestus | State frames; Hephaestus reads the question out of the event log |
| Pass input to an agent: a message, an answer, an interrupt | `write` frames |
| Answer the standing replies of a launch plan: it refuses every tool-permission request but the question tool | Launch file, rendered by `ClaudeCodeAdapter.ts` |
| Recognise the endings a launch plan names, first of all an ending on a network outage, and report them | Does not exist: the Overseer's stream mapper reads a budget stop, a rate limit and a refused key, and every other failed result is one generic failure |
| Stop a child's process tree and record its end | `Watcher.ts` |
| Persist its state: every child, its process identity and its status | A claim file per Watcher |

What changes against the Watcher:

- **One commander in place of a fleet.** Today each job instance has its own Watcher, started from a bundle pinned to
  its code version, and the Overseer keeps reading Watchers of older protocol versions through a legacy reader until
  they end. All of that goes. Hephaestus speaks to exactly one Talos, at exactly one protocol version.
- **A protocol version of its own,** bumped by hand when Talos's interface changes. The first frame of the
  handshake carries the version that Hephaestus requires, and that frame never changes shape, since it is how two
  versions learn that they differ. On a mismatch, in either direction, Talos quits cleanly, and Hephaestus, which has the
  current code, starts the right Talos. A downgrade is covered by the same rule. A change inside Talos that leaves its
  interface alone restarts nothing by itself: Gaia shows the running and the newest version, and the user restarts
  Talos cleanly from there (section 8).
- **A clean quit.** Talos asks each agent to stop at the end of its turn, waits at most 10 seconds of real
  time, and then stops what is still running. A line is stopped at once and run again later. The worst case is a few
  lost turns per agent.
- **Persisted state.** Talos records each child's status on disk whatever happens. An agent recorded as
  paused by a clean quit is resumed automatically through the new Talos, under the usual rules for slots and the usage
  limit. This is workflow: it is never counted as a crash and it waits for no instruction. The same record is what lets
  Hephaestus find and stop the orphans of a Talos that crashed.
- **A crash of Talos stops everything.** Every child of the board stops or is orphaned. Hephaestus stops
  the orphans from the record, marks their jobs interrupted, writes the crash log and stops: a bug, and the forge
  stays off.

**The supervision lease.** Today the Watcher has no check that an Overseer is alive, so an agent whose Overseer is gone
runs on with nobody routing its questions, watching its spend or noticing that it hangs. With the lease, a Talos that
has had no contact from Hephaestus for one minute stops its agents, with the clean quit above. Their jobs count as
interrupted and wait for an instruction; they are not paused. Talos itself stays, and waits for a Hephaestus. The
lease stops agents only: an install or gate line runs to its end, and a gate is stopped after 15 minutes of real time.

A naive lease makes a healthy forge stop its own agents. The lease is safe only with all of this:

- **A wake that is not an expiry.** The lease runs on the wall clock, so after a sleep it has lapsed on
  paper, for a Hephaestus that is alive as much as for one that is gone. Talos therefore never stops its agents on the
  first look after a gap in its own running. It gives Hephaestus one renewal interval to make contact, or two where
  the interval is shorter than five seconds. The interval is 15 seconds. A renewal arrives: nothing happens. None
  arrives: Hephaestus is gone, the sleep counted, and Talos stops its agents. Talos sees the gap by itself, as two of its
  own timer ticks that lie far apart, so a suspended process is covered the same way.
- **An end of its own.** Today a Watcher that is gone while its job runs with no result is recorded as `agent-crashed`
  or `watcher-lost`, and a session that exits cleanly with no report ends its job as failed. Two counted crashes
  (`agent-crashed`, `watcher-lost`) back to back on jobs of different tickets, with no verified ending between them,
  pause the board with an outage decision. A lease end and a clean quit each need an end reason and an interruption
  cause of their own that is not counted as a crash.
- **Renewal that the pass cannot starve.** Git runs synchronously with no timeout (`GitProcess.ts`), a worktree add and
  the landing fast-forward among it, so a timer on Hephaestus's event loop does not fire during them. Renewal runs
  outside the loop, or every synchronous step is bounded well below the lease.
- **Margin through a Baton pass.** The whole pass may take about 150 seconds (`BATON_PASS_OUTCOME_TRIES`), and after the
  release there is a wait of up to 60 seconds, the length of the lease, with no clear renewer. The successor renews from
  the moment it takes the Baton.
- **No vendor in Talos.** The request to stop at the end of a turn and the interrupt are a vendor's input lines, so they
  arrive in the launch plan like a standing reply. So do the patterns of the endings that Talos recognises.
- **What a stop leaves behind.** An agent stopped in the middle of a git command leaves an `index.lock` that only the
  worktree repair removes today. A resume after a stop has to clear it.

**Recognising an ending on a network outage.** Claude Code retries a failed call ten times by default and writes a
line for each retry. When the retries run out, its closing result line is marked as an error and carries, as fields,
that the cause was an API error and either that the host could not be reached or the status the server answered with
(a 5xx or a 529). The agent adapter renders these as patterns in the launch plan, and Talos matches them on the
fields of the child's own lines, never on free text, which a model can imitate. Talos reports the ending under a name
of its own, so the job is not counted as failed or crashed. Today's standing replies compare only texts and booleans,
so the patterns also need numbers and the count of retry lines.

### 3.3 Processes on a machine

![One Gaia per machine. Per board, one Hephaestus that serves its API on the loopback address, and one Talos that it
starts at the required protocol version. Talos commands every child: claude sessions and gate lines. Talos and its
children outlive a Hephaestus restart, and Talos stops its agents after one minute without contact from
Hephaestus.](figures/hephaestus-talos/processes.png)

- Hephaestus keeps one loopback port, for reads and commands. The bearer token and the Host and Origin guards stay.
  No browser reaches it: Gaia's server is the only client, so the browser sessions and the page's content security
  policy leave with the Bridge.
- Talos and its children outlive a Hephaestus restart, for up to the lease. They do not outlive a change of Talos's
  protocol version: that is a clean quit and an automatic resume.
- Not every child is under a Watcher today. The Overseer spawns merged-tree gates, gate-profile runs and pipeline checks
  itself, each in its own process group, and keeps the set of them in memory. They die or are orphaned with it. They go
  under Talos with every other child (section 7).
- Machine-wide state stays what it is today: files under the monitor folder with no process behind them (slots, the
  usage marker, the agent limit, the registry). Each forge enforces them on itself. Nothing of it moves into Gaia.

### 3.4 The CLI

The CLI is the command-line face of the forge's contract and stays a first-class surface, also when the user no longer
types it:

- the user, or a skill in the user's own agent, runs a verb and it writes through the store;
- an agent hosted under Talos runs the same verb, which relays through the Hatch and passes the Bouncer's role policy;
- machine setup (`init`, `update`, the login item, the machine limit) stays CLI, and Gaia forwards to it as it does today.

Rule: outside Hephaestus, state changes only through a command. No skill and no agent writes a record file itself. This
is close to today: the build and review prompts carry the ticket's text and forbid editing the ticket file, the product
owner files through verbs, and the `forge-po` skill forbids writing under the data folder with a file tool.

The CLI must also carry everything a forge needs with Gaia closed: showing that a forge is off after a crash, with its
crash log, starting it again and resuming interrupted work.

### 3.5 The agents a forge hosts

| Agent | In this plan |
| --- | --- |
| Builder, reviewer, merge agent | Pipeline jobs under Talos, as today |
| Intake (product owner) and pipeline setup (pipeline agent) | Each has one definition, a skill. The forge can host it under Talos, confined, on a command; the user can invoke the same skill in an agent of their own. Records leave it only through CLI commands; files are inputs to a command or repository files. Intake already works this way: its hosted session starts by invoking the product owner's skill. Pipeline setup has no skill today, only the prompts under `resources/prompts/` |
| Assistant | Stays in the code and does not start unless a board turns it on. This needs two changes: today a pass boots one whenever none is live and nothing holds it (`Playbook.ts`), and the `no-assistant` default fires only when no Assistant can come up (a usage limit, a failed authentication, a reached budget, repeated failed boots), not when one is switched off. Without a new trigger, incidents would sit open |
| Flint's brain | Left out of the new core. Its only transport is an HTTP endpoint that goes away, and its log records stay readable. Flint the sprite is interface and moves with the Bridge's views |

## 4. The store and the contract

The forge has one contract with three parts. It is shaped so that it can cross a network later:

- **Commands in.** File a ticket, answer a question, change the pipeline, stop the forge, resume a ticket. One service
  already applies 76 command kinds for the CLI, the Hatch and the HTTP endpoint alike (`src/services/control/`). Outside
  Hephaestus a command is a CLI verb or a call to the command endpoint; both reach that one service.
- **Documents out.** The board, a ticket, a job's progress, the forge's presence. Hephaestus assembles them and serves
  them over the read API, so derived state is built once, on the forge's side. This is what the Overseer does today for
  the Bridge.
- **A subscription** to changes: the event and job streams of the read API.

The store sits inside the forge, behind a port that the CLI and Hephaestus use in-process:

- **Local adapter**, built now: on files. It wraps today's tracker stores, the tracker lock and the single hold of
  `writeTracker`. It is the only code that names the path of a record.
- **Remote adapter**, not built: a client of a forge's API. The forge behind it owns the database; no client holds
  database credentials, and validation runs in one place.

One limit of this port: **Hephaestus's own pass is not made of commands.** It changes the board
directly inside one hold (`endJob`, `interruptJob`, `openIncident`) and runs git inside that hold. So the port has two
faces: commands for the CLI, and a board transaction for Hephaestus. A remote adapter cannot carry a hold that spans a
git fast-forward; the remote future needs that pass redesigned, which this plan does not do.

Because Hephaestus serves the documents, fields that exist only in its memory (notices, the runtime state, the quiet
counts) reach a reader, and no outside process reads the board's files. The Overseer's own reader of the board state
takes no lock today (`docs/reference/overseer-api.md`), so a served document can still show a change half written.

What stays outside the store, under the operating system port, because it is local by nature: worktrees and the agent's
working tree, Talos's launch files, sockets and event logs, slot files, and the vendor's configuration files. A reader
gets a job's live output from the read API's job stream, never by knowing where an event log is.

Consequences:

- **Hand-editing stored records ends.** It overturns today's local rule that tickets are hand-edited between runs.
- **Version.** The read API keeps the system versions and the compatibility registry it has today, so an endpoint can be
  served at two versions side by side. The stored formats keep their own versions inside the local adapter.
- **`packages/forge-contracts`** already holds 9 command kinds, the summary and monitor documents and the versions, and
  Gaia imports it. The board and ticket documents that the Bridge's views read are not in it; adding them is a change of
  the system version.
- **Gaia's commands stay under the system versions.** The command endpoint keeps what it has today: the token, and the
  refusal of commands while an install change holds launches. The contract package holds 9 of the 76 command kinds; the
  views need more of them there, which only adds and so raises the minor version.

## 5. Ports and adapters

![The forge core calls three ports. The operating system port has a macOS adapter first and Linux and Windows adapters
that exist today. The agent port has a Claude Code adapter first and other vendors later. The store port has a local
files adapter first and a remote adapter later. The first two ports exist in today's code; the store port does
not.](figures/hephaestus-talos/ports.png)

| Port | Today | Work in this plan |
| --- | --- | --- |
| Operating system | Exists. `platformPortsFor` builds one frozen record of ports with darwin, linux and win32 adapters; `src/PlatformBoundary.spec.ts` refuses a platform read or platform primitive outside the adapter files and an exact allowlist of named lines, the composition roots among them. Gate confinement is a port with Seatbelt, bubblewrap and a Windows adapter that confines nothing. Process identity already reads the boot identity on macOS, Linux and Windows | Carries over. "macOS first" means new work is proven on macOS first; the existing adapters and their contract specs are not dropped. Real-system recordings exist for macOS only |
| Agent | Mostly exists. `AgentAdapter` in `src/lib/agent-launch/` is the port, `src/lib/claude-code/` the one adapter | Close the leaks: `ClaudeTranscripts.ts` inside the Overseer's services, the install-time hook entry in a repository's `.claude/settings.local.json`, the `bash-domains` hook, and session confinement resting on the vendor's own sandbox. Retry policy is the adapter's: it sets what the vendor exposes. A skill becomes "an instruction bundle the adapter can load" |
| Store | Does not exist. Files are the most pervasive dependency in forge | New (section 4). Defined with a contract spec that any adapter must pass, the convention the platform adapters already use |

Building a port with one adapter goes against the conventions' rule that code is generalised on its second consumer.
For the store that is deliberate; it takes a row in the Deviations table when it is built.

## 6. The user in the workflow

The forge never decides a user's question. It records the question and moves on.

- **A question parks its job.** The forge keeps the question with its context, its choices and a recommendation, and
  Gaia shows it to the user. The session holds no slot, the ticket shows that it waits for the user, and the other
  tickets continue. An answer, written as a command from Gaia or the CLI, resumes the session.
- **Two scopes of halt, both persisted.** A question, a conflict or a review outcome halts one ticket. A refused API key,
  a reached budget or an install mismatch halts the board, as today.
- **Planned waits are not halts.** A usage limit that resets at a known time, a free slot, an answered question: the
  workflow continues by itself when the condition clears.

## 7. Interruption and recovery

![How a start is classified. A stop or a handover completed on record means it ended on purpose. A different boot
session means the machine went down. The same boot session with neither on record means the forge crashed. In the first
two cases the interrupted tickets wait for an instruction; after a crash the forge stays off until the user starts it again, and the
crash log is kept.](figures/hephaestus-talos/recovery.png)

**Where the code stands.** Much of this exists, and it is automatic today:

- `interrupted` is a job state with eight causes, among them `watcher-lost`, `agent-crashed`, `reboot`, `usage-limit`,
  `answer-delivery` and `handoff-red`.
- At start, Regrouping contacts every live Watcher, stops the orphans of a dead one, and records a foreign boot as the
  cause `reboot`. The boot identity (`kern.bootsessionuuid` on macOS, `boot_id` on Linux) is already stored in the Baton,
  the Watcher record and the slot files.
- The Playbook then resumes by itself: a crash up to `JOB_RESUMES_BEFORE_FRESH` times, a reboot, an answer delivery or a
  usage limit whatever the count. A real-system spec covers the crash, reboot and update matrix
  (`CrashMatrix.integration.spec.ts`).

So recovery on instruction, and no retry after a crash, fill no gap. They reverse tested behaviour, in every project
that runs forge. Since nothing that exists has to be kept, the change is made outright.

**Every start is a recovery.** There is no special shutdown path to trust: a stop is treated as if the power went out,
and a start reads the store and continues from it.

**Recovery has two halves.**

- *Reconcile, automatic.* Hephaestus makes the record truthful: a job with no live Talos is marked interrupted, a landing
  that did complete is recorded, dead slots are released, orphaned process groups are stopped. It starts no work.
- *Resume, on instruction.* Resuming a session, running a gate line again or retrying a merge waits for the user: one
  instruction for a ticket, or one for everything interrupted. `job-lost` and `resume-failed` exist as incident kinds
  today, with fresh and park among their moves.

**Which interruptions wait for an instruction** has to be listed, because "interrupted" covers routine workflow too:

| Cause | Today | In this plan |
| --- | --- | --- |
| `answer-delivery`, `handoff-red`, `usage-limit` | Resumes by itself | Unchanged: these are steps of the workflow |
| Paused by a clean quit of Talos for a new protocol version | Does not exist | Resumes by itself: a step of the workflow |
| `reboot`, a stop on purpose, a lease end | Resumes by itself | Waits for an instruction |
| `agent-crashed`, `watcher-lost` (the agent's side died, the forge did not) | Resumes twice, then starts fresh | Resumes twice, then waits for an instruction |
| `authentication-failed`, `forced-stop-refused` | Does not resume by itself: a refused key opens a board decision that holds every launch, and a refused forced stop never resumes | Unchanged |
| The forge crashed: Hephaestus, or Talos | Resumes by itself | A bug: the forge stays off until the user starts it again |

**What kind of start it is** is recorded, because only one kind is a bug:

| Evidence at the start | Meaning | What follows |
| --- | --- | --- |
| A Baton pass completed on record | A handover, not a stop | Nothing is interrupted |
| A stop completed on record | Stopped on purpose | Interrupted tickets wait for an instruction |
| The boot session differs from the one in the Baton | The machine went down | Interrupted tickets wait for an instruction |
| Same boot session, neither on record | The forge crashed | A bug. The forge stayed off until this start, which the user made, and its interrupted tickets wait for an instruction. The crash log is kept (active jobs and their steps, the tail of the log, the uncaught error where there was one) |

Known misreadings of this table, not solved here: a crash followed by a reboot before the next start reads as "the
machine went down", which is the usual path on a laptop and hides the bug; a stop on record followed by a wedged process
that is killed reads as "on purpose" and hides a hang; a kill by the user or by the operating system for memory leaves the
forge off as a bug. Judging a crash by how stale the heartbeat is against the boot time narrows the first.

**What reconcile cannot see today.** Merged-tree gates, gate-profile runs and pipeline checks are children of the
Overseer itself. On disk they leave a gate slot that names the Overseer's process and counts as free once that process
is gone, and, for profile runs and pipeline checks, a board record and a worktree that the next start marks stopped and
removes without stopping the process. After a crash the next Hephaestus can gate a worktree again while the orphan
still runs. They move under Talos, whose persisted record names every child.

**Failure handling in one list.**

- *Network trouble:* the agent's own retry. When the retries run out, Talos reports an ending on a network outage,
  the job is not counted as failed or crashed, and Gaia shows it. What follows is open (section 12).
- *Usage limit, parked question, busy slot:* planned waits that end by themselves.
- *Machine down, or stopped on purpose:* reconciled; interrupted tickets wait.
- *Forge crash:* a bug, with a crash log, an alert in Gaia and at the CLI, and no retry: the forge stays off until
  the user starts it again.
- *Agent crash, the forge still up:* resumed twice, then it waits for an instruction.
- *Hephaestus silent for the lease:* Talos stops its agents, which then count as interrupted, not as crashed.
- *Talos at another protocol version:* a clean quit, the right Talos starts, and the paused agents resume by themselves.
- *Talos crash:* a bug, like a crash of Hephaestus. Everything of the board stops and the forge stays off.
- *A pass that fails,* for example because another process held the lock past its five seconds: retried at the next
  wake-up today. It is neither a crash nor an interruption and needs its own name.

Retrying an expected condition a counted number of times is workflow. Retrying after something that should never happen
hides it.

**What must be persisted** is known in part. Held only in memory today: the event replay buffer, the pass state and
fingerprint, the merge-forecast and main-line caches, the install-watch answer, the quiet-job counts, the Assistant's
quiet watch, the notices and the runtime state, and the in-process gate children. Whether every Airlock step is safe to
redo or detectable as done has not been traced.

## 8. Gaia

Gaia inventories, displays and forwards. The test for anything proposed for Gaia: does every forge still do its full job
with Gaia closed?

![Inside Gaia. A browser shows every forge in one window, or one forge maximized in a tab of its own. The interface
holds the inventory, the board views that came from the Bridge, conversations with hosted agents and warnings. Gaia's
server is the only client of a forge, with a forge client at one forge version, a registry reader and a CLI runner.
Below are each Hephaestus API, the registry file and the forge CLI.](figures/hephaestus-talos/gaia.png)

| Gaia does | How |
| --- | --- |
| Inventory the forges of this machine | The registry file, as today. A forge registers itself; Gaia identifies a project by its forge |
| Display a board, its progress and its agents' output | The read API of that forge's Hephaestus. The Bridge's views become Gaia's own, in one design, and keep reading what they read today |
| Show one forge maximized | The same views at full size, in the window or in a browser tab of its own. It is a route of Gaia, never an embedded page |
| Forward the user's instructions | Posts the command to that forge's command endpoint. Validation, role policy and effect are the forge's. The same command from a CLI verb does the same thing |
| Start or stop a forge, set the machine limit | Through the CLI, as today. A facilitation |
| Alert that a forge crashed or is down, and what is interrupted | Watches presence. It alerts and offers to start the forge; it never restarts one by itself |
| Show that an agent ended on a network outage | The job's ending, as Talos reported it, in the read API |
| Show the running and the newest version of Hephaestus and of Talos, and restart each cleanly | The versions come from the read API and the installed program. A clean restart of Hephaestus is a Baton pass; of Talos, a clean quit with automatic resume |

How Gaia reaches a forge today, in three ways. It runs the forge's CLI (`start`, `stop`, `init`, `update` and the
like), which stays. It embeds each Overseer's Bridge in an iframe, with session codes, the embed message channel and
the `frame-ancestors` record: all of that goes. And it calls the Overseer over HTTP: versions, identity and the summary
with no token, and with the token the monitor snapshot and stream, commands (which also start and stop Flint's brain)
and session codes. The reads and the command call stay, and the session codes go with the iframe.

What the API keeps, because the views use it today: the board state, the event stream, the job transcript and
gate-profile streams, job files (the report, the gate log), pictures and their upload, the summary and the monitor
snapshot, identity and versions, the command endpoint and the nudge. What it loses: the session routes, the page itself
and Flint's ask route. What needs a new home: `forge open` and the `progress.html` stub lose their target, because a
forge may not name Gaia (`src/ClientNames.spec.ts`).

What this path gives and costs:

- **Two programs, released apart.** Forge and Gaia stay released apart and meet through system versions; Gaia keeps
  supporting one forge version and testing against recorded answers of the forge's API.
- **A forge that is down can be neither displayed nor instructed from Gaia.** Gaia lists it from the registry, says that
  it is down and offers to start it. The CLI still writes to the store with no Hephaestus running.
- **A warning reaches only someone looking at Gaia.** With Gaia closed, a forge that is off after a crash would sit in
  silence, so the CLI shows it too (section 3.4).
- **Conversations with hosted agents need nothing new in the forge.** A message to an intake or a pipeline setup session
  is a command that exists (`job-message`), a picture goes up through the upload route that exists (for an intake
  session only, as today), and the agent's output is the job stream.

## 9. Kept possible, not built

For a team sharing one forge through a remote store, each member's forge would work the tickets allocated to it, in
full, and each member's Gaia would show their own forges. An allocator (Zeus) would decide the allocation. To keep that
possible, the design carries four small seams and nothing more:

1. The contract's outside face is made of commands, documents and a subscription, so a remote adapter is a client of an
   API.
2. A ticket can carry which forge runs it, defaulting to the one forge. Zeus is whoever writes that field.
3. Landing stays one step with a compare-and-swap contract. Forge's git code makes no fetch, pull or push call today,
   so landing is local; nothing else may assume a local main line.
4. A forge's own capacity is a fact it can publish.

Left out on purpose: claiming and leases between forges, a merge queue, identity and permissions, schema migration of a
shared store, relaying live agent output, offline work, and the redesign of Hephaestus's pass that a remote store needs
(section 4).

## 10. What is removed

- From Hephaestus: `BrowserSessions` and the session routes, the Bridge bundle build, the render service's HTML, the
  Flint brain files. The server, the command route, the event broker and the monitor stream stay.
- From the system: the Bridge as a program, and the embed machinery between Gaia and a Bridge (the iframe, session
  codes, the message channel, the `frame-ancestors` records).
- From practice: hand-editing a stored record.

## 11. Migration

![Ten stages in order, coloured by where the work lands. Across the repository: trace and decide, close the monorepo
migration, and the rename at the very end. In forge: Talos the commander, presence and recovery, the package
extraction, the store port, and shrinking the HTTP surface. In Gaia: the views, one at a time, and conversations
with hosted agents.](figures/hephaestus-talos/migration.png)

No forge does this work. Orchestrated Opus sessions in this repository do every stage, outside both trackers, so no
tracker's reach limits a stage and one change may span both apps and the packages. The owner takes the decisions of
stage 0. Each stage ends with `bun run verify` green at the root and a forge that works end to end on a scratch
board.

| Stage | What | Where | Size |
| --- | --- | --- | --- |
| 0. Trace and decide | Trace recovery from what exists (`CrashMatrix.integration.spec.ts`, `Regrouping.ts`, `JobResumption.ts`) and what an Airlock leaves half done. Record a real session that ends on an outage. The owner settles the items to decide of section 12, and names the packages that stage 4 creates | The repository | M |
| 1. Close the monorepo migration | Whatever `docs/monorepo/migration.md` still has open, so this work does not start on a moving base | The repository | S |
| 2. Talos, the commander | One Talos per board in place of the Watcher fleet: its protocol version and the handshake, the persisted state, the clean quit, the lease with an end of its own, and every child under it, the Overseer's own gate runs among them. The fleet, the pinned bundles and the legacy reader go. A gate is bounded at 15 minutes. The ending patterns and the ending on a network outage. No mixed fleet is supported: existing boards are set up anew | forge | L |
| 3. Presence and recovery | The heartbeat and the completed stop and handover on record; reconcile, then resume on instruction; the crash log and the forge that stays off; two resumes of a crashed agent and no more; the CLI path to see a crash, start again and resume | forge | L |
| 4. Extract the packages | The tracker model (about 110 files, imported by path from about 280 forge files) and the board documents become packages, since a package imports nothing from `apps/` and the views need them in Gaia. The import-direction guard and the Bridge's include list change with it. Which packages exist is settled in stage 0 | forge | XL |
| 5. Store port | The port's two faces and the local adapter with its contract spec, around today's stores, lock and hold. The CLI and Hephaestus go through it; nothing else names a record path | forge | M |
| 6. Gaia hosts the views | The Bridge is about 525 tracked files with 67 DOM specs, more code than the Overseer's services. Move it one view at a time into Gaia's own design, each shipped alone, reading the forge's API and sending commands to it through Gaia's server. The Bridge keeps running beside it until the last view has moved | Gaia | XL |
| 7. Conversations with hosted agents | Intake and pipeline setup in Gaia: the `job-message` command in, the job stream out, pictures through the upload route. A skill for pipeline setup, as intake has one | forge and Gaia | M |
| 8. Shrink the HTTP surface | Delete the sessions, the bundle build, the embed machinery and Flint's ask route; the reads and the command endpoint stay. Take the Assistant off by default with its new trigger; remove Flint's brain. A major change of the system version; Gaia records again | forge | M |
| 9. Rename | Overseer to Hephaestus in identifiers, wording, docs and every stored and installed name: about 835 tracked files in both apps, the contract package and the root's rules, in one commit; existing boards are set up anew. The Watcher's name goes with its code in stage 2: Talos is Talos from its first line | The repository | M |

**The rename takes the stored and installed names with it.** Nothing that exists has to be kept, so these change in
the same commit and existing boards are set up anew:

- on a board: `overseerState` in `progress.json`, `overseerOnly` in `pipeline.json`, the `overseer-*` and
  `watcher-lost` records of the log;
- on the machine: the registry's `overseer` key that Gaia reads, the login item's label, the `oversee` verb that the
  login item and a Baton pass's successor are started with, and the installed surface.

The Watcher's own files (its bundles, `watcher-<n>.json`, the socket folder) end with the Watcher in stage 2: Talos
writes its files under its own name from the start.

## 12. Open items and risks

### To decide

1. **What follows an ending on a network outage.** Talos recognises the ending and Gaia shows it. Open is what the
   forge does next: resume the session by itself once the vendor is reachable, which needs a probe on a real-time
   interval because an outage names no reset time, or wait for an instruction from the user.
2. **An install line has no bound.** A gate is bounded at 15 minutes; nothing bounds an install line.

### Risks

1. **The lease can stop a healthy forge's agents** unless every condition of section 3.2 holds. It is the riskiest
   single piece.
2. **The lease proves that Hephaestus is alive, not that it makes progress.** During a merged-tree gate, for up to its
   15 minutes, nothing is routed and the lease still renews, unless the pass hands the gate to Talos and carries on.
3. **Recovery on instruction reverses tested behaviour** and stalls where today's forge carries on. Which interruption
   causes wait is listed in section 7.
4. **The start classification misreads common cases** (section 7).
5. **A half-finished landing.** What an Airlock leaves half done has not been traced.
6. **A failed pass is not a crash.** A pass that fails on a held lock is retried today, and with the CLI, Hephaestus
   and agents all taking the lock that happens more often. It needs a name of its own.
7. **The store port has one adapter,** and its command face cannot carry Hephaestus's own pass.
8. **The contract package holds 9 of the 76 command kinds.** Each view that moves to Gaia brings the kinds it sends, so
   the contract grows with stage 6.
9. **Stages 4 and 6 are each far larger** than a rename suggests.
10. **A forge that is down shows nothing but its name** in Gaia and takes no instruction from it.
11. **The other platforms.** Linux and Windows adapters exist, with no real-system recordings.
12. **One Talos is one point of failure for a board.**
13. **The outage signal is only partly public.** No session that ended on an outage has been recorded; the signal
    is read from the schemas inside Claude Code 2.1.326. The field that says the host could not be reached is marked
    internal there and may change with a version. A plain timeout carries no typed kind and looks like any other
    failed result, and the result line alone does not prove that retries ran out. What Talos does not recognise goes
    down today's failure path.
