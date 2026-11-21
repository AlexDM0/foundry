/**
 * The real folder watch, recorded for `src/testing/RecordedFolderWatch.ts`. What matters: a watch of a missing folder is refused and
 * `watchQuietly` answers null without a throw, and a recursive watch sees a file written in a subfolder made after it started, which is
 * how a Hatch request in a new job's folder wakes Hephaestus.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { expect, test } from 'bun:test';

import { recordAnswer }                                   from '../../testing/RecordedAnswers.ts';
import type { RecordedFolderWatchAnswer }                 from '../../testing/RecordedFolderWatch.ts';
import { FOLDER_WATCH_CALL_SHAPES }                       from '../../testing/RecordedFolderWatch.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { QuietWatch }                                     from './QuietWatch.ts';

/** A platform watch may start after the call returns, so the write repeats until the watch sees one. */
const WRITE_REPEAT_MILLISECONDS = 100;

test('a watch of a missing folder is refused, and watchQuietly answers null without a throw', () => {
  const scratchFolder = createScratchDirectory('quiet-watch-missing');
  try {
    const handle = QuietWatch.watchQuietly({ folderPath: join(scratchFolder, 'missing'), recursive: true, onEvent: () => undefined });
    const answer: RecordedFolderWatchAnswer | null = handle === null ? { kind: 'refused' } : null;
    handle?.close();
    expect(answer).toEqual({ kind: 'refused' });
    recordAnswer(FOLDER_WATCH_CALL_SHAPES.WATCH_OF_A_MISSING_FOLDER, answer);
  } finally {
    removeScratchDirectory(scratchFolder);
  }
});

test('a recursive watch sees a file written in a subfolder made after it started', async () => {
  const scratchFolder = createScratchDirectory('quiet-watch-recursive');
  let events = 0;
  const handle = QuietWatch.watchQuietly({ folderPath: scratchFolder, recursive: true, onEvent: () => { events += 1; } });
  try {
    expect(handle).not.toBeNull();
    const laterSubfolder = join(scratchFolder, 'J7', 'requests');
    mkdirSync(laterSubfolder, { recursive: true });
    let writes = 0;
    await waitUntil(() => {
      writes += 1;
      writeFileSync(join(laterSubfolder, `request-${writes}.json`), '{}\n');
      return events > 0;
    }, 'an event from the subfolder made after the start', WRITE_REPEAT_MILLISECONDS);
    const answer: RecordedFolderWatchAnswer = { kind: 'event' };
    recordAnswer(FOLDER_WATCH_CALL_SHAPES.RECURSIVE_WRITE_IN_A_LATER_SUBFOLDER, answer);
  } finally {
    handle?.close();
    removeScratchDirectory(scratchFolder);
  }
});
