/**
 * The two-tracker answer set: each git state of `src/testing/TwoTrackerFixture.ts`'s repository as a scenario, with the calls recorded at
 * each place, replayed through `useRecordedGit().enterScenario` and recorded by `bun run record src/lib/git/GitProcess.ts`. A call naming a
 * commit the scenario does not name is not one of its calls.
 */
import { join } from 'node:path';

import { PRODUCT_NAMES }                   from '../shared/constants/ProductNames.ts';
import type { GitHookPolicyName }          from './RecordedGitFlow.ts';
import { SCENARIO_REPOSITORY_PLACEHOLDER } from './RecordedGitScenarios.ts';
import {
  placeIsAToplevel,
  placeIsMadeWithTheTickets,
  TWO_TRACKER_MAIN_LINE,
  twoTrackerPlaces,
  type TwoTrackerPlace
} from './TwoTrackerFixture.ts';

export const TWO_TRACKER_SCENARIOS = {
  AT_REST:                    'two trackers in apps/forge and apps/gaia, main at <start>, the person checkout on person at <start>',
  TICKETS_BUILT:              'two trackers off <start>, forge/ticket-001 on apps/forge and the shared package at <forge ticket tip>, gaia/ticket-001 at <gaia ticket tip>',
  SIBLING_LANDED:             'two trackers, the tickets built, main fast-forwarded to gaia\'s ticket at <gaia ticket tip>',
  PERSON_AND_SIBLING_AT_WORK: 'two trackers, main at <start>, apps/gaia changed in the main checkout, <person tip> on person, a stash at <stash>, example-tag at <start>',
} as const;

export type TwoTrackerScenario = typeof TWO_TRACKER_SCENARIOS[keyof typeof TWO_TRACKER_SCENARIOS];

/** The commits each scenario names, which a replaying spec gives values to. */
export const TWO_TRACKER_SCENARIO_COMMITS: Readonly<Record<TwoTrackerScenario, readonly string[]>> = {
  [TWO_TRACKER_SCENARIOS.AT_REST]:                    ['<start>'],
  [TWO_TRACKER_SCENARIOS.TICKETS_BUILT]:              ['<start>', '<forge ticket tip>', '<gaia ticket tip>'],
  [TWO_TRACKER_SCENARIOS.SIBLING_LANDED]:             ['<start>', '<forge ticket tip>', '<gaia ticket tip>'],
  [TWO_TRACKER_SCENARIOS.PERSON_AND_SIBLING_AT_WORK]: ['<start>', '<person tip>', '<stash>'],
};

export interface TwoTrackerCall {
  readonly gitArguments: readonly string[];
  readonly hookPolicy?:  GitHookPolicyName;
}

/** What finds a tracker and its repository from any folder: the toplevel, the prefix and the common directory. */
const LOCATION_READS: readonly TwoTrackerCall[] = [
  { gitArguments: ['rev-parse', '--show-toplevel'] },
  { gitArguments: ['rev-parse', '--show-prefix'] },
  { gitArguments: ['rev-parse', '--git-common-dir'] },
  { gitArguments: ['rev-parse', '--path-format=absolute', '--git-common-dir'] },
];

/** What a tracker reads at a toplevel only: refs, worktrees, the checkout's state and its hooks path. */
const TOPLEVEL_READS: readonly TwoTrackerCall[] = [
  { gitArguments: ['worktree', 'list', '--porcelain'] },
  { gitArguments: ['for-each-ref', '--format=%(refname) %(objectname)'] },
  { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] },
  { gitArguments: ['status', '--porcelain=v1', '--untracked-files=no'] },
  { gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'] },
  { gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'] },
  { gitArguments: ['config', '--get', 'core.hooksPath'], hookPolicy: 'repository-hooks' },
];

/** What a ticket worktree's work is judged by: the paths changed since the start, and whether the main line is below it. */
const TICKET_WORK_READS: readonly TwoTrackerCall[] = [
  { gitArguments: ['diff', '--name-only', '--no-renames', '-z', '<start>', 'HEAD', '--'] },
  { gitArguments: ['merge-base', '--is-ancestor', TWO_TRACKER_MAIN_LINE, 'HEAD'] },
];

/** What a landing asks at the main checkout: the paths a fast-forward to each ticket would change, and whether it is one. */
const LANDING_READS: readonly TwoTrackerCall[] = ['<forge ticket tip>', '<gaia ticket tip>'].flatMap((ticketTip) => [
  { gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', ticketTip, '--'] },
  { gitArguments: ['merge-base', '--is-ancestor', TWO_TRACKER_MAIN_LINE, ticketTip] },
]);

/** What a project folder asks about its own ignored folders, cwd-relative as `GitIgnore` asks. */
const PROJECT_IGNORE_READS: readonly TwoTrackerCall[] = [
  { gitArguments: ['check-ignore', '-q', PRODUCT_NAMES.DATA_FOLDER] },
  { gitArguments: ['check-ignore', '-q', PRODUCT_NAMES.WORKTREES_FOLDER] },
];

function callsAt(place: TwoTrackerPlace): readonly TwoTrackerCall[] {
  return [
    ...LOCATION_READS,
    ...(placeIsAToplevel(place) ? TOPLEVEL_READS : []),
    ...(place.kind === 'ticket worktree' ? TICKET_WORK_READS : []),
    ...(place.kind === 'main checkout' ? LANDING_READS : []),
    ...(place.kind === 'project' ? PROJECT_IGNORE_READS : []),
  ];
}

/** A folder below the repository with the calls asked there, the folder written with the repository placeholder. */
export interface TwoTrackerPlaceCalls {
  readonly folder: string;
  readonly calls:  readonly TwoTrackerCall[];
}

const PLACEHOLDER_PATTERN = /<[^<>]+>/g;

function namesOnlyCommitsOf(scenario: TwoTrackerScenario, call: TwoTrackerCall): boolean {
  return call.gitArguments.flatMap((argument) => argument.match(PLACEHOLDER_PATTERN) ?? [])
    .every((placeholder) => TWO_TRACKER_SCENARIO_COMMITS[scenario].includes(placeholder));
}

/** Each place that exists in `scenario`, and its calls that name only the scenario's commits. */
export function twoTrackerCallsOf(scenario: TwoTrackerScenario): readonly TwoTrackerPlaceCalls[] {
  const ticketsAreMade = scenario === TWO_TRACKER_SCENARIOS.TICKETS_BUILT || scenario === TWO_TRACKER_SCENARIOS.SIBLING_LANDED;
  return twoTrackerPlaces()
    .filter((place) => ticketsAreMade || !placeIsMadeWithTheTickets(place))
    .map((place) => ({
      folder: join(SCENARIO_REPOSITORY_PLACEHOLDER, place.folder),
      calls:  callsAt(place).filter((call) => namesOnlyCommitsOf(scenario, call)),
    }));
}
