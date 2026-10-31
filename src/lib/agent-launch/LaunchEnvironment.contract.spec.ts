/**
 * One contract for the `LaunchEnvironment` port: only the allowlist is inherited, a job variable wins a clash, and a search path reads as its
 * folders. The platform without an adapter inherits nothing.
 */
import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import type { LaunchEnvironment }           from './LaunchEnvironment.ts';
import { launchEnvironmentFor }             from './LaunchEnvironmentFor.ts';
import { POSIX_LAUNCH_ENVIRONMENT }         from './PosixLaunchEnvironment.ts';

const CLAUSES: readonly PortClause<LaunchEnvironment>[] = [
  {
    claim: 'keeps only the inherited names that are set, and a job variable wins a clash',
    check: (launchEnvironment) => {
      const environment = launchEnvironment.launchEnvironmentOf({ HOME: '/home/example', LANG: undefined, EXAMPLE_SECRET: 'left behind' }, { HOME: '/job', EXAMPLE_JOB: 'J1' });
      expect(environment).toEqual({ HOME: '/job', EXAMPLE_JOB: 'J1' });
    },
  },
  {
    claim: 'reads a search path as its folders in order, empty entries left out',
    check: (launchEnvironment) => {
      expect(launchEnvironment.searchFoldersOf({ PATH: '/first::/second' })).toEqual(['/first', '/second']);
      expect(launchEnvironment.searchFoldersOf({})).toEqual([]);
    },
  },
];

runPortContract('LaunchEnvironment', [
  { name: 'PosixLaunchEnvironment', build: () => POSIX_LAUNCH_ENVIRONMENT },
  { name: 'the native adapter', build: () => launchEnvironmentFor('darwin') },
], CLAUSES);

test('a platform with no adapter inherits nothing and searches nowhere', () => {
  const launchEnvironment = launchEnvironmentFor('win32');
  expect(launchEnvironment.launchEnvironmentOf({ HOME: '/home/example' }, { EXAMPLE_JOB: 'J1' })).toEqual({ EXAMPLE_JOB: 'J1' });
  expect(launchEnvironment.searchFoldersOf({ PATH: '/first' })).toEqual([]);
});
