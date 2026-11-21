/**
 * The stages of a ticket's flow through git, each one answer set: the calls Hephaestus makes while the repository stands in that stage,
 * with the place each is asked in. `src/lib/git/RecordedGitAnswers.integration.spec.ts` walks a real repository through the stages and
 * records every answer; `src/testing/RecordedGit.ts` answers a default spec's calls from the stage it is in, in any order and as often as asked.
 * A recorded answer holds placeholders for the repository folder and the commit and tree ids, which a replay fills with fixed example ids.
 */
import { join } from 'node:path';

import { branchNamesOf }                     from '../shared/BranchNames.ts';
import { PRODUCT_NAMES }                     from '../shared/constants/ProductNames.ts';
import { SCRATCH_COMMIT_IDENTITY_ARGUMENTS } from './ScratchWorkspace.ts';

export const RECORDED_FLOW_MAIN_LINE = 'master';
export const RECORDED_FLOW_TICKET_BRANCH = 'ticket-001';
/** The `.gitignore` of the recorded repository, as `init` writes it: the data folder and the worktrees folder ignored. */
export const RECORDED_FLOW_IGNORE_FILE_TEXT = `${PRODUCT_NAMES.DATA_FOLDER}/\n${PRODUCT_NAMES.WORKTREES_FOLDER}/\n`;

export const RECORDED_FLOW_PLACEHOLDERS = {
  REPOSITORY:           '<repository>',
  MAIN_TIP:             '<main tip>',
  MAIN_TREE:            '<main tree>',
  TICKET_TIP:           '<ticket tip>',
  TICKET_TREE:          '<ticket tree>',
  /** The main line's tip once it moved past the ticket branch's fork point, and its tree. */
  MOVED_MAIN_TIP:       '<moved main tip>',
  MOVED_MAIN_TREE:      '<moved main tree>',
  /** The commit that merges the moved main line into the ticket branch, and its tree. */
  MERGED_TIP:           '<merged tip>',
  MERGED_TREE:          '<merged tree>',
  /** The tree git's own merge of the ticket branch and the moved main line writes, conflict markers and all. */
  AUTOMATIC_MERGE_TREE: '<automatic merge tree>',
  /** The commit an Airlock agent's fix of a red merged tree adds on the merge commit, and its tree. */
  FIXED_TIP:            '<fixed tip>',
  FIXED_TREE:           '<fixed tree>',
} as const;

type FlowPlaceholder = typeof RECORDED_FLOW_PLACEHOLDERS[keyof typeof RECORDED_FLOW_PLACEHOLDERS];
type ObjectPlaceholder = Exclude<FlowPlaceholder, typeof RECORDED_FLOW_PLACEHOLDERS.REPOSITORY>;

/** The ids a replay gives each recorded commit and tree; any 40 hexadecimal digits read as an object id. */
export const REPLAYED_OBJECT_IDS: Readonly<Record<ObjectPlaceholder, string>> = {
  [RECORDED_FLOW_PLACEHOLDERS.MAIN_TIP]:             '1'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MAIN_TREE]:            '2'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.TICKET_TIP]:           '3'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.TICKET_TREE]:          '4'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MOVED_MAIN_TIP]:       '5'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MOVED_MAIN_TREE]:      '6'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MERGED_TIP]:           '7'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MERGED_TREE]:          '8'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.AUTOMATIC_MERGE_TREE]: '9'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.FIXED_TIP]:            'a'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.FIXED_TREE]:           'b'.repeat(40),
};

export const RECORDED_FLOW_PLACES = {
  MAIN_CHECKOUT:           'main checkout',
  SESSION_FOLDER:          'session folder',
  TICKET_WORKTREE:         'ticket worktree',
  PIPELINE_AGENT_WORKTREE: 'pipeline agent worktree',
  PROJECT_FOLDER:          'project folder',
  PROJECT_TICKET_WORKTREE: 'project ticket worktree',
  PROJECT_SESSION_FOLDER:  'project session folder',
} as const;

export type RecordedFlowPlace = typeof RECORDED_FLOW_PLACES[keyof typeof RECORDED_FLOW_PLACES];

const WORKTREES = join(RECORDED_FLOW_PLACEHOLDERS.REPOSITORY, PRODUCT_NAMES.WORKTREES_FOLDER);
const TICKET_WORKTREE_FOLDER = join(WORKTREES, RECORDED_FLOW_TICKET_BRANCH);
/** Setup S1's snapshot, which its pipeline agent reads. */
const PIPELINE_AGENT_WORKTREE_FOLDER = join(WORKTREES, 'pipeline-agent', 'S1');

/** The tracker of the folder flow: its project folder below the repository and its branch namespace. */
export const RECORDED_FOLDER_FLOW_PROJECT = { prefix: 'apps/example', namespace: 'example' } as const;
export const RECORDED_FOLDER_FLOW_TICKET_BRANCH = branchNamesOf(RECORDED_FOLDER_FLOW_PROJECT.namespace).ticketBranchOf('001');

const PROJECT_FOLDER = join(RECORDED_FLOW_PLACEHOLDERS.REPOSITORY, RECORDED_FOLDER_FLOW_PROJECT.prefix);
const PROJECT_WORKTREES = join(PROJECT_FOLDER, PRODUCT_NAMES.WORKTREES_FOLDER);
const PROJECT_TICKET_WORKTREE_FOLDER = join(PROJECT_WORKTREES, branchNamesOf(null).ticketBranchOf('001'));

/** Each place's folder below the repository, longest first, so a folder is the place of the deepest one it lies in. */
export const RECORDED_FLOW_PLACE_FOLDERS: readonly (readonly [RecordedFlowPlace, string])[] = [
  [RECORDED_FLOW_PLACES.PROJECT_TICKET_WORKTREE, PROJECT_TICKET_WORKTREE_FOLDER],
  [RECORDED_FLOW_PLACES.PROJECT_SESSION_FOLDER, join(PROJECT_WORKTREES, 'sessions')],
  [RECORDED_FLOW_PLACES.PROJECT_FOLDER, PROJECT_FOLDER],
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
  | 'line endings normalised'
  | 'unnormalised worktree made'
  | 'ticket branch checked out elsewhere'
  | 'main moved'
  | 'main merged in'
  | 'merged branch landed'
  | 'branch conflicting with main'
  | 'merge conflicted'
  | 'conflict resolved'
  | 'resolved branch landed'
  | RecordedFolderFlowStageName;

/**
 * The stages of the folder flow: a tracker in `apps/example` with the branch namespace `example`, from its `init` to a landing, a resolved
 * conflict, a red merged tree an Airlock agent fixes or a red handoff.
 */
export type RecordedFolderFlowStageName =
  | 'folder tracker ready'
  | 'folder worktree made'
  | 'folder tree changed'
  | 'folder branch merged'
  | 'folder branch conflicting with main'
  | 'folder merge conflicted'
  | 'folder conflict resolved'
  | 'folder resolved branch landed'
  | 'folder merged tree fixed'
  | 'folder fixed branch landed';

/** The file the main line gains past the ticket branch's fork point in the stage "main moved". */
export const RECORDED_FLOW_MOVED_MAIN_FILE = { path: 'moved-main.txt', text: 'so the merged tree is one no build gate judged\n' } as const;

/**
 * The builder instructions file a pipeline names, missing on the main line until the stage "builder file committed": the ticket worktree
 * made, and the main line it forks off holding the file.
 */
export const RECORDED_FLOW_BUILDER_FILE = { path: 'example-builder.md', text: 'Build ticket #{{ticketId}}.\n' } as const;

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
const MAIN_LINE_STANDING = [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_MISSING];
const WORKTREE_STANDING = [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...TICKET_WORKTREE_READS];

/** The branch exists, so Hephaestus adds the worktree on it, which git refuses while another worktree holds the branch. */
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


/** The file the folder flow's builder commits in the project folder, and the message of its commit. */
export const RECORDED_FOLDER_FLOW_COMMIT = { path: `${RECORDED_FOLDER_FLOW_PROJECT.prefix}/built.txt`, text: 'built\n', message: 'Build the example' } as const;
/** The file the folder flow's ticket branch and moved main line both change, each its own way, in the project folder. */
export const RECORDED_FOLDER_FLOW_CONFLICT_PATH = `${RECORDED_FOLDER_FLOW_PROJECT.prefix}/${RECORDED_FLOW_CONFLICT.path}`;
/** The file an Airlock agent's fix of the red merged tree commits in the project folder, and the message of its commit. */
export const RECORDED_FOLDER_FLOW_MERGED_TREE_FIX = { path: `${RECORDED_FOLDER_FLOW_PROJECT.prefix}/fixed.txt`, text: 'fixed\n', message: 'Fix the merged tree' } as const;
/** The folder the agent adapter installs each skill in, and the skills `init` installs, in its order. */
const RECORDED_FLOW_SKILLS_FOLDER = '.claude/skills';
const RECORDED_FLOW_INSTALLED_SKILLS = [PRODUCT_NAMES.PRODUCT_OWNER_SKILL, PRODUCT_NAMES.PIPELINE_SETUP_SKILL];
/** The `.gitignore` lines `init` adds to the project folder's own for the skills it installs, which are not ignored yet. */
export const RECORDED_FOLDER_FLOW_SKILL_IGNORE_TEXT = RECORDED_FLOW_INSTALLED_SKILLS.map((skill) => `${RECORDED_FLOW_SKILLS_FOLDER}/${skill}/\n`).join('');

const { MOVED_MAIN_TIP: FOLDER_MOVED_MAIN_TIP, MERGED_TIP: FOLDER_MERGED_TIP, AUTOMATIC_MERGE_TREE } = RECORDED_FLOW_PLACEHOLDERS;

/** `init` in the project folder: the repository it lies in, the branches its namespace must leave room for, and the ignored folders. */
const FOLDER_INIT_READS = [
  ...callsIn(RECORDED_FLOW_PLACES.PROJECT_FOLDER, [
    ['rev-parse', '--git-common-dir'],
    ['version'],
    ['check-ignore', '-q', `${PRODUCT_NAMES.DATA_FOLDER}/`],
    ['check-ignore', '-q', `${PRODUCT_NAMES.WORKTREES_FOLDER}/`],
    ...RECORDED_FLOW_INSTALLED_SKILLS.map((skill) => ({ gitArguments: ['check-ignore', '-q', `${RECORDED_FLOW_SKILLS_FOLDER}/${skill}/`], exitCode: NEGATIVE })),
  ]),
  ...callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [['for-each-ref', '--format=%(refname:short)', 'refs/heads']]),
];

/** What a folder tracker reads of its main checkout in every stage: the repository, the main line, the project's instruction file. */
const FOLDER_MAIN_CHECKOUT_READS = [
  ...callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
    ['rev-parse', '--git-common-dir'],
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    ['rev-parse', '--absolute-git-dir'],
    ['config', '--bool', 'commit.gpgsign'],
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
    ['worktree', 'list', '--porcelain'],
    resolved('HEAD'),
    resolved(RECORDED_FLOW_MAIN_LINE),
  ]),
  ...callsIn(RECORDED_FLOW_PLACES.PROJECT_SESSION_FOLDER, [resolved('HEAD')]),
];

const FOLDER_TICKET_BRANCH_MISSING = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  { gitArguments: resolved(`refs/heads/${RECORDED_FOLDER_FLOW_TICKET_BRANCH}`), exitCode: NEGATIVE },
]);
const FOLDER_TICKET_BRANCH_PRESENT = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  resolved(`refs/heads/${RECORDED_FOLDER_FLOW_TICKET_BRANCH}`),
  ['rev-parse', '--verify', '--quiet', `refs/heads/${RECORDED_FOLDER_FLOW_TICKET_BRANCH}^{tree}`],
]);

const FOLDER_TICKET_WORKTREE_READS = callsIn(RECORDED_FLOW_PLACES.PROJECT_TICKET_WORKTREE, [
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'],
  ['rev-parse', '--absolute-git-dir'],
  { gitArguments: ['config', '--get', 'core.hooksPath'], exitCode: NEGATIVE, hookPolicy: 'repository-hooks' },
  ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames'],
  ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'],
  ['merge-base', RECORDED_FLOW_MAIN_LINE, 'HEAD'],
  ['log', '--name-only', '--no-renames', '-z', '--format=', `${MAIN_TIP}..HEAD`, '--'],
  ['diff', '--name-only', '--no-renames', '-z', MAIN_TIP, 'HEAD', '--'],
  resolved('HEAD'),
  ['for-each-ref', '--format=%(refname) %(objectname)'],
  ['worktree', 'list', '--porcelain'],
]);

/** What the worktree is asked once the builder committed: the work since the fork point, the commit's message and tree, Customs' checks. */
const FOLDER_TICKET_COMMIT_READS = callsIn(RECORDED_FLOW_PLACES.PROJECT_TICKET_WORKTREE, [
  ['status', '--porcelain=v1', '--untracked-files=all'],
  ['diff', '--no-ext-diff', 'HEAD', '--'],
  ['merge-base', '--is-ancestor', MAIN_TIP, 'HEAD'],
  ['rev-list', `${MAIN_TIP}..HEAD`],
  ['log', '--name-only', '--no-renames', '--format=', `${MAIN_TIP}..HEAD`, `^${RECORDED_FLOW_MAIN_LINE}`, '--'],
  ['diff', '--name-only', '--no-renames', MAIN_TIP, 'HEAD', '--'],
  ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'],
  ['log', '-1', '--format=%B', TICKET_TIP],
  resolved(MAIN_TIP),
  { gitArguments: resolved('MERGE_HEAD'), exitCode: NEGATIVE },
  ['merge-base', '--is-ancestor', MAIN_TIP, TICKET_TIP],
  ['rev-parse', '--verify', '--quiet', `${TICKET_TIP}^{tree}`],
]);

const FOLDER_COMMITTED_STAGE_CALLS = [...FOLDER_MAIN_CHECKOUT_READS, ...FOLDER_TICKET_BRANCH_PRESENT, ...FOLDER_TICKET_WORKTREE_READS, ...FOLDER_TICKET_COMMIT_READS];

/** The main line as the landing asks it: the paths a fast-forward to `tip` changes, the checkout's state and the branch. */
function folderLandingReadsOf(tip: string): RecordedFlowCall[] {
  return callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
    resolved(`refs/heads/${RECORDED_FLOW_MAIN_LINE}`),
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    ['diff', '--name-only', '--no-renames', '-z', 'HEAD', tip, '--'],
  ]);
}

function folderMergePredictionOf(exitCode: number): RecordedFlowCall[] {
  return callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
    gitArguments: ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', RECORDED_FLOW_MAIN_LINE, RECORDED_FOLDER_FLOW_TICKET_BRANCH],
    exitCode,
  }]);
}

const FOLDER_TICKET_WORKTREE_ADD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
  gitArguments: ['worktree', 'add', '-b', RECORDED_FOLDER_FLOW_TICKET_BRANCH, PROJECT_TICKET_WORKTREE_FOLDER, RECORDED_FLOW_MAIN_LINE],
  nextStage:    'folder worktree made',
  leavesFolder: PROJECT_TICKET_WORKTREE_FOLDER,
}]);

const FOLDER_FAST_FORWARD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{ gitArguments: ['merge', '--ff-only', '--quiet', TICKET_TIP], nextStage: 'folder branch merged' }]);

const FOLDER_CONFLICTED_MERGE_IN = callsIn(RECORDED_FLOW_PLACES.PROJECT_TICKET_WORKTREE, [
  resolved(FOLDER_MOVED_MAIN_TIP),
  { gitArguments: ['merge-base', '--is-ancestor', FOLDER_MOVED_MAIN_TIP, TICKET_TIP], exitCode: NEGATIVE },
  { gitArguments: ['merge-base', '--is-ancestor', FOLDER_MOVED_MAIN_TIP, 'HEAD'], exitCode: NEGATIVE },
  { gitArguments: ['merge', '--no-ff', '--no-edit', '--quiet', FOLDER_MOVED_MAIN_TIP], exitCode: NEGATIVE, nextStage: 'folder merge conflicted' },
]);

/** What the worktree answers while the merge-in stands stopped on the conflict: the merge in progress and the unmerged file. */
const FOLDER_CONFLICTED_WORKTREE_READS = callsIn(RECORDED_FLOW_PLACES.PROJECT_TICKET_WORKTREE, [
  resolved('MERGE_HEAD'),
  resolved(FOLDER_MOVED_MAIN_TIP),
  ['diff', '--name-only', '--diff-filter=U', '-z'],
  ['ls-files', '-u'],
  { gitArguments: ['merge-base', '--is-ancestor', FOLDER_MOVED_MAIN_TIP, 'HEAD'], exitCode: NEGATIVE },
]);

/** For a tracker in a folder, V5, V17 and V13 on what the commits since the branch tip changed against git's own merge of the two tips. */
const FOLDER_SCOPE_READS = callsIn(RECORDED_FLOW_PLACES.PROJECT_TICKET_WORKTREE, [
  ['rev-list', '--merges', `${TICKET_TIP}..HEAD`, `^${FOLDER_MOVED_MAIN_TIP}`],
  { gitArguments: ['merge-tree', '--write-tree', '--no-messages', TICKET_TIP, FOLDER_MOVED_MAIN_TIP], exitCode: NEGATIVE },
  ['log', '--name-only', '--no-renames', '-z', '--format=', `${TICKET_TIP}..HEAD`, `^${FOLDER_MOVED_MAIN_TIP}`, '--'],
  ['diff', '--name-only', '--no-renames', '-z', AUTOMATIC_MERGE_TREE, 'HEAD', '--'],
]);

/** What the Airlock checks of the committed resolution before the landing: V10, then the scope reads. */
const FOLDER_RESOLUTION_READS = [
  ...callsIn(RECORDED_FLOW_PLACES.PROJECT_TICKET_WORKTREE, [
    resolved(FOLDER_MOVED_MAIN_TIP),
    ['ls-files', '-u'],
    ['rev-list', '--merges', '--reverse', `${TICKET_TIP}..HEAD`, `^${FOLDER_MOVED_MAIN_TIP}`],
    { gitArguments: ['config', '--get', 'core.whitespace'], exitCode: NEGATIVE },
    ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', TICKET_TIP, 'HEAD', '--', RECORDED_FOLDER_FLOW_CONFLICT_PATH],
    ['rev-list', '--parents', '-n', '1', FOLDER_MERGED_TIP],
  ]),
  ...FOLDER_SCOPE_READS,
];

const FOLDER_RESOLVED_FAST_FORWARD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  { gitArguments: ['merge', '--ff-only', '--quiet', FOLDER_MERGED_TIP], nextStage: 'folder resolved branch landed' },
]);

const { FIXED_TIP } = RECORDED_FLOW_PLACEHOLDERS;

const FOLDER_FIXED_FAST_FORWARD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  { gitArguments: ['merge', '--ff-only', '--quiet', FIXED_TIP], nextStage: 'folder fixed branch landed' },
]);

const FOLDER_FLOW_STAGES: Readonly<Record<RecordedFolderFlowStageName, readonly RecordedFlowCall[]>> = {
  'folder tracker ready':                [...FOLDER_INIT_READS, ...FOLDER_MAIN_CHECKOUT_READS, ...FOLDER_TICKET_BRANCH_MISSING, ...FOLDER_TICKET_WORKTREE_ADD],
  'folder worktree made':                [...FOLDER_MAIN_CHECKOUT_READS, ...FOLDER_TICKET_BRANCH_PRESENT, ...FOLDER_TICKET_WORKTREE_READS],
  'folder tree changed':                 [...FOLDER_COMMITTED_STAGE_CALLS, ...folderMergePredictionOf(0), ...folderLandingReadsOf(TICKET_TIP), ...FOLDER_FAST_FORWARD],
  'folder branch merged':                FOLDER_MAIN_CHECKOUT_READS,
  'folder branch conflicting with main': [
    ...FOLDER_COMMITTED_STAGE_CALLS, ...folderMergePredictionOf(NEGATIVE), ...folderLandingReadsOf(TICKET_TIP), ...FOLDER_CONFLICTED_MERGE_IN,
  ],
  'folder merge conflicted':  [...withCallsReplaced(FOLDER_COMMITTED_STAGE_CALLS, FOLDER_CONFLICTED_WORKTREE_READS), ...folderMergePredictionOf(NEGATIVE)],
  'folder conflict resolved': [
    ...FOLDER_COMMITTED_STAGE_CALLS, ...FOLDER_RESOLUTION_READS, ...folderLandingReadsOf(FOLDER_MERGED_TIP), ...FOLDER_RESOLVED_FAST_FORWARD,
  ],
  'folder resolved branch landed': FOLDER_MAIN_CHECKOUT_READS,
  // The fix is not a resolution, so V10 asks nothing of it; the scope reads judge it before its merged tree is gated again.
  'folder merged tree fixed':      [...FOLDER_COMMITTED_STAGE_CALLS, ...FOLDER_SCOPE_READS, ...folderLandingReadsOf(FIXED_TIP), ...FOLDER_FIXED_FAST_FORWARD],
  'folder fixed branch landed':    FOLDER_MAIN_CHECKOUT_READS,
};

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
  'main moved':                   [...COMMITTED_STAGE_CALLS, ...MOVED_MAIN_PREDICTION, ...MOVED_MAIN_MERGE_IN],
  'main merged in':               [...COMMITTED_STAGE_CALLS, ...MERGED_IN_READS, ...MERGED_FAST_FORWARD],
  'merged branch landed':         [...COMMITTED_STAGE_CALLS, ...MERGED_IN_READS],
  'branch conflicting with main': [...COMMITTED_STAGE_CALLS, ...SESSION_FOLDER_CONFLICT_ADD, ...CONFLICT_PREDICTION, ...CONFLICTED_MERGE_IN],
  'merge conflicted':             [
    ...withCallsReplaced(COMMITTED_STAGE_CALLS, CONFLICTED_WORKTREE_READS), ...SESSION_FOLDER_CONFLICT_ADD, ...CONFLICT_PREDICTION, ...RECORDED_FLOW_CONFLICT_RESOLUTION,
  ],
  'conflict resolved':                   [...COMMITTED_STAGE_CALLS, ...SESSION_FOLDER_CONFLICT_ADD, ...MERGED_IN_READS, ...RESOLUTION_READS, ...RESOLVED_FAST_FORWARD],
  'resolved branch landed':              [...COMMITTED_STAGE_CALLS, ...SESSION_FOLDER_CONFLICT_ADD, ...MERGED_IN_READS, ...RESOLUTION_READS],
  'line endings normalised':             [...MAIN_LINE_STANDING, ...ticketWorktreeAddTo('unnormalised worktree made')],
  'unnormalised worktree made':          WORKTREE_STANDING,
  'ticket branch checked out elsewhere': [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...WORKTREE_ADD_REFUSED],
  ...FOLDER_FLOW_STAGES,
};

export type RecordedFlowCommitStageName = CommitStageName;

/** The key a stage's recorded answer is stored under. */
export function recordedFlowCallShapeOf(stage: RecordedFlowStageName, place: RecordedFlowPlace, gitArguments: readonly string[]): string {
  return `flow stage "${stage}", in the ${place}: git ${gitArguments.join(' ')}`;
}
