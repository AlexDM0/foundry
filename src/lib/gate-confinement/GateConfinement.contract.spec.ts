/**
 * One contract for the `GateConfinement` port: an adapter wraps the argv exactly when it answers `confined`, and every other answer hands the
 * argv back unchanged, since refusing to run is not this port's to decide. Seatbelt runs on a fake table, confined and not; a real child under
 * the native adapter is held by `src/services/overseer/ProcessWatcherSandbox.integration.spec.ts`.
 * Each mapped rule has two cases. The bubblewrap argv is rendered on a fake tree, and a planted break of the argv must fail its check, so the
 * table runs on any machine. Seatbelt runs a real child for each rule where sandbox-exec applies. A denied path that does not exist must not
 * show in the argv, because a bind would make its mount point on the host.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { type PortClause, runPortContract }                               from '../../testing/PortContract.ts';
import { createScratchDirectory, removeScratchDirectory }                 from '../../testing/ScratchWorkspace.ts';
import { testWhenSandboxExecApplies }                                     from '../../testing/ToolGuard.ts';
import { confinedLineOf }                                                 from './ConfinedLine.ts';
import { createDarwinSeatbelt, seatbeltProfileTextOf, SANDBOX_EXEC_PATH } from './DarwinSeatbelt.ts';
import type { ConfinementPlan, GateConfinement }                          from './GateConfinement.ts';
import { gateConfinementFor, REAL_SEATBELT_PRIMITIVES }                   from './GateConfinementFor.ts';
import {
  BUBBLEWRAP_MECHANISM,
  bubblewrapArgvOf,
  type BubblewrapInstall,
  createLinuxBubblewrap,
  type HostPathKind,
  type HostTree,
  type ProgramRun
} from './LinuxBubblewrap.ts';

const PLAN: ConfinementPlan = {
  worktree:            '/private/tmp/example-worktree',
  worktreeAdminFolder: null,
  temporaryDirectory:  null,
  writableCachePaths:  [],
  deniedWritableRoots: ['/private/tmp/example-data'],
  deniedReadableRoots: ['/private/tmp/example-secrets'],
  network:             false,
  confinementFilePath: '/private/tmp/example-job/process-sandbox.sb',
};
const ARGV = ['/bin/sh', '-c', 'true'];

const FAKE_HOST_PATHS: ReadonlyMap<string, HostPathKind> = new Map<string, HostPathKind>([
  ['/tmp', 'directory'],
  ['/var/tmp', 'directory'],
  ['/tmp/example-worktree', 'directory'],
  ['/tmp/example-admin', 'directory'],
  ['/tmp/example-job-temp', 'directory'],
  ['/tmp/example-data', 'directory'],
  ['/tmp/example-data/jobs', 'directory'],
  ['/tmp/example-data/jobs/J1', 'directory'],
  ['/tmp/example-data/jobs/J1/launch-1.json', 'file'],
  ['/tmp/example-data/jobs/J1/events-1.ndjson', 'file'],
  ['/home/example/.bun/bin', 'directory'],
  ['/home/example/.bun/install/cache', 'directory'],
  ['/home/example/secrets', 'directory'],
]);

const FAKE_TREE: HostTree = {
  kindOf:    (path) => FAKE_HOST_PATHS.get(path) ?? 'absent',
  entriesOf: (folder) => [...FAKE_HOST_PATHS.keys()]
    .filter((path) => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes('/'))
    .map((path) => path.slice(folder.length + 1)),
  resolvedPathOf: (path) => path,
};

const BUBBLEWRAP_PLAN: ConfinementPlan = {
  worktree:            '/tmp/example-worktree',
  worktreeAdminFolder: '/tmp/example-admin',
  temporaryDirectory:  '/tmp/example-job-temp',
  writableCachePaths:  ['/home/example/.bun/install/cache'],
  deniedWritableRoots: ['/tmp/example-data'],
  deniedReadableRoots: ['/tmp/example-data/jobs/*/launch-*.json', '/home/example/secrets'],
  network:             false,
  confinementFilePath: '/tmp/example-job/process-sandbox.sb',
};
const BUBBLEWRAP_INSTALL: BubblewrapInstall = { executablePath: '/usr/bin/bwrap', refusesNestedNamespaces: true };

interface FakeBwrap {
  executablePath: string | null;
  versionOutput:  string;
  namespaceRun:   ProgramRun;
}

const WORKING_BWRAP: FakeBwrap = { executablePath: '/usr/bin/bwrap', versionOutput: 'bubblewrap 0.9.0\n', namespaceRun: { exitCode: 0, output: '' } };
const BLOCKED_BWRAP: FakeBwrap = { ...WORKING_BWRAP, namespaceRun: { exitCode: 1, output: 'bwrap: setting up uid map: Permission denied\n' } };

function bubblewrapOf(fake: FakeBwrap, runs: (readonly string[])[] = []): GateConfinement {
  return createLinuxBubblewrap({
    executablePathOf: (name) => (name === 'bwrap' ? fake.executablePath : null),
    runProgram:       (argv) => {
      runs.push(argv);
      return argv.includes('--version') ? { exitCode: 0, output: fake.versionOutput } : fake.namespaceRun;
    },
    tree: FAKE_TREE,
  });
}

function indexOfSequence(argv: readonly string[], sequence: readonly string[]): number {
  for (let i = 0; i + sequence.length <= argv.length; i += 1) {
    if (sequence.every((part, offset) => argv[i + offset] === part)) return i;
  }
  return -1;
}

function holdsSequence(argv: readonly string[], sequence: readonly string[]): boolean {
  return indexOfSequence(argv, sequence) >= 0;
}

function withoutSequence(argv: readonly string[], sequence: readonly string[]): string[] {
  const start = indexOfSequence(argv, sequence);
  return start < 0 ? [...argv] : [...argv.slice(0, start), ...argv.slice(start + sequence.length)];
}

function seatbeltOf(applies: boolean, written: Map<string, string> = new Map()): GateConfinement {
  return createDarwinSeatbelt({
    fileExists:      () => true,
    programSucceeds: () => applies,
    writeFile:       (path, text) => written.set(path, text),
  });
}

const CLAUSES: readonly PortClause<GateConfinement>[] = [{
  claim: 'wraps the argv when it answers confined, and hands it back unchanged otherwise',
  check: (confinement) => {
    const confinedArgv = confinement.confinedArgvOf(PLAN, ARGV);
    if (confinement.availability().verdict === 'confined') expect(confinedArgv.slice(-ARGV.length)).toEqual(ARGV);
    else expect(confinedArgv).toEqual(ARGV);
    if (confinement.availability().verdict === 'confined') expect(confinedArgv.length).toBeGreaterThan(ARGV.length);
  },
}];

runPortContract('GateConfinement', [
  { name: 'DarwinSeatbelt where sandbox-exec applies', build: () => seatbeltOf(true) },
  { name: 'DarwinSeatbelt where sandbox-exec cannot apply', build: () => seatbeltOf(false) },
  { name: 'LinuxBubblewrap where bwrap creates its namespaces', build: () => bubblewrapOf(WORKING_BWRAP) },
  { name: 'LinuxBubblewrap where no bwrap is on the search path', build: () => bubblewrapOf({ ...WORKING_BWRAP, executablePath: null }) },
  { name: 'LinuxBubblewrap where a user namespace is blocked', build: () => bubblewrapOf(BLOCKED_BWRAP) },
  { name: 'WindowsNoConfinement', build: () => gateConfinementFor('win32') },
  { name: 'a platform with no adapter', build: () => gateConfinementFor('freebsd') },
], CLAUSES);

test('a confined argv runs sandbox-exec on the profile the adapter wrote from the plan', () => {
  const written = new Map<string, string>();
  expect(seatbeltOf(true, written).confinedArgvOf(PLAN, ARGV)).toEqual([SANDBOX_EXEC_PATH, '-f', PLAN.confinementFilePath, ...ARGV]);
  expect(written.get(PLAN.confinementFilePath)).toBe(seatbeltProfileTextOf(PLAN));
});

test('sandbox-exec is probed once, and a missing one is never run', () => {
  let probes = 0;
  const seatbelt = createDarwinSeatbelt({
    fileExists:      () => false,
    programSucceeds: () => {
      probes += 1;
      return true;
    },
    writeFile: () => undefined,
  });
  expect(seatbelt.availability().verdict).toBe('unavailable');
  expect(probes).toBe(0);
  let applyingProbes = 0;
  const applying = createDarwinSeatbelt({
    fileExists:      () => true,
    programSucceeds: () => {
      applyingProbes += 1;
      return true;
    },
    writeFile: () => undefined,
  });
  applying.availability();
  applying.confinedArgvOf(PLAN, ARGV);
  expect(applyingProbes).toBe(1);
});

test('a platform with no adapter and Seatbelt that cannot apply answer unavailable with a reason', () => {
  expect(gateConfinementFor('freebsd').availability()).toMatchObject({ verdict: 'unavailable', reason: expect.any(String) });
  expect(seatbeltOf(false).availability()).toMatchObject({ verdict: 'unavailable', reason: expect.any(String) });
});

test('Windows answers unconfined-by-design for gates and workers, and writes no confinement file', () => {
  const windows = gateConfinementFor('win32');
  expect(windows.availability()).toEqual({ verdict: 'unconfined-by-design' });
  expect(windows.workerConfinement()).toBe('unconfined-by-design');
  expect(windows.confinedArgvOf(PLAN, ARGV)).toEqual(ARGV);
});

test('a worker is confined under Seatbelt whatever the gate probe answers, since its launch demands its own sandbox', () => {
  expect([seatbeltOf(true).workerConfinement(), seatbeltOf(false).workerConfinement()]).toEqual(['confined', 'confined']);
  expect(gateConfinementFor('freebsd').workerConfinement()).toBe('unavailable');
});

describe('confinedLineOf, the only way to a line', () => {
  test('refuses on unavailable, never asking the adapter for the argv it would hand back unchanged', () => {
    const written = new Map<string, string>();
    expect(confinedLineOf(seatbeltOf(false, written), () => PLAN, ARGV)).toEqual({ verdict: 'refused', reason: 'sandbox-exec cannot apply a profile here' });
    expect(written.size).toBe(0);
  });

  test('runs the wrapped argv when confined, and the argv unchanged when unconfined by design', () => {
    expect(confinedLineOf(seatbeltOf(true), () => PLAN, ARGV)).toEqual({ verdict: 'runs', argv: [SANDBOX_EXEC_PATH, '-f', PLAN.confinementFilePath, ...ARGV] });
    expect(confinedLineOf(gateConfinementFor('win32'), () => PLAN, ARGV)).toEqual({ verdict: 'runs', argv: ARGV });
  });
});

interface RenderedArgvCase {
  readonly rule:  string;
  readonly plan:  ConfinementPlan;
  readonly holds: (argv: readonly string[]) => boolean;
  readonly plant: (argv: readonly string[]) => readonly string[];
}

const TEMPORARY_BIND = ['--bind-try', '/tmp', '/tmp'];
const DATA_DENY = ['--ro-bind', '/tmp/example-data', '/tmp/example-data'];

/** Each mapped rule of the Seatbelt profile, as the bubblewrap argv holds it, and a planted change of the argv that breaks the rule. */
const RENDERED_ARGV_CASES: readonly RenderedArgvCase[] = [
  {
    rule:  'reads everywhere and writes nowhere by default: the root is bound read-only first',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => indexOfSequence(argv, ['--ro-bind', '/', '/']) === 1 && !holdsSequence(argv, ['--bind', '/', '/']),
    plant: (argv) => [argv[0] ?? '', '--bind', '/', '/', ...withoutSequence(argv, ['--ro-bind', '/', '/']).slice(1)],
  },
  {
    rule:  'writes the worktree, its admin folder and temp, the job temp folder included',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => [
      ['--bind', '/tmp/example-worktree', '/tmp/example-worktree'],
      ['--bind-try', '/tmp/example-admin', '/tmp/example-admin'],
      TEMPORARY_BIND,
      ['--bind-try', '/var/tmp', '/var/tmp'],
      ['--bind-try', '/tmp/example-job-temp', '/tmp/example-job-temp'],
    ].every((sequence) => holdsSequence(argv, sequence)),
    plant: (argv) => withoutSequence(argv, ['--bind-try', '/var/tmp', '/var/tmp']),
  },
  {
    rule:  'writes a stored cache path',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => holdsSequence(argv, ['--bind-try', '/home/example/.bun/install/cache', '/home/example/.bun/install/cache']),
    plant: (argv) => withoutSequence(argv, ['--bind-try', '/home/example/.bun/install/cache', '/home/example/.bun/install/cache']),
  },
  {
    rule:  'keeps a denied root read-only after the writable binds, so a data folder under temp stays denied',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => indexOfSequence(argv, DATA_DENY) > indexOfSequence(argv, TEMPORARY_BIND) && indexOfSequence(argv, TEMPORARY_BIND) > 0,
    plant: (argv) => {
      const withoutDeny = withoutSequence(argv, DATA_DENY);
      const temporaryIndex = indexOfSequence(withoutDeny, TEMPORARY_BIND);
      return [...withoutDeny.slice(0, temporaryIndex), ...DATA_DENY, ...withoutDeny.slice(temporaryIndex)];
    },
  },
  {
    rule:  'keeps the bin beside a cache path\'s ancestors read-only',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => holdsSequence(argv, ['--ro-bind', '/home/example/.bun/bin', '/home/example/.bun/bin']),
    plant: (argv) => withoutSequence(argv, ['--ro-bind', '/home/example/.bun/bin', '/home/example/.bun/bin']),
  },
  {
    rule:  'hides a denied readable file behind /dev/null, a glob expanded within one segment, and a denied folder behind a read-only tmpfs',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => holdsSequence(argv, ['--ro-bind', '/dev/null', '/tmp/example-data/jobs/J1/launch-1.json'])
      && holdsSequence(argv, ['--tmpfs', '/home/example/secrets', '--remount-ro', '/home/example/secrets'])
      && !argv.includes('/tmp/example-data/jobs/J1/events-1.ndjson'),
    plant: (argv) => withoutSequence(argv, ['--ro-bind', '/dev/null', '/tmp/example-data/jobs/J1/launch-1.json']),
  },
  {
    rule:  'unshares the network when it is off',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => argv.includes('--unshare-net'),
    plant: (argv) => withoutSequence(argv, ['--unshare-net']),
  },
  {
    rule:  'keeps the network when it is on',
    plan:  { ...BUBBLEWRAP_PLAN, network: true },
    holds: (argv) => !argv.includes('--unshare-net'),
    plant: (argv) => [...argv.slice(0, 1), '--unshare-net', ...argv.slice(1)],
  },
  {
    rule:  'runs in its own pid namespace, so no other process\'s /proc entry is in reach',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => argv.includes('--unshare-pid'),
    plant: (argv) => withoutSequence(argv, ['--unshare-pid']),
  },
  {
    rule:  'mounts a fresh /proc, so the host /proc/<overseer>/environ is not bound in',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => holdsSequence(argv, ['--proc', '/proc']),
    plant: (argv) => withoutSequence(argv, ['--proc', '/proc']),
  },
  {
    rule:  'refuses the child a user namespace of its own',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => holdsSequence(argv, ['--unshare-user', '--disable-userns']),
    plant: (argv) => withoutSequence(argv, ['--disable-userns']),
  },
  {
    rule:  'ends the child with the Overseer and in a session of its own, then runs the argv after --',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => argv.includes('--die-with-parent') && argv.includes('--new-session')
      && holdsSequence(argv, ['--', ...ARGV]) && argv.slice(-ARGV.length).join(' ') === ARGV.join(' '),
    plant: (argv) => withoutSequence(argv, ['--die-with-parent']),
  },
];

describe('the bubblewrap argv, each rule held and each planted break caught', () => {
  test.each(RENDERED_ARGV_CASES.map((argvCase) => [argvCase.rule, argvCase] as const))('%s', (_rule, { plan, holds, plant }) => {
    const argv = bubblewrapArgvOf(plan, ARGV, BUBBLEWRAP_INSTALL, FAKE_TREE);
    expect(holds(argv)).toBe(true);
    expect(holds(plant(argv))).toBe(false);
  });

  test('renders no bind and no path for a denied root that does not exist, so nothing is created on the host', () => {
    const absentDenies: ConfinementPlan = {
      ...BUBBLEWRAP_PLAN,
      writableCachePaths:  [],
      deniedWritableRoots: ['/tmp/example-absent-data'],
      deniedReadableRoots: ['/tmp/example-absent-secrets', '/tmp/example-data/jobs/*/absent-*.json', '/tmp/example-absent/*/launch.json'],
    };
    const argv = bubblewrapArgvOf(absentDenies, ARGV, BUBBLEWRAP_INSTALL, FAKE_TREE);
    expect(argv.filter((part) => part.includes('absent'))).toEqual([]);
    expect(argv).not.toContain('--tmpfs');
    expect(argv.filter((part) => part === '/dev/null')).toEqual([]);
  });

  test('before bubblewrap 0.8.0 the child keeps the user namespace call, and availability says so', () => {
    const argv = bubblewrapArgvOf(BUBBLEWRAP_PLAN, ARGV, { ...BUBBLEWRAP_INSTALL, refusesNestedNamespaces: false }, FAKE_TREE);
    expect(argv).not.toContain('--disable-userns');
    expect(argv).not.toContain('--unshare-user');
    const olderBwrap = bubblewrapOf({ ...WORKING_BWRAP, versionOutput: 'bubblewrap 0.6.1\n' });
    expect(olderBwrap.availability()).toMatchObject({ verdict: 'confined', mechanism: expect.stringContaining('older than 0.8.0') });
  });
});

describe('LinuxBubblewrap availability', () => {
  test('answers confined with bubblewrap once bwrap ran a namespace, probing once, and wraps the argv in it', () => {
    const runs: (readonly string[])[] = [];
    const bubblewrap = bubblewrapOf(WORKING_BWRAP, runs);
    expect(bubblewrap.availability()).toEqual({ verdict: 'confined', mechanism: BUBBLEWRAP_MECHANISM });
    expect(bubblewrap.confinedArgvOf(BUBBLEWRAP_PLAN, ARGV)).toEqual(bubblewrapArgvOf(BUBBLEWRAP_PLAN, ARGV, BUBBLEWRAP_INSTALL, FAKE_TREE));
    expect(runs.map((argv) => argv[1])).toEqual(['--version', '--ro-bind']);
  });

  test.each([
    ['no bwrap is on the search path', { ...WORKING_BWRAP, executablePath: null }, 'bwrap (bubblewrap) is not on the search path'],
    ['a user namespace is blocked', BLOCKED_BWRAP, 'bwrap: setting up uid map: Permission denied'],
    ['bwrap prints no version', { ...WORKING_BWRAP, versionOutput: 'example output\n' }, 'bwrap --version gave no version: example output'],
  ] as const)('answers unavailable with a reason when %s, and #521\'s refusal fires on it', (_case, fake, reasonPart) => {
    const bubblewrap = bubblewrapOf(fake);
    const availability = bubblewrap.availability();
    expect(availability).toMatchObject({ verdict: 'unavailable', reason: expect.stringContaining(reasonPart) });
    expect(bubblewrap.confinedArgvOf(BUBBLEWRAP_PLAN, ARGV)).toEqual(ARGV);
    expect(confinedLineOf(bubblewrap, () => BUBBLEWRAP_PLAN, ARGV)).toEqual({ verdict: 'refused', reason: availability.verdict === 'unavailable' ? availability.reason : '' });
  });

  test('the linux selector answers LinuxBubblewrap', () => {
    const availability = gateConfinementFor('linux').availability();
    if (availability.verdict === 'confined') expect(availability.mechanism).toStartWith(BUBBLEWRAP_MECHANISM);
    else expect(availability).toMatchObject({ verdict: 'unavailable', reason: expect.stringContaining('bwrap') });
  });
});

interface SeatbeltBehaviourCase {
  readonly rule:     string;
  readonly script:   (scratch: string) => string;
  readonly expected: readonly string[];
  readonly network?: boolean;
}

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
  {
    rule:     'cannot open a remote connection with the network off',
    script:   () => '/usr/bin/nc -v -z -G 1 192.0.2.1 9 2>&1 | grep -q "Operation not permitted" && echo network-refused',
    expected: ['network-refused'],
  },
  {
    rule:     'is not refused a remote connection with the network on',
    script:   () => '/usr/bin/nc -v -z -G 1 192.0.2.1 9 2>&1 | grep -q "Operation not permitted" && echo network-refused',
    expected: [],
    network:  true,
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
});
