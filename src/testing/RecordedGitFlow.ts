/**
 * The stages of a ticket's flow through git, each one answer set: the calls the Overseer makes while the repository stands in that stage,
 * with the place each is asked in. `src/lib/git/RecordedGitAnswers.integration.spec.ts` walks a real repository through the stages and
 * records every answer; `src/testing/RecordedGit.ts` answers a default spec's calls from the stage it is in, in any order and as often as asked.
 * A recorded answer holds placeholders for the repository folder and the commit and tree ids, which a replay fills with fixed example ids.
 */
import { join } from 'node:path';

import { PRODUCT_NAMES }                     from '../shared/constants/ProductNames.ts';
import { SCRATCH_COMMIT_IDENTITY_ARGUMENTS } from './ScratchWorkspace.ts';

export const RECORDED_FLOW_MAIN_LINE = 'master';
export const RECORDED_FLOW_TICKET_BRANCH = 'ticket-001';
/** The `.gitignore` of the recorded repository, as `init` writes it: the data folder and the worktrees folder ignored. */
export const RECORDED_FLOW_IGNORE_FILE_TEXT = `${PRODUCT_NAMES.DATA_FOLDER}/\n${PRODUCT_NAMES.WORKTREES_FOLDER}/\n`;

export const RECORDED_FLOW_PLACEHOLDERS = {
  REPOSITORY:      '<repository>',
  MAIN_TIP:        '<main tip>',
  MAIN_TREE:       '<main tree>',
  TICKET_TIP:      '<ticket tip>',
  TICKET_TREE:     '<ticket tree>',
  /** The main line's tip once it moved past the ticket branch's fork point, and its tree. */
  MOVED_MAIN_TIP:  '<moved main tip>',
  MOVED_MAIN_TREE: '<moved main tree>',
  /** The commit that merges the moved main line into the ticket branch, and its tree. */
  MERGED_TIP:      '<merged tip>',
  MERGED_TREE:     '<merged tree>',
} as const;

type FlowPlaceholder = typeof RECORDED_FLOW_PLACEHOLDERS[keyof typeof RECORDED_FLOW_PLACEHOLDERS];
type ObjectPlaceholder = Exclude<FlowPlaceholder, typeof RECORDED_FLOW_PLACEHOLDERS.REPOSITORY>;

/** The ids a replay gives each recorded commit and tree; any 40 hexadecimal digits read as an object id. */
export const REPLAYED_OBJECT_IDS: Readonly<Record<ObjectPlaceholder, string>> = {
  [RECORDED_FLOW_PLACEHOLDERS.MAIN_TIP]:        '1'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MAIN_TREE]:       '2'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.TICKET_TIP]:      '3'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.TICKET_TREE]:     '4'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MOVED_MAIN_TIP]:  '5'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MOVED_MAIN_TREE]: '6'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MERGED_TIP]:      '7'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MERGED_TREE]:     '8'.repeat(40),
};

export const RECORDED_FLOW_PLACES = {
  MAIN_CHECKOUT:           'main checkout',
  SESSION_FOLDER:          'session folder',
  TICKET_WORKTREE:         'ticket worktree',
  PIPELINE_AGENT_WORKTREE: 'pipeline agent worktree',
} as const;

export type RecordedFlowPlace = typeof RECORDED_FLOW_PLACES[keyof typeof RECORDED_FLOW_PLACES];

const WORKTREES = join(RECORDED_FLOW_PLACEHOLDERS.REPOSITORY, PRODUCT_NAMES.WORKTREES_FOLDER);
const TICKET_WORKTREE_FOLDER = join(WORKTREES, RECORDED_FLOW_TICKET_BRANCH);
/** Setup S1's snapshot, which its pipeline agent reads. */
const PIPELINE_AGENT_WORKTREE_FOLDER = join(WORKTREES, 'pipeline-agent', 'S1');

/** Each place's folder below the repository, longest first, so a folder is the place of the deepest one it lies in. */
export const RECORDED_FLOW_PLACE_FOLDERS: readonly (readonly [RecordedFlowPlace, string])[] = [
  [RECORDED_FLOW_PLACES.TICKET_WORKTREE, TICKET_WORKTREE_FOLDER],
  [RECORDED_FLOW_PLACES.PIPELINE_AGENT_WORKTREE, PIPELINE_AGENT_WORKTREE_FOLDER],
  [RECORDED_FLOW_PLACES.SESSION_FOLDER, join(WORKTREES, 'sessions')],
  [RECORDED_FLOW_PLACES.MAIN_CHECKOUT, RECORDED_FLOW_PLACEHOLDERS.REPOSITORY],
];

export type GitHookPolicyName = 'hooks-off' | 'repository-hooks';

export type RecordedFlowStageName =
  | 'tracker ready'
  | 'pipeline agent worktree made'
  | 'worktree made'
  | 'tree changed'
  | 'tree changed with trailer'
  | 'agent config changed'
  | 'branch merged'
  | 'builder file committed'
  | 'claude block committed'
  | 'claude block removed'
  | 'claude block removal committed'
  | 'line endings normalised'
  | 'unnormalised worktree made'
  | 'ticket branch checked out elsewhere'
  | 'main moved'
  | 'main merged in'
  | 'merged branch landed'
  | 'branch conflicting with main'
  | 'merge conflicted'
  | 'conflict resolved'
  | 'resolved branch landed';

/** The file the main line gains past the ticket branch's fork point in the stage "main moved". */
export const RECORDED_FLOW_MOVED_MAIN_FILE = { path: 'moved-main.txt', text: 'so the merged tree is one no build gate judged\n' } as const;

/**
 * The builder instructions file a pipeline names, missing on the main line until the stage "builder file committed": the ticket worktree
 * made, and the main line it forks off holding the file.
 */
export const RECORDED_FLOW_BUILDER_FILE = { path: 'example-builder.md', text: 'Build ticket #{{ticketId}}.\n' } as const;

/** The `CLAUDE.md` texts of the main line's stages: the managed block, and the conventions that replace it. */
export const RECORDED_FLOW_CLAUDE_FILE_TEXTS = { managedBlock: '<!-- example-managed-block -->\n', conventions: '# Example conventions\n' } as const;

/** A file stored with CRLF line endings, which `* text` in `.gitattributes` converts at checkout. */
export const RECORDED_FLOW_UNNORMALISED_FILE = { path: 'example.txt', text: 'first line\r\nsecond line\r\n', attributes: '* text\n' } as const;

/** The folder where the ticket branch is checked out in the stage "ticket branch checked out elsewhere". */
export const RECORDED_FLOW_ELSEWHERE_FOLDER = 'elsewhere';

/**
 * One call of a stage. `nextStage` is the stage its answer leaves the repository in, and `leavesFolder` the folder git makes for it, which a
 * replay makes too; `exitCode` is the one recorded, 0 unless named.
 */
export interface RecordedFlowCall {
  readonly place:          RecordedFlowPlace;
  readonly gitArguments:   readonly string[];
  readonly exitCode?:      number;
  readonly hookPolicy?:    GitHookPolicyName;
  readonly nextStage?:     RecordedFlowStageName;
  readonly leavesFolder?:  string;
  /** The folder git removes for it, which a replay removes too. */
  readonly removesFolder?: string;
}

const NEGATIVE = 1;
const FATAL = 128;
const NO_SUCH_REMOTE = 2;
const { MAIN_TIP, TICKET_TIP } = RECORDED_FLOW_PLACEHOLDERS;

function callsIn(place: RecordedFlowPlace, calls: readonly (readonly string[] | Omit<RecordedFlowCall, 'place'>)[]): RecordedFlowCall[] {
  return calls.map((call) => ('gitArguments' in call ? { place, ...call } : { place, gitArguments: call as readonly string[] }));
}

function resolved(revision: string): string[] {
  return ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`];
}

const MAIN_CHECKOUT_READS = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  ['version'],
  // The fake agent child's own read of the commit its report names.
  ['rev-parse', 'HEAD'],
  ['rev-parse', '--git-common-dir'],
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  ['rev-parse', '--absolute-git-dir'],
  ['rev-parse', '--abbrev-ref', 'HEAD'],
  ['symbolic-ref', '--quiet', '--short', 'HEAD'],
  ['config', '--bool', 'commit.gpgsign'],
  { gitArguments: ['remote', 'get-url', 'origin'], exitCode: NO_SUCH_REMOTE },
  resolved('HEAD'),
  resolved(RECORDED_FLOW_MAIN_LINE),
  resolved(`refs/heads/${RECORDED_FLOW_MAIN_LINE}`),
  ['rev-parse', '--verify', '--quiet', RECORDED_FLOW_MAIN_LINE],
  { gitArguments: resolved('main'), exitCode: NEGATIVE },
  { gitArguments: ['show', `${RECORDED_FLOW_MAIN_LINE}:CLAUDE.md`], exitCode: FATAL },
  { gitArguments: ['show', 'main:CLAUDE.md'], exitCode: FATAL },
  { gitArguments: ['show', `${RECORDED_FLOW_MAIN_LINE}:${RECORDED_FLOW_BUILDER_FILE.path}`], exitCode: FATAL },
  ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
  ['worktree', 'list', '--porcelain'],
  ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
]);

const SESSION_FOLDER_READS = callsIn(RECORDED_FLOW_PLACES.SESSION_FOLDER, [
  ['rev-parse', 'HEAD'],
  ['rev-parse', '--absolute-git-dir'],
  resolved('HEAD'),
]);

const TICKET_BRANCH_MISSING = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{ gitArguments: resolved(`refs/heads/${RECORDED_FLOW_TICKET_BRANCH}`), exitCode: NEGATIVE }]);
const TICKET_BRANCH_PRESENT = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  resolved(`refs/heads/${RECORDED_FLOW_TICKET_BRANCH}`),
  ['rev-parse', '--verify', '--quiet', `refs/heads/${RECORDED_FLOW_TICKET_BRANCH}^{tree}`],
]);

const TICKET_WORKTREE_READS = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  ['rev-parse', 'HEAD'],
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'],
  ['rev-parse', '--absolute-git-dir'],
  { gitArguments: ['config', '--get', 'core.hooksPath'], exitCode: NEGATIVE, hookPolicy: 'repository-hooks' },
  ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames'],
  ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'],
  ['status', '--porcelain=v1', '--untracked-files=all'],
  ['diff', '--no-ext-diff', 'HEAD', '--'],
  ['merge-base', RECORDED_FLOW_MAIN_LINE, 'HEAD'],
  ['merge-base', '--is-ancestor', MAIN_TIP, 'HEAD'],
  ['log', '--name-only', '--no-renames', '-z', '--format=', `${MAIN_TIP}..HEAD`, '--'],
  ['diff', '--name-only', '--no-renames', '-z', MAIN_TIP, 'HEAD', '--'],
  ['rev-list', `${MAIN_TIP}..HEAD`],
  resolved('HEAD'),
  resolved(MAIN_TIP),
  { gitArguments: resolved('MERGE_HEAD'), exitCode: NEGATIVE },
  ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'],
  ['for-each-ref', '--format=%(refname) %(objectname)'],
  ['worktree', 'list', '--porcelain'],
]);

/** What the worktree is asked once the session committed: the commit's message and tree, and how it stands to the main tip. */
const TICKET_COMMIT_READS = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  ['log', '-1', '--format=%B', TICKET_TIP],
  resolved(TICKET_TIP),
  ['merge-base', '--is-ancestor', MAIN_TIP, TICKET_TIP],
  ['merge-base', '--is-ancestor', TICKET_TIP, TICKET_TIP],
  ['rev-parse', '--verify', '--quiet', `${TICKET_TIP}^{tree}`],
  // A retry measures its work from the earlier attempt's start, which is this commit.
  ['merge-base', '--is-ancestor', TICKET_TIP, 'HEAD'],
  ['log', '--name-only', '--no-renames', '-z', '--format=', `${TICKET_TIP}..HEAD`, '--'],
  ['diff', '--name-only', '--no-renames', '-z', TICKET_TIP, 'HEAD', '--'],
  ['rev-list', `${TICKET_TIP}..HEAD`],
]);

const LANDING_READS = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', RECORDED_FLOW_MAIN_LINE, RECORDED_FLOW_TICKET_BRANCH],
  ['diff', '--name-only', '--no-renames', '-z', 'HEAD', TICKET_TIP, '--'],
]);

const PIPELINE_AGENT_WORKTREE_READS = callsIn(RECORDED_FLOW_PLACES.PIPELINE_AGENT_WORKTREE, [
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  { gitArguments: ['config', '--get', 'core.hooksPath'], exitCode: NEGATIVE, hookPolicy: 'repository-hooks' },
  resolved('HEAD'),
  ['for-each-ref', '--format=%(refname) %(objectname)'],
  ['worktree', 'list', '--porcelain'],
  ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'],
]);

/** The ticket worktree added on a new branch off the main line, which leaves the repository in `nextStage`. */
function ticketWorktreeAddTo(nextStage: RecordedFlowStageName): RecordedFlowCall[] {
  return callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
    gitArguments: ['worktree', 'add', '-b', RECORDED_FLOW_TICKET_BRANCH, TICKET_WORKTREE_FOLDER, RECORDED_FLOW_MAIN_LINE],
    nextStage,
    leavesFolder: TICKET_WORKTREE_FOLDER,
  }]);
}

const TICKET_WORKTREE_ADD = ticketWorktreeAddTo('worktree made');

const PIPELINE_AGENT_WORKTREE_ADD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
  gitArguments: ['worktree', 'add', '--quiet', '--detach', PIPELINE_AGENT_WORKTREE_FOLDER, MAIN_TIP],
  nextStage:    'pipeline agent worktree made',
  leavesFolder: PIPELINE_AGENT_WORKTREE_FOLDER,
}]);

/** A setup's start and its Apply read main's constitution: the main line holds none. */
const MAIN_CONSTITUTION_READ = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  { gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_TIP}:CONSTITUTION.md`], exitCode: NEGATIVE },
]);

/** The agent's first proposal reads the snapshot commit's tree. */
const PIPELINE_SETUP_MAIN_READS = [...callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [['ls-tree', '-r', '-z', '--full-tree', MAIN_TIP]]), ...MAIN_CONSTITUTION_READ];

const PIPELINE_AGENT_WORKTREE_REMOVE = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
  gitArguments:  ['worktree', 'remove', '--force', PIPELINE_AGENT_WORKTREE_FOLDER],
  nextStage:     'tracker ready',
  removesFolder: PIPELINE_AGENT_WORKTREE_FOLDER,
}]);

const FAST_FORWARD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{ gitArguments: ['merge', '--ff-only', '--quiet', TICKET_TIP], nextStage: 'branch merged' }]);

const { MOVED_MAIN_TIP, MERGED_TIP } = RECORDED_FLOW_PLACEHOLDERS;

const MOVED_MAIN_PREDICTION = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', RECORDED_FLOW_MAIN_LINE, RECORDED_FLOW_TICKET_BRANCH],
]);

/** The Airlock merges the moved main line into the ticket branch, which leaves a merge commit no gate judged yet. */
const MOVED_MAIN_MERGE_IN = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  resolved(MOVED_MAIN_TIP),
  { gitArguments: ['merge-base', '--is-ancestor', MOVED_MAIN_TIP, TICKET_TIP], exitCode: NEGATIVE },
  { gitArguments: ['merge-base', '--is-ancestor', MOVED_MAIN_TIP, 'HEAD'], exitCode: NEGATIVE },
  { gitArguments: ['merge', '--no-ff', '--no-edit', '--quiet', MOVED_MAIN_TIP], nextStage: 'main merged in' },
]);

const MERGED_IN_READS = [
  ...callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
    resolved(MOVED_MAIN_TIP),
    resolved(MERGED_TIP),
    ['merge-base', '--is-ancestor', MOVED_MAIN_TIP, 'HEAD'],
    ['merge-base', '--is-ancestor', MOVED_MAIN_TIP, MERGED_TIP],
    ['rev-parse', '--verify', '--quiet', `${MERGED_TIP}^{tree}`],
  ]),
  ...callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
    ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', RECORDED_FLOW_MAIN_LINE, RECORDED_FLOW_TICKET_BRANCH],
    ['diff', '--name-only', '--no-renames', '-z', 'HEAD', MERGED_TIP, '--'],
  ]),
];

const MERGED_FAST_FORWARD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{ gitArguments: ['merge', '--ff-only', '--quiet', MERGED_TIP], nextStage: 'merged branch landed' }]);

/** A stage of the session's commit, entered by the spec when the session commits, since the fake session makes no git call. */
export const RECORDED_FLOW_COMMITS = {
  'tree changed':              { path: 'built.txt', message: 'Build the example' },
  'tree changed with trailer': { path: 'built.txt', message: 'Build the example\n\nCo-Authored-By: Claude <noreply@example.com>' },
  'agent config changed':      { path: '.claude/settings.json', message: 'Build the example' },
} as const;

type CommitStageName = keyof typeof RECORDED_FLOW_COMMITS;

/** The file a real session process writes before its commit, and the text it writes. */
export const RECORDED_FLOW_SESSION_FILE = { path: RECORDED_FLOW_COMMITS['tree changed'].path, text: 'built\n' } as const;

/**
 * The commit of a session that is a real process, which calls git itself: it stages the session file and commits it, which moves the flow
 * to the stage of that commit. The recording walk asks these once the session file is written.
 */
export const RECORDED_FLOW_SESSION_COMMIT = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  ['add', RECORDED_FLOW_SESSION_FILE.path],
  { gitArguments: [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', RECORDED_FLOW_COMMITS['tree changed'].message], nextStage: 'tree changed' },
]);

const COMMITTED_STAGE_CALLS = [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...TICKET_WORKTREE_READS, ...TICKET_COMMIT_READS];

function callKeyOf(call: RecordedFlowCall): string {
  return `${call.place}\0${JSON.stringify(call.gitArguments)}`;
}

/** `calls` with each call of `replacements` in place of the call it names, and the others added. */
function withCallsReplaced(calls: readonly RecordedFlowCall[], replacements: readonly RecordedFlowCall[]): RecordedFlowCall[] {
  const replacementByKey = new Map(replacements.map((call) => [callKeyOf(call), call]));
  const keysOfCalls = new Set(calls.map(callKeyOf));
  return [...calls.map((call) => replacementByKey.get(callKeyOf(call)) ?? call), ...replacements.filter((call) => !keysOfCalls.has(callKeyOf(call)))];
}

const BUILDER_FILE_SHOWN = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [['show', `${RECORDED_FLOW_MAIN_LINE}:${RECORDED_FLOW_BUILDER_FILE.path}`]]);
const CLAUDE_FILE_SHOWN = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [['show', `${RECORDED_FLOW_MAIN_LINE}:CLAUDE.md`]]);
const MAIN_LINE_STANDING = [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_MISSING];
const WORKTREE_STANDING = [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...TICKET_WORKTREE_READS];

/** The branch exists, so the Overseer adds the worktree on it, which git refuses while another worktree holds the branch. */
const WORKTREE_ADD_REFUSED = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
  gitArguments: ['worktree', 'add', TICKET_WORKTREE_FOLDER, RECORDED_FLOW_TICKET_BRANCH],
  exitCode:     FATAL,
}]);

/** The file both the ticket branch and the moved main line change, each its own way, and the text that resolves the conflict. */
export const RECORDED_FLOW_CONFLICT = {
  path:         'roles.ts',
  branchText:   'export const roles = [\'builder\'];\n',
  mainLineText: 'export const roles = [\'reviewer\'];\n',
  resolvedText: 'export const roles = [\'builder\', \'reviewer\'];\n',
} as const;

const CONFLICT_PREDICTION = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
  gitArguments: ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', RECORDED_FLOW_MAIN_LINE, RECORDED_FLOW_TICKET_BRANCH],
  exitCode:     NEGATIVE,
}]);

const CONFLICTED_MERGE_IN = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  resolved(MOVED_MAIN_TIP),
  { gitArguments: ['merge-base', '--is-ancestor', MOVED_MAIN_TIP, TICKET_TIP], exitCode: NEGATIVE },
  { gitArguments: ['merge-base', '--is-ancestor', MOVED_MAIN_TIP, 'HEAD'], exitCode: NEGATIVE },
  { gitArguments: ['merge', '--no-ff', '--no-edit', '--quiet', MOVED_MAIN_TIP], exitCode: NEGATIVE, nextStage: 'merge conflicted' },
]);

/** What the worktree answers while the merge-in stands stopped on the conflict: the merge in progress and the unmerged file. */
const CONFLICTED_WORKTREE_READS = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  resolved('MERGE_HEAD'),
  resolved(MOVED_MAIN_TIP),
  ['diff', '--name-only', '--diff-filter=U', '-z'],
  ['ls-files', '-u'],
  { gitArguments: ['merge-base', '--is-ancestor', MOVED_MAIN_TIP, 'HEAD'], exitCode: NEGATIVE },
]);

/**
 * The commit of an Airlock agent that is a real process, which calls git itself: it stages the resolved file and commits the merge, which
 * moves the flow to "conflict resolved". The recording walk asks these once the resolved file is written.
 */
export const RECORDED_FLOW_CONFLICT_RESOLUTION = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  ['add', RECORDED_FLOW_CONFLICT.path],
  { gitArguments: [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '--no-edit'], nextStage: 'conflict resolved' },
]);

/** The Assistant plays the same fake steps in its session folder, where the resolved file is a path the `.gitignore` ignores. */
const SESSION_FOLDER_CONFLICT_ADD = callsIn(RECORDED_FLOW_PLACES.SESSION_FOLDER, [{ gitArguments: ['add', RECORDED_FLOW_CONFLICT.path], exitCode: NEGATIVE }]);

/** What the Airlock checks of the committed resolution before the landing. */
const RESOLUTION_READS = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  ['ls-files', '-u'],
  ['rev-list', '--merges', '--reverse', `${TICKET_TIP}..HEAD`, `^${MOVED_MAIN_TIP}`],
  { gitArguments: ['config', '--get', 'core.whitespace'], exitCode: NEGATIVE },
  ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', TICKET_TIP, 'HEAD', '--', RECORDED_FLOW_CONFLICT.path],
  ['rev-list', '--parents', '-n', '1', MERGED_TIP],
]);

const RESOLVED_FAST_FORWARD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{ gitArguments: ['merge', '--ff-only', '--quiet', MERGED_TIP], nextStage: 'resolved branch landed' }]);

export const RECORDED_FLOW_STAGES: Readonly<Record<RecordedFlowStageName, readonly RecordedFlowCall[]>> = {
  'tracker ready': [
    ...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_MISSING, ...MAIN_CONSTITUTION_READ, ...PIPELINE_AGENT_WORKTREE_ADD, ...TICKET_WORKTREE_ADD,
  ],
  'pipeline agent worktree made': [
    ...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_MISSING, ...PIPELINE_AGENT_WORKTREE_READS, ...PIPELINE_SETUP_MAIN_READS, ...PIPELINE_AGENT_WORKTREE_REMOVE,
  ],
  'worktree made':                [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...TICKET_WORKTREE_READS, ...RECORDED_FLOW_SESSION_COMMIT],
  'tree changed':                 [...COMMITTED_STAGE_CALLS, ...LANDING_READS, ...FAST_FORWARD],
  'tree changed with trailer':    COMMITTED_STAGE_CALLS,
  'agent config changed':         COMMITTED_STAGE_CALLS,
  'branch merged':                [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...TICKET_WORKTREE_READS, ...TICKET_COMMIT_READS],
  'builder file committed':       withCallsReplaced(WORKTREE_STANDING, BUILDER_FILE_SHOWN),
  'claude block committed':       withCallsReplaced(MAIN_LINE_STANDING, CLAUDE_FILE_SHOWN),
  'claude block removed':         withCallsReplaced(MAIN_LINE_STANDING, CLAUDE_FILE_SHOWN),
  'main moved':                   [...COMMITTED_STAGE_CALLS, ...MOVED_MAIN_PREDICTION, ...MOVED_MAIN_MERGE_IN],
  'main merged in':               [...COMMITTED_STAGE_CALLS, ...MERGED_IN_READS, ...MERGED_FAST_FORWARD],
  'merged branch landed':         [...COMMITTED_STAGE_CALLS, ...MERGED_IN_READS],
  'branch conflicting with main': [...COMMITTED_STAGE_CALLS, ...SESSION_FOLDER_CONFLICT_ADD, ...CONFLICT_PREDICTION, ...CONFLICTED_MERGE_IN],
  'merge conflicted':             [
    ...withCallsReplaced(COMMITTED_STAGE_CALLS, CONFLICTED_WORKTREE_READS), ...SESSION_FOLDER_CONFLICT_ADD, ...CONFLICT_PREDICTION, ...RECORDED_FLOW_CONFLICT_RESOLUTION,
  ],
  'conflict resolved':                   [...COMMITTED_STAGE_CALLS, ...SESSION_FOLDER_CONFLICT_ADD, ...MERGED_IN_READS, ...RESOLUTION_READS, ...RESOLVED_FAST_FORWARD],
  'resolved branch landed':              [...COMMITTED_STAGE_CALLS, ...SESSION_FOLDER_CONFLICT_ADD, ...MERGED_IN_READS, ...RESOLUTION_READS],
  'claude block removal committed':      [...withCallsReplaced(MAIN_LINE_STANDING, CLAUDE_FILE_SHOWN), ...TICKET_WORKTREE_ADD],
  'line endings normalised':             [...MAIN_LINE_STANDING, ...ticketWorktreeAddTo('unnormalised worktree made')],
  'unnormalised worktree made':          WORKTREE_STANDING,
  'ticket branch checked out elsewhere': [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...WORKTREE_ADD_REFUSED],
};

export type RecordedFlowCommitStageName = CommitStageName;

/** The key a stage's recorded answer is stored under. */
export function recordedFlowCallShapeOf(stage: RecordedFlowStageName, place: RecordedFlowPlace, gitArguments: readonly string[]): string {
  return `flow stage "${stage}", in the ${place}: git ${gitArguments.join(' ')}`;
}
