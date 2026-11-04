/**
 * The DrivePass's code on a scratch tracker behind the Watcher boundary, `src/testing/RecordedWatcherStages.ts` playing each session. What matters: a
 * readied ticket gets a `launching` job and a session in one pass; a Hatch request and the `result` of the turn that wrote it, read in one pass,
 * are applied request first; a request in another job's folder, or naming a job, is refused and a replay is never applied twice; a pass with
 * nothing changed does not run, however late; a launched job's Hatch folder watch closes once the job has left the board; and a job the pass
 * hold ends has its session's tokens on its ticket's row by the end of that hold.
 * Beside the Overseer, `ticket deliver --by-hand` is refused while a job of the ticket is live. `cli/overseer/OverseerDrivePass.integration.spec.ts`
 * holds the real-system claims.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join }                             from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';


import { hatchReplyFilePathOf, writeHatchRequest }          from '../../src/adapters/hatch/HatchFolder.ts';
import { UsageMarkerFile }                                  from '../../src/adapters/usage-marker/UsageMarkerFile.ts';
import { OperationRefusalWordingUtil }                      from '../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import type { AgentAdapter }                                from '../../src/lib/agent-launch/AgentAdapter.ts';
import { createWindowsExecutableResolver }                  from '../../src/lib/executable-resolver/WindowsExecutableResolver.ts';
import type { PlatformWatch }                               from '../../src/lib/quiet-watch/QuietWatch.ts';
import type { Board }                                       from '../../src/lib/tracker-model/Board.ts';
import { watcherFilesOf }                                   from '../../src/lib/watcher/WatcherFiles.ts';
import { DataFolderWatch }                                  from '../../src/services/overseer/DataFolderWatch.ts';
import type { DrivePass, DrivePassRequest }                 from '../../src/services/overseer/DrivePass.ts';
import { HatchInbox }                                       from '../../src/services/overseer/HatchInbox.ts';
import { WatcherFleet }                                     from '../../src/services/overseer/WatcherFleet.ts';
import { requireWorkspace }                                 from '../../src/services/tracker/Workspace.ts';
import { createScratchDrivePass, FAKE_WATCHER_BUNDLE_PATH } from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  fakeAgentAdapter,
  fakeRateLimitedResultLine,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                                  from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                  from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                       from '../../src/testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                              from '../../src/testing/RecordedGitFlow.ts';
import { type RecordedWatcherStages, useRecordedWatcherStages } from '../../src/testing/RecordedWatcherStages.ts';
import { createScratchDirectory, removeScratchDirectory }       from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT }    from '../../src/testing/ToolGuard.ts';
import { waitUntil }                                            from '../../src/testing/WaitUntil.ts';
import { createCapturedCommandContext }                         from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }               from '../testing/InitializedScratchRepository.ts';
import { runCommandLineWithOverseerMoves }                      from '../testing/OverseerTicketMoves.ts';
import { fileReadyTicket }                                      from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                      from '../testing/StoredLogText.ts';
import { storedProgressOf }                                     from '../testing/StoredProgress.ts';

const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const world = useRecordedWatcherStages(nativePlatformPorts());
let ports: RecordedWatcherStages['ports'];
let repositoryDirectory = '';
let monitorFolder = '';
let overseerLog: string[] = [];
const drivePassesOfThisTest: DrivePass[] = [];

async function run(commandLineArguments: readonly string[]) {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK, platformPorts: ports });
  const exitCode = await runCommandLineWithOverseerMoves(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

const SPEC_STAMP = '2026-09-18T22:11:03+02:00';

function drivePassWith(
  adapter: AgentAdapter,
  afterHoldPhase?: (phase: string, board: Board) => void,
  clock: { stamp: string } = { stamp: SPEC_STAMP },
  endpointOverride: Partial<RecordedWatcherStages['ports']['localEndpoint']> = {},
  requestOverrides: Partial<DrivePassRequest> = {},
): Promise<DrivePass> {
  const drivePass = createScratchDrivePass({
    platformPorts:     { ...ports, localEndpoint: { ...ports.localEndpoint, ...endpointOverride }, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:     world.processStarts,
    workspace:         requireWorkspace(repositoryDirectory),
    now:               () => new Date(Date.parse(clock.stamp)),
    formatStamp:       () => clock.stamp,
    watcherBundlePath: FAKE_WATCHER_BUNDLE_PATH,
    agentAdapter:      adapter,
    monitorFolder,
    mainLine:          RECORDED_FLOW_MAIN_LINE,
    log:               (line) => overseerLog.push(line),
    ...(afterHoldPhase === undefined ? {} : { afterHoldPhase }),
    ...requestOverrides,
  });
  drivePassesOfThisTest.push(drivePass);
  return Promise.resolve(drivePass);
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

/**
 * Each job's log ends up holding the Overseer's first message and the session's started line, in either order; once both are there and
 * read, with the Watcher live, a `WAITING_SESSION` job's log stops changing until the spec acts.
 */
function everyJobHasReadItsWholeStart(): boolean {
  const jobs = storedProgressOf(repositoryDirectory).jobs ?? [];
  return jobs.length > 0 && jobs.every((job) => {
    const folder = jobFolder(job.id);
    const entries = WatcherFleet.eventsAfter(folder, job.watcherInstance, 0);
    if (entries === 'malformed' || job.state !== 'running' || WatcherFleet.livenessOf(ports, folder, job.watcherInstance).verdict !== 'live') return false;
    const origins = new Set(entries.map((entry) => entry.origin));
    const cursorIsAtTheEnd = job.eventCursor.instance === job.watcherInstance && job.eventCursor.sequence === entries.at(-1)?.sequence;
    return origins.has('client') && origins.has('agent') && cursorIsAtTheEnd;
  });
}

function hatchDirectory(jobId: string): string {
  return HatchInbox.hatchDirectoryOf(repositoryDirectory, jobId);
}

function lowFinding(requestId: string, title: string): Parameters<typeof writeHatchRequest>[1] {
  return {
    hatchFormatVersion: 1,
    requestId,
    command:            {
      kind:          'ticket-add',
      title,
      type:          'bug',
      priority:      'low',
      dependsOn:     [],
      epics:         [],
      network:       [],
      introducedBy:  null,
      foundInReview: null,
      bodyText:      null,
    }
  };
}

beforeEach(async () => {
  ({ ports } = world);
  repositoryDirectory = await createInitializedRecordedGitRepository('drive-pass', ['--project', 'Example Agency'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  monitorFolder = createScratchDirectory('h');
  overseerLog = [];
  await run(['gate', 'add', 'checks', '--', 'true']);
  await run(['oversee', 'resume']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

afterEach(async () => {
  await Promise.all(drivePassesOfThisTest.splice(0).map(async (drivePass) => await drivePass.stop()));
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

/** A build job launches, prepares its worktree, then runs: forced passes until its session's Watcher is spawned. */
async function passUntilBuildSessionSpawned(drivePass: DrivePass): Promise<void> {
  await waitUntil(async () => {
    await passOnce(drivePass);
    const buildJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
    return buildJob !== undefined && WatcherFleet.livenessOf(ports, jobFolder(buildJob.id), 1).verdict !== 'unclaimed';
  }, () => `the build session being spawned: ${overseerLog.join('\n')}\n${JSON.stringify(storedProgressOf(repositoryDirectory).jobs)}`);
}

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'one pass', () => {
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
  });

  test('on Windows an npm claude.cmd first on PATH launches no session and is noticed in words naming the install command, with no spawn-failed end', async () => {
    const shimPath = 'C:\\Users\\example\\AppData\\Roaming\\npm\\claude.cmd';
    const fakeFiles: Readonly<Record<string, string>> = { claude: shimPath };
    const windowsResolver = createWindowsExecutableResolver({ lookUp: (name) => (Object.hasOwn(fakeFiles, name) ? fakeFiles[name] ?? null : null), realPathOf: (path) => path });
    const adapter: AgentAdapter = { ...fakeAgentAdapter(), programPathOf: (_resolver, forbiddenRoots) => windowsResolver.absolutePathOf('claude', forbiddenRoots) };
    const drivePass = await drivePassWith(adapter);
    await passOnce(drivePass);
    await passOnce(drivePass);

    expect(drivePass.state().notices).toContainEqual(expect.objectContaining({ kind: 'agent-program-refused', jobId: buildJobId(), cause: 'batch-target' }));
    const noticeText = OperationRefusalWordingUtil.agentProgramRefusalTextOf(buildJobId(), 'batch-target', `${shimPath} is a batch file`);
    expect(noticeText).toContain('irm https://claude.ai/install.ps1 | iex');
    expect(WatcherFleet.livenessOf(ports, jobFolder(buildJobId()), 1).verdict).toBe('unclaimed');
  });

  test('an endpoint this platform cannot bind launches no session and is noticed, before any launch file exists', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter(), undefined, undefined, { endpointFits: () => false });
    await passOnce(drivePass);
    await passOnce(drivePass);

    expect(drivePass.state().notices).toContainEqual(expect.objectContaining({ kind: 'watcher-endpoint-does-not-fit', jobId: buildJobId() }));
    expect(existsSync(watcherFilesOf(jobFolder(buildJobId()), 1).launchPath)).toBe(false);
    expect(WatcherFleet.livenessOf(ports, jobFolder(buildJobId()), 1).verdict).toBe('unclaimed');
  });

  test('a Hatch request and the result of the turn that wrote it, read in one pass, are applied request first', async () => {
    const phases: { phase: string; jobState: string | undefined; findingFiled: boolean }[] = [];
    const recordPhase = (phase: string, board: Board): void => {
      const buildJob = board.jobs().find((job) => job.kind === 'build');
      const jobId = buildJob?.id;
      phases.push({ phase, jobState: buildJob?.state, findingFiled: board.tickets().some((ticket) => ticket.frontmatter.filedByJob === jobId) });
    };
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: fakeResultLine({ outcome: 'built' }) },
      { kind: 'exit', code: 0 },
    ]), recordPhase);
    await passUntilBuildSessionSpawned(drivePass);
    const firstBuildJobId = buildJobId();
    await untilWatcherEnded(firstBuildJobId, 1);
    writeHatchRequest(hatchDirectory(firstBuildJobId), lowFinding('request-1', 'Example finding beside the build'));
    phases.length = 0;
    await passOnce(drivePass);
    // The report names no head, so verification in the same hold fails the pass and the policy launches attempt 2, which filed nothing;
    // the passes that carry attempt 2 on follow in the same wake.
    expect(phases.slice(0, 3), overseerLog.join('\n')).toEqual([
      { phase: 'relayed-commands', jobState: 'running', findingFiled: true },
      { phase: 'watcher-events', jobState: 'in-customs', findingFiled: true },
      { phase: 'lifecycle', jobState: 'launching', findingFiled: false },
    ]);
    expect(JSON.parse(readFileSync(hatchReplyFilePathOf(hatchDirectory(firstBuildJobId), 'request-1'), 'utf8'))).toMatchObject({ outcome: 'done' });
  });

});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the Hatch inbox', () => {
  test('a request naming a job of its own is refused, a replay is never applied twice, and an unknown job\'s folder is not read', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    const jobId = buildJobId();
    writeHatchRequest(hatchDirectory(jobId), { ...lowFinding('request-forged', 'Forged finding'), jobId: 'J7' } as never);
    writeHatchRequest(hatchDirectory(jobId), lowFinding('request-1', 'Example finding'));
    writeHatchRequest(hatchDirectory('J9'), lowFinding('request-9', 'Finding in a folder no job owns'));
    await passOnce(drivePass);
    expect(JSON.parse(readFileSync(hatchReplyFilePathOf(hatchDirectory(jobId), 'request-forged'), 'utf8')))
      .toMatchObject({ outcome: 'refused', detail: { kind: 'hatch-identity-mismatch', requestId: 'request-forged', jobId } });
    expect(existsSync(hatchReplyFilePathOf(hatchDirectory('J9'), 'request-9'))).toBe(false);

    rmSync(hatchReplyFilePathOf(hatchDirectory(jobId), 'request-1'));
    await passOnce(drivePass);
    const appliedRecords = storedLogTextOf(repositoryDirectory).split('\n').filter((line) => line !== '')
      .map((line) => JSON.parse(line) as { kind: string; fields: unknown }).filter((entry) => entry.kind === 'hatch-applied');
    expect(appliedRecords.map((entry) => entry.fields)).toEqual([
      { requestId: 'request-1', commandKind: 'ticket-add', outcome: 'done' },
      { requestId: 'request-forged', commandKind: 'unread', outcome: 'refused' },
    ]);
    expect(storedProgressOf(repositoryDirectory).tasks.length).toBeGreaterThan(0);
  });

  test('a request of a Hatch format this Overseer does not read stays pending, unanswered and unlogged, for the Overseer a Baton pass brings', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    const jobId = buildJobId();
    writeHatchRequest(hatchDirectory(jobId), { ...lowFinding('request-newer', 'Finding in a newer Hatch format'), hatchFormatVersion: 2 } as never);
    writeHatchRequest(hatchDirectory(jobId), lowFinding('request-1', 'Example finding'));
    await passOnce(drivePass);
    await passOnce(drivePass);
    expect(existsSync(hatchReplyFilePathOf(hatchDirectory(jobId), 'request-newer'))).toBe(false);
    expect(existsSync(hatchReplyFilePathOf(hatchDirectory(jobId), 'request-1'))).toBe(true);
    expect(storedLogTextOf(repositoryDirectory)).not.toContain('request-newer');
  });
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


async function ticketTaskId(): Promise<number> {
  const shown = JSON.parse((await run(['ticket', 'show', '001', '--json'])).outputText()) as { task: number | null };
  if (shown.task === null) throw new Error('ticket 001 has no row');
  return shown.task;
}

function rowTokensOf(tasks: readonly { id: number; tokens: number | null }[], taskId: number): number | null {
  return tasks.find((task) => task.id === taskId)?.tokens ?? null;
}

/** Stands in for the platform watch, so a spec counts the watches still open; no real file watch starts. */
function countingFolderWatches(): { platformWatch: PlatformWatch; openFolders: string[] } {
  const openFolders: string[] = [];
  return {
    platformWatch: (folderPath) => {
      openFolders.push(folderPath);
      const handle = {
        close: () => {
          const index = openFolders.indexOf(folderPath);
          if (index >= 0) openFolders.splice(index, 1);
        },
        on: () => handle,
      };
      return handle;
    },
    openFolders,
  };
}

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the Hatch folder watches', () => {
  test('a launched job\'s Hatch folder watch closes once the job has ended, leaving only the watches of the jobs still on the board', async () => {
    const { platformWatch, openFolders } = countingFolderWatches();
    const workspace = requireWorkspace(repositoryDirectory);
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory: workspace.trackerDirectory, repositoryRoot: workspace.rootDirectory, wake: () => undefined, sweepMilliseconds: 600_000, platformWatch
    });
    const baseWatches = [...openFolders];
    const hatchFolderOf = (jobId: string): string => HatchInbox.hatchDirectoryOf(workspace.rootDirectory, jobId);
    try {
      const drivePass = await drivePassWith(fakeAgentAdapter([
        { kind: 'print', line: fakeStartedLine('fake-session') },
        { kind: 'print', line: fakeResultLine({ outcome: 'built' }) },
        { kind: 'exit', code: 0 },
      ]), undefined, undefined, {}, { watchHatchFolder: watcher.watchHatchFolder, unwatchHatchFolder: watcher.unwatchHatchFolder });
      await passUntilBuildSessionSpawned(drivePass);
      const firstBuildJobId = buildJobId();
      expect(openFolders).toContain(hatchFolderOf(firstBuildJobId));
      await untilWatcherEnded(firstBuildJobId, 1);
      await passOnce(drivePass);
      await passOnce(drivePass);
      expect(storedLogTextOf(repositoryDirectory), overseerLog.join('\n')).toContain(`"kind":"job-ended","jobId":"${firstBuildJobId}"`);
      const liveHatchFolders = (storedProgressOf(repositoryDirectory).jobs ?? []).map((job) => hatchFolderOf(job.id));
      expect(openFolders).not.toContain(hatchFolderOf(firstBuildJobId));
      expect(openFolders.filter((folder) => !liveHatchFolders.includes(folder))).toEqual(baseWatches);
    } finally {
      watcher.stop();
    }
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'crediting an ended job\'s tokens', () => {
  test('a build job the pass hold ends has its session\'s tokens on its ticket\'s row once that hold is written', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      TURN_WITH_USAGE,
      { kind: 'print', line: fakeResultLine({ outcome: 'built' }) },
      { kind: 'exit', code: 0 },
    ]));
    await passUntilBuildSessionSpawned(drivePass);
    const firstBuildJobId = buildJobId();
    await untilWatcherEnded(firstBuildJobId, 1);
    const taskId = await ticketTaskId();
    expect(rowTokensOf(storedProgressOf(repositoryDirectory).tasks, taskId)).toBeNull();
    await passOnce(drivePass);
    expect(storedLogTextOf(repositoryDirectory), overseerLog.join('\n')).toContain(`"kind":"job-ended","jobId":"${firstBuildJobId}"`);
    expect(rowTokensOf(storedProgressOf(repositoryDirectory).tasks, taskId)).toBe(CREDITED_INPUT_TOKENS);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'waking', () => {
  test('an unforced wake with nothing changed runs no pass, however late, and wakes during a pass coalesce into one more', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    await waitUntil(async () => {
      await passOnce(drivePass, false);
      return everyJobHasReadItsWholeStart();
    }, () => `every job reading its whole start: ${overseerLog.join('\n')}`);
    const settled = drivePass.state().passes;
    await passOnce(drivePass, false);
    expect(drivePass.state().passes).toBe(settled);

    writeHatchRequest(hatchDirectory(buildJobId()), lowFinding('request-1', 'Example finding'));
    drivePass.wake();
    drivePass.wake();
    drivePass.wake();
    await drivePass.idle();
    expect(drivePass.state().passes).toBe(settled + 1);
  });
});

async function runRefused(commandLineArguments: readonly string[]): Promise<string> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK, platformPorts: ports });
  const exitCode = await runCommandLineWithOverseerMoves(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` was not refused: ${context.outputText()}`).toBe(1);
  return `${context.outputText()}\n${context.errorText()}`;
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

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'usage limits', () => {
  test('a top-level rejected limit interrupts the job uncounted, marks the machine, logs it and stops the Watcher; nothing resumes before the reset', async () => {
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
  });

  test('once the marker\'s reset has passed the interrupted job resumes by id in a new Watcher instance', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: rateLimitLine('rejected', 'five_hour', 'rejected') },
      { kind: 'await-line' },
    ]));
    await passUntilBuildSessionSpawned(drivePass);
    const jobId = buildJobId();
    await passUntilBuildJobIs(drivePass, 'interrupted');
    await untilWatcherEnded(jobId, 1);
    UsageMarkerFile.write(monitorFolder, {
      vendor: 'fake-agent', window: 'five_hour', resetsAt: '2026-09-18T20:00:00.000Z', seenBy: { trackerId: 'example', jobId }
    });
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === jobId)).toMatchObject({ state: 'running', watcherInstance: 2 });
    expect(storedLogTextOf(repositoryDirectory)).toContain(`"kind":"job-resumed","jobId":"${jobId}","fields":{"watcherInstance":2,"cause":"usage-limit"}`);
    expect(readFileSync(watcherFilesOf(jobFolder(jobId), 2).launchPath, 'utf8')).toContain('fake-agent-scenario.json');
  });

  test('the Overseer wakes a pass of its own at the marker\'s reset, which resumes the interrupted job with no other wake', async () => {
    const clock = { stamp: SPEC_STAMP };
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: rateLimitLine('rejected', 'five_hour', 'rejected') },
      { kind: 'await-line' },
    ]), undefined, clock);
    await passUntilBuildSessionSpawned(drivePass);
    const jobId = buildJobId();
    await passUntilBuildJobIs(drivePass, 'interrupted');
    await untilWatcherEnded(jobId, 1);
    UsageMarkerFile.write(monitorFolder, {
      vendor: 'fake-agent', window: 'five_hour', resetsAt: '2026-09-18T20:11:03.300Z', seenBy: { trackerId: 'example', jobId }
    });
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === jobId)).toMatchObject({ state: 'interrupted', watcherInstance: 1 });
    clock.stamp = '2026-09-18T22:11:04+02:00';
    await waitUntil(async () => {
      await drivePass.idle();
      return (storedProgressOf(repositoryDirectory).jobs ?? []).some((job) => job.id === jobId && job.watcherInstance === 2);
    }, () => `the interrupted job resuming on instance 2: ${overseerLog.join('\n')}`);
  });

  test('a per-window warning, or a window rejected under an allowed top level, interrupts nothing and writes no marker', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: rateLimitLine('allowed_warning', 'seven_day', 'allowed_warning') },
      { kind: 'print', line: rateLimitLine('allowed', 'five_hour', 'rejected') },
      { kind: 'await-line' },
    ]));
    await passUntilBuildSessionSpawned(drivePass);
    const jobId = buildJobId();
    const { eventLogPath } = watcherFilesOf(jobFolder(jobId), 1);
    await waitUntil(() => existsSync(eventLogPath) && readFileSync(eventLogPath, 'utf8').includes('five_hour'), 'the session\'s limit lines in its event log');
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === jobId)?.state).toBe('running');
    expect(UsageMarkerFile.read(monitorFolder)).toEqual({ verdict: 'absent' });
    expect(storedLogTextOf(repositoryDirectory)).not.toContain('usage-limit-hit');
  });
});


describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the verbs beside an overseer', () => {
  test('ticket deliver --by-hand is refused ticket-has-live-job while a job of the ticket is on the board', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    expect(await runRefused(['ticket', 'deliver', '001', '--by-hand'])).toContain(`Ticket #001 has job ${buildJobId()} live (running)`);
    expect(deliveredRecordsOf('001')).toEqual([]);
  });
});
