/**
 * A lock generation record's stored format both ways. What matters: what the writer creates reads back as the same record, with the current
 * version, and is created only once; a missing record is absent, which a lock reads as removed by another holder; a record of today's
 * fields without that version, as older code wrote, reads as the same record, so its holder is judged; and any other record is
 * unreadable, never thrown, the record from before process identity among them, which a lock takes over.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
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
  expect(JSON.parse(readFileSync(generationFilePath(), 'utf8'))).toMatchObject({ version: GENERATION_RECORD_FORMAT_VERSION });
  expect(writer.create({ ...RECORD, state: 'released' })).toBe('already-exists');
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
});

test.each([
  ['no version', RECORD],
  ['another version', { ...DOCUMENT, version: GENERATION_RECORD_FORMAT_VERSION + 1 }],
])('a record of today\'s fields with %s reads as the same record', (_case, document) => {
  writeFileSync(generationFilePath(), JSON.stringify(document));
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
});

test.each([
  ['not JSON', '{"state": "held", "hol'],
  ['not an object', '[]'],
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
