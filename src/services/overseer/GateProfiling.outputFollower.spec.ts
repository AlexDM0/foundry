/**
 * Following a gate profile's output file, `<data>/gate-profile-runs/<P>.ndjson`, as the profile stream route reads it. What matters: the
 * lines come numbered from 1 in the order they were appended, only those after the cursor; a later call gives only the lines appended since;
 * an unterminated last line waits for its line feed, also when it ends inside a character; a line that is no `{"text": …}` keeps its
 * number and is not sent; and a run with no output yet gives nothing until its file appears.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join }                      from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { GATE_PROFILE_RUNS_FOLDER, GateProfiling }        from './GateProfiling.ts';

const PROFILE_RUN_ID = 'P3';

let trackerDirectory = '';

beforeEach(() => {
  trackerDirectory = createScratchDirectory('gate-profile-output');
});

afterEach(() => {
  removeScratchDirectory(trackerDirectory);
});

function appendToOutput(text: string | Uint8Array): void {
  mkdirSync(join(trackerDirectory, GATE_PROFILE_RUNS_FOLDER), { recursive: true });
  appendFileSync(join(trackerDirectory, GATE_PROFILE_RUNS_FOLDER, `${PROFILE_RUN_ID}.ndjson`), text);
}

function outputLineOf(text: string): string {
  return `${JSON.stringify({ text })}\n`;
}

describe('the gate profile output follower', () => {
  test('a run with no output file yet gives nothing, then its lines once the file appears', () => {
    const follow = GateProfiling.outputFollowerOf(trackerDirectory, PROFILE_RUN_ID, 0);
    expect(follow()).toEqual([]);
    appendToOutput(outputLineOf('first'));
    expect(follow()).toEqual([{ lineNumber: 1, text: 'first' }]);
  });

  test('gives only the lines after the cursor, then only the lines appended since the last call', () => {
    appendToOutput(outputLineOf('first') + outputLineOf('second') + outputLineOf('third'));
    const follow = GateProfiling.outputFollowerOf(trackerDirectory, PROFILE_RUN_ID, 2);
    expect(follow()).toEqual([{ lineNumber: 3, text: 'third' }]);
    expect(follow()).toEqual([]);
    appendToOutput(outputLineOf('fourth'));
    expect(follow()).toEqual([{ lineNumber: 4, text: 'fourth' }]);
  });

  test('an unterminated last line waits for its line feed, also when it ends inside a character', () => {
    const bytes = new TextEncoder().encode(outputLineOf('naïve'));
    const splitInsideTheCharacter = bytes.indexOf(0xc3) + 1;
    appendToOutput(bytes.subarray(0, splitInsideTheCharacter));
    const follow = GateProfiling.outputFollowerOf(trackerDirectory, PROFILE_RUN_ID, 0);
    expect(follow()).toEqual([]);
    appendToOutput(bytes.subarray(splitInsideTheCharacter));
    expect(follow()).toEqual([{ lineNumber: 1, text: 'naïve' }]);
  });

  test('a line that is no text record keeps its number and is not sent', () => {
    appendToOutput(`not json\n${JSON.stringify({ other: 1 })}\n${outputLineOf('third')}`);
    const follow = GateProfiling.outputFollowerOf(trackerDirectory, PROFILE_RUN_ID, 0);
    expect(follow()).toEqual([{ lineNumber: 3, text: 'third' }]);
  });
});
