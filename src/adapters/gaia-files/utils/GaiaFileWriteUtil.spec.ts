/**
 * Writing and removing one JSON file in the scratch root: the folders are made, a folder mode reaches only folders the write made, the
 * text is the value's indented JSON with a closing newline, and removal answers a verdict for a present, an absent and a blocked file.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../../../testing/ScratchRoot.ts';
import { GaiaFileWriteUtil }                         from './GaiaFileWriteUtil.ts';

const PERMISSION_BITS = 0o777;
const OWNER_ONLY_FOLDER_MODE = 0o700;
const OPEN_FOLDER_MODE = 0o755;

let folder = '';

beforeEach(() => {
  folder = createScratchDirectory('gaia-file-write');
});

afterEach(() => {
  removeScratchPath(folder);
});

describe('writeJson', () => {
  test('makes the missing folders and writes indented JSON with a closing newline', async () => {
    const target = join(folder, 'outer', 'inner', 'example.json');
    expect(await GaiaFileWriteUtil.writeJson(target, { version: 1, name: 'Example Agency' })).toEqual({ verdict: 'written' });
    expect(readFileSync(target, 'utf8')).toBe('{\n  "version": 1,\n  "name": "Example Agency"\n}\n');
  });

  test('gives a folder it makes the folder mode', async () => {
    const target = join(folder, 'owner-only', 'example.json');
    await GaiaFileWriteUtil.writeJson(target, { version: 1 }, OWNER_ONLY_FOLDER_MODE);
    expect(statSync(join(folder, 'owner-only')).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FOLDER_MODE);
  });

  test('leaves an existing folder\'s mode as it is', async () => {
    const existingFolder = join(folder, 'existing');
    mkdirSync(existingFolder);
    chmodSync(existingFolder, OPEN_FOLDER_MODE);
    await GaiaFileWriteUtil.writeJson(join(existingFolder, 'example.json'), { version: 1 }, OWNER_ONLY_FOLDER_MODE);
    expect(statSync(existingFolder).mode & PERMISSION_BITS).toBe(OPEN_FOLDER_MODE);
  });
});

describe('remove', () => {
  test('removes a present file and answers removed', async () => {
    const target = join(folder, 'example.json');
    await GaiaFileWriteUtil.writeJson(target, { version: 1 });
    expect(await GaiaFileWriteUtil.remove(target)).toEqual({ verdict: 'removed' });
    expect(existsSync(target)).toBe(false);
  });

  test('answers absent for a file that is not there', async () => {
    expect(await GaiaFileWriteUtil.remove(join(folder, 'never-written.json'))).toEqual({ verdict: 'absent' });
  });

  test('answers unremovable with the system\'s reason for a folder in the file\'s place', async () => {
    const target = join(folder, 'a-folder.json');
    mkdirSync(target);
    expect(await GaiaFileWriteUtil.remove(target)).toMatchObject({ verdict: 'unremovable' });
    expect(existsSync(target)).toBe(true);
  });
});
