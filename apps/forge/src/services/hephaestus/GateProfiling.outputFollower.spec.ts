/**
 * Following a gate profile's output file, `<data>/gate-profile-runs/<P>.ndjson`, as the profile stream route reads it. Only the first
 * unreadable line after the cursor is logged, since every stream request follows the file again.
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

import { GATE_PROFILE_OUTPUT_FORMAT_VERSION }             from '../../adapters/gate-profile-output/GateProfileOutputIngestion.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { GATE_PROFILE_RUNS_FOLDER, GateProfiling }        from './GateProfiling.ts';

const PROFILE_RUN_ID = 'P3';

let trackerDirectory = '';

let loggedLines: string[] = [];

function followerAfter(afterLineNumber: number): ReturnType<typeof GateProfiling.outputFollowerOf> {
  return GateProfiling.outputFollowerOf(trackerDirectory, PROFILE_RUN_ID, afterLineNumber, (line) => loggedLines.push(line));
}

beforeEach(() => {
  trackerDirectory = createScratchDirectory('gate-profile-output');
  loggedLines = [];
});

afterEach(() => {
  removeScratchDirectory(trackerDirectory);
});

function appendToOutput(text: string | Uint8Array): void {
  mkdirSync(join(trackerDirectory, GATE_PROFILE_RUNS_FOLDER), { recursive: true });
  appendFileSync(join(trackerDirectory, GATE_PROFILE_RUNS_FOLDER, `${PROFILE_RUN_ID}.ndjson`), text);
}

function outputLineOf(text: string): string {
  return `${JSON.stringify({ version: GATE_PROFILE_OUTPUT_FORMAT_VERSION, text })}\n`;
}

describe('the gate profile output follower', () => {
  test('a run with no output file yet gives nothing, then its lines once the file appears', () => {
    const follow = followerAfter(0);
    expect(follow()).toEqual([]);
    appendToOutput(outputLineOf('first'));
    expect(follow()).toEqual([{ lineNumber: 1, text: 'first' }]);
  });

  test('gives only the lines after the cursor, then only the lines appended since the last call', () => {
    appendToOutput(outputLineOf('first') + outputLineOf('second') + outputLineOf('third'));
    const follow = followerAfter(2);
    expect(follow()).toEqual([{ lineNumber: 3, text: 'third' }]);
    expect(follow()).toEqual([]);
    appendToOutput(outputLineOf('fourth'));
    expect(follow()).toEqual([{ lineNumber: 4, text: 'fourth' }]);
  });

  test('an unterminated last line waits for its line feed, also when it ends inside a character', () => {
    const bytes = new TextEncoder().encode(outputLineOf('naïve'));
    const splitInsideTheCharacter = bytes.indexOf(0xc3) + 1;
    appendToOutput(bytes.subarray(0, splitInsideTheCharacter));
    const follow = followerAfter(0);
    expect(follow()).toEqual([]);
    appendToOutput(bytes.subarray(splitInsideTheCharacter));
    expect(follow()).toEqual([{ lineNumber: 1, text: 'naïve' }]);
  });

  test('a line that cannot be read keeps its number and is not sent, and only the first is logged, once per follower', () => {
    const unreadableLines = ['not json', JSON.stringify({ version: GATE_PROFILE_OUTPUT_FORMAT_VERSION, other: 1 }), JSON.stringify({ text: 'no version' })];
    appendToOutput(`${unreadableLines.join('\n')}\n${outputLineOf('fourth')}`);
    const follow = followerAfter(0);
    expect(follow()).toEqual([{ lineNumber: 4, text: 'fourth' }]);
    appendToOutput('not json either\n');
    expect(follow()).toEqual([]);
    expect(loggedLines.map((line) => line.split(' of the gate profile output')[0])).toEqual(['Line 1']);
  });

  test('a follower after the cursor logs none of the unreadable lines before it, as a reconnecting stream does', () => {
    appendToOutput(`not json\n${outputLineOf('second')}`);
    expect(followerAfter(1)()).toEqual([{ lineNumber: 2, text: 'second' }]);
    expect(loggedLines).toEqual([]);
  });
});
