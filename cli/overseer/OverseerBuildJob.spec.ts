/**
 * A build job's code on a scratch tracker behind the Watcher boundary: `src/testing/FakeWatcherWorld.ts` plays the session and scripts each gate
 * line, so no Watcher, agent or gate process starts. What matters: each step is a job state, from the worktree made off the target tip and the
 * install line, through the closing report, verification and a gate, to the Handoff code writes, the finished ticket and the review job the
 * policy launches; and each operational failure opens its own incident or decision rather than a failed pass, while a missing report or an
 * attribution trailer is a failed pass with its cause. `cli/overseer/OverseerBuildJob.integration.spec.ts` holds the real-system claims.
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

import type { AgentAdapter }                                                     from '../../src/lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchRequest }                                               from '../../src/lib/agent-launch/AgentLaunchRequest.ts';
import { SANDBOX_EXEC_PATH }                                                     from '../../src/lib/gate-confinement/DarwinSeatbelt.ts';
import type { GateConfinement }                                                  from '../../src/lib/gate-confinement/GateConfinement.ts';
import type { Job, JobState }                                                    from '../../src/lib/tracker-model/@types/Job.ts';
import type { PipelineReview }                                                   from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { Board }                                                            from '../../src/lib/tracker-model/Board.ts';
import { watcherFilesOf }                                                        from '../../src/lib/watcher/WatcherFiles.ts';
import type { WatcherLaunch }                                                    from '../../src/lib/watcher/WatcherLaunch.ts';
import type { DrivePass }                                                        from '../../src/services/overseer/DrivePass.ts';
import { WatcherFleet }                                                          from '../../src/services/overseer/WatcherFleet.ts';
import { requireWorkspace }                                                      from '../../src/services/tracker/Workspace.ts';
import { JOB_ID_VARIABLE }                                                       from '../../src/shared/Environment.ts';
import { DISPATCH_PROTOCOL }                                                     from '../../src/shared/constants/DispatchProtocol.ts';
import { WIND_DOWN_GRACE_CALLS }                                                 from '../../src/shared/constants/OverseerLimits.ts';
import { createScratchDrivePass, FAKE_WATCHER_BUNDLE_PATH, seatbeltThatApplies } from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  FAKE_HEAD_PLACEHOLDER,
  fakeAgentAdapter,
  fakeAssistantTurnLine,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { FAKE_CONFINER_ARGV, FAKE_MISSING_TOOLS_REASON, fakeGateConfinement } from '../../src/testing/FakeGateConfinement.ts';
import { useFakeGit }                                                         from '../../src/testing/FakeGit.ts';
import { createFakeWatcherWorld, type FakeWatcherWorld }                      from '../../src/testing/FakeWatcherWorld.ts';
import { inheritedEnvironment }                                               from '../../src/testing/InheritedEnvironment.ts';
import { nativePlatformPorts }                                                from '../../src/testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }                     from '../../src/testing/ScratchWorkspace.ts';
import { waitUntil }                                                          from '../../src/testing/WaitUntil.ts';
import { runCommandLine }                                                     from '../Main.ts';
import { createCapturedCommandContext }                                       from '../testing/CapturedCommandContext.ts';
import { createInitializedFakeGitRepository }                                 from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                                                    from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                                    from '../testing/StoredLogText.ts';
import { storedProgressOf }                                                   from '../testing/StoredProgress.ts';
import { OverseerWording }                                                    from './OverseerWording.ts';

const fakeGit = useFakeGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const WORKTREES_FOLDER = '.agent-progress-v2-worktrees';
const RED_TESTS_LINE = 'echo expected 2, received 3; exit 1';

let world: FakeWatcherWorld;
let ports: FakeWatcherWorld['ports'];
let repositoryDirectory = '';
let monitorFolder = '';
let overseerLog: string[] = [];
let buildStates: string[] = [];
let launchRequests: AgentLaunchRequest[] = [];
let jobsNotingStateAssignments = new WeakSet<object>();
let mainTipAtStart = '';

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

/** A reviewer only waits: played at once, it would end before a spec reads its launch. */
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
function setReviewPhase(review: Readonly<PipelineReview>): void {
  const pipelinePath = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json');
  const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')) as Record<string, unknown>;
  writeFileSync(pipelinePath, `${JSON.stringify({ ...pipeline, review }, null, 2)}\n`);
}

function drivePassPlaying(steps: readonly FakeAgentStep[], gateConfinement: GateConfinement = seatbeltThatApplies()): Promise<DrivePass> {
  return Promise.resolve(createScratchDrivePass({
    platformPorts:        { ...ports, gateConfinement },
    processStarts:        world.processStarts,
    workspace:            requireWorkspace(repositoryDirectory),
    now:                  SPEC_CLOCK,
    watcherBundlePath:    FAKE_WATCHER_BUNDLE_PATH,
    agentAdapter:         launchCapturingAdapterOf(fakeAgentAdapter(steps)),
    monitorFolder,
    inheritedEnvironment: inheritedEnvironment(),
    mainLine:             fakeGit.checkedOutBranchOf(repositoryDirectory),
    decisionWordingOf:    OverseerWording.decisionWordingOf,
    redHandoffMessageOf:  OverseerWording.redHandoffMessageOf,
    log:                  (line) => overseerLog.push(line),
    afterHoldPhase:       recordBuildStateChanges,
  }));
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
  return WatcherFleet.jobFolderOf(requireWorkspace(repositoryDirectory).trackerDirectory, jobId);
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

/** In the ticket worktree only: the Assistant session plays the same steps in the main checkout, where a commit would move the target. */
function commitInTicketWorktree(stagedPath: string, text: string, commitMessage: string): FakeAgentStep {
  const command = `commit ${stagedPath}: ${commitMessage}`;
  world.scriptShell(command, (workingDirectory) => {
    if (workingDirectory.includes('/ticket-')) fakeGit.commitInSession(workingDirectory, stagedPath, text, commitMessage);
  });
  return { kind: 'shell', command };
}

/** Commits a file, reports, then waits for its input to close, as a builder whose session the Overseer ends after the report. */
function buildingSession(commitMessage = 'Build the example', report = builderReport()): FakeAgentStep[] {
  return [
    { kind: 'print', line: fakeStartedLine('fake-session') },
    commitInTicketWorktree('built.txt', 'built\n', commitMessage),
    { kind: 'print', line: report },
    { kind: 'await-line' },
  ];
}

function watcherLaunchIn(watcherFolder: string): WatcherLaunch {
  return JSON.parse(readFileSync(watcherFilesOf(watcherFolder, 1).launchPath, 'utf8')) as WatcherLaunch;
}

beforeEach(async () => {
  world = createFakeWatcherWorld(nativePlatformPorts());
  ({ ports } = world);
  world.scriptLine(RED_TESTS_LINE, { exitCode: 1, output: 'expected 2, received 3\n' });
  repositoryDirectory = await createInitializedFakeGitRepository('build-job', ['--project', 'Example Agency'], SPEC_CLOCK, fakeGit);
  monitorFolder = createScratchDirectory('h');
  overseerLog = [];
  buildStates = [];
  launchRequests = [];
  jobsNotingStateAssignments = new WeakSet<object>();
  mainTipAtStart = fakeGit.commitOf(repositoryDirectory);
  await run(['oversee', 'resume']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

afterEach(() => {
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

describe('a build job end to end', () => {
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

  test('prepares, installs, launches, verifies, gates, writes the Handoff, finishes the ticket and gets a review job launched', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'prepare', 'install', '--', 'true']);
    setReviewPhase({ name: 'Security pass', model: 'sonnet', effort: 'high' });
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

    const worktree = join(repositoryDirectory, WORKTREES_FOLDER, 'ticket-001');
    expect(fakeGit.commitOf(worktree, 'HEAD~1')).toBe(mainTipAtStart);
    const jobFolder = jobFolderOf(firstBuildJobId());
    for (const [folder, networkDenied] of [['install', false], ['gate-prepare', false], ['gate-1', true]] as const) {
      const launch = watcherLaunchIn(join(jobFolder, folder));
      expect(launch.kind).toBe('process');
      expect(launch.argv[0]).toBe(SANDBOX_EXEC_PATH);
      expect(readFileSync(join(jobFolder, folder, 'process-sandbox.sb'), 'utf8').includes('(deny network-outbound')).toBe(networkDenied);
    }
    expect(WatcherFleet.livenessOf(ports, jobFolder, 1)).toMatchObject({ verdict: 'ended', end: { reason: 'exited', exitCode: 0 } });
    const endedWatcherProcessIds = [jobFolder, ...['install', 'gate-prepare', 'gate-1'].map((folder) => join(jobFolder, folder))]
      .map((watcherFolder) => WatcherFleet.watcherRecordOf(watcherFolder, 1)?.watcher?.processId ?? null);
    expect(endedWatcherProcessIds).not.toContain(null);
    const everyWatcherIsGone = (): boolean => endedWatcherProcessIds.every((processId) => processId === null || ports.processSupervision.processIsGone(processId));
    await passUntil(drivePass, everyWatcherIsGone, 'the ended Watchers reaped');
    expect(loggedEntries('gate-ran').map((entry) => entry.fields)).toEqual([expect.objectContaining({ outcome: 'passed', cached: false })]);
    expect(existsSync(join(requireWorkspace(repositoryDirectory).trackerDirectory, 'gates'))).toBe(false);
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
    const staleClaims = [{ name: 'checks', commit: FAKE_HEAD_PLACEHOLDER }, { name: 'types', commit: mainTipAtStart }];
    const drivePass = await drivePassPlaying(buildingSession('Build the example', builderReport({ gates: staleClaims })));
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'red-resumes-spent' });
    expect(readFileSync(join(jobFolderOf(firstBuildJobId()), 'gate-failure.md'), 'utf8')).toContain('V15');
    expect(buildStates).not.toContain('gating');
    expect(loggedEntries('gate-ran')).toEqual([]);
    expect(existsSync(join(jobFolderOf(firstBuildJobId()), 'gate-1'))).toBe(false);
  });

  test('a red gate resumes the builder\'s own session by its id twice, told of the Baton pass, and the third red parks the ticket for User', async () => {
    await run(['gate', 'add', 'tests', '--', 'echo expected 2, received 3; exit 1']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    const jobId = firstBuildJobId();
    const jobFolder = jobFolderOf(jobId);
    // The same job's next Watcher instances are its resumes: the adapter resumes a job's own session id (ClaudeCodeAdapter.spec.ts).
    expect([1, 2, 3, 4].map((instance) => existsSync(watcherFilesOf(jobFolder, instance).launchPath))).toEqual([true, true, true, false]);
    expect(loggedEntries('job-launched').filter((entry) => entry.fields['kind'] === 'build')).toHaveLength(1);
    expect(loggedEntries('job-resumed').map((entry) => entry.fields['cause'])).toEqual(['handoff-red', 'handoff-red']);
    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'red-resumes-spent' });
    expect(ticketText()).toContain('parked:red-resumes-spent');
    expect(readFileSync(join(jobFolder, 'red-handoff.json'), 'utf8')).toContain('"resume": 3');
  });

  test('a changed pipeline is gated without a restart, and the row records the hash of the pipeline it was judged by', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await run(['gate', 'add', 'types', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');

    expect(buildJobEnding()).toMatchObject({ outcome: 'built' });
    const listed = JSON.parse((await run(['gate', 'list', '--json'])).outputText()) as { pipelineHash: string };
    const progress = JSON.parse(readFileSync(requireWorkspace(repositoryDirectory).progressFilePath, 'utf8')) as { tasks: { ticket: string | null; pipelineHash?: string }[] };
    expect(progress.tasks.find((task) => task.ticket === '001')?.pipelineHash).toBe(listed.pipelineHash);
  });
});

describe('unforced wakes', () => {
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

describe('operational failures', () => {
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
    expect(existsSync(watcherFilesOf(join(jobFolderOf(firstBuildJobId()), 'gate-1'), 1).launchPath)).toBe(false);
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
    expect(existsSync(watcherFilesOf(join(jobFolderOf(firstBuildJobId()), 'install'), 1).launchPath)).toBe(false);
  });

  test('unconfined-by-design runs the line unchanged in the job worktree, and no refusal is logged', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const confinement = fakeGateConfinement('unconfined-by-design');
    const drivePass = await drivePassPlaying(buildingSession(), confinement);
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job\'s end');
    const launch = watcherLaunchIn(join(jobFolderOf(firstBuildJobId()), 'gate-1'));
    expect(launch.argv).toEqual([...ports.shellLine.spawnRequestOf('true', join(jobFolderOf(firstBuildJobId()), 'gate-1-line-status')).argv]);
    expect(launch.workingDirectory).toBe(join(requireWorkspace(repositoryDirectory).rootDirectory, WORKTREES_FOLDER, 'ticket-001'));
    expect(openIncidentKinds()).toEqual([]);
    expect(overseerLog.filter((line) => line.includes('did not run'))).toEqual([]);
    expect(overseerLog.filter((line) => line.includes('unconfined by design')).length).toBeGreaterThan(0);
  });

  test('a planted confined adapter wraps the line a gate Watcher runs', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession(), fakeGateConfinement('confined'));
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job\'s end');
    expect(watcherLaunchIn(join(jobFolderOf(firstBuildJobId()), 'gate-1')).argv.slice(0, FAKE_CONFINER_ARGV.length)).toEqual([...FAKE_CONFINER_ARGV]);
  });

  test('a report saying blocked opens blocked', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession('Build the example', builderReport({ outcome: 'blocked', blockedReason: 'The example service is down' })));
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

describe('failed passes', () => {
  test('an attribution trailer fails the pass with cause attribution and shows the attribution-found notice', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying(buildingSession('Build the example\n\nCo-Authored-By: Claude <noreply@example.com>'));
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');
    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'attribution' });
    expect(drivePass.state().notices).toContainEqual({ kind: 'attribution-found', ticketId: '001' });
  });

  test('a commit changing .claude/ fails the pass on V13, opens branch-touches-agent-config and launches no review while it is open', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    const drivePass = await drivePassPlaying([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      commitInTicketWorktree('.claude/settings.json', '{}\n', 'Build the example'),
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
    const events = readFileSync(watcherFilesOf(jobFolderOf(firstBuildJobId()), 1).eventLogPath, 'utf8');
    expect(events).toContain('Example wind-down message');
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the stopped job ending');
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'out-of-calls' });
  });
});
