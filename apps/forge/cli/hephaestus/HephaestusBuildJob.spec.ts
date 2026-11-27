/**
 * A build job's code on a scratch tracker behind the Talos boundary: `src/testing/RecordedTalosStages.ts` plays the session and scripts each gate
 * line, so no Talos, agent or gate process starts. What matters: each step is a job state, from the worktree made off the target tip and the
 * install line, through the closing report, verification and a gate, to the Handoff code writes, the finished ticket and the review job the
 * policy launches; and each operational failure opens its own incident or decision rather than a failed pass, while a missing report or an
 * attribution trailer is a failed pass with its cause. A tracker at its repository's root whose pipeline has no entities asks git exactly the
 * calls it asked before a tracker could sit in a folder or hold entities, on a clean run to the landing, a conflict an Airlock agent resolves, a
 * red handoff that parks the ticket and a review round. `cli/hephaestus/HephaestusBuildJob.integration.spec.ts` holds the real-system claims.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';


import type { AgentAdapter }                                   from '../../src/lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchRequest }                             from '../../src/lib/agent-launch/AgentLaunchRequest.ts';
import type { NetworkDomainGuard }                             from '../../src/lib/agent-launch/WorkerProfile.ts';
import { SANDBOX_EXEC_PATH }                                   from '../../src/lib/gate-confinement/DarwinSeatbelt.ts';
import type { GateConfinement }                                from '../../src/lib/gate-confinement/GateConfinement.ts';
import type { ChildLaunch }                                    from '../../src/lib/talos/ChildLaunch.ts';
import type { Job, JobState }                                  from '../../src/lib/tracker-model/@types/Job.ts';
import type { AgentStepSettings, PipelineReview }              from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { Board }                                          from '../../src/lib/tracker-model/Board.ts';
import type { BoardChildren }                                  from '../../src/services/hephaestus/BoardChildren.ts';
import type { DrivePass }                                      from '../../src/services/hephaestus/DrivePass.ts';
import { HatchInbox }                                          from '../../src/services/hephaestus/HatchInbox.ts';
import { jobFolderIn }                                         from '../../src/services/hephaestus/HephaestusFiles.ts';
import { localStoreLayoutOf }                                  from '../../src/services/tracker/LocalStoreLayout.ts';
import { requireWorkspace }                                    from '../../src/services/tracker/Workspace.ts';
import { JOB_ID_VARIABLE }                                     from '../../src/shared/Environment.ts';
import { DISPATCH_PROTOCOL }                                   from '../../src/shared/constants/DispatchProtocol.ts';
import { LINE_TIME_BOUND_MILLISECONDS, WIND_DOWN_GRACE_CALLS } from '../../src/shared/constants/HephaestusLimits.ts';
import { createScratchDrivePass, seatbeltThatApplies }         from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  FAKE_HEAD_PLACEHOLDER,
  fakeAgentAdapter,
  fakeAssistantTurnLine,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { FAKE_CONFINER_ARGV, FAKE_MISSING_TOOLS_REASON, fakeGateConfinement } from '../../src/testing/FakeGateConfinement.ts';
import { type LoggedGitCall, startGitCallLog }                                from '../../src/testing/GitCallLog.ts';
import { inheritedEnvironment }                                               from '../../src/testing/InheritedEnvironment.ts';
import { nativePlatformPorts }                                                from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                                     from '../../src/testing/RecordedGit.ts';
import {
  RECORDED_FLOW_COMMITS,
  RECORDED_FLOW_CONFLICT,
  RECORDED_FLOW_MAIN_LINE,
  RECORDED_FLOW_PLACEHOLDERS,
  RECORDED_FLOW_TICKET_BRANCH,
  type RecordedFlowCommitStageName,
  REPLAYED_OBJECT_IDS
} from '../../src/testing/RecordedGitFlow.ts';
import { type RecordedTalosStages, useRecordedTalosStages }               from '../../src/testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory, runScratchRoot } from '../../src/testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }                           from '../../src/testing/TalosChildReadings.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT }              from '../../src/testing/ToolGuard.ts';
import { waitUntil }                                                      from '../../src/testing/WaitUntil.ts';
import { runCommandLine }                                                 from '../Main.ts';
import { createCapturedCommandContext }                                   from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                         from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                                                from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                                from '../testing/StoredLogText.ts';
import { storedProgressOf }                                               from '../testing/StoredProgress.ts';
import { HephaestusWording }                                              from './HephaestusWording.ts';

const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const WORKTREES_FOLDER = '.forge-worktrees';
const RED_TESTS_LINE = 'echo expected 2, received 3; exit 1';
const FROZEN_ROOT_TRACKER_GIT_CALLS_PATH = join(import.meta.dir, 'FrozenRootTrackerGitCalls.json');

const world = useRecordedTalosStages(nativePlatformPorts());
let ports: RecordedTalosStages['ports'];
let repositoryDirectory = '';
let monitorFolder = '';
let hephaestusLog: string[] = [];
let buildStates: string[] = [];
let launchRequests: AgentLaunchRequest[] = [];
let afterEachLaunchPlan: (request: AgentLaunchRequest) => void = () => undefined;
let afterEachHoldPhase: (board: Board) => void = () => undefined;
let sessionStepsOfReportTitle: Readonly<Record<string, readonly FakeAgentStep[]>> = {};
let jobsNotingStateAssignments = new WeakSet<object>();

async function run(commandLineArguments: readonly string[]) {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK, platformPorts: ports });
  const exitCode = await runCommandLine(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

function noteBuildState(state: string): void {
  if (buildStates.at(-1) !== state) buildStates.push(state);
}

/** Turns the job's `state` into an accessor, so every move the hold makes is noted however briefly the job stands in it. */
function noteEveryStateAssignmentOf(job: Readonly<Job>): void {
  let { state } = job;
  Object.defineProperty(job, 'state', {
    enumerable:   true,
    configurable: true,
    get:          () => state,
    set:          (movedState: JobState) => {
      state = movedState;
      noteBuildState(movedState);
    },
  });
  jobsNotingStateAssignments.add(job);
}

/**
 * Every state the first build job moved through, each recorded once in order; `ended` once it left the board. Each hold reads a fresh
 * board, so the job's stored state is read once, where the hold first shows it, and every move after that is noted as it is assigned.
 */
function recordBuildStateChanges(_phase: string, board: Board): void {
  const buildJob = board.jobs().find((job) => job.kind === 'build' && job.attempt === 1);
  if (buildJob === undefined) {
    if (buildStates.length > 0) noteBuildState('ended');
    return;
  }
  if (!jobsNotingStateAssignments.has(buildJob)) {
    noteBuildState(buildJob.state);
    noteEveryStateAssignmentOf(buildJob);
  }
}

/**
 * A session whose report title a case names in `sessionStepsOfReportTitle` plays those steps. Any other reviewer only waits: played at once,
 * it would end before a spec reads its launch.
 */
function launchCapturingAdapterOf(adapter: AgentAdapter): AgentAdapter {
  return {
    ...adapter,
    planOf: (request) => {
      launchRequests.push(request);
      afterEachLaunchPlan(request);
      const reportTitle = (request.reportSchema as { title?: string } | null)?.title ?? '';
      const namedSteps = sessionStepsOfReportTitle[reportTitle];
      if (namedSteps !== undefined) return fakeAgentAdapter(namedSteps).planOf(request);
      const isReviewer = reportTitle === 'reviewer report';
      return isReviewer ? fakeAgentAdapter([{ kind: 'print', line: fakeStartedLine('fake-session') }, { kind: 'await-line' }]).planOf(request) : adapter.planOf(request);
    },
  };
}

/** No verb sets the review phase: `pipeline.json` is edited by hand, as User would. */
function setReviewPhase(review: Readonly<PipelineReview>, reviewerSettings: Readonly<AgentStepSettings>): void {
  const pipelinePath = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json');
  const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')) as Record<string, unknown>;
  writeFileSync(pipelinePath, `${JSON.stringify({ ...pipeline, review, agents: { reviewer: reviewerSettings } }, null, 2)}\n`);
}

/** As User edits the pipeline's agent settings by hand. */
function setAgentSettings(agents: Readonly<Record<string, AgentStepSettings>>): void {
  const pipelinePath = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json');
  const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')) as Record<string, unknown>;
  writeFileSync(pipelinePath, `${JSON.stringify({ ...pipeline, agents }, null, 2)}\n`);
}

/** Every case here runs a board whose Assistant is on, which a new board has off: it is switched on once the case stored its pipeline. */
async function turnTheAssistantOn(): Promise<void> {
  if (existsSync(join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json'))) await run(['gate', 'assistant', 'on']);
}

async function drivePassPlaying(steps: readonly FakeAgentStep[], gateConfinement: GateConfinement = seatbeltThatApplies()): Promise<DrivePass> {
  await turnTheAssistantOn();
  return createScratchDrivePass({
    platformPorts:        { ...ports, gateConfinement },
    processStarts:        world.processStarts,
    workspace:            requireWorkspace(repositoryDirectory),
    now:                  SPEC_CLOCK,
    talosConnection:      () => world.connectionFor(requireWorkspace(repositoryDirectory).trackerDirectory),
    agentAdapter:         launchCapturingAdapterOf(fakeAgentAdapter(steps)),
    monitorFolder,
    inheritedEnvironment: inheritedEnvironment(),
    mainLine:             RECORDED_FLOW_MAIN_LINE,
    decisionWordingOf:    (draft) => HephaestusWording.decisionWordingOf(draft, fakeAgentAdapter()),
    redHandoffMessageOf:  HephaestusWording.redHandoffMessageOf,
    log:                  (line) => hephaestusLog.push(line),
    afterHoldPhase:       (phase, board) => {
      recordBuildStateChanges(phase, board);
      afterEachHoldPhase(board);
    },
  });
}

async function passUntil(drivePass: DrivePass, holds: () => boolean, what: string): Promise<void> {
  await waitUntil(async () => {
    drivePass.wake(true);
    await drivePass.idle();
    return holds();
  }, () => {
    const gateFolder = join(jobFolderOf(firstBuildJobId()), 'gate');
    const gateLog = existsSync(gateFolder) ? readdirSync(gateFolder).map((name) => `${name}: ${readFileSync(join(gateFolder, name), 'utf8')}`).join('\n') : '';
    return `${what} (states ${buildStates.join(' > ')}, ending ${JSON.stringify(buildJobEnding())}):\n${hephaestusLog.join('\n')}\n${gateLog}`;
  });
}

/** The children as Hephaestus reads them, through Talos's adapter over the case's platform ports. */
function childReadings(): BoardChildren {
  return talosChildReadingsWith(ports, requireWorkspace(repositoryDirectory).trackerDirectory);
}

function jobFolderOf(jobId: string): string {
  return jobFolderIn(requireWorkspace(repositoryDirectory).trackerDirectory, jobId);
}

interface LoggedEntry {
  kind:   string;
  jobId?: string;
  fields: Record<string, unknown>;
}

function loggedEntries(kind: string): LoggedEntry[] {
  return storedLogTextOf(repositoryDirectory).split('\n').filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LoggedEntry).filter((entry) => entry.kind === kind);
}

function firstBuildJobId(): string {
  return String(loggedEntries('job-launched').find((entry) => entry.fields['kind'] === 'build')?.jobId);
}

function buildJobEnding(): Record<string, unknown> | undefined {
  return loggedEntries('job-ended').find((entry) => entry.jobId === firstBuildJobId())?.fields;
}

function openIncidentKinds(): string[] {
  return (storedProgressOf(repositoryDirectory).incidents ?? []).map((incident) => incident.kind);
}

function ticketText(): string {
  const ticketsFolder = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'tickets');
  const [fileName = ''] = readdirSync(ticketsFolder).filter((name) => name.startsWith('001-'));
  return readFileSync(join(ticketsFolder, fileName), 'utf8');
}

/** Every gate name a spec here adds, claimed on HEAD by default: a claim for a gate the board lacks is ignored. */
const CLAIMED_GATE_NAMES = ['checks', 'types', 'tests', 'lint'];

function builderReport(fields: Record<string, unknown> = {}): string {
  return fakeResultLine({
    role:              'builder',
    outcome:           'built',
    headCommit:        FAKE_HEAD_PLACEHOLDER,
    acceptance:        [{ item: 'A1', state: 'met', evidence: 'Example spec proves it' }, { item: 'A2', state: 'met', evidence: 'Example probe' }],
    alsoFixed:         [],
    gates:             CLAIMED_GATE_NAMES.map((name) => ({ name, commit: FAKE_HEAD_PLACEHOLDER })),
    handoff:           'Example handoff by Alex Example: the example holds.',
    blockedReason:     null,
    cannotBuildReason: null,
    ...fields,
  });
}

/**
 * The session's commit, which moves the recorded git on to the flow stage of that commit. In the ticket worktree only: the Assistant session
 * plays the same steps in the main checkout, where a commit would move the target.
 */
function commitInTicketWorktree(stage: RecordedFlowCommitStageName): FakeAgentStep {
  const { path, message } = RECORDED_FLOW_COMMITS[stage];
  const command = `commit ${path}: ${message}`;
  world.scriptShell(command, (workingDirectory) => {
    if (workingDirectory.includes('/ticket-')) recordedGit.enterFlowStage(stage, repositoryDirectory);
  });
  return { kind: 'shell', command };
}

/** Commits a file, reports, then waits for its input to close, as a builder whose session Hephaestus ends after the report. */
function buildingSession(commitStage: RecordedFlowCommitStageName = 'tree changed', report = builderReport()): FakeAgentStep[] {
  return [
    { kind: 'print', line: fakeStartedLine('fake-session') },
    commitInTicketWorktree(commitStage),
    { kind: 'print', line: report },
    { kind: 'await-line' },
  ];
}

/** The launch Talos took for the line folder's first instance. */
function lineLaunchIn(lineFolder: string): ChildLaunch {
  const launch = world.launchOf(lineFolder, 1);
  if (launch === null) throw new Error(`no line was launched in ${lineFolder}`);
  return launch;
}

beforeEach(async () => {
  ({ ports } = world);
  world.scriptLine(RED_TESTS_LINE, { exitCode: 1, output: 'expected 2, received 3\n' });
  repositoryDirectory = await createInitializedRecordedGitRepository('build-job', ['--project', 'Example Agency'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  monitorFolder = createScratchDirectory('h');
  hephaestusLog = [];
  buildStates = [];
  launchRequests = [];
  afterEachLaunchPlan = () => undefined;
  afterEachHoldPhase = () => undefined;
  sessionStepsOfReportTitle = {};
  jobsNotingStateAssignments = new WeakSet<object>();
  await run(['unpause']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

afterEach(() => {
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

async function passUntilLanded(gateVerb: readonly string[]): Promise<void> {
  await run(gateVerb);
  const drivePass = await drivePassPlaying(buildingSession());
  await passUntil(drivePass, () => loggedEntries('job-ended').some((entry) => entry.fields['outcome'] === 'landed'), 'the landing');
}

/** The Airlock agent's resolution, which moves the recorded git on to the committed merge. In the ticket worktree only, as a builder's commit. */
function resolveConflictInTicketWorktree(): FakeAgentStep {
  const command = `resolve ${RECORDED_FLOW_CONFLICT.path}`;
  world.scriptShell(command, (workingDirectory) => {
    if (workingDirectory.includes('/ticket-')) recordedGit.enterFlowStage('conflict resolved', repositoryDirectory);
  });
  return { kind: 'shell', command };
}

function airlockAgentResolvingTheConflict(): FakeAgentStep[] {
  const report = {
    role: 'builder', outcome: 'resolved', headCommit: FAKE_HEAD_PLACEHOLDER, resolvedFiles: [RECORDED_FLOW_CONFLICT.path], notes: 'Example notes', reportKind: null
  };
  return [
    { kind: 'print', line: fakeStartedLine('fake-airlock-session') },
    resolveConflictInTicketWorktree(),
    { kind: 'print', line: fakeResultLine(report) },
    { kind: 'await-line' },
  ];
}

/**
 * Each flow the frozen replay runs, under its name in `FrozenRootTrackerGitCalls.json`. The first two were taken from forge at 7210f3c1, the
 * last commit before Part B; the conflict, the red handoff and the review round from ede42a12, the last commit before entities. Each was taken
 * by running its case there with the distinct calls written out. Retake one the same way from the commit before a change meant to move a root
 * tracker's git, never from this run. A review round stops at the reviewer's running session: its pass commits, which no flow stage records.
 */
const FROZEN_ROOT_TRACKER_FLOWS = {
  'no gate':                             async () => await passUntilLanded(['gate', 'none']),
  'one gate in every phase':             async () => await passUntilLanded(['gate', 'add', 'checks', '--', 'true']),
  'a conflict with the moved main line': async () => {
    afterEachHoldPhase = (board) => {
      if (!board.logRecordsSoFar().some((record) => record.kind === 'merge-queued')) return;
      afterEachHoldPhase = () => undefined;
      recordedGit.enterFlowStage('branch conflicting with main', repositoryDirectory);
    };
    sessionStepsOfReportTitle = { 'airlock agent report': airlockAgentResolvingTheConflict() };
    // The resolved merge is gated before it lands; its spawn options are a pure answer, so the native one stands in for the recorded table.
    const { spawnOptionsFor } = nativePlatformPorts().processSupervision;
    ports = { ...ports, processSupervision: { ...ports.processSupervision, spawnOptionsFor } };
    await passUntilLanded(['gate', 'add', 'checks', '--', 'true']);
  },
  'a red handoff': async () => {
    await run(['gate', 'add', 'tests', '--', RED_TESTS_LINE]);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');
  },
  'a review round up to the reviewer\'s report': async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    setReviewPhase({ name: 'Security pass' }, { model: 'sonnet', effort: 'high' });
    const drivePass = await drivePassPlaying(buildingSession());
    const reviewJobId = (): string | undefined => storedProgressOf(repositoryDirectory).jobs?.find((job) => job.kind === 'review')?.id;
    await passUntil(drivePass, () => launchRequests.some((request) => request.environment[JOB_ID_VARIABLE] === reviewJobId()), 'the reviewer launch');
  },
} as const satisfies Record<string, () => Promise<void>>;

const FROZEN_ROOT_TRACKER_FLOW_NAMES = Object.keys(FROZEN_ROOT_TRACKER_FLOWS) as (keyof typeof FROZEN_ROOT_TRACKER_FLOWS)[];

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a build job end to end', () => {
  test('with no review phase a gated build goes straight to the merge queue, and no reviewer or review bar is ever made', async () => {
    await run(['gate', 'none']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => loggedEntries('merge-queued').length > 0, 'the merge queuing');
    await passUntil(drivePass, () => loggedEntries('job-ended').some((entry) => entry.fields['outcome'] === 'landed'), 'the landing');

    expect(buildJobEnding()).toMatchObject({ outcome: 'built' });
    expect(loggedEntries('job-launched').map((entry) => entry.fields['kind'])).not.toContain('review');
    expect(loggedEntries('review-bar-started')).toEqual([]);
    expect(storedProgressOf(repositoryDirectory).tasks.some((task) => task.reviewOf !== undefined)).toBe(false);
    expect(loggedEntries('decision-opened')).toEqual([]);
    expect(existsSync(join(jobFolderOf(firstBuildJobId()), 'gate-1'))).toBe(false);
  });

  const frozenClaim = 'a tracker at its repository\'s root with %s asks git exactly the calls forge asked before a tracker could sit in a folder';
  test.each(FROZEN_ROOT_TRACKER_FLOW_NAMES)(frozenClaim, async (flowName) => {
    const gitCalls = startGitCallLog({ [repositoryDirectory]: '<repository>', [monitorFolder]: '<monitor>', [runScratchRoot()]: '<scratch root>' });
    try {
      await FROZEN_ROOT_TRACKER_FLOWS[flowName]();
    } finally {
      gitCalls.stop();
    }

    const frozenCalls = JSON.parse(readFileSync(FROZEN_ROOT_TRACKER_GIT_CALLS_PATH, 'utf8')) as Record<string, LoggedGitCall[]>;
    expect(gitCalls.distinctCalls()).toEqual(frozenCalls[flowName] ?? []);
  });

  test('prepares, installs, launches, verifies, gates, writes the Handoff, finishes the ticket and gets a review job launched', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'prepare', 'install', '--', 'true']);
    setReviewPhase({ name: 'Security pass' }, { model: 'sonnet', effort: 'high' });
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => storedProgressOf(repositoryDirectory).jobs?.some((job) => job.kind === 'review') === true, 'the review launch');
    const launchedKindOf = (request: AgentLaunchRequest): unknown => loggedEntries('job-launched')
      .find((entry) => entry.jobId === request.environment[JOB_ID_VARIABLE])?.fields['kind'];
    await passUntil(drivePass, () => launchRequests.some((request) => launchedKindOf(request) === 'review'), 'the reviewer launch');
    const settingsOfKind = (kind: string): unknown[] => launchRequests.filter((request) => launchedKindOf(request) === kind).map((request) => [request.model, request.effort]);
    expect(settingsOfKind('build')).toEqual([['opus', 'medium']]);
    expect(settingsOfKind('review')).toEqual([['sonnet', 'high']]);
    expect(loggedEntries('review-bar-started').map((entry) => entry.fields['name'])).toEqual(['Review 1 #001 — Export the example roles (Security pass)']);

    expect(buildStates).toEqual(['launching', 'preparing', 'running', 'in-customs', 'gating', 'ended']);
    expect(buildJobEnding()).toMatchObject({ outcome: 'built' });
    expect(storedProgressOf(repositoryDirectory).jobs?.find((job) => job.kind === 'review')).toMatchObject({ role: 'reviewer', attempt: 1, ticketIds: ['001'] });
    expect(ticketText()).toMatch(/^status: "in-review"$/m);
    expect(ticketText()).toContain('## Handoff\n\nExample handoff by Alex Example: the example holds.\n\n- A1 — Example spec proves it\n- A2 — Example probe\n\n## Brief\n');
    expect(ticketText().match(/^## Handoff$/gm)).toHaveLength(1);
    expect(ticketText()).not.toContain('Filled in by the agent');

    const recordedWorktree = join(RECORDED_FLOW_PLACEHOLDERS.REPOSITORY, WORKTREES_FOLDER, RECORDED_FLOW_TICKET_BRANCH);
    expect(recordedGit.flowCalls()).toContainEqual(['worktree', 'add', '-b', RECORDED_FLOW_TICKET_BRANCH, recordedWorktree, RECORDED_FLOW_MAIN_LINE]);
    const jobFolder = jobFolderOf(firstBuildJobId());
    for (const [folder, networkDenied] of [['install', false], ['gate-prepare', false], ['gate-1', true]] as const) {
      const launch = lineLaunchIn(join(jobFolder, folder));
      expect(launch.kind).toBe('line');
      expect(launch.timeBoundMilliseconds).toBe(LINE_TIME_BOUND_MILLISECONDS);
      expect(launch.argv[0]).toBe(SANDBOX_EXEC_PATH);
      expect(readFileSync(join(jobFolder, folder, 'process-sandbox.sb'), 'utf8').includes('(deny network-outbound')).toBe(networkDenied);
    }
    expect(childReadings().livenessOf(jobFolder, 1)).toMatchObject({ verdict: 'ended', end: { reason: 'exited', exitCode: 0 } });
    expect(loggedEntries('gate-ran').map((entry) => entry.fields)).toEqual([expect.objectContaining({ outcome: 'passed', cached: false })]);
    expect(existsSync(join(requireWorkspace(repositoryDirectory).trackerDirectory, 'gates'))).toBe(false);
  });

  test('installs and gates each prepare step as a process of its own, in list order, never as one joined line', async () => {
    world.scriptLine('echo first-step', { exitCode: 0 });
    world.scriptLine('echo second-step', { exitCode: 0 });
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'prepare', 'install', '--', 'echo first-step']);
    await run(['gate', 'prepare', 'generate', '--', 'echo second-step']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    expect(buildJobEnding()).toMatchObject({ outcome: 'built' });
    const jobFolder = jobFolderOf(firstBuildJobId());
    for (const folder of ['install', 'install2', 'gate-prepare', 'gate-prepare2']) {
      expect(childReadings().livenessOf(join(jobFolder, folder), 1)).toMatchObject({ verdict: 'ended', end: { reason: 'exited', exitCode: 0 } });
    }
    expect(world.linesRun().filter((line) => line.endsWith('-step'))).toEqual(['echo first-step', 'echo second-step', 'echo first-step', 'echo second-step']);
  });

  test('runs the gates in order, the first red one stopping the rest, each in its in folder with its own network and writes', async () => {
    await run(['gate', 'add', 'types', '--network', 'registry.example.com', '--writes', '~/.cache/example-types', '--', 'true']);
    await run(['gate', 'add', 'tests', '--', 'echo expected 2, received 3; exit 1']);
    await run(['gate', 'add', 'lint', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'red-resumes-spent' });
    const jobFolder = jobFolderOf(firstBuildJobId());
    expect(readFileSync(join(jobFolder, 'gate.log'), 'utf8')).toBe('tests\nexpected 2, received 3\n');
    expect(readFileSync(join(jobFolder, 'gate-failure.md'), 'utf8')).toContain('expected 2, received 3');
    expect(existsSync(join(jobFolder, 'gate-3'))).toBe(false);
    const typesProfile = readFileSync(join(jobFolder, 'gate-1', 'process-sandbox.sb'), 'utf8');
    expect(typesProfile.includes('(deny network-outbound')).toBe(false);
    expect(typesProfile).toContain('.cache/example-types');
    expect(readFileSync(join(jobFolder, 'gate-2', 'process-sandbox.sb'), 'utf8').includes('(deny network-outbound')).toBe(true);
  });

  test('a report claiming one gate on HEAD and another on an older commit fails Customs naming the stale one, and no gate runs', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'add', 'types', '--', 'true']);
    const staleClaims = [{ name: 'checks', commit: FAKE_HEAD_PLACEHOLDER }, { name: 'types', commit: REPLAYED_OBJECT_IDS[RECORDED_FLOW_PLACEHOLDERS.MAIN_TIP] }];
    const drivePass = await drivePassPlaying(buildingSession('tree changed', builderReport({ gates: staleClaims })));
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'red-resumes-spent' });
    expect(readFileSync(join(jobFolderOf(firstBuildJobId()), 'gate-failure.md'), 'utf8')).toContain('V15');
    expect(buildStates).not.toContain('gating');
    expect(loggedEntries('gate-ran')).toEqual([]);
    expect(existsSync(join(jobFolderOf(firstBuildJobId()), 'gate-1'))).toBe(false);
  });

  test('a red gate resumes the builder\'s own session by its id twice, told of the restart, and the third red parks the ticket for User', async () => {
    await run(['gate', 'add', 'tests', '--', 'echo expected 2, received 3; exit 1']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    const jobId = firstBuildJobId();
    const jobFolder = jobFolderOf(jobId);
    // The same job's next child instances are its resumes: the adapter resumes a job's own session id (ClaudeCodeAdapter.spec.ts).
    expect([1, 2, 3, 4].map((instance) => world.launchOf(jobFolder, instance) !== null)).toEqual([true, true, true, false]);
    expect(loggedEntries('job-launched').filter((entry) => entry.fields['kind'] === 'build')).toHaveLength(1);
    expect(loggedEntries('job-resumed').map((entry) => entry.fields['cause'])).toEqual(['handoff-red', 'handoff-red']);
    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'red-resumes-spent' });
    expect(ticketText()).toContain('parked:red-resumes-spent');
    expect(readFileSync(join(jobFolder, 'red-handoff.json'), 'utf8')).toContain('"resume": 3');
    const progress = JSON.parse(readFileSync(localStoreLayoutOf(requireWorkspace(repositoryDirectory)).progressRecordPath, 'utf8')) as { tasks: { ticket: string | null }[] };
    expect(Object.keys(progress.tasks.find((task) => task.ticket === '001') ?? {})).not.toContain('greenTree');
  });

  test('a resumed session runs on the model and effort its first launch recorded, whatever the pipeline says now', async () => {
    await run(['gate', 'add', 'tests', '--', RED_TESTS_LINE]);
    setAgentSettings({ builder: { model: 'fable', effort: 'xhigh' } });
    afterEachLaunchPlan = (request) => {
      if (request.environment[JOB_ID_VARIABLE] === firstBuildJobId()) setAgentSettings({ builder: { model: 'haiku', effort: 'low' } });
    };
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    const jobId = firstBuildJobId();
    const buildLaunches = launchRequests.filter((request) => request.environment[JOB_ID_VARIABLE] === jobId);
    expect(buildLaunches.map((request) => [request.resume, request.model, request.effort])).toEqual([
      [false, 'fable', 'xhigh'],
      [true, 'fable', 'xhigh'],
      [true, 'fable', 'xhigh'],
    ]);
    expect(JSON.parse(readFileSync(join(jobFolderOf(jobId), 'launch-settings.json'), 'utf8'))).toEqual({ version: 1, model: 'fable', effort: 'xhigh' });
    expect(readFileSync(join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json'), 'utf8')).toContain('"haiku"');
  });

  test('a resume whose recorded pair cannot be read launches nothing, and opens system-file-unreadable on the job, naming the file', async () => {
    await run(['gate', 'add', 'tests', '--', RED_TESTS_LINE]);
    afterEachLaunchPlan = (request) => {
      if (request.environment[JOB_ID_VARIABLE] === firstBuildJobId()) writeFileSync(join(jobFolderOf(firstBuildJobId()), 'launch-settings.json'), '{"model": ');
    };
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('system-file-unreadable'), 'the unreadable pair\'s incident');

    const jobId = firstBuildJobId();
    expect(launchRequests.filter((request) => request.environment[JOB_ID_VARIABLE] === jobId)).toHaveLength(1);
    const incident = (storedProgressOf(repositoryDirectory).incidents ?? []).find((opened) => opened.kind === 'system-file-unreadable');
    expect(incident).toMatchObject({ jobId, facts: { file: `jobs/${jobId}/launch-settings.json` } });
    expect(hephaestusLog.join('\n')).toContain(`Job ${jobId} did not launch: its launch reads jobs/${jobId}/launch-settings.json, which cannot be read`);
  });

  test('a launch refused on an unreadable file is not tried again while its incident stands, and a fresh agent ends the job replaced', async () => {
    await run(['gate', 'add', 'tests', '--', RED_TESTS_LINE]);
    afterEachLaunchPlan = (request) => {
      if (request.environment[JOB_ID_VARIABLE] === firstBuildJobId()) writeFileSync(join(jobFolderOf(firstBuildJobId()), 'launch-settings.json'), '{"model": ');
    };
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('system-file-unreadable'), 'the unreadable pair\'s incident');
    for (let i = 0; i < 2; i += 1) {
      drivePass.wake(true);
      await drivePass.idle();
    }

    const jobId = firstBuildJobId();
    expect(hephaestusLog.filter((line) => line.startsWith(`Job ${jobId} did not launch`))).toHaveLength(1);
    const incident = (storedProgressOf(repositoryDirectory).incidents ?? []).find((opened) => opened.kind === 'system-file-unreadable');
    await run(['job', 'fresh', jobId, '--incident', incident?.id ?? '']);
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');
    expect(buildJobEnding()).toMatchObject({ outcome: 'replaced' });
  });

  test('a changed pipeline is gated without a restart, and the row records the build phase and the hash of its gates', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'add', 'types', '--', 'true']);
    const listed = JSON.parse((await run(['gate', 'list', '--json'])).outputText()) as { phaseHashes: { build: string } };
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    expect(buildJobEnding()).toMatchObject({ outcome: 'built' });
    type StoredRow = { ticket: string | null; pipelineHash?: string; greenPhase?: string; greenTree?: string };
    const progress = JSON.parse(readFileSync(localStoreLayoutOf(requireWorkspace(repositoryDirectory)).progressRecordPath, 'utf8')) as { tasks: StoredRow[] };
    expect(progress.tasks.find((task) => task.ticket === '001')).toMatchObject({ pipelineHash: listed.phaseHashes.build, greenPhase: 'build' });
    const gatedTree = loggedEntries('gate-ran').at(-1)?.fields['tree'];
    expect(gatedTree).toEqual(expect.any(String));
    expect(progress.tasks.find((task) => task.ticket === '001')?.greenTree).toBe(gatedTree as string);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'Hatch folder watches', () => {
  test('each launch asks for a watch of the Hatch folder it made, the build job\'s included', async () => {
    await run(['gate', 'none']);
    const watchedHatchFolders: string[] = [];
    const drivePass = createScratchDrivePass({
      platformPorts:        { ...ports, gateConfinement: seatbeltThatApplies() },
      processStarts:        world.processStarts,
      workspace:            requireWorkspace(repositoryDirectory),
      now:                  SPEC_CLOCK,
      talosConnection:      () => world.connectionFor(requireWorkspace(repositoryDirectory).trackerDirectory),
      agentAdapter:         launchCapturingAdapterOf(fakeAgentAdapter(buildingSession())),
      monitorFolder,
      inheritedEnvironment: inheritedEnvironment(),
      mainLine:             RECORDED_FLOW_MAIN_LINE,
      log:                  (line) => hephaestusLog.push(line),
      watchHatchFolder:     (hatchDirectory) => watchedHatchFolders.push(hatchDirectory),
    });
    await passUntil(drivePass, () => loggedEntries('job-launched').some((entry) => entry.fields['kind'] === 'build'), 'the build launch');

    const { rootDirectory } = requireWorkspace(repositoryDirectory);
    const launchedJobIds = loggedEntries('job-launched').map((entry) => String(entry.jobId));
    expect(watchedHatchFolders).toContain(HatchInbox.hatchDirectoryOf(rootDirectory, firstBuildJobId()));
    expect(new Set(watchedHatchFolders)).toEqual(new Set(launchedJobIds.map((jobId) => HatchInbox.hatchDirectoryOf(rootDirectory, jobId))));
    await drivePass.stop();
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a network guard that cannot start', () => {
  const guardOfTheBuilder = (): NetworkDomainGuard | null | undefined => launchRequests
    .find((request) => request.environment[JOB_ID_VARIABLE] === firstBuildJobId())?.profile.networkDomainGuard;
  const builderLaunched = (): boolean => guardOfTheBuilder() !== undefined;
  const unstartableCases: readonly [string, (trackerDirectory: string) => readonly string[], string][] = [
    ['a Hephaestus command with no entry script', () => [process.execPath], 'the entry script is not in Hephaestus\'s command'],
    ['an entry script inside the repository', (trackerDirectory) => [process.execPath, join(trackerDirectory, 'example-entry.ts')], 'lies inside the repository'],
  ];
  test.each(unstartableCases)('with %s launches the builder with no guard path and logs one line naming the job, the ticket and why', async (_name, commandOf, reason) => {
    await run(['gate', 'none']);
    await run(['ticket', 'network', '001', 'registry.example.com']);
    const { trackerDirectory } = requireWorkspace(repositoryDirectory);
    writeFileSync(join(trackerDirectory, 'example-entry.ts'), '');
    const drivePass = createScratchDrivePass({
      platformPorts:        { ...ports, gateConfinement: seatbeltThatApplies() },
      processStarts:        world.processStarts,
      workspace:            requireWorkspace(repositoryDirectory),
      now:                  SPEC_CLOCK,
      talosConnection:      () => world.connectionFor(requireWorkspace(repositoryDirectory).trackerDirectory),
      programCommand:       commandOf(trackerDirectory),
      agentAdapter:         launchCapturingAdapterOf(fakeAgentAdapter(buildingSession())),
      monitorFolder,
      inheritedEnvironment: inheritedEnvironment(),
      mainLine:             RECORDED_FLOW_MAIN_LINE,
      log:                  (line) => hephaestusLog.push(line),
    });
    await passUntil(drivePass, builderLaunched, 'the build launch');

    expect(guardOfTheBuilder()).toMatchObject({ allowedDomains: ['registry.example.com'], programPath: null });
    const guardLines = hephaestusLog.filter((line) => line.startsWith('The network guard of job '));
    expect(guardLines).toEqual([expect.stringContaining(`${firstBuildJobId()} (#001) cannot start`)]);
    expect(guardLines[0]).toContain(reason);
    await drivePass.stop();
  });

  test('a startable guard logs nothing about the guard and runs the runtime with the entry script first', async () => {
    await run(['gate', 'none']);
    await run(['ticket', 'network', '001', 'registry.example.com']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, builderLaunched, 'the build launch');

    expect(guardOfTheBuilder()?.programPath).toBe(process.execPath);
    expect(guardOfTheBuilder()?.arguments.slice(-3)).toEqual(['bash-domains', '--allow', 'registry.example.com']);
    expect(hephaestusLog.filter((line) => line.startsWith('The network guard of job '))).toEqual([]);
    await drivePass.stop();
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'unforced wakes', () => {
  // Steps a pass makes possible by itself change nothing a later observation sees, so only the pass itself can carry them on.
  test('with no install line and the Assistant quiet, unforced wakes carry a readied ticket\'s job from launching to running', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['ticket', 'hold', '001']);
    const drivePass = await drivePassPlaying([{ kind: 'print', line: fakeStartedLine('fake-session') }, { kind: 'await-line' }, { kind: 'await-line' }]);
    const assistantIsQuiet = (): boolean => storedProgressOf(repositoryDirectory).jobs?.some((job) => job.kind === 'assistant' && job.eventCursor.sequence > 0) === true;
    await passUntil(drivePass, assistantIsQuiet, 'the Assistant session starting');
    await run(['ticket', 'unhold', '001']);
    await waitUntil(async () => {
      drivePass.wake();
      await drivePass.idle();
      return buildStates.includes('running');
    }, 'the unforced wakes reaching running');
    expect(buildStates.slice(0, 3)).toEqual(['launching', 'preparing', 'running']);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'operational failures', () => {
  test('an install line that fails opens setup-failed, and the ticket launches nothing while it is open', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'prepare', 'install', '--', 'false']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('setup-failed'), 'the setup-failed incident');
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'setup-failed' });
    await passUntil(drivePass, () => true, 'one more pass');
    expect(storedProgressOf(repositoryDirectory).jobs?.some((job) => job.kind === 'build')).toBe(false);
  });

  const cannotRunEnds = [['exits 127', { exitCode: 127 }], ['exits 126', { exitCode: 126 }]] as const;
  test.each(cannotRunEnds)('a checks process that %s opens gate-cannot-run, never a failed pass', async (_name, cannotRunEnd) => {
    world.scriptLine('example-checks', cannotRunEnd);
    await run(['gate', 'add', 'checks', '--', 'example-checks']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('gate-cannot-run'), 'the gate-cannot-run incident');
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'gate-cannot-run' });
  });

  test('an unavailable answer starts no gate child and opens sandbox-unavailable, naming the step and the reason', async () => {
    const marker = join(monitorFolder, 'gate-ran.txt');
    await run(['gate', 'add', 'checks', '--', `touch '${marker}'`]);
    const drivePass = await drivePassPlaying(buildingSession(), fakeGateConfinement('unavailable', 'confined'));
    await passUntil(drivePass, () => openIncidentKinds().includes('sandbox-unavailable'), 'the sandbox-unavailable incident');
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'sandbox-unavailable' });
    expect(world.linesRun()).not.toContain(`touch '${marker}'`);
    expect(world.launchOf(join(jobFolderOf(firstBuildJobId()), 'gate-1'), 1)).toBeNull();
    expect((storedProgressOf(repositoryDirectory).incidents ?? [])[0]).toMatchObject({ facts: { step: 'gate-1', reason: FAKE_MISSING_TOOLS_REASON } });
    expect(loggedEntries('gate-ran')).toEqual([]);
  });

  test('the pass that records a refused line asks for the pass that opens its incident, since a sweep alone skips an unchanged fingerprint', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession(), fakeGateConfinement('unavailable', 'confined'));
    const refusalFilePresent = () => buildJobEnding() === undefined && existsSync(join(jobFolderOf(firstBuildJobId()), 'sandbox-refusal.json'));
    await passUntil(drivePass, () => refusalFilePresent() || openIncidentKinds().includes('sandbox-unavailable'), 'the refused line');
    expect(openIncidentKinds()).toEqual(['sandbox-unavailable']);
  });

  test('an unavailable answer refuses the install line before any session starts', async () => {
    await run(['gate', 'prepare', 'install', '--', 'true']);
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession(), fakeGateConfinement('unavailable', 'confined'));
    await passUntil(drivePass, () => openIncidentKinds().includes('sandbox-unavailable'), 'the sandbox-unavailable incident');
    expect((storedProgressOf(repositoryDirectory).incidents ?? [])[0]).toMatchObject({ facts: { step: 'install' } });
    expect(world.launchOf(join(jobFolderOf(firstBuildJobId()), 'install'), 1)).toBeNull();
  });

  test('unconfined-by-design runs the line unchanged in the job worktree, and no refusal is logged', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const confinement = fakeGateConfinement('unconfined-by-design');
    const drivePass = await drivePassPlaying(buildingSession(), confinement);
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job\'s end');
    const launch = lineLaunchIn(join(jobFolderOf(firstBuildJobId()), 'gate-1'));
    expect(launch.argv).toEqual([...ports.shellLine.spawnRequestOf('true', join(jobFolderOf(firstBuildJobId()), 'gate-1-line-status')).argv]);
    expect(launch.workingDirectory).toBe(join(requireWorkspace(repositoryDirectory).rootDirectory, WORKTREES_FOLDER, 'ticket-001'));
    expect(openIncidentKinds()).toEqual([]);
    expect(hephaestusLog.filter((line) => line.includes('did not run'))).toEqual([]);
    expect(hephaestusLog.filter((line) => line.includes('unconfined by design')).length).toBeGreaterThan(0);
  });

  test('a planted confined adapter wraps the line a gate runs', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession(), fakeGateConfinement('confined'));
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job\'s end');
    expect(lineLaunchIn(join(jobFolderOf(firstBuildJobId()), 'gate-1')).argv.slice(0, FAKE_CONFINER_ARGV.length)).toEqual([...FAKE_CONFINER_ARGV]);
  });

  test('a report saying blocked opens blocked', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession('tree changed', builderReport({ outcome: 'blocked', blockedReason: 'The example service is down' })));
    await passUntil(drivePass, () => openIncidentKinds().includes('blocked'), 'the blocked incident');
    expect(buildJobEnding()).toMatchObject({ outcome: 'blocked' });
  });

  test('no checks line opens checks-not-set and launches nothing', async () => {
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => (storedProgressOf(repositoryDirectory).decisions ?? []).some((decision) => decision.kind === 'checks-not-set'), 'the checks-not-set decision');
    await passUntil(drivePass, () => true, 'one more pass');
    expect(loggedEntries('job-launched').filter((entry) => entry.fields['kind'] === 'build')).toEqual([]);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'failed passes', () => {
  test('an attribution trailer fails the pass with cause attribution and shows the attribution-found notice', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession('tree changed with trailer'));
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');
    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'attribution' });
    expect(drivePass.state().notices).toContainEqual({ kind: 'attribution-found', ticketId: '001' });
  });

  test('a session that Customs ends in the hold that verified it gets its input closed, and its child ends', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession('tree changed with trailer'));
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');
    expect(buildStates.slice(-2)).toEqual(['in-customs', 'ended']);
    const sessionFolder = jobFolderOf(firstBuildJobId());
    await waitUntil(() => childReadings().livenessOf(sessionFolder, 1).verdict === 'ended', () => `the ended job's child ending:\n${hephaestusLog.join('\n')}`);
    const entries = childReadings().eventsAfter(sessionFolder, 1, 0) as readonly { origin: string; line: string }[];
    const clientLines = entries.filter((entry) => entry.origin === 'client');
    expect(clientLines.map((entry) => entry.line)).toContain(JSON.stringify({ act: 'close' }));
  });

  test('a commit changing .claude/ fails the pass on V13, opens branch-touches-agent-config and launches no review while it is open', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      commitInTicketWorktree('agent config changed'),
      { kind: 'print', line: builderReport() },
      { kind: 'await-line' },
    ]);
    const agentConfigDecisionIsOpen = (): boolean => (storedProgressOf(repositoryDirectory).decisions ?? [])
      .some((decision) => decision.kind === 'branch-touches-agent-config' && decision.ticketIds.includes('001'));
    // The worktree observation can open the decision a pass before the session's report ends the job.
    await passUntil(drivePass, () => agentConfigDecisionIsOpen() && buildJobEnding() !== undefined, 'the branch-touches-agent-config decision and the ending');
    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'branch-touches-agent-config' });
    await passUntil(drivePass, () => true, 'one more pass');
    expect(loggedEntries('job-launched').filter((entry) => entry.fields['kind'] !== 'build' && entry.fields['kind'] !== 'assistant')).toEqual([]);
    expect(agentConfigDecisionIsOpen()).toBe(true);
  });

  test('a session ending without a report ends failed with cause no-report', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying([{ kind: 'print', line: fakeStartedLine('fake-session') }, { kind: 'exit', code: 0 }]);
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');
    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'no-report' });
  });

  test('at the call budget the wind-down message is sent, and past the grace calls the job stops and out-of-calls opens', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const turnLine = (index: number): FakeAgentStep => ({ kind: 'print', line: fakeAssistantTurnLine(`message-${index}`) });
    const turns = (from: number, count: number): FakeAgentStep[] => Array.from({ length: count }, (_unused, i) => turnLine(from + i));
    const budget = DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET;
    const drivePass = await drivePassPlaying([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'await-line' },
      ...turns(0, budget),
      { kind: 'await-line' },
      ...turns(budget, WIND_DOWN_GRACE_CALLS),
      { kind: 'await-line' },
    ]);
    await passUntil(drivePass, () => openIncidentKinds().includes('out-of-calls'), 'the out-of-calls incident');
    const events = readFileSync(childFilesIn(jobFolderOf(firstBuildJobId()), 1).eventLogPath, 'utf8');
    expect(events).toContain('Example wind-down message');
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the stopped job ending');
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'out-of-calls' });
  });
});
