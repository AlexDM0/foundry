/**
 * The Talos of a default spec: `useRecordedTalosStages` starts no Talos, and answers each frame of the Overseer's connection by leaving
 * what the real Talos left in that stage of a child, which `src/lib/talos/Talos.stages.integration.spec.ts` records under
 * `bun run record src/lib/talos/Talos.ts`: the child record, the origin of each event-log line, whether the child still runs, and Talos's
 * own record. A stage with no recorded answer fails the case. Talos's and its children's processes are in the recorded process table.
 * What the child does is not Talos's: a session plays its `FakeAgentAdapter` scenario, and a line ends as `scriptLine` said.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join }                       from 'node:path';

import { afterEach, beforeEach } from 'bun:test';

import { createFileAtomically, writeFileAtomically }                       from '../lib/atomic-file/AtomicFile.ts';
import { GitProcess }                                                      from '../lib/git/GitProcess.ts';
import type { PlatformPorts }                                              from '../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                            from '../lib/process-identity/ProcessIdentity.ts';
import type { ProcessTreeMember }                                          from '../lib/process-identity/ProcessSupervision.ts';
import type { ChildInput, DoneFrame, FrameRefusalReason }                  from '../lib/talos/@types/TalosFrame.ts';
import { type ChildLaunch, childIdOf }                                     from '../lib/talos/ChildLaunch.ts';
import { type ChildRecord, childRecordTextOf }                             from '../lib/talos/ChildRecord.ts';
import type { RecognisedEnding }                                           from '../lib/talos/EndingPatterns.ts';
import { createEventLogWriter, type EventLogWriter, type EventOrigin }     from '../lib/talos/EventLog.ts';
import { type ChildFiles, childFilesOf, talosRecordPathOf }                from '../lib/talos/TalosFiles.ts';
import { clientEntryLineOf }                                               from '../lib/talos/TalosFrames.ts';
import { type TalosRecord, talosRecordTextOf }                             from '../lib/talos/TalosRecord.ts';
import type { ProcessStarts }                                              from '../services/overseer/ProcessStarts.ts';
import type { TalosConnection, TalosFrameRequest }                         from '../services/overseer/TalosConnection.ts';
import type { BoundaryRecording }                                          from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf }                                from './BoundaryRecordings.ts';
import { FAKE_HEAD_PLACEHOLDER, type FakeAgentStep }                       from './FakeAgentAdapter.ts';
import { type ControlledRecordedProcessTable, createRecordedProcessTable } from './RecordedProcessTable.ts';
import { recordedLineOf }                                                  from './fake-agent/RecordedClaudeLines.ts';

const TALOS_BOUNDARY = 'src/lib/talos/Talos.ts';
const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const SCENARIO_ARGUMENT_INDEX = 2;
const BUILT_IN_LINES: Readonly<Record<string, ScriptedLineEnd>> = { true: {}, false: { exitCode: 1 } };
const FIRST_MOCKED_START_NUMBER = 1;
const MOCKED_STAMP = '2026-09-18T22:11:03+02:00';
const MOCKED_CODE_VERSION = 'code-example';
/** The run time a replayed end shows; the real one differs from run to run, and only a step's run time records it. */
const MOCKED_RUN_MILLISECONDS = 0;

/** The stages the boundary spec walks a real Talos and its children through, each recorded once. */
export const TALOS_STAGES = {
  SERVING:                 'a Talos serving',
  AGENT_LAUNCHED:          'an agent launched',
  AGENT_LINE:              'an agent taking a line and replying',
  AGENT_INPUT_CLOSED:      'an agent whose input closed',
  AGENT_CRASH:             'an agent that crashed',
  AGENT_STOPPED:           'an agent stopped by the Overseer',
  AGENT_PAUSED:            'an agent ended by a clean quit',
  AGENT_LEASE_ENDED:       'an agent ended by a lease end',
  AGENT_ENDING_RECOGNISED: 'an agent whose closing line Talos recognised',
  LINE_LAUNCHED:           'a line launched',
  LINE_GREEN:              'a line that ends green',
  LINE_RED:                'a line that ends red',
  LINE_STOPPED:            'a line stopped by the Overseer',
  LINE_PAUSED:             'a line ended by a clean quit',
  LINE_TIME_BOUND:         'a line past its time bound',
  TALOS_CRASH_AGENT:       'an agent of a Talos that crashed',
  TALOS_CRASH_LINE:        'a line of a Talos that crashed',
} as const;

export type TalosStage = typeof TALOS_STAGES[keyof typeof TALOS_STAGES];

/** The places a recorded stage holds for what differs from run to run, which a replay fills with the values of its own child. */
export const TALOS_STAGE_PLACEHOLDERS = {
  TALOS:                 '<talos>',
  CHILD:                 '<child>',
  CHILD_PROCESS_ID:      '<child process id>',
  CHILD_ID:              '<child id>',
  LABEL:                 '<label>',
  WORKING_DIRECTORY:     '<working directory>',
  EXIT_CODE:             '<exit code>',
  RUN_MILLISECONDS:      '<run milliseconds>',
  TIME_BOUND:            '<time bound>',
  START_NUMBER:          '<start number>',
  ENDPOINT:              '<endpoint>',
  CODE_VERSION:          '<code version>',
  RENEWER:               '<renewer>',
  CLOSING_LINE_SEQUENCE: '<closing line sequence>',
  COUNTED_LINES:         '<counted lines>',
  CLIENT_ENTRY:          '<client entry>',
  CHILD_LINE:            '<child line>',
} as const;

/** What a real Talos left at the end of one stage. */
export interface TalosStageAnswer {
  /** The child record, its run-to-run values as placeholders. */
  readonly record:                 unknown;
  /** Each event-log line the stage added, a client entry and a line of the child as placeholders. */
  readonly entries:                readonly { readonly origin: EventOrigin; readonly line: string }[];
  readonly childRuns:              boolean;
  /** Talos's own record at the stage's end, its run-to-run values as placeholders. */
  readonly talosRecord:            unknown;
  readonly talosRuns:              boolean;
  /** For a stage that stops a line: what `treeMembersOf` answers for the ended child, given the tree members read before the stop. */
  readonly childTreeAfterTheStop?: readonly ProcessTreeMember[] | null;
}

export function talosStageCallShapeOf(stage: TalosStage): string {
  return `talos stage "${stage}"`;
}

/** The values of one child and its Talos that a recorded stage holds as placeholders. */
export interface TalosStageValues {
  readonly talos:                ProcessIdentity | null;
  readonly child?:               ProcessIdentity | null;
  readonly childProcessId?:      number;
  readonly childId?:             string;
  readonly label?:               string;
  readonly workingDirectory?:    string;
  readonly exitCode?:            number;
  readonly timeBound?:           number;
  readonly startNumber?:         number;
  readonly endpoint?:            string;
  readonly codeVersion?:         string;
  readonly renewer?:             unknown;
  readonly closingLineSequence?: number;
  readonly countedLines?:        number;
  readonly clientEntries?:       readonly string[];
  readonly childLines?:          readonly string[];
}

function sameJson(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function replacedDeeply(value: unknown, replace: (leaf: unknown) => unknown): unknown {
  const replaced = replace(value);
  if (replaced !== value) return replaced;
  if (Array.isArray(value)) return value.map((element) => replacedDeeply(element, replace));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, element]) => [key, replacedDeeply(element, replace)]));
  return value;
}

function hasKey(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

/** The keys of Talos's and a child's record that hold Talos's start number. */
const START_NUMBER_KEYS = ['talosStartNumber', 'startNumber'];

/** What the boundary spec records: every value of `values` in the answer as its placeholder. */
export function asRecordedTalosStage(answer: unknown, values: TalosStageValues): unknown {
  const placeholders = TALOS_STAGE_PLACEHOLDERS;
  return replacedDeeply(answer, (leaf) => {
    if (leaf !== null && typeof leaf === 'object' && !Array.isArray(leaf)) {
      if (values.talos !== null && sameJson(leaf, values.talos)) return placeholders.TALOS;
      if (values.child !== undefined && values.child !== null && sameJson(leaf, values.child)) return placeholders.CHILD;
      if (values.renewer !== undefined && sameJson(leaf, values.renewer)) return placeholders.RENEWER;
      if (hasKey(leaf, 'runMilliseconds') && hasKey(leaf, 'reason')) {
        const end = leaf as { exitCode: unknown };
        return { ...leaf, runMilliseconds: placeholders.RUN_MILLISECONDS, ...(end.exitCode === values.exitCode ? { exitCode: placeholders.EXIT_CODE } : {}) };
      }
      const startNumberKey = START_NUMBER_KEYS.find((key) => hasKey(leaf, key) && (leaf as Record<string, unknown>)[key] === values.startNumber);
      if (startNumberKey !== undefined) {
        const valuesWithNoStartNumber: TalosStageValues = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'startNumber')) as TalosStageValues;
        return asRecordedTalosStage({ ...leaf, [startNumberKey]: placeholders.START_NUMBER }, valuesWithNoStartNumber);
      }
      if (hasKey(leaf, 'closingLineSequence') && hasKey(leaf, 'countedLines')) {
        const ending = leaf as Partial<RecognisedEnding>;
        return {
          ...leaf,
          ...(ending.closingLineSequence === values.closingLineSequence ? { closingLineSequence: placeholders.CLOSING_LINE_SEQUENCE } : {}),
          ...(ending.countedLines === values.countedLines ? { countedLines: placeholders.COUNTED_LINES } : {}),
        };
      }
      return leaf;
    }
    if (leaf === values.childProcessId) return placeholders.CHILD_PROCESS_ID;
    if (leaf === values.childId) return placeholders.CHILD_ID;
    if (leaf === values.label) return placeholders.LABEL;
    if (leaf === values.workingDirectory) return placeholders.WORKING_DIRECTORY;
    if (leaf === values.timeBound) return placeholders.TIME_BOUND;
    if (leaf === values.endpoint) return placeholders.ENDPOINT;
    if (leaf === values.codeVersion) return placeholders.CODE_VERSION;
    if (typeof leaf === 'string' && values.clientEntries?.includes(leaf) === true) return placeholders.CLIENT_ENTRY;
    if (typeof leaf === 'string' && values.childLines?.includes(leaf) === true) return placeholders.CHILD_LINE;
    return leaf;
  });
}

function asReplayedTalosStage(answer: unknown, values: TalosStageValues): unknown {
  const placeholders = TALOS_STAGE_PLACEHOLDERS;
  const replacements = new Map<unknown, unknown>([
    [placeholders.TALOS, values.talos],
    [placeholders.CHILD, values.child ?? null],
    [placeholders.CHILD_PROCESS_ID, values.childProcessId ?? null],
    [placeholders.CHILD_ID, values.childId],
    [placeholders.LABEL, values.label],
    [placeholders.WORKING_DIRECTORY, values.workingDirectory],
    [placeholders.EXIT_CODE, values.exitCode ?? null],
    [placeholders.RUN_MILLISECONDS, MOCKED_RUN_MILLISECONDS],
    [placeholders.TIME_BOUND, values.timeBound ?? null],
    [placeholders.START_NUMBER, values.startNumber],
    [placeholders.ENDPOINT, values.endpoint],
    [placeholders.CODE_VERSION, values.codeVersion],
    [placeholders.RENEWER, values.renewer ?? null],
    [placeholders.CLOSING_LINE_SEQUENCE, values.closingLineSequence],
    [placeholders.COUNTED_LINES, values.countedLines],
  ]);
  return replacedDeeply(answer, (leaf) => (typeof leaf === 'string' && replacements.has(leaf) ? replacements.get(leaf) : leaf));
}

let recordedAnswers: ReadonlyMap<string, unknown> | null = null;

function recordedAnswersOfThisOs(): ReadonlyMap<string, unknown> {
  if (recordedAnswers !== null) return recordedAnswers;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(TALOS_BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) throw new Error(`no Talos stages are recorded for ${process.platform}: run \`${recordCommandOf(TALOS_BOUNDARY)}\`.`);
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  recordedAnswers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer]));
  return recordedAnswers;
}

/**
 * How a scripted line ends: `exitCode` 0 and no output unless said; `runsUntilStopped` keeps it live until a stop ends it, and
 * `endsAtItsTimeBound` has Talos stop it at its bound.
 */
export interface ScriptedLineEnd {
  readonly exitCode?:           number;
  readonly output?:             string;
  readonly runsUntilStopped?:   boolean;
  readonly endsAtItsTimeBound?: boolean;
}

export interface RecordedTalosStages {
  /** The native ports with the recorded process table in the place of the real one. */
  readonly ports:                        PlatformPorts;
  readonly processStarts:                ProcessStarts;
  /** The connection to the board's one mocked Talos, which starts serving at the first call for the board. */
  readonly connectionFor:                (boardFolder: string) => TalosConnection;
  readonly scriptLine:                   (line: string, end: ScriptedLineEnd) => void;
  /** What a session's `shell` step with this very command does, in the session's working directory. */
  readonly scriptShell:                  (command: string, action: (workingDirectory: string) => void) => void;
  /** Every line Talos or a merged-tree gate ran, in order. */
  readonly linesRun:                     () => readonly string[];
  /** The launch Talos took for the child, which a spec reads in place of a launch file; `null` for none. */
  readonly launchOf:                     (childFolder: string, instance: number) => ChildLaunch | null;
  /** Talos dies with no word, as a kill or a reboot ends it: its agents see their input close, its lines run on. */
  readonly crashTalos:                   (boardFolder: string) => void;
  /** As `crashTalos`, and every agent lives on in its own group too, as one mid-turn does. */
  readonly crashTalosLeavingItsAgents:   (boardFolder: string) => void;
  /** A clean quit: each agent takes its quit act and ends `paused`, each line is stopped `paused`, and the connection closes. */
  readonly quitTalos:                    (boardFolder: string) => void;
  /** The lease ended: each agent takes its quit act and ends `lease-ended`; the lines run on. */
  readonly endLease:                     (boardFolder: string) => void;
  /** Talos recognises the child's last line as the closing line of the named ending, as its patterns would on the real line. */
  readonly recogniseEndingOfTheLastLine: (childFolder: string, instance: number, endingName: string) => void;
  /** The child refuses each forced stop from now on, as a process of another user does, and lives on. */
  readonly refuseForcedStopsOfChild:     (childFolder: string, instance: number) => void;
  /** The next Talos of the board, once the one before it quit or was lost, as the Overseer's `ensureTalos` starts it. */
  readonly startTalosAgain:              (boardFolder: string) => void;
  /** Talos and every child are gone with the machine, and nothing writes a record; the spec writes the records of another boot. */
  readonly rebootMachine:                (boardFolder: string) => void;
}

interface MockedChild {
  readonly files:        ChildFiles;
  readonly launch:       ChildLaunch;
  readonly childId:      string;
  readonly child:        ProcessIdentity;
  readonly eventLog:     EventLogWriter;
  readonly steps:        readonly FakeAgentStep[];
  readonly talos:        MockedTalos;
  recognisedEndings:     RecognisedEnding[];
  lastStageAnswer:       TalosStageAnswer | null;
  nextStep:              number;
  linesWaiting:          number;
  inputClosed:           boolean;
  ended:                 boolean;
  /** Set by a crash that leaves the child running in its own group whatever the stage recorded. */
  childOutlivesItsTalos: boolean;
}

interface MockedTalos {
  readonly boardFolder:   string;
  readonly startNumber:   number;
  readonly talos:         ProcessIdentity;
  readonly connection:    TalosConnection;
  readonly children:      Map<string, MockedChild>;
  readonly closeHandlers: (() => void)[];
  serving:                boolean;
  lastFrameId:            number;
}

export interface ControlledRecordedTalosStages {
  readonly stages:              RecordedTalosStages;
  /** Each call that had no recorded answer since the last take, described; the list is then empty. */
  readonly takeUnansweredCalls: () => string[];
  readonly forget:              () => void;
}

/** Call at a spec file's top level: each case starts with no Talos, and a stage with no recorded answer fails the case. */
export function useRecordedTalosStages(nativePorts: PlatformPorts): RecordedTalosStages {
  const controlled = createRecordedTalosStages(nativePorts);
  beforeEach(controlled.forget);
  afterEach(() => {
    // Production code may catch the throw of an unanswered stage, so the case fails here too.
    const unanswered = controlled.takeUnansweredCalls();
    if (unanswered.length > 0) throw new Error(unanswered.join('\n'));
  });
  return controlled.stages;
}

function scenarioOf(launch: ChildLaunch): readonly FakeAgentStep[] {
  if (launch.kind !== 'agent') return [];
  return JSON.parse(readFileSync(launch.argv[SCENARIO_ARGUMENT_INDEX] ?? '', 'utf8')) as FakeAgentStep[];
}

function lineWithHeadOf(line: string, workingDirectory: string): string {
  return line.includes(FAKE_HEAD_PLACEHOLDER) ? line.replaceAll(FAKE_HEAD_PLACEHOLDER, GitProcess.resolvedCommitOf(workingDirectory, 'HEAD') ?? '') : line;
}

function doneOf(frameId: number, verdict: 'done' | 'already-done'): DoneFrame {
  return { kind: 'done', frameId, verdict };
}

function refusedOf(frameId: number, reason: FrameRefusalReason): DoneFrame {
  return {
    kind: 'done', frameId, verdict: 'refused', reason
  };
}

/** `answers` are this OS's recording unless a spec of the mock itself gives others. */
export function createRecordedTalosStages(nativePorts: PlatformPorts, answers?: ReadonlyMap<string, unknown>): ControlledRecordedTalosStages {
  const processTable: ControlledRecordedProcessTable = createRecordedProcessTable(nativePorts);
  let taloses = new Map<string, MockedTalos>();
  let everyTalos: MockedTalos[] = [];
  let lineEnds = new Map<string, ScriptedLineEnd>(Object.entries(BUILT_IN_LINES));
  let shellActions = new Map<string, (workingDirectory: string) => void>();
  let linesRun: string[] = [];
  const unansweredCalls: string[] = [];
  const { table } = processTable;

  const stageAnswerOf = (stage: TalosStage): TalosStageAnswer => {
    const callShape = talosStageCallShapeOf(stage);
    const answer = (answers ?? recordedAnswersOfThisOs()).get(callShape);
    if (answer === undefined) {
      const unanswered = `${callShape} has no recorded answer: run \`${recordCommandOf(TALOS_BOUNDARY)}\``;
      unansweredCalls.push(unanswered);
      throw new Error(unanswered);
    }
    return answer as TalosStageAnswer;
  };
  const originOf = (stage: TalosStage, placeholder: string): EventOrigin => {
    const entry = stageAnswerOf(stage).entries.find((recorded) => recorded.line === placeholder);
    if (entry === undefined) throw new Error(`the recorded stage "${stage}" logs no ${placeholder}`);
    return entry.origin;
  };
  const valuesOf = (host: Pick<MockedChild, 'talos' | 'child' | 'childId' | 'launch' | 'recognisedEndings'>, exitCode?: number): TalosStageValues => {
    const ending = host.recognisedEndings.at(-1);
    return {
      talos:            host.talos.talos,
      startNumber:      host.talos.startNumber,
      child:            host.child,
      childProcessId:   host.child.processId,
      childId:          host.childId,
      label:            host.launch.label,
      workingDirectory: host.launch.workingDirectory,
      ...(exitCode === undefined ? {} : { exitCode }),
      ...(host.launch.timeBoundMilliseconds === null ? {} : { timeBound: host.launch.timeBoundMilliseconds }),
      ...(ending === undefined ? {} : { closingLineSequence: ending.closingLineSequence, countedLines: ending.countedLines }),
    };
  };

  function writeTalosRecord(mocked: MockedTalos, recordedTalosRecord: unknown): void {
    const replayValues = {
      talos: mocked.talos, startNumber: mocked.startNumber, endpoint: `/example/talos-${mocked.startNumber}.sock`, codeVersion: MOCKED_CODE_VERSION
    };
    const record = asReplayedTalosStage(recordedTalosRecord, replayValues) as TalosRecord;
    const recordPath = talosRecordPathOf(mocked.boardFolder, mocked.startNumber);
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileAtomically(recordPath, talosRecordTextOf(record));
  }

  function closeConnection(mocked: MockedTalos): void {
    if (!mocked.serving) return;
    mocked.serving = false;
    for (const handler of mocked.closeHandlers.splice(0)) handler();
  }

  /** The child's record and processes as the recorded stage left them; a stage after the end leaves the end's record as it was. */
  function enterStage(host: MockedChild, stage: TalosStage, exitCode?: number): void {
    if (host.ended) return;
    const answer = asReplayedTalosStage(stageAnswerOf(stage), valuesOf(host, exitCode)) as TalosStageAnswer;
    const record = { ...(answer.record as ChildRecord), recognisedEndings: host.recognisedEndings };
    if (record.end !== null) {
      host.ended = true;
      host.eventLog.syncAndClose();
    }
    host.lastStageAnswer = answer;
    writeFileAtomically(host.files.recordPath, childRecordTextOf(record));
    if (!answer.childRuns && !host.childOutlivesItsTalos) table.endProcess(host.child);
  }

  function appendClientEntry(host: MockedChild, stage: TalosStage, entry: Parameters<typeof clientEntryLineOf>[0]): void {
    host.eventLog.append(originOf(stage, TALOS_STAGE_PLACEHOLDERS.CLIENT_ENTRY), clientEntryLineOf(entry));
  }

  function playScenario(host: MockedChild): void {
    const { workingDirectory } = host.launch;
    while (!host.ended) {
      const step = host.steps[host.nextStep];
      if (step === undefined || (step.kind === 'await-line' && host.linesWaiting === 0 && host.inputClosed)) {
        enterStage(host, TALOS_STAGES.AGENT_INPUT_CLOSED, 0);
        return;
      }
      if (step.kind === 'await-line') {
        if (host.linesWaiting === 0) return;
        host.linesWaiting -= 1;
      } else if (step.kind === 'print') {
        host.eventLog.append(originOf(TALOS_STAGES.AGENT_LINE, TALOS_STAGE_PLACEHOLDERS.CHILD_LINE), lineWithHeadOf(recordedLineOf(step.line), workingDirectory));
      } else if (step.kind === 'shell') {
        const action = shellActions.get(step.command);
        if (action === undefined) throw new Error(`no action is scripted for the shell step ${step.command}`);
        action(workingDirectory);
      } else if (step.kind === 'exit') {
        enterStage(host, TALOS_STAGES.AGENT_INPUT_CLOSED, step.code);
        return;
      } else {
        enterStage(host, TALOS_STAGES.AGENT_CRASH);
        return;
      }
      host.nextStep += 1;
    }
  }

  function runLine(host: MockedChild): void {
    const line = host.launch.argv.at(-1) ?? '';
    linesRun.push(line);
    const lineEnd = lineEnds.get(line);
    if (lineEnd === undefined) throw new Error(`no end is scripted for the line ${line}`);
    const exitCode = lineEnd.exitCode ?? 0;
    const stage = exitCode === 0 ? TALOS_STAGES.LINE_GREEN : TALOS_STAGES.LINE_RED;
    const origin = originOf(stage, TALOS_STAGE_PLACEHOLDERS.CHILD_LINE);
    for (const outputLine of (lineEnd.output ?? '').split('\n').filter((text) => text !== '')) host.eventLog.append(origin, outputLine);
    if (lineEnd.endsAtItsTimeBound === true) enterStage(host, TALOS_STAGES.LINE_TIME_BOUND);
    else if (lineEnd.runsUntilStopped !== true) enterStage(host, stage, exitCode);
  }

  function launched(mocked: MockedTalos, launch: ChildLaunch): 'done' | 'already-done' {
    const files = childFilesOf(mocked.boardFolder, launch.childFolder, launch.instance);
    const childId = childIdOf(launch.childFolder, launch.instance);
    const child = table.bornProcess();
    const launchStage = launch.kind === 'agent' ? TALOS_STAGES.AGENT_LAUNCHED : TALOS_STAGES.LINE_LAUNCHED;
    const launchAnswer = asReplayedTalosStage(stageAnswerOf(launchStage), valuesOf({
      talos: mocked, child, childId, launch, recognisedEndings: []
    })) as TalosStageAnswer;
    mkdirSync(dirname(files.recordPath), { recursive: true });
    if (createFileAtomically(files.recordPath, childRecordTextOf(launchAnswer.record as ChildRecord)) === 'already-exists') {
      // A launch of a child Talos already launched starts nothing.
      table.endProcess(child);
      return 'already-done';
    }
    const host: MockedChild = {
      files,
      launch,
      childId,
      child,
      eventLog:              createEventLogWriter(files.eventLogPath, () => MOCKED_STAMP),
      steps:                 scenarioOf(launch),
      talos:                 mocked,
      recognisedEndings:     [],
      lastStageAnswer:       null,
      nextStep:              0,
      linesWaiting:          0,
      inputClosed:           false,
      ended:                 false,
      childOutlivesItsTalos: false,
    };
    mocked.children.set(childId, host);
    if (launch.kind === 'agent') playScenario(host);
    else runLine(host);
    return 'done';
  }

  function stopChild(host: MockedChild, graceMilliseconds: number): void {
    if (host.launch.kind === 'line') {
      enterStage(host, TALOS_STAGES.LINE_STOPPED);
      return;
    }
    appendClientEntry(host, TALOS_STAGES.AGENT_STOPPED, { act: 'stop', graceMilliseconds });
    // An agent's stop closes its input first, which ends a scenario waiting for a line before any signal is sent.
    host.inputClosed = true;
    playScenario(host);
    enterStage(host, TALOS_STAGES.AGENT_STOPPED);
  }

  function takeInput(host: MockedChild, input: ChildInput): void {
    appendClientEntry(host, TALOS_STAGES.AGENT_LINE, input);
    if (input.act === 'write-line') host.linesWaiting += 1;
    else host.inputClosed = true;
    playScenario(host);
  }

  /** Each live agent takes its quit act, logged as a client entry, and ends with the stage's reason whatever its exit. */
  function quitAgentsAtTurnEnd(mocked: MockedTalos, stage: TalosStage): void {
    for (const host of mocked.children.values()) {
      if (host.ended || host.launch.kind !== 'agent') continue;
      appendClientEntry(host, stage, { act: 'close' });
      enterStage(host, stage, 0);
    }
  }

  function answerOf(mocked: MockedTalos, frame: TalosFrameRequest): DoneFrame {
    mocked.lastFrameId += 1;
    const frameId = mocked.lastFrameId;
    switch (frame.kind) {
      case 'lease-renewal':
        return doneOf(frameId, 'done');
      case 'launch':
        return doneOf(frameId, launched(mocked, frame.launch));
      case 'stop-lines':
        for (const host of mocked.children.values()) if (host.launch.kind === 'line' && !host.ended) stopChild(host, 0);
        return doneOf(frameId, 'done');
      case 'quit':
        quitTalos(mocked);
        return doneOf(frameId, 'done');
      case 'input':
      case 'stop': {
        const host = mocked.children.get(frame.childId);
        if (host === undefined) return refusedOf(frameId, 'unknown-child');
        if (frame.kind === 'stop') {
          if (host.ended) return doneOf(frameId, 'already-done');
          stopChild(host, frame.graceMilliseconds);
          return doneOf(frameId, 'done');
        }
        if (host.launch.kind !== 'agent') return refusedOf(frameId, 'kind-takes-no-input');
        if (host.ended) return refusedOf(frameId, 'child-ended');
        takeInput(host, frame.input);
        return doneOf(frameId, 'done');
      }
    }
  }

  function startedTalos(boardFolder: string, startNumber: number): MockedTalos {
    const closeHandlers: (() => void)[] = [];
    const mocked: MockedTalos = {
      boardFolder,
      startNumber,
      talos:       table.bornProcess(),
      children:    new Map(),
      closeHandlers,
      serving:     true,
      lastFrameId: 0,
      connection:  {
        send: (frame) => {
          if (!mocked.serving) return Promise.resolve('no-answer');
          return Promise.resolve(answerOf(mocked, frame));
        },
        onState: () => undefined,
        onClose: (listener) => {
          closeHandlers.push(listener);
        },
        close: () => closeConnection(mocked),
      },
    };
    taloses.set(boardFolder, mocked);
    everyTalos.push(mocked);
    writeTalosRecord(mocked, stageAnswerOf(TALOS_STAGES.SERVING).talosRecord);
    return mocked;
  }

  function talosOf(boardFolder: string): MockedTalos {
    return taloses.get(boardFolder) ?? startedTalos(boardFolder, FIRST_MOCKED_START_NUMBER);
  }

  function quitTalos(mocked: MockedTalos): void {
    for (const host of mocked.children.values()) if (host.launch.kind === 'line' && !host.ended) enterStage(host, TALOS_STAGES.LINE_PAUSED);
    quitAgentsAtTurnEnd(mocked, TALOS_STAGES.AGENT_PAUSED);
    writeTalosRecord(mocked, stageAnswerOf(TALOS_STAGES.AGENT_PAUSED).talosRecord);
    table.endProcess(mocked.talos);
    closeConnection(mocked);
  }

  function crash(boardFolder: string, agentsLiveOn: boolean): void {
    const mocked = talosOf(boardFolder);
    for (const host of mocked.children.values()) {
      if (host.ended) continue;
      host.childOutlivesItsTalos = agentsLiveOn && host.launch.kind === 'agent';
      // Talos writes nothing as it dies: the record stays as the last stage left it, and only the processes change.
      const answer = stageAnswerOf(host.launch.kind === 'agent' ? TALOS_STAGES.TALOS_CRASH_AGENT : TALOS_STAGES.TALOS_CRASH_LINE);
      if (!answer.childRuns && !host.childOutlivesItsTalos) table.endProcess(host.child);
    }
    table.endProcess(mocked.talos);
    closeConnection(mocked);
  }

  function childOf(childFolder: string, instance: number): MockedChild {
    for (const mocked of everyTalos) {
      for (const host of mocked.children.values()) if (host.files.recordPath === join(childFolder, `child-${instance}.json`)) return host;
    }
    throw new Error(`no mocked Talos runs instance ${instance} of ${childFolder}`);
  }

  const stages: RecordedTalosStages = {
    ports: {
      ...table.ports,
      processSupervision: {
        ...table.ports.processSupervision,
        identityOf: (processId) => {
          if (processId === process.pid) table.callerProcess();
          return table.ports.processSupervision.identityOf(processId);
        },
        processIsGone: (processId) => {
          if (processId === process.pid) table.callerProcess();
          return table.ports.processSupervision.processIsGone(processId);
        },
        treeMembersOf: (leader, earlierMembers) => {
          const endedHost = everyTalos.flatMap((mocked) => [...mocked.children.values()])
            .find((host) => host.ended && host.child.processId === leader.processId);
          if (endedHost === undefined || earlierMembers === undefined) return table.ports.processSupervision.treeMembersOf(leader, earlierMembers);
          const treeAfterTheStop = endedHost.lastStageAnswer?.childTreeAfterTheStop;
          if (treeAfterTheStop === undefined) {
            const unanswered = `treeMembersOf of the ended child ${endedHost.childId} has no recorded answer: run \`${recordCommandOf(TALOS_BOUNDARY)}\``;
            unansweredCalls.push(unanswered);
            throw new Error(unanswered);
          }
          return treeAfterTheStop;
        },
      },
    },
    processStarts: {
      startTalos: () => {
        const unanswered = 'startTalos has no recorded answer: the Talos stages answer the connection themselves';
        unansweredCalls.push(unanswered);
        throw new Error(unanswered);
      },
      runGatePipeline: (request) => {
        const lineFails = (line: string): boolean => (lineEnds.get(line)?.exitCode ?? 0) !== 0;
        const failingPrepareLines = request.prepare.map((step) => step.run).filter(lineFails);
        if (failingPrepareLines.length > 0) throw new Error(`a failing merge prepare step is a real-system case: ${failingPrepareLines.join(', ')}`);
        linesRun.push(...request.prepare.map((step) => step.run));
        const gatesRun: string[] = [];
        for (const gate of request.gates) {
          linesRun.push(gate.run);
          gatesRun.push(gate.name);
          if (!lineFails(gate.run)) continue;
          // A red gate ends the pipeline at it with its own output, as `GateRun.runPipeline` does for a gate that exits non-zero.
          const cacheReports = gatesRun.map((gateName) => ({ gateName, cacheReport: null }));
          // A scripted line has no run time to record.
          return Promise.resolve({
            outcome: 'failed', gate: gate.name, output: lineEnds.get(gate.run)?.output ?? '', gatesRun, cacheReports, stepRuns: []
          });
        }
        return Promise.resolve({
          outcome: 'passed', gatesRun, cacheReports: gatesRun.map((gateName) => ({ gateName, cacheReport: null })), stepRuns: []
        });
      },
      runGateLines:     () => Promise.reject(new Error('a gate profile is a real-system case')),
      runProposalTwice: () => Promise.reject(new Error('a pipeline check is a real-system case')),
    },
    connectionFor: (boardFolder) => talosOf(boardFolder).connection,
    scriptLine:    (line, end) => { lineEnds.set(line, end); },
    scriptShell:   (command, action) => { shellActions.set(command, action); },
    linesRun:      () => linesRun,
    launchOf:      (childFolder, instance) => {
      try {
        return childOf(childFolder, instance).launch;
      } catch {
        return null;
      }
    },
    crashTalos:                 (boardFolder) => crash(boardFolder, false),
    crashTalosLeavingItsAgents: (boardFolder) => crash(boardFolder, true),
    quitTalos:                  (boardFolder) => quitTalos(talosOf(boardFolder)),
    endLease:                   (boardFolder) => {
      const mocked = talosOf(boardFolder);
      quitAgentsAtTurnEnd(mocked, TALOS_STAGES.AGENT_LEASE_ENDED);
      writeTalosRecord(mocked, stageAnswerOf(TALOS_STAGES.AGENT_LEASE_ENDED).talosRecord);
    },
    recogniseEndingOfTheLastLine: (childFolder, instance, endingName) => {
      const host = childOf(childFolder, instance);
      const lastSequence = readFileSync(host.files.eventLogPath, 'utf8').split('\n').filter((line) => line !== '').length;
      host.recognisedEndings = [...host.recognisedEndings, { name: endingName, closingLineSequence: lastSequence, countedLines: 1 }];
      const answer = asReplayedTalosStage(stageAnswerOf(TALOS_STAGES.AGENT_ENDING_RECOGNISED), valuesOf(host)) as TalosStageAnswer;
      if (!host.ended) writeFileAtomically(host.files.recordPath, childRecordTextOf({ ...(answer.record as ChildRecord), recognisedEndings: host.recognisedEndings }));
    },
    startTalosAgain: (boardFolder) => {
      const previous = talosOf(boardFolder);
      if (previous.serving) throw new Error(`Talos ${previous.startNumber} of ${boardFolder} still serves`);
      startedTalos(boardFolder, previous.startNumber + 1);
    },
    refuseForcedStopsOfChild: (childFolder, instance) => table.refuseForcedStops(childOf(childFolder, instance).child),
    rebootMachine:            (boardFolder) => {
      const mocked = talosOf(boardFolder);
      for (const host of mocked.children.values()) if (!host.ended) table.endProcess(host.child);
      table.endProcess(mocked.talos);
      closeConnection(mocked);
    },
  };

  return {
    stages,
    takeUnansweredCalls: () => [...unansweredCalls.splice(0), ...processTable.takeUnansweredCalls()],
    forget:              () => {
      processTable.forgetProcesses();
      taloses = new Map();
      everyTalos = [];
      lineEnds = new Map(Object.entries(BUILT_IN_LINES));
      shellActions = new Map();
      linesRun = [];
    },
  };
}
