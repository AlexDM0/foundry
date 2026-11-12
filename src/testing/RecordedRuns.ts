/**
 * The process-run mock every spec uses in place of the real boundary: it answers each call from recorded runs and fails the spec on a
 * call with no recorded answer. It keeps the real run's demand on the caller: a working directory that exists. Test-only.
 */
import { readFileSync, statSync } from 'node:fs';
import { join }                   from 'node:path';

import type {
  DetachedStartAnswer,
  DetachedStartRequest,
  ProcessRun,
  ProgramRunAnswer,
  ProgramRunRequest,
} from '../lib/process-run/ProcessRun.ts';

import {
  boundaryRecordingReadingOf,
  recordCommandOf,
  recordingPathOf,
  repositoryRoot,
} from './BoundaryRecordings.ts';

export interface RecordedRun {
  readonly callShape: string;
  readonly answer:    ProgramRunAnswer | DetachedStartAnswer;
}

export interface RecordedProcessRun extends ProcessRun {
  /** Every call shape answered so far, in order. */
  readonly callShapesAnswered: () => readonly string[];
}

const RUN_CALL_SHAPE_PREFIX = 'run ';
const DETACHED_START_CALL_SHAPE_PREFIX = 'start detached ';
const MISSING_VALUES: ReadonlySet<unknown> = new Set(['program', 'working-directory']);

/** The working directory and the bound are left out: a recorded answer holds for any of them. */
export function runCallShapeOf(program: string, programArguments: readonly string[]): string {
  return `${RUN_CALL_SHAPE_PREFIX}${JSON.stringify([program, ...programArguments])}`;
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

function answerFitsCallShape(callShape: string, answer: unknown): boolean {
  if (callShape.startsWith(RUN_CALL_SHAPE_PREFIX)) return isProgramRunAnswer(answer);
  return callShape.startsWith(DETACHED_START_CALL_SHAPE_PREFIX) && isDetachedStartAnswer(answer);
}

/** The recorded runs of one recording for an OS; a recording that is absent or unreadable fails the spec and names the command to take it. */
export function recordedRunsOf(recordingName: string, operatingSystem: string = process.platform): readonly RecordedRun[] {
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
  return reading.recording.answers.map(({ callShape, answer }) => {
    if (!answerFitsCallShape(callShape, answer)) throw new Error(`${recordingPath} holds no process-run answer for ${callShape}. ${recordAgain}`);
    return { callShape, answer } as RecordedRun;
  });
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
    startDetached: (request: DetachedStartRequest) => {
      return recordedAnswerFor(detachedStartCallShapeOf(request.program, request.programArguments), request.workingDirectory) as DetachedStartAnswer;
    },
    callShapesAnswered: () => [...callShapesAnswered],
  };
}
