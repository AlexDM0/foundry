/**
 * The board-wide unreadable files Hephaestus keeps for the header. What matters: each file is kept and logged once, a second report of it
 * keeps the first problem, the log line words it, and a caller cannot change what is kept through the list it reads.
 */
import { expect, test } from 'bun:test';

import { detailsLoggerOf }            from '../../testing/LoggedDetails.ts';
import { createUnreadableBoardFiles } from './UnreadableBoardFiles.ts';

const NOT_A_JSON_OBJECT = { code: 'not-a-json-object' } as const;

const LINE_KIND_MALFORMED = { code: 'registry-line-field-malformed', field: 'kind', lineNumber: 1 } as const;

test('a reported file is kept and logged once, with its first problem', () => {
  const logged: string[] = [];
  const unreadableFiles = createUnreadableBoardFiles(detailsLoggerOf(logged));
  unreadableFiles.report({ file: 'crash-logs/crash-2.json', problem: NOT_A_JSON_OBJECT });
  unreadableFiles.report({ file: 'crash-logs/crash-2.json', problem: { code: 'version-differs', field: 'crashLogVersion', expectedVersion: 2 } });
  unreadableFiles.report({ file: 'talos/launches-4.ndjson', problem: LINE_KIND_MALFORMED });
  expect(unreadableFiles.files()).toEqual([
    { file: 'crash-logs/crash-2.json', problem: NOT_A_JSON_OBJECT },
    { file: 'talos/launches-4.ndjson', problem: LINE_KIND_MALFORMED },
  ]);
  expect(logged).toEqual([
    'Hephaestus cannot read the board file crash-logs/crash-2.json (it is not a JSON object); the board header warns until Hephaestus restarts.',
    'Hephaestus cannot read the board file talos/launches-4.ndjson (line 1: kind is neither agent nor line); the board header warns until Hephaestus restarts.',
  ]);
});

test('a fresh list holds nothing, and the list a caller reads is its own copy', () => {
  const unreadableFiles = createUnreadableBoardFiles(() => undefined);
  expect(unreadableFiles.files()).toEqual([]);
  unreadableFiles.report({ file: 'crash-logs/crash-1.json', problem: NOT_A_JSON_OBJECT });
  (unreadableFiles.files() as unknown[]).pop();
  expect(unreadableFiles.files()).toHaveLength(1);
});
