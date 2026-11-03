/**
 * The stages of a ticket's flow through git, each one answer set: the calls the Overseer makes while the repository stands in that stage,
 * with the place each is asked in. `src/lib/git/RecordedGitAnswers.integration.spec.ts` walks a real repository through the stages and
 * records every answer; `src/testing/RecordedGit.ts` answers a default spec's calls from the stage it is in, in any order and as often as asked.
 * A recorded answer holds placeholders for the repository folder and the commit and tree ids, which a replay fills with fixed example ids.
 */
import { join } from 'node:path';

import { PRODUCT_NAMES } from '../shared/constants/ProductNames.ts';

export const RECORDED_FLOW_MAIN_LINE = 'master';
export const RECORDED_FLOW_TICKET_BRANCH = 'ticket-001';
/** The `.gitignore` of the recorded repository, as `init` writes it: the data folder and the worktrees folder ignored. */
export const RECORDED_FLOW_IGNORE_FILE_TEXT = `${PRODUCT_NAMES.DATA_FOLDER}/\n${PRODUCT_NAMES.WORKTREES_FOLDER}/\n`;

export const RECORDED_FLOW_PLACEHOLDERS = {
  REPOSITORY:  '<repository>',
  MAIN_TIP:    '<main tip>',
  MAIN_TREE:   '<main tree>',
  TICKET_TIP:  '<ticket tip>',
  TICKET_TREE: '<ticket tree>',
} as const;

type FlowPlaceholder = typeof RECORDED_FLOW_PLACEHOLDERS[keyof typeof RECORDED_FLOW_PLACEHOLDERS];
type ObjectPlaceholder = Exclude<FlowPlaceholder, typeof RECORDED_FLOW_PLACEHOLDERS.REPOSITORY>;

/** The ids a replay gives each recorded commit and tree; any 40 hexadecimal digits read as an object id. */
export const REPLAYED_OBJECT_IDS: Readonly<Record<ObjectPlaceholder, string>> = {
  [RECORDED_FLOW_PLACEHOLDERS.MAIN_TIP]:    '1'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.MAIN_TREE]:   '2'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.TICKET_TIP]:  '3'.repeat(40),
  [RECORDED_FLOW_PLACEHOLDERS.TICKET_TREE]: '4'.repeat(40),
};

export const RECORDED_FLOW_PLACES = {
  MAIN_CHECKOUT:       'main checkout',
  SESSION_FOLDER:      'session folder',
  TICKET_WORKTREE:     'ticket worktree',
  ONBOARDING_WORKTREE: 'onboarding worktree',
} as const;

export type RecordedFlowPlace = typeof RECORDED_FLOW_PLACES[keyof typeof RECORDED_FLOW_PLACES];

const WORKTREES = join(RECORDED_FLOW_PLACEHOLDERS.REPOSITORY, PRODUCT_NAMES.WORKTREES_FOLDER);
const TICKET_WORKTREE_FOLDER = join(WORKTREES, RECORDED_FLOW_TICKET_BRANCH);
const ONBOARDING_WORKTREE_FOLDER = join(WORKTREES, 'onboard', 'J1');

/** Each place's folder below the repository, longest first, so a folder is the place of the deepest one it lies in. */
export const RECORDED_FLOW_PLACE_FOLDERS: readonly (readonly [RecordedFlowPlace, string])[] = [
  [RECORDED_FLOW_PLACES.TICKET_WORKTREE, TICKET_WORKTREE_FOLDER],
  [RECORDED_FLOW_PLACES.ONBOARDING_WORKTREE, ONBOARDING_WORKTREE_FOLDER],
  [RECORDED_FLOW_PLACES.SESSION_FOLDER, join(WORKTREES, 'sessions')],
  [RECORDED_FLOW_PLACES.MAIN_CHECKOUT, RECORDED_FLOW_PLACEHOLDERS.REPOSITORY],
];

export type GitHookPolicyName = 'hooks-off' | 'repository-hooks';

export type RecordedFlowStageName =
  | 'tracker ready'
  | 'onboarding worktree made'
  | 'worktree made'
  | 'tree changed'
  | 'tree changed with trailer'
  | 'agent config changed'
  | 'branch merged';

/**
 * One call of a stage. `nextStage` is the stage its answer leaves the repository in, and `leavesFolder` the folder git makes for it, which a
 * replay makes too; `exitCode` is the one recorded, 0 unless named.
 */
export interface RecordedFlowCall {
  readonly place:         RecordedFlowPlace;
  readonly gitArguments:  readonly string[];
  readonly exitCode?:     number;
  readonly hookPolicy?:   GitHookPolicyName;
  readonly nextStage?:    RecordedFlowStageName;
  readonly leavesFolder?: string;
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
  { gitArguments: resolved('main'), exitCode: NEGATIVE },
  { gitArguments: ['show', `${RECORDED_FLOW_MAIN_LINE}:CLAUDE.md`], exitCode: FATAL },
  { gitArguments: ['show', 'main:CLAUDE.md'], exitCode: FATAL },
  ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
  ['worktree', 'list', '--porcelain'],
  ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
]);

const SESSION_FOLDER_READS = callsIn(RECORDED_FLOW_PLACES.SESSION_FOLDER, [
  ['rev-parse', '--absolute-git-dir'],
  resolved('HEAD'),
]);

const TICKET_BRANCH_MISSING = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{ gitArguments: resolved(`refs/heads/${RECORDED_FLOW_TICKET_BRANCH}`), exitCode: NEGATIVE }]);
const TICKET_BRANCH_PRESENT = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [resolved(`refs/heads/${RECORDED_FLOW_TICKET_BRANCH}`)]);

const TICKET_WORKTREE_READS = callsIn(RECORDED_FLOW_PLACES.TICKET_WORKTREE, [
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'],
  ['rev-parse', '--absolute-git-dir'],
  { gitArguments: ['config', '--get', 'core.hooksPath'], exitCode: NEGATIVE, hookPolicy: 'repository-hooks' },
  ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames'],
  ['status', '--porcelain=v1', '--untracked-files=all'],
  ['diff', '--no-ext-diff', 'HEAD', '--'],
  ['merge-base', RECORDED_FLOW_MAIN_LINE, 'HEAD'],
  ['merge-base', '--is-ancestor', MAIN_TIP, 'HEAD'],
  ['log', '--name-only', '--no-renames', '--format=', `${MAIN_TIP}..HEAD`, '--'],
  ['diff', '--name-only', '--no-renames', MAIN_TIP, 'HEAD', '--'],
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
]);

const LANDING_READS = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [
  ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', RECORDED_FLOW_MAIN_LINE, RECORDED_FLOW_TICKET_BRANCH],
  ['diff', '--name-only', '--no-renames', '-z', 'HEAD', TICKET_TIP, '--'],
]);

const ONBOARDING_WORKTREE_READS = callsIn(RECORDED_FLOW_PLACES.ONBOARDING_WORKTREE, [
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  { gitArguments: ['config', '--get', 'core.hooksPath'], exitCode: NEGATIVE, hookPolicy: 'repository-hooks' },
  resolved('HEAD'),
  ['for-each-ref', '--format=%(refname) %(objectname)'],
  ['worktree', 'list', '--porcelain'],
  ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'],
]);

const TICKET_WORKTREE_ADD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
  gitArguments: ['worktree', 'add', '-b', RECORDED_FLOW_TICKET_BRANCH, TICKET_WORKTREE_FOLDER, RECORDED_FLOW_MAIN_LINE],
  nextStage:    'worktree made',
  leavesFolder: TICKET_WORKTREE_FOLDER,
}]);

const ONBOARDING_WORKTREE_ADD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{
  gitArguments: ['worktree', 'add', '--detach', ONBOARDING_WORKTREE_FOLDER, RECORDED_FLOW_MAIN_LINE],
  nextStage:    'onboarding worktree made',
  leavesFolder: ONBOARDING_WORKTREE_FOLDER,
}]);

const FAST_FORWARD = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [{ gitArguments: ['merge', '--ff-only', '--quiet', TICKET_TIP], nextStage: 'branch merged' }]);

/** A stage of the session's commit, entered by the spec when the session commits, since the fake session makes no git call. */
export const RECORDED_FLOW_COMMITS = {
  'tree changed':              { path: 'built.txt', message: 'Build the example' },
  'tree changed with trailer': { path: 'built.txt', message: 'Build the example\n\nCo-Authored-By: Claude <noreply@example.com>' },
  'agent config changed':      { path: '.claude/settings.json', message: 'Build the example' },
} as const;

type CommitStageName = keyof typeof RECORDED_FLOW_COMMITS;

const COMMITTED_STAGE_CALLS = [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...TICKET_WORKTREE_READS, ...TICKET_COMMIT_READS];

export const RECORDED_FLOW_STAGES: Readonly<Record<RecordedFlowStageName, readonly RecordedFlowCall[]>> = {
  'tracker ready':             [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_MISSING, ...ONBOARDING_WORKTREE_ADD, ...TICKET_WORKTREE_ADD],
  'onboarding worktree made':  [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_MISSING, ...ONBOARDING_WORKTREE_READS],
  'worktree made':             [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...TICKET_WORKTREE_READS],
  'tree changed':              [...COMMITTED_STAGE_CALLS, ...LANDING_READS, ...FAST_FORWARD],
  'tree changed with trailer': COMMITTED_STAGE_CALLS,
  'agent config changed':      COMMITTED_STAGE_CALLS,
  'branch merged':             [...MAIN_CHECKOUT_READS, ...SESSION_FOLDER_READS, ...TICKET_BRANCH_PRESENT, ...TICKET_WORKTREE_READS, ...TICKET_COMMIT_READS],
};

export type RecordedFlowCommitStageName = CommitStageName;

/** The key a stage's recorded answer is stored under. */
export function recordedFlowCallShapeOf(stage: RecordedFlowStageName, place: RecordedFlowPlace, gitArguments: readonly string[]): string {
  return `flow stage "${stage}", in the ${place}: git ${gitArguments.join(' ')}`;
}
