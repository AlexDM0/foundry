/**
 * The process-run mock every spec uses in place of the real boundary: it answers each call from recorded runs and fails the spec on a
 * call with no recorded answer. It keeps the real run's demands on the caller: a working directory that exists, and an owned child that
 * ends only by itself or by its stop, as it was recorded. Test-only.
 */
import { readFileSync, statSync } from 'node:fs';
import { join }                   from 'node:path';

import type {
  DetachedStartAnswer,
  DetachedStartRequest,
  NotFoundAnswer,
  OwnedStartAnswer,
  OwnedStartRequest,
  ProcessRun,
  ProgramRunAnswer,
  ProgramRunRequest,
} from '../lib/process-run/ProcessRun.ts';

import {
  boundaryRecordingReadingOf,
  recordCommandOf,
  recordingPathOf,
  repositoryRoot,
  type RecordedAnswer,
} from './BoundaryRecordings.ts';

/** How a recorded owned child ended: by the caller's stop, or by itself at once, each with the exit code it ended with. */
export interface RecordedOwnedEnding {
  readonly by:       'stop' | 'itself';
  readonly exitCode: number;
}

export type RecordedOwnedStartAnswer = NotFoundAnswer | { readonly verdict: 'started'; readonly processId: number; readonly ending: RecordedOwnedEnding };

export interface RecordedRun {
  readonly callShape: string;
  readonly answer:    ProgramRunAnswer | DetachedStartAnswer | RecordedOwnedStartAnswer;
}

export interface RecordedProcessRun extends ProcessRun {
  /** Every call shape answered so far, in order. */
  readonly callShapesAnswered:   () => readonly string[];
  /** The call shape of every owned child started and not yet ended, in the order they were started. */
  readonly ownedChildrenRunning: () => readonly string[];
  /** The call shape of every owned child its caller stopped, in the order they were stopped. */
  readonly ownedChildrenStopped: () => readonly string[];
}

const RUN_CALL_SHAPE_PREFIX = 'run ';
const OWNED_START_CALL_SHAPE_PREFIX = 'start owned ';
const DETACHED_START_CALL_SHAPE_PREFIX = 'start detached ';
const OWNED_ENDINGS: ReadonlySet<unknown> = new Set(['stop', 'itself']);
const MISSING_VALUES: ReadonlySet<unknown> = new Set(['program', 'working-directory']);

/** The working directory and the bound are left out: a recorded answer holds for any of them. */
export function runCallShapeOf(program: string, programArguments: readonly string[]): string {
  return `${RUN_CALL_SHAPE_PREFIX}${JSON.stringify([program, ...programArguments])}`;
}

export function ownedStartCallShapeOf(program: string, programArguments: readonly string[]): string {
  return `${OWNED_START_CALL_SHAPE_PREFIX}${JSON.stringify([program, ...programArguments])}`;
}

export function detachedStartCallShapeOf(program: string, programArguments: readonly string[]): string {
  return `${DETACHED_START_CALL_SHAPE_PREFIX}${JSON.stringify([program, ...programArguments])}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFoundAnswer(answer: Record<string, unknown>): boolean {
  return answer['verdict'] === 'not-found' && MISSING_VALUES.has(answer['missing']);
}

function isProgramRunAnswer(answer: unknown): answer is ProgramRunAnswer {
  if (!isRecord(answer)) return false;
  if (answer['verdict'] === 'timed-out' || isNotFoundAnswer(answer)) return true;
  return answer['verdict'] === 'finished'
    && Number.isInteger(answer['exitCode'])
    && typeof answer['standardOutput'] === 'string'
    && typeof answer['standardError'] === 'string';
}

function isDetachedStartAnswer(answer: unknown): answer is DetachedStartAnswer {
  if (!isRecord(answer)) return false;
  return isNotFoundAnswer(answer) || (answer['verdict'] === 'started' && Number.isInteger(answer['processId']));
}

function isRecordedOwnedStartAnswer(answer: unknown): answer is RecordedOwnedStartAnswer {
  if (!isRecord(answer)) return false;
  if (isNotFoundAnswer(answer)) return true;
  const { ending } = answer;
  return answer['verdict'] === 'started' && Number.isInteger(answer['processId'])
    && isRecord(ending) && OWNED_ENDINGS.has(ending['by']) && Number.isInteger(ending['exitCode']);
}

function answerFitsCallShape(callShape: string, answer: unknown): boolean {
  if (callShape.startsWith(RUN_CALL_SHAPE_PREFIX)) return isProgramRunAnswer(answer);
  if (callShape.startsWith(OWNED_START_CALL_SHAPE_PREFIX)) return isRecordedOwnedStartAnswer(answer);
  return callShape.startsWith(DETACHED_START_CALL_SHAPE_PREFIX) && isDetachedStartAnswer(answer);
}

function recordedAnswersOf(recordingName: string, operatingSystem: string): { readonly recordingPath: string; readonly answers: readonly RecordedAnswer[] } {
  const recordingPath = recordingPathOf(recordingName, operatingSystem);
  const recordAgain   = `Record it with \`${recordCommandOf(recordingName)}\`.`;
  let recordingText: string;
  try {
    recordingText = readFileSync(join(repositoryRoot(), recordingPath), 'utf8');
  } catch {
    throw new Error(`${recordingName} has no recording for ${operatingSystem} at ${recordingPath}. ${recordAgain}`);
  }
  const reading = boundaryRecordingReadingOf(recordingText);
  if (reading.verdict === 'unreadable') throw new Error(`${recordingPath} is unreadable: ${reading.reason}. ${recordAgain}`);
  return { recordingPath, answers: reading.recording.answers };
}

function recordedRunsAmong(recordingName: string, recordingPath: string, answers: readonly RecordedAnswer[]): readonly RecordedRun[] {
  return answers.map(({ callShape, answer }) => {
    if (!answerFitsCallShape(callShape, answer)) {
      throw new Error(`${recordingPath} holds no process-run answer for ${callShape}. Record it with \`${recordCommandOf(recordingName)}\`.`);
    }
    return { callShape, answer } as RecordedRun;
  });
}

/** The recorded runs of one recording for an OS; a recording that is absent or unreadable fails the spec and names the command to take it. */
export function recordedRunsOf(recordingName: string, operatingSystem: string = process.platform): readonly RecordedRun[] {
  const { recordingPath, answers } = recordedAnswersOf(recordingName, operatingSystem);
  return recordedRunsAmong(recordingName, recordingPath, answers);
}

const SITUATION_SEPARATOR = ': ';

/**
 * A call shape as a recording of several situations keys it: one recording spec records each situation of a flow, such as a program
 * that answers and one that refuses the same call, and a flow spec takes the answer set of one situation.
 */
export function situationCallShapeOf(situation: string, callShape: string): string {
  return `${situation}${SITUATION_SEPARATOR}${callShape}`;
}

/** The recorded runs of one situation of a recording for an OS, each call shape without its situation. */
export function recordedSituationRunsOf(recordingName: string, situation: string, operatingSystem: string = process.platform): readonly RecordedRun[] {
  const { recordingPath, answers } = recordedAnswersOf(recordingName, operatingSystem);
  const situationPrefix = situationCallShapeOf(situation, '');
  const situationAnswers = answers
    .filter(({ callShape }) => callShape.startsWith(situationPrefix))
    .map(({ callShape, answer }) => ({ callShape: callShape.slice(situationPrefix.length), answer }));
  return recordedRunsAmong(recordingName, recordingPath, situationAnswers);
}

function directoryExists(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

export function recordedProcessRun(recordedRuns: readonly RecordedRun[]): RecordedProcessRun {
  const answerByCallShape = new Map<string, RecordedRun['answer']>();
  for (const { callShape, answer } of recordedRuns) {
    if (answerByCallShape.has(callShape)) throw new Error(`Two recorded answers for ${callShape}: a flow takes one answer set per stage.`);
    if (!answerFitsCallShape(callShape, answer)) throw new Error(`The answer recorded for ${callShape} is no process-run answer for that call.`);
    answerByCallShape.set(callShape, answer);
  }
  const callShapesAnswered: string[] = [];
  const ownedChildrenRunning: string[] = [];
  const ownedChildrenStopped: string[] = [];

  function ownedStartAnswerOf(callShape: string, recorded: RecordedOwnedStartAnswer): OwnedStartAnswer {
    if (recorded.verdict === 'not-found') return recorded;
    const { ending } = recorded;
    let endChild: (exitCode: number) => void = () => undefined;
    const exited = new Promise<number>((resolve) => {
      endChild = resolve;
    });
    let hasEnded = false;
    const end = (): void => {
      hasEnded = true;
      ownedChildrenRunning.splice(ownedChildrenRunning.indexOf(callShape), 1);
      endChild(ending.exitCode);
    };
    ownedChildrenRunning.push(callShape);
    if (ending.by === 'itself') end();
    return {
      verdict: 'started',
      child:   {
        processId: recorded.processId,
        exited,
        stop:      () => {
          if (hasEnded) return;
          ownedChildrenStopped.push(callShape);
          end();
        },
      },
    };
  }

  function recordedAnswerFor(callShape: string, workingDirectory: string): RecordedRun['answer'] {
    if (!directoryExists(workingDirectory)) {
      throw new Error(`${callShape} was asked to run in ${workingDirectory}, which is no directory; the real run answers not-found there.`);
    }
    const answer = answerByCallShape.get(callShape);
    if (answer === undefined) {
      const recordedShapes = [...answerByCallShape.keys()].map((recordedShape) => `  ${recordedShape}`).join('\n');
      throw new Error(`No recorded answer for ${callShape}. The recorded call shapes are:\n${recordedShapes}`);
    }
    callShapesAnswered.push(callShape);
    return answer;
  }

  return {
    run: async (request: ProgramRunRequest) => {
      return recordedAnswerFor(runCallShapeOf(request.program, request.programArguments), request.workingDirectory) as ProgramRunAnswer;
    },
    startOwned: (request: OwnedStartRequest) => {
      const callShape = ownedStartCallShapeOf(request.program, request.programArguments);
      return ownedStartAnswerOf(callShape, recordedAnswerFor(callShape, request.workingDirectory) as RecordedOwnedStartAnswer);
    },
    startDetached: (request: DetachedStartRequest) => {
      return recordedAnswerFor(detachedStartCallShapeOf(request.program, request.programArguments), request.workingDirectory) as DetachedStartAnswer;
    },
    callShapesAnswered:   () => [...callShapesAnswered],
    ownedChildrenRunning: () => [...ownedChildrenRunning],
    ownedChildrenStopped: () => [...ownedChildrenStopped],
  };
}
