import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

export interface RepositorySource {
  /** Repository-rooted, with forward slashes. */
  readonly path: string;
  readonly text: string;
}

const SKIPPED_FOLDERS = ['node_modules/', '.claude/', '.agent-progress/', '.readme-graphics/build/'];

/** Every TypeScript file in the checkout, `.tsx` included, its dependencies and the git-ignored folders left out, in path order. */
export function repositoryTypeScriptSources(repositoryRoot: string): RepositorySource[] {
  return [...new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: repositoryRoot, dot: true })]
    .filter((path) => !SKIPPED_FOLDERS.some((folder) => path.startsWith(folder) || path.includes(`/${folder}`)))
    .sort()
    .map((path) => ({ path, text: readFileSync(join(repositoryRoot, path), 'utf8') }));
}

/** What `.gitignore`, `.platform-probes/.gitignore` and a main checkout's `.claude/` keep out of git, with git's own folder. */
const UNTRACKED_PATH_PREFIXES = [
  '.git/',
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

/** Every file of the checkout git could track, by a folder walk that runs no git, its ignored paths left out, in path order. */
export function repositoryFilePaths(repositoryRoot: string): string[] {
  return [...new Bun.Glob('**/*').scanSync({ cwd: repositoryRoot, dot: true })]
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path !== WORKTREE_GIT_FILE && !UNTRACKED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
      && !path.split('/').some((part) => UNTRACKED_PATH_PARTS.includes(part)))
    .sort();
}
