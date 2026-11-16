/**
 * Which origins may frame the Bridge. What matters: each frame-ancestor record of the known major adds its `origin`, whatever its minor and
 * the host's own keys; a record of another major, an unreadable one, one that is no `.json` file, or one whose origin is no URL or opaque
 * adds nothing, so with none the Bridge stays unframeable; and an origin two records name is listed once.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../../src/testing/ScratchWorkspace.ts';
import { FrameOrigins }                                   from './FrameOrigins.ts';

const FIRST_HOST_ORIGIN = 'http://127.0.0.1:5180';
const SECOND_HOST_ORIGIN = 'http://127.0.0.1:4800';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function monitorFolderWith(recordsByFileName: Readonly<Record<string, string>>): string {
  const monitorFolder = join(createScratchDirectory('frame-origins'), '.example-monitor');
  scratchDirectories.push(join(monitorFolder, '..'));
  const frameAncestorsFolder = join(monitorFolder, 'frame-ancestors');
  mkdirSync(frameAncestorsFolder, { recursive: true });
  for (const [fileName, recordText] of Object.entries(recordsByFileName)) writeFileSync(join(frameAncestorsFolder, fileName), recordText);
  return monitorFolder;
}

function frameAncestorRecord(fields: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1, minor: 0, origin: FIRST_HOST_ORIGIN, ...fields
  });
}

describe('FrameOrigins.frameOriginsOf', () => {
  test('with no frame-ancestors folder, or an empty one, no origin may frame the Bridge', () => {
    const scratchHome = createScratchDirectory('frame-origins');
    scratchDirectories.push(scratchHome);
    expect(FrameOrigins.frameOriginsOf(join(scratchHome, '.example-monitor'))).toEqual([]);
    expect(FrameOrigins.frameOriginsOf(monitorFolderWith({}))).toEqual([]);
  });

  test('a record of the known major adds its origin, normalised, at a newer minor and with keys of the host\'s own', () => {
    const monitorFolder = monitorFolderWith({ 'example-host.json': frameAncestorRecord({ origin: `${FIRST_HOST_ORIGIN}/`, minor: 3, exampleHostKey: 4242 }) });
    expect(FrameOrigins.frameOriginsOf(monitorFolder)).toEqual([FIRST_HOST_ORIGIN]);
  });

  test('a record of another major, an unreadable one, or one whose origin is no URL or opaque adds nothing', () => {
    const records = [
      frameAncestorRecord({ version: 2 }),
      frameAncestorRecord({ version: '1' }),
      '{"version": 1, "origin"',
      '[]',
      frameAncestorRecord({ origin: 'not a url' }),
      frameAncestorRecord({ origin: 'file:///example' }),
    ];
    for (const record of records) {
      expect(FrameOrigins.frameOriginsOf(monitorFolderWith({ 'example-host.json': record })), record).toEqual([]);
    }
  });

  test('a file that is no JSON record, and a folder, in the frame-ancestors folder add nothing', () => {
    const monitorFolder = monitorFolderWith({ 'example-host.json.temporary': frameAncestorRecord({}) });
    mkdirSync(join(monitorFolder, 'frame-ancestors', 'example-folder.json'));
    expect(FrameOrigins.frameOriginsOf(monitorFolder)).toEqual([]);
  });

  test('every host\'s origin is listed, each once', () => {
    const monitorFolder = monitorFolderWith({
      'first-host.json':  frameAncestorRecord({}),
      'second-host.json': frameAncestorRecord({ origin: SECOND_HOST_ORIGIN }),
      'third-host.json':  frameAncestorRecord({ origin: `${FIRST_HOST_ORIGIN}/example` }),
    });
    expect(FrameOrigins.frameOriginsOf(monitorFolder)).toEqual([FIRST_HOST_ORIGIN, SECOND_HOST_ORIGIN]);
  });
});
