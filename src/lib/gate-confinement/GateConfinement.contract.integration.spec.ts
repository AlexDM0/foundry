/**
 * The real-child half of the `GateConfinement` contract: for each mapped rule a child runs under Seatbelt where `sandbox-exec` applies, and
 * the lines it prints show what it could reach. The bubblewrap half is the rendered-argv table in `GateConfinement.contract.spec.ts`, since
 * this machine has no bwrap. The network cases use a TEST-NET address, so only the Seatbelt refusal decides the result.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenSandboxExecApplies }                     from '../../testing/ToolGuard.ts';
import { createDarwinSeatbelt }                           from './DarwinSeatbelt.ts';
import type { ConfinementPlan }                           from './GateConfinement.ts';
import { REAL_SEATBELT_PRIMITIVES }                       from './GateConfinementFor.ts';

interface SeatbeltBehaviourCase {
  readonly rule:     string;
  readonly script:   (scratch: string) => string;
  readonly expected: readonly string[];
  readonly network?: boolean;
}

const REMOTE_CONNECTION_PROBE = '/usr/bin/nc -v -z -G 1 192.0.2.1 9 2>&1 | grep -q "Operation not permitted" && echo network-refused';

const SEATBELT_BEHAVIOUR_CASES: readonly SeatbeltBehaviourCase[] = [
  { rule: 'reads a file outside every root', script: (scratch) => `cat "${scratch}/elsewhere/readable" >/dev/null && echo read`, expected: ['read'] },
  {
    rule:     'writes the worktree and temp',
    script:   (scratch) => `echo example > "${scratch}/worktree/written" && echo worktree; echo example > "${scratch}/temp/written" && echo temp`,
    expected: ['worktree', 'temp'],
  },
  { rule: 'writes a stored cache path', script: (scratch) => `echo example > "${scratch}/home/.bun/install/cache/written" && echo cache`, expected: ['cache'] },
  { rule: 'cannot write the data folder, though it sits inside temp', script: (scratch) => `echo example > "${scratch}/temp/data/written" && echo data`, expected: [] },
  { rule: 'cannot write the bin beside a cache path\'s ancestors', script: (scratch) => `echo example > "${scratch}/home/.bun/bin/bun" && echo bin`, expected: [] },
  {
    rule:   'cannot read a launch file matched by a glob, but reads the event log beside it',
    script: (scratch) => [
      `cat "${scratch}/temp/data/jobs/J1/launch-1.json" >/dev/null && echo launch`,
      `cat "${scratch}/temp/data/jobs/J1/events-1.ndjson" >/dev/null && echo events`,
    ].join('; '),
    expected: ['events'],
  },
  { rule: 'cannot open a remote connection with the network off', script: () => REMOTE_CONNECTION_PROBE, expected: ['network-refused'] },
  {
    rule: 'is not refused a remote connection with the network on', script: () => REMOTE_CONNECTION_PROBE, expected: [], network: true,
  },
];

describe('a child under DarwinSeatbelt where sandbox-exec applies', () => {
  let scratch = '';

  beforeEach(() => {
    scratch = realpathSync(createScratchDirectory('confinement'));
    for (const folder of ['worktree', 'elsewhere', 'temp/data/jobs/J1', 'home/.bun/bin', 'home/.bun/install/cache']) mkdirSync(join(scratch, folder), { recursive: true });
    writeFileSync(join(scratch, 'elsewhere', 'readable'), 'example');
    writeFileSync(join(scratch, 'temp', 'data', 'jobs', 'J1', 'launch-1.json'), 'example secret');
    writeFileSync(join(scratch, 'temp', 'data', 'jobs', 'J1', 'events-1.ndjson'), 'example events');
  });

  afterEach(() => {
    removeScratchDirectory(scratch);
  });

  for (const {
    rule, script, expected, network
  } of SEATBELT_BEHAVIOUR_CASES) {
    testWhenSandboxExecApplies(rule, () => {
      const plan: ConfinementPlan = {
        worktree:            join(scratch, 'worktree'),
        worktreeAdminFolder: null,
        temporaryDirectory:  join(scratch, 'temp'),
        writableCachePaths:  [join(scratch, 'home', '.bun', 'install', 'cache')],
        deniedWritableRoots: [join(scratch, 'temp', 'data')],
        deniedReadableRoots: [join(scratch, 'temp', 'data', 'jobs', '*', 'launch-*.json')],
        network:             network === true,
        confinementFilePath: join(scratch, 'profile.sb'),
      };
      const argv = createDarwinSeatbelt(REAL_SEATBELT_PRIMITIVES).confinedArgvOf(plan, ['/bin/sh', '-c', script(scratch)]);
      const output = Bun.spawnSync({ cmd: [...argv], stderr: 'ignore' }).stdout.toString().split('\n');
      expect(output.filter((line) => line !== '')).toEqual([...expected]);
    });
  }

  testWhenSandboxExecApplies('runs a line to exit 0 when the plan denies no root', () => {
    const plan: ConfinementPlan = {
      worktree:            join(scratch, 'worktree'),
      worktreeAdminFolder: null,
      temporaryDirectory:  join(scratch, 'temp'),
      writableCachePaths:  [],
      deniedWritableRoots: [],
      deniedReadableRoots: [],
      network:             false,
      confinementFilePath: join(scratch, 'profile.sb'),
    };
    const argv = createDarwinSeatbelt(REAL_SEATBELT_PRIMITIVES).confinedArgvOf(plan, ['/bin/sh', '-c', 'exit 0']);
    expect(Bun.spawnSync({ cmd: [...argv], stderr: 'ignore' }).exitCode).toBe(0);
  });
});
