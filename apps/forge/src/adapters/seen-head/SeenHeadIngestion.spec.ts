/**
 * A document agent's seen head both ways. What matters: what the writer stores reads back as the same hash, `null` included, which a
 * document with no head stores; no file is absent; and the file of before the version, another version and a hash that is no text are
 * unreadable, never a throw.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { SeenHeadProblem }                           from './@types/SeenHeadProblem.ts';
import { SeenHeadIngestion }                              from './SeenHeadIngestion.ts';
import { createSeenHeadWriter }                           from './SeenHeadWriter.ts';

let scratchDirectory = '';

const seenHeadFilePath = (): string => join(scratchDirectory, 'document-agent-seen-head.json');

const reading = (): ReturnType<SeenHeadIngestion['read']> => new SeenHeadIngestion(seenHeadFilePath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('seen-head-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each(['a'.repeat(64), null])('a content hash of %p the writer stores reads back the same, under version 1', (contentHash) => {
  createSeenHeadWriter(seenHeadFilePath()).write(contentHash);

  expect(reading()).toEqual({ verdict: 'readable', contentHash });
  expect(JSON.parse(readFileSync(seenHeadFilePath(), 'utf8'))).toEqual({ version: 1, contentHash });
});

test.each<[string, string, SeenHeadProblem]>([
  ['not JSON', '{', { code: 'not-json', parserError: expect.any(String) }],
  ['the file of before the version', '{"contentHash":null}', { code: 'version-differs', field: 'version', expectedVersion: 1 }],
  ['another version', '{"version":2,"contentHash":null}', { code: 'version-differs', field: 'version', expectedVersion: 1 }],
  ['no content hash', '{"version":1}', { code: 'not-text-or-null', field: 'contentHash' }],
  ['a content hash that is no text', '{"version":1,"contentHash":5}', { code: 'not-text-or-null', field: 'contentHash' }],
])('%s is unreadable, never a throw', (_case, storedText, problem) => {
  writeFileSync(seenHeadFilePath(), storedText);

  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});
