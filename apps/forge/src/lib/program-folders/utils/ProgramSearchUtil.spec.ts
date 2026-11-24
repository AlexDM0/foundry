/**
 * The two search orders built from the port's answers. What matters: a tool is looked for in the install folders, then node's, then the
 * system's; a vendor's program in the vendor's own folders first, never in a system base folder; each folder once, each path joined by the
 * platform's own rules and kept as found.
 */
import { posix, win32 } from 'node:path';

import { expect, test } from 'bun:test';

import type { ProgramFolders } from '../ProgramFolders.ts';
import { ProgramSearchUtil }   from './ProgramSearchUtil.ts';

const POSIX_FOLDERS: ProgramFolders = {
  pathModule:           posix,
  installFoldersOf:     (homeDirectory) => [posix.join(homeDirectory, '.bun', 'bin'), '/opt/example/bin', posix.join(homeDirectory, '.example', 'local')],
  nodeVersionFoldersOf: (homeDirectory) => [posix.join(homeDirectory, '.nvm', 'versions', 'node', 'v22.0.0', 'bin')],
  baseFolders:          () => ['/usr/bin', '/bin'],
};

test('a tool is looked for in the install folders, then node\'s, then the base folders', () => {
  expect(ProgramSearchUtil.toolFoldersOf(POSIX_FOLDERS, '/home/example')).toEqual([
    '/home/example/.bun/bin', '/opt/example/bin', '/home/example/.example/local', '/home/example/.nvm/versions/node/v22.0.0/bin', '/usr/bin', '/bin',
  ]);
});

test('a vendor\'s program lies first in its own folders, then in the install folders and node\'s, a folder named twice listed once', () => {
  const places = ProgramSearchUtil.programPlacesOf(POSIX_FOLDERS, '/home/example', { programFileName: 'agent', vendorProgramFolders: [['.example', 'local']] });
  expect(places).toEqual([
    '/home/example/.example/local/agent',
    '/home/example/.bun/bin/agent',
    '/opt/example/bin/agent',
    '/home/example/.nvm/versions/node/v22.0.0/bin/agent',
  ]);
});

test('a Windows place is joined with backslashes', () => {
  const windowsFolders: ProgramFolders = {
    pathModule: win32, installFoldersOf: () => ['C:\\Example\\bin'], nodeVersionFoldersOf: () => [], baseFolders: () => ['C:\\Windows'],
  };
  expect(ProgramSearchUtil.programPlacesOf(windowsFolders, 'C:\\Users\\example', { programFileName: 'agent.exe', vendorProgramFolders: [['.example']] }))
    .toEqual(['C:\\Users\\example\\.example\\agent.exe', 'C:\\Example\\bin\\agent.exe']);
});
