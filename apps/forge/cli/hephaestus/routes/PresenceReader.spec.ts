/**
 * The crash log route's refusal. What matters: a board with no crash log, or none of the number asked for, answers 404 with the refusal
 * served as every other refusal is, its code, its fields and the sentence the command line prints, so a client shows the terminal's words.
 * The presence document lists only the crash logs that can be read, and each one that cannot, also an older one, is a header warning.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { RefusalDocumentUtil }                            from '../../../src/adapters/utils/RefusalDocumentUtil.ts';
import { hephaestusFilesIn }                              from '../../../src/services/hephaestus/HephaestusFiles.ts';
import { createUnreadableBoardFiles }                     from '../../../src/services/hephaestus/UnreadableBoardFiles.ts';
import { OperationRefusal }                               from '../../../src/shared/OperationRefusal.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../../src/testing/ScratchWorkspace.ts';
import { PresenceReader }                                 from './PresenceReader.ts';

let trackerDirectory = '';

beforeEach(() => {
  trackerDirectory = createScratchDirectory('presence-reader');
});

afterEach(() => {
  removeScratchDirectory(trackerDirectory);
});

function sentenceOf(crashLogNumber: number | null): string {
  return RefusalDocumentUtil.refusalDocumentOf(new OperationRefusal('refused', { kind: 'no-crash-log', number: crashLogNumber })).sentence;
}

describe('the crash log route', () => {
  test('a board with no crash log answers 404 no-crash-log with its fields and the command line\'s sentence', () => {
    expect(PresenceReader.crashLogAnswerOf(hephaestusFilesIn(trackerDirectory), null)).toEqual({
      status: 404,
      body:   { refusal: 'no-crash-log', fields: { number: null }, text: sentenceOf(null) },
    });
  });

  test('a number with no crash log answers 404 no-crash-log naming the number', () => {
    expect(PresenceReader.crashLogAnswerOf(hephaestusFilesIn(trackerDirectory), '3')).toEqual({
      status: 404,
      body:   { refusal: 'no-crash-log', fields: { number: 3 }, text: sentenceOf(3) },
    });
  });
});

describe('the crash logs of the presence document', () => {
  test('an unreadable crash log, also one that is not the newest, is left out and reported as the board header\'s warning', () => {
    const files = hephaestusFilesIn(trackerDirectory);
    mkdirSync(files.crashLogDirectory, { recursive: true });
    writeFileSync(join(files.crashLogDirectory, 'crash-3.json'), '{ not a crash log');
    writeFileSync(join(files.crashLogDirectory, 'crash-4.json'), JSON.stringify({ crashLogVersion: 0 }));
    const loggedLines: string[] = [];
    const unreadableBoardFiles = createUnreadableBoardFiles((line) => loggedLines.push(line));
    expect(PresenceReader.readableCrashLogsOf(files, unreadableBoardFiles)).toEqual([]);
    expect(unreadableBoardFiles.files().map(({ file }) => file)).toEqual(['hephaestus/crash-logs/crash-3.json', 'hephaestus/crash-logs/crash-4.json']);
    PresenceReader.readableCrashLogsOf(files, unreadableBoardFiles);
    expect(loggedLines).toHaveLength(2);
  });
});
