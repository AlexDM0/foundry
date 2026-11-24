/**
 * One contract for the `LaunchEnvironment` port: only the allowlist is inherited, a job variable wins a clash, and a search path reads as its
 * folders. The platform without an adapter inherits nothing.
 */

import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import type { LaunchEnvironment }           from './LaunchEnvironment.ts';
import { launchEnvironmentFor }             from './LaunchEnvironmentFor.ts';
import { POSIX_LAUNCH_ENVIRONMENT }         from './PosixLaunchEnvironment.ts';
import { WINDOWS_LAUNCH_ENVIRONMENT }       from './WindowsLaunchEnvironment.ts';

const clausesOf = (searchPathDelimiter: string): readonly PortClause<LaunchEnvironment>[] => [
  {
    claim: 'makes the search path the given folders, each once, then only the system folders, and keeps every other variable',
    check: (launchEnvironment) => {
      const environment = { PATH: `inherited-first${searchPathDelimiter}inherited-second`, SystemRoot: 'C:\\Windows', EXAMPLE_JOB: 'J1' };
      const curated = launchEnvironment.withSearchFolders(environment, ['tool-folder', 'program-folder', 'tool-folder']);
      const folders = launchEnvironment.searchFoldersOf(curated);
      expect(folders.slice(0, 2)).toEqual(['tool-folder', 'program-folder']);
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
  { name: 'PosixLaunchEnvironment', build: () => POSIX_LAUNCH_ENVIRONMENT },
  { name: 'the native adapter', build: () => launchEnvironmentFor('darwin') },
], clausesOf(':'));

runPortContract('LaunchEnvironment on Windows', [{ name: 'WindowsLaunchEnvironment', build: () => WINDOWS_LAUNCH_ENVIRONMENT }], clausesOf(';'));

test('a platform with no adapter inherits nothing, searches nowhere and knows no tool folder', () => {
  const launchEnvironment = launchEnvironmentFor('example-platform');
  expect(launchEnvironment.launchEnvironmentOf({ HOME: '/home/example' }, { EXAMPLE_JOB: 'J1' })).toEqual({ EXAMPLE_JOB: 'J1' });
  expect(launchEnvironment.searchFoldersOf({ PATH: '/first' })).toEqual([]);
  expect(launchEnvironment.toolFoldersOf('/home/example')).toEqual([]);
});

test('a POSIX search path ends in the system folders, and a Windows one in the folders under its system root', () => {
  expect(POSIX_LAUNCH_ENVIRONMENT.withSearchFolders({}, ['/home/example/.bun/bin'])['PATH']).toBe('/home/example/.bun/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  const windowsPath = WINDOWS_LAUNCH_ENVIRONMENT.withSearchFolders({ SystemRoot: 'C:\\Windows', Path: 'C:\\Inherited' }, ['C:\\Tools']);
  expect(windowsPath['Path']?.split(';')).toEqual([
    'C:\\Tools', 'C:\\Windows\\System32', 'C:\\Windows', 'C:\\Windows\\System32\\Wbem', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
  ]);
});
