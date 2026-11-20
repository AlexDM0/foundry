/**
 * The DrivePass's code on a scratch tracker behind the Talos boundary, `src/testing/RecordedTalosStages.ts` playing each session. What matters: a
 * readied ticket gets a `launching` job and a session in one pass; a Hatch request and the `result` of the turn that wrote it, read in one pass,
 * are applied request first; a build's launch asks Talos to stop the groups its session left and the Assistant's does not; a launch is a
 * `launch` frame; a recognised outage interrupts its job `network-outage` and stops its session, and the job never moves to `in-customs`;
 * an end `paused` interrupts `talos-paused` and resumes on the next pass, and an end `lease-ended` interrupts `lease-ended` and nothing resumes it; a
 * request in another job's folder, or naming a job, is refused and a replay is never applied twice; a reply lost after its hold committed is
 * written again from its `hatch-applied` record, unapplied, and a record carrying no reply leaves it unanswered; a pass with nothing changed does not run,
 * however late, and a write by another client of the store between two wakes is seen by the next one; one pass reads the install version
 * once, so its runtime state and notices never disagree; a launched job's Hatch folder watch closes once the job has left the board; and a
 * job the pass hold ends has its session's tokens on its ticket's row by the end of that hold. At a start after a reboot, a stop or a crash,
 * a job whose child is gone with no end of its own takes the start's cause and waits for User's resume, a child that ended keeps the cause
 * of its end, and new work still launches.
 * Beside the Overseer, `ticket deliver --by-hand` is refused while a job of the ticket is live. `cli/overseer/OverseerDrivePass.integration.spec.ts`
 * holds the real-system claims.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';


import { hatchReplyFilePathOf, writeHatchRequest }              from '../../src/adapters/hatch/HatchFolder.ts';
import { MachineLimitsFile }                                    from '../../src/adapters/machine-limits/MachineLimitsFile.ts';
import { UsageMarkerFile }                                      from '../../src/adapters/usage-marker/UsageMarkerFile.ts';
import { UsageWindowsFile }                                     from '../../src/adapters/usage-marker/UsageWindowsFile.ts';
import type { AgentAdapter }                                    from '../../src/lib/agent-launch/AgentAdapter.ts';
import { createWindowsExecutableResolver }                      from '../../src/lib/executable-resolver/WindowsExecutableResolver.ts';
import type { PlatformWatch }                                   from '../../src/lib/quiet-watch/QuietWatch.ts';
import type { Job, StartKind }                                  from '../../src/lib/tracker-model/@types/Job.ts';
import type { Board }                                           from '../../src/lib/tracker-model/Board.ts';
import type { StartClassificationVerdict }                      from '../../src/services/overseer/@types/StartClassification.ts';
import { AGENT_SLOTS_FOLDER }                                   from '../../src/services/overseer/AgentSlots.ts';
import type { BoardChildren }                                   from '../../src/services/overseer/BoardChildren.ts';
import { DataFolderWatch }                                      from '../../src/services/overseer/DataFolderWatch.ts';
import type { DrivePass }                                       from '../../src/services/overseer/DrivePass.ts';
import { HatchInbox }                                           from '../../src/services/overseer/HatchInbox.ts';
import { jobFolderIn }                                          from '../../src/services/overseer/OverseerFiles.ts';
import { localStoreLayoutOf }                                   from '../../src/services/tracker/LocalStoreLayout.ts';
import { requireWorkspace, workspacePathsFor }                  from '../../src/services/tracker/Workspace.ts';
import { SESSION_STOP_GRACE_MILLISECONDS }                      from '../../src/shared/constants/OverseerLimits.ts';
import { createScratchDrivePass, type ScratchDrivePassRequest } from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  fakeAgentAdapter,
  fakeRateLimitedResultLine,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                               from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                               from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                    from '../../src/testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                           from '../../src/testing/RecordedGitFlow.ts';
import { type RecordedTalosStages, useRecordedTalosStages }  from '../../src/testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory }    from '../../src/testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }              from '../../src/testing/TalosChildReadings.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT } from '../../src/testing/ToolGuard.ts';
import { waitUntil }                                         from '../../src/testing/WaitUntil.ts';
import { createCapturedCommandContext }                      from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }            from '../testing/InitializedScratchRepository.ts';
import { runCommandLineWithOverseerMoves }                   from '../testing/OverseerTicketMoves.ts';
import { fileReadyTicket }                                   from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                   from '../testing/StoredLogText.ts';
import { storedProgressOf }                                  from '../testing/StoredProgress.ts';
import { OverseerWording }                                   from './OverseerWording.ts';

const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const world = useRecordedTalosStages(nativePlatformPorts());
let ports: RecordedTalosStages['ports'];
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

function trackerDirectory(): string {
  return requireWorkspace(repositoryDirectory).trackerDirectory;
}

/** The children as the Overseer reads them, through Talos's adapter over the case's platform ports. */
function childReadings(): BoardChildren {
  return talosChildReadingsWith(ports, trackerDirectory());
}

function drivePassWith(
  adapter: AgentAdapter,
  afterHoldPhase?: (phase: string, board: Board) => void,
  clock: { stamp: string } = { stamp: SPEC_STAMP },
  requestOverrides: Partial<ScratchDrivePassRequest> = {},
): Promise<DrivePass> {
  const drivePass = createScratchDrivePass({
    platformPorts:   { ...ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:   world.processStarts,
    workspace:       requireWorkspace(repositoryDirectory),
    now:             () => new Date(Date.parse(clock.stamp)),
    formatStamp:     () => clock.stamp,
    talosConnection: () => world.connectionFor(trackerDirectory()),
    agentAdapter:    adapter,
    monitorFolder,
    mainLine:        RECORDED_FLOW_MAIN_LINE,
    log:             (line) => overseerLog.push(line),
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
  return jobFolderIn(requireWorkspace(repositoryDirectory).trackerDirectory, jobId);
}

async function untilChildEnded(jobId: string, instance: number): Promise<void> {
  await waitUntil(() => childReadings().livenessOf(jobFolder(jobId), instance).verdict === 'ended', () => `child ${instance} of ${jobId} ending: ${overseerLog.join('\n')}`);
}

/** The policy boots the Assistant beside the build, so the build's job id is looked up rather than assumed. */
function buildJobId(): string {
  const buildJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
  if (buildJob === undefined) throw new Error(`no build job was launched: ${overseerLog.join('\n')}`);
  return buildJob.id;
}

/** A session that starts and then waits on its stdin past the Overseer's first message, so its child stays live until the spec ends it. */
const WAITING_SESSION = fakeAgentAdapter([{ kind: 'print', line: fakeStartedLine('fake-session') }, { kind: 'await-line' }, { kind: 'await-line' }]);

/**
 * Each job's log ends up holding the Overseer's first message and the session's started line, in either order; once both are there and
 * read, with the child live, a `WAITING_SESSION` job's log stops changing until the spec acts.
 */
function everyJobHasReadItsWholeStart(): boolean {
  const jobs = storedProgressOf(repositoryDirectory).jobs ?? [];
  return jobs.length > 0 && jobs.every((job) => {
    const folder = jobFolder(job.id);
    const entries = childReadings().eventsAfter(folder, job.childInstance, 0);
    if (entries === 'malformed' || job.state !== 'running' || childReadings().livenessOf(folder, job.childInstance).verdict !== 'live') return false;
    const origins = new Set(entries.map((entry) => entry.origin));
    const cursorIsAtTheEnd = job.eventCursor.instance === job.childInstance && job.eventCursor.sequence === entries.at(-1)?.sequence;
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

/** A build job launches, prepares its worktree, then runs: forced passes until its session's child is launched. */
async function passUntilBuildSessionSpawned(drivePass: DrivePass): Promise<void> {
  await waitUntil(async () => {
    await passOnce(drivePass);
    const buildJob = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
    return buildJob !== undefined && childReadings().livenessOf(jobFolder(buildJob.id), 1).verdict !== 'unlaunched';
  }, () => `the build session being spawned: ${overseerLog.join('\n')}\n${JSON.stringify(storedProgressOf(repositoryDirectory).jobs)}`);
}

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'one pass', () => {
  test('one wake carries a readied ticket\'s job from launching through its prepared worktree to running, and its session a child of Talos running the fake agent', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter());
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === buildJobId())).toMatchObject({
      kind: 'build', role: 'builder', ticketIds: ['001'], state: 'running', childInstance: 1
    });
    await passUntilBuildSessionSpawned(drivePass);
    await untilChildEnded(buildJobId(), 1);
    expect(readFileSync(childFilesIn(jobFolder(buildJobId()), 1).eventLogPath, 'utf8')).toContain(JSON.stringify(fakeStartedLine('fake-session')));
    expect(world.launchOf(jobFolder(buildJobId()), 1)).toMatchObject({
      childFolder: `jobs/${buildJobId()}`, instance: 1, kind: 'agent', label: buildJobId()
    });
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

    expect(drivePass.state().notices).toContainEqual(expect.objectContaining({
      kind: 'agent-program-refused', jobId: buildJobId(), cause: 'batch-target', repair: adapter.programRepairOf('batch-target')
    }));
    const noticeTexts = drivePass.state().notices.map(OverseerWording.noticeTextOf);
    expect(noticeTexts.find((text) => text.startsWith(`job ${buildJobId()} is not launched: ${shimPath} is a batch file`))).toContain('irm https://claude.ai/install.ps1 | iex');
    expect(childReadings().livenessOf(jobFolder(buildJobId()), 1).verdict).toBe('unlaunched');
  });

  test('a launch no Talos takes leaves the job for the next pass, which launches it once Talos serves', async () => {
    let talosServes = false;
    const drivePass = await drivePassWith(fakeAgentAdapter(), undefined, undefined, { talosConnection: () => (talosServes ? world.connectionFor(trackerDirectory()) : null), });
    await passOnce(drivePass);
    await passOnce(drivePass);
    expect(childReadings().livenessOf(jobFolder(buildJobId()), 1).verdict).toBe('unlaunched');
    expect(overseerLog.join('\n')).toContain(`Child instance 1 of job ${buildJobId()} (build #001) did not launch: no Talos took it; the next pass tries again.`);

    talosServes = true;
    await passUntilBuildSessionSpawned(drivePass);
    expect(world.launchOf(jobFolder(buildJobId()), 1)).not.toBeNull();
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
    await untilChildEnded(firstBuildJobId, 1);
    writeHatchRequest(hatchDirectory(firstBuildJobId), lowFinding('request-1', 'Example finding beside the build'));
    phases.length = 0;
    await passOnce(drivePass);
    // The report names no head, so verification in the same hold fails the pass and the policy launches attempt 2, which filed nothing;
    // the passes that carry attempt 2 on follow in the same wake.
    expect(phases.slice(0, 3), overseerLog.join('\n')).toEqual([
      { phase: 'relayed-commands', jobState: 'running', findingFiled: true },
      { phase: 'child-events', jobState: 'in-customs', findingFiled: true },
      { phase: 'lifecycle', jobState: 'launching', findingFiled: false },
    ]);
    expect(JSON.parse(readFileSync(hatchReplyFilePathOf(hatchDirectory(firstBuildJobId), 'request-1'), 'utf8'))).toMatchObject({ outcome: 'done' });
  });

  test('the build session\'s launch asks for the stop at the end, and the Assistant\'s, which keeps its groups, does not', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    const launchOfKind = (kind: string): ReturnType<RecordedTalosStages['launchOf']> => {
      const job = (storedProgressOf(repositoryDirectory).jobs ?? []).find((candidate) => candidate.kind === kind);
      return job === undefined ? null : world.launchOf(jobFolder(job.id), job.childInstance);
    };
    await waitUntil(async () => {
      await passOnce(drivePass);
      return ['build', 'assistant'].every((kind) => launchOfKind(kind) !== null);
    }, () => `the build and Assistant launches: ${overseerLog.join('\n')}`);

    expect(launchOfKind('build')?.treeStopAtEndGraceMilliseconds).toBe(SESSION_STOP_GRACE_MILLISECONDS);
    expect(launchOfKind('assistant')?.treeStopAtEndGraceMilliseconds).toBeNull();
  });

});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the machine agent limit', () => {
  /** A live holding of another board, under this process's identity, so the Overseer reads it as the slot of a running Overseer. */
  function holdTheOnlyMachineSlotForAnotherBoard(): string {
    MachineLimitsFile.write(monitorFolder, { agentLimit: 1 });
    const slotsFolder = join(monitorFolder, AGENT_SLOTS_FOLDER);
    mkdirSync(slotsFolder, { recursive: true });
    const slotPath = join(slotsFolder, 'slot-1');
    const overseer = ports.processSupervision.identityOf(process.pid);
    writeFileSync(slotPath, `${JSON.stringify({
      version: 1, trackerId: 'other-board', jobId: 'J9', overseer
    })}\n`);
    return slotPath;
  }

  test('a ready ticket that finds no free machine slot launches no build and waits, and a sweep launches it once a slot is free', async () => {
    const otherBoardSlotPath = holdTheOnlyMachineSlotForAnotherBoard();
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).filter((job) => job.kind === 'build'), overseerLog.join('\n')).toEqual([]);
    expect(drivePass.state().ticketsWaitingForMachineSlot).toBe(1);

    rmSync(otherBoardSlotPath);
    drivePass.sweep();
    await drivePass.idle();
    expect(buildJobId()).toBeDefined();
    expect(drivePass.state().ticketsWaitingForMachineSlot).toBe(0);
    expect(JSON.parse(readFileSync(otherBoardSlotPath, 'utf8'))).toMatchObject({ version: 1, jobId: buildJobId() });
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
      {
        requestId: 'request-1', commandKind: 'ticket-add', outcome: 'done', ticketIds: [expect.any(String)]
      },
      {
        requestId:   'request-forged',
        commandKind: 'unread',
        outcome:     'refused',
        status:      'refused',
        detail:      { kind: 'hatch-identity-mismatch', requestId: 'request-forged', jobId },
      },
    ]);
    expect(storedProgressOf(repositoryDirectory).tasks.length).toBeGreaterThan(0);
  });

  test('a commit whose replies were never written (a crash or a Baton takeover) has each reply written again from its record, nothing applied twice', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    const jobId = buildJobId();
    writeHatchRequest(hatchDirectory(jobId), { ...lowFinding('request-forged', 'Forged finding'), jobId: 'J7' } as never);
    writeHatchRequest(hatchDirectory(jobId), lowFinding('request-1', 'Example finding'));
    await passOnce(drivePass);
    const replyTextOf = (requestId: string): string => readFileSync(hatchReplyFilePathOf(hatchDirectory(jobId), requestId), 'utf8');
    const firstReplies = [replyTextOf('request-1'), replyTextOf('request-forged')];
    const logTextAfterCommit = storedLogTextOf(repositoryDirectory);
    const ticketCountAfterCommit = storedProgressOf(repositoryDirectory).tasks.length;

    rmSync(hatchReplyFilePathOf(hatchDirectory(jobId), 'request-1'));
    rmSync(hatchReplyFilePathOf(hatchDirectory(jobId), 'request-forged'));
    await passOnce(drivePass);
    expect([replyTextOf('request-1'), replyTextOf('request-forged')]).toEqual(firstReplies);
    expect(JSON.parse(replyTextOf('request-1'))).toMatchObject({ outcome: 'done', ticketIds: [expect.any(String)] });
    expect(storedLogTextOf(repositoryDirectory)).toBe(logTextAfterCommit);
    expect(storedProgressOf(repositoryDirectory).tasks.length).toBe(ticketCountAfterCommit);
  });

  test('a reply write cut short after the first reply has only the missing reply written again, the written one left as it is', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    const jobId = buildJobId();
    writeHatchRequest(hatchDirectory(jobId), lowFinding('request-1', 'Example finding'));
    writeHatchRequest(hatchDirectory(jobId), lowFinding('request-2', 'Second example finding'));
    await passOnce(drivePass);
    const replyFileOf = (requestId: string): string => hatchReplyFilePathOf(hatchDirectory(jobId), requestId);
    const lostReplyText = readFileSync(replyFileOf('request-2'), 'utf8');
    // A marker the rebuild would overwrite, so the spec sees the written reply is not touched.
    const writtenReplyText = `${readFileSync(replyFileOf('request-1'), 'utf8')}\n`;
    writeFileSync(replyFileOf('request-1'), writtenReplyText);

    rmSync(replyFileOf('request-2'));
    await passOnce(drivePass);
    expect(readFileSync(replyFileOf('request-2'), 'utf8')).toBe(lostReplyText);
    expect(readFileSync(replyFileOf('request-1'), 'utf8')).toBe(writtenReplyText);
  });

  test('an applied request whose record carries no reply stays unanswered, never applied again', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    const jobId = buildJobId();
    const appliedWithoutReply = { requestId: 'request-1', commandKind: 'ticket-add', outcome: 'done' };
    appendFileSync(
      localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).logRecordPath,
      `${JSON.stringify({
        at: '2026-09-26T10:15:00+02:00', kind: 'hatch-applied', jobId, fields: appliedWithoutReply
      })}\n`,
    );
    const ticketCountBefore = storedProgressOf(repositoryDirectory).tasks.length;
    writeHatchRequest(hatchDirectory(jobId), lowFinding('request-1', 'Example finding'));
    await passOnce(drivePass);
    expect(existsSync(hatchReplyFilePathOf(hatchDirectory(jobId), 'request-1'))).toBe(false);
    expect(storedProgressOf(repositoryDirectory).tasks.length).toBe(ticketCountBefore);
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
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory: workspace.trackerDirectory, repositoryRoot: workspace.rootDirectory, wake: () => undefined, sweepMilliseconds: 600_000, platformWatch
    });
    const baseWatches = [...openFolders];
    const hatchFolderOf = (jobId: string): string => HatchInbox.hatchDirectoryOf(workspace.rootDirectory, jobId);
    try {
      const drivePass = await drivePassWith(fakeAgentAdapter([
        { kind: 'print', line: fakeStartedLine('fake-session') },
        { kind: 'print', line: fakeResultLine({ outcome: 'built' }) },
        { kind: 'exit', code: 0 },
      ]), undefined, undefined, { watchHatchFolder: dataFolderWatch.watchHatchFolder, unwatchHatchFolder: dataFolderWatch.unwatchHatchFolder });
      await passUntilBuildSessionSpawned(drivePass);
      const firstBuildJobId = buildJobId();
      expect(openFolders).toContain(hatchFolderOf(firstBuildJobId));
      await untilChildEnded(firstBuildJobId, 1);
      await passOnce(drivePass);
      await passOnce(drivePass);
      expect(storedLogTextOf(repositoryDirectory), overseerLog.join('\n')).toContain(`"kind":"job-ended","jobId":"${firstBuildJobId}"`);
      const liveHatchFolders = (storedProgressOf(repositoryDirectory).jobs ?? []).map((job) => hatchFolderOf(job.id));
      expect(openFolders).not.toContain(hatchFolderOf(firstBuildJobId));
      expect(openFolders.filter((folder) => !liveHatchFolders.includes(folder))).toEqual(baseWatches);
    } finally {
      dataFolderWatch.stop();
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
    await untilChildEnded(firstBuildJobId, 1);
    const taskId = await ticketTaskId();
    expect(rowTokensOf(storedProgressOf(repositoryDirectory).tasks, taskId)).toBeNull();
    await passOnce(drivePass);
    expect(storedLogTextOf(repositoryDirectory), overseerLog.join('\n')).toContain(`"kind":"job-ended","jobId":"${firstBuildJobId}"`);
    expect(rowTokensOf(storedProgressOf(repositoryDirectory).tasks, taskId)).toBe(CREDITED_INPUT_TOKENS);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'waking', () => {
  test('one pass reads the install version once: its runtime state and its notices agree when the answer changes during its hold', async () => {
    let installVersionChanged = false;
    // Flipped inside every hold, so each pass of the drain reads one answer before its hold and the other after it.
    const drivePass = await drivePassWith(
      fakeAgentAdapter(),
      (phase) => {
        if (phase === 'lifecycle') installVersionChanged = !installVersionChanged;
      },
      undefined,
      { installVersionChanged: () => installVersionChanged },
    );
    await passOnce(drivePass);
    const { runtimeState, notices } = drivePass.state();
    expect(notices.some((notice) => notice.kind === 'install-version-changed')).toBe(runtimeState === 'held-by-install-change');
  });

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

  test('a write by another client of the store between two wakes is seen by the next unforced pass; with no write the wake is skipped', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passOnce(drivePass);
    await waitUntil(async () => {
      await passOnce(drivePass, false);
      return everyJobHasReadItsWholeStart();
    }, () => `every job reading its whole start: ${overseerLog.join('\n')}`);
    const settled = drivePass.state().passes;
    await passOnce(drivePass, false);
    expect(drivePass.state().passes).toBe(settled);

    await run(['log', 'Example note from another client']);
    await passOnce(drivePass, false);
    expect(drivePass.state().passes).toBe(settled + 1);
    await passOnce(drivePass, false);
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
  });

  test('once the marker\'s reset has passed the interrupted job resumes by id in a new child instance', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: rateLimitLine('rejected', 'five_hour', 'rejected') },
      { kind: 'await-line' },
    ]));
    await passUntilBuildSessionSpawned(drivePass);
    const jobId = buildJobId();
    await passUntilBuildJobIs(drivePass, 'interrupted');
    await untilChildEnded(jobId, 1);
    UsageMarkerFile.write(monitorFolder, {
      vendor: 'fake-agent', window: 'five_hour', resetsAt: '2026-09-18T20:00:00.000Z', seenBy: { trackerId: 'example', jobId }
    });
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === jobId)).toMatchObject({ state: 'running', childInstance: 2 });
    expect(storedLogTextOf(repositoryDirectory)).toContain(`"kind":"job-resumed","jobId":"${jobId}","fields":{"childInstance":2,"cause":"usage-limit"}`);
    expect(world.launchOf(jobFolder(jobId), 2)?.argv.join(' ')).toContain('fake-agent-scenario.json');
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
    await untilChildEnded(jobId, 1);
    UsageMarkerFile.write(monitorFolder, {
      vendor: 'fake-agent', window: 'five_hour', resetsAt: '2026-09-18T20:11:03.010Z', seenBy: { trackerId: 'example', jobId }
    });
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === jobId)).toMatchObject({ state: 'interrupted', childInstance: 1 });
    clock.stamp = '2026-09-18T22:11:04+02:00';
    await waitUntil(async () => {
      await drivePass.idle();
      return (storedProgressOf(repositoryDirectory).jobs ?? []).some((job) => job.id === jobId && job.childInstance === 2);
    }, () => `the interrupted job resuming on instance 2: ${overseerLog.join('\n')}`);
  });

  test('a per-window warning, or a window rejected under an allowed top level, interrupts nothing and writes no marker, only the windows', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: rateLimitLine('allowed_warning', 'seven_day', 'allowed_warning') },
      { kind: 'print', line: rateLimitLine('allowed', 'five_hour', 'rejected') },
      { kind: 'await-line' },
    ]));
    await passUntilBuildSessionSpawned(drivePass);
    const jobId = buildJobId();
    const { eventLogPath } = childFilesIn(jobFolder(jobId), 1);
    await waitUntil(() => existsSync(eventLogPath) && readFileSync(eventLogPath, 'utf8').includes('five_hour'), 'the session\'s limit lines in its event log');
    await passOnce(drivePass);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === jobId)?.state).toBe('running');
    expect(UsageMarkerFile.read(monitorFolder)).toEqual({ verdict: 'absent' });
    expect(storedLogTextOf(repositoryDirectory)).not.toContain('usage-limit-hit');
    // The fake agent fills each planted line from a recorded one, so the window a line does not plant keeps its recorded values.
    const plantedFiveHour = {
      window: 'five_hour', lengthHours: 5, utilization: 1, resetsAt: USAGE_RESET_STAMP
    };
    await waitUntil(async () => {
      await passOnce(drivePass);
      const reading = UsageWindowsFile.read(monitorFolder);
      return reading.verdict === 'read' && reading.windows.some((observation) => Bun.deepEquals(observation, plantedFiveHour));
    }, () => `the planted window recorded: ${JSON.stringify(UsageWindowsFile.read(monitorFolder))}`);
    const reading = UsageWindowsFile.read(monitorFolder);
    expect(reading.verdict === 'read' ? reading.windows.map((observation) => observation.window) : []).toEqual(['five_hour', 'seven_day']);
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

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the ends Talos gives a session', () => {
  function buildJob(): Job | undefined {
    return (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === buildJobId());
  }

  test('a launch is a launch frame of the agent\'s plan in the job\'s folder', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passUntilBuildSessionSpawned(drivePass);
    expect(world.launchOf(jobFolder(buildJobId()), 1)).toMatchObject({
      childFolder: `jobs/${buildJobId()}`, instance: 1, kind: 'agent', timeBoundMilliseconds: null
    });
  });

  test('a result Talos recognised as a network outage interrupts the job network-outage and stops its session, never moving it to in-customs', async () => {
    const drivePass = await drivePassWith(fakeAgentAdapter([
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: fakeResultLine({ outcome: 'built' }) },
      { kind: 'await-line' },
    ]));
    await passUntilBuildSessionSpawned(drivePass);
    world.recogniseEndingOfTheLastLine(jobFolder(buildJobId()), 1, 'network-outage');
    await passOnce(drivePass);

    expect(buildJob()).toMatchObject({ state: 'interrupted', interruption: 'network-outage', childInstance: 1 });
    expect(storedLogTextOf(repositoryDirectory)).not.toContain('"to":"in-customs"');
    const entries = childReadings().eventsAfter(jobFolder(buildJobId()), 1, 0);
    expect(entries === 'malformed' ? [] : entries.filter((entry) => entry.origin === 'client').map((entry) => JSON.parse(entry.line) as unknown))
      .toContainEqual({ act: 'stop', graceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS });
    await passOnce(drivePass);
    expect(buildJob()).toMatchObject({ state: 'interrupted', interruption: 'network-outage', childInstance: 1 });
  });

  test('an end paused interrupts the job talos-paused, which resumes by itself on the next pass under the next Talos', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passUntilBuildSessionSpawned(drivePass);
    world.quitTalos(trackerDirectory());
    world.startTalosAgain(trackerDirectory());
    await passOnce(drivePass);

    expect(storedLogTextOf(repositoryDirectory)).toContain(`"kind":"job-interrupted","jobId":"${buildJobId()}","fields":{"cause":"talos-paused","childInstance":1}`);
    expect(storedLogTextOf(repositoryDirectory)).toContain(`"kind":"job-resumed","jobId":"${buildJobId()}","fields":{"childInstance":2,"cause":"talos-paused"}`);
    await passUntilBuildJobIs(drivePass, 'running');
    expect(buildJob()).toMatchObject({ state: 'running', childInstance: 2, crashResumes: 0 });
    expect(world.launchOf(jobFolder(buildJobId()), 2)).not.toBeNull();
  });

  test('an end lease-ended interrupts the job lease-ended, and nothing resumes it', async () => {
    const drivePass = await drivePassWith(WAITING_SESSION);
    await passUntilBuildSessionSpawned(drivePass);
    world.endLease(trackerDirectory());
    await passOnce(drivePass);
    await passOnce(drivePass);

    expect(buildJob()).toMatchObject({
      state: 'interrupted', interruption: 'lease-ended', childInstance: 1, crashResumes: 0
    });
    expect(storedLogTextOf(repositoryDirectory)).not.toContain(`"kind":"job-resumed","jobId":"${buildJobId()}"`);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the passes the lease renewal reads', () => {
  test('passes are numbered from 1, the running one is in flight and none between passes, and each asks for its Talos before it reads', async () => {
    const inFlightDuringHolds: (number | null)[] = [];
    const talosAsks: (number | null)[] = [];
    const drivePasses: DrivePass[] = [];
    const drivePass = await drivePassWith(WAITING_SESSION, () => {
      inFlightDuringHolds.push(drivePasses[0]?.passInFlight() ?? null);
    }, undefined, {
      ensureTalosIfLost: () => {
        talosAsks.push(drivePasses[0]?.passInFlight() ?? null);
        return Promise.resolve();
      },
    });
    drivePasses.push(drivePass);
    expect(drivePass.passInFlight()).toBeNull();

    await passOnce(drivePass);
    expect(drivePass.passInFlight()).toBeNull();
    await passOnce(drivePass);

    expect(talosAsks.slice(0, 2)).toEqual([1, 2]);
    expect(new Set(inFlightDuringHolds)).toEqual(new Set(talosAsks));
    expect(drivePass.passInFlight()).toBeNull();
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the reconcile at start', () => {
  function startAfter(kind: StartKind): StartClassificationVerdict {
    return {
      kind,
      previousGeneration: 1,
      crashSuspected:     false,
      crashedComponent:   kind === 'crashed' ? 'overseer' : null,
      evidence:           {
        presence:               'read',
        previousEnding:         kind === 'stopped-on-purpose' ? 'stopped' : null,
        previousBootIdentity:   'example-boot',
        currentBootIdentity:    'example-boot',
        newerBatonThanPresence: false,
        talos:                  'lost-this-boot',
        lastHeartbeatAt:        null,
        bootStartedAt:          null,
      },
    };
  }

  function buildJob(): Job | undefined {
    return (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === buildJobId());
  }

  function interruptionCausesOf(jobId: string): unknown[] {
    return storedLogTextOf(repositoryDirectory).split('\n').filter((line) => line !== '')
      .map((line) => JSON.parse(line) as { kind: string; jobId?: string; fields?: { cause?: string } })
      .filter((record) => record.kind === 'job-interrupted' && record.jobId === jobId)
      .map((record) => record.fields?.cause);
  }

  /** The build session runs, then the Overseer stops and its Talos dies with no word, its agent living on; the next Talos serves. */
  async function buildSessionGoneWithTheForge(endTheLease = false): Promise<string> {
    const before = await drivePassWith(WAITING_SESSION);
    await passUntilBuildSessionSpawned(before);
    await before.stop();
    if (endTheLease) world.endLease(trackerDirectory());
    world.crashTalosLeavingItsAgents(trackerDirectory());
    world.startTalosAgain(trackerDirectory());
    return buildJobId();
  }

  async function startedAfter(kind: StartKind): Promise<DrivePass> {
    const after = await drivePassWith(WAITING_SESSION, undefined, undefined, { startClassification: startAfter(kind) });
    await after.regroup();
    return after;
  }

  test('a start after the machine went down interrupts the gone job reboot and launches nothing for it', async () => {
    const jobId = await buildSessionGoneWithTheForge();
    const after = await startedAfter('machine-went-down');
    await passOnce(after);

    expect(buildJob()).toMatchObject({ state: 'interrupted', interruption: 'reboot', childInstance: 1 });
    expect(interruptionCausesOf(jobId)).toEqual(['reboot']);
    expect(world.launchOf(jobFolder(jobId), 2)).toBeNull();
  });

  test('a start after a crash interrupts the gone job forge-crashed', async () => {
    const jobId = await buildSessionGoneWithTheForge();
    await startedAfter('crashed');

    expect(buildJob()).toMatchObject({ state: 'interrupted', interruption: 'forge-crashed', childInstance: 1 });
    expect(interruptionCausesOf(jobId)).toEqual(['forge-crashed']);
  });

  test('a start after a stop on purpose interrupts the gone job forge-stopped', async () => {
    const jobId = await buildSessionGoneWithTheForge();
    await startedAfter('stopped-on-purpose');

    expect(buildJob()).toMatchObject({ state: 'interrupted', interruption: 'forge-stopped', childInstance: 1 });
    expect(interruptionCausesOf(jobId)).toEqual(['forge-stopped']);
  });

  test('a handover leaves a lost child the cause the lost Talos\'s sweep gave it', async () => {
    const jobId = await buildSessionGoneWithTheForge();
    await startedAfter('handover');

    expect(interruptionCausesOf(jobId)).toEqual(['watcher-lost']);
  });

  test('a job whose child ended lease-ended before the start keeps that cause', async () => {
    const jobId = await buildSessionGoneWithTheForge(true);
    await startedAfter('crashed');

    expect(buildJob()).toMatchObject({ state: 'interrupted', interruption: 'lease-ended', childInstance: 1 });
    expect(interruptionCausesOf(jobId)).toEqual(['lease-ended']);
  });

  test('a committed ticket with no job still launches after a start that waits: new work is not interrupted work', async () => {
    await run(['ticket', 'hold', '001', '--reason', 'Waiting on Alex Example']);
    const before = await drivePassWith(WAITING_SESSION);
    await waitUntil(async () => {
      await passOnce(before);
      const assistant = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'assistant');
      return assistant !== undefined && childReadings().livenessOf(jobFolder(assistant.id), 1).verdict === 'live';
    }, () => `the Assistant's session running: ${overseerLog.join('\n')}`);
    const assistantJobId = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'assistant')?.id ?? '';
    await before.stop();
    world.crashTalosLeavingItsAgents(trackerDirectory());
    world.startTalosAgain(trackerDirectory());
    await run(['ticket', 'unhold', '001']);

    const after = await startedAfter('crashed');
    await passUntilBuildSessionSpawned(after);

    expect(interruptionCausesOf(assistantJobId)).toEqual(['forge-crashed']);
    expect(buildJob()).toMatchObject({ ticketIds: ['001'], state: 'running', childInstance: 1 });
  });

  test('User\'s resume then resumes the job by id in the same folder, at its next instance', async () => {
    const jobId = await buildSessionGoneWithTheForge();
    const after = await startedAfter('crashed');
    await passOnce(after);
    expect(world.launchOf(jobFolder(jobId), 2)).toBeNull();

    await run(['resume', jobId]);
    await passUntilBuildJobIs(after, 'running');

    expect(storedLogTextOf(repositoryDirectory)).toContain(`"kind":"job-resumed","jobId":"${jobId}","fields":{"childInstance":2,"cause":"forge-crashed","instructed":true}`);
    expect(world.launchOf(jobFolder(jobId), 2)).toMatchObject({ childFolder: `jobs/${jobId}`, instance: 2, kind: 'agent' });
  });
});
