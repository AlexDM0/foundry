/**
 * Gathers the answers of real git that `src/testing/RecordedGit.ts` gives the default specs: one case for each call shape, asked in the git
 * state its name says. Each case checks the answer is the one the shape stands for, so a recording never holds a wrong state.
 * `bun run record src/lib/git/GitProcess.ts` runs this spec and writes the answers to `src/testing/recordings/<os>/`.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { recordAnswer }         from '../../testing/RecordedAnswers.ts';
import {
  GIT_CALL_SHAPES,
  type GitCallShape,
  RECORDED_PLACEHOLDERS,
  recordedLongConflictedPaths
} from '../../testing/RecordedGit.ts';
import {
  RECORDED_FLOW_BUILDER_FILE,
  RECORDED_FLOW_CLAUDE_FILE_TEXTS,
  RECORDED_FLOW_COMMITS,
  RECORDED_FLOW_CONFLICT,
  RECORDED_FLOW_CONFLICT_RESOLUTION,
  RECORDED_FLOW_ELSEWHERE_FOLDER,
  RECORDED_FLOW_IGNORE_FILE_TEXT,
  RECORDED_FLOW_TICKET_BRANCH,
  RECORDED_FLOW_UNNORMALISED_FILE,
  RECORDED_FLOW_MAIN_LINE,
  RECORDED_FLOW_MOVED_MAIN_FILE,
  RECORDED_FLOW_PLACE_FOLDERS,
  RECORDED_FLOW_PLACEHOLDERS,
  RECORDED_FLOW_PLACES,
  RECORDED_FLOW_SESSION_COMMIT,
  RECORDED_FLOW_SESSION_FILE,
  RECORDED_FLOW_STAGES,
  recordedFlowCallShapeOf,
  type RecordedFlowCall,
  type RecordedFlowCommitStageName,
  type RecordedFlowPlace,
  type RecordedFlowStageName
} from '../../testing/RecordedGitFlow.ts';
import {
  addWorktree,
  commitFile,
  createScratchDirectory,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent }         from '../../testing/ToolGuard.ts';
import { GitProcess, type GitRun }          from './GitProcess.ts';
import { GIT_PATHSPEC_ARGUMENT_CHARACTERS } from './constants/GitConventions.ts';
import { GitArgumentsUtil }                 from './utils/GitArgumentsUtil.ts';

const EXAMPLE_FOLDER = '.example-cache/';
const EXAMPLE_ORIGIN = 'https://example.invalid/example-agency.git';
const EXAMPLE_MISSING_FILE = 'CLAUDE.md';
const EXAMPLE_FILE_TEXT = 'Example Agency rule: name things fully.';
const NOT_IGNORED_EXIT_CODE = 1;
const NO_SUCH_OBJECT_EXIT_CODE = 1;
const NO_SUCH_REMOTE_EXIT_CODE = 2;
const OUTSIDE_EXIT_CODE = 128;
const CHECK_FOUND_EXIT_CODE = 2;

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

interface FlowRepository {
  directory: string;
  /** Each placeholder's value in this repository, in the order a recorded text is searched for them. */
  values:    Map<string, string>;
}

/** A repository standing as `init` leaves one: `.gitignore` and the local settings untracked, the worktrees folder ignored, on `master`. */
function flowRepository(): FlowRepository {
  const directory = realpathSync(scratchRepository());
  gitOutputIn(directory, ['branch', '-m', RECORDED_FLOW_MAIN_LINE]);
  // The machine's own configuration may sign every commit; the recorded repository signs none, whatever machine records it.
  gitOutputIn(directory, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(directory, '.gitignore'), RECORDED_FLOW_IGNORE_FILE_TEXT);
  mkdirSync(join(directory, '.claude'));
  writeFileSync(join(directory, '.claude', 'settings.local.json'), '{}\n');
  const values = new Map<string, string>([
    [RECORDED_FLOW_PLACEHOLDERS.REPOSITORY, directory],
    [RECORDED_FLOW_PLACEHOLDERS.MAIN_TIP, gitOutputIn(directory, ['rev-parse', 'HEAD'])],
    [RECORDED_FLOW_PLACEHOLDERS.MAIN_TREE, gitOutputIn(directory, ['rev-parse', 'HEAD^{tree}'])],
  ]);
  return { directory, values };
}

function fillIn(flow: FlowRepository, gitArguments: readonly string[]): string[] {
  return gitArguments.map((argument) => [...flow.values].reduce((filled, [placeholder, value]) => filled.replaceAll(placeholder, value), argument));
}

function withPlaceholders(flow: FlowRepository, text: string): string {
  return [...flow.values].reduce((replaced, [placeholder, value]) => replaced.replaceAll(value, placeholder), text);
}

function placeFolderOf(flow: FlowRepository, place: RecordedFlowPlace): string {
  const [, folder = ''] = RECORDED_FLOW_PLACE_FOLDERS.find(([candidate]) => candidate === place) ?? [];
  return folder.replace(RECORDED_FLOW_PLACEHOLDERS.REPOSITORY, flow.directory);
}

function requireTransitionTo(stage: RecordedFlowStageName, nextStage: RecordedFlowStageName): RecordedFlowCall {
  const transition = RECORDED_FLOW_STAGES[stage].find((call) => call.nextStage === nextStage);
  if (transition === undefined) throw new Error(`the stage "${stage}" has no call leading to "${nextStage}"`);
  return transition;
}

function recordFlowCall(stage: RecordedFlowStageName, flow: FlowRepository, call: RecordedFlowCall): void {
  const directory = placeFolderOf(flow, call.place);
  mkdirSync(directory, { recursive: true });
  const answer = GitProcess.run(directory, fillIn(flow, call.gitArguments), call.hookPolicy ?? 'hooks-off');
  const callShape = recordedFlowCallShapeOf(stage, call.place, call.gitArguments);
  if (answer === null) throw new Error(`${callShape} could not be started`);
  expect(answer.exitCode, `${callShape}: ${answer.standardError}`).toBe(call.exitCode ?? 0);
  if (call.leavesFolder !== undefined) expect(existsSync(fillIn(flow, [call.leavesFolder]).join(''))).toBe(true);
  if (call.removesFolder !== undefined) expect(existsSync(fillIn(flow, [call.removesFolder]).join(''))).toBe(false);
  recordAnswer(callShape, { ...answer, standardOutput: withPlaceholders(flow, answer.standardOutput), standardError: withPlaceholders(flow, answer.standardError) });
}

/** Records every call of the stage that leaves the repository as it stands; the session's commit is the walk's to record. */
function recordFlowStage(stage: RecordedFlowStageName, flow: FlowRepository): void {
  const standingCalls = RECORDED_FLOW_STAGES[stage].filter((call) => call.nextStage === undefined && !RECORDED_FLOW_SESSION_COMMIT.includes(call)
    && !RECORDED_FLOW_CONFLICT_RESOLUTION.includes(call));
  for (const call of standingCalls) recordFlowCall(stage, flow, call);
}

/** A session process's own commit: it writes the session file, stages it and commits, each call recorded. */
function recordSessionCommit(flow: FlowRepository): void {
  const worktree = placeFolderOf(flow, RECORDED_FLOW_PLACES.TICKET_WORKTREE);
  writeFileSync(join(worktree, RECORDED_FLOW_SESSION_FILE.path), RECORDED_FLOW_SESSION_FILE.text);
  for (const call of RECORDED_FLOW_SESSION_COMMIT) recordFlowCall('worktree made', flow, call);
  flow.values.set(RECORDED_FLOW_PLACEHOLDERS.TICKET_TIP, gitOutputIn(worktree, ['rev-parse', 'HEAD']));
  flow.values.set(RECORDED_FLOW_PLACEHOLDERS.TICKET_TREE, gitOutputIn(worktree, ['rev-parse', 'HEAD^{tree}']));
}

function commitInTheTicketWorktree(flow: FlowRepository, stage: RecordedFlowCommitStageName): void {
  const { path, message } = RECORDED_FLOW_COMMITS[stage];
  const worktree = placeFolderOf(flow, RECORDED_FLOW_PLACES.TICKET_WORKTREE);
  mkdirSync(dirname(join(worktree, path)), { recursive: true });
  writeFileSync(join(worktree, path), 'built\n');
  gitOutputIn(worktree, ['add', path]);
  gitOutputIn(worktree, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', message]);
  flow.values.set(RECORDED_FLOW_PLACEHOLDERS.TICKET_TIP, gitOutputIn(worktree, ['rev-parse', 'HEAD']));
  flow.values.set(RECORDED_FLOW_PLACEHOLDERS.TICKET_TREE, gitOutputIn(worktree, ['rev-parse', 'HEAD^{tree}']));
}

/** Commits `path` holding `text` on the main line, which moves the main tip and tree the recorded answers name as placeholders. */
function commitOnTheMainLine(flow: FlowRepository, path: string, text: string): void {
  writeFileSync(join(flow.directory, path), text);
  gitOutputIn(flow.directory, ['add', path]);
  gitOutputIn(flow.directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', `Change ${path}`]);
  flow.values.set(RECORDED_FLOW_PLACEHOLDERS.MAIN_TIP, gitOutputIn(flow.directory, ['rev-parse', 'HEAD']));
  flow.values.set(RECORDED_FLOW_PLACEHOLDERS.MAIN_TREE, gitOutputIn(flow.directory, ['rev-parse', 'HEAD^{tree}']));
}

interface ConflictedMerge {
  branchTip:   string;
  targetTip:   string;
  mergeCommit: string;
  /** Runs the call in the repository and records its answer with the three commits as placeholders. */
  recordedRun: (callShape: GitCallShape, gitArguments: readonly string[]) => GitRun;
}

/** Each path changed on both sides from one base, merged with conflicts, and committed with `resolutionOf` as each file's content. */
function conflictedMergeIn(repositoryDirectory: string, paths: readonly string[], lineEnding: string, resolutionOf: (path: string) => string): ConflictedMerge {
  const writeEach = (contentOf: (path: string) => string): void => {
    for (const path of paths) writeFileSync(join(repositoryDirectory, path), contentOf(path));
  };
  const commitEverything = (message: string): string => {
    gitOutputIn(repositoryDirectory, ['add', '--', ...paths]);
    gitOutputIn(repositoryDirectory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', message]);
    return gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']).trim();
  };
  writeEach(() => `base line${lineEnding}`);
  const baseCommit = commitEverything('Add the base files');
  writeEach(() => `branch line${lineEnding}`);
  const branchTip = commitEverything('Change the files on the branch');
  gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'example-target', baseCommit]);
  writeEach(() => `target line${lineEnding}`);
  const targetTip = commitEverything('Change the files on the target');
  gitOutputIn(repositoryDirectory, ['checkout', '-q', '-']);
  expect(GitProcess.run(repositoryDirectory, ['merge', '-q', '--no-ff', '--no-commit', 'example-target'])?.exitCode).not.toBe(0);
  writeEach(resolutionOf);
  const mergeCommit = commitEverything('Merge the example target');
  const placeholdersOf = (text: string): string => text.replaceAll(mergeCommit, RECORDED_PLACEHOLDERS.COMMIT)
    .replaceAll(branchTip, RECORDED_PLACEHOLDERS.FIRST_TIP).replaceAll(targetTip, RECORDED_PLACEHOLDERS.SECOND_TIP);
  return {
    branchTip,
    targetTip,
    mergeCommit,
    recordedRun: (callShape, gitArguments) => {
      const answer = GitProcess.run(repositoryDirectory, gitArguments);
      if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started`);
      const recorded = { ...answer, standardOutput: placeholdersOf(answer.standardOutput), standardError: placeholdersOf(answer.standardError) };
      recordAnswer(callShape, recorded);
      return recorded;
    },
  };
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

  test('a file on a branch answers its text byte for byte, recorded with the text as its placeholder', () => {
    const repositoryDirectory = scratchRepository();
    const branch = gitOutputIn(repositoryDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    commitFile(repositoryDirectory, 'example-rule.md', `${EXAMPLE_FILE_TEXT}\n`);
    const answer = GitProcess.run(repositoryDirectory, ['show', `${branch}:example-rule.md`]);
    expect(answer).toEqual({ exitCode: 0, standardOutput: `${EXAMPLE_FILE_TEXT}\n`, standardError: '' });
    if (answer === null) return;
    recordAnswer(GIT_CALL_SHAPES.FILE_ON_BRANCH, { ...answer, standardOutput: answer.standardOutput.replace(EXAMPLE_FILE_TEXT, RECORDED_PLACEHOLDERS.TEXT) });
  });

  test('a path on a commit answers its blob id, and a path not on it answers nothing, recorded with the commit and the blob as placeholders', () => {
    const repositoryDirectory = scratchRepository();
    const commit = commitFile(repositoryDirectory, 'example-rule.md', `${EXAMPLE_FILE_TEXT}\n`).trim();
    const blob   = gitOutputIn(repositoryDirectory, ['rev-parse', `${commit}:example-rule.md`]).trim();
    const blobArgumentsOf = (path: string): string[] => ['rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}:${path}`];

    const found = GitProcess.run(repositoryDirectory, blobArgumentsOf('example-rule.md'));
    expect(found).toEqual({ exitCode: 0, standardOutput: `${blob}\n`, standardError: '' });
    const missing = GitProcess.run(repositoryDirectory, blobArgumentsOf(EXAMPLE_MISSING_FILE));
    expect(missing).toEqual({ exitCode: NO_SUCH_OBJECT_EXIT_CODE, standardOutput: '', standardError: '' });
    if (found === null || missing === null) return;
    recordAnswer(GIT_CALL_SHAPES.BLOB_OF_A_PATH, { ...found, standardOutput: found.standardOutput.replace(blob, RECORDED_PLACEHOLDERS.BLOB) });
    recordAnswer(GIT_CALL_SHAPES.BLOB_OF_A_MISSING_PATH, missing);
  });

  test('the tips of a target and two branches answer one id per line, and a last branch that does not resolve fails the whole call', () => {
    const repositoryDirectory = scratchRepository();
    const branch = gitOutputIn(repositoryDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    const tips = new Map<string, string>([[RECORDED_PLACEHOLDERS.COMMIT, gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']).trim()]]);
    for (const [ticketBranch, placeholder] of [['ticket-1', RECORDED_PLACEHOLDERS.FIRST_TIP], ['ticket-2', RECORDED_PLACEHOLDERS.SECOND_TIP]] as const) {
      gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', ticketBranch, branch]);
      tips.set(placeholder, commitFile(repositoryDirectory, `${ticketBranch}.txt`, `${ticketBranch}\n`).trim());
    }
    gitOutputIn(repositoryDirectory, ['checkout', '-q', branch]);
    const placeholdersOf = (text: string): string => [...tips].reduce((replaced, [placeholder, tip]) => replaced.replaceAll(tip, placeholder), text);
    const recordedWithPlaceholders = (callShape: GitCallShape, branches: readonly string[]): GitRun | null => {
      const answer = GitProcess.run(repositoryDirectory, ['rev-parse', '--end-of-options', branch, ...branches]);
      if (answer === null) return null;
      const recorded = { ...answer, standardOutput: placeholdersOf(answer.standardOutput), standardError: placeholdersOf(answer.standardError) };
      recordAnswer(callShape, recorded);
      return recorded;
    };

    const allResolving = recordedWithPlaceholders(GIT_CALL_SHAPES.TIPS_ALL_RESOLVING, ['ticket-1', 'ticket-2']);
    expect(allResolving?.exitCode).toBe(0);
    expect(allResolving?.standardOutput).toEndWith('<commit>\n<first tip>\n<second tip>\n');
    expect(recordedWithPlaceholders(GIT_CALL_SHAPES.TIPS_LAST_NOT_RESOLVING, ['ticket-1', 'ticket-3'])?.exitCode).toBe(OUTSIDE_EXIT_CODE);
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

  test('a repository with no commit yet resolves its branch to exit 1 with no output, and HEAD names that branch, recorded with the branch as its placeholder', () => {
    const repositoryDirectory = createScratchDirectory('recorded-git-unborn');
    scratchDirectories.push(repositoryDirectory);
    gitOutputIn(repositoryDirectory, ['init', '-q', '-b', 'example-main']);
    const resolveArguments = ['rev-parse', '--verify', '--quiet', '--end-of-options', 'example-main^{commit}'];
    expect(recordedRun(GIT_CALL_SHAPES.UNBORN_BRANCH_COMMIT_UNRESOLVED, repositoryDirectory, resolveArguments)).toEqual({ exitCode: 1, standardOutput: '', standardError: '' });
    const head = GitProcess.run(repositoryDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    expect(head).toEqual({ exitCode: 0, standardOutput: 'example-main\n', standardError: '' });
    const recordedHead = { exitCode: 0, standardOutput: `${RECORDED_PLACEHOLDERS.BRANCH}\n`, standardError: '' };
    recordAnswer(GIT_CALL_SHAPES.CURRENT_UNBORN_BRANCH, recordedHead);
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

  test('a forced removal of a folder that is a repository of its own answers exit 128, recorded with the folder as its placeholder, and a prune answers exit 0', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const leftoverDirectory = join(createScratchDirectory('recorded-git-leftover'), 'leftover');
    scratchDirectories.push(dirname(leftoverDirectory));
    Bun.spawnSync(['git', 'init', '-q', leftoverDirectory]);
    const answer = GitProcess.run(repositoryDirectory, ['worktree', 'remove', '--force', leftoverDirectory]);
    expect(answer?.exitCode).toBe(OUTSIDE_EXIT_CODE);
    if (answer === null) return;
    const recorded = { ...answer, standardError: answer.standardError.replaceAll(leftoverDirectory, RECORDED_PLACEHOLDERS.PATH) };
    expect(recorded.standardError).toContain(`'${RECORDED_PLACEHOLDERS.PATH}' is not a working tree`);
    recordAnswer(GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LEFTOVER, recorded);
    const prune = recordedRun(GIT_CALL_SHAPES.WORKTREE_PRUNE_WITH_NOTHING_STALE, repositoryDirectory, ['worktree', 'prune']);
    expect(prune).toEqual({ exitCode: 0, standardOutput: '', standardError: '' });
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

  test('a group worktree and its refresh worktree: added on an existing branch and detached, read, checked out, removed, and branches deleted', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const worktreesRoot = `${repositoryDirectory}-worktrees`;
    scratchDirectories.push(worktreesRoot);
    const groupWorktree = join(worktreesRoot, 'group-example');
    const refreshWorktree = join(worktreesRoot, 'refresh-group-example');
    const commit = commitFile(repositoryDirectory, 'base.ts', 'export const base = 1;\n').trim();
    const placeholdersOf = (text: string, worktree: string | null): string => (worktree === null ? text : text.replaceAll(worktree, RECORDED_PLACEHOLDERS.PATH))
      .replaceAll(repositoryDirectory, RECORDED_PLACEHOLDERS.REPOSITORY).replaceAll(commit, RECORDED_PLACEHOLDERS.COMMIT)
      .replaceAll('group-example', RECORDED_PLACEHOLDERS.BRANCH).replaceAll('merged-example', RECORDED_PLACEHOLDERS.BRANCH);
    const recordedIn = (callShape: GitCallShape, directory: string, gitArguments: readonly string[], worktree: string | null = null, ceilingDirectory?: string): GitRun => {
      const answer = GitProcess.run(directory, gitArguments, 'hooks-off', undefined, ceilingDirectory);
      if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started`);
      const recorded = { ...answer, standardOutput: placeholdersOf(answer.standardOutput, worktree), standardError: placeholdersOf(answer.standardError, worktree) };
      recordAnswer(callShape, recorded);
      return recorded;
    };

    gitOutputIn(repositoryDirectory, ['branch', 'group-example']);
    expect(recordedIn(GIT_CALL_SHAPES.WORKTREE_ADD_ON_AN_EXISTING_BRANCH, repositoryDirectory, ['worktree', 'add', '--quiet', groupWorktree, 'group-example']).exitCode).toBe(0);
    expect(recordedIn(GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED, repositoryDirectory, ['worktree', 'add', '--quiet', '--detach', refreshWorktree, commit]).exitCode).toBe(0);
    const topLevelArguments = ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'];
    expect(recordedIn(GIT_CALL_SHAPES.WORKTREE_TOP_AND_COMMON_FOLDER, refreshWorktree, topLevelArguments, refreshWorktree).standardOutput).toBe('<path>\n<repository>/.git\n');
    expect(recordedIn(GIT_CALL_SHAPES.ABSOLUTE_COMMON_FOLDER_AT_THE_ROOT, repositoryDirectory, ['rev-parse', '--path-format=absolute', '--git-common-dir']).standardOutput)
      .toBe('<repository>/.git\n');
    const statusArguments = ['status', '--porcelain=v1', '--untracked-files=no'];
    expect(recordedIn(GIT_CALL_SHAPES.STATUS_OF_TRACKED_FILES_CLEAN, refreshWorktree, statusArguments).standardOutput).toBe('');
    writeFileSync(join(refreshWorktree, 'base.ts'), 'export const base = 2;\n');
    expect(recordedIn(GIT_CALL_SHAPES.STATUS_OF_TRACKED_FILES_MODIFIED, refreshWorktree, statusArguments).standardOutput).toBe(' M base.ts\n');
    writeFileSync(join(refreshWorktree, 'base.ts'), 'export const base = 1;\n');
    expect(recordedIn(GIT_CALL_SHAPES.CHECKOUT_DETACHED, refreshWorktree, ['checkout', '--quiet', '--detach', commit]).exitCode).toBe(0);
    expect(recordedIn(GIT_CALL_SHAPES.BRANCH_OF_A_WORKTREE, groupWorktree, ['symbolic-ref', '--quiet', 'HEAD']).standardOutput).toBe('refs/heads/<branch>\n');
    expect(recordedIn(GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE, repositoryDirectory, ['worktree', 'remove', refreshWorktree]).exitCode).toBe(0);
    expect(existsSync(refreshWorktree)).toBe(false);

    commitFile(groupWorktree, 'cart.ts', 'export const cart = 1;\n');
    gitOutputIn(repositoryDirectory, ['worktree', 'remove', groupWorktree]);
    expect(recordedIn(GIT_CALL_SHAPES.BRANCH_DELETE_OF_AN_UNMERGED_BRANCH, repositoryDirectory, ['branch', '-d', 'group-example']).standardError).toContain('<branch>');
    gitOutputIn(repositoryDirectory, ['branch', 'merged-example']);
    expect(recordedIn(GIT_CALL_SHAPES.BRANCH_DELETE_OF_A_MERGED_BRANCH, repositoryDirectory, ['branch', '-d', 'merged-example']).exitCode).toBe(0);

    const outsideDirectory = createScratchDirectory('recorded-git-no-repository');
    scratchDirectories.push(outsideDirectory);
    expect(recordedIn(GIT_CALL_SHAPES.TOP_LEVEL_IN_NO_REPOSITORY, outsideDirectory, topLevelArguments, outsideDirectory, ceilingDirectoryAbove(outsideDirectory)).exitCode)
      .toBe(OUTSIDE_EXIT_CODE);
  });

  test('an Airlock merge-in stopped on a conflict: the main line one commit ahead of the branch, and the unmerged paths', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const worktreesRoot = `${repositoryDirectory}-worktrees`;
    scratchDirectories.push(worktreesRoot);
    const ticketWorktree = join(worktreesRoot, 'ticket-example');
    const mainLine = gitOutputIn(repositoryDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    const base = commitFile(repositoryDirectory, 'shared.txt', 'first line\n').trim();
    const mainTip = commitFile(repositoryDirectory, 'shared.txt', 'the main line\n').trim();
    gitOutputIn(repositoryDirectory, ['worktree', 'add', '-q', '-b', 'ticket-example', ticketWorktree, base]);
    commitFile(ticketWorktree, 'shared.txt', 'the branch line\n');
    expect(recordedRun(GIT_CALL_SHAPES.COMMITS_AHEAD_ONE, repositoryDirectory, ['rev-list', '--count', `ticket-example..${mainLine}`]).standardOutput).toBe('1\n');

    expect(Bun.spawnSync(['git', ...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'merge', '--no-ff', '--no-edit', '--quiet', mainTip], { cwd: ticketWorktree }).exitCode).not.toBe(0);
    expect(recordedRun(GIT_CALL_SHAPES.UNMERGED_FILES_ONE, ticketWorktree, ['ls-files', '-u']).standardOutput).toContain('\tshared.txt\n');
  });

  test('a main line answers a missing revision\'s tree, a batch of one clean prediction, a modified checkout\'s status and its blocked fast-forward', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-B', 'main']);
    commitFile(repositoryDirectory, 'base.ts', 'export const base = 1;\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'ticket-example']);
    const branchTip = commitFile(repositoryDirectory, 'base.ts', 'export const base = 2;\n').trim();
    gitOutputIn(repositoryDirectory, ['checkout', '-q', 'main']);
    const branchTree = gitOutputIn(repositoryDirectory, ['rev-parse', 'ticket-example^{tree}']).trim();
    const recordedWith = (callShape: GitCallShape, gitArguments: readonly string[], values: Readonly<Record<string, string>>, standardInput?: string): GitRun => {
      const answer = GitProcess.run(repositoryDirectory, gitArguments, 'hooks-off', standardInput);
      if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started`);
      const placeholdersOf = (text: string): string => Object.entries(values).reduce((replaced, [placeholder, value]) => replaced.replaceAll(value, placeholder), text);
      recordAnswer(callShape, { ...answer, standardOutput: placeholdersOf(answer.standardOutput), standardError: placeholdersOf(answer.standardError) });
      return answer;
    };

    expect(recordedWith(GIT_CALL_SHAPES.TREE_OF_A_MISSING_REVISION, ['rev-parse', '--verify', '--quiet', 'example-missing^{tree}'], {}).exitCode).not.toBe(0);
    const batchArguments = ['merge-tree', '--stdin', '--name-only', '--no-messages', '-z'];
    const batch = recordedWith(GIT_CALL_SHAPES.BATCH_OF_ONE_CLEAN_PREDICTION, batchArguments, { [RECORDED_PLACEHOLDERS.TREE]: branchTree }, 'main ticket-example\n');
    expect(batch.standardOutput).toBe(`1\0${branchTree}\0\0`);
    writeFileSync(join(repositoryDirectory, 'base.ts'), 'export const base = 9;\n');
    expect(recordedWith(GIT_CALL_SHAPES.NUL_STATUS_OF_A_MODIFIED_BASE, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {}).standardOutput).toBe(' M base.ts\0');
    const blocked = recordedWith(GIT_CALL_SHAPES.FAST_FORWARD_BLOCKED_BY_MODIFIED, ['merge', '--ff-only', '--quiet', branchTip], { [RECORDED_PLACEHOLDERS.COMMIT]: branchTip });
    expect(blocked.exitCode).not.toBe(0);
  });

  test('the state the test run leak check reads: the top level, the branches, the worktree list and the short status, before and after a planted change', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const branch = gitOutputIn(repositoryDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    const plantedWorktree = `${repositoryDirectory}-worktrees/planted`;
    scratchDirectories.push(`${repositoryDirectory}-worktrees`);
    const placeholdersOf = (text: string): string => text.replaceAll(plantedWorktree, RECORDED_PLACEHOLDERS.PATH)
      .replaceAll(repositoryDirectory, RECORDED_PLACEHOLDERS.REPOSITORY).replaceAll(/\b[0-9a-f]{40}\b/g, RECORDED_PLACEHOLDERS.COMMIT)
      .replaceAll(new RegExp(`^${branch}$`, 'gm'), RECORDED_PLACEHOLDERS.BRANCH).replaceAll(`refs/heads/${branch}\n`, `refs/heads/${RECORDED_PLACEHOLDERS.BRANCH}\n`);
    const recordedWith = (callShape: GitCallShape, gitArguments: readonly string[]): string => {
      const answer = GitProcess.run(repositoryDirectory, gitArguments, 'hooks-off');
      if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started`);
      const recorded = { ...answer, standardOutput: placeholdersOf(answer.standardOutput), standardError: placeholdersOf(answer.standardError) };
      recordAnswer(callShape, recorded);
      return recorded.standardOutput;
    };
    const branchNames = ['for-each-ref', '--format=%(refname:short)', 'refs/heads'];
    const shortStatus = ['status', '--porcelain', '--untracked-files=all'];

    expect(recordedWith(GIT_CALL_SHAPES.TOP_LEVEL_AT_THE_ROOT, ['rev-parse', '--show-toplevel'])).toBe('<repository>\n');
    expect(recordedWith(GIT_CALL_SHAPES.BRANCH_NAMES_OF_ONE, branchNames)).toBe('<branch>\n');
    expect(recordedWith(GIT_CALL_SHAPES.SHORT_STATUS_CLEAN, shortStatus)).toBe('');
    gitOutputIn(repositoryDirectory, ['branch', 'planted-branch']);
    expect(recordedWith(GIT_CALL_SHAPES.BRANCH_NAMES_WITH_A_NEW_BRANCH, branchNames)).toBe('<branch>\nplanted-branch\n');
    gitOutputIn(repositoryDirectory, ['branch', '-D', 'planted-branch']);
    gitOutputIn(repositoryDirectory, ['worktree', 'add', '-q', '-b', 'worktree/planted', plantedWorktree]);
    expect(recordedWith(GIT_CALL_SHAPES.BRANCH_NAMES_WITH_A_WORKTREE_BRANCH, branchNames)).toBe('<branch>\nworktree/planted\n');
    expect(recordedWith(GIT_CALL_SHAPES.WORKTREE_LIST_WITH_A_LINKED, ['worktree', 'list', '--porcelain']))
      .toBe('worktree <repository>\nHEAD <commit>\nbranch refs/heads/<branch>\n\nworktree <path>\nHEAD <commit>\nbranch refs/heads/worktree/planted\n\n');
    writeFileSync(join(repositoryDirectory, 'planted-file.txt'), '');
    expect(recordedWith(GIT_CALL_SHAPES.SHORT_STATUS_OF_A_NEW_FILE, shortStatus)).toBe('?? planted-file.txt\n');
  });

  test('a ticket\'s flow, stage by stage: the tracker ready, the pipeline agent worktree, the ticket worktree, the session\'s commit, the merge', () => {
    const flow = flowRepository();
    recordFlowStage('tracker ready', flow);
    recordFlowCall('tracker ready', flow, requireTransitionTo('tracker ready', 'pipeline agent worktree made'));
    recordFlowStage('pipeline agent worktree made', flow);
    recordFlowCall('pipeline agent worktree made', flow, requireTransitionTo('pipeline agent worktree made', 'tracker ready'));
    recordFlowCall('tracker ready', flow, requireTransitionTo('tracker ready', 'worktree made'));
    recordFlowStage('worktree made', flow);
    recordSessionCommit(flow);
    recordFlowStage('tree changed', flow);
    recordFlowCall('tree changed', flow, requireTransitionTo('tree changed', 'branch merged'));
    recordFlowStage('branch merged', flow);
  });

  test.each(['tree changed with trailer', 'agent config changed'] as const)('a ticket\'s flow whose session commit is the %s stage', (stage) => {
    const flow = flowRepository();
    gitOutputIn(flow.directory, fillIn(flow, requireTransitionTo('tracker ready', 'worktree made').gitArguments));
    commitInTheTicketWorktree(flow, stage);
    recordFlowStage(stage, flow);
  });

  test('a ticket worktree forked off a main line that holds the builder file: the main line\'s reads and the worktree\'s reads', () => {
    const flow = flowRepository();
    commitOnTheMainLine(flow, RECORDED_FLOW_BUILDER_FILE.path, RECORDED_FLOW_BUILDER_FILE.text);
    gitOutputIn(flow.directory, fillIn(flow, requireTransitionTo('tracker ready', 'worktree made').gitArguments));
    recordFlowStage('builder file committed', flow);
  });

  test('a main line whose CLAUDE.md holds the managed block, then a removal left uncommitted, then the removal committed and a worktree added', () => {
    const flow = flowRepository();
    commitOnTheMainLine(flow, 'CLAUDE.md', RECORDED_FLOW_CLAUDE_FILE_TEXTS.managedBlock);
    recordFlowStage('claude block committed', flow);
    writeFileSync(join(flow.directory, 'CLAUDE.md'), RECORDED_FLOW_CLAUDE_FILE_TEXTS.conventions);
    recordFlowStage('claude block removed', flow);
    commitOnTheMainLine(flow, 'CLAUDE.md', RECORDED_FLOW_CLAUDE_FILE_TEXTS.conventions);
    recordFlowStage('claude block removal committed', flow);
    recordFlowCall('claude block removal committed', flow, requireTransitionTo('claude block removal committed', 'worktree made'));
  });

  test('a main line holding a CRLF file under a text attribute: its reads, the worktree added on it, and that worktree changed straight after checkout', () => {
    const flow = flowRepository();
    gitOutputIn(flow.directory, ['config', 'core.autocrlf', 'false']);
    commitOnTheMainLine(flow, RECORDED_FLOW_UNNORMALISED_FILE.path, RECORDED_FLOW_UNNORMALISED_FILE.text);
    commitOnTheMainLine(flow, '.gitattributes', RECORDED_FLOW_UNNORMALISED_FILE.attributes);
    recordFlowStage('line endings normalised', flow);
    recordFlowCall('line endings normalised', flow, requireTransitionTo('line endings normalised', 'unnormalised worktree made'));
    recordFlowStage('unnormalised worktree made', flow);
    const worktree = placeFolderOf(flow, RECORDED_FLOW_PLACES.TICKET_WORKTREE);
    expect(gitOutputIn(worktree, ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames'])).toContain(RECORDED_FLOW_UNNORMALISED_FILE.path);
  });

  test('a ticket\'s flow whose main line moved past the fork point once the session committed', () => {
    const flow = flowRepository();
    gitOutputIn(flow.directory, fillIn(flow, requireTransitionTo('tracker ready', 'worktree made').gitArguments));
    commitInTheTicketWorktree(flow, 'tree changed');
    writeFileSync(join(flow.directory, RECORDED_FLOW_MOVED_MAIN_FILE.path), RECORDED_FLOW_MOVED_MAIN_FILE.text);
    gitOutputIn(flow.directory, ['add', RECORDED_FLOW_MOVED_MAIN_FILE.path]);
    gitOutputIn(flow.directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', 'Move the main line']);
    flow.values.set(RECORDED_FLOW_PLACEHOLDERS.MOVED_MAIN_TIP, gitOutputIn(flow.directory, ['rev-parse', 'HEAD']));
    flow.values.set(RECORDED_FLOW_PLACEHOLDERS.MOVED_MAIN_TREE, gitOutputIn(flow.directory, ['rev-parse', 'HEAD^{tree}']));
    const [mergedTree = ''] = gitOutputIn(flow.directory, ['merge-tree', '--write-tree', RECORDED_FLOW_MAIN_LINE, RECORDED_FLOW_TICKET_BRANCH]).split('\n');
    flow.values.set(RECORDED_FLOW_PLACEHOLDERS.MERGED_TREE, mergedTree);
    // The Overseer's merge-in names no identity of its own, so the recorded repository holds one.
    for (const [key, value] of [['user.name', 'Alex Example'], ['user.email', 'alex@example.com']]) gitOutputIn(flow.directory, ['config', key ?? '', value ?? '']);
    recordFlowStage('main moved', flow);
    recordFlowCall('main moved', flow, requireTransitionTo('main moved', 'main merged in'));
    const worktree = placeFolderOf(flow, RECORDED_FLOW_PLACES.TICKET_WORKTREE);
    flow.values.set(RECORDED_FLOW_PLACEHOLDERS.MERGED_TIP, gitOutputIn(worktree, ['rev-parse', 'HEAD']));
    expect(gitOutputIn(worktree, ['rev-parse', 'HEAD^{tree}'])).toBe(mergedTree);
    recordFlowStage('main merged in', flow);
    recordFlowCall('main merged in', flow, requireTransitionTo('main merged in', 'merged branch landed'));
    recordFlowStage('merged branch landed', flow);
  });

  test('a ticket branch conflicting with the moved main line: the merge-in stopped, the Airlock agent\'s resolution and the landing', () => {
    const flow = flowRepository();
    gitOutputIn(flow.directory, fillIn(flow, requireTransitionTo('tracker ready', 'worktree made').gitArguments));
    const worktree = placeFolderOf(flow, RECORDED_FLOW_PLACES.TICKET_WORKTREE);
    const commitIn = (directory: string, text: string, tip: string, tree: string): void => {
      writeFileSync(join(directory, RECORDED_FLOW_CONFLICT.path), text);
      gitOutputIn(directory, ['add', RECORDED_FLOW_CONFLICT.path]);
      gitOutputIn(directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', `Change ${RECORDED_FLOW_CONFLICT.path}`]);
      flow.values.set(tip, gitOutputIn(directory, ['rev-parse', 'HEAD']));
      flow.values.set(tree, gitOutputIn(directory, ['rev-parse', 'HEAD^{tree}']));
    };
    const sessionFolder = placeFolderOf(flow, RECORDED_FLOW_PLACES.SESSION_FOLDER);
    mkdirSync(sessionFolder, { recursive: true });
    writeFileSync(join(sessionFolder, RECORDED_FLOW_CONFLICT.path), RECORDED_FLOW_CONFLICT.resolvedText);
    commitIn(worktree, RECORDED_FLOW_CONFLICT.branchText, RECORDED_FLOW_PLACEHOLDERS.TICKET_TIP, RECORDED_FLOW_PLACEHOLDERS.TICKET_TREE);
    commitIn(flow.directory, RECORDED_FLOW_CONFLICT.mainLineText, RECORDED_FLOW_PLACEHOLDERS.MOVED_MAIN_TIP, RECORDED_FLOW_PLACEHOLDERS.MOVED_MAIN_TREE);
    // The Overseer's merge-in names no identity of its own, so the recorded repository holds one.
    for (const [key, value] of [['user.name', 'Alex Example'], ['user.email', 'alex@example.com']]) gitOutputIn(flow.directory, ['config', key ?? '', value ?? '']);
    recordFlowStage('branch conflicting with main', flow);
    recordFlowCall('branch conflicting with main', flow, requireTransitionTo('branch conflicting with main', 'merge conflicted'));
    recordFlowStage('merge conflicted', flow);
    writeFileSync(join(worktree, RECORDED_FLOW_CONFLICT.path), RECORDED_FLOW_CONFLICT.resolvedText);
    for (const call of RECORDED_FLOW_CONFLICT_RESOLUTION) recordFlowCall('merge conflicted', flow, call);
    flow.values.set(RECORDED_FLOW_PLACEHOLDERS.MERGED_TIP, gitOutputIn(worktree, ['rev-parse', 'HEAD']));
    flow.values.set(RECORDED_FLOW_PLACEHOLDERS.MERGED_TREE, gitOutputIn(worktree, ['rev-parse', 'HEAD^{tree}']));
    recordFlowStage('conflict resolved', flow);
    recordFlowCall('conflict resolved', flow, requireTransitionTo('conflict resolved', 'resolved branch landed'));
    recordFlowStage('resolved branch landed', flow);
  });

  test('a ticket branch checked out in another worktree already, so adding the ticket worktree on it is refused', () => {
    const flow = flowRepository();
    gitOutputIn(flow.directory, ['branch', RECORDED_FLOW_TICKET_BRANCH]);
    gitOutputIn(flow.directory, ['worktree', 'add', '-q', join(flow.directory, RECORDED_FLOW_ELSEWHERE_FOLDER), RECORDED_FLOW_TICKET_BRANCH]);
    recordFlowStage('ticket branch checked out elsewhere', flow);
  });

  test('a linked worktree answers its binary diff, its untracked files, each one\'s addition, its index lock path, its removal and a prune', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const worktreesDirectory = `${repositoryDirectory}-worktrees`;
    scratchDirectories.push(worktreesDirectory);
    commitFile(repositoryDirectory, 'basket.ts', 'export const total = 1;\n');
    const worktree = join(worktreesDirectory, 'ticket-012');
    gitOutputIn(repositoryDirectory, ['worktree', 'add', '-q', '-b', 'ticket-012', worktree]);
    const untrackedArguments = ['ls-files', '--others', '--exclude-standard', '-z'];
    const additionArguments = ['diff', '--binary', '--no-index', '--', '/dev/null', 'coupon.ts'];

    expect(recordedRun(GIT_CALL_SHAPES.BINARY_DIFF_OF_AN_UNCHANGED_TREE, worktree, ['diff', '--binary', 'HEAD']).standardOutput).toBe('');
    expect(recordedRun(GIT_CALL_SHAPES.NO_UNTRACKED_FILE, worktree, untrackedArguments).standardOutput).toBe('');
    writeFileSync(join(worktree, 'basket.ts'), 'export const total = 2;\n');
    writeFileSync(join(worktree, 'coupon.ts'), 'export const coupon = 3;\n');
    expect(recordedRun(GIT_CALL_SHAPES.BINARY_DIFF_OF_A_CHANGED_FILE, worktree, ['diff', '--binary', 'HEAD']).standardOutput).toContain('+export const total = 2;');
    expect(recordedRun(GIT_CALL_SHAPES.ONE_UNTRACKED_FILE, worktree, untrackedArguments).standardOutput).toBe('coupon.ts\0');
    const addition = recordedRun(GIT_CALL_SHAPES.ADDITION_OF_A_READABLE_FILE, worktree, additionArguments);
    expect(addition.exitCode).toBe(1);
    expect(addition.standardOutput).toContain('+export const coupon = 3;');
    chmodSync(join(worktree, 'coupon.ts'), 0o000);
    const unreadable = recordedRun(GIT_CALL_SHAPES.ADDITION_OF_AN_UNREADABLE_FILE, worktree, additionArguments);
    chmodSync(join(worktree, 'coupon.ts'), 0o644);
    expect(unreadable.exitCode).not.toBe(1);

    const lockPath = GitProcess.run(worktree, ['rev-parse', '--git-path', 'index.lock']);
    expect(lockPath?.standardOutput).toBe(`${join(repositoryDirectory, '.git', 'worktrees', 'ticket-012', 'index.lock')}\n`);
    if (lockPath === null) return;
    const lockPathOutput = lockPath.standardOutput.replace(repositoryDirectory, RECORDED_PLACEHOLDERS.REPOSITORY).replace('ticket-012', RECORDED_PLACEHOLDERS.BRANCH);
    recordAnswer(GIT_CALL_SHAPES.INDEX_LOCK_PATH_IN_A_WORKTREE, { ...lockPath, standardOutput: lockPathOutput });
    expect(recordedRun(GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LINKED, repositoryDirectory, ['worktree', 'remove', '--force', worktree]).exitCode).toBe(0);
    expect(existsSync(worktree)).toBe(false);
    gitOutputIn(repositoryDirectory, ['worktree', 'add', '-q', worktree, 'ticket-012']);
    removeScratchDirectory(worktreesDirectory);
    expect(recordedRun(GIT_CALL_SHAPES.WORKTREE_PRUNE_OF_A_GONE_WORKTREE, repositoryDirectory, ['worktree', 'prune']).exitCode).toBe(0);
    expect(gitOutputIn(repositoryDirectory, ['worktree', 'list', '--porcelain'])).not.toContain('ticket-012');
  });

  test.each([
    ['a clean CRLF resolution', '\r\n', 'branch line\r\ntarget line\r\n', GIT_CALL_SHAPES.CHECK_OF_A_CLEAN_CRLF_RESOLUTION, 0],
    ['a trailing space before the CRLF', '\r\n', 'branch line\r\ntarget line \r\n', GIT_CALL_SHAPES.CHECK_OF_A_CRLF_TRAILING_SPACE, CHECK_FOUND_EXIT_CODE],
    [
      'a conflict marker left in a CRLF file',
      '\r\n',
      '<<<<<<< HEAD\r\nbranch line\r\n=======\r\ntarget line\r\n>>>>>>> example-target\r\n',
      GIT_CALL_SHAPES.CHECK_OF_A_CRLF_CONFLICT_MARKER,
      CHECK_FOUND_EXIT_CODE,
    ],
  ] as const)('a merge with conflicts, committed with %s, answers its merge, its rule, its check and its parents', (...[, lineEnding, resolution, checkShape, checkExitCode]) => {
    const conflicted = conflictedMergeIn(scratchRepository(), ['example.txt'], lineEnding, () => resolution);
    expect(conflicted.recordedRun(GIT_CALL_SHAPES.NO_UNMERGED_PATH, ['ls-files', '-u']).standardOutput).toBe('');
    const merges = conflicted.recordedRun(GIT_CALL_SHAPES.MERGE_IN_RANGE, ['rev-list', '--merges', '--reverse', `${conflicted.branchTip}..HEAD`, `^${conflicted.targetTip}`]);
    expect(merges.standardOutput).toBe('<commit>\n');
    expect(conflicted.recordedRun(GIT_CALL_SHAPES.WHITESPACE_RULE_UNSET, ['config', '--get', 'core.whitespace']).exitCode).toBe(1);
    expect(conflicted.recordedRun(checkShape, ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', conflicted.branchTip, 'HEAD', '--', 'example.txt']).exitCode)
      .toBe(checkExitCode);
    const parents = conflicted.recordedRun(GIT_CALL_SHAPES.PARENTS_OF_THE_MERGE, ['rev-list', '--parents', '-n', '1', conflicted.mergeCommit]);
    expect(parents.standardOutput).toBe('<commit> <first tip> <second tip>\n');
  });

  test('a repository whose core.whitespace allows a trailing space answers its rule, and the check under it passes a trailing space before the CRLF', () => {
    const repositoryDirectory = scratchRepository();
    gitOutputIn(repositoryDirectory, ['config', 'core.whitespace', '-blank-at-eol']);
    const conflicted = conflictedMergeIn(repositoryDirectory, ['example.txt'], '\r\n', () => 'branch line\r\ntarget line \r\n');
    expect(conflicted.recordedRun(GIT_CALL_SHAPES.WHITESPACE_RULE_SET, ['config', '--get', 'core.whitespace']).standardOutput).toBe('-blank-at-eol\n');
    const checkArguments = ['-c', 'core.whitespace=-blank-at-eol,cr-at-eol', 'diff', '--check', conflicted.branchTip, 'HEAD', '--', 'example.txt'];
    expect(conflicted.recordedRun(GIT_CALL_SHAPES.CHECK_OF_AN_ALLOWED_TRAILING_SPACE, checkArguments).exitCode).toBe(0);
  });

  test('a merge of several hundred long conflicted paths answers each argv\'s check, the last one holding a trailing space', () => {
    const paths = recordedLongConflictedPaths();
    const lastPath = paths.at(-1);
    const repositoryDirectory = scratchRepository();
    mkdirSync(join(repositoryDirectory, dirname(paths[0] ?? '')));
    const conflicted = conflictedMergeIn(repositoryDirectory, paths, '\n', (path) => (path === lastPath ? 'branch line\ntarget line \n' : 'branch line\ntarget line\n'));
    const chunks = GitArgumentsUtil.pathspecChunksOf(paths, GIT_PATHSPEC_ARGUMENT_CHARACTERS);
    const checkOf = (chunk: readonly string[]): string[] => ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', conflicted.branchTip, 'HEAD', '--', ...chunk];
    expect(conflicted.recordedRun(GIT_CALL_SHAPES.CHECK_OF_CLEAN_LONG_PATHS, checkOf(chunks[0] ?? [])).exitCode).toBe(0);
    expect(conflicted.recordedRun(GIT_CALL_SHAPES.CHECK_OF_A_LONG_PATH_TRAILING_SPACE, checkOf(chunks.at(-1) ?? [])).exitCode).toBe(CHECK_FOUND_EXIT_CODE);
  });

  test('a main checkout and a feature commit answer what a landing asks: the status, the names, the trees, the hashes and the fast-forward', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-B', 'main']);
    const mainTip = commitFile(repositoryDirectory, 'base.ts', 'export const base = true;\n');
    const featureWorktree = join(`${repositoryDirectory}-worktrees`, 'feature');
    scratchDirectories.push(`${repositoryDirectory}-worktrees`);
    gitOutputIn(repositoryDirectory, ['worktree', 'add', '-q', '-b', 'feature', featureWorktree, 'main']);
    const mergedCommit = commitFile(featureWorktree, 'feature.ts', 'export const feature = true;\n');
    const heldCommit = commitFile(featureWorktree, 'base.ts', 'export const base = false;\n');
    const placeholdersOf = (text: string): string => text.replaceAll(mergedCommit, RECORDED_PLACEHOLDERS.COMMIT)
      .replaceAll(mainTip, RECORDED_PLACEHOLDERS.FIRST_TIP).replaceAll(heldCommit, RECORDED_PLACEHOLDERS.SECOND_TIP);
    const recordedIn = (callShape: GitCallShape, gitArguments: readonly string[], standardInput?: string): GitRun => {
      const answer = GitProcess.run(repositoryDirectory, gitArguments, 'hooks-off', standardInput);
      if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started`);
      const recorded = { ...answer, standardOutput: placeholdersOf(answer.standardOutput), standardError: placeholdersOf(answer.standardError) };
      recordAnswer(callShape, recorded);
      return recorded;
    };
    const statusArguments = ['status', '--porcelain=v1', '-z', '--untracked-files=all'];

    expect(recordedIn(GIT_CALL_SHAPES.LANDING_CHECKOUT_CLEAN, statusArguments).standardOutput).toBe('');
    expect(recordedIn(GIT_CALL_SHAPES.NAMES_THE_FEATURE_CHANGES, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', mergedCommit, '--']).standardOutput).toBe('feature.ts\0');
    expect(recordedIn(GIT_CALL_SHAPES.NAMES_THE_HELD_COMMIT_CHANGES, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', heldCommit, '--']).standardOutput)
      .toBe('base.ts\0feature.ts\0');
    expect(recordedIn(GIT_CALL_SHAPES.TREE_OF_THE_HELD_COMMIT, ['ls-tree', '-r', '-z', '--full-tree', heldCommit]).standardOutput).toContain('\tfeature.ts\0');
    expect(recordedIn(GIT_CALL_SHAPES.TREE_OF_THE_LANDING_BASE, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']).standardOutput).toEndWith('\tbase.ts\0');
    writeFileSync(join(repositoryDirectory, 'feature.ts'), 'export const feature = true;\n');
    expect(recordedIn(GIT_CALL_SHAPES.HASHES_OF_BASE_AND_FEATURE, ['hash-object', '--stdin-paths'], 'base.ts\nfeature.ts\n').standardOutput).toMatch(/^([0-9a-f]{40}\n){2}$/);
    expect(recordedIn(GIT_CALL_SHAPES.LANDING_CHECKOUT_WITH_FEATURE_FILE, statusArguments).standardOutput).toBe('?? feature.ts\0');
    expect(recordedIn(GIT_CALL_SHAPES.FAST_FORWARD_BLOCKED_BY_FEATURE, ['merge', '--ff-only', '--quiet', mergedCommit]).exitCode).not.toBe(0);
    removeScratchDirectory(join(repositoryDirectory, 'feature.ts'));
    expect(recordedIn(GIT_CALL_SHAPES.NOT_AN_ANCESTOR_OF_THE_TIP, ['merge-base', '--is-ancestor', mergedCommit, mainTip]).exitCode).toBe(1);
    expect(recordedIn(GIT_CALL_SHAPES.FAST_FORWARD_TO_THE_FEATURE, ['merge', '--ff-only', '--quiet', mergedCommit]).exitCode).toBe(0);
    expect(recordedIn(GIT_CALL_SHAPES.ANCESTOR_OF_THE_TIP, ['merge-base', '--is-ancestor', mergedCommit, mergedCommit]).exitCode).toBe(0);
  });

  test('a constitution commit: a detached worktree written, staged, committed, its paths read, a failing signer refused, and removed', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const worktreesRoot = `${repositoryDirectory}-worktrees`;
    scratchDirectories.push(worktreesRoot);
    const commitWorktree = join(worktreesRoot, 'constitution-commits', 'J1');
    gitOutputIn(repositoryDirectory, ['config', 'user.name', 'Alex Example']);
    gitOutputIn(repositoryDirectory, ['config', 'user.email', 'alex@example.invalid']);
    // The machine's own configuration may sign every commit; the recorded repository signs none unless the case asks for a signer.
    gitOutputIn(repositoryDirectory, ['config', 'commit.gpgsign', 'false']);
    commitFile(repositoryDirectory, 'base.ts', 'export const base = 1;\n');
    const targetTip = commitFile(repositoryDirectory, 'CONSTITUTION.md', '# Example Agency\n').trim();
    const {
      COMMIT, FIRST_TIP, PATH, SECOND_TIP
    } = RECORDED_PLACEHOLDERS;
    const recordedIn = (callShape: GitCallShape, directory: string, gitArguments: readonly string[], replaced: Readonly<Record<string, string>> = {}): GitRun => {
      const answer = GitProcess.run(directory, gitArguments, 'hooks-off', undefined, dirname(commitWorktree));
      if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started`);
      const withPlaceholders = (text: string): string => Object.entries(replaced).reduce((output, [value, placeholder]) => output.replaceAll(value, placeholder), text);
      const recorded = { ...answer, standardOutput: withPlaceholders(answer.standardOutput), standardError: withPlaceholders(answer.standardError) };
      recordAnswer(callShape, recorded);
      return recorded;
    };
    const quietSuccess = { exitCode: 0, standardOutput: '', standardError: '' };
    const subject = 'Add the repository constitution';

    gitOutputIn(repositoryDirectory, ['worktree', 'add', '--quiet', '--detach', commitWorktree, targetTip]);
    writeFileSync(join(commitWorktree, 'CONSTITUTION.md'), '# Example Agency\n\n- Keep the basket page fast.\n');
    expect(recordedIn(GIT_CALL_SHAPES.STAGE_OF_A_CHANGED_PATH, commitWorktree, ['add', '--', 'CONSTITUTION.md'])).toEqual(quietSuccess);
    expect(recordedIn(GIT_CALL_SHAPES.COMMIT_OF_A_STAGED_PATH, commitWorktree, ['commit', '--no-verify', '-q', '-m', subject])).toEqual(quietSuccess);
    const commit = gitOutputIn(commitWorktree, ['rev-parse', 'HEAD']).trim();
    const pathsArguments = ['diff', '--name-only', '--no-renames', '-z', targetTip, commit, '--'];
    const tips = { [targetTip]: FIRST_TIP, [commit]: SECOND_TIP };
    expect(recordedIn(GIT_CALL_SHAPES.PATHS_BETWEEN_TWO_COMMITS, commitWorktree, pathsArguments, { ...tips, 'CONSTITUTION.md': PATH }).standardOutput).toBe(`${PATH}\0`);

    writeFileSync(join(repositoryDirectory, 'CONSTITUTION.md'), '# Example Agency, changed by hand\n');
    const nulStatusArguments = ['status', '--porcelain=v1', '-z', '--untracked-files=all'];
    const pathPlaceholder = { 'CONSTITUTION.md': PATH };
    expect(recordedIn(GIT_CALL_SHAPES.NUL_STATUS_OF_A_MODIFIED_PATH, repositoryDirectory, nulStatusArguments, pathPlaceholder).standardOutput).toBe(` M ${PATH}\0`);
    const trackedStatusArguments = ['status', '--porcelain=v1', '--untracked-files=no'];
    expect(recordedIn(GIT_CALL_SHAPES.TRACKED_STATUS_OF_A_MODIFIED_PATH, repositoryDirectory, trackedStatusArguments, pathPlaceholder).standardOutput).toBe(` M ${PATH}\n`);
    const fastForwardArguments = ['merge', '--ff-only', '--quiet', commit];
    const blocked = recordedIn(GIT_CALL_SHAPES.FAST_FORWARD_BLOCKED_BY_A_PATH, repositoryDirectory, fastForwardArguments, { ...pathPlaceholder, [commit]: COMMIT });
    expect(blocked.exitCode).not.toBe(0);
    expect(blocked.standardError).toContain(PATH);
    expect(gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']).trim()).toBe(targetTip);
    gitOutputIn(repositoryDirectory, ['checkout', '--quiet', '--', 'CONSTITUTION.md']);

    writeFileSync(join(commitWorktree, 'CONSTITUTION.md'), '# Example Agency\n\n- Name things in full.\n');
    writeFileSync(join(commitWorktree, 'base.ts'), 'export const base = 2;\n');
    gitOutputIn(commitWorktree, ['add', '--', 'CONSTITUTION.md', 'base.ts']);
    gitOutputIn(commitWorktree, ['commit', '--no-verify', '-q', '-m', subject]);
    const widerCommit = gitOutputIn(commitWorktree, ['rev-parse', 'HEAD']).trim();
    const widerArguments = ['diff', '--name-only', '--no-renames', '-z', commit, widerCommit, '--'];
    const widerTips = { [commit]: FIRST_TIP, [widerCommit]: SECOND_TIP, 'CONSTITUTION.md': PATH };
    const widerPaths = recordedIn(GIT_CALL_SHAPES.TWO_PATHS_BETWEEN_TWO_COMMITS, commitWorktree, widerArguments, widerTips);
    expect(widerPaths.standardOutput).toBe(`${PATH}\0base.ts\0`);

    gitOutputIn(repositoryDirectory, ['config', 'commit.gpgsign', 'true']);
    gitOutputIn(repositoryDirectory, ['config', 'gpg.program', 'false']);
    writeFileSync(join(commitWorktree, 'CONSTITUTION.md'), '# Example Agency\n\n- Keep every change small.\n');
    gitOutputIn(commitWorktree, ['add', '--', 'CONSTITUTION.md']);
    const unsigned = recordedIn(GIT_CALL_SHAPES.COMMIT_UNSIGNED_BY_A_FAILING_SIGNER, commitWorktree, ['commit', '--no-verify', '-q', '-m', subject]);
    expect(unsigned.exitCode).not.toBe(0);
    expect(unsigned.standardError).toContain('gpg failed to sign');
    expect(gitOutputIn(commitWorktree, ['rev-parse', 'HEAD']).trim()).toBe(widerCommit);
    gitOutputIn(commitWorktree, ['reset', '--hard', '--quiet']);

    expect(recordedIn(GIT_CALL_SHAPES.FORCED_REMOVE_OF_A_CLEAN_WORKTREE, repositoryDirectory, ['worktree', 'remove', '--force', commitWorktree])).toEqual(quietSuccess);
    expect(existsSync(commitWorktree)).toBe(false);
  });

  test('an Airlock walk answers its merge predictions, its merge-ins, a conflict, its tree reads and a fast-forward landing, recorded with placeholders', () => {
    const repositoryDirectory = realpathSync(scratchRepository());
    const target = gitOutputIn(repositoryDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    commitFile(repositoryDirectory, 'base.ts', 'export const base = 1;\n');
    const worktreesFolder = `${repositoryDirectory}-worktrees`;
    scratchDirectories.push(worktreesFolder);
    const cleanWorktree = join(worktreesFolder, 'ticket-clean');
    const conflictWorktree = join(worktreesFolder, 'ticket-conflict');
    gitOutputIn(repositoryDirectory, ['worktree', 'add', '-q', '-b', 'ticket-clean', cleanWorktree, target]);
    gitOutputIn(repositoryDirectory, ['worktree', 'add', '-q', '-b', 'ticket-conflict', conflictWorktree, target]);
    commitFile(cleanWorktree, 'checkout.ts', 'export const checkout = 1;\n');
    const conflictTip = commitFile(conflictWorktree, 'base.ts', 'export const base = 2;\n');
    const targetTip = commitFile(repositoryDirectory, 'base.ts', 'export const base = 3;\n');
    const recordedIn = (directory: string, callShape: GitCallShape, gitArguments: readonly string[], replaced: Readonly<Record<string, string>> = {}): GitRun => {
      const answer = GitProcess.run(directory, gitArguments);
      if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started`);
      const withPlaceholders = (text: string): string => Object.entries(replaced).reduce((output, [value, placeholder]) => output.replaceAll(value, placeholder), text);
      const recorded = { ...answer, standardOutput: withPlaceholders(answer.standardOutput), standardError: withPlaceholders(answer.standardError) };
      recordAnswer(callShape, recorded);
      return recorded;
    };
    const {
      BRANCH, PATH, REPOSITORY, TREE
    } = RECORDED_PLACEHOLDERS;
    const cleanTree = gitOutputIn(repositoryDirectory, ['rev-parse', 'refs/heads/ticket-clean^{tree}']).trim();

    expect(recordedIn(repositoryDirectory, GIT_CALL_SHAPES.TREE_OF_A_REVISION, ['rev-parse', '--verify', '--quiet', 'refs/heads/ticket-clean^{tree}'], { [cleanTree]: TREE }))
      .toEqual({ exitCode: 0, standardOutput: `${TREE}\n`, standardError: '' });
    expect(recordedIn(cleanWorktree, GIT_CALL_SHAPES.BRANCH_OF_A_WORKTREE, ['symbolic-ref', '--quiet', 'HEAD'], { 'ticket-clean': BRANCH }).standardOutput)
      .toBe(`refs/heads/${BRANCH}\n`);
    const predictionArguments = (branch: string): string[] => ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', target, branch];
    const cleanPrediction = GitProcess.run(repositoryDirectory, predictionArguments('ticket-clean'));
    const predictedTree = cleanPrediction?.standardOutput.split('\0')[0] ?? '';
    expect(recordedIn(repositoryDirectory, GIT_CALL_SHAPES.MERGE_TREE_OF_A_CLEAN_MERGE, predictionArguments('ticket-clean'), { [predictedTree]: TREE }))
      .toEqual({ exitCode: 0, standardOutput: `${TREE}\0`, standardError: '' });
    const conflictPrediction = GitProcess.run(repositoryDirectory, predictionArguments('ticket-conflict'));
    const conflictTree = conflictPrediction?.standardOutput.split('\0')[0] ?? '';
    expect(recordedIn(repositoryDirectory, GIT_CALL_SHAPES.MERGE_TREE_OF_A_CONFLICT, predictionArguments('ticket-conflict'), { [conflictTree]: TREE, 'base.ts': PATH }))
      .toEqual({ exitCode: 1, standardOutput: `${TREE}\0${PATH}\0`, standardError: '' });

    const cleanTip = gitOutputIn(cleanWorktree, ['rev-parse', 'HEAD']).trim();
    expect(recordedIn(cleanWorktree, GIT_CALL_SHAPES.ANCESTOR_DENIED, ['merge-base', '--is-ancestor', targetTip, cleanTip]).exitCode).toBe(1);
    expect(recordedIn(cleanWorktree, GIT_CALL_SHAPES.MERGE_IN_CLEAN, ['merge', '--no-ff', '--no-edit', '--quiet', targetTip]).exitCode).toBe(0);
    const mergedTip = gitOutputIn(cleanWorktree, ['rev-parse', 'HEAD']).trim();
    expect(recordedIn(cleanWorktree, GIT_CALL_SHAPES.ANCESTOR_CONFIRMED, ['merge-base', '--is-ancestor', targetTip, mergedTip]).exitCode).toBe(0);
    const conflicted = recordedIn(conflictWorktree, GIT_CALL_SHAPES.MERGE_IN_CONFLICTED, ['merge', '--no-ff', '--no-edit', '--quiet', targetTip], { 'base.ts': PATH });
    expect(conflicted.exitCode).toBe(1);
    expect(conflicted.standardOutput).toContain(`Merge conflict in ${PATH}`);
    expect(recordedIn(conflictWorktree, GIT_CALL_SHAPES.UNMERGED_FILES_OF_A_CONFLICT, ['diff', '--name-only', '--diff-filter=U', '-z'], { 'base.ts': PATH }).standardOutput)
      .toBe(`${PATH}\0`);
    expect(recordedIn(conflictWorktree, GIT_CALL_SHAPES.MERGE_ABORT_OF_A_CONFLICT, ['merge', '--abort']).exitCode).toBe(0);
    const quietSuccess = { exitCode: 0, standardOutput: '', standardError: '' };
    expect(recordedIn(conflictWorktree, GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT, ['reset', '--hard', '--quiet', conflictTip])).toEqual(quietSuccess);
    writeFileSync(join(conflictWorktree, 'base.ts'), 'export const base = 4;\n');
    const blocked = recordedIn(conflictWorktree, GIT_CALL_SHAPES.MERGE_IN_BLOCKED_BY_A_LOCAL_CHANGE, ['merge', '--no-ff', '--no-edit', '--quiet', targetTip], { 'base.ts': PATH });
    expect(blocked.exitCode).not.toBe(0);
    expect(blocked.standardError).toContain(PATH);
    expect(recordedIn(conflictWorktree, GIT_CALL_SHAPES.NO_UNMERGED_FILE_OF_A_REFUSED_MERGE, ['diff', '--name-only', '--diff-filter=U', '-z']).standardOutput).toBe('');

    const statusArguments = ['status', '--porcelain=v1', '-z', '--untracked-files=all'];
    expect(recordedIn(repositoryDirectory, GIT_CALL_SHAPES.NUL_STATUS_OF_A_CLEAN_CHECKOUT, statusArguments).standardOutput).toBe('');
    const changedArguments = ['diff', '--name-only', '--no-renames', '-z', 'HEAD', mergedTip, '--'];
    expect(recordedIn(repositoryDirectory, GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT, changedArguments, { 'checkout.ts': PATH }).standardOutput).toBe(`${PATH}\0`);
    expect(recordedIn(repositoryDirectory, GIT_CALL_SHAPES.FAST_FORWARD_TO_A_COMMIT, ['merge', '--ff-only', '--quiet', mergedTip])).toEqual(quietSuccess);
    expect(recordedIn(repositoryDirectory, GIT_CALL_SHAPES.COUNT_OF_AN_EMPTY_RANGE, ['rev-list', '--count', `ticket-clean..${target}`]).standardOutput).toBe('0\n');
    const topAndCommonArguments = ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'];
    const worktreePlaceholders = { [cleanWorktree]: PATH, [repositoryDirectory]: REPOSITORY };
    expect(recordedIn(cleanWorktree, GIT_CALL_SHAPES.WORKTREE_TOP_AND_COMMON_FOLDER, topAndCommonArguments, worktreePlaceholders).standardOutput)
      .toBe(`${PATH}\n${REPOSITORY}/.git\n`);
    const commonArguments = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
    expect(recordedIn(repositoryDirectory, GIT_CALL_SHAPES.ABSOLUTE_COMMON_FOLDER_AT_THE_ROOT, commonArguments, { [repositoryDirectory]: REPOSITORY }).standardOutput)
      .toBe(`${REPOSITORY}/.git\n`);
  });

  test('a folder the .gitignore names answers exit 0 with no output', () => {
    const repositoryDirectory = scratchRepository();
    writeFileSync(join(repositoryDirectory, '.gitignore'), `${EXAMPLE_FOLDER}\n`);
    const answer = recordedRun(GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED, repositoryDirectory, ['check-ignore', '-q', EXAMPLE_FOLDER]);
    expect(answer).toEqual({ exitCode: 0, standardOutput: '', standardError: '' });
  });
});
