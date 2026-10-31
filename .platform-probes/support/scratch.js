// Scratch folders and repositories for one probe run, under the temp folder and removed when the probe ends.
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runProgram } from './programs.js';

export const removableFolders = [];

const COMMIT_IDENTITY = ['-c', 'user.name=Alex Example', '-c', 'user.email=alex.example@example.com', '-c', 'commit.gpgsign=false'];

export function scratchFolder() {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'platform-probe-')));
  removableFolders.push(folder);
  return folder;
}

export function git(cwd, ...gitArguments) {
  return runProgram(['git', ...COMMIT_IDENTITY, ...gitArguments], { cwd });
}

export async function createRepository(folder) {
  mkdirSync(folder, { recursive: true });
  await git(folder, 'init', '-b', 'main');
  writeFileSync(join(folder, 'file.txt'), 'first\n');
  await git(folder, 'add', '.');
  await git(folder, 'commit', '-m', 'Add the file');
  return folder;
}

/**
 * The layout the probe record uses: a main checkout, its data folder and a linked worktree nested in it, in the record's
 * own names, so a result reads against its macOS entry.
 */
export async function createLinkedRepository() {
  const repository = await createRepository(join(scratchFolder(), 'repo'));
  const data = join(repository, '.agent-progress');
  const worktrees = join(repository, '.agent-progress-worktrees');
  const worktree = join(worktrees, 'ticket-1');
  mkdirSync(join(data, 'gates'), { recursive: true });
  writeFileSync(join(data, 'gates', 'gate.txt'), 'gate\n');
  await git(repository, 'worktree', 'add', worktree, '-b', 'ticket-1');
  return { repository, data, worktrees, worktree, common: join(repository, '.git') };
}
