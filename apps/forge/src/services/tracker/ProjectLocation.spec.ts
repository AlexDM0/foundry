/**
 * A tracker's place in its repository, read from the `.git` entries on disk. What matters: a tracker at its checkout's root has the prefix
 * `''` and keeps its own spelling as the repository root, so git is handed exactly today's folder; a tracker in a project folder gets the
 * prefix git would print, from the nearest checkout, main or linked; a folder in no repository is its own root; and a project folder in
 * an agent's checkout is that checkout plus the prefix. The `.git` entries are planted, since finding them runs no git.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { projectLocationOf, worktreeProjectLocationOf }   from './ProjectLocation.ts';

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchDirectory(prefix: string): string {
  const directory = createScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return directory;
}

function folderMade(...segments: string[]): string {
  const folder = join(...segments);
  mkdirSync(folder, { recursive: true });
  return folder;
}

function mainCheckout(prefix: string): string {
  const repository = scratchDirectory(prefix);
  folderMade(repository, '.git');
  return repository;
}

test('a tracker at its checkout\'s root has the prefix \'\' and its own spelling as the repository root', () => {
  const repository = mainCheckout('project-location-root');
  expect(projectLocationOf(repository)).toEqual({ repositoryRoot: repository, projectDirectory: repository, projectPrefix: '' });
});

test('a tracker in a project folder has the folder relative to the checkout as its prefix, without a trailing /', () => {
  const repository = mainCheckout('project-location-project');
  const projectDirectory = folderMade(repository, 'apps', 'forge');
  expect(projectLocationOf(projectDirectory)).toEqual({
    repositoryRoot: realpathSync(repository),
    projectDirectory,
    projectPrefix:  'apps/forge',
  });
});

test('a project folder in a linked checkout takes its prefix from that checkout, not from the main checkout around it', () => {
  const repository = mainCheckout('project-location-linked');
  const personCheckout = folderMade(repository, '.claude', 'worktrees', 'person');
  writeFileSync(join(personCheckout, '.git'), `gitdir: ${join(repository, '.git', 'worktrees', 'person')}\n`);
  const projectDirectory = folderMade(personCheckout, 'apps', 'gaia');
  const location = projectLocationOf(projectDirectory);
  expect(location.repositoryRoot).toBe(realpathSync(personCheckout));
  expect(location.projectPrefix).toBe('apps/gaia');
});

test('a folder in no repository is its own repository root with the prefix \'\'', () => {
  const plainFolder = scratchDirectory('project-location-plain');
  expect(projectLocationOf(plainFolder)).toEqual({ repositoryRoot: plainFolder, projectDirectory: plainFolder, projectPrefix: '' });
});

test('with the prefix \'\' an agent\'s checkout is itself the project folder in it', () => {
  const location = { repositoryRoot: '/example/repository', projectDirectory: '/example/repository', projectPrefix: '' };
  expect(worktreeProjectLocationOf(location, '/example/repository/.forge-worktrees/ticket-7')).toEqual({
    worktreeRoot:               '/example/repository/.forge-worktrees/ticket-7',
    projectDirectoryInWorktree: '/example/repository/.forge-worktrees/ticket-7',
  });
});

test('with a project prefix the project folder in an agent\'s checkout is the checkout plus the prefix', () => {
  const location = { repositoryRoot: '/example/repository', projectDirectory: '/example/repository/apps/forge', projectPrefix: 'apps/forge' };
  expect(worktreeProjectLocationOf(location, '/example/repository/apps/forge/.forge-worktrees/ticket-7')).toEqual({
    worktreeRoot:               '/example/repository/apps/forge/.forge-worktrees/ticket-7',
    projectDirectoryInWorktree: '/example/repository/apps/forge/.forge-worktrees/ticket-7/apps/forge',
  });
});
