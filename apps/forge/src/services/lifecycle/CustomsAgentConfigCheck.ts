/**
 * V13: neither the branch nor the worktree touched the agent's configuration or the hooks folder; also run before a launch on a branch,
 * and the hooks folder's digest a launch snapshot keeps.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

import type { AgentConfigurationNames } from '../../lib/agent-launch/AgentAdapter.ts';
import { type GitPathStyle, GitPaths }  from '../../lib/git/GitPaths.ts';
import { GitProcess }                   from '../../lib/git/GitProcess.ts';

import type { CustomsSubject, MergeUnderVerification } from './@types/CustomsSubject.ts';
import type { CheckVerdict }                           from './@types/CustomsVerdict.ts';
import {
  entityHomesOf,
  GIT_SEPARATOR,
  gitFields,
  HOST_PATH_STYLE,
  PASSED,
  pathsChangedInRange,
  projectPrefixOf,
  protectedFormOf,
  protectedHomeFoldersOf,
  rangeOf,
  refused,
  worktreeGitRun
} from './CustomsReadings.ts';

interface AgentConfigurationPatterns {
  atTheRoot:  readonly RegExp[];
  /** A project tracker's sessions start below the root, where the agent also reads the project's own configuration. */
  atAnyDepth: readonly RegExp[];
}

/** A name as the literal text of a pattern, in its protected form. */
function literalPatternTextOf(name: string): string {
  return protectedFormOf(name).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Matched against a protected form: each folder name with everything below it, each file name exactly. */
function agentConfigurationPatternsOf(configurationNames: AgentConfigurationNames): AgentConfigurationPatterns {
  const folders = configurationNames.folderNames.map(literalPatternTextOf);
  const files = configurationNames.fileNames.map(literalPatternTextOf);
  const patternsAfter = (start: string): RegExp[] => [
    ...folders.map((folder) => new RegExp(`${start}${folder}/`, 'u')),
    ...files.map((file) => new RegExp(`${start}${file}$`, 'u')),
  ];
  return { atTheRoot: patternsAfter('^'), atAnyDepth: patternsAfter('(^|/)') };
}

const DEFAULT_HOOKS_FOLDER = 'hooks';

const GIT_FOLDER_NAME = '.git';

/** `core.hooksPath` read from git, relative paths against the worktree's root; `.git/hooks` of the common folder otherwise. */
function hooksFolderOf(worktreePath: string): string | null {
  // Read with the repository's own setting in force: the hooks-off override would answer its own path, and reading config runs no hook.
  const configured = worktreeGitRun(worktreePath, ['config', '--get', 'core.hooksPath'], 'repository-hooks');
  if (GitProcess.succeeded(configured) && configured.standardOutput.trim() !== '') return resolve(worktreePath, configured.standardOutput.trim());
  const commonFolder = worktreeGitRun(worktreePath, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return GitProcess.succeeded(commonFolder) ? join(commonFolder.standardOutput.trim(), DEFAULT_HOOKS_FOLDER) : null;
}

/** The hooks folder as git spells a path inside the worktree, `null` when it lies outside it, where only the launch digest can tell a change. */
function hooksFolderInsideWorktree(style: GitPathStyle, worktreePath: string): string | null {
  const hooksFolder = hooksFolderOf(worktreePath);
  const gitPath = hooksFolder === null ? null : GitPaths.relativeInsideOf(style, worktreePath, hooksFolder);
  // git lists no path under the main checkout's `.git`, so a hooks folder there is judged by the digest alone.
  return gitPath === null || protectedFormOf(gitPath).split('/')[0] === GIT_FOLDER_NAME ? null : gitPath;
}

/** Any of the owner, group and other execute bits: git runs a hook only when it is executable. */
const EXECUTABLE_MODE_BITS = 0o111;

type HooksFolderReading = { verdict: 'read'; digest: string | null } | { verdict: 'unreadable' };

/**
 * The hooks folder as one digest of each entry's path and kind: a symbolic link by its target, which git follows to run it, and a file by
 * its content and whether it is executable. `null` when the folder is missing; an entry that cannot be read, or that went between the list
 * and the read, makes the folder unreadable, which no snapshot matches.
 */
export function hooksFolderReadingOf(worktreePath: string): HooksFolderReading {
  const hooksFolder = hooksFolderOf(worktreePath);
  try {
    // A hooks path that is no folder, such as the hooks-off path below the git program, holds no hook.
    if (hooksFolder === null || !existsSync(hooksFolder) || !statSync(hooksFolder).isDirectory()) return { verdict: 'read', digest: null };
    const digest = createHash('sha256');
    for (const entry of readdirSync(hooksFolder, { recursive: true, withFileTypes: true })) {
      const entryPath = join(entry.parentPath, entry.name);
      const name = relative(hooksFolder, entryPath);
      if (entry.isSymbolicLink()) digest.update(`link\0${name}\0${readlinkSync(entryPath)}\0`);
      if (!entry.isFile()) continue;
      const kind = (lstatSync(entryPath).mode & EXECUTABLE_MODE_BITS) === 0 ? 'file' : 'executable';
      digest.update(`${kind}\0${name}\0`).update(readFileSync(entryPath)).update('\0');
    }
    return { verdict: 'read', digest: digest.digest('hex') };
  } catch {
    return { verdict: 'unreadable' };
  }
}

/** The agent configuration directly in an entity home, as the root's patterns name it there; lower case, matched against a protected form. */
function agentConfigInAnEntityHome(protectedForm: string, protectedHomeFolders: readonly string[], patternsAtTheRoot: readonly RegExp[]): boolean {
  return protectedHomeFolders.some((home) => {
    const inHome = protectedForm.startsWith(`${home}${GIT_SEPARATOR}`) ? protectedForm.slice(home.length + 1) : null;
    return inHome !== null && patternsAtTheRoot.some((pattern) => pattern.test(inHome));
  });
}

/**
 * The git paths among `gitPaths` in the agent's configuration, which `configurationNames` names, or under the hooks folder, given as git
 * spells it inside the worktree; any case matches. The agent's configuration is protected at the root for a tracker at the root, as always,
 * and also in each of `entityHomes` on a pipeline with entities; at any depth for a project tracker.
 */
export function agentConfigPathsAmong(
  gitPaths: readonly string[], configurationNames: AgentConfigurationNames, hooksFolderGitPath: string | null, projectPrefix = '', entityHomes: readonly string[] = []
): string[] {
  const hooksFolder = hooksFolderGitPath === null ? null : protectedFormOf(hooksFolderGitPath);
  const configurationPatterns = agentConfigurationPatternsOf(configurationNames);
  const patterns = projectPrefix === '' ? configurationPatterns.atTheRoot : configurationPatterns.atAnyDepth;
  const protectedHomeFolders = projectPrefix === '' ? protectedHomeFoldersOf(entityHomes) : [];
  return gitPaths.filter((gitPath) => {
    const protectedForm = protectedFormOf(gitPath);
    if (patterns.some((pattern) => pattern.test(protectedForm))) return true;
    if (agentConfigInAnEntityHome(protectedForm, protectedHomeFolders, configurationPatterns.atTheRoot)) return true;
    return hooksFolder !== null && (protectedForm === hooksFolder || protectedForm.startsWith(`${hooksFolder}/`));
  });
}

interface AgentConfigurationScope {
  commit:             string;
  configurationNames: AgentConfigurationNames;
  projectPrefix:      string;
  entityHomes:        readonly string[];
  merge?:             MergeUnderVerification | undefined;
}

/** Every path a commit since `since.commit` or the worktree itself changes in the agent's configuration or an in-tree hooks folder. */
function agentConfigPathsTouched(style: GitPathStyle, worktreePath: string, since: AgentConfigurationScope): string[] | null {
  const paths = pathsChangedInRange({ worktreePath, startCommit: since.commit, ...(since.merge === undefined ? {} : { merge: since.merge }) });
  const status = gitFields(worktreePath, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  if (paths === null || status === null) return null;
  const worktreePaths = status.map((entry) => entry.slice('XY '.length));
  const hooksFolder = hooksFolderInsideWorktree(style, worktreePath);
  return agentConfigPathsAmong([...new Set([...paths, ...worktreePaths])], since.configurationNames, hooksFolder, since.projectPrefix, since.entityHomes).sort();
}

export function agentConfigUntouched(subject: CustomsSubject): CheckVerdict {
  const style = subject.pathStyle ?? HOST_PATH_STYLE;
  const touched = agentConfigPathsTouched(style, subject.worktreePath, {
    commit:             subject.startCommit,
    configurationNames: subject.agentNaming.configurationNames,
    projectPrefix:      projectPrefixOf(subject),
    entityHomes:        entityHomesOf(subject),
    merge:              subject.merge,
  });
  if (touched === null) return refused('git-failed', [rangeOf(subject)]);
  const hooksFolderReading = subject.launchSnapshot === undefined || hooksFolderInsideWorktree(style, subject.worktreePath) !== null
    ? null
    : hooksFolderReadingOf(subject.worktreePath);
  const hooksFolderChanged = hooksFolderReading !== null
    && (hooksFolderReading.verdict === 'unreadable' || hooksFolderReading.digest !== subject.launchSnapshot?.hooksFolderDigest);
  const facts = [...touched, ...(hooksFolderChanged ? [hooksFolderOf(subject.worktreePath) ?? DEFAULT_HOOKS_FOLDER] : [])];
  return facts.length === 0 ? PASSED : refused('branch-touches-agent-config', facts);
}

/**
 * V13 before a launch on the branch, resumes included: the branch's own commits past its target, and the worktree as it stands. On a
 * pipeline with entities, `entityHomes` names every entity home.
 */
export function agentConfigTouchedBeforeLaunch(
  worktreePath: string,
  target: string,
  configurationNames: AgentConfigurationNames,
  style: GitPathStyle = HOST_PATH_STYLE,
  projectPrefix = '',
  entityHomes: readonly string[] = []
): CheckVerdict {
  const base = worktreeGitRun(worktreePath, ['merge-base', target, 'HEAD']);
  if (!GitProcess.succeeded(base)) return refused('git-failed', [target]);
  const touched = agentConfigPathsTouched(style, worktreePath, {
    commit: base.standardOutput.trim(), configurationNames, projectPrefix, entityHomes
  });
  if (touched === null) return refused('git-failed', [target]);
  return touched.length === 0 ? PASSED : refused('branch-touches-agent-config', touched);
}
