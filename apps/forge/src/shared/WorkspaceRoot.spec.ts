/**
 * The program sits in `apps/forge` of a Bun workspace, and the files the whole repository shares (`.bun-version`, `bun.lock`,
 * `.gitattributes`, `.claude/rules/`) are found at its root. What matters: the walk stops at the nearest manifest that names `workspaces`,
 * passes over a manifest without them or one that is not JSON, and answers `undefined` rather than guess when no folder has one.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join }                                 from 'node:path';
import { afterEach, expect, test }              from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../testing/ScratchWorkspace.ts';
import { workspaceRootOf }                                from './WorkspaceRoot.ts';

const PROGRAM_FOLDER = join(import.meta.dir, '..', '..');

let scratchFolder = '';

afterEach(() => {
  if (scratchFolder !== '') {
    removeScratchDirectory(scratchFolder);
    scratchFolder = '';
  }
});

function plantedFolder(manifestsByFolder: Readonly<Record<string, string>>, startFolder: string): string {
  scratchFolder = createScratchDirectory('workspace-root');
  for (const [folder, manifestText] of Object.entries(manifestsByFolder)) {
    mkdirSync(join(scratchFolder, folder), { recursive: true });
    writeFileSync(join(scratchFolder, folder, 'package.json'), manifestText);
  }
  mkdirSync(join(scratchFolder, startFolder), { recursive: true });
  return join(scratchFolder, startFolder);
}

test('the program folder and a folder inside it find the workspace root that holds apps/forge', () => {
  const workspaceRoot = workspaceRootOf(PROGRAM_FOLDER);
  expect(workspaceRoot).toBe(join(PROGRAM_FOLDER, '..', '..'));
  expect(existsSync(join(workspaceRoot ?? '', 'apps', 'forge', 'package.json'))).toBe(true);
  expect(workspaceRootOf(join(PROGRAM_FOLDER, 'src', 'shared'))).toBe(workspaceRoot);
});

test('the walk passes over a manifest without workspaces and one that is not JSON', () => {
  const startFolder = plantedFolder({
    'example-root':                              '{ "name": "example-root", "workspaces": ["apps/*"] }',
    'example-root/apps/example-app':             '{ "name": "example-app" }',
    'example-root/apps/example-app/broken-part': '{ not json',
  }, 'example-root/apps/example-app/broken-part/source');
  expect(workspaceRootOf(startFolder)).toBe(join(scratchFolder, 'example-root'));
});

test('the nearest manifest naming workspaces wins over one further up', () => {
  const startFolder = plantedFolder({
    'outer':       '{ "workspaces": ["inner"] }',
    'outer/inner': '{ "workspaces": { "packages": ["packages/*"] } }',
  }, 'outer/inner/packages/example-package');
  expect(workspaceRootOf(startFolder)).toBe(join(scratchFolder, 'outer', 'inner'));
});

test('no manifest up to the file system root is no workspace root', () => {
  expect(workspaceRootOf('/')).toBeUndefined();
});
