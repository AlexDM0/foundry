/**
 * The boundary's own spec, on the real file system in the scratch root: a reader holding the old file open keeps reading whole old bytes
 * while a write lands, a mode is exact, a failed write leaves nothing beside the target, and a read answers with a verdict, never a throw.
 */
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';
import { AtomicFile }                                from './AtomicFile.ts';

const PERMISSION_BITS = 0o777;

let folder = '';

beforeEach(() => {
  folder = createScratchDirectory('atomic-file');
});

afterEach(() => {
  removeScratchPath(folder);
});

function bytesReadThrough(fileDescriptor: number, length: number): string {
  const buffer    = Buffer.alloc(length);
  const bytesRead = readSync(fileDescriptor, buffer, 0, length, null);
  return buffer.subarray(0, bytesRead).toString('utf8');
}

describe('an atomic write', () => {
  test('leaves a reader that holds the old file open reading whole old bytes', async () => {
    const target   = join(folder, 'settings.json');
    const oldBytes = `{"version":1,"old":"${'o'.repeat(4096)}"}`;
    writeFileSync(target, oldBytes);
    const heldOpen = openSync(target, 'r');
    try {
      const firstHalf = bytesReadThrough(heldOpen, oldBytes.length / 2);
      expect(await AtomicFile.write(target, '{"version":1}')).toEqual({ verdict: 'written' });
      const rest = bytesReadThrough(heldOpen, oldBytes.length);
      expect(firstHalf + rest).toBe(oldBytes);
    } finally {
      closeSync(heldOpen);
    }
    expect(readFileSync(target, 'utf8')).toBe('{"version":1}');
  });

  test('leaves a reader that holds the old file open reading only the old bytes when the new file is longer', async () => {
    const target   = join(folder, 'settings.json');
    const oldBytes = '{"version":1}';
    writeFileSync(target, oldBytes);
    const heldOpen = openSync(target, 'r');
    try {
      expect(await AtomicFile.write(target, `{"version":1,"new":"${'n'.repeat(4096)}"}`)).toEqual({ verdict: 'written' });
      expect(bytesReadThrough(heldOpen, 8192)).toBe(oldBytes);
    } finally {
      closeSync(heldOpen);
    }
  });

  test('writes a 0600 file as 0600', async () => {
    const target = join(folder, 'token');
    expect(await AtomicFile.write(target, 'secret', { mode: 0o600 })).toEqual({ verdict: 'written' });
    expect(statSync(target).mode & PERMISSION_BITS).toBe(0o600);
  });

  test('writes a 0600 file as 0600 over an existing 0644 file', async () => {
    const target = join(folder, 'token');
    writeFileSync(target, 'old secret', { mode: 0o644 });
    expect(await AtomicFile.write(target, 'new secret', { mode: 0o600 })).toEqual({ verdict: 'written' });
    expect(statSync(target).mode & PERMISSION_BITS).toBe(0o600);
    expect(readFileSync(target, 'utf8')).toBe('new secret');
  });

  test('writes a mode the umask would narrow exactly as asked', async () => {
    const target = join(folder, 'shared.json');
    expect(await AtomicFile.write(target, '{}', { mode: 0o666 })).toEqual({ verdict: 'written' });
    expect(statSync(target).mode & PERMISSION_BITS).toBe(0o666);
  });

  test('writes bytes as given', async () => {
    const target = join(folder, 'bytes');
    expect(await AtomicFile.write(target, new Uint8Array([0, 255, 10]))).toEqual({ verdict: 'written' });
    expect([...readFileSync(target)]).toEqual([0, 255, 10]);
  });

  test('leaves no temporary file beside the target after a write', async () => {
    const target = join(folder, 'settings.json');
    await AtomicFile.write(target, 'first');
    await AtomicFile.write(target, 'second');
    expect(readdirSync(folder)).toEqual(['settings.json']);
  });

  test('lands one whole write of several at once and leaves no temporary file', async () => {
    const target   = join(folder, 'settings.json');
    const contents = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(4096));
    const verdicts = await Promise.all(contents.map((content) => AtomicFile.write(target, content)));
    expect(verdicts.every((verdict) => verdict.verdict === 'written')).toBe(true);
    expect(contents).toContain(readFileSync(target, 'utf8'));
    expect(readdirSync(folder)).toEqual(['settings.json']);
  });

  test('answers unwritable when the target folder is missing and leaves nothing behind', async () => {
    expect(await AtomicFile.write(join(folder, 'missing', 'settings.json'), '{}')).toEqual({ verdict: 'unwritable', failure: 'ENOENT' });
    expect(readdirSync(folder)).toEqual([]);
  });

  test('answers unwritable when the target is a folder, keeps the folder and removes its temporary file', async () => {
    const target = join(folder, 'settings.json');
    mkdirSync(join(target, 'inside'), { recursive: true });
    const verdict = await AtomicFile.write(target, '{}');
    expect(verdict.verdict).toBe('unwritable');
    expect(readdirSync(folder)).toEqual(['settings.json']);
    expect(readdirSync(target)).toEqual(['inside']);
  });
});

describe('a read', () => {
  test('answers readable with the contents', async () => {
    const target = join(folder, 'settings.json');
    writeFileSync(target, '{"version":1}');
    expect(await AtomicFile.read(target)).toEqual({ verdict: 'readable', contents: '{"version":1}' });
  });

  test('answers absent for a missing file', async () => {
    expect(await AtomicFile.read(join(folder, 'settings.json'))).toEqual({ verdict: 'absent' });
  });

  test('answers unreadable for a folder', async () => {
    const target = join(folder, 'settings.json');
    mkdirSync(target);
    expect(await AtomicFile.read(target)).toEqual({ verdict: 'unreadable', failure: 'EISDIR' });
  });

  test('answers unreadable when a folder on the path is a file', async () => {
    const parent = join(folder, 'parent');
    writeFileSync(parent, '');
    expect(await AtomicFile.read(join(parent, 'settings.json'))).toEqual({ verdict: 'unreadable', failure: 'ENOTDIR' });
  });
});
