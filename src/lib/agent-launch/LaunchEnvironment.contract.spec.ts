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

test('a platform with no adapter inherits nothing and searches nowhere', () => {
  const launchEnvironment = launchEnvironmentFor('example-platform');
  expect(launchEnvironment.launchEnvironmentOf({ HOME: '/home/example' }, { EXAMPLE_JOB: 'J1' })).toEqual({ EXAMPLE_JOB: 'J1' });
  expect(launchEnvironment.searchFoldersOf({ PATH: '/first' })).toEqual([]);
});
