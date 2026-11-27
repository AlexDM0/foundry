/**
 * The checkout's files, read once per run: `bun test` runs every spec file in one process, so each architecture test shares the one frozen read
 * rather than walking the tree again. An architecture test plants its own sources beside the shared ones, never into them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';

import { JsonRecordUtil }  from '../lib/json-record/JsonRecordUtil.ts';
import { workspaceRootOf } from '../shared/WorkspaceRoot.ts';

export interface RepositorySource {
  /** Repository-rooted, with forward slashes. */
  readonly path: string;
  readonly text: string;
}

/** Matched at any depth: a tracker's data and ticket worktrees, turbo's cache and a build's output are no sources of the program. */
const SKIPPED_FOLDERS = [
  'node_modules/',
  '.claude/',
  '.agent-progress/',
  '.forge/',
  '.forge-worktrees/',
  '.turbo/',
  '.scratch/',
  'storybook-static/',
  '.readme-graphics/build/',
];
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
  '.readme-graphics/build/',
  '.platform-probes/results/',
  '.claude/worktrees/',
  '.claude/skills/',
  '.claude/agents/',
  '.claude/.evidence/',
  '.claude/settings.local.json',
  '.claude/launch.json',
  '.idea/',
];
const UNTRACKED_PATH_PARTS = [
  '.DS_Store',
  '__pycache__',
  'node_modules',
  '.agent-progress',
  '.forge',
  '.forge-worktrees',
  '.turbo',
  '.scratch',
  'storybook-static',
];
const UNTRACKED_FILE_SUFFIXES = ['.tsbuildinfo'];
const WORKTREE_GIT_FILE = '.git';

function isUntracked(path: string): boolean {
  return UNTRACKED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) || path.split('/').some((part) => UNTRACKED_PATH_PARTS.includes(part))
    || UNTRACKED_FILE_SUFFIXES.some((suffix) => path.endsWith(suffix));
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
 * `compute` answered once per source: an architecture test asking twice of a shared source reads it once, and a planted source, a new object, is
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

/** A workspace package the program declares as a dependency, read under a virtual folder named after the package. */
export interface DeclaredWorkspacePackage {
  readonly name:   string;
  /** The package's real folder, absolute. */
  readonly folder: string;
}

const WORKSPACE_DEPENDENCY_PREFIX = 'workspace:';

function manifestOf(folder: string): Record<string, unknown> {
  return JsonRecordUtil.recordOf(JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))) ?? {};
}

/** The root of the workspace the program sits in, where the files the whole repository shares live; a program outside one is refused. */
export function workspaceRootOfProgram(programRoot: string): string {
  const workspaceRoot = workspaceRootOf(programRoot);
  if (workspaceRoot === undefined) throw new Error(`${programRoot} sits in no Bun workspace`);
  return workspaceRoot;
}

/** Each package `package.json` names at `workspace:`, found by its name among the workspace's members, in name order. */
export function declaredWorkspacePackagesOf(programRoot: string): readonly DeclaredWorkspacePackage[] {
  const workspaceRoot = workspaceRootOfProgram(programRoot);
  const memberPatterns = manifestOf(workspaceRoot)['workspaces'];
  const memberFolders = (Array.isArray(memberPatterns) ? memberPatterns : [])
    .filter((pattern): pattern is string => typeof pattern === 'string')
    .flatMap((pattern) => [...new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: workspaceRoot })])
    .map((manifestPath) => join(workspaceRoot, manifestPath, '..'));
  const declaredNames = Object.entries(JsonRecordUtil.recordOf(manifestOf(programRoot)['dependencies']) ?? {})
    .filter(([, version]) => typeof version === 'string' && version.startsWith(WORKSPACE_DEPENDENCY_PREFIX))
    .map(([name]) => name)
    .sort();
  return declaredNames.map((name) => {
    const folder = memberFolders.find((memberFolder) => manifestOf(memberFolder)['name'] === name);
    if (folder === undefined) throw new Error(`${name} is declared at ${WORKSPACE_DEPENDENCY_PREFIX} but no workspace member is named so`);
    return { name, folder };
  });
}

/** A file of the program or of a package it declares: `path` as the architecture tests name it, `location` where it is read. */
export interface ProgramFile {
  readonly path:     string;
  readonly location: string;
}

function packageFolderPrefixOf(workspacePackage: DeclaredWorkspacePackage): string {
  return `${workspacePackage.name}/`;
}

/** A read of the program root plus each declared package under its virtual folder; a package that gave nothing fails the read rather than pass on it. */
function programAndPackages<Entry extends { readonly path: string }>(
  programRoot: string,
  readBelow: (root: string, folderPrefix: string) => readonly Entry[],
): readonly Entry[] {
  const ownEntries = readBelow(programRoot, '');
  const packageEntries = declaredWorkspacePackagesOf(programRoot).flatMap((workspacePackage) => {
    const prefix = packageFolderPrefixOf(workspacePackage);
    if (ownEntries.some(({ path }) => path.startsWith(prefix))) throw new Error(`the program holds a folder ${prefix} that shadows the package's virtual one`);
    const entries = readBelow(workspacePackage.folder, prefix);
    if (entries.length === 0) throw new Error(`the read found no file of the declared package ${workspacePackage.name}`);
    return entries;
  });
  return Object.freeze([...ownEntries, ...packageEntries]);
}

const programSourcesByRoot = new Map<string, readonly RepositorySource[]>();

/**
 * Every TypeScript source of the program and of each workspace package it declares, the package's under a folder named after it
 * (`forge-contracts/constants/ForgeSystemVersions.ts`), so an architecture test holds a package as it held the folder the package once was.
 */
export function programTypeScriptSources(programRoot: string): readonly RepositorySource[] {
  const known = programSourcesByRoot.get(programRoot);
  if (known !== undefined) return known;
  const sources = programAndPackages(programRoot, (root, folderPrefix) => repositoryTypeScriptSources(root)
    .map((source) => (folderPrefix === '' ? source : Object.freeze({ path: `${folderPrefix}${source.path}`, text: source.text }))));
  programSourcesByRoot.set(programRoot, sources);
  return sources;
}

const programFilesByRoot = new Map<string, readonly ProgramFile[]>();

/** Every file git could track of the program and of each workspace package it declares, named as `programTypeScriptSources` names them. */
export function programFiles(programRoot: string): readonly ProgramFile[] {
  const known = programFilesByRoot.get(programRoot);
  if (known !== undefined) return known;
  const files = programAndPackages(programRoot, (root, folderPrefix) => repositoryFilePaths(root)
    .map((path) => Object.freeze({ path: `${folderPrefix}${path}`, location: join(root, path) })));
  programFilesByRoot.set(programRoot, files);
  return files;
}
