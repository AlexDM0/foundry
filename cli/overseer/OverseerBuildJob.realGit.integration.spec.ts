/**
 * The build job cases that still run real git, beside `cli/overseer/OverseerBuildJob.integration.spec.ts`, which runs on recorded git: the
 * pinned Watcher bundle, the fake agent child and real gate processes under the real sandbox. What matters: a merge gate runs in the
 * Overseer's narrowed environment; and a worktree git refuses, or one dirty straight after checkout, opens setup-failed. Each case needs a
 * flow stage of `src/testing/RecordedGitFlow.ts` that is not recorded yet.
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
import type { GateConfinement }                               from '../../src/lib/gate-confinement/GateConfinement.ts';
import type { Job, JobState }                                 from '../../src/lib/tracker-model/@types/Job.ts';
import type { Board }                                         from '../../src/lib/tracker-model/Board.ts';
import type { WatcherRecord }                                 from '../../src/lib/watcher/WatcherRecord.ts';
import type { DrivePass }                                     from '../../src/services/overseer/DrivePass.ts';
import { WatcherFleet }                                       from '../../src/services/overseer/WatcherFleet.ts';
import { requireWorkspace }                                   from '../../src/services/tracker/Workspace.ts';
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
const COMMIT = 'git -c user.name="Alex Example" -c user.email=alex@example.com -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q';

let repositoryDirectory = '';
let monitorFolder = '';
let overseerLog: string[] = [];
let buildStates: string[] = [];
let afterEachHoldPhase: (board: Board) => void = () => undefined;
let launchRequests: AgentLaunchRequest[] = [];
let jobsNotingStateAssignments = new WeakSet<object>();

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
});
