/**
 * The real Talos, spawned from its binary as Hephaestus starts it, walked through each stage of an agent and of a line; under
 * `bun run record talos/Talos.ts` each stage's answer is recorded for `src/testing/RecordedTalosStages.ts`. What matters is what a
 * DrivePass reads: the child record, the origin of each event-log line, Talos's own record, and whether Talos and the child still run. A
 * stage settles on what Talos wrote, never on a clock.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ClientEntry }                                            from '../src/domain/talos/@types/TalosFrame.ts';
import type { ChildLaunch }                                            from '../src/domain/talos/ChildLaunch.ts';
import type { ChildRecord }                                            from '../src/domain/talos/ChildRecord.ts';
import { clientEntryLineOf }                                           from '../src/domain/talos/TalosFrames.ts';
import type { LeaseRenewer }                                           from '../src/domain/talos/TalosRecord.ts';
import type { EndingPattern }                                          from '../src/lib/line-patterns/EndingPatterns.ts';
import type { LineConditions }                                         from '../src/lib/line-patterns/LineConditions.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                     from '../src/testing/ChildProcessCaseTimeout.ts';
import { fakeAgentAdapter, fakeAssistantTurnLine, type FakeAgentStep } from '../src/testing/FakeAgentAdapter.ts';
import { fakeAgentChildLaunch }                                        from '../src/testing/FakeAgentChildLaunch.ts';
import { nativePlatformPorts }                                         from '../src/testing/NativePlatformPorts.ts';
import { recordAnswer }                                                from '../src/testing/RecordedAnswers.ts';
import {
  asRecordedTalosStage,
  type TalosStage,
  type TalosStageAnswer,
  talosStageCallShapeOf,
  TALOS_STAGES
} from '../src/testing/RecordedTalosStages.ts';
import {
  createScratchTalos,
  SCRATCH_TALOS_CODE_VERSION,
  type ScratchTalos,
  type ServingTalos
} from '../src/testing/ScratchTalos.ts';
import { waitUntil } from '../src/testing/WaitUntil.ts';

const { processSupervision } = nativePlatformPorts();

const START_NUMBER = 1;
const AGENT_FOLDER = 'jobs/J-1';
const LINE_FOLDER = 'jobs/J-2/gate-1';
const CHILD_LINE = fakeAssistantTurnLine('example-reply');
const GREEN_OUTPUT = 'green-output';
const RED_OUTPUT = 'expected 2, received 3';
const RED_EXIT_CODE = 4;
/** A line's bound in every stage but the one that runs past it, so each line record holds the bound as Hephaestus's launches do. */
const LINE_STAGE_BOUND_MILLISECONDS = 60_000;
const PAST_BOUND_MILLISECONDS = 200;
const STAYS_UNTIL_STOPPED = 'setInterval(() => undefined, 60000);';
/** The child waits this long first, so the stage's start is read before the line ends. */
const LINE_PAUSE_MILLISECONDS = 300;
const GREEN_AFTER_A_PAUSE = `await Bun.sleep(${LINE_PAUSE_MILLISECONDS}); console.log(${JSON.stringify(GREEN_OUTPUT)});`;
/** The fake agent, as the real program, ends on a stdin line that is not JSON, so the input carries a chat line. */
const EXAMPLE_LINE: ClientEntry = { act: 'write-line', line: fakeAgentAdapter().chatLineOf('Example line') };
const CLOSE: ClientEntry = { act: 'close' };
const STOP_GRACE_MILLISECONDS = 100;
const STOP: ClientEntry = { act: 'stop', graceMilliseconds: STOP_GRACE_MILLISECONDS };
const LEASE_BOUNDS = {
  leaseMilliseconds:           600,
  renewalIntervalMilliseconds: 150,
  tickMilliseconds:            50,
  tickGapMilliseconds:         200,
  cleanQuitWaitMilliseconds:   300,
} as const;
const RENEWER: LeaseRenewer = {
  processId: 4242, startStamp: '1', bootIdentity: 'example-boot', generation: 1
};
const ENDING_NAME = 'network-outage';
const NEUTRAL_KIND_PATH = 'kind';
const CLOSING_LINE: LineConditions = { allOf: [{ test: 'equals', path: NEUTRAL_KIND_PATH, value: 'closing' }], anyOf: [], noneOf: [] };
const ENDING: EndingPattern = {
  name:                ENDING_NAME,
  closingLineMatches:  CLOSING_LINE,
  countedLineMatches:  { allOf: [{ test: 'equals', path: NEUTRAL_KIND_PATH, value: 'counted' }], anyOf: [], noneOf: [] },
  minimumCountedLines: 1,
};
const COUNTED_LINE = JSON.stringify({ kind: 'counted' });
const CLOSING_LINE_TEXT = JSON.stringify({ kind: 'closing' });
/** The closing line's place in the log: after the one counted line. */
const ENDING_CLOSING_LINE_SEQUENCE = 2;
const ENDING_COUNTED_LINES = 1;

let currentScratchTalos: ScratchTalos | null = null;

beforeEach(() => {
  currentScratchTalos = createScratchTalos();
});

afterEach(async () => {
  await currentScratchTalos?.remove();
});

function scratchTalos(): ScratchTalos {
  if (currentScratchTalos === null) throw new Error('no scratch Talos outside a test');
  return currentScratchTalos;
}

function processRuns(processId: number | undefined): boolean {
  return processId !== undefined && !processSupervision.processIsGone(processId);
}

/** What a stage records of one child: the entries since `entriesSeen`, which the caller moves on. */
interface StagedChild {
  readonly launch:     ChildLaunch;
  readonly childLines: readonly string[];
  readonly exitCode?:  number;
  entriesSeen:         number;
}

function recordedStage(
  staged: StagedChild, stage: TalosStage, sentEntries: readonly ClientEntry[], childTreeAfterTheStop?: TalosStageAnswer['childTreeAfterTheStop'],
): TalosStageAnswer {
  const scratch = scratchTalos();
  const { childFolder, instance } = staged.launch;
  const record = scratch.childRecordOf(childFolder, instance);
  const talosRecord = scratch.talosRecordOf(START_NUMBER);
  const entries = scratch.eventsOf(childFolder, instance).slice(staged.entriesSeen).map(({ origin, line }) => ({ origin, line }));
  staged.entriesSeen += entries.length;
  const answer = {
    record,
    entries,
    childRuns: processRuns(record?.childProcess?.processId),
    talosRecord,
    talosRuns: processRuns(talosRecord?.talos?.processId),
    ...(childTreeAfterTheStop === undefined ? {} : { childTreeAfterTheStop }),
  };
  const ending = record?.recognisedEndings.at(-1);
  const recorded = asRecordedTalosStage(answer, {
    talos:            talosRecord?.talos ?? null,
    startNumber:      START_NUMBER,
    child:            record?.childProcess ?? null,
    ...(record?.childProcessGroupId === null || record?.childProcessGroupId === undefined ? {} : { childProcessId: record.childProcessGroupId }),
    childId:          `${childFolder}#${instance}`,
    label:            staged.launch.label,
    workingDirectory: staged.launch.workingDirectory,
    ...(staged.exitCode === undefined ? {} : { exitCode: staged.exitCode }),
    ...(staged.launch.timeBoundMilliseconds === null ? {} : { timeBound: staged.launch.timeBoundMilliseconds }),
    ...(talosRecord?.endpoint === null || talosRecord?.endpoint === undefined ? {} : { endpoint: talosRecord.endpoint }),
    codeVersion:      SCRATCH_TALOS_CODE_VERSION,
    renewer:          RENEWER,
    ...(ending === undefined ? {} : { closingLineSequence: ending.closingLineSequence, countedLines: ending.countedLines }),
    clientEntries:    sentEntries.map(clientEntryLineOf),
    childLines:       staged.childLines,
  }) as TalosStageAnswer;
  recordAnswer(talosStageCallShapeOf(stage), recorded);
  return recorded;
}

async function launched(serving: ServingTalos, launch: ChildLaunch, childLines: readonly string[], exitCode?: number): Promise<StagedChild> {
  expect(await serving.send({ kind: 'launch', launch })).toMatchObject({ verdict: 'done' });
  return {
    launch, childLines, ...(exitCode === undefined ? {} : { exitCode }), entriesSeen: 0
  };
}

function agentLaunch(steps: readonly FakeAgentStep[], changes: Partial<ChildLaunch> = {}): ChildLaunch {
  return fakeAgentChildLaunch(scratchTalos().boardFolder, AGENT_FOLDER, 1, steps, changes);
}

function lineLaunch(childScript: string, timeBoundMilliseconds = LINE_STAGE_BOUND_MILLISECONDS): ChildLaunch {
  return scratchTalos().lineLaunch(LINE_FOLDER, 1, childScript, { timeBoundMilliseconds });
}

async function untilRunning(staged: StagedChild): Promise<void> {
  await waitUntil(() => scratchTalos().childRecordOf(staged.launch.childFolder, staged.launch.instance)?.state === 'running', 'the child running');
}

async function untilEnded(staged: StagedChild): Promise<ChildRecord> {
  return await scratchTalos().endedRecordOf(staged.launch.childFolder, staged.launch.instance);
}

async function sent(serving: ServingTalos, staged: StagedChild, input: Exclude<ClientEntry, { act: 'stop' }>): Promise<void> {
  const childId = `${staged.launch.childFolder}#${staged.launch.instance}`;
  expect(await serving.send({ kind: 'input', childId, input })).toMatchObject({ verdict: 'done' });
}

describe('an agent through its stages', () => {
  test('launched it runs; a line is logged as the client\'s, the reply as the agent\'s; a closed input ends it', async () => {
    const serving = await scratchTalos().serve(START_NUMBER);
    const staged = await launched(serving, agentLaunch([{ kind: 'await-line' }, { kind: 'print', line: CHILD_LINE }, { kind: 'await-line' }]), [CHILD_LINE], 0);
    await untilRunning(staged);
    expect(recordedStage(staged, TALOS_STAGES.SERVING, [])).toMatchObject({ talosRecord: { state: 'serving', talos: '<talos>' }, talosRuns: true });
    expect(recordedStage(staged, TALOS_STAGES.AGENT_LAUNCHED, [])).toMatchObject({ record: { state: 'running', childProcess: '<child>' }, childRuns: true });

    await sent(serving, staged, EXAMPLE_LINE);
    await waitUntil(() => scratchTalos().eventsOf(AGENT_FOLDER, 1).some((entry) => entry.line === CHILD_LINE), 'the reply');
    expect(recordedStage(staged, TALOS_STAGES.AGENT_LINE, [EXAMPLE_LINE]).entries).toEqual([
      { origin: 'client', line: '<client entry>' }, { origin: 'agent', line: '<child line>' },
    ]);

    await sent(serving, staged, CLOSE);
    await untilEnded(staged);
    expect(recordedStage(staged, TALOS_STAGES.AGENT_INPUT_CLOSED, [CLOSE]))
      .toMatchObject({ record: { state: 'ended', end: { reason: 'exited', exitCode: '<exit code>' } }, childRuns: false });
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an agent that crashes ends signalled', async () => {
    const serving = await scratchTalos().serve(START_NUMBER);
    const staged = await launched(serving, agentLaunch([{ kind: 'await-line' }, { kind: 'crash' }]), []);
    await untilRunning(staged);
    await sent(serving, staged, EXAMPLE_LINE);
    await untilEnded(staged);
    expect(recordedStage(staged, TALOS_STAGES.AGENT_CRASH, [EXAMPLE_LINE]))
      .toMatchObject({ record: { state: 'ended', end: { reason: 'signalled', exitCode: null } }, childRuns: false });
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a stop by Hephaestus is logged as the client\'s and ends an agent that does not end on its closed input', async () => {
    const serving = await scratchTalos().serve(START_NUMBER);
    const staged = await launched(serving, agentLaunch([{ kind: 'shell', command: 'sleep 30' }]), []);
    await untilRunning(staged);
    expect(await serving.send({ kind: 'stop', childId: `${AGENT_FOLDER}#1`, graceMilliseconds: STOP_GRACE_MILLISECONDS })).toMatchObject({ verdict: 'done' });
    await untilEnded(staged);
    expect(recordedStage(staged, TALOS_STAGES.AGENT_STOPPED, [STOP]))
      .toMatchObject({ entries: [{ origin: 'client', line: '<client entry>' }], record: { state: 'ended', end: { reason: 'signalled' } }, childRuns: false });
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a closing line the launch\'s patterns name is recognised in the record', async () => {
    const serving = await scratchTalos().serve(START_NUMBER);
    const printsTheEnding = `console.log(${JSON.stringify(COUNTED_LINE)}); console.log(${JSON.stringify(CLOSING_LINE_TEXT)}); process.stdin.resume();`;
    const staged = await launched(serving, agentLaunch([], {
      argv: [process.execPath, '-e', printsTheEnding], closingLine: CLOSING_LINE, endingPatterns: [ENDING], quitAtTurnEnd: { act: 'close-input' },
    }), [COUNTED_LINE, CLOSING_LINE_TEXT]);
    await waitUntil(() => (scratchTalos().childRecordOf(AGENT_FOLDER, 1)?.recognisedEndings.length ?? 0) > 0, 'the ending recognised');
    await waitUntil(() => scratchTalos().eventsOf(AGENT_FOLDER, 1).length === ENDING_CLOSING_LINE_SEQUENCE, 'the closing line logged');
    const recorded = recordedStage(staged, TALOS_STAGES.AGENT_ENDING_RECOGNISED, []);
    expect(recorded.record).toMatchObject({ recognisedEndings: [{ name: ENDING_NAME, closingLineSequence: '<closing line sequence>', countedLines: '<counted lines>' }], });
    expect(scratchTalos().childRecordOf(AGENT_FOLDER, 1)?.recognisedEndings).toEqual([
      { name: ENDING_NAME, closingLineSequence: ENDING_CLOSING_LINE_SEQUENCE, countedLines: ENDING_COUNTED_LINES },
    ]);
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('a line through its stages', () => {
  test('a launched line runs, and one that ends green logs its output as the agent\'s and ends at exit 0', async () => {
    const serving = await scratchTalos().serve(START_NUMBER);
    const staged = await launched(serving, lineLaunch(GREEN_AFTER_A_PAUSE), [GREEN_OUTPUT], 0);
    await untilRunning(staged);
    expect(recordedStage(staged, TALOS_STAGES.LINE_LAUNCHED, [])).toMatchObject({ record: { kind: 'line', state: 'running', timeBoundMilliseconds: '<time bound>' } });
    await untilEnded(staged);
    expect(recordedStage(staged, TALOS_STAGES.LINE_GREEN, []))
      .toMatchObject({ entries: [{ origin: 'agent', line: '<child line>' }], record: { end: { reason: 'exited', exitCode: '<exit code>' } } });
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a line that ends red logs its output and ends at its exit code', async () => {
    const serving = await scratchTalos().serve(START_NUMBER);
    const staged = await launched(serving, lineLaunch(`console.log(${JSON.stringify(RED_OUTPUT)}); process.exit(${RED_EXIT_CODE});`), [RED_OUTPUT], RED_EXIT_CODE);
    await untilEnded(staged);
    expect(recordedStage(staged, TALOS_STAGES.LINE_RED, []))
      .toMatchObject({ entries: [{ origin: 'agent', line: '<child line>' }], record: { end: { reason: 'exited', exitCode: '<exit code>' } } });
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a stop by Hephaestus ends a line signalled and logs nothing', async () => {
    const serving = await scratchTalos().serve(START_NUMBER);
    const staged = await launched(serving, lineLaunch(STAYS_UNTIL_STOPPED), []);
    await untilRunning(staged);
    const child = scratchTalos().childRecordOf(LINE_FOLDER, 1)?.childProcess ?? null;
    const treeBeforeTheStop = child === null ? [] : processSupervision.treeMembersOf(child) ?? [];
    expect(await serving.send({ kind: 'stop', childId: `${LINE_FOLDER}#1`, graceMilliseconds: 0 })).toMatchObject({ verdict: 'done' });
    await untilEnded(staged);
    const childTreeAfterTheStop = child === null ? null : processSupervision.treeMembersOf(child, treeBeforeTheStop);
    expect(recordedStage(staged, TALOS_STAGES.LINE_STOPPED, [], childTreeAfterTheStop))
      .toMatchObject({
        entries: [], record: { state: 'ended', end: { reason: 'signalled' } }, childRuns: false, childTreeAfterTheStop: []
      });
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a line past its time bound ends time-bound', async () => {
    const serving = await scratchTalos().serve(START_NUMBER);
    const staged = await launched(serving, lineLaunch(STAYS_UNTIL_STOPPED, PAST_BOUND_MILLISECONDS), []);
    await untilEnded(staged);
    expect(recordedStage(staged, TALOS_STAGES.LINE_TIME_BOUND, []))
      .toMatchObject({ record: { end: { reason: 'time-bound' }, timeBoundMilliseconds: '<time bound>' }, childRuns: false });
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('Talos ending its children', () => {
  test('a clean quit ends an agent paused after its quit act and a line paused', async () => {
    const scratch = scratchTalos();
    const serving = await scratch.serve(START_NUMBER);
    const agent = await launched(serving, agentLaunch([{ kind: 'print', line: CHILD_LINE }, { kind: 'await-line' }]), [CHILD_LINE], 0);
    const line = await launched(serving, lineLaunch(STAYS_UNTIL_STOPPED), []);
    await untilRunning(agent);
    await untilRunning(line);
    await waitUntil(() => scratch.eventsOf(AGENT_FOLDER, 1).length > 0, 'the agent\'s first line');
    agent.entriesSeen = scratch.eventsOf(AGENT_FOLDER, 1).length;
    expect(await serving.quit()).toBe(0);
    expect(recordedStage(agent, TALOS_STAGES.AGENT_PAUSED, [CLOSE])).toMatchObject({
      entries: [{ origin: 'client', line: '<client entry>' }], record: { end: { reason: 'paused' } }, talosRecord: { state: 'quit' }, childRuns: false,
    });
    expect(recordedStage(line, TALOS_STAGES.LINE_PAUSED, [])).toMatchObject({ record: { end: { reason: 'paused' } }, childRuns: false });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a lease end ends an agent lease-ended after its quit act', async () => {
    const scratch = scratchTalos();
    const serving = await scratch.serve(START_NUMBER, LEASE_BOUNDS);
    const agent = await launched(serving, agentLaunch([{ kind: 'print', line: CHILD_LINE }, { kind: 'await-line' }]), [CHILD_LINE], 0);
    await untilRunning(agent);
    await waitUntil(() => scratch.eventsOf(AGENT_FOLDER, 1).length > 0, 'the agent\'s first line');
    agent.entriesSeen = scratch.eventsOf(AGENT_FOLDER, 1).length;
    expect(await serving.send({ kind: 'lease-renewal', renewer: RENEWER })).toMatchObject({ verdict: 'done' });
    await untilEnded(agent);
    await waitUntil(() => scratch.talosRecordOf(START_NUMBER)?.lease.standing === 'ended', 'the lease ended');
    const leaseEnded = { end: { reason: 'lease-ended' } };
    expect(recordedStage(agent, TALOS_STAGES.AGENT_LEASE_ENDED, [CLOSE]))
      .toMatchObject({ entries: [{ origin: 'client', line: '<client entry>' }], record: leaseEnded, talosRecord: { lease: { standing: 'ended' } } });
    expect(await serving.quit()).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a Talos killed leaves each record running: its agent sees its input close and ends, its line runs on', async () => {
    const scratch = scratchTalos();
    const serving = await scratch.serve(START_NUMBER);
    const agent = await launched(serving, agentLaunch([{ kind: 'await-line' }, { kind: 'await-line' }]), []);
    const line = await launched(serving, lineLaunch(STAYS_UNTIL_STOPPED), []);
    await untilRunning(agent);
    await untilRunning(line);
    const agentProcess = scratch.childRecordOf(AGENT_FOLDER, 1)?.childProcess?.processId;
    serving.talos.kill('SIGKILL');
    await scratch.exitCodeOf(serving.talos, START_NUMBER);
    await waitUntil(() => !processRuns(agentProcess), 'the agent ending on its closed input');
    expect(recordedStage(agent, TALOS_STAGES.TALOS_CRASH_AGENT, [])).toMatchObject({ record: { state: 'running' }, talosRuns: false, childRuns: false });
    expect(recordedStage(line, TALOS_STAGES.TALOS_CRASH_LINE, [])).toMatchObject({ record: { state: 'running' }, talosRuns: false, childRuns: true });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
