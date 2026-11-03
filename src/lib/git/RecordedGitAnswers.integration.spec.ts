/**
 * Gathers the answers of real git that `src/testing/RecordedGit.ts` gives the default specs: one case for each call shape, asked in the git
 * state its name says. Each case checks the answer is the one the shape stands for, so a recording never holds a wrong state.
 * `bun run record src/lib/git/GitProcess.ts` runs this spec and writes the answers to `src/testing/recordings/<os>/`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { recordAnswer }                                              from '../../testing/RecordedAnswers.ts';
import { GIT_CALL_SHAPES, type GitCallShape, RECORDED_PLACEHOLDERS } from '../../testing/RecordedGit.ts';
import {
  RECORDED_FLOW_COMMITS,
  RECORDED_FLOW_IGNORE_FILE_TEXT,
  RECORDED_FLOW_MAIN_LINE,
  RECORDED_FLOW_PLACE_FOLDERS,
  RECORDED_FLOW_PLACEHOLDERS,
  RECORDED_FLOW_PLACES,
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
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import { GitProcess, type GitRun }  from './GitProcess.ts';

const EXAMPLE_FOLDER = '.example-cache/';
const EXAMPLE_ORIGIN = 'https://example.invalid/example-agency.git';
const EXAMPLE_MISSING_FILE = 'CLAUDE.md';
const EXAMPLE_FILE_TEXT = 'Example Agency rule: name things fully.';
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
  recordAnswer(callShape, { ...answer, standardOutput: withPlaceholders(flow, answer.standardOutput), standardError: withPlaceholders(flow, answer.standardError) });
}

/** Records every call of the stage that leaves the repository as it stands. */
function recordFlowStage(stage: RecordedFlowStageName, flow: FlowRepository): void {
  for (const call of RECORDED_FLOW_STAGES[stage].filter(({ nextStage }) => nextStage === undefined)) recordFlowCall(stage, flow, call);
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

  test('a ticket\'s flow, stage by stage: the tracker ready, the onboarding worktree, the ticket worktree, the session\'s commit, the merge', () => {
    const flow = flowRepository();
    recordFlowStage('tracker ready', flow);
    recordFlowCall('tracker ready', flow, requireTransitionTo('tracker ready', 'onboarding worktree made'));
    recordFlowStage('onboarding worktree made', flow);
    gitOutputIn(flow.directory, ['worktree', 'remove', '--force', placeFolderOf(flow, RECORDED_FLOW_PLACES.ONBOARDING_WORKTREE)]);
    recordFlowCall('tracker ready', flow, requireTransitionTo('tracker ready', 'worktree made'));
    recordFlowStage('worktree made', flow);
    commitInTheTicketWorktree(flow, 'tree changed');
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

  test('a folder the .gitignore names answers exit 0 with no output', () => {
    const repositoryDirectory = scratchRepository();
    writeFileSync(join(repositoryDirectory, '.gitignore'), `${EXAMPLE_FOLDER}\n`);
    const answer = recordedRun(GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED, repositoryDirectory, ['check-ignore', '-q', EXAMPLE_FOLDER]);
    expect(answer).toEqual({ exitCode: 0, standardOutput: '', standardError: '' });
  });
});
