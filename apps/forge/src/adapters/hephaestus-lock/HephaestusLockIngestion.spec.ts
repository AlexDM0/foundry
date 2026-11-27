/**
 * The Hephaestus lock's stored format both ways. What matters: the writer's record reads back as the same record, with the current version,
 * and is created only once; a missing file is absent; a record of today's fields without that version, as older code wrote, reads as the
 * same record, so a live Hephaestus of older code is never taken over; any other file is unreadable, never thrown.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                                         from '../../testing/ScratchWorkspace.ts';
import { HEPHAESTUS_LOCK_FORMAT_VERSION, HephaestusLockIngestion, type HephaestusLockFileRecord } from './HephaestusLockIngestion.ts';
import { createHephaestusLockWriter }                                                             from './HephaestusLockWriter.ts';

const RECORD: HephaestusLockFileRecord = {
  processId:            4242,
  processStartStamp:    '1763370000',
  bootIdentity:         'example-boot',
  port:                 4930,
  url:                  'http://127.0.0.1:4930/',
  tokenFile:            '/example/token',
  codeVersion:          'code-example',
  installVersion:       17,
  talosProtocolVersion: 1,
};

let scratchDirectory = '';

const lockFilePath = (): string => join(scratchDirectory, 'lock-1.json');

const reading = (): ReturnType<HephaestusLockIngestion['read']> => new HephaestusLockIngestion(lockFilePath()).read();

function storeDocument(document: unknown): void {
  writeFileSync(lockFilePath(), JSON.stringify(document));
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('hephaestus-lock-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer creates reads back as the same record, and a second create finds it already there', () => {
  const writer = createHephaestusLockWriter(lockFilePath());
  expect(writer.createWhole(RECORD)).toBe('created');
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
  expect(JSON.parse(readFileSync(lockFilePath(), 'utf8'))).toMatchObject({ version: HEPHAESTUS_LOCK_FORMAT_VERSION });
  expect(writer.createWhole({ ...RECORD, port: 1 })).toBe('already-exists');
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
});

test.each([
  ['no version', RECORD],
  ['another version', { ...RECORD, version: HEPHAESTUS_LOCK_FORMAT_VERSION + 1 }],
])('a record of today\'s fields with %s reads as the same record', (_case, document) => {
  storeDocument(document);
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
});

test.each([
  ['not JSON', '{ not a lock'],
  ['not an object', '[]'],
])('%s is unreadable', (_case, text) => {
  writeFileSync(lockFilePath(), text);
  expect(reading().verdict).toBe('unreadable');
});

test.each(Object.keys(RECORD))('a wrong "%s" is unreadable', (field) => {
  storeDocument({ ...RECORD, version: HEPHAESTUS_LOCK_FORMAT_VERSION, [field]: null });
  expect(reading()).toMatchObject({ verdict: 'unreadable', problem: { field } });
});
