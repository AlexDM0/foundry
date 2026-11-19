/**
 * The rows of the crash, reboot and update matrix that need no real process. What matters in these rows: a hold cut short after its journal is
 * finished by the next holder before that holder reads, and a holder whose lock was taken over writes nothing further, its committed journal
 * replayed by its successor. A hold that leaves progress.json as it was journals only the files it changes, and a crash anywhere in it is still
 * finished by the next holder, progress.json never rewritten. The session rows run a build job behind `src/testing/RecordedTalosStages.ts`,
 * an Overseer restart being a fresh DrivePass regrouping: a fresh session takes its first message once, a restart replays history, an answer
 * given with the Overseer down reaches the session, a stopped product owner never resumes by itself, and an Airlock agent, or a conflict
 * re-reviewer before User's code review, launches never asking User. A first instance that resumes another job's session and exits before
 * it starts is a failed resume. A gate profile left running by a stopped Overseer reads `stopped` after the next start, is never run
 * again, and its worktree goes.
 *
 * An Apply cut short anywhere in its hold is finished by the next holder's journal replay, so a retried Apply of the same revision finds
 * it applied, or still waiting for its commit, and never refuses the pipeline it stored itself; the Overseer's start hold leaves no record
 * open either.
 *
 * Every row that kills or crashes a process, or needs a real Talos, git history or Baton pass, is in
 * `src/services/overseer/CrashMatrix.integration.spec.ts`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
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
import type { ChildRecord }                                 from '../../lib/talos/ChildRecord.ts';
import { createEventLogWriter, type EventLogEntry }         from '../../lib/talos/EventLog.ts';
import type { Decision }                                    from '../../lib/tracker-model/@types/Decision.ts';
import type { Job }                                         from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                                       from '../../lib/tracker-model/Board.ts';
import type { ControlCommand }                              from '../../shared/@types/ControlCommand.ts';
import { refusalIsOperationRefusal }                        from '../../shared/OperationRefusal.ts';
import { WorktreesFolder }                                  from '../../shared/WorktreesFolder.ts';
import { LIFECYCLE_LIMITS }                                 from '../../shared/constants/LifecycleLimits.ts';
import { LIMITS }                                           from '../../shared/constants/Limits.ts';
import { FORCED_STOP_TRIES_BEFORE_BLOCKING }                from '../../shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                    from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }                      from '../../testing/BoardFixtures.ts';
import { createScratchDrivePass }                           from '../../testing/DrivePassHarness.ts';
import { ECHOED_CONTROL_CONTEXT, echoedControlContextWith } from '../../testing/EchoedControlContext.ts';
import {
  fakeAgentAdapter,
  fakeAssistantTurnLine,
  fakeQuestionLine,
  type FakeAgentStep,
  fakeResultLine,
  fakeStartedLine
} from '../../testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                                 from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                 from '../../testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                     from '../../testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                             from '../../testing/RecordedGitFlow.ts';
import { type RecordedTalosStages, useRecordedTalosStages }    from '../../testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory }      from '../../testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }                from '../../testing/TalosChildReadings.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT }   from '../../testing/ToolGuard.ts';
import { EXAMPLE_TICKET_FILE_NAME, writeReadableTracker }      from '../../testing/TrackerFileFixtures.ts';
import { waitUntil }                                           from '../../testing/WaitUntil.ts';
import { ControlService }                                      from '../control/ControlService.ts';
import { finishHalfAppliedSetup }                              from '../control/PipelineSetupControls.ts';
import { holdJournalFilePathOf, readHoldJournal }              from '../tracker/HoldJournal.ts';
import { LockGenerationSteps, NO_LOCK_HOLDER_READS_AS_GONE }   from '../tracker/TrackerLock.ts';
import { writeTracker, type TrackerChange }                    from '../tracker/TrackerPipeline.ts';
import { requireProgressFile }                                 from '../tracker/TrackerReader.ts';
import { workspacePathsFor, type Workspace }                   from '../tracker/Workspace.ts';
import { AirlockFactsFile }                                    from './AirlockFactsFile.ts';
import type { BoardChildren }                                  from './BoardChildren.ts';
import type { DrivePass, JobLaunchFacts }                      from './DrivePass.ts';
import { GATE_PROFILE_WORKTREES_FOLDER, GateProfiling }        from './GateProfiling.ts';
import { CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf } from './InstructionFiles.ts';
import { IntakeSessions }                                      from './IntakeSessions.ts';
import { JobResumption }                                       from './JobResumption.ts';
import { jobFolderIn }                                         from './OverseerFiles.ts';
import { RedHandoff }                                          from './RedHandoff.ts';
import { Regrouping }                                          from './Regrouping.ts';

const recordedGit = useRecordedGit();

const world = useRecordedTalosStages(nativePlatformPorts());
let ports: RecordedTalosStages['ports'];

const CHANGED_AT = '2026-09-18T20:05:00+02:00';

const now = (): Date => new Date('2026-09-18T18:05:00Z');


let workspace: Workspace;

/** The children as the Overseer reads them, through Talos's adapter over the case's platform ports. */
function childReadings(): BoardChildren {
  return talosChildReadingsWith(ports, sessionWorkspace.trackerDirectory);
}

function ticketFilePath(): string {
  return join(workspace.ticketsDirectory, EXAMPLE_TICKET_FILE_NAME);
}

function ticketText(): string {
  return readFileSync(ticketFilePath(), 'utf8');
}

function loggedKinds(): string[] {
  return readFileSync(workspace.logFilePath, 'utf8').trimEnd().split('\n').map((line) => (JSON.parse(line) as { kind: string }).kind);
}

function holdTheExampleTicket(change: TrackerChange): void {
  change.board.addTask({ name: 'Example cut-short row', startsNow: false, movesTheLink: false }, change.at);
  change.board.holdTicket('001', 'Waiting on Alex Example', change.at);
}

/** The example tracker has no row, so holding its ticket changes the ticket and the log and leaves progress.json as it was. */
function holdTheExampleTicketAlone(change: TrackerChange): void {
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
  const takeover = LockGenerationSteps.attemptedAcquire(workspace.lockDirectoryPath, payload, now().getTime() + LIMITS.LOCK_STALE_MILLISECONDS + 1, NO_LOCK_HOLDER_READS_AS_GONE);
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

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'crash between progress.json and the ticket files', () => {
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
    const loggedKindsAfterReplay = loggedKinds();
    expect(loggedKindsAfterReplay.at(-1)).toBe('note');
    expect(loggedKindsAfterReplay.length, 'the cut-short hold\'s records are in the log before the next holder\'s note').toBeGreaterThan(2);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a gate profile running when its Overseer stopped', () => {
  const lineRequests: unknown[] = [];

  /** The next Overseer's profiling: its holds go through the lock, and every line it would run is only counted. */
  function nextOverseersProfiling(): ReturnType<typeof GateProfiling.createGateProfiling> {
    return GateProfiling.createGateProfiling({
      workspace,
      worktreesRoot:   WorktreesFolder.worktreesRootOf(workspace.rootDirectory),
      mainLine:        RECORDED_FLOW_MAIN_LINE,
      platformPorts:   nativePlatformPorts(),
      gateSlots:       { tryAcquireAfterRealGates: () => true, release: () => undefined },
      gateEnvironment: () => ({}),
      confinedLineIn:  () => (argv) => ({ verdict: 'runs', argv }),
      hold:            async (mutate) => (await writeTracker({
        workspace, at: CHANGED_AT, now, mutate: (change) => mutate({ board: change.board, at: change.at })
      })).result,
      wake:         () => undefined,
      log:          () => undefined,
      runGateLines: (request) => {
        lineRequests.push(request);
        return Promise.resolve({ failedStep: null, prepareOutput: '', gates: [] });
      },
      runLine:            () => Promise.reject(new Error('a crashed run starts no line')),
      stopLiveLinesUnder: () => Promise.resolve(),
    });
  }

  /** P1 marked running by an Overseer that then stopped, with its worktree left behind. */
  async function leaveARunRunning(): Promise<string> {
    await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        change.board.queueGateProfile({
          setupId: null, phase: 'build', gate: { name: 'tests', run: 'bun test' }, prepare: []
        }, change.at);
        change.board.markGateProfileRunning('P1');
      },
    });
    const worktree = join(WorktreesFolder.worktreesRootOf(workspace.rootDirectory), GATE_PROFILE_WORKTREES_FOLDER, 'P1');
    mkdirSync(worktree, { recursive: true });
    return worktree;
  }

  test('reads stopped after the next start, with no result, and is never run again', async () => {
    lineRequests.length = 0;
    const worktree = await leaveARunRunning();
    const profiling = nextOverseersProfiling();
    const removal = [{ gitArguments: ['worktree', 'remove', '--force', worktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LINKED, removesFolder: worktree }];

    await recordedGit.playStage(removal, () => profiling.settleAtStart());
    const { board } = await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: () => undefined
    });
    profiling.followRuns(board);
    await profiling.idle();

    expect(board.gateProfileRuns()).toMatchObject([{ profileRunId: 'P1', state: 'stopped', elapsedMilliseconds: null }]);
    expect(loggedKinds().filter((kind) => kind === 'gate-profile-stopped')).toHaveLength(1);
    expect(lineRequests).toEqual([]);
  });

  test('its worktree, and every other one under the profile worktrees, is removed at the start', async () => {
    const worktree = await leaveARunRunning();
    const leftover = join(worktree, '..', 'P0');
    mkdirSync(leftover, { recursive: true });
    const removals = [leftover, worktree].map((path) => ({
      gitArguments:  ['worktree', 'remove', '--force', path],
      answeredAs:    GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LINKED,
      removesFolder: path,
    }));

    await recordedGit.playStage(removals, () => nextOverseersProfiling().settleAtStart());

    expect(existsSync(worktree)).toBe(false);
    expect(existsSync(leftover)).toBe(false);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a stale holder resumes after a lock takeover', () => {
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

  test('a hold that changes nothing, taken over, refuses lock-taken-over and leaves no journal', async () => {
    const progressBefore = readFileSync(workspace.progressFilePath, 'utf8');

    const failure = await failureOf(() => writeTracker({
      workspace, at: CHANGED_AT, now, mutate: () => { takeTheLockOver(); },
    }));

    expect(refusalIsOperationRefusal(failure) ? failure.detail?.kind : null).toBe('lock-taken-over');
    expect(readFileSync(workspace.progressFilePath, 'utf8')).toBe(progressBefore);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'crash in a hold that leaves progress.json as it was', () => {
  test.each([
    ['after the ticket, before the log', () => ticketFilePath()],
    ['after the log, before the journal goes', () => workspace.logFilePath],
  ])('cut short %s: the journal holds only the ticket and the log, and the next holder finishes it, progress.json never rewritten', async (_crashPoint, crashFilePathOf) => {
    const progressBefore      = readFileSync(workspace.progressFilePath, 'utf8');
    const progressInodeBefore = statSync(workspace.progressFilePath).ino;
    const crash               = new Error('the holder crashed');

    const failure = await failureOf(() => writeTracker({
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           holdTheExampleTicketAlone,
      afterFileWritten: (filePath) => { if (filePath === crashFilePathOf()) throw crash; },
    }));
    expect(failure).toBe(crash);
    const journal = readHoldJournal(workspace);
    expect(journal.verdict === 'readable' ? journal.files.map((file) => file.filePath) : journal.verdict).toEqual([ticketFilePath(), workspace.logFilePath]);

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: noteAnExample,
    });

    expect(ticketText()).toContain('Waiting on Alex Example');
    expect(loggedKinds(), 'the cut-short hold\'s record is in the log once, before the next holder\'s note').toEqual(['note', 'ticket-held', 'note']);
    expect(readFileSync(workspace.progressFilePath, 'utf8')).toBe(progressBefore);
    expect(statSync(workspace.progressFilePath).ino).toBe(progressInodeBefore);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });
});

describe('an Apply cut short', () => {
  const MAIN_CONSTITUTION = { path: 'CONSTITUTION.md', markdown: '# Example Agency\n\n- Keep the basket page fast.\n', blob: 'c'.repeat(40) };
  const MAIN_HOLDS_THE_TEXT = echoedControlContextWith({ verdict: 'read', constitution: MAIN_CONSTITUTION });
  const APPLY_COMMAND: ControlCommand = {
    kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: true
  };

  /** A first setup S1 with its constitution drafted, at the apply step. */
  async function openSetupAtApply(): Promise<void> {
    await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        const { setupId } = change.board.openSetup({
          mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
        }, change.at).setup;
        change.board.setConstitution(setupId, {
          markdown:    MAIN_CONSTITUTION.markdown,
          annotations: [{
            lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: null
          }]
        }, change.at);
        for (const step of ['research', 'constitution', 'design'] as const) change.board.continueSetupStep(setupId, step, change.at);
      },
    });
  }

  async function applyCutAfter(cutFilePath: string, context: typeof MAIN_HOLDS_THE_TEXT): Promise<void> {
    const crash = new Error('the holder crashed');
    const failure = await failureOf(() => writeTracker({
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           (change) => ControlService.apply(APPLY_COMMAND, change, context),
      afterFileWritten: (filePath) => { if (filePath === cutFilePath) throw crash; },
    }));
    expect(failure).toBe(crash);
  }

  test('after the request, a retried Apply of the same revision answers with the waiting request and never refuses pipeline-apply-pending', async () => {
    await openSetupAtApply();
    await applyCutAfter(workspace.logFilePath, ECHOED_CONTROL_CONTEXT);

    const retried = await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => ControlService.apply(APPLY_COMMAND, change, ECHOED_CONTROL_CONTEXT).result
    });

    expect(retried.result).toMatchObject({ outcome: 'committing', logged: [] });
    expect(retried.board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'committing', draftRevision: 0 });
    expect(loggedKinds().filter((kind) => kind === 'pipeline-apply-requested')).toHaveLength(1);
  });

  test.each([
    ['progress.json', () => workspace.progressFilePath],
    ['pipeline.json', () => workspace.pipelineFilePath],
    ['the sources file', () => workspace.constitutionSourcesFilePath],
    ['the log', () => workspace.logFilePath],
  ])('after %s, a retried Apply finishes every missing write once and never refuses pipeline-moved', async (_cutPoint, cutFilePathOf) => {
    await openSetupAtApply();
    await applyCutAfter(cutFilePathOf(), MAIN_HOLDS_THE_TEXT);

    const retried = await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => ControlService.apply(APPLY_COMMAND, change, MAIN_HOLDS_THE_TEXT).result
    });

    expect(retried.result).toMatchObject({ outcome: 'already-applied' });
    expect(existsSync(workspace.pipelineSetupFilePath)).toBe(false);
    expect(JSON.parse(readFileSync(workspace.pipelineFilePath, 'utf8'))).toMatchObject({ constitution: { path: 'CONSTITUTION.md' } });
    expect(JSON.parse(readFileSync(workspace.constitutionSourcesFilePath, 'utf8'))).toMatchObject({ blob: MAIN_CONSTITUTION.blob });
    expect(requireProgressFile(workspace).overseerState).toBe('running');
    expect(loggedKinds().filter((kind) => kind === 'pipeline-applied')).toHaveLength(1);
  });

  test.each([
    ['pipeline.json', () => workspace.pipelineFilePath],
    ['the log', () => workspace.logFilePath],
  ])('after %s, the Overseer\'s start hold finishes the Apply and leaves no record open', async (_cutPoint, cutFilePathOf) => {
    await openSetupAtApply();
    await applyCutAfter(cutFilePathOf(), MAIN_HOLDS_THE_TEXT);

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => finishHalfAppliedSetup(change, MAIN_HOLDS_THE_TEXT)
    });

    expect(existsSync(workspace.pipelineSetupFilePath)).toBe(false);
    expect(loggedKinds().filter((kind) => kind === 'pipeline-applied')).toHaveLength(1);
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
  question:    'Ship the example export?',
  header:      'Export',
  multiSelect: false,
  options:     [
    { label: 'Yes', description: 'Ship it', isRecommended: false },
    { label: 'No', description: 'Hold it', isRecommended: false },
  ],
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

/** The same adapter as one whose live session takes no answer line, so the Overseer delivers an answer by a stop and a resume. */
function withoutLiveAnswers(adapter: AgentAdapter): AgentAdapter {
  return { ...adapter, capabilities: { ...adapter.capabilities, takesLiveAnswers: false } };
}

/** An Overseer start: a newer Baton generation and a fresh DrivePass, which the spec regroups. */
function startedOverseer(
  adapter: AgentAdapter,
  afterHoldPhase?: (phase: string, board: Board) => void,
): Promise<DrivePass> {
  return Promise.resolve(createScratchDrivePass({
    platformPorts:     { ...ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:     world.processStarts,
    workspace:         sessionWorkspace,
    now:               () => new Date(Date.parse(SESSION_STAMP)),
    formatStamp:       () => SESSION_STAMP,
    talosConnection:   () => world.connectionFor(sessionWorkspace.trackerDirectory),
    agentAdapter:      adapter,
    monitorFolder,
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
  return jobFolderIn(sessionWorkspace.trackerDirectory, jobId);
}

function childRecordOf(jobId: string, instance: number): ChildRecord | null {
  return childReadings().recordOf(sessionJobFolder(jobId), instance);
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

/** A control applied as its verb applies it with the Overseer down: a hold of its own. */
async function applyControl(command: ControlCommand): Promise<void> {
  await writeTracker({
    workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => ControlService.apply(command, change, ECHOED_CONTROL_CONTEXT),
  });
}


/**
 * Talos and every child it ran gone with the machine, each live child's record as written on another boot, so the next pass reads them as
 * gone with it; the next Talos then serves, as the restarted Overseer's start gives it. `jobId` names the job whose child must have run.
 */
function rebootTheMachine(jobId: string, instance: number): void {
  if (childRecordOf(jobId, instance)?.talos === null) throw new Error('no child record to reboot');
  world.rebootMachine(sessionWorkspace.trackerDirectory);
  const foreignBoot = { bootIdentity: 'example-earlier-boot' };
  for (const job of storedJobs()) {
    const record = childRecordOf(job.id, job.childInstance);
    if (record === null || record.talos === null || record.end !== null) continue;
    const rebootedRecord: ChildRecord = {
      ...record,
      talos:        { ...record.talos, ...foreignBoot },
      childProcess: record.childProcess === null ? null : { ...record.childProcess, ...foreignBoot },
    };
    writeFileSync(childFilesIn(sessionJobFolder(job.id), job.childInstance).recordPath, `${JSON.stringify(rebootedRecord)}\n`);
  }
  world.startTalosAgain(sessionWorkspace.trackerDirectory);
}

function productOwnerJob(): Readonly<Job> | undefined {
  return storedJobs().find((job) => job.kind === 'product-owner');
}

function resumedRecordsOf(jobId: string):{ kind: string; fields: Record<string, unknown> }[] {
  return storedRecords().filter((record) => record.kind === 'job-resumed' && record.jobId === jobId);
}

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the session rows behind the Talos boundary', () => {
  beforeEach(async () => {
    ({ ports } = world);
    repository       = createScratchDirectory('crash-rows');
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
    const instructionDefaults = [CONSTITUTION_DEFAULT_PATH, ...(['builder', 'reviewer', 'conflictReReviewer', 'productOwner', 'assistant'] as const).map(defaultInstructionPathOf)];
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

  test('overseer dies: Talos keeps the session running, and a restart reads its log from the stored cursor, applying what it missed', async () => {
    const adapter = recordingAdapter({ fresh: LINE_THEN_WAITING_STEPS, resumed: WAITING_STEPS });
    const job     = await runningBuildSession(await startedOverseer(adapter));
    await until(() => eventLogTextOf(job.id, 1).includes('"init"'), 'the session never started');
    // The Overseer is down from here: the session goes on and logs a turn nobody applies.
    const input = { act: 'write-line', line: adapter.chatLineOf('Example line while the Overseer is down') } as const;
    await world.connectionFor(sessionWorkspace.trackerDirectory).send({ kind: 'input', childId: `jobs/${job.id}#1`, input });
    await until(() => eventLogTextOf(job.id, 1).includes('after-the-line'), 'the session never answered the line');
    const storedCursor = requireBuildJob().eventCursor;
    const unapplied    = childReadings().eventsAfter(sessionJobFolder(job.id), 1, storedCursor.instance === 1 ? storedCursor.sequence : 0);

    expect(JSON.stringify(unapplied)).toContain('after-the-line');
    const report = await (await startedOverseer(adapter)).regroup();

    expect(report.lost).toEqual([]);
    expect(requireBuildJob()).toMatchObject({ id: job.id, state: 'running', childInstance: 1 });
    expect(requireBuildJob().eventCursor.sequence).toBeGreaterThan(storedCursor.sequence);
    expect(storedRecords().filter((record) => record.kind === 'job-interrupted')).toEqual([]);
  });

  test('a fresh session takes its first message as its first input, once, and a later pass sends it no second time', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: LINE_THEN_WAITING_STEPS, resumed: WAITING_STEPS }));
    const job       = await runningBuildSession(drivePass);
    const firstLine = recordingAdapter({ fresh: [], resumed: [] }).chatLineOf(`Example first message of ${job.id}`);
    await passUntil(drivePass, () => eventLogTextOf(job.id, 1).includes('after-the-line'), 'the fresh session never took its first message');
    await passOnce(drivePass);

    const clientLines = (childReadings().eventsAfter(sessionJobFolder(job.id), 1, 0) as readonly EventLogEntry[]).filter((entry) => entry.origin === 'client');
    expect(clientLines.map((entry) => entry.line)).toEqual([JSON.stringify({ act: 'write-line', line: firstLine })]);
    expect(existsSync(join(sessionJobFolder(job.id), 'first-message-1.sent'))).toBe(true);
  });

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
  });

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
  });

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
  });

  test('a question pending when the machine reboots: the resumed session takes the answer as its chat line and never the resume message after it', async () => {
    const adapter = recordingAdapter({ fresh: ASKING_STEPS, resumed: LINE_THEN_WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    const job     = await runningBuildSession(first);
    await passUntil(first, () => requireBuildJob().state === 'waiting-for-answer', 'the question never opened its decision');
    await first.stop();
    rebootTheMachine(job.id, 1);

    const restarted = await startedOverseer(adapter);
    await restarted.regroup();
    await passOnce(restarted);
    expect(requireBuildJob()).toMatchObject({ state: 'interrupted', interruption: 'reboot', childInstance: 1 });

    await decideWithTheOverseerDown('E1', ['a']);
    await passUntil(restarted, () => eventLogTextOf(job.id, 2).includes('after-the-line'), 'the resumed session never took the answer');
    await passOnce(restarted);
    await passOnce(restarted);
    expect(eventLogTextOf(job.id, 2)).toContain(ANSWER_MESSAGE_PREFIX);
    expect(eventLogTextOf(job.id, 2)).not.toContain(RESUME_MESSAGE);
    expect(requireBuildJob()).toMatchObject({ crashResumes: 0, childInstance: 2 });
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
    await until(() => childReadings().livenessOf(sessionJobFolder(assistantJobId), 1).verdict === 'live', 'the same instance was never claimed');
    expect(storedJobs().find((job) => job.id === assistantJobId)?.childInstance).toBe(1);
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
  });

  test('a lost Talos whose child takes the forced stop: the job is interrupted watcher-lost, and the cause is stored', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS }));
    const job       = await runningBuildSession(drivePass);
    world.crashTalosLeavingItsAgents(sessionWorkspace.trackerDirectory);
    await passUntil(drivePass, () => storedRecords().some((record) => record.kind === 'job-interrupted' && record.jobId === job.id), 'the job was never interrupted');

    expect(storedRecords().filter((record) => record.kind === 'job-interrupted' && record.jobId === job.id).map((record) => record.fields['cause'])).toEqual(['watcher-lost']);
    expect(readFileSync(join(sessionJobFolder(job.id), 'child-1.lost-cause'), 'utf8')).toBe('watcher-lost\n');
  });

  test('a child refusing the forced stop: the job waits interrupted, never resumed, each sweep tries again, the last refusal ends it blocked with one decision', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS }));
    const job       = await runningBuildSession(drivePass);
    const childProcessId = childRecordOf(job.id, 1)?.childProcess?.processId;
    world.refuseForcedStopsOfChild(sessionJobFolder(job.id), 1);
    world.crashTalosLeavingItsAgents(sessionWorkspace.trackerDirectory);
    const refusals = (): number => Regrouping.refusedForcedStopsOf(sessionJobFolder(job.id), 1).refusals;
    await passUntil(drivePass, () => requireBuildJob().state === 'interrupted', 'the job was never interrupted');

    expect(requireBuildJob()).toMatchObject({ state: 'interrupted', interruption: 'forced-stop-refused', childInstance: 1 });
    expect(existsSync(join(sessionJobFolder(job.id), 'child-1.lost-cause')), 'a refused stop stores no cause').toBe(false);
    expect(refusals()).toBe(1);
    await passOnce(drivePass);
    expect(refusals(), 'only a sweep tries the stop again').toBe(1);
    expect(launches.filter((launch) => launch.jobId === job.id).map((launch) => launch.resume), 'nothing resumed the job').toEqual([false]);

    for (let sweep = 2; sweep < FORCED_STOP_TRIES_BEFORE_BLOCKING; sweep += 1) {
      drivePass.sweep();
      await drivePass.idle();
      expect(refusals()).toBe(sweep);
      expect(requireBuildJob()).toMatchObject({ state: 'interrupted', interruption: 'forced-stop-refused', childInstance: 1 });
    }
    drivePass.sweep();
    await drivePass.idle();
    drivePass.sweep();
    await drivePass.idle();

    expect(buildJobs()).toEqual([]);
    const ended = storedRecords().find((record) => record.kind === 'job-ended' && record.jobId === job.id);
    expect(ended?.fields).toMatchObject({ outcome: 'blocked', cause: 'forced-stop-refused' });
    const decisions = openDecisions().filter((decision) => decision.kind === 'forced-stop-refused');
    expect(decisions.map((decision) => ({ jobId: decision.jobId, ticketIds: decision.ticketIds, context: decision.context })))
      .toEqual([{ jobId: job.id, ticketIds: job.ticketIds, context: String(childProcessId) }]);
    expect(launches.filter((launch) => launch.jobId === job.id)).toHaveLength(1);
  });

  test('a ticket held while its job runs interrupts nothing', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS }));
    const job       = await runningBuildSession(drivePass);
    await writeTracker({
      workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => { change.board.holdTicket('001', 'Waiting on Alex Example', change.at); },
    });
    await passOnce(drivePass);
    expect(requireBuildJob()).toMatchObject({ id: job.id, state: 'running', childInstance: 1 });
    expect(childReadings().livenessOf(sessionJobFolder(job.id), 1).verdict).toBe('live');
  });

  test('an Airlock agent launches bound to the Airlock agent report schema, with the question tool disallowed', async () => {
    const plans = new Map<string, { reportTitle: unknown; askUser: boolean }>();
    const adapter: AgentAdapter = {
      ...fakeAgentAdapter(),
      planOf(request) {
        plans.set(basename(request.jobFilesDirectory), { reportTitle: (request.reportSchema as { title?: string } | null)?.title, askUser: request.profile.askUser });
        return fakeAgentAdapter(WAITING_STEPS).planOf(request);
      },
    };
    let airlockAgentJobId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        airlockAgentJobId = change.board.launchJob({
          kind: 'merge-agent', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
        }, change.at).job.id;
      },
    });
    await passOnce(await startedOverseer(adapter));
    expect(plans.get(airlockAgentJobId)).toEqual({ reportTitle: 'airlock agent report', askUser: false });
  });

  test('a conflict re-reviewer launches bound to the reviewer report schema while it re-reviews, with the question tool disallowed', async () => {
    const plans = new Map<string, { reportTitle: unknown; askUser: boolean }>();
    const adapter: AgentAdapter = {
      ...fakeAgentAdapter(),
      planOf(request) {
        plans.set(basename(request.jobFilesDirectory), { reportTitle: (request.reportSchema as { title?: string } | null)?.title, askUser: request.profile.askUser });
        return fakeAgentAdapter(WAITING_STEPS).planOf(request);
      },
    };
    let reReviewerJobId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        const mergeJob = change.board.launchJob({
          kind: 'merge', role: null, ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
        }, change.at).job;
        change.board.setJobSlot(mergeJob.id, {
          target: 'main', targetTip: 'a'.repeat(40), branchTip: 'b'.repeat(40), phase: 're-reviewing'
        });
        AirlockFactsFile.keep(sessionJobFolder(mergeJob.id), { conflictedFiles: 'shared.txt' });
        reReviewerJobId = change.board.launchJob({
          kind: 'merge-agent', role: 'conflict-re-reviewer', ticketIds: ['001'], parentJobId: mergeJob.id, attempt: 1, target: 'main',
        }, change.at).job.id;
      },
    });
    await passOnce(await startedOverseer(adapter));
    expect(plans.get(reReviewerJobId)).toEqual({ reportTitle: 'reviewer report', askUser: false });
  });

  test('a conflict re-reviewer under a job in merging-main launches as the reviewer it is, outside any Airlock, with the conflict its job resolved', async () => {
    const plans = new Map<string, { reportTitle: unknown; askUser: boolean }>();
    const adapter: AgentAdapter = {
      ...fakeAgentAdapter(),
      planOf(request) {
        plans.set(basename(request.jobFilesDirectory), { reportTitle: (request.reportSchema as { title?: string } | null)?.title, askUser: request.profile.askUser });
        return fakeAgentAdapter(WAITING_STEPS).planOf(request);
      },
    };
    let reReviewerJobId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        change.board.setApproval('merge', true, change.at);
        const reviewJob = change.board.launchJob({
          kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
        }, change.at).job;
        for (const state of ['preparing', 'running'] as const) change.board.moveJob(reviewJob.id, state, change.at);
        change.board.interruptJob(reviewJob.id, 'handoff-red', change.at);
        for (const state of ['running', 'in-customs', 'gating', 'merging-main'] as const) change.board.moveJob(reviewJob.id, state, change.at);
        mkdirSync(sessionJobFolder(reviewJob.id), { recursive: true });
        const keptConflict = { targetTip: 'a'.repeat(40), branchTip: 'b'.repeat(40), conflictedFiles: ['shared.txt'] };
        writeFileSync(join(sessionJobFolder(reviewJob.id), 'main-conflict.json'), `${JSON.stringify(keptConflict)}\n`);
        reReviewerJobId = change.board.launchJob({
          kind: 'merge-agent', role: 'conflict-re-reviewer', ticketIds: ['001'], parentJobId: reviewJob.id, attempt: 1, target: 'main',
        }, change.at).job.id;
      },
    });
    await passOnce(await startedOverseer(adapter));
    expect(plans.get(reReviewerJobId)).toEqual({ reportTitle: 'reviewer report', askUser: false });
    expect(launchFacts.find((launch) => launch.jobId === reReviewerJobId)?.facts.airlock).toMatchObject({
      mergePlacement: 'before-human-code-review', phase: 're-reviewing', targetTip: 'a'.repeat(40), branchTip: 'b'.repeat(40), conflictedFiles: ['shared.txt'], redHandoff: null,
    });
  });

  test('an Airlock agent launches under its role\'s profile in the Airlock: the target ref denied, the git verbs allowed, no network', async () => {
    const profiles = new Map<string, WorkerProfile>();
    const adapter: AgentAdapter = {
      ...fakeAgentAdapter(),
      planOf(request) {
        profiles.set(basename(request.jobFilesDirectory), request.profile);
        return fakeAgentAdapter(WAITING_STEPS).planOf(request);
      },
    };
    let airlockAgentJobId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        airlockAgentJobId = change.board.launchJob({
          kind: 'merge-agent', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
        }, change.at).job.id;
      },
    });
    await passOnce(await startedOverseer(adapter));
    const profile = profiles.get(airlockAgentJobId);
    expect(profile?.deniedWritableRoots.some((path) => path.endsWith(join('refs', 'heads', RECORDED_FLOW_MAIN_LINE)))).toBe(true);
    expect(profile?.deniedWritableRoots.some((path) => path.endsWith('packed-refs'))).toBe(true);
    expect(profile?.allowedCommandPrefixes).toEqual(expect.arrayContaining([['git', 'add'], ['git', 'commit']]));
    expect(profile).toMatchObject({
      shellNetworkDomains: [], webNetworkDomains: 'none', askUser: false, networkDomainGuard: null
    });
  });

  test('an Airlock agent that launches closes its open sandbox-unavailable launch incident in the same pass, with its default move', async () => {
    let airlockAgentJobId = '';
    let incidentId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        airlockAgentJobId = change.board.launchJob({
          kind: 'merge-agent', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
        }, change.at).job.id;
        incidentId = change.board.openIncident({
          kind:        'sandbox-unavailable',
          ticketIds:   ['001'],
          jobId:       airlockAgentJobId,
          facts:       { step: 'airlock-agent', reason: 'example reason' },
          defaultMove: 'gate-retry',
        }, change.at).incident?.id ?? '';
      },
    });

    await passOnce(await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS })));

    expect(requireProgressFile(sessionWorkspace).incidents ?? []).toEqual([]);
    expect(storedRecords().filter((record) => record.kind === 'incident-handled')).toMatchObject([{ incidentId, fields: { move: 'gate-retry' } }]);
    expect(childReadings().livenessOf(sessionJobFolder(airlockAgentJobId), 1).verdict).not.toBe('unlaunched');
  });

  /**
   * An ended builder whose session started and whose ticket's gates turned its green red, and the next build job of its ticket. A next job
   * of a later attempt carries on no session of its own build line, so only the stale-green handoff resumes the ended one.
   */
  async function plantStartedStaleGreen(nextAttempt = 1): Promise<{ endedBuildJobId: string; nextBuildJobId: string }> {
    let endedBuildJobId = '';
    let nextBuildJobId = '';
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        const buildLaunch = {
          kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: RECORDED_FLOW_MAIN_LINE
        } as const;
        endedBuildJobId = change.board.launchJob(buildLaunch, change.at).job.id;
        change.board.endJob(endedBuildJobId, { outcome: 'built' }, change.at);
        nextBuildJobId = change.board.launchJob({ ...buildLaunch, attempt: nextAttempt }, change.at).job.id;
      },
    });
    const staleGreenFolder = join(sessionJobFolder(endedBuildJobId), 'stale-green');
    mkdirSync(staleGreenFolder, { recursive: true });
    RedHandoff.writeRedHandoff(staleGreenFolder, {
      kind:                'gate',
      name:                'checks',
      command:             'true',
      fixCommand:          null,
      commit:              'example-commit',
      exitCode:            null,
      batonPassPath:       RedHandoff.batonPassPathOf(staleGreenFolder),
      fullLogPath:         null,
      resume:              1,
      resumesAllowed:      2,
      callBudget:          30,
      interruptedInstance: 0,
    }, 'expected 2, received 3');
    const { eventLogPath } = childFilesIn(sessionJobFolder(endedBuildJobId), 1);
    mkdirSync(join(eventLogPath, '..'), { recursive: true });
    const eventLog = createEventLogWriter(eventLogPath, () => SESSION_STAMP);
    eventLog.append('agent', fakeStartedLine('fake-session'));
    eventLog.syncAndClose();
    return { endedBuildJobId, nextBuildJobId };
  }

  test('a stale green that turned red resumes the ended builder\'s session with the red handoff message, never its task again', async () => {
    const buildLaunches: RecordedLaunch[] = [];
    const scenario = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS });
    const adapter: AgentAdapter = {
      ...scenario,
      planOf(request) {
        const {
          resume, firstMessage, workingDirectory, sessionId
        } = request;
        buildLaunches.push({
          jobId: basename(request.jobFilesDirectory), resume, firstMessage, workingDirectory, sessionId
        });
        return scenario.planOf(request);
      },
    };
    const { endedBuildJobId, nextBuildJobId } = await plantStartedStaleGreen();

    await passOnce(await startedOverseer(adapter));

    const endedSessionId = adapter.sessionIdOf(requireProgressFile(sessionWorkspace).trackerId, endedBuildJobId);
    const nextLaunch = buildLaunches.find((launch) => launch.jobId === nextBuildJobId);
    expect(nextLaunch).toMatchObject({ resume: true, sessionId: endedSessionId, firstMessage: 'Red handoff: checks, resume 1' });
  });

  test('a stale-green resume interrupted after its session started resumes the ended builder\'s session again at its next instance', async () => {
    const adapter = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    const { endedBuildJobId, nextBuildJobId } = await plantStartedStaleGreen(2);
    const nextBuildJob = (): Readonly<Job> | undefined => storedJobs().find((job) => job.id === nextBuildJobId);
    await passUntil(first, () => sessionRuns(nextBuildJob()), 'the stale-green resume never ran');
    await until(() => eventLogTextOf(nextBuildJobId, 1).includes('"init"'), 'the stale-green resume never started');
    await first.stop();
    rebootTheMachine(nextBuildJobId, 1);

    const restarted = await startedOverseer(adapter);
    await restarted.regroup();
    await passUntil(restarted, () => nextBuildJob()?.childInstance === 2 && sessionRuns(nextBuildJob()), 'the second instance never ran');

    const endedSessionId = adapter.sessionIdOf(requireProgressFile(sessionWorkspace).trackerId, endedBuildJobId);
    expect(launches.filter((launch) => launch.jobId === nextBuildJobId).map(({ resume, sessionId }) => ({ resume, sessionId }))).toEqual([
      { resume: true, sessionId: endedSessionId },
      { resume: true, sessionId: endedSessionId },
    ]);
    expect((requireProgressFile(sessionWorkspace).incidents ?? []).filter((incident) => incident.kind === 'resume-failed')).toEqual([]);
  });

  test('a stale-green resume resumes the ended builder\'s session at its next instance, though another build job of its ticket ended in between', async () => {
    const adapter = recordingAdapter({ fresh: WAITING_STEPS, resumed: WAITING_STEPS });
    const first   = await startedOverseer(adapter);
    const { endedBuildJobId, nextBuildJobId } = await plantStartedStaleGreen(2);
    const nextBuildJob = (): Readonly<Job> | undefined => storedJobs().find((job) => job.id === nextBuildJobId);
    await passUntil(first, () => sessionRuns(nextBuildJob()), 'the stale-green resume never ran');
    await until(() => eventLogTextOf(nextBuildJobId, 1).includes('"init"'), 'the stale-green resume never started');
    await first.stop();
    rebootTheMachine(nextBuildJobId, 1);
    await writeTracker({
      workspace: sessionWorkspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        const { job } = change.board.launchJob({
          kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 3, target: RECORDED_FLOW_MAIN_LINE
        }, change.at);
        change.board.endJob(job.id, { outcome: 'built' }, change.at);
      },
    });

    const restarted = await startedOverseer(adapter);
    await restarted.regroup();
    await passUntil(restarted, () => nextBuildJob()?.childInstance === 2 && sessionRuns(nextBuildJob()), 'the second instance never ran');

    const endedSessionId = adapter.sessionIdOf(requireProgressFile(sessionWorkspace).trackerId, endedBuildJobId);
    expect(launches.filter((launch) => launch.jobId === nextBuildJobId).map(({ sessionId }) => sessionId)).toEqual([endedSessionId, endedSessionId]);
  });

  test('a stale-green session the vendor cannot resume opens resume-failed and ends its first instance replaced', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: [{ kind: 'exit', code: 1 }] }));
    const { nextBuildJobId } = await plantStartedStaleGreen();
    const resumeFailed = (): Readonly<{ jobId: string | null }> | undefined => (
      (requireProgressFile(sessionWorkspace).incidents ?? []).find((incident) => incident.kind === 'resume-failed')
    );

    await passUntil(drivePass, () => resumeFailed() !== undefined, 'resume-failed never opened');

    expect(resumeFailed()).toMatchObject({ jobId: nextBuildJobId, facts: { childInstance: '1' } });
    expect(storedRecords().find((record) => record.kind === 'job-ended' && record.jobId === nextBuildJobId)?.fields).toMatchObject({ outcome: 'replaced', cause: 'resume-failed' });
  });

  test('the fresh job after a failed stale-green resume takes over the same red handoff', async () => {
    const drivePass = await startedOverseer(recordingAdapter({ fresh: WAITING_STEPS, resumed: [{ kind: 'exit', code: 1 }] }));
    const { endedBuildJobId, nextBuildJobId } = await plantStartedStaleGreen();
    const resumeFailed = (): Readonly<{ id: string }> | undefined => (
      (requireProgressFile(sessionWorkspace).incidents ?? []).find((incident) => incident.kind === 'resume-failed')
    );
    await passUntil(drivePass, () => resumeFailed() !== undefined, 'resume-failed never opened');

    await writeTracker({
      workspace: sessionWorkspace, at: CHANGED_AT, now, mutate: (change) => { change.board.defaultIncident(resumeFailed()?.id ?? '', 'turn-closed', change.at); },
    });
    const freshBuildJobId = (): string | undefined => storedRecords().find((record) => (
      record.kind === 'job-launched' && record.fields['kind'] === 'build' && record.jobId !== endedBuildJobId && record.jobId !== nextBuildJobId
    ))?.jobId;
    const freshLaunchFacts = (): (typeof launchFacts)[number] | undefined => launchFacts.find((launch) => launch.jobId === freshBuildJobId());
    await passUntil(drivePass, () => freshLaunchFacts() !== undefined, 'no fresh build job was launched');

    expect(freshLaunchFacts()?.facts.redHandoff).toMatchObject({
      name: 'checks', resume: 1, resumesAllowed: 2, interruptedInstance: 0
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

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'the product-owner bound row', () => {
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
  type ExampleOption = { label: string; description: string; isRecommended: boolean };
  const wordingOf = (): { questions: { question: string; header: string; multiSelect: boolean; options: ExampleOption[] }[]; context: string } => ({
    questions: [{
      question: 'Example?', header: 'example', multiSelect: false, options: []
    }],
    context: '',
  });

  test('a product owner replaced past the bound with a question open waits awaiting-answer; once answered a fresh one takes its drafts, answers, '
    + 'title and the request\'s pictures, never a resume', () => {
    const requestPictures = [{ pictureId: 'a'.repeat(64), name: 'basket-mockup.png' }];
    const { board, records } = boardFixture({
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
    const { job } = board.startIntake('Example basket', requestPictures, at);
    board.moveJob(job.id, 'running', at);
    board.titleIntake(job.id, 'Example basket and wishlist', at);
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
      parentJobId:   job.id,
      state:         'launching',
      childInstance: 1,
      intake:        {
        text: 'Example basket', title: 'Example basket and wishlist', pictures: requestPictures, carriedAnswers: [{ 'Example?': 'Example answer' }]
      },
    });
    if (fresh === undefined) throw new Error('no fresh product owner');
    expect(IntakeSessions.firstMessagePicturesOf(fresh)).toEqual(requestPictures);
    const plantedAdapter = { instructionBundleLineOf: (bundleName: string, argumentsText: string) => `run-bundle ${bundleName} with ${argumentsText}` };
    const intakeFacts = IntakeSessions.intakeFactsOf(board, fresh, plantedAdapter);
    expect(intakeFacts?.drafts).toEqual([{ id: '004', title: 'Example basket' }]);
    expect(intakeFacts?.firstLine).toBe(`run-bundle ${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} with Example basket`);
    expect(JobResumption.launchPartsOf(fresh, 'Example first', 'Example resume')).toEqual({ resume: false, firstMessage: 'Example first' });
    expect(records.findLast((record) => record.kind === 'job-launched')).toMatchObject({ jobId: fresh.id, fields: { intakeText: 'Example basket' } });
  });
});
