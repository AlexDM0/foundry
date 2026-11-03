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

import { writeFileAtomically }                         from '../lib/atomic-file/AtomicFile.ts';
import { GitProcess, type GitHookPolicy, type GitRun } from '../lib/git/GitProcess.ts';
import { GIT_ENTRY_NAME, PORTABLE_GIT_SETTINGS }       from '../lib/git/constants/GitConventions.ts';
import { GpgDirectories }                              from '../services/overseer/GpgDirectories.ts';
import { createScratchDirectory }                      from './ScratchWorkspace.ts';

const STATE_FILE_NAME = 'fake-git-state.json';
/** The trees `merge-tree` wrote, one file each, so a later diff can name one and a read never rewrites the state. */
const WRITTEN_TREES_FOLDER_NAME = 'fake-git-trees';
const MAIN_BRANCH = 'master';
const BRANCH_REFERENCE_PREFIX = 'refs/heads/';
const WORKTREE_FOLDER_SEGMENT = `/${GIT_ENTRY_NAME}/worktrees/`;
const END_OF_OPTIONS = '--end-of-options';
const SUCCESS = 0;
const NEGATIVE_ANSWER = 1;
const DIFFERENCES_FOUND = 1;
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

/** `branch` null is a detached head, at `detachedCommit`; `mergeHead` is set while a conflicted merge waits, `unmerged` its paths not yet added. */
interface FakeCheckout {
  path:           string;
  branch:         string | null;
  detachedCommit: string | null;
  index:          FileTree;
  mergeHead?:     string;
  unmerged?:      string[];
  /** The branch, or the detached commit, that `checkout -` goes back to. */
  previous?:      string;
}

interface FakeRepositoryState {
  commits:   Record<string, FakeCommit>;
  branches:  Record<string, string>;
  main:      Omit<FakeCheckout, 'path'>;
  linked:    Record<string, FakeCheckout>;
  /** The keys a spec set with `git config <key> <value>`, written only once one is set. */
  settings?: Record<string, string>;
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

/** Atomic, since a git process of a Watcher child may read the state while the spec's own fake writes it. */
function saved(session: FakeSession): void {
  writeFileAtomically(stateFilePathOf(session.gitFolder), JSON.stringify(session.state));
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
  if (name === 'MERGE_HEAD') return session.checkout.mergeHead ?? null;
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
  const writtenTreePath = join(session.gitFolder, WRITTEN_TREES_FOLDER_NAME, `${revision}.json`);
  if (/^[0-9a-f]{40}$/.test(revision) && existsSync(writtenTreePath)) return JSON.parse(readFileSync(writtenTreePath, 'utf8')) as FileTree;
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

/** The one attribute line the fake reads, `* text`: git then stores every file with LF line endings and compares a working file so cleaned. */
function normalisesLineEndings(checkoutPath: string): boolean {
  const attributesPath = join(checkoutPath, '.gitattributes');
  if (!existsSync(attributesPath)) return false;
  const lines = readFileSync(attributesPath, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
  const unread = lines.find((line) => line !== '* text');
  if (unread !== undefined) throw new Error(`the fake git reads no attribute line ${unread}`);
  return lines.length > 0;
}

function cleanedWorkingFileOf(checkoutPath: string, path: string): string | null {
  const text = workingFileOf(checkoutPath, path);
  return text !== null && normalisesLineEndings(checkoutPath) ? text.replaceAll('\r\n', '\n') : text;
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
    const inWorking = cleanedWorkingFileOf(checkout.path, path);
    if (inIndex === undefined) return [`D  ${path}`];
    const indexColumn   = inHead === undefined ? 'A' : inHead === inIndex ? ' ' : 'M';
    const workingColumn = inWorking === null ? 'D' : inWorking === inIndex ? ' ' : 'M';
    return indexColumn === ' ' && workingColumn === ' ' ? [] : [`${indexColumn}${workingColumn} ${path}`];
  });
  return [...trackedLines, ...untrackedPathsIn(checkout.path, checkout.index).sort().map((path) => `?? ${path}`)];
}

/** Real git echoes `--end-of-options`, then each commit, and on the first name it cannot resolve prints that name and stops. */
function tipsOf(session: FakeSession, revisions: readonly string[]): GitRun {
  const printed = [END_OF_OPTIONS];
  for (const revision of revisions) {
    const commitId = commitOfRevision(session, revision);
    printed.push(commitId ?? revision);
    if (commitId === null) return finished(FATAL, `${printed.join('\n')}\n`, `fatal: ambiguous argument '${revision}': unknown revision`);
  }
  return finished(SUCCESS, `${printed.join('\n')}\n`);
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
  if (asked === '--show-toplevel') return finished(SUCCESS, `${session.checkout.path}\n`);
  const gitPathMatch = /^(--path-format=absolute )?--git-path (\S+)$/.exec(asked);
  if (gitPathMatch !== null) {
    const gitPath = join(linkedGitFolder, gitPathMatch[2] ?? '');
    // Real git names a path in the main checkout's own `.git` relative to the working directory, unless asked for an absolute one.
    const printed = gitPathMatch[1] === undefined && session.checkoutName === null ? relative(session.directory, gitPath) : gitPath;
    return finished(SUCCESS, `${printed}\n`);
  }
  if (parameters[0] === END_OF_OPTIONS) return tipsOf(session, parameters.slice(1));
  const [onlyRevision] = parameters;
  if (parameters.length === 1 && onlyRevision !== undefined && !onlyRevision.startsWith('-')) {
    const answer = verifiedRevision(session, onlyRevision);
    return answer === null ? fatal(`ambiguous argument '${onlyRevision}': unknown revision or path not in the working tree.`) : finished(SUCCESS, `${answer}\n`);
  }
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


const REV_LIST_FLAGS = new Set(['--merges', '--reverse', '--parents', '--count']);

/** The commits `revisions` name as `rev-list` reads them: `a..b` ranges, `^a` exclusions and plain tips, newest first. */
function selectedCommitsOf(session: FakeSession, revisions: readonly string[]): string[] | null {
  const included: string[] = [];
  const hidden = new Set<string>();
  for (const revision of revisions) {
    const [excludedRevision, includedRevision] = revision.includes('..') ? revision.split('..') : [null, revision];
    const excludedName = excludedRevision ?? (revision.startsWith('^') ? revision.slice(1) : null);
    if (excludedName !== null) {
      const excluded = commitOfRevision(session, excludedName);
      if (excluded === null) return null;
      for (const commitId of reachableCommitsOf(session, excluded)) hidden.add(commitId);
    }
    if (includedRevision !== undefined && !revision.startsWith('^')) {
      const tip = commitOfRevision(session, includedRevision === '' ? 'HEAD' : includedRevision);
      if (tip === null) return null;
      included.push(...reachableCommitsOf(session, tip));
    }
  }
  return [...new Set(included)].filter((commitId) => !hidden.has(commitId));
}

function revList(session: FakeSession, parameters: readonly string[]): GitRun {
  let maximumCount = Number.POSITIVE_INFINITY;
  const flags = new Set<string>();
  const revisions: string[] = [];
  for (let i = 0; i < parameters.length; i += 1) {
    const parameter = parameters[i] ?? '';
    if (parameter === '-n') {
      i += 1;
      maximumCount = Number(parameters[i]);
    } else if (parameter.startsWith('--max-count=')) maximumCount = Number(parameter.slice('--max-count='.length));
    else if (REV_LIST_FLAGS.has(parameter)) flags.add(parameter);
    else if (parameter.startsWith('-') && parameter !== END_OF_OPTIONS) throw new Error(`the fake git has no rev-list ${parameters.join(' ')}`);
    else if (parameter !== END_OF_OPTIONS) revisions.push(parameter);
  }
  const selected = selectedCommitsOf(session, revisions);
  if (selected === null) return fatal(`bad revision '${revisions.join(' ')}'`);
  const merges = flags.has('--merges') ? selected.filter((commitId) => commitNamed(session, commitId).parents.length > 1) : selected;
  const counted = merges.slice(0, maximumCount);
  if (flags.has('--count')) return finished(SUCCESS, `${counted.length}\n`);
  const ordered = flags.has('--reverse') ? counted.reverse() : counted;
  const lineOf = (commitId: string): string => (flags.has('--parents') ? [commitId, ...commitNamed(session, commitId).parents].join(' ') : commitId);
  return finished(SUCCESS, ordered.map((commitId) => `${lineOf(commitId)}\n`).join(''));
}

function pathsChangedBy(session: FakeSession, commitId: string): string[] {
  const commit = commitNamed(session, commitId);
  const [firstParent] = commit.parents;
  return changedPathsBetween(firstParent === undefined ? {} : commitNamed(session, firstParent).tree, commit.tree);
}

const LOG_NAME_ONLY_FLAGS = ['--name-only', '--no-renames', '--format='];

function log(session: FakeSession, parameters: readonly string[]): GitRun {
  const asked = parameters.slice(0, -1).join(' ');
  const last  = parameters.at(-1) ?? '';
  if (asked === '-1 --format=%B') {
    const commitId = commitOfRevision(session, last);
    return commitId === null ? fatal(`bad object ${last}`) : finished(SUCCESS, `${commitNamed(session, commitId).message}\n`);
  }
  if (parameters[0] === '--patch' && parameters.slice(1, -1).every((parameter) => parameter === '--format=' || isDiffOption(parameter))) {
    const patched = selectedCommitsOf(session, [last]);
    if (patched === null) return fatal(`bad revision '${last}'`);
    const ownPatchOf = (commitId: string): string => {
      const { parents: [firstParent], tree } = commitNamed(session, commitId);
      return patchBetween(firstParent === undefined ? {} : commitNamed(session, firstParent).tree, tree);
    };
    return finished(SUCCESS, patched.filter((commitId) => commitNamed(session, commitId).parents.length < 2).map(ownPatchOf).join(''));
  }
  const revisions = parameters.slice(LOG_NAME_ONLY_FLAGS.length, -1);
  const flagsAsked = parameters.slice(0, LOG_NAME_ONLY_FLAGS.length).join(' ');
  if (flagsAsked !== LOG_NAME_ONLY_FLAGS.join(' ') || last !== '--') throw new Error(`the fake git has no log ${parameters.join(' ')}`);
  const commits = selectedCommitsOf(session, revisions);
  if (commits === null) return fatal(`bad revision '${revisions.join(' ')}'`);
  // Like real git without `--diff-merges`, a merge commit lists no paths.
  const listed = commits.filter((commitId) => commitNamed(session, commitId).parents.length < 2);
  return finished(SUCCESS, listed.flatMap((commitId) => pathsChangedBy(session, commitId)).map((path) => `${path}\n`).join(''));
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

const CONFLICT_MARKER_LINE = /^(?:<{7}|={7}|>{7})(?: |$)/;
/** Real git exits 2 from `diff --check` when a line it judges holds a conflict marker or trailing whitespace. */
const CHECK_FOUND_PROBLEMS = 2;

interface WhitespaceRule {
  trailingSpaceCounts:     boolean;
  carriageReturnIsLineEnd: boolean;
}

/** The two `core.whitespace` words the fake reads; any other word throws, so a rule it cannot judge fails the spec. */
function whitespaceRuleOf(settings: Readonly<Record<string, string>>): WhitespaceRule {
  const words = (ownValueOf(settings, 'core.whitespace') ?? '').split(',').map((word) => word.trim()).filter((word) => word !== '');
  const unread = words.find((word) => !['cr-at-eol', 'blank-at-eol', '-blank-at-eol'].includes(word));
  if (unread !== undefined) throw new Error(`the fake git reads no core.whitespace word ${unread}`);
  return { trailingSpaceCounts: words.lastIndexOf('-blank-at-eol') <= words.lastIndexOf('blank-at-eol'), carriageReturnIsLineEnd: words.includes('cr-at-eol') };
}

/** The lines of `after` that `before` lacks, which `--check` judges. */
function problemLinesBetween(before: string, after: string, rule: WhitespaceRule): string[] {
  const beforeLines = new Set(before.split('\n'));
  const judgedText = (line: string): string => (rule.carriageReturnIsLineEnd ? line.replace(/\r$/, '') : line);
  return after.split('\n').filter((line) => !beforeLines.has(line))
    .filter((line) => CONFLICT_MARKER_LINE.test(judgedText(line)) || (rule.trailingSpaceCounts && /[ \t\r]$/.test(judgedText(line))));
}

function whitespaceCheck(session: FakeSession, [fromRevision = '', toRevision = '', separator, ...paths]: readonly string[], settings: Readonly<Record<string, string>>): GitRun {
  if (separator !== '--') throw new Error('the fake git has no diff --check without paths');
  const fromTree = treeOfRevision(session, fromRevision);
  const toTree   = treeOfRevision(session, toRevision);
  if (fromTree === null || toTree === null) return fatal('bad revision');
  const rule = whitespaceRuleOf(settings);
  const problems = paths.flatMap((path) => problemLinesBetween(ownValueOf(fromTree, path) ?? '', ownValueOf(toTree, path) ?? '', rule).map((line) => `${path}: ${line}`));
  return problems.length === 0 ? finished(SUCCESS) : finished(CHECK_FOUND_PROBLEMS, `${problems.join('\n')}\n`);
}

function linesOfFile(text: string | undefined): string[] {
  return text === undefined || text === '' ? [] : text.replace(/\n$/, '').split('\n');
}

interface LineEdit {
  mark: ' ' | '-' | '+';
  line: string;
}

/** A shortest edit from `before` to `after`, by their longest common subsequence: the changed-line counts git's diff gives. */
function lineEditsBetween(before: readonly string[], after: readonly string[]): LineEdit[] {
  const common = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      const row = common[beforeIndex] ?? [];
      row[afterIndex] = before[beforeIndex] === after[afterIndex]
        ? (common[beforeIndex + 1]?.[afterIndex + 1] ?? 0) + 1
        : Math.max(common[beforeIndex + 1]?.[afterIndex] ?? 0, row[afterIndex + 1] ?? 0);
    }
  }
  const edits: LineEdit[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    const addingKeepsMore = (common[beforeIndex]?.[afterIndex + 1] ?? 0) >= (common[beforeIndex + 1]?.[afterIndex] ?? 0);
    if (beforeIndex < before.length && afterIndex < after.length && before[beforeIndex] === after[afterIndex]) {
      edits.push({ mark: ' ', line: before[beforeIndex] ?? '' });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (afterIndex < after.length && (beforeIndex === before.length || addingKeepsMore)) {
      edits.push({ mark: '+', line: after[afterIndex] ?? '' });
      afterIndex += 1;
    } else {
      edits.push({ mark: '-', line: before[beforeIndex] ?? '' });
      beforeIndex += 1;
    }
  }
  return edits;
}

function lineChangesBetween(before: readonly string[], after: readonly string[]): { removed: string[]; added: string[] } {
  const edits = lineEditsBetween(before, after);
  return { removed: edits.filter(({ mark }) => mark === '-').map(({ line }) => line), added: edits.filter(({ mark }) => mark === '+').map(({ line }) => line) };
}

function hunkRangeOf(lineCount: number): string {
  return lineCount === 0 ? '0,0' : `1,${lineCount}`;
}

/** One hunk per file holding the whole file as context: production reads it only to count and classify its changed lines, never to apply it. */
function patchBetween(fromTree: Readonly<FileTree>, toTree: Readonly<FileTree>): string {
  return changedPathsBetween(fromTree, toTree).map((path) => {
    const before = ownValueOf(fromTree, path);
    const after  = ownValueOf(toTree, path);
    const beforeLines = linesOfFile(before);
    const afterLines  = linesOfFile(after);
    const header = `diff --git a/${path} b/${path}\n--- ${before === undefined ? '/dev/null' : `a/${path}`}\n+++ ${after === undefined ? '/dev/null' : `b/${path}`}\n`;
    const hunk = `@@ -${hunkRangeOf(beforeLines.length)} +${hunkRangeOf(afterLines.length)} @@\n`;
    return `${header}${hunk}${lineEditsBetween(beforeLines, afterLines).map(({ mark, line }) => `${mark}${line}\n`).join('')}`;
  }).join('');
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** `diff --shortstat <a>...<b>`: the change from the merge base of the two up to `b`, worded as git words it. */
function shortStat(session: FakeSession, range: string): GitRun {
  const [fromRevision = '', toRevision = ''] = range.split('...');
  const fromCommit = commitOfRevision(session, fromRevision);
  const toCommit   = commitOfRevision(session, toRevision);
  if (fromCommit === null || toCommit === null) return fatal(`ambiguous argument '${range}'`);
  const baseCommit = bestCommonAncestorOf(session, fromCommit, toCommit);
  const baseTree   = baseCommit === null ? {} : commitNamed(session, baseCommit).tree;
  const toTree     = commitNamed(session, toCommit).tree;
  const paths      = changedPathsBetween(baseTree, toTree);
  if (paths.length === 0) return finished(SUCCESS);
  const changes = paths.map((path) => lineChangesBetween(linesOfFile(ownValueOf(baseTree, path)), linesOfFile(ownValueOf(toTree, path))));
  const insertions = changes.reduce((total, { added }) => total + added.length, 0);
  const deletions  = changes.reduce((total, { removed }) => total + removed.length, 0);
  const parts = [
    plural(paths.length, 'file changed', 'files changed'),
    ...(insertions > 0 ? [plural(insertions, 'insertion(+)', 'insertions(+)')] : []),
    ...(deletions > 0 ? [plural(deletions, 'deletion(-)', 'deletions(-)')] : []),
  ];
  return finished(SUCCESS, ` ${parts.join(', ')}\n`);
}

/** The option list `src/lib/git/BranchDiffs.ts` spells out before two revisions; none of them changes which lines the fake reports. */
function isDiffOption(parameter: string): boolean {
  return parameter.startsWith('--') && parameter !== '--' && !['--name-only', '--check', '--no-renames', '--diff-filter=U'].includes(parameter);
}

/** `diff --no-index -- /dev/null <path>`: the file as a new-file patch, exit 1 since the sides differ; a file it cannot read is fatal. */
function newFilePatch(session: FakeSession, parameters: readonly string[]): GitRun {
  const [separator, emptySide, path = ''] = parameters.filter((parameter) => parameter !== '--no-index' && parameter !== '--binary');
  if (separator !== '--' || emptySide !== '/dev/null' || parameters.length !== 5) throw new Error(`the fake git has no diff ${parameters.join(' ')}`);
  let text = '';
  try {
    text = readFileSync(join(session.directory, path), 'utf8');
  } catch {
    return fatal(`cannot hash ${path}`);
  }
  const header = `diff --git a/${path} b/${path}\nnew file mode 100644\n`;
  if (text === '') return finished(DIFFERENCES_FOUND, header);
  const endsWithNewline = text.endsWith('\n');
  const lines = (endsWithNewline ? text.slice(0, -1) : text).split('\n');
  const addedLines = `${lines.map((line) => `+${line}\n`).join('')}${endsWithNewline ? '' : '\\ No newline at end of file\n'}`;
  return finished(DIFFERENCES_FOUND, `${header}--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${addedLines}`);
}

function diff(session: FakeSession, parameters: readonly string[], settings: Readonly<Record<string, string>>): GitRun {
  const asked = parameters.join(' ');
  if (asked === '--no-ext-diff HEAD --' || asked === '--binary HEAD') return finished(SUCCESS, patchAgainstHead(session));
  if (parameters.includes('--no-index')) return newFilePatch(session, parameters);
  if (asked === '--name-only --diff-filter=U -z') return finished(SUCCESS, (session.checkout.unmerged ?? []).map((path) => `${path}\0`).join(''));
  if (parameters[0] === '--check') return whitespaceCheck(session, parameters.slice(1), settings);
  if (parameters[0] === '--shortstat') {
    const ranges = parameters.filter((parameter) => !isDiffOption(parameter) && parameter !== '--shortstat');
    const [range = ''] = ranges;
    if (ranges.length !== 1 || !range.includes('...')) throw new Error(`the fake git has no diff ${asked}`);
    return shortStat(session, range);
  }
  if (parameters.includes('--no-color')) {
    const revisions = parameters.filter((parameter) => !isDiffOption(parameter));
    const [fromRevision = '', toRevision = ''] = revisions;
    const fromTree = treeOfRevision(session, fromRevision);
    const toTree   = treeOfRevision(session, toRevision);
    if (revisions.length !== 2 || fromTree === null || toTree === null) return fatal(`the fake git cannot diff ${asked}`);
    return finished(SUCCESS, patchBetween(fromTree, toTree));
  }
  const pathTerminator = parameters.includes('-z') ? '\0' : '\n';
  const [nameOnlyFlag, renamesFlag, fromRevision = '', toRevision = ''] = parameters.filter((parameter) => parameter !== '-z');
  if (nameOnlyFlag !== '--name-only' || renamesFlag !== '--no-renames' || parameters.at(-1) !== '--') throw new Error(`the fake git has no diff ${asked}`);
  const fromTree = treeOfRevision(session, fromRevision);
  const toTree   = treeOfRevision(session, toRevision);
  if (fromTree === null || toTree === null) return fatal('bad revision');
  return finished(SUCCESS, changedPathsBetween(fromTree, toTree).map((path) => `${path}${pathTerminator}`).join(''));
}

function status(session: FakeSession, parameters: readonly string[]): GitRun {
  const lineTerminator = parameters.includes('-z') ? '\0' : '\n';
  const [formatFlag, untrackedFlag, renamesFlag] = parameters.filter((parameter) => parameter !== '-z');
  const untrackedFlags = ['--untracked-files=all', '--untracked-files=no'];
  if (!['--porcelain', '--porcelain=v1'].includes(formatFlag ?? '') || !untrackedFlags.includes(untrackedFlag ?? '') || ![undefined, '--no-renames'].includes(renamesFlag)) {
    throw new Error(`the fake git has no status ${parameters.join(' ')}`);
  }
  const lines = statusLinesOf(session).filter((line) => untrackedFlag === '--untracked-files=all' || !line.startsWith('?? '));
  return finished(SUCCESS, lines.map((line) => `${line}${lineTerminator}`).join(''));
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

/**
 * A fake repository sets no key itself, such as `commit.gpgsign`: only a setting from the command line, the environment, or a spec's own
 * `git config <key> <value>` is answered.
 */
function config(session: FakeSession, parameters: readonly string[], hookPolicy: GitHookPolicy, settings: Readonly<Record<string, string>>): GitRun {
  const [typeFlag, key = '', ...rest] = parameters;
  if (typeFlag !== undefined && !typeFlag.startsWith('-') && rest.length === 0 && key !== '') {
    session.state.settings = { ...session.state.settings, [typeFlag]: key };
    saved(session);
    return finished(SUCCESS);
  }
  if (typeFlag === '--bool' && rest.length === 0) {
    const value = ownValueOf(settings, key);
    return value === undefined ? finished(NEGATIVE_ANSWER) : finished(SUCCESS, `${['true', 'yes', 'on', '1'].includes(value.toLowerCase()) ? 'true' : 'false'}\n`);
  }
  if (typeFlag === '--get' && key !== 'core.hooksPath' && rest.length === 0) {
    const value = ownValueOf(settings, key);
    return value === undefined ? finished(NEGATIVE_ANSWER) : finished(SUCCESS, `${value}\n`);
  }
  if (parameters.join(' ') !== '--get core.hooksPath') throw new Error(`the fake git has no config ${parameters.join(' ')}`);
  if (hookPolicy === 'hooks-off') return finished(SUCCESS, `${join(Bun.which('git') ?? 'git', HOOKS_OFF_FOLDER_NAME)}\n`);
  const configuredHooksPath = ownValueOf(settings, 'core.hooksPath');
  return configuredHooksPath === undefined ? finished(NEGATIVE_ANSWER) : finished(SUCCESS, `${configuredHooksPath}\n`);
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
    else if (parameter !== '--quiet' && parameter !== '-q') positional.push(parameter);
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
  if (start === '' && newBranch === null && !detached) throw new Error(`the fake git has no worktree add ${parameters.join(' ')}`);
  const commitId = commitOfRevision(session, start === '' ? 'HEAD' : start);
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
  const forced = parameters.length === 2 && parameters[0] === '--force';
  if (!forced && parameters.length !== 1) throw new Error(`the fake git has no worktree remove ${parameters.join(' ')}`);
  const entry = existsSync(path) ? Object.entries(session.state.linked).find(([, checkout]) => checkout.path === realpathSync(path)) : undefined;
  if (entry === undefined) return fatal(`'${path}' is not a working tree`);
  const [name, checkout] = entry;
  const linkedSession = discoveredSession(checkout.path);
  if (!forced && linkedSession !== null && statusLinesOf(linkedSession).length > 0) {
    return fatal(`'${path}' contains modified or untracked files, use --force to delete it`);
  }
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
  const named = parameters.filter((parameter) => parameter !== '--');
  // A folder adds every file below it that is not ignored, as real git does.
  const paths = named.flatMap((path) => (statSync(join(checkout.path, path), { throwIfNoEntry: false })?.isDirectory() === true
    ? untrackedPathsIn(checkout.path, {}, path.replace(/\/$/, '')) : [path]));
  for (const path of paths) {
    if (isIgnored(rules, path, false)) return finished(NEGATIVE_ANSWER, '', `The following paths are ignored: ${path}`);
    const text = cleanedWorkingFileOf(checkout.path, path);
    if (text === null) delete checkout.index[path];
    else checkout.index[path] = text;
    if (checkout.unmerged !== undefined) checkout.unmerged = checkout.unmerged.filter((unmergedPath) => unmergedPath !== path);
  }
  saved(session);
  return finished(SUCCESS);
}

function moveHeadTo(session: FakeSession, commitId: string): void {
  if (session.checkout.branch === null) session.checkout.detachedCommit = commitId;
  else session.state.branches[session.checkout.branch] = commitId;
}

function clearMergeState(checkout: FakeCheckout): void {
  delete checkout.mergeHead;
  delete checkout.unmerged;
}

/** While a merge waits, the commit concludes it: two parents, and `--no-edit` takes git's own message. */
function commit(session: FakeSession, parameters: readonly string[]): GitRun {
  const { checkout } = session;
  const messageIndex = parameters.indexOf('-m') + 1;
  const { mergeHead } = checkout;
  if (messageIndex === 0 && (mergeHead === undefined || !parameters.includes('--no-edit'))) throw new Error(`the fake git has no commit ${parameters.join(' ')}`);
  if ((checkout.unmerged ?? []).length > 0) return fatal('Committing is not possible because you have unmerged files.');
  const head = headCommitOf(session);
  if (mergeHead === undefined && changedPathsBetween(commitNamed(session, head).tree, checkout.index).length === 0 && !parameters.includes('--allow-empty')) {
    return finished(NEGATIVE_ANSWER, 'nothing to commit, working tree clean\n');
  }
  const message = messageIndex === 0 ? `Merge commit '${mergeHead ?? ''}'` : (parameters[messageIndex] ?? '').trimEnd();
  const created = { parents: mergeHead === undefined ? [head] : [head, mergeHead], tree: { ...checkout.index }, message: `${message}\n` };
  const commitId = hashOf(created);
  session.state.commits[commitId] = created;
  moveHeadTo(session, commitId);
  clearMergeState(checkout);
  saved(session);
  return finished(SUCCESS);
}

/** The checkout's index and tracked files become `tree`; a tracked file `tree` lacks is removed, an untracked one is left. */
function checkOutTree(session: FakeSession, tree: Readonly<FileTree>): void {
  const { checkout } = session;
  const tracked = { ...commitNamed(session, headCommitOf(session)).tree, ...checkout.index };
  for (const path of Object.keys(tracked)) if (!Object.hasOwn(tree, path)) rmSync(join(checkout.path, path), { force: true });
  writeTree(checkout.path, tree);
  checkout.index = { ...tree };
}

function hardReset(session: FakeSession, parameters: readonly string[]): GitRun {
  const revision = parameters.at(-1) ?? '';
  if (parameters.filter((parameter) => parameter !== '-q')[0] !== '--hard') throw new Error(`the fake git has no reset ${parameters.join(' ')}`);
  const target = commitOfRevision(session, revision);
  if (target === null) return fatal(`ambiguous argument '${revision}'`);
  checkOutTree(session, commitNamed(session, target).tree);
  moveHeadTo(session, target);
  clearMergeState(session.checkout);
  saved(session);
  return finished(SUCCESS);
}

function branchIsCheckedOut(session: FakeSession, branch: string): boolean {
  return checkoutsOf(session).some((checkout) => checkout.branch === branch);
}

/** `branch` null detaches at `commitId`; local changes are not carried over, since no spec switches with any. */
function switchTo(session: FakeSession, branch: string | null, commitId: string): GitRun {
  const { checkout } = session;
  if (branch !== null && branch !== checkout.branch && branchIsCheckedOut(session, branch)) return fatal(`'${branch}' is already used by worktree`);
  const leaving = checkout.branch ?? headCommitOf(session);
  checkOutTree(session, commitNamed(session, commitId).tree);
  if (branch !== null) session.state.branches[branch] = commitId;
  Object.assign(checkout, { branch, detachedCommit: branch === null ? commitId : null, previous: leaving });
  clearMergeState(checkout);
  saved(session);
  return finished(SUCCESS);
}

function checkoutOf(session: FakeSession, parameters: readonly string[]): GitRun {
  const [first = '', second = '', third = 'HEAD'] = parameters.filter((parameter) => parameter !== '-q' && parameter !== '--quiet');
  if (first === '-b' || first === '-B') {
    if (first === '-b' && Object.hasOwn(session.state.branches, second)) return fatal(`a branch named '${second}' already exists`);
    const start = commitOfRevision(session, third);
    return start === null ? fatal(`'${third}' is not a commit`) : switchTo(session, second, start);
  }
  if (first === '--detach') {
    const commitId = commitOfRevision(session, second === '' ? 'HEAD' : second);
    return commitId === null ? fatal(`invalid reference: ${second}`) : switchTo(session, null, commitId);
  }
  const target = first === '-' ? session.checkout.previous : first;
  if (target === undefined) return fatal('invalid reference: @{-1}');
  const branchTip = ownValueOf(session.state.branches, target);
  if (branchTip !== undefined) return switchTo(session, target, branchTip);
  if (first === '-' && Object.hasOwn(session.state.commits, target)) return switchTo(session, null, target);
  throw new Error(`the fake git has no checkout ${parameters.join(' ')}`);
}

function branchOf(session: FakeSession, parameters: readonly string[]): GitRun {
  const [flag = '', ...rest] = parameters;
  if (flag === '-D') {
    const missing = rest.find((branch) => !Object.hasOwn(session.state.branches, branch));
    if (missing !== undefined) return finished(NEGATIVE_ANSWER, '', `error: branch '${missing}' not found`);
    const checkedOut = rest.find((branch) => branchIsCheckedOut(session, branch));
    if (checkedOut !== undefined) return finished(NEGATIVE_ANSWER, '', `error: cannot delete branch '${checkedOut}' used by worktree`);
    for (const branch of rest) delete session.state.branches[branch];
    saved(session);
    return finished(SUCCESS);
  }
  if (flag === '-d') return deletedMergedBranch(session, rest);
  const forced = flag === '-f';
  const [branch = '', revision = 'HEAD'] = forced ? rest : parameters;
  if (branch === '' || branch.startsWith('-')) throw new Error(`the fake git has no branch ${parameters.join(' ')}`);
  if (!forced && Object.hasOwn(session.state.branches, branch)) return fatal(`a branch named '${branch}' already exists`);
  if (forced && branchIsCheckedOut(session, branch)) return fatal(`cannot force update the branch '${branch}' used by worktree`);
  const commitId = commitOfRevision(session, revision);
  if (commitId === null) return fatal(`not a valid object name: '${revision}'`);
  session.state.branches[branch] = commitId;
  saved(session);
  return finished(SUCCESS);
}

/** `branch -d` deletes only a branch the checkout's HEAD already holds, as real git does without an upstream. */
function deletedMergedBranch(session: FakeSession, [branch = '', ...more]: readonly string[]): GitRun {
  if (branch === '' || more.length > 0) throw new Error(`the fake git has no branch -d ${[branch, ...more].join(' ')}`);
  const branchTip = ownValueOf(session.state.branches, branch);
  if (branchTip === undefined) return finished(NEGATIVE_ANSWER, '', `error: branch '${branch}' not found`);
  if (branchIsCheckedOut(session, branch)) return finished(NEGATIVE_ANSWER, '', `error: cannot delete branch '${branch}' used by worktree`);
  if (!reachableCommitsOf(session, headCommitOf(session)).includes(branchTip)) {
    return finished(NEGATIVE_ANSWER, '', `error: the branch '${branch}' is not fully merged`);
  }
  delete session.state.branches[branch];
  saved(session);
  return finished(SUCCESS);
}

function removeTracked(session: FakeSession, parameters: readonly string[]): GitRun {
  const paths = parameters.filter((parameter) => parameter !== '-q' && parameter !== '--');
  const untracked = paths.find((path) => !Object.hasOwn(session.checkout.index, path));
  if (untracked !== undefined) return fatal(`pathspec '${untracked}' did not match any files`);
  for (const path of paths) {
    delete session.checkout.index[path];
    rmSync(join(session.checkout.path, path), { force: true });
  }
  saved(session);
  return finished(SUCCESS);
}

function conflictTextOf(ours: string | undefined, theirs: string | undefined, theirName: string): string {
  return `<<<<<<< HEAD\n${ours ?? ''}=======\n${theirs ?? ''}>>>>>>> ${theirName}\n`;
}

/** Ours with git's conflict markers in each conflicted file, as `merge` writes the working file and `merge-tree` its tree. */
function treeWithConflictsOf(session: FakeSession, ourCommit: string, theirCommit: string, theirName: string): { tree: FileTree; conflicted: string[] } {
  const base = bestCommonAncestorOf(session, ourCommit, theirCommit);
  const ourTree   = commitNamed(session, ourCommit).tree;
  const theirTree = commitNamed(session, theirCommit).tree;
  const { tree, conflicted } = mergedTreeOf(base === null ? {} : commitNamed(session, base).tree, ourTree, theirTree);
  for (const path of conflicted) tree[path] = conflictTextOf(ownValueOf(ourTree, path), ownValueOf(theirTree, path), theirName);
  return { tree, conflicted };
}

/** Always a merge commit; a conflict leaves the markers in the working files, MERGE_HEAD set and the paths unmerged. */
function noFastForwardMerge(session: FakeSession, parameters: readonly string[]): GitRun {
  const revision = parameters.at(-1) ?? '';
  const target = commitOfRevision(session, revision);
  if (target === null) return fatal(`${revision} - not something we can merge`);
  const head = headCommitOf(session);
  if (reachableCommitsOf(session, head).includes(target)) return finished(SUCCESS, 'Already up to date.\n');
  const { tree, conflicted } = treeWithConflictsOf(session, head, target, revision);
  checkOutTree(session, tree);
  if (conflicted.length > 0 || parameters.includes('--no-commit')) {
    for (const path of conflicted) delete session.checkout.index[path];
    Object.assign(session.checkout, { mergeHead: target, unmerged: conflicted });
    saved(session);
    if (conflicted.length === 0) return finished(SUCCESS, 'Automatic merge went well; stopped before committing as requested\n');
    return finished(NEGATIVE_ANSWER, conflicted.map((path) => `CONFLICT (content): Merge conflict in ${path}\n`).join(''));
  }
  const created = { parents: [head, target], tree: { ...tree }, message: `Merge commit '${revision}'\n` };
  const commitId = hashOf(created);
  session.state.commits[commitId] = created;
  moveHeadTo(session, commitId);
  saved(session);
  return finished(SUCCESS);
}

function abortMerge(session: FakeSession): GitRun {
  if (session.checkout.mergeHead === undefined) return fatal('There is no merge to abort (MERGE_HEAD missing).');
  checkOutTree(session, commitNamed(session, headCommitOf(session)).tree);
  clearMergeState(session.checkout);
  saved(session);
  return finished(SUCCESS);
}

/** One line per unmerged path and side; production reads only whether any line is there. */
function lsFiles(session: FakeSession, parameters: readonly string[]): GitRun {
  if (parameters.join(' ') === '--others --exclude-standard -z') {
    return finished(SUCCESS, untrackedPathsIn(session.checkout.path, session.checkout.index).sort().map((path) => `${path}\0`).join(''));
  }
  if (parameters.join(' ') !== '-u') throw new Error(`the fake git has no ls-files ${parameters.join(' ')}`);
  const head = headCommitOf(session);
  const { mergeHead } = session.checkout;
  const base = mergeHead === undefined ? null : bestCommonAncestorOf(session, head, mergeHead);
  const stageTrees: [string, FileTree][] = [
    ['1', base === null ? {} : commitNamed(session, base).tree],
    ['2', commitNamed(session, head).tree],
    ['3', mergeHead === undefined ? {} : commitNamed(session, mergeHead).tree],
  ];
  const lines = (session.checkout.unmerged ?? []).flatMap((path) => stageTrees.flatMap(([stage, tree]) => {
    const text = ownValueOf(tree, path);
    return text === undefined ? [] : [`100644 ${blobNameOf(text)} ${stage}\t${path}\n`];
  }));
  return finished(SUCCESS, lines.join(''));
}

/** A blob is named by its text, so `ls-tree` and `hash-object` agree on a file, as real git's object names do. */
function blobNameOf(text: string): string {
  return hashOf(['blob', text]);
}

function lsTree(session: FakeSession, parameters: readonly string[]): GitRun {
  const revision = parameters.at(-1) ?? '';
  if (parameters.slice(0, -1).join(' ') !== '-r -z --full-tree') throw new Error(`the fake git has no ls-tree ${parameters.join(' ')}`);
  const tree = treeOfRevision(session, revision);
  if (tree === null) return fatal(`Not a valid object name ${revision}`);
  return finished(SUCCESS, Object.keys(tree).sort().map((path) => `100644 blob ${blobNameOf(tree[path] ?? '')}\t${path}\0`).join(''));
}

function hashObjects(session: FakeSession, parameters: readonly string[], standardInput = ''): GitRun {
  if (parameters.join(' ') !== '--stdin-paths') throw new Error(`the fake git has no hash-object ${parameters.join(' ')}`);
  const paths = standardInput.split('\n').filter((path) => path !== '');
  const unreadable = paths.find((path) => cleanedWorkingFileOf(session.checkout.path, path) === null);
  if (unreadable !== undefined) return fatal(`could not open '${unreadable}' for reading: No such file or directory`);
  return finished(SUCCESS, paths.map((path) => `${blobNameOf(cleanedWorkingFileOf(session.checkout.path, path) ?? '')}\n`).join(''));
}

function mergeOf(session: FakeSession, parameters: readonly string[]): GitRun {
  if (parameters.join(' ') === '--abort') return abortMerge(session);
  if (parameters.includes('--no-ff')) return noFastForwardMerge(session, parameters);
  return fastForwardMerge(session, parameters);
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
  const overwritten = changedPathsBetween(headTree, targetTree)
    .filter((path) => cleanedWorkingFileOf(session.checkout.path, path) !== (ownValueOf(session.checkout.index, path) ?? null));
  if (overwritten.length > 0) return finished(NEGATIVE_ANSWER, '', `error: Your local changes to the following files would be overwritten by merge:\n${overwritten.join('\n')}\n`);
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

const MERGE_TREE_FLAG_SETS = new Set([
  '--end-of-options --name-only --no-messages --write-tree -z',
  '--name-only --no-messages --write-tree',
  '--no-messages --write-tree',
]);

/** Each `--stdin` line is one pair; each record is its status (1 clean, 0 conflicting), its tree and its files, closed by an empty field. */
function mergeTreeBatch(session: FakeSession, parameters: readonly string[], standardInput: string): GitRun {
  if ([...parameters].sort().join(' ') !== '--name-only --no-messages --stdin -z') throw new Error(`the fake git has no merge-tree ${parameters.join(' ')}`);
  let printed = '';
  for (const line of standardInput.split('\n').filter((each) => each !== '')) {
    const [ourRevision = '', theirRevision = ''] = line.split(' ');
    const single = mergeTree(session, ['--write-tree', '--name-only', '--no-messages', '-z', END_OF_OPTIONS, ourRevision, theirRevision]);
    if (single.exitCode !== SUCCESS && single.exitCode !== NEGATIVE_ANSWER) return finished(NEGATIVE_ANSWER, printed, single.standardError);
    printed += `${single.exitCode === SUCCESS ? '1' : '0'}\0${single.standardOutput}\0`;
  }
  return finished(SUCCESS, printed);
}

/** The written tree is kept, so a later diff can name it; without `-z` the conflicted paths follow on lines, and only with `--name-only`. */
function mergeTree(session: FakeSession, parameters: readonly string[], standardInput = ''): GitRun {
  if (parameters.includes('--stdin')) return mergeTreeBatch(session, parameters, standardInput);
  const [ourRevision = '', theirRevision = ''] = parameters.slice(-2);
  const flags = parameters.slice(0, -2);
  if (!MERGE_TREE_FLAG_SETS.has([...flags].sort().join(' '))) throw new Error(`the fake git has no merge-tree ${parameters.join(' ')}`);
  const ourCommit   = commitOfRevision(session, ourRevision);
  const theirCommit = commitOfRevision(session, theirRevision);
  if (ourCommit === null || theirCommit === null) return fatal('not something we can merge');
  const { tree, conflicted } = treeWithConflictsOf(session, ourCommit, theirCommit, theirRevision);
  const treeId = conflicted.length === 0 ? treeHashOf(tree) : hashOf([tree, conflicted]);
  mkdirSync(join(session.gitFolder, WRITTEN_TREES_FOLDER_NAME), { recursive: true });
  writeFileAtomically(join(session.gitFolder, WRITTEN_TREES_FOLDER_NAME, `${treeId}.json`), JSON.stringify(tree));
  const exitCode = conflicted.length === 0 ? SUCCESS : NEGATIVE_ANSWER;
  if (flags.includes('-z')) return finished(exitCode, `${[treeId, ...conflicted].join('\0')}\0`);
  const listed = flags.includes('--name-only') ? conflicted : [];
  return finished(exitCode, [treeId, ...listed].map((line) => `${line}\n`).join(''));
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
  const asked = parameters.join(' ');
  if (asked !== '--quiet --short HEAD' && asked !== '--quiet HEAD') throw new Error(`the fake git has no symbolic-ref ${asked}`);
  if (session.checkout.branch === null) return finished(NEGATIVE_ANSWER);
  return finished(SUCCESS, `${asked === '--quiet HEAD' ? BRANCH_REFERENCE_PREFIX : ''}${session.checkout.branch}\n`);
}

function withoutConfigurationOverrides(gitArguments: readonly string[]): readonly string[] {
  return gitArguments[0] === '-c' ? withoutConfigurationOverrides(gitArguments.slice(2)) : gitArguments;
}

/** The `-c key=value` pairs before the verb, as git reads them. */
function configurationOverridesOf(gitArguments: readonly string[]): Record<string, string> {
  const settings: Record<string, string> = {};
  for (let i = 0; gitArguments[i] === '-c'; i += 2) {
    const pair = gitArguments[i + 1] ?? '';
    const separatorIndex = pair.indexOf('=');
    settings[separatorIndex < 0 ? pair : pair.slice(0, separatorIndex)] = separatorIndex < 0 ? 'true' : pair.slice(separatorIndex + 1);
  }
  return settings;
}

interface FakeCall {
  hookPolicy:     GitHookPolicy;
  settings:       Readonly<Record<string, string>>;
  standardInput?: string;
}

function answerOf(session: FakeSession, verb: string, parameters: readonly string[], { hookPolicy, settings, standardInput }: FakeCall): GitRun {
  switch (verb) {
    case 'add':          return add(session, parameters);
    case 'branch':       return branchOf(session, parameters);
    case 'checkout':     return checkoutOf(session, parameters);
    case 'check-ignore': return checkIgnore(session, parameters);
    case 'commit':       return commit(session, parameters);
    case 'config':       return config(session, parameters, hookPolicy, settings);
    case 'diff':         return diff(session, parameters, settings);
    case 'for-each-ref': return forEachRef(session, parameters);
    case 'hash-object':  return hashObjects(session, parameters, standardInput);
    case 'log':          return log(session, parameters);
    case 'ls-files':     return lsFiles(session, parameters);
    case 'ls-tree':      return lsTree(session, parameters);
    case 'rm':           return removeTracked(session, parameters);
    case 'merge':        return mergeOf(session, parameters);
    case 'reset':        return hardReset(session, parameters);
    case 'merge-base':   return mergeBase(session, parameters);
    case 'merge-tree':   return mergeTree(session, parameters, standardInput);
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

function answerInDirectory(
  directory: string, gitArguments: readonly string[], ceilingDirectory: string | undefined, call: FakeCall
): GitRun {
  // Real git answers its version anywhere, inside a repository or not.
  if (withoutConfigurationOverrides(gitArguments).join(' ') === 'version') return finished(SUCCESS, `${FAKE_GIT_VERSION_LINE}\n`);
  const session = discoveredSession(directory, ceilingDirectory);
  if (session === null) return fatal('not a git repository (or any of the parent directories): .git');
  const [verb = '', ...parameters] = withoutConfigurationOverrides(gitArguments);
  return answerOf(session, verb, parameters, { ...call, settings: { ...session.state.settings, ...call.settings, ...configurationOverridesOf(gitArguments) } });
}

export function fakeGitRun(
  directory: string, gitArguments: readonly string[], hookPolicy: GitHookPolicy = 'hooks-off', standardInput?: string, ceilingDirectory?: string
): GitRun {
  const settings = Object.fromEntries(PORTABLE_GIT_SETTINGS);
  return answerInDirectory(directory, gitArguments, ceilingDirectory, standardInput === undefined ? { hookPolicy, settings } : { hookPolicy, settings, standardInput });
}

/** The `GIT_CONFIG_COUNT` settings of a process environment, as git reads them. */
function environmentSettingsOf(environment: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const settings: Record<string, string> = {};
  for (let i = 0; i < Number(environment['GIT_CONFIG_COUNT'] ?? '0'); i += 1) {
    const key = environment[`GIT_CONFIG_KEY_${i}`];
    if (key !== undefined) settings[key] = environment[`GIT_CONFIG_VALUE_${i}`] ?? '';
  }
  return settings;
}

/**
 * The answer of the `git` program `src/testing/FakeGitProgram.ts` puts on a child's `PATH`: the same fake over the same repository files, in
 * the child's working directory, with its environment's settings and ceiling.
 */
export function fakeGitProgramRun(directory: string, gitArguments: readonly string[], environment: Readonly<Record<string, string | undefined>>): GitRun {
  const ceilingDirectory = environment['GIT_CEILING_DIRECTORIES'];
  const call: FakeCall = { hookPolicy: 'hooks-off', settings: environmentSettingsOf(environment) };
  return answerInDirectory(directory, gitArguments, ceilingDirectory === '' ? undefined : ceilingDirectory, call);
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

/**
 * Called by the preload a spawned binary gets: its git is this fake, over the same repository files the spec's own fake reads, so a flow
 * whose answers change as it goes, such as a build job adding its worktree, needs no answer set per stage.
 */
export function useFakeGitInThisProcess(): void {
  Object.assign(GitProcess, { run: fakeGitRun, resolvedCommitOf: fakeResolvedCommitOf });
  Object.assign(GpgDirectories, { read: () => null });
}

export interface FakeGit {
  createRepository:   (prefix: string) => string;
  commitOf:           (directory: string, revision?: string) => string;
  checkedOutBranchOf: (directory: string) => string;
  commitInSession:    (workingDirectory: string, stagedPath: string, text: string, commitMessage: string) => void;
  /** A git step of the spec's own on the fake, such as a worktree it adds; throws unless the step succeeds. */
  outputOf:           (directory: string, gitArguments: readonly string[]) => string;
  /** Writes the file, commits it alone as `Change <fileName>`, and answers the new commit, as the scratch workspace's `commitFile` does on real git. */
  commitFile:         (directory: string, fileName: string, content: string) => string;
  /** A linked worktree on the new branch `worktree/<name>`, beside the repository, as the scratch workspace's `addWorktree` adds on real git. */
  addWorktree:        (repositoryDirectory: string, name: string) => string;
}

function outputOf(directory: string, gitArguments: readonly string[]): string {
  const answer = fakeGitRun(directory, gitArguments);
  if (answer.exitCode !== SUCCESS) throw new Error(`the fake git refused git ${gitArguments.join(' ')}: ${answer.standardError}`);
  return answer.standardOutput.trim();
}

/** A session's commit as its tool call would make it; a file already committed is left alone, so a resumed session plays the same step. */
function commitInSession(workingDirectory: string, stagedPath: string, text: string, commitMessage: string): void {
  mkdirSync(dirname(join(workingDirectory, stagedPath)), { recursive: true });
  writeFileSync(join(workingDirectory, stagedPath), text);
  fakeGitRun(workingDirectory, ['add', stagedPath]);
  fakeGitRun(workingDirectory, ['commit', '-q', '-m', commitMessage]);
}

/**
 * Call at a spec file's top level: every case of the file runs on the fake, and the file's end restores `GitProcess` for the next file.
 * The gpgconf a signed commit is set up by answers as missing, so no gpg process starts either.
 */
export function useFakeGit(): FakeGit {
  beforeAll(() => {
    spyOn(GitProcess, 'run').mockImplementation(fakeGitRun);
    spyOn(GitProcess, 'resolvedCommitOf').mockImplementation(fakeResolvedCommitOf);
    spyOn(GpgDirectories, 'read').mockImplementation(() => null);
  });
  afterAll(() => {
    spyOn(GitProcess, 'run').mockRestore();
    spyOn(GitProcess, 'resolvedCommitOf').mockRestore();
    spyOn(GpgDirectories, 'read').mockRestore();
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
    outputOf,
    commitFile:         (directory, fileName, content) => {
      writeFileSync(join(directory, fileName), content);
      outputOf(directory, ['add', '--', fileName]);
      outputOf(directory, ['commit', '-q', '-m', `Change ${fileName}`]);
      return outputOf(directory, ['rev-parse', 'HEAD']);
    },
    addWorktree: (repositoryDirectory, name) => {
      const worktreeDirectory = join(`${repositoryDirectory}-worktrees`, name);
      outputOf(repositoryDirectory, ['worktree', 'add', '-q', '-b', `worktree/${name}`, worktreeDirectory]);
      return worktreeDirectory;
    },
  };
}
