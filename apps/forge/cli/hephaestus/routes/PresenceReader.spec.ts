/**
 * The crash log route's refusal. What matters: a board with no crash log, or none of the number asked for, answers 404 with the refusal
 * served as every other refusal is, its code, its fields and the sentence the command line prints, so a client shows the terminal's words.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { RefusalDocumentUtil }                            from '../../../src/adapters/utils/RefusalDocumentUtil.ts';
import { hephaestusFilesIn }                              from '../../../src/services/hephaestus/HephaestusFiles.ts';
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
