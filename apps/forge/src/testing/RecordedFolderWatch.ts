/**
 * The folder watch of a default spec: a `PlatformWatch` answered from what the real watch did, which
 * `src/lib/quiet-watch/QuietWatch.integration.spec.ts` records under `bun run record src/lib/quiet-watch/QuietWatch.ts`. `QuietWatch`
 * swallows a throw of the platform watch, so a call with no recorded answer is also kept, and the case reads `unansweredCalls`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import type { PlatformWatch }               from '../lib/quiet-watch/QuietWatch.ts';
import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';
import { pathLiesInside }                   from './TrackerIsolation.ts';

const FOLDER_WATCH_BOUNDARY = 'src/lib/quiet-watch/QuietWatch.ts';
const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

/** The call shapes the boundary spec records, each named for the folder it watches and what happens in it. */
export const FOLDER_WATCH_CALL_SHAPES = {
  WATCH_OF_A_MISSING_FOLDER:            'watch <folder>, the folder missing',
  RECURSIVE_WRITE_IN_A_LATER_SUBFOLDER: 'watch <folder> recursive, a file written in a subfolder made after the start',
} as const;

/** `refused`: the platform throws at the start, and `QuietWatch` answers null. `event`: the watch calls its listener. */
export type RecordedFolderWatchAnswer = { kind: 'refused' } | { kind: 'event' };

let recordedAnswers: ReadonlyMap<string, RecordedFolderWatchAnswer> | null = null;

function recordedAnswersOfThisOs(): ReadonlyMap<string, RecordedFolderWatchAnswer> {
  if (recordedAnswers !== null) return recordedAnswers;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(FOLDER_WATCH_BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) {
    throw new Error(`no folder watch answers are recorded for ${process.platform}: run \`${recordCommandOf(FOLDER_WATCH_BOUNDARY)}\`.`);
  }
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  recordedAnswers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer as RecordedFolderWatchAnswer]));
  return recordedAnswers;
}

interface RecursiveWatch {
  readonly folderPath: string;
  readonly onEvent:    () => void;
  open:                boolean;
}

export interface RecordedFolderWatches {
  readonly platformWatch:                       PlatformWatch;
  /** A file written in a subfolder of a recursive watch made after the watch started, as a Hatch request is. */
  readonly writeFileInASubfolderMadeAfterStart: (subfolderPath: string) => void;
  /** Each call with no recorded answer, described. */
  readonly unansweredCalls:                     () => readonly string[];
}

export function recordedFolderWatches(): RecordedFolderWatches {
  const answers = recordedAnswersOfThisOs();
  const recursiveWatches: RecursiveWatch[] = [];
  const unanswered: string[] = [];
  const answerOf = (callShape: string, call: string): RecordedFolderWatchAnswer | null => {
    const answer = answers.get(callShape);
    if (answer === undefined) unanswered.push(`${call}: no answer is recorded for "${callShape}"`);
    return answer ?? null;
  };
  const platformWatch: PlatformWatch = (folderPath, options, onEvent) => {
    if (!existsSync(folderPath)) {
      const answer = answerOf(FOLDER_WATCH_CALL_SHAPES.WATCH_OF_A_MISSING_FOLDER, `watch ${folderPath}`);
      if (answer?.kind === 'refused') throw new Error(`ENOENT: no such file or directory, watch '${folderPath}'`);
    } else if (!options.recursive) {
      unanswered.push(`watch ${folderPath}: no answer is recorded for a watch that is not recursive`);
    }
    const watch: RecursiveWatch = { folderPath, onEvent, open: true };
    if (options.recursive) recursiveWatches.push(watch);
    const handle = {
      close: () => { watch.open = false; },
      on:    () => handle,
    };
    return handle;
  };
  return {
    platformWatch,
    writeFileInASubfolderMadeAfterStart: (subfolderPath) => {
      for (const watch of recursiveWatches.filter((candidate) => candidate.open && pathLiesInside(subfolderPath, candidate.folderPath))) {
        const answer = answerOf(FOLDER_WATCH_CALL_SHAPES.RECURSIVE_WRITE_IN_A_LATER_SUBFOLDER, `write in ${subfolderPath}`);
        if (answer?.kind === 'event') watch.onEvent();
      }
    },
    unansweredCalls: () => [...unanswered],
  };
}
