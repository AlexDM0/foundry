/**
 * The checkout's files, read once per run: `bun test` runs every spec file in one process, so each guard shares the one frozen read
 * rather than walking the tree again. A guard plants its own sources beside the shared ones, never into them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';

export interface RepositorySource {
  /** Repository-rooted, with forward slashes. */
  readonly path: string;
  readonly text: string;
}

const SKIPPED_FOLDERS = ['node_modules/', '.claude/', '.agent-progress/', '.readme-graphics/build/'];
const GIT_FOLDER = '.git/';
const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx'];

/**
 * Every file below the root, repository-rooted with forward slashes, not descending into a folder `skipsFolder` names (its path ends in
 * `/`). A symbolic link is left out, as a glob leaves it.
 */
function filePathsBelow(repositoryRoot: string, skipsFolder: (folderPath: string) => boolean): string[] {
  const filePaths: string[] = [];
  const pendingFolders = [''];
  for (let folder = pendingFolders.pop(); folder !== undefined; folder = pendingFolders.pop()) {
    for (const entry of readdirSync(join(repositoryRoot, folder), { withFileTypes: true })) {
      const path = `${folder}${entry.name}`;
      if (entry.isDirectory() && !skipsFolder(`${path}/`)) pendingFolders.push(`${path}/`);
      else if (entry.isFile()) filePaths.push(path);
    }
  }
  return filePaths.sort();
}

function isInASkippedFolder(path: string): boolean {
  return SKIPPED_FOLDERS.some((folder) => path.startsWith(folder) || path.includes(`/${folder}`));
}

const typeScriptSourcesByRoot = new Map<string, readonly RepositorySource[]>();

/** Every TypeScript file in the checkout, `.tsx` included, its dependencies and the git-ignored folders left out, in path order. */
export function repositoryTypeScriptSources(repositoryRoot: string): readonly RepositorySource[] {
  const known = typeScriptSourcesByRoot.get(repositoryRoot);
  if (known !== undefined) return known;
  const sources = Object.freeze(filePathsBelow(repositoryRoot, (folderPath) => folderPath === GIT_FOLDER || isInASkippedFolder(folderPath))
    .filter((path) => TYPESCRIPT_EXTENSIONS.some((extension) => path.endsWith(extension)) && !isInASkippedFolder(path))
    .map((path) => Object.freeze({ path, text: readFileSync(join(repositoryRoot, path), 'utf8') })));
  typeScriptSourcesByRoot.set(repositoryRoot, sources);
  return sources;
}

/** What `.gitignore`, `.platform-probes/.gitignore` and a main checkout's `.claude/` keep out of git, with git's own folder. */
const UNTRACKED_PATH_PREFIXES = [
  GIT_FOLDER,
  'node_modules/',
  '.agent-progress/',
  '.readme-graphics/build/',
  '.platform-probes/results/',
  '.claude/worktrees/',
  '.claude/skills/',
  '.claude/agents/',
  '.claude/.evidence/',
  '.claude/settings.local.json',
  '.claude/launch.json',
  '.idea/',
  'design_handoff',
];
const UNTRACKED_PATH_PARTS = ['.DS_Store', '__pycache__'];
const WORKTREE_GIT_FILE = '.git';

function isUntracked(path: string): boolean {
  return UNTRACKED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) || path.split('/').some((part) => UNTRACKED_PATH_PARTS.includes(part));
}

const filePathsByRoot = new Map<string, readonly string[]>();

/** Every file of the checkout git could track, by a folder walk that runs no git, its ignored paths left out, in path order. */
export function repositoryFilePaths(repositoryRoot: string): readonly string[] {
  const known = filePathsByRoot.get(repositoryRoot);
  if (known !== undefined) return known;
  const filePaths = Object.freeze(filePathsBelow(repositoryRoot, isUntracked).filter((path) => path !== WORKTREE_GIT_FILE && !isUntracked(path)));
  filePathsByRoot.set(repositoryRoot, filePaths);
  return filePaths;
}

/**
 * `compute` answered once per source: a guard asking twice of a shared source reads it once, and a planted source, a new object, is
 * answered on its own. Keep the answer free of syntax trees, which a run would otherwise hold for every source.
 */
export function memoisedPerSource<Answer>(compute: (source: RepositorySource) => Answer): (source: RepositorySource) => Answer {
  const answers = new WeakMap<RepositorySource, Answer>();
  return (source) => {
    if (answers.has(source)) return answers.get(source) as Answer;
    const answer = compute(source);
    answers.set(source, answer);
    return answer;
  };
}
