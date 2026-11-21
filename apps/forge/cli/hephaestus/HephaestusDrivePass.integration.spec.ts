/**
 * The DrivePass on the real system: the board's Talos started from its binary and the fake agent child. Git plays the recorded flow stages
 * of `src/testing/RecordedGitFlow.ts`, here and, through `src/testing/RecordedGitProgram.ts`, in each process Talos starts. What matters: a
 * readied ticket gets a child of Talos running the fake agent; a builder file the pipeline names waits until it is committed, and a launch records
 * its hash; an Airlock agent the merge sweep launches gets its child in the same wake and, ended in a merge-slot hold, its tokens credited
 * in that hold; the notices come from git and are never stored; a real stop ends a usage-limited session; and a written verb nudges a live
 * Baton over HTTP, and `ticket deliver --by-hand` is refused while the Baton is live. `cli/hephaestus/HephaestusDrivePass.spec.ts` holds the same
 * code behind the recorded Talos stages.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
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

import { UsageMarkerFile }                                                        from '../../src/adapters/usage-marker/UsageMarkerFile.ts';
import type { AgentAdapter }                                                      from '../../src/lib/agent-launch/AgentAdapter.ts';
import type { Board }                                                             from '../../src/lib/tracker-model/Board.ts';
import { Baton }                                                                  from '../../src/services/hephaestus/Baton.ts';
import type { BoardChildren }                                                     from '../../src/services/hephaestus/BoardChildren.ts';
import { type DrivePass }                                                         from '../../src/services/hephaestus/DrivePass.ts';
import { HatchInbox }                                                             from '../../src/services/hephaestus/HatchInbox.ts';
import { hephaestusFilesIn }                                                      from '../../src/services/hephaestus/HephaestusFiles.ts';
import { jobFolderIn }                                                            from '../../src/services/hephaestus/HephaestusFiles.ts';
import { writeTracker }                                                           from '../../src/services/tracker/TrackerPipeline.ts';
import { requireWorkspace }                                                       from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                                          from '../../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                from '../../src/testing/ChildProcessCaseTimeout.ts';
import { createScratchDrivePass, type ScratchBoardTalos, startScratchBoardTalos } from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  FAKE_HEAD_PLACEHOLDER,
  fakeAgentAdapter,
  fakeRateLimitedResultLine,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { queueOnCurrentGreen }       from '../../src/testing/GreenQueue.ts';
import { LIVE_HOLDERS_LOCK_TAKER }   from '../../src/testing/LockTakers.ts';
import { nativePlatformPorts }       from '../../src/testing/NativePlatformPorts.ts';
import { stopProcessesReachingInto } from '../../src/testing/ProcessesInFolder.ts';
import { useRecordedGit }            from '../../src/testing/RecordedGit.ts';
import {
  RECORDED_FLOW_BUILDER_FILE,
  RECORDED_FLOW_CONFLICT,
  RECORDED_FLOW_CONFLICT_RESOLUTION,
  RECORDED_FLOW_MAIN_LINE,
  RECORDED_FLOW_PLACEHOLDERS,
  RECORDED_FLOW_TICKET_BRANCH,
  REPLAYED_OBJECT_IDS
} from '../../src/testing/RecordedGitFlow.ts';
import {
  portsResolvingTheRecordedGit,
  type SharedRecordedGitFlow,
  shareRecordedGitFlow,
  withRecordedGitFirstOnPath
} from '../../src/testing/RecordedGitProgram.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }           from '../../src/testing/TalosChildReadings.ts';
import { waitUntil }                                      from '../../src/testing/WaitUntil.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';
import { runCommandLineWithHephaestusMoves }              from '../testing/HephaestusTicketMoves.ts';
import { createInitializedRecordedGitRepository }         from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                                from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                from '../testing/StoredLogText.ts';
import { storedProgressOf }                               from '../testing/StoredProgress.ts';

const recordedGit = useRecordedGit();
const nativePorts = nativePlatformPorts();
let ports = nativePorts;
let recordedFlow: SharedRecordedGitFlow | null = null;
const { identityOf } = nativePorts.processSupervision;
let boardTalos: ScratchBoardTalos | null = null;

/** The children as Hephaestus reads them, through Talos's adapter over the case's platform ports. */
function childReadings(): BoardChildren {
  return talosChildReadingsWith(ports, requireWorkspace(repositoryDirectory).trackerDirectory);
}

/** The board's Talos, started at the case's first DrivePass as Hephaestus's start starts it. */
async function boardTalosOfTheCase(): Promise<ScratchBoardTalos> {
  boardTalos ??= await startScratchBoardTalos({
    workspace: requireWorkspace(repositoryDirectory), platformPorts: ports, monitorFolder, log: (line) => hephaestusLog.push(line)
  });
  return boardTalos;
}

function requireRecordedFlow(): SharedRecordedGitFlow {
  if (recordedFlow === null) throw new Error('the case shares no recorded git flow');
  return recordedFlow;
}

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

let repositoryDirectory = '';
let monitorFolder = '';
let hephaestusLog: string[] = [];
const drivePassesOfThisTest: DrivePass[] = [];
let currentTeardown = { started: false };
let wakesInProgress = 0;

async function run(commandLineArguments: readonly string[]) {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
  const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
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
    talosConnection:      (await boardTalosOfTheCase()).connection,
    agentAdapter:         adapter,
    monitorFolder,
    mainLine:             RECORDED_FLOW_MAIN_LINE,
    inheritedEnvironment: withRecordedGitFirstOnPath({}, requireRecordedFlow()),
    log:                  (line) => hephaestusLog.push(line),
    ...(afterHoldPhase === undefined ? {} : { afterHoldPhase }),
  });
  // A test that timed out while Talos started arrives here after its teardown, so its pass never runs.
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
  return jobFolderIn(requireWorkspace(repositoryDirectory).trackerDirectory, jobId);
}

async function untilChildEnded(jobId: string, instance: number): Promise<void> {
  await waitUntil(() => childReadings().livenessOf(jobFolder(jobId), instance).verdict === 'ended', () => `child ${instance} of ${jobId} ending: ${hephaestusLog.join('\n')}`);
}

/** The policy boots the Assistant beside the build, so the build's job id is looked up rather than assumed. */
function buildJobId(): string {
  const buildJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
  if (buildJob === undefined) throw new Error(`no build job was launched: ${hephaestusLog.join('\n')}`);
  return buildJob.id;
}


function hatchDirectory(jobId: string): string {
  return HatchInbox.hatchDirectoryOf(repositoryDirectory, jobId);
}


beforeEach(async () => {
  currentTeardown = { started: false };
  repositoryDirectory = await createInitializedRecordedGitRepository('drive-pass', ['--project', 'Example Agency'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  recordedFlow = shareRecordedGitFlow(recordedGit);
  ports = portsResolvingTheRecordedGit(nativePorts, recordedFlow);
  monitorFolder = createScratchDirectory('h');
  hephaestusLog = [];
  await run(['gate', 'add', 'checks', '--', 'true']);
  await run(['gate', 'assistant', 'on']);
  await run(['unpause']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

// A timed-out test's passes are stopped, and a wake the teardown interrupted (Bun ticks inside a sync spawn) waited out, before removal;
// the folders are taken before the first await, so a late teardown never ends the next test's Talos or folders.
afterEach(async () => {
  currentTeardown.started = true;
  const repositoryOfThisTest = repositoryDirectory;
  const monitorFolderOfThisTest = monitorFolder;
  const drivePasses = drivePassesOfThisTest.splice(0);
  await Promise.all(drivePasses.map(async (drivePass) => await drivePass.stop()));
  await waitUntil(() => wakesInProgress === 0, 'every wake of the case returning');
  await Promise.all(drivePasses.map(async (drivePass) => await drivePass.idle()));
  // Talos and every child it ran work in the repository, so stopping what reaches into it ends them all, a case cut short included.
  boardTalos = null;
  await stopProcessesReachingInto(repositoryOfThisTest);
  removeScratchDirectory(monitorFolderOfThisTest);
  removeScratchDirectory(repositoryOfThisTest);
  const flowOfTheCase = requireRecordedFlow();
  recordedFlow = null;
  flowOfTheCase.requireEveryCallAnswered();
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

/** A build job launches, prepares its worktree, then runs: forced passes until its session's child is launched. */
async function passUntilBuildSessionSpawned(drivePass: DrivePass): Promise<void> {
  await waitUntil(async () => {
    await passOnce(drivePass);
    const buildJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
    return buildJob !== undefined && childReadings().livenessOf(jobFolder(buildJob.id), 1).verdict !== 'unlaunched';
  }, () => `the build session being spawned: ${hephaestusLog.join('\n')}\n${JSON.stringify(storedProgressOf(repositoryDirectory).jobs)}`);
}

describe('one pass', () => {
  test('one wake carries a readied ticket\'s job from launching through its prepared worktree to running, and its session a child of Talos running the fake agent', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter());
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === buildJobId())).toMatchObject({
      kind: 'build', role: 'builder', ticketIds: ['001'], state: 'running', childInstance: 1
    });
    await passUntilBuildSessionSpawned(drivePass);
    await untilChildEnded(buildJobId(), 1);
    expect(readFileSync(childFilesIn(jobFolder(buildJobId()), 1).eventLogPath, 'utf8')).toContain(JSON.stringify(fakeStartedLine('fake-session')));
    expect(existsSync(join(hatchDirectory(buildJobId()), 'requests'))).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a builder file the pipeline names that is missing launches no session and is noticed; committed, the next pass launches it and records its hash', async () => {
    const pipelinePath = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json');
    const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')) as Record<string, unknown>;
    const builderInstructions = [{ kind: 'file', path: RECORDED_FLOW_BUILDER_FILE.path }];
    writeFileSync(pipelinePath, `${JSON.stringify({ ...pipeline, agents: { builder: { instructions: builderInstructions } } }, null, 2)}\n`);
    const drivePass = await drivePassWith(fakeAgentAdapter());
    await passOnce(drivePass);
    await passOnce(drivePass);

    expect(drivePass.state().notices).toContainEqual({ kind: 'instructions-missing', jobId: buildJobId(), path: RECORDED_FLOW_BUILDER_FILE.path });
    expect(childReadings().livenessOf(jobFolder(buildJobId()), 1).verdict).toBe('unlaunched');
    expect(existsSync(join(jobFolder(buildJobId()), 'instructions-1.json'))).toBe(false);

    recordedGit.enterFlowStage('builder file committed', repositoryDirectory);
    await passUntilBuildSessionSpawned(drivePass);

    expect(drivePass.state().notices).not.toContainEqual(expect.objectContaining({ kind: 'instructions-missing' }));
    const contentHash = createHash('sha256').update(RECORDED_FLOW_BUILDER_FILE.text).digest('hex').slice(0, 16);
    expect(JSON.parse(readFileSync(join(jobFolder(buildJobId()), 'instructions-1.json'), 'utf8'))).toEqual({ files: [{ path: RECORDED_FLOW_BUILDER_FILE.path, contentHash }] });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

/** A session that starts and then waits on its stdin past Hephaestus's first message, so its child stays live until the spec ends it. */
const WAITING_SESSION = fakeAgentAdapter([{ kind: 'print', line: fakeStartedLine('fake-session') }, { kind: 'await-line' }, { kind: 'await-line' }]);

/** Ticket 001 finished, its branch conflicting with the moved main line and queued on its green tree, as a builder and a later commit leave it. */
async function queueTheConflictingBranch(): Promise<void> {
  await run(['ticket', 'start', '001']);
  await run(['ticket', 'finish', '001']);
  recordedGit.enterFlowStage('branch conflicting with main', repositoryDirectory);
  mkdirSync(join(repositoryDirectory, PRODUCT_NAMES.WORKTREES_FOLDER, RECORDED_FLOW_TICKET_BRANCH), { recursive: true });
  const ticketTree = REPLAYED_OBJECT_IDS[RECORDED_FLOW_PLACEHOLDERS.TICKET_TREE];
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace: requireWorkspace(repositoryDirectory),
    at:        SPEC_STAMP,
    now:       SPEC_CLOCK,
    mutate:    (change) => queueOnCurrentGreen(change.board, '001', RECORDED_FLOW_MAIN_LINE, change.at, ticketTree),
  });
}

describe('an Airlock agent', () => {
  test('an Airlock agent the merge sweep launched after the pass launched its children gets one more pass in the same wake, which launches it', async () => {
    await queueTheConflictingBranch();
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    const airlockAgentJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'merge-agent');
    expect(airlockAgentJob, hephaestusLog.join('\n')).toBeDefined();
    expect(existsSync(childFilesIn(jobFolder(airlockAgentJob?.id ?? ''), 1).recordPath), hephaestusLog.join('\n')).toBe(true);
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

const shellQuoted = (argument: string): string => `'${argument}'`;

/** The resolved file written, then staged and committed by the recorded git's Airlock agent commit. */
const RESOLVE_THE_ROLES_CONFLICT = [
  `printf "${RECORDED_FLOW_CONFLICT.resolvedText.replace('\n', '\\n')}" > ${RECORDED_FLOW_CONFLICT.path}`,
  ...RECORDED_FLOW_CONFLICT_RESOLUTION.map((call) => `git ${call.gitArguments.map(shellQuoted).join(' ')}`),
].join(' && ');

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
    await queueTheConflictingBranch();
    const taskId = await ticketTaskId();
    const airlockAgentReport = {
      role:          'builder',
      outcome:       'resolved',
      headCommit:    FAKE_HEAD_PLACEHOLDER,
      resolvedFiles: [RECORDED_FLOW_CONFLICT.path],
      notes:         'Example notes',
      reportKind:    null,
    };
    let airlockAgentJobId: string | null = null;
    // The row's tokens as the first pass hold after the Airlock agent ended opens, before that hold's own crediting runs.
    let tokensAsTheNextHoldOpens: number | null | undefined;
    const watchTheAirlockAgent = (phase: string, board: Board): void => {
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
    ]), watchTheAirlockAgent);
    await waitUntil(async () => {
      await passOnce(drivePass);
      return tokensAsTheNextHoldOpens !== undefined;
    }, () => `the hold after the Airlock agent's end opening: ${hephaestusLog.join('\n')}`);
    expect(airlockAgentJobId, hephaestusLog.join('\n')).not.toBeNull();
    expect(storedLogTextOf(repositoryDirectory)).toContain(`"kind":"job-ended","jobId":"${airlockAgentJobId ?? ''}"`);
    expect(tokensAsTheNextHoldOpens).toBe(CREDITED_INPUT_TOKENS);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

async function runRefused(commandLineArguments: readonly string[]): Promise<string> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
  const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` was not refused: ${context.outputText()}`).toBe(1);
  return `${context.outputText()}\n${context.errorText()}`;
}

/** A Baton naming this very process, so it reads as live, its URL the given one. */
function acquireLiveBaton(url: string): { hephaestusDirectory: string; generation: number } {
  const { hephaestusDirectory } = hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
  mkdirSync(hephaestusDirectory, { recursive: true });
  const identity = identityOf(process.pid);
  if (identity === null) throw new Error('this process has no readable identity');
  const acquisition = Baton.acquire(ports, hephaestusDirectory, {
    processId:            identity.processId,
    processStartStamp:    identity.startStamp,
    bootIdentity:         identity.bootIdentity,
    port:                 Number(new URL(url).port),
    url,
    tokenFile:            join(hephaestusDirectory, 'token'),
    codeVersion:          'code-example',
    installVersion:       1,
    talosProtocolVersion: 1,
  });
  if (acquisition.verdict !== 'acquired') throw new Error('the live Baton was not acquired');
  return { hephaestusDirectory, generation: acquisition.generation };
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
  }, () => `the build job becoming ${state}: ${hephaestusLog.join('\n')}\n${JSON.stringify(storedProgressOf(repositoryDirectory).jobs)}`);
}

describe('usage limits', () => {
  test('a top-level rejected limit interrupts the job uncounted, marks the machine, logs it and stops the session; nothing resumes before the reset', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: rateLimitLine('rejected', 'five_hour', 'rejected') },
      { kind: 'print', line: fakeRateLimitedResultLine() },
      { kind: 'await-line' },
    ]));
    await passUntilBuildSessionSpawned(drivePass);
    const jobId = buildJobId();
    await passUntilBuildJobIs(drivePass, 'interrupted');
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === jobId)).toMatchObject({
      state: 'interrupted', interruption: 'usage-limit', crashResumes: 0, childInstance: 1
    });
    const usageLimitHit = { kind: 'usage-limit-hit', jobId, fields: { window: 'five_hour', resetsAt: USAGE_RESET_STAMP } };
    expect(storedLogTextOf(repositoryDirectory)).toContain(JSON.stringify(usageLimitHit).slice(1));
    expect(storedLogTextOf(repositoryDirectory)).not.toContain(`"kind":"job-ended","jobId":"${jobId}"`);
    expect(UsageMarkerFile.read(monitorFolder)).toMatchObject({
      verdict: 'read',
      marker:  { vendor: 'fake-agent', window: 'five_hour', resetsAt: USAGE_RESET_STAMP }
    });
    await untilChildEnded(jobId, 1);
    await passOnce(drivePass);
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).filter((job) => job.kind === 'build')).toMatchObject([{ id: jobId, state: 'interrupted', childInstance: 1 }]);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).some((job) => job.kind === 'assistant')).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

});

describe('the verbs beside a Hephaestus', () => {
  test('a written verb nudges the live baton\'s URL body-less once its write is stored, and stays silent when nobody answers', async () => {
    const nudges: { method: string; path: string; body: string; writeWasStored: boolean }[] = [];
    const fakeHephaestus = Bun.serve({
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
      acquireLiveBaton(fakeHephaestus.url.href);
      await run(['log', 'Example milestone']);
      expect(nudges).toEqual([{
        method: 'POST', path: '/api/nudge', body: '', writeWasStored: true
      }]);
    } finally {
      await fakeHephaestus.stop(true);
    }
    const unanswered = await run(['log', 'Example milestone nobody hears']);
    expect(unanswered.errorText()).toBe('');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('ticket deliver --by-hand is refused hephaestus-owns-the-lifecycle while a Baton is live, and records byHand once none is', async () => {
    const baton = acquireLiveBaton('http://127.0.0.1:1/');
    expect(await runRefused(['ticket', 'deliver', '001', '--by-hand'])).toContain('A Hephaestus drives this board at http://127.0.0.1:1/');
    expect(deliveredRecordsOf('001')).toEqual([]);

    Baton.release(baton.hephaestusDirectory, baton.generation);
    await run(['ticket', 'deliver', '001', '--by-hand']);
    expect(deliveredRecordsOf('001')).toEqual([{ byHand: true }]);
    expect(storedProgressOf(repositoryDirectory).jobs ?? []).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
