/**
 * Git runs at a toplevel only: the repository root for the main checkout, a worktree's root for a job. A tracker's `rootDirectory` is its
 * project folder, below the repository root when the tracker is, and a git call there under a ceiling of its parent finds no repository,
 * while a cwd-relative form reaches only the folder's subtree. No source hands a tracker's folder to a git entry point or to `ceilingOf`,
 * but those listed with their reason, a list exact both ways. Each form is planted and watched failing. A session in a job's worktree
 * starts at its toplevel too, where Claude Code's sandbox lets it commit: only the listed sources name the project folder in a checkout, by
 * its name or joined from the project's prefix, and `SessionPlace.ts` only in its snapshot's session, so a job session started there is
 * named. `src/services/overseer/SessionPlace.spec.ts` holds each place and the resumed start, and
 * `src/services/lifecycle/GateRun.projectFolder.spec.ts` that a gate and a prepare step start in the project folder.
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

/** The project folder in a checkout, by its name or joined from the project's prefix: where a gate starts and no job session does. */
const PROJECT_FOLDER_IN_CHECKOUT_FORMS: readonly RegExp[] = [
  /\bprojectDirectoryInWorktree\b/g,
  /\bjoin\([^)]*\bprojectPrefix\b/g,
];

interface ProjectFolderNamer {
  reason:          string;
  /** The one function of the source that may name it; the rest of the source may not. */
  onlyInFunction?: string;
}

/** The sources that name the project folder in a checkout, each with why it may. */
const PROJECT_FOLDER_IN_CHECKOUT_NAMERS: Readonly<Record<string, ProjectFolderNamer>> = {
  'src/services/tracker/ProjectLocation.ts': { reason: 'defines it' },
  'src/services/lifecycle/GateRun.ts':       { reason: 'a gate and a prepare step start in the project folder of their checkout' },
  'src/services/overseer/WorkerProfiles.ts': { reason: 'the project folder\'s `.claude` in a worktree is protected from writes' },
  'src/services/overseer/SessionPlace.ts':   {
    reason:         'a pipeline agent\'s snapshot, which it only reads, starts its session there; a job\'s session does not',
    onlyInFunction: 'snapshotSessionPlaceOf',
  },
};

const FUNCTION_END = '\n}\n';

/** The body of a top-level function of the text, from its declaration to its closing brace; `null` when the text declares none of that name. */
function functionTextOf(text: string, functionName: string): string | null {
  const declaration = text.indexOf(`function ${functionName}(`);
  const end = declaration === -1 ? -1 : text.indexOf(FUNCTION_END, declaration);
  return end === -1 ? null : text.slice(declaration, end + FUNCTION_END.length);
}

function namesProjectFolderInCheckout(text: string): boolean {
  return PROJECT_FOLDER_IN_CHECKOUT_FORMS.some((form) => [...text.matchAll(form)].length > 0);
}

/** The sources naming the project folder in a checkout outside the one function their entry allows. */
function projectFolderInCheckoutNamersOf(sources: readonly RepositorySource[]): string[] {
  return [...new Set(sources
    .filter((source) => !source.path.endsWith(SPEC_FILE_SUFFIX))
    .filter((source) => {
      const allowedFunction = PROJECT_FOLDER_IN_CHECKOUT_NAMERS[source.path]?.onlyInFunction;
      const allowedText = allowedFunction === undefined ? null : functionTextOf(source.text, allowedFunction);
      return namesProjectFolderInCheckout(allowedText === null ? source.text : source.text.replace(allowedText, ''));
    })
    .map((source) => source.path))].sort();
}

function sourceTextOf(sources: readonly RepositorySource[], sourcePath: string): string {
  const source = sources.find((candidate) => candidate.path === sourcePath);
  if (source === undefined) throw new Error(`${sourcePath} is no source of the program`);
  return source.text;
}

describe('a job\'s session starts at its worktree\'s toplevel', () => {
  const sources = repositoryTypeScriptSources(PROGRAM_ROOT);
  const sessionPlacePath = 'src/services/overseer/SessionPlace.ts';
  const sessionPlaceText = sourceTextOf(sources, sessionPlacePath);

  test('only the listed sources name the project folder in a checkout outside their allowed function, and each of them still does', () => {
    const unscopedNamers = Object.entries(PROJECT_FOLDER_IN_CHECKOUT_NAMERS).filter(([, namer]) => namer.onlyInFunction === undefined);
    expect(projectFolderInCheckoutNamersOf(sources)).toEqual(unscopedNamers.map(([sourcePath]) => sourcePath).sort());
  });

  test('each source allowed one function names the project folder in a checkout inside it', () => {
    for (const [sourcePath, namer] of Object.entries(PROJECT_FOLDER_IN_CHECKOUT_NAMERS)) {
      if (namer.onlyInFunction === undefined) continue;
      expect(namesProjectFolderInCheckout(functionTextOf(sourceTextOf(sources, sourcePath), namer.onlyInFunction) ?? '')).toBe(true);
    }
  });

  test('a job\'s session started in the project folder of its worktree, planted in SessionPlace.ts, is named', () => {
    const jobStart = 'workingDirectory: ticketWorktree,';
    expect(sessionPlaceText).toContain(jobStart);
    const plantedForms = [
      'workingDirectory: worktreeProjectLocationOf(location, ticketWorktree).projectDirectoryInWorktree,',
      'workingDirectory: join(ticketWorktree, location.projectPrefix),',
    ];
    for (const plantedForm of plantedForms) {
      const planted = { path: sessionPlacePath, text: sessionPlaceText.replace(jobStart, plantedForm) };
      expect(projectFolderInCheckoutNamersOf([planted])).toEqual([sessionPlacePath]);
    }
    expect(projectFolderInCheckoutNamersOf([{ path: sessionPlacePath, text: sessionPlaceText }])).toEqual([]);
  });

  test('a planted start in the project folder of a worktree elsewhere is named, and one at its root is not', () => {
    const planted = 'return { workingDirectory: worktreeProjectLocationOf(location, worktree).projectDirectoryInWorktree };';
    expect(projectFolderInCheckoutNamersOf([{ path: 'src/services/Example.ts', text: planted }])).toEqual(['src/services/Example.ts']);
    expect(projectFolderInCheckoutNamersOf([{ path: 'src/services/Example.ts', text: 'return { workingDirectory: worktree };' }])).toEqual([]);
  });
});
