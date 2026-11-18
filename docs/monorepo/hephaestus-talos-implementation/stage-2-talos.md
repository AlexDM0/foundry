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
fleet, its pinned bundles and the legacy reader are gone from the repository.

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
  declares in the contract's pipeline facts document with types of its own (decision 50).
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
  Claude Code adapter into the launch plan, so Talos stays without a vendor.
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
- **The agent port's other leaks stay as they are in this run** (design section 5, row "Agent"): this stage puts behind
  the adapter only what Talos needs.

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
| WP2.8 The Talos process, part two: agents, lease, clean quit | WP2.7 | WP2.11 |
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
| WP2.17 Rules and documentation | WP2.16 | none |
| WP2.18 Recordings and the end-to-end check | WP2.17 | alone |

WP2.19 lands before WP2.13: once the renewal waits on progress, a pass that awaited a merged-tree gate would end the
lease at every landing.

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

## Interfaces introduced

All in TypeScript as they are to be written. Field names are exact.

### Constants

`src/lib/talos/constants/TalosProtocol.ts`:

```ts
/** Raised by hand whenever a frame, the launch, or a reply changes; never with the code version. */
export const TALOS_PROTOCOL_VERSION = 1;
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
// StandingReply keeps { whenAllEqual, whenNoneEqual, replyTemplate } of src/lib/watcher/StandingReplies.ts:5-9.
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
bun run record src/lib/talos/Talos.ts
bun run record src/services/overseer/TalosStart.ts
bun run record src/services/overseer/LeaseRenewal.ts
```

`bun run verify:integration` in `apps/forge` runs every real-system spec; it runs only when the owner asks for it (gate
G4).

End to end on a scratch forge, as `docs/development/contributing.md:76-110` sets one up (`HOME` in a scratch folder,
`FORGE_ROOT` at a scratch repository, `FORGE_FAKE_AGENT=1`, the program run from this checkout with `bun
agent-progress.ts`). Never on the real home or the live board. The verb that starts the Overseer is `oversee` until
stage 9 replaces it with `forge start`. The monitor document is `GET /api/monitor` with the token in
`<scratch home>/.forge-monitor/private/<trackerId>/token`.

1. `oversee --port 0` in the background. `<board>/talos/talos-1.json` reads `serving` with protocol 1; the Overseer's
   log says the lease renewal started.
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
- The agent port's other leaks of design section 5 (the Overseer's `ClaudeTranscripts.ts`, the hook entries,
  confinement): they stay as they are in this run (the run's calls above).
- The store port: stage 5. Talos's files stay under the operating system port, as design section 4 has them.
- Any new workspace package; any change to `packages/` beyond the monitor job's `interruption` and the system version
  in `forge-contracts`; Flint's `watcher-spark` names stay.

## Needs the owner

No question of behaviour is left: decisions 35 to 38 settle what this stage builds. Two acts are the owner's alone:

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
