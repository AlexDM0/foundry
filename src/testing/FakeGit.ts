/**
 * The git of a default spec: `useFakeGit` mocks `GitProcess`, the one place git is spawned, for a spec file, and no git process starts. The
 * history lives in plain files in a repository's `.git` folder, so a copied scratch repository is a copy here too, and the working trees are
 * the real scratch folders production code writes. Any call shape production does not make throws, so a new call fails a spec rather than
 * reading as an empty answer; `src/testing/FakeGit.integration.spec.ts` holds each shape against real git.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import {
  basename,
  dirname,
  join,
  relative,
  resolve
} from 'node:path';

import { afterAll, beforeAll, spyOn } from 'bun:test';

import { GitProcess, type GitHookPolicy, type GitRun } from '../lib/git/GitProcess.ts';
import { GIT_ENTRY_NAME }                              from '../lib/git/constants/GitConventions.ts';
import { createScratchDirectory }                      from './ScratchWorkspace.ts';

const STATE_FILE_NAME = 'fake-git-state.json';
const MAIN_BRANCH = 'master';
const BRANCH_REFERENCE_PREFIX = 'refs/heads/';
const WORKTREE_FOLDER_SEGMENT = `/${GIT_ENTRY_NAME}/worktrees/`;
const SUCCESS = 0;
const NEGATIVE_ANSWER = 1;
const FATAL = 128;
const WORKTREE_BRANCH_TAKEN = 255;
/** Real git answers the hooks-off path as the folder of this name below the git program it was started as. */
const HOOKS_OFF_FOLDER_NAME = 'hooks-off';
/** A git at least at the floor `init` and `oversee` hold. */
const FAKE_GIT_VERSION_LINE = 'git version 2.38.0';

type FileTree = Record<string, string>;

interface FakeCommit {
  parents: string[];
  tree:    FileTree;
  message: string;
}

/** `branch` null is a detached head, at `detachedCommit`. */
interface FakeCheckout {
  path:           string;
  branch:         string | null;
  detachedCommit: string | null;
  index:          FileTree;
}

interface FakeRepositoryState {
  commits:  Record<string, FakeCommit>;
  branches: Record<string, string>;
  main:     Omit<FakeCheckout, 'path'>;
  linked:   Record<string, FakeCheckout>;
}

interface FakeSession {
  state:        FakeRepositoryState;
  gitFolder:    string;
  mainPath:     string;
  checkout:     FakeCheckout;
  checkoutName: string | null;
  directory:    string;
}

function finished(exitCode: number, standardOutput = '', standardError = ''): GitRun {
  return { exitCode, standardOutput, standardError };
}

function fatal(message: string): GitRun {
  return finished(FATAL, '', `fatal: ${message}`);
}

function ownValueOf<Value>(record: Readonly<Record<string, Value>>, key: string): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function hashOf(content: unknown): string {
  return createHash('sha1').update(JSON.stringify(content)).digest('hex');
}

function treeHashOf(tree: Readonly<FileTree>): string {
  return hashOf(Object.entries(tree).sort());
}

function stateFilePathOf(gitFolder: string): string {
  return join(gitFolder, STATE_FILE_NAME);
}

function saved(session: FakeSession): void {
  writeFileSync(stateFilePathOf(session.gitFolder), JSON.stringify(session.state));
}

function linkedCheckoutOf(gitEntryPath: string): { gitFolder: string; name: string } | null {
  const pointer = readFileSync(gitEntryPath, 'utf8').trim().slice('gitdir:'.length).trim();
  const segmentIndex = pointer.indexOf(WORKTREE_FOLDER_SEGMENT);
  if (segmentIndex < 0) return null;
  return { gitFolder: join(pointer.slice(0, segmentIndex), GIT_ENTRY_NAME), name: pointer.slice(segmentIndex + WORKTREE_FOLDER_SEGMENT.length) };
}

function sessionOf(gitFolder: string, checkoutName: string | null, directory: string): FakeSession | null {
  if (!existsSync(stateFilePathOf(gitFolder))) return null;
  const state    = JSON.parse(readFileSync(stateFilePathOf(gitFolder), 'utf8')) as FakeRepositoryState;
  const mainPath = dirname(gitFolder);
  const checkout = checkoutName === null ? Object.assign(state.main, { path: mainPath }) : ownValueOf(state.linked, checkoutName);
  return checkout === undefined ? null : {
    state, gitFolder, mainPath, checkout, checkoutName, directory
  };
}

/** Like real git under `GIT_CEILING_DIRECTORIES`, the walk never goes up into the ceiling folder. */
function discoveredSession(directory: string, ceilingDirectory?: string): FakeSession | null {
  if (!existsSync(directory)) return null;
  const startDirectory = realpathSync(directory);
  const ceiling = ceilingDirectory !== undefined && existsSync(ceilingDirectory) ? realpathSync(ceilingDirectory) : null;
  for (let candidate = startDirectory; ; candidate = dirname(candidate)) {
    const gitEntryPath = join(candidate, GIT_ENTRY_NAME);
    if (existsSync(gitEntryPath)) {
      if (statSync(gitEntryPath).isDirectory()) return sessionOf(gitEntryPath, null, startDirectory);
      const linked = linkedCheckoutOf(gitEntryPath);
      return linked === null ? null : sessionOf(linked.gitFolder, linked.name, startDirectory);
    }
    if (dirname(candidate) === candidate || dirname(candidate) === ceiling) return null;
  }
}

function checkoutsOf(session: FakeSession): FakeCheckout[] {
  return [{ ...session.state.main, path: session.mainPath }, ...Object.values(session.state.linked)];
}

function headCommitOf(session: FakeSession, checkout = session.checkout): string {
  const commit = checkout.branch === null ? checkout.detachedCommit : ownValueOf(session.state.branches, checkout.branch);
  if (commit === undefined || commit === null) throw new Error('a fake checkout has no head commit');
  return commit;
}

function commitNamed(session: FakeSession, commitId: string): FakeCommit {
  const commit = ownValueOf(session.state.commits, commitId);
  if (commit === undefined) throw new Error(`the fake repository has no commit ${commitId}`);
  return commit;
}

function namedCommitOf(session: FakeSession, name: string): string | null {
  if (name === 'HEAD') return headCommitOf(session);
  const branch = name.startsWith(BRANCH_REFERENCE_PREFIX) ? name.slice(BRANCH_REFERENCE_PREFIX.length) : name;
  const tip = ownValueOf(session.state.branches, branch);
  if (tip !== undefined) return tip;
  return Object.hasOwn(session.state.commits, name) ? name : null;
}

function commitOfRevision(session: FakeSession, revision: string): string | null {
  const ancestry = /^(?<name>.+)~(?<generations>\d+)$/.exec(revision)?.groups;
  if (ancestry === undefined) return namedCommitOf(session, revision);
  let commitId = namedCommitOf(session, ancestry['name'] ?? '');
  for (let i = 0; i < Number(ancestry['generations']) && commitId !== null; i += 1) {
    const [firstParent = null] = commitNamed(session, commitId).parents;
    commitId = firstParent;
  }
  return commitId;
}

function treeOfRevision(session: FakeSession, revision: string): FileTree | null {
  const commitId = commitOfRevision(session, revision);
  return commitId === null ? null : commitNamed(session, commitId).tree;
}

function verifiedRevision(session: FakeSession, revision: string): string | null {
  const objectKind = /^(?<name>.+)\^\{(?<kind>commit|tree)\}$/.exec(revision)?.groups;
  const commitId   = commitOfRevision(session, objectKind?.['name'] ?? revision);
  if (commitId === null || objectKind?.['kind'] !== 'tree') return commitId;
  return treeHashOf(commitNamed(session, commitId).tree);
}

function ignoreRulesOf(checkoutPath: string): string[] {
  const ignorePath = join(checkoutPath, '.gitignore');
  if (!existsSync(ignorePath)) return [];
  const rules = readFileSync(ignorePath, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
  const negated = rules.find((rule) => rule.startsWith('!'));
  if (negated !== undefined) throw new Error(`the fake git reads no negated ignore rule: ${negated}`);
  return rules;
}

function ruleMatches(rule: string, path: string, isDirectory: boolean): boolean {
  const directoryOnly = rule.endsWith('/');
  if (directoryOnly && !isDirectory) return false;
  const pattern   = rule.replace(/\/$/, '');
  const anchored  = pattern.includes('/');
  const wildcards = new RegExp(`^${pattern.replace(/^\//, '').replace(/[.+^$()|[\]{}\\]/g, '\\$&').replaceAll('*', '[^/]*').replaceAll('?', '[^/]')}$`);
  return anchored ? wildcards.test(path) : path.split('/').some((segment) => wildcards.test(segment));
}

function isIgnored(rules: readonly string[], path: string, isDirectory: boolean): boolean {
  const segments = path.split('/');
  return segments.some((segment, i) => {
    const prefix = [...segments.slice(0, i), segment].join('/');
    return rules.some((rule) => ruleMatches(rule, prefix, isDirectory || i < segments.length - 1));
  });
}

function workingFileOf(checkoutPath: string, path: string): string | null {
  const absolutePath = join(checkoutPath, path);
  const entry = lstatSync(absolutePath, { throwIfNoEntry: false });
  if (entry === undefined || entry.isDirectory()) return null;
  return entry.isSymbolicLink() ? readlinkSync(absolutePath) : readFileSync(absolutePath, 'utf8');
}

function untrackedPathsIn(checkoutPath: string, index: Readonly<FileTree>, folder = ''): string[] {
  const rules = ignoreRulesOf(checkoutPath);
  return readdirSync(join(checkoutPath, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = folder === '' ? entry.name : `${folder}/${entry.name}`;
    if (entry.name === GIT_ENTRY_NAME || isIgnored(rules, path, entry.isDirectory())) return [];
    if (!entry.isDirectory()) return Object.hasOwn(index, path) ? [] : [path];
    return existsSync(join(checkoutPath, path, GIT_ENTRY_NAME)) ? [`${path}/`] : untrackedPathsIn(checkoutPath, index, path);
  });
}

function changedPathsBetween(fromTree: Readonly<FileTree>, toTree: Readonly<FileTree>): string[] {
  return [...new Set([...Object.keys(fromTree), ...Object.keys(toTree)])]
    .filter((path) => ownValueOf(fromTree, path) !== ownValueOf(toTree, path))
    .sort();
}

function statusLinesOf(session: FakeSession): string[] {
  const { checkout } = session;
  const headTree = commitNamed(session, headCommitOf(session)).tree;
  const tracked  = [...new Set([...Object.keys(headTree), ...Object.keys(checkout.index)])].sort();
  const trackedLines = tracked.flatMap((path) => {
    const inHead    = ownValueOf(headTree, path);
    const inIndex   = ownValueOf(checkout.index, path);
    const inWorking = workingFileOf(checkout.path, path);
    if (inIndex === undefined) return [`D  ${path}`];
    const indexColumn   = inHead === undefined ? 'A' : inHead === inIndex ? ' ' : 'M';
    const workingColumn = inWorking === null ? 'D' : inWorking === inIndex ? ' ' : 'M';
    return indexColumn === ' ' && workingColumn === ' ' ? [] : [`${indexColumn}${workingColumn} ${path}`];
  });
  return [...trackedLines, ...untrackedPathsIn(checkout.path, checkout.index).sort().map((path) => `?? ${path}`)];
}

function revParse(session: FakeSession, parameters: readonly string[]): GitRun {
  const asked = parameters.join(' ');
  const linkedGitFolder = session.checkoutName === null ? session.gitFolder : join(session.gitFolder, 'worktrees', session.checkoutName);
  if (asked === '--path-format=absolute --git-common-dir') return finished(SUCCESS, `${session.gitFolder}\n`);
  if (asked === '--path-format=absolute --show-toplevel --git-common-dir') return finished(SUCCESS, `${session.checkout.path}\n${session.gitFolder}\n`);
  if (asked === '--absolute-git-dir') return finished(SUCCESS, `${linkedGitFolder}\n`);
  if (asked === '--git-common-dir') {
    const printed = session.checkoutName === null ? relative(session.directory, session.gitFolder) : session.gitFolder;
    return finished(SUCCESS, `${printed}\n`);
  }
  if (asked === '--abbrev-ref HEAD') return finished(SUCCESS, `${session.checkout.branch ?? 'HEAD'}\n`);
  const [verifyFlag, quietFlag] = parameters;
  const revision = parameters.at(-1) ?? '';
  if (verifyFlag !== '--verify' || quietFlag !== '--quiet') throw new Error(`the fake git has no rev-parse ${asked}`);
  const answer = verifiedRevision(session, revision);
  return answer === null ? finished(NEGATIVE_ANSWER) : finished(SUCCESS, `${answer}\n`);
}

function reachableCommitsOf(session: FakeSession, startCommit: string): string[] {
  const reached: string[] = [];
  const pending = [startCommit];
  while (pending.length > 0) {
    const commitId = pending.shift();
    if (commitId !== undefined && !reached.includes(commitId)) {
      reached.push(commitId);
      pending.push(...commitNamed(session, commitId).parents);
    }
  }
  return reached;
}

function commitsInRange(session: FakeSession, range: string): string[] | null {
  const [excludedRevision = '', includedRevision = ''] = range.split('..');
  const excluded = commitOfRevision(session, excludedRevision);
  const included = commitOfRevision(session, includedRevision);
  if (excluded === null || included === null) return null;
  const hidden = new Set(reachableCommitsOf(session, excluded));
  return reachableCommitsOf(session, included).filter((commitId) => !hidden.has(commitId));
}

function revList(session: FakeSession, [range = '']: readonly string[]): GitRun {
  const commits = commitsInRange(session, range);
  return commits === null ? fatal(`bad revision '${range}'`) : finished(SUCCESS, commits.map((commitId) => `${commitId}\n`).join(''));
}

function pathsChangedBy(session: FakeSession, commitId: string): string[] {
  const commit = commitNamed(session, commitId);
  const [firstParent] = commit.parents;
  return changedPathsBetween(firstParent === undefined ? {} : commitNamed(session, firstParent).tree, commit.tree);
}

function log(session: FakeSession, parameters: readonly string[]): GitRun {
  const asked = parameters.slice(0, -1).join(' ');
  const last  = parameters.at(-1) ?? '';
  if (asked === '-1 --format=%B') {
    const commitId = commitOfRevision(session, last);
    return commitId === null ? fatal(`bad object ${last}`) : finished(SUCCESS, `${commitNamed(session, commitId).message}\n`);
  }
  const [range = ''] = parameters.slice(-2);
  if (parameters.slice(0, -2).join(' ') !== '--name-only --no-renames --format=' || last !== '--') throw new Error(`the fake git has no log ${parameters.join(' ')}`);
  const commits = commitsInRange(session, range);
  if (commits === null) return fatal(`bad revision '${range}'`);
  return finished(SUCCESS, commits.flatMap((commitId) => pathsChangedBy(session, commitId)).map((path) => `${path}\n`).join(''));
}

function patchAgainstHead(session: FakeSession): string {
  const headTree = commitNamed(session, headCommitOf(session)).tree;
  const tracked  = [...new Set([...Object.keys(headTree), ...Object.keys(session.checkout.index)])].sort();
  return tracked.flatMap((path) => {
    const before = ownValueOf(headTree, path) ?? '';
    const after  = workingFileOf(session.checkout.path, path) ?? '';
    return before === after ? [] : [`diff --git a/${path} b/${path}\n-${before}\n+${after}\n`];
  }).join('');
}

function diff(session: FakeSession, parameters: readonly string[]): GitRun {
  const asked = parameters.join(' ');
  if (asked === '--no-ext-diff HEAD --') return finished(SUCCESS, patchAgainstHead(session));
  const [nameOnlyFlag, renamesFlag, fromRevision = '', toRevision = ''] = parameters;
  if (nameOnlyFlag !== '--name-only' || renamesFlag !== '--no-renames' || parameters.at(-1) !== '--') throw new Error(`the fake git has no diff ${asked}`);
  const fromTree = treeOfRevision(session, fromRevision);
  const toTree   = treeOfRevision(session, toRevision);
  if (fromTree === null || toTree === null) return fatal('bad revision');
  return finished(SUCCESS, changedPathsBetween(fromTree, toTree).map((path) => `${path}\n`).join(''));
}

function status(session: FakeSession, parameters: readonly string[]): GitRun {
  const [formatFlag, untrackedFlag, renamesFlag] = parameters;
  if (formatFlag !== '--porcelain=v1' || untrackedFlag !== '--untracked-files=all' || ![undefined, '--no-renames'].includes(renamesFlag)) {
    throw new Error(`the fake git has no status ${parameters.join(' ')}`);
  }
  return finished(SUCCESS, statusLinesOf(session).map((line) => `${line}\n`).join(''));
}

function bestCommonAncestorOf(session: FakeSession, firstCommit: string, secondCommit: string): string | null {
  const secondAncestors = new Set(reachableCommitsOf(session, secondCommit));
  return reachableCommitsOf(session, firstCommit).find((commitId) => secondAncestors.has(commitId)) ?? null;
}

function mergeBase(session: FakeSession, parameters: readonly string[]): GitRun {
  const isAncestorQuestion = parameters[0] === '--is-ancestor';
  const [firstRevision = '', secondRevision = ''] = isAncestorQuestion ? parameters.slice(1) : parameters;
  const firstCommit  = commitOfRevision(session, firstRevision);
  const secondCommit = commitOfRevision(session, secondRevision);
  if (firstCommit === null || secondCommit === null) return fatal('Not a valid object name');
  if (isAncestorQuestion) return finished(reachableCommitsOf(session, secondCommit).includes(firstCommit) ? SUCCESS : NEGATIVE_ANSWER);
  const ancestor = bestCommonAncestorOf(session, firstCommit, secondCommit);
  return ancestor === null ? finished(NEGATIVE_ANSWER) : finished(SUCCESS, `${ancestor}\n`);
}

function show(session: FakeSession, [object = '']: readonly string[]): GitRun {
  const separatorIndex = object.indexOf(':');
  if (separatorIndex < 0) throw new Error(`the fake git has no show ${object}`);
  const tree = treeOfRevision(session, object.slice(0, separatorIndex));
  if (tree === null) return fatal(`invalid object name '${object}'`);
  const text = ownValueOf(tree, object.slice(separatorIndex + 1));
  return text === undefined ? fatal(`path does not exist in '${object}'`) : finished(SUCCESS, text);
}

function config(parameters: readonly string[], hookPolicy: GitHookPolicy): GitRun {
  if (parameters.join(' ') !== '--get core.hooksPath') throw new Error(`the fake git has no config ${parameters.join(' ')}`);
  return hookPolicy === 'hooks-off' ? finished(SUCCESS, `${join(Bun.which('git') ?? 'git', HOOKS_OFF_FOLDER_NAME)}\n`) : finished(NEGATIVE_ANSWER);
}

function forEachRef(session: FakeSession, [format = '', pattern = 'refs/']: readonly string[]): GitRun {
  const references = Object.entries(session.state.branches)
    .map(([branch, commitId]) => ({ branch, reference: `${BRANCH_REFERENCE_PREFIX}${branch}`, commitId }))
    .filter(({ reference }) => reference.startsWith(pattern))
    .sort((a, b) => a.reference.localeCompare(b.reference));
  if (format === '--format=%(refname:short)') return finished(SUCCESS, references.map(({ branch }) => `${branch}\n`).join(''));
  if (format === '--format=%(refname) %(objectname)') return finished(SUCCESS, references.map(({ reference, commitId }) => `${reference} ${commitId}\n`).join(''));
  throw new Error(`the fake git has no for-each-ref ${format}`);
}

function writeTree(checkoutPath: string, tree: Readonly<FileTree>): void {
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(checkoutPath, path)), { recursive: true });
    writeFileSync(join(checkoutPath, path), text);
  }
}

function worktreeList(session: FakeSession): GitRun {
  const stanzas = checkoutsOf(session).map((checkout) => {
    const headLine = checkout.branch === null ? 'detached' : `branch ${BRANCH_REFERENCE_PREFIX}${checkout.branch}`;
    return `worktree ${checkout.path}\nHEAD ${headCommitOf(session, checkout)}\n${headLine}\n\n`;
  });
  return finished(SUCCESS, stanzas.join(''));
}

function freeCheckoutNameFor(session: FakeSession, path: string): string {
  const name = basename(path);
  if (!Object.hasOwn(session.state.linked, name)) return name;
  for (let suffix = 1; ; suffix += 1) if (!Object.hasOwn(session.state.linked, `${name}${suffix}`)) return `${name}${suffix}`;
}

interface WorktreeAddition {
  newBranch: string | null;
  detached:  boolean;
  path:      string;
  start:     string;
}

function worktreeAdditionOf(parameters: readonly string[]): WorktreeAddition {
  const positional: string[] = [];
  let newBranch: string | null = null;
  let detached = false;
  for (let i = 0; i < parameters.length; i += 1) {
    const parameter = parameters[i] ?? '';
    if (parameter === '-b') {
      i += 1;
      newBranch = parameters[i] ?? '';
    } else if (parameter === '--detach') detached = true;
    else if (parameter !== '--quiet') positional.push(parameter);
  }
  const [path = '', start = ''] = positional;
  return {
    newBranch, detached, path, start
  };
}

function worktreeAdd(session: FakeSession, parameters: readonly string[]): GitRun {
  const {
    newBranch, detached, path, start
  } = worktreeAdditionOf(parameters);
  const commitId = commitOfRevision(session, start);
  if (commitId === null) return fatal(`invalid reference: ${start}`);
  if (newBranch !== null && Object.hasOwn(session.state.branches, newBranch)) return finished(WORKTREE_BRANCH_TAKEN, '', `a branch named '${newBranch}' already exists`);
  const checkoutPath = resolve(session.directory, path);
  if (existsSync(checkoutPath) && readdirSync(checkoutPath).length > 0) return fatal(`'${path}' already exists`);
  const namedBranch = newBranch === null && !detached ? start : null;
  if (namedBranch !== null && checkoutsOf(session).some((checkout) => checkout.branch === namedBranch)) return fatal(`'${namedBranch}' is already checked out`);
  const branch = newBranch ?? namedBranch;
  const { tree } = commitNamed(session, commitId);
  if (newBranch !== null) session.state.branches[newBranch] = commitId;
  mkdirSync(checkoutPath, { recursive: true });
  const resolvedPath = realpathSync(checkoutPath);
  const name = freeCheckoutNameFor(session, resolvedPath);
  mkdirSync(join(session.gitFolder, 'worktrees', name), { recursive: true });
  writeFileSync(join(resolvedPath, GIT_ENTRY_NAME), `gitdir: ${join(session.gitFolder, 'worktrees', name)}\n`);
  writeTree(resolvedPath, tree);
  session.state.linked[name] = {
    path: resolvedPath, branch, detachedCommit: branch === null ? commitId : null, index: { ...tree }
  };
  saved(session);
  return finished(SUCCESS);
}

function worktreeRemove(session: FakeSession, parameters: readonly string[]): GitRun {
  const path = parameters.at(-1) ?? '';
  if (!parameters.includes('--force')) throw new Error(`the fake git has no worktree remove ${parameters.join(' ')}`);
  const entry = Object.entries(session.state.linked).find(([, checkout]) => checkout.path === realpathSync(path));
  if (entry === undefined) return fatal(`'${path}' is not a working tree`);
  const [name, checkout] = entry;
  rmSync(checkout.path, { recursive: true, force: true });
  rmSync(join(session.gitFolder, 'worktrees', name), { recursive: true, force: true });
  delete session.state.linked[name];
  saved(session);
  return finished(SUCCESS);
}

function worktree(session: FakeSession, [action = '', ...parameters]: readonly string[]): GitRun {
  if (action === 'list' && parameters[0] === '--porcelain') return worktreeList(session);
  if (action === 'add') return worktreeAdd(session, parameters);
  if (action === 'remove') return worktreeRemove(session, parameters);
  if (action === 'prune') {
    for (const [name, checkout] of Object.entries(session.state.linked)) if (!existsSync(checkout.path)) delete session.state.linked[name];
    saved(session);
    return finished(SUCCESS);
  }
  throw new Error(`the fake git has no worktree ${action}`);
}

function add(session: FakeSession, parameters: readonly string[]): GitRun {
  const { checkout } = session;
  const rules = ignoreRulesOf(checkout.path);
  for (const path of parameters.filter((parameter) => parameter !== '--')) {
    if (isIgnored(rules, path, false)) return finished(NEGATIVE_ANSWER, '', `The following paths are ignored: ${path}`);
    const text = workingFileOf(checkout.path, path);
    if (text === null) delete checkout.index[path];
    else checkout.index[path] = text;
  }
  saved(session);
  return finished(SUCCESS);
}

function moveHeadTo(session: FakeSession, commitId: string): void {
  if (session.checkout.branch === null) session.checkout.detachedCommit = commitId;
  else session.state.branches[session.checkout.branch] = commitId;
}

function commit(session: FakeSession, parameters: readonly string[]): GitRun {
  const messageIndex = parameters.indexOf('-m') + 1;
  if (messageIndex === 0) throw new Error(`the fake git has no commit ${parameters.join(' ')}`);
  const head = headCommitOf(session);
  if (changedPathsBetween(commitNamed(session, head).tree, session.checkout.index).length === 0 && !parameters.includes('--allow-empty')) {
    return finished(NEGATIVE_ANSWER, 'nothing to commit, working tree clean\n');
  }
  const created = { parents: [head], tree: { ...session.checkout.index }, message: `${(parameters[messageIndex] ?? '').trimEnd()}\n` };
  const commitId = hashOf(created);
  session.state.commits[commitId] = created;
  moveHeadTo(session, commitId);
  saved(session);
  return finished(SUCCESS);
}

function fastForwardMerge(session: FakeSession, parameters: readonly string[]): GitRun {
  const revision = parameters.at(-1) ?? '';
  if (!parameters.includes('--ff-only')) throw new Error(`the fake git has no merge ${parameters.join(' ')}`);
  const target = commitOfRevision(session, revision);
  if (target === null) return fatal(`not something we can merge: ${revision}`);
  const head = headCommitOf(session);
  if (!reachableCommitsOf(session, target).includes(head)) return fatal('Not possible to fast-forward, aborting.');
  const headTree   = commitNamed(session, head).tree;
  const targetTree = commitNamed(session, target).tree;
  for (const path of changedPathsBetween(headTree, targetTree)) if (!Object.hasOwn(targetTree, path)) rmSync(join(session.checkout.path, path), { force: true });
  writeTree(session.checkout.path, targetTree);
  session.checkout.index = { ...targetTree };
  moveHeadTo(session, target);
  saved(session);
  return finished(SUCCESS);
}

function mergedTreeOf(baseTree: Readonly<FileTree>, ourTree: Readonly<FileTree>, theirTree: Readonly<FileTree>): { tree: FileTree; conflicted: string[] } {
  const tree: FileTree = {};
  const conflicted: string[] = [];
  for (const path of new Set([...Object.keys(baseTree), ...Object.keys(ourTree), ...Object.keys(theirTree)])) {
    const base   = ownValueOf(baseTree, path);
    const ours   = ownValueOf(ourTree, path);
    const theirs = ownValueOf(theirTree, path);
    if (ours !== base && theirs !== base && ours !== theirs) conflicted.push(path);
    const merged = ours === base ? theirs : ours;
    if (merged !== undefined) tree[path] = merged;
  }
  return { tree, conflicted: conflicted.sort() };
}

function mergeTree(session: FakeSession, parameters: readonly string[]): GitRun {
  const [ourRevision = '', theirRevision = ''] = parameters.slice(-2);
  if (parameters.slice(0, -2).join(' ') !== '--write-tree --name-only --no-messages -z --end-of-options') throw new Error(`the fake git has no merge-tree ${parameters.join(' ')}`);
  const ourCommit   = commitOfRevision(session, ourRevision);
  const theirCommit = commitOfRevision(session, theirRevision);
  if (ourCommit === null || theirCommit === null) return fatal('not something we can merge');
  const base = bestCommonAncestorOf(session, ourCommit, theirCommit);
  const { tree, conflicted } = mergedTreeOf(
    base === null ? {} : commitNamed(session, base).tree,
    commitNamed(session, ourCommit).tree,
    commitNamed(session, theirCommit).tree,
  );
  const treeId = conflicted.length === 0 ? treeHashOf(tree) : hashOf([tree, conflicted]);
  return finished(conflicted.length === 0 ? SUCCESS : NEGATIVE_ANSWER, `${[treeId, ...conflicted].join('\0')}\0`);
}

function checkIgnore(session: FakeSession, parameters: readonly string[]): GitRun {
  const path = parameters.at(-1) ?? '';
  if (parameters[0] !== '-q') throw new Error(`the fake git has no check-ignore ${parameters.join(' ')}`);
  const isDirectory = path.endsWith('/');
  return finished(isIgnored(ignoreRulesOf(session.checkout.path), path.replace(/\/$/, ''), isDirectory) ? SUCCESS : NEGATIVE_ANSWER);
}

/** A fake repository has no remote, so its origin is asked for and answered as missing. */
function remote(parameters: readonly string[]): GitRun {
  if (parameters.join(' ') !== 'get-url origin') throw new Error(`the fake git has no remote ${parameters.join(' ')}`);
  return fatal('No such remote \'origin\'');
}

function symbolicRef(session: FakeSession, parameters: readonly string[]): GitRun {
  if (parameters.join(' ') !== '--quiet --short HEAD') throw new Error(`the fake git has no symbolic-ref ${parameters.join(' ')}`);
  return session.checkout.branch === null ? finished(NEGATIVE_ANSWER) : finished(SUCCESS, `${session.checkout.branch}\n`);
}

function withoutConfigurationOverrides(gitArguments: readonly string[]): readonly string[] {
  return gitArguments[0] === '-c' ? withoutConfigurationOverrides(gitArguments.slice(2)) : gitArguments;
}

function answerOf(session: FakeSession, verb: string, parameters: readonly string[], hookPolicy: GitHookPolicy): GitRun {
  switch (verb) {
    case 'add':          return add(session, parameters);
    case 'check-ignore': return checkIgnore(session, parameters);
    case 'commit':       return commit(session, parameters);
    case 'config':       return config(parameters, hookPolicy);
    case 'diff':         return diff(session, parameters);
    case 'for-each-ref': return forEachRef(session, parameters);
    case 'log':          return log(session, parameters);
    case 'merge':        return fastForwardMerge(session, parameters);
    case 'merge-base':   return mergeBase(session, parameters);
    case 'merge-tree':   return mergeTree(session, parameters);
    case 'remote':       return remote(parameters);
    case 'rev-list':     return revList(session, parameters);
    case 'rev-parse':    return revParse(session, parameters);
    case 'show':         return show(session, parameters);
    case 'status':       return status(session, parameters);
    case 'symbolic-ref': return symbolicRef(session, parameters);
    case 'worktree':     return worktree(session, parameters);
    default:             throw new Error(`the fake git has no verb ${verb}`);
  }
}

export function fakeGitRun(
  directory: string, gitArguments: readonly string[], hookPolicy: GitHookPolicy = 'hooks-off', _standardInput?: string, ceilingDirectory?: string
): GitRun {
  // Real git answers its version anywhere, inside a repository or not.
  if (withoutConfigurationOverrides(gitArguments).join(' ') === 'version') return finished(SUCCESS, `${FAKE_GIT_VERSION_LINE}\n`);
  const session = discoveredSession(directory, ceilingDirectory);
  if (session === null) return fatal('not a git repository (or any of the parent directories): .git');
  const [verb = '', ...parameters] = withoutConfigurationOverrides(gitArguments);
  return answerOf(session, verb, parameters, hookPolicy);
}

function fakeResolvedCommitOf(directory: string, revision: string, ceilingDirectory?: string): string | null {
  const answer = fakeGitRun(directory, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`], 'hooks-off', undefined, ceilingDirectory);
  return answer.exitCode === SUCCESS ? answer.standardOutput.trim() : null;
}

/** What `git init` and one empty commit leave, in `directory`. */
export function initializeFakeGitRepository(directory: string): void {
  const gitFolder = join(directory, GIT_ENTRY_NAME);
  mkdirSync(join(gitFolder, 'hooks'), { recursive: true });
  const firstCommit: FakeCommit = { parents: [], tree: {}, message: 'Initial commit\n' };
  const commitId = hashOf(firstCommit);
  const state: FakeRepositoryState = {
    commits:  { [commitId]: firstCommit },
    branches: { [MAIN_BRANCH]: commitId },
    main:     { branch: MAIN_BRANCH, detachedCommit: null, index: {} },
    linked:   {},
  };
  writeFileSync(stateFilePathOf(gitFolder), JSON.stringify(state));
}

export interface FakeGit {
  createRepository:   (prefix: string) => string;
  commitOf:           (directory: string, revision?: string) => string;
  checkedOutBranchOf: (directory: string) => string;
  commitInSession:    (workingDirectory: string, stagedPath: string, text: string, commitMessage: string) => void;
}

/** A session's commit as its tool call would make it; a file already committed is left alone, so a resumed session plays the same step. */
function commitInSession(workingDirectory: string, stagedPath: string, text: string, commitMessage: string): void {
  mkdirSync(dirname(join(workingDirectory, stagedPath)), { recursive: true });
  writeFileSync(join(workingDirectory, stagedPath), text);
  fakeGitRun(workingDirectory, ['add', stagedPath]);
  fakeGitRun(workingDirectory, ['commit', '-q', '-m', commitMessage]);
}

/** Call at a spec file's top level: every case of the file runs on the fake, and the file's end restores `GitProcess` for the next file. */
export function useFakeGit(): FakeGit {
  beforeAll(() => {
    spyOn(GitProcess, 'run').mockImplementation(fakeGitRun);
    spyOn(GitProcess, 'resolvedCommitOf').mockImplementation(fakeResolvedCommitOf);
  });
  afterAll(() => {
    spyOn(GitProcess, 'run').mockRestore();
    spyOn(GitProcess, 'resolvedCommitOf').mockRestore();
  });
  return {
    createRepository: (prefix) => {
      const directory = createScratchDirectory(prefix);
      initializeFakeGitRepository(directory);
      return directory;
    },
    commitOf:           (directory, revision = 'HEAD') => fakeResolvedCommitOf(directory, revision) ?? '',
    checkedOutBranchOf: (directory) => fakeGitRun(directory, ['rev-parse', '--abbrev-ref', 'HEAD']).standardOutput.trim(),
    commitInSession,
  };
}
