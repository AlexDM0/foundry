/**
 * Reads this OS's recording of the Overseer HTTP API for `src/testing/RecordedOverseerFetch.ts`, which stays DOM-safe, and gives a spec
 * file a mock whose unanswered requests fail the case.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach } from 'bun:test';

import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';
import {
  createRecordedOverseerFetch,
  OVERSEER_BOUNDARY,
  type OverseerCallShape,
  type RecordedOverseer,
  type RecordedOverseerOptions
} from './RecordedOverseerFetch.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

let recordedAnswers: ReadonlyMap<string, unknown> | null = null;

export function recordedOverseerAnswersOfThisOs(): ReadonlyMap<string, unknown> {
  if (recordedAnswers !== null) return recordedAnswers;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(OVERSEER_BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) {
    throw new Error(`no Overseer HTTP answers are recorded for ${process.platform}: run \`${recordCommandOf(OVERSEER_BOUNDARY)}\`.`);
  }
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  recordedAnswers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer]));
  return recordedAnswers;
}

/** The recorded answer to one call shape on this OS; `undefined` when nobody recorded it. */
export function recordedOverseerAnswerOf(callShape: OverseerCallShape): unknown {
  return recordedOverseerAnswersOfThisOs().get(callShape);
}

/** Call at a spec file's top level; `createOverseer` gives each case a fresh mock, and a request it could not answer fails the case. */
export function useRecordedOverseerFetch(): (options?: RecordedOverseerOptions) => RecordedOverseer {
  const created: RecordedOverseer[] = [];
  afterEach(() => {
    // The client under test may catch the error of an unanswered request, so the case fails here too.
    const unanswered = created.splice(0).flatMap((overseer) => overseer.takeUnansweredCalls());
    if (unanswered.length > 0) throw new Error(unanswered.join('\n'));
  });
  return (options = {}) => {
    const overseer = createRecordedOverseerFetch(recordedOverseerAnswersOfThisOs(), options);
    created.push(overseer);
    return overseer;
  };
}
