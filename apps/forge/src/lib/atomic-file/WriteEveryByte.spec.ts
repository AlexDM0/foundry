/**
 * A `write` may store fewer bytes than it was given with no error, as when the disk fills partway. What matters: such a short count is
 * written on from where it stopped until every byte is stored, and a write that stores nothing throws rather than loop or pass as whole.
 * The short counts come from a spy on `writeSync`, since no spec can fill a real disk.
 */
import * as fileSystem from 'node:fs';
import { join }        from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  spyOn,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { writeEveryByte }                                 from './WriteEveryByte.ts';

const BYTES_STORED_PER_SHORT_WRITE = 3;

const realWriteSync = fileSystem.writeSync;

let scratchFolder = '';

beforeEach(() => {
  scratchFolder = createScratchDirectory('write-every-byte');
});

afterEach(() => {
  removeScratchDirectory(scratchFolder);
});

function writtenThroughShortWrites(contents: string | Uint8Array): Buffer {
  const filePath = join(scratchFolder, 'written.txt');
  const fileDescriptor = fileSystem.openSync(filePath, 'w');
  const shortWrites = spyOn(fileSystem, 'writeSync').mockImplementation(((descriptor: number, buffer: Uint8Array, offset: number, length: number) => (
    realWriteSync(descriptor, buffer, offset, Math.min(length, BYTES_STORED_PER_SHORT_WRITE))
  )) as typeof fileSystem.writeSync);
  try {
    writeEveryByte(fileDescriptor, contents);
  } finally {
    shortWrites.mockRestore();
    fileSystem.closeSync(fileDescriptor);
  }
  return fileSystem.readFileSync(filePath);
}

test('a write cut short is written on from where it stopped, text and bytes alike, until every byte is stored', () => {
  expect(writtenThroughShortWrites('{"version":1,"project":"Example Agency"}').toString('utf8')).toBe('{"version":1,"project":"Example Agency"}');
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x0a]);
  expect([...writtenThroughShortWrites(bytes)]).toEqual([...bytes]);
});

test('a write that stores no byte throws, so the cut-short file is never taken as whole', () => {
  const fileDescriptor = fileSystem.openSync(join(scratchFolder, 'written.txt'), 'w');
  const storesNothing = spyOn(fileSystem, 'writeSync').mockImplementation((() => 0) as typeof fileSystem.writeSync);
  try {
    expect(() => writeEveryByte(fileDescriptor, 'never stored')).toThrow('EIO');
  } finally {
    storesNothing.mockRestore();
    fileSystem.closeSync(fileDescriptor);
  }
});

test('empty contents make no write at all', () => {
  const fileDescriptor = fileSystem.openSync(join(scratchFolder, 'written.txt'), 'w');
  const writes = spyOn(fileSystem, 'writeSync');
  try {
    writeEveryByte(fileDescriptor, '');
    expect(writes).toHaveBeenCalledTimes(0);
  } finally {
    writes.mockRestore();
    fileSystem.closeSync(fileDescriptor);
  }
});
