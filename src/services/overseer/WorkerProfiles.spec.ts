/**
 * The per-job profile table of design section 4.4, as the neutral data every adapter renders. What matters: every write and read deny the
 * design names is there as an absolute path; every role is denied the same per-OS credential list; the sockets and GnuPG home come from
 * gpgconf, whose absence commits unsigned and never throws; the gpg folder is narrowed only when an agent socket signs; and a ticket's
 * `network` line is the only network a worker gets, any domain staying the product owner's alone. The Claude Code adapter's own spec
 * holds that each of these paths renders `//`-anchored into the sandbox and the permission rules, and how `none`, a list and `any`
 * become `--disallowedTools`; the guard on the vendor's seam keeps that adapter out of this spec. Under `mount-points`, the Linux
 * sandbox's shape, no deny names an absent path, a ref held only in `packed-refs` gets none, the launch files are one folder, signing
 * falls back to unsigned and the list stays under the mount limit; the macOS output stays as frozen. The one exception is a denied root
 * inside a writable bind, `<worktree>/.claude`: the launch makes it, or refuses, so it always gets its read-only mount.
 */
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import {
  isAbsolute,
  join,
  posix,
  win32
} from 'node:path';
import { describe, expect, test } from 'bun:test';

import { dataFoldersFor }                                 from '../../lib/data-folders/DataFoldersFor.ts';
import { createPosixShellLine }                           from '../../lib/shell-line/PosixShellLine.ts';
import { createWindowsCommandLine }                       from '../../lib/shell-line/WindowsCommandLine.ts';
import type { Pipeline }                                  from '../../lib/tracker-model/@types/Pipeline.ts';
import { watcherSecretPathOf }                            from '../../lib/watcher/WatcherFiles.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_DARWIN_WORKER_PROFILES                      from './FrozenDarwinWorkerProfiles.json';
import { GpgDirectories }                                 from './GpgDirectories.ts';
import { overseerTokenPathOf }                            from './OverseerFiles.ts';
import {
  NO_TOOLCHAIN,
  type ProfiledRole,
  type SandboxFacts,
  WorkerProfiles
} from './WorkerProfiles.ts';

const FACTS: SandboxFacts = {
  dataFolder:                '/example/repository/.forge',
  monitorFolder:             '/home/alex-example/.forge-monitor',
  homeDirectory:             '/home/alex-example',
  worktree:                  '/example/repository/.forge-worktrees/ticket-007',
  commonGitDirectory:        '/example/repository/.git',
  targetBranches:            ['main', 'group-example'],
  otherTicketBranches:       ['ticket-003', 'ticket-009'],
  otherWorktreeAdminFolders: ['/example/repository/.git/worktrees/ticket-003'],
  hatchDirectory:            '/example/repository/.forge-worktrees/hatch/J4',
  repositoryRoot:            '/example/repository',
  gitHooksDirectory:         '/example/repository/.githooks',
  commitSigning:             { kind: 'unsigned' },
  credentialPaths:           ['/home/alex-example/.ssh', '/home/alex-example/.aws'],
  gpgHomeDirectory:          '/home/alex-example/.gnupg',
  executableSearchPath:      [],
  cacheFolderStyle:          dataFoldersFor('linux', ''),
  sandboxDenyShape:          'path-rules',
  guardCommand:              ['/example/bin/bun', '--no-env-file', '/example/tool/agent-progress.ts'],
};

/** A home no machine has, so resolving a cache folder under it changes nothing. */
const ABSENT_HOME_FACTS: SandboxFacts = { ...FACTS, homeDirectory: '/example/home/alex-example' };

const THIS_REPOSITORY_TOOLCHAIN_LINES = ['bun run verify', 'bun install'];

const POSIX_SHELL_LINE = createPosixShellLine({ userShell: () => undefined });

function profileOf(role: ProfiledRole, networkDomains: readonly string[] = [], facts: SandboxFacts = FACTS, toolchainLines = THIS_REPOSITORY_TOOLCHAIN_LINES) {
  return WorkerProfiles.profileOf(role, facts, { networkDomains, writes: [], executables: toolchainLines.flatMap((line) => POSIX_SHELL_LINE.executablesOf(line)) });
}

describe('the pipeline\'s toolchain', () => {
  const pipeline: Pipeline = {
    prepare: [{ name: 'install', run: 'uv sync' }],
    gates:   [
      {
        name: 'tests', run: 'uv run pytest', in: 'service', network: ['pypi.example.org'], writes: ['~/.cache/example-uv']
      },
      {
        name: 'deploy-check', run: 'terraform plan', network: ['cloud.example.com'], writes: ['/example/terraform-cache'], overseerOnly: true
      },
    ],
  };

  test('gives a builder the network and writes of every gate but an overseerOnly one, its ticket\'s line added, and their executables', () => {
    const toolchain = WorkerProfiles.workerToolchainOf(pipeline, ['docs.example.org'], POSIX_SHELL_LINE);
    const profile   = WorkerProfiles.profileOf('builder', ABSENT_HOME_FACTS, toolchain);

    expect(profile.bashNetworkDomains).toEqual(['docs.example.org', 'pypi.example.org']);
    expect(profile.writableRoots).toEqual(['/example/home/alex-example/.cache/example-uv']);
    expect(profile.allowedCommandPrefixes.slice(0, 1)).toEqual([['uv']]);
    expect(profile.allowedCommandPrefixes.flat()).not.toContain('terraform');
  });

  test('splits the lines in the grammar they run in: on cmd, a & b grants both, and a caret-escaped & grants neither word after it', () => {
    const windowsShellLine = createWindowsCommandLine({ commandInterpreter: () => 'C:\\Windows\\system32\\cmd.exe', systemRoot: () => undefined });
    const cmdPipeline: Pipeline = { prepare: [{ name: 'install', run: 'npm ci & npx playwright install' }], gates: [{ name: 'tests', run: 'echo a ^& b' }] };

    expect(WorkerProfiles.workerToolchainOf(cmdPipeline, [], windowsShellLine).executables).toEqual(['npm', 'npx', 'echo']);
  });

  test('gives a reviewer the same, and the product owner none of the gates\' writes', () => {
    const toolchain = WorkerProfiles.workerToolchainOf(pipeline, [], POSIX_SHELL_LINE);

    expect(WorkerProfiles.profileOf('reviewer', ABSENT_HOME_FACTS, toolchain).writableRoots).toEqual(['/example/home/alex-example/.cache/example-uv']);
    expect(WorkerProfiles.profileOf('product-owner', ABSENT_HOME_FACTS, toolchain).writableRoots).toEqual([]);
  });

  test('judges the stored writes again at launch: a folder that gained a bin since it was stored is out of the worker\'s writes', () => {
    const scratch = realpathSync(createScratchDirectory('worker-writes'));
    try {
      const facts: SandboxFacts = { ...FACTS, homeDirectory: scratch };
      const toolchain = { networkDomains: [], writes: ['~/example-cache', '~/.local'], executables: [] };
      mkdirSync(join(scratch, 'example-cache'));
      expect(WorkerProfiles.profileOf('builder', { ...facts, executableSearchPath: [join(scratch, '.local', 'tools')] }, toolchain).writableRoots)
        .toEqual([join(scratch, 'example-cache')]);
      mkdirSync(join(scratch, 'example-cache', 'bin'));
      expect(WorkerProfiles.profileOf('builder', facts, toolchain).writableRoots).toEqual([join(scratch, '.local')]);
    } finally {
      removeScratchDirectory(scratch);
    }
  });
});

describe('the allowed commands', () => {
  test('are the executables a uv board\'s checks and install lines invoke, never bun, then the git verbs', () => {
    const profile = profileOf('builder', [], FACTS, ['uv run pytest && uv run ruff check', 'uv sync']);
    expect(profile.allowedCommandPrefixes).toEqual([
      ['uv'], ['git', 'status'], ['git', 'diff'], ['git', 'log'], ['git', 'show'], ['git', 'add'], ['git', 'commit'],
    ]);
  });

  test('hold bun for this repository\'s bun run verify', () => {
    expect(profileOf('reviewer').allowedCommandPrefixes).toContainEqual(['bun']);
  });

  test('take the first word of each command split on &&, ||, ; and |, past an assignment, leaving git to its verbs', () => {
    const profile = profileOf('builder', [], FACTS, ['CI=1 make check || ./scripts/lint.sh; git diff --check | grep -q . && npx tsc']);
    expect(profile.allowedCommandPrefixes.slice(0, 4)).toEqual([['make'], ['./scripts/lint.sh'], ['grep'], ['npx']]);
    expect(profile.allowedCommandPrefixes).not.toContainEqual(['git']);
  });

  test('ignore a separator inside double or single quotes, so grep "a|b" x allows only grep', () => {
    expect(profileOf('builder', [], FACTS, ['grep "a|b" x']).allowedCommandPrefixes.slice(0, 2)).toEqual([['grep'], ['git', 'status']]);
    expect(profileOf('builder', [], FACTS, ['grep \'a;b\' x && grep "c\\"|d" y']).allowedCommandPrefixes.slice(0, 2)).toEqual([['grep'], ['git', 'status']]);
  });

  test('read a subshell\'s parentheses as separators, so (cd x && make) allows cd and make', () => {
    expect(profileOf('builder', [], FACTS, ['(cd x && make)']).allowedCommandPrefixes.slice(0, 3)).toEqual([['cd'], ['make'], ['git', 'status']]);
  });

  test('are none with no stored lines but the git verbs, and none at all for the Assistant', () => {
    expect(profileOf('builder', [], FACTS, []).allowedCommandPrefixes[0]).toEqual(['git', 'status']);
    expect(profileOf('assistant').allowedCommandPrefixes).toEqual([]);
  });
});

describe('a builder\'s profile', () => {
  const profile = profileOf('builder');

  test.each([
    ['the data folder', '/example/repository/.forge'],
    ['the monitor folder', '/home/alex-example/.forge-monitor'],
    ['the worktree\'s .claude folder', '/example/repository/.forge-worktrees/ticket-007/.claude'],
    ['packed-refs', '/example/repository/.git/packed-refs'],
    ['the main line\'s ref', '/example/repository/.git/refs/heads/main'],
    ['a live group\'s ref', '/example/repository/.git/refs/heads/group-example'],
    ['another ticket branch', '/example/repository/.git/refs/heads/ticket-003'],
    ['a third ticket branch', '/example/repository/.git/refs/heads/ticket-009'],
    ['another worktree\'s admin folder', '/example/repository/.git/worktrees/ticket-003'],
  ])('denies writes to %s', (_name, path) => {
    expect(profile.deniedWritableRoots).toContain(path);
  });

  test.each([
    ['the launch files', '/example/repository/.forge/jobs/*/launch-*.json'],
    ['the Watcher sockets, the Overseer token and the Watcher secrets', '/home/alex-example/.forge-monitor/watchers'],
    ['~/.ssh', '/home/alex-example/.ssh'],
    ['~/.aws', '/home/alex-example/.aws'],
    ['~/.gnupg, whole while commits go unsigned', '/home/alex-example/.gnupg'],
  ])('denies reads of %s', (_name, path) => {
    expect(profile.deniedReadableRoots).toContain(path);
  });

  test('a session outside a worktree is denied the secrets, every credential and GnuPG\'s home whole too', () => {
    const monitorFolder = '/home/alex-example/.forge-monitor';
    const deniedRoots = WorkerProfiles.sessionDeniedReadableRootsOf({ ...FACTS, dataFolder: '/example/repository/.forge', monitorFolder });
    expect(deniedRoots).toEqual([
      '/example/repository/.forge/overseer',
      join(monitorFolder, 'watchers'),
      '/home/alex-example/.ssh',
      '/home/alex-example/.aws',
      '/home/alex-example/.gnupg',
    ]);
    expect(overseerTokenPathOf(monitorFolder, 'tracker-example').startsWith(`${deniedRoots[1]}/`)).toBe(true);
  });

  test('a session under mount-points is denied only the credentials that exist, so no mount point is left behind', () => {
    const deniedRoots = WorkerProfiles.sessionDeniedReadableRootsOf({ ...FACTS, sandboxDenyShape: 'mount-points' }, { exists: (path) => path.endsWith('.ssh') });
    expect(deniedRoots.slice(2)).toEqual(['/home/alex-example/.ssh']);
  });

  test('the token and a Watcher secret both sit under a denied folder that no glob names, and the old token path is denied no more', () => {
    const monitorFolder = '/home/alex-example/.forge-monitor';
    const deniedFolder  = join(monitorFolder, 'watchers');
    expect(profile.deniedReadableRoots).toContain(deniedFolder);
    expect(overseerTokenPathOf(monitorFolder, 'tracker-example').startsWith(`${deniedFolder}/`)).toBe(true);
    expect(watcherSecretPathOf(monitorFolder, 'tracker-example', 'J1/gate-1', 1).startsWith(`${deniedFolder}/`)).toBe(true);
    expect(profile.deniedReadableRoots.filter((root) => root.endsWith('/token'))).toEqual([]);
  });

  test('writes outside its worktree only to its own Hatch folder, never to its own branch\'s ref or admin folder by a deny', () => {
    expect(profile.writableRoots).toEqual([]);
    expect(profile.extraWritableDirectory).toBe('/example/repository/.forge-worktrees/hatch/J4');
    expect(profile.deniedWritableRoots.filter((path) => path.endsWith('/ticket-007'))).toEqual([]);
  });

  test('names every path absolutely, so the adapter can anchor each at the filesystem root', () => {
    const paths = [...profile.deniedWritableRoots, ...profile.deniedReadableRoots, profile.extraWritableDirectory, profile.instructionsRoot, profile.gitHooksDirectory];
    expect(paths.filter((path) => !isAbsolute(path))).toEqual([]);
  });

  test('narrows the ~/.gnupg read deny to the private keys when the gpg-agent socket signs, and carries the socket', () => {
    const signing = profileOf('builder', [], { ...FACTS, commitSigning: { kind: 'agent-sockets', sockets: ['/home/alex-example/.gnupg/S.gpg-agent'] } });
    expect(signing.deniedReadableRoots).toContain('/home/alex-example/.gnupg/private-keys-v1.d');
    expect(signing.deniedReadableRoots).not.toContain('/home/alex-example/.gnupg');
    expect(signing.commitSigning).toEqual({ kind: 'agent-sockets', sockets: ['/home/alex-example/.gnupg/S.gpg-agent'] });
  });

  test('may ask, runs no skills, and denies the git verbs that move history or other refs', () => {
    expect(profile).toMatchObject({ askUser: true, skills: false });
    expect(profile.deniedCommandPrefixes).toEqual(expect.arrayContaining([['git', 'push'], ['git', 'rebase'], ['git', 'branch', '-f'], ['git', '-C']]));
  });
});

describe('the network line', () => {
  test('becomes the Bash allowed domains and the WebFetch domains of a builder', () => {
    const profile = profileOf('builder', ['registry.example.com', 'docs.example.org']);
    expect(profile.bashNetworkDomains).toEqual(['registry.example.com', 'docs.example.org']);
    expect(profile.webNetworkDomains).toEqual(['registry.example.com', 'docs.example.org']);
  });

  test('absent, leaves a builder no domain and no web tool', () => {
    expect(profileOf('builder')).toMatchObject({ bashNetworkDomains: [], webNetworkDomains: 'none' });
  });

  test.each(['builder', 'reviewer', 'assistant'] as const)('never gives the %s every domain, which is what lets WebSearch through', (role) => {
    expect(profileOf(role, ['docs.example.org']).webNetworkDomains).not.toBe('any');
  });

  test('gives the product owner every web domain and Bash none', () => {
    expect(profileOf('product-owner', ['docs.example.org'])).toMatchObject({ webNetworkDomains: 'any', bashNetworkDomains: [] });
  });

  test.each(['builder', 'reviewer'] as const)('becomes the %s\'s bash-domains guard, run by the absolute runtime with the entry script first', (role) => {
    expect(profileOf(role, ['registry.example.com', '*.docs.example.org']).networkDomainGuard).toEqual({
      allowedDomains: ['registry.example.com', '*.docs.example.org'],
      programPath:    '/example/bin/bun',
      arguments:      ['--no-env-file', '/example/tool/agent-progress.ts', 'hook', 'bash-domains', '--allow', 'registry.example.com,*.docs.example.org'],
    });
  });

  test('keeps the guard when it cannot start, with no path, so the adapter denies what it would check', () => {
    expect(profileOf('builder', ['registry.example.com'], { ...FACTS, guardCommand: null }).networkDomainGuard)
      .toMatchObject({ allowedDomains: ['registry.example.com'], programPath: null });
  });

  test('absent, leaves a worker no guard', () => {
    expect(profileOf('builder').networkDomainGuard).toBeNull();
  });

  test.each(['product-owner', 'assistant'] as const)('gives the %s no guard, since its role has no network line', (role) => {
    expect(profileOf(role, ['docs.example.org']).networkDomainGuard).toBeNull();
  });
});

/** The tree of `FACTS` as a Linux host holds it: `main` and `ticket-009` only in `packed-refs`, the worktree without `.claude`, no `~/.aws`. */
const LINUX_TREE = new Set([
  '/example/repository/.forge',
  '/example/repository/.forge/jobs',
  '/home/alex-example/.forge-monitor',
  '/home/alex-example/.forge-monitor/watchers',
  '/example/repository/.git/packed-refs',
  '/example/repository/.git/refs/heads/group-example',
  '/example/repository/.git/refs/heads/ticket-003',
  '/example/repository/.git/worktrees/ticket-003',
  '/home/alex-example/.ssh',
  '/home/alex-example/.gnupg',
]);
const LINUX_HOST_PATHS = { exists: (path: string) => LINUX_TREE.has(path) };
const LINUX_FACTS: SandboxFacts = { ...FACTS, sandboxDenyShape: 'mount-points' };

describe('a profile under mount-points, the Linux sandbox\'s deny shape', () => {
  const profile = WorkerProfiles.profileOf('builder', LINUX_FACTS, NO_TOOLCHAIN, LINUX_HOST_PATHS);

  test('denies writes to each existing kind: data, monitor, packed-refs, a group ref, a ticket ref and an admin folder, and to no absent path but .claude', () => {
    expect(profile.deniedWritableRoots).toEqual([
      '/example/repository/.forge',
      '/home/alex-example/.forge-monitor',
      '/example/repository/.forge-worktrees/ticket-007/.claude',
      '/example/repository/.git/packed-refs',
      '/example/repository/.git/refs/heads/group-example',
      '/example/repository/.git/refs/heads/ticket-003',
      '/example/repository/.git/worktrees/ticket-003',
    ]);
  });

  test('denies reads of the jobs folder by its literal name, the watchers folder and each existing credential folder, and of no absent path', () => {
    expect(profile.deniedReadableRoots).toEqual([
      '/example/repository/.forge/jobs',
      '/home/alex-example/.forge-monitor/watchers',
      '/home/alex-example/.ssh',
      '/home/alex-example/.gnupg',
    ]);
    expect(profile.deniedReadableRoots.filter((root) => root.includes('*'))).toEqual([]);
  });

  test('names no absent path for any role but the .claude folder the launch makes, which every role names', () => {
    const madeBeforeLaunch = WorkerProfiles.deniedRootsMadeBeforeLaunchOf(LINUX_FACTS);
    expect(madeBeforeLaunch).toEqual(['/example/repository/.forge-worktrees/ticket-007/.claude']);
    for (const role of ['builder', 'reviewer', 'product-owner', 'assistant'] as const) {
      const roleProfile = WorkerProfiles.profileOf(role, LINUX_FACTS, NO_TOOLCHAIN, LINUX_HOST_PATHS);
      expect([...roleProfile.deniedWritableRoots, ...roleProfile.deniedReadableRoots].filter((path) => !LINUX_TREE.has(path))).toEqual(madeBeforeLaunch);
    }
  });

  test('makes the .claude folder of a worktree that has none, and refuses the launch when it cannot be made', () => {
    const scratch = createScratchDirectory('denied-root-made');
    try {
      const worktree = join(scratch, 'ticket-007');
      mkdirSync(worktree);
      expect(WorkerProfiles.unmadeDeniedRootRefusalOf({ worktree, sandboxDenyShape: 'mount-points' })).toBeNull();
      expect(existsSync(join(worktree, '.claude'))).toBe(true);
      const refusal = WorkerProfiles.unmadeDeniedRootRefusalOf({ worktree, sandboxDenyShape: 'mount-points' }, { makeFolder: () => false });
      expect(refusal).toBe(`the denied folder ${join(worktree, '.claude')} could not be made, so it would get no read-only mount`);
    } finally {
      removeScratchDirectory(scratch);
    }
  });

  test('makes nothing under path-rules, where a deny names an absent path by its rule', () => {
    const neverMade = { makeFolder: () => false };
    expect(WorkerProfiles.deniedRootsMadeBeforeLaunchOf(FACTS)).toEqual([]);
    expect(WorkerProfiles.unmadeDeniedRootRefusalOf(FACTS, neverMade)).toBeNull();
  });

  test('leaves each fixed denied writable root either outside every writable bind or made before launch', () => {
    const temporaryDirectory = '/example/temporary';
    const cacheFolder = '/home/alex-example/.cache/example-tool';
    const writableBinds = [LINUX_FACTS.worktree, '/example/repository/.git/worktrees/ticket-007', '/tmp', '/var/tmp', temporaryDirectory, cacheFolder];
    const insideABind = (root: string) => writableBinds.some((bind) => root === bind || root.startsWith(`${bind}/`));
    const fixedRoots = WorkerProfiles.fixedDeniedWritableRootsOf(LINUX_FACTS);
    expect(fixedRoots.filter(insideABind)).toEqual(WorkerProfiles.deniedRootsMadeBeforeLaunchOf(LINUX_FACTS));
    const plantedFacts: SandboxFacts = { ...LINUX_FACTS, dataFolder: join(LINUX_FACTS.worktree, '.example-data') };
    expect(WorkerProfiles.fixedDeniedWritableRootsOf(plantedFacts).filter(insideABind)).not.toEqual(WorkerProfiles.deniedRootsMadeBeforeLaunchOf(plantedFacts));
  });

  test('gives a branch held only in packed-refs no deny under refs/heads, packed-refs itself staying denied', () => {
    const headsDenies = profile.deniedWritableRoots.filter((path) => path.includes('/refs/heads/'));
    expect(headsDenies).not.toContain('/example/repository/.git/refs/heads/main');
    expect(headsDenies).not.toContain('/example/repository/.git/refs/heads/ticket-009');
    expect(profile.deniedWritableRoots).toContain('/example/repository/.git/packed-refs');
  });

  test('stays under the mount limit for a board with 5000 loose ticket branches and as many worktrees', () => {
    const branchCount = 5000;
    const mountLimit = 3000;
    const branches = Array.from({ length: branchCount }, (_unused, i) => `ticket-${i}`);
    const crowdedFacts: SandboxFacts = {
      ...LINUX_FACTS,
      otherTicketBranches:       branches,
      otherWorktreeAdminFolders: branches.map((branch) => `/example/repository/.git/worktrees/${branch}`),
    };
    const everyPathExists = { exists: () => true };
    const crowded = WorkerProfiles.profileOf('builder', crowdedFacts, NO_TOOLCHAIN, everyPathExists);
    expect(crowded.deniedWritableRoots.length + crowded.deniedReadableRoots.length).toBeLessThan(mountLimit);
    expect(crowded.deniedWritableRoots).toContain('/example/repository/.git/refs/heads/main');
    expect(crowded.deniedWritableRoots).toContain('/example/repository/.git/packed-refs');
  });

  test('bounds the other ticket branches to the live ones, each checked out in a worktree', () => {
    const listing = ['worktree /example/repository', 'branch refs/heads/main', 'worktree /example/worktrees/ticket-003', 'branch refs/heads/ticket-003'];
    expect(WorkerProfiles.liveBranchesOf(['ticket-003', 'ticket-009'], listing)).toEqual(['ticket-003']);
  });

  test('commits unsigned with ~/.gnupg denied whole, since no agent socket reaches the sandbox', () => {
    const signingFacts: SandboxFacts = { ...LINUX_FACTS, commitSigning: { kind: 'agent-sockets', sockets: ['/home/alex-example/.gnupg/S.gpg-agent'] } };
    const signing = WorkerProfiles.profileOf('builder', signingFacts, NO_TOOLCHAIN, LINUX_HOST_PATHS);
    expect(signing.commitSigning).toEqual({ kind: 'unsigned' });
    expect(signing.deniedReadableRoots).toContain('/home/alex-example/.gnupg');
  });
});

describe('a profile under path-rules, the macOS sandbox\'s deny shape', () => {
  const darwinFacts: SandboxFacts = {
    ...FACTS,
    monitorFolder:    '/Users/alex-example/.forge-monitor',
    homeDirectory:    '/Users/alex-example',
    credentialPaths:  ['/Users/alex-example/.ssh', '/Users/alex-example/.aws'],
    gpgHomeDirectory: '/Users/alex-example/.gnupg',
    cacheFolderStyle: dataFoldersFor('darwin', ''),
    // One part, so the guard renders as the table froze it: the program's path and the guard's own arguments.
    guardCommand:     [`/example/bin/${PRODUCT_NAMES.PROGRAM}`],
  };
  const signingFacts: SandboxFacts = { ...darwinFacts, commitSigning: { kind: 'agent-sockets', sockets: ['/Users/alex-example/.gnupg/S.gpg-agent'] } };
  const toolchain = { networkDomains: ['registry.example.org'], writes: [], executables: ['bun'] };
  const roles = ['builder', 'reviewer', 'product-owner', 'assistant'] as const;

  /** Retake the table by rendering these facts with the code before a change meant to alter the macOS output, never after. */
  test('equals the table frozen before the Linux shape existed, for every role, signed and unsigned, whatever the host holds', () => {
    const noPathExists = { exists: () => false };
    const table = Object.fromEntries([['unsigned', darwinFacts], ['agent-sockets', signingFacts]].flatMap(([signing, facts]) =>
      roles.map((role) => [`${role} ${String(signing)}`, WorkerProfiles.profileOf(role, facts as SandboxFacts, toolchain, noPathExists)])));
    expect(JSON.parse(JSON.stringify(table))).toEqual(FROZEN_DARWIN_WORKER_PROFILES);
  });
});

describe('the credentials every role is denied', () => {
  const credentialFacts: SandboxFacts = { ...FACTS, credentialPaths: ['/home/alex-example/.netrc', '/home/alex-example/.claude/.credentials.json'] };

  test.each(['builder', 'reviewer', 'product-owner', 'assistant'] as const)('the %s is denied reading the whole per-OS list', (role) => {
    expect(profileOf(role, [], credentialFacts).deniedReadableRoots).toEqual(expect.arrayContaining([...credentialFacts.credentialPaths]));
  });

  test('a session outside a worktree, as the product owner and the Assistant run, is denied the same list and never reads ~/.ssh', () => {
    const sessionRoots = WorkerProfiles.sessionDeniedReadableRootsOf(credentialFacts);
    expect(sessionRoots).toEqual(expect.arrayContaining([...credentialFacts.credentialPaths]));
    expect(WorkerProfiles.sessionDeniedReadableRootsOf(FACTS)).toContain('/home/alex-example/.ssh');
  });
});

describe('commit signing, as gpgconf reports it', () => {
  const plantedListing = [
    'sysconfdir:/etc/gnupg',
    'homedir:/home/alex-example/example-gnupg',
    'agent-socket:/run/user/1000/gnupg/S.gpg-agent',
    'keyboxd-socket:/run/user/1000/gnupg/S.keyboxd',
    'agent-ssh-socket:/run/user/1000/gnupg/S.gpg-agent.ssh',
  ].join('\n');
  const everySocketExists = { exists: () => true };

  test('allows both the agent and the keyboxd socket a planted listing names', () => {
    const directories = GpgDirectories.read(FACTS.homeDirectory, () => plantedListing);
    const bothSockets = ['/run/user/1000/gnupg/S.gpg-agent', '/run/user/1000/gnupg/S.keyboxd'];
    expect(WorkerProfiles.commitSigningOf(directories, everySocketExists)).toEqual({ kind: 'agent-sockets', sockets: bothSockets });
  });

  test('reads a percent-escaped Windows path whole', () => {
    const directories = GpgDirectories.gpgDirectoriesOf('homedir:C%3a\\Users\\alex-example\\AppData\\Roaming\\gnupg\r\n');
    expect(directories.homeDirectory).toBe('C:\\Users\\alex-example\\AppData\\Roaming\\gnupg');
  });

  test('denies the private keys under the home gpgconf reports, and keeps that home readable while an agent signs', () => {
    const gpgHomeDirectory = GpgDirectories.homeDirectoryOf(GpgDirectories.read(FACTS.homeDirectory, () => plantedListing), FACTS.homeDirectory);
    const commitSigning = WorkerProfiles.commitSigningOf(GpgDirectories.read(FACTS.homeDirectory, () => plantedListing), everySocketExists);
    const signing = profileOf('builder', [], { ...FACTS, gpgHomeDirectory, commitSigning });
    expect(signing.deniedReadableRoots).toContain('/home/alex-example/example-gnupg/private-keys-v1.d');
    expect(signing.deniedReadableRoots).not.toContain('/home/alex-example/example-gnupg');
  });

  test('commits unsigned with no gpgconf, or a failing one, denying GnuPG\'s default home whole, and never throws', () => {
    const missing = GpgDirectories.read(FACTS.homeDirectory, () => null);
    expect(missing).toBeNull();
    expect(WorkerProfiles.commitSigningOf(missing, everySocketExists)).toEqual({ kind: 'unsigned' });
    expect(GpgDirectories.homeDirectoryOf(missing, FACTS.homeDirectory)).toBe('/home/alex-example/.gnupg');
  });

  test('commits unsigned when the agent socket gpgconf names is not there', () => {
    expect(WorkerProfiles.commitSigningOf(GpgDirectories.read(FACTS.homeDirectory, () => plantedListing), { exists: () => false })).toEqual({ kind: 'unsigned' });
  });

  test('logs one line for an unsigned worker only when the repository sets commit.gpgsign', () => {
    const unsigned = profileOf('builder', [], { ...FACTS, commitSigning: WorkerProfiles.commitSigningOf(GpgDirectories.read(FACTS.homeDirectory, () => null)) });
    const notices = [true, false].map((repositorySignsCommits) => WorkerProfiles.unsignedCommitNoticeOf(unsigned, repositorySignsCommits, 'J4'));
    expect(notices.filter((notice) => notice !== null)).toEqual(['Job J4 commits unsigned although the repository sets commit.gpgsign: no gpg-agent socket reaches its sandbox.']);
    const signing = profileOf('builder', [], { ...FACTS, commitSigning: { kind: 'agent-sockets', sockets: ['/run/user/1000/gnupg/S.gpg-agent'] } });
    expect(WorkerProfiles.unsignedCommitNoticeOf(signing, true, 'J4')).toBeNull();
  });
});

describe('the other worktrees\' admin folders', () => {
  const windowsStyle = { pathModule: win32, foldsCase: true };

  test('git\'s C:/ spelling of each admin folder still names every other worktree\'s, never the job\'s own', () => {
    expect(WorkerProfiles.otherWorktreeAdminFoldersOf(windowsStyle, {
      commonGitDirectory: 'C:/Example/Repository/.git',
      listedAdminFolders: ['C:/Example/Repository/.git/worktrees/ticket-003', 'C:/example/repository/.git/worktrees/ticket-004', 'C:/Example/Repository/.git'],
      ownAdminFolder:     'C:/Example/Repository/.git/worktrees/ticket-004',
    })).toEqual(['C:\\Example\\Repository\\.git\\worktrees\\ticket-003']);
  });

  test('on Linux a differently cased folder is another folder', () => {
    expect(WorkerProfiles.otherWorktreeAdminFoldersOf({ pathModule: posix, foldsCase: false }, {
      commonGitDirectory: '/example/repository/.git',
      listedAdminFolders: ['/example/repository/.git/worktrees/ticket-003', '/example/repository/.git/worktrees/Ticket-004'],
      ownAdminFolder:     '/example/repository/.git/worktrees/ticket-004',
    })).toEqual(['/example/repository/.git/worktrees/ticket-003', '/example/repository/.git/worktrees/Ticket-004']);
  });
});
