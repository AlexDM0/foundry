/**
 * The entity-forge answer set: each git state of the fixture repository in `src/testing/EntityForgeFixture.ts` as a scenario, and the calls
 * recorded in it at each place. A spec replays one through `useRecordedGit().enterScenario`, like any scenario of
 * `src/testing/RecordedGitScenarios.ts`; `bun run record src/lib/git/GitProcess.ts` records them. A call naming a commit the scenario does
 * not name is not one of its calls, and a ticket's places exist only in the scenarios that made its worktree.
 */
import { join } from 'node:path';

import { PRODUCT_NAMES }   from '../shared/constants/ProductNames.ts';
import {
  ENTITY_FORGE_MAIN_LINE,
  ENTITY_FORGE_TICKETS,
  entityForgePlaces,
  placeIsAToplevel,
  type EntityForgePlace,
  type EntityForgeTicket
} from './EntityForgeFixture.ts';
import type { GitHookPolicyName }          from './RecordedGitFlow.ts';
import { SCENARIO_REPOSITORY_PLACEHOLDER } from './RecordedGitScenarios.ts';

export const ENTITY_FORGE_SCENARIOS = {
  AT_REST:                 'a top-level forge over apps/shop, apps/admin and packages/ui-kit, main at <start>',
  SHOP_TICKET_AT_HOME:     'a top-level forge, ticket-001 of shop off <start>, apps/shop changed at <shop ticket tip>',
  SHOP_TICKET_INTO_ADMIN:  'a top-level forge, ticket-001 of shop off <start>, apps/shop and apps/admin changed at <shop ticket tip>',
  SHOP_TICKET_ONLY_ADMIN:  'a top-level forge, ticket-001 of shop off <start>, only apps/admin changed at <shop ticket tip>',
  NEED_DELIVERED:          'a top-level forge, ticket-001 of shop at <shop ticket tip>, main fast-forwarded to ticket-002 of admin at <need ticket tip>',
  SHOP_TICKET_INTO_UI_KIT: 'a top-level forge, ticket-001 of shop off <start>, apps/shop, packages/ui-kit and bun.lock changed at <shop ticket tip>',
} as const;

export type EntityForgeScenario = typeof ENTITY_FORGE_SCENARIOS[keyof typeof ENTITY_FORGE_SCENARIOS];

/** The commits each scenario names, which a replaying spec gives values to. */
export const ENTITY_FORGE_SCENARIO_COMMITS: Readonly<Record<EntityForgeScenario, readonly string[]>> = {
  [ENTITY_FORGE_SCENARIOS.AT_REST]:                 ['<start>'],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_AT_HOME]:     ['<start>', '<shop ticket tip>'],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN]:  ['<start>', '<shop ticket tip>'],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_ADMIN]:  ['<start>', '<shop ticket tip>'],
  [ENTITY_FORGE_SCENARIOS.NEED_DELIVERED]:          ['<start>', '<shop ticket tip>', '<need ticket tip>'],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_UI_KIT]: ['<start>', '<shop ticket tip>'],
};

/** The tickets whose worktree each scenario made. */
export const ENTITY_FORGE_SCENARIO_TICKETS: Readonly<Record<EntityForgeScenario, readonly EntityForgeTicket[]>> = {
  [ENTITY_FORGE_SCENARIOS.AT_REST]:                 [],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_AT_HOME]:     [ENTITY_FORGE_TICKETS.SHOP_TICKET],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN]:  [ENTITY_FORGE_TICKETS.SHOP_TICKET],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_ADMIN]:  [ENTITY_FORGE_TICKETS.SHOP_TICKET],
  [ENTITY_FORGE_SCENARIOS.NEED_DELIVERED]:          [ENTITY_FORGE_TICKETS.SHOP_TICKET, ENTITY_FORGE_TICKETS.NEED_TICKET],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_UI_KIT]: [ENTITY_FORGE_TICKETS.SHOP_TICKET],
};

export interface EntityForgeCall {
  readonly gitArguments: readonly string[];
  readonly hookPolicy?:  GitHookPolicyName;
}

/** What finds the tracker and its repository from any folder: the toplevel, the prefix and the common directory. */
const LOCATION_READS: readonly EntityForgeCall[] = [
  { gitArguments: ['rev-parse', '--show-toplevel'] },
  { gitArguments: ['rev-parse', '--show-prefix'] },
  { gitArguments: ['rev-parse', '--git-common-dir'] },
  { gitArguments: ['rev-parse', '--path-format=absolute', '--git-common-dir'] },
];

/** What the tracker reads at a toplevel only: refs, worktrees, the checkout's state and its hooks path. */
const TOPLEVEL_READS: readonly EntityForgeCall[] = [
  { gitArguments: ['worktree', 'list', '--porcelain'] },
  { gitArguments: ['for-each-ref', '--format=%(refname) %(objectname)'] },
  { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] },
  { gitArguments: ['status', '--porcelain=v1', '--untracked-files=no'] },
  { gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'] },
  { gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'] },
  { gitArguments: ['config', '--get', 'core.hooksPath'], hookPolicy: 'repository-hooks' },
];

/** What a ticket worktree's work is judged by: the paths changed since the start, by owner, and whether the main line is below it. */
const TICKET_WORK_READS: readonly EntityForgeCall[] = [
  { gitArguments: ['diff', '--name-only', '--no-renames', '-z', '<start>', 'HEAD', '--'] },
  { gitArguments: ['merge-base', '--is-ancestor', ENTITY_FORGE_MAIN_LINE, 'HEAD'] },
];

/**
 * What Customs asks a ticket worktree when it verifies a build of the ticket against the main line: the worktree's state, the commits since
 * the start with each one's message, and what the branch changed itself past the main line. Each ticket's branch holds one commit, its tip.
 */
const TICKET_CUSTOMS_READS: readonly EntityForgeCall[] = [
  { gitArguments: ['status', '--porcelain=v1', '--untracked-files=all'] },
  { gitArguments: ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames'] },
  { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'] },
  { gitArguments: ['ls-files', '-u'] },
  { gitArguments: ['merge-base', '--is-ancestor', '<start>', 'HEAD'] },
  { gitArguments: ['merge-base', ENTITY_FORGE_MAIN_LINE, 'HEAD'] },
  { gitArguments: ['log', '--name-only', '--no-renames', '-z', '--format=', '<start>..HEAD', '--'] },
  { gitArguments: ['log', '--name-only', '--no-renames', '--format=', '<start>..HEAD', `^${ENTITY_FORGE_MAIN_LINE}`, '--'] },
  { gitArguments: ['diff', '--name-only', '--no-renames', '<start>', 'HEAD', '--'] },
  { gitArguments: ['rev-list', '<start>..HEAD'] },
  { gitArguments: ['rev-list', '--merges', '<start>..HEAD'] },
  { gitArguments: ['rev-list', '--merges', '--reverse', '<start>..HEAD'] },
  { gitArguments: ['log', '-1', '--format=%B', '<shop ticket tip>'] },
  { gitArguments: ['log', '-1', '--format=%B', '<need ticket tip>'] },
];

/** What a landing asks at the main checkout: the paths a fast-forward to each ticket would change, and whether it is one. */
const LANDING_READS: readonly EntityForgeCall[] = ['<shop ticket tip>', '<need ticket tip>'].flatMap((ticketTip) => [
  { gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', ticketTip, '--'] },
  { gitArguments: ['merge-base', '--is-ancestor', ENTITY_FORGE_MAIN_LINE, ticketTip] },
]);

/** What the main checkout asks about the tracker's own ignored folders, cwd-relative as `GitIgnore` asks. */
const TRACKER_IGNORE_READS: readonly EntityForgeCall[] = [
  { gitArguments: ['check-ignore', '-q', PRODUCT_NAMES.DATA_FOLDER] },
  { gitArguments: ['check-ignore', '-q', PRODUCT_NAMES.WORKTREES_FOLDER] },
];

function callsAt(place: EntityForgePlace): readonly EntityForgeCall[] {
  return [
    ...LOCATION_READS,
    ...(placeIsAToplevel(place) ? TOPLEVEL_READS : []),
    ...(place.kind === 'ticket worktree' ? [...TICKET_WORK_READS, ...TICKET_CUSTOMS_READS] : []),
    ...(place.kind === 'main checkout' ? [...LANDING_READS, ...TRACKER_IGNORE_READS] : []),
  ];
}

/** A folder below the repository with the calls asked there, the folder written with the repository placeholder. */
export interface EntityForgePlaceCalls {
  readonly folder: string;
  readonly calls:  readonly EntityForgeCall[];
}

const PLACEHOLDER_PATTERN = /<[^<>]+>/g;

function namesOnlyCommitsOf(scenario: EntityForgeScenario, call: EntityForgeCall): boolean {
  return call.gitArguments.flatMap((argument) => argument.match(PLACEHOLDER_PATTERN) ?? [])
    .every((placeholder) => ENTITY_FORGE_SCENARIO_COMMITS[scenario].includes(placeholder));
}

/** Each place that exists in `scenario`, and its calls that name only the scenario's commits. */
export function entityForgeCallsOf(scenario: EntityForgeScenario): readonly EntityForgePlaceCalls[] {
  const madeTickets = ENTITY_FORGE_SCENARIO_TICKETS[scenario];
  return entityForgePlaces()
    .filter((place) => place.ticket === null || madeTickets.includes(place.ticket))
    .map((place) => ({
      folder: join(SCENARIO_REPOSITORY_PLACEHOLDER, place.folder),
      calls:  callsAt(place).filter((call) => namesOnlyCommitsOf(scenario, call)),
    }));
}
