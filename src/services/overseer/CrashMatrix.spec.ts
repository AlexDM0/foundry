/**
 * The rows of the crash, reboot and update matrix that need no real process. What matters in these rows: a hold cut short after its journal is
 * finished by the next holder before that holder reads, and a holder whose lock was taken over writes nothing further, its committed journal
 * replayed by its successor. The session rows run a build job behind `src/testing/FakeWatcherWorld.ts`, an Overseer restart being a fresh
 * DrivePass regrouping: a fresh session takes its first message once, a restart replays history, an answer given with the Overseer down
 * reaches the session, a stopped product owner never resumes by itself, and a resolver launches under its own profile.
 *
 * Every row that kills or crashes a process, or needs a real Watcher, git history or Baton pass, is in
 * `src/services/overseer/CrashMatrix.integration.spec.ts`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
}                         from 'node:fs';
import { basename, join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import type { AgentAdapter }                                from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchRequest }                          from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { AgentQuestion }                               from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { WorkerProfile }                               from '../../lib/agent-launch/WorkerProfile.ts';
import type { Decision }                                    from '../../lib/tracker-model/@types/Decision.ts';
import type { Job }                                         from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                                       from '../../lib/tracker-model/Board.ts';
import type { EventLogEntry }                               from '../../lib/watcher/EventLog.ts';
import { watcherFilesOf }                                   from '../../lib/watcher/WatcherFiles.ts';
import type { WatcherRecord }                               from '../../lib/watcher/WatcherRecord.ts';
import type { ControlCommand }                              from '../../shared/@types/ControlCommand.ts';
import { refusalIsOperationRefusal }                        from '../../shared/OperationRefusal.ts';
import { LIFECYCLE_LIMITS }                                 from '../../shared/constants/LifecycleLimits.ts';
import { LIMITS }                                           from '../../shared/constants/Limits.ts';
import { boardFixture, ticketFixture }                      from '../../testing/BoardFixtures.ts';
import { createScratchDrivePass, FAKE_WATCHER_BUNDLE_PATH } from '../../testing/DrivePassHarness.ts';
import {
  fakeAgentAdapter,
  fakeAssistantTurnLine,
  fakeQuestionLine,
  type FakeAgentStep,
  fakeResultLine,
  fakeStartedLine
} from '../../testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                                 from '../../testing/FakeGateConfinement.ts';
import { useFakeGit }                                          from '../../testing/FakeGit.ts';
import { createFakeWatcherWorld, type FakeWatcherWorld }       from '../../testing/FakeWatcherWorld.ts';
import { nativePlatformPorts }                                 from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }      from '../../testing/ScratchWorkspace.ts';
import { EXAMPLE_TICKET_FILE_NAME, writeReadableTracker }      from '../../testing/TrackerFileFixtures.ts';
import { waitUntil }                                           from '../../testing/WaitUntil.ts';
import { ControlService }                                      from '../control/ControlService.ts';
import { holdJournalFilePathOf }                               from '../tracker/HoldJournal.ts';
import { LockGenerationSteps }                                 from '../tracker/TrackerLock.ts';
import { writeTracker, type TrackerChange }                    from '../tracker/TrackerPipeline.ts';
import { requireProgressFile }                                 from '../tracker/TrackerReader.ts';
import { workspacePathsFor, type Workspace }                   from '../tracker/Workspace.ts';
import type { DrivePass, JobLaunchFacts }                      from './DrivePass.ts';
import { CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf } from './InstructionFiles.ts';
import { IntakeSessions }                                      from './IntakeSessions.ts';
import { JobResumption }                                       from './JobResumption.ts';
import { WatcherFleet }                                        from './WatcherFleet.ts';

const fakeGit = useFakeGit();

let world: FakeWatcherWorld;
let ports: FakeWatcherWorld['ports'];

const CHANGED_AT = '2026-09-18T20:05:00+02:00';

const now = (): Date => new Date('2026-09-18T18:05:00Z');


let workspace: Workspace;

function ticketText(): string {
  return readFileSync(join(workspace.ticketsDirectory, EXAMPLE_TICKET_FILE_NAME), 'utf8');
}

function holdTheExampleTicket(change: TrackerChange): void {
  change.board.addTask({ name: 'Example cut-short row', startsNow: false, movesTheLink: false }, change.at);
  change.board.holdTicket('001', 'Waiting on Alex Example', change.at);
}

function noteAnExample(change: TrackerChange): void {
  change.board.recordNote('Example note of the next holder', change.at);
}

async function failureOf(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  return null;
}

/** Takes the lock over as stale from inside the current hold, as a command arriving after the holder slept past the threshold would. */
function takeTheLockOver(): void {
  const payload  = { processId: process.pid, acquiredAt: CHANGED_AT };
  const takeover = LockGenerationSteps.attemptedAcquire(workspace.lockDirectoryPath, payload, now().getTime() + LIMITS.LOCK_STALE_MILLISECONDS + 1);
  if (takeover.verdict !== 'acquired') throw new Error(`the takeover found the lock ${takeover.verdict}`);
  LockGenerationSteps.release(workspace.lockDirectoryPath, takeover.generation, payload);
}

beforeEach(() => {
  workspace = workspacePathsFor(createScratchDirectory('crash-matrix'));
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
  writeReadableTracker(workspace);
});

afterEach(() => {
  removeScratchDirectory(workspace.rootDirectory);
});

describe('crash between progress.json and the ticket files', () => {
  test('the next lock holder replays hold-journal.json, finishing the cut-short write before its own', async () => {
    const ticketBefore = ticketText();
    const crash        = new Error('the holder crashed');

    const failure = await failureOf(() => writeTracker({
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           holdTheExampleTicket,
      afterFileWritten: (filePath) => { if (filePath === workspace.progressFilePath) throw crash; },
    }));
    expect(failure).toBe(crash);
    expect(readFileSync(workspace.progressFilePath, 'utf8')).toContain('Example cut-short row');
    expect(ticketText(), 'the board is torn: the ticket was not written').toBe(ticketBefore);

    const written = await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: noteAnExample,
    });

    expect(ticketText()).toContain('Waiting on Alex Example');
    expect(written.board.tasks().map((task) => task.name)).toEqual(['Example cut-short row']);
    const loggedKinds = readFileSync(workspace.logFilePath, 'utf8').trimEnd().split('\n').map((line) => (JSON.parse(line) as { kind: string }).kind);
    expect(loggedKinds.at(-1)).toBe('note');
    expect(loggedKinds.length, 'the cut-short hold\'s records are in the log before the next holder\'s note').toBeGreaterThan(2);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });
});

describe('a stale holder resumes after a lock takeover', () => {
  test('taken over before its journal, it refuses lock-taken-over as unrepaired and writes nothing', async () => {
    const progressBefore = readFileSync(workspace.progressFilePath, 'utf8');

    const failure = await failureOf(() => writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        holdTheExampleTicket(change);
        takeTheLockOver();
      },
    }));

    expect(refusalIsOperationRefusal(failure) ? failure.status : null).toBe('unrepaired');
    expect(refusalIsOperationRefusal(failure) ? failure.detail?.kind : null).toBe('lock-taken-over');
    expect(readFileSync(workspace.progressFilePath, 'utf8')).toBe(progressBefore);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });

  test('taken over after its journal, it writes no further file, and its successor replays the committed hold', async () => {
    const ticketBefore = ticketText();

    const failure = await failureOf(() => writeTracker({
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           holdTheExampleTicket,
      afterFileWritten: (filePath) => { if (filePath === workspace.progressFilePath) takeTheLockOver(); },
    }));

    expect(refusalIsOperationRefusal(failure) ? failure.detail?.kind : null).toBe('lock-taken-over');
    expect(ticketText()).toBe(ticketBefore);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(true);

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: noteAnExample,
    });

    expect(ticketText()).toContain('Waiting on Alex Example');
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });
});

interface RecordedLaunch {
  jobId:            string;
  resume:           boolean;
  firstMessage:     string;
  workingDirectory: string;
  sessionId:        string;
}

interface SessionScenario {
  fresh:         readonly FakeAgentStep[];
  resumed:       readonly FakeAgentStep[];
  Assistant?:    readonly FakeAgentStep[];
  /** The product owner, told apart as the one session launched with skills on. */
  productOwner?: { fresh: readonly FakeAgentStep[]; resumed: readonly FakeAgentStep[] };
}

const SESSION_STAMP          = '2026-09-18T22:11:03+02:00';
const RESUME_MESSAGE         = 'Example resume message';
const ASSISTANT_CHAT_PREFIX  = 'Example chat';
const EARLIER_SESSION_NOTE   = 'Example earlier-session note.';
const ANSWER_MESSAGE_PREFIX  = 'Example answers';

const STARTED: FakeAgentStep = { kind: 'print', line: fakeStartedLine('fake-session') };
/** A second wait, since the world plays at once: a session must outlive its first message to read as live. */
const WAITING_STEPS: readonly FakeAgentStep[] = [STARTED, { kind: 'await-line' }, { kind: 'await-line' }];
const LINE_THEN_WAITING_STEPS: readonly FakeAgentStep[] = [
  STARTED, { kind: 'await-line' }, { kind: 'print', line: fakeAssistantTurnLine('after-the-line') }, { kind: 'await-line' }, { kind: 'await-line' },
];

const EXAMPLE_QUESTION: AgentQuestion = {
  question: 'Ship the example export?', header: 'Export', multiSelect: false, options: [{ label: 'Yes', description: 'Ship it' }, { label: 'No', description: 'Hold it' }],
};

function askingSteps(question: AgentQuestion): readonly FakeAgentStep[] {
  return [
    STARTED,
    { kind: 'print', line: fakeQuestionLine('request-1', [question]) },
    { kind: 'await-line' },
    { kind: 'print', line: fakeAssistantTurnLine('after-the-answer') },
    { kind: 'await-line' },
  ];
}

const ASKING_STEPS = askingSteps(EXAMPLE_QUESTION);

let repository = '';
let sessionWorkspace: Workspace;
let monitorFolder = '';
let launches: RecordedLaunch[] = [];
let launchFacts: { jobId: string; facts: JobLaunchFacts }[] = [];
let assistantLaunches: AgentLaunchRequest[] = [];
let overseerLog: string[] = [];

/** The fake session, recording each worker launch; the Assistant the policy boots beside the build only waits. */
function recordingAdapter(scenario: SessionScenario): AgentAdapter {
  return {
    ...fakeAgentAdapter(),
    planOf(request) {
      const isWorker = request.reportSchema !== null;
      if (isWorker) {
        launches.push({
          jobId:            basename(request.jobFilesDirectory),
          resume:           request.resume,
          firstMessage:     request.firstMessage,
          workingDirectory: request.workingDirectory,
          sessionId:        request.sessionId,
        });
      }
      const productOwnerSteps = request.resume ? scenario.productOwner?.resumed : scenario.productOwner?.fresh;
      if (!isWorker && !request.profile.skills) assistantLaunches.push(request);
      const sessionSteps = request.profile.skills ? productOwnerSteps ?? WAITING_STEPS : scenario.Assistant ?? WAITING_STEPS;
      const steps = isWorker ? (request.resume ? scenario.resumed : scenario.fresh) : sessionSteps;
      return fakeAgentAdapter(steps).planOf(request);
    },
  };
}

/** An Overseer start: a newer Baton generation and a fresh DrivePass, which the spec regroups. */
function startedOverseer(
  adapter: AgentAdapter,
  afterHoldPhase?: (phase: string, board: Board) => void,
  deliversByControlResponse?: boolean,
): Promise<DrivePass> {
  return Promise.resolve(createScratchDrivePass({
    platformPorts:     { ...ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:     world.processStarts,
    workspace:         sessionWorkspace,
    now:               () => new Date(Date.parse(SESSION_STAMP)),
    formatStamp:       () => SESSION_STAMP,
    watcherBundlePath: FAKE_WATCHER_BUNDLE_PATH,
    agentAdapter:      adapter,
    monitorFolder,
    mainLine:          fakeGit.checkedOutBranchOf(repository),
    decisionWordingOf: (draft) => ({
      questions: [{
        question: `Example ${draft.kind}?`, header: draft.kind, multiSelect: false, options: []
      }],
      context: ''
    }),
    launchTextOf: (job, facts) => {
      launchFacts.push({ jobId: job.id, facts });
      return { firstMessage: `${facts.earlierSessionReplaced ? `${EARLIER_SESSION_NOTE} ` : ''}Example first message of ${job.id}`, roleBrief: 'Example role' };
    },
    assistantChatTextOf: (facts) => `${ASSISTANT_CHAT_PREFIX} ${facts.sequence}: ${facts.incidents.map((incident) => incident.id).join(', ')}`,
    resumeMessage:       RESUME_MESSAGE,
    redHandoffMessageOf: (facts) => `Red handoff: ${facts.name}, resume ${facts.resume}`,
    answerMessageOf:     (answer) => `${ANSWER_MESSAGE_PREFIX} ${JSON.stringify(answer)}`,
    ...(deliversByControlResponse === undefined ? {} : { deliversAnswersByControlResponse: deliversByControlResponse }),
    log:                 (line) => overseerLog.push(line),
    ...(afterHoldPhase === undefined ? {} : { afterHoldPhase }),
  }));
}

async function passOnce(drivePass: DrivePass): Promise<void> {
  drivePass.wake(true);
  await drivePass.idle();
}

function storedJobs(): readonly Readonly<Job>[] {
  return requireProgressFile(sessionWorkspace).jobs ?? [];
}

function buildJobs(): readonly Readonly<Job>[] {
  return storedJobs().filter((job) => job.kind === 'build');
}

function requireBuildJob(): Readonly<Job> {
  const [job] = buildJobs();
  if (job === undefined) throw new Error(`no build job is live: ${overseerLog.join('\n')}`);
  return job;
}

function storedRecords(): { kind: string; jobId?: string; fields: Record<string, unknown> }[] {
  return readFileSync(sessionWorkspace.logFilePath, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as never);
}

function sessionJobFolder(jobId: string): string {
  return WatcherFleet.jobFolderOf(sessionWorkspace.trackerDirectory, jobId);
}

function watcherRecordOf(jobId: string, instance: number): WatcherRecord | null {
  return WatcherFleet.watcherRecordOf(sessionJobFolder(jobId), instance);
}


function eventLogTextOf(jobId: string, instance: number): string {
  const entries = WatcherFleet.eventsAfter(sessionJobFolder(jobId), instance, 0);
  return entries === 'malformed' ? '' : entries.map((entry) => entry.line).join('\n');
}

async function until(condition: () => boolean, what: string): Promise<void> {
  await waitUntil(condition, () => `${what}:\n${overseerLog.join('\n')}\n${JSON.stringify(storedJobs())}`);
}

async function passUntil(drivePass: DrivePass, condition: () => boolean, what: string): Promise<void> {
  await waitUntil(async () => {
    await passOnce(drivePass);
    return condition();
  }, () => `${what}:\n${overseerLog.join('\n')}\n${JSON.stringify(storedJobs())}`);
}

function sessionRuns(job: Readonly<Job> | undefined): job is Readonly<Job> {
  if (job?.state !== 'running') return false;
  const record = watcherRecordOf(job.id, job.watcherInstance);
  return WatcherFleet.livenessOf(ports, sessionJobFolder(job.id), job.watcherInstance).verdict === 'live' && record?.childProcess !== undefined && record.childProcess !== null;
}

/** Passes until the build session's current instance runs a child; answers the job as stored then. */
async function runningBuildSession(drivePass: DrivePass): Promise<Readonly<Job>> {
  await passUntil(drivePass, () => sessionRuns(buildJobs()[0]), 'the build session never ran');
  return requireBuildJob();
}


function openDecisions(): readonly Readonly<Decision>[] {
  return requireProgressFile(sessionWorkspace).decisions ?? [];
}

/** `decide`'s change, applied as the command line applies it: a hold of its own, with no Overseer pass in it. */
async function decideWithTheOverseerDown(decisionId: string, choices: readonly string[]): Promise<void> {
  await writeTracker({
    workspace: sessionWorkspace,
    at:        CHANGED_AT,
    now,
    mutate:    (change) => ControlService.apply({ kind: 'decision-answer', decisionId, answer: { form: 'letters', choices } }, change),
  });
}

/** A control applied as its verb applies it with the Overseer down: a hold of its own. */
async function applyControl(command: ControlCommand): Promise<void> {
  await writeTracker({
    workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => ControlService.apply(command, change),
  });
}


/** The instance's Watcher and child as recorded on another boot, so the next pass reads them as gone with the machine. */
function rebootInTheFakeWorld(jobId: string, instance: number): void {
  const record = watcherRecordOf(jobId, instance);
  if (record?.watcher === undefined || record.watcher === null) throw new Error('no Watcher record to reboot');
  const foreignBoot = { bootIdentity: 'example-earlier-boot' };
  const rebootedRecord = {
    ...record,
    watcher:      { ...record.watcher, ...foreignBoot },
    childProcess: record.childProcess === undefined || record.childProcess === null ? record.childProcess : { ...record.childProcess, ...foreignBoot },
  };
  writeFileSync(watcherFilesOf(sessionJobFolder(jobId), instance).watcherRecordPath, `${JSON.stringify(rebootedRecord)}\n`);
}

function productOwnerJob(): Readonly<Job> | undefined {
  return storedJobs().find((job) => job.kind === 'product-owner');
}

function resumedRecordsOf(jobId: string):{ kind: string; fields: Record<string, unknown> }[] {
  return storedRecords().filter((record) => record.kind === 'job-resumed' && record.jobId === jobId);
}

describe('the session rows behind the Watcher boundary', () => {
  beforeEach(async () => {
    world            = createFakeWatcherWorld(nativePlatformPorts());
    ({ ports } = world);
    repository       = fakeGit.createRepository('crash-rows');
    sessionWorkspace = workspacePathsFor(repository);
    monitorFolder    = createScratchDirectory('h');
    launches         = [];
    launchFacts      = [];
    assistantLaunches = [];
    overseerLog        = [];
    mkdirSync(sessionWorkspace.ticketsDirectory, { recursive: true });
    writeReadableTracker(sessionWorkspace);
    const instructionDefaults = [CONSTITUTION_DEFAULT_PATH, ...(['builder', 'reviewer', 'merger', 'productOwner', 'assistant'] as const).map(defaultInstructionPathOf)];
    for (const path of instructionDefaults) {
      mkdirSync(join(repository, path, '..'), { recursive: true });
      writeFileSync(join(repository, path), 'Example instructions.\n');
    }
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        change.board.addGate({ name: 'checks', run: 'true' }, change.at);
        change.board.setOverseerState('running', change.at);
      },
    });
  });

  afterEach(() => {
    removeScratchDirectory(monitorFolder);
    removeScratchDirectory(repository);
  });

  test('overseer dies: the Watchers keep running, and a restart attaches with hello from the stored cursor and replays the history', async () => {
    const adapter = recordingAdapter({ fresh: LINE_THEN_WAITING_STEPS, resumed: WAITING_STEPS });
    const job     = await runningBuildSession(await startedOverseer(adapter));
    await until(() => eventLogTextOf(job.id, 1).includes('"init"'), 'the session never started');
    // The Overseer is down from here: the session goes on and logs a turn nobody applies.
    await WatcherFleet.sendFrames(ports, sessionJobFolder(job.id), 1, [{ kind: 'write', line: adapter.chatLineOf('Example line while the Overseer is down') }]);
    await until(() => eventLogTextOf(job.id, 1).includes('after-the-line'), 'the session never answered the line');
    const storedCursor = requireBuildJob().eventCursor;
    const unapplied    = WatcherFleet.eventsAfter(sessionJobFolder(job.id), 1, storedCursor.instance === 1 ? storedCursor.sequence : 0);

    const report = await (await startedOverseer(adapter)).regroup();

    const attached = report.attached.find((watcher) => watcher.jobId === job.id);
    expect(attached?.instance).toBe(1);
    expect(attached?.replayedEntries).toEqual(unapplied === 'malformed' ? [] : unapplied);
    expect(JSON.stringify(attached?.replayedEntries)).toContain('after-the-line');
    expect(requireBuildJob()).toMatchObject({ id: job.id, state: 'running', watcherInstance: 1 });
    expect(requireBuildJob().eventCursor.sequence).toBeGreaterThan(storedCursor.sequence);
    expect(storedRecords().filter((record) => record.kind === 'job-interrupted')).toEqual([]);
  });

  test('a fresh session takes its first message as its first input, once, and a later pass sends it no second time', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: LINE_THEN_WAITING_STEPS, resumed: WAITING_STEPS }));
    const job       = await runningBuildSession(drivePass);
    const firstLine = recordingAdapter({ fresh: [], resumed: [] }).chatLineOf(`Example first message of ${job.id}`);
    await passUntil(drivePass, () => eventLogTextOf(job.id, 1).includes('after-the-line'), 'the fresh session never took its first message');
    await passOnce(drivePass);

    const clientLines = (WatcherFleet.eventsAfter(sessionJobFolder(job.id), 1, 0) as readonly EventLogEntry[]).filter((entry) => entry.origin === 'client');
    expect(clientLines.map((entry) => entry.line)).toEqual([JSON.stringify({ kind: 'write', line: firstLine })]);
    expect(existsSync(join(sessionJobFolder(job.id), 'first-message-1.sent'))).toBe(true);
  });

  test('agent exits with its closing result while the Overseer is down: on regroup the result is read from the event log into Customs', async () => {
    const statesAfterWatcherEvents: (string | undefined)[] = [];
    const adapter = recordingAdapter({ fresh: [STARTED, { kind: 'print', line: fakeResultLine({ outcome: 'built' }) }, { kind: 'await-line' }], resumed: WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    await passUntil(first, () => WatcherFleet.livenessOf(ports, sessionJobFolder(requireBuildJob().id), 1).verdict !== 'unclaimed', 'the build session was never spawned');
    const job = requireBuildJob();
    await until(() => eventLogTextOf(job.id, 1).includes('"result"'), 'the session never closed its turn');

    await (await startedOverseer(adapter, (phase, board) => {
      if (phase === 'watcher-events') statesAfterWatcherEvents.push(board.jobById(job.id)?.state);
    })).regroup();

    expect(statesAfterWatcherEvents[0]).toBe('in-customs');
    expect(storedRecords().filter((record) => record.jobId === job.id && record.kind === 'job-interrupted')).toEqual([]);
  });

  test('a question answered while the Overseer is down: the restart replays it without a second decision and the live Watcher takes the control_response', async () => {
    const adapter = recordingAdapter({ fresh: ASKING_STEPS, resumed: WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    const job     = await runningBuildSession(first);
    await passUntil(first, () => requireBuildJob().state === 'waiting-for-answer', 'the question never opened its decision');
    expect(openDecisions()).toMatchObject([{
      id: 'E1', kind: 'agent-question', jobId: job.id, requestId: 'request-1', questions: [EXAMPLE_QUESTION]
    }]);
    await first.stop();

    await decideWithTheOverseerDown('E1', ['b']);
    expect(requireBuildJob()).toMatchObject({ state: 'running', answeredRequestIds: ['request-1'] });

    const restarted = await startedOverseer(adapter);
    await restarted.regroup();
    await passUntil(restarted, () => eventLogTextOf(job.id, 1).includes('after-the-answer'), 'the live session never took the answer');
    // The Watcher logs the line it wrote inside its own frame, so the answer's quotes read escaped.
    expect(eventLogTextOf(job.id, 1)).toContain('\\"type\\":\\"control_response\\"');
    expect(eventLogTextOf(job.id, 1)).toContain('\\"answers\\":{\\"Ship the example export?\\":\\"No\\"}');
    expect(storedRecords().filter((record) => record.kind === 'decision-opened')).toHaveLength(1);
    expect(requireBuildJob()).toMatchObject({ watcherInstance: 1, state: 'running' });
  });

  test('without a control_response delivery the Overseer stops the live Watcher and resumes with the answer, cause answer-delivery, never counted', async () => {
    const adapter = recordingAdapter({ fresh: ASKING_STEPS, resumed: LINE_THEN_WAITING_STEPS });
    const drivePass = await startedOverseer(adapter, undefined, false);
    const job       = await runningBuildSession(drivePass);
    await passUntil(drivePass, () => requireBuildJob().state === 'waiting-for-answer', 'the question never opened its decision');

    await decideWithTheOverseerDown('E1', ['a']);
    await passUntil(drivePass, () => eventLogTextOf(job.id, 2).includes('after-the-line'), 'the resumed session never took the answer');

    expect(resumedRecordsOf(job.id).map((record) => record.fields)).toEqual([{ watcherInstance: 2, cause: 'answer-delivery' }]);
    expect(eventLogTextOf(job.id, 1)).not.toContain('control_response');
    expect(eventLogTextOf(job.id, 2)).toContain(ANSWER_MESSAGE_PREFIX);
    expect(requireBuildJob()).toMatchObject({ crashResumes: 0 });
  });

  test('a question pending when the machine reboots: the resumed session takes the answer as its chat line and never the resume message after it', async () => {
    const adapter = recordingAdapter({ fresh: ASKING_STEPS, resumed: LINE_THEN_WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    const job     = await runningBuildSession(first);
    await passUntil(first, () => requireBuildJob().state === 'waiting-for-answer', 'the question never opened its decision');
    await first.stop();
    rebootInTheFakeWorld(job.id, 1);

    const restarted = await startedOverseer(adapter);
    await restarted.regroup();
    await passOnce(restarted);
    expect(requireBuildJob()).toMatchObject({ state: 'interrupted', interruption: 'reboot', watcherInstance: 1 });

    await decideWithTheOverseerDown('E1', ['a']);
    await passUntil(restarted, () => eventLogTextOf(job.id, 2).includes('after-the-line'), 'the resumed session never took the answer');
    await passOnce(restarted);
    await passOnce(restarted);
    expect(eventLogTextOf(job.id, 2)).toContain(ANSWER_MESSAGE_PREFIX);
    expect(eventLogTextOf(job.id, 2)).not.toContain(RESUME_MESSAGE);
    expect(requireBuildJob()).toMatchObject({ crashResumes: 0, watcherInstance: 2 });
  });

  test('overseer dies after the hold that launched a job, before the spawn: regroup re-spawns the same instance', async () => {
    let assistantJobId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        assistantJobId = change.board.launchJob({
          kind: 'assistant', role: 'assistant', ticketIds: [], parentJobId: null, attempt: 1, target: null
        }, change.at).job.id;
      },
    });

    const report = await (await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS }))).regroup();

    expect(report.respawnJobIds).toContain(assistantJobId);
    await until(() => WatcherFleet.livenessOf(ports, sessionJobFolder(assistantJobId), 1).verdict === 'live', 'the same instance was never claimed');
    expect(storedJobs().find((job) => job.id === assistantJobId)?.watcherInstance).toBe(1);
  });

  test('a product owner stopped by User with its question open is finished: the decision withdrawn in that hold, and it ends closed, never resumed by itself', async () => {
    const adapter = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS, productOwner: { fresh: ASKING_STEPS, resumed: WAITING_STEPS } });
    const drivePass = await startedOverseer(adapter);
    await applyControl({ kind: 'intake-start', text: 'Example basket' });
    await passUntil(drivePass, () => productOwnerJob()?.state === 'waiting-for-answer', 'the product owner never asked');
    const jobId = productOwnerJob()?.id ?? '';

    await applyControl({ kind: 'job-stop', jobId, mode: 'stop' });
    expect(openDecisions()).toEqual([]);
    expect(storedRecords().filter((record) => record.kind === 'decision-withdrawn').map((record) => record.fields)).toHaveLength(1);
    await passUntil(drivePass, () => productOwnerJob() === undefined, 'the stopped product owner never ended');

    expect(storedRecords().find((record) => record.kind === 'job-ended' && record.jobId === jobId)?.fields).toMatchObject({ outcome: 'closed' });
    expect(resumedRecordsOf(jobId)).toEqual([]);
  });

  test('a product owner closed by its own intake-close quietly, then messaged by User, resumes by id in the same folder with the message first', async () => {
    const productOwnerLaunches: RecordedLaunch[] = [];
    const scenario = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS, productOwner: { fresh: WAITING_STEPS, resumed: LINE_THEN_WAITING_STEPS } });
    const adapter: AgentAdapter = {
      ...scenario,
      planOf(request) {
        if (request.profile.skills) {
          productOwnerLaunches.push({
            jobId:            basename(request.jobFilesDirectory),
            resume:           request.resume,
            firstMessage:     request.firstMessage,
            workingDirectory: request.workingDirectory,
            sessionId:        request.sessionId,
          });
        }
        return scenario.planOf(request);
      },
    };
    const drivePass = await startedOverseer(adapter);
    await applyControl({ kind: 'intake-start', text: 'Example basket' });
    await passUntil(drivePass, () => sessionRuns(productOwnerJob()), 'the product owner never ran');
    const jobId = productOwnerJob()?.id ?? '';
    await applyControl({ kind: 'intake-close', jobId, proposedDraftSets: [] });
    await passUntil(drivePass, () => productOwnerJob() === undefined, 'the closed product owner never ended');
    expect(storedRecords().find((record) => record.kind === 'job-ended' && record.jobId === jobId)?.fields).toMatchObject({ outcome: 'closed' });
    expect(storedRecords().filter((record) => record.kind === 'incident-opened')).toEqual([]);
    expect(drivePass.state().notices).toEqual([]);

    await applyControl({ kind: 'job-message', jobId, text: 'Example follow-up from Alex Example' });
    expect(productOwnerJob()).toMatchObject({ id: jobId, state: 'running', watcherInstance: 2 });
    await passUntil(drivePass, () => eventLogTextOf(jobId, 2).includes('after-the-line'), 'the reopened product owner never took the message');

    const [first, reopened] = productOwnerLaunches;
    expect(reopened).toEqual({
      jobId, resume: true, firstMessage: 'Example follow-up from Alex Example', workingDirectory: first?.workingDirectory ?? '', sessionId: first?.sessionId ?? '',
    });
    expect(first?.resume).toBe(false);
    expect(eventLogTextOf(jobId, 2)).toContain('Example follow-up from Alex Example');
    expect(eventLogTextOf(jobId, 2)).not.toContain(RESUME_MESSAGE);
    expect(storedRecords().filter((record) => record.kind === 'job-reopened' && record.jobId === jobId).map((record) => record.fields['watcherInstance'])).toEqual([2]);
  });

  test('a ticket held while its job runs interrupts nothing', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS }));
    const job       = await runningBuildSession(drivePass);
    await writeTracker({
      workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => { change.board.holdTicket('001', 'Waiting on Alex Example', change.at); },
    });
    await passOnce(drivePass);
    expect(requireBuildJob()).toMatchObject({ id: job.id, state: 'running', watcherInstance: 1 });
    expect(WatcherFleet.livenessOf(ports, sessionJobFolder(job.id), 1).verdict).toBe('live');
  });

  test('a resolver merge agent launches bound to the resolver report schema, with the question tool disallowed', async () => {
    const plans = new Map<string, { reportTitle: unknown; askUser: boolean }>();
    const adapter: AgentAdapter = {
      ...fakeAgentAdapter(),
      planOf(request) {
        plans.set(basename(request.jobFilesDirectory), { reportTitle: (request.reportSchema as { title?: string } | null)?.title, askUser: request.profile.askUser });
        return fakeAgentAdapter(WAITING_STEPS).planOf(request);
      },
    };
    let resolverJobId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        resolverJobId = change.board.launchJob({
          kind: 'merge-agent', role: 'resolver', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
        }, change.at).job.id;
      },
    });
    await passOnce(await startedOverseer(adapter));
    expect(plans.get(resolverJobId)).toEqual({ reportTitle: 'resolver report', askUser: false });
  });

  test('a resolver merge agent launches under the resolver profile: the target ref denied, the git verbs allowed, no network', async () => {
    const profiles = new Map<string, WorkerProfile>();
    const adapter: AgentAdapter = {
      ...fakeAgentAdapter(),
      planOf(request) {
        profiles.set(basename(request.jobFilesDirectory), request.profile);
        return fakeAgentAdapter(WAITING_STEPS).planOf(request);
      },
    };
    let resolverJobId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        resolverJobId = change.board.launchJob({
          kind: 'merge-agent', role: 'resolver', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
        }, change.at).job.id;
      },
    });
    await passOnce(await startedOverseer(adapter));
    const profile = profiles.get(resolverJobId);
    expect(profile?.deniedWritableRoots.some((path) => path.endsWith(join('refs', 'heads', fakeGit.checkedOutBranchOf(repository))))).toBe(true);
    expect(profile?.deniedWritableRoots.some((path) => path.endsWith('packed-refs'))).toBe(true);
    expect(profile?.allowedCommandPrefixes).toEqual(expect.arrayContaining([['git', 'add'], ['git', 'commit']]));
    expect(profile).toMatchObject({
      bashNetworkDomains: [], webNetworkDomains: 'none', askUser: false, networkDomainGuard: null
    });
  });

  test('a finished session is never continued: a move of an ended job is refused job-finished', async () => {
    const failure = await failureOf(() => writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        const { job } = change.board.launchJob({
          kind: 'assistant', role: 'assistant', ticketIds: [], parentJobId: null, attempt: 1, target: null
        }, change.at);
        change.board.endJob(job.id, { outcome: 'closed' }, change.at);
        change.board.moveJob(job.id, 'running', change.at);
      },
    }));
    expect(refusalIsOperationRefusal(failure) ? JSON.stringify(failure.detail) : String(failure)).toContain('job-finished');
  });

});

describe('the product-owner bound row', () => {
  const at = '2026-09-18T22:11:03+02:00';
  const observations = {
    mainLine:                     'main',
    groupTargetPrefix:            'group-',
    installVersionChanged:        false,
    targetsHoldingManagedBlock:   [],
    ticketIdsTouchingAgentConfig: [],
    closedDeliveryTurns:          [],
    budgetSpentDeliveryTurns:     [],
    assistantHasAnswered:         false,
    assistantBootRetryDue:        false,
  } as const;
  const wordingOf = (): { questions: { question: string; header: string; multiSelect: boolean; options: { label: string; description: string }[] }[]; context: string } => ({
    questions: [{
      question: 'Example?', header: 'example', multiSelect: false, options: []
    }],
    context: '',
  });

  test('a product owner replaced past the bound with a question open waits awaiting-answer; once answered a fresh one takes its drafts and answers, never a resume', () => {
    const { board } = boardFixture({
      tickets: [{
        ...ticketFixture({
          id: '004', status: 'draft', filedByJob: 'J2', title: 'Example basket'
        }),
        body: ''
      }]
    });
    board.setOverseerState('running', at);
    board.launchJob({
      kind: 'assistant', role: 'assistant', ticketIds: [], parentJobId: null, attempt: 1, target: null
    }, at);
    const { job } = board.startIntake('Example basket', at);
    board.moveJob(job.id, 'running', at);
    board.openDecision({
      kind: 'agent-question', ticketIds: [], jobId: job.id, askedBy: 'product-owner', requestId: 'request-1', questions: wordingOf().questions, context: '',
    }, at);
    for (let crash = 0; crash < LIFECYCLE_LIMITS.JOB_RESUMES_BEFORE_FRESH; crash += 1) {
      board.interruptJob(job.id, 'agent-crashed', at);
      board.moveJob(job.id, 'running', at);
    }
    board.interruptJob(job.id, 'agent-crashed', at);

    board.followPlaybook({ ...LIFECYCLE_LIMITS, now: at, usageResetsAt: null }, observations, wordingOf);
    expect(board.jobById(job.id)?.state).toBe('awaiting-answer');
    board.followPlaybook({ ...LIFECYCLE_LIMITS, now: at, usageResetsAt: null }, observations, wordingOf);
    expect(board.jobById(job.id)?.state).toBe('awaiting-answer');

    const [decision] = board.decisions();
    board.answerDecision(decision?.id ?? '', ['Example answer'], at);
    board.followPlaybook({ ...LIFECYCLE_LIMITS, now: at, usageResetsAt: null }, observations, wordingOf);

    expect(board.jobById(job.id)).toBeUndefined();
    const fresh = board.jobs().find((candidate) => candidate.kind === 'product-owner');
    expect(fresh).toMatchObject({
      parentJobId: job.id, state: 'launching', watcherInstance: 1, intake: { text: 'Example basket', carriedAnswers: [{ 'Example?': 'Example answer' }] }
    });
    if (fresh === undefined) throw new Error('no fresh product owner');
    expect(IntakeSessions.intakeFactsOf(board, fresh)?.drafts).toEqual([{ id: '004', title: 'Example basket' }]);
    expect(JobResumption.launchPartsOf(fresh, 'Example first', 'Example resume')).toEqual({ resume: false, firstMessage: 'Example first' });
  });
});
