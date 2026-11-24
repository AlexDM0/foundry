/**
 * One contract for the `LaunchEnvironment` port: only the allowlist is inherited, a job variable wins a clash, and a search path reads as its
 * folders. The platform without an adapter inherits nothing.
 */

import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import type { LaunchEnvironment }           from './LaunchEnvironment.ts';
import { launchEnvironmentFor }             from './LaunchEnvironmentFor.ts';
import { createPosixLaunchEnvironment }     from './PosixLaunchEnvironment.ts';
import { createWindowsLaunchEnvironment }   from './WindowsLaunchEnvironment.ts';

const BASE_FOLDERS = ['base-folder'];

const clausesOf = (searchPathDelimiter: string): readonly PortClause<LaunchEnvironment>[] => [
  {
    claim: 'makes the search path the given folders, each once, then only the base folders, and keeps every other variable',
    check: (launchEnvironment) => {
      const environment = { PATH: `inherited-first${searchPathDelimiter}inherited-second`, SystemRoot: 'C:\\Windows', EXAMPLE_JOB: 'J1' };
      const curated = launchEnvironment.withSearchFolders(environment, ['tool-folder', 'program-folder', 'tool-folder']);
      const folders = launchEnvironment.searchFoldersOf(curated);
      expect(folders).toEqual(['tool-folder', 'program-folder', 'base-folder']);
      expect(folders.some((folder) => folder.startsWith('inherited'))).toBe(false);
      expect(curated['EXAMPLE_JOB']).toBe('J1');
    },
  },
  {
    claim: 'keeps only the inherited names that are set, and a job variable wins a clash',
    check: (launchEnvironment) => {
      const [keptName = '', unsetName = ''] = launchEnvironment.inheritedVariableNames;
      const inherited = { [keptName]: 'inherited', [unsetName]: undefined, EXAMPLE_SECRET: 'left behind' };
      const environment = launchEnvironment.launchEnvironmentOf(inherited, { [keptName]: 'job', EXAMPLE_JOB: 'J1' });
      expect(environment).toEqual({ [keptName]: 'job', EXAMPLE_JOB: 'J1' });
    },
  },
  {
    claim: 'reads a search path as its folders in order, empty entries left out',
    check: (launchEnvironment) => {
      expect(launchEnvironment.searchFoldersOf({ PATH: `first${searchPathDelimiter}${searchPathDelimiter}second` })).toEqual(['first', 'second']);
      expect(launchEnvironment.searchFoldersOf({})).toEqual([]);
    },
  },
];

runPortContract('LaunchEnvironment', [
  { name: 'PosixLaunchEnvironment', build: () => createPosixLaunchEnvironment(() => BASE_FOLDERS) },
  { name: 'the native adapter', build: () => launchEnvironmentFor('darwin', () => BASE_FOLDERS) },
], clausesOf(':'));

runPortContract('LaunchEnvironment on Windows', [
  { name: 'WindowsLaunchEnvironment', build: () => createWindowsLaunchEnvironment(() => BASE_FOLDERS) },
  { name: 'the win32 selector', build: () => launchEnvironmentFor('win32', () => BASE_FOLDERS) },
], clausesOf(';'));

test('a platform with no adapter inherits nothing and searches nowhere', () => {
  const launchEnvironment = launchEnvironmentFor('example-platform', () => BASE_FOLDERS);
  expect(launchEnvironment.launchEnvironmentOf({ HOME: '/home/example' }, { EXAMPLE_JOB: 'J1' })).toEqual({ EXAMPLE_JOB: 'J1' });
  expect(launchEnvironment.searchFoldersOf({ PATH: '/first' })).toEqual([]);
});

test('the Windows search path keeps the spelling of the variable it replaces, and the base folders are read at each call', () => {
  let baseFolders = ['C:\\Windows\\System32'];
  const windows = createWindowsLaunchEnvironment(() => baseFolders);
  expect(windows.withSearchFolders({ PATH: 'C:\\Inherited' }, ['C:\\Tools'])).toEqual({ PATH: 'C:\\Tools;C:\\Windows\\System32' });
  baseFolders = [];
  expect(windows.withSearchFolders({}, ['C:\\Tools'])).toEqual({ Path: 'C:\\Tools' });
});
