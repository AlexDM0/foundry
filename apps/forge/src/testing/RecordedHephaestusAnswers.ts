/**
 * Reads this OS's recording of the Hephaestus HTTP API for `src/testing/RecordedHephaestusFetch.ts`, which stays DOM-safe, and gives a spec
 * file a mock whose unanswered requests fail the case.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach } from 'bun:test';

import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';
import {
  createRecordedHephaestusFetch,
  HEPHAESTUS_BOUNDARY,
  type HephaestusCallShape,
  type RecordedHephaestus,
  type RecordedHephaestusOptions
} from './RecordedHephaestusFetch.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

let recordedAnswers: ReadonlyMap<string, unknown> | null = null;

export function recordedHephaestusAnswersOfThisOs(): ReadonlyMap<string, unknown> {
  if (recordedAnswers !== null) return recordedAnswers;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(HEPHAESTUS_BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) {
    throw new Error(`no Hephaestus HTTP answers are recorded for ${process.platform}: run \`${recordCommandOf(HEPHAESTUS_BOUNDARY)}\`.`);
  }
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  recordedAnswers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer]));
  return recordedAnswers;
}

/** The recorded answer to one call shape on this OS; `undefined` when nobody recorded it. */
export function recordedHephaestusAnswerOf(callShape: HephaestusCallShape): unknown {
  return recordedHephaestusAnswersOfThisOs().get(callShape);
}

/** Call at a spec file's top level; `createHephaestus` gives each case a fresh mock, and a request it could not answer fails the case. */
export function useRecordedHephaestusFetch(): (options?: RecordedHephaestusOptions) => RecordedHephaestus {
  const created: RecordedHephaestus[] = [];
  afterEach(() => {
    // The client under test may catch the error of an unanswered request, so the case fails here too.
    const unanswered = created.splice(0).flatMap((hephaestus) => hephaestus.takeUnansweredCalls());
    if (unanswered.length > 0) throw new Error(unanswered.join('\n'));
  });
  return (options = {}) => {
    const hephaestus = createRecordedHephaestusFetch(recordedHephaestusAnswersOfThisOs(), options);
    created.push(hephaestus);
    return hephaestus;
  };
}
