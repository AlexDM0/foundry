/**
 * What keeps the fake git honest: one scenario holding every call shape `src/testing/FakeGit.ts` answers, played on real git and on the fake.
 * Exit codes and output must agree once commit ids and folders are named by first use. Stderr words and a few progress lines may differ:
 * production reads only the exit code there. A file list is compared sorted, since only its set is read. A default spec trusts the fake only
 * because the two agree.
 */
import {
  mkdirSync,
  readFileSync,
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

type RunGit = (
  directory: string, gitArguments: readonly string[], hookPolicy?: 'hooks-off' | 'repository-hooks', standardInput?: string
) => { exitCode: number; standardOutput: string } | null;

interface AskOptions {
  sorted?:        boolean;
  firstLineOnly?: boolean;
  hookPolicy?:    'hooks-off' | 'repository-hooks';
  standardInput?: string;
}

/** The changed lines of a patch, counted: what production reads of `log --patch`, whose text the scenario does not compare. */
function changedLineCountsOf(patch: string): string {
  const lines = patch.split('\n');
  const added   = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
  const removed = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length;
  return `${added} added, ${removed} removed`;
}

const scratchDirectories: string[] = [];

function repositoryMadeBy(maker: () => string): string {
  const directory = realpathSync(maker());
  scratchDirectories.push(directory);
  return directory;
}

/**
 * Production reads these calls' exit code only, or a patch only as a fingerprint or a count of its changed lines, whose emptiness the
 * scenario compares itself.
 */
function answersInWordsOnly(gitArguments: readonly string[]): boolean {
  const verb = gitArguments.find((argument, i) => !argument.startsWith('-') && gitArguments[i - 1] !== '-c');
  return gitArguments.includes('commit') || gitArguments.includes('--no-ext-diff') || (gitArguments[0] === 'worktree' && gitArguments[1] === 'add')
    || ['branch', 'merge', 'reset', 'ls-files'].includes(verb ?? '') || gitArguments.includes('--check');
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
  const ask = (directory: string, gitArguments: readonly string[], options: AskOptions = {}): string => {
    const answer = runGit(directory, gitArguments, options.hookPolicy ?? HOOKS_OFF_POLICY, options.standardInput);
    const output = options.firstLineOnly === true ? (answer?.standardOutput ?? '').split('\n')[0] ?? '' : answer?.standardOutput ?? '';
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
  ask(repository, ['rev-parse', '--end-of-options', mainBranch, 'ticket-001']);
  ask(repository, ['rev-parse', '--end-of-options', mainBranch, 'no-such-branch']);
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
  const batchArguments = ['merge-tree', '--stdin', '--name-only', '--no-messages', '-z'];
  ask(repository, batchArguments, { standardInput: `${mainBranch} ticket-001\n${mainBranch} ticket-002\n` });
  ask(repository, batchArguments, { standardInput: `${mainBranch} no-such-branch\n` });
  ask(repository, ['rev-list', '--count', '--end-of-options', `ticket-002..${mainBranch}`]);
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

  // A merge job's merge and its resolver's work: a clean merge, a conflicted one aborted, then resolved and committed.
  const mergingWorktree = join(worktreeFolder, 'ticket-003');
  ask(repository, ['worktree', 'add', '-b', 'ticket-003', mergingWorktree, mainBranch]);
  write(mergingWorktree, 'merged.txt', 'from the ticket\n');
  ask(mergingWorktree, ['add', 'merged.txt']);
  commit(mergingWorktree, 'Add the merged file on the ticket');
  const branchTip = tipOf(mergingWorktree, 'HEAD');
  ask(mergingWorktree, ['rev-parse', 'HEAD']);
  write(repository, 'clean.txt', 'merges cleanly\n');
  ask(repository, ['add', 'clean.txt']);
  commit(repository, 'Add a file the ticket does not touch');
  const cleanTip = tipOf(repository, 'HEAD');
  write(repository, 'merged.txt', 'from the main line\n');
  ask(repository, ['add', 'merged.txt']);
  commit(repository, 'Add the merged file on the main line');
  const targetTip = tipOf(repository, 'HEAD');
  ask(mergingWorktree, ['merge', '--no-ff', '--no-edit', '--quiet', cleanTip]);
  ask(mergingWorktree, ['rev-list', '--parents', '-n', '1', 'HEAD']);
  ask(mergingWorktree, ['reset', '--hard', '--quiet', branchTip]);
  tipOf(mergingWorktree, 'HEAD');
  ask(mergingWorktree, ['merge', '--no-ff', '--no-edit', '--quiet', targetTip]);
  tipOf(mergingWorktree, 'MERGE_HEAD');
  ask(mergingWorktree, ['diff', '--name-only', '--diff-filter=U', '-z']);
  ask(mergingWorktree, ['ls-files', '-u']);
  ask(mergingWorktree, ['merge', '--abort']);
  tipOf(mergingWorktree, 'MERGE_HEAD');
  ask(mergingWorktree, ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames']);
  ask(mergingWorktree, ['merge', '--no-ff', '--no-edit', '--quiet', targetTip]);
  ask(mergingWorktree, [...COMMIT_IDENTITY, 'commit', '-q', '--no-edit']);
  write(mergingWorktree, 'merged.txt', 'from the ticket and the main line\n');
  ask(mergingWorktree, ['add', 'merged.txt']);
  ask(mergingWorktree, ['diff', '--name-only', '--diff-filter=U', '-z']);
  ask(mergingWorktree, [...COMMIT_IDENTITY, 'commit', '-q', '--no-edit']);
  ask(mergingWorktree, ['rev-list', '--parents', '--max-count=1', 'HEAD']);
  ask(mergingWorktree, ['rev-list', '--merges', '--reverse', `${branchTip}..HEAD`, `^${targetTip}`]);
  ask(mergingWorktree, ['rev-list', `${branchTip}..HEAD`, `^${targetTip}`]);
  ask(mergingWorktree, ['config', '--get', 'core.whitespace']);
  ask(mergingWorktree, ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', branchTip, 'HEAD', '--', 'merged.txt']);
  ask(mergingWorktree, ['-c', 'merge.conflictStyle=merge', 'merge-tree', '--write-tree', '--no-messages', '--name-only', branchTip, targetTip]);
  const automaticTree = ask(mergingWorktree, ['merge-tree', '--write-tree', '--no-messages', branchTip, targetTip], { firstLineOnly: true });
  expect(ask(mergingWorktree, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', automaticTree, 'HEAD'])).toContain('+from the ticket and the main line');
  write(mergingWorktree, 'merged.txt', '<<<<<<< HEAD\nleft behind\n=======\n>>>>>>> main\n');
  ask(mergingWorktree, ['add', 'merged.txt']);
  commit(mergingWorktree, 'Leave the conflict markers in');
  ask(mergingWorktree, ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', branchTip, 'HEAD', '--', 'merged.txt']);
  ask(repository, ['-c', 'core.longpaths=true', 'config', '--bool', 'core.longpaths']);
  ask(repository, ['config', '--bool', 'core.longpaths']);

  // What a lifecycle spec plants by hand: branches checked out and moved, a merge stopped before its commit, a blocked fast-forward.
  const planting = join(worktreeFolder, 'ticket-005');
  ask(repository, ['worktree', 'add', '-q', '-b', 'ticket-005', planting]);
  const plantingBase = tipOf(planting, 'HEAD');
  write(planting, 'planted/one.txt', 'one\n');
  write(planting, 'planted/two.txt', 'two\n');
  ask(planting, ['add', '--', 'planted']);
  ask(planting, ['status', '--porcelain=v1', '--untracked-files=all']);
  commit(planting, 'Add the planted folder');
  ask(planting, ['rm', '-q', '--', 'planted/two.txt']);
  commit(planting, 'Remove a planted file');
  ask(planting, ['log', '--name-only', '--no-renames', '--format=', `${plantingBase}..HEAD`, '--'], { sorted: true });
  ask(planting, ['reset', '-q', '--hard', 'HEAD~1']);
  tipOf(planting, 'HEAD');
  ask(planting, ['checkout', '-q', '-b', 'ticket-005', plantingBase]);
  ask(planting, ['checkout', '-q', '-b', 'planted-target', plantingBase]);
  ask(planting, ['rev-parse', '--abbrev-ref', 'HEAD']);
  write(planting, 'target.txt', 'target\n');
  ask(planting, ['add', '--', 'target.txt']);
  commit(planting, 'Add the target file');
  const plantedTargetTip = tipOf(planting, 'HEAD');
  ask(planting, ['checkout', '-q', '-']);
  ask(planting, ['rev-parse', '--abbrev-ref', 'HEAD']);
  ask(planting, [...COMMIT_IDENTITY, 'merge', '-q', '--no-ff', '--no-commit', 'planted-target']);
  tipOf(planting, 'MERGE_HEAD');
  commit(planting, 'Merge the planted target');
  ask(planting, ['rev-list', '--parents', '-n', '1', 'HEAD']);
  ask(planting, ['log', '--name-only', '--no-renames', '--format=', `${plantingBase}..HEAD`, `^${plantedTargetTip}`, '--'], { sorted: true });
  ask(planting, ['checkout', '-q', '--detach', plantingBase]);
  ask(planting, ['rev-parse', '--abbrev-ref', 'HEAD']);
  ask(planting, ['checkout', '-q', '-']);
  ask(planting, ['checkout', '-q', 'ticket-005']);
  ask(planting, ['checkout', '-q', mainBranch]);
  ask(planting, ['checkout', '-q', '-B', 'planted-reset', plantingBase]);
  ask(planting, ['checkout', '-q', 'ticket-005']);
  ask(repository, ['branch', 'planted-copy', plantedTargetTip]);
  ask(repository, ['branch', 'planted-copy', plantedTargetTip]);
  ask(repository, ['branch', '-f', 'planted-copy', plantingBase]);
  ask(repository, ['branch', '-f', 'ticket-005', plantingBase]);
  ask(repository, ['for-each-ref', '--format=%(refname) %(objectname)']);
  ask(repository, ['branch', '-D', 'ticket-005']);
  ask(repository, ['branch', '-D', 'no-such-branch']);
  ask(repository, ['branch', '-D', 'planted-copy', 'planted-reset']);
  ask(repository, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);

  ask(planting, ['checkout', '-q', '-b', 'planted-ahead']);
  write(planting, 'ahead.txt', 'ahead\n');
  ask(planting, ['add', '--', 'ahead.txt']);
  commit(planting, 'Add the file ahead');
  ask(planting, ['checkout', '-q', 'ticket-005']);
  write(planting, 'ahead.txt', 'a local file in the way\n');
  ask(planting, ['merge', '--ff-only', '--quiet', 'planted-ahead']);
  rmSync(join(planting, 'ahead.txt'));
  ask(planting, ['merge', '--ff-only', '--quiet', 'planted-ahead']);
  ask(planting, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']);
  ask(planting, ['hash-object', '--stdin-paths'], { standardInput: 'target.txt\nplanted/one.txt\n' });
  ask(planting, ['diff', '--shortstat', '--no-color', `${plantedTargetTip}...HEAD`]);
  ask(planting, ['diff', '--shortstat', '--no-color', `${plantingBase}...${plantingBase}`]);

  // A group's worktrees: the branch read in full, a refresh detached, a dirty worktree kept by an unforced removal, `branch -d` of each kind.
  ask(planting, ['symbolic-ref', '--quiet', 'HEAD']);
  ask(planting, ['checkout', '--quiet', '--detach', plantingBase]);
  ask(planting, ['symbolic-ref', '--quiet', 'HEAD']);
  ask(planting, ['checkout', '-q', 'ticket-005']);
  const groupWorktree = join(worktreeFolder, 'group-example');
  ask(repository, ['worktree', 'add', '--quiet', '-b', 'group-example', groupWorktree, mainBranch]);
  const committedText = readFileSync(join(groupWorktree, 'tracked.txt'), 'utf8');
  write(groupWorktree, 'untracked.txt', 'untracked\n');
  ask(groupWorktree, ['status', '--porcelain=v1', '--untracked-files=no']);
  ask(repository, ['worktree', 'remove', groupWorktree]);
  write(groupWorktree, 'tracked.txt', 'changed in the group worktree\n');
  rmSync(join(groupWorktree, 'untracked.txt'));
  ask(groupWorktree, ['status', '--porcelain=v1', '--untracked-files=no']);
  ask(repository, ['worktree', 'remove', groupWorktree]);
  write(groupWorktree, 'tracked.txt', committedText);
  ask(repository, ['worktree', 'remove', groupWorktree]);
  ask(repository, ['worktree', 'list', '--porcelain'], { sorted: true });
  ask(repository, ['branch', '-d', 'group-example']);
  ask(repository, ['branch', '-d', 'planted-ahead']);
  ask(repository, ['branch', '-d', 'ticket-005']);
  ask(repository, ['branch', '-d', 'no-such-branch']);
  ask(repository, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);

  // A CRLF file judged by `diff --check`: plain git reads each CR as trailing whitespace, `cr-at-eol` as the line ending.
  write(planting, 'crlf-check.txt', 'base line\r\n');
  ask(planting, ['-c', 'core.autocrlf=false', 'add', '--', 'crlf-check.txt']);
  commit(planting, 'Add the CRLF file');
  const crlfBase = tipOf(planting, 'HEAD');
  write(planting, 'crlf-check.txt', 'base line\r\nadded line\r\n');
  ask(planting, ['-c', 'core.autocrlf=false', 'add', '--', 'crlf-check.txt']);
  commit(planting, 'Add a CRLF line');
  ask(planting, ['diff', '--check', crlfBase, 'HEAD', '--', 'crlf-check.txt']);
  ask(planting, ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', crlfBase, 'HEAD', '--', 'crlf-check.txt']);
  write(planting, 'crlf-check.txt', 'base line\r\nadded line \r\n');
  ask(planting, ['-c', 'core.autocrlf=false', 'add', '--', 'crlf-check.txt']);
  commit(planting, 'Add a trailing space before the CR');
  ask(planting, ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', crlfBase, 'HEAD', '--', 'crlf-check.txt']);
  ask(planting, ['config', 'core.whitespace', '-blank-at-eol']);
  ask(planting, ['config', '--get', 'core.whitespace']);
  ask(planting, ['-c', 'core.whitespace=-blank-at-eol,cr-at-eol', 'diff', '--check', crlfBase, 'HEAD', '--', 'crlf-check.txt']);
  write(planting, 'crlf-check.txt', 'changed base line\r\nadded line\r\nanother line\r\n');
  ask(planting, ['-c', 'core.autocrlf=false', 'add', '--', 'crlf-check.txt']);
  commit(planting, 'Rework the CRLF file');
  const patch = ask(planting, ['log', '--patch', '--format=', '--no-show-signature', '--no-color', '--no-ext-diff', '--find-renames', `${plantedTargetTip}..HEAD`]);
  observations.push({ question: 'the changed lines of log --patch', exitCode: 0, standardOutput: changedLineCountsOf(patch) });
  ask(planting, ['diff', '--shortstat', '--no-color', '--no-ext-diff', `${crlfBase}...HEAD`]);
  ask(repository, ['config', 'core.hooksPath', 'example-hooks']);
  ask(repository, ['config', '--get', 'core.hooksPath'], { hookPolicy: 'repository-hooks' });
  ask(repository, ['config', '--get', 'core.hooksPath']);

  // A CRLF blob committed before a `* text` attribute: a fresh checkout of it already differs from its commit.
  write(repository, 'crlf.txt', 'first line\r\nsecond line\r\n');
  // A user's `core.autocrlf` would convert the blob; the fake converts nothing without an attribute.
  ask(repository, ['-c', 'core.autocrlf=false', 'add', 'crlf.txt']);
  commit(repository, 'Add a file with CRLF line endings');
  write(repository, '.gitattributes', '* text\n');
  ask(repository, ['add', '.gitattributes']);
  commit(repository, 'Normalise line endings');
  const normalisingWorktree = join(worktreeFolder, 'ticket-004');
  ask(repository, ['worktree', 'add', '-b', 'ticket-004', normalisingWorktree, mainBranch]);
  ask(normalisingWorktree, ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames']);
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
    const realObservations = playScenario(realRepository, (directory, gitArguments, hookPolicy, standardInput) => (
      GitProcess.run(directory, gitArguments, hookPolicy, standardInput)
    ));
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
