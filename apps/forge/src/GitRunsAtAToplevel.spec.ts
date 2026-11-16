/**
 * Git runs at a toplevel only: the repository root for the main checkout, a worktree's root for a job. A tracker's `rootDirectory` is its
 * project folder, below the repository root when the tracker is, and a git call there under a ceiling of its parent finds no repository,
 * while a cwd-relative form reaches only the folder's subtree. No source hands a tracker's folder to a git entry point or to `ceilingOf`,
 * but those listed with their reason, a list exact both ways. Each form is planted and watched failing.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { RepositorySource }       from './testing/RepositorySources.ts';
import { repositoryTypeScriptSources } from './testing/RepositorySources.ts';

const PROGRAM_ROOT = join(import.meta.dir, '..');
const SPEC_FILE_SUFFIX = '.spec.ts';

/** A git entry point's first argument, an object's `repositoryDirectory` and a ceiling, each naming a tracker's own folder. */
const TRACKER_FOLDER_GIT_FORMS: readonly RegExp[] = [
  /\b(?:GitProcess|GitWorktrees|GroupWorktrees)\.\w+\(\s*[^,()]*?\brootDirectory\s*[,)]/g,
  /\brepositoryDirectory:\s*[\w.]*\brootDirectory\b/g,
  /\bceilingOf\(\s*[^)]*\brootDirectory/g,
];

/** The sources that still hand git a tracker's folder, each with why it may. */
const TRACKER_FOLDER_GIT_CALLERS: Readonly<Record<string, string>> = {
  'src/lib/git/GitIgnore.ts':                    'check-ignore is cwd-relative on purpose: it asks the project\'s own ignore lines',
  'src/services/tracker/MonitorRegistration.ts': 'the origin it reads is the same from every folder of a checkout, under no ceiling',
  'src/services/overseer/BoardState.ts':         'reads the main line\'s tip under no ceiling; not yet moved to the repository root',
  'src/services/control/AirlockControls.ts':     'reads a target\'s tip under no ceiling; not yet moved to the repository root',
  'cli/tracking/namespace/NamespaceCommand.ts':  'lists branches under no ceiling; not yet moved to the repository root',
};

function trackerFolderGitCallsOf(sources: readonly RepositorySource[]): string[] {
  return sources
    .filter((source) => !source.path.endsWith(SPEC_FILE_SUFFIX))
    .flatMap((source) => TRACKER_FOLDER_GIT_FORMS.flatMap((form) => [...source.text.matchAll(form)].map((match) => `${source.path}: ${match[0]}`)));
}

function callerPathsOf(calls: readonly string[]): string[] {
  return [...new Set(calls.map((call) => call.slice(0, call.indexOf(': '))))].sort();
}

describe('git runs at a toplevel only', () => {
  test('only the listed sources hand git a tracker\'s own folder, and each of them still does', () => {
    const sources = repositoryTypeScriptSources(PROGRAM_ROOT);
    expect(sources.length).toBeGreaterThan(0);
    expect(callerPathsOf(trackerFolderGitCallsOf(sources))).toEqual(Object.keys(TRACKER_FOLDER_GIT_CALLERS).sort());
  });

  test.each([
    ['a run', 'GitProcess.run(workspace.rootDirectory, [\'status\']);'],
    ['a run with its folder on the next line', 'GitProcess.resolvedCommitOf(\n  context.workspace.rootDirectory,\n  mainLine);'],
    ['a worktree question', 'GitWorktrees.worktreeStateOf(rootDirectory, worktree);'],
    ['a group worktree', 'GroupWorktrees.prepareGroupWorktree(rootDirectory, worktreesRoot, target, mainLine);'],
    ['a removal', 'GitWorktrees.removeWithRetry({ repositoryDirectory: workspace.rootDirectory, worktreePath }, primitives);'],
    ['a ceiling', 'GitProcess.run(worktree, [\'status\'], \'hooks-off\', undefined, GitWorktrees.ceilingOf(workspace.rootDirectory));'],
  ])('a planted %s at a tracker\'s folder is named', (_formName, text) => {
    expect(callerPathsOf(trackerFolderGitCallsOf([{ path: 'src/services/Example.ts', text }]))).toEqual(['src/services/Example.ts']);
  });

  test.each([
    ['the repository root', 'GitProcess.run(repositoryRoot, [\'status\']);'],
    ['a project location\'s root', 'GitProcess.resolvedCommitOf(projectLocationOf(workspace.rootDirectory).repositoryRoot, mainLine);'],
    ['a worktree', 'GitProcess.run(worktree, [\'status\'], \'hooks-off\', undefined, GitWorktrees.ceilingOf(worktree));'],
    ['a removal from the repository root', 'GitWorktrees.removeWithRetry({ repositoryDirectory: repositoryRoot, worktreePath }, primitives);'],
  ])('git at %s is not named', (_formName, text) => {
    expect(trackerFolderGitCallsOf([{ path: 'src/services/Example.ts', text }])).toEqual([]);
  });

  test('a spec may hand git any folder', () => {
    expect(trackerFolderGitCallsOf([{ path: 'src/services/Example.spec.ts', text: 'GitProcess.run(workspace.rootDirectory, []);' }])).toEqual([]);
  });
});
