/**
 * A Hatch request as Hephaestus reads it from a job's Hatch folder. What matters: what a session writes reads back as its command; a missing
 * request is absent; a request that is not UTF-8, not JSON, or names no format, is read as refused, since it is answered with that refusal;
 * and one naming another Hatch format waits for a Hephaestus that reads it. Nothing throws.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname }                  from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { ControlCommand }                            from '../../shared/@types/ControlCommand.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { hatchRequestFilePathOf, writeHatchRequest }      from './HatchFolder.ts';
import { HatchRequestIngestion }                          from './HatchRequestIngestion.ts';
import { HATCH_FORMAT_VERSION }                           from './constants/HatchFormatVersion.ts';
import { HatchFormatUtil }                                from './utils/HatchFormatUtil.ts';

const COMMAND: ControlCommand = { kind: 'concurrency-set', limit: 3 };

let hatchDirectory = '';

const reading = (): ReturnType<HatchRequestIngestion['read']> => new HatchRequestIngestion(hatchRequestFilePathOf(hatchDirectory, 'R1')).read();

function storeRequestFile(contents: string | Uint8Array): void {
  const requestFilePath = hatchRequestFilePathOf(hatchDirectory, 'R1');
  mkdirSync(dirname(requestFilePath), { recursive: true });
  writeFileSync(requestFilePath, contents);
}

beforeEach(() => {
  hatchDirectory = createScratchDirectory('hatch-request-ingestion');
});

afterEach(() => {
  removeScratchDirectory(hatchDirectory);
});

test('no request is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what a session writes reads back as its command', () => {
  writeHatchRequest(hatchDirectory, HatchFormatUtil.requestOf('R1', COMMAND));
  expect(reading()).toEqual({ verdict: 'readable', reading: { verdict: 'read', requestId: 'R1', command: COMMAND } });
});

test.each([
  ['not JSON', '{'],
  ['not an object', '[]'],
  ['of no format', JSON.stringify({ requestId: 'R1', command: COMMAND })],
])('a request that is %s is read as refused malformed-hatch-request, to be answered', (_case, text) => {
  storeRequestFile(text);
  expect(reading()).toEqual({ verdict: 'readable', reading: { verdict: 'refused', reason: 'malformed-hatch-request' } });
});

test('a request whose bytes are not UTF-8 never heals, so it is read as refused malformed-hatch-request, to be answered', () => {
  storeRequestFile(new Uint8Array([0x7b, 0xff, 0x7d]));
  expect(reading()).toEqual({ verdict: 'readable', reading: { verdict: 'refused', reason: 'malformed-hatch-request' } });
});

test('a request naming another Hatch format waits for a Hephaestus that reads it', () => {
  storeRequestFile(JSON.stringify({ hatchFormatVersion: HATCH_FORMAT_VERSION + 1, requestId: 'R1', command: COMMAND }));
  expect(reading()).toEqual({ verdict: 'another-version', hatchFormatVersion: HATCH_FORMAT_VERSION + 1 });
});
