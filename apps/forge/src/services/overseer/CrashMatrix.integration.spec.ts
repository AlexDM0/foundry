/**
 * The crash, reboot and update matrix on the real system, one row per scenario, each held against the mechanism that settles it; the rows that
 * need no real process are in `src/services/overseer/CrashMatrix.spec.ts`, and the merge rows in `CrashMatrix.merges.spec.ts`. The
 * processes, Talos and folders are real; git answers from the recorded flow stages of `src/testing/RecordedGitFlow.ts`.
 *
 * The session, Talos, Overseer, reboot and question rows that need no Airlock run a build job on a scratch repository, its
 * session the fake child: every crash is made by killing Talos, the child's group or both, a reboot by also giving Talos's and the child
 * records a foreign boot, and an Overseer restart by a fresh DrivePass that ensures its Talos and regroups. What matters there: an orphaned
 * agent group is killed before the resume, only the crash causes count toward the bound, a reboot and a spent bound wait for User's resume,
 * which gives the bound back, a resume is by id in the same folder, and a finished session never continues, save a closed product owner
 * User messages, which resumes by id. A Baton pass row hands a running session's board to a successor and holds that Talos is sent nothing.
 * The Assistant rows hold that it continues across an Overseer restart, is replaced and never resumed when down, and boots past two failed
 * boots only on a sweep while every incident defaults. The rows
 * "the old Overseer dies during a baton-pass" and "a Baton pass's successor fails" are held by `src/services/overseer/BatonPass.spec.ts`. The
 * usage-limit row is held by `src/services/overseer/UsageLimits.spec.ts` and `cli/overseer/OverseerDrivePass.spec.ts`, the body-edit row by V6
 * in `src/services/lifecycle/Customs.spec.ts`, and the kill of a silent successor by `src/services/overseer/BatonPass.integration.spec.ts`.
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
import { writeHatchRequest }                                                      from '../../adapters/hatch/HatchFolder.ts';
import type { AgentAdapter }                                                      from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchRequest }                                                from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { AgentQuestion }                                                     from '../../lib/agent-launch/AgentSessionEvent.ts';
import { sameProcess, type ProcessIdentity }                                      from '../../lib/process-identity/ProcessIdentity.ts';
import type { ChildRecord }                                                       from '../../lib/talos/ChildRecord.ts';
import { childRecordTextOf }                                                      from '../../lib/talos/ChildRecord.ts';
import type { EventLogEntry }                                                     from '../../lib/talos/EventLog.ts';
import { talosRecordPathOf }                                                      from '../../lib/talos/TalosFiles.ts';
import { talosRecordTextOf }                                                      from '../../lib/talos/TalosRecord.ts';
import type { Decision }                                                          from '../../lib/tracker-model/@types/Decision.ts';
import type { Incident }                                                          from '../../lib/tracker-model/@types/Incident.ts';
import type { Job }                                                               from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                                                             from '../../lib/tracker-model/Board.ts';
import type { ControlCommand }                                                    from '../../shared/@types/ControlCommand.ts';
import { LIFECYCLE_LIMITS }                                                       from '../../shared/constants/LifecycleLimits.ts';
import { PRODUCT_NAMES }                                                          from '../../shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                from '../../testing/ChildProcessCaseTimeout.ts';
import { createScratchDrivePass, type ScratchBoardTalos, startScratchBoardTalos } from '../../testing/DrivePassHarness.ts';
import { ECHOED_CONTROL_CONTEXT }                                                 from '../../testing/EchoedControlContext.ts';
import {
  fakeAgentAdapter,
  fakeAssistantTurnLine,
  fakeQuestionLine,
  type FakeAgentStep,
  fakeResultLine,
  fakeStartedLine
} from '../../testing/FakeAgentAdapter.ts';
import { nativePlatformPorts }                                  from '../../testing/NativePlatformPorts.ts';
import { PlantedChild }                                         from '../../testing/PlantedChild.ts';
import { stopProcessesReachingInto }                            from '../../testing/ProcessesInFolder.ts';
import { useRecordedGit }                                       from '../../testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE, RECORDED_FLOW_TICKET_BRANCH } from '../../testing/RecordedGitFlow.ts';
import { createScratchDirectory, removeScratchDirectory }       from '../../testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }                 from '../../testing/TalosChildReadings.ts';
import { writeReadableTracker }                                 from '../../testing/TrackerFileFixtures.ts';
import { blockUntil, waitUntil }                                from '../../testing/WaitUntil.ts';
import { ControlService }                                       from '../control/ControlService.ts';
import { writeTracker }                                         from '../tracker/TrackerPipeline.ts';
import { requireProgressFile }                                  from '../tracker/TrackerReader.ts';
import { workspacePathsFor, type Workspace }                    from '../tracker/Workspace.ts';
import { BatonPass }                                            from './BatonPass.ts';
import type { BoardChildren }                                   from './BoardChildren.ts';
import { type DrivePass, type JobLaunchFacts }                  from './DrivePass.ts';
import { HatchInbox }                                           from './HatchInbox.ts';
import { CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf }  from './InstructionFiles.ts';
import { overseerFilesIn }                                      from './OverseerFiles.ts';
import { jobFolderIn }                                          from './OverseerFiles.ts';
import { Regrouping }                                           from './Regrouping.ts';
import { talosRecordAt }                                        from './TalosStart.ts';

const recordedGit = useRecordedGit();
const ports = nativePlatformPorts();
const { identityOf } = ports.processSupervision;

const CHANGED_AT = '2026-09-18T20:05:00+02:00';

const now = (): Date => new Date('2026-09-18T18:05:00Z');


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
const FOREIGN_BOOT           = 'example-foreign-boot';
const BATON_PASS_SCHEDULE    = { readyTries: 300, releaseTries: 300, intervalMilliseconds: 50 };

const STARTED: FakeAgentStep = { kind: 'print', line: fakeStartedLine('fake-session') };
const WAITING_STEPS: readonly FakeAgentStep[] = [STARTED, { kind: 'await-line' }];
const CRASHING_STEPS: readonly FakeAgentStep[] = [STARTED, { kind: 'crash' }];
const LINE_THEN_WAITING_STEPS: readonly FakeAgentStep[] = [
  STARTED, { kind: 'await-line' }, { kind: 'print', line: fakeAssistantTurnLine('after-the-line') }, { kind: 'await-line' },
];

const EXAMPLE_QUESTION: AgentQuestion = {
  question:    'Ship the example export?',
  header:      'Export',
  multiSelect: false,
  options:     [
    { label: 'Yes', description: 'Ship it', isRecommended: false },
    { label: 'No', description: 'Hold it', isRecommended: false },
  ],
};

/** The children as the Overseer reads them, through Talos's adapter over the case's platform ports. */
function childReadings(): BoardChildren {
  return talosChildReadingsWith(ports, sessionWorkspace.trackerDirectory);
}

let boardTalos: ScratchBoardTalos | null = null;

/** The board's Talos, which outlives every Overseer of the case as it outlives a real one; a lost one is followed by the next. */
async function boardTalosOfTheCase(): Promise<ScratchBoardTalos> {
  boardTalos ??= await startScratchBoardTalos({
    workspace: sessionWorkspace, platformPorts: ports, monitorFolder, log: (line) => overseerLog.push(line)
  });
  return boardTalos;
}

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

/** The same adapter as one whose live session takes no answer line, so the Overseer delivers an answer by a stop and a resume. */
function withoutLiveAnswers(adapter: AgentAdapter): AgentAdapter {
  return { ...adapter, capabilities: { ...adapter.capabilities, takesLiveAnswers: false } };
}

/** An Overseer start: a newer Baton generation and a fresh DrivePass, which the spec regroups. */
async function startedOverseer(
  adapter: AgentAdapter,
  afterHoldPhase?: (phase: string, board: Board) => void,
  onUsageMarkerRead?: () => void,
): Promise<DrivePass> {
  // An Overseer's start ensures its Talos, so a Talos lost while it was down is followed by the next before the regroup.
  const talos = await boardTalosOfTheCase();
  await talos.ensureIfLost();
  return createScratchDrivePass({
    platformPorts:     ports,
    workspace:         sessionWorkspace,
    now:               () => new Date(Date.parse(SESSION_STAMP)),
    formatStamp:       () => SESSION_STAMP,
    talosConnection:   talos.connection,
    ensureTalosIfLost: talos.ensureIfLost,
    agentAdapter:      adapter,
    // A pass reads the usage marker after the Hatch folders: the hook acts there, between the observation's reads.
    get monitorFolder() {
      onUsageMarkerRead?.();
      return monitorFolder;
    },
    mainLine:          RECORDED_FLOW_MAIN_LINE,
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
    log:                 (line) => overseerLog.push(line),
    ...(afterHoldPhase === undefined ? {} : { afterHoldPhase }),
  });
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
  return jobFolderIn(sessionWorkspace.trackerDirectory, jobId);
}

function childRecordOf(jobId: string, instance: number): ChildRecord | null {
  return childReadings().recordOf(sessionJobFolder(jobId), instance);
}

function processIsAlive(identity: ProcessIdentity): boolean {
  const current = identityOf(identity.processId);
  return current !== null && sameProcess(current, identity);
}

function eventLogTextOf(jobId: string, instance: number): string {
  const entries = childReadings().eventsAfter(sessionJobFolder(jobId), instance, 0);
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
  const record = childRecordOf(job.id, job.childInstance);
  return childReadings().livenessOf(sessionJobFolder(job.id), job.childInstance).verdict === 'live' && record?.childProcess !== undefined && record.childProcess !== null;
}

/** Passes until the build session's current instance runs a child; answers the job as stored then. */
async function runningBuildSession(drivePass: DrivePass): Promise<Readonly<Job>> {
  await passUntil(drivePass, () => sessionRuns(buildJobs()[0]), 'the build session never ran');
  return requireBuildJob();
}

function requireRecord(jobId: string, instance: number): ChildRecord & { talos: ProcessIdentity; childProcess: ProcessIdentity } {
  const record = childRecordOf(jobId, instance);
  if (record?.talos === null || record?.talos === undefined || record.childProcess === null) throw new Error(`child ${instance} of ${jobId} recorded no processes`);
  return { ...record, talos: record.talos, childProcess: record.childProcess };
}

/** Talos dies with no word: each child of the board loses its commander, and an agent waiting on its input sees it close. */
async function killTalos(jobId: string, instance: number): Promise<void> {
  const { talos } = requireRecord(jobId, instance);
  process.kill(talos.processId, 'SIGKILL');
  await until(() => !processIsAlive(talos), 'Talos never died');
}

function killChildGroup(jobId: string, instance: number): void {
  const record = requireRecord(jobId, instance);
  process.kill(-(record.childProcessGroupId ?? 0), 'SIGKILL');
}

/** What a reboot leaves: Talos and every child gone, and their identities recorded under a boot that is no longer the machine's. */
async function reboot(jobId: string, instance: number): Promise<void> {
  const record = requireRecord(jobId, instance);
  const talosRecordPath = talosRecordPathOf(sessionWorkspace.trackerDirectory, record.talosStartNumber);
  const talosRecord = talosRecordAt(sessionWorkspace.trackerDirectory, record.talosStartNumber);
  const liveChildren = storedJobs().flatMap((job) => {
    const childRecord = childRecordOf(job.id, job.childInstance);
    return childRecord === null || childRecord.end !== null ? [] : [{ job, childRecord }];
  });
  for (const { childRecord } of liveChildren) {
    try {
      process.kill(-(childRecord.childProcessGroupId ?? 0), 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  await killTalos(jobId, instance);
  await until(() => !processIsAlive(record.childProcess), 'the rebooted child never died');
  const foreign = (identity: ProcessIdentity | null): ProcessIdentity | null => (identity === null ? null : { ...identity, bootIdentity: FOREIGN_BOOT });
  for (const { job, childRecord } of liveChildren) {
    const rebootedRecord: ChildRecord = { ...childRecord, talos: foreign(childRecord.talos), childProcess: foreign(childRecord.childProcess) };
    writeFileSync(childFilesIn(sessionJobFolder(job.id), job.childInstance).recordPath, childRecordTextOf(rebootedRecord));
  }
  if (talosRecord !== null) writeFileSync(talosRecordPath, talosRecordTextOf({ ...talosRecord, talos: foreign(talosRecord.talos) }));
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
    mutate:    (change) => ControlService.apply({ kind: 'decision-answer', decisionId, answer: { form: 'letters', choices } }, change, ECHOED_CONTROL_CONTEXT),
  });
}

/** User's resume of an interrupted job, in a hold of its own: a reboot or a spent crash bound leaves the job waiting for it. */
async function instructResumeOf(jobId: string): Promise<void> {
  await writeTracker({
    workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => change.board.instructResume(jobId, change.at),
  });
}

/** A control applied as its verb applies it with the Overseer down: a hold of its own. */
async function applyControl(command: ControlCommand): Promise<void> {
  await writeTracker({
    workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => ControlService.apply(command, change, ECHOED_CONTROL_CONTEXT),
  });
}

const FIRST_TURN_RESULT: FakeAgentStep = { kind: 'print', line: fakeResultLine(null) };

function requireAssistant(): Readonly<Job> {
  const assistant = storedJobs().find((job) => job.kind === 'assistant');
  if (assistant === undefined) throw new Error(`no Assistant is live: ${overseerLog.join('\n')}`);
  return assistant;
}

function assistantAnswered(results: number): boolean {
  const assistant = storedJobs().find((job) => job.kind === 'assistant');
  return assistant !== undefined && eventLogTextOf(assistant.id, 1).split('"type":"result"').length - 1 >= results;
}

function openIncidents(): readonly Readonly<Incident>[] {
  return requireProgressFile(sessionWorkspace).incidents ?? [];
}

function failedAssistantBoots(): number {
  const assistantIds = new Set(storedRecords().filter((record) => record.kind === 'job-launched' && record.fields['kind'] === 'assistant').map((record) => record.jobId));
  return storedRecords().filter((record) => record.kind === 'job-ended' && assistantIds.has(record.jobId) && record.fields['outcome'] === 'failed').length;
}

async function openBlockedIncident(): Promise<void> {
  await writeTracker({
    workspace: sessionWorkspace,
    at:        CHANGED_AT,
    now,
    mutate:    (change) => {
      change.board.openIncident({
        kind: 'blocked', ticketIds: ['001'], jobId: null, facts: {}, defaultMove: 'ticket-park'
      }, change.at);
    },
  });
}

function productOwnerJob(): Readonly<Job> | undefined {
  return storedJobs().find((job) => job.kind === 'product-owner');
}

function resumedRecordsOf(jobId: string):{ kind: string; fields: Record<string, unknown> }[] {
  return storedRecords().filter((record) => record.kind === 'job-resumed' && record.jobId === jobId);
}

describe('the session, Talos, Overseer and reboot rows', () => {
  beforeEach(async () => {
    repository       = createScratchDirectory('crash-rows');
    // The common folder git's recorded answers name, which the Overseer resolves.
    mkdirSync(join(repository, '.git'));
    recordedGit.enterFlowStage('tracker ready', repository);
    sessionWorkspace = workspacePathsFor(repository);
    monitorFolder    = createScratchDirectory('h');
    launches         = [];
    launchFacts      = [];
    assistantLaunches = [];
    overseerLog        = [];
    mkdirSync(sessionWorkspace.ticketsDirectory, { recursive: true });
    writeReadableTracker(sessionWorkspace);
    const instructionDefaults = [CONSTITUTION_DEFAULT_PATH, ...(['builder', 'reviewer', 'productOwner', 'assistant'] as const).map(defaultInstructionPathOf)];
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

  afterEach(async () => {
    // Talos and every child it ran work in the repository, so stopping what reaches into it ends them all.
    boardTalos = null;
    await stopProcessesReachingInto(repository);
    removeScratchDirectory(monitorFolder);
    removeScratchDirectory(repository);
  });

  test('overseer dies: Talos keeps the session running, and a restart reads its log from the stored cursor, applying what it missed', async () => {
    const adapter = recordingAdapter({ fresh: LINE_THEN_WAITING_STEPS, resumed: WAITING_STEPS });
    const job     = await runningBuildSession(await startedOverseer(adapter));
    await until(() => eventLogTextOf(job.id, 1).includes('"init"'), 'the session never started');
    // The Overseer is down from here: the session goes on and logs a turn nobody applies.
    const input = { act: 'write-line', line: adapter.chatLineOf('Example line while the Overseer is down') } as const;
    await (await boardTalosOfTheCase()).connection()?.send({ kind: 'input', childId: `jobs/${job.id}#1`, input });
    await until(() => eventLogTextOf(job.id, 1).includes('after-the-line'), 'the session never answered the line');
    const storedCursor = requireBuildJob().eventCursor;
    const unapplied    = childReadings().eventsAfter(sessionJobFolder(job.id), 1, storedCursor.instance === 1 ? storedCursor.sequence : 0);

    expect(JSON.stringify(unapplied)).toContain('after-the-line');
    const report = await (await startedOverseer(adapter)).regroup();

    expect(report.lost).toEqual([]);
    expect(requireBuildJob()).toMatchObject({ id: job.id, state: 'running', childInstance: 1 });
    expect(requireBuildJob().eventCursor.sequence).toBeGreaterThan(storedCursor.sequence);
    expect(storedRecords().filter((record) => record.kind === 'job-interrupted')).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a fresh session takes its first message as its first input, once, and a later pass sends it no second time', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: LINE_THEN_WAITING_STEPS, resumed: WAITING_STEPS }));
    const job       = await runningBuildSession(drivePass);
    const firstLine = recordingAdapter({ fresh: [], resumed: [] }).chatLineOf(`Example first message of ${job.id}`);
    await passUntil(drivePass, () => eventLogTextOf(job.id, 1).includes('after-the-line'), 'the fresh session never took its first message');
    await passOnce(drivePass);

    const clientLines = (childReadings().eventsAfter(sessionJobFolder(job.id), 1, 0) as readonly EventLogEntry[]).filter((entry) => entry.origin === 'client');
    expect(clientLines.map((entry) => entry.line)).toEqual([JSON.stringify({ act: 'write-line', line: firstLine })]);
    expect(existsSync(join(sessionJobFolder(job.id), 'first-message-1.sent'))).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a replaced job\'s fresh session takes the earlier-session note in its first message', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: [STARTED, { kind: 'await-line' }, { kind: 'crash' }], resumed: [{ kind: 'exit', code: 1 }] }));
    const resumeFailed = (): Readonly<{ id: string; jobId: string | null }> | undefined => (
      (requireProgressFile(sessionWorkspace).incidents ?? []).find((incident) => incident.kind === 'resume-failed')
    );
    await passUntil(drivePass, () => resumeFailed() !== undefined, 'resume-failed never opened');
    const firstJobId = resumeFailed()?.jobId ?? '';
    expect(eventLogTextOf(firstJobId, 1)).toContain(`Example first message of ${firstJobId}`);
    expect(eventLogTextOf(firstJobId, 1)).not.toContain(EARLIER_SESSION_NOTE);

    await writeTracker({
      workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => { change.board.defaultIncident(resumeFailed()?.id ?? '', 'turn-closed', change.at); },
    });
    await passUntil(drivePass, () => launches.some((launch) => launch.jobId !== firstJobId), 'no fresh job was launched');
    const freshJobId = launches.find((launch) => launch.jobId !== firstJobId)?.jobId ?? '';
    await passUntil(drivePass, () => eventLogTextOf(freshJobId, 1).includes(EARLIER_SESSION_NOTE), 'the fresh session never took the earlier-session note');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('Talos dies with its agent alive: the agent group is killed first, the job is interrupted watcher-lost and resumed by id in place, told so', async () => {
    // The agent's own tool call keeps it alive whatever happens to its input, as a Bash child of a killed CLI does.
    const adapter  = recordingAdapter({ fresh: [STARTED, { kind: 'shell', command: 'sleep 60' }], resumed: LINE_THEN_WAITING_STEPS });
    const job      = await runningBuildSession(await startedOverseer(adapter));
    const child    = requireRecord(job.id, 1).childProcess;
    await killTalos(job.id, 1);
    await until(() => childReadings().livenessOf(sessionJobFolder(job.id), 1).verdict === 'lost', 'the child never read as lost');
    expect(processIsAlive(child), 'the orphaned agent outlives its Talos').toBe(true);

    const restarted = await startedOverseer(adapter);
    const report    = await restarted.regroup();

    expect(report.lost.filter((lost) => lost.jobId === job.id)).toEqual([{ jobId: job.id, instance: 1, cause: 'watcher-lost' }]);
    expect(processIsAlive(child)).toBe(false);
    expect(storedRecords().find((record) => record.kind === 'job-interrupted' && record.jobId === job.id)?.fields).toMatchObject({ cause: 'watcher-lost' });
    expect(requireBuildJob()).toMatchObject({
      id: job.id, state: 'running', childInstance: 2, crashResumes: 1
    });
    const [freshLaunch, resumeLaunch] = launches;
    expect(resumeLaunch).toEqual({
      jobId: job.id, resume: true, firstMessage: RESUME_MESSAGE, workingDirectory: freshLaunch?.workingDirectory ?? '', sessionId: freshLaunch?.sessionId ?? '',
    });
    await passUntil(restarted, () => eventLogTextOf(job.id, 2).includes('after-the-line'), 'the resumed session never took its first line');
    expect(existsSync(join(sessionJobFolder(job.id), 'resume-message-2.sent'))).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('Talos and agent die with the input open: interrupted agent-crashed, and resumed', async () => {
    const adapter = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS });
    const job     = await runningBuildSession(await startedOverseer(adapter));
    killChildGroup(job.id, 1);
    await killTalos(job.id, 1);
    await until(() => childReadings().livenessOf(sessionJobFolder(job.id), 1).verdict === 'lost', 'the child never read as lost');

    const report = await (await startedOverseer(adapter)).regroup();

    expect(report.lost.filter((lost) => lost.jobId === job.id)).toEqual([{ jobId: job.id, instance: 1, cause: 'agent-crashed' }]);
    expect(report.leftoverWorktrees).toEqual([]);
    expect(requireBuildJob()).toMatchObject({
      id: job.id, state: 'running', childInstance: 2, crashResumes: 1
    });
    expect(resumedRecordsOf(job.id).map((record) => record.fields)).toEqual([{ childInstance: 2, cause: 'agent-crashed' }]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('agent exits with its closing result while the Overseer is down: on regroup the result is read from the event log into Customs', async () => {
    const statesAfterChildEvents: (string | undefined)[] = [];
    const adapter = recordingAdapter({ fresh: [STARTED, { kind: 'print', line: fakeResultLine({ outcome: 'built' }) }, { kind: 'await-line' }], resumed: WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    await passUntil(first, () => childReadings().livenessOf(sessionJobFolder(requireBuildJob().id), 1).verdict !== 'unlaunched', 'the build session was never spawned');
    const job = requireBuildJob();
    await until(() => eventLogTextOf(job.id, 1).includes('"result"'), 'the session never closed its turn');

    await (await startedOverseer(adapter, (phase, board) => {
      if (phase === 'child-events') statesAfterChildEvents.push(board.jobById(job.id)?.state);
    })).regroup();

    expect(statesAfterChildEvents[0]).toBe('in-customs');
    expect(storedRecords().filter((record) => record.jobId === job.id && record.kind === 'job-interrupted')).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('agent exits mid-turn with no closing result: interrupted agent-crashed, and resumed', async () => {
    const adapter = recordingAdapter({ fresh: [STARTED, { kind: 'print', line: fakeAssistantTurnLine('mid-turn') }, { kind: 'crash' }], resumed: WAITING_STEPS });
    const drivePass = await startedOverseer(adapter);
    await passUntil(drivePass, () => resumedRecordsOf(buildJobs()[0]?.id ?? '').length > 0, 'the crashed session was never resumed');
    const job = requireBuildJob();
    expect(storedRecords().find((record) => record.kind === 'job-interrupted' && record.jobId === job.id)?.fields).toMatchObject({ cause: 'agent-crashed' });
    expect(job).toMatchObject({ attempt: 1, childInstance: 2 });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a job crash-resumed twice and interrupted again waits for User\'s resume, which gives it two more crash resumes in the same session', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: CRASHING_STEPS, resumed: CRASHING_STEPS }));
    const waitsAfterLaunches = (launchCount: number): boolean => launches.length === launchCount
      && requireBuildJob().state === 'interrupted' && requireBuildJob().crashResumes === LIFECYCLE_LIMITS.CRASH_RESUMES_BEFORE_WAITING;
    await passUntil(drivePass, () => waitsAfterLaunches(3), 'the crashed job never came to wait');
    await passOnce(drivePass);
    expect(launches).toHaveLength(3);

    await instructResumeOf(requireBuildJob().id);
    await passUntil(drivePass, () => waitsAfterLaunches(6), 'the instructed job never came to wait again');

    const jobId = requireBuildJob().id;
    expect(storedRecords().filter((record) => record.kind === 'job-ended' && record.jobId === jobId)).toEqual([]);
    expect(launches.map((launch) => [launch.jobId, launch.resume])).toEqual([[jobId, false], ...Array.from({ length: 5 }, () => [jobId, true])]);
    expect(resumedRecordsOf(jobId).map((record) => record.fields['instructed'] ?? false)).toEqual([false, false, true, false, false]);
    expect(new Set(launches.map((launch) => launch.workingDirectory)).size).toBe(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a resume the vendor cannot take opens resume-failed and ends the job replaced; its default fresh job takes the same worktree and the earlier-session note', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: CRASHING_STEPS, resumed: [{ kind: 'exit', code: 1 }] }));
    const resumeFailed = (): Readonly<{ id: string; kind: string; jobId: string | null }> | undefined => (
      (requireProgressFile(sessionWorkspace).incidents ?? []).find((incident) => incident.kind === 'resume-failed')
    );
    await passUntil(drivePass, () => resumeFailed() !== undefined, 'resume-failed never opened');
    const incident   = resumeFailed();
    const firstJobId = incident?.jobId ?? '';
    expect(storedRecords().find((record) => record.kind === 'job-ended' && record.jobId === firstJobId)?.fields).toMatchObject({ outcome: 'replaced', cause: 'resume-failed' });

    await writeTracker({
      workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => { change.board.defaultIncident(incident?.id ?? '', 'turn-closed', change.at); },
    });
    await passUntil(drivePass, () => launches.some((launch) => launch.jobId !== firstJobId), 'no fresh job was launched');

    const freshLaunch = launches.find((launch) => launch.jobId !== firstJobId);
    expect(freshLaunch).toMatchObject({ resume: false, workingDirectory: launches[0]?.workingDirectory ?? '' });
    expect(launchFacts.find((launch) => launch.jobId === freshLaunch?.jobId)?.facts.earlierSessionReplaced).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('three reboots in a row during one build, each resumed once User asks: three resumes of the same session, none counted, and no fresh agent', async () => {
    const adapter = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS });
    let job = await runningBuildSession(await startedOverseer(adapter));
    for (let rebootNumber = 1; rebootNumber <= 3; rebootNumber += 1) {
      const { id, childInstance } = job;
      await until(() => eventLogTextOf(id, childInstance).includes('"init"'), 'the session never started');
      await reboot(job.id, job.childInstance);
      const restarted = await startedOverseer(adapter);
      const report    = await restarted.regroup();
      expect(report.lost.filter((lost) => lost.jobId === job.id)).toEqual([{ jobId: job.id, instance: rebootNumber, cause: 'reboot' }]);
      await instructResumeOf(job.id);
      job = await runningBuildSession(restarted);
    }

    expect(job).toMatchObject({ attempt: 1, childInstance: 4, crashResumes: 0 });
    expect(resumedRecordsOf(job.id).map((record) => record.fields['cause'])).toEqual(['reboot', 'reboot', 'reboot']);
    expect(new Set(launches.map((launch) => `${launch.jobId} ${launch.sessionId} ${launch.workingDirectory}`)).size).toBe(1);
    // A reboot takes the Assistant down too, which is replaced; the build is never ended.
    expect(storedRecords().filter((record) => record.kind === 'job-ended' && record.jobId === job.id)).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a question answered while the Overseer is down: the restart replays it without a second decision and the live session takes the control_response', async () => {
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
    // Talos logs the line it wrote inside its client entry, so the answer's quotes read escaped.
    expect(eventLogTextOf(job.id, 1)).toContain('\\"type\\":\\"control_response\\"');
    expect(eventLogTextOf(job.id, 1)).toContain('\\"answers\\":{\\"Ship the example export?\\":\\"No\\"}');
    expect(storedRecords().filter((record) => record.kind === 'decision-opened')).toHaveLength(1);
    expect(requireBuildJob()).toMatchObject({ childInstance: 1, state: 'running' });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a question pending when the machine reboots stays open, nothing resumes until it is answered, and the resume carries the answer', async () => {
    const adapter = recordingAdapter({ fresh: ASKING_STEPS, resumed: LINE_THEN_WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    const job     = await runningBuildSession(first);
    await passUntil(first, () => requireBuildJob().state === 'waiting-for-answer', 'the question never opened its decision');
    await first.stop();
    await reboot(job.id, 1);

    const restarted = await startedOverseer(adapter);
    await restarted.regroup();
    await passOnce(restarted);
    expect(requireBuildJob()).toMatchObject({ state: 'interrupted', interruption: 'reboot', childInstance: 1 });
    expect(openDecisions().map((decision) => decision.id)).toEqual(['E1']);

    await decideWithTheOverseerDown('E1', ['a']);
    await passUntil(restarted, () => eventLogTextOf(job.id, 2).includes('after-the-line'), 'the resumed session never took the answer');
    expect(eventLogTextOf(job.id, 2)).toContain(ANSWER_MESSAGE_PREFIX);
    expect(eventLogTextOf(job.id, 2)).not.toContain(RESUME_MESSAGE);
    expect(launches.map((launch) => launch.resume)).toEqual([false, true]);
    expect(requireBuildJob()).toMatchObject({ crashResumes: 0, childInstance: 2 });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an agent that takes no live answer is stopped and resumed with the answer, cause answer-delivery, never counted', async () => {
    const adapter = withoutLiveAnswers(recordingAdapter({ fresh: ASKING_STEPS, resumed: LINE_THEN_WAITING_STEPS }));
    const drivePass = await startedOverseer(adapter);
    const job       = await runningBuildSession(drivePass);
    await passUntil(drivePass, () => requireBuildJob().state === 'waiting-for-answer', 'the question never opened its decision');

    await decideWithTheOverseerDown('E1', ['a']);
    await passUntil(drivePass, () => eventLogTextOf(job.id, 2).includes('after-the-line'), 'the resumed session never took the answer');

    expect(resumedRecordsOf(job.id).map((record) => record.fields)).toEqual([{ childInstance: 2, cause: 'answer-delivery' }]);
    expect(eventLogTextOf(job.id, 1)).not.toContain('control_response');
    expect(eventLogTextOf(job.id, 2)).toContain(ANSWER_MESSAGE_PREFIX);
    expect(requireBuildJob()).toMatchObject({ crashResumes: 0 });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a worker reports a malformed ticket, then the machine reboots: one incident survives, escalates with the agent\'s words, and the answer resumes it', async () => {
    const adapter = recordingAdapter({ fresh: askingSteps({ ...EXAMPLE_QUESTION, header: 'ticket' }), resumed: LINE_THEN_WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    const job     = await runningBuildSession(first);
    await passUntil(first, () => requireBuildJob().state === 'waiting-for-answer', 'the report never opened its incident');
    expect(openDecisions()).toEqual([]);
    await first.stop();
    await reboot(job.id, 1);

    const restarted = await startedOverseer(adapter);
    await restarted.regroup();
    await passOnce(restarted);
    const incidents = requireProgressFile(sessionWorkspace).incidents ?? [];
    expect(incidents).toMatchObject([{
      id: 'I1', kind: 'malformed-ticket', jobId: job.id, defaultMove: 'incident-escalate'
    }]);
    expect(requireBuildJob()).toMatchObject({ state: 'interrupted', childInstance: 1 });

    await writeTracker({
      workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => change.board.escalateQuestionIncident('I1', change.at),
    });
    expect(openDecisions()).toMatchObject([{
      kind: 'agent-question', jobId: job.id, requestId: 'request-1', questions: [{ ...EXAMPLE_QUESTION, header: 'ticket' }], context: ''
    }]);
    await decideWithTheOverseerDown('E1', ['b']);
    await passUntil(restarted, () => eventLogTextOf(job.id, 2).includes('after-the-line'), 'the resumed session never took the answer');
    expect(eventLogTextOf(job.id, 2)).toContain(ANSWER_MESSAGE_PREFIX);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

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
    await until(() => childReadings().livenessOf(sessionJobFolder(assistantJobId), 1).verdict === 'live', 'the same instance was never claimed');
    expect(storedJobs().find((job) => job.id === assistantJobId)?.childInstance).toBe(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an Assistant session finishes only once the Overseer closed its input: a turn\'s result keeps it running, its child gone while stopping ends it closed', async () => {
    const assistantSteps: readonly FakeAgentStep[] = [STARTED, { kind: 'print', line: fakeResultLine({ outcome: 'built' }) }, { kind: 'await-line' }];
    const adapter = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS, Assistant: assistantSteps });
    const drivePass        = await startedOverseer(adapter);
    const assistantJob  = (): Readonly<Job> | undefined => storedJobs().find((job) => job.kind === 'assistant');
    const assistantId   = (): string => assistantJob()?.id ?? '';
    await passUntil(drivePass, () => assistantJob() !== undefined && eventLogTextOf(assistantId(), 1).includes('"result"'), 'the Assistant never ended a turn');
    await passOnce(drivePass);
    expect(assistantJob()).toMatchObject({ state: 'running', childInstance: 1 });

    const jobId = assistantId();
    await writeTracker({
      workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => { change.board.moveJob(jobId, 'stopping', change.at); },
    });
    killChildGroup(jobId, 1);
    await killTalos(jobId, 1);
    await (await boardTalosOfTheCase()).ensureIfLost();
    await until(() => childReadings().livenessOf(sessionJobFolder(jobId), 1).verdict === 'lost', 'the Assistant\'s child never read as lost');
    await passUntil(drivePass, () => storedRecords().some((record) => record.kind === 'job-ended' && record.jobId === jobId), 'the stopped Assistant never ended');

    expect(storedRecords().find((record) => record.kind === 'job-ended' && record.jobId === jobId)?.fields).toMatchObject({ outcome: 'closed' });
    expect(storedRecords().filter((record) => record.kind === 'job-interrupted' && record.jobId === jobId)).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('Assistant mid-turn, Overseer restarted: the session continues, its turn\'s result is read from history and closes the delivery turn', async () => {
    const assistantSteps: readonly FakeAgentStep[] = [STARTED, FIRST_TURN_RESULT, { kind: 'await-line' }, FIRST_TURN_RESULT, { kind: 'await-line' }];
    const adapter   = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS, Assistant: assistantSteps });
    const drivePass = await startedOverseer(adapter);
    await passUntil(drivePass, () => assistantAnswered(1), 'the Assistant never answered its first message');
    const assistantId = requireAssistant().id;
    await openBlockedIncident();
    await passUntil(drivePass, () => openIncidents()[0]?.deliveredInTurn?.chatSequence === 2, 'the incident was never delivered as chat 2');
    await drivePass.stop();
    // The Overseer is down from here: the Assistant answers chat 2, a result nobody applies.
    await until(() => assistantAnswered(2), 'the Assistant never answered chat 2');

    const successor = await startedOverseer(adapter);
    await successor.regroup();
    await passUntil(successor, () => openIncidents().length === 0, 'the closed turn never defaulted its incident');

    expect(requireAssistant()).toMatchObject({ id: assistantId, state: 'running', childInstance: 1 });
    expect(storedRecords().find((record) => record.kind === 'incident-defaulted')?.fields).toMatchObject({ cause: 'turn-closed' });
    expect(storedRecords().filter((record) => record.jobId === assistantId && ['job-interrupted', 'job-ended'].includes(record.kind))).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('Assistant move queued just before its turn\'s result: the move is applied before the turn\'s default, which never comes', async () => {
    const releaseFile = join(monitorFolder, 'release-the-result');
    const assistantSteps: readonly FakeAgentStep[] = [
      STARTED,
      FIRST_TURN_RESULT,
      { kind: 'await-line' },
      { kind: 'shell', command: `while [ ! -f '${releaseFile}' ]; do sleep 0.02; done` },
      FIRST_TURN_RESULT,
      { kind: 'await-line' },
    ];
    let moveIsDue = false;
    const queueTheMoveThenAnswer = (): void => {
      if (!moveIsDue) return;
      moveIsDue = false;
      const assistant = requireAssistant();
      writeHatchRequest(HatchInbox.hatchDirectoryOf(repository, assistant.id), {
        hatchFormatVersion: 1,
        requestId:          'request-park',
        command:            {
          kind: 'ticket-park', ticketReference: '001', reason: 'Example park reason', incidentId: openIncidents()[0]?.id ?? ''
        },
      });
      writeFileSync(releaseFile, '');
      blockUntil(() => assistantAnswered(2), 'the Assistant answering the delivered incident');
    };
    const adapter   = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS, Assistant: assistantSteps });
    const drivePass = await startedOverseer(adapter, undefined, queueTheMoveThenAnswer);
    await passUntil(drivePass, () => assistantAnswered(1), 'the Assistant never answered its first message');
    await openBlockedIncident();
    await passUntil(drivePass, () => openIncidents()[0]?.deliveredInTurn?.chatSequence === 2, 'the incident was never delivered as chat 2');
    moveIsDue = true;
    await passUntil(drivePass, () => openIncidents().length === 0, 'the incident never closed');

    expect(assistantAnswered(2)).toBe(true);
    expect(storedRecords().filter((record) => ['incident-handled', 'incident-defaulted'].includes(record.kind)).map((record) => record.kind)).toEqual(['incident-handled']);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('Assistant down during a delivery turn: ended replaced, cause assistant-down, never resumed, and a fresh one\'s first message carries the incident', async () => {
    const assistantSteps: readonly FakeAgentStep[] = [STARTED, FIRST_TURN_RESULT, { kind: 'await-line' }, { kind: 'crash' }];
    const drivePass = await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS, Assistant: assistantSteps }));
    await passUntil(drivePass, () => assistantAnswered(1), 'the Assistant never answered its first message');
    const downId = requireAssistant().id;
    await openBlockedIncident();
    await passUntil(drivePass, () => (requireAssistant().id !== downId), 'no fresh Assistant was booted');

    expect(storedRecords().find((record) => record.kind === 'job-ended' && record.jobId === downId)?.fields).toMatchObject({ outcome: 'replaced', cause: 'assistant-down' });
    expect(resumedRecordsOf(downId)).toEqual([]);
    const fresh = requireAssistant();
    expect(openIncidents().map((incident) => incident.deliveredInTurn)).toEqual([{ jobId: fresh.id, chatSequence: 1 }]);
    expect(launchFacts.find((launched) => launched.jobId === fresh.id)?.facts.assistant?.incidents.map((incident) => incident.kind)).toEqual(['blocked']);
    const freshLaunch = assistantLaunches.find((request) => basename(request.jobFilesDirectory) === fresh.id);
    expect(freshLaunch).toMatchObject({
      resume: false, model: 'sonnet', effort: 'medium', reportSchema: null
    });
    expect(freshLaunch?.workingDirectory).toBe(join(repository, PRODUCT_NAMES.WORKTREES_FOLDER, 'sessions', fresh.id));
    // No question tool and no network: the adapter disallows AskUserQuestion, WebFetch and WebSearch from these.
    expect(freshLaunch?.profile).toMatchObject({ askUser: false, webNetworkDomains: 'none', shellNetworkDomains: [] });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('no Assistant can come up: two boots failing before a result default every incident, and the next boot waits for a sweep', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS, Assistant: CRASHING_STEPS }));
    await openBlockedIncident();
    await passUntil(drivePass, () => failedAssistantBoots() === 2, 'two Assistant boots never failed');
    await passUntil(drivePass, () => openIncidents().length === 0, 'the open incident never took its default');
    await passOnce(drivePass);
    await passOnce(drivePass);

    expect(storedRecords().find((record) => record.kind === 'incident-defaulted')?.fields).toMatchObject({ cause: 'no-assistant' });
    expect(storedJobs().filter((job) => job.kind === 'assistant')).toEqual([]);

    drivePass.sweep();
    await drivePass.idle();
    expect(storedRecords().filter((record) => record.kind === 'job-launched' && record.fields['kind'] === 'assistant')).toHaveLength(3);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

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
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a product owner interrupted by a reboot at its question waits, and resumes by id once the question is answered', async () => {
    const adapter = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS, productOwner: { fresh: ASKING_STEPS, resumed: LINE_THEN_WAITING_STEPS } });
    const first = await startedOverseer(adapter);
    await applyControl({ kind: 'intake-start', text: 'Example basket' });
    await passUntil(first, () => productOwnerJob()?.state === 'waiting-for-answer', 'the product owner never asked');
    const jobId = productOwnerJob()?.id ?? '';
    await first.stop();
    await reboot(jobId, 1);

    const restarted = await startedOverseer(adapter);
    await restarted.regroup();
    await passOnce(restarted);
    expect(productOwnerJob()).toMatchObject({ state: 'interrupted', interruption: 'reboot', childInstance: 1 });

    await decideWithTheOverseerDown(openDecisions()[0]?.id ?? '', ['a']);
    await passUntil(restarted, () => eventLogTextOf(jobId, 2).includes('after-the-line'), 'the resumed product owner never took the answer');
    expect(resumedRecordsOf(jobId).map((record) => record.fields)).toEqual([{ childInstance: 2, cause: 'reboot', instructed: true }]);
    expect(eventLogTextOf(jobId, 2)).toContain(ANSWER_MESSAGE_PREFIX);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

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
    expect(productOwnerJob()).toMatchObject({ id: jobId, state: 'running', childInstance: 2 });
    await passUntil(drivePass, () => eventLogTextOf(jobId, 2).includes('after-the-line'), 'the reopened product owner never took the message');

    const [first, reopened] = productOwnerLaunches;
    expect(reopened).toEqual({
      jobId, resume: true, firstMessage: 'Example follow-up from Alex Example', workingDirectory: first?.workingDirectory ?? '', sessionId: first?.sessionId ?? '',
    });
    expect(first?.resume).toBe(false);
    expect(eventLogTextOf(jobId, 2)).toContain('Example follow-up from Alex Example');
    expect(eventLogTextOf(jobId, 2)).not.toContain(RESUME_MESSAGE);
    expect(storedRecords().filter((record) => record.kind === 'job-reopened' && record.jobId === jobId).map((record) => record.fields['childInstance'])).toEqual([2]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);


  test('a reused pid is never signalled: a lost child whose recorded process names another process reads agent-crashed', () => {
    // A board folder of its own, so the teardown that stops what reaches into the repository never reads this spec's own process.
    const self = identityOf(process.pid);
    if (self === null) throw new Error('this process has no readable identity');
    const reused = { ...self, startStamp: '1' };
    PlantedChild.plantChildRecord({ boardFolder: monitorFolder, childFolder: 'J99', instance: 1 }, { talos: reused, childProcess: reused, childProcessGroupId: process.pid });
    const jobFolder = join(monitorFolder, 'J99');
    expect(talosChildReadingsWith(ports, monitorFolder).livenessOf(jobFolder, 1).verdict).toBe('lost');
    expect(Regrouping.settleLostChildIn(monitorFolder, ports, jobFolder, 1)).toBe('agent-crashed');
    expect(processIsAlive(self)).toBe(true);
  });

  test('a worktree folder no job or branch owns opens leftover-worktree to User once, however often the Overseer starts', async () => {
    const worktreesRoot = join(repository, PRODUCT_NAMES.WORKTREES_FOLDER);
    mkdirSync(join(worktreesRoot, 'ticket-999'), { recursive: true });
    // The worktree a branch owns is the flow's ticket worktree, which git lists once the stage "worktree made" is entered.
    mkdirSync(join(worktreesRoot, RECORDED_FLOW_TICKET_BRANCH), { recursive: true });
    recordedGit.enterFlowStage('worktree made', repository);
    let openSetupId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        change.board.setOverseerState('paused', change.at);
        const opening = {
          mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
        } as const;
        openSetupId = change.board.openSetup(opening, change.at).setup.setupId;
      },
    });
    // The open record holds its snapshot, so the snapshot sweep leaves it and only the leftover check could name it.
    mkdirSync(join(worktreesRoot, 'pipeline-agent', openSetupId), { recursive: true });
    const adapter = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS });

    const report = await (await startedOverseer(adapter)).regroup();
    await (await startedOverseer(adapter)).regroup();

    expect(report.leftoverWorktrees.map((folder) => basename(folder))).toEqual(['ticket-999']);
    const decisions = (requireProgressFile(sessionWorkspace).decisions ?? []).filter((decision) => decision.kind === 'leftover-worktree');
    expect(decisions.map((decision) => basename(decision.context))).toEqual(['ticket-999']);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('run restart mid-session or mid-gate: the Baton pass sends Talos nothing, and the successor reads the session on from the stored cursor', async () => {
    const adapter   = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS });
    const oldOverseer = await startedOverseer(adapter);
    const job       = await runningBuildSession(oldOverseer);
    const child     = requireRecord(job.id, 1).childProcess;
    const { overseerDirectory } = overseerFilesIn(sessionWorkspace.trackerDirectory);
    const batonPassFilePath = BatonPass.batonPassFilePathOf(overseerDirectory, oldOverseer.state().generation);
    BatonPass.writeBatonPass(batonPassFilePath, { state: 'requested' });
    const self = identityOf(process.pid);
    const successorReports: Awaited<ReturnType<DrivePass['regroup']>>[] = [];

    const [outcome] = await Promise.all([
      BatonPass.handOver({
        ports,
        batonPassFilePath,
        successor:            self,
        successorCodeVersion: 'code-example',
        release:              () => oldOverseer.stop(),
        recordFailure:        () => Promise.resolve(),
        schedule:             BATON_PASS_SCHEDULE,
      }),
      (async () => {
        const request  = {
          batonPassFilePath, codeVersion: 'code-example', predecessorIsLive: () => true, schedule: BATON_PASS_SCHEDULE
        };
        const readChildRecords = { step: 'read-child-records' as const, run: () => { if (childRecordOf(job.id, 1) === null) throw new Error('no child record'); } };
        expect(await BatonPass.prepareAndAwaitRelease(request, [readChildRecords])).toBe('released');
        const successor = await startedOverseer(adapter);
        successorReports.push(await successor.regroup());
        BatonPass.reportServing(request, successor.state().generation, 'http://127.0.0.1:1/');
      })(),
    ]);

    expect(outcome.verdict).toBe('baton-passed');
    expect(processIsAlive(child)).toBe(true);
    expect(successorReports[0]?.lost).toEqual([]);
    expect(requireBuildJob()).toMatchObject({ id: job.id, state: 'running', childInstance: 1 });
    expect(storedRecords().filter((record) => record.kind === 'job-interrupted')).toEqual([]);
    expect(launches.filter((launch) => launch.jobId === job.id)).toHaveLength(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
