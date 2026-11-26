/**
 * A lock generation record's stored format both ways. What matters: what the writer creates reads back as the same record and is created
 * only once; a missing record is absent, which a lock reads as removed by another holder; and any other record is unreadable, never
 * thrown, the record from before process identity and before the version among them, since a lock refuses rather than judge it.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                                     from '../../testing/ScratchWorkspace.ts';
import { GENERATION_RECORD_FORMAT_VERSION, GenerationRecordIngestion, type GenerationRecord } from './GenerationRecordIngestion.ts';
import { createGenerationRecordWriter }                                                       from './GenerationRecordWriter.ts';

const RECORD: GenerationRecord = { holder: { processId: 4242, startStamp: '1763370000', bootIdentity: null }, acquiredAt: '2026-09-24T15:00:00+02:00', state: 'held' };

const DOCUMENT = { version: GENERATION_RECORD_FORMAT_VERSION, ...RECORD };

let scratchDirectory = '';

const generationFilePath = (): string => join(scratchDirectory, 'generation-1');

const reading = (): ReturnType<GenerationRecordIngestion['read']> => new GenerationRecordIngestion(generationFilePath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('generation-record-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer creates reads back as the same record, and a second create finds it already there', () => {
  const writer = createGenerationRecordWriter(generationFilePath());
  expect(writer.create(RECORD)).toBe('created');
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
  expect(writer.create({ ...RECORD, state: 'released' })).toBe('already-exists');
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
});

test.each([
  ['not JSON', '{"state": "held", "hol'],
  ['not an object', '[]'],
  ['no version', JSON.stringify(RECORD)],
  ['another version', JSON.stringify({ ...DOCUMENT, version: GENERATION_RECORD_FORMAT_VERSION + 1 })],
  ['a holder named by process id alone', JSON.stringify({
    version: GENERATION_RECORD_FORMAT_VERSION, processId: 4242, acquiredAt: RECORD.acquiredAt, state: 'held'
  })],
  ['a wrong holder', JSON.stringify({ ...DOCUMENT, holder: { processId: '4242', startStamp: null, bootIdentity: null } })],
  ['a wrong acquiredAt', JSON.stringify({ ...DOCUMENT, acquiredAt: 1 })],
  ['an unknown state', JSON.stringify({ ...DOCUMENT, state: 'leased' })],
])('%s is unreadable', (_case, text) => {
  writeFileSync(generationFilePath(), text);
  expect(reading().verdict).toBe('unreadable');
});
