/**
 * Gathers the answers of real git that `src/testing/RecordedGit.ts` gives the default specs: one case for each call shape, asked in the git
 * state its name says. Each case checks the answer is the one the shape stands for, so a recording never holds a wrong state.
 * `bun run record src/lib/git/GitProcess.ts` runs this spec and writes the answers to `src/testing/recordings/<os>/`.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join }                             from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { recordAnswer }                                              from '../../testing/RecordedAnswers.ts';
import { GIT_CALL_SHAPES, type GitCallShape, RECORDED_PLACEHOLDERS } from '../../testing/RecordedGit.ts';
import {
  addWorktree,
  commitFile,
  createScratchDirectory,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import { GitProcess, type GitRun }  from './GitProcess.ts';

const EXAMPLE_FOLDER = '.example-cache/';
const EXAMPLE_ORIGIN = 'https://example.invalid/example-agency.git';
const EXAMPLE_MISSING_FILE = 'CLAUDE.md';
const NOT_IGNORED_EXIT_CODE = 1;
const NO_SUCH_REMOTE_EXIT_CODE = 2;
const OUTSIDE_EXIT_CODE = 128;

/** The scratch root may sit inside a repository on a developer's machine, so the walk up stops above the folder asked in. */
function ceilingDirectoryAbove(directory: string): string {
  return dirname(realpathSync(directory));
}

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchRepository(): string {
  const repositoryDirectory = createScratchGitRepository('recorded-git-answers');
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

function recordedRun(callShape: GitCallShape, directory: string, gitArguments: readonly string[], ceilingDirectory?: string): GitRun {
  const answer = GitProcess.run(directory, gitArguments, 'hooks-off', undefined, ceilingDirectory);
  if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started`);
  recordAnswer(callShape, answer);
  return answer;
}

describeWhenGitIsPresent('the git answers the default specs replay', () => {
  test('the version answers its version line', () => {
    expect(recordedRun(GIT_CALL_SHAPES.VERSION, scratchRepository(), ['version']).standardOutput).toMatch(/^git version \d+\.\d+/);
  });

  test('the common folder asked at the root of a repository answers .git, relative to the root', () => {
    const answer = recordedRun(GIT_CALL_SHAPES.COMMON_FOLDER_AT_THE_ROOT, scratchRepository(), ['rev-parse', '--git-common-dir']);
    expect(answer).toEqual({ exitCode: 0, standardOutput: '.git\n', standardError: '' });
  });

  test('the common folder asked in a linked worktree answers the main checkout\'s .git, recorded with the repository as its placeholder', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const worktreeDirectory = addWorktree(repositoryDirectory, 'example-worktree');
    const answer = GitProcess.run(worktreeDirectory, ['rev-parse', '--git-common-dir']);
    expect(answer?.standardOutput).toBe(`${join(repositoryDirectory, '.git')}\n`);
    if (answer === null) return;
    recordAnswer(GIT_CALL_SHAPES.COMMON_FOLDER_IN_A_WORKTREE, { ...answer, standardOutput: answer.standardOutput.replace(repositoryDirectory, RECORDED_PLACEHOLDERS.REPOSITORY) });
  });

  test('the common folder asked in a bare repository answers the repository itself, and it says it is bare', () => {
    const bareDirectory = join(createScratchDirectory('recorded-git-bare'), 'bare.git');
    scratchDirectories.push(dirname(bareDirectory));
    Bun.spawnSync(['git', 'init', '-q', '--bare', bareDirectory]);
    expect(recordedRun(GIT_CALL_SHAPES.COMMON_FOLDER_OF_A_BARE, bareDirectory, ['rev-parse', '--git-common-dir']).standardOutput).toBe('.\n');
    expect(recordedRun(GIT_CALL_SHAPES.BARE_ASKED_IN_A_BARE, bareDirectory, ['rev-parse', '--is-bare-repository']).standardOutput).toBe('true\n');
    expect(recordedRun(GIT_CALL_SHAPES.TOP_LEVEL_OF_A_BARE, bareDirectory, ['rev-parse', '--show-toplevel']).exitCode).toBe(OUTSIDE_EXIT_CODE);
  });

  test('the common folder and the top level asked outside any repository answer exit 128', () => {
    const outsideDirectory = createScratchDirectory('recorded-git-outside');
    scratchDirectories.push(outsideDirectory);
    const ceilingEnvironment = ceilingDirectoryAbove(outsideDirectory);
    expect(recordedRun(GIT_CALL_SHAPES.COMMON_FOLDER_OUTSIDE, outsideDirectory, ['rev-parse', '--git-common-dir'], ceilingEnvironment).exitCode).toBe(OUTSIDE_EXIT_CODE);
    expect(recordedRun(GIT_CALL_SHAPES.TOP_LEVEL_OUTSIDE, outsideDirectory, ['rev-parse', '--show-toplevel'], ceilingEnvironment).exitCode).toBe(OUTSIDE_EXIT_CODE);
  });

  test('the origin URL answers exit 2 with no origin, and the URL once one is set, recorded with the URL as its placeholder', () => {
    const repositoryDirectory = scratchRepository();
    expect(recordedRun(GIT_CALL_SHAPES.ORIGIN_URL_UNSET, repositoryDirectory, ['remote', 'get-url', 'origin']).exitCode).toBe(NO_SUCH_REMOTE_EXIT_CODE);
    gitOutputIn(repositoryDirectory, ['remote', 'add', 'origin', EXAMPLE_ORIGIN]);
    const answer = GitProcess.run(repositoryDirectory, ['remote', 'get-url', 'origin']);
    expect(answer?.standardOutput).toBe(`${EXAMPLE_ORIGIN}\n`);
    if (answer === null) return;
    recordAnswer(GIT_CALL_SHAPES.ORIGIN_URL_SET, { ...answer, standardOutput: answer.standardOutput.replace(EXAMPLE_ORIGIN, RECORDED_PLACEHOLDERS.ORIGIN) });
  });

  test('a repository with one checkout and one commit answers its branch, its worktree list, its commit and a missing file, recorded with placeholders', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const branch = gitOutputIn(repositoryDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    const commit = gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']).trim();
    const placeholdersOf = (text: string): string => text.replaceAll(repositoryDirectory, RECORDED_PLACEHOLDERS.REPOSITORY)
      .replaceAll(commit, RECORDED_PLACEHOLDERS.COMMIT).replaceAll(`'${branch}'`, `'${RECORDED_PLACEHOLDERS.BRANCH}'`)
      .replaceAll(`refs/heads/${branch}`, `refs/heads/${RECORDED_PLACEHOLDERS.BRANCH}`).replaceAll(EXAMPLE_MISSING_FILE, RECORDED_PLACEHOLDERS.PATH);
    const recordedWithPlaceholders = (callShape: GitCallShape, gitArguments: readonly string[], branchOutput = false): GitRun | null => {
      const answer = GitProcess.run(repositoryDirectory, gitArguments);
      if (answer === null) return null;
      const standardOutput = branchOutput ? answer.standardOutput.replace(branch, RECORDED_PLACEHOLDERS.BRANCH) : placeholdersOf(answer.standardOutput);
      const recorded = { ...answer, standardOutput, standardError: placeholdersOf(answer.standardError) };
      recordAnswer(callShape, recorded);
      return recorded;
    };

    expect(recordedWithPlaceholders(GIT_CALL_SHAPES.CURRENT_BRANCH, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true))
      .toEqual({ exitCode: 0, standardOutput: '<branch>\n', standardError: '' });
    expect(recordedWithPlaceholders(GIT_CALL_SHAPES.WORKTREE_LIST_MAIN_ONLY, ['worktree', 'list', '--porcelain'])?.standardOutput)
      .toBe('worktree <repository>\nHEAD <commit>\nbranch refs/heads/<branch>\n\n');
    expect(recordedWithPlaceholders(GIT_CALL_SHAPES.BRANCH_VERIFIED, ['rev-parse', '--verify', '--quiet', branch])?.standardOutput).toBe('<commit>\n');
    const resolvedArguments = ['rev-parse', '--verify', '--quiet', '--end-of-options', `${branch}^{commit}`];
    expect(recordedWithPlaceholders(GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED, resolvedArguments)?.standardOutput).toBe('<commit>\n');
    expect(recordedWithPlaceholders(GIT_CALL_SHAPES.FILE_NOT_ON_BRANCH, ['show', `${branch}:${EXAMPLE_MISSING_FILE}`]))
      .toEqual({ exitCode: OUTSIDE_EXIT_CODE, standardOutput: '', standardError: 'fatal: path \'<path>\' does not exist in \'<branch>\'' });
  });

  test('a folder no rule ignores answers exit 1 with no output', () => {
    const answer = recordedRun(GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED, scratchRepository(), ['check-ignore', '-q', EXAMPLE_FOLDER]);
    expect(answer).toEqual({ exitCode: NOT_IGNORED_EXIT_CODE, standardOutput: '', standardError: '' });
  });

  test('the tree of a commit with a reserved name, a symbolic link and a case collision lists each entry, planted through the index', () => {
    const repositoryDirectory = scratchRepository();
    const storedObjectOf = (text: string): string => Bun.spawnSync(['git', 'hash-object', '-w', '--stdin'], { cwd: repositoryDirectory, stdin: Buffer.from(text) })
      .stdout.toString().trim();
    const blob = storedObjectOf('Example Agency\n');
    const target = storedObjectOf('example.txt');
    for (const path of ['aux.c', 'README.md', 'readme.md']) gitOutputIn(repositoryDirectory, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    gitOutputIn(repositoryDirectory, ['update-index', '--add', '--cacheinfo', `120000,${target},example-link`]);
    gitOutputIn(repositoryDirectory, ['commit', '-q', '-m', 'Example unportable tree']);
    const answer = recordedRun(GIT_CALL_SHAPES.TREE_OF_AN_UNPORTABLE_COMMIT, repositoryDirectory, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']);
    expect(answer.standardOutput.split('\0').filter((line) => line !== '').map((line) => line.slice(line.indexOf('\t') + 1)))
      .toEqual(expect.arrayContaining(['README.md', 'aux.c', 'example-link', 'readme.md']));
  });

  test('the diff of an unchanged worktree against HEAD answers exit 0 with no output', () => {
    const answer = recordedRun(GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE, scratchRepository(), ['diff', '--no-ext-diff', 'HEAD', '--']);
    expect(answer).toEqual({ exitCode: 0, standardOutput: '', standardError: '' });
  });

  test('the diff of a worktree with a changed tracked file answers exit 0 with the file\'s diff', () => {
    const repositoryDirectory = scratchRepository();
    commitFile(repositoryDirectory, 'source.txt', 'unformatted\n');
    writeFileSync(join(repositoryDirectory, 'source.txt'), 'formatted\n');
    const answer = recordedRun(GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE, repositoryDirectory, ['diff', '--no-ext-diff', 'HEAD', '--']);
    expect(answer.exitCode).toBe(0);
    expect(answer.standardOutput).toContain('-unformatted\n+formatted');
    const restore = recordedRun(GIT_CALL_SHAPES.CHECKOUT_OF_A_REFORMATTED_FILE, repositoryDirectory, ['checkout', '-q', '--', '.']);
    expect(restore).toEqual({ exitCode: 0, standardOutput: '', standardError: '' });
    expect(readFileSync(join(repositoryDirectory, 'source.txt'), 'utf8')).toBe('unformatted\n');
  });

  test('a revision that does not exist resolves to exit 1 with no output', () => {
    const resolveArguments = ['rev-parse', '--verify', '--quiet', '--end-of-options', 'refs/heads/example-missing^{commit}'];
    const answer = recordedRun(GIT_CALL_SHAPES.RESOLVED_MISSING_REVISION, scratchRepository(), resolveArguments);
    expect(answer).toEqual({ exitCode: 1, standardOutput: '', standardError: '' });
  });

  test('a worktree on a new branch, added quietly and not, then read clean', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const groupWorktree = join(`${repositoryDirectory}-worktrees`, 'group-example');
    const ticketWorktree = join(`${repositoryDirectory}-worktrees`, 'ticket-example');
    scratchDirectories.push(`${repositoryDirectory}-worktrees`);
    const startBranch = gitOutputIn(repositoryDirectory, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const quietAddArguments = ['worktree', 'add', '--quiet', '-b', 'group-example', groupWorktree, startBranch];
    expect(recordedRun(GIT_CALL_SHAPES.QUIET_WORKTREE_ADD_ON_A_NEW_BRANCH, repositoryDirectory, quietAddArguments).exitCode).toBe(0);
    const addArguments = ['worktree', 'add', '-b', 'ticket-example', ticketWorktree, 'group-example'];
    expect(recordedRun(GIT_CALL_SHAPES.WORKTREE_ADD_ON_A_NEW_BRANCH, repositoryDirectory, addArguments).exitCode).toBe(0);
    const status = recordedRun(GIT_CALL_SHAPES.STATUS_OF_A_CLEAN_WORKTREE, ticketWorktree, ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames']);
    expect(status).toEqual({ exitCode: 0, standardOutput: '', standardError: '' });
  });

  test('the tree of a commit answers its tree id, one id for the empty tree and another once a file is committed', () => {
    const repositoryDirectory = scratchRepository();
    const treeArguments = ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'];
    const emptyTree = recordedRun(GIT_CALL_SHAPES.TREE_OF_AN_EMPTY_COMMIT, repositoryDirectory, treeArguments);
    commitFile(repositoryDirectory, 'example.txt', 'Example Agency\n');
    const treeWithAFile = recordedRun(GIT_CALL_SHAPES.TREE_OF_A_COMMIT_WITH_A_FILE, repositoryDirectory, treeArguments);
    expect(emptyTree.standardOutput).toMatch(/^[0-9a-f]{40,64}\n$/);
    expect(treeWithAFile.standardOutput).toMatch(/^[0-9a-f]{40,64}\n$/);
    expect(treeWithAFile.standardOutput).not.toBe(emptyTree.standardOutput);
  });

  test('a folder the .gitignore names answers exit 0 with no output', () => {
    const repositoryDirectory = scratchRepository();
    writeFileSync(join(repositoryDirectory, '.gitignore'), `${EXAMPLE_FOLDER}\n`);
    const answer = recordedRun(GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED, repositoryDirectory, ['check-ignore', '-q', EXAMPLE_FOLDER]);
    expect(answer).toEqual({ exitCode: 0, standardOutput: '', standardError: '' });
  });
});
