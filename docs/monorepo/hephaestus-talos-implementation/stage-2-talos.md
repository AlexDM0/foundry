# Stage 2: Talos, the commander

## Goal

Every child process of a board, agent sessions and install, gate and merge lines alike, the gates the Overseer runs
itself among them, runs under one Talos per board: a detached process inside `apps/forge` with a protocol version of
its own, a frozen first handshake frame, a persisted record per child, a clean quit within 10 seconds and a supervision
lease of one minute. The Overseer renews the lease every 15 seconds from its main loop and only while its passes make
progress, so a hung Overseer loses the lease within a minute and Talos stops its agents at the end of their turn; the
merged-tree gate runs beside the pass, so no landing holds a pass. Every install, prepare and gate line is stopped
after 15 minutes of awake time, and every line's run time is recorded in that measure and served in the pipeline
facts. An agent that ended on a network outage, a provider overload after its spent retries included, is recognised by
fields of its closing result line and served under a cause of its own in the monitor document Gaia reads. The Watcher
fleet, its pinned bundles and the legacy reader are gone from the repository. Nothing outside the agent port's adapter
starts the vendor's program, reads its transcripts or stream, writes its settings or hooks, or knows its endings, flags,
variables or file layout (the owner's rule of 2026-11-18), and a guard holds it.

## Depends on

- **Stage 0** must be finished. It supplies the recorded Claude Code session that ends on a network outage, committed
  as the fixture pair `src/lib/claude-code/testing/fixtures/network-outage-retries-spent.{stdout,stdin}.jsonl` with its
  claims block in `ClaudeStreamFixtures.spec.ts` (stage 0, WP0.4), which this stage holds its ending pattern against
  (WP2.2). The owner's answers are in `owner-answers.md` and the design's decisions 35 to 52; this stage waits on none
  of them.
- **Stage 1** must be finished, so the monorepo layout, the root `verify` and the gate scripts hold still.
- **Hands to stage 3** (presence and recovery): the child record with its end reasons `paused`, `lease-ended` and
  `time-bound`; the interruption causes `talos-paused`, `lease-ended` and `network-outage`, and the list
  `INTERRUPTION_CAUSES_HELD_FROM_RESUMING = ['network-outage', 'lease-ended']`, which stage 3 replaces with its resume
  policy table (both causes wait for an instruction there too); the orphan sweep after a lost Talos; the two places the
  Overseer finds its Talos lost (`ensureTalos` answering `previousTalos: 'lost'` at start and while serving, WP2.9 and
  WP2.13), which stage 3 turns into a crash of Talos; Talos's own record with its start number, protocol version and
  state; the lease renewal (`LeaseRenewal.ts`), a timer on the Overseer's main loop with no thread of its own, whose
  `onRenewed` hook is where stage 3 writes the heartbeat; `lineEndOf` in `JobLaunch.ts`. Stage 3 turns `reboot` into a
  cause that waits for an instruction, builds `resume` (one job, one ticket, everything, or everything that ended on a
  network outage) with the two automatic restarts it gives back (decisions 40 and 41), and adds the crash log and the
  forge that stays off.
- **Hands to stage 4** (the standing contract and the served facts): the monitor job's `interruption` key with its
  contract union `MonitorInterruptionCause` (WP2.11), and the pipeline facts' `stepRunTimes` (WP2.20), which stage 4
  declares in the contract's pipeline facts document with types of its own (decision 50); and a stored question
  option's `isRecommended` flag, which the agent adapter maps from the vendor's mark (WP2.26), so stage 4's WP4.10
  serves it as the decision document's `recommended` with no util of the adapter.
- **Hands to stage 6** (Gaia hosts the views): `talosProtocolVersion` in the identity document and the `quit` frame
  with reason `restart`, from which stage 6 (WP6.22) shows the running Talos and restarts it cleanly (decision 31); a
  monitor job's `interruption`, from which Gaia alerts on an ending on a network outage, offers the one control that
  resumes every such job across forges, and shows that a forge stopped supervising its agents (decisions 35 and 38);
  the step run times the pipeline overview shows (decision 36).
- **Hands to stage 9** (rename): the stored interruption cause `watcher-lost`, which keeps its value here as section 11
  of the design assigns it to the rename.

## Decisions this stage carries out

- **1.** Talos takes the Watcher's place: `src/lib/watcher/` and the fleet go, `src/lib/talos/` and `talos.ts` come.
- **3.** Every file Talos writes carries a format version: its start file, its record, each child record, the event log.
- **4.** One Talos per board, a separate detached process that outlives an Overseer restart; the Overseer requires
  exactly one protocol version.
- **5.** Talos starts each child from the launch it is given and reports state; it knows no vendor and no board.
- **6.** `TALOS_PROTOCOL_VERSION`, apart from the code version, carried by a `hello` frame whose shape never changes; a
  Talos of another version answers a frozen `version-mismatch` frame, quits cleanly, and the Overseer starts the right
  one.
- **7.** The clean quit: each agent is asked to stop at the end of its turn, Talos waits at most 10 seconds of real
  time, then stops what still runs; a line is stopped at once and run again later.
- **8.** Talos records each child's status whatever happens; an agent ended `paused` by a clean quit is resumed by
  itself.
- **9.** The supervision lease: one minute of real time, renewed every 15 seconds while the Overseer's passes make
  progress; without a renewal Talos stops its agents.
- **10.** The wake rule: after a gap in its own ticks Talos waits one renewal interval (two below five seconds) before
  it stops agents.
- **14** (in part). A Talos that is gone leaves records from which the Overseer stops every orphan and marks its jobs
  interrupted; the crash log and the forge that stays off are stage 3's.
- **15.** No retry in Talos; it recognises the ending on a network outage from the launch plan's patterns and reports
  it.
- **16** (agent port). The patterns, the closing line and the request to stop at the end of a turn are rendered by the
  Claude Code adapter into the launch plan, so Talos stays without a vendor. With the owner's rule of 2026-11-18
  (`owner-answers.md`, ground rules), every other reach past the port closes here too (WP2.21 to WP2.32).
- **29.** The lease stops agents only; an install or gate line runs to its end, and is stopped after 15 minutes.
- **32.** No compatibility: no mixed fleet, no legacy reader, no migration of Watcher files or of renamed stored keys;
  boards are set up anew.
- **33.** The packages this stage creates are named here and nowhere else: the lib package `src/lib/talos/` and the
  entry file `talos.ts`, both inside `apps/forge`, since only forge runs Talos. No workspace package is created.
- **34.** Orchestrated sessions in this repository do the work, outside both trackers; the run changes any rule file
  the work invalidates, with no approval gate.
- **35** (in part). An ending on a network outage, a provider overload after spent retries included, is recognised,
  never counted as a failure or a crash, held from resuming, and served as its own cause in the monitor document. The
  instruction that resumes it is stage 3's; Gaia's alert and its one control across forges are stage 6's.
- **36.** An install line is stopped after 15 minutes as a gate line is; every line's run time is recorded in the
  bound's measure and served in the pipeline facts. The overview that shows it is Gaia's (stage 6).
- **37.** The 15-minute bound does not count a sleep: Talos adds every gap in its own ticks to a line's allowance.
- **38** (in part). A hung Overseer counts as gone: the renewal is earned by progress, so after a minute without it
  Talos stops the board's agents at the end of their turn, and their jobs are interrupted `lease-ended` and wait for
  the user's resume. Gaia's mark that the forge stopped supervising them is stage 6's.
- **46.** Every in-flight ticket is dropped and boards are set up anew, so nothing here reads a Watcher's file.

The run's calls in this stage, each settled here:

- **The progress a renewal needs.** The Overseer numbers its passes. Its renewal timer fires every renewal interval on
  the main loop and renews when no pass runs or a different pass runs than at the previous tick; it withholds while
  the same pass is in flight at two ticks in a row. A tick that comes later than one interval plus
  `TALOS_TICK_GAP_MILLISECONDS` (a sleep, a suspension, or a loop blocked a while) renews and starts the comparison
  afresh, as Talos's own wake rule does. A blocked loop sends nothing at all. So a pass that hangs in an await, or a
  loop blocked in a synchronous call, loses the lease one minute after the last renewal (WP2.9).
- **The merged-tree gate leaves the pass.** It is the one wait a pass makes that lasts as long as a gate
  (`Airlocks.ts` awaits it, `:703`, `:864-866`). It runs beside the pass from a run folder whose finished outcome is
  kept on disk, and a later pass settles the Airlock from that outcome (WP2.19). A run whose Overseer stopped is stopped
  at the next start and run again: the `gating` phase is safe to redo (stage 0, table B).
- **Gate profiles and pipeline checks across a restart.** They already run beside the pass, driven by a promise of the
  Overseer that started them. The next start stops their lines and marks them stopped, as it marks them today
  (WP2.14 item 5).
- **Which lines are bounded.** Every pipeline step line carries the 15-minute bound: install steps, gate-prepare steps
  and gates, in a job's gate run, a merged-tree gate, a gate profile and a pipeline check. Merges and Flint's brain
  carry none. One constant, `LINE_TIME_BOUND_MILLISECONDS`. A bounded gate judges `cannot-run`, a bounded install step
  reads as not passed (`install-failed`), and a bounded profile ends `timed-out`; each line's output names the bound.
- **The run time's measure.** Wall time from a child's spawn to its end less every gap Talos added to its allowance,
  kept for every child in `ChildEnd.runMilliseconds`; the pipeline's step lines are written to the log and served
  (WP2.20). It is recorded and shown only, never a decision.
- **`lease-ended` waits from this stage on,** beside `network-outage`; `talos-paused` resumes by itself. Until stage 3
  builds `resume`, a waiting job leaves its state by `job stop` or `job fresh`.
- **The ending pattern counts at least one retry line** (`minimumCountedLines: 1`): one `api_retry` line since the
  previous closing line proves the agent's own retries ran, whatever retry setting bounded them.
- **The cause served to Gaia.** The monitor document's job gains `interruption`, the cause while the job is
  `interrupted` and `null` otherwise, as a union the contract declares on its own (decision 50).
- **The identity key and the system version.** `watcherProtocolVersion` becomes `talosProtocolVersion`; no Gaia code
  reads the old key. The forge system version rises one minor, to 1.19, once for the stage: WP2.11 raises it, and WP2.13
  and WP2.20 add their clauses to the same history sentence. `OVERSEER_CONTRACT_VERSIONS` stays.
- **`watcher-lost` keeps its stored value** until stage 9 (design section 11), meaning "Talos was lost while the child
  ran".
- **`Job.watcherInstance` is renamed in this stage,** with its stored key, as its own package (WP2.16); nothing
  migrates.
- **A Talos just started that answers another protocol version** is started once: `ensureTalos` answers `held` with
  `talos-protocol-differs` and the Overseer's start is refused (WP2.9 step 2.6, WP2.13 item 1); a restart with the
  program on disk then starts the matching Talos.
- **Talos syncs a child's event log at its end and at the quit.** No production reader asks for history over the socket
  (`src/services/overseer/DrivePass.ts:471` reads the files), so no `history` or `message` frame exists.
- **The child record keeps the launch's `workingDirectory`,** which a resumed session starts in (WP2.13 item 14).
- **Flint's `watcher-spark` attendant keeps its name.** It is Flint's word for a spark per agent in flight, not the
  Watcher's code; it moves with Flint into Gaia's page `lib/` in stage 8 (decision 52).
- **Every reach past the agent port closes in this stage** (`owner-answers.md`, ground rules, 2026-11-18): WP2.21
  once group 2-C has landed and before WP2.7 starts the Talos process, so Talos's protocol 1 never carries a vendor
  field, then WP2.22 to WP2.32 once the Watcher's names are gone, held by `src/AgentBoundary.spec.ts` from WP2.22 on.
  The fake agent is an adapter of the port and keeps replaying Claude Code's recorded wire. An agent that brings its own
  sandbox is confined by it, through its adapter, which declares that confinement as a capability; forge's own
  confinement wraps a session whose agent brings none; never both, since macOS refuses a nested Seatbelt profile
  (WP2.31; assumption 8 of "Needs the owner").
- **The Bridge's billing step names no variable** (WP2.24): "Billed to the API key in the Overseer's environment" in
  place of `ANTHROPIC_API_KEY`, and "this machine's agent login" in place of "Claude login". The variable's name still
  reaches the user where it matters: the decision the Overseer opens when the key is missing names it, from the
  adapter. Serving the name to the Bridge would add a field to a view stage 6 replaces. Assumption 1 of "Needs the
  owner".
- **`update` and `setup` stop cleaning up after install version 16 and the global skill links** (WP2.29, decision 32:
  every board is set up anew). `update` no longer removes the managed `CLAUDE.md` block, the `SubagentStop`,
  `PreToolUse` and `PostToolUse` entries, the worker agent definition, the dispatcher script and the three briefs;
  `setup` no longer removes `~/.claude/skills/` links, so its steps become `1/3` to `3/3`; the notice
  `claude-md-block-committed` and the pass's wait on it go. A board still holding those leftovers keeps them until its
  owner removes them by hand. Assumption 2 of "Needs the owner".

## Today's code

Paths are from `apps/forge/` unless they start with `packages/` or `docs/`.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| One Watcher process per job instance, claiming `watcher-<n>.json` exclusively and running one child | `src/lib/watcher/Watcher.ts:1-6`, `:418-438` | Replaced by one Talos per board (`src/lib/talos/Talos.ts`) |
| The Watcher binary, its composition root, `process.exit` | `watcher.ts:10-11` | Deleted; `talos.ts` takes its place |
| The child spawn with stdin piped for an agent, stdout to the event log, stderr to the Watcher log | `src/lib/watcher/Watcher.ts:295-346` | Changed: moved into `src/lib/talos/ChildSupervisor.ts` |
| The stop: list the tree, close stdin, `ask` after the grace, `force` sweep after a second grace | `src/lib/watcher/Watcher.ts:216-244` | Changed: kept as the requested stop in `ChildSupervisor.ts` |
| The stop of the last listing's groups at the end (`treeStopAtEndGraceMilliseconds`) | `src/lib/watcher/Watcher.ts:278-281`, `src/services/overseer/JobLaunch.ts:372-374` | Kept, carried in the launch frame |
| The linger of an ended Watcher until its acknowledgement | `src/lib/watcher/Watcher.ts:283-287`, `:473`; `src/lib/watcher/constants/WatcherProtocol.ts:11` | Deleted: Talos outlives its children |
| Protocol 2 frames: `hello`, `write`, `close-input`, `stop`; `welcome`, `history`, `message`, `state`, `refused` | `src/lib/watcher/@types/WatcherFrame.ts:9-68` | Replaced by the Talos frames of "Interfaces introduced" |
| The protocol window and its constants | `src/lib/watcher/constants/WatcherProtocol.ts:2-23` | Replaced by `src/lib/talos/constants/TalosProtocol.ts` |
| The socket server: hello first, secret compared in constant time, line limit before the secret | `src/lib/watcher/WatcherSocketServer.ts:48-57`, `:103-118` | Changed: moved to `src/lib/talos/TalosSocketServer.ts`, frozen handshake added |
| The launch file `launch-<n>.json`, read once after the claim | `src/lib/watcher/WatcherLaunch.ts:14-42`, `:70-122` | Replaced by the `launch` frame; no launch file is written |
| A resumed session's start folder, read from its first instance's launch file | `src/services/overseer/SessionPlace.ts:63-71`, `:77-85` | Changed: read from the first child record's `workingDirectory` (WP2.13) |
| The Watcher record `watcher-<n>.json` with `end` | `src/lib/watcher/WatcherRecord.ts:3-33` | Replaced by the child record `child-<n>.json` |
| The event log `events-<n>.ndjson`, origins `agent`, `client`, `watcher` | `src/lib/watcher/EventLog.ts:9-53` | Moved to `src/lib/talos/EventLog.ts`; origin `watcher` becomes `talos`; format version 2 |
| An event-log entry of origin `client` holds the acting frame whole, read back with `clientFrameOf` to tell a chat from a closed input | `src/lib/watcher/Watcher.ts:258`; `src/services/overseer/JobTranscript.ts:89-94`, `JobLiveFactsReader.ts:241-246` | Changed: the line is a `ClientEntry`, read with `clientEntryOf` (WP2.5, WP2.13) |
| The standing replies, texts and booleans only | `src/lib/watcher/StandingReplies.ts:5-45` | Moved unchanged to `src/lib/talos/StandingReplies.ts` |
| The line splitter | `src/lib/watcher/StreamLines.ts:7-26` | Moved unchanged to `src/lib/talos/StreamLines.ts` |
| The `LocalEndpoint` port and its adapters, sockets under `<monitor>/watchers/` | `src/lib/watcher/LocalEndpoint.ts:18-30`, `LocalEndpointFor.ts:31-36`, `PosixSocketEndpoint.ts:36` | Moved to `src/lib/talos/`; the folder becomes `<monitor>/private/` |
| The frozen socket paths of the endpoint extraction | `src/lib/watcher/LocalEndpoint.frozen.spec.ts`, `FrozenLocalEndpoint.json` | Deleted: socket paths change outright |
| The owner-only folder `<monitor>/watchers/<trackerId>/`, holding the API token and every secret | `src/lib/watcher/WatcherFiles.ts:6-8`, `src/services/overseer/OverseerFiles.ts:20-22`; the registry hands Gaia the token's path (`tokenPath`), so no Gaia code names the folder | Changed: `<monitor>/private/<trackerId>/` |
| The bundle closure guard | `src/lib/watcher/WatcherBundleClosure.spec.ts` | Replaced by `src/lib/talos/TalosClosure.spec.ts` and `TalosMainThread.spec.ts` |
| The fleet: liveness by the Watcher's identity, `eventsAfter`, launch files, per-call socket send, reap, stop of process Watchers | `src/services/overseer/WatcherFleet.ts:89-97`, `:100-111`, `:134-192`, `:196-247`, `:262-272`, `:300-366` | Deleted; replaced by the `BoardChildren` port and its Talos adapter `TalosChildren.ts` |
| The per-call frame send with no acknowledgement and a 2-second timeout | `src/services/overseer/WatcherFleet.ts:66`, `:196-233` | Replaced by one persistent connection with a `done` per frame |
| The pinned Watcher bundle `<data>/overseer/watcher-<code>.js` | `src/services/overseer/WatcherBundle.ts:18-35`, `cli/overseer/OverseerForeground.ts:379-383` | Deleted |
| The legacy reader of Watchers below the protocol window | `src/services/overseer/LegacyWatcherReader.ts:1-53` | Deleted |
| Legacy fields in the pass state, the job document and the Bridge | `src/services/overseer/DrivePass.ts:312`, `:991-995`; `JobLiveFactsReader.ts:68-70`, `:278`; `bridge/views/agents/JobRow.tsx:62`, `:76` | Deleted (`watchOnly`, `watcherProtocol`, `legacyWatcherJobIds`) |
| Regrouping: hello with the stored cursor, lost Watcher settled (reboot, `watcher-lost`, `agent-crashed`, refused stop) | `src/services/overseer/Regrouping.ts:102-124`, `:137-171`, `:223-244` | Changed: no hello history; a lost child is settled from its record and Talos's record |
| The pass reads each job's Watcher record and event log every pass | `src/services/overseer/DrivePass.ts:462-515` | Changed: reads the child record, the event log, then the record again for recognised endings |
| The mapping of a gone Watcher to `agent-crashed`, `watcher-lost`, `answer-delivery`, `no-report` | `src/services/overseer/DrivePass.ts:592-616` | Changed: adds `talos-paused`, `lease-ended`, `network-outage` |
| The agent launch through the fleet | `src/services/overseer/DrivePass.ts:843-959`, `:941-956` | Changed: a `launch` frame through `BoardChildren.launchAgent` |
| Process Watchers for install steps, gate steps, the target merge and the main merge | `src/services/overseer/JobLaunch.ts:334-360`, `:552-588`, `:2352-2478`, `:2655-2710` | Changed: line children through `BoardChildren.launchLine`, re-run after `paused` |
| Frames to a job's Watcher: messages, wind-down, close input, stop, answers | `src/services/overseer/JobControlDelivery.ts:37-42`, `:65-120`; `AnswerDelivery.ts:70-100`; `JobLaunch.ts:2613-2626` | Changed: `input` and `stop` frames through `BoardChildren` |
| Flint's brain run as a Watcher of its own | `src/services/overseer/FlintBrainSessionHost.ts:97-151` | Changed: an agent child of Talos in `flint-brain/` (stage 8 removes the brain) |
| The merged-tree gates the Overseer spawns itself, kept in memory | `src/services/overseer/DrivePass.ts:1143-1168`, `:1254-1277` | Changed: line children through a `LineRunner` |
| A merged-tree gate on a pipeline with entities: one pipeline per gated entity, run in turn through the same `runOnePipeline`, each numbering its steps from 0 | `src/services/overseer/MergedTreeGateRun.ts:45-63`; `src/services/lifecycle/GateRun.ts:370-390` | Changed: each pipeline of a gate run gets a folder of its own (WP2.14) |
| Gate profiles and pipeline checks spawned in process, stopped through the port | `src/services/overseer/GateProfiling.ts:190-245`; `PipelineChecking.ts:135-177` | Changed: line children through a `LineRunner`; stopped by `stop` frames |
| A pipeline check per level, the forge's and each entity's, side by side, named `<setupId>` or `<setupId>-<entity>` | `src/services/overseer/PipelineChecking.ts:92-95`, `:209-221` | Changed: a check's lines live under its own name (WP2.14) |
| `Bun.spawn` of every in-process gate line | `src/services/lifecycle/GateRun.ts:209-245` | Changed: `runGate` takes a `LineRunner` |
| The record of process starts a spec replaces | `src/services/overseer/ProcessStarts.ts:10-22` | Changed: `spawnWatcher` goes; `runGatePipeline`, `runGateLines`, `runProposalTwice` stay |
| Gate slot holders: a gate Watcher folder or `process:<pid>:<label>` | `src/services/overseer/GateRunSlots.ts:18`, `:92-118` | Changed: every holder is a child folder judged by its child record |
| The Overseer's stop: process Watchers stopped on `--now`, ended Watchers reaped | `cli/overseer/OverseerForeground.ts:778-792` | Changed: `stop-lines` frame on `--now`; no reap |
| The Baton pass preparation building bundles and reading Watcher files | `cli/overseer/OverseerForeground.ts:267-305`; `src/services/overseer/BatonPass.ts:14-20` | Changed: steps `build-bundles` and `read-watcher-files` go, `read-child-records` comes |
| The Baton record and the identity naming `watcherProtocolVersion` | `src/services/overseer/Baton.ts:25`, `:45`; `OverseerServer.ts:48`, `:637`; `cli/overseer/OverseerForeground.ts:511` | Changed: `talosProtocolVersion` |
| The Claude Code plan: one standing reply that denies every permission but a question; the API key from the Watcher's environment | `src/lib/claude-code/ClaudeCodeAdapter.ts:311-337` | Changed: adds `closingLine`, `endingPatterns`, `quitAtTurnEnd`; `environmentFromWatcher` becomes `environmentFromTalos` |
| The stream mapper's result failures: budget stop, 429, 401 and 403; every other error result is one failure | `src/lib/claude-code/ClaudeStreamMapper.ts:218-242` | Kept; the outage is recognised by Talos, not by the mapper |
| The plan types | `src/lib/agent-launch/AgentLaunchPlan.ts`, `AgentAdapter.ts` | Changed: new plan fields, `AgentEndingName` |
| Interruption causes and the counted crashes | `src/lib/tracker-model/@types/Job.ts:83-91`; `constants/JobStates.ts:73-91` | Changed: `talos-paused`, `lease-ended`, `network-outage` added, none counted |
| The job's Watcher instance and event cursor | `src/lib/tracker-model/@types/Job.ts:130-133`, `:152-153`; `constants/JobStates.ts:109` | Changed: `watcherInstance` becomes `childInstance` |
| The crash bound and the session replace rule | `src/lib/tracker-model/Playbook.ts:182-200` (`outageIsDueWith`), `:473-489` (`crashBoundStepsOf`) | Changed: `network-outage` and `lease-ended` are neither resumed nor replaced; `talos-paused` always resumes |
| Git spawned synchronously with no timeout | `src/lib/git/GitProcess.ts:58-84` | Kept; a call that blocks the main loop past the lease ends the lease, as a hung Overseer does (WP2.9) |
| The process table read through `/bin/ps` with `Bun.spawnSync` | `src/lib/process-identity/DarwinProcessIdentity.ts:1-11`; `ProcessSupervisionFor.ts:19` | Kept; Talos calls it only from its synchronous-calls thread |
| Spawn options per child kind, `watcher` among them | `src/lib/process-identity/ProcessSupervision.ts:18`; `SpawnOptionsFor.ts:15-21` | Changed: kind `watcher` becomes `talos` |
| The worker profiles' deny of the owner-only folder and of `jobs/*/launch-*.json` | `src/services/overseer/WorkerProfiles.ts:221-241` | Changed: `<monitor>/private`; the launch-file glob goes, no launch file exists |
| The Baton pass waits | `src/shared/constants/OverseerLimits.ts:62-75` | Kept; the lease renewal overlaps the pass (WP2.13) |
| The stop grace and the regroup hello timeout | `src/shared/constants/OverseerLimits.ts:51`, `:54` | The grace is kept; the hello timeout becomes `TALOS_FRAME_TIMEOUT_MILLISECONDS` |
| Boundary specs and recordings of the Watcher | `src/testing/BoundarySpecs.ts:16-136`; `src/testing/BoundaryRecordings.ts:85-97` | Replaced by Talos boundaries |
| The fake agent: a child that prints only lines of its recording (`src__testing__fake-agent.json`, one session per `CLAUDE_WIRE_SCENARIOS` entry), the steps it plays chosen from switches | `src/testing/fake-agent/FakeAgentChild.ts:1-43`, `RecordedClaudeLines.ts:15-24`, `:63-77`; `src/testing/FakeAgentAdapter.ts:73-82`, `:118-137`; `cli/CommandContext.ts:71-75`; `src/shared/Environment.ts:26-47` | Changed: a network outage scenario (WP2.2) |
| Guards naming the Watcher | `src/ImportDirection.spec.ts:68-69`, `:221`, `:334`; `src/PlatformBoundary.spec.ts:90-91`, `:211`, `:243`, `:247`; `src/SpecSleeps.spec.ts:30-45`; `src/RealSystemSpecs.spec.ts:41-45`; `eslint.config.js:27`, `:38`, `:47-48`, `:116-117` | Changed to name `talos.ts` and `src/lib/talos/` |
| The retired names guard | `src/ComponentNames.spec.ts:27-63` | Changed in WP2.17: the Watcher's code names are added, after the documents stop naming them |
| The rules naming the Watcher | `apps/forge/CLAUDE.md:46`, `:134-135`, `:161-163`, `:326`, `:328`, `:336-338`; `apps/gaia/CLAUDE.md:148` | Changed in WP2.17 |
| The pass loop: `runOnePass` run by `drain` until no wake is left, one pass at a time | `src/services/overseer/DrivePass.ts:1330`, `:1552-1576` | Changed: passes are numbered, and the number in flight is the renewal's progress (WP2.13) |
| The Airlock awaits a merged-tree gate inside the pass, its gate slot included | `src/services/overseer/Airlocks.ts:107`, `:703`, `:864-866`; `DrivePass.ts:1254-1277`; `src/services/lifecycle/GateRun.ts:346` | Changed: the gate runs beside the pass and a later pass settles it (WP2.19) |
| The monitor document's job: state, figures and route, no interruption cause | `packages/forge-contracts/@types/MonitorSnapshotDocument.ts:63-86`; `src/services/overseer/MonitorSnapshotAssembly.ts:236-260`, `:353`; Gaia reads only the keys it knows (`apps/gaia/src/adapters/forge-api/MonitorSnapshotIngestion.ts:67-90`) | Changed: `interruption` (WP2.11) |
| A gate profile's ending `timed-out`, declared and never produced; its time measured by the Overseer's clock | `src/lib/tracker-model/@types/GateProfile.ts:11`; `src/services/overseer/GateProfiling.ts:55-59`, `:162-170`; `src/services/lifecycle/GateLineRun.ts:120-124` | Changed: `timed-out` from an end `time-bound`; the time is the line's run time (WP2.14) |
| A job's gate run and a merged-tree gate record `gate-ran` with each gate's cache report; the pipeline facts' cache marks are assembled from those records | `src/lib/tracker-model/constants/LogRecordSchema.ts:285-291`; `src/services/overseer/JobLaunch.ts:1523`, `:2052`; `Airlocks.ts:634`, `:868`; `src/services/render/PipelineFactsAssembly.ts:539`, `:608` | Kept; each step line's run time is recorded and assembled beside them (WP2.20) |
| The install steps: the pipeline's prepare steps, one line each, judged outside the lock and acted on in the hold | `src/services/overseer/JobLaunch.ts:533-536`, `:575-586`, `:881-896` | Changed: bounded, and their run times recorded (WP2.13, WP2.20) |
| 46 reaches past the agent port in shipping code, 2 borderline, 13 files that import the adapter's folder past the seam; `src/ImportDirection.spec.ts:420-423` guards `ClaudeCodeAdapter.ts` alone | measured at `710ae4f9` (`.claude/.evidence/hephaestus-talos/port-rule/reaches.md` in the main checkout); rechecked at `3274ac88`, where 2-A and WP2.4 landed: 29 shipping files outside the adapter hold a code line that names the vendor | Closed by WP2.21 to WP2.32, held by `src/AgentBoundary.spec.ts` |
| Comments that name the vendor's program, flags, hook events, tools or wire fields, `src/lib/agent-launch/WorkerProfile.ts` among them (its field `bashNetworkDomains`, its "Edit and Write") | 82 comment lines in 40 shipping files at `3274ac88`, 3 of them WP2.21's (`AgentLaunchPlan.ts:27`, `StandingReplies.ts:3`, `:30`); `src/services/overseer/JobResumption.ts:2`, `ApiBillingStops.ts:3`, `src/lib/tracker-model/JobControls.ts:180` name vendor flags | Each line goes to the package that changes its file (WP2.22 item 5 lists every one), the rest to WP2.32; the guard scans comments with every form, and WP2.32's greps catch the two flags the forms leave out (WP2.22) |
| Testing helpers that start or name the real `claude` | `src/testing/InstalledSystemVersion.ts:85` (`claude --version`), `ProgramTraps.ts:26`, `:36`, `RecordBoundary.ts:46-76`, `cli/testing/CutoverSmoke.ts:3`, `:38`, `:123`; 79 `vendor-name` lines in 19 helper files | Allowlisted line by line in a list of their own; a guard test holds that the seam's imports reach none of them (WP2.22) |

## Work packages

Each package leaves `bun install --frozen-lockfile` and `bun run verify` green at the repository root. "Alone" means no
other package runs beside it, because its files overlap with most others. Paths are from `apps/forge/`.

Order and parallelism:

| Package | Runs after | May run beside |
| --- | --- | --- |
| WP2.1 Line conditions and ending recognition | stages 0, 1 | WP2.2, WP2.3 |
| WP2.2 The plan carries the closing line, the ending patterns and the quit act | stages 0, 1 | WP2.1, WP2.3 |
| WP2.3 The supervision lease as a pure state machine | stages 0, 1 | WP2.1, WP2.2 |
| WP2.4 The Watcher's shareable parts move into `src/lib/talos/`; the private folder | WP2.1, WP2.2, WP2.3 | alone |
| WP2.5 Talos frames, records, start file and files | WP2.3, WP2.4 | WP2.6, WP2.11 |
| WP2.6 The synchronous-calls thread | WP2.4 | WP2.5, WP2.11 |
| WP2.7 The Talos process, part one: start, handshake, lines | WP2.5, WP2.6 | WP2.11 |
| WP2.21 A standing reply names the path of its request identifier | WP2.7 | alone |
| WP2.8 The Talos process, part two: agents, lease, clean quit | WP2.21 | WP2.11 |
| WP2.9 The Overseer's side: connection, start, lease renewal on progress | WP2.8 | WP2.10, WP2.11, WP2.19 |
| WP2.10 The `BoardChildren` port over the Watcher fleet | WP2.4 | WP2.9, WP2.11 |
| WP2.11 New interruption causes in the tracker model and the monitor document | WP2.4 | WP2.5 to WP2.10, WP2.19 |
| WP2.12 The Talos adapter of `BoardChildren` | WP2.9, WP2.10, WP2.11 | WP2.19 |
| WP2.19 The merged-tree gate leaves the pass | WP2.10 | WP2.9, WP2.11, WP2.12 |
| WP2.13 The switch to Talos | WP2.12, WP2.19 | alone |
| WP2.14 The Overseer's own gates under Talos | WP2.13 | alone |
| WP2.20 Line run times recorded and served | WP2.14 | alone |
| WP2.15 Removal of the fleet, the bundles and the legacy reader | WP2.20 | alone |
| WP2.16 The Watcher's remaining names | WP2.15 | alone |
| WP2.22 The agent boundary guard, today's reaches allowlisted | WP2.16 | alone |
| WP2.23 The adapter reads its own transcripts | WP2.22 | alone |
| WP2.24 The adapter names its variables, its credentials and its repair | WP2.23 | alone |
| WP2.25 Live answers, the quit act, the instruction bundle line and the start folder go through the port | WP2.24 | alone |
| WP2.26 The session's events carry the asking call, the recommendation and the window's length | WP2.25 | alone |
| WP2.27 The tool-call guards take neutral tool calls | WP2.26 | alone |
| WP2.28 The adapter names its configuration paths and its attribution | WP2.27 | alone |
| WP2.29 The retired install goes: the managed block, the old hooks, the global skill links | WP2.28 | alone |
| WP2.30 The adapter installs into a repository | WP2.29 | alone |
| WP2.31 A session is confined by its agent's own sandbox or by forge's, as the port declares | WP2.30 | alone |
| WP2.32 The vendor's names leave the wording, the prompts and the comments | WP2.31 | alone |
| WP2.17 Rules and documentation | WP2.32 | none |
| WP2.18 Recordings and the end-to-end check | WP2.17 | alone |

WP2.19 lands before WP2.13: once the renewal waits on progress, a pass that awaited a merged-tree gate would end the
lease at every landing.

WP2.21 runs in its own group, 2-D2, once WP2.7 (group 2-D) has landed, since WP2.7 was already being built when the
port rule came, and before WP2.8 (group 2-E). WP2.5 gives `src/lib/talos/StandingReplies.ts` the launch's validator
`standingReplyOf` that it changes. Protocol 1 has not shipped before the switch (WP2.13), so the change needs no raise
of `TALOS_PROTOCOL_VERSION`, and protocol 1 never ships with a vendor field.

WP2.22 to WP2.32 each change the agent port, the Claude Code adapter and the fake agent (`AgentAdapter.ts`,
`ClaudeCodeAdapter.ts`, `FakeAgentAdapter.ts`) and the guard's allowlist, so each runs alone. They come after WP2.16,
when the Watcher's code and names are gone and the files they touch hold still, and before WP2.17 and WP2.18, so the
documentation pass and the recordings cover them.

### WP2.1 Line conditions and ending recognition

**Purpose.** Give Talos a vendor-free way to match fields of a child's JSON line against numbers as well as texts and
booleans, and to recognise a named ending from a closing line and a count of other lines (design section 3.2,
"Recognising an ending on a network outage").

**Files.**
- Create `src/lib/talos/LineConditions.ts`: the condition types and the pure matcher. New package folder, named in
  decision 33's clause above; it has no dependencies yet, so its header names none.
- Create `src/lib/talos/EndingPatterns.ts`: the recognition state per child and its pure transitions.
- Create `src/lib/talos/LineConditions.spec.ts`, `src/lib/talos/EndingPatterns.spec.ts`.

**What to do.**
1. In `LineConditions.ts` export the types `FieldCondition` and `LineConditions` exactly as in "Interfaces introduced",
   and the functions `parsedLineOf(line: string): ParsedLine | null` (a JSON object or `null`, as
   `src/lib/watcher/StandingReplies.ts:13-20` does) and `lineMeets(parsed: ParsedLine, conditions: LineConditions):
   boolean`. Read a dotted path through own properties only (`Object.hasOwn`), as `StandingReplies.ts:22-26` does.
   `equals` compares with `===`; `one-of` with `includes`; `number-between` holds only for a finite number with `least
   <= value <= most`. `allOf` must all hold, `noneOf` must all fail, and `anyOf` holds when it is empty or one of its
   conditions holds.
2. Export `lineConditionsOf(value: unknown): LineConditions | null`, the validator a launch frame uses: every field
   present and well typed, `least <= most`, every path non-empty; anything else answers `null`.
3. In `EndingPatterns.ts` export `EndingPattern`, `RecognisedEnding` (see "Interfaces introduced"),
   `createEndingRecognition(closingLine, patterns)` returning an object with `observe(parsed: ParsedLine | null,
   sequence: number): RecognisedEnding | null`. For each line: when it meets a pattern's `countedLineMatches`, that
   pattern's count rises by one; when it meets `closingLine`, the patterns are tried in their order on it, the first
   whose `closingLineMatches` holds and whose count is at least `minimumCountedLines` is answered as `{ name,
   closingLineSequence: sequence, countedLines }`, and every count goes back to 0 whether a pattern matched or not. A
   line that is no JSON object counts for nothing. Never look at a field that is not named in a pattern.
4. Export `endingPatternOf(value: unknown): EndingPattern | null` for the launch frame's validation: `name` matches
   `^[a-z][a-z-]*$`, `minimumCountedLines` a whole number `>= 0`, `countedLineMatches` may be `null`.

**Specs.**
- `LineConditions.spec.ts` proves: each test kind holds and fails on its boundary (`least`, `most`, one past each); a
  number given as a string never meets `number-between` and never `equals` the number; a missing path fails `equals` and
  `one-of`; an inherited property (`__proto__`, `constructor`) is never read; an empty `anyOf` holds; the validator
  refuses each malformed field by name.
- `EndingPatterns.spec.ts` proves: the counted lines between two closing lines are counted and reset at the closing
  line; a closing line that meets no pattern answers `null` and still resets; `minimumCountedLines` holds back a match
  below it; the first matching pattern wins; free text that says "connection failed" in a `result` field never matches a
  field condition on `api_error`.

**Done when.** `cd apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/lib/talos/` passes both specs, and
`bun run verify` at the repository root is green.

### WP2.2 The plan carries the closing line, the ending patterns and the quit act

**Purpose.** The vendor's knowledge reaches Talos only through the launch plan (design section 3.2, "No vendor in
Talos"). The Claude Code adapter renders the closing line, the network outage pattern, which covers a host that could
not be reached and a provider overload after the retries were spent (decision 35), and the request to stop at the end
of a turn.

**Files.**
- Change `src/lib/agent-launch/AgentLaunchPlan.ts`: add `PlanLineConditions`, `PlanFieldCondition`, `PlanEndingPattern`,
  `QuitAtTurnEnd` and the plan fields `closingLine`, `endingPatterns`, `quitAtTurnEnd`. These are structural twins of
  the WP2.1 types: `src/lib/agent-launch/` may not import `src/lib/talos/`, just as the plan's `StandingReply` twins the
  Watcher's today (`AgentLaunchPlan.ts`, `src/lib/watcher/StandingReplies.ts:5-9`).
- Change `src/lib/agent-launch/AgentAdapter.ts`: export `AGENT_ENDING_NAMES = ['network-outage'] as const` and `type
  AgentEndingName`, the names an adapter may give an ending and the Overseer maps to a cause.
- Change `src/lib/claude-code/ClaudeCodeAdapter.ts`: render the three fields in `planOf` (`:321-337`).
- Read, never copy, the fixture pair stage 0 committed in `src/lib/claude-code/testing/fixtures/`:
  `network-outage-retries-spent.stdout.jsonl` and its `.stdin.jsonl` partner (stage 0, WP0.4). No second fixture of
  the same session is created: `ClaudeStreamFixtures.spec.ts:43-52` fails a `.stdout.jsonl` without its partner.
- Change `src/lib/claude-code/ClaudeCodeAdapter.spec.ts`, and `src/lib/claude-code/ClaudeStreamFixtures.spec.ts` inside
  stage 0's block `describe('network-outage-retries-spent (P23, Claude Code <version>)')` (the version the recording's
  notes.txt names).
- The fake agent's outage scenario. `src/testing/fake-agent/FakeAgentChild.ts` stays as it is: it plays a scenario file
  and prints only lines its recording holds (`RecordedClaudeLines.ts:15-24`, `:63-77`; a selector naming a key no
  recorded line has exits 3), and that recording holds no `system`/`api_retry` line and no outage result today. So:
  - Change `src/testing/FakeAgentAdapter.ts`: export `NETWORK_OUTAGE_FAKE_AGENT_STEPS` beside
    `WORKING_FAKE_AGENT_STEPS` (`:79-82`), the started line, a number of `api_retry` selectors, then the outage result
    selector; and give `planOf` (`:126-137`) the Claude Code adapter's `closingLine`, `endingPatterns` and
    `quitAtTurnEnd`, since the fake prints Claude Code's lines and a scratch forge's Talos must recognise them.
  - Change `src/shared/Environment.ts`: a switch `FAKE_AGENT_NETWORK_OUTAGE`, named from
    `PRODUCT_NAMES.ENVIRONMENT_PREFIX`, with its getter beside the other `FAKE_AGENT_*` getters (`:26-47`); change
    `cli/CommandContext.ts:71-75`, which picks the steps from those switches, to play the outage steps under it.
  - Change `src/testing/fake-agent/RecordedClaudeLines.ts`: add `network-outage` to `CLAUDE_WIRE_SCENARIOS`, and record
    it: a case of `.platform-probes/claude-p19-scenarios-against-a-stand-in.js` whose stand-in answers every Messages
    call with a 529 until the session ends, recorded with `bun run record src/testing/fake-agent/`
    (`src/testing/fake-agent/ClaudeWireRecorder.ts`). `sessionsOf` refuses a recording that lacks any listed
    scenario, so the name and the new `src__testing__fake-agent.json` land in one commit. That command also re-runs
    P22, one real model call, and starts the installed `claude`: the owner runs it at gate G1 ("Needs the owner").
  - Until that recording exists, nothing else in this stage waits on it: WP2.8's outage spec plays stage 0's fixture
    through a plain child, and only verification step 7 needs the fake scenario.

**What to do.**
1. The Claude Code values, as data in `ClaudeCodeAdapter.ts` beside `DENY_EVERY_PERMISSION_BUT_A_QUESTION` (`:312`):
   - `closingLine`: `allOf` `[{ test: 'equals', path: 'type', value: 'result' }]`.
   - one `endingPatterns` entry: `name: 'network-outage'`; `closingLineMatches`: `allOf` `type` equals `result`,
     `is_error` equals `true`, `terminal_reason` equals `api_error`; `anyOf` `api_error` equals `connection_failed`,
     `api_error_status` `number-between` 500 and 599 (529, a provider overload, lies inside; 429 does not);
     `countedLineMatches`: `allOf` `type` equals `system`, `subtype` equals `api_retry`; `minimumCountedLines`: `1`
     (the run's call above).
   - `quitAtTurnEnd`: `{ act: 'close-input' }`: closing stdin is how a session is wound down today
     (`src/services/overseer/JobControlDelivery.ts:105-110`).
2. Before writing the values, read the stage 0 fixture (`network-outage-retries-spent.stdout.jsonl`) and its P23 entry
   in `docs/development/overseer-claude-probe.md`, and confirm every field name and value the pattern names occurs in
   its closing line. Where a field differs, the fixture wins and the difference goes in the commit message; never match
   on the `result` text.
3. `planOf` keeps `standingReplies` exactly as today: a permission request is answered on texts alone and needs no
   number.
4. The Flint brain's plan and every other plan built through `planOf` gain the same fields; the only other renderer of a
   plan is the fake agent's adapter (`src/testing/FakeAgentAdapter.ts:126-137`), which takes the Claude Code values.

**Specs.**
- `ClaudeCodeAdapter.spec.ts`: the plan carries the three fields with the exact values above, for every session kind.
- `ClaudeStreamFixtures.spec.ts`, in stage 0's P23 block: on `network-outage-retries-spent.stdout.jsonl`, a copy of
  WP2.1's matching (imported from `src/lib/talos/` in the spec only, which `src/ImportDirection.spec.ts` allows for
  specs; if it does not, the spec checks the field values by hand) recognises `network-outage` on the closing line with
  the fixture's own retry count; the closing line of `rate-limit-rejected.stdout.jsonl` (a 429) and of a fixture with
  `is_error: false` do not match. The mapper's replay list (`ClaudeStreamMapper.spec.ts:102`) stays as it is.
- The same block, with the same matching, on planted lines built from the fixture's closing line: one `api_retry` line
  and a closing line with `api_error_status` 529 (an overload) match; the same with `api_error` `connection_failed`
  matches; either closing line with no retry line before it does not.

**Done when.** `bun test --path-ignore-patterns='.claude/**' ./src/lib/claude-code/` in `apps/forge` passes, and `bun
run verify` at the root is green.

### WP2.3 The supervision lease as a pure state machine

**Purpose.** The lease and the wake rule decide when Talos stops its agents (decisions 9 and 10). Built as a pure state
machine on an injected wall clock, so every case is a fast spec and no spec waits out a minute.

**Files.**
- Create `src/lib/talos/SupervisionLease.ts`, `src/lib/talos/SupervisionLease.spec.ts`.

**What to do.**
1. Export `createSupervisionLease(bounds: LeaseBounds): SupervisionLease` with `LeaseBounds` and `LeaseStanding` as in
   "Interfaces introduced". The object keeps `standing`, `lastRenewalWallMilliseconds`, `lastTickWallMilliseconds`,
   `graceEndsAtWallMilliseconds`.
2. `renewed(wallNow)`: from any standing to `held`; records `lastRenewalWallMilliseconds = wallNow`.
3. `ticked(wallNow)`, called on every Talos tick, answers `'lease-ended'` once at the transition and `null` otherwise:
   - a gap is `wallNow - lastTick > tickMilliseconds + tickGapMilliseconds` or `wallNow < lastTick` (a clock moved
     back);
   - in `held` with a gap: go to `waiting-after-gap`, `graceEndsAt = wallNow + graceMilliseconds`, where the grace is
     `renewalIntervalMilliseconds`, or twice it when it is below `WAKE_GRACE_DOUBLING_BELOW_MILLISECONDS` (5000);
   - in `held` without a gap: when `wallNow - lastRenewal >= leaseMilliseconds`, go to `ended` and answer
     `'lease-ended'`;
   - in `waiting-after-gap`: a further gap moves `graceEndsAt` to `wallNow + grace`; otherwise when `wallNow >=
     graceEndsAt`, go to `ended` and answer `'lease-ended'`;
   - `unheld` and `ended` never answer anything.
4. Export `gapLengthOf(previousWall, wallNow, tickMilliseconds)`: the time past one tick, `0` when there was no gap; the
   time bound of WP2.7 uses it.
5. The clock rules (`apps/forge/CLAUDE.md:174-181`): a lease is a clock that measures real time (`:176-178` names a
   heartbeat, a timeout and a lifetime), so it needs no exception comment; say in the file header that the wall clock is
   used on purpose so a sleep counts.

**Specs.** `SupervisionLease.spec.ts` proves, each case on a fake clock: a lease renewed every 15 seconds never ends;
silence for 60 seconds ends it once; a jump of 3 hours between two ticks ends nothing at once, and a renewal within 15
seconds after the jump keeps it held; with no renewal 15 seconds after the jump it ends; with an interval of 2 seconds
the grace is 4 seconds; a clock that moves back is a gap; a second gap during the grace extends the grace; an `unheld`
lease never ends; a renewal after `ended` holds it again.

**Done when.** `bun test --path-ignore-patterns='.claude/**' ./src/lib/talos/SupervisionLease.spec.ts` passes and the
root `bun run verify` is green.

### WP2.4 The Watcher's shareable parts move into `src/lib/talos/`; the private folder

**Purpose.** Move the modules Talos keeps, so later packages build on them, and rename the owner-only folder away from
the Watcher's name in one step, because the token, every secret and every socket live in it.

**Files.**
- Move with `git mv` from `src/lib/watcher/` to `src/lib/talos/`: `EventLog.ts`, `EventLog.spec.ts`, `StreamLines.ts`,
  `StreamLines.spec.ts`, `StandingReplies.ts`, `StandingReplies.spec.ts`, `LocalEndpoint.ts`, `LocalEndpointFor.ts`,
  `PosixSocketEndpoint.ts`, `PosixSocketEndpoint.spec.ts`, `WindowsPipeEndpoint.ts`, `UnsupportedLocalEndpoint.ts`,
  `LocalEndpoint.answers.integration.spec.ts`, `LocalEndpoint.contract.integration.spec.ts`.
- Delete `src/lib/watcher/LocalEndpoint.frozen.spec.ts` and `src/lib/watcher/FrozenLocalEndpoint.json`: their claim,
  that an extraction changed no socket path, does not hold by design (decision 32).
- Create `src/lib/talos/TalosFiles.ts` with `PRIVATE_FOLDER_NAME = 'private'` and `privateFolderOf(monitorFolder,
  trackerId)`, replacing `ownerOnlyFolderOf` and `WATCHER_FOLDER_NAME` (`src/lib/watcher/WatcherFiles.ts:6-8`,
  `constants/WatcherProtocol.ts:23`).
- Change every importer: `src/lib/watcher/Watcher.ts`, `WatcherFiles.ts`, `WatcherLaunch.ts`, `WatcherSocketServer.ts`,
  `WatcherFrames.ts`, `@types/WatcherFrame.ts`; `src/services/overseer/OverseerFiles.ts`, `WorkerProfiles.ts`,
  `WatcherFleet.ts`, `Regrouping.ts`, `LegacyWatcherReader.ts`; the readers of the `EventLogEntry` type
  (`cli/jobs/JobCommand.ts`, `src/services/overseer/DrivePass.ts`, `JobResumption.ts`, `JobTranscript.ts`,
  `JobLiveFactsReader.ts`); `src/testing/RecordedLocalEndpoint.ts`, `ProcessWorldReplay.ts`, `RecordedWatcherStages.ts`,
  `WatcherJob.ts`, `src/services/overseer/testing/PlantedWatcher.ts`, and the boundary path in
  `src/testing/ToolGuard.ts:36`; every spec the compiler names.
- Change `src/lib/watcher/Watcher.ts` header to declare `src/lib/talos` among the packages it depends on, and
  `src/lib/watcher/WatcherBundleClosure.spec.ts` to allow `src/lib/talos/` (both go in WP2.15).
- Change `src/testing/BoundarySpecs.ts:30-31`, `:113-118` and `src/testing/BoundaryRecordings.ts:85-90` to the new
  paths; rename the recordings under `src/testing/recordings/darwin/` with `git mv` (their file names carry the boundary
  path: `src__lib__watcher__LocalEndpointFor.ts.json` becomes `src__lib__talos__LocalEndpointFor.ts.json`).

**What to do.**
1. Move, then fix imports until `bun run typecheck` passes in `apps/forge`.
2. In `PosixSocketEndpoint.ts` the socket folder becomes `PRIVATE_FOLDER_NAME`; in `EndpointInstanceFacts`
   (`LocalEndpoint.ts:7-12`) rename `jobId` to `name`, since Talos's endpoint names no job.
3. `WorkerProfiles.ts:226` and `:239` deny `join(monitorFolder, PRIVATE_FOLDER_NAME)`; the comment at `:221-224` says
   `private` folder.
4. Check `src/PlatformBoundary.spec.ts` (`:219`, `:412-442`): paths that name `src/lib/watcher/` for adapters move to
   `src/lib/talos/`; planted paths in the spec may stay as they are planted text, but rename them for clarity.

**Specs.** Moved specs pass unchanged but for paths. `PosixSocketEndpoint.spec.ts` now proves the `private/` folder.
`WorkerProfiles.spec.ts` proves the deny of `<monitor>/private`.

**Done when.** `bun run typecheck` and `bun run lint` in `apps/forge`, then `bun run verify` at the root, are green;
`git grep -n "watchers'" apps/forge/src` finds no folder name.

### WP2.5 Talos frames, records, start file and files

**Purpose.** Fix the protocol and every stored format before any process speaks them, with a frozen table of the
handshake so its first frame can never change shape.

**Files.**
- Create `src/lib/talos/constants/TalosProtocol.ts`, `src/lib/talos/@types/TalosFrame.ts`,
  `src/lib/talos/TalosFrames.ts`, `src/lib/talos/ChildLaunch.ts`, `src/lib/talos/ChildRecord.ts`,
  `src/lib/talos/TalosRecord.ts`, `src/lib/talos/TalosStartFile.ts`; extend `src/lib/talos/TalosFiles.ts`.
- Create `src/lib/talos/FrozenTalosHandshake.json` and `src/lib/talos/TalosHandshake.frozen.spec.ts`.
- Create `TalosFrames.spec.ts`, `ChildLaunch.spec.ts`, `ChildRecord.spec.ts`, `TalosRecord.spec.ts`,
  `TalosStartFile.spec.ts` beside each module.
- Change `src/lib/talos/EventLog.ts`: origin `watcher` becomes `talos`; `EVENT_LOG_FORMAT_VERSION` moves to
  `TalosProtocol.ts` as `2`. The Watcher, still alive until WP2.15, writes origin `talos` from here on.

**What to do.**
1. Write every type of "Interfaces introduced", sections "Constants", "Frames", "Launch", "Records", "Start file" and
   "Files", exactly as given.
2. `TalosFrames.ts`: `clientFrameOf(line): ClientFrame | null` and `talosFrameLineOf(frame): string`, following
   `src/lib/watcher/WatcherFrames.ts:11-41`. Every field is validated; extra keys are dropped; `frameId` is a safe whole
   number `>= 1`; a `write-line` holds no line feed. Beside them, `clientEntryLineOf(entry)` and `clientEntryOf(line):
   ClientEntry | null` for the event log's `client` lines.
3. `helloFrameOf(line)` is separate from `clientFrameOf` and reads only the three keys of the frozen `hello`. It is the
   one parser of a connection's first line, so a change to the later frames can never change how a first line reads.
4. `ChildLaunch.ts`: `childLaunchOf(value, boardFolder, endpointFits?)` validates as
   `src/lib/watcher/WatcherLaunch.ts:70-122` does, and adds: `childFolder` is relative, `/`-separated, non-empty, has no
   `..` or empty segment, and resolves under `boardFolder`; `instance >= 1`; a `line` has `standingReplies: []`,
   `closingLine: null`, `endingPatterns: []` and `quitAtTurnEnd: null`; `timeBoundMilliseconds` is `null` or a whole
   number `> 0` and only on a `line`. Export `childIdOf(childFolder, instance)` (`${childFolder}#${instance}`).
5. `ChildRecord.ts`, `TalosRecord.ts`, `TalosStartFile.ts`: a `...TextOf(record)` writer (two-space JSON and a final
   line feed, as `src/lib/watcher/WatcherRecord.ts:35-37`) and a `...Of(text)` reader that answers a verdict: `{
   verdict: 'read', record } | { verdict: 'unreadable', reason } | { verdict: 'other-format', formatVersion }`. A reader
   never throws (`apps/forge/CLAUDE.md:104`).
6. `TalosFiles.ts`: the path functions of "Files", nothing else.
7. `FrozenTalosHandshake.json` holds one example line of `hello`, `version-mismatch` and `refused` for each reason, and
   a `retake` key: "Never retaken. A change to these lines is a change of the frozen handshake, which design decision 6
   forbids." This is the deliberate exception to "a frozen table comes from the previous implementation" and goes into
   the Deviations table in WP2.17.

**Specs.**
- `TalosHandshake.frozen.spec.ts` proves: each frozen line parses with `helloFrameOf` or is written byte for byte by
  `talosFrameLineOf`; the key sets of the three frozen frames equal the table's.
- `TalosFrames.spec.ts`: every well-formed frame reads as itself; each malformed field reads `null`; `hello` is not a
  `ClientFrame` after the first line; every `ClientEntry` round trips through its line.
- `ChildLaunch.spec.ts`: each refusal by name, `..` and an absolute `childFolder` among them; a line with a pattern is
  refused.
- `ChildRecord.spec.ts`, `TalosRecord.spec.ts`, `TalosStartFile.spec.ts`: round trip; another format version reads
  `other-format`; truncated text reads `unreadable`.

**Done when.** `bun test --path-ignore-patterns='.claude/**' ./src/lib/talos/` passes, the root `bun run verify` is
green.

### WP2.6 The synchronous-calls thread

**Purpose.** Talos's main thread does no synchronous work (no program run with `spawnSync`, no `fsync`, no blocking
write): every process-table read, signal, record write and event-log append runs, in order, on one Bun `Worker` thread.
The process-identity readers spawn `/bin/ps` synchronously (`src/lib/process-identity/ProcessSupervisionFor.ts:19`), and
the atomic-file package writes synchronously; both are reused unchanged on that thread.

**Files.**
- Create `src/lib/talos/SynchronousCallsThread.ts` (the worker's entry module: its import is the invocation),
  `src/lib/talos/SynchronousCallsClient.ts` (the main thread's proxy), `src/lib/talos/@types/SynchronousCall.ts`.
- Create `src/lib/talos/SynchronousCallsClient.spec.ts` (over a fake transport) and
  `src/lib/talos/SynchronousCallsThread.integration.spec.ts` (a real worker).
- Change `src/lib/talos/` main module header (it is `Talos.ts`, created in WP2.7; until then put the dependency sentence
  in `SynchronousCallsThread.ts` and move it in WP2.7): "It depends on `src/lib/atomic-file`, `src/lib/owner-only-files`
  and `src/lib/process-identity`."
- Change `src/testing/BoundarySpecs.ts` and `BoundaryRecordings.ts`: a boundary
  `src/lib/talos/SynchronousCallsThread.ts` of the system `OPERATING_SYSTEM` with the integration spec.

**What to do.**
1. The request and answer types are in "Interfaces introduced", section "Synchronous calls".
2. `SynchronousCallsThread.ts` reads its platform and `SystemRoot` from the first message, builds
   `processSupervisionFor(platform, systemRoot)` and one `EventLogWriter` per open event log, and answers each request
   in arrival order. A thrown error answers `{ verdict: 'failed', reason }`; it never ends the thread.
3. `SynchronousCallsClient.ts` exports `createSynchronousCalls(transport)` with one async method per call kind, each
   answering a promise; `transport` is `{ post(request), onAnswer(listener) }`, so the spec runs without a worker. The
   real transport is `new Worker(new URL('./SynchronousCallsThread.ts', import.meta.url))`.
4. Prove before anything builds on it that a worker started from `talos.ts` loads its module at start: the worker is
   created once when Talos starts and never again, so a pull of the program cannot give it other code.

**Specs.**
- `SynchronousCallsClient.spec.ts`: answers reach the promise of their own `callId`; a failure rejects only its call;
  calls posted in order are answered in order.
- `SynchronousCallsThread.integration.spec.ts` (real-system): the worker reads this process's identity; appends three
  event-log entries and reads them back after `sync-and-close-event-log`; while the worker runs a `stop-tree` of a
  sleeping child, a main-thread timer of 50 milliseconds still fires within its bound.

**Done when.** `bun run record src/lib/talos/SynchronousCallsThread.ts` in `apps/forge` passes and writes its darwin
recording; `bun run verify` at the root is green.

### WP2.7 The Talos process, part one: start, handshake, lines

**Purpose.** The process itself, with the frozen handshake, the version mismatch quit, and line children with their time
bound. Agents follow in WP2.8, so this package stays one sitting.

**Files.**
- Create `talos.ts` at `apps/forge/` (the entry, beside `agent-progress.ts`, because the Overseer spawns it from the
  program's root as it spawned `watcher.ts`).
- Create `src/lib/talos/Talos.ts` (`runTalos`, `runTalosOnPorts`; the main module, whose header declares the
  dependencies), `src/lib/talos/TalosSocketServer.ts` (from `src/lib/watcher/WatcherSocketServer.ts`),
  `src/lib/talos/ChildSupervisor.ts` (line children now, agents in WP2.8), `src/lib/talos/LaunchRegistry.ts`.
- Create `src/lib/talos/TalosClosure.spec.ts` (from `WatcherBundleClosure.spec.ts`),
  `src/lib/talos/TalosMainThread.spec.ts`, `src/lib/talos/TalosSocketServer.spec.ts`,
  `src/lib/talos/Talos.lines.integration.spec.ts`, `src/lib/talos/Talos.handshake.integration.spec.ts`,
  `src/testing/TalosProtocolClient.ts` (from `src/testing/WatcherProtocolClient.ts`), `src/testing/ScratchTalos.ts`
  (writes a start file and spawns `talos.ts`).
- Change `src/ImportDirection.spec.ts` (a layer `talos-binary` for `talos.ts`, as `:68-69`, `:221`, `:334` hold the
  Watcher binary), `src/PlatformBoundary.spec.ts` (`talos.ts` composition root line beside `:90-91`, `:211`),
  `eslint.config.js` (`talos.ts` beside `watcher.ts` at `:27`, `:38`, `:47-48`, `:116-117`),
  `src/RealSystemSpecs.spec.ts` (helpers that reach Talos), `src/SpecSleeps.spec.ts` (only if a child script sleeps),
  `src/testing/BoundarySpecs.ts`, `src/testing/BoundaryRecordings.ts` (boundary `src/lib/talos/Talos.ts`,
  `OPERATING_SYSTEM`).
- Change `src/lib/process-identity/ProcessSupervision.ts:18` and `SpawnOptionsFor.ts:15-21`: add the kind `talos` with
  the options of `watcher` (the kind `watcher` goes in WP2.15).

**What to do.**
1. `talos.ts` does what `watcher.ts:6-11` does: `process.exit(await runTalos(Bun.argv.slice(2), stampNow,
   process.platform, process.env['SystemRoot'], ownVariableOf))`. Its arguments are `<board folder> <start number>`.
2. `runTalosOnPorts`:
   1. Read `start-<n>.json` (WP2.5); unreadable, another format or another start number exits 1 writing nothing else.
   2. Start the synchronous-calls thread; read Talos's own identity through it.
   3. Claim `talos-<n>.json` exclusively with state `claimed` (through the thread, `write-record` with `exclusive:
      true`); `already-exists` exits 0, as a second Watcher of a claimed instance does
      (`src/lib/watcher/Watcher.ts:430`).
   4. Prepare and bind the endpoint of the start file; `unbindable` writes state `quit` with `quitReason:
      'start-refused'` and exits 1.
   5. Write state `serving`; tick every `tickMilliseconds` with `setInterval`; serve until a quit.
3. `TalosSocketServer.ts`: per connection, the first complete line goes to `helloFrameOf` only. A line past
   `TALOS_CLIENT_LINE_LIMIT_CHARACTERS` before the first line feed is refused `malformed` before any secret is checked,
   as `WatcherSocketServer.ts:117` does. Then:
   - no `hello`, or a malformed one: `refused` `malformed`, close;
   - a secret that does not match in constant time: `refused` `secret`, close;
   - `requiredProtocolVersion !== TALOS_PROTOCOL_VERSION`: `version-mismatch` with Talos's version, close, then the
     clean quit with `quitReason: 'protocol-mismatch'` (in this package lines only; agents in WP2.8). The secret is
     checked before the version, so nobody without the secret can make Talos quit;
   - while Talos is quitting: `refused` `quitting`, close;
   - otherwise `welcome`, and the connection takes client frames. Every client frame is answered by exactly one `done`.
4. `launch` of a `line`: `childLaunchOf`; refused answers `done` `refused` `malformed-launch` or `folder-outside-board`;
   a `childId` Talos launched before answers `done` `already-done` and spawns nothing. Otherwise append the launch to
   `launches-<n>.ndjson`, write the child record `starting`, spawn with `Bun.spawn` (stdin `ignore`, stdout `pipe`,
   stderr to `child-<i>.log`, the port's options for `supervised-child`), read the identity, write `running`, broadcast
   `state`, answer `done`. A spawn that throws writes `ended` with reason `spawn-failed` and answers `done` (the record
   is the answer).
5. Each stdout line goes to the event log as origin `agent`, numbered by the main thread from 1.
6. `stop`: the procedure of `src/lib/watcher/Watcher.ts:216-244` (list the tree, close stdin, `ask` after the grace,
   `force` sweep after a second grace), its calls through the thread. The child's end comes from `supervision.endOf`, as
   `Watcher.ts:345` does.
7. `stop-lines`: a `stop` with grace 0 for every live line.
8. The time bound: a line with `timeBoundMilliseconds` gets `allowanceEndsAtWall = launchWall + bound`. On every tick,
   add `gapLengthOf(previousTick, now, tick)` to the allowance of every live line (decision 37), and stop a line whose
   allowance passed with grace 0; its end reason is `time-bound` whatever its exit code. Keep the sum of the gaps added
   to each live child, a line or an agent, and write its `ChildEnd.runMilliseconds` at its end: the wall time from its
   spawn to its end less that sum, the measure the bound uses (decision 36); a spawn that failed has 0.
9. At a child's end: drain stderr as `CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS` bounds it, `sync-and-close-event-log`,
   then write the record `ended`, then broadcast `state`. The order is the Watcher's (`Watcher.ts:463-466`): a reader
   that sees `ended` has the whole log.
10. A failed synchronous call writes its cause to `talos-<n>.log` and ends Talos with exit code 2, leaving the records
    as they are, so the Overseer reads Talos as lost (as `Watcher.ts:88-95` and `:432-437` do for a Watcher). The one
    synchronous write allowed on the main thread is this last log line, after which the process exits; say so in a
    comment at the site.
11. `TalosClosure.spec.ts` holds that the closure of `talos.ts` stays in `src/lib/talos/` and its declared packages,
    names no product and no vendor (`/agent-progress|claude|anthropic/i`), and reaches the builtins it lists.
12. `TalosMainThread.spec.ts` holds that no module in the closure of `talos.ts`, outside the closure of
    `SynchronousCallsThread.ts`, calls an identifier ending in `Sync`, `spawnSync`, `Bun.sleepSync` or `Atomics.wait`,
    with a planted case for each, the exact exception of item 10 named in an allowlist. The scan is over static imports;
    a type-only import is no runtime edge (check how `src/testing/ImportGraph.ts` treats `import type`, and plant one).

**Specs.**
- `TalosSocketServer.spec.ts` (over `src/testing/RecordedLocalEndpoint.ts`): the line limit before the secret; each
  frozen answer; one `done` per frame; a frame before `hello` is no frame.
- `Talos.handshake.integration.spec.ts` (real): a wrong secret is refused and Talos keeps serving; a `hello` of protocol
  0 and one of `TALOS_PROTOCOL_VERSION + 1` each get `version-mismatch` and Talos's record reads `quit`
  `protocol-mismatch` and its process is gone; a second Talos of the same start number exits 0 and spawns nothing.
- `Talos.lines.integration.spec.ts` (real, small `bun -e` children): a line's stdout lines are numbered in the event
  log; its stderr is in `child-<i>.log`; its record names both identities and its end; `stop` reaches a group below the
  child (as `src/lib/watcher/Watcher.processTree.integration.spec.ts`); a line with a 300-millisecond bound ends
  `time-bound` with a `runMilliseconds` of at least 300; a Talos suspended (`SIGSTOP`, tick gap 200 milliseconds) for
  longer than a line's bound and then continued (`SIGCONT`) does not end that line `time-bound`, and the line's
  `runMilliseconds` leaves the suspension out (skipped on Windows through `src/testing/ToolGuard.ts`); `stop-lines`
  ends every line; a launch outside the board folder is refused; the same `childId` twice spawns once.

**Done when.** `bun run record src/lib/talos/Talos.ts` in `apps/forge` passes and writes its recording; the root `bun
run verify` is green.

### WP2.8 The Talos process, part two: agents, lease, clean quit

**Purpose.** Agent children with input, standing replies and recognised endings; the lease with the wake rule; the clean
quit within 10 seconds.

**Files.**
- Change `src/lib/talos/ChildSupervisor.ts`, `src/lib/talos/Talos.ts`.
- Create `src/lib/talos/CleanQuit.ts` (the procedure, over the supervisor), `src/lib/talos/CleanQuit.spec.ts` (over a
  fake supervisor and a fake clock), `src/lib/talos/Talos.agents.integration.spec.ts`,
  `src/lib/talos/Talos.lease.integration.spec.ts`, `src/lib/talos/Talos.cleanQuit.integration.spec.ts`.

**What to do.**
1. An `agent` child gets stdin `pipe`. `input` `write-line` writes the line and a line feed; `close` closes stdin; a
   `stop` of an agent stops it. Each is first appended to the event log as origin `client`, its line the JSON of a
   `ClientEntry` ("Interfaces introduced"), as the Watcher appends each acting frame whole (`Watcher.ts:258`): the
   transcript and the turn reader tell a sent chat from a closed input by it (`JobTranscript.ts:89-94`,
   `JobLiveFactsReader.ts:241-246`). Input to a line, to an ended child or to an unknown one answers `done` `refused`
   with `kind-takes-no-input`, `child-ended` or `unknown-child`.
2. Each stdout line of an agent: parse once with `parsedLineOf`; (a) the standing replies answer it as
   `src/lib/watcher/Watcher.ts:337-340` does, the reply appended as origin `talos`; (b) the ending recognition of WP2.1
   observes it with the sequence the main thread gives it. When it answers a recognised ending, queue first the record
   write with the ending appended to `recognisedEndings`, then the event-log append of the line, then broadcast `state`
   with the ending. This order is load-bearing: a reader that sees the line in the log finds the recognition in the
   record read after it (WP2.13, observation order).
3. The lease: `createSupervisionLease` from the start file's bounds. `lease-renewal` calls `renewed` and answers `done`.
   The tick calls `ticked`; on `'lease-ended'` run the agent half of the clean quit with end reason `lease-ended`: lines
   are not touched, Talos keeps serving, the record's `lease.standing` is written on each change of standing (never per
   renewal).
4. `CleanQuit.ts`, for a `quit` frame (reason `restart`) and for a version mismatch (reason `protocol-mismatch`):
   1. Write the Talos record `quitting`; refuse new launches with `quitting`.
   2. Every live line: stop with grace 0, end reason `paused`.
   3. Every live agent: apply its `quitAtTurnEnd` (`close-input` closes stdin, `write-line` writes the line); note end
      reason `paused`.
   4. Wait until every agent ended or `cleanQuitWaitMilliseconds` passed, on a monotonic timer (`performance.now()`);
      then stop every agent still live with grace 0.
   5. Wait for every end to be recorded, bounded by the stop sweep's own attempts.
   6. Write the Talos record `quit` with the reason; close the server; end the thread; exit 0.
   An end that Talos caused for a reason (`paused`, `lease-ended`, `time-bound`) is recorded with that reason, and the
   exit code and signal are kept beside it.
5. The tree stop at the end (`treeStopAtEndGraceMilliseconds`, `Watcher.ts:274-281`) runs when an agent ends with no
   stop asked for.

**Specs.**
- `CleanQuit.spec.ts`: an agent that ends within the wait ends `paused` with its exit code; one that does not is stopped
  at the wait's end and ends `paused`; lines are stopped at once; nothing is launched while quitting.
- `Talos.agents.integration.spec.ts` (real, fake agent `src/testing/fake-agent/FakeAgentChild.ts` where it fits): a
  permission request is answered by the standing reply and a question is not; `write-line` reaches the child; `close`
  ends it; each input is in the event log as a `client` entry before its effect; a child that prints stage 0's
  `network-outage-retries-spent.stdout.jsonl` line by line (a plain `bun -e` child, since the fake agent prints only
  its own recording), launched with the patterns WP2.2 renders, records `recognisedEndings` with `name:
  'network-outage'`, the closing line's sequence and the retry count, and the record holds the recognition before the
  event log holds the line (read the record after the log in a loop of `src/testing/WaitUntil.ts`).
- `Talos.lease.integration.spec.ts` (real; bounds from the start file: lease 600, interval 150, tick 50, gap 200
  milliseconds): renewals keep agents running; silence ends agents `lease-ended` and leaves a line running; a renewal
  after that holds the lease again; a Talos process suspended (`SIGSTOP`) for longer than the lease and continued
  (`SIGCONT`) with a renewal following within the grace stops nothing. Skip the suspension case on Windows through
  `src/testing/ToolGuard.ts`.
- `Talos.cleanQuit.integration.spec.ts` (real; quit wait 300 milliseconds): `quit` ends agents and lines `paused`,
  writes `quit` `restart`, and the process exits within the wait plus the stop sweep; a mismatch quit does the same with
  `protocol-mismatch`.

**Done when.** `bun run record src/lib/talos/Talos.ts` passes; the root `bun run verify` is green.

### WP2.9 The Overseer's side: connection, start, lease renewal on progress

**Purpose.** The Overseer finds, starts and talks to its board's Talos at the required protocol version, and renews the
lease from its main loop only while its passes make progress, so a hung Overseer loses it (decisions 9 and 38; design
section 3.2, "Renewal that only progress earns").

**Files.**
- Create in `src/services/overseer/`: `TalosConnection.ts`, `TalosStart.ts`, `LeaseRenewal.ts`, and specs
  `TalosConnection.spec.ts` (over the recorded endpoint), `TalosStart.spec.ts` (over fakes of the connection and the
  spawn), `LeaseRenewal.spec.ts` (over a fake connection, a fake clock and a fake pass progress),
  `TalosStart.integration.spec.ts` and `LeaseRenewal.integration.spec.ts` (real).
- Change `src/shared/constants/OverseerLimits.ts`: add the Overseer constants of "Interfaces introduced".
- Change `src/services/overseer/ProcessStarts.ts`: add `startTalos` so specs replace the spawn.
- Change `src/testing/BoundarySpecs.ts`, `BoundaryRecordings.ts`: boundaries `src/services/overseer/TalosStart.ts` and
  `src/services/overseer/LeaseRenewal.ts`, `OPERATING_SYSTEM`.

**What to do.**
1. `TalosConnection.ts` exports `connectToTalos({ endpoint, secret, localEndpoint, frameTimeoutMilliseconds })`: answers
   `{ verdict: 'welcomed', connection }`, `{ verdict: 'version-mismatch', protocolVersion }`, `{ verdict: 'refused',
   reason }` or `{ verdict: 'silent' }`. A `connection` has `send(frame): Promise<DoneFrame | 'no-answer'>` (it numbers
   `frameId`, waits for the `done` of that id up to the timeout), `onState(listener)`, `onClose(listener)` and
   `close()`. Data is read on every connection, also when the caller ignores it: a socket nobody reads never sees its
   `close` (`src/services/overseer/WatcherFleet.ts:221`).
2. `TalosStart.ts` exports `ensureTalos(context): Promise<TalosAvailability>` (see "Interfaces introduced"):
   1. Read the newest `talos-<n>.json`. If its state is not `quit` and its process is the recorded one (identity
      checked), connect with `TALOS_PROTOCOL_VERSION`.
   2. `welcomed` with the required version: answer `attached`.
   3. `version-mismatch`: wait, `TALOS_QUIT_TRIES` times every `TALOS_START_INTERVAL_MILLISECONDS`, for its record to
      read `quit` or its process to be gone; past that, stop its process with `force` (identity checked) and log it. Go
      to step 5.
   4. `refused` or `silent`, or a record not `quit` whose process is gone: Talos is lost. Stop its process if it still
      runs; sweep its orphans: every child of `launches-<n>.ndjson` whose record is not `ended` is settled by
      `settleLostChild` (the logic of `src/services/overseer/Regrouping.ts:102-124` on the child record and on Talos's
      boot identity, writing `child-<i>.lost-cause` and `child-<i>.refused-forced-stops`). Log it. The answer of step 6
      then carries `previousTalos: 'lost'` (`'quit'` after step 3, `'none'` when no record existed), the one fact stage
      3 reads to tell a crash of Talos from a start that found nothing to sweep.
   5. Start a new Talos: `n + 1`; write the secret owner-only (`writeOwnerOnlyFileAtomically`, as
      `WatcherFleet.ts:114-119`) at `<monitor>/private/<trackerId>/talos-<n+1>.secret`; draw the endpoint with `{ name:
      'talos', instance: n + 1 }`; write `start-<n+1>.json` with the bounds of `OverseerLimits.ts`; spawn
      `process.execPath`, `ToolRuntimeUtil.isolatingArgumentsOfThisCheckout()`, `TALOS_ENTRY_PATH`, the board folder and
      `n + 1`, detached and unreferenced, with `outlivingProgramEnvironment()` (`src/shared/Environment.ts:149`), its
      output appended to `talos-<n+1>.log`, cwd the repository root, the port's options for `talos`. `TALOS_ENTRY_PATH`
      is `join(import.meta.dir, '..', '..', '..', 'talos.ts')`, as `WatcherBundle.ts:18` finds `watcher.ts`.
   6. Wait for the record `serving`, then connect. `welcomed` at the required version answers `started`. A
      `version-mismatch` from the Talos just started means the program on disk is not the Overseer's code: answer `held`
      with reason `talos-protocol-differs`, and never start again within this Overseer's life.
3. `LeaseRenewal.ts` exports `startLeaseRenewal(request: LeaseRenewalRequest): LeaseRenewal` ("Interfaces
   introduced"). It sends one renewal at once, then runs a `setInterval` of `intervalMilliseconds` on the main loop. No
   worker thread and no second connection: a renewal is only worth what the main loop proves.
   1. Each tick reads the wall clock. A tick later than `intervalMilliseconds + tickGapMilliseconds` after the previous
      one, or earlier than it (a clock moved back), is a gap: it renews and remembers the pass in flight, as Talos's own
      wake rule gives a waking Overseer its chance (WP2.3).
   2. Otherwise it reads `passProgress.passInFlight()`. It renews when that is `null` (no pass runs: an idle Overseer
      has nothing to make progress on) or differs from the number the previous tick saw. It withholds when the same
      pass is in flight at two ticks in a row, and logs once per withheld streak: "The lease renewal is withheld: pass
      <n> has run for more than one renewal interval."
   3. A renewal sends a `lease-renewal` frame with the renewer over `connection()`. No connection, `no-answer` or a
      refusal is logged and waits for the next tick; `done` calls `onRenewed` with the tick's wall time. Nothing
      throws.
   4. `stop()` clears the timer; nothing else stops it, so it ends with the process.
   5. The file header names the clock rule it follows (`apps/forge/CLAUDE.md:176-178`: a heartbeat and a timeout
      measure real time) and says that progress is a pass number, never an elapsed time.
4. Nothing here is wired into the Overseer yet; WP2.13 does that.

**Specs.**
- `TalosConnection.spec.ts`: a `done` resolves its own frame only; a silent Talos answers `no-answer` after the bound; a
  `state` frame reaches the listeners; a close rejects nothing twice.
- `TalosStart.spec.ts` covers every branch of step 2 with fake records, fake identity and a fake spawn, and that a
  second `held` never spawns again.
- `LeaseRenewal.spec.ts`, on a fake clock: a renewal at start; an idle loop renews at every tick; a pass that ends
  between two ticks renews; the same pass at two ticks withholds, and the first tick after it ended renews; a late tick
  renews though the same pass is in flight; a clock moved back is a gap; no connection renews nothing and throws
  nothing; `onRenewed` runs only on `done`; a withheld streak logs once.
- `LeaseRenewal.integration.spec.ts` (real Talos from `src/testing/ScratchTalos.ts`; lease 600, interval 150, tick 50,
  gap 200 milliseconds): with an idle pass progress, an agent keeps running past twice the lease; with a pass progress
  that answers one number for ever (a pass that never ends), the agent ends `lease-ended` within the lease plus two
  intervals of the last renewal; with the main thread blocked in `Bun.spawnSync(['/bin/sleep', '1'])`, longer than
  the lease, the agent ends `lease-ended`, and the first tick after the block holds the lease again.
- `TalosStart.integration.spec.ts` (real): start from nothing; attach to a live Talos; a Talos of another protocol
  version (started from a start file with a test protocol override in `src/testing/ScratchTalos.ts`) quits and a new one
  starts; a Talos killed with `SIGKILL` leaves its orphan line, which `ensureTalos` stops before it starts the next one.

**Done when.** `bun run record src/services/overseer/TalosStart.ts` and `bun run record
src/services/overseer/LeaseRenewal.ts` pass; the root `bun run verify` is green.

### WP2.10 The `BoardChildren` port over the Watcher fleet

**Purpose.** Every consumer of the fleet goes through one port, still backed by the Watcher, so the switch in WP2.13 is
a change of one composition and no behaviour moves here.

**Files.**
- Create `src/services/overseer/BoardChildren.ts` (the port type, exactly as in "Interfaces introduced") and
  `src/services/overseer/WatcherBoardChildren.ts` (an adapter over `WatcherFleet`, deleted in WP2.15).
- Change every caller listed by `git grep -ln "WatcherFleet\." -- apps/forge/src apps/forge/cli ':!*.spec.ts'` except
  `WatcherFleet.ts` itself and the boundary lists: in `src/services/overseer/`, `DrivePass.ts`, `JobLaunch.ts`,
  `Regrouping.ts`, `JobControlDelivery.ts`, `AnswerDelivery.ts`, `JobResumption.ts`, `AssistantSession.ts`,
  `IntakeSessions.ts`, `PipelineAgentSessions.ts`, `CrossingStages.ts`, `EndedJobTokens.ts`, `JobLiveFactsReader.ts`,
  `JobTranscript.ts`, `GateRunSlots.ts`, `FlintBrainSessionHost.ts`; `Airlocks.ts` reaches the fleet only through its
  context's `watcherIsLive` (`Airlocks.ts:112`, `:794`); `cli/overseer/OverseerForeground.ts`, `cli/jobs/JobCommand.ts`,
  `cli/overseer/routes/OverseerRoutes.ts`, `cli/testing/CutoverSmoke.ts`;
  `src/services/overseer/testing/CrossingStageRun.ts`; and the specs and harnesses the compiler names
  (`src/testing/DrivePassHarness.ts`, `src/services/overseer/testing/LiveJobFixture.ts`). `ProcessStarts.ts`
  (`spawnWatcher`) and the Watcher's own harnesses (`src/testing/RecordedWatcherStages.ts`,
  `src/services/overseer/testing/PlantedWatcher.ts`) keep the fleet until WP2.13 and WP2.15.

**What to do.**
1. The port takes and answers the types of "Interfaces introduced". The Watcher adapter maps `WatcherLiveness`
   (`WatcherFleet.ts:35-40`) to `ChildLiveness`: `unclaimed` to `unlaunched`, an `ended` Watcher's `WatcherEnd` to a
   `ChildEnd` with the same reason, exit code and signal, `recognisedEndingsOf` answers `[]`, `launchAgent` and
   `launchLine` write the launch file and spawn the Watcher as today and answer `{ verdict: 'launched' }`.
2. Pass the port where `WatcherFleet` was imported: through `JobLaunchContext` (`JobLaunch.ts:114-136`), the
   `DrivePassRequest`, the Airlocks context and the request objects of the delivery modules. A module that imported
   `WatcherFleet` imports only the `BoardChildren` type.
3. Keep every log sentence and every marker file as it is.

**Specs.** No new claim; every existing spec stays green with the port injected. Add `WatcherBoardChildren.spec.ts` only
for the mapping of item 1.

**Done when.** `git grep -ln "WatcherFleet\.ts'" -- apps/forge/src apps/forge/cli` names only `WatcherBoardChildren.ts`,
`ProcessStarts.ts`, the Watcher's own harnesses and specs of the fleet itself; the root `bun run verify` is green.

### WP2.11 New interruption causes in the tracker model and the monitor document

**Purpose.** A lease end, a clean quit and a network outage each get a cause of their own that is not counted as a crash
(design section 3.2, "An end of its own"); a lease end and an outage wait for the user's resume (decisions 35 and 38);
and each cause reaches Gaia as itself, in the monitor document it already reads.

**Files.**
- Change `src/lib/tracker-model/@types/Job.ts:83-91` (and its comment above),
  `src/lib/tracker-model/constants/JobStates.ts:73-91`, `src/lib/tracker-model/Playbook.ts` (`crashBoundStepsOf`,
  `:473-489`, and `productOwnerStepsOf`, `:418-425`).
  `src/adapters/log/LogRecordProblem.ts:181` and `src/adapters/progress/utils/StoredJobValidationUtil.ts:102` validate a
  cause against `INTERRUPTION_CAUSES` and take the new ones with no change. No code words a cause one by one:
  `src/adapters/utils/LogUtil.ts:301-304` prints the stored value, and the Bridge reads only `usage-limit` and
  `handoff-red` (`bridge/views/agents/AgentPanelSpriteModel.ts:66`, `:164`).
- Change `packages/forge-contracts/@types/MonitorSnapshotDocument.ts`: `MonitorJobDocument` (`:63-86`) gains
  `interruption`; the contract declares `MONITOR_INTERRUPTION_CAUSES` and `type MonitorInterruptionCause` on its own,
  importing nothing from forge (decision 50).
- Change `src/services/overseer/MonitorSnapshotAssembly.ts` (`jobOf`, `:235-262`) and
  `src/shared/monitor/@types/MonitorSnapshot.ts` (`MonitorJob` extends the document).
- Change `apps/gaia/src/adapters/forge-api/MonitorSnapshotIngestion.ts` (`JOB_SHAPE`, `:67-89`: `ShapeOf` names every
  key of the document, so the key lands in the same commit),
  `apps/gaia/src/adapters/forge-api/utils/ForgeReadingMapUtil.ts` (`agentRowOfMonitorJob`, `:86-111`;
  `agentRowOfSummaryJob`, `:114-138`) and `apps/gaia/src/shared/@types/AgentRow.ts`.
- Change `packages/forge-contracts/constants/ForgeSystemVersions.ts` (`:41`): the stage's one minor raise.
- Change the specs: `src/lib/tracker-model/Playbook*.spec.ts` touched by the rule, `Board.jobs.spec.ts`,
  `src/adapters/utils/LogUtil.spec.ts`, `src/services/overseer/MonitorSnapshotAssembly.spec.ts`, and Gaia's specs of
  the monitor ingestion and the reading map.

**What to do.**
1. Add `'talos-paused'`, `'lease-ended'`, `'network-outage'` to `InterruptionCause` and `INTERRUPTION_CAUSES`; leave
   `CRASH_INTERRUPTION_CAUSES` as it is.
2. Export from `JobStates.ts` `INTERRUPTION_CAUSES_HELD_FROM_RESUMING = ['network-outage', 'lease-ended']`, the one
   list the Playbook reads for the causes that wait for the user's resume.
3. In `crashBoundStepsOf`, after the red handoff line (`Playbook.ts:480`) and before the session-kind replace rule
   (`:481`, `if (SESSION_JOB_KINDS.includes(job.kind)) return [{ kind: 'replace-job' ... }]`) and the pipeline agent's
   branch (`:483`), a job whose interruption is in that list gets no step. In `productOwnerStepsOf`, the same before its
   resume. `talos-paused` follows the path of `reboot`: resumed by itself, never counted.
4. `outageIsDueWith` (`Playbook.ts:188-200`) counts only crash causes, so it needs no change; add a spec case that
   proves a `network-outage` or `lease-ended` interruption breaks no run of counted crashes and adds none.
5. Wording: none is needed (see "Files"); `LogUtil.spec.ts` holds that a `job-interrupted` record of each new cause
   prints the cause as stored, naming no command (`apps/forge/CLAUDE.md:90-92`).
6. The monitor document: `MONITOR_INTERRUPTION_CAUSES` lists the eleven causes as the wire spells them (`watcher-lost`
   as `child-lost`, since the contract carries no name stage 9 retires), and
   `MonitorJobDocument.interruption` is `MonitorInterruptionCause | null`. `jobOf` serves the job's cause while its
   state is `interrupted` and `null` otherwise (the model keeps the last cause after a resume; a served fact does not),
   mapped through one record `Readonly<Record<InterruptionCause, MonitorInterruptionCause>>` in the assembly, so a new
   model cause fails the compiler until it is mapped.
7. Gaia: `JOB_SHAPE` reads `interruption` as `{ nullable: { oneOf: MONITOR_INTERRUPTION_CAUSES } }`, and `AgentRow`
   gains `interruption: string | null`, the monitor job's cause and `null` from a summary. Nothing in the page reads it
   yet: Gaia's alert, its resume control and its mark of a forge that stopped supervising come with stage 6.
8. Raise `FORGE_SYSTEM_VERSIONS.current` to 1.19 with a sentence in its history comment: 1.19 adds a monitor job's
   interruption cause. WP2.13 and WP2.20 add their clauses to this sentence and raise nothing more.

**Specs.** `Playbook` specs prove: `network-outage` and `lease-ended` are neither resumed nor replaced, for a build, a
review, a session kind, a pipeline agent and a product owner; `talos-paused` resumes whatever `crashResumes` holds; none
of the three raises `crashResumes` (`src/lib/tracker-model/Jobs.ts:145-147`). `LogUtil.spec.ts` prints each cause.
`MonitorSnapshotAssembly.spec.ts`: a job interrupted `network-outage` serves `interruption: 'network-outage'`, one
interrupted `lease-ended` serves `'lease-ended'`, and a running job that was interrupted before serves `null`. Gaia's
specs: a monitor job's cause reaches its `AgentRow`; a value outside the list is a shape failure.

**Done when.** `bun test --path-ignore-patterns='.claude/**' ./src/lib/tracker-model/` and the assembly spec pass in
`apps/forge`, Gaia's ingestion specs pass in `apps/gaia`; the root `bun run verify` is green.

### WP2.12 The Talos adapter of `BoardChildren`

**Purpose.** The port answered by Talos: liveness from child records and Talos's record, events from the log, every act
through the one connection.

**Files.**
- Create `src/services/overseer/TalosChildren.ts` and `src/services/overseer/TalosChildren.spec.ts` (over the recorded
  endpoint and fake records).
- Change `src/testing/` helpers as needed: `src/testing/PlantedChild.ts` (replaces
  `src/services/overseer/testing/PlantedWatcher.ts` for new specs; the old one goes in WP2.15).

**What to do.**
1. `createTalosChildren({ boardFolder, platformPorts, connection: () => TalosConnection | null, talosLiveness })`.
2. `livenessOf(childFolder, instance)`: no record, `unlaunched`; a record `ended`, `ended` with its end; a record of
   another format, `lost`; otherwise `live` when the Talos of `talosStartNumber` is live, `lost` when it is not. Talos's
   liveness is the identity check of its record's process, memoised per pass through `beginPass()`, which the pass calls
   first: one process-table read per pass where the fleet read one per job (`WatcherFleet.ts:95`).
3. `eventsAfter` reads `events-<i>.ndjson` with `eventLogEntriesOf`; a malformed log answers `'malformed'`.
4. `recognisedEndingsOf` reads the record's `recognisedEndings`.
5. `launchAgent` and `launchLine` write the plan's files first (`plan.files`, as `WatcherFleet.ts:137-140`), build the
   `ChildLaunch` (mapping `AgentLaunchPlan` to `ChildLaunch`, with a `satisfies` check that the plan's condition types
   fit Talos's), send `launch`, and answer `launched`, `already-launched`, `refused` with the reason, or
   `talos-unavailable` when no connection is welcomed or the frame got no answer.
6. `sendInput`, `stop` and `stopLiveLines` send their frame and answer whether Talos answered `done`. `sendInputOnce`
   writes its marker only after `done`: delivery is at least once, as `WatcherFleet.ts:235-247` says, but now a frame
   counts as taken only when Talos said so.
7. `newestInstanceIn(childFolder)` scans `child-<i>.json` names.

**Specs.** `TalosChildren.spec.ts` proves each liveness verdict (a record left `running` by a Talos whose process is
gone reads `lost`); `beginPass` reads Talos's identity once for many children; a marker is written only after `done`; a
launch writes the plan's files before the frame.

**Done when.** The spec passes; the root `bun run verify` is green.

### WP2.13 The switch to Talos

**Purpose.** The Overseer runs every agent and every job line under Talos, renews the lease from its main loop while its
passes make progress, and maps every Talos end to the job. Must run alone: it touches the pass, the start, the stop and
the Baton pass.

**Files.**
- Change `cli/overseer/OverseerForeground.ts`, `src/services/overseer/DrivePass.ts`, `Regrouping.ts`, `JobLaunch.ts`,
  `GateRunSlots.ts`, `BatonPass.ts` (`BatonPassStep`, `:14-20`), `Baton.ts` (`talosProtocolVersion`),
  `OverseerServer.ts` (`talosProtocolVersion`), `FlintBrainSessionHost.ts`, `cli/overseer/OverseerFlintBrain.ts`,
  `SessionPlace.ts`, `JobTranscript.ts`, `JobLiveFactsReader.ts`; the identity key's clause in the 1.19 sentence of
  `packages/forge-contracts/constants/ForgeSystemVersions.ts` (WP2.11 raised the version).
- Change the specs that drive the pass: `cli/overseer/OverseerDrivePass*.spec.ts`, `OverseerBuildJob*.spec.ts`,
  `OverseerPipelineSetup.spec.ts`, `src/services/overseer/DrivePass*.spec.ts`, `JobLaunch.*.spec.ts`,
  `Regrouping*.spec.ts`, `CrashMatrix*.spec.ts`, `JobResumption*.spec.ts`, `SessionPlace.spec.ts`,
  `src/testing/DrivePassHarness.ts`, `src/services/overseer/testing/CrossingStageRun.ts`,
  `src/testing/RecordedWatcherStages.ts` (becomes recorded Talos stages).

**What to do.**
1. **Start.** In `startServing` (`OverseerForeground.ts:398-648`), right after the Baton is acquired (`:521-526`), call
   `ensureTalos`, then `startLeaseRenewal` (WP2.9) with the connection it answered, the renewer and the DrivePass's
   pass progress; it renews at once. `held` makes the start fail with `OperationRefusal('unrepaired', { kind:
   'talos-protocol-differs', requiredProtocolVersion, answeredProtocolVersion })`, worded in `cli/`. Remove
   `pinWatcherBundle` (`:379-383`) and the bundle path from every request.
   **Pass progress.** `runOnePass` (`DrivePass.ts:1330`) numbers its passes from 1 for the Overseer's life; the
   DrivePass exports `passInFlight()`, that number while a pass runs and `null` between passes (`drain`, `:1552-1566`).
   WP2.19 has taken the merged-tree gate out of the pass, so no pass waits through a gate line.
2. **Regrouping.** `regroup` keeps the leftover worktrees and the list of jobs whose current instance is unlaunched
   (`Regrouping.ts:204-244`), drops the hello and history (`:137-171`), and settles every job child that reads `lost`
   with `settleLostChild` (WP2.9).
3. **Observation order.** In `observe` (`DrivePass.ts:462-515`), per job: call `beginPass` once for the pass, then read
   the liveness, then the events after the cursor, then `recognisedEndingsOf`. The liveness read first keeps today's
   promise that an `ended` child's log is complete; the endings read last cover every line just read (WP2.8 item 2).
4. **Mapping ends** (`applyWatcherEvents`, renamed `applyChildEvents`, `DrivePass.ts:543-621`):
   1. A `result` event whose entry's sequence is a recognised `network-outage`: interrupt the job `network-outage`, add
      it to `stoppedSessions` so the pass stops the session after the hold, and treat it as no closing result. Map an
      `AgentEndingName` to its cause in one record in `DrivePass.ts`.
   2. A child that ended with reason `paused`: interrupt `talos-paused`, which resumes by itself. With reason
      `lease-ended`: interrupt `lease-ended`, which waits for the user's resume (WP2.11). Both before the
      `agent-crashed` branch (`:614-615`).
   3. `lost`: `lostWatcherCauseOf` as today (`:517-520`), on the child's side files; the stored cause stays
      `watcher-lost` until stage 9.
   4. Everything else as today.
5. **Launch.** `launchWatcher` (`:843-959`) becomes `launchAgentChild`, async, through `launchAgent`; the endpoint fit
   check (`:861-864`) and its notice `watcher-endpoint-does-not-fit` go, since the endpoint is Talos's.
   `talos-unavailable` leaves the job for the next pass. `jobsNeedingAWatcher` (`:977-989`) reads `unlaunched`.
   A job line's launch (`JobLaunch.ts:2401-2425`, `launchProcessWatcher`) loses its endpoint fit check the same way.
6. **Job lines** (`JobLaunch.ts`): `processWatcherEnd` (`:552-556`) becomes `lineEndOf(folder)`, reading the newest
   instance: `pending` while live or unlaunched, `rerun` when it ended `paused` or reads `lost`, otherwise its end. On
   `rerun` the next pass launches instance `newest + 1`; a step's verdict is read only from an end that is not `paused`.
   Every install, gate-prepare and gate step's launch carries `timeBoundMilliseconds: LINE_TIME_BOUND_MILLISECONDS`
   (decisions 29 and 36); a merge's carries `null`. An end `time-bound` reads as exit code `null` and signal `null`, so
   `GateRun.gateOutcomeOf` judges a gate `cannot-run` and an install step reads as not passed (`install-failed`,
   `JobLaunch.ts:575-586`); the step's output gets one line naming the bound, worded in
   `src/services/lifecycle/GateRun.ts` beside `RUN_REFUSAL_WORDING` (`:169-175`). A gate step's cache report file
   (`stepReportFileOf`, `JobLaunch.ts:798-800`, handed in `FORGE_GATE_REPORT`) is removed before each launch, a re-run
   included, as `spawnProcessWatcher` does today (`:2376-2377`).
7. **Gate slots.** Every holder is a child folder: `gateRunHolderIsLive` (`GateRunSlots.ts:107-118`) reads the newest
   child record of the folder through `BoardChildren`, and while none exists the recorded acquirer's identity answers.
   `process:` holders stay until WP2.14.
8. **Frames.** `JobControlDelivery`, `AnswerDelivery`, `JobResumption`, `AssistantSession`,
   `JobLaunch.deliverBuildJobFrames` (`JobLaunch.ts:2613-2626`) send through the port: `write` becomes `input`
   `write-line`, `close-input` becomes `input` `close`, `stop` stays. The readers of the event log's `client` entries,
   `JobTranscript.ts:89-94` and `JobLiveFactsReader.ts:241-246`, read them with `clientEntryOf` (WP2.5): `write-line`
   where they read `write`, `close` where they read `close-input` (the transcript's act stays `close-input`).
9. **Stop.** In the stop waits (`OverseerForeground.ts:778-792`): `--now` sends `stop-lines`; the reap of ended Watchers
   goes; the lease renewal is not stopped: its timer ends with the process, so a quick restart keeps every agent.
10. **Baton pass margin.** The predecessor keeps renewing through its release until it exits, because its renewal timer
    is never stopped in `release` (`:651-660`) and its stopped passes leave an idle loop, which renews; the successor
    starts its own renewal as soon as it holds the Baton and its Talos answered (item 1). The two overlap, which Talos
    accepts. The preparation steps (`:267-305`) lose `build-bundles` and
    `read-watcher-files` and gain `read-child-records` (every job's newest child record reads, its event log is not
    malformed). Update `BatonPassStep`.
11. **Flint's brain** runs as an agent child in `flint-brain/` through the port; its `acknowledgeEnd` and
    `reapRunsAtStop` (`FlintBrainSessionHost.ts:145-172`) shrink to reading the record, as nothing lingers.
12. Log sentences say "Talos" where they said "Watcher" in the lines this package touches.
13. **Talos lost while serving.** When the connection's `onClose` fires and Talos's record does not read `quit`, or
    `livenessOf` reads `lost` because Talos's process is gone (WP2.12 item 2), the next pass calls `ensureTalos` before
    it launches anything. In this stage its answer `started` with `previousTalos: 'lost'` only sweeps the orphans and
    serves on with the new Talos (verification step 8). This call and the one at start are the two places stage 3
    turns into a crash of Talos (its need N6); keep each a single call site so stage 3 changes one line in each.
14. **A resumed session's start folder.** `SessionPlace.ts:63-71` reads the session owner's first launch file
    (`launch-1.json`) for its `workingDirectory`, so a resumed session starts where its first instance started. No
    launch file exists under Talos: read `workingDirectory` from the owner job's first child record (`child-1.json`,
    through `childRecordOf` of WP2.5), with `null` as today when none is readable.

**Specs.**
- `cli/overseer/OverseerDrivePass.spec.ts` and the build job specs over recorded Talos stages prove: a launch is a
  `launch` frame; a recognised outage interrupts `network-outage`, the session gets a `stop`, and the job does not move
  to `in-customs`; an end `paused` interrupts `talos-paused` and resumes on the next pass; an end `lease-ended`
  interrupts `lease-ended` and nothing resumes it; a `lost` child is settled as before.
- `JobLaunch.gating.spec.ts`: a gate step ended `paused` is launched again as instance 2 and its first end is never
  judged; a `time-bound` end judges `cannot-run`; every install, gate-prepare and gate launch carries the bound and a
  merge's carries none. An install step ended `time-bound` reads `install-failed`.
- `DrivePass` specs: passes are numbered, `passInFlight()` answers the running pass's number and `null` between them.
- `SessionPlace.spec.ts`: a resumed session starts in the `workingDirectory` of its owner's first child record.
- `JobTranscript` and `JobLiveFactsReader` specs: a `write-line` entry reads as the chat it carries, a `close` entry as
  a closed input.
- `OverseerForeground` specs (find them with `git grep -ln runOverseerInTheForeground apps/forge/cli`): the renewal
  starts after the Baton and `ensureTalos`, before regrouping; `talos-protocol-differs` refuses the start.

**Done when.** `bun run verify` at the root is green, and `bun run verify:integration` in `apps/forge` passes, run once
when the owner asks for it at gate G4 (forge's rules allow it only on a person's word).

### WP2.14 The Overseer's own gates under Talos

**Purpose.** No child of the board runs outside Talos: merged-tree gates, which already run beside the pass (WP2.19),
gate profiles and pipeline checks become line children, bounded and timed as every pipeline line is (design sections
3.3 and 7, "What reconcile cannot see today"; decisions 36 and 37).

**Files.**
- Change `src/services/lifecycle/GateRun.ts` (with `runEntityPipelines`, `:370-390`), `GateLineRun.ts`,
  `ProposalTwiceRun.ts` and their specs, `GateRun.entities.spec.ts` among them.
- Create `src/services/overseer/TalosLines.ts` (the `LineRunner` over `BoardChildren` and the connection) and
  `TalosLines.spec.ts`.
- Change `src/services/overseer/DrivePass.ts` (`:1143-1277`), `MergedTreeGateRun.ts` and its spec,
  `MergedTreeGateRuns.ts` (WP2.19), `GateProfiling.ts` (with `endingOf`, `:162-170`, and `OUTCOME_ENDINGS`, `:55-59`),
  `PipelineChecking.ts`, `GateRunSlots.ts` (drop `inProcessHolderOf`, `:88-94`, `:109-113`; its callers are
  `DrivePass.ts:1261`, `GateProfiling.ts:254`, `PipelineChecking.ts:216`), `ProcessStarts.ts`,
  `src/services/overseer/testing/AirlocksHarness.ts`, `src/testing/RecordedWatcherStages.ts` (its `runGatePipeline`
  fake, `:475-492`).

**What to do.**
1. In `GateRun.ts` add the `LineRunner` and `LineRunRequest` types of "Interfaces introduced". Every request that
   carries `spawnOptions` today (`GateRequest`, `PipelineRunRequest`, and `GateLineRequest` in `GateLineRun.ts:18-27`)
   replaces `spawnOptions`, `onSpawned` and `onOutput` with `runLine` and `childFolder`, the folder of the run under
   the board folder. `runGate` (`:209-245`) keeps the status and report files and calls `runLine` instead of
   `Bun.spawn`. `runPipeline` (`:315-364`) gives each step the folder `<childFolder>/prepare-<i>` or
   `<childFolder>/gate-<i>`, from 1. `runEntityPipelines` runs one pipeline per gated entity, each numbering its steps
   from 1 again, so it hands part `p` (from 1, in run order) the folder `<childFolder>/part-<p>`;
   `EntityPipelinesRunRequest` (`:115`) and `MergedTreeGateRunRequest.runRequest` (`MergedTreeGateRun.ts:17-27`) carry
   `childFolder` with the rest.
2. `TalosLines.createLineRunner(children, connection)`: launch the line (kind `line`, label, folder, next instance,
   `timeBoundMilliseconds`), then wait for its end: the `state` frame of its `childId`, and as a fallback a look at its
   record every `TALOS_LINE_LOOK_MILLISECONDS` (a schedule only, never a decision). While waiting, hand each new event
   entry to `onOutputLine`. At the end, the output is every `agent` entry's line joined with line feeds.
   `talos-unavailable` answers a run with exit code `null`, which judges `cannot-run`, and a run time of 0. Every other
   end hands its `ChildEnd.runMilliseconds` on as `LineRunEnd.runMilliseconds`.
3. Run folders (`childFolder`), all under the board folder: a merged-tree gate the run folder WP2.19 gives it
   (`merge-gates/<16 hex>`), also when it re-gates a stale green (`Airlocks.ts:703`); a gate profile
   `gate-profile-runs/<profileRunId>`; a pipeline check `pipeline-checks/<checkName>/run-<r>`, where `checkName` is the
   setup id, or the setup id and the escaped entity key for an entity's check (`PipelineChecking.ts:92-95`), since the
   forge's and each entity's checks of one setup run side by side, and `r` is 1 or 2 for the proposal's two runs. Gate
   profiles keep `<data>/gate-profile-runs/<P>.ndjson` for their stream, appended from `onOutputLine`.
4. A Stop of a profile or a check sends `stop` with grace 0 to its running child (`GateProfiling.ts:190-198`,
   `PipelineChecking.ts:135-143`). Every prepare and gate line of these runs carries `LINE_TIME_BOUND_MILLISECONDS`. A
   profile whose gate ended `time-bound` ends `timed-out` (`GateProfile.ts:11`, declared and never produced today), and
   its `elapsedMilliseconds` is the gate line's `runMilliseconds`: `GateLineRun`'s own clock (`GateLineRun.ts:120-124`)
   and the request's `millisecondsNow` go.
5. At start, before `settleAtStart` removes worktrees (`GateProfiling.ts:262-266`, `PipelineChecking.ts:223-227`) and
   before WP2.19's `settleAtStart` removes run folders with no outcome, stop every live child under the three roots
   (`merge-gates/`, `gate-profile-runs/`, `pipeline-checks/`) and wait for their ends (bounded tries): their owner, an
   earlier Overseer's promise, is gone. Without this the next Overseer removes a worktree a line still runs in, or runs
   a merged-tree gate twice on one worktree.
6. Gate slots: the holder of every gate is its child folder; delete `inProcessHolderOf` and the `process:` branch.
7. `mergedTreeGateProcesses` and `stopMergedTreeGate` (`DrivePass.ts:1143-1150`) and the `onSpawned` bookkeeping of
   `runMergedTreeGatePipeline` (`:1152-1168`) go: `MergedTreeGateRuns.stopAll` sends `stop` to its runs' live lines,
   and the stop at the Overseer's `--now` is `stop-lines`.

**Specs.**
- `GateRun.spec.ts`, `GateRun.entities.spec.ts`, `GateLineRun.spec.ts`, `ProposalTwiceRun.spec.ts` and
  `MergedTreeGateRun.spec.ts` over a fake `LineRunner` prove what they proved over a spawn, and that two entity parts
  of one run never share a step folder.
- `TalosLines.spec.ts`: the end arrives by frame or by the look; output is the joined lines; the run time is the child
  end's; a `time-bound` end judges `cannot-run`; `talos-unavailable` judges `cannot-run`.
- `GateProfiling.spec.ts` and `PipelineChecking.spec.ts`: a Stop sends `stop`; the start stops leftover children before
  removing worktrees; a profile's gate ended `time-bound` ends the profile `timed-out`, its time the line's run time.
- `MergedTreeGateRuns.spec.ts`: the start stops a leftover run's live lines before it removes the run folder.
- `GateRunSlots.spec.ts`: a child-folder holder is live while its child is, and free once it ended or is lost.

**Done when.** `git grep -n "Bun.spawn(" apps/forge/src/services` finds no spawn of a gate line; the root `bun run
verify` is green.

### WP2.15 Removal of the fleet, the bundles and the legacy reader

**Purpose.** Delete everything of the Watcher, with no mixed fleet left (decision 32).

**Files.**
- Delete `watcher.ts`; `src/lib/watcher/` whole (`Watcher.ts`, `WatcherFiles.ts`, `WatcherFrames.ts`,
  `WatcherLaunch.ts`, `WatcherRecord.ts`, `WatcherSocketServer.ts`, `@types/`, `constants/`, and their specs,
  `WatcherBundleClosure.spec.ts` among them); `src/services/overseer/WatcherFleet.ts`, `WatcherBundle.ts`,
  `LegacyWatcherReader.ts`, `WatcherBoardChildren.ts` and every spec of theirs (`WatcherFleet*.spec.ts`,
  `WatcherBundle*.spec.ts`, `LegacyWatcherReader.spec.ts`); `src/services/overseer/testing/PlantedWatcher.ts`,
  `src/services/overseer/testing/fixtures/watcher-record-format-1.json`; `src/testing/WatcherJob.ts`,
  `src/testing/WatcherProtocolClient.ts`, `src/testing/RecordedBunBuild.ts` and its spec if nothing else uses them
  (check with `git grep`); `cli/overseer/WindowsProcessIdentity.watcher.integration.spec.ts`; the recordings named
  `src__lib__watcher__Watcher.ts.json`, `src__services__overseer__WatcherBundle.ts.json` and
  `src__services__overseer__WatcherFleet.ts.json` (the boundary `src/lib/watcher/WatcherSocketServer.ts` has no
  recording of its own).
- Change `src/services/overseer/ProcessStarts.ts` (no `spawnWatcher`), `DrivePass.ts` (no `legacyWatcherJobIds`,
  `:312`, `:991-995`, `:1043`, `:1538`; no notice `watcher-endpoint-does-not-fit`, `:167`, `:300-301`),
  `JobLiveFactsReader.ts` (no `watcherProtocol`, `watchOnly`), `EventBroker.ts:75-76`,
  `bridge/views/agents/AgentJobDocument.ts:31-32`, `JobRow.tsx:62`, `:76`, `JobControls.tsx:33`,
  `bridge/@types/DetailBoardState.ts:103`, `bridge/testing/BoardStateFixture.ts:97-98`, and their DOM specs.
- Change the guards: `src/ImportDirection.spec.ts` (no `watcher-binary`), `src/PlatformBoundary.spec.ts`,
  `src/SpecSleeps.spec.ts` (entries `:30-45` whose files are gone), `src/RealSystemSpecs.spec.ts` (`:41-45`),
  `src/testing/BoundarySpecs.ts`, `src/testing/BoundaryRecordings.ts`, `eslint.config.js`,
  `src/lib/process-identity/ProcessSupervision.ts` and `SpawnOptionsFor.ts` (no kind `watcher`;
  `src/lib/process-identity/FrozenProcessSupervision.json` does not name it, so it stays as it is).
- Note for WP2.17 the names this package retires: `'WatcherFleet'`, `'WatcherBundle'`, `'LegacyWatcherReader'`,
  `'runWatcher'`, `'WATCHER_PROTOCOL_VERSION'`, `'src/lib/watcher'`, `'watcher-bundle-failed'`,
  `'watcher-endpoint-does-not-fit'`, `'legacy-watcher'`, `'pinWatcherBundle'`. They join `RETIRED_NAMES` in WP2.17,
  once `apps/forge/CLAUDE.md` and `docs/` name them nowhere: `src/ComponentNames.spec.ts` scans those files too, so
  adding the names here turns `bun run verify` red.

**What to do.** Delete, then follow the compiler and the guards until green. Words in comments that name the Watcher in
files this package touches say Talos. The refusal kinds `watcher-bundle-failed` and `watcher-endpoint-does-not-fit`
leave their union and their wording in `cli/`.

**Specs.** The guard specs prove their planted cases with Talos paths.

**Done when.** `git grep -n -i "watcherfleet\|watcherbundle\|legacywatcher\|lib/watcher\|watcher\.ts" apps/forge` finds
nothing outside `docs/` and `apps/forge/CLAUDE.md`, which WP2.17 rewrites; the root `bun run verify` is green.

### WP2.16 The Watcher's remaining names

**Purpose.** "The Watcher's name goes with its code in stage 2" (design section 11). Rename the identifiers and stored
keys that still name it, one mechanical change, keeping `watcher-lost` for stage 9.

**Files.** Every file this command names, run at the repository root (92 files hold `watcherInstance` today, 133 match
the whole pattern):

```sh
git grep -l -E "watcherInstance|FIRST_WATCHER_INSTANCE|watcher-instance|ProcessWatcher|LostWatcher|environmentFromWatcher|watcherProtocolVersion|WatcherObservation|WatcherEventFacts" \
  -- apps/forge packages apps/gaia/src
```

**What to do.**
1. Rename: `Job.watcherInstance` to `childInstance`; `FIRST_WATCHER_INSTANCE` to `FIRST_CHILD_INSTANCE`; the log field
   problem key `'watcher-instance'` (`src/adapters/log/LogRecordProblem.ts:182`) to `'child-instance'`;
   `ProcessWatcherSandbox` to `LineSandbox` (file `src/services/overseer/LineSandbox.ts`); `LostWatcherFacts` to
   `LostChildFacts`; `environmentFromWatcher` to `environmentFromTalos`; `WatcherObservation` to `ChildObservation`;
   `watcherProtocolVersion` to `talosProtocolVersion` where WP2.13 has not done it.
2. The stored key in `progress.json` changes with the field: `src/adapters/progress/@types/StoredProgressFile.ts`,
   `utils/ProgressFileMappingUtil.ts`, `utils/StoredJobValidationUtil.ts`. So does the `watcherInstance` field of the
   `job-interrupted`, `job-resumed` and `job-reopened` records in `log.jsonl`
   (`src/lib/tracker-model/constants/LogRecordSchema.ts:325-339`, worded in `src/adapters/utils/LogUtil.ts:301-304`).
   Nothing migrates (decision 32).
3. Note each old identifier for WP2.17, which adds it to `RETIRED_NAMES` in `src/ComponentNames.spec.ts`. Never
   `watcher-lost`.
4. Rename every other Watcher name left after WP2.15 in shipping code, specs and testing helpers of `apps/forge`,
   `apps/gaia` and `packages`, by what it now names: a child (`watcherFolder` to `childFolder`, `watcherFilesOf` to
   `childFilesOf`, `gateWatcherFolderIn` to `gateChildFolderIn`, `endStepWatcher` to `endStepChild`,
   `plantLiveWatcher` to `plantLiveChild`, `RecordedWatcherStages` to `RecordedTalosStages`), or Talos. List them with
   `git grep -h -o -i -E "[A-Za-z_-]*watcher[A-Za-z_-]*" -- apps/forge/src apps/forge/cli apps/gaia packages | sort -u`;
   today that lists about 280 distinct spellings, most of which WP2.15 deletes with the fleet. In Gaia: the sentence
   "finish what they are on under their Watchers" (`apps/gaia/page/shared/utils/ForgeCommandTextUtil.ts:59`) and its
   specs, the comments of `apps/gaia/src/testing/ScratchForge.ts:199` and `ScratchRoot.ts:24`, and the planted
   `.forge-monitor/watchers/...` token paths of Gaia's specs (`private` now).
5. Leave Flint's own names: the `watcher-spark` attendant of `packages/flint/` (about 118 lines, from
   `attendants/watcher-spark/`) and its host in `bridge/flint/` count agents in flight and are Flint's design vocabulary
   (`packages/flint/README.md`, Flint's design docs), not the Watcher's code (the run's call above).
6. Leave Gaia's recordings (`apps/gaia/src/testing/recordings/darwin/forge-registry.json`, `overseer-fetch-*.json`):
   they are a real forge's recorded answers and change when Gaia records again (stage 8).

**Specs.** No new claim; specs rename with the code.

**Done when.** The grep of "Files" finds nothing outside Gaia's recordings; `git grep -n -i "watcher" -- apps/forge/src
apps/forge/cli apps/gaia packages ':!packages/flint' ':!apps/gaia/src/testing/recordings' ':!apps/gaia/CLAUDE.md'` lists
only `watcher-lost` and the vendor's own key `setup_file_watcher_ms` in recorded Claude Code output
(`src/lib/claude-code/testing/fixtures/*.jsonl`, `src/testing/recordings/darwin/src__testing__fake-agent.json`); the
root `bun run verify` is green.

### WP2.17 Rules and documentation

**Purpose.** A change that invalidates a rule updates it in the same change (`apps/forge/CLAUDE.md:277-280`).

**Files.**
- Change `apps/forge/CLAUDE.md`: the component names (`:46`), Runtime (`:134-135`: Talos has no context, so `talos.ts`
  passes `process.platform` to `runTalos`), the `eslint.config.js` paragraph (`:161-163`, `watcher.ts` among the files
  that may exit), the Deviations rows naming `watcher.ts` or the Watcher (`:326`, `:328`, `:337`, `:338`) and the
  legacy row (`:336`, deleted), a new row for the synchronous-calls thread as an entry module, and a row for
  `FrozenTalosHandshake.json`, a frozen table that is never retaken.
- Change `apps/gaia/CLAUDE.md:148` (a Watcher's socket path below the scratch home): Talos's socket now. Gaia's rules
  are in no tracker's reach, and the run changes them (decision 34).
- Change `docs/cli.md` (the Watcher passages, for example `:203`, `:268`, `:851`, `:870`, `:1094`; the files of a job
  folder; the new interruption causes, `lease-ended` and `network-outage` waiting), `docs/glossary.md`,
  `docs/development/guards-and-testing.md`, `docs/development/platform-status.md` (Talos boundaries: macOS recorded,
  Linux and Windows never ran), `docs/development/contributing.md` (the scratch isolation figure's words),
  `docs/operations/*.md`, `docs/concepts/*.md`, `docs/reference/overseer-api.md` (the identity key, the monitor job's
  `interruption`), `docs/reference/refusals.md`.
- The root `.claude/rules/` files hold no Watcher rule today (`git grep -n -i watcher -- .claude/rules` prints nothing);
  if one appears, change it in this package (decision 34).
- Change `src/ComponentNames.spec.ts`: add to `RETIRED_NAMES` the names WP2.15 and WP2.16 noted, with a planted case
  for one of each kind (path, identifier, wire value). A dated record that names one and is not rewritten, such as
  `docs/research/compounding/data-and-improvements.md` or a probe entry of
  `docs/development/overseer-claude-probe.md`, gets an exact `ALLOWED_RETIRED_NAMES` entry instead of an edit.

**What to do.** Replace the Watcher's description with Talos's: one per board, its protocol version, the lease renewed
only while passes make progress and the wake rule, the clean quit, the child record, the 15-minute bound of install,
prepare and gate lines with a sleep not counted, each line's run time, the merged-tree gate beside the pass, and the
network outage ending, which waits as a lease end does. Wrap at 120 columns
where `src/ProseWrap.spec.ts` holds a file. Figures that show Watchers (`docs/images/architecture.svg`) are redrawn or
named in the commit as stale. Then add the retired names, and run `src/ComponentNames.spec.ts`: each finding is a
document line still to rewrite, or a dated record for the allowlist.

**Done when.** `git grep -n -i watcher apps/forge/CLAUDE.md apps/forge/docs/cli.md apps/gaia/CLAUDE.md` finds only
`watcher-lost`;
`bun test --path-ignore-patterns='.claude/**' ./src/ComponentNames.spec.ts` in `apps/forge` passes with the new names;
the root `bun run verify` is green.

### WP2.18 Recordings and the end-to-end check

**Purpose.** Every new boundary has its darwin recording, and the forge works end to end on a scratch board.

**Files.** The recordings under `apps/forge/src/testing/recordings/darwin/` that `bun run record` writes.

**What to do.**
1. Run `bun run record <boundary>` in `apps/forge` for `src/lib/talos/Talos.ts`,
   `src/lib/talos/SynchronousCallsThread.ts`, `src/lib/talos/LocalEndpointFor.ts`,
   `src/lib/talos/PosixSocketEndpoint.ts`, `src/services/overseer/TalosStart.ts`,
   `src/services/overseer/LeaseRenewal.ts`, and every boundary whose specs changed (the stamp check names them).
2. Run the end-to-end check of "Verification of the whole stage".

**Done when.** The stamp check in `bun run verify` is green at the root, and every step of the end-to-end check observed
its result.

### WP2.19 The merged-tree gate leaves the pass

**Purpose.** The lease is renewed only while passes make progress (WP2.9), and today the Airlock awaits a merged-tree
gate inside the pass for as long as its lines run, its gate slot included (`Airlocks.ts:703`, `:864-866`;
`GateRun.ts:346`). The gate runs beside the pass instead: a pass starts it and carries on, and a later pass settles the
Airlock from the outcome the run kept on disk (design section 3.2, "Renewal that only progress earns"; risk 2). Built on
today's spawn, before the switch, so the renewal never meets a pass that waits through a gate.

**Files.**
- Create `src/services/overseer/MergedTreeGateRuns.ts` (the runs in flight and their kept outcomes) and
  `MergedTreeGateRuns.spec.ts`.
- Change `src/services/overseer/Airlocks.ts`: `AirlocksContext.gateMergedTree` (`:107`) and its two callers, the re-gate
  of a stale green (`:695-704`) and the gate before a landing (`:855-890`).
- Change `src/services/overseer/DrivePass.ts`: the context's `gateMergedTree` (`:1254-1277`), `regroup` (`:1578-1587`)
  and `stop` (`:1589-1596`).
- Change `src/services/overseer/testing/AirlocksHarness.ts` (`:227`) and the specs the compiler names
  (`Airlocks*.spec.ts` among them).

**What to do.**
1. `AirlocksContext.gateMergedTree` becomes `mergedTreeGateOf(worktreePath, treeId, phase, gatedEntities?):
   MergedTreeGate | 'running'`, synchronous.
2. `MergedTreeGateRuns.ts` exports `createMergedTreeGateRuns(request)` ("Interfaces introduced"). A run's folder is
   `merge-gates/<16 hex>` under the board folder, the hex the first 16 of `sha256(worktree + '\n' + tree + '\n' + phase
   + '\n' + the gated entity keys, sorted and joined by ',' + '\n' + the stamp's phase hash + '\n' + its entity phase
   hashes as sorted key=hash pairs)`, so a changed pipeline or another entity set is another run. `gateOf(request)`:
   1. the folder holds a readable `outcome.json`: answer its `MergedTreeGate`;
   2. a run of that folder is in flight in this process: answer `running`;
   3. otherwise start the run (`request.run`, the promise of today's `runMergedTreeGates` call), answer `running`. At
      its end the run writes `outcome.json` through the atomic-file package, with a format version (decision 3), and
      calls `wake(true)`: the file is in no pass fingerprint.
   `settled(request)` removes the run's folder; `stopAll()` stops every run's processes as `stopMergedTreeGate` does
   today and awaits the runs; `settleAtStart()` removes every folder under `merge-gates/` that holds no outcome, since
   its run died with the Overseer that started it.
3. The DrivePass's closure reads the pipeline as today (`:1255-1260`), answers an unreadable pipeline as today, computes
   the stamp (`PipelineUtil.gateRunStampOf`, or `entitiesGateRunStampOf` with the gated entities) for the folder, and
   asks `gateOf`. The gate slot is still taken inside the run (`GateRun.ts:346`), now outside any pass.
4. In the Airlock, `running` leaves the job in `gating`, counts as no move, and the sweep goes on with the next target.
   An outcome settles in the hold as today; after that hold, `settled` removes the run folder. A stop between the two
   leaves an outcome that the same tree, phase, entities and stamp would give again.
5. `regroup` calls `settleAtStart` before its first pass; `stop` calls `stopAll` after the running pass ended. A run the
   stop ended writes no outcome, so the next start runs it again: the `gating` phase is safe to redo (stage 0, table B).
6. Log one line when a run starts and one when it ends, naming the ticket, the phase and the outcome.

**Specs.**
- `MergedTreeGateRuns.spec.ts` (over a fake run): the first ask starts one run and answers `running`; an ask while it
  runs starts nothing; after the run the ask answers the kept outcome; a changed stamp or entity set is another folder;
  `settled` removes the folder; `settleAtStart` removes folders with no outcome and keeps those with one; an unreadable
  `outcome.json`, or one of another format version, is no outcome.
- Airlocks specs over the harness: a gating Airlock answers `running` and moves nothing until the outcome; a pass during
  a running gate merges another target's ticket; a passed, a red and a cannot-run outcome settle as before; a stale
  green's re-gate goes the same way.

**Done when.** `git grep -n "await context.gateMergedTree" apps/forge/src` finds nothing; the root `bun run verify` is
green.

### WP2.20 Line run times recorded and served

**Purpose.** Every line's run time is recorded in the measure its bound uses, a sleep not counted, and shown in the
pipeline overview (decision 36). Talos measures it (`ChildEnd.runMilliseconds`, WP2.7); this package records the run
time of each pipeline step line on the board and serves it in the pipeline facts. The overview that shows it is
Gaia's, built in stage 6 on the contract stage 4 declares.

**Files.**
- Change `src/lib/tracker-model/constants/LogRecordSchema.ts`: a record `pipeline-step-ran` beside `gate-ran`
  (`:285-291`), its field kinds beside `optional-cache-reports`, and the record's type and Board method beside
  `recordGateRan`.
- Change `src/lib/tracker-model/@types/PipelineFacts.ts` (`PipelineStepRunTimeFacts`, and `stepRunTimes` beside
  `gateCacheMarks`) and `src/services/render/PipelineFactsAssembly.ts` (`stepRunTimesOf` beside `gateCacheMarksOf`,
  `:539`, `:608`).
- Change `src/services/lifecycle/GateRun.ts`: a pipeline run's result carries each step's name, kind, run time and
  ending, from its `LineRunEnd`.
- Change `src/services/overseer/JobLaunch.ts` (the install steps' observation, `:575-586`, `:881-896`, and the holds
  that record a job's gate run, `:1523`, `:2052`), `Airlocks.ts` (`:634`, `:868`), `GateProfiling.ts` (the profile's
  end).
- Change `src/adapters/utils/LogUtil.ts` (the record's printed line) and
  `packages/forge-contracts/constants/ForgeSystemVersions.ts` (the 1.19 clause).
- Change the specs: `Board.gateRan.spec.ts` or a `Board.stepRan.spec.ts` beside it, `PipelineFactsAssembly.spec.ts`,
  `LogUtil.spec.ts`, `JobLaunch.*.spec.ts` of install and gating, `Airlocks*.spec.ts`, `GateProfiling.spec.ts`,
  `src/testing/EveryBoardLogRecord.ts`.

**What to do.**
1. The record `pipeline-step-ran`, subject `board`: `stepKind` (`prepare` or `gate`), `stepName`, `phase` (the gate
   run's phase; absent for an install step, which runs the pipeline's prepare steps before any gate run), `entity`
   (absent on a forge without entities), `runMilliseconds` (a count) and `ending` (`passed`, `failed` or
   `time-bound`). A comment says that the time is recorded and shown only (`apps/forge/CLAUDE.md:174-175`).
2. Written once per step line that ran, in the hold that consumes the step: the hold that acts on a build or review
   job's install verdict writes one per install step; each hold that records `gate-ran` for a job's gate run or a
   merged-tree gate writes one per prepare and gate step of that run (a cache hit ran nothing and writes none); a gate
   profile's end writes its gate. A pipeline check writes none: it checks a draft, not the pipeline. A step that ended
   `paused` and ran again writes only the run that was judged.
3. `stepRunTimesOf(logRecords)` keeps the newest record per entity, step kind, step name and phase, as
   `gateCacheMarksOf` keeps the newest cache report, and `PipelineFacts.stepRunTimes` serves them on the board state.
4. A gate profile's `elapsedMilliseconds` is the run time WP2.14 hands it, so a profile and a step read in one measure.
5. No Bridge view changes: its views move to Gaia in stage 6, which shows the times in the pipeline overview.
6. The 1.19 sentence of `ForgeSystemVersions.ts` adds the pipeline facts' step run times.

**Specs.** The Board spec round-trips the record through the log. `PipelineFactsAssembly.spec.ts`: the newest run of a
step wins, per entity and per phase. `JobLaunch` specs: a job whose install ran two steps writes two records, once,
across passes; a gate run writes one per step; a cache hit writes none; a `time-bound` gate writes `ending:
'time-bound'`. `Airlocks` specs: a merged-tree gate writes one per step. `LogUtil.spec.ts` prints the record.

**Done when.** `bun test --path-ignore-patterns='.claude/**' ./src/lib/tracker-model/ ./src/services/render/` passes in
`apps/forge`; the root `bun run verify` is green.

### The agent port packages: WP2.21 to WP2.32

The owner's rule of 2026-11-18 (`owner-answers.md`, ground rules: "all connections to actual claude should be in ports
and adapters") puts every reach past the agent port in scope. These packages close all of them. The reaches were
measured read-only at `710ae4f9` (`.claude/.evidence/hephaestus-talos/port-rule/reaches.md` in the main checkout, not
committed); the reach numbers below (A1 to I2, J1 to J11) are that measurement's. Every path and line below was read
again at `3274ac88`, where group 2-A and WP2.4 landed, and the comment and testing helper scans were added there;
WP2.21 cites Talos's files at `668f9b12`, where group 2-C landed. The stage's earlier packages move many
of them (WP2.5 to WP2.11 change Talos's files and the fleet, WP2.13 rewrites the pass and the deliveries, WP2.15 deletes
the Watcher, WP2.16 renames), so every line number below is "at `3274ac88`; reread on the tree you run on", and each
package's **Files** says so once.

- **The adapter** is `src/lib/claude-code/` and the fake agent's files (`src/testing/FakeAgentAdapter.ts`,
  `src/testing/FakeReportingSessions.ts`, `src/testing/fake-agent/`), which are an adapter of the same port (WP2.22).
  **The port** is `src/lib/agent-launch/`. **The seam** is `cli/CommandContext.ts`, the one composition root that
  chooses the adapter.
- **WP2.21 runs after WP2.7 and before WP2.8** (group 2-D2), so protocol 1 ships with no vendor field in
  `src/lib/talos/`.
- **WP2.22 lands the guard first**, with today's reaches allowlisted line by line, each entry naming the package that
  removes it. Every later package removes its own entries and is done only when the guard passes without them, so
  WP2.32 leaves only the permanent entries. A guard first, not last: from WP2.22 on, no package of any stage (WP4.10,
  WP7.2, the views stage 6 moves into Gaia) can add a reach without the guard naming it.

### WP2.21 A standing reply names the path of its request identifier

**Purpose.** Talos fills a standing reply from a field that the launch names, never from the vendor's `request_id`
(reach E1). WP2.4 moved `StandingReplies.ts` into `src/lib/talos/` unchanged, and WP2.5 gave it `standingReplyOf`, the
validator the launch frame's reader (`src/lib/talos/ChildLaunch.ts`) and the Watcher's launch file reader
(`src/lib/watcher/WatcherLaunch.ts`, which no longer has `isStandingReply`) both call. This package runs once group
2-D (WP2.7) has landed and before WP2.8 (group 2-D2): WP2.7 was already being built when the port rule came. Protocol
1 has not shipped before the switch (WP2.13), so the launch's reply changes inside protocol 1 with no raise of
`TALOS_PROTOCOL_VERSION`, and protocol 1 never ships with a vendor field; `FrozenTalosHandshake.json` holds no launch
frame and does not change. WP2.7 has landed by the time this package runs, so reread
`src/lib/talos/StandingReplies.ts`, `src/lib/talos/ChildLaunch.ts` and `src/lib/watcher/WatcherLaunch.ts` on the tree
you run on before changing them, and follow the compiler into any spec or caller WP2.7 added.

**Files.** Lines at `668f9b12`, where group 2-C landed; reread on the tree you run on.
- Change `src/lib/talos/StandingReplies.ts`: the header of `StandingReply` (`:1-4`), the placeholder
  `REQUEST_IDENTIFIER_PLACEHOLDER` (`:11`), the doc comment and the fill of `standingReplyFor` (`:28-31`, `:40-44`; it
  reads `record['request_id']` at `:40`), and `standingReplyOf` (`:47-55`), which reads and returns the new field. Its
  callers `src/lib/talos/ChildLaunch.ts:137` and `src/lib/watcher/WatcherLaunch.ts:85` need no change. Change
  `src/lib/talos/StandingReplies.spec.ts` and `src/lib/talos/ChildLaunch.spec.ts` (its planted agent launch's reply,
  `:24`, and a reply without the field refused).
- Change `src/lib/agent-launch/AgentLaunchPlan.ts`: the plan's `StandingReply` twin and its doc comment (`:25-33`).
- Change `apps/forge/cli/FrozenPlatformPorts.json` (around `:443`): it freezes the adapter's standing reply with
  `{{request_id}}` and no `requestIdentifierPath`, so it is retaken or updated as that fixture's rules say (its `retake`
  key, `cli/PlatformPorts.frozen.spec.ts:3`).
- Change `src/lib/claude-code/ClaudeCodeAdapter.ts` (`DENY_EVERY_PERMISSION_BUT_A_QUESTION`, `:311-319`) and
  `src/lib/claude-code/ClaudeCodeAdapter.spec.ts` (its reply helper `replyFor` and the standing reply cases).
- Change the Watcher's planted reply, which the type now requires the field of:
  `src/lib/watcher/Watcher.integration.spec.ts:33` (`DENY_ALL_BUT_QUESTIONS`) and
  `src/lib/watcher/WatcherLaunch.spec.ts:19`, which plants a reply without the new field. `src/testing/WatcherJob.ts`
  changes only if the compiler names it: the Watcher validates through `standingReplyOf` and fills through
  `standingReplyFor` until WP2.15 deletes it.

**What to do.**
1. `StandingReply` gains `requestIdentifierPath: string | null`: the dotted path of the line whose string value fills
   the placeholder, `null` for a reply whose template has none. The placeholder becomes `{{request-identifier}}`.
2. `standingReplyFor` reads the value at `requestIdentifierPath` with `valueAtDottedPath` (own properties only). A
   template that holds the placeholder with a `null` path, or a path whose value is not a string, answers `null`, as a
   missing `request_id` answers today. The escape of the identifier into the JSON string stays.
3. `standingReplyOf` accepts the field as a string or `null` and returns it; a rule without the field, or with any
   other value there, answers `null`, so `childLaunchOf` refuses the launch `malformed` and the Watcher's reader refuses
   its launch file, as for any malformed rule.
4. The Claude Code adapter's reply sets `requestIdentifierPath: 'request_id'` and writes `{{request-identifier}}` in its
   template.
5. The doc comments of `StandingReplies.ts` and `AgentLaunchPlan.ts` name no vendor field.

**Specs.** `StandingReplies.spec.ts`, with planted lines whose field names are no vendor's (`askId`, a nested
`request.askId`), as WP2.1's specs plant: the placeholder is filled from the named path, a nested path included,
escaped as today; a `null` path with a placeholder, a missing path and a number at the path answer `null`; a template
without the placeholder is answered with a `null` path; `standingReplyOf` keeps the field and refuses a rule without
it. `ChildLaunch.spec.ts`: an agent launch whose reply lacks the field is refused `malformed`.
`ClaudeCodeAdapter.spec.ts`: the plan's reply names `request_id` as its path, and the recorded permission request is
answered under its own request id as before.

**Done when.** `git grep -n "request_id" -- apps/forge/src/lib/talos apps/forge/src/lib/agent-launch` prints nothing,
specs and comments included; in `apps/forge`, `bun test --path-ignore-patterns='.claude/**'
--path-ignore-patterns='**/*.integration.spec.ts' ./src/lib/talos/ ./src/lib/claude-code/
./src/lib/watcher/WatcherLaunch.spec.ts` passes and `bun run typecheck` is green (it covers the Watcher's integration
spec, whose reply only gains the field); at the root, `bun install --frozen-lockfile` and `bun run verify` are green.

### WP2.22 The agent boundary guard, today's reaches allowlisted

**Purpose.** Make the owner's rule measurable before any reach closes: a guard that finds every shipping line outside
the adapter, comments included, that names the vendor's program, paths, variables, wire fields, hook protocol, flags,
tool names or marks, and every testing helper line that names the program, with exact allowlists of today's reaches,
each entry naming the package that removes it. This package also settles what the fake agent is.

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Create `apps/forge/src/AgentBoundary.spec.ts`, beside `src/PlatformBoundary.spec.ts`, a repository guard of the same
  kind (`repository-guard` layer in `src/ImportDirection.spec.ts`).
- Create `apps/gaia/src/AgentVendorNames.spec.ts`, beside Gaia's other repository-wide specs in `src/`.
- Change `apps/forge/src/ImportDirection.spec.ts`: the vendor seam constants (`:75-78`), `vendorSeamFinding`
  (`:420-423`) and the tests that name its sentence (`:875-878`, the Watcher binary's planted import, gone with
  `watcher.ts` in WP2.15; `:914-924`, the planted importers; `:1045-1048`, the tree's own).
- Change `apps/forge/src/testing/FakeAgentAdapter.ts:1-6`: its header says it is an adapter of the agent port.
- Change `apps/forge/CLAUDE.md` (a line beside `:146`, which names `src/PlatformBoundary.spec.ts`) and
  `apps/gaia/CLAUDE.md` (a line in its guard rules, near `:435`).

**What to do.**
1. **The fake agent's status.** The fake agent is an adapter of the agent port, as the owner's rule says. It replays
   the Claude Code adapter's recorded wire, so it keeps that adapter's mapping (`CLAUDE_STREAM_LINES`), capabilities
   and plan values, and stays where it is. Its files are adapter files, named exactly:
   `FAKE_AGENT_ADAPTER_FILES = ['src/testing/FakeAgentAdapter.ts', 'src/testing/FakeReportingSessions.ts']` and the
   folder `src/testing/fake-agent/`. No neutral wire is built: a second vendor's adapter brings a fake of its own.
2. **The import rule.** `vendorSeamFinding` judges every target inside `VENDOR_ADAPTER_PACKAGE_FOLDER`, not only
   `VENDOR_ADAPTER_PATH`. A file may import the adapter when it is inside the folder, is `VENDOR_ADAPTER_SEAM`, is one
   of the fake agent's adapter files, or is a key of `VENDOR_ADAPTER_IMPORTERS_UNTIL_CLOSED`, an exact record from
   importer to the package that removes the import. Today's importers, from `git grep -l "claude-code/"` read for
   imports:
   - `src/shared/Environment.ts`, `cli/overseer/OverseerWording.ts`: WP2.24.
   - `src/services/overseer/ClaudeTranscripts.ts`, `src/services/overseer/ClaudeTranscripts.spec.ts`,
     `src/services/overseer/JobLiveFactsReader.spec.ts`, `src/services/overseer/JobTranscript.spec.ts`,
     `cli/measurement/usage/UsageCommand.ts`, `UsageAgents.ts`, `UsageText.ts`, `UsageCommand.transcripts.spec.ts`,
     `cli/testing/CapturedCommandContext.ts`, `cli/testing/CliProcess.ts`: WP2.23.
   - `cli/adoption/constants/RetiredClaudeInstall.ts`, `cli/constants/ClaudeManagedBlockMarkers.ts`: WP2.29.
   - `cli/adoption/TrackerRefresh.ts`, `cli/adoption/constants/ClaudeCodeInstall.ts`: WP2.30.
   The sentence becomes "only the agent port's seam and its adapters import the vendor's adapter". The record is exact
   both ways: an entry no import uses fails. Planted cases: an import of `src/lib/claude-code/ClaudeTranscripts.ts` from
   `src/services/overseer/Planted.ts` fails; the same import from the seam and from `src/testing/FakeAgentAdapter.ts`
   passes.
3. **The scan.** Copy the structure of `src/PlatformBoundary.spec.ts`: a header docblock; an `AgentForm` union; an
   `AGENT_FORM_PATTERNS` record; `isShippingCode` (as `:124-126`); `isCommentLine` (as `:132-134`), which here tags a
   line rather than dropping it; a memoised scan per source (`memoisedPerSource`,
   `src/testing/RepositorySources.ts:114`); `boundaryReportOf(sources, allowedLines)` answering
   `{ violations, unusedAllowances }`. Four kinds of source:
   - **Code:** `programTypeScriptSources(repositoryRootOfThisCheckout())` (`RepositorySources.ts:195`), shipping files
     only, every trimmed line, code and comment alike, each tagged as one or the other. `src/lib/claude-code/` and the
     fake agent's adapter files are exempt. `src/lib/agent-launch/` and `src/lib/talos/` are scanned as every other
     folder and by one form more (item 4), and a test holds that no allowlist key names them but one carve-out:
     `src/lib/agent-launch/WorkerProfile.ts`, whose `port-tool-word` findings stay listed until WP2.27 renames
     `bashNetworkDomains`, rewords those comments and removes the key (item 6).
   - **Testing helpers:** every TypeScript file in a `testing/` folder that is no spec and no `.dom.tsx`, outside the
     adapter's folder and the fake agent's files (`src/testing/`, `cli/testing/`, `bridge/testing/` and the package
     folders' own), every trimmed line, the form `vendor-name` alone, against `ALLOWED_TESTING_LINES`, exact both ways.
     A helper that starts, traps or names the real program is a finding unless its line is listed.
   - **Prose:** every `resources/**/*.md` and `skills/**/*.md` of `programFiles` (`RepositorySources.ts:207`), every
     trimmed line: the code reads these files and hands them to sessions.
   - **Probe evidence:** every text file of `.platform-probes/` and `.readme-graphics/` in `programFiles` (`.js`,
     `.py`, `.sh` and `.md`), the form `vendor-name`, allowed by file in `AGENT_EVIDENCE_FILES`, exact both ways (a
     listed file that names no vendor fails), each with its reason. At `3274ac88`: the 21 `claude-p*.js`, the six
     `host-*.js`, `os-sandbox-exec-nested.js`, `run-all.js`, `support/claude-session.js`, `support/probe.js` and
     `.platform-probes/README.md` are the boundary's evidence; `.readme-graphics/demo-activity.js` writes the demo
     board's recorded agent lines; `.readme-graphics/render-diagrams.py:21` and `.readme-graphics/README.md:31` name the
     diagram renderer a developer's own agent installed under `~/.claude/skills/diagrams/`, which renders this
     repository's README figures and is no connection of the product to the agent. A new file there that names the
     vendor fails.
   Not scanned, and the header says why: specs and `.dom.tsx` (they plant and assert both sides of the boundary, and
   the spec run traps `claude`, `src/testing/ProgramTraps.ts:26`, `:36`), JSON fixtures and recordings (recorded
   wire), and `docs/`. The bundles' source format is no finding either: each `skills/<folder>/SKILL.md` with its YAML
   header is the text of an instruction bundle, copied file by file into the folder the adapter's installer names
   (WP2.30), and file names are not scanned; the header says so, and WP2.30 closes the code's own mentions of the
   format and the bundles' slash invocations. The import rule does not keep shipping code off every testing helper:
   `TESTING_FOLDER_IMPORTERS` (`src/ImportDirection.spec.ts:116-127`) lets the seam, one shipping module, import
   `src/testing/` (it imports `FakeAgentAdapter.ts` and `FakeReportingSessions.ts`), and any file of `src/testing/`
   may import any other. At `3274ac88` the seam's import closure reaches four helpers (`FakeAgentAdapter.ts`,
   `FakeReportingSessions.ts`, `fake-agent/RecordedClaudeLines.ts`, `BoundaryRecordings.ts`) and none that starts or
   traps the program. So the helpers are scanned themselves, their program lines allowlisted line by line (the
   measurement's J5 and J7), and a test holds the closure (item 6).
4. **The forms.** Before matching, remove `.claude/.evidence`, `.claude/worktrees` and `.claude/rules` from the line:
   they are this repository's own development folders. Each form applies to code and comment lines unless it says
   otherwise.
   - `vendor-name`: `/claude|anthropic/i`. It catches the program, the brand, every `.claude` path, `CLAUDE_*`,
     `CLAUDECODE`, `ANTHROPIC_*`, every import of `src/lib/claude-code/`, the attribution trailer and identifiers such
     as `claudeConfigFolder`.
   - `vendor-file-layout`: `/\.mcp\.json|SKILL\.md|settings\.local\.json|\.meta\.json/`, and in `src/services/`,
     `src/lib/` and `cli/` only, `/\bprojects\/|\bsubagents\//`.
   - `vendor-wire-key`:
     `/\b(?:session_id|is_error|subtype|api_retry|api_error(?:_status)?|terminal_reason|tool_use(?:_id)?|tool_result|parent_tool_use_id|structured_output|permission_denials|total_cost_usd|(?:cache_read_|cache_creation_)?input_tokens|output_tokens|control_request|control_response|can_use_tool|request_id|rate_limit_event|stream_event|claude_code_version|five_hour|seven_day|updatedInput)\b|stream-json/`;
     on a comment line without `subtype`, which a comment uses for a media type's subtype
     (`bridge/views/intake/PictureAttachmentsModel.ts:50`).
   - `vendor-hook-protocol`:
     `/\b(?:PreToolUse|PostToolUse|SessionStart|SubagentStop|UserPromptSubmit|hookSpecificOutput|hookEventName|permissionDecision(?:Reason)?|tool_name|tool_input|allowed_domains)\b/`.
   - `vendor-flag`:
     `/--(?:output-format|input-format|permission-mode|dangerously-skip-permissions|settings|setting-sources|append-system-prompt|allowed-?[tT]ools|disallowed-?[tT]ools|mcp-config|strict-mcp-config|add-dir|session-id|include-partial-messages|max-turns|json-schema|fallback-model)\b/`.
     `--resume` and `--max-budget-usd` are left out: they are forge's own options too (`pipeline apply --resume`,
     `cli/pipeline/SetupCommandLine.ts:55`). The three comments that name them as the vendor's flags
     (`src/services/overseer/JobResumption.ts:2`, `ApiBillingStops.ts:3`, `src/lib/tracker-model/JobControls.ts:180`)
     are WP2.32's, held by its "Done when".
   - `vendor-tool-name`: on a code line ``/['"`](?:AskUserQuestion|NotebookEdit|TodoWrite|WebFetch|WebSearch)['"`]/``,
     on a comment line the same names unquoted, `/\b(?:AskUserQuestion|NotebookEdit|TodoWrite|WebFetch|WebSearch)\b/`;
     in `src/services/`, `src/lib/` and `cli/` also ``/['"`](?:Bash|PowerShell|Edit|Write|Read|Glob|Grep)['"`]/`` and
     the word `/\bBash\b/`. A view's button says "Edit", and the Bridge's comments quote example rows of the tool names
     an agent reported ("Bash ×4"), so `bridge/` takes the first two patterns only.
   - `vendor-mark`: `/\\?\(Recommended\\?\)/` (the source of a regular expression spells it with backslashes) and
     ``/`\/\$\{[A-Z_.]*SKILL/`` (a skill invoked by the vendor's slash command).
   - `port-tool-word`, in `src/lib/agent-launch/` and `src/lib/talos/` only:
     `/\b(?:Bash|PowerShell|Edit|Write|Read|Glob|Grep|WebFetch|WebSearch|AskUserQuestion|NotebookEdit|TodoWrite)\b|\bbash[A-Z]/`.
     The port and Talos name no vendor tool, as a word or inside an identifier. At `3274ac88` it finds
     `src/lib/agent-launch/WorkerProfile.ts:6` (`bashNetworkDomains`), `:20`, `:24`, `:26`, `:28`, `:38`, `:56-57`,
     WP2.27's.
   - Prose lines take `vendor-name`, the first `vendor-file-layout` pattern, the tool names unquoted,
     `/\b(?:AskUserQuestion|NotebookEdit|TodoWrite|WebFetch|WebSearch)\b/`, and `vendor-mark` as a bundle's slash
     invocation, `/\/\{\{\w*[sS]kill\w*\}\}/` (`skills/agent-po/SKILL.md:12`,
     `skills/agent-progress-orchestrate/SKILL.md:9`, WP2.30's).
   The model tiers (`haiku`, `sonnet`, `opus`, `fable`, reach I1) are no form: they are forge's tier words, which an
   adapter maps (`src/lib/tracker-model/constants/AgentSettings.ts:5-7`); WP2.32 records the Deviations row.
5. **The allowlists.** Run the scan and write `ALLOWED_AGENT_LINES` and `ALLOWED_TESTING_LINES`, each a
   `Readonly<Record<string, string>>` keyed `<path>: <form>: <trimmed line>` exactly as the scan prints it, one entry
   per finding, sorted by path. Each value starts with `Permanent:` or with `Removed by WP2.<n>:`, then the reason. Read
   each finding before listing it: a finding that is no reach is a pattern bug, fixed in the pattern, never allowlisted.
   At `3274ac88` the scan finds 29 shipping files with a `vendor-name` code line and 82 comment findings in 40 files, 3
   of them WP2.21's, which it rewrites before this package (`src/lib/agent-launch/` and `src/lib/talos/`), and the files
   below for the other forms. Every line number below is at `3274ac88`; reread on the tree you run on.
   Each finding goes to the package whose change removes its line; where two packages change one file, the package texts
   below say which line is whose:
   - Permanent: `cli/CommandContext.ts`, the import of `claudeCodeAdapterFor` (`:11`) and the choice of the adapter
     (`:79`, whose text WP2.24 changes, so WP2.24 rewrites the entry's key); on `main` (`e9b5d057`) and in the
     measurement they are `:11` and `:72`. Nothing else of `ALLOWED_AGENT_LINES` is permanent: the file's comments
     that name the vendor (`:53`, `:55` WP2.23's; `:73`, `:77` WP2.24's, `:66` and `:70` on `main`) are rewritten.
   - WP2.23: `src/services/overseer/ClaudeTranscripts.ts` (every finding);
     `src/services/overseer/JobLiveFactsReader.ts:17`, `:39`, `:111`, `:113`, `:296`;
     `cli/overseer/routes/BoardStateReader.ts:170`; `cli/measurement/usage/UsageCommand.ts:6-8`, `:41`,
     `UsageAgents.ts:2-5`, `UsageText.ts:2`; `cli/CommandContext.ts:15`, `:53`, `:55-56`, `:142`;
     `src/shared/Environment.ts:231-233`; the `usage` block of `cli/HelpText.ts` (`:179-197`, its one finding at
     `:182`).
     WP2.23 also rewrites the key of `Environment.ts:13`, whose import loses `claudeConfigFolderOf`; WP2.24 removes it.
   - WP2.24: `src/shared/Environment.ts:12-13`, `:218-220`, `:224`, `:228`; `cli/CommandContext.ts:16`, `:73`, `:77`;
     `cli/overseer/OverseerWording.ts:7`, `:62`, `:67`, `:79`; `bridge/views/pipeline/setup/BillingStepModel.ts:41`,
     `:46`, `:148`, `:151`; `src/adapters/utils/OperationRefusalWordingUtil.ts:38`, `:897`, `:899`.
   - WP2.25: `cli/overseer/OverseerWording.ts:277` (`vendor-mark`); `src/services/overseer/DrivePass.ts:376`;
     `src/services/overseer/AnswerDelivery.ts:3`, `:5`, `:29`; `src/services/overseer/SessionPlace.ts:3`.
   - WP2.26: `bridge/views/question-panel/QuestionPanelModel.ts:35`, `:104`, `:229`; `bridge/shell/HeaderModel.ts:91`;
     `bridge/@types/BoardStateDocument.ts:58`; `src/adapters/usage-marker/UsageWindowsFile.ts:14`;
     `src/services/overseer/BoardState.ts:51`; `src/services/overseer/JobLiveFactsReader.ts:58`.
   - WP2.27: `cli/hooks/BashDomainsHook.ts` and `cli/hooks/StageEditsHook.ts` (every finding);
     `src/lib/agent-launch/WorkerProfile.ts` (every finding, the one carve-out of item 3: the only key under the
     port's folders); `src/services/overseer/JobLaunch.ts:2262`; the `hook
     bash-domains` and `hook stage-edits` blocks of `cli/HelpText.ts` (`:161-177`, the findings at `:162`, `:163`,
     `:164` and `:171`).
   - WP2.28: `src/services/overseer/WorkerProfiles.ts:161`, `:164-168`, `:177`, `:194`;
     `src/services/lifecycle/Customs.ts:307`, `:834`, `:836-837`, `:899`, `:914`;
     `src/services/overseer/JobLaunch.ts:2222`, `:2330`, `:2351`; `src/services/overseer/DrivePass.ts:1102`.
   - WP2.29: `cli/adoption/constants/RetiredClaudeInstall.ts`, `cli/constants/ClaudeManagedBlockMarkers.ts`,
     `cli/setup/RetiredSkillStep.ts`, `cli/adoption/RetiredAgentHostRefusal.ts` (every finding);
     `cli/adoption/TrackerRefresh.ts` (the managed block and the retired hooks: `:18`, `:33`, `:45`, `:49`, `:225-263`);
     `cli/adoption/constants/ClaudeCodeInstall.ts:3`, `:25`, `:42`, `:49`, `:76`; `cli/InstallVersionCheck.ts:14`;
     `cli/setup/Setup.ts:3` (the header's comment line) and `:63` (the heading of the retired step);
     `cli/overseer/OverseerForeground.ts:78`, `:587`;
     `cli/overseer/OverseerWording.ts:1050-1051`; `src/shared/monitor/utils/NoticeWordingUtil.ts:49-50`;
     `src/lib/tracker-model/@types/PlaybookStep.ts:75`; `src/services/overseer/DrivePass.ts:228`, `:284`, `:429`,
     `:431`, `:1017`; the retired install's lines of `cli/HelpText.ts` (`:72-79`, the findings at `:74-77`). WP2.29
     rewraps `update`'s paragraph (`:69-86`); if that changes the text of `:71`, WP2.29 rewrites that entry's key, which
     stays WP2.30's.
   - WP2.30: every other finding of `cli/adoption/TrackerRefresh.ts` and `cli/adoption/constants/ClaudeCodeInstall.ts`;
     `cli/adoption/InstalledFileGeneration.ts:13`, `:17`, `:36`, `:58`, `:70`; `cli/InstalledFiles.ts:25`, `:30`, `:32`;
     `cli/hooks/SessionStartHook.ts:2`, `:12`; the `init`, `update` and `hook session-start` lines of `cli/HelpText.ts`
     (`init` `:44-57` with findings at `:46`, `:47`, `:50`; `update`'s current install at `:71`, `SessionStart`; `hook
     session-start` `:154-159` with findings at `:154-156`); the prose lines `skills/agent-po/SKILL.md:12` and
     `skills/agent-progress-orchestrate/SKILL.md:9` (`vendor-mark`, the slash invocation).
   - WP2.32: `src/adapters/utils/OperationRefusalWordingUtil.ts:289`, `:396`;
     `cli/drafts/DraftContentSubcommands.ts:58`; `cli/adoption/init/InitCommand.ts:50`;
     `cli/overseer/OverseerWording.ts:261`, `:267` (`CONFINEMENT_WORDING`'s `productOwnerBashNetwork` sentences); the
     comments of `src/lib/tracker-model/@types/Decision.ts:40`,
     `:57`, `@types/OptionConsequences.ts:2`, `@types/Ticket.ts:17`, `BoardRecords.ts:129`,
     `constants/DecisionAndIncidentVocabulary.ts:80`, `src/services/overseer/QuestionRouting.ts:2`,
     `IntakeSessions.ts:2-3`, `src/lib/data-folders/PosixDataFolders.ts:15` and
     `src/lib/process-identity/PosixProcessGroups.ts:53`; the prose lines of
     `resources/prompts/AirlockReportMessage.md:1`, `AirlockReReviewMessage.md:16`,
     `HumanCodeReviewReReviewMessage.md:16`, `ProductOwnerPrompt.md:7`, `:12`, `ReviewPrompt.md:12`, `:18`, `:26`,
     `BuildPrompt.md:12`, `PipelineAgentResearch.md:6` and `resources/templates/Constitution.md:3`.
   - `ALLOWED_TESTING_LINES`, permanent: the lines that record, stamp, trap or smoke-test the real program
     (`src/testing/BoundaryRecordings.ts`, `RecordBoundary.ts`, `RecordingStamps.ts`, `InstalledSystemVersion.ts`,
     `ProgramTraps.ts`, `BoundarySpecs.ts`, `RecordedWatcherStages.ts` or its Talos successor,
     `cli/testing/CutoverSmoke.ts`, `CutoverSmokeUtil.ts`); this repository's own installed agent files and evidence
     folder (`src/testing/RepositorySources.ts:20`, `:66`, `:72-76`, `cli/testing/CutoverSmokeUtil.ts:55`); and fixtures
     that plant the files the fake agent's adapter reads and writes (`.claude/settings.json`, `.claude/skills`, an
     instruction file in `src/testing/RecordedGitFlow.ts`, `RecordedGitScenarios.ts`, `TwoTrackerFixture.ts`,
     `EntityForgeFixture.ts`, `SettingsBeforePowerShell.ts`, `cli/testing/RecordedGitStages.ts:12`,
     `cli/testing/InstalledSurfaceScan.ts`). Removed by WP2.23: `cli/testing/CapturedCommandContext.ts` and
     `cli/testing/CliProcess.ts`. Removed by WP2.29: the planted managed `CLAUDE.md` blocks and the
     `git show <branch>:CLAUDE.md` calls (`RecordedGitFlow.ts`, `cli/testing/RecordedGitStages.ts:77-99`). Removed by
     WP2.30: `cli/testing/InstalledSurfaceScan.ts:46`, which names `ClaudeCodeInstall.ts`.
   Lines WP2.13 to WP2.16 rewrote are listed as the scan finds them, not as cited here. Some reaches have no line the
   forms can see (the three flag comments, `CONTROL_RESPONSE_DELIVERS_ANSWERS`, the session's confinement); their
   packages close them all the same, and their "Done when" says how.
6. **The tests**, mirroring `PlatformBoundary.spec.ts:204-471`:
   - "the scan saw the tree": more than 400 shipping paths, the testing helpers, the prose files and the probe files;
     the adapter folder exists and its files really hold each code form (`vendor-name` and `vendor-wire-key` in
     `src/lib/claude-code/ClaudeStreamMapper.ts`).
   - "every line naming a form is allowlisted, and every allowlist entry is found": `expect(boundaryReportOf(SOURCES,
     ALLOWED_AGENT_LINES)).toEqual({ violations: [], unusedAllowances: [] })`, and the same for the testing helpers and
     for the probe files by file.
   - "the allowlist is exact both ways": a removed entry leaves its line a violation; an unused entry is named; a second
     copy of an allowed line in the same file is a violation; an allowed line in another file is a violation.
   - "no entry names the port or Talos but the worker profile": every key that starts with `src/lib/agent-launch/` or
     `src/lib/talos/` starts with `src/lib/agent-launch/WorkerProfile.ts: `, the one carve-out of item 3, and its value
     with `Removed by WP2.27:`; a planted key of another file under those folders fails.
   - "every entry names its package": each value starts with `Permanent:` or with `Removed by WP2.<number>:`, the
     number one of 23 to 32; `ALLOWED_AGENT_LINES` has exactly two `Permanent:` entries.
   - "the guard names each form, planted in memory": one planted code line and one planted comment line per pattern at
     `src/services/overseer/Planted.ts`, one `port-tool-word` line at `src/lib/talos/Planted.ts`, one prose line per
     prose form at `resources/prompts/Planted.md` and `skills/planted/SKILL.md` (a `"/{{plantedSkill}}"` among them), a
     `Bun.which('claude')` line at `src/testing/PlantedHelper.ts`, `.platform-probes/planted.js` and
     `.readme-graphics/planted.py`, and a test that every form is planted.
   - "the seam reaches no helper that starts or traps the program": `reachablePathsFrom`
     (`src/testing/ImportGraph.ts:254`) from `cli/CommandContext.ts` over the tree's import graph holds no path of
     `PROGRAM_STARTING_HELPERS`, the exact list of helpers with an `ALLOWED_TESTING_LINES` entry that starts, traps or
     records the program (`cli/testing/CutoverSmoke.ts`, `CutoverSmokeUtil.ts`, `src/testing/InstalledSystemVersion.ts`,
     `ProgramTraps.ts`, `RecordBoundary.ts`, `RecordingStamps.ts`, `BoundarySpecs.ts`); a planted import of
     `ProgramTraps.ts` from `src/testing/FakeAgentAdapter.ts` fails it, and every listed path exists.
   - "what the guard exempts is exact": a planted form in `src/lib/claude-code/Planted.ts` and in
     `src/testing/fake-agent/Planted.ts` passes; the same line in `src/lib/agent-launch/Planted.ts`,
     `src/lib/talos/Planted.ts` and `cli/Planted.ts` fails, as a comment too; a spec and a `.dom.tsx` are not scanned;
     a comment saying a media type's `subtype`, `pipeline apply --resume` and a Bridge comment saying `Bash ×4` are no
     finding; `.claude/worktrees/x` in a line is no finding.
7. **Gaia's guard** (`apps/gaia/src/AgentVendorNames.spec.ts`): the forms `vendor-name`, `vendor-wire-key`,
   `vendor-tool-name` (the first two patterns) and `vendor-mark` over the code and comment lines of Gaia's shipping
   files in `src/` and `page/` (no spec, no `.dom.tsx`, no testing folder, no recording), read as Gaia's repository
   specs read the tree; the same exact-both-ways allowlist, with one entry today:
   `src/adapters/page-api/ForgeSentenceUtil.ts`, the `claude-md-block-committed` line (`:34`), removed by WP2.29. Plant
   one line per form. Gaia names no vendor from then on: the views stage 6 moves arrive without one, since WP2.24 and
   WP2.26 close them in the Bridge first.
8. **The rules.** `apps/forge/CLAUDE.md`, beside `:146`: "`src/AgentBoundary.spec.ts` holds that no shipping code
   outside the agent port's adapter (`src/lib/claude-code/` and the fake agent's files), comments included, names the
   vendor, and that no testing helper names it but on its listed lines; `src/ImportDirection.spec.ts` holds that only
   `cli/CommandContext.ts` and the fake agent import it." `apps/gaia/CLAUDE.md`: "`src/AgentVendorNames.spec.ts` holds
   that Gaia names no agent vendor; Gaia speaks to forge only."

**Specs.** The two guards and the changed import rule prove themselves: the scan found the adapter and the reaches,
each form is caught when planted, the allowlists are exact both ways, the exemptions are exact.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**' ./src/AgentBoundary.spec.ts
./src/ImportDirection.spec.ts` passes. In `apps/gaia`: `bun test src/AgentVendorNames.spec.ts` passes. At the root:
`bun install --frozen-lockfile`, then `bun run verify` is green. No product code changed: only the three guard specs,
the fake adapter's header and the two rule files.

### WP2.23 The adapter reads its own transcripts

**Purpose.** Only the adapter knows where the vendor keeps its transcripts and how they read (reaches A1 to A6, B1,
J6, and the direct imports of reach K2). The Overseer's live facts and the `usage` verb ask the port; the command
context carries no vendor folder.

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Create `src/lib/agent-launch/AgentTranscripts.ts`: the port's types `SubagentFacts` and `SubagentUsage`.
- Change `src/lib/agent-launch/AgentAdapter.ts`: `sessionSubagentsOf` and `subagentUsagesOf` ("Interfaces
  introduced").
- Move with `git mv` `src/services/overseer/ClaudeTranscripts.ts` and its spec to
  `src/lib/claude-code/ClaudeSessionSubagents.ts` and `.spec.ts` (`:1-104`; it already imports only the adapter's
  `ClaudeTranscripts.ts` and `utils/TranscriptUsageUtil.ts`, `:7-8`).
- Move with `git mv` `src/lib/claude-code/utils/TranscriptCohortUtil.ts` and its spec to
  `cli/measurement/usage/utils/UsageCohortUtil.ts` and `.spec.ts`: the cohort maths is forge's. Rename
  `TranscriptCohortUtil` to `UsageCohortUtil` and retype it over the port's `SubagentUsage`, which carries
  `totalInputTokens` itself: today it imports the adapter's `TranscriptProfile` and `TranscriptUsageUtil` (`:7-8`) and
  uses them at `:25-26` (`CohortSplit`), `:30-31` (`oversizedContextShareOf`), `:51` and `:56` (`cohortSummaryOf`) and
  `:71` (`cohortSplitAt`). Each takes `SubagentUsage` where it took `TranscriptProfile` and reads
  `usage.totalInputTokens` where it called `TranscriptUsageUtil.totalInputTokensOf`, so the moved util, and with it
  `UsageCommand.ts` and `UsageText.ts` (whose `CohortSummary` it exports), import nothing of `src/lib/claude-code/`.
- Change `src/lib/claude-code/ClaudeCodeAdapter.ts` (the two operations, over `configFolderOf`, `:342`) and create
  `src/lib/claude-code/ClaudeSubagentUsages.ts` from `cli/measurement/usage/UsageAgents.ts:21-30` (`agentUsageFor`,
  each transcript's text read into its profile) and `:44-55` (`readAgents`, the reading of each transcript).
- Change `src/services/overseer/JobLiveFactsReader.ts` (`:17`, the comment `:39`, `:110-114` `JobSession`, `:291-297`
  `lostSubagentsOf`); `cli/overseer/routes/BoardStateReader.ts:168-172`; `cli/measurement/usage/UsageCommand.ts:6-8`,
  `:41-42`, `UsageAgents.ts:2-5`, `:14-19` (`AgentUsage`), `UsageText.ts:2`, `:71`; `cli/CommandContext.ts:15`,
  `:53-56`, `:142`; `src/shared/Environment.ts:231-234` (`claudeConfigFolder`, whose one caller goes);
  `cli/testing/CapturedCommandContext.ts:8`, `:37-38`, `:74`, `:97-98`; `cli/testing/CliProcess.ts:10`, `:133-135`;
  `src/testing/FakeAgentAdapter.ts` (the two operations: empty, or a spec's planted answers, item 5).
- Change the specs: `src/services/overseer/JobLiveFactsReader.spec.ts` (`:21-22`), `JobTranscript.spec.ts` (`:24`),
  `cli/measurement/usage/UsageCommand.transcripts.spec.ts`; the transcript cases they hold that read the vendor's files
  move to `src/lib/claude-code/ClaudeSessionSubagents.spec.ts` and a new `ClaudeSubagentUsages.spec.ts`.
- Change `src/AgentBoundary.spec.ts` and `src/ImportDirection.spec.ts` (WP2.22's entries for this package), the `usage`
  block of `cli/HelpText.ts` and of `docs/cli.md` (its rewording of `subagents/workflows/<run>/`, `HelpText.ts:182`, is
  assumption 9 of "Needs the owner").

**What to do.**
1. `sessionSubagentsOf(homeDirectory, sessionId, talliedParentToolUseIds)` answers what
   `ClaudeTranscripts.subagentFactsOf` answers today, as `SubagentFacts`. `JobSession` becomes `{ homeDirectory:
   string; sessionId: string }`, and `JobLiveFactsReader.liveFactsOf` takes the adapter's operation in its source.
   `BoardStateReader` hands `context.homeDirectory` and `context.agentAdapter`.
2. `subagentUsagesOf({ projectRoot, homeDirectory, transcriptFolder, oversizedContextThresholdTokens,
   briefExcerptCharacters, onUnreadableTranscript })` answers one `SubagentUsage` per subagent transcript of the
   project: what `readAgents` builds today (`UsageAgents.ts`). `transcriptFolder` is the `--transcripts <folder>`
   option, `null` without it. A transcript the adapter cannot read is left out and handed to the request's
   `onUnreadableTranscript(path)`, which the verb words on standard error as `readAgents` does today. The `usage` verb
   keeps its options and output, sorts the rows oldest first as today, and computes its cohorts with `UsageCohortUtil`
   over the answered rows.
   The port names the shell-edit count `shellEditScriptCount`; the verb's own row, `AgentUsage`, keeps
   `bashEditScriptCount` and its `--json` key, filled from it, so the printed and the `--json` output stay as they are.
   `UsageCohortUtil` reads `usage.totalInputTokens` where it called `TranscriptUsageUtil.totalInputTokensOf`, and
   `usage.shellEditScriptCount` where it read `profile.bashEditScriptCount` (`:65`, for `meanBashEditScriptCount`), and
   its `CohortSummary` keeps its fields; its spec builds `SubagentUsage` rows where it built `TranscriptProfile`s.
3. `CommandContext` loses `claudeConfigFolder` and its doc comment (`:55-56`); the adapter already holds its folder
   (`claudeCodeAdapterFor(platform, claudeConfigFolderVariable())`, `:79`). `homeDirectory`'s comment (`:53`) names no
   vendor.
4. The specs' isolation: `CapturedCommandContext` loses its option and field. `CliProcess.childEnvironmentOf` stops
   leaving the vendor's folder variable behind (`:133-135`): every spawned binary runs the fake agent
   (`FAKE_AGENT_SWITCHES`), which reads no transcript. Say so in the function's comment.
5. The fake agent answers `[]` from both operations unless a spec plants answers (`fakeAgentAdapter`'s options). That is
   what Claude Code's operations answer on a home where no session wrote a transcript, and the fake agent writes none:
   it prints its recorded lines only. So on a scratch home, the one place a fake agent runs, both adapters answer the
   same, and the fake never reads the vendor's folder, so no spec and no scratch forge reaches a developer's real
   transcripts through it whatever the environment names. The trap "A capability the fake agent lacks" names these two
   reads as its one exception. `JobTranscript.spec.ts` and `JobLiveFactsReader.spec.ts` map their lines through
   `fakeAgentAdapter()` instead of `CLAUDE_STREAM_LINES`, and plant their lost subagents through it.

**Specs.** `ClaudeSessionSubagents.spec.ts` keeps every case of the moved spec. `ClaudeSubagentUsages.spec.ts`: the
profile of a planted transcript, a workflow run's subagent, the `.meta.json` description. `JobLiveFactsReader.spec.ts`:
the planted lost subagents are listed and counted. `UsageCommand.transcripts.spec.ts` (renamed
`UsageCommand.cohorts.spec.ts`): the cohorts and their text from planted rows, with and without `--since`, and the
`--transcripts` folder handed to the adapter.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**'
--path-ignore-patterns='**/*.integration.spec.ts' ./src/AgentBoundary.spec.ts ./src/ImportDirection.spec.ts
./src/lib/claude-code/ ./src/services/overseer/JobLiveFactsReader.spec.ts ./src/services/overseer/JobTranscript.spec.ts
./cli/measurement/` passes with this package's entries removed from both allowlists; `git grep -n -i
"claudeConfigFolder" -- apps/forge/cli apps/forge/src ':!apps/forge/src/lib/claude-code'` prints nothing; `git grep -n
"claude-code/" -- apps/forge/cli/measurement` prints nothing; at the root, `bun install --frozen-lockfile` and `bun run
verify` are green.

### WP2.24 The adapter names its variables, its credentials and its repair

**Purpose.** The variables the vendor reads, the sentences about its credentials and the repair of its program are
the adapter's data (reaches B2, B3, B4, H1). `src/shared/Environment.ts` stays the one reader of the environment and
reads a variable by the name the adapter gives.

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Change `src/lib/agent-launch/AgentAdapter.ts`: `AgentCredentials` and `programRepairOf` ("Interfaces introduced").
- Change `src/lib/claude-code/ClaudeCodeAdapter.ts` and `ClaudeCodeAdapter.spec.ts`; `src/testing/FakeAgentAdapter.ts`
  (Claude Code's values: the fake replays its wire).
- Change `src/shared/Environment.ts:12-13`, `:218-228`; `cli/CommandContext.ts:16`, `:79` and the comments `:73` and
  `:77`.
- Change `cli/overseer/OverseerForeground.ts:59`, `:590` and `src/services/overseer/DrivePass.ts:234`, `:852`, `:1496`
  (`apiBillingKeyIsSet`); `src/testing/DrivePassHarness.ts:62`.
- Change `cli/overseer/OverseerWording.ts:7`, `:59-81` (the two decision wordings), `:1068` (the
  `agent-program-refused` notice); `src/shared/monitor/utils/NoticeWordingUtil.ts:65`;
  `src/services/overseer/DrivePass.ts:299`, `:859` (the notice's facts);
  `src/adapters/utils/OperationRefusalWordingUtil.ts:38`, `:897-900`.
- Change `bridge/views/pipeline/setup/BillingStepModel.ts:41`, `:46`, `:148`, `:151` and its specs
  (`BillingStepModel.spec.ts`, `BillingStep.dom.tsx`).
- Change `cli/overseer/OverseerDrivePass.apiBilling.spec.ts`, `src/shared/Environment.integration.spec.ts`, the
  wording specs; `src/AgentBoundary.spec.ts`, `src/ImportDirection.spec.ts`.

**What to do.**
1. `Environment.ts` imports nothing of the adapter. `claudeConfigFolderVariable()` becomes `agentVariableOf(name:
   string): string | undefined` (empty or whitespace-only reads as unset, as today), and `apiBillingKeyIsSet()`
   becomes `agentVariableIsSet(name: string): boolean`. Their doc comments say the agent adapter names the variable.
2. The adapter reads its configuration folder variable itself: `claudeCodeAdapterFor(process.platform,
   agentVariableOf)` at the seam (`CommandContext.ts:79`), the adapter calling the reader with its own name. The seam's
   two lines stay the guard's only permanent entries; rewrite the key of the `:79` entry to the line's new text. The
   comments of `agentAdapter` (`:73`) and of `agentAdapterOfThisProcess` (`:77`) name no vendor: "the agent port's
   adapter, or the scripted fake agent under the fake-agent switch" and "the one place outside the agent port's
   adapter that chooses it"; the seam's code lines are the only lines of the file that name the vendor.
3. `DrivePassRequest.apiBillingKeyIsSet` keeps its name; `OverseerForeground` builds it as
   `() => agentVariableIsSet(context.agentAdapter.credentials.billingKeyVariableName)`.
4. The two decisions (`API_KEY_NOT_SET_WORDING`, `API_AUTHENTICATION_FAILED_WORDING`) become functions of
   `AgentCredentials`, worded as today with `billingKeyVariableName` and `authenticationCheckSentence` (Claude Code's:
   "no managed `forceLoginMethod` or `forceLoginOrgUUID` setting refuses API keys"). Hand them the adapter's credentials
   where the wording is chosen; follow the compiler.
5. The notice `agent-program-refused` gains `repair: string | null`, filled in the pass from
   `request.agentAdapter.programRepairOf(program.cause)` (`DrivePass.ts:859`). Claude Code answers its Windows install
   sentence for `batch-target` (today's `WINDOWS_CLAUDE_INSTALL_COMMAND` sentence, `OperationRefusalWordingUtil.ts:899`)
   and `null` otherwise. `agentProgramRefusalTextOf` adds the repair it is given and names no program.
6. The Bridge's billing step names no vendor: "Agents run on this machine's agent login." (`:41`, `:148`) and "Billed
   to the API key in the Overseer's environment. The key is never stored." (`:46`), "Billed to the API key." (`:151`).
   The step no longer names the variable to set; the decision the Overseer opens when the key is missing still names
   it, from the adapter. This is the plan's choice while the owner is away: assumption 1 of "Needs the owner", which
   the orchestrator copies to the status file's "Assumptions to confirm".

**Specs.** `ClaudeCodeAdapter.spec.ts`: the credentials, the repair for each cause. `Environment.integration.spec.ts`:
a named variable is read, a blank one is unset. The wording specs: each decision and the notice worded from planted
credentials and a planted repair. `OverseerDrivePass.apiBilling.spec.ts` passes unchanged in what it proves.
`BillingStepModel.spec.ts` and `BillingStep.dom.tsx`: the new sentences.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**'
--path-ignore-patterns='**/*.integration.spec.ts' ./src/AgentBoundary.spec.ts ./src/ImportDirection.spec.ts
./src/lib/claude-code/ ./src/shared/ ./cli/overseer/OverseerWording*.spec.ts
./cli/overseer/OverseerDrivePass.apiBilling.spec.ts` passes with this package's entries removed, and
`bun run record src/shared/Environment.ts` passes (the boundary that runs the changed
`Environment.integration.spec.ts`, `src/testing/BoundarySpecs.ts:185`; it starts no agent); at the root,
`bun install --frozen-lockfile` and `bun run verify` are green.

### WP2.25 Live answers, the quit act, the instruction bundle line and the start folder go through the port

**Purpose.** Four decisions the core takes on the vendor's behaviour become the port's: whether a live session takes
an answer (reach E2), how a session is asked to stop at the end of its turn (E6, the half WP2.2 left), how a session
is told to run an instruction bundle (E7), and whether a resumed session must start where it began (G2).

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Change `src/lib/agent-launch/AgentAdapter.ts` (`AgentCapabilities` `:17-25`, `instructionBundleLineOf`),
  `src/lib/claude-code/ClaudeCodeAdapter.ts`, `src/lib/claude-code/ClaudeStreamLines.ts` (`CLAUDE_CODE_CAPABILITIES`),
  and their specs; `src/testing/FakeAgentAdapter.ts`.
- Change `src/services/overseer/DrivePass.ts:376-377` (`CONTROL_RESPONSE_DELIVERS_ANSWERS` and its comment) and
  `src/services/overseer/AnswerDelivery.ts:1-5`, `:28-29` (`deliversByControlResponse`).
- Change Talos: `ChildInput`, `ClientEntry` and `FrameRefusalReason` (`src/lib/talos/@types/TalosFrame.ts`, WP2.5),
  `clientFrameOf` and `clientEntryOf` (`src/lib/talos/TalosFrames.ts`), `src/lib/talos/ChildSupervisor.ts` (WP2.8
  item 1), `src/lib/talos/constants/TalosProtocol.ts` (`TALOS_PROTOCOL_VERSION` to 2), and their specs.
- Change every Overseer site that ends a session by closing its input, found after WP2.13 with
  `git grep -n "act: 'close'" -- apps/forge/src/services apps/forge/cli ':!*.spec.ts' ':!*.spec.tsx' ':!*.dom.tsx'
  ':!*/testing/*' ':!*.json'`:
  `src/services/overseer/JobControlDelivery.ts` (today
  `:105-114`), the wind-down, `AssistantSession`, `FlintBrainSessionHost` and `JobResumption` where they close.
- Change `src/services/overseer/IntakeSessions.ts:22-26` (`IntakeFacts.firstLine`), `DrivePass.ts:832` (where the
  intake facts are built), `cli/overseer/OverseerWording.ts:276-277` (`productOwnerTextOf`).
- Change `src/services/overseer/SessionPlace.ts:1-6` and the resumed start folder rule (WP2.13 item 14).
- Change `src/AgentBoundary.spec.ts`; `docs/cli.md` where it says a session's input is closed.

**What to do.**
1. **Live answers.** `AgentCapabilities.takesLiveAnswers: boolean`, `true` for Claude Code.
   `CONTROL_RESPONSE_DELIVERS_ANSWERS` goes; `AnswerDeliveryRequest.deliversByControlResponse` becomes `deliversLive`,
   read from `adapter.capabilities.takesLiveAnswers`. The doc comments of `AnswerDelivery.ts` say "a live session takes
   the answer line" without naming its wire.
2. **The quit act.** `ChildInput` gains `{ act: 'quit-at-turn-end' }`. Talos applies the child's own launch
   `quitAtTurnEnd` (WP2.2), as its clean quit does (WP2.8 item 4.3), and appends to the event log the `ClientEntry` of
   the act it applied (`close` or `write-line`), so `JobTranscript` and `JobLiveFactsReader` read it as today.
   `ClientEntry` no longer reuses `ChildInput`: it is `{ act: 'write-line'; line: string } | { act: 'close' } | { act:
   'stop'; graceMilliseconds: number }`, the acts Talos applies, so a `quit-at-turn-end` is never logged and
   `clientEntryOf` reads a line that holds one as `null`. A child
   launched with `quitAtTurnEnd: null` answers `done` `refused` with the new reason `no-quit-act`, and the Overseer then
   sends `stop`. Raise `TALOS_PROTOCOL_VERSION` to 2: the launch's input changed (decision 6). Every Overseer site that
   sends `input` `close` to end a session sends `quit-at-turn-end`; nothing in the Overseer sends `close` any more.
   Talos still logs the applied act as the `client` entry `close` for a Claude Code session, so the specs and recorded
   stages that assert that logged entry keep it. The stage's end-to-end step 1 reads protocol 2 from here on.
3. **The instruction bundle line.** `instructionBundleLineOf(bundleName: string, argumentsText: string): string`;
   Claude Code answers `` `/${bundleName} ${argumentsText}`.trim() ``. `IntakeFacts` gains `firstLine`, built where the
   intake facts are built from `request.agentAdapter.instructionBundleLineOf(PRODUCT_NAMES.PRODUCT_OWNER_SKILL,
   intake.text)`; `productOwnerTextOf` uses it (`:277`).
4. **The start folder.** `AgentCapabilities.resumeFindsSessionByFolder: boolean`, `true` for Claude Code. SessionPlace
   starts a resumed session where its first child started (WP2.13 item 14) only while the capability holds, and today's
   place otherwise. The header's two reasons are worded without the vendor: a session in a worktree starts at its root,
   where its confinement grants the worktree's own git admin folder; a resumed session starts where it began when its
   agent finds it by that folder.
5. The fake agent keeps Claude Code's capabilities and lines, and so the new members.

**Specs.** `AnswerDelivery` specs: a live delivery with the capability, a stop and resume without it. Talos:
`Talos.agents.integration.spec.ts` gains `quit-at-turn-end` for a `close-input` and a `write-line` act, each logged as
its applied entry, and a `null` act refused `no-quit-act`; the frames spec, the new reason; a `hello` of protocol 1 is
answered `version-mismatch`. The delivery specs over recorded Talos stages: an ended job's session gets
`quit-at-turn-end`, never `close`. `OverseerWording` intake spec: the first line comes from a planted adapter's line.
`SessionPlace.spec.ts`: a resumed session without the capability starts in today's place.

**Done when.** `git grep -n "act: 'close'" -- apps/forge/src/services apps/forge/cli ':!*.spec.ts' ':!*.spec.tsx'
':!*.dom.tsx' ':!*/testing/*' ':!*.json'` prints nothing: it leaves out the specs, the testing helpers and the recorded
stages, which still hold the logged `close` entry, and `src/lib/talos/`, which logs it. In `apps/forge`,
`bun test --path-ignore-patterns='.claude/**' --path-ignore-patterns='**/*.integration.spec.ts'
./src/AgentBoundary.spec.ts ./src/lib/talos/ ./src/lib/claude-code/ ./src/services/overseer/ ./cli/overseer/` passes
with this package's entries removed, and `bun run record src/lib/talos/Talos.ts` passes (it runs the changed
`Talos.agents.integration.spec.ts`); verification step 1 of the stage reads protocol 2 from here on; at the root,
`bun install --frozen-lockfile` and `bun run verify` are green.

### WP2.26 The session's events carry the asking call, the recommendation and the window's length

**Purpose.** The views read three facts off the vendor's own words today: the asking tool's name (reach E3), the
`(Recommended)` mark on an option's label (E4) and the usage windows' keys (E5). The adapter maps each into a neutral
field of the session's events, forge stores and serves the field, and the views stage 6 moves into Gaia read it. This
replaces WP4.10 item 12's adapter util, which would have imported the adapter from `src/adapters/board-document/`.

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Change `src/lib/agent-launch/AgentSessionEvent.ts:1-6` (`AgentQuestion`'s options), `:42-50` (`tool-call`),
  `:55-63` (`usage-window`).
- Change `src/lib/claude-code/ClaudeStreamMapper.ts` (the question, tool-call and usage-window mappings),
  `src/lib/claude-code/ClaudeStreamLines.ts:29-34` (`answerLineOf`) and `:84-96` (`sentLineOf`, which reads back what
  the writers wrote), `src/lib/claude-code/ClaudeCodeAdapter.ts:62` (`QUESTION_TOOL_NAME`, which the mapper now reads
  too), and their specs: `ClaudeStreamMapper.spec.ts`, and `ClaudeStreamLines.spec.ts`, whose header (`:1-6`; `:3`
  says it) holds `sentLineOf` to be the exact inverse of the three writers, an answer with its request and answers
  among them, and to read a real session's recorded stdin lines the same way.
- Change `src/lib/tracker-model/@types/Decision.ts:35-38` (`DecisionQuestionOption.isRecommended`), the place a
  question event becomes a stored decision (find it with the compiler) and the decision's stored-record validation.
  The comment `:40` is WP2.32's.
- Change `cli/decisions/DecisionsCommand.ts:19`, which prints each option's label: today the vendor's `(Recommended)`
  reaches the `decisions` verb inside the label; from here on it prints the mark from the stored `isRecommended`. Its
  spec, `cli/decisions/DecisionCommands.spec.ts`. Change `bridge/conversation/DecisionCard.tsx:93-105`, which shows an
  option's label, to mark a recommended option as the question panel does.
- Change `src/services/overseer/JobTranscript.ts:76` (the tool-call entry's `asksUser`) and its entry type.
- Change the usage windows: `src/adapters/usage-marker/UsageWindowsFile.ts:14`,
  `src/services/overseer/BoardState.ts:51`, `src/services/overseer/JobLiveFactsReader.ts:58`,
  `bridge/@types/BoardStateDocument.ts:58` (the field `lengthHours` and comments that name no vendor key).
- Change `bridge/views/question-panel/QuestionPanelModel.ts:35`, `:104-106`, `:229`, `:239`, `:369` and
  `bridge/shell/HeaderModel.ts:90-95`, with their specs and the fixtures `bridge/testing/QuestionPanelFixture.ts:30`,
  `:161`, `bridge/testing/PipelineFixture.ts:1303-1304`.
- Change `src/AgentBoundary.spec.ts`.

**What to do.**
1. `AgentQuestion`'s option gains `isRecommended: boolean`, the name the question panel's model already gives it
   (`QuestionPanelModel.ts:106`). The Claude Code mapper strips the vendor's trailing mark (the pattern of
   `QuestionPanelModel.ts:229`, which moves into the adapter) from the label and sets the flag.
2. **The answer keeps the vendor's label.** `answerLineOf` gets back the questions the event carried: it echoes each
   recommended option with its mark again, and an answer that names a recommended option's unmarked label is sent
   with the mark, so the session reads the labels it asked with. `sentLineOf` undoes it: it reads the echoed
   questions of the line, and each answer label that is a marked label of a recommended option there reads back
   unmarked, so the transcript shows the labels the stored decision holds and `sentLineOf` stays the exact inverse of
   `answerLineOf` over the event's questions. A recorded stdin line whose echoed questions carry the mark reads back
   unmarked too. The spec's header says so beside its claim at `:3`.
3. `tool-call` gains `asksUser: boolean`, true for the vendor's asking tool. The transcript's tool-call entry carries
   it, and the question panel marks the current step by `asksUser` (`:369`), not by the tool's name.
4. `usage-window` gains `lengthHours: number | null`: 5 for `five_hour`, 168 for `seven_day`, `null` for a window the
   adapter does not know. The stored usage windows keep it beside the window. The header words a window from it: "5-hour
   window", "week" for 168, `<n>-hour window` otherwise, and the stored window name when it is `null`. The window's
   name stays an opaque value: the monitor document's `currentWindow` keeps carrying it, and Gaia never reads it.
5. `DecisionQuestionOption` gains `isRecommended: boolean`, stored with the decision; nothing migrates (decision 32).
   `QuestionPanelModel` reads `option.isRecommended` and the label as stored.
6. The `decisions` verb prints a recommended option as `<letter>. <label> (recommended)`, the mark lower case after
   the label, where the vendor's `(Recommended)` stood inside it; its `--json` carries the stored `isRecommended`.
   `DecisionCard` marks it as the question panel does. The wording is assumption 3 of "Needs the owner".

**Specs.** `ClaudeStreamMapper.spec.ts`: a marked option arrives unmarked with `isRecommended`, a mark in the middle of
a label stays, `asksUser` on the asking call only, each window's length. `ClaudeStreamLines.spec.ts`: the answer to a
recorded question with a recommended option echoes the marked label and the marked answer; `sentLineOf` of that line
answers the unmarked answer, so its inverse case holds for a question with a recommended option; an answer that names no
marked label of the echoed questions reads back as written. The decision specs: the flag round-trips through the stored
record. `DecisionCommands.spec.ts`: a stored recommended option prints with its mark, another without, and `--json`
carries the flag. `QuestionPanelModel.spec.ts` and `HeaderModel.spec.ts`: the flag, `asksUser` and the length drive
what they did before.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**'
--path-ignore-patterns='**/*.integration.spec.ts' ./src/AgentBoundary.spec.ts ./src/lib/claude-code/
./src/lib/tracker-model/ ./src/services/overseer/JobTranscript.spec.ts ./cli/decisions/ ./bridge/` passes with this
package's entries removed; at the root, `bun install --frozen-lockfile` and
`bun run verify` are green.

### WP2.27 The tool-call guards take neutral tool calls

**Purpose.** The network guard and the stage's edit guard keep forge's rules, the domains and the folders, and read a
neutral tool call; the adapter reads the vendor's hook input and words the vendor's denial (reaches D1 to D3; design
section 5 names the `bash-domains` hook). The port's worker profile stops naming the vendor's tools too: its field
`bashNetworkDomains` is the list the network guard is rendered with (`WorkerProfiles.ts:384-391`), so its rename
belongs with the guard.

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Create `src/lib/agent-launch/AgentToolCall.ts` (`AgentToolCall`, "Interfaces introduced"); change
  `src/lib/agent-launch/AgentAdapter.ts` (`toolCallOf`, `toolCallDenialLineOf`).
- Create `src/lib/claude-code/ClaudeHookInput.ts` and its spec, from `cli/hooks/BashDomainsHook.ts:14-18`, `:36-75`,
  `:80-90` and `cli/hooks/StageEditsHook.ts:21-23`, `:30-70` (the vendor's JSON, its tool names and its denial); wire
  them into `ClaudeCodeAdapter.ts`; the fake agent takes Claude Code's (`src/testing/FakeAgentAdapter.ts`).
- Change `cli/hooks/BashDomainsHook.ts`, `cli/hooks/StageEditsHook.ts`, `cli/hooks/HookCommand.ts:1-4`, `:18`, and their
  specs: `BashDomainsHook.spec.ts`, `StageEditsHook.spec.ts`, `BashDomainsHook.emptySearchPath.integration.spec.ts` (its
  boundary in `src/testing/BoundarySpecs.ts:170` stays).
- Change `src/services/overseer/JobLaunch.ts:2259-2264` (`UNSTARTABLE_GUARD_WORDS`).
- Change the port's worker profile, `src/lib/agent-launch/WorkerProfile.ts`: the field `bashNetworkDomains` (`:6`)
  becomes `shellNetworkDomains`, and the comments `:20`, `:24`, `:26`, `:28`, `:38`, `:56-57` say "file changes" and
  "shell commands and web fetches" where they name `Edit`, `Write`, `Bash` and `WebFetch`. Follow the compiler through
  the field's users (`git grep -l bashNetworkDomains -- apps/forge`, 22 files at `3274ac88`): the adapter
  (`ClaudeCodeAdapter.ts` and its specs, `testing/fixtures/frozen-session-settings.json`), the Overseer
  (`DrivePass.ts:684`, `FlintBrainProfile.ts:45`, `IntakeSessions.ts:35`, `PipelineAgentSessions.ts:217`,
  `WorkerProfiles.ts:422`, `FrozenDarwinWorkerProfiles.json` and their specs), `cli/FrozenPlatformPorts.json`, the
  fake agent's specs and `cli/overseer/OverseerWording.intake.spec.ts`. The frozen files change only in that key,
  retaken as their specs say.
- Change the `hook bash-domains` and `hook stage-edits` blocks of `cli/HelpText.ts` (`:161-177`), their section of
  `docs/cli.md`, and `src/AgentBoundary.spec.ts`.

**What to do.**
1. `toolCallOf(hookInput: string): AgentToolCall | null` answers the neutral call, `null` for input it cannot read.
   Claude Code maps `Bash` and `PowerShell` to `shell` with the requested domains (today's `allowed_domains`, `null`
   when malformed), `WebFetch` to `web-fetch` with its URL, `Edit` and `Write` to `file-change` with the path and the
   session's folder, the tools of `BashDomainsHook.ts:18` other than those to `no-reach`, and any other tool to
   `unknown`.
2. `toolCallDenialLineOf(reason: string): string` answers the line the guard prints to deny (today's
   `hookSpecificOutput`, `:80-90`).
3. The guards keep their rules on neutral calls. The network guard checks the domains of a `shell` call and the host of
   a `web-fetch` call, passes `no-reach` and `file-change`, and denies `unknown`. The edit guard checks the path of a
   `file-change` call and denies every other kind. Both still deny on any failure and exit 0; both reach the adapter as
   `context.agentAdapter`.
4. The verb and its events stay forge's: `hook session-start|bash-domains|stage-edits`. Its usage line says "the hook
   input arrives on standard input" and names no vendor event.
5. `UNSTARTABLE_GUARD_WORDS` names no vendor tool: "shell commands and web fetches" and "file edits". The wording of
   items 4 and 5 is assumption 6 of "Needs the owner".
6. The port names no vendor tool: `WorkerProfile.shellNetworkDomains`, and its comments as listed. After this package
   the guard's `port-tool-word` form finds nothing in `src/lib/agent-launch/` or `src/lib/talos/`.

**Specs.** `ClaudeHookInput.spec.ts` takes every vendor-JSON case of the two hook specs: each tool's call, malformed
domains, a missing path, the denial line. `BashDomainsHook.spec.ts` and `StageEditsHook.spec.ts` drive the guards with
planted neutral calls through a planted adapter: each verdict as before, and a deny on an unreadable input.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**'
--path-ignore-patterns='**/*.integration.spec.ts' ./src/AgentBoundary.spec.ts ./src/lib/claude-code/ ./cli/hooks/
./src/services/overseer/JobLaunch*.spec.ts ./src/services/overseer/WorkerProfiles*.spec.ts` passes with this package's
entries removed, and `bun run record src/services/overseer/GuardCommand.ts` passes (it runs the changed
`BashDomainsHook.emptySearchPath.integration.spec.ts`, `src/testing/BoundarySpecs.ts:170`, and starts no agent);
`git grep -n "bashNetworkDomains" -- apps/forge` prints nothing; `ALLOWED_AGENT_LINES` holds no key of
`src/lib/agent-launch/WorkerProfile.ts`, so no key under `src/lib/agent-launch/` or `src/lib/talos/` is left, and
WP2.22's "no entry names the port or Talos" test is tightened back to no such key at all; at the root, `bun install --frozen-lockfile` and
`bun run verify` are green.

### WP2.28 The adapter names its configuration paths and its attribution

**Purpose.** Which folders and files of a checkout configure the vendor, which a job may not write and Customs refuses,
and which commit trailer is the vendor's attribution, are the adapter's data (reaches F1 to F4).

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Change `src/lib/agent-launch/AgentAdapter.ts` (`configurationNames`, `attributionPatterns`),
  `src/lib/claude-code/ClaudeCodeAdapter.ts` (from `src/lib/claude-code/constants/ClaudeCodePaths.ts:1`) and their
  specs; `src/testing/FakeAgentAdapter.ts`.
- Change `src/services/overseer/WorkerProfiles.ts:160-195` (`claudeFoldersOf` and its two callers) and the facts its
  callers hand it; `src/services/overseer/WorkerProfiles.spec.ts`.
- Change `src/services/lifecycle/Customs.ts:307` (`AI_ATTRIBUTION_PATTERNS`), `:833-837`, the comments `:899-940`, and
  the request its callers hand it; `Customs.spec.ts`, `Customs.projectScope.spec.ts`, `Customs.provenance.spec.ts`.
- Change the comments `src/services/overseer/JobLaunch.ts:2222`, `:2330`, `:2351` and `DrivePass.ts:1102`.
- Change `src/AgentBoundary.spec.ts`.

**What to do.**
1. `configurationNames: { folderNames: readonly string[]; fileNames: readonly string[] }`, Claude Code's
   `{ folderNames: ['.claude'], fileNames: ['.mcp.json'] }`. `attributionPatterns: readonly RegExp[]`, Claude Code's
   `[/^Co-Authored-By:\s*Claude/im]`.
2. `claudeFoldersOf` becomes `agentConfigurationFoldersOf(facts)`: each folder name at the worktree's root, at the
   project's folder and at every entity home, as today. `SandboxFacts` gains `agentConfigurationFolderNames`, handed
   from the pass's adapter.
3. Customs builds its patterns from the names it is handed (each escaped; a folder `^<name>/` and `(^|/)<name>/`, a file
   `^<name>$` and `(^|/)<name>$`) and refuses the attribution patterns it is handed beside its own `/Generated with/i`.
   Its doc comments say "the agent's configuration" for `.claude/` and `.mcp.json`.
4. The comments of `JobLaunch.ts` and `DrivePass.ts` say "configuration folder".
5. `src/services/overseer/FrozenDarwinWorkerProfiles.json` does not change: the paths are the same.

**Specs.** `WorkerProfiles.spec.ts`: the denied folders come from planted names. The Customs specs: a planted folder
name and file name refused at the root and at any depth, a planted attribution pattern refused, `Generated with` still
refused. `ClaudeCodeAdapter.spec.ts`: the two values.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**'
--path-ignore-patterns='**/*.integration.spec.ts' ./src/AgentBoundary.spec.ts ./src/lib/claude-code/
./src/services/overseer/WorkerProfiles*.spec.ts ./src/services/lifecycle/` passes with this package's entries removed;
at the root, `bun install --frozen-lockfile` and `bun run verify` are green.

### WP2.29 The retired install goes: the managed block, the old hooks, the global skill links

**Purpose.** Nothing stays compatible (decision 32) and every board is set up anew, so the code that removes what
install versions 16 and earlier wrote goes, and with it most of the install's vendor names (reaches C3, C6 to C12, and
the refusal of reach H3).

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Delete `cli/adoption/constants/RetiredClaudeInstall.ts`; `cli/constants/ClaudeManagedBlockMarkers.ts` and
  `ClaudeManagedBlockMarkers.spec.ts`; `cli/setup/RetiredSkillStep.ts` and its spec;
  `cli/adoption/RetiredAgentHostRefusal.ts` and its spec; `removeManagedBlock` and `ManagedBlockMarkers` of
  `src/lib/claude-code/ClaudeInstructions.ts` (the file stays if anything else in it has a caller).
- Change `cli/adoption/constants/ClaudeCodeInstall.ts` (header `:1-3`, `RetiredSkillFolder` `:25-29`,
  `RETIRED_SKILL_FOLDERS` `:41-42`, the part comment `:44-51`, the parts `retired-managed-block` and `retired-install`
  `:63-64`, `:76-77`, `retiredSkillFolders` `:60`, `:106`).
- Change `cli/adoption/TrackerRefresh.ts:18`, `:33`, `:49`, `:225-263` and the cases `:285-288`, and the removal of
  retired skill folders (`refreshSkillFolders` and its report line before `:186`).
- Change `cli/InstallVersionCheck.ts:14`, `:27-33` (the session instructions alone mark an install).
- Change `cli/overseer/OverseerForeground.ts:78`, `:587`; `src/services/overseer/DrivePass.ts:228-229`, `:284`,
  `:429-433`, `:492`, `:1017` (the observation, the notice kind `claude-md-block-committed`, and its member of the pass
  fingerprint if it has one); `src/lib/tracker-model/@types/PlaybookStep.ts:75`;
  `src/shared/monitor/utils/NoticeWordingUtil.ts:49-50`; `cli/overseer/OverseerWording.ts:1050-1051`.
- Change `apps/gaia/src/adapters/page-api/ForgeSentenceUtil.ts:34` and `ForgeSentenceUtil.spec.ts:63-64`.
- Change `cli/setup/Setup.ts`: the header (`:1-5`, whose line `:3` names the `~/.claude/skills/` links), the import
  `:11`, the retired step `:63-64` (its heading `:63` names the vendor), and the headings `:57`, `:59`, `:65`, which
  become `1/3`, `2/3` and `3/3`; its specs. Change the callers of the retired agent host refusal in
  `init` and `update`.
- Change `cli/HelpText.ts:72-79` (what `update` removes once, rewrapping `update`'s paragraph `:69-86`; `:71`, the
  current install's `SessionStart`, is WP2.30's, and its allowlist key is rewritten here if the rewrap changes it);
  `docs/cli.md`
  (the install versions 16 and 17, the managed block, the retired agent host); `cli/constants/InstallVersion.ts` (36 to
  37); `cli/adoption/FrozenClaudeInstall.json` (the `CLAUDE.md:` and `retired:` report lines go);
  `cli/FrozenInstalledSurface.json`; `cli/overseer/FrozenRootTrackerGitCalls.json` and
  `FrozenFolderTrackerGitCalls.json` (the `git show <target>:CLAUDE.md` calls go, retaken as their specs say).
- Change the specs and fixtures the compiler and the scan name: `cli/adoption/update/UpdateCommand.spec.ts`,
  `init/InitCommand.spec.ts`, `TrackerRefresh.*.spec.ts`, `cli/InstallVersionCheck*.spec.ts`,
  `cli/setup/Setup*.spec.ts`, the `claude-md-block-committed` cases of the notice specs, and the planted `CLAUDE.md`
  blocks of `src/testing/RecordedGitFlow.ts` and `cli/testing/RecordedGitStages.ts` that exist only for the block.
- Change `src/AgentBoundary.spec.ts`, `src/ImportDirection.spec.ts`, `apps/gaia/src/AgentVendorNames.spec.ts`.

**What to do.**
1. Delete what the files list. `init` and `update` write what they wrote before but for the two retired parts; their
   report loses its `CLAUDE.md:` and `retired:` lines.
2. The pass no longer reads a target's `CLAUDE.md`: no observation, no notice, no fingerprint member. The pass waits on
   nothing the vendor's instruction file holds.
3. `setup` no longer looks into the home's skills folder, and its report has three steps.
4. Raise `INSTALL_VERSION` to 37, update `cli/FrozenInstalledSurface.json` and `FrozenClaudeInstall.json`, and run
   `bun run record src/services/overseer/InstallChangeWatch.ts` in `apps/forge`, as WP7.2 does for its raise.
5. What a user sees change (the stage's calls, "The run's calls"): `update` no longer removes install version 16's
   managed block, hooks, agent definition, dispatcher and briefs, nor the retired skill folder; `setup` no longer
   removes the `~/.claude/skills/` links and renumbers its steps; no launch waits on a committed managed block any more,
   and the notice that said so is gone from the Overseer, the monitor and Gaia. A board or a machine that still holds
   those leftovers keeps them until its owner removes them by hand. This is the plan's choice while the owner is away:
   assumption 2 of "Needs the owner".

**Specs.** The install specs: `init` and `update` write the same files and report without the two lines; a board of an
older install version is refused as any other mismatch. The pass specs: no notice and no `git show` of `CLAUDE.md`.
`ForgeSentenceUtil.spec.ts` loses the retired kind.

**Done when.** This prints nothing:
`git grep -n -i "managed block\|claude-md-block\|RetiredClaudeInstall\|RetiredSkillStep\|RetiredAgentHost" -- apps/forge/src apps/forge/cli apps/gaia/src`.
In `apps/forge`, `bun test --path-ignore-patterns='.claude/**' --path-ignore-patterns='**/*.integration.spec.ts'
./src/AgentBoundary.spec.ts ./src/ImportDirection.spec.ts ./cli/adoption/ ./cli/setup/ ./cli/InstallVersionCheck.spec.ts
./cli/overseer/` passes with this package's entries removed (no integration spec of `cli/setup/` names the retired step
or the step numbers at `3274ac88`); in `apps/gaia`, `bun test src/AgentVendorNames.spec.ts
src/adapters/page-api/` passes with its one entry removed; at the root, `bun install --frozen-lockfile` and
`bun run verify` are green.

### WP2.30 The adapter installs into a repository

**Purpose.** `init` and `update` hand the adapter a neutral installation, the command a session runs at its start and
the instruction bundles; the adapter writes its own settings entry and its bundle folders (reaches C1, C2, C4, C5,
C13, C14; design section 5 names the hook entry; "a skill becomes an instruction bundle the adapter can load"), and
the bundles' texts stop writing the vendor's slash invocation.

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Create `src/lib/agent-launch/AgentInstaller.ts` ("Interfaces introduced"); change
  `src/lib/agent-launch/AgentAdapter.ts` (`installer`).
- Create `src/lib/claude-code/ClaudeCodeInstaller.ts` and its spec, from `cli/adoption/TrackerRefresh.ts:186-224`
  (`refreshHookIn`, `refreshClaudeSettingsHooks`) and `cli/InstalledFiles.ts:30-33`
  (`installedSkillFolderInRepository`); wire it into `ClaudeCodeAdapter.ts`. The fake agent's installer is Claude Code's
  (`src/testing/FakeAgentAdapter.ts`).
- Move with `git mv` `cli/adoption/constants/ClaudeCodeInstall.ts` to `cli/adoption/constants/AgentInstall.ts`:
  `CLAUDE_CODE_INSTALL` becomes `AGENT_INSTALL`; the part `claude-settings-hooks` becomes `session-start` (the command
  `SESSION_START_HOOK` carries, `:66-72`, without its event and matcher); `skill-folders` becomes `instruction-bundles`;
  `CommandHook` (`:5`) goes, and so do the comments that name the vendor's skill format (`:22`, `:31`, "`SKILL.md`
  frontmatter … so Claude Code knows it by its folder").
- Change `cli/adoption/TrackerRefresh.ts:19-26`, `:31`, `:36-44`, `:186-224`, `:277-292` (the request gains the
  installer); `cli/adoption/InstalledFileGeneration.ts:12-17`, the comment `:36` (it fills "its `SKILL.md`
  frontmatter"), `:48` (the fills of each bundle file), `:58`, `:70`;
  `cli/InstalledFiles.ts:25`, `:30-33`; `cli/hooks/SessionStartHook.ts:1-4`, `:12`; the `init` and `update` commands
  that build the request; `cli/testing/InstalledSurfaceScan.ts:46`, which names the moved file.
- Change `skills/agent-po/SKILL.md:12` (`says "/{{productOwnerSkill}}"`) and
  `skills/agent-progress-orchestrate/SKILL.md:9` (`says "/{{skillName}}"`): the slash invocation becomes a fill.
- Change `cli/HelpText.ts:44-57` (`init`), `:71` (what `update` refreshes) and `:154-159` (`hook session-start`),
  `docs/cli.md` (`init`, `update`, `hook session-start`), `.claude/rules/skills.md` if it names the folder
  layout or the invocation.
- Change the specs: `TrackerRefresh.claudeInstall.spec.ts` and `TrackerRefresh.skillFolders.spec.ts` (their settings
  cases move to `ClaudeCodeInstaller.spec.ts`), `init/InitCommand.spec.ts`, `update/UpdateCommand.spec.ts`,
  `InstalledFileGeneration.spec.ts`, `cli/InstalledFiles.spec.ts`, `cli/InstalledSurface*.spec.ts`;
  `src/AgentBoundary.spec.ts`, `src/ImportDirection.spec.ts`.

**What to do.**
1. `AgentInstaller.refreshSessionStart(repositoryRoot, command, commandName, standardError): string` writes or keeps
   current the vendor's entry that runs `command` at a session's start and answers the report line, as
   `refreshHookIn` does today (shared settings file first, then the per-user one, the refusal of an unreadable file
   included). `instructionBundleFolderOf(bundleName): string` answers the repository folder, written with `/`, that
   the vendor loads a bundle from (Claude Code's `.claude/skills/<name>`).
2. `TrackerRefresh` writes the bundles' files itself into the folder the installer names and git-ignores it, as today;
   it knows no vendor path. `--no-hooks` still leaves the session-start entry alone.
3. `init` and `update` write the same files and the same report as before; the report labels stay `hooks` and
   `skills`. Raise `INSTALL_VERSION` only if `cli/FrozenInstalledSurface.json` changes.
4. The `hook session-start` verb stays forge's; its comment says the agent's session-start entry runs it. The help
   text says "the agent's session-start entry, in the settings the agent adapter writes" and "the folder the agent
   loads instruction bundles from" where it names `.claude/settings.local.json`, `.claude/skills/` and `SessionStart`
   (assumption 7 of "Needs the owner").
5. **A bundle's invocation is the adapter's.** The bundles' texts write `"{{productOwnerSkillLine}}"` and
   `"{{skillLine}}"` where they wrote `"/{{productOwnerSkill}}"` and `"/{{skillName}}"`, and
   `InstalledFileGeneration` fills them with the adapter's `instructionBundleLineOf(name, '')` (WP2.25), which Claude
   Code answers as `/<name>`, so the installed text is byte for byte today's and `cli/FrozenInstalledSurface.json`
   does not change. The fill needs the adapter, so `installedSkillFileTexts` takes it from the request.
6. **The bundle's source format stays.** Each bundle is `skills/<folder>/` with a `SKILL.md` whose YAML header holds
   `name` (filled with the installed name) and `description`, the format the one adapter loads; forge copies the folder
   file by file and names neither the file nor the header in its code or comments, and `AgentBoundary.spec.ts`'s
   header says why the source files' names are no finding (WP2.22 item 3). A second adapter that loads another format
   renders the same texts in its installer.

**Specs.** `ClaudeCodeInstaller.spec.ts`: each settings case of today (absent, kept current in the shared file,
installed in the per-user file, refused unreadable) and the bundle folder. The forge specs read the folder through the
installer and assert the same report. `InstalledFileGeneration.spec.ts`: a planted adapter's invocation line fills both
bundles; with Claude Code's the installed texts equal `cli/FrozenInstalledSurface.json`.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**'
--path-ignore-patterns='**/*.integration.spec.ts' ./src/AgentBoundary.spec.ts ./src/ImportDirection.spec.ts
./src/lib/claude-code/ ./cli/adoption/ ./cli/InstalledFiles.spec.ts ./cli/InstalledSurface.spec.ts
./cli/HelpText.spec.ts` passes with this package's entries removed, and `VENDOR_ADAPTER_IMPORTERS_UNTIL_CLOSED` is
empty and deleted; `git grep -n -e '/{{' -e 'SKILL\.md' -- apps/forge/skills apps/forge/resources apps/forge/cli
':!*.spec.ts' ':!*/testing/*' ':!*.json'` prints nothing; at the root, `bun install --frozen-lockfile` and
`bun run verify` are green.

### WP2.31 A session is confined by its agent's own sandbox or by forge's, as the port declares

**Purpose.** A session's confinement no longer rests on an assumption about the vendor (reaches G1; design section 5,
the Agent row). An agent that brings its own sandbox is confined by it, applied through its adapter, which renders the
worker profile into the agent's settings and declares that confinement as a capability; forge's own confinement, the
`GateConfinement` port that already confines every line, wraps a session whose agent brings none, as the design's Agent
row says (`docs/monorepo/hephaestus-talos.md`, section 5); assumption 8 of "Needs the owner". Never both: on macOS a
Seatbelt profile with any deny rule refuses a nested `sandbox_apply` (checked on 2026-11-18 with
`/usr/bin/sandbox-exec`: an outer profile with one `deny file-write*` rule makes the inner `sandbox-exec` exit 71,
"Operation not permitted"; an outer `(allow default)` alone lets it run, which is all that probe
`os-sandbox-exec-nested` checks), and the vendor starts its own sandbox for every shell call.

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Change `src/lib/agent-launch/AgentAdapter.ts` (`AgentCapabilities.ownConfinement`, `sessionWritablePathsOf`) and
  `src/lib/agent-launch/AgentLaunchRequest.ts:5-6` (`AgentConfinement`'s doc comment, neutral).
- Change `src/lib/claude-code/ClaudeStreamLines.ts` (`CLAUDE_CODE_CAPABILITIES`), `ClaudeCodeAdapter.ts` and their
  specs; the fake agent keeps Claude Code's capabilities.
- Change `src/lib/gate-confinement/GateConfinement.ts:5-18` (`ConfinementPlan.writableRoots`), `DarwinSeatbelt.ts`,
  `LinuxBubblewrap.ts`, `WindowsNoConfinement.ts`, `GateConfinementFor.ts`, and their contract specs
  (`GateConfinement.contract.spec.ts`, `GateConfinement.contract.integration.spec.ts`).
- Create `src/services/overseer/SessionConfinement.ts` and its spec: a session's `ConfinementPlan` from its
  `WorkerProfile`, beside `LineSandbox.ts` (WP2.16's name for `ProcessWatcherSandbox.ts`), which passes
  `writableRoots: []`.
- Change the launch of an agent child (`DrivePass.ts`, `launchAgentChild` after WP2.13; the confinement is chosen at
  `:796-798`, `sessionConfinementOf`), and every other site that turns `planOf` into a launch (find them with
  `git grep -n "planOf(" -- apps/forge/src apps/forge/cli`).
- Change `cli/overseer/OverseerWording.ts:256-268` (`CONFINEMENT_WORDING`) only if a sentence names who confines.
- Change `apps/forge/CLAUDE.md`: a row in its Deviations table (item 6).

**What to do.**
1. `AgentCapabilities.ownConfinement: 'applies-the-profile' | 'none'`. Claude Code answers `applies-the-profile`: its
   sandbox applies the profile's write roots, denies and network domains (`ClaudeSettings.ts`).
2. `applies-the-profile`: the launch is as today. `confined` asks the agent's own sandbox, which must start or the
   session does not run.
3. `none`: the Overseer builds `SessionConfinement.planOf(profile, adapter.sessionWritablePathsOf(homeDirectory))`
   (the worktree or write root, the profile's other writable roots and `extraWritableDirectory`, its denied writable
   and readable roots, `network: true`, since the agent reaches its provider) and wraps the plan's argv with
   `confinedLineOf` (`src/lib/gate-confinement/ConfinedLine.ts`), as a line is wrapped. `unavailable` refuses the
   launch with today's `sandbox-unavailable` incident (`WORKER_LAUNCH_STEP`, `DrivePass.ts:373-374`). A profile with
   network domains (a non-empty `shellNetworkDomains`, or `webNetworkDomains` a list) is refused the same way, with a
   reason that says forge's confinement allows the network whole or not at all: no domain line is ever widened.
4. `ConfinementPlan.writableRoots`: Seatbelt and bubblewrap allow writes below each, as below `worktree`; the denied
   roots still win.
5. Name in the files' comments why both never wrap one session (the measured refusal above).
6. The Deviations row of `apps/forge/CLAUDE.md`, since the `none` path has no adapter that takes it: "Code starts
   beside its only consumer; never in anticipation. | `src/services/overseer/SessionConfinement.ts` wraps a session in
   forge's `GateConfinement` when its agent adapter declares `ownConfinement: 'none'`, though Claude Code, the one
   adapter, confines its sessions itself. | The owner's rule of 2026-11-18 makes a session's confinement the port's
   declaration, not an assumption about the vendor; the path is held by specs over a planted adapter and by the
   contract integration spec." The design's section 5 says the same beside the store's deviation.

**Specs.** `SessionConfinement.spec.ts`: the plan of each role's profile. The pass specs over a planted adapter with
`ownConfinement: 'none'` and a recorded `GateConfinement`: the argv is wrapped, an `unavailable` port refuses the
launch, a profile with network domains is refused; with Claude Code's capability nothing changes. The contract specs:
the new field on each adapter. `GateConfinement.contract.integration.spec.ts` (real, macOS): a session-shaped plan lets
a child write each writable root and refuses a denied root; under the Seatbelt adapter's confined argv, a child that
runs `/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny file-write* (subpath "<scratch>"))' /bin/echo` exits 71,
which proves the reason for item 5 on each recording.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**'
--path-ignore-patterns='**/*.integration.spec.ts' ./src/lib/gate-confinement/
./src/services/overseer/SessionConfinement.spec.ts ./src/services/overseer/DrivePass*.spec.ts ./src/lib/claude-code/`
passes; `bun run record src/lib/gate-confinement/` passes (the boundary that lists the contract integration spec,
`src/testing/BoundarySpecs.ts:91-94`); at the root,
`bun install --frozen-lockfile` and `bun run verify` are green.

### WP2.32 The vendor's names leave the wording, the prompts and the comments

**Purpose.** The last reaches are words: refusals, help, prompts the sessions read, and comments (reaches H2 to H5, I1,
I2, G3, the comment of `src/services/lifecycle/TokenCrediting.ts:47`, and every comment finding WP2.22 gave this
package). After this package the guard's allowlist holds only its permanent entries, and no comment outside the adapter
names the vendor's program, flags, tools or hook events.

**Files.** Lines at `3274ac88`; reread on the tree you run on.
- Change `src/lib/agent-launch/AgentAdapter.ts` (`displayName`, `promptFills`), `ClaudeCodeAdapter.ts`, the fake agent.
- Change `src/adapters/utils/OperationRefusalWordingUtil.ts:289`, `:396`; `cli/drafts/DraftContentSubcommands.ts:58`;
  `cli/adoption/init/InitCommand.ts:50`; `cli/overseer/OverseerWording.ts:256-268` (`CONFINEMENT_WORDING`: the
  sentences `:261`, `:267` and their key `productOwnerBashNetwork`, which `:286` fills) and the two templates that hold
  that key, `resources/prompts/ProductOwnerPrompt.md:8` and `resources/prompts/BuiltInBriefProductOwner.md:7` (the
  installed default product owner brief, `cli/adoption/FrozenClaudeInstall.json:13`).
- Change the comments that name the vendor's tool, flags or program, each in its place: the asking tool in
  `src/lib/tracker-model/@types/Decision.ts:40`, `:57`, `@types/OptionConsequences.ts:2`,
  `src/lib/tracker-model/BoardRecords.ts:129`, `constants/DecisionAndIncidentVocabulary.ts:80`,
  `src/services/overseer/QuestionRouting.ts:2`; the tools in `src/services/overseer/IntakeSessions.ts:2-3` and
  `src/lib/process-identity/PosixProcessGroups.ts:53` ("a Bash command"); the vendor's flags in
  `src/services/overseer/JobResumption.ts:2` (`--resume <id>`), `src/services/overseer/ApiBillingStops.ts:3`
  (`--max-budget-usd`) and `src/lib/tracker-model/JobControls.ts:180` (`--resume`); the program in
  `src/lib/tracker-model/@types/Ticket.ts:17`, `src/lib/data-folders/PosixDataFolders.ts:15` and
  `src/services/lifecycle/TokenCrediting.ts:47`. Lines WP2.13 to WP2.16 rewrote are found again by the guard and by
  the greps of "Done when".
- Change the prompts and the template: `resources/prompts/AirlockReportMessage.md:1`, `AirlockReReviewMessage.md:16`,
  `HumanCodeReviewReReviewMessage.md:16`, `ProductOwnerPrompt.md:7`, `:12`, `ReviewPrompt.md:12`, `:18`, `:26`,
  `BuildPrompt.md:12`, `PipelineAgentResearch.md:6`; `resources/templates/Constitution.md:3`; the places that fill them
  (`cli/overseer/OverseerWording.ts` for the launch text, `cli/adoption/InstalledFileGeneration.ts:67-75` for the
  installed defaults; find the others with `git grep -n "filledTemplateOf" -- apps/forge/src apps/forge/cli`).
- Change `cli/adoption/FrozenClaudeInstall.json` and `cli/FrozenInstalledSurface.json` if the installed texts change,
  and raise `INSTALL_VERSION` then.
- Change `apps/forge/CLAUDE.md` (a Deviations row, item 5); `src/AgentBoundary.spec.ts`.

**What to do.**
1. "the option Claude recommends" becomes "the option the agent recommends" (`:289`, `:396`, `:58`).
2. `displayName` (Claude Code's `'Claude Code'`); `init`'s next steps say "Ask an agent session (Claude Code) in this
   repository", the name read from `context.agentAdapter.displayName`.
3. `CONFINEMENT_WORDING` says "shell commands" where it says `Bash`: its key `productOwnerBashNetwork` becomes
   `productOwnerShellNetwork`, in the wording, its fill and both templates, and its sentences "Shell commands reach no
   network." and "Do not use the network from a shell command." The installed default brief changes, so
   `INSTALL_VERSION` rises (Files).
4. `promptFills: Readonly<Record<AgentPromptFillName, string>>` with `AgentPromptFillName = 'askUserTool' |
   'webFetchTool' | 'webSearchTool' | 'instructionFile' | 'agentConfigurationPaths'`; Claude Code's `AskUserQuestion`,
   `WebFetch`, `WebSearch`, `CLAUDE.md` and `` `.claude/`, `.mcp.json` ``. Each prompt line writes the fill
   (`{{askUserTool}}`, `{{instructionFile}}`, `{{agentConfigurationPaths}}`, `{{webFetchTool}}`, `{{webSearchTool}}`),
   and every place that fills these files adds the adapter's fills to its values: the installed defaults at `init` and
   `update`, the messages at launch. The rendered text a session reads is the same as today's.
5. The Deviations row of `apps/forge/CLAUDE.md`: "Code names no agent vendor (`src/AgentBoundary.spec.ts`) | The model
   tiers `haiku`, `sonnet`, `opus` and `fable` and the efforts up to `max` are forge's tier words in the model, the
   pipeline and the views | A pipeline names a tier and an effort; the agent adapter maps them to its own models
   (`src/lib/tracker-model/constants/AgentSettings.ts:5-7`)". `Ticket.ts:17` and `Decision.ts:40` say "the tiers an
   agent adapter maps" and "the question shape the agent port carries".
6. Comments outside the adapter name no vendor: `PosixDataFolders.ts:15` says programs keep scratch files under `/tmp`;
   the asking tool becomes "an agent's question request" (`Decision.ts:57`, `BoardRecords.ts:129`,
   `DecisionAndIncidentVocabulary.ts:80`, `QuestionRouting.ts:2`, `OptionConsequences.ts:2`); `IntakeSessions.ts:2-3`
   says "web fetches and searches only, shell commands with no domain"; `PosixProcessGroups.ts:53` says "a shell
   command"; `JobResumption.ts:2` says the next child resumes the agent's session, `ApiBillingStops.ts:3` "a stop at the
   pipeline's budget cap", `JobControls.ts:180` "never a resumed session"; `TokenCrediting.ts:47` names the adapter's
   reading of a transcript, not its util.
7. The wording of items 1 to 3 is the plan's choice while the owner is away: assumptions 4 and 5 of "Needs the owner".

**Specs.** The wording specs of each sentence; `OverseerWording` launch-text specs: a filled prompt reads as before;
`InstalledFileGeneration.spec.ts`: the installed defaults hold the adapter's fills; `cli/ReferenceCopies.spec.ts` and
`src/ProseWrap.spec.ts` pass on the changed prompts.

**Done when.** `ALLOWED_AGENT_LINES` holds only its `Permanent:` entries (the seam's two lines) and Gaia's allowlist is
empty; the guard reads every comment line with every form (WP2.22 item 3), so a comment that names the vendor fails it.
The greps below hold what the forms leave out (`--resume` and `--max-budget-usd`, forge's own option names too) and
read the tree again by hand. They print, comment lines included:
- `git grep -n -i -P "claude|anthropic" -- apps/forge/src apps/forge/cli apps/forge/bridge apps/forge/resources
  apps/forge/skills ':!apps/forge/src/lib/claude-code' ':!*.spec.ts' ':!*.spec.tsx' ':!*.dom.tsx' ':!*/testing/*'
  ':!*.json'`: only `cli/CommandContext.ts`'s two seam code lines (the import of `claudeCodeAdapterFor` and the line of
  `agentAdapterOfThisProcess` that calls it, `:11` and `:79` at `3274ac88`, `:11` and `:72` on `main`) and the
  `.claude/` folders of this repository's own development (`.evidence`, `worktrees`, `rules`). The file's other lines
  that name the vendor are gone by then: WP2.23 removes `claudeConfigFolder` (`:15`, `:56`, `:142`) and rewrites the
  comments `:53` and `:55`; WP2.24 removes `claudeConfigFolderVariable` (`:16`) and rewrites the comments `:73` and
  `:77` (`:66` and `:70` on `main`), so the field's comment says "the agent port's adapter, or the scripted fake agent
  under the fake-agent switch" and the function's "the one place outside the agent port's adapter that chooses it".
- `git grep -n -e '--resume' -e '--max-budget-usd' -- apps/forge/src ':!apps/forge/src/lib/claude-code' ':!*.spec.ts'
  ':!*/testing/*'`: nothing (the options of those names are forge's own, in `cli/pipeline/`).
- `git grep -n -P "AskUserQuestion|WebFetch|WebSearch|\bBash\b|\bSessionStart\b|PreToolUse|BashNetwork" --
  apps/forge/src/lib apps/forge/src/services apps/forge/cli ':!apps/forge/src/lib/claude-code' ':!*.spec.ts'
  ':!*/testing/*' ':!*.json'`: nothing (`bridge/` is left out: its comments quote tool names an agent reported, such as
  "Bash ×4").

In `apps/forge`, `bun test --path-ignore-patterns='.claude/**' --path-ignore-patterns='**/*.integration.spec.ts'
./src/AgentBoundary.spec.ts ./src/ImportDirection.spec.ts ./src/ProseWrap.spec.ts ./cli/` passes; in `apps/gaia`,
`bun test src/AgentVendorNames.spec.ts` passes; at the root, `bun install --frozen-lockfile` and `bun run verify` are
green.

## Interfaces introduced

All in TypeScript as they are to be written. Field names are exact.

### Constants

`src/lib/talos/constants/TalosProtocol.ts`:

```ts
/** Raised by hand whenever a frame, the launch, or a reply changes; never with the code version. */
export const TALOS_PROTOCOL_VERSION = 1; // 2 from WP2.25, whose `quit-at-turn-end` changes a frame
export const CHILD_RECORD_FORMAT_VERSION = 1;
export const TALOS_RECORD_FORMAT_VERSION = 1;
export const TALOS_START_FILE_FORMAT_VERSION = 1;
/** Origin `talos` replaced `watcher`. */
export const EVENT_LOG_FORMAT_VERSION = 2;
export const TALOS_CLIENT_LINE_LIMIT_CHARACTERS = 33_554_432;
export const CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS = 500;
/** Below this renewal interval the wake rule waits two intervals. */
export const WAKE_GRACE_DOUBLING_BELOW_MILLISECONDS = 5000;
export const TALOS_FOLDER_NAME = 'talos';
export const PRIVATE_FOLDER_NAME = 'private';
```

`src/shared/constants/OverseerLimits.ts` (the Overseer writes the lease's bounds into the start file and the line bound
into each launch; specs pass short ones):

```ts
export const SUPERVISION_LEASE_MILLISECONDS = 60_000;
/** Renewed from the main loop, and only while the Overseer's passes make progress (`LeaseRenewal.ts`). */
export const LEASE_RENEWAL_INTERVAL_MILLISECONDS = 15_000;
export const CLEAN_QUIT_TURN_END_WAIT_MILLISECONDS = 10_000;
/** Every install, prepare and gate line, a sleep not counted; a merge carries no bound. */
export const LINE_TIME_BOUND_MILLISECONDS = 900_000;
export const TALOS_TICK_MILLISECONDS = 1000;
/**
 * Two ticks further apart than one tick plus this are a gap: a sleep, a suspension, or a clock that moved. The lease
 * renewal reads its own timer's gaps by the same allowance.
 */
export const TALOS_TICK_GAP_MILLISECONDS = 5000;
export const TALOS_FRAME_TIMEOUT_MILLISECONDS = 2000;
export const TALOS_START_TRIES = 40;
export const TALOS_START_INTERVAL_MILLISECONDS = 250;
/** Covers the clean quit's 10 seconds and its stop sweep at TALOS_START_INTERVAL_MILLISECONDS. */
export const TALOS_QUIT_TRIES = 60;
export const TALOS_LINE_LOOK_MILLISECONDS = 1000;
```

`REGROUP_HELLO_TIMEOUT_MILLISECONDS` (`OverseerLimits.ts:54`) is deleted; `SESSION_STOP_GRACE_MILLISECONDS` stays.

### Files

Board folder means the tracker's data folder (`workspace.trackerDirectory`).

| File | Writer | Format |
| --- | --- | --- |
| `<board>/talos/start-<n>.json` | Overseer | `TalosStartFile` |
| `<board>/talos/talos-<n>.json` | Talos | `TalosRecord`, created exclusively as the claim, then replaced atomically |
| `<board>/talos/talos-<n>.log` | Talos (and its spawn's stdout and stderr) | text, appended |
| `<board>/talos/launches-<n>.ndjson` | Talos | one `LaunchRegistryEntry` per accepted launch, appended |
| `<board>/<childFolder>/child-<i>.json` | Talos | `ChildRecord`, replaced atomically |
| `<board>/<childFolder>/events-<i>.ndjson` | Talos | `EventLogEntry` lines, appended, format 2 |
| `<board>/<childFolder>/child-<i>.log` | Talos | the child's stderr, appended |
| `<board>/<childFolder>/child-<i>.lost-cause` | Overseer | one `InterruptionCause` and a line feed |
| `<board>/<childFolder>/child-<i>.refused-forced-stops` | Overseer | `{ refusals, treeProcessIds }`, as `Regrouping.ts:78-94` |
| `<board>/merge-gates/<16 hex>/outcome.json` | Overseer | `{ formatVersion: 1, gate: MergedTreeGate }`, written once at the run's end (WP2.19) |
| `<monitor>/private/<trackerId>/talos-<n>.secret` | Overseer | the secret, owner-only |
| `<monitor>/private/<trackerId>/token` | Overseer | the API token (moved from `watchers/`) |
| `<monitor>/private/<16 hex>.sock` | Talos | the endpoint on macOS and Linux; a named pipe on Windows |

Child folders: a job's agent `jobs/<J>`; a job's lines `jobs/<J>/<step folder>`, as `JobLaunch.ts:334-353` and
`gateStepsOf` (`:741-761`) name them: `install`, `install2`; `gate-prepare`, `gate-prepare2` and `gate-1`, `gate-2`,
suffixed `-<n>` from the session's second instance on, prefixed `target-` for the review's catch-up gate run and
`main-` for a round of the main-line merge (`:1789-1791`);
`target-merge`; `main-merge`, `main-merge-<round>`; `flint-brain`; `merge-gates/<hash>/<kind>-<i>`, or
`merge-gates/<hash>/part-<p>/<kind>-<i>` on a pipeline with entities; `gate-profile-runs/<P>/<kind>-<i>`;
`pipeline-checks/<checkName>/run-<r>/<kind>-<i>`. `<kind>` is `prepare` or `gate`.

```ts
// src/lib/talos/TalosFiles.ts
export function talosFolderOf(boardFolder: string): string;
export function startFilePathOf(boardFolder: string, startNumber: number): string;
export function talosRecordPathOf(boardFolder: string, startNumber: number): string;
export function talosLogPathOf(boardFolder: string, startNumber: number): string;
export function launchRegistryPathOf(boardFolder: string, startNumber: number): string;
export interface ChildFiles { recordPath: string; eventLogPath: string; standardErrorPath: string }
export function childFilesOf(boardFolder: string, childFolder: string, instance: number): ChildFiles;
export function privateFolderOf(monitorFolder: string, trackerId: string): string;
export function talosSecretPathOf(monitorFolder: string, trackerId: string, startNumber: number): string;
```

### Start file

```ts
export interface TalosStartFile {
  formatVersion:               1;
  startNumber:                 number;
  /** Absolute; every child folder resolves under it. */
  boardFolder:                 string;
  endpoint:                    string;
  secretFilePath:              string;
  /** The code version of the Overseer that started it, recorded and reported, never compared. */
  codeVersion:                 string;
  leaseMilliseconds:           number;
  renewalIntervalMilliseconds: number;
  cleanQuitWaitMilliseconds:   number;
  tickMilliseconds:            number;
  tickGapMilliseconds:         number;
}
```

### Records

```ts
export type TalosState = 'claimed' | 'serving' | 'quitting' | 'quit';
export type TalosQuitReason = 'protocol-mismatch' | 'restart' | 'start-refused';
export type LeaseStanding = 'unheld' | 'held' | 'waiting-after-gap' | 'ended';

export interface LeaseRenewer {
  processId:    number;
  startStamp:   string;
  bootIdentity: string;
  /** The Baton generation of the renewing Overseer. */
  generation:   number;
}

export interface TalosRecord {
  formatVersion:   1;
  startNumber:     number;
  protocolVersion: number;
  codeVersion:     string;
  talos:           ProcessIdentity | null;
  state:           TalosState;
  endpoint:        string | null;
  quitReason:      TalosQuitReason | null;
  /** Written on each change of standing, never per renewal. */
  lease:           { standing: LeaseStanding; lastRenewer: LeaseRenewer | null };
}

export type ChildKind = 'agent' | 'line';
export type ChildState = 'starting' | 'running' | 'stopping' | 'ended';
/**
 * `exited` and `signalled` are the child's own end or a requested stop; `paused` a clean quit; `lease-ended` the lease;
 * `time-bound` a line past its bound; `spawn-failed` no child ever ran.
 */
export type ChildEndReason = 'exited' | 'signalled' | 'spawn-failed' | 'paused' | 'lease-ended' | 'time-bound';

export interface ChildEnd {
  reason:          ChildEndReason;
  exitCode:        number | null;
  signal:          string | null;
  /** Why no child ran; `null` when one did. */
  detail:          string | null;
  /**
   * Wall time from the spawn to the end less every gap Talos added to the allowance: the bound's measure. Recorded and
   * shown only; 0 when no child ran.
   */
  runMilliseconds: number;
}

export interface RecognisedEnding {
  /** The pattern's name, `network-outage` for Claude Code. */
  name:                string;
  /** The event-log sequence of the closing line it matched. */
  closingLineSequence: number;
  countedLines:        number;
}

export interface ChildRecord {
  formatVersion:         1;
  childId:               string;
  kind:                  ChildKind;
  label:                 string;
  /** The launch's working directory: a resumed session starts where its first instance started (`SessionPlace.ts:63-71`). */
  workingDirectory:      string;
  talosStartNumber:      number;
  talos:                 ProcessIdentity | null;
  state:                 ChildState;
  childProcess:          ProcessIdentity | null;
  /** Its group's id on POSIX, the pid alone on Windows. */
  childProcessGroupId:   number | null;
  eventLogFormatVersion: 2;
  timeBoundMilliseconds: number | null;
  recognisedEndings:     readonly RecognisedEnding[];
  end:                   ChildEnd | null;
}

export interface LaunchRegistryEntry { childId: string; childFolder: string; instance: number; kind: ChildKind }

export type EventOrigin = 'agent' | 'client' | 'talos';
// EventLogEntry keeps { sequence, origin, line, at? } of src/lib/watcher/EventLog.ts:11-17.
```

### Line conditions and endings

```ts
export type FieldCondition =
  | { test: 'equals'; path: string; value: string | number | boolean | null }
  | { test: 'one-of'; path: string; values: readonly (string | number | boolean)[] }
  | { test: 'number-between'; path: string; least: number; most: number };

export interface LineConditions {
  allOf:  readonly FieldCondition[];
  /** Empty holds. */
  anyOf:  readonly FieldCondition[];
  noneOf: readonly FieldCondition[];
}

export interface EndingPattern {
  name:                string;
  closingLineMatches:  LineConditions;
  countedLineMatches:  LineConditions | null;
  minimumCountedLines: number;
}

export type QuitAtTurnEnd = { act: 'close-input' } | { act: 'write-line'; line: string };
// StandingReply keeps { whenAllEqual, whenNoneEqual, replyTemplate } of src/lib/watcher/StandingReplies.ts:5-9;
// WP2.21 adds requestIdentifierPath ("The agent port").
```

`AgentLaunchPlan` (`src/lib/agent-launch/AgentLaunchPlan.ts`) gains `closingLine: PlanLineConditions | null`,
`endingPatterns: readonly PlanEndingPattern[]`, `quitAtTurnEnd: QuitAtTurnEnd | null`, and renames
`environmentFromWatcher` to `environmentFromTalos`. `AgentAdapter.ts` gains `AGENT_ENDING_NAMES = ['network-outage']`
and `type AgentEndingName`.

### Launch

```ts
export interface ChildLaunch {
  /** Relative to the board folder, `/`-separated. */
  childFolder:                    string;
  instance:                       number;
  kind:                           ChildKind;
  label:                          string;
  argv:                           readonly string[];
  /** The child's whole environment; nothing of Talos's own is inherited. */
  environment:                    Readonly<Record<string, string>>;
  /** Child variable to the name of Talos's own variable it copies at spawn; no file holds the value. */
  environmentFromTalos:           Readonly<Record<string, string>>;
  workingDirectory:               string;
  verbatimArguments:              boolean;
  standingReplies:                readonly StandingReply[];
  closingLine:                    LineConditions | null;
  endingPatterns:                 readonly EndingPattern[];
  quitAtTurnEnd:                  QuitAtTurnEnd | null;
  treeStopAtEndGraceMilliseconds: number | null;
  /** Lines only. */
  timeBoundMilliseconds:          number | null;
}
// childId = `${childFolder}#${instance}`
```

### Frames

One JSON object per line in both directions. The three frames marked frozen never change shape in any protocol version;
`FrozenTalosHandshake.json` holds them.

```ts
// Overseer to Talos.
/** Frozen. The first line of every connection. */
export interface HelloFrame { kind: 'hello'; requiredProtocolVersion: number; secret: string }

export interface LeaseRenewalFrame { kind: 'lease-renewal'; frameId: number; renewer: LeaseRenewer }
export interface LaunchFrame       { kind: 'launch'; frameId: number; launch: ChildLaunch }
export type ChildInput = { act: 'write-line'; line: string } | { act: 'close' };
export interface InputFrame        { kind: 'input'; frameId: number; childId: string; input: ChildInput }
/** The line of an event-log entry of origin `client`: what Talos did to an agent's input or process, appended before it acts. */
export type ClientEntry = ChildInput | { act: 'stop'; graceMilliseconds: number };
export interface StopFrame         { kind: 'stop'; frameId: number; childId: string; graceMilliseconds: number }
export interface StopLinesFrame    { kind: 'stop-lines'; frameId: number }
export interface QuitFrame         { kind: 'quit'; frameId: number; reason: 'restart' }
export type ClientFrame = LeaseRenewalFrame | LaunchFrame | InputFrame | StopFrame | StopLinesFrame | QuitFrame;

// Talos to the Overseer.
/** Frozen. Answers a `hello` of another protocol version; Talos then quits cleanly. */
export interface VersionMismatchFrame { kind: 'version-mismatch'; protocolVersion: number }
/** Frozen. Answers a first line that is no `hello`, a wrong secret, or any `hello` while quitting. */
export interface RefusedFrame { kind: 'refused'; reason: 'malformed' | 'secret' | 'quitting' }

export interface WelcomeFrame {
  kind:            'welcome';
  protocolVersion: number;
  codeVersion:     string;
  startNumber:     number;
  talos:           ProcessIdentity | null;
  leaseStanding:   LeaseStanding;
}

export type FrameRefusalReason =
  | 'malformed-launch' | 'folder-outside-board' | 'unknown-child' | 'child-ended' | 'kind-takes-no-input' | 'quitting';
export type DoneFrame =
  | { kind: 'done'; frameId: number; verdict: 'done' | 'already-done' }
  | { kind: 'done'; frameId: number; verdict: 'refused'; reason: FrameRefusalReason };

export interface StateFrame {
  kind:             'state';
  childId:          string;
  state:            ChildState;
  end:              ChildEnd | null;
  recognisedEnding: RecognisedEnding | null;
}
export type TalosFrame = VersionMismatchFrame | RefusedFrame | WelcomeFrame | DoneFrame | StateFrame;
```

Every `ClientFrame` is answered by exactly one `DoneFrame` of its `frameId`. `StateFrame`s go to every welcomed
connection. Events are never sent over the socket: the Overseer reads the event log
(`src/services/overseer/DataFolderWatch.ts:1-5` wakes the pass on file changes).

### Synchronous calls

```ts
export type SynchronousCallRequest =
  | { callId: number; call: 'start'; platform: string; systemRoot: string | null }
  | { callId: number; call: 'identity-of'; processId: number }
  | { callId: number; call: 'tree-members-of'; leader: ProcessIdentity; earlierMembers: readonly ProcessTreeMember[] }
  | { callId: number; call: 'stop-tree'; leader: ProcessIdentity; stage: ProcessStopStage; treeMembers: readonly ProcessTreeMember[] }
  | { callId: number; call: 'end-of'; exitCode: number | null; signalCode: string | null; forcedStopRan: boolean }
  | { callId: number; call: 'open-event-log'; eventLogPath: string }
  | { callId: number; call: 'append-event'; eventLogPath: string; entry: EventLogEntry }
  | { callId: number; call: 'sync-and-close-event-log'; eventLogPath: string }
  | { callId: number; call: 'write-record'; path: string; text: string; exclusive: boolean }
  | { callId: number; call: 'append-text'; path: string; text: string };

export type SynchronousCallAnswer =
  | { callId: number; verdict: 'done'; value: unknown }
  | { callId: number; verdict: 'failed'; reason: string };
```

### Lease

```ts
export interface LeaseBounds {
  leaseMilliseconds:           number;
  renewalIntervalMilliseconds: number;
  tickMilliseconds:            number;
  tickGapMilliseconds:         number;
}
export interface SupervisionLease {
  readonly standing: () => LeaseStanding;
  readonly renewed:  (wallNowMilliseconds: number) => void;
  readonly ticked:   (wallNowMilliseconds: number) => 'lease-ended' | null;
}
export function createSupervisionLease(bounds: LeaseBounds, wallNowMilliseconds: number): SupervisionLease;
export function gapLengthOf(previousWallMilliseconds: number, wallNowMilliseconds: number, tickMilliseconds: number): number;
```

### The Overseer's side

```ts
// src/services/overseer/BoardChildren.ts
export type ChildLiveness =
  | { verdict: 'unlaunched' }
  | { verdict: 'live'; state: Exclude<ChildState, 'ended'> }
  | { verdict: 'ended'; end: ChildEnd }
  | { verdict: 'lost' };

export type ChildLaunchOutcome =
  | { verdict: 'launched' }
  | { verdict: 'already-launched' }
  | { verdict: 'refused'; reason: FrameRefusalReason }
  | { verdict: 'talos-unavailable' };

export interface AgentChildRequest {
  childFolder:                    string;
  instance:                       number;
  label:                          string;
  workingDirectory:               string;
  plan:                           AgentLaunchPlan;
  treeStopAtEndGraceMilliseconds: number | null;
}

export interface LineChildRequest {
  childFolder:           string;
  instance:              number;
  label:                 string;
  workingDirectory:      string;
  argv:                  readonly string[];
  verbatimArguments:     boolean;
  environment:           Readonly<Record<string, string>>;
  timeBoundMilliseconds: number | null;
}

export interface BoardChildren {
  readonly beginPass:           () => void;
  readonly jobFolderOf:         (jobId: string) => string;
  readonly livenessOf:          (childFolder: string, instance: number) => ChildLiveness;
  readonly recordOf:            (childFolder: string, instance: number) => ChildRecord | null;
  readonly newestInstanceIn:    (childFolder: string) => number | null;
  readonly eventsAfter:         (childFolder: string, instance: number, afterSequence: number) => readonly EventLogEntry[] | 'malformed';
  readonly recognisedEndingsOf: (childFolder: string, instance: number) => readonly RecognisedEnding[];
  readonly launchAgent:         (request: AgentChildRequest) => Promise<ChildLaunchOutcome>;
  readonly launchLine:          (request: LineChildRequest) => Promise<ChildLaunchOutcome>;
  readonly sendInput:           (childFolder: string, instance: number, input: ChildInput) => Promise<boolean>;
  readonly sendInputOnce:       (markerPath: string, childFolder: string, instance: number, inputs: readonly ChildInput[]) => Promise<boolean>;
  readonly stop:                (childFolder: string, instance: number, graceMilliseconds: number) => Promise<boolean>;
  readonly stopLiveLines:       () => Promise<boolean>;
}

// src/services/overseer/TalosStart.ts
export type TalosAvailability =
  | { verdict: 'attached'; connection: TalosConnection; startNumber: number }
  | { verdict: 'started'; connection: TalosConnection; startNumber: number; previousTalos: 'none' | 'quit' | 'lost'; sweptOrphans: number }
  | { verdict: 'held'; reason: 'talos-protocol-differs'; answeredProtocolVersion: number };

// src/services/overseer/LeaseRenewal.ts
export interface PassProgress {
  /** The number of the pass running now, counted from 1 over the Overseer's life; `null` between passes. */
  readonly passInFlight: () => number | null;
}
export interface LeaseRenewalRequest {
  /** The connection `ensureTalos` answered, read at each renewal, so a Talos started while serving is followed. */
  connection:           () => TalosConnection | null;
  renewer:              LeaseRenewer;
  intervalMilliseconds: number;
  tickGapMilliseconds:  number;
  passProgress:         PassProgress;
  wallNowMilliseconds:  () => number;
  log:                  (sentence: string) => void;
  /** After each renewal Talos answered `done`; stage 3 writes the heartbeat here. */
  onRenewed?:           (renewedAtWallMilliseconds: number) => void;
}
export interface LeaseRenewal {
  readonly stop: () => void;
}
export function startLeaseRenewal(request: LeaseRenewalRequest): LeaseRenewal;

// src/services/overseer/MergedTreeGateRuns.ts
export interface MergedTreeGateRunRequest {
  worktreePath:  string;
  treeId:        string;
  phase:         GatePhase;
  gatedEntities: readonly EntityKey[] | undefined;
  /** The gate-run stamp of the pipeline read for this ask; its hashes key the run folder. */
  stamp:         GateRunStamp;
  /** Starts the run; called once per run folder. */
  run:           () => Promise<MergedTreeGate>;
}
export interface MergedTreeGateRuns {
  readonly gateOf:        (request: MergedTreeGateRunRequest) => MergedTreeGate | 'running';
  /** Removes the run folder once its outcome settled the Airlock. */
  readonly settled:       (request: Pick<MergedTreeGateRunRequest, 'worktreePath' | 'treeId' | 'phase' | 'gatedEntities' | 'stamp'>) => void;
  readonly stopAll:       () => Promise<void>;
  readonly settleAtStart: () => void;
}
export interface MergedTreeGateRunsRequest {
  boardFolder: string;
  wake:        (forced: boolean) => void;
  log:         (sentence: string) => void;
}
export function createMergedTreeGateRuns(request: MergedTreeGateRunsRequest): MergedTreeGateRuns;

// src/services/overseer/Airlocks.ts, in AirlocksContext, in place of `gateMergedTree`
mergedTreeGateOf: (worktreePath: string, treeId: string, phase: GatePhase, gatedEntities?: readonly EntityKey[]) => MergedTreeGate | 'running';

// src/services/lifecycle/GateRun.ts
export interface LineRunRequest {
  /** The step's child folder under the board folder, from the run's `childFolder` (WP2.14 item 1). */
  childFolder:           string;
  argv:                  readonly string[];
  verbatimArguments:     boolean;
  directory:             string;
  environment:           Readonly<Record<string, string>>;
  label:                 string;
  timeBoundMilliseconds: number | null;
  onOutputLine?:         (line: string) => void;
}
export interface LineRunEnd {
  exitCode:        number | null;
  signalCode:      string | null;
  endReason:       ChildEndReason | 'talos-unavailable';
  output:          string;
  /** The child end's `runMilliseconds`; 0 when Talos was unavailable. */
  runMilliseconds: number;
}
export type LineRunner = (request: LineRunRequest) => Promise<LineRunEnd>;
```

### Model, documents and refusals

- `InterruptionCause` gains `'talos-paused' | 'lease-ended' | 'network-outage'`; `JobStates.ts` gains
  `INTERRUPTION_CAUSES_HELD_FROM_RESUMING = ['network-outage', 'lease-ended']`.
- `packages/forge-contracts`: `MONITOR_INTERRUPTION_CAUSES` and `type MonitorInterruptionCause`, the eleven causes as
  the wire spells them (`watcher-lost` as `child-lost`), the contract's one cause union, which stage 3 widens; `MonitorJobDocument.interruption: MonitorInterruptionCause | null`, the cause while the job is
  `interrupted`. Gaia's `AgentRow` gains `interruption: string | null`.
- The log record `pipeline-step-ran` (`stepKind`, `stepName`, `phase`, `entity`, `runMilliseconds`, `ending`), and
  `PipelineFacts.stepRunTimes`:

  ```ts
  export interface PipelineStepRunTimeFacts {
    /** Only on a step of an entity's pipeline. */
    entity?:         EntityKey;
    stepKind:        'prepare' | 'gate';
    stepName:        string;
    /** The gate run's phase; absent for an install step. */
    phase?:          GatePhase;
    /** Recorded and shown only, in the measure of the line's bound. */
    runMilliseconds: number;
    ending:          'passed' | 'failed' | 'time-bound';
    /** The stamp of the record it comes from. */
    at:              string;
  }
  ```
- The forge system version 1.19: a monitor job's interruption cause, the identity's `talosProtocolVersion`, the
  pipeline facts' step run times.
- `Job.watcherInstance` becomes `Job.childInstance` (stored key `childInstance`); `FIRST_WATCHER_INSTANCE` becomes
  `FIRST_CHILD_INSTANCE`.
- `SupervisedChildKind` loses `watcher` and gains `talos`.
- `BatonPassStep` loses `build-bundles` and `read-watcher-files` and gains `read-child-records`.
- `BatonRecord.watcherProtocolVersion` and `OverseerIdentity.watcherProtocolVersion` become `talosProtocolVersion`.
- The job document loses `watcherProtocol` and `watchOnly`; the pass state loses `legacyWatcherJobIds`; the notice
  `watcher-endpoint-does-not-fit` goes.
- Refusal kinds: `talos-protocol-differs` (`requiredProtocolVersion`, `answeredProtocolVersion`) is added;
  `watcher-bundle-failed` and `watcher-endpoint-does-not-fit` go.

### The agent port (WP2.21 to WP2.32)

`src/lib/agent-launch/` gains these members; every adapter implements them, the fake agent with Claude Code's values.

```ts
// AgentLaunchPlan.ts (WP2.21); src/lib/talos/StandingReplies.ts holds its twin.
export interface StandingReply {
  readonly whenAllEqual:          Readonly<Record<string, string | boolean>>;
  readonly whenNoneEqual:         Readonly<Record<string, string | boolean>>;
  /** Its `{{request-identifier}}` is filled from the line's string at `requestIdentifierPath`. */
  readonly replyTemplate:         string;
  /** `null` for a template with no placeholder. */
  readonly requestIdentifierPath: string | null;
}

// AgentTranscripts.ts (WP2.23)
export interface SubagentFacts {
  readonly parentToolUseId: string;
  readonly toolCalls:       number;
  readonly lastToolCall:    { readonly toolName: string; readonly startedAt: string | null; readonly running: boolean } | null;
  readonly tokens:          number;
  readonly description:     string | null;
}
/** One subagent of the project as the `usage` verb counts it: today's `AgentUsage` (`UsageAgents.ts:14-19`), flattened. */
export interface SubagentUsage {
  readonly sessionIdentifier:           string;
  readonly agentIdentifier:             string;
  /** Where the agent kept it; printed and carried by `--json` as today's `transcriptPath`. */
  readonly transcriptPath:              string;
  readonly startedAt:                   string | null;
  readonly model:                       string | null;
  readonly apiCallCount:                number;
  readonly inputTokens:                 number;
  readonly cacheReadInputTokens:        number;
  readonly cacheCreationInputTokens:    number;
  readonly outputTokens:                number;
  readonly totalInputTokens:            number;
  readonly endContextTokens:            number;
  readonly oversizedContextTokens:      number;
  readonly browserCallCount:            number;
  /** Edits made through a shell command rather than the agent's file-editing tools. */
  readonly shellEditScriptCount:        number;
  readonly verificationRunCount:        number;
  readonly nestedInstructionCharacters: number;
  readonly briefExcerpt:                string;
}
export interface SubagentUsageRequest {
  readonly projectRoot:                      string;
  readonly homeDirectory:                    string;
  /** The `--transcripts <folder>` option; `null` reads the agent's own folder for the project. */
  readonly transcriptFolder:                 string | null;
  readonly oversizedContextThresholdTokens:  number;
  readonly briefExcerptCharacters:           number;
  /** Told of each transcript that could not be read; it is left out of the answer. */
  readonly onUnreadableTranscript:           (transcriptPath: string) => void;
}

// AgentToolCall.ts (WP2.27)
export type AgentToolCall =
  /** `null` domains: the call named domains in a shape the adapter cannot read. */
  | { readonly kind: 'shell'; readonly requestedDomains: readonly string[] | null }
  | { readonly kind: 'web-fetch'; readonly url: string | null }
  | { readonly kind: 'file-change'; readonly path: string | null; readonly workingDirectory: string | null }
  /** A call that reaches no network and runs no command. */
  | { readonly kind: 'no-reach' }
  | { readonly kind: 'unknown'; readonly toolName: string };

// AgentInstaller.ts (WP2.30)
export interface AgentInstaller {
  /** Writes or keeps current the agent's entry that runs `command` when a session starts; answers the report line. */
  refreshSessionStart(repositoryRoot: string, command: string, commandName: string, standardError: (text: string) => void): string;
  /** The repository folder, written with `/`, the agent loads the instruction bundle `bundleName` from. */
  instructionBundleFolderOf(bundleName: string): string;
}

// AgentAdapter.ts
export interface AgentCredentials {
  /** The variable that moves the agent's own folder, read through `agentVariableOf`; `null` when there is none. */
  readonly configurationFolderVariableName: string | null;
  /** The variable API billing needs before any session starts. */
  readonly billingKeyVariableName:          string;
  /** What to check when the provider refuses the key, worded for the decision it opens. */
  readonly authenticationCheckSentence:     string;
}
export type AgentPromptFillName = 'askUserTool' | 'webFetchTool' | 'webSearchTool' | 'instructionFile' | 'agentConfigurationPaths';

export interface AgentCapabilities {
  // ...today's members, and:
  /** A live session takes an answer line; `false`: the Overseer stops it and resumes it with the answer (WP2.25). */
  readonly takesLiveAnswers:           boolean;
  /** A resumed session is found by the folder it began in (WP2.25). */
  readonly resumeFindsSessionByFolder: boolean;
  /** The agent's own sandbox applies the whole worker profile; `none`: forge's confinement wraps the session (WP2.31). */
  readonly ownConfinement:             'applies-the-profile' | 'none';
}

export interface AgentAdapter {
  // ...today's members, and:
  readonly displayName:        string;                                                  // WP2.32
  readonly credentials:        AgentCredentials;                                        // WP2.24
  readonly configurationNames: { readonly folderNames: readonly string[]; readonly fileNames: readonly string[] }; // WP2.28
  readonly attributionPatterns: readonly RegExp[];                                      // WP2.28
  readonly promptFills:        Readonly<Record<AgentPromptFillName, string>>;           // WP2.32
  readonly installer:          AgentInstaller;                                          // WP2.30
  sessionSubagentsOf(homeDirectory: string, sessionId: string, talliedParentToolUseIds: ReadonlySet<string>): readonly SubagentFacts[]; // WP2.23
  subagentUsagesOf(request: SubagentUsageRequest): readonly SubagentUsage[];          // WP2.23
  /** The sentence that repairs a refused program, or `null`. */
  programRepairOf(cause: ExecutableRefusalCause): string | null;                       // WP2.24
  /** The first line that makes a session run the bundle `bundleName` on `argumentsText`. */
  instructionBundleLineOf(bundleName: string, argumentsText: string): string;          // WP2.25
  /** `null` for an input the adapter cannot read: the guard then denies. */
  toolCallOf(hookInput: string): AgentToolCall | null;                                 // WP2.27
  toolCallDenialLineOf(reason: string): string;                                        // WP2.27
  /** The agent's own folders a session writes outside the profile, for forge's confinement (WP2.31). */
  sessionWritablePathsOf(homeDirectory: string): readonly string[];
}
```

- `AgentSessionEvent` (WP2.26): an `AgentQuestion` option gains `isRecommended: boolean` and carries its label without
  the vendor's mark; `tool-call` gains `asksUser: boolean`; `usage-window` gains `lengthHours: number | null`. The
  stored `DecisionQuestionOption` gains `isRecommended: boolean` (stage 4 serves it as the decision document's
  `recommended`), the transcript's tool-call entry `asksUser`, the stored usage window `lengthHours`.
- Talos (WP2.25): `ChildInput` gains `{ act: 'quit-at-turn-end' }`, which Talos applies as the child's launch
  `quitAtTurnEnd`; `ClientEntry` lists the applied acts itself (`write-line`, `close`, `stop`), never
  `quit-at-turn-end`; `FrameRefusalReason` gains `'no-quit-act'`; `TALOS_PROTOCOL_VERSION` rises to 2.
- `GateConfinement` (WP2.31): `ConfinementPlan` gains `writableRoots: readonly string[]` beside `worktree`; a line's
  plan passes `[]`.
- `src/shared/Environment.ts` (WP2.24): `agentVariableOf(name)` and `agentVariableIsSet(name)` replace
  `claudeConfigFolderVariable()` and `apiBillingKeyIsSet()`; `claudeConfigFolder()` goes (WP2.23).
- `CommandContext` (WP2.23) loses `claudeConfigFolder`. The notice `agent-program-refused` (WP2.24) gains `repair:
  string | null`. The notice `claude-md-block-committed` and the install parts `retired-managed-block` and
  `retired-install` go (WP2.29); `INSTALL_VERSION` is 37. `CLAUDE_CODE_INSTALL` becomes `AGENT_INSTALL` in
  `cli/adoption/constants/AgentInstall.ts`, with the parts `session-start` and `instruction-bundles` (WP2.30).
- The cohort maths is `cli/measurement/usage/utils/UsageCohortUtil.ts` (WP2.23), over `SubagentUsage`; the `usage`
  verb's own row keeps `bashEditScriptCount` and its `--json` key.
- `WorkerProfile.bashNetworkDomains` becomes `shellNetworkDomains` (WP2.27); the port's comments name no vendor tool.
- Guards (WP2.22): `apps/forge/src/AgentBoundary.spec.ts`, over code and comment lines (`ALLOWED_AGENT_LINES`,
  permanent at the end: the two lines of `cli/CommandContext.ts`), over the testing helpers (`ALLOWED_TESTING_LINES`,
  permanent at the end: the lines that record, stamp, trap or smoke-test the real program, this repository's own agent
  files and the fixtures the fake agent's adapter reads) and over the probe files by file (`AGENT_EVIDENCE_FILES`);
  `apps/gaia/src/AgentVendorNames.spec.ts` (empty allowlist at the end); and the import rule
  `vendor-adapter-imported-outside-its-seam` over all of `src/lib/claude-code/`, whose importers are the seam and the
  fake agent's files.

## Traps

- **Reading the log before the recognition.** The pass reads a job's event log and acts on a `result` line in the same
  hold. If it reads the record's `recognisedEndings` before the log, a closing line written between the two reads is
  acted on as a normal result: the build moves to `in-customs` and ends `no-report`. Talos writes the recognition before
  the line (WP2.8 item 2), and the pass reads liveness, then the log, then the endings (WP2.13 item 3). Do not merge the
  two record reads into one.
- **Matching the vendor's free text.** The outage result's `result` text can be imitated by a model. Every pattern names
  fields; the specs of WP2.1 plant a text that says "connection failed". Never add a `contains` test.
- **A secret check after the version check.** If the version is compared first, anyone who can open the socket can make
  Talos quit and pause every agent. `hello` checks the secret first (WP2.7 item 3).
- **A `hello` parsed by the general frame parser.** A change to a later frame would then change how a first line reads,
  which breaks decision 6. The first line goes through `helloFrameOf` alone, held by the frozen table.
- **Talos started from the program on disk loops on a mismatch.** With no pinned bundle, a pull between the Overseer's
  start and Talos's start gives a Talos of another protocol; quitting and starting again gives the same Talos. Start it
  once; a mismatch from a Talos the Overseer just started is `held` and refuses the Overseer's start (WP2.9 item 2.6).
- **Synchronous work on Talos's main thread.** `ProcessSupervision` runs `/bin/ps` with `Bun.spawnSync`
  (`ProcessSupervisionFor.ts:19`); a stop listing per child blocks the loop. Everything synchronous goes to the
  synchronous-calls thread; `TalosMainThread.spec.ts` holds it. A blocked loop is also read as a gap by the lease, which
  grants grace and delays every frame.
- **A renewal that proves only life.** A renewal from a worker thread, a second process or a bare timer goes on while a
  pass hangs in an await, so a hung Overseer would keep its agents running with nobody routing their questions. The
  renewal runs on the main loop and is withheld while one pass stays in flight (WP2.9 item 3). Do not move it off the
  loop to survive a slow pass; make the pass faster.
- **A pass that waits through a gate.** The Airlock awaits a merged-tree gate in the pass today (`Airlocks.ts:703`,
  `:864-866`), up to 15 minutes a line, and its gate slot before that (`GateRun.ts:346`). With the renewal on progress
  every landing would end the lease after a minute. WP2.19 runs the gate beside the pass and lands before WP2.13 wires
  the renewal.
- **A sleep read as a hang.** After a sleep the renewal timer's first tick can find the pass that ran before the sleep
  still in flight. A late tick renews and starts the comparison afresh (WP2.9 item 3.1); without that, a pass caught by
  a sleep withholds the renewal past Talos's wake grace and stops every agent.
- **Two runs of one merged-tree gate.** A pass that reaches a gating Airlock while its run is in flight must answer
  `running`, never start a second run on the same worktree; the run folder is the key (WP2.19 item 2).
- **A kept outcome of another pipeline.** An outcome kept by tree and phase alone would settle a re-gate after the
  pipeline changed with the old result. The folder's key holds the gate-run stamp and the gated entities.
- **Stopping the renewal at a release.** The successor holds the Baton only after the predecessor released
  (`OverseerForeground.ts:651-660`, `:724-738`), up to `BATON_PASS_RELEASE_TRIES` intervals later
  (`OverseerLimits.ts:69-72`). If the predecessor stops renewing at its release, the lease can end in that wait. The
  predecessor's timer runs until it exits, and with its passes stopped it renews as an idle loop.
- **Counting a lease end or a clean quit as a crash.** `Jobs.ts:145` defaults a missing cause to `watcher-lost`, a
  counted crash. Map `paused` and `lease-ended` before the `agent-crashed` branch (`DrivePass.ts:614-615`); two counted
  crashes in a row open an `outage` decision (`Playbook.ts:188-200`).
- **A lease end resumed by itself.** A `lease-ended` job left off `INTERRUPTION_CAUSES_HELD_FROM_RESUMING` comes back at
  the hung Overseer's next pass, which decision 38 forbids. It sits beside `network-outage` (WP2.11 item 2).
- **A session job replaced on an outage.** `crashBoundStepsOf` replaces every interrupted session kind before it looks
  at the cause, and resumes a pipeline agent by its own branch. Put the held causes before both (WP2.11 item 3).
- **A paused line judged.** A gate stopped by a clean quit exits by a signal, which judges `cannot-run` and opens an
  incident. A `paused` end is never judged; the step runs again as the next instance (WP2.13 item 6). The fixed
  `PROCESS_WATCHER_INSTANCE = 1` (`JobLaunch.ts:360`) cannot express a re-run.
- **An unbounded install.** The bound is a field of each launch. A prepare or install step launched with `null` runs
  for ever; every install, prepare and gate launch carries `LINE_TIME_BOUND_MILLISECONDS` (WP2.13 item 6, WP2.14
  item 4).
- **Two entity parts in one folder.** A merged-tree gate on a pipeline with entities runs one pipeline per entity, each
  counting its steps from the first again (`MergedTreeGateRun.ts:45-63`, `GateRun.ts:370-390`). A run folder keyed by
  the tree alone would hand the second entity's first gate the first entity's ended child; each part gets its own
  folder (WP2.14 item 1). The same holds for the forge's and an entity's pipeline checks of one setup, which run side by
  side (WP2.14 item 3).
- **A resumed session that starts elsewhere.** A resumed session finds its first start folder in the first launch file
  today (`SessionPlace.ts:63-71`). With no launch file it would start in today's place and its vendor would not find
  the session; the child record carries `workingDirectory` (WP2.13 item 14).
- **A `client` entry the transcript cannot read.** The transcript and the turn reader parse the event log's `client`
  lines (`JobTranscript.ts:89-94`, `JobLiveFactsReader.ts:241-246`). Talos appends each as a `ClientEntry`, and WP2.13
  moves both readers to it in the same change as the switch.
- **Removing a worktree under a running line.** Gate profiles and pipeline checks are marked stopped and their worktrees
  removed at start (`GateProfiling.ts:262-266`, `PipelineChecking.ts:223-227`). Under Talos their lines outlive the
  Overseer, so stop them first (WP2.14 item 5), and the leftover lines of a merged-tree gate too.
- **The bound counting a sleep.** On a laptop, a gate or an install running across a sleep would be stopped on wake.
  Add every detected gap to the line's allowance (WP2.7 item 8, decision 37), and leave the gaps out of its run time.
- **The lease ending a line.** The lease stops agents only (decision 29); a lease end that ran the clean quit's line
  step would stop installs on every sleep with a dead Overseer.
- **Writing the environment.** The child's environment holds the vendor's login variables (`ClaudeCodeAdapter.ts:44-60`,
  inherited through `inheritedVariableNames`). No launch file exists; Talos must not log a launch frame, and
  `talos-<n>.log` gets the label and `childId` only. The API key reaches the child only through `environmentFromTalos`.
- **A frame counted as taken on connect.** Today a frame counts as taken once the socket connected
  (`WatcherFleet.ts:225-231`). Write a marker only after `done`, or a message is lost when Talos refuses it.
- **Reading a Watcher's record as Talos's.** Old boards hold `watcher-<n>.json` and old event logs with origin
  `watcher`. Nothing reads them; a format-2 reader reports an old log as malformed, which is a verdict, not a throw.
  Boards are set up anew.
- **The planted `watcher-lost` in the names guard.** `src/ComponentNames.spec.ts` plants `watcher-lost` as allowed.
  Adding the bare word `watcher` to `RETIRED_NAMES` breaks stage 9's ownership of that value; add only the code names.
- **A monitor key Gaia does not name.** Gaia's `ShapeOf` names every key of a document
  (`apps/gaia/src/adapters/forge-api/utils/DocumentShapeUtil.ts:24-25`), so `interruption` on `MonitorJobDocument`
  turns Gaia's typecheck red unless `JOB_SHAPE` gains it in the same commit (WP2.11).
- **`node:net` data left unread.** A socket whose data nobody reads never sees `close` (`WatcherFleet.ts:221`); every
  Talos connection reads data.
- **Specs waiting out production bounds.** Every bound reaches Talos through the start file or the launch; specs pass
  milliseconds. No `Bun.sleep` before an assertion (`src/SpecSleeps.spec.ts`).
- **An allowlist entry left behind, or removed too early.** `src/AgentBoundary.spec.ts` fails an unused entry as it
  fails a new finding. A package removes exactly its own entries; a package of any stage that rewrites an allowlisted
  line, or moves its file, rewrites the entry's key in the same commit. The fix is never a wider pattern exemption.
- **A recommendation stripped from the answer too.** The adapter strips the vendor's mark from an option's label
  (WP2.26), but the session matches an answer by the label it asked with. `answerLineOf` echoes the marked label and
  sends a recommended answer marked; without it, a live answer to a recommended option is refused or misread. And
  `sentLineOf` strips the mark again from what it reads back, or the transcript shows labels the stored decision does
  not hold and `ClaudeStreamLines.spec.ts` no longer finds it the inverse of the writers.
- **Two sandboxes around one session.** On macOS a Seatbelt profile with any deny rule refuses a nested
  `sandbox_apply`, and the vendor starts its own sandbox for every shell call. A session whose agent applies the
  profile itself is never wrapped in forge's confinement too (WP2.31); doing so makes every shell call of the session
  fail.
- **A closed input as the quit act.** Closing stdin ends a Claude Code session at the end of its turn; another agent
  may need a line. The Overseer sends `quit-at-turn-end`, and Talos applies the launch's own act (WP2.25). An `input`
  `close` sent to end a session brings the vendor's act back into the core.
- **A word of the port read as a tool name.** The guard's `port-tool-word` form makes `src/lib/agent-launch/` and
  `src/lib/talos/` name no vendor tool, so a comment there that starts a sentence with "Read" or "Write" is a finding.
  Reword the sentence ("Reads the record"), never narrow the form or allowlist the line: no key may name these folders
  but the one carve-out, `src/lib/agent-launch/WorkerProfile.ts`, until WP2.27 renames `bashNetworkDomains`, rewords
  its comments and removes the key.
- **A testing helper taken for the boundary's evidence.** `ALLOWED_TESTING_LINES` lists what records, stamps, traps or
  smoke-tests the real program. A helper that starts `claude` for any other reason is a reach, however it is tested;
  it goes behind the adapter or into a probe.
- **A capability the fake agent lacks.** The fake agent takes Claude Code's capabilities, lines and values. A new member
  of the port that the fake does not set fails the typecheck; one it sets differently from Claude Code makes the
  scratch forge's end-to-end check prove another adapter than the one that ships. The one exception is the two
  transcript reads (WP2.23 item 5): the fake answers them empty, which is what Claude Code answers on the scratch home
  the fake runs in, where no session wrote a transcript, so the check still proves the shipped adapter's answer there.

## Verification of the whole stage

At the repository root:

```sh
bun install --frozen-lockfile
bun run verify
```

In `apps/forge`, the specs that matter most:

```sh
bun test --path-ignore-patterns='.claude/**' ./src/lib/talos/
bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/TalosChildren.spec.ts ./src/services/overseer/TalosStart.spec.ts ./src/services/overseer/LeaseRenewal.spec.ts ./src/services/overseer/TalosLines.spec.ts ./src/services/overseer/MergedTreeGateRuns.spec.ts
bun test --path-ignore-patterns='.claude/**' ./src/lib/tracker-model/ ./src/services/render/
bun test --path-ignore-patterns='.claude/**' ./cli/overseer/
bun test --path-ignore-patterns='.claude/**' --path-ignore-patterns='**/*.integration.spec.ts' ./src/AgentBoundary.spec.ts ./src/ImportDirection.spec.ts ./src/lib/claude-code/ ./cli/hooks/ ./cli/adoption/ ./cli/measurement/ ./cli/decisions/
(cd ../gaia && bun test src/AgentVendorNames.spec.ts)
bun run record src/lib/talos/Talos.ts
bun run record src/services/overseer/TalosStart.ts
bun run record src/services/overseer/LeaseRenewal.ts
bun run record src/lib/gate-confinement/
```

`ALLOWED_AGENT_LINES` in `src/AgentBoundary.spec.ts` holds only its two `Permanent:` entries, the seam's lines of
`cli/CommandContext.ts`, and the scan reads comment lines; `ALLOWED_TESTING_LINES` holds only `Permanent:` entries;
Gaia's `AgentVendorNames.spec.ts` allows nothing; `VENDOR_ADAPTER_IMPORTERS_UNTIL_CLOSED` is gone from
`src/ImportDirection.spec.ts`.

`bun run verify:integration` in `apps/forge` runs every real-system spec; it runs only when the owner asks for it (gate
G4).

End to end on a scratch forge, as `docs/development/contributing.md:76-110` sets one up (`HOME` in a scratch folder,
`FORGE_ROOT` at a scratch repository, `FORGE_FAKE_AGENT=1`, the program run from this checkout with `bun
agent-progress.ts`). Never on the real home or the live board. The verb that starts the Overseer is `oversee` until
stage 9 replaces it with `forge start`. The monitor document is `GET /api/monitor` with the token in
`<scratch home>/.forge-monitor/private/<trackerId>/token`.

1. `oversee --port 0` in the background. `<board>/talos/talos-1.json` reads `serving` with protocol 2 (WP2.25 raised it
   from 1); the Overseer's log says the lease renewal started.
2. With `FORGE_FAKE_AGENT_REPORTS=1` and only `overseerOnly: true` gates (`docs/development/contributing.md:161-165`),
   ready a ticket. Its build runs: `jobs/<J>/child-1.json` is `running`, `install/child-1.json` and the gate steps'
   records (`gate-1/child-1.json`) appear in turn, each ended with its `runMilliseconds`, and the ticket reaches review
   and lands as before. Its merged-tree gate runs under `merge-gates/<key>/` while the Overseer's log shows passes
   that end, and `outcome.json` appears before the landing. The board state's pipeline facts list a `stepRunTimes`
   entry per install and gate step, and the Overseer's log holds no withheld renewal. Unset `FORGE_FAKE_AGENT_REPORTS`
   for the steps below.
3. Stop the Overseer while a fake agent works (`FORGE_FAKE_AGENT_KEEPS_WORKING=1`). Within one minute the agent still
   runs; start the Overseer again: it attaches to `talos-1` and the job goes on.
4. Stop the Overseer and wait past one minute: the agent's record ends `lease-ended`, an install line started before the
   stop runs to its end; on the next start the job is interrupted `lease-ended` and waits, nothing resumes it, and the
   monitor document lists it with `interruption: 'lease-ended'`.
5. Suspend the Overseer (`kill -STOP`) for 30 seconds and continue it: nothing stops. Suspend it for 90 seconds and
   continue it: Talos ended the lease a minute after the last renewal, the agent's record ends `lease-ended`, the first
   tick after the continue renews, and the job waits as in step 4.
6. Raise `TALOS_PROTOCOL_VERSION` in a throwaway local edit and restart the Overseer: the old Talos answers
   `version-mismatch`, its agents end `paused`, `talos-2.json` serves, the jobs are interrupted `talos-paused` and
   resumed by themselves. Revert the edit.
7. Run the fake agent's outage scenario on a ticket (`FORGE_FAKE_AGENT_NETWORK_OUTAGE=1`, once the owner recorded it at
   gate G1): the record lists `network-outage`, the job is interrupted `network-outage`, its session is stopped, nothing
   resumes it, no `outage` decision opens, and the monitor document lists it with `interruption: 'network-outage'`.
   Without that recording, this step waits and the stage report says so.
8. `kill -9` the Talos process while a gate line runs: the next pass finds Talos lost, stops the gate's tree, and starts
   `talos-3`.
9. Queue a gate profile and a pipeline check: their lines show as children under `gate-profile-runs/<P>/` and
   `pipeline-checks/<checkName>/run-1/`; a Stop ends them; the profile's time is its line's `runMilliseconds`.
10. End the scratch board, then check that no `bun` process of `talos.ts` and no child of the scratch board is left (`ps
    -A -o pid,command | grep talos.ts`).
11. The agent port, on the same scratch repository: `init` reports the hooks and the skills in the folders the adapter's
    installer names, with no `CLAUDE.md:` or `retired:` line; when a ticket's build session is ended while the
    Overseer serves, its event log holds the `client` entry `close`, the act its launch named, which Talos applied for
    the Overseer's `quit-at-turn-end`; `usage --since 1d` runs and prints its cohorts (none on a scratch home). No step
    reads or writes the real home's agent folder.

## Out of scope

- Turning `reboot` into a cause that waits for an instruction, the `resume` instruction (one job, one ticket,
  everything, or everything that ended on a network outage), the two automatic restarts a user's resume gives back, the
  crash log, the forge that stays off after a crash of the Overseer or of Talos or a crash suspected before a reboot,
  the heartbeat and the completed stop on record: stage 3 (decisions 39 to 41).
- Two resumes of a crashed agent and no more: stage 3. `JOB_RESUMES_BEFORE_FRESH` keeps its meaning here.
- Gaia's alert on an ending on a network outage, its one control that resumes every such job across forges, and its
  mark of a forge that stopped supervising its agents (decisions 35 and 38): stage 6, reading the monitor job's
  `interruption` and Gaia's `AgentRow` of WP2.11.
- The pipeline overview that shows each line's run time: stage 6; the contract's field for it: stage 4.
- A command kind and a Gaia control to restart Talos cleanly (decision 31): the mechanism exists (`quit` frame,
  `restart`), the command `talos-restart` and its control come with stage 6 (WP6.22).
- Gaia showing the running and the newest Talos: stage 6 (WP6.22) reads `talosProtocolVersion`.
- A crash log and a stop when Talos is found lost: stage 3 (its need N6) changes the two `ensureTalos` call sites of
  WP2.9 and WP2.13 item 13.
- Renaming the stored cause `watcher-lost`, the `overseer-*` records and anything named Overseer, and the `oversee` verb
  that `forge start` and the top-level lifecycle verbs replace: stage 9 (decision 42).
- Carrying a merged-tree gate, a gate profile or a pipeline check across a restart of the Overseer: the next start stops
  their lines and runs the gate again or marks the run stopped (the run's calls above).
- Removing Flint's brain: stage 8; here it only moves under Talos.
- A second agent adapter, a neutral wire for the fake agent, and filtering the network by domain in forge's own
  confinement for an agent without a sandbox of its own: none is built. WP2.31 refuses such a session a network line
  instead.
- The store port: stage 5. Talos's files stay under the operating system port, as design section 4 has them.
- Any new workspace package; any change to `packages/` beyond the monitor job's `interruption` and the system version
  in `forge-contracts`; Flint's `watcher-spark` names stay.

## Needs the owner

Decisions 35 to 38 settle what Talos does. The agent port packages meet points of behaviour the owner has not settled;
the owner is away while the run builds, so each is the plan's best-founded choice, written into its package and built,
and listed here as an assumption to confirm. The orchestrator copies this list to the status file's "Assumptions to
confirm".

Assumptions to confirm:

1. **The Bridge's billing step names no variable** (WP2.24 item 6). It says "Agents run on this machine's agent login."
   and "Billed to the API key in the Overseer's environment. The key is never stored." in place of naming "Claude" and
   `ANTHROPIC_API_KEY`; the decision the Overseer opens when the key is missing still names the variable, from the
   adapter.
2. **`update` and `setup` no longer clean up after install version 16 or the global skill links** (WP2.29 item 5).
   `update` leaves the managed `CLAUDE.md` block, the `SubagentStop`, `PreToolUse` and `PostToolUse` entries, the
   worker agent definition, the dispatcher script, the three briefs and the retired skill folder where they are;
   `setup` leaves the `~/.claude/skills/` links and numbers its steps `1/3` to `3/3`; the notice
   `claude-md-block-committed` and the launch's wait on a committed managed block go. A board or machine that still
   holds them keeps them until its owner removes them by hand.
3. **A recommended option is marked from the stored field** (WP2.26 item 6): the `decisions` verb prints
   `<letter>. <label> (recommended)` where the vendor's `(Recommended)` stood inside the label, and the Bridge's
   decision card marks it as the question panel does.
4. **Refusals and help name the agent, not the vendor** (WP2.32 items 1 and 2): "the option the agent recommends" in
   place of "the option Claude recommends"; `init`'s next steps say "Ask an agent session (Claude Code) in this
   repository", the name from the adapter.
5. **The product owner's confinement sentence names shell commands** (WP2.32 item 3): "Shell commands reach no
   network." and "Do not use the network from a shell command." in place of naming `Bash`, in the launch text and the
   installed default brief, which raises the install version.
6. **The guards' words name no vendor tool or event** (WP2.27 items 4 and 5): the unstartable guard's incident says
   "shell commands and web fetches" and "file edits"; the `hook` verbs' usage lines say "the hook input arrives on
   standard input".
7. **The help text names no vendor path** (WP2.30 item 4): `help` says "the agent's session-start entry" and "the folder
   the agent loads instruction bundles from" where it names `.claude/settings.local.json`, `.claude/skills/` and
   `SessionStart`.
8. **An agent that brings its own sandbox is confined by it** (WP2.31): Claude Code's sandbox, applied through its
   adapter, confines its sessions as today, and forge's own confinement wraps only a session whose agent declares none,
   with no network line by domain; never both, since macOS refuses a nested Seatbelt profile (exit 71, measured on
   2026-11-18). The design's Agent row says so (section 5), and `apps/forge/CLAUDE.md` gains a Deviations row for the
   path no adapter takes yet.
9. **The `usage` help names no vendor folder** (WP2.23): the `usage` block of `cli/HelpText.ts` (`:182`) and
   `docs/cli.md` say the agent's subagent transcripts where they name `subagents/workflows/<run>/`; the wording is the
   plan's choice.

Two acts are the owner's alone:

1. **Gate G1: the recordings.** Stage 0's session that ends on a network outage (WP0.3), and the fake agent's outage
   scenario: `bun run record src/testing/fake-agent/` once WP2.2's probe case exists, which starts the installed
   `claude` and re-runs P22's real model call, so no session may run it. Until then WP2.8 holds the recognition against
   stage 0's fixture and verification step 7 waits.
2. **Gate G4: `bun run verify:integration`** at the end of WP2.13, which forge's rules allow only on a person's word.

## Not established

- That a Bun 1.4.2 `Worker` (`.bun-version`) runs Talos's synchronous calls while Talos's main-thread timers keep
  firing, and that `bun:ffi` loads in a worker on Windows. No module of the repository creates a `Worker` today. WP2.6
  proves the first on macOS before anything depends on it.
- That every pass stays below two renewal intervals on a large repository. Git runs synchronously with no timeout
  (`src/lib/git/GitProcess.ts:58-84`); a pass in flight at three renewal ticks in a row ends the lease. WP2.18's
  end-to-end check reads the Overseer's log for withheld renewals; nothing measures a large repository.
- Whether Bun's `setInterval` fires once or several times after a sleep or a blocked loop. The renewal's gap rule
  covers both; only a spec on a fake clock shows it.
- The exact fields of a Claude Code result line after its retries ran out: no such session is recorded in the repository
  (design risk 13). The plan takes the field names from the design and from stage 0's recording; only `terminal_reason`
  was seen, with the value `completed`, in an ordinary result line. Whether a provider overload (529) after spent
  retries writes the same fields is known only from the program text until a stand-in or a real one is recorded.
- Whether a `claude -p` session in stream-json input mode exits after an error result or waits for more input. The plan
  stops the session either way.
- That closing stdin mid-turn lets a session finish its turn and exit; today's code relies on it
  (`JobControlDelivery.ts:105-110`), but no spec shown here measures a turn's end against the 10 seconds.
- Whether `job fresh` or `job stop` moves an interrupted job: `JobMoveLegality.ts:14` allows `interrupted` to
  `stopping`, but the control path was not traced. A `network-outage` or `lease-ended` job relies on it until stage 3.
- How `src/testing/ImportGraph.ts` treats `import type`, which `TalosMainThread.spec.ts` depends on.
- Whether a 529 from a local stand-in makes Claude Code spend its retries quickly enough for a probe, and whether the
  result it then writes carries the fields of stage 0's recording (WP2.2's fake agent recording).
- Whether every Airlock step is safe when a merged-tree gate's run dies with the Overseer and the next start runs it
  again: stage 0's table B traces the `gating` phase as safe to redo for the board, but no such run under WP2.19 was
  traced.
- Whether `clear` stops a board's Talos; `clear` was not read.
- Linux and Windows: Talos, the worker thread and the lease never ran there; the plan records macOS only.
- That Claude Code accepts a live answer whose questions echo the marked labels (WP2.26): today's answer echoes the
  labels as asked, so the round trip is expected to hold, but no recording of a recommended option's answer was read.
- Whether bubblewrap on Linux refuses a nested sandbox as Seatbelt does: WP2.31 never nests, so it does not depend on
  it. The Seatbelt refusal was observed once by the planning session and is held by WP2.31's contract spec.
- That every hit of the guard's forms is listed in WP2.22: the measurement at `710ae4f9` and the recheck at `3274ac88`
  were text searches; WP2.22's scan of the tree after WP2.16 is the list.
