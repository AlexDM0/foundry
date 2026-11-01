/**
 * What keeps the fake git honest: one scenario holding every call shape `src/testing/FakeGit.ts` answers, played on real git and on the fake.
 * Exit codes and output must agree once commit ids and folders are named by first use. Stderr words and a few progress lines may differ:
 * production reads only the exit code there. A file list is compared sorted, since only its set is read. A default spec trusts the fake only
 * because the two agree.
 */
import {
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { GitProcess }                                                                 from '../lib/git/GitProcess.ts';
import { fakeGitRun, initializeFakeGitRepository }                                    from './FakeGit.ts';
import { createScratchDirectory, createScratchGitRepository, removeScratchDirectory } from './ScratchWorkspace.ts';

const COMMIT_IDENTITY = ['-c', 'user.name=Alex Example', '-c', 'user.email=alex@example.com', '-c', 'commit.gpgsign=false'];
const HOOKS_OFF_POLICY = 'hooks-off';

interface Observation {
  question:       string;
  exitCode:       number | null;
  standardOutput: string;
}

type RunGit = (directory: string, gitArguments: readonly string[], hookPolicy?: 'hooks-off' | 'repository-hooks') => { exitCode: number; standardOutput: string } | null;

const scratchDirectories: string[] = [];

function repositoryMadeBy(maker: () => string): string {
  const directory = realpathSync(maker());
  scratchDirectories.push(directory);
  return directory;
}

/** Production reads these calls' exit code only, or a patch only as a fingerprint, whose emptiness the scenario compares itself. */
function answersInWordsOnly(gitArguments: readonly string[]): boolean {
  return gitArguments.includes('commit') || gitArguments.includes('--no-ext-diff') || (gitArguments[0] === 'worktree' && gitArguments[1] === 'add');
}

function normalized(text: string, repository: string, mainBranch: string, commitNames: Map<string, string>): string {
  const withFolders = text.replaceAll(repository, '<repository>');
  const withCommits = withFolders.replace(/\b[0-9a-f]{40}\b/g, (commitId) => {
    const name = commitNames.get(commitId) ?? `<object-${commitNames.size}>`;
    commitNames.set(commitId, name);
    return name;
  });
  return withCommits.replace(new RegExp(`\\b${mainBranch}\\b`, 'g'), '<main>');
}

function playScenario(repository: string, runGit: RunGit): Observation[] {
  const observations: Observation[] = [];
  const commitNames = new Map<string, string>();
  const worktreeFolder = `${repository}-worktrees`;
  const worktree = join(worktreeFolder, 'ticket-001');
  const detached = join(worktreeFolder, 'J1');
  const mainBranch = runGit(repository, ['rev-parse', '--abbrev-ref', 'HEAD'])?.standardOutput.trim() ?? '';

  const write = (directory: string, path: string, text: string): void => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  const ask = (directory: string, gitArguments: readonly string[], options: { sorted?: boolean; hookPolicy?: 'hooks-off' | 'repository-hooks' } = {}): string => {
    const answer = runGit(directory, gitArguments, options.hookPolicy ?? HOOKS_OFF_POLICY);
    const output = answer?.standardOutput ?? '';
    const named  = normalized(output, repository, mainBranch, commitNames);
    observations.push({
      question:       `${directory.replace(repository, '<repository>')}: git ${normalized(gitArguments.join(' '), repository, mainBranch, commitNames)}`,
      exitCode:       answer?.exitCode ?? null,
      standardOutput: answersInWordsOnly(gitArguments) ? '' : options.sorted === true ? named.split('\n').filter((line) => line !== '').sort().join('\n') : named,
    });
    return output.trim();
  };
  const commit = (directory: string, message: string): void => void ask(directory, [...COMMIT_IDENTITY, 'commit', '-q', '-m', message]);
  const tipOf = (directory: string, revision: string): string => ask(directory, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`]);

  mkdirSync(join(repository, 'folder'), { recursive: true });
  ask(repository, ['rev-parse', '--git-common-dir']);
  ask(join(repository, 'folder'), ['rev-parse', '--git-common-dir']);
  ask(repository, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  ask(repository, ['rev-parse', '--absolute-git-dir']);
  ask(repository, ['config', '--get', 'core.hooksPath'], { hookPolicy: 'repository-hooks' });
  ask(repository, ['config', '--get', 'core.hooksPath']);
  ask(repository, ['symbolic-ref', '--quiet', '--short', 'HEAD']);

  write(repository, '.gitignore', '.tracker/\nkept-out/\n*.log\n');
  write(repository, 'tracked.txt', 'first\n');
  write(repository, 'to-delete.txt', 'deleted later\n');
  write(repository, '.tracker/state.json', '{}\n');
  write(repository, 'error.log', 'ignored\n');
  ask(repository, ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames']);
  for (const path of ['.tracker/', '.tracker/state.json', 'error.log', 'kept-out', 'tracked.txt', 'other/']) ask(repository, ['check-ignore', '-q', path]);
  ask(repository, ['add', 'tracked.txt']);
  ask(repository, ['add', '.gitignore']);
  ask(repository, ['add', 'to-delete.txt']);
  ask(repository, ['add', 'error.log']);
  ask(repository, ['status', '--porcelain=v1', '--untracked-files=all']);
  commit(repository, 'Add the tracked files');
  commit(repository, 'A commit of nothing');
  const mainTip = tipOf(repository, 'HEAD');
  tipOf(repository, 'HEAD~1');
  tipOf(repository, 'no-such-branch');
  ask(repository, ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}']);
  ask(repository, ['rev-parse', '--verify', '--quiet', `${mainTip}^{tree}`]);
  ask(repository, ['rev-parse', '--verify', '--quiet', `refs/heads/${mainBranch}`]);
  ask(repository, ['rev-parse', '--verify', '--quiet', 'refs/heads/no-such-branch']);
  ask(repository, ['show', `${mainBranch}:tracked.txt`]);
  ask(repository, ['show', `${mainBranch}:CLAUDE.md`]);
  ask(repository, ['show', 'no-such-branch:CLAUDE.md']);

  ask(repository, ['worktree', 'add', '-b', 'ticket-001', worktree, mainBranch]);
  ask(repository, ['worktree', 'add', '-b', 'ticket-001', `${worktree}-again`, mainBranch]);
  ask(repository, ['worktree', 'add', '--detach', detached, mainBranch]);
  ask(repository, ['worktree', 'list', '--porcelain'], { sorted: true });
  ask(worktree, ['rev-parse', '--git-common-dir']);
  ask(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  ask(worktree, ['rev-parse', '--absolute-git-dir']);
  ask(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']);
  ask(detached, ['rev-parse', '--abbrev-ref', 'HEAD']);
  ask(detached, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  ask(repository, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  ask(repository, ['for-each-ref', '--format=%(refname) %(objectname)']);
  ask(repository, ['worktree', 'remove', '--force', detached]);
  ask(repository, ['worktree', 'list', '--porcelain'], { sorted: true });

  write(worktree, 'built.txt', 'built\n');
  write(worktree, 'nested/deep.txt', 'deep\n');
  write(worktree, 'tracked.txt', 'changed\n');
  rmSync(join(worktree, 'to-delete.txt'));
  ask(worktree, ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames']);
  ask(worktree, ['diff', '--name-only', '--no-renames', mainTip, 'HEAD', '--']);
  expect(ask(worktree, ['diff', '--no-ext-diff', 'HEAD', '--']).length).toBeGreaterThan(0);
  for (const path of ['built.txt', 'nested/deep.txt', 'tracked.txt', 'to-delete.txt']) ask(worktree, ['add', path]);
  ask(worktree, ['status', '--porcelain=v1', '--untracked-files=all']);
  commit(worktree, 'Build the example\n\nCo-Authored-By: Alex Example <alex@example.com>\n');
  write(worktree, 'second.txt', 'second\n');
  ask(worktree, ['add', 'second.txt']);
  commit(worktree, 'Build the second part');
  const ticketTip = tipOf(worktree, 'HEAD');
  ask(worktree, ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames']);
  expect(ask(worktree, ['diff', '--no-ext-diff', 'HEAD', '--'])).toBe('');
  ask(worktree, ['rev-list', `${mainTip}..HEAD`]);
  ask(worktree, ['log', '--name-only', '--no-renames', '--format=', `${mainTip}..HEAD`, '--'], { sorted: true });
  ask(worktree, ['diff', '--name-only', '--no-renames', mainTip, 'HEAD', '--']);
  ask(worktree, ['log', '-1', '--format=%B', tipOf(worktree, 'HEAD~1')]);
  ask(worktree, ['merge-base', mainBranch, 'HEAD']);
  ask(worktree, ['merge-base', '--is-ancestor', mainTip, 'HEAD']);
  ask(worktree, ['merge-base', '--is-ancestor', ticketTip, mainTip]);
  ask(worktree, ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}']);
  ask(repository, ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', mainBranch, 'ticket-001']);
  ask(repository, ['merge', '--ff-only', '--quiet', ticketTip]);
  tipOf(repository, 'HEAD');
  ask(repository, ['status', '--porcelain=v1', '--untracked-files=all']);
  ask(repository, ['show', `${mainBranch}:built.txt`]);

  ask(repository, ['worktree', 'add', '-b', 'ticket-002', join(worktreeFolder, 'ticket-002'), mainBranch]);
  write(join(worktreeFolder, 'ticket-002'), 'tracked.txt', 'from the ticket\n');
  ask(join(worktreeFolder, 'ticket-002'), ['add', 'tracked.txt']);
  commit(join(worktreeFolder, 'ticket-002'), 'Change the tracked file on the ticket');
  write(repository, 'tracked.txt', 'from the main line\n');
  ask(repository, ['add', 'tracked.txt']);
  commit(repository, 'Change the tracked file on the main line');
  ask(repository, ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', mainBranch, 'ticket-002']);
  ask(repository, ['merge', '--ff-only', '--quiet', 'ticket-002']);

  const secondWorktree = join(worktreeFolder, 'ticket-002');
  ask(repository, ['worktree', 'remove', '--force', secondWorktree]);
  ask(repository, ['worktree', 'add', secondWorktree, 'ticket-002']);
  ask(repository, ['worktree', 'add', '--quiet', `${secondWorktree}-again`, 'ticket-002']);
  rmSync(secondWorktree, { recursive: true });
  ask(repository, ['worktree', 'prune']);
  ask(repository, ['worktree', 'list', '--porcelain'], { sorted: true });

  ask(repository, [...COMMIT_IDENTITY, 'commit', '--allow-empty', '--no-verify', '-q', '-m', 'An empty commit']);
  ask(repository, ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}']);
  const trackedText = 'from the main line\n';
  rmSync(join(repository, 'tracked.txt'));
  ask(repository, ['add', 'tracked.txt']);
  commit(repository, 'Delete the tracked file');
  write(repository, 'tracked.txt', trackedText);
  ask(repository, ['add', 'tracked.txt']);
  commit(repository, 'Bring the tracked file back');
  ask(repository, ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}']);
  return observations;
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    removeScratchDirectory(directory);
    removeScratchDirectory(`${directory}-worktrees`);
  }
});

describe('the fake git against real git', () => {
  test('every call shape of the scenario exits and answers the same', () => {
    const realRepository = repositoryMadeBy(() => createScratchGitRepository('real-git'));
    const realObservations = playScenario(realRepository, (directory, gitArguments, hookPolicy) => GitProcess.run(directory, gitArguments, hookPolicy));
    const fakeRepository = repositoryMadeBy(() => {
      const directory = createScratchDirectory('fake-git');
      initializeFakeGitRepository(directory);
      return directory;
    });
    const fakeObservations = playScenario(fakeRepository, fakeGitRun);

    expect(fakeObservations).toEqual(realObservations);
  });

  test('a folder outside any repository is refused as real git refuses it', () => {
    const folder = repositoryMadeBy(() => createScratchDirectory('no-repository'));

    expect(fakeGitRun(folder, ['rev-parse', '--git-common-dir']).exitCode).toBe(GitProcess.run(folder, ['rev-parse', '--git-common-dir'])?.exitCode ?? -1);
  });

  test('a call shape the fake was never taught throws rather than answering empty', () => {
    const repository = repositoryMadeBy(() => {
      const directory = createScratchDirectory('fake-git');
      initializeFakeGitRepository(directory);
      return directory;
    });

    expect(() => fakeGitRun(repository, ['gc'])).toThrow('the fake git has no verb gc');
    expect(() => fakeGitRun(repository, ['diff', '--check', 'HEAD'])).toThrow('the fake git has no diff');
  });
});
