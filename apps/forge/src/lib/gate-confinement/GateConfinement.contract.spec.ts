/**
 * One contract for the `GateConfinement` port: an adapter wraps the argv exactly when it answers `confined` and otherwise hands it back, since
 * refusing to run is not this port's to decide. The bubblewrap argv is rendered on a fake tree, so the table runs on any machine, a planted
 * break must fail its check, and a denied path that does not exist stays out of the argv, because a bind would make its mount point on the host.
 */
import { describe, expect, test } from 'bun:test';

import { type PortClause, runPortContract }                               from '../../testing/PortContract.ts';
import { confinedLineOf }                                                 from './ConfinedLine.ts';
import { createDarwinSeatbelt, seatbeltProfileTextOf, SANDBOX_EXEC_PATH } from './DarwinSeatbelt.ts';
import type { ConfinementPlan, GateConfinement }                          from './GateConfinement.ts';
import { gateConfinementFor }                                             from './GateConfinementFor.ts';
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
  writableRoots:       [],
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
  ['/tmp/example-worktree/.claude', 'directory'],
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
  writableRoots:       [],
  worktreeAdminFolder: '/tmp/example-admin',
  temporaryDirectory:  '/tmp/example-job-temp',
  writableCachePaths:  ['/home/example/.bun/install/cache'],
  deniedWritableRoots: ['/tmp/example-data', '/tmp/example-worktree/.claude'],
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

test('a plan with no denied roots renders no deny rule for them, since a rule with no filter would deny every path', () => {
  const ruleWithoutFilter = /^\((?:allow|deny) [^ \(\)]+\)$/v;
  const profile = seatbeltProfileTextOf({ ...PLAN, deniedWritableRoots: [], deniedReadableRoots: [] });
  expect(profile.split('\n').filter((line) => ruleWithoutFilter.test(line))).toEqual(['(allow default)', '(deny file-write*)']);
  expect(profile).not.toContain('(deny file-read*');
  expect(profile.split('\n').filter((line) => line.startsWith('(deny file-write*'))).toEqual(['(deny file-write*)']);
});

test('a session plan\'s writable roots are allowed beside the worktree, and the denied roots, rendered after them, still win', () => {
  const profile = seatbeltProfileTextOf({ ...PLAN, writableRoots: ['/Users/alex-example/.example-agent', '/private/tmp/example-data'] });
  const lines = profile.split('\n');
  const allowIndex = lines.findIndex((line) => line.startsWith('(allow file-write*'));
  const denyIndex = lines.findIndex((line) => line.startsWith('(deny file-write* (subpath "/private/tmp/example-data")'));
  expect(lines[allowIndex]).toContain('(subpath "/Users/alex-example/.example-agent")');
  expect(denyIndex).toBeGreaterThan(allowIndex);
  expect(seatbeltProfileTextOf(PLAN)).not.toContain('.example-agent');
});

test('with the network off the profile denies every remote address and then allows loopback; with it on, it renders neither', () => {
  const networkRules = (profile: string): string[] => profile.split('\n').filter((line) => line.includes('network-outbound'));
  expect(networkRules(seatbeltProfileTextOf(PLAN))).toEqual(['(deny network-outbound (remote ip))', '(allow network-outbound (remote ip "localhost:*"))']);
  expect(networkRules(seatbeltProfileTextOf({ ...PLAN, network: true }))).toEqual([]);
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

test('a platform with no adapter and Seatbelt that cannot apply answer unavailable with their cause', () => {
  expect(gateConfinementFor('freebsd').availability()).toEqual({ verdict: 'unavailable', unavailability: { cause: 'no-adapter', platformName: 'freebsd' } });
  expect(seatbeltOf(false).availability()).toEqual({ verdict: 'unavailable', unavailability: { cause: 'mechanism-unusable', mechanism: 'sandbox-exec' } });
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
    expect(confinedLineOf(seatbeltOf(false, written), () => PLAN, ARGV)).toMatchObject({ verdict: 'refused', unavailability: { cause: 'mechanism-unusable' } });
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
const WORKTREE_BIND = ['--bind', '/tmp/example-worktree', '/tmp/example-worktree'];
const AGENT_SETTINGS_DENY = ['--ro-bind', '/tmp/example-worktree/.claude', '/tmp/example-worktree/.claude'];

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
    rule:  'writes a session plan\'s writable roots, a denied root inside one still read-only after them',
    plan:  { ...BUBBLEWRAP_PLAN, writableRoots: ['/home/example/.example-agent', '/tmp/example-data'] },
    holds: (argv) => holdsSequence(argv, ['--bind-try', '/home/example/.example-agent', '/home/example/.example-agent'])
      && indexOfSequence(argv, DATA_DENY) > indexOfSequence(argv, ['--bind-try', '/tmp/example-data', '/tmp/example-data']),
    plant: (argv) => withoutSequence(argv, ['--bind-try', '/home/example/.example-agent', '/home/example/.example-agent']),
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
    rule:  'keeps the worktree\'s .claude folder read-only after the worktree\'s writable bind, so no gate writes agent settings there',
    plan:  BUBBLEWRAP_PLAN,
    holds: (argv) => indexOfSequence(argv, AGENT_SETTINGS_DENY) > indexOfSequence(argv, WORKTREE_BIND) && indexOfSequence(argv, WORKTREE_BIND) > 0,
    plant: (argv) => {
      const withoutDeny = withoutSequence(argv, AGENT_SETTINGS_DENY);
      const worktreeIndex = indexOfSequence(withoutDeny, WORKTREE_BIND);
      return [...withoutDeny.slice(0, worktreeIndex), ...AGENT_SETTINGS_DENY, ...withoutDeny.slice(worktreeIndex)];
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
    rule:  'unshares the network when it is off, which leaves the child its own loopback',
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
    rule:  'mounts a fresh /proc, so the host /proc/<hephaestus>/environ is not bound in',
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
    rule:  'ends the child with Hephaestus and in a session of its own, then runs the argv after --',
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
    ['no bwrap is on the search path', { ...WORKING_BWRAP, executablePath: null }, { cause: 'bubblewrap-not-on-search-path' }],
    ['a user namespace is blocked', BLOCKED_BWRAP, { cause: 'bubblewrap-namespaces-refused', processMessage: 'bwrap: setting up uid map: Permission denied' }],
    ['bwrap prints no version', { ...WORKING_BWRAP, versionOutput: 'example output\n' }, { cause: 'bubblewrap-version-unread', processMessage: 'example output' }],
  ] as const)('answers unavailable with its cause when %s, and #521\'s refusal fires on it', (_case, fake, unavailability) => {
    const bubblewrap = bubblewrapOf(fake);
    expect(bubblewrap.availability()).toEqual({ verdict: 'unavailable', unavailability });
    expect(bubblewrap.confinedArgvOf(BUBBLEWRAP_PLAN, ARGV)).toEqual(ARGV);
    expect(confinedLineOf(bubblewrap, () => BUBBLEWRAP_PLAN, ARGV)).toEqual({ verdict: 'refused', unavailability });
  });

  test('the linux selector answers LinuxBubblewrap', () => {
    const availability = gateConfinementFor('linux').availability();
    if (availability.verdict === 'confined') expect(availability.mechanism).toStartWith(BUBBLEWRAP_MECHANISM);
    else expect(availability).toMatchObject({ verdict: 'unavailable', unavailability: { cause: expect.stringContaining('bubblewrap') } });
  });
});
