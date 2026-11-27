/**
 * A job's confinement on a forge with entities (strategy section 3.4). What matters: a forge without entities adds no fact, so its jobs keep
 * today's profile; a job of an entity takes its toolchain from that entity alone, and from none when the pipeline names no such entity; the
 * `.claude` folder of every entity home is denied, also made before a launch under `mount-points` (E7); and a stage's Edit and Write are
 * allowed its entity's homes and `reach` alone, in stage 1 also the homes of the packages it may write a proposal in, as Customs lets it,
 * every other path of the worktree at launch denied them as high in the tree as it holds nothing the stage may change, a deeper home of
 * another entity included (E18). The folders on the way to a stage's folder (the worktree
 * root, `/apps`) are not denied themselves, so no rule names a name made in them after launch: the stage edit guard, run with the stage's
 * folders and from the guard command, denies it, and a forge without entities gets no such guard. The root entity reaches every path no
 * other entity owns. The worktree's names are a planted listing, so a home that is absent at launch shows that its folders are still
 * reached.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }        from '../../domain/tracker-model/@types/Pipeline.ts';
import { dataFoldersFor }       from '../../lib/data-folders/DataFoldersFor.ts';
import { createPosixShellLine } from '../../lib/shell-line/PosixShellLine.ts';
import {
  type FolderEntries,
  NO_TOOLCHAIN,
  type SandboxFacts,
  WorkerProfiles
} from './WorkerProfiles.ts';

const WORKTREE = '/example/repository/.forge-worktrees/ticket-007';

const FACTS: SandboxFacts = {
  dataFolder:                    '/example/repository/.forge',
  monitorFolder:                 '/home/alex-example/.forge-monitor',
  homeDirectory:                 '/example/home/alex-example',
  worktree:                      WORKTREE,
  commonGitDirectory:            '/example/repository/.git',
  targetBranches:                ['main'],
  otherTicketBranches:           [],
  otherWorktreeAdminFolders:     [],
  hatchDirectory:                '/example/repository/.forge-worktrees/hatch/J4',
  repositoryRoot:                '/example/repository',
  gitHooksDirectory:             '/example/repository/.githooks',
  commitSigning:                 { kind: 'unsigned' },
  credentialPaths:               ['/home/alex-example/.ssh'],
  gpgHomeDirectory:              '/home/alex-example/.gnupg',
  executableSearchPath:          [],
  cacheFolderStyle:              dataFoldersFor('linux', ''),
  sandboxDenyShape:              'path-rules',
  agentConfigurationFolderNames: ['.claude'],
  guardCommand:                  null,
};

const NO_PHASES = { build: [], review: [], merge: [] };

const PIPELINE: Pipeline = {
  version:  5,
  prepare:  [],
  gates:    [],
  phases:   NO_PHASES,
  entities: {
    'gaia': {
      kind:    'app',
      home:    ['/apps/gaia'],
      reach:   ['/bun.lock'],
      prepare: [{ name: 'install', run: 'bun install' }],
      gates:   [
        {
          name: 'verify', run: 'bun run verify:gaia', network: ['registry.example.org'], writes: ['~/.cache/example-bun']
        },
        { name: 'deploy-check', run: 'terraform plan', forgeOnly: true },
      ],
      phases: { build: ['verify'], review: ['verify'], merge: ['verify'] },
    },
    'gaia-widgets': {
      kind: 'package', home: ['/apps/gaia/widgets'], prepare: [], gates: [], phases: NO_PHASES, review: { name: 'review' }
    },
    'design-system': {
      kind: 'package', home: ['/packages/design-system/'], prepare: [], gates: [{ name: 'tests', run: 'uv run pytest' }], phases: NO_PHASES, review: { name: 'review' }
    },
  },
};

const POSIX_SHELL_LINE = createPosixShellLine({ userShell: () => undefined });

const WORKTREE_NAMES: Readonly<Record<string, readonly string[]>> = {
  [WORKTREE]:                ['.git', 'apps', 'bun.lock', 'package.json', 'packages', 'scripts'],
  [`${WORKTREE}/apps`]:      ['example', 'gaia'],
  [`${WORKTREE}/apps/gaia`]: ['package.json', 'src', 'widgets'],
  [`${WORKTREE}/packages`]:  ['design-system', 'flint'],
};

const PLANTED_WORKTREE: FolderEntries = { namesIn: (path) => (Object.hasOwn(WORKTREE_NAMES, path) ? WORKTREE_NAMES[path] ?? [] : []) };
const EMPTY_WORKTREE: FolderEntries = { namesIn: () => [] };

function factsOfJob(entityKey?: string): SandboxFacts {
  return { ...FACTS, ...WorkerProfiles.entityFactsOf(PIPELINE, entityKey) };
}

function deniedEditPathsOf(entityKey: string, folderEntries: FolderEntries = PLANTED_WORKTREE): string[] {
  return WorkerProfiles.deniedEditPathsOf({ entities: PIPELINE.entities ?? {}, entityKey }, WORKTREE, folderEntries);
}

describe('a forge without entities', () => {
  const pipeline: Pipeline = {
    version: 5, prepare: [], gates: [{ name: 'tests', run: 'uv run pytest' }], phases: NO_PHASES
  };

  test('adds no sandbox fact, so a job gets the profile it always had', () => {
    expect(WorkerProfiles.entityFactsOf(pipeline)).toEqual({});
    expect(WorkerProfiles.entityFactsOf(null)).toEqual({});
    const profile = WorkerProfiles.profileOf('builder', { ...FACTS, ...WorkerProfiles.entityFactsOf(pipeline) }, NO_TOOLCHAIN, undefined, PLANTED_WORKTREE);
    expect(profile).toEqual(WorkerProfiles.profileOf('builder', FACTS, NO_TOOLCHAIN));
    expect(Object.keys(profile)).not.toContain('stageFolders');
    expect(Object.keys(profile)).not.toContain('deniedEditRoots');
    expect(Object.keys(profile)).not.toContain('stageEditGuard');
  });

  test('gives a job without an entity the board\'s toolchain', () => {
    expect(WorkerProfiles.workerToolchainOf(pipeline, [], POSIX_SHELL_LINE).executables).toEqual(['uv']);
  });
});

describe('the toolchain of a job of an entity', () => {
  test('is its entity\'s steps and gates, an forgeOnly gate left out, its ticket\'s line added', () => {
    expect(WorkerProfiles.workerToolchainOf(PIPELINE, ['docs.example.org'], POSIX_SHELL_LINE, 'gaia')).toEqual({
      networkDomains: ['docs.example.org', 'registry.example.org'],
      writes:         ['~/.cache/example-bun'],
      executables:    ['bun', 'bun'],
    });
  });

  test('is another entity\'s for a job of that entity', () => {
    expect(WorkerProfiles.workerToolchainOf(PIPELINE, [], POSIX_SHELL_LINE, 'design-system').executables).toEqual(['uv']);
  });

  test('is none for an entity the pipeline does not name, and none from the empty top-level lists without an entity', () => {
    expect(WorkerProfiles.workerToolchainOf(PIPELINE, [], POSIX_SHELL_LINE, 'unknown')).toEqual(NO_TOOLCHAIN);
    expect(WorkerProfiles.workerToolchainOf(PIPELINE, [], POSIX_SHELL_LINE)).toEqual(NO_TOOLCHAIN);
  });
});

describe('E7: the .claude folder of every entity home', () => {
  const entityClaudeFolders = [`${WORKTREE}/apps/gaia/.claude`, `${WORKTREE}/apps/gaia/widgets/.claude`, `${WORKTREE}/packages/design-system/.claude`];

  test('is denied to every job of the forge, with or without an entity, beside the worktree root\'s', () => {
    for (const facts of [factsOfJob(), factsOfJob('gaia')]) {
      expect(WorkerProfiles.fixedDeniedWritableRootsOf(facts)).toEqual(expect.arrayContaining([`${WORKTREE}/.claude`, ...entityClaudeFolders]));
    }
  });

  test('names the worktree root\'s once when an entity\'s home is the root', () => {
    const facts: SandboxFacts = { ...FACTS, entityHomes: ['/', '/apps/gaia'] };
    expect(WorkerProfiles.fixedDeniedWritableRootsOf(facts).filter((root) => root === `${WORKTREE}/.claude`)).toHaveLength(1);
  });

  test('is made before a launch under mount-points, and a home whose folder cannot be made refuses the launch', () => {
    const facts = {
      worktree: WORKTREE, sandboxDenyShape: 'mount-points' as const, agentConfigurationFolderNames: ['.claude'], entityHomes: PIPELINE.entities?.['gaia']?.home ?? []
    };
    expect(WorkerProfiles.deniedRootsMadeBeforeLaunchOf(facts)).toEqual([`${WORKTREE}/.claude`, `${WORKTREE}/apps/gaia/.claude`]);
    const unmakable = `${WORKTREE}/apps/gaia/.claude`;
    expect(WorkerProfiles.unmadeDeniedRootRefusalOf(facts, { makeFolder: (path) => path !== unmakable })).toContain(unmakable);
  });
});

describe('E18: the Edit and Write of a stage', () => {
  test('reach an app\'s home and reach, and every other path of the worktree is denied them, a deeper home of another entity included', () => {
    expect(deniedEditPathsOf('gaia')).toEqual(['/.git', '/apps/example', '/apps/gaia/widgets', '/package.json', '/packages', '/scripts']);
  });

  test('reach a package\'s home alone, its trailing slash ignored', () => {
    expect(deniedEditPathsOf('design-system')).toEqual(['/.git', '/apps', '/bun.lock', '/package.json', '/packages/flint', '/scripts']);
  });

  test('of the root entity reach every path no other entity owns', () => {
    expect(deniedEditPathsOf('root')).toEqual(['/apps/gaia', '/packages/design-system']);
  });

  test('still reach a home absent at launch through its folders', () => {
    expect(deniedEditPathsOf('design-system', EMPTY_WORKTREE)).toEqual(['/apps']);
  });

  test('leave a name made after launch in a folder on the way to a stage\'s folder undenied, as no rule names it', () => {
    const denied = deniedEditPathsOf('gaia');
    expect(denied).not.toContain('');
    expect(denied).not.toContain('/apps');
    expect(denied.some((path) => '/new-config.json' === path || '/new-config.json'.startsWith(`${path}/`))).toBe(false);
  });

  test('are in a builder\'s profile as absolute paths, beside the sandbox\'s denies, which stay as they were', () => {
    const profile = WorkerProfiles.profileOf('builder', factsOfJob('gaia'), NO_TOOLCHAIN, undefined, PLANTED_WORKTREE);
    expect(profile.stageFolders).toEqual([`${WORKTREE}/apps/gaia`, `${WORKTREE}/bun.lock`]);
    expect(profile.deniedEditRoots).toEqual(['/.git', '/apps/example', '/apps/gaia/widgets', '/package.json', '/packages', '/scripts']
      .map((path) => `${WORKTREE}${path}`));
    expect(profile.deniedWritableRoots).not.toContain(`${WORKTREE}/scripts`);
  });

  test('are guarded by hook stage-edits with the stage\'s folders, run by the guard command, or by no program when it cannot start', () => {
    const guardCommand = ['/example/bun', '/example/forge/agent-progress.ts'];
    const guarded = WorkerProfiles.profileOf('builder', { ...factsOfJob('gaia'), guardCommand }, NO_TOOLCHAIN, undefined, PLANTED_WORKTREE);
    expect(guarded.stageEditGuard).toEqual({
      stageFolders: [`${WORKTREE}/apps/gaia`, `${WORKTREE}/bun.lock`],
      programPath:  '/example/bun',
      arguments:    ['/example/forge/agent-progress.ts', 'hook', 'stage-edits', '--allow', `${WORKTREE}/apps/gaia`, '--allow', `${WORKTREE}/bun.lock`],
    });
    const unguardable = WorkerProfiles.profileOf('reviewer', factsOfJob('gaia'), NO_TOOLCHAIN, undefined, PLANTED_WORKTREE);
    expect(unguardable.stageEditGuard?.programPath).toBeNull();
  });

  test('of stage 1 also reach the homes of the packages it may write a proposal in, and no other stage names any', () => {
    const proposalHomes = PIPELINE.entities?.['design-system']?.home ?? [];
    const facts = { ...FACTS, ...WorkerProfiles.entityFactsOf(PIPELINE, 'gaia', proposalHomes) };
    const profile = WorkerProfiles.profileOf('builder', facts, NO_TOOLCHAIN, undefined, PLANTED_WORKTREE);
    expect(profile.stageFolders).toEqual([`${WORKTREE}/apps/gaia`, `${WORKTREE}/bun.lock`, `${WORKTREE}/packages/design-system`]);
    expect(profile.deniedEditRoots).toEqual(['/.git', '/apps/example', '/apps/gaia/widgets', '/package.json', '/packages/flint', '/scripts']
      .map((path) => `${WORKTREE}${path}`));
    expect(factsOfJob('gaia').stageEntity).toEqual({ entities: PIPELINE.entities ?? {}, entityKey: 'gaia' });
  });

  test('of a root entity job reach the whole worktree', () => {
    const profile = WorkerProfiles.profileOf('reviewer', factsOfJob('root'), NO_TOOLCHAIN, undefined, PLANTED_WORKTREE);
    expect(profile.stageFolders).toEqual([WORKTREE]);
  });
});
