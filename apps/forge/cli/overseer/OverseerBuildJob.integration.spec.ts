/**
 * A build job end to end on the real system: the board's Talos started from its binary, the fake agent child and real gate processes under
 * the real sandbox. Git plays the recorded flow stages of `src/testing/RecordedGitFlow.ts`, here and, through `src/testing/RecordedGitProgram.ts`,
 * in each process Talos starts: the session's own commit moves the flow on for every process. What matters: the whole chain from the worktree
 * to the review job runs once on real processes, each line launched bounded and ended; a gate killed by a signal or exiting 126 or 127 opens
 * gate-cannot-run; a worktree git refuses, or one dirty straight after checkout, opens setup-failed; and a merge gate runs in the Overseer's
 * narrowed environment. `cli/overseer/OverseerBuildJob.spec.ts` holds the job's code behind the recorded Talos stages.
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
  describe,
  expect,
  test
} from 'bun:test';

import type { AgentAdapter }                                                      from '../../src/lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchRequest }                                                from '../../src/lib/agent-launch/AgentLaunchRequest.ts';
import { SANDBOX_EXEC_PATH }                                                      from '../../src/lib/gate-confinement/DarwinSeatbelt.ts';
import type { GateConfinement }                                                   from '../../src/lib/gate-confinement/GateConfinement.ts';
import type { ChildLaunch }                                                       from '../../src/lib/talos/ChildLaunch.ts';
import type { Job, JobState }                                                     from '../../src/lib/tracker-model/@types/Job.ts';
import type { AgentStepSettings, PipelineReview }                                 from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { Board }                                                             from '../../src/lib/tracker-model/Board.ts';
import type { BoardChildren }                                                     from '../../src/services/overseer/BoardChildren.ts';
import type { DrivePass }                                                         from '../../src/services/overseer/DrivePass.ts';
import { jobFolderIn }                                                            from '../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace }                                                       from '../../src/services/tracker/Workspace.ts';
import { JOB_ID_VARIABLE }                                                        from '../../src/shared/Environment.ts';
import { LINE_TIME_BOUND_MILLISECONDS }                                           from '../../src/shared/constants/OverseerLimits.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                from '../../src/testing/ChildProcessCaseTimeout.ts';
import { createScratchDrivePass, type ScratchBoardTalos, startScratchBoardTalos } from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  FAKE_HEAD_PLACEHOLDER,
  fakeAgentAdapter,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { inheritedEnvironment }      from '../../src/testing/InheritedEnvironment.ts';
import { nativePlatformPorts }       from '../../src/testing/NativePlatformPorts.ts';
import { stopProcessesReachingInto } from '../../src/testing/ProcessesInFolder.ts';
import { useRecordedGit }            from '../../src/testing/RecordedGit.ts';
import {
  RECORDED_FLOW_MAIN_LINE,
  RECORDED_FLOW_PLACEHOLDERS,
  RECORDED_FLOW_SESSION_COMMIT,
  RECORDED_FLOW_SESSION_FILE,
  RECORDED_FLOW_TICKET_BRANCH,
  RECORDED_FLOW_UNNORMALISED_FILE
} from '../../src/testing/RecordedGitFlow.ts';
import {
  portsResolvingTheRecordedGit,
  type SharedRecordedGitFlow,
  shareRecordedGitFlow,
  withRecordedGitFirstOnPath
} from '../../src/testing/RecordedGitProgram.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                         from '../../src/testing/TalosChildReadings.ts';
import { waitUntil }                                      from '../../src/testing/WaitUntil.ts';
import { runCommandLine }                                 from '../Main.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }         from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                                from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                from '../testing/StoredLogText.ts';
import { storedProgressOf }                               from '../testing/StoredProgress.ts';
import { OverseerWording }                                from './OverseerWording.ts';

const recordedGit = useRecordedGit();
const nativePorts = nativePlatformPorts();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const WORKTREES_FOLDER = '.forge-worktrees';

let ports = nativePorts;
let recordedFlow: SharedRecordedGitFlow | null = null;
let repositoryDirectory = '';
let monitorFolder = '';
let overseerLog: string[] = [];
let buildStates: string[] = [];
let afterEachHoldPhase: (board: Board) => void = () => undefined;
let launchRequests: AgentLaunchRequest[] = [];
let jobsNotingStateAssignments = new WeakSet<object>();
let boardTalos: ScratchBoardTalos | null = null;

/** The board's Talos, started at the case's first DrivePass as the Overseer's start starts it. */
async function boardTalosOfTheCase(): Promise<ScratchBoardTalos> {
  boardTalos ??= await startScratchBoardTalos({
    workspace: requireWorkspace(repositoryDirectory), platformPorts: ports, monitorFolder, log: (line) => overseerLog.push(line)
  });
  return boardTalos;
}

/** The children as the Overseer reads them, through Talos's adapter over the case's platform ports. */
function childReadings(): BoardChildren {
  return talosChildReadingsWith(ports, requireWorkspace(repositoryDirectory).trackerDirectory);
}

function requireRecordedFlow(): SharedRecordedGitFlow {
  if (recordedFlow === null) throw new Error('the case shares no recorded git flow');
  return recordedFlow;
}

async function run(commandLineArguments: readonly string[]) {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
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
  afterEachHoldPhase(board);
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

/** A reviewer only waits, so it never commits on the commit the builder made. */
function launchCapturingAdapterOf(adapter: AgentAdapter): AgentAdapter {
  return {
    ...adapter,
    planOf: (request) => {
      launchRequests.push(request);
      const isReviewer = (request.reportSchema as { title?: string } | null)?.title === 'reviewer report';
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

async function drivePassPlaying(
  steps: readonly FakeAgentStep[],
  gateConfinement: GateConfinement = ports.gateConfinement,
  overseerEnvironment: Readonly<Record<string, string>> = inheritedEnvironment(),
): Promise<DrivePass> {
  const workspace = requireWorkspace(repositoryDirectory);
  return createScratchDrivePass({
    platformPorts:        { ...ports, gateConfinement },
    workspace,
    now:                  SPEC_CLOCK,
    talosConnection:      (await boardTalosOfTheCase()).connection,
    agentAdapter:         launchCapturingAdapterOf(fakeAgentAdapter(steps)),
    monitorFolder,
    inheritedEnvironment: withRecordedGitFirstOnPath(overseerEnvironment, requireRecordedFlow()),
    mainLine:             RECORDED_FLOW_MAIN_LINE,
    decisionWordingOf:    (draft) => OverseerWording.decisionWordingOf(draft, fakeAgentAdapter().credentials),
    redHandoffMessageOf:  OverseerWording.redHandoffMessageOf,
    log:                  (line) => overseerLog.push(line),
    afterHoldPhase:       recordBuildStateChanges,
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
    return `${what} (states ${buildStates.join(' > ')}, ending ${JSON.stringify(buildJobEnding())}):\n${overseerLog.join('\n')}\n${gateLog}`;
  });
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

const shellQuoted = (argument: string): string => `'${argument}'`;

/** The session file written and committed by the recorded git's session commit, in the ticket worktree only. */
const COMMIT_IN_TICKET_WORKTREE = [
  `case "$PWD" in */ticket-*) printf '${RECORDED_FLOW_SESSION_FILE.text.replace('\n', '\\n')}' > ${RECORDED_FLOW_SESSION_FILE.path}`,
  ...RECORDED_FLOW_SESSION_COMMIT.map((call) => `git ${call.gitArguments.map(shellQuoted).join(' ')}`),
].join(' && ').concat(';; esac');

/**
 * Commits a file, reports, then waits for its input to close, as a builder whose session the Overseer ends after the report. Only in a
 * ticket's worktree: the Assistant session plays the same steps in the main checkout, where a commit would move the target, which V14
 * fails as a foreign ref.
 */
function buildingSession(report = builderReport()): FakeAgentStep[] {
  return [
    { kind: 'print', line: fakeStartedLine('fake-session') },
    { kind: 'shell', command: COMMIT_IN_TICKET_WORKTREE },
    { kind: 'print', line: report },
    { kind: 'await-line' },
  ];
}

/** The launch sent to Talos for the line folder's first instance. */
function lineLaunchIn(lineFolder: string): ChildLaunch {
  const launch = boardTalos?.launchOf(lineFolder, 1) ?? null;
  if (launch === null) throw new Error(`no line was launched in ${lineFolder}`);
  return launch;
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('build-job', ['--project', 'Example Agency'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  recordedFlow = shareRecordedGitFlow(recordedGit);
  ports = portsResolvingTheRecordedGit(nativePorts, recordedFlow);
  monitorFolder = createScratchDirectory('h');
  overseerLog = [];
  buildStates = [];
  afterEachHoldPhase = () => undefined;
  launchRequests = [];
  jobsNotingStateAssignments = new WeakSet<object>();
  await run(['oversee', 'resume']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

afterEach(async () => {
  // Talos and every child it ran work in the repository, so stopping what reaches into it ends them all.
  boardTalos = null;
  await stopProcessesReachingInto(repositoryDirectory);
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
  const flowOfTheCase = requireRecordedFlow();
  recordedFlow = null;
  flowOfTheCase.requireEveryCallAnswered();
});

describe('a build job end to end, on the real Talos', () => {
  test('prepares, installs, launches, verifies, gates, writes the Handoff, finishes the ticket and gets a review job launched', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'assistant', 'on']);
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
    const sandboxApplies = ports.gateConfinement.availability().verdict === 'confined';
    for (const [folder, networkDenied] of [['install', false], ['gate-prepare', false], ['gate-1', true]] as const) {
      const launch = lineLaunchIn(join(jobFolder, folder));
      expect(launch.kind).toBe('line');
      expect(launch.timeBoundMilliseconds).toBe(LINE_TIME_BOUND_MILLISECONDS);
      expect(childReadings().livenessOf(join(jobFolder, folder), 1)).toMatchObject({ verdict: 'ended', end: { reason: 'exited', exitCode: 0 } });
      expect(launch.argv[0] === SANDBOX_EXEC_PATH).toBe(sandboxApplies);
      expect(readFileSync(join(jobFolder, folder, 'process-sandbox.sb'), 'utf8').includes('(deny network-outbound')).toBe(networkDenied);
    }
    await waitUntil(() => childReadings().livenessOf(jobFolder, 1).verdict === 'ended', 'the build session ending');
    expect(childReadings().livenessOf(jobFolder, 1)).toMatchObject({ verdict: 'ended', end: { reason: 'exited', exitCode: 0 } });
    expect(loggedEntries('gate-ran').map((entry) => entry.fields)).toEqual([expect.objectContaining({ outcome: 'passed', cached: false })]);
    expect(existsSync(join(requireWorkspace(repositoryDirectory).trackerDirectory, 'gates'))).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('a merge gate on the real Talos', () => {
  test('a merge gate runs in the narrowed environment of the Overseer: LANG is the Overseer\'s, a planted API key stays behind, and core.longpaths rides along', async () => {
    const longPathsSetting = 'test "${GIT_CONFIG_KEY_0-}" = core.longpaths && test "${GIT_CONFIG_VALUE_0-}" = true';
    await run(['gate', 'add', 'checks', '--', `test "$LANG" = example-narrowed && test -z "\${ANTHROPIC_API_KEY-}" && ${longPathsSetting}`]);
    await run(['gate', 'assistant', 'on']);
    const overseerEnvironment = { ...inheritedEnvironment(), LANG: 'example-narrowed', ANTHROPIC_API_KEY: 'planted' };
    afterEachHoldPhase = (board) => {
      if (!board.logRecordsSoFar().some((record) => record.kind === 'merge-queued')) return;
      afterEachHoldPhase = () => undefined;
      // The main line moves, so the merged tree is one no build gate judged.
      recordedGit.enterFlowStage('main moved', repositoryDirectory);
    };
    const drivePass = await drivePassPlaying(buildingSession(), ports.gateConfinement, overseerEnvironment);
    await passUntil(drivePass, () => loggedEntries('job-ended').some((entry) => entry.fields['outcome'] === 'landed'), 'the landing');

    expect(new Set(loggedEntries('gate-ran').map((entry) => entry.fields['tree'])).size).toBe(2);
    expect(openIncidentKinds()).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('operational failures on the real Talos', () => {
  // Each line passes where `checks` tries it, in the main checkout, and cannot run only on the built tree.
  const cannotRunLines = [['exits 127', 'exit 127'], ['exits 126', 'exit 126'], ['is killed by a signal', 'kill -9 $$']];
  test.each(cannotRunLines)('a checks process that %s opens gate-cannot-run, never a failed pass', async (_name, cannotRun) => {
    await run(['gate', 'add', 'checks', '--', `test ! -f built.txt || ${cannotRun}`]);
    await run(['gate', 'assistant', 'on']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('gate-cannot-run'), 'the gate-cannot-run incident');
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'gate-cannot-run' });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a worktree that cannot be created opens setup-failed', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'assistant', 'on']);
    // The branch is checked out elsewhere already, so `git worktree add` refuses it.
    recordedGit.enterFlowStage('ticket branch checked out elsewhere', repositoryDirectory);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('setup-failed'), 'the setup-failed incident');
    expect((storedProgressOf(repositoryDirectory).incidents ?? [])[0]).toMatchObject({ facts: { step: 'worktree' } });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  // A CRLF blob under a `text` attribute checks out converted, so the fresh tree already differs from its commit and every gate would fail on it.
  test('a worktree dirty straight after checkout opens one setup-failed naming normalisation, and runs no install line or gate', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'assistant', 'on']);
    recordedGit.enterFlowStage('line endings normalised', repositoryDirectory);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('setup-failed'), 'the setup-failed incident');
    const incidents = storedProgressOf(repositoryDirectory).incidents ?? [];
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ facts: { step: 'worktree', cause: 'line-ending-normalisation' } });
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'setup-failed' });
    expect(readFileSync(join(jobFolderOf(firstBuildJobId()), 'worktree-unnormalised.txt'), 'utf8')).toBe(`${RECORDED_FLOW_UNNORMALISED_FILE.path}\n`);
    expect(existsSync(join(jobFolderOf(firstBuildJobId()), 'install'))).toBe(false);
    expect(loggedEntries('gate-ran')).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
