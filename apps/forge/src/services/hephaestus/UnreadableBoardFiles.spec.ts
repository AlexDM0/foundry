/**
 * The board-wide unreadable files Hephaestus keeps for the header. What matters: each file is kept and logged once, a second report of it
 * keeps the first reason, and a caller cannot change what is kept through the list it reads.
 */
import { expect, test } from 'bun:test';

import { createUnreadableBoardFiles } from './UnreadableBoardFiles.ts';

test('a reported file is kept and logged once, with its first reason', () => {
  const logged: string[] = [];
  const unreadableFiles = createUnreadableBoardFiles((line) => logged.push(line));
  unreadableFiles.report({ file: 'crash-logs/crash-2.json', reason: 'it is not a JSON object' });
  unreadableFiles.report({ file: 'crash-logs/crash-2.json', reason: 'its crashLogVersion is not 2' });
  unreadableFiles.report({ file: 'talos/launches-4.ndjson', reason: 'line 1: its version is not 1' });
  expect(unreadableFiles.files()).toEqual([
    { file: 'crash-logs/crash-2.json', reason: 'it is not a JSON object' },
    { file: 'talos/launches-4.ndjson', reason: 'line 1: its version is not 1' },
  ]);
  expect(logged).toEqual([
    'Hephaestus cannot read the board file crash-logs/crash-2.json (it is not a JSON object); the board header warns until Hephaestus restarts.',
    'Hephaestus cannot read the board file talos/launches-4.ndjson (line 1: its version is not 1); the board header warns until Hephaestus restarts.',
  ]);
});

test('a fresh list holds nothing, and the list a caller reads is its own copy', () => {
  const unreadableFiles = createUnreadableBoardFiles(() => undefined);
  expect(unreadableFiles.files()).toEqual([]);
  unreadableFiles.report({ file: 'crash-logs/crash-1.json', reason: 'example reason' });
  (unreadableFiles.files() as { file: string; reason: string }[]).pop();
  expect(unreadableFiles.files()).toHaveLength(1);
});
