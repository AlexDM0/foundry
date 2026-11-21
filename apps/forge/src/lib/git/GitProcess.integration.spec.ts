/**
 * The one git Hephaestus, against real git in scratch repositories. What matters is what every caller parses: standard output arrives raw so a
 * caller decides what to trim, standard error arrives trimmed for a reason text, a path is printed unquoted, a git that cannot be started
 * reads as null rather than a throw, and a revision shaped like an option is looked up rather than obeyed.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { jsonPrintedByAChildProcess } from '../../testing/JsonPrintedByAChildProcess.ts';
import {
  createCanonicalScratchDirectory,
  createScratchDirectory,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import { GitProcess }               from './GitProcess.ts';

const {
  directoryExists,
  failureReasonOf,
  resolvedCommitOf,
  run,
  succeeded,
} = GitProcess;

const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/;

const scratchDirectories: string[] = [];

function scratchGitRepository(prefix: string): string {
  const repositoryDirectory = createScratchGitRepository(prefix);
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function gitVersionRunIn(directory: string, searchPath: string): unknown {
  const gitModule = JSON.stringify(join(import.meta.dir, 'GitProcess.ts'));
  return jsonPrintedByAChildProcess({ PATH: searchPath }, [
    `process.chdir(${JSON.stringify(directory)});`,
    `const { GitProcess } = await import(${gitModule});`,
    `console.log(JSON.stringify(GitProcess.run(${JSON.stringify(directory)}, ['version'])));`,
  ].join('\n'));
}

function fakeGitIn(folder: string, printed: string): void {
  mkdirSync(folder, { recursive: true });
  const path = join(folder, 'git');
  writeFileSync(path, `#!/bin/sh\necho ${printed}\n`);
  chmodSync(path, 0o755);
}

describe('the git a run resolves', () => {
  function scratchFolder(): string {
    const directory = createCanonicalScratchDirectory('git-process-resolve');
    scratchDirectories.push(directory);
    return directory;
  }

  test('an unresolved git answers null, as a git that cannot start does', () => {
    const directory = scratchFolder();
    expect(gitVersionRunIn(directory, join(directory, 'no-such-folder'))).toBeNull();
  });

  test('a git planted in the working directory is passed over for the one on PATH', () => {
    const directory = scratchFolder();
    const worktree = join(directory, 'worktree');
    fakeGitIn(worktree, 'planted');
    fakeGitIn(join(directory, 'installed'), 'installed');
    expect(gitVersionRunIn(worktree, join(directory, 'installed'))).toMatchObject({ exitCode: 0, standardOutput: 'installed\n' });
  });

  test('an absolute PATH folder spelt with a doubled or dotted segment still runs its git', () => {
    const directory = scratchFolder();
    const worktree = join(directory, 'worktree');
    mkdirSync(worktree);
    fakeGitIn(join(directory, 'installed'), 'installed');
    for (const spelling of [`${directory}//installed`, `${directory}/./installed`, `${directory}/worktree/../installed`]) {
      expect(gitVersionRunIn(worktree, spelling)).toMatchObject({ exitCode: 0, standardOutput: 'installed\n' });
    }
  });

  test('a git PATH finds inside the working directory answers null', () => {
    const directory = scratchFolder();
    fakeGitIn(join(directory, 'tools'), 'planted');
    expect(gitVersionRunIn(directory, join(directory, 'tools'))).toBeNull();
  });

  // Only `.git` entries are laid out, no git is run: the planted git is the only one PATH holds.
  function mainCheckoutWithAWorktree(): { mainCheckout: string; worktree: string; subfolder: string } {
    const directory = scratchFolder();
    const mainCheckout = join(directory, 'main-checkout');
    const worktree = join(directory, 'worktrees', 'ticket-1');
    const subfolder = join(mainCheckout, 'src', 'feature');
    mkdirSync(join(mainCheckout, '.git', 'worktrees', 'ticket-1'), { recursive: true });
    mkdirSync(subfolder, { recursive: true });
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, '.git'), `gitdir: ${join(mainCheckout, '.git', 'worktrees', 'ticket-1')}\n`);
    return { mainCheckout, worktree, subfolder };
  }

  test('a git planted in the main checkout answers null for a run in a worktree of it and for a run in a subfolder of it', () => {
    const { mainCheckout, worktree, subfolder } = mainCheckoutWithAWorktree();
    const plantedFolder = join(mainCheckout, 'tools');
    fakeGitIn(plantedFolder, 'planted');
    expect(gitVersionRunIn(worktree, plantedFolder)).toBeNull();
    expect(gitVersionRunIn(subfolder, plantedFolder)).toBeNull();
  });

  test('the same git outside the repository runs for a run in the worktree and in the subfolder', () => {
    const { mainCheckout, worktree, subfolder } = mainCheckoutWithAWorktree();
    const installedFolder = join(mainCheckout, '..', 'installed');
    fakeGitIn(installedFolder, 'installed');
    expect(gitVersionRunIn(worktree, installedFolder)).toMatchObject({ exitCode: 0, standardOutput: 'installed\n' });
    expect(gitVersionRunIn(subfolder, installedFolder)).toMatchObject({ exitCode: 0, standardOutput: 'installed\n' });
  });
});

describeWhenGitIsPresent('a git run', () => {
  test('a successful command answers exit 0 with its standard output untrimmed', () => {
    const repositoryDirectory = scratchGitRepository('git-process-success');
    expect(run(repositoryDirectory, ['rev-parse', '--is-inside-work-tree'])).toEqual({
      exitCode:       0,
      standardOutput: 'true\n',
      standardError:  '',
    });
  });

  test('a failing command answers its own exit code with standard error trimmed', () => {
    const repositoryDirectory = scratchGitRepository('git-process-failure');
    expect(run(repositoryDirectory, ['rev-parse', '--verify', 'refs/heads/no-such-branch'])).toEqual({
      exitCode:       128,
      standardOutput: '',
      standardError:  'fatal: Needed a single revision',
    });
  });

  // BranchIntegration names the files a worktree still holds from this output, so a quoted, octal-escaped name would name no file at all;
  // the repository asks for quoting, so only Hephaestus's own override can unquote it.
  test('a non-ASCII file name is printed unquoted, whatever the user\'s own configuration says', () => {
    const repositoryDirectory = scratchGitRepository('git-process-unquoted');
    gitOutputIn(repositoryDirectory, ['config', 'core.quotePath', 'true']);
    writeFileSync(join(repositoryDirectory, 'café.txt'), 'content\n');
    const finishedRun = run(repositoryDirectory, ['status', '--porcelain=v1', '--untracked-files=all']);
    expect(finishedRun?.standardOutput).toBe('?? café.txt\n');
  });

  // The repository's hooks are worker-writable code: a run turns them off unless its caller asks for them by name.
  test('a run sees no hooks folder by default, and the repository\'s own only when it asks for repository hooks', () => {
    const repositoryDirectory = scratchGitRepository('git-process-hooks');
    gitOutputIn(repositoryDirectory, ['config', 'core.hooksPath', '.githooks']);
    const hooksOffPath = `${join(Bun.which('git') ?? '', 'hooks-off')}\n`;
    expect(run(repositoryDirectory, ['config', 'core.hooksPath'])?.standardOutput).toBe(hooksOffPath);
    expect(run(repositoryDirectory, ['config', 'core.hooksPath'], 'hooks-off')?.standardOutput).toBe(hooksOffPath);
    expect(run(repositoryDirectory, ['config', 'core.hooksPath'], 'repository-hooks')?.standardOutput).toBe('.githooks\n');
  });

  // The hooks-off path lies below the git program, a regular file, so no folder can be made there; `/dev/null` is `<drive>:\dev\null` on Windows.
  test('a failing pre-commit hook the repository plants stays unrun with hooks off, and runs when the run asks for repository hooks', () => {
    const repositoryDirectory = scratchGitRepository('git-process-planted-hook');
    mkdirSync(join(repositoryDirectory, '.githooks'));
    writeFileSync(join(repositoryDirectory, '.githooks', 'pre-commit'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(repositoryDirectory, '.githooks', 'pre-commit'), 0o755);
    gitOutputIn(repositoryDirectory, ['config', 'core.hooksPath', '.githooks']);
    const commit = [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '--allow-empty', '-q', '-m', 'Example commit'];
    expect(run(repositoryDirectory, commit, 'repository-hooks')?.exitCode).not.toBe(0);
    expect(run(repositoryDirectory, commit)?.exitCode).toBe(0);
  });

  test('every run has core.longpaths set, whatever the repository says', () => {
    const repositoryDirectory = scratchGitRepository('git-process-long-paths');
    gitOutputIn(repositoryDirectory, ['config', 'core.longpaths', 'false']);
    expect(run(repositoryDirectory, ['config', '--bool', 'core.longpaths'])?.standardOutput).toBe('true\n');
  });

  test('a working directory that does not exist reads as git not started, never as a throw', () => {
    const parentDirectory = createScratchDirectory('git-process-missing');
    scratchDirectories.push(parentDirectory);
    expect(run(join(parentDirectory, 'missing'), ['status'])).toBeNull();
  });
});

describe('the reason a failed run gives', () => {
  test('a run that could not be started names the command and says so', () => {
    expect(failureReasonOf(null, ['merge', '--ff-only', 'abc'])).toBe('git merge --ff-only abc could not be started.');
  });

  test('a run that failed names the command, its exit code and its standard error', () => {
    const finishedRun = { exitCode: 128, standardOutput: '', standardError: 'fatal: Needed a single revision' };
    expect(failureReasonOf(finishedRun, ['rev-parse', 'HEAD'])).toBe('git rev-parse HEAD exited with 128: fatal: Needed a single revision');
  });
});

describe('whether a run succeeded', () => {
  test('a run that could not be started did not succeed', () => {
    expect(succeeded(null)).toBe(false);
  });

  test('a run that exited non-zero did not succeed', () => {
    expect(succeeded({ exitCode: 1, standardOutput: '', standardError: '' })).toBe(false);
  });

  test('a run that exited 0 succeeded', () => {
    expect(succeeded({ exitCode: 0, standardOutput: 'true\n', standardError: '' })).toBe(true);
  });
});

describe('whether a directory exists to run git in', () => {
  test('a scratch directory exists', () => {
    const directory = createScratchDirectory('git-process-directory');
    scratchDirectories.push(directory);
    expect(directoryExists(directory)).toBe(true);
  });

  test('a file is not a directory', () => {
    const directory = createScratchDirectory('git-process-file');
    scratchDirectories.push(directory);
    const filePath = join(directory, 'example.txt');
    writeFileSync(filePath, 'content\n');
    expect(directoryExists(filePath)).toBe(false);
  });

  test('a missing path is not a directory', () => {
    const directory = createScratchDirectory('git-process-missing-path');
    scratchDirectories.push(directory);
    expect(directoryExists(join(directory, 'missing'))).toBe(false);
  });
});

describeWhenGitIsPresent('resolving a revision to a commit', () => {
  test('HEAD resolves to its full commit', () => {
    const repositoryDirectory = scratchGitRepository('git-process-head');
    expect(resolvedCommitOf(repositoryDirectory, 'HEAD')).toMatch(FULL_COMMIT_PATTERN);
  });

  test('an unknown revision resolves to null', () => {
    const repositoryDirectory = scratchGitRepository('git-process-unknown');
    expect(resolvedCommitOf(repositoryDirectory, 'no-such-branch')).toBeNull();
  });

  // A revision can come from text a person or an agent wrote; only `--end-of-options` lets one shaped like an option be looked up as a ref.
  test('an option-shaped revision is looked up as a revision: a ref of that name resolves to its commit, and no file is written', () => {
    const repositoryDirectory = scratchGitRepository('git-process-option-shaped');
    expect(run(repositoryDirectory, ['update-ref', 'refs/heads/--output=x', 'HEAD'])?.exitCode).toBe(0);
    expect(resolvedCommitOf(repositoryDirectory, '--output=x')).toBe(resolvedCommitOf(repositoryDirectory, 'HEAD'));
    expect(existsSync(join(repositoryDirectory, 'x'))).toBe(false);
  });

  test('an option-shaped revision with no such ref resolves to null and writes no file', () => {
    const repositoryDirectory = scratchGitRepository('git-process-option-shaped-missing');
    expect(resolvedCommitOf(repositoryDirectory, '--output=x')).toBeNull();
    expect(existsSync(join(repositoryDirectory, 'x'))).toBe(false);
  });
});
