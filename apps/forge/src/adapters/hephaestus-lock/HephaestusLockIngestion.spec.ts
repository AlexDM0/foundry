/**
 * The Hephaestus lock's stored format both ways. What matters: the writer's record reads back as the same record and is created only once;
 * a missing file is absent; any other file is unreadable, never thrown, and names the process its JSON still names, since an unreadable lock
 * whose process lives must not be taken over.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
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
  expect(writer.createWhole({ ...RECORD, port: 1 })).toBe('already-exists');
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
});

test.each([
  ['not JSON', '{ not a lock'],
  ['not an object', '[]'],
  ['no version', JSON.stringify(RECORD)],
  ['another version', JSON.stringify({ ...RECORD, version: HEPHAESTUS_LOCK_FORMAT_VERSION + 1 })],
])('%s is unreadable', (_case, text) => {
  writeFileSync(lockFilePath(), text);
  expect(reading().verdict).toBe('unreadable');
});

test.each(Object.keys(RECORD))('a wrong "%s" is unreadable', (field) => {
  storeDocument({ ...RECORD, version: HEPHAESTUS_LOCK_FORMAT_VERSION, [field]: null });
  expect(reading()).toMatchObject({ verdict: 'unreadable', reason: expect.stringContaining(`"${field}"`) as unknown as string });
});

test('an unreadable lock whose JSON still names a process carries that holder, and only that', () => {
  storeDocument(RECORD);
  expect(reading()).toEqual({
    verdict:     'unreadable',
    reason:      `its version is not ${HEPHAESTUS_LOCK_FORMAT_VERSION}`,
    namedHolder: {
      processId: RECORD.processId, processStartStamp: RECORD.processStartStamp, bootIdentity: RECORD.bootIdentity, url: RECORD.url, tokenFile: RECORD.tokenFile
    },
  });
});

test.each([
  ['not JSON', '{ not a lock'],
  ['no process id', JSON.stringify({ ...RECORD, processId: null })],
  ['no url', JSON.stringify({ ...RECORD, url: 7 })],
])('an unreadable lock with %s names no holder', (_case, text) => {
  writeFileSync(lockFilePath(), text);
  expect(reading()).toMatchObject({ verdict: 'unreadable', namedHolder: null });
});

test('a holder without a token file is named with none, so a stop goes to its process', () => {
  storeDocument({ ...RECORD, tokenFile: undefined });
  expect(reading()).toMatchObject({ verdict: 'unreadable', namedHolder: { processId: RECORD.processId, tokenFile: null } });
});
