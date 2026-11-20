/**
 * Where a command finds the tracker that governs it: the paths a root owns, the walk up, the nearest
 * tracker winning, and `requireWorkspace`'s refusal. The `AGENT_PROGRESS_ROOT` cases run in a child
 * process because only `src/shared/Environment.integration.spec.ts` assigns the environment in-process. git answers from the recordings of
 * `src/testing/RecordedGit.ts`, in this process and in each child.
 */
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join }             from 'node:path';
import { afterAll, expect }          from 'bun:test';
import { refusalIsOperationRefusal } from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }             from '../../shared/constants/ProductNames.ts';
import { ROOT_OVERRIDE_VARIABLE }    from '../../shared/constants/RootOverrideVariable.ts';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                 from '../../testing/ChildProcessCaseTimeout.ts';
import { jsonPrintedByAChildProcess }                              from '../../testing/JsonPrintedByAChildProcess.ts';
import type { RecordedGitStage, RecordedGitStep }                  from '../../testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit }  from '../../testing/RecordedGit.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                   from '../../testing/ToolGuard.ts';
import { writeMinimalTracker }                                     from '../../testing/TrackerFileFixtures.ts';
import { localStoreLayoutOf }                                      from './LocalStoreLayout.ts';
import {
  findWorkspace,
  requireWorkspace,
  workspacePathsFor,
  type Workspace
} from './Workspace.ts';

const WORKSPACE_MODULE_PATH = join(import.meta.dir, 'Workspace.ts');
const RECORDED_GIT_MODULE_PATH = join(import.meta.dir, '..', '..', 'testing', 'RecordedGit.ts');
const COMMON_FOLDER_OUTSIDE: RecordedGitStep = { gitArguments: ['rev-parse', '--git-common-dir'], answeredAs: GIT_CALL_SHAPES.COMMON_FOLDER_OUTSIDE };
const COMMON_FOLDER_AT_THE_ROOT: RecordedGitStep = { gitArguments: ['rev-parse', '--git-common-dir'], answeredAs: GIT_CALL_SHAPES.COMMON_FOLDER_AT_THE_ROOT };
const recordedGit = useRecordedGit();
const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchDirectory(prefix: string): string {
  const directory = createCanonicalScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return directory;
}

/** In-process, a walk that finds nothing asks git once, and the answer of `stage` is the one it gets. */
function workspaceFoundWith(stage: RecordedGitStage, startDirectory: string): Promise<Workspace | null> {
  return recordedGit.playStage(stage, async () => findWorkspace(startDirectory));
}

/** The child plays `stage` before `source` runs, and each call it could not answer fails the case once the child ends. */
function jsonPrintedByAChildPlaying(stage: RecordedGitStage, childEnvironment: Record<string, string>, source: readonly string[]): unknown {
  const reportFolder = scratchDirectory('workspace-recorded-git');
  const reportPath = join(reportFolder, 'unanswered.txt');
  writeFileSync(reportPath, '');
  const printed = jsonPrintedByAChildProcess(childEnvironment, [
    `const recordedGit = await import(${JSON.stringify(RECORDED_GIT_MODULE_PATH)});`,
    `recordedGit.playRecordedGitInThisProcess(${JSON.stringify(stage)}, ${JSON.stringify(reportPath)});`,
    ...source,
  ].join('\n'));
  expect(readFileSync(reportPath, 'utf8')).toBe('');
  return printed;
}

function rootFoundByAChildProcess(childEnvironment: Record<string, string>, startDirectory: string, stage: RecordedGitStage = []): string | null {
  return jsonPrintedByAChildPlaying(stage, childEnvironment, [
    `const loaded = await import(${JSON.stringify(WORKSPACE_MODULE_PATH)});`,
    `const found = loaded.findWorkspace(${JSON.stringify(startDirectory)});`,
    'console.log(JSON.stringify(found === null ? null : found.rootDirectory));',
  ]) as string | null;
}

function refusalDetailFromAChildProcess(childEnvironment: Record<string, string>, startDirectory: string, stage: RecordedGitStage = []): unknown {
  return jsonPrintedByAChildPlaying(stage, childEnvironment, [
    `const loaded = await import(${JSON.stringify(WORKSPACE_MODULE_PATH)});`,
    'try {',
    `  loaded.requireWorkspace(${JSON.stringify(startDirectory)});`,
    '  console.log(JSON.stringify("it found a tracker and refused nothing"));',
    '} catch (refusal) {',
    '  console.log(JSON.stringify({ status: refusal.status, detail: refusal.detail }));',
    '}',
  ]);
}

testWhenGitIsRecorded('the board\'s place is derived from one root and lands inside it, and names no record', () => {
  expect(workspacePathsFor('/example/repository')).toEqual({
    rootDirectory:    '/example/repository',
    trackerDirectory: `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}`,
    htmlFilePath:     `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/progress.html`,
  });
});

testWhenGitIsRecorded('the place is produced for a tracker that does not exist yet, because init needs it before it creates one', () => {
  const missingRoot = join(scratchDirectory('workspace-not-yet'), 'never-created');
  expect(workspacePathsFor(missingRoot).trackerDirectory).toBe(join(missingRoot, PRODUCT_NAMES.DATA_FOLDER));
});

testWhenGitIsRecorded('a relative root is made absolute, so nothing is resolved against the process working directory later', () => {
  expect(workspacePathsFor('.').rootDirectory.startsWith('/')).toBe(true);
});

testWhenGitIsRecorded('a command run in the root finds the tracker there', () => {
  const rootDirectory = writeMinimalTracker(scratchDirectory('workspace-here'));
  expect(findWorkspace(rootDirectory)?.rootDirectory).toBe(rootDirectory);
});

testWhenGitIsRecorded('a command run deep inside the repository walks up to the tracker', () => {
  const rootDirectory = writeMinimalTracker(scratchDirectory('workspace-deep'));
  const nestedDirectory = join(rootDirectory, 'packages', 'example', 'source');
  mkdirSync(nestedDirectory, { recursive: true });
  expect(findWorkspace(nestedDirectory)?.rootDirectory).toBe(rootDirectory);
});

// `git worktree add ../name` puts the checkout beside the repository, so the walk up never reaches the tracker.
testWhenGitIsRecorded('a command run in a sibling worktree finds the main checkout\'s tracker through git', async () => {
  const rootDirectory = writeMinimalTracker(scratchDirectory('workspace-worktree'));
  const worktreeDirectory = scratchDirectory('workspace-worktree-sibling');
  const commonFolderOfTheWorktree: RecordedGitStep = {
    gitArguments: ['rev-parse', '--git-common-dir'],
    answeredAs:   GIT_CALL_SHAPES.COMMON_FOLDER_IN_A_WORKTREE,
    filledIn:     { [RECORDED_PLACEHOLDERS.REPOSITORY]: rootDirectory },
  };
  expect((await workspaceFoundWith([commonFolderOfTheWorktree], worktreeDirectory))?.rootDirectory).toBe(rootDirectory);
});

testWhenGitIsRecorded('a repository with no tracker anywhere still finds nothing, worktree or not', async () => {
  expect(await workspaceFoundWith([COMMON_FOLDER_AT_THE_ROOT], scratchDirectory('workspace-untracked'))).toBeNull();
});

testWhenGitIsRecorded('the nearest tracker wins, not the outermost one', () => {
  const outerRoot = writeMinimalTracker(scratchDirectory('workspace-nesting'));
  const innerRoot = writeMinimalTracker(join(outerRoot, 'vendor', 'inner'));
  mkdirSync(join(innerRoot, 'source'), { recursive: true });
  expect(findWorkspace(join(innerRoot, 'source'))?.rootDirectory).toBe(innerRoot);
});

testWhenGitIsRecorded('a tracker directory with no progress file in it is walked straight past', () => {
  const outerRoot = writeMinimalTracker(scratchDirectory('workspace-empty-tracker'));
  const emptyTrackerRoot = join(outerRoot, 'nested');
  mkdirSync(join(emptyTrackerRoot, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
  expect(findWorkspace(emptyTrackerRoot)?.rootDirectory).toBe(outerRoot);
});

testWhenGitIsRecorded('a directory with no tracker above it at all finds nothing', async () => {
  expect(await workspaceFoundWith([COMMON_FOLDER_OUTSIDE], scratchDirectory('workspace-none'))).toBeNull();
});

testWhenGitIsRecorded('a start directory that does not exist finds nothing rather than throwing', async () => {
  const plainDirectory = scratchDirectory('workspace-gone');
  const removedDirectory = join(plainDirectory, 'removed');
  mkdirSync(removedDirectory);
  rmSync(removedDirectory, { recursive: true, force: true });
  expect(await workspaceFoundWith([COMMON_FOLDER_OUTSIDE], removedDirectory)).toBeNull();
});

testWhenGitIsRecorded('requireWorkspace refuses with an actionable status and the directory it searched from, for the command line to word', async () => {
  const plainDirectory = scratchDirectory('workspace-refusal');
  let caught: unknown = null;
  await recordedGit.playStage([COMMON_FOLDER_OUTSIDE], async () => {
    try {
      requireWorkspace(plainDirectory);
    } catch (error) {
      caught = error;
    }
  });
  expect(refusalIsOperationRefusal(caught)).toBe(true);
  expect(refusalIsOperationRefusal(caught) ? caught.status : null).toBe('refused');
  expect(refusalIsOperationRefusal(caught) ? caught.detail : null).toEqual({ kind: 'no-tracker-found', searchedFrom: plainDirectory });
});

testWhenGitIsRecorded('requireWorkspace hands back the tracker when there is one, rather than refusing defensively', () => {
  const rootDirectory = writeMinimalTracker(scratchDirectory('workspace-required'));
  expect(localStoreLayoutOf(requireWorkspace(rootDirectory)).progressRecordPath).toBe(join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'));
});

testWhenGitIsRecorded('the child-process harness can tell a found tracker from none, so its silences count', () => {
  const rootDirectory = writeMinimalTracker(scratchDirectory('workspace-harness'));
  expect(rootFoundByAChildProcess({}, rootDirectory)).toBe(rootDirectory);
  expect(rootFoundByAChildProcess({}, dirname(rootDirectory), [COMMON_FOLDER_OUTSIDE])).not.toBe(rootDirectory);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenGitIsRecorded('AGENT_PROGRESS_ROOT names the tracker outright, from a directory nowhere near it', () => {
  const rootDirectory = writeMinimalTracker(scratchDirectory('workspace-override'));
  const unrelatedDirectory = scratchDirectory('workspace-override-elsewhere');
  expect(rootFoundByAChildProcess({ [ROOT_OVERRIDE_VARIABLE]: rootDirectory }, unrelatedDirectory)).toBe(rootDirectory);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenGitIsRecorded('the override wins over a tracker the walk would otherwise have found', () => {
  const overriddenRoot = writeMinimalTracker(scratchDirectory('workspace-override-wins'));
  const walkableRoot = writeMinimalTracker(scratchDirectory('workspace-override-loses'));
  expect(rootFoundByAChildProcess({ [ROOT_OVERRIDE_VARIABLE]: overriddenRoot }, walkableRoot)).toBe(overriddenRoot);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenGitIsRecorded('an override naming a directory with no tracker finds nothing, instead of falling back to the walk', () => {
  const walkableRoot = writeMinimalTracker(scratchDirectory('workspace-override-missing'));
  const emptyDirectory = scratchDirectory('workspace-override-empty');
  expect(rootFoundByAChildProcess({ [ROOT_OVERRIDE_VARIABLE]: emptyDirectory }, walkableRoot)).toBeNull();
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenGitIsRecorded('the refusal under an override carries the override path as its only fact, and not the directory the command ran in', () => {
  const walkableRoot   = writeMinimalTracker(scratchDirectory('workspace-override-message-walkable'));
  const emptyDirectory = scratchDirectory('workspace-override-message-empty');

  expect(refusalDetailFromAChildProcess({ [ROOT_OVERRIDE_VARIABLE]: emptyDirectory }, walkableRoot)).toEqual({
    status: 'refused',
    detail: { kind: 'no-tracker-at-override', overrideDirectory: emptyDirectory },
  });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenGitIsRecorded('the refusal without an override still carries the directory that was searched from', () => {
  const plainDirectory = scratchDirectory('workspace-no-override-message');
  expect(refusalDetailFromAChildProcess({}, plainDirectory, [COMMON_FOLDER_OUTSIDE])).toEqual({
    status: 'refused',
    detail: { kind: 'no-tracker-found', searchedFrom: plainDirectory },
  });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
