/**
 * A job's profile in a ticket worktree of a tracker below its repository's root, a checkout of the whole repository nested in the main
 * checkout. What matters: the job writes its whole checkout, so a builder can change the workspace's root lockfile; both the checkout's
 * `.claude` and the project's are denied, and made before a `mount-points` launch; the main checkout's instruction files above the
 * worktree are named for exclusion; and no profile names the worktree's own git admin folder, which the sandbox grants a session started
 * at the worktree's root (`SessionPlace.ts`). A tracker at its repository's root gets exactly the profile it always got.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { dataFoldersFor } from '../../lib/data-folders/DataFoldersFor.ts';
import {
  NO_TOOLCHAIN,
  type ProfiledRole,
  type SandboxFacts,
  WorkerProfiles
} from './WorkerProfiles.ts';

const REPOSITORY = '/example/repository';
const PROJECT_PREFIX = 'apps/forge';
const PROJECT = `${REPOSITORY}/${PROJECT_PREFIX}`;
const WORKTREE = `${PROJECT}/.forge-worktrees/ticket-007`;

const ROOT_TRACKER_FACTS: SandboxFacts = {
  dataFolder:                `${PROJECT}/.forge`,
  monitorFolder:             '/home/alex-example/.forge-monitor',
  homeDirectory:             '/home/alex-example',
  worktree:                  WORKTREE,
  commonGitDirectory:        `${REPOSITORY}/.git`,
  targetBranches:            ['main'],
  otherTicketBranches:       ['forge/ticket-003'],
  otherWorktreeAdminFolders: [],
  hatchDirectory:            `${PROJECT}/.forge-worktrees/hatch/J4`,
  repositoryRoot:            REPOSITORY,
  gitHooksDirectory:         `${REPOSITORY}/.githooks`,
  commitSigning:             { kind: 'unsigned' },
  credentialPaths:           ['/home/alex-example/.ssh'],
  gpgHomeDirectory:          '/home/alex-example/.gnupg',
  executableSearchPath:      [],
  cacheFolderStyle:          dataFoldersFor('linux', ''),
  sandboxDenyShape:          'path-rules',
  guardCommand:              null,
};

const NESTED_FACTS: SandboxFacts = { ...ROOT_TRACKER_FACTS, projectPrefix: PROJECT_PREFIX };

const ROLES: ProfiledRole[] = ['builder', 'reviewer', 'product-owner', 'assistant'];

describe('a tracker at its repository\'s root', () => {
  test.each(ROLES)('gets the %s profile it got before projects, with no write root and no nested exclusions', (role) => {
    const profile = WorkerProfiles.profileOf(role, ROOT_TRACKER_FACTS, NO_TOOLCHAIN);
    expect(profile.writeRoot).toBeUndefined();
    expect(profile.nestedCheckoutAncestors).toBeUndefined();
    expect(WorkerProfiles.profileOf(role, { ...ROOT_TRACKER_FACTS, projectPrefix: '' }, NO_TOOLCHAIN)).toEqual(profile);
  });

  test('denies only the checkout\'s own .claude', () => {
    expect(WorkerProfiles.fixedDeniedWritableRootsOf(ROOT_TRACKER_FACTS).filter((root) => root.endsWith('.claude'))).toEqual([join(WORKTREE, '.claude')]);
  });

  test('names no main checkout folder for a checkout outside it, or for the prefix the root has', () => {
    expect(WorkerProfiles.nestedCheckoutAncestorsOf(REPOSITORY, WORKTREE, '')).toEqual([]);
    expect(WorkerProfiles.nestedCheckoutAncestorsOf(REPOSITORY, '/elsewhere/ticket-007', PROJECT_PREFIX)).toEqual([]);
  });
});

describe('a tracker below its repository\'s root', () => {
  test.each(ROLES)('lets the %s write its whole checkout, by the sandbox and by Edit and Write', (role) => {
    const profile = WorkerProfiles.profileOf(role, NESTED_FACTS, NO_TOOLCHAIN);
    expect(profile.writableRoots).toContain(WORKTREE);
    expect(profile.writeRoot).toBe(WORKTREE);
  });

  test('denies the checkout\'s .claude and the project\'s', () => {
    const claudeFolders = WorkerProfiles.fixedDeniedWritableRootsOf(NESTED_FACTS).filter((root) => root.endsWith('.claude'));
    expect(claudeFolders).toEqual([join(WORKTREE, '.claude'), join(WORKTREE, PROJECT_PREFIX, '.claude')]);
  });

  test('makes both .claude folders before a mount-points launch, so each gets its read-only mount', () => {
    const made: string[] = [];
    const refusal = WorkerProfiles.unmadeDeniedRootRefusalOf(
      { ...NESTED_FACTS, sandboxDenyShape: 'mount-points' },
      { makeFolder: (path) => { made.push(path); return true; } },
    );
    expect(refusal).toBeNull();
    expect(made).toEqual([join(WORKTREE, '.claude'), join(WORKTREE, PROJECT_PREFIX, '.claude')]);
  });

  test.each(ROLES)('gives the %s no write of git\'s common folder or of the worktree\'s own admin folder in it', (role) => {
    const profile = WorkerProfiles.profileOf(role, NESTED_FACTS, NO_TOOLCHAIN);
    expect(profile.writableRoots.filter((root) => root.startsWith(NESTED_FACTS.commonGitDirectory))).toEqual([]);
  });

  test('names the main checkout\'s folders from just above the worktree up to the repository root for exclusion', () => {
    expect(WorkerProfiles.profileOf('builder', NESTED_FACTS, NO_TOOLCHAIN).nestedCheckoutAncestors).toEqual([
      `${PROJECT}/.forge-worktrees`,
      PROJECT,
      `${REPOSITORY}/apps`,
      REPOSITORY,
    ]);
  });
});
