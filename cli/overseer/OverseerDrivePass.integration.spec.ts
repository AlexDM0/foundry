/**
 * The DrivePass on the real system: the pinned Watcher bundle and the fake agent child. Git is the fake of `src/testing/FakeGit.ts`, in this
 * process and, through `src/testing/FakeGitProgram.ts`, in every process a Watcher starts. What matters: a readied ticket gets a
 * Watcher running the fake child; a builder file the pipeline names waits until it is committed, and a launch records its hash; an Airlock agent
 * the merge sweep launches gets its Watcher in the same wake and, ended in a merge-slot hold, its tokens credited in that hold; a real stop ends a
 * usage-limited session; the notices come from git and are never stored; and a written verb nudges a live Baton over HTTP, and `ticket deliver
 * --by-hand` is refused while the Baton is live. `cli/overseer/OverseerDrivePass.spec.ts` holds the same code behind the fake Watcher world.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
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

import { UsageMarkerFile }                                    from '../../src/adapters/usage-marker/UsageMarkerFile.ts';
import type { AgentAdapter }                                  from '../../src/lib/agent-launch/AgentAdapter.ts';
import { sameProcess }                                        from '../../src/lib/process-identity/ProcessIdentity.ts';
import type { Board }                                         from '../../src/lib/tracker-model/Board.ts';
import { watcherFilesOf }                                     from '../../src/lib/watcher/WatcherFiles.ts';
import type { WatcherRecord }                                 from '../../src/lib/watcher/WatcherRecord.ts';
import { Baton }                                              from '../../src/services/overseer/Baton.ts';
import { type DrivePass }                                     from '../../src/services/overseer/DrivePass.ts';
import { HatchInbox }                                         from '../../src/services/overseer/HatchInbox.ts';
import { overseerFilesIn }                                    from '../../src/services/overseer/OverseerFiles.ts';
import { WatcherFleet }                                       from '../../src/services/overseer/WatcherFleet.ts';
import { writeTracker }                                       from '../../src/services/tracker/TrackerPipeline.ts';
import { requireWorkspace }                                   from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                      from '../../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }            from '../../src/testing/ChildProcessCaseTimeout.ts';
import { createScratchDrivePass, pinnedScratchWatcherBundle } from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  FAKE_HEAD_PLACEHOLDER,
  fakeAgentAdapter,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { useFakeGit }                                       from '../../src/testing/FakeGit.ts';
import { portsResolvingTheFakeGit, withFakeGitFirstOnPath } from '../../src/testing/FakeGitProgram.ts';
import { queueOnCurrentGreen }                              from '../../src/testing/GreenQueue.ts';
import { nativePlatformPorts }                              from '../../src/testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }   from '../../src/testing/ScratchWorkspace.ts';
import { waitUntil }                                        from '../../src/testing/WaitUntil.ts';
import { createCapturedCommandContext }                     from '../testing/CapturedCommandContext.ts';
import { createInitializedFakeGitRepository }               from '../testing/InitializedScratchRepository.ts';
import { runCommandLineWithOverseerMoves }                  from '../testing/OverseerTicketMoves.ts';
import { fileReadyTicket }                                  from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                  from '../testing/StoredLogText.ts';
import { storedProgressOf }                                 from '../testing/StoredProgress.ts';

const fakeGit = useFakeGit();
const ports = portsResolvingTheFakeGit(nativePlatformPorts());
const { identityOf } = ports.processSupervision;

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
/** Bounds the teardown's wait for a claim alone, which is cleanup: a Watcher that never claims has nothing to end, and no verdict reads this. */
const WATCHER_CLAIM_WAIT_TRIES = 200;
const WATCHER_CLAIM_WAIT_MILLISECONDS = 50;

let repositoryDirectory = '';
let monitorFolder = '';
let overseerLog: string[] = [];
const drivePassesOfThisTest: DrivePass[] = [];
let currentTeardown = { started: false };
let wakesInProgress = 0;
const LAUNCH_FILE_PATTERN = /^launch-(\d+)\.json$/;

async function run(commandLineArguments: readonly string[]) {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
  const exitCode = await runCommandLineWithOverseerMoves(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

const SPEC_STAMP = '2026-09-18T22:11:03+02:00';

async function drivePassWith(
  adapter: AgentAdapter,
  afterHoldPhase?: (phase: string, board: Board) => void,
  clock: { stamp: string } = { stamp: SPEC_STAMP },
): Promise<DrivePass> {
  const teardownOfThisTest = currentTeardown;
  const workspace = requireWorkspace(repositoryDirectory);
  const drivePass = createScratchDrivePass({
    platformPorts:        ports,
    workspace,
    now:                  () => new Date(Date.parse(clock.stamp)),
    formatStamp:          () => clock.stamp,
    watcherBundlePath:    await pinnedScratchWatcherBundle(workspace),
    agentAdapter:         adapter,
    monitorFolder,
    mainLine:             fakeGit.checkedOutBranchOf(repositoryDirectory),
    inheritedEnvironment: withFakeGitFirstOnPath({}),
    log:                  (line) => overseerLog.push(line),
    ...(afterHoldPhase === undefined ? {} : { afterHoldPhase }),
  });
  // A test that timed out while the bundle was pinned arrives here after its teardown, so its pass never runs.
  if (teardownOfThisTest.started) await drivePass.stop();
  else drivePassesOfThisTest.push(drivePass);
  return {
    ...drivePass,
    wake: (forced) => {
      wakesInProgress += 1;
      try {
        drivePass.wake(forced);
      } finally {
        wakesInProgress -= 1;
      }
    },
  };
}

async function passOnce(drivePass: DrivePass, forced = true): Promise<void> {
  drivePass.wake(forced);
  await drivePass.idle();
}

function jobFolder(jobId: string): string {
  return WatcherFleet.jobFolderOf(requireWorkspace(repositoryDirectory).trackerDirectory, jobId);
}

async function untilWatcherEnded(jobId: string, instance: number): Promise<void> {
  await waitUntil(() => WatcherFleet.livenessOf(ports, jobFolder(jobId), instance).verdict === 'ended', () => `watcher ${instance} of ${jobId} ending: ${overseerLog.join('\n')}`);
}

/** The policy boots the Assistant beside the build, so the build's job id is looked up rather than assumed. */
function buildJobId(): string {
  const buildJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
  if (buildJob === undefined) throw new Error(`no build job was launched: ${overseerLog.join('\n')}`);
  return buildJob.id;
}

/** A session that starts and then waits on its stdin past the Overseer's first message, so its Watcher stays live until the spec ends it. */
const WAITING_SESSION = fakeAgentAdapter([{ kind: 'print', line: fakeStartedLine('fake-session') }, { kind: 'await-line' }, { kind: 'await-line' }]);

/** Every folder under `folder` holding a launch file: a job's Watchers and, nested in it, its process Watchers. */
function watcherFoldersUnder(folder: string): string[] {
  const entries = readdirSync(folder, { withFileTypes: true });
  const holdsALaunch = entries.some((entry) => entry.isFile() && LAUNCH_FILE_PATTERN.test(entry.name));
  const nested = entries.filter((entry) => entry.isDirectory()).flatMap((entry) => watcherFoldersUnder(join(folder, entry.name)));
  return holdsALaunch ? [folder, ...nested] : nested;
}

/** A Watcher spawned in the last pass may not have claimed its instance yet, so its record is waited for rather than read once. */
async function claimedRecordOf(watcherFolder: string, instance: number): Promise<WatcherRecord | null> {
  for (let attempt = 0; attempt < WATCHER_CLAIM_WAIT_TRIES; attempt += 1) {
    const record = WatcherFleet.watcherRecordOf(watcherFolder, instance);
    if (record !== null) return record;
    await Bun.sleep(WATCHER_CLAIM_WAIT_MILLISECONDS);
  }
  return null;
}

function killQuietly(target: number): void {
  try {
    process.kill(target, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

/**
 * Every Watcher a launch file was written for is ended, then its child's process group, so no fake session outlives the spec. The Watcher
 * goes first, so it cannot spawn a child after its record was read; a process id that now names another process is left alone.
 */
async function endEveryWatcher(repositoryOfThisTest: string): Promise<void> {
  const jobsFolder = join(requireWorkspace(repositoryOfThisTest).trackerDirectory, 'jobs');
  if (!existsSync(jobsFolder)) return;
  for (const watcherFolder of watcherFoldersUnder(jobsFolder)) {
    const instances = readdirSync(watcherFolder).flatMap((name) => LAUNCH_FILE_PATTERN.exec(name)?.slice(1).map(Number) ?? []);
    for (const instance of instances) {
      const claimed = await claimedRecordOf(watcherFolder, instance);
      const watcher = claimed?.watcher ?? null;
      const current = watcher === null ? null : identityOf(watcher.processId);
      if (watcher !== null && current !== null && sameProcess(current, watcher)) killQuietly(watcher.processId);
      const childProcessGroupId = WatcherFleet.watcherRecordOf(watcherFolder, instance)?.childProcessGroupId;
      if (childProcessGroupId !== undefined) killQuietly(-childProcessGroupId);
    }
  }
}

function hatchDirectory(jobId: string): string {
  return HatchInbox.hatchDirectoryOf(repositoryDirectory, jobId);
}


beforeEach(async () => {
  currentTeardown = { started: false };
  repositoryDirectory = await createInitializedFakeGitRepository('drive-pass', ['--project', 'Example Agency'], SPEC_CLOCK, fakeGit);
  monitorFolder = createScratchDirectory('h');
  overseerLog = [];
  await run(['gate', 'add', 'checks', '--', 'true']);
  await run(['oversee', 'resume']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

// A timed-out test's passes are stopped, and a wake the teardown interrupted (Bun ticks inside a sync spawn) waited out, before removal;
// the folders are taken before the first await, so a late teardown never ends the next test's Watchers or folders.
afterEach(async () => {
  currentTeardown.started = true;
  const repositoryOfThisTest = repositoryDirectory;
  const monitorFolderOfThisTest = monitorFolder;
  const drivePasses = drivePassesOfThisTest.splice(0);
  await Promise.all(drivePasses.map(async (drivePass) => await drivePass.stop()));
  await waitUntil(() => wakesInProgress === 0, 'every wake of the case returning');
  await Promise.all(drivePasses.map(async (drivePass) => await drivePass.idle()));
  await endEveryWatcher(repositoryOfThisTest);
  removeScratchDirectory(monitorFolderOfThisTest);
  removeScratchDirectory(repositoryOfThisTest);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

/** A build job launches, prepares its worktree, then runs: forced passes until its session's Watcher is spawned. */
async function passUntilBuildSessionSpawned(drivePass: DrivePass): Promise<void> {
  await waitUntil(async () => {
    await passOnce(drivePass);
    const buildJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
    return buildJob !== undefined && WatcherFleet.livenessOf(ports, jobFolder(buildJob.id), 1).verdict !== 'unclaimed';
  }, () => `the build session being spawned: ${overseerLog.join('\n')}\n${JSON.stringify(storedProgressOf(repositoryDirectory).jobs)}`);
}

describe('one pass', () => {
  test('one wake carries a readied ticket\'s job from launching through its prepared worktree to running, and its session a Watcher running the fake child', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter());
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === buildJobId())).toMatchObject({
      kind: 'build', role: 'builder', ticketIds: ['001'], state: 'running', watcherInstance: 1
    });
    await passUntilBuildSessionSpawned(drivePass);
    await untilWatcherEnded(buildJobId(), 1);
    expect(readFileSync(watcherFilesOf(jobFolder(buildJobId()), 1).eventLogPath, 'utf8')).toContain(JSON.stringify(fakeStartedLine('fake-session')));
    expect(existsSync(join(hatchDirectory(buildJobId()), 'requests'))).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a builder file the pipeline names that is missing launches no session and is noticed; committed, the next pass launches it and records its hash', async () => {
    const pipelinePath = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json');
    const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')) as Record<string, unknown>;
    writeFileSync(pipelinePath, `${JSON.stringify({ ...pipeline, constitution: [], agents: { builder: ['example-builder.md'] } }, null, 2)}\n`);
    const drivePass = await drivePassWith(fakeAgentAdapter());
    await passOnce(drivePass);
    await passOnce(drivePass);

    expect(drivePass.state().notices).toContainEqual({ kind: 'instructions-missing', jobId: buildJobId(), path: 'example-builder.md' });
    expect(WatcherFleet.livenessOf(ports, jobFolder(buildJobId()), 1).verdict).toBe('unclaimed');
    expect(existsSync(join(jobFolder(buildJobId()), 'instructions-1.json'))).toBe(false);

    fakeGit.commitInSession(repositoryDirectory, 'example-builder.md', 'Build ticket #{{ticketId}}.\n', 'Example');
    await passUntilBuildSessionSpawned(drivePass);

    expect(drivePass.state().notices).not.toContainEqual(expect.objectContaining({ kind: 'instructions-missing' }));
    const contentHash = createHash('sha256').update('Build ticket #{{ticketId}}.\n').digest('hex').slice(0, 16);
    expect(JSON.parse(readFileSync(join(jobFolder(buildJobId()), 'instructions-1.json'), 'utf8'))).toEqual({ files: [{ path: 'example-builder.md', contentHash }] });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an Airlock agent the merge sweep launched after the pass spawned its Watchers gets one more pass in the same wake, which spawns its watcher', async () => {
    await run(['ticket', 'start', '001']);
    await run(['ticket', 'finish', '001']);
    const mainLine = fakeGit.checkedOutBranchOf(repositoryDirectory);
    const ticketWorktree = join(repositoryDirectory, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001');
    fakeGit.outputOf(repositoryDirectory, ['worktree', 'add', '-b', 'ticket-001', ticketWorktree, mainLine]);
    fakeGit.commitInSession(ticketWorktree, 'roles.ts', 'export const roles = [\'builder\'];\n', 'Add the builder role');
    fakeGit.commitInSession(repositoryDirectory, 'roles.ts', 'export const roles = [\'reviewer\'];\n', 'Add the reviewer role');
    const workspace = requireWorkspace(repositoryDirectory);
    await writeTracker({
      workspace, at: SPEC_STAMP, now: SPEC_CLOCK, mutate: (change) => queueOnCurrentGreen(change.board, '001', mainLine, change.at, treeOfTicketBranch())
    });
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    const airlockAgentJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'merge-agent');
    expect(airlockAgentJob, overseerLog.join('\n')).toBeDefined();
    expect(existsSync(watcherFilesOf(jobFolder(airlockAgentJob?.id ?? ''), 1).launchPath), overseerLog.join('\n')).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
const CREDITED_INPUT_TOKENS = 1000;
const CREDITED_OUTPUT_TOKENS = 200;

/** One top-level turn whose usage the Claude stream mapper reads, so the session has tokens to credit. */
const TURN_WITH_USAGE: FakeAgentStep = {
  kind: 'print',
  line: JSON.stringify({
    type:               'assistant',
    parent_tool_use_id: null,
    message:            {
      id:      'message-with-usage',
      model:   'fake-model',
      content: [],
      usage:   {
        input_tokens: CREDITED_INPUT_TOKENS, output_tokens: CREDITED_OUTPUT_TOKENS, cache_creation_input_tokens: 0, cache_read_input_tokens: 0
      },
    },
  }),
};

const RESOLVE_THE_ROLES_CONFLICT = 'printf "export const roles = [\'builder\', \'reviewer\'];\\n" > roles.ts && git add roles.ts '
  + '&& git -c user.name=Example -c user.email=example@example.com commit -q --no-edit';

function treeOfTicketBranch(): string {
  return fakeGit.outputOf(repositoryDirectory, ['rev-parse', 'refs/heads/ticket-001^{tree}']);
}

async function ticketTaskId(): Promise<number> {
  const shown = JSON.parse((await run(['ticket', 'show', '001', '--json'])).outputText()) as { task: number | null };
  if (shown.task === null) throw new Error('ticket 001 has no row');
  return shown.task;
}

function rowTokensOf(tasks: readonly { id: number; tokens: number | null }[], taskId: number): number | null {
  return tasks.find((task) => task.id === taskId)?.tokens ?? null;
}

describe('crediting an ended job\'s tokens', () => {
  test('an Airlock agent the merge-slot hold ends has its session\'s tokens on its ticket\'s row before the next pass hold credits anything', async () => {
    await run(['ticket', 'start', '001']);
    await run(['ticket', 'finish', '001']);
    const mainLine = fakeGit.checkedOutBranchOf(repositoryDirectory);
    const ticketWorktree = join(repositoryDirectory, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001');
    fakeGit.outputOf(repositoryDirectory, ['worktree', 'add', '-b', 'ticket-001', ticketWorktree, mainLine]);
    fakeGit.commitInSession(ticketWorktree, 'roles.ts', 'export const roles = [\'builder\'];\n', 'Add the builder role');
    fakeGit.commitInSession(repositoryDirectory, 'roles.ts', 'export const roles = [\'reviewer\'];\n', 'Add the reviewer role');
    const workspace = requireWorkspace(repositoryDirectory);
    await writeTracker({
      workspace, at: SPEC_STAMP, now: SPEC_CLOCK, mutate: (change) => queueOnCurrentGreen(change.board, '001', mainLine, change.at, treeOfTicketBranch())
    });
    const taskId = await ticketTaskId();
    const airlockAgentReport = {
      role:          'builder',
      outcome:       'resolved',
      headCommit:    FAKE_HEAD_PLACEHOLDER,
      resolvedFiles: ['roles.ts'],
      notes:         'Example notes',
      reportKind:    null,
    };
    let airlockAgentJobId: string | null = null;
    // The row's tokens as the first pass hold after the Airlock agent ended opens, before that hold's own crediting runs.
    let tokensAsTheNextHoldOpens: number | null | undefined;
    const watchTheResolver = (phase: string, board: Board): void => {
      if (phase !== 'relayed-commands' || tokensAsTheNextHoldOpens !== undefined) return;
      airlockAgentJobId ??= board.jobs().find((job) => job.kind === 'merge-agent')?.id ?? null;
      if (airlockAgentJobId !== null && board.jobById(airlockAgentJobId) === undefined) tokensAsTheNextHoldOpens = rowTokensOf(board.tasks(), taskId);
    };
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      TURN_WITH_USAGE,
      { kind: 'shell', command: RESOLVE_THE_ROLES_CONFLICT },
      { kind: 'print', line: fakeResultLine(airlockAgentReport) },
      { kind: 'exit', code: 0 },
    ]), watchTheResolver);
    await waitUntil(async () => {
      await passOnce(drivePass);
      return tokensAsTheNextHoldOpens !== undefined;
    }, () => `the hold after the Airlock agent's end opening: ${overseerLog.join('\n')}`);
    expect(airlockAgentJobId, overseerLog.join('\n')).not.toBeNull();
    expect(storedLogTextOf(repositoryDirectory)).toContain(`"kind":"job-ended","jobId":"${airlockAgentJobId ?? ''}"`);
    expect(tokensAsTheNextHoldOpens).toBe(CREDITED_INPUT_TOKENS);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('waking', () => {
  test('the notices are derived each pass from git and the runtime state and never stored', async () => {
    fakeGit.commitInSession(repositoryDirectory, 'CLAUDE.md', '<!-- example-managed-block -->\n', 'Example');
    const drivePass = await drivePassWith(fakeAgentAdapter());
    await passOnce(drivePass);
    expect(drivePass.state().notices).toEqual([{ kind: 'claude-md-block-committed', target: fakeGit.checkedOutBranchOf(repositoryDirectory) }]);
    expect(readFileSync(join(repositoryDirectory, '.agent-progress-v2', 'progress.json'), 'utf8')).not.toContain('claude-md-block-committed');

    writeFileSync(join(repositoryDirectory, 'CLAUDE.md'), '# Example conventions\n');
    await passOnce(drivePass, true);
    expect(drivePass.state().notices, 'the block is removed but not yet committed: launches still wait').toHaveLength(1);
    fakeGit.outputOf(repositoryDirectory, ['add', 'CLAUDE.md']);
    fakeGit.outputOf(repositoryDirectory, ['commit', '-q', '-m', 'Example']);
    await passOnce(drivePass, true);
    expect(drivePass.state().notices, 'the notice clears once the removal is committed').toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

async function runRefused(commandLineArguments: readonly string[]): Promise<string> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
  const exitCode = await runCommandLineWithOverseerMoves(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` was not refused: ${context.outputText()}`).toBe(1);
  return `${context.outputText()}\n${context.errorText()}`;
}

/** A Baton naming this very process, so it reads as live, its URL the given one. */
function acquireLiveBaton(url: string): { overseerDirectory: string; generation: number } {
  const { overseerDirectory } = overseerFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
  mkdirSync(overseerDirectory, { recursive: true });
  const identity = identityOf(process.pid);
  if (identity === null) throw new Error('this process has no readable identity');
  const acquisition = Baton.acquire(ports, overseerDirectory, {
    processId:              identity.processId,
    processStartStamp:      identity.startStamp,
    bootIdentity:           identity.bootIdentity,
    port:                   Number(new URL(url).port),
    url,
    tokenFile:              join(overseerDirectory, 'token'),
    codeVersion:            'code-example',
    installVersion:         1,
    watcherProtocolVersion: 1,
  });
  if (acquisition.verdict !== 'acquired') throw new Error('the live Baton was not acquired');
  return { overseerDirectory, generation: acquisition.generation };
}

function deliveredRecordsOf(ticketId: string): unknown[] {
  return storedLogTextOf(repositoryDirectory).split('\n').filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { kind: string; ticketId?: string; fields: unknown })
    .filter((entry) => entry.kind === 'ticket-delivered' && entry.ticketId === ticketId).map((entry) => entry.fields);
}

/** A `rate_limit_event` as Claude Code prints it: `status` is the top level, which alone refuses requests. */
function rateLimitLine(topLevelStatus: string, window: string, windowStatus: string): string {
  return JSON.stringify({
    type:            'rate_limit_event',
    rate_limit_info: {
      status: topLevelStatus, resetsAt: 1793142034, rateLimitType: window, unifiedWindows: { [window]: { utilization: 1, resetsAt: 1793142034, status: windowStatus } },
    },
  });
}

const USAGE_RESET_STAMP = new Date(1793142034000).toISOString();

async function passUntilBuildJobIs(drivePass: DrivePass, state: string): Promise<void> {
  await waitUntil(async () => {
    await passOnce(drivePass);
    return (storedProgressOf(repositoryDirectory).jobs ?? []).some((job) => job.kind === 'build' && job.state === state);
  }, () => `the build job becoming ${state}: ${overseerLog.join('\n')}\n${JSON.stringify(storedProgressOf(repositoryDirectory).jobs)}`);
}

describe('usage limits', () => {
  test('a top-level rejected limit interrupts the job uncounted, marks the machine, logs it and stops the Watcher; nothing resumes before the reset', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: rateLimitLine('rejected', 'five_hour', 'rejected') },
      {
        kind: 'print',
        line: JSON.stringify({
          type: 'result', subtype: 'error_during_execution', is_error: true, permission_denials: []
        })
      },
      { kind: 'await-line' },
    ]));
    await passUntilBuildSessionSpawned(drivePass);
    const jobId = buildJobId();
    await passUntilBuildJobIs(drivePass, 'interrupted');
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === jobId)).toMatchObject({
      state: 'interrupted', interruption: 'usage-limit', crashResumes: 0, watcherInstance: 1
    });
    const usageLimitHit = { kind: 'usage-limit-hit', jobId, fields: { window: 'five_hour', resetsAt: USAGE_RESET_STAMP } };
    expect(storedLogTextOf(repositoryDirectory)).toContain(JSON.stringify(usageLimitHit).slice(1));
    expect(storedLogTextOf(repositoryDirectory)).not.toContain(`"kind":"job-ended","jobId":"${jobId}"`);
    expect(UsageMarkerFile.read(monitorFolder)).toMatchObject({
      verdict: 'read',
      marker:  { vendor: 'fake-agent', window: 'five_hour', resetsAt: USAGE_RESET_STAMP }
    });
    await untilWatcherEnded(jobId, 1);
    await passOnce(drivePass);
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).filter((job) => job.kind === 'build')).toMatchObject([{ id: jobId, state: 'interrupted', watcherInstance: 1 }]);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).some((job) => job.kind === 'assistant')).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

});

describe('the verbs beside an overseer', () => {
  test('a written verb nudges the live baton\'s URL body-less once its write is stored, and stays silent when nobody answers', async () => {
    const nudges: { method: string; path: string; body: string; writeWasStored: boolean }[] = [];
    const fakeOverseer = Bun.serve({
      port:  0,
      fetch: async (request) => {
        const writeWasStored = storedLogTextOf(repositoryDirectory).includes('Example milestone');
        nudges.push({
          method: request.method, path: new URL(request.url).pathname, body: await request.text(), writeWasStored
        });
        return Response.json({ outcome: 'done' });
      },
    });
    try {
      acquireLiveBaton(fakeOverseer.url.href);
      await run(['log', 'Example milestone']);
      expect(nudges).toEqual([{
        method: 'POST', path: '/api/nudge', body: '', writeWasStored: true
      }]);
    } finally {
      await fakeOverseer.stop(true);
    }
    const unanswered = await run(['log', 'Example milestone nobody hears']);
    expect(unanswered.errorText()).toBe('');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('ticket deliver --by-hand is refused overseer-owns-the-lifecycle while a Baton is live, and records byHand once none is', async () => {
    const baton = acquireLiveBaton('http://127.0.0.1:1/');
    expect(await runRefused(['ticket', 'deliver', '001', '--by-hand'])).toContain('An Overseer drives this board at http://127.0.0.1:1/');
    expect(deliveredRecordsOf('001')).toEqual([]);

    Baton.release(baton.overseerDirectory, baton.generation);
    await run(['ticket', 'deliver', '001', '--by-hand']);
    expect(deliveredRecordsOf('001')).toEqual([{ byHand: true }]);
    expect(storedProgressOf(repositoryDirectory).jobs ?? []).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
