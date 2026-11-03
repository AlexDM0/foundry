/**
 * Gathers the answers of real git that `src/testing/RecordedGit.ts` gives the default specs: one case for each call shape, asked in the git
 * state its name says. Each case checks the answer is the one the shape stands for, so a recording never holds a wrong state.
 * `bun run record src/lib/git/GitProcess.ts` runs this spec and writes the answers to `src/testing/recordings/<os>/`.
 */
import { realpathSync, writeFileSync } from 'node:fs';
import { dirname, join }               from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { recordAnswer }                                              from '../../testing/RecordedAnswers.ts';
import { GIT_CALL_SHAPES, type GitCallShape, RECORDED_PLACEHOLDERS } from '../../testing/RecordedGit.ts';
import {
  addWorktree,
  createScratchDirectory,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import { GitProcess, type GitRun }  from './GitProcess.ts';

const EXAMPLE_FOLDER = '.example-cache/';
const EXAMPLE_ORIGIN = 'https://example.invalid/example-agency.git';
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

  test('a folder no rule ignores answers exit 1 with no output', () => {
    const answer = recordedRun(GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED, scratchRepository(), ['check-ignore', '-q', EXAMPLE_FOLDER]);
    expect(answer).toEqual({ exitCode: NOT_IGNORED_EXIT_CODE, standardOutput: '', standardError: '' });
  });

  test('a folder the .gitignore names answers exit 0 with no output', () => {
    const repositoryDirectory = scratchRepository();
    writeFileSync(join(repositoryDirectory, '.gitignore'), `${EXAMPLE_FOLDER}\n`);
    const answer = recordedRun(GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED, repositoryDirectory, ['check-ignore', '-q', EXAMPLE_FOLDER]);
    expect(answer).toEqual({ exitCode: 0, standardOutput: '', standardError: '' });
  });
});
