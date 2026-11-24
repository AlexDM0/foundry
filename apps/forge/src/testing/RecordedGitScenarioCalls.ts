/**
 * The git calls each scenario of `src/testing/RecordedGitScenarios.ts` is recorded with, as data: the calls the Customs checks and a review
 * pass make. `src/lib/git/RecordedGitScenarios.integration.spec.ts` builds each scenario's state with real git and runs these calls in it, so
 * real git runs only inside the git boundary. A call that names a placeholder the scenario does not name is not run.
 */
import { join } from 'node:path';

import { LIFECYCLE_LIMITS }                from '../shared/constants/LifecycleLimits.ts';
import { PRODUCT_NAMES }                   from '../shared/constants/ProductNames.ts';
import type { GitHookPolicyName }          from './RecordedGitFlow.ts';
import { SCENARIO_REPOSITORY_PLACEHOLDER } from './RecordedGitScenarios.ts';

/** In a call made for each object another call prints, the place of that object's id. */
export const SCENARIO_PRINTED_OBJECT_PLACEHOLDER = '<printed object>';
export const SCENARIO_MAIN_LINE = 'main';
/** The data folder a scenario commits, which the Customs checks refuse. */
export const SCENARIO_DATA_FOLDER = PRODUCT_NAMES.DATA_FOLDER;
/** More code lines than a review pass may rework before it asks for a second review. */
export const SCENARIO_MANY_CODE_LINES_COUNT = LIFECYCLE_LIMITS.REWORK_ROUND_THRESHOLD_LINES + 50;

export interface RecordedScenarioCall {
  readonly gitArguments:            readonly string[];
  readonly hookPolicy?:             GitHookPolicyName;
  /** Runs the call once for each line of this call's output that opens with an object id, that id in its printed-object placeholder. */
  readonly forEachObjectPrintedBy?: readonly string[];
  /** The placeholder of the commit this call makes, which every answer of the scenario names. */
  readonly namesCommitMade?:        string;
}

/** The calls of a scenario, in order, and the folder they are asked in. */
export interface RecordedScenarioCalls {
  readonly folder: string;
  readonly calls:  readonly RecordedScenarioCall[];
}

const PRINTED = SCENARIO_PRINTED_OBJECT_PLACEHOLDER;

function resolved(revision: string): string[] {
  return ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`];
}

/** Every commit name a Customs scenario gives, each read as the start of the work. */
const CUSTOMS_WORK_STARTS = ['<start>', '<head>', '<rewritten>', '<honest start>', '<feature>', '<own tip>', '<landed>', '<moved>'];
/** The targets a merge scenario is checked against. */
const CUSTOMS_MERGE_TARGETS = ['<target tip>', '<start>'];

const CUSTOMS_STATE_READS: readonly RecordedScenarioCall[] = [
  { gitArguments: ['config', '--get', 'core.hooksPath'], hookPolicy: 'repository-hooks' },
  { gitArguments: ['for-each-ref', '--format=%(refname) %(objectname)'] },
  { gitArguments: ['rev-parse', '--path-format=absolute', '--git-common-dir'] },
  { gitArguments: resolved('HEAD') },
  { gitArguments: ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames'] },
  { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'] },
  { gitArguments: ['status', '--porcelain=v1', '--untracked-files=all'] },
  { gitArguments: ['worktree', 'list', '--porcelain'] },
  { gitArguments: ['merge-base', SCENARIO_MAIN_LINE, 'HEAD'] },
  { gitArguments: ['ls-files', '-u'] },
];

function workReadsFrom(workStart: string): RecordedScenarioCall[] {
  return [
    { gitArguments: ['diff', '--name-only', '--no-renames', '-z', workStart, 'HEAD', '--'] },
    { gitArguments: ['log', '--name-only', '--no-renames', '-z', '--format=', `${workStart}..HEAD`, '--'] },
    { gitArguments: ['merge-base', '--is-ancestor', workStart, 'HEAD'] },
    { gitArguments: ['rev-list', `${workStart}..HEAD`] },
    { gitArguments: ['log', '-1', '--format=%B', PRINTED], forEachObjectPrintedBy: ['rev-list', `${workStart}..HEAD`] },
  ];
}

function mergeReadsAgainst(target: string): RecordedScenarioCall[] {
  const branchCommits = ['<branch tip>..HEAD', `^${target}`];
  const mergeTree = ['merge-tree', '--write-tree', '--no-messages', '<branch tip>', target];
  return [
    { gitArguments: ['log', '--name-only', '--no-renames', '-z', '--format=', ...branchCommits, '--'] },
    { gitArguments: mergeTree },
    { gitArguments: ['diff', '--name-only', '--no-renames', '-z', PRINTED, 'HEAD', '--'], forEachObjectPrintedBy: mergeTree },
    { gitArguments: ['rev-list', ...branchCommits] },
    { gitArguments: ['rev-list', '--merges', ...branchCommits] },
    { gitArguments: ['rev-list', '--merges', '--reverse', ...branchCommits] },
    { gitArguments: ['log', '-1', '--format=%B', PRINTED], forEachObjectPrintedBy: ['rev-list', ...branchCommits] },
    { gitArguments: ['rev-list', '--parents', '-n', '1', PRINTED], forEachObjectPrintedBy: ['rev-list', '--merges', ...branchCommits] },
  ];
}

const CUSTOMS_CALLS: readonly RecordedScenarioCall[] = [
  ...CUSTOMS_STATE_READS,
  ...CUSTOMS_WORK_STARTS.flatMap(workReadsFrom),
  { gitArguments: ['merge-base', '--is-ancestor', '<branch tip>', 'HEAD'] },
  ...CUSTOMS_MERGE_TARGETS.flatMap(mergeReadsAgainst),
];

/** What the Customs checks ask a worktree of the repository: its state, the work since each named commit, and a merge against each target. */
export const CUSTOMS_SCENARIO_CALLS: RecordedScenarioCalls = { folder: SCENARIO_REPOSITORY_PLACEHOLDER, calls: CUSTOMS_CALLS };

/** The same, and what V11 asks of a branch that merged the main line in: its own commits past main, and its change against `<main tip>`. */
export const CUSTOMS_MAIN_MERGE_SCENARIO_CALLS: RecordedScenarioCalls = {
  folder: SCENARIO_REPOSITORY_PLACEHOLDER,
  calls:  [
    ...CUSTOMS_CALLS,
    { gitArguments: ['log', '--name-only', '--no-renames', '--format=', '<start>..HEAD', `^${SCENARIO_MAIN_LINE}`, '--'] },
    { gitArguments: ['diff', '--name-only', '--no-renames', '<main tip>', 'HEAD', '--'] },
  ],
};

/** The folder of a pipeline agent's detached snapshot, inside the repository, which a spec takes as its worktrees root: setup S1's. */
export const PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME = join('pipeline-agent', 'S1');

/** The same calls, asked in the pipeline agent's snapshot. */
export const PIPELINE_AGENT_SCENARIO_CALLS: RecordedScenarioCalls = {
  folder: join(SCENARIO_REPOSITORY_PLACEHOLDER, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME),
  calls:  CUSTOMS_CALLS,
};

/** The folder of ticket 004's detached document agent snapshot, inside the repository, which a spec takes as its worktrees root. */
export const DOCUMENT_AGENT_SNAPSHOT_FOLDER_NAME = join('document-agent', '004');

/** The same calls, asked in the document agent's snapshot. */
export const DOCUMENT_AGENT_SCENARIO_CALLS: RecordedScenarioCalls = {
  folder: join(SCENARIO_REPOSITORY_PLACEHOLDER, DOCUMENT_AGENT_SNAPSHOT_FOLDER_NAME),
  calls:  CUSTOMS_CALLS,
};

function reviewPassReads(reviewStart: string, reviewHead: string): RecordedScenarioCall[] {
  const range = `${reviewStart}..${reviewHead}`;
  return [
    { gitArguments: resolved(reviewStart) },
    { gitArguments: resolved('HEAD') },
    { gitArguments: ['diff', '--shortstat', '--no-color', '--no-ext-diff', '--no-textconv', '--no-relative', '--find-renames', `${SCENARIO_MAIN_LINE}...${reviewStart}`] },
    {
      gitArguments: [
        'log',
        '--patch',
        '--format=',
        '--no-show-signature',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--no-relative',
        '--submodule=short',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        '--find-renames',
        '--diff-algorithm=myers',
        '--indent-heuristic',
        '--unified=25',
        range,
      ],
    },
    { gitArguments: ['merge-base', '--is-ancestor', reviewStart, reviewHead] },
    { gitArguments: ['rev-list', '--merges', range] },
    { gitArguments: ['rev-list', '--reverse', range] },
  ];
}

/** What a review pass asks when the reviewer committed: its start, its head, and the rework between them. */
export function reviewPassScenarioCalls(reviewStart: string, reviewHead: string): RecordedScenarioCalls {
  return { folder: SCENARIO_REPOSITORY_PLACEHOLDER, calls: reviewPassReads(reviewStart, reviewHead) };
}

/** The commit code makes for a first-round pass on ticket 001 that changed nothing, then what the pass asks up to it. */
export const REVIEW_PASS_WITHOUT_CHANGES_CALLS: RecordedScenarioCalls = {
  folder: SCENARIO_REPOSITORY_PLACEHOLDER,
  calls:  [
    { gitArguments: ['commit', '--allow-empty', '--no-verify', '-q', '-m', 'Review round 1 of #001: no changes'], namesCommitMade: '<committed>' },
    ...reviewPassReads('<review start>', '<committed>'),
  ],
};
