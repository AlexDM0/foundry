# Stage 2: Talos, the commander

## Goal

Every child process of a board, agent sessions and install, gate and merge lines alike, the gates the Overseer runs
itself among them, runs under one Talos per board: a detached process with a protocol version of its own, a frozen first
handshake frame, a persisted record per child, a clean quit within 10 seconds and a supervision lease of one minute that
the Overseer renews every 15 seconds from outside its event loop. A gate line is stopped after 15 minutes, an agent that
ended on a network outage is recognised by fields of its closing result line and reported under a name of its own, and
the Watcher fleet, its pinned bundles and the legacy reader are gone from the repository.

## Depends on

- **Stage 0** must be finished. It supplies the recorded Claude Code session that ends on a network outage, committed
  as the fixture pair `src/lib/claude-code/testing/fixtures/network-outage-retries-spent.{stdout,stdin}.jsonl` with its
  claims block in `ClaudeStreamFixtures.spec.ts` (stage 0, WP0.4), which this stage holds its ending pattern against
  (WP2.2), and the owner's answers to the two open items of the design's section 12. Where an answer is not there yet,
  the fallbacks under "Needs the owner" apply.
- **Stage 1** must be finished, so the monorepo layout, the root `verify` and the gate scripts no longer move.
- **Hands to stage 3** (presence and recovery): the child record with its end reasons `paused`, `lease-ended` and
  `time-bound`; the interruption causes `talos-paused`, `lease-ended` and `network-outage`; the orphan sweep after a
  lost Talos; the two places the Overseer finds its Talos lost (`ensureTalos` answering `previousTalos: 'lost'` at
  start and while serving, WP2.9 and WP2.13), which stage 3 turns into a crash of Talos; Talos's own record with its
  start number, protocol version and state; the lease renewal thread (`LeaseRenewal.ts`, `LeaseRenewalThread.ts`),
  which stage 3 makes write the heartbeat; `lineEndOf` in `JobLaunch.ts`. Stage 3 turns `lease-ended` and `reboot`
  into causes that wait for an instruction, replaces `INTERRUPTION_CAUSES_HELD_FROM_RESUMING` with its resume policy
  table, adds the crash log and the forge that stays off, and builds the instruction that resumes a `network-outage`
  job.
- **Hands to stage 6** (Gaia hosts the views): `talosProtocolVersion` in the identity document and the `quit` frame
  with reason `restart`, from which stage 6 (WP6.22) shows the running Talos and restarts it cleanly (decision 31).
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
- **9.** The supervision lease: one minute of real time, renewed every 15 seconds; without contact Talos stops its
  agents.
- **10.** The wake rule: after a gap in its own ticks Talos waits one renewal interval (two below five seconds) before
  it stops agents.
- **14** (in part). A Talos that is gone leaves records from which the Overseer stops every orphan and marks its jobs
  interrupted; the crash log and the forge that stays off are stage 3's.
- **15.** No retry in Talos; it recognises the ending on a network outage from the launch plan's patterns and reports
  it.
- **16** (agent port). The patterns, the closing line and the request to stop at the end of a turn are rendered by the
  Claude Code adapter into the launch plan, so Talos stays without a vendor.
- **29.** The lease stops agents only; an install or gate line runs to its end; a gate is stopped after 15 minutes.
- **32.** No compatibility: no mixed fleet, no legacy reader, no migration of Watcher files; boards are set up anew.
- **33.** The packages this stage creates are named here and nowhere else: the lib package `src/lib/talos/` and the
  entry file `talos.ts`. No workspace package is created.
- **34.** Orchestrated sessions in this repository do the work, outside both trackers.

## Today's code

Paths are from `apps/forge/` unless they start with `packages/` or `docs/`.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| One Watcher process per job instance, claiming `watcher-<n>.json` exclusively and running one child | `src/lib/watcher/Watcher.ts:1-6`, `:418-438` | Replaced by one Talos per board (`src/lib/talos/Talos.ts`) |
| The Watcher binary, its composition root, `process.exit` | `watcher.ts:10-11` | Deleted; `talos.ts` takes its place |
| The child spawn with stdin piped for an agent, stdout to the event log, stderr to the Watcher log | `src/lib/watcher/Watcher.ts:295-346` | Changed: moved into `src/lib/talos/ChildSupervisor.ts` |
| The stop: list the tree, close stdin, `ask` after the grace, `force` sweep after a second grace | `src/lib/watcher/Watcher.ts:216-244` | Changed: kept as the requested stop in `ChildSupervisor.ts` |
| The stop of the last listing's groups at the end (`treeStopAtEndGraceMilliseconds`) | `src/lib/watcher/Watcher.ts:278-281`, `src/services/overseer/JobLaunch.ts:347-349` | Kept, carried in the launch frame |
| The linger of an ended Watcher until its acknowledgement | `src/lib/watcher/Watcher.ts:283-287`, `:473`; `src/lib/watcher/constants/WatcherProtocol.ts:11` | Deleted: Talos outlives its children |
| Protocol 2 frames: `hello`, `write`, `close-input`, `stop`; `welcome`, `history`, `message`, `state`, `refused` | `src/lib/watcher/@types/WatcherFrame.ts:9-68` | Replaced by the Talos frames of "Interfaces introduced" |
| The protocol window and its constants | `src/lib/watcher/constants/WatcherProtocol.ts:2-23` | Replaced by `src/lib/talos/constants/TalosProtocol.ts` |
| The socket server: hello first, secret compared in constant time, line limit before the secret | `src/lib/watcher/WatcherSocketServer.ts:48-57`, `:103-118` | Changed: moved to `src/lib/talos/TalosSocketServer.ts`, frozen handshake added |
| The launch file `launch-<n>.json`, read once after the claim | `src/lib/watcher/WatcherLaunch.ts:14-42`, `:70-122` | Replaced by the `launch` frame; no launch file is written |
| The Watcher record `watcher-<n>.json` with `end` | `src/lib/watcher/WatcherRecord.ts:3-33` | Replaced by the child record `child-<n>.json` |
| The event log `events-<n>.ndjson`, origins `agent`, `client`, `watcher` | `src/lib/watcher/EventLog.ts:9-53` | Moved to `src/lib/talos/EventLog.ts`; origin `watcher` becomes `talos`; format version 2 |
| The standing replies, texts and booleans only | `src/lib/watcher/StandingReplies.ts:5-45` | Moved unchanged to `src/lib/talos/StandingReplies.ts` |
| The line splitter | `src/lib/watcher/StreamLines.ts:7-26` | Moved unchanged to `src/lib/talos/StreamLines.ts` |
| The `LocalEndpoint` port and its adapters, sockets under `<monitor>/watchers/` | `src/lib/watcher/LocalEndpoint.ts:18-30`, `LocalEndpointFor.ts:31-36`, `PosixSocketEndpoint.ts:36` | Moved to `src/lib/talos/`; the folder becomes `<monitor>/private/` |
| The frozen socket paths of the endpoint extraction | `src/lib/watcher/LocalEndpoint.frozen.spec.ts`, `FrozenLocalEndpoint.json` | Deleted: socket paths change outright |
| The owner-only folder `<monitor>/watchers/<trackerId>/`, holding the API token and every secret | `src/lib/watcher/WatcherFiles.ts:6-8`, `src/services/overseer/OverseerFiles.ts:20-22` | Changed: `<monitor>/private/<trackerId>/` |
| The bundle closure guard | `src/lib/watcher/WatcherBundleClosure.spec.ts` | Replaced by `src/lib/talos/TalosClosure.spec.ts` and `TalosMainThread.spec.ts` |
| The fleet: liveness by the Watcher's identity, `eventsAfter`, launch files, per-call socket send, reap, stop of process Watchers | `src/services/overseer/WatcherFleet.ts:89-97`, `:100-111`, `:134-192`, `:196-247`, `:262-272`, `:300-366` | Deleted; replaced by the `BoardChildren` port and its Talos adapter `TalosChildren.ts` |
| The per-call frame send with no acknowledgement and a 2-second timeout | `src/services/overseer/WatcherFleet.ts:66`, `:196-233` | Replaced by one persistent connection with a `done` per frame |
| The pinned Watcher bundle `<data>/overseer/watcher-<code>.js` | `src/services/overseer/WatcherBundle.ts:18-35`, `cli/overseer/OverseerForeground.ts:379-383` | Deleted |
| The legacy reader of Watchers below the protocol window | `src/services/overseer/LegacyWatcherReader.ts:1-53` | Deleted |
| Legacy fields in the pass state, the job document and the Bridge | `src/services/overseer/DrivePass.ts:280`, `:918-922`; `JobLiveFactsReader.ts:68-70`, `:278`; `bridge/views/agents/JobRow.tsx:62`, `:76` | Deleted (`watchOnly`, `watcherProtocol`, `legacyWatcherJobIds`) |
| Regrouping: hello with the stored cursor, lost Watcher settled (reboot, `watcher-lost`, `agent-crashed`, refused stop) | `src/services/overseer/Regrouping.ts:102-124`, `:137-171`, `:223-244` | Changed: no hello history; a lost child is settled from its record and Talos's record |
| The pass reads each job's Watcher record and event log every pass | `src/services/overseer/DrivePass.ts:422-475` | Changed: reads the child record, the event log, then the record again for recognised endings |
| The mapping of a gone Watcher to `agent-crashed`, `watcher-lost`, `answer-delivery`, `no-report` | `src/services/overseer/DrivePass.ts:552-576` | Changed: adds `talos-paused`, `lease-ended`, `network-outage` |
| The agent launch through the fleet | `src/services/overseer/DrivePass.ts:777-886`, `:868-883` | Changed: a `launch` frame through `BoardChildren.launchAgent` |
| Process Watchers for install steps, gate steps, the target merge and the main merge | `src/services/overseer/JobLaunch.ts:313-335`, `:404-440`, `:1689-1792`, `:1937-1987` | Changed: line children through `BoardChildren.launchLine`, re-run after `paused` |
| Frames to a job's Watcher: messages, wind-down, close input, stop, answers | `src/services/overseer/JobControlDelivery.ts:37-42`, `:65-120`; `AnswerDelivery.ts:70-100`; `JobLaunch.ts:1898-1911` | Changed: `input` and `stop` frames through `BoardChildren` |
| Flint's brain run as a Watcher of its own | `src/services/overseer/FlintBrainSessionHost.ts:97-151` | Changed: an agent child of Talos in `flint-brain/` (stage 8 removes the brain) |
| The merged-tree gates the Overseer spawns itself, kept in memory | `src/services/overseer/DrivePass.ts:1058-1083`, `:1168-1195` | Changed: line children through a `LineRunner` |
| Gate profiles and pipeline checks spawned in process, stopped through the port | `src/services/overseer/GateProfiling.ts:172-226`; `PipelineChecking.ts:109-150` | Changed: line children through a `LineRunner`; stopped by `stop` frames |
| `Bun.spawn` of every in-process gate line | `src/services/lifecycle/GateRun.ts:185-221` | Changed: `runGate` takes a `LineRunner` |
| The record of process starts a spec replaces | `src/services/overseer/ProcessStarts.ts:10-22` | Changed: `spawnWatcher` goes; `runGatePipeline`, `runGateLines`, `runProposalTwice` stay |
| Gate slot holders: a gate Watcher folder or `process:<pid>:<label>` | `src/services/overseer/GateRunSlots.ts:18`, `:92-118` | Changed: every holder is a child folder judged by its child record |
| The Overseer's stop: process Watchers stopped on `--now`, ended Watchers reaped | `cli/overseer/OverseerForeground.ts:776-790` | Changed: `stop-lines` frame on `--now`; no reap |
| The Baton pass preparation building bundles and reading Watcher files | `cli/overseer/OverseerForeground.ts:267-305`; `src/services/overseer/BatonPass.ts:14-20` | Changed: steps `build-bundles` and `read-watcher-files` go, `read-child-records` comes |
| The Baton record and the identity naming `watcherProtocolVersion` | `src/services/overseer/Baton.ts:25`, `:45`; `OverseerServer.ts:48`, `:637`; `cli/overseer/OverseerForeground.ts:511` | Changed: `talosProtocolVersion` |
| The Claude Code plan: one standing reply that denies every permission but a question; the API key from the Watcher's environment | `src/lib/claude-code/ClaudeCodeAdapter.ts:287-313` | Changed: adds `closingLine`, `endingPatterns`, `quitAtTurnEnd`; `environmentFromWatcher` becomes `environmentFromTalos` |
| The stream mapper's result failures: budget stop, 429, 401 and 403; every other error result is one failure | `src/lib/claude-code/ClaudeStreamMapper.ts:218-242` | Kept; the outage is recognised by Talos, not by the mapper |
| The plan types | `src/lib/agent-launch/AgentLaunchPlan.ts`, `AgentAdapter.ts` | Changed: new plan fields, `AgentEndingName` |
| Interruption causes and the counted crashes | `src/lib/tracker-model/@types/Job.ts:76-84`; `constants/JobStates.ts:70-88` | Changed: `talos-paused`, `lease-ended`, `network-outage` added, none counted |
| The job's Watcher instance and event cursor | `src/lib/tracker-model/@types/Job.ts:122-146`; `constants/JobStates.ts:106` | Changed: `watcherInstance` becomes `childInstance` |
| The crash bound and the session replace rule | `src/lib/tracker-model/Playbook.ts:139-150`, `crashBoundStepsOf` | Changed: `network-outage` is neither resumed nor replaced; `talos-paused` always resumes |
| Git spawned synchronously with no timeout | `src/lib/git/GitProcess.ts:58-84` | Kept; renewal moves off the event loop instead |
| The process table read through `/bin/ps` with `Bun.spawnSync` | `src/lib/process-identity/DarwinProcessIdentity.ts:1-11`; `ProcessSupervisionFor.ts:19` | Kept; Talos calls it only from its synchronous-calls thread |
| Spawn options per child kind, `watcher` among them | `src/lib/process-identity/ProcessSupervision.ts:18`; `SpawnOptionsFor.ts:15-21` | Changed: kind `watcher` becomes `talos` |
| The worker profiles' deny of the owner-only folder and of `jobs/*/launch-*.json` | `src/services/overseer/WorkerProfiles.ts:201-221` | Changed: `<monitor>/private`; the launch-file glob goes, no launch file exists |
| The Baton pass waits | `src/shared/constants/OverseerLimits.ts:62-75` | Kept; the lease renewal overlaps the pass (WP2.13) |
| The stop grace and the regroup hello timeout | `src/shared/constants/OverseerLimits.ts:51`, `:54` | The grace is kept; the hello timeout becomes `TALOS_FRAME_TIMEOUT_MILLISECONDS` |
| Boundary specs and recordings of the Watcher | `src/testing/BoundarySpecs.ts:16-135`; `src/testing/BoundaryRecordings.ts:85-97` | Replaced by Talos boundaries |
| Guards naming the Watcher | `src/ImportDirection.spec.ts:68-69`, `:221`, `:334`; `src/PlatformBoundary.spec.ts:90-91`, `:211`, `:243`, `:247`; `src/SpecSleeps.spec.ts:30-45`; `src/RealSystemSpecs.spec.ts:41-45`; `eslint.config.js:27`, `:38`, `:47-48`, `:116-117` | Changed to name `talos.ts` and `src/lib/talos/` |
| The retired names guard | `src/ComponentNames.spec.ts:27-63` | Changed in WP2.17: the Watcher's code names are added, after the documents stop naming them |
| The rules naming the Watcher | `apps/forge/CLAUDE.md:134-136`, `:318`, `:320`, `:328-330` | Changed in WP2.17 |

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
| WP2.9 The Overseer's side: connection, start, lease renewal | WP2.8 | WP2.10, WP2.11 |
| WP2.10 The `BoardChildren` port over the Watcher fleet | WP2.4 | WP2.9, WP2.11 |
| WP2.11 New interruption causes in the tracker model | WP2.4 | WP2.5 to WP2.10 |
| WP2.12 The Talos adapter of `BoardChildren` | WP2.9, WP2.10, WP2.11 | none |
| WP2.13 The switch to Talos | WP2.12 | alone |
| WP2.14 The Overseer's own gates under Talos | WP2.13 | alone |
| WP2.15 Removal of the fleet, the bundles and the legacy reader | WP2.14 | alone |
| WP2.16 The Watcher's remaining names | WP2.15 | alone |
| WP2.17 Rules and documentation | WP2.16 | none |
| WP2.18 Recordings and the end-to-end check | WP2.17 | alone |

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
Talos"). The Claude Code adapter renders the closing line, the network outage pattern and the request to stop at the end
of a turn.

**Files.**
- Change `src/lib/agent-launch/AgentLaunchPlan.ts`: add `PlanLineConditions`, `PlanFieldCondition`, `PlanEndingPattern`,
  `QuitAtTurnEnd` and the plan fields `closingLine`, `endingPatterns`, `quitAtTurnEnd`. These are structural twins of
  the WP2.1 types: `src/lib/agent-launch/` may not import `src/lib/talos/`, just as the plan's `StandingReply` twins the
  Watcher's today (`AgentLaunchPlan.ts`, `src/lib/watcher/StandingReplies.ts:5-9`).
- Change `src/lib/agent-launch/AgentAdapter.ts`: export `AGENT_ENDING_NAMES = ['network-outage'] as const` and `type
  AgentEndingName`, the names an adapter may give an ending and the Overseer maps to a cause.
- Change `src/lib/claude-code/ClaudeCodeAdapter.ts`: render the three fields in `planOf` (`:297-313`).
- Read, never copy, the fixture pair stage 0 committed in `src/lib/claude-code/testing/fixtures/`:
  `network-outage-retries-spent.stdout.jsonl` and its `.stdin.jsonl` partner (stage 0, WP0.4). No second fixture of
  the same session is created: `ClaudeStreamFixtures.spec.ts:43-52` fails a `.stdout.jsonl` without its partner.
- Change `src/lib/claude-code/ClaudeCodeAdapter.spec.ts`, and `src/lib/claude-code/ClaudeStreamFixtures.spec.ts` inside
  stage 0's block `describe('network-outage-retries-spent (P23, Claude Code 2.1.326)')`.
- Change `src/testing/fake-agent/FakeAgentChild.ts`: a scenario that prints a number of `system`/`api_retry` lines and
  then the outage result line, chosen by a new value of the fake agent's scenario variable in
  `src/shared/Environment.ts` (read where the existing `FAKE_AGENT_*` getters are, `src/shared/Environment.ts:26-43`).

**What to do.**
1. The Claude Code values, as data in `ClaudeCodeAdapter.ts` beside `DENY_EVERY_PERMISSION_BUT_A_QUESTION` (`:288`):
   - `closingLine`: `allOf` `[{ test: 'equals', path: 'type', value: 'result' }]`.
   - one `endingPatterns` entry: `name: 'network-outage'`; `closingLineMatches`: `allOf` `type` equals `result`,
     `is_error` equals `true`, `terminal_reason` equals `api_error`; `anyOf` `api_error` equals `connection_failed`,
     `api_error_status` `number-between` 500 and 599 (529 lies inside); `countedLineMatches`: `allOf` `type` equals
     `system`, `subtype` equals `api_retry`; `minimumCountedLines`: the owner's value from stage 0, default `1`.
   - `quitAtTurnEnd`: `{ act: 'close-input' }`: closing stdin is how a session is wound down today
     (`src/services/overseer/JobControlDelivery.ts:105-110`).
2. Before writing the values, read the stage 0 fixture (`network-outage-retries-spent.stdout.jsonl`) and its P23 entry
   in `docs/development/overseer-claude-probe.md`, and confirm every field name and value the pattern names occurs in
   its closing line. Where a field differs, the fixture wins and the difference goes in the commit message; never match
   on the `result` text.
3. `planOf` keeps `standingReplies` exactly as today: a permission request is answered on texts alone and needs no
   number.
4. The Flint brain's plan and every other plan built through `planOf` gain the same fields; nothing else renders a plan.

**Specs.**
- `ClaudeCodeAdapter.spec.ts`: the plan carries the three fields with the exact values above, for every session kind.
- `ClaudeStreamFixtures.spec.ts`, in stage 0's P23 block: on `network-outage-retries-spent.stdout.jsonl`, a copy of
  WP2.1's matching (imported from `src/lib/talos/` in the spec only, which `src/ImportDirection.spec.ts` allows for
  specs; if it does not, the spec checks the field values by hand) recognises `network-outage` on the closing line with
  the fixture's own retry count; the closing line of `rate-limit-rejected.stdout.jsonl` (a 429) and of a fixture with
  `is_error: false` do not match. The mapper's replay list (`ClaudeStreamMapper.spec.ts:102`) stays as it is.

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
5. The clock comment rule (`apps/forge/CLAUDE.md:176-181`): this is a clock that measures real time, so it needs no
   exception comment; say in the file header that the wall clock is used on purpose so a sleep counts.

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
  that an extraction changed no socket path, no longer holds by design (decision 32).
- Create `src/lib/talos/TalosFiles.ts` with `PRIVATE_FOLDER_NAME = 'private'` and `privateFolderOf(monitorFolder,
  trackerId)`, replacing `ownerOnlyFolderOf` and `WATCHER_FOLDER_NAME` (`src/lib/watcher/WatcherFiles.ts:6-8`,
  `constants/WatcherProtocol.ts:23`).
- Change every importer: `src/lib/watcher/Watcher.ts`, `WatcherFiles.ts`, `WatcherLaunch.ts`, `WatcherSocketServer.ts`,
  `WatcherFrames.ts`, `@types/WatcherFrame.ts`; `src/services/overseer/OverseerFiles.ts`, `WorkerProfiles.ts`,
  `WatcherFleet.ts`, `Regrouping.ts`, `LegacyWatcherReader.ts`; `src/testing/RecordedLocalEndpoint.ts`,
  `ProcessWorldReplay.ts`; every spec the compiler names.
- Change `src/lib/watcher/Watcher.ts` header to declare `src/lib/talos` among the packages it depends on, and
  `src/lib/watcher/WatcherBundleClosure.spec.ts` to allow `src/lib/talos/` (both go in WP2.15).
- Change `src/testing/BoundarySpecs.ts:30-31`, `:112-117` and `src/testing/BoundaryRecordings.ts:85-90` to the new
  paths; rename the recordings under `src/testing/recordings/darwin/` with `git mv` (their file names carry the boundary
  path: `src__lib__watcher__LocalEndpointFor.ts.json` becomes `src__lib__talos__LocalEndpointFor.ts.json`).

**What to do.**
1. Move, then fix imports until `bun run typecheck` passes in `apps/forge`.
2. In `PosixSocketEndpoint.ts` the socket folder becomes `PRIVATE_FOLDER_NAME`; in `EndpointInstanceFacts`
   (`LocalEndpoint.ts:7-12`) rename `jobId` to `name`, since Talos's endpoint names no job.
3. `WorkerProfiles.ts:206` and `:219` deny `join(monitorFolder, PRIVATE_FOLDER_NAME)`; the comment at `:201-204` says
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
   number `>= 1`; a `write-line` holds no line feed.
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
  `ClientFrame` after the first line.
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
   add `gapLengthOf(previousTick, now, tick)` to the allowance of every live line (owner item 3), and stop a line whose
   allowance passed with grace 0; its end reason is `time-bound` whatever its exit code.
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
  `time-bound`; `stop-lines` ends every line; a launch outside the board folder is refused; the same `childId` twice
  spawns once.

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
1. An `agent` child gets stdin `pipe`. `input` `write-line` writes the line and a line feed, appended to the event log
   as origin `client`; `close` closes stdin. Input to a line, to an ended child or to an unknown one answers `done`
   `refused` with `kind-takes-no-input`, `child-ended` or `unknown-child`.
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
  ends it; the outage scenario of WP2.2 records `recognisedEndings` with `name: 'network-outage'`, the closing line's
  sequence and the retry count, and the record holds the recognition before the event log holds the line (read the
  record after the log in a loop of `src/testing/WaitUntil.ts`).
- `Talos.lease.integration.spec.ts` (real; bounds from the start file: lease 600, interval 150, tick 50, gap 200
  milliseconds): renewals keep agents running; silence ends agents `lease-ended` and leaves a line running; a renewal
  after that holds the lease again; a Talos process suspended (`SIGSTOP`) for longer than the lease and continued
  (`SIGCONT`) with a renewal following within the grace stops nothing. Skip the suspension case on Windows through
  `src/testing/ToolGuard.ts`.
- `Talos.cleanQuit.integration.spec.ts` (real; quit wait 300 milliseconds): `quit` ends agents and lines `paused`,
  writes `quit` `restart`, and the process exits within the wait plus the stop sweep; a mismatch quit does the same with
  `protocol-mismatch`.

**Done when.** `bun run record src/lib/talos/Talos.ts` passes; the root `bun run verify` is green.

### WP2.9 The Overseer's side: connection, start, lease renewal

**Purpose.** The Overseer finds, starts and talks to its board's Talos at the required protocol version, and renews the
lease from a thread its synchronous git cannot block (design section 3.2, "Renewal that the pass cannot starve";
`src/lib/git/GitProcess.ts:58-61`, `:68`).

**Files.**
- Create in `src/services/overseer/`: `TalosConnection.ts`, `TalosStart.ts`, `LeaseRenewal.ts`, `LeaseRenewalThread.ts`
  (worker entry), and specs `TalosConnection.spec.ts` (over the recorded endpoint), `TalosStart.spec.ts` (over fakes of
  the connection and the spawn), `LeaseRenewal.spec.ts` (over a fake transport), `TalosStart.integration.spec.ts` and
  `LeaseRenewal.integration.spec.ts` (real).
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
      `n + 1`, detached and unreferenced, with `outlivingProgramEnvironment()` (`src/shared/Environment.ts:147`), its
      output appended to `talos-<n+1>.log`, cwd the repository root, the port's options for `talos`. `TALOS_ENTRY_PATH`
      is `join(import.meta.dir, '..', '..', '..', 'talos.ts')`, as `WatcherBundle.ts:18` finds `watcher.ts`.
   6. Wait for the record `serving`, then connect. `welcomed` at the required version answers `started`. A
      `version-mismatch` from the Talos just started means the program on disk is not the Overseer's code: answer `held`
      with reason `talos-protocol-differs`, and never start again within this Overseer's life.
3. `LeaseRenewal.ts` exports `startLeaseRenewal({ endpoint, secret, renewer, intervalMilliseconds })` answering `{
   moveTo(endpoint, secret), stop() }`. It starts a `Worker` of `LeaseRenewalThread.ts` and posts it the facts. The
   thread connects on its own (a second connection), says `hello`, sends `lease-renewal` at once and then every interval
   on its own timer, reconnects after a close at the next interval, and posts `renewed` and `refused` notes back for the
   Overseer's log. It stops only on `stop()` or with the process. A `version-mismatch` answer stops it until `moveTo`.
4. Nothing here is wired into the Overseer yet; WP2.13 does that.

**Specs.**
- `TalosConnection.spec.ts`: a `done` resolves its own frame only; a silent Talos answers `no-answer` after the bound; a
  `state` frame reaches the listeners; a close rejects nothing twice.
- `TalosStart.spec.ts` covers every branch of step 2 with fake records, fake identity and a fake spawn, and that a
  second `held` never spawns again.
- `LeaseRenewal.spec.ts`: renewals at the interval, reconnect after close, `moveTo`.
- `LeaseRenewal.integration.spec.ts` (real Talos from `src/testing/ScratchTalos.ts`, short bounds): while the main
  thread runs `Bun.spawnSync(['/bin/sleep', '2'])` three times in a row, Talos receives renewals and its agents keep
  running past twice the lease. This case is the proof that a Bun worker keeps a `node:net` socket going while the main
  thread blocks; if it fails, stop and report to the owner rather than choose another mechanism.
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
- Change every caller listed by `git grep -n "WatcherFleet\." apps/forge/src apps/forge/cli` except `WatcherFleet.ts`
  itself: `DrivePass.ts`, `JobLaunch.ts`, `Regrouping.ts`, `JobControlDelivery.ts`, `AnswerDelivery.ts`,
  `JobResumption.ts`, `AssistantSession.ts`, `IntakeSessions.ts`, `PipelineAgentSessions.ts`, `EndedJobTokens.ts`,
  `JobLiveFactsReader.ts`, `JobTranscript.ts`, `ApiBillingStops.ts`, `IncidentRouter.ts`, `GateRunSlots.ts`,
  `FlintBrainSessionHost.ts`, `Airlocks.ts` (through the context), `cli/overseer/OverseerForeground.ts`,
  `cli/jobs/JobCommand.ts`, `cli/jobs/JobsCommand.ts`, `cli/overseer/routes/OverseerRoutes.ts`, and the specs and
  harnesses the compiler names (`src/testing/DrivePassHarness.ts`, `src/services/overseer/testing/LiveJobFixture.ts`).

**What to do.**
1. The port takes and answers the types of "Interfaces introduced". The Watcher adapter maps `WatcherLiveness`
   (`WatcherFleet.ts:35-40`) to `ChildLiveness`: `unclaimed` to `unlaunched`, an `ended` Watcher's `WatcherEnd` to a
   `ChildEnd` with the same reason, exit code and signal, `recognisedEndingsOf` answers `[]`, `launchAgent` and
   `launchLine` write the launch file and spawn the Watcher as today and answer `{ verdict: 'launched' }`.
2. Pass the port where `WatcherFleet` was imported: through `JobLaunchContext` (`JobLaunch.ts:90-113`), the
   `DrivePassRequest`, the Airlocks context and the request objects of the delivery modules. A module that imported
   `WatcherFleet` imports only the `BoardChildren` type.
3. Keep every log sentence and every marker file as it is.

**Specs.** No new claim; every existing spec stays green with the port injected. Add `WatcherBoardChildren.spec.ts` only
for the mapping of item 1.

**Done when.** `git grep -n "from './WatcherFleet.ts'" apps/forge/src apps/forge/cli` names only
`WatcherBoardChildren.ts` and specs of the fleet itself; the root `bun run verify` is green.

### WP2.11 New interruption causes in the tracker model

**Purpose.** A lease end, a clean quit and a network outage each get a cause of their own that is not counted as a crash
(design section 3.2, "An end of its own").

**Files.**
- Change `src/lib/tracker-model/@types/Job.ts:76-84`, `src/lib/tracker-model/constants/JobStates.ts:70-88`,
  `src/lib/tracker-model/Playbook.ts` (`crashBoundStepsOf` and `productOwnerStepsOf`),
  `src/adapters/log/LogRecordProblem.ts` where it validates causes, `src/adapters/utils/LogUtil.ts` (the wording of a
  `job-interrupted` record), and the Bridge's wording of a cause (find it with `git grep -n "'usage-limit'"
  apps/forge/bridge`).
- Change the specs: `src/lib/tracker-model/Playbook*.spec.ts` touched by the rule, `Board.jobs.spec.ts`,
  `src/adapters/utils/LogUtil.spec.ts`.

**What to do.**
1. Add `'talos-paused'`, `'lease-ended'`, `'network-outage'` to `InterruptionCause` and `INTERRUPTION_CAUSES`; leave
   `CRASH_INTERRUPTION_CAUSES` as it is.
2. Export from `JobStates.ts` `INTERRUPTION_CAUSES_HELD_FROM_RESUMING = ['network-outage']`, the one list the Playbook
   reads for the owner's fork (owner item 1).
3. In `crashBoundStepsOf`, before the session-kind replace rule (`if (SESSION_JOB_KINDS.includes(job.kind)) return [{
   kind: 'replace-job' ... }]`), a job whose interruption is in that list gets no step. In `productOwnerStepsOf`, the
   same before its resume. `talos-paused` and `lease-ended` follow the path of `reboot`: resumed, never counted.
4. `outageIsDueWith` (`Playbook.ts:139-150`) counts only crash causes, so it needs no change; add a spec case that
   proves a `network-outage` interruption breaks no run of counted crashes and adds none.
5. Wording: a short neutral sentence per cause in `LogUtil.ts`, naming no command (`apps/forge/CLAUDE.md:90-92`).

**Specs.** `Playbook` specs prove: `network-outage` is neither resumed nor replaced, for a build, a review, a session
kind and a product owner; `talos-paused` and `lease-ended` resume whatever `crashResumes` holds; none of the three
raises `crashResumes` (`src/lib/tracker-model/Jobs.ts:139-141`). `LogUtil.spec.ts` words each cause.

**Done when.** `bun test --path-ignore-patterns='.claude/**' ./src/lib/tracker-model/` passes; the root `bun run verify`
is green.

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

**Purpose.** The Overseer runs every agent and every job line under Talos, renews the lease from its thread, and maps
every Talos end to the job. Must run alone: it touches the pass, the start, the stop and the Baton pass.

**Files.**
- Change `cli/overseer/OverseerForeground.ts`, `src/services/overseer/DrivePass.ts`, `Regrouping.ts`, `JobLaunch.ts`,
  `GateRunSlots.ts`, `BatonPass.ts` (`BatonPassStep`, `:14-20`), `Baton.ts` (`talosProtocolVersion`),
  `OverseerServer.ts` (`talosProtocolVersion`), `FlintBrainSessionHost.ts`, `cli/overseer/OverseerFlintBrain.ts`.
- Change the specs that drive the pass: `cli/overseer/OverseerDrivePass*.spec.ts`, `OverseerBuildJob*.spec.ts`,
  `src/services/overseer/JobLaunch.*.spec.ts`, `Regrouping*.spec.ts`, `CrashMatrix*.spec.ts`, `JobResumption*.spec.ts`,
  `src/testing/DrivePassHarness.ts`, `src/testing/RecordedWatcherStages.ts` (becomes recorded Talos stages).

**What to do.**
1. **Start.** In `startServing` (`OverseerForeground.ts:398-646`), right after the Baton is acquired (`:521-526`), start
   the lease renewal, then `ensureTalos`. `held` makes the start fail with `OperationRefusal('unrepaired', { kind:
   'talos-protocol-differs', requiredProtocolVersion, answeredProtocolVersion })`, worded in `cli/`. Remove
   `pinWatcherBundle` (`:379-383`) and the bundle path from every request.
2. **Regrouping.** `regroup` keeps the leftover worktrees and the list of jobs whose current instance is unlaunched
   (`Regrouping.ts:204-244`), drops the hello and history (`:137-171`), and settles every job child that reads `lost`
   with `settleLostChild` (WP2.9).
3. **Observation order.** In `observe` (`DrivePass.ts:422-475`), per job: call `beginPass` once for the pass, then read
   the liveness, then the events after the cursor, then `recognisedEndingsOf`. The liveness read first keeps today's
   promise that an `ended` child's log is complete; the endings read last cover every line just read (WP2.8 item 2).
4. **Mapping ends** (`applyWatcherEvents`, renamed `applyChildEvents`, `DrivePass.ts:503-581`):
   1. A `result` event whose entry's sequence is a recognised `network-outage`: interrupt the job `network-outage`, add
      it to `stoppedSessions` so the pass stops the session after the hold, and treat it as no closing result. Map an
      `AgentEndingName` to its cause in one record in `DrivePass.ts`.
   2. A child that ended with reason `paused`: interrupt `talos-paused`. With reason `lease-ended`: interrupt
      `lease-ended`. Both before the `agent-crashed` branch (`:574-575`).
   3. `lost`: `lostWatcherCauseOf` as today (`:477-480`), on the child's side files; the stored cause stays
      `watcher-lost` (owner item 5).
   4. Everything else as today.
5. **Launch.** `launchWatcher` (`:777-886`) becomes `launchAgentChild`, async, through `launchAgent`; the endpoint fit
   check (`:795-798`) and its notice `watcher-endpoint-does-not-fit` go, since the endpoint is Talos's.
   `talos-unavailable` leaves the job for the next pass. `jobsNeedingAWatcher` (`:904-916`) reads `unlaunched`.
6. **Job lines** (`JobLaunch.ts`): `processWatcherEnd` (`:404-408`) becomes `lineEndOf(folder)`, reading the newest
   instance: `pending` while live or unlaunched, `rerun` when it ended `paused` or reads `lost`, otherwise its end. On
   `rerun` the next pass launches instance `newest + 1`; a step's verdict is read only from an end that is not `paused`.
   A gate step's launch carries `timeBoundMilliseconds: GATE_TIME_BOUND_MILLISECONDS`; an install step's carries
   `INSTALL_LINE_TIME_BOUND_MILLISECONDS` (owner item 2); a prepare step's and a merge's carry `null`. An end
   `time-bound` reads as exit code `null` and signal `null`, so
   `GateRun.gateOutcomeOf` judges it `cannot-run`; its output gets one line naming the bound, worded in
   `src/services/lifecycle/GateRun.ts` beside `RUN_REFUSAL_WORDING` (`:145-148`).
7. **Gate slots.** Every holder is a child folder: `gateRunHolderIsLive` (`GateRunSlots.ts:107-118`) reads the newest
   child record of the folder through `BoardChildren`, and while none exists the recorded acquirer's identity answers.
   `process:` holders stay until WP2.14.
8. **Frames.** `JobControlDelivery`, `AnswerDelivery`, `JobResumption`, `AssistantSession`,
   `JobLaunch.deliverBuildJobFrames` send through the port: `write` becomes `input` `write-line`, `close-input` becomes
   `input` `close`, `stop` stays.
9. **Stop.** In the stop waits (`OverseerForeground.ts:776-790`): `--now` sends `stop-lines`; the reap of ended Watchers
   goes; the lease renewal is not stopped: it ends with the process, so a quick restart keeps every agent.
10. **Baton pass margin.** The predecessor keeps renewing through its release until it exits, because its renewal thread
    is never stopped in `release` (`:649-658`); the successor starts its own renewal as soon as it holds the Baton (item
    1). The two overlap, which Talos accepts. The preparation steps (`:267-305`) lose `build-bundles` and
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

**Specs.**
- `cli/overseer/OverseerDrivePass.spec.ts` and the build job specs over recorded Talos stages prove: a launch is a
  `launch` frame; a recognised outage interrupts `network-outage`, the session gets a `stop`, and the job does not move
  to `in-customs`; ends `paused` and `lease-ended` interrupt with their causes and resume on the next pass; a `lost`
  child is settled as before.
- `JobLaunch.gating.spec.ts`: a gate step ended `paused` is launched again as instance 2 and its first end is never
  judged; a `time-bound` end judges `cannot-run`.
- `OverseerForeground` specs (find them with `git grep -ln runOverseerInTheForeground apps/forge/cli`): the renewal
  starts after the Baton, before regrouping; `talos-protocol-differs` refuses the start.

**Done when.** `bun run verify` at the root is green, and `bun run verify:integration` in `apps/forge`, run once by the
person who runs this package, passes (CLAUDE.md asks that it run only when a person asks for it: ask the owner).

### WP2.14 The Overseer's own gates under Talos

**Purpose.** No child of the board runs outside Talos: merged-tree gates, gate profiles and pipeline checks become line
children (design sections 3.3 and 7, "What reconcile cannot see today").

**Files.**
- Change `src/services/lifecycle/GateRun.ts`, `GateLineRun.ts`, `ProposalTwiceRun.ts` and their specs.
- Create `src/services/overseer/TalosLines.ts` (the `LineRunner` over `BoardChildren` and the connection) and
  `TalosLines.spec.ts`.
- Change `src/services/overseer/DrivePass.ts` (`:1058-1195`), `GateProfiling.ts`, `PipelineChecking.ts`,
  `GateRunSlots.ts` (drop `inProcessHolderOf`, `:88-94`, `:109-113`), `ProcessStarts.ts`,
  `src/services/overseer/testing/AirlocksHarness.ts`.

**What to do.**
1. In `GateRun.ts` add the `LineRunner` and `LineRunRequest` types of "Interfaces introduced". `GateRequest` and
   `PipelineRunRequest` replace `spawnOptions`, `onSpawned` and `onOutput` with `runLine` and `childFolderOf(stepIndex,
   kind)`. `runGate` (`:185-221`) keeps the status and report files and calls `runLine` instead of `Bun.spawn`.
2. `TalosLines.createLineRunner(children, connection)`: launch the line (kind `line`, label, folder, next instance,
   `timeBoundMilliseconds`), then wait for its end: the `state` frame of its `childId`, and as a fallback a look at its
   record every `TALOS_LINE_LOOK_MILLISECONDS` (a schedule only, never a decision). While waiting, hand each new event
   entry to `onOutputLine`. At the end, the output is every `agent` entry's line joined with line feeds.
   `talos-unavailable` answers a run with exit code `null`, which judges `cannot-run`.
3. Folders, all under the board folder: merged-tree gates `merge-gates/<16 hex of sha256(worktree + '\n' + tree + '\n' +
   phase)>/step-<i>`; gate profiles `gate-profile-runs/<profileRunId>/step-<i>`; pipeline checks
   `pipeline-checks/<setupId>/run-<r>/step-<i>`. Gate profiles keep `<data>/gate-profile-runs/<P>.ndjson` for their
   stream, appended from `onOutputLine`.
4. A Stop of a profile or a check sends `stop` with grace 0 to its running child (`GateProfiling.ts:172-179`,
   `PipelineChecking.ts:109-116`). Only gate lines carry the 15-minute bound.
5. At start, before `settleAtStart` removes worktrees (`GateProfiling.ts:244-248`, `PipelineChecking.ts:191-195`), stop
   every live child under the three roots and wait for their ends (bounded tries): their owner, an earlier Overseer's
   promise, is gone. Without this the next Overseer removes a worktree a line still runs in.
6. Gate slots: the holder of every gate is its child folder; delete `inProcessHolderOf` and the `process:` branch.
7. `mergedTreeGateProcesses` and `stopMergedTreeGate` (`DrivePass.ts:1058-1065`) go: the stop at the Overseer's stop is
   `stop-lines`.

**Specs.**
- `GateRun.spec.ts`, `GateLineRun.spec.ts`, `ProposalTwiceRun.spec.ts` over a fake `LineRunner` prove what they proved
  over a spawn.
- `TalosLines.spec.ts`: the end arrives by frame or by the look; output is the joined lines; a `time-bound` end judges
  `cannot-run`; `talos-unavailable` judges `cannot-run`.
- `GateProfiling.spec.ts` and `PipelineChecking.spec.ts`: a Stop sends `stop`; the start stops leftover children before
  removing worktrees.
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
  `src__lib__watcher__Watcher.ts.json`, `src__lib__watcher__WatcherSocketServer.ts.json`,
  `src__services__overseer__WatcherBundle.ts.json`, `src__services__overseer__WatcherFleet.ts.json`.
- Change `src/services/overseer/ProcessStarts.ts` (no `spawnWatcher`), `DrivePass.ts` (no `legacyWatcherJobIds`, `:280`,
  `:918-922`, `:970`, `:1443`; no notice `watcher-endpoint-does-not-fit`, `:268-269`), `JobLiveFactsReader.ts` (no
  `watcherProtocol`, `watchOnly`), `EventBroker.ts:75-76`, `bridge/views/agents/AgentJobDocument.ts:31-32`,
  `JobRow.tsx:62`, `:76`, `JobControls.tsx:33`, `bridge/@types/DetailBoardState.ts:103`,
  `bridge/testing/BoardStateFixture.ts:97-98`, and their DOM specs.
- Change the guards: `src/ImportDirection.spec.ts` (no `watcher-binary`), `src/PlatformBoundary.spec.ts`,
  `src/SpecSleeps.spec.ts` (entries `:30-45` whose files are gone), `src/RealSystemSpecs.spec.ts` (`:41-45`),
  `src/testing/BoundarySpecs.ts`, `src/testing/BoundaryRecordings.ts`, `eslint.config.js`,
  `src/lib/process-identity/ProcessSupervision.ts` and `SpawnOptionsFor.ts` (no kind `watcher`; if
  `src/lib/process-identity/FrozenProcessSupervision.json` names it, rename that key only and say so in its `retake`).
- Note for WP2.17 the names this package retires: `'WatcherFleet'`, `'WatcherBundle'`, `'LegacyWatcherReader'`,
  `'runWatcher'`, `'WATCHER_PROTOCOL_VERSION'`, `'src/lib/watcher'`, `'watcher-bundle-failed'`,
  `'watcher-endpoint-does-not-fit'`, `'legacy-watcher'`, `'pinWatcherBundle'`. They join `RETIRED_NAMES` in WP2.17,
  once `apps/forge/CLAUDE.md` and `docs/` no longer name them: `src/ComponentNames.spec.ts` scans those files too, so
  adding the names here turns `bun run verify` red.

**What to do.** Delete, then follow the compiler and the guards until green. Words in comments that name the Watcher in
files this package touches say Talos. The refusal kinds `watcher-bundle-failed` and `watcher-endpoint-does-not-fit`
leave their union and their wording in `cli/`.

**Specs.** The guard specs prove their planted cases with Talos paths.

**Done when.** `git grep -n -i "watcherfleet\|watcherbundle\|legacywatcher\|lib/watcher\|watcher\.ts" apps/forge` finds
nothing outside `docs/`; the root `bun run verify` is green.

### WP2.16 The Watcher's remaining names

**Purpose.** "The Watcher's name goes with its code in stage 2" (design section 11). Rename the identifiers and stored
keys that still name it, one mechanical change, keeping `watcher-lost` for stage 9.

**Files.** Every file this command names, run at the repository root (82 files hold `watcherInstance` today):

```sh
git grep -l -E "watcherInstance|FIRST_WATCHER_INSTANCE|watcher-instance|ProcessWatcher|LostWatcher|environmentFromWatcher|watcherProtocolVersion|WatcherObservation|WatcherEventFacts" \
  -- apps/forge packages apps/gaia/src
```

**What to do.**
1. Rename: `Job.watcherInstance` to `childInstance`; `FIRST_WATCHER_INSTANCE` to `FIRST_CHILD_INSTANCE`; the log field
   problem key `'watcher-instance'` (`src/adapters/log/LogRecordProblem.ts:177`) to `'child-instance'`;
   `ProcessWatcherSandbox` to `LineSandbox` (file `src/services/overseer/LineSandbox.ts`); `LostWatcherFacts` to
   `LostChildFacts`; `environmentFromWatcher` to `environmentFromTalos`; `WatcherObservation` to `ChildObservation`;
   `watcherProtocolVersion` to `talosProtocolVersion` where WP2.13 has not done it.
2. The stored key in `progress.json` changes with the field: `src/adapters/progress/@types/StoredProgressFile.ts`,
   `utils/ProgressFileMappingUtil.ts`, `utils/StoredJobValidationUtil.ts`. Nothing migrates (decision 32).
3. Note each old identifier for WP2.17, which adds it to `RETIRED_NAMES` in `src/ComponentNames.spec.ts`. Never
   `watcher-lost`.
4. Rename every other Watcher name left after WP2.15 in shipping code, specs and testing helpers of `apps/forge`,
   `apps/gaia` and `packages`, by what it now names: a child (`watcherFolder` to `childFolder`, `watcherFilesOf` to
   `childFilesOf`, `gateWatcherFolderIn` to `gateChildFolderIn`, `endStepWatcher` to `endStepChild`,
   `plantLiveWatcher` to `plantLiveChild`, `RecordedWatcherStages` to `RecordedTalosStages`), or Talos. List them with
   `git grep -n -o -i -E "[A-Za-z_-]*watcher[A-Za-z_-]*" -- apps/forge/src apps/forge/cli apps/gaia packages`; at
   `3e6cb660` that lists about 80 distinct names, most of which WP2.15 deletes with the fleet.

**Specs.** No new claim; specs rename with the code.

**Done when.** The grep of "Files" finds nothing; `git grep -n -i "watcher" -- apps/forge/src apps/forge/cli apps/gaia
packages` lists only `watcher-lost` and the vendor's own key `setup_file_watcher_ms` in recorded Claude Code output
(`src/lib/claude-code/testing/fixtures/*.jsonl`, `src/testing/recordings/darwin/src__testing__fake-agent.json`); the
root `bun run verify` is green.

### WP2.17 Rules and documentation

**Purpose.** A change that invalidates a rule updates it in the same change (`apps/forge/CLAUDE.md:277-280`).

**Files.**
- Change `apps/forge/CLAUDE.md`: Runtime (`:134-136`: Talos has no context, so `talos.ts` passes `process.platform` to
  `runTalos`), the Deviations rows naming `watcher.ts` (`:318`, `:320`, `:329`, `:330`) and the legacy row (`:328`,
  deleted), a new row for the synchronous-calls thread and the lease renewal thread as entry modules, and a row for
  `FrozenTalosHandshake.json`, a frozen table that is never retaken.
- Change `docs/cli.md` (the Watcher passages, for example `:199`, `:264`, `:813`, `:832`, `:1018`; the files of a job
  folder; the new interruption causes), `docs/glossary.md`, `docs/development/guards-and-testing.md`,
  `docs/development/platform-status.md` (Talos boundaries: macOS recorded, Linux and Windows never ran),
  `docs/development/contributing.md` (the scratch isolation figure's words), `docs/operations/*.md`,
  `docs/concepts/*.md`, `docs/reference/overseer-api.md` (identity key), `docs/reference/refusals.md`.
- The root `.claude/rules/` files hold no Watcher rule today (`git grep -n -i watcher -- .claude/rules` prints nothing);
  if one appears, list it for the owner, who changes those files.
- Change `src/ComponentNames.spec.ts`: add to `RETIRED_NAMES` the names WP2.15 and WP2.16 noted, with a planted case
  for one of each kind (path, identifier, wire value). A dated record that names one and is not rewritten, such as
  `docs/research/compounding/data-and-improvements.md` or a probe entry of
  `docs/development/overseer-claude-probe.md`, gets an exact `ALLOWED_RETIRED_NAMES` entry instead of an edit.

**What to do.** Replace the Watcher's description with Talos's: one per board, its protocol version, the lease and the
wake rule, the clean quit, the child record, the 15-minute gate bound, the network outage ending. Wrap at 120 columns
where `src/ProseWrap.spec.ts` holds a file. Figures that show Watchers (`docs/images/architecture.svg`) are redrawn or
named in the commit as stale. Then add the retired names, and run `src/ComponentNames.spec.ts`: each finding is a
document line still to rewrite, or a dated record for the allowlist.

**Done when.** `git grep -n -i watcher apps/forge/CLAUDE.md apps/forge/docs/cli.md` finds only `watcher-lost`;
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

`src/shared/constants/OverseerLimits.ts` (the Overseer writes them into the start file; specs pass short ones):

```ts
export const SUPERVISION_LEASE_MILLISECONDS = 60_000;
export const LEASE_RENEWAL_INTERVAL_MILLISECONDS = 15_000;
export const CLEAN_QUIT_TURN_END_WAIT_MILLISECONDS = 10_000;
export const GATE_TIME_BOUND_MILLISECONDS = 900_000;
/** The owner's answer to design section 12, item 2, recorded in stage 0; `null` is no bound. */
export const INSTALL_LINE_TIME_BOUND_MILLISECONDS: number | null = null;
export const TALOS_TICK_MILLISECONDS = 1000;
/** Two ticks further apart than one tick plus this are a gap: a sleep, a suspension, or a clock that moved. */
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
| `<monitor>/private/<trackerId>/talos-<n>.secret` | Overseer | the secret, owner-only |
| `<monitor>/private/<trackerId>/token` | Overseer | the API token (moved from `watchers/`) |
| `<monitor>/private/<16 hex>.sock` | Talos | the endpoint on macOS and Linux; a named pipe on Windows |

Child folders: a job's agent `jobs/<J>`; a job's lines `jobs/<J>/<step folder>` (`install`, `install2`, `gate-<name>`,
`target-merge`, `main-merge`, as `JobLaunch.ts:313-327` names them); `flint-brain`; `merge-gates/<hash>/step-<i>`;
`gate-profile-runs/<P>/step-<i>`; `pipeline-checks/<S>/run-<r>/step-<i>`.

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
  reason:   ChildEndReason;
  exitCode: number | null;
  signal:   string | null;
  /** Why no child ran; `null` when one did. */
  detail:   string | null;
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
export interface LeaseRenewal {
  readonly moveTo: (endpoint: string, secret: string) => void;
  readonly stop:   () => void;
}

// src/services/lifecycle/GateRun.ts
export interface LineRunRequest {
  argv:                  readonly string[];
  verbatimArguments:     boolean;
  directory:             string;
  environment:           Readonly<Record<string, string>>;
  label:                 string;
  timeBoundMilliseconds: number | null;
  onOutputLine?:         (line: string) => void;
}
export interface LineRunEnd {
  exitCode:   number | null;
  signalCode: string | null;
  endReason:  ChildEndReason | 'talos-unavailable';
  output:     string;
}
export type LineRunner = (request: LineRunRequest) => Promise<LineRunEnd>;
```

### Model, documents and refusals

- `InterruptionCause` gains `'talos-paused' | 'lease-ended' | 'network-outage'`; `JobStates.ts` gains
  `INTERRUPTION_CAUSES_HELD_FROM_RESUMING = ['network-outage']`.
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
  is harmless (it grants grace) but delays every frame.
- **A renewal on the Overseer's event loop.** `GitProcess.run` has no timeout and runs synchronously
  (`src/lib/git/GitProcess.ts:58-61`, `:68`), and the Airlock awaits a merged-tree gate in the pass
  (`Airlocks.ts:638-640`). A `setInterval` in the main thread misses renewals during a long `worktree add` or a landing.
  The renewal runs in its own worker with its own connection.
- **Stopping the renewal at a release.** The successor holds the Baton only after the predecessor released
  (`OverseerForeground.ts:649-658`, `:722-736`), up to `BATON_PASS_RELEASE_TRIES` intervals later
  (`OverseerLimits.ts:69-72`). If the predecessor stops renewing at its release, a slow pass lets the lease end. The
  predecessor renews until it exits.
- **Counting a lease end or a clean quit as a crash.** `Jobs.ts:139` defaults a missing cause to `watcher-lost`, a
  counted crash. Map `paused` and `lease-ended` before the `agent-crashed` branch (`DrivePass.ts:574-575`); two counted
  crashes in a row open an `outage` decision (`Playbook.ts:139-150`).
- **A session job replaced on an outage.** `crashBoundStepsOf` replaces every interrupted session kind before it looks
  at the cause. Put the held causes before that rule (WP2.11 item 3).
- **A paused line judged.** A gate stopped by a clean quit exits by a signal, which judges `cannot-run` and opens an
  incident. A `paused` end is never judged; the step runs again as the next instance (WP2.13 item 6). The fixed
  `PROCESS_WATCHER_INSTANCE = 1` (`JobLaunch.ts:335`) cannot express a re-run.
- **Removing a worktree under a running line.** Gate profiles and pipeline checks are marked stopped and their worktrees
  removed at start (`GateProfiling.ts:244-248`, `PipelineChecking.ts:191-195`). Under Talos their lines outlive the
  Overseer, so stop them first (WP2.14 item 5).
- **The gate bound counting a sleep.** On a laptop, a gate running across a sleep would be stopped on wake and open a
  `gate-cannot-run` incident. Add every detected gap to the line's allowance (WP2.7 item 8), unless the owner decides
  otherwise.
- **The lease ending a line.** The lease stops agents only (decision 29); a lease end that ran the clean quit's line
  step would stop installs on every sleep with a dead Overseer.
- **Writing the environment.** The child's environment holds the vendor's login variables (`ClaudeCodeAdapter.ts:44-60`,
  inherited through `inheritedVariableNames`). No launch file exists any more; Talos must not log a launch frame, and
  `talos-<n>.log` gets the label and `childId` only. The API key reaches the child only through `environmentFromTalos`.
- **A frame counted as taken on connect.** Today a frame counts as taken once the socket connected
  (`WatcherFleet.ts:225-231`). Write a marker only after `done`, or a message is lost when Talos refuses it.
- **Reading a Watcher's record as Talos's.** Old boards hold `watcher-<n>.json` and old event logs with origin
  `watcher`. Nothing reads them; a format-2 reader reports an old log as malformed, which is a verdict, not a throw.
  Boards are set up anew.
- **The planted `watcher-lost` in the names guard.** `src/ComponentNames.spec.ts` plants `watcher-lost` as allowed.
  Adding the bare word `watcher` to `RETIRED_NAMES` breaks stage 9's ownership of that value; add only the code names.
- **`node:net` data left unread.** A socket whose data nobody reads never sees `close` (`WatcherFleet.ts:221`); every
  Talos connection reads data, the renewal thread's too.
- **Specs waiting out production bounds.** Every bound reaches Talos through the start file; specs pass milliseconds. No
  `Bun.sleep` before an assertion (`src/SpecSleeps.spec.ts`).

## Verification of the whole stage

At the repository root:

```sh
bun install --frozen-lockfile
bun run verify
```

In `apps/forge`, the specs that matter most:

```sh
bun test --path-ignore-patterns='.claude/**' ./src/lib/talos/
bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/TalosChildren.spec.ts ./src/services/overseer/TalosStart.spec.ts ./src/services/overseer/LeaseRenewal.spec.ts ./src/services/overseer/TalosLines.spec.ts
bun test --path-ignore-patterns='.claude/**' ./src/lib/tracker-model/
bun test --path-ignore-patterns='.claude/**' ./cli/overseer/
bun run record src/lib/talos/Talos.ts
bun run record src/services/overseer/TalosStart.ts
bun run record src/services/overseer/LeaseRenewal.ts
```

`bun run verify:integration` in `apps/forge` runs every real-system spec; run it only when the owner asks for it.

End to end on a scratch forge, as `docs/development/contributing.md:76-110` sets one up (`HOME` in a scratch folder,
`FORGE_ROOT` at a scratch repository, `FORGE_FAKE_AGENT=1`, the program run from this checkout with `bun
agent-progress.ts`). Never on the real home or the live board.

1. `oversee --port 0` in the background. `<board>/talos/talos-1.json` reads `serving` with protocol 1; the Overseer's
   log says the lease renewal started.
2. Ready a ticket. Its build runs: `jobs/<J>/child-1.json` is `running`, `install/child-1.json` and the gate step's
   records appear in turn, and the ticket reaches review and lands as before.
3. Stop the Overseer while a fake agent works (`FORGE_FAKE_AGENT_KEEPS_WORKING=1`). Within one minute the agent still
   runs; start the Overseer again: it attaches to `talos-1` and the job goes on.
4. Stop the Overseer and wait past one minute: the agent's record ends `lease-ended`, an install line started before the
   stop runs to its end; on the next start the job is interrupted `lease-ended` and resumed.
5. Suspend the Overseer (`kill -STOP`) for 90 seconds and continue it: Talos records the lease as ended only if no
   renewal came within the grace after the Overseer continued; with the renewal thread running, nothing stops.
6. Raise `TALOS_PROTOCOL_VERSION` in a throwaway local edit and restart the Overseer: the old Talos answers
   `version-mismatch`, its agents end `paused`, `talos-2.json` serves, the jobs are interrupted `talos-paused` and
   resumed by themselves. Revert the edit.
7. Run the fake agent's outage scenario on a ticket: the record lists `network-outage`, the job is interrupted
   `network-outage`, its session is stopped, nothing resumes it, and no `outage` decision opens.
8. `kill -9` the Talos process while a gate line runs: the next pass finds Talos lost, stops the gate's tree, and starts
   `talos-3`.
9. Queue a gate profile and a pipeline check: their lines show as children under `gate-profile-runs/` and
   `pipeline-checks/`; a Stop ends them.
10. End the scratch board, then check that no `bun` process of `talos.ts` and no child of the scratch board is left (`ps
    -A -o pid,command | grep talos.ts`).

## Out of scope

- Turning `reboot` and `lease-ended` into causes that wait for an instruction, the resume instruction, the crash log,
  the forge that stays off after a crash of the Overseer or of Talos, the heartbeat and the completed stop on record:
  stage 3.
- Two resumes of a crashed agent and no more: stage 3. `JOB_RESUMES_BEFORE_FRESH` keeps its meaning here.
- A command kind and a Gaia control to restart Talos cleanly (decision 31): the mechanism exists (`quit` frame,
  `restart`), the command `talos-restart` and its control come with stage 6 (WP6.22).
- Gaia showing the running and the newest Talos: stage 6 (WP6.22) reads `talosProtocolVersion`.
- A crash log and a stop when Talos is found lost: stage 3 (its need N6) changes the two `ensureTalos` call sites of
  WP2.9 and WP2.13 item 13.
- Renaming the stored cause `watcher-lost`, the `overseer-*` records and anything named Overseer: stage 9.
- Handing a merged-tree gate to Talos without the pass awaiting it (design risk 2): not in this plan.
- A probe that resumes a `network-outage` job when the vendor is reachable: only if the owner chooses that answer, and
  then as its own package after this stage.
- Choosing a time bound for install lines: open item 2, the owner's (stage 0). This stage only carries the answer in
  `INSTALL_LINE_TIME_BOUND_MILLISECONDS`.
- Removing Flint's brain: stage 8; here it only moves under Talos.
- Closing the agent port's other leaks of design section 5 (the Overseer's `ClaudeTranscripts.ts`, the hook entries,
  confinement): no stage owns them yet ("Needs the owner", item 10).
- The store port: stage 5. Talos's files stay under the operating system port, as design section 4 has them.
- Any new workspace package; any change to `packages/` beyond what WP2.13 needs (none is planned there).

## Needs the owner

1. **What follows an ending on a network outage** (design section 12, item 1). Built here for both answers: the pattern,
   the recognition, the record, the cause `network-outage`, not counted, the session stopped, and the Playbook neither
   resuming nor replacing the job (`INTERRUPTION_CAUSES_HELD_FROM_RESUMING`). The fork: a probe that resumes by itself,
   or an instruction. Recommended default: wait for an instruction, built in stage 3; until then the job leaves that
   state only by `job stop` or `job fresh`.
2. **A time bound for install lines** (design section 12, item 2). Built for both answers: `timeBoundMilliseconds` on
   every line launch, and `INSTALL_LINE_TIME_BOUND_MILLISECONDS` on every install step's launch, stopped and ended
   `time-bound` as a gate is. The fork: no bound (`null`) or a bound. Stage 0 asks the owner and recommends 15 minutes
   (stage 0, "Needs the owner", item 2); the constant holds the owner's answer, and `null` while there is none, so
   nothing changes until the owner names a bound. Prepare steps and merges carry `null` either way.
3. **Whether the 15-minute gate bound counts a sleep.** Recommended default: no; Talos adds each detected gap to the
   gate's allowance, so a laptop that slept does not open a `gate-cannot-run` incident.
4. **`lease-ended` before stage 3.** Recommended default: resumed by itself like `reboot`, never counted, until stage 3
   moves both to waiting for an instruction.
5. **The stored cause `watcher-lost`.** Section 11 of the design renames it in stage 9. Recommended default: keep the
   value here, meaning "Talos was lost while the child ran".
6. **The identity document's key and the system version.** `watcherProtocolVersion` becomes `talosProtocolVersion`; no
   Gaia code reads the old key (it appears only in Gaia's recordings). Recommended default: raise
   `FORGE_SYSTEM_VERSIONS.current` to 1.2 in `packages/forge-contracts/constants/ForgeSystemVersions.ts`, as a change
   that no supported client needs to see; Gaia's supported-forge check then warns until Gaia moves.
7. **The lease proves that the Overseer lives, not that it makes progress** (design risk 2). The renewal thread renews
   while the process lives, also with a hung main thread. Recommended default: accept for this stage; a check of the
   main thread's progress in the renewal thread can follow.
8. **The minimum number of retry lines** for the outage pattern. Recommended default: the number stage 0's recording
   shows, and `1` if it shows none.
9. **Renaming `Job.watcherInstance` in this stage** (WP2.16, 82 files). Recommended default: yes, as its own package,
   since the design says the Watcher's name goes with its code.
10. **The rest of the agent port's work** (decision 16, design section 5, row "Agent"). This stage puts only the
    vendor's ending patterns, closing line and quit act behind the adapter. The leaks the design lists stay: the
    Overseer's own `src/services/overseer/ClaudeTranscripts.ts` beside the adapter's
    `src/lib/claude-code/ClaudeTranscripts.ts`, the install-time hook entry in a repository's
    `.claude/settings.local.json`, the `bash-domains` hook (`cli/hooks/BashDomainsHook.ts`), and session confinement
    resting on the vendor's sandbox. No stage of design section 11 carries them, and no plan in this folder does.
    Recommended default: the owner names a stage for them; until then they stay as they are.
11. **A Talos just started that answers another protocol version** (design decision 6 says "the right one starts").
    With no pinned bundle, Talos starts from the program on disk, so after a pull the Overseer can start a Talos of
    another protocol, and starting again gives the same one. Built: start once, answer `held` with
    `talos-protocol-differs`, and refuse the Overseer's start (WP2.9 step 2.6, WP2.13 item 1). Recommended default: as
    built; the user restarts the forge with the program on disk, which then starts the matching Talos.
12. **When Talos syncs an event log** (design section 3.2: "when a client asks for the durable entries and at the
    close"). No production reader asks for history over the socket today: the pass reads the event-log files
    (`src/services/overseer/DrivePass.ts:431`). Built: no `history` or `message` frame; Talos syncs a child's log at
    its end and at the quit. Recommended default: as built.
13. **The Overseer's own gates across its restart** (design section 3.3: Talos and its children outlive a restart).
    Merged-tree gates, gate profiles and pipeline checks are awaited by promises of the Overseer that started them, so
    at the next start nothing would read their end. Built: the next Overseer stops those line children at start
    (WP2.14 item 5), while agents and job lines carry on. Recommended default: as built; carrying them across a restart
    needs the pass redesign of design risk 2.

## Not established

- That a Bun 1.4.2 `Worker` (`.bun-version`) keeps a `node:net` connection writing while the main thread is blocked in
  `Bun.spawnSync`, and that `bun:ffi` loads in a worker on Windows. No module of the repository creates a `Worker`
  today. WP2.6 and WP2.9 prove the first on macOS before anything depends on it.
- The exact fields of a Claude Code result line after its retries ran out: no such session is recorded in the repository
  (design risk 13). The plan takes the field names from the design and from stage 0's recording; only `terminal_reason`
  was seen, with the value `completed`, in an ordinary result line.
- Whether a `claude -p` session in stream-json input mode exits after an error result or waits for more input. The plan
  stops the session either way.
- That closing stdin mid-turn lets a session finish its turn and exit; today's code relies on it
  (`JobControlDelivery.ts:105-110`), but no spec shown here measures a turn's end against the 10 seconds.
- Whether `job fresh` or `job stop` moves an interrupted job: `JobMoveLegality.ts:14` allows `interrupted` to
  `stopping`, but the control path was not traced.
- How `src/testing/ImportGraph.ts` treats `import type`, which `TalosMainThread.spec.ts` depends on.
- Whether `src/lib/process-identity/FrozenProcessSupervision.json` names the spawn kind `watcher`.
- Whether every Airlock step is safe when a merged-tree gate child is stopped by a restart of the Overseer and the gate
  runs again: stage 0's table B traces the `gating` phase as safe to redo for the board, but no run of a gate child
  stopped mid-run under Talos was traced.
- Whether `clear` stops a board's Talos; `clear` was not read.
- Linux and Windows: Talos, the worker threads and the lease never ran there; the plan records macOS only.
