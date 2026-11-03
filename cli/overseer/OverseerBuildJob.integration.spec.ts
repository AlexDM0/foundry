/**
 * A build job end to end on the real system: the pinned Watcher bundle, the fake agent child and real gate processes under the real sandbox.
 * What matters: the whole chain from the worktree to the review job runs once on real processes and the ended Watchers are reaped; a merge gate
 * runs in the Overseer's narrowed environment; a gate killed by a signal or exiting 126 or 127 opens gate-cannot-run; and a worktree git refuses
 * opens setup-failed. `cli/overseer/OverseerBuildJob.spec.ts` holds the job's code behind the fake Watcher world.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
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

import type { AgentAdapter }                                  from '../../src/lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchRequest }                            from '../../src/lib/agent-launch/AgentLaunchRequest.ts';
import { SANDBOX_EXEC_PATH }                                  from '../../src/lib/gate-confinement/DarwinSeatbelt.ts';
import type { GateConfinement }                               from '../../src/lib/gate-confinement/GateConfinement.ts';
import { processIsGone }                                      from '../../src/lib/process-identity/ProcessIdentity.ts';
import type { Job, JobState }                                 from '../../src/lib/tracker-model/@types/Job.ts';
import type { PipelineReview }                                from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { Board }                                         from '../../src/lib/tracker-model/Board.ts';
import { watcherFilesOf }                                     from '../../src/lib/watcher/WatcherFiles.ts';
import type { WatcherLaunch }                                 from '../../src/lib/watcher/WatcherLaunch.ts';
import type { WatcherRecord }                                 from '../../src/lib/watcher/WatcherRecord.ts';
import type { DrivePass }                                     from '../../src/services/overseer/DrivePass.ts';
import { WatcherFleet }                                       from '../../src/services/overseer/WatcherFleet.ts';
import { requireWorkspace }                                   from '../../src/services/tracker/Workspace.ts';
import { JOB_ID_VARIABLE }                                    from '../../src/shared/Environment.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }            from '../../src/testing/ChildProcessCaseTimeout.ts';
import { createScratchDrivePass, pinnedScratchWatcherBundle } from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  FAKE_HEAD_PLACEHOLDER,
  fakeAgentAdapter,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { inheritedEnvironment } from '../../src/testing/InheritedEnvironment.ts';
import { nativePlatformPorts }  from '../../src/testing/NativePlatformPorts.ts';
import {
  commitFile,
  createScratchDirectory,
  currentBranchOf,
  removeScratchDirectory
} from '../../src/testing/ScratchWorkspace.ts';
import { waitUntil }                          from '../../src/testing/WaitUntil.ts';
import { runCommandLine }                     from '../Main.ts';
import { createCapturedCommandContext }       from '../testing/CapturedCommandContext.ts';
import { createInitializedScratchRepository } from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                    from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                    from '../testing/StoredLogText.ts';
import { storedProgressOf }                   from '../testing/StoredProgress.ts';
import { OverseerWording }                    from './OverseerWording.ts';

const ports = nativePlatformPorts();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const WORKTREES_FOLDER = '.agent-progress-v2-worktrees';
const COMMIT = 'git -c user.name="Alex Example" -c user.email=alex@example.com -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q';

let repositoryDirectory = '';
let monitorFolder = '';
let overseerLog: string[] = [];
let buildStates: string[] = [];
let afterEachHoldPhase: (board: Board) => void = () => undefined;
let launchRequests: AgentLaunchRequest[] = [];
let jobsNotingStateAssignments = new WeakSet<object>();
let mainTipAtStart = '';

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

function launchCapturingAdapterOf(adapter: AgentAdapter): AgentAdapter {
  return {
    ...adapter,
    planOf: (request) => {
      launchRequests.push(request);
      return adapter.planOf(request);
    },
  };
}

/** No verb sets the review phase: `pipeline.json` is edited by hand, as User would. */
function setReviewPhase(review: Readonly<PipelineReview>): void {
  const pipelinePath = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json');
  const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')) as Record<string, unknown>;
  writeFileSync(pipelinePath, `${JSON.stringify({ ...pipeline, review }, null, 2)}\n`);
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
    watcherBundlePath:    await pinnedScratchWatcherBundle(workspace),
    agentAdapter:         launchCapturingAdapterOf(fakeAgentAdapter(steps)),
    monitorFolder,
    inheritedEnvironment: overseerEnvironment,
    mainLine:             currentBranchOf(repositoryDirectory),
    decisionWordingOf:    OverseerWording.decisionWordingOf,
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

/** In the ticket worktree only; the commit retries while an Overseer `git status` holds the worktree's index lock, as a live session would. */
function commitInTicketWorktree(changeCommand: string, stagedPath: string, commitMessage: string): string {
  const commitOnce = `git add ${stagedPath} && ${COMMIT} -m '${commitMessage}'`;
  return `case "$PWD" in */ticket-*) ${changeCommand} && for attempt in $(seq 50); do ${commitOnce} && break; sleep 0.1; done;; esac`;
}

/**
 * Commits a file, reports, then waits for its input to close, as a builder whose session the Overseer ends after the report. Only in a
 * ticket's worktree: the Assistant session plays the same steps in the main checkout, where a commit would move the target, which V14
 * fails as a foreign ref.
 */
function buildingSession(commitMessage = 'Build the example', report = builderReport()): FakeAgentStep[] {
  return [
    { kind: 'print', line: fakeStartedLine('fake-session') },
    { kind: 'shell', command: commitInTicketWorktree('echo built > built.txt', 'built.txt', commitMessage) },
    { kind: 'print', line: report },
    { kind: 'await-line' },
  ];
}

function watcherLaunchIn(watcherFolder: string): WatcherLaunch {
  return JSON.parse(readFileSync(watcherFilesOf(watcherFolder, 1).launchPath, 'utf8')) as WatcherLaunch;
}

/** Every Watcher and Watcher child a spec spawned is ended, so no fake session or gate outlives the spec. */
function endEveryWatcher(): void {
  const jobsFolder = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'jobs');
  if (!existsSync(jobsFolder)) return;
  const watcherFolders = readdirSync(jobsFolder).flatMap((jobId) => {
    const jobFolder = join(jobsFolder, jobId);
    return [jobFolder, ...readdirSync(jobFolder).map((name) => join(jobFolder, name)).filter((path) => statSync(path).isDirectory())];
  });
  for (const watcherFolder of watcherFolders.filter((folder) => existsSync(folder))) {
    for (const fileName of readdirSync(watcherFolder).filter((name) => /^watcher-\d+\.json$/.test(name))) {
      const record = JSON.parse(readFileSync(join(watcherFolder, fileName), 'utf8')) as WatcherRecord;
      for (const target of [record.childProcessGroupId === undefined ? null : -record.childProcessGroupId, record.watcher?.processId ?? null]) {
        try {
          if (target !== null) process.kill(target, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
    }
  }
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedScratchRepository('build-job', ['--project', 'Example Agency'], SPEC_CLOCK);
  monitorFolder = createScratchDirectory('h');
  overseerLog = [];
  buildStates = [];
  afterEachHoldPhase = () => undefined;
  launchRequests = [];
  jobsNotingStateAssignments = new WeakSet<object>();
  mainTipAtStart = (await Bun.$`git -C ${repositoryDirectory} rev-parse HEAD`.quiet().text()).trim();
  await run(['oversee', 'resume']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

afterEach(() => {
  endEveryWatcher();
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

describe('a build job end to end, on the real Watcher', () => {
  test('a merge gate runs in the narrowed environment of the Overseer: LANG is the Overseer\'s, a planted API key stays behind, and its git has core.longpaths', async () => {
    await run(['gate', 'add', 'checks', '--', 'test "$LANG" = example-narrowed && test -z "${ANTHROPIC_API_KEY-}" && test "$(git config --bool core.longpaths)" = true']);
    const overseerEnvironment = { ...inheritedEnvironment(), LANG: 'example-narrowed', ANTHROPIC_API_KEY: 'planted' };
    afterEachHoldPhase = (board) => {
      if (!board.logRecordsSoFar().some((record) => record.kind === 'merge-queued')) return;
      afterEachHoldPhase = () => undefined;
      commitFile(repositoryDirectory, 'moved-main.txt', 'so the merged tree is one no build gate judged\n');
    };
    const drivePass = await drivePassPlaying(buildingSession(), ports.gateConfinement, overseerEnvironment);
    await passUntil(drivePass, () => loggedEntries('job-ended').some((entry) => entry.fields['outcome'] === 'landed'), 'the landing');

    expect(new Set(loggedEntries('gate-ran').map((entry) => entry.fields['tree'])).size).toBe(2);
    expect(openIncidentKinds()).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

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
    expect((await Bun.$`git -C ${worktree} rev-parse HEAD~1`.quiet().text()).trim()).toBe(mainTipAtStart);
    const jobFolder = jobFolderOf(firstBuildJobId());
    const sandboxApplies = ports.gateConfinement.availability().verdict === 'confined';
    for (const [folder, networkDenied] of [['install', false], ['gate-prepare', false], ['gate-1', true]] as const) {
      const launch = watcherLaunchIn(join(jobFolder, folder));
      expect(launch.kind).toBe('process');
      expect(launch.argv[0] === SANDBOX_EXEC_PATH).toBe(sandboxApplies);
      expect(readFileSync(join(jobFolder, folder, 'process-sandbox.sb'), 'utf8').includes('(deny network-outbound')).toBe(networkDenied);
    }
    expect(WatcherFleet.livenessOf(ports, jobFolder, 1)).toMatchObject({ verdict: 'ended', end: { reason: 'exited', exitCode: 0 } });
    const endedWatcherProcessIds = [jobFolder, ...['install', 'gate-prepare', 'gate-1'].map((folder) => join(jobFolder, folder))]
      .map((watcherFolder) => WatcherFleet.watcherRecordOf(watcherFolder, 1)?.watcher?.processId ?? null);
    expect(endedWatcherProcessIds).not.toContain(null);
    await passUntil(drivePass, () => endedWatcherProcessIds.every((processId) => processId === null || processIsGone(processId)), 'the ended Watchers reaped');
    expect(loggedEntries('gate-ran').map((entry) => entry.fields)).toEqual([expect.objectContaining({ outcome: 'passed', cached: false })]);
    expect(existsSync(join(requireWorkspace(repositoryDirectory).trackerDirectory, 'gates'))).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('operational failures on the real Watcher', () => {
  test('a worktree that cannot be created opens setup-failed', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    // The branch is checked out elsewhere already, so `git worktree add` refuses it.
    await Bun.$`git -C ${repositoryDirectory} branch ticket-001`.quiet();
    await Bun.$`git -C ${repositoryDirectory} worktree add -q ${join(repositoryDirectory, 'elsewhere')} ticket-001`.quiet();
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('setup-failed'), 'the setup-failed incident');
    expect((storedProgressOf(repositoryDirectory).incidents ?? [])[0]).toMatchObject({ facts: { step: 'worktree' } });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  // A CRLF blob under a `text` attribute checks out converted, so the fresh tree already differs from its commit and every gate would fail on it.
  test('a worktree dirty straight after checkout opens one setup-failed naming normalisation, and runs no install line or gate', async () => {
    await run(['gate', 'add', 'checks', '--', 'true']);
    await Bun.$`git -C ${repositoryDirectory} config core.autocrlf false`.quiet();
    writeFileSync(join(repositoryDirectory, 'example.txt'), 'first line\r\nsecond line\r\n');
    await Bun.$`git -C ${repositoryDirectory} add example.txt && cd ${repositoryDirectory} && ${{ raw: COMMIT }} -m 'Add the example file'`.quiet();
    writeFileSync(join(repositoryDirectory, '.gitattributes'), '* text\n');
    await Bun.$`git -C ${repositoryDirectory} add .gitattributes && cd ${repositoryDirectory} && ${{ raw: COMMIT }} -m 'Normalise line endings'`.quiet();
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('setup-failed'), 'the setup-failed incident');
    const incidents = storedProgressOf(repositoryDirectory).incidents ?? [];
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ facts: { step: 'worktree', cause: 'line-ending-normalisation' } });
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'setup-failed' });
    expect(readFileSync(join(jobFolderOf(firstBuildJobId()), 'worktree-unnormalised.txt'), 'utf8')).toBe('example.txt\n');
    expect(existsSync(join(jobFolderOf(firstBuildJobId()), 'install'))).toBe(false);
    expect(loggedEntries('gate-ran')).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  // Each line passes where `checks` tries it, in the main checkout, and cannot run only on the built tree.
  const cannotRunLines = [['exits 127', 'exit 127'], ['exits 126', 'exit 126'], ['is killed by a signal', 'kill -9 $$']];
  test.each(cannotRunLines)('a checks process that %s opens gate-cannot-run, never a failed pass', async (_name, cannotRun) => {
    await run(['gate', 'add', 'checks', '--', `test ! -f built.txt || ${cannotRun}`]);
    const drivePass = await drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => openIncidentKinds().includes('gate-cannot-run'), 'the gate-cannot-run incident');
    expect(buildJobEnding()).toMatchObject({ outcome: 'stopped', cause: 'gate-cannot-run' });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
