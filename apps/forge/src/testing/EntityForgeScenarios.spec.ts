/**
 * The entity-forge fixture is whole and says what the step 3 and step 4 claims lean on. What matters: the recording answers every call
 * `EntityForgeScenarios` names at its place in each scenario, and a scenario replays through today's code; the pipeline passes the one
 * entity check in both its forms, is stored as version 4 and is read whole in both, the step 4 form the only one that whitelists the
 * package; one tracker at the root has no prefix while each home has its own; and each scenario's recorded change falls to the owners
 * its claims need: the shop alone, the shop and the admin app (E11), the admin app alone (E15), the shop with the package and a root file
 * (a crossing), and a delivered need on main.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { join }                       from 'node:path';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { PipelineFile }           from '../adapters/pipeline/PipelineFile.ts';
import { discoverRepositoryRoot } from '../lib/git/RepositoryRoot.ts';
import { EntityOwnershipUtil }    from '../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { EntityValidationUtil }   from '../lib/tracker-model/utils/EntityValidationUtil.ts';
import type { BoundaryRecording } from './BoundaryRecordings.ts';
import { recordingPathOf }        from './BoundaryRecordings.ts';
import {
  ENTITY_FORGE_ENTITIES,
  ENTITY_FORGE_TICKETS,
  type EntityForgeWhitelists,
  entityForgePipelineOf,
  entityForgePipelineTextOf,
  ticketWorktreeFolderOf
} from './EntityForgeFixture.ts';
import {
  ENTITY_FORGE_SCENARIO_COMMITS,
  ENTITY_FORGE_SCENARIOS,
  entityForgeCallsOf,
  type EntityForgeScenario
} from './EntityForgeScenarios.ts';
import { useRecordedGit }                                       from './RecordedGit.ts';
import { SCENARIO_REPOSITORY_PLACEHOLDER, scenarioCallShapeOf } from './RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory }       from './ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                            from './ToolGuard.ts';

const GIT_BOUNDARY = 'src/lib/git/GitProcess.ts';
const FORGE_ROOT = join(import.meta.dir, '..', '..');
const OBJECT_ID_LENGTH = 40;
const WHITELIST_FORMS: EntityForgeWhitelists[] = ['strict-isolation', 'shop-crosses-into-ui-kit'];
const {
  SHOP, ADMIN, UI_KIT, ROOT
} = ENTITY_FORGE_ENTITIES;
const { SHOP_TICKET } = ENTITY_FORGE_TICKETS;
const { enterScenario } = useRecordedGit();

let repositoryDirectory = '';
let recordedOutputs = new Map<string, string>();

beforeAll(() => {
  repositoryDirectory = createScratchDirectory('entity-forge-replay');
  const recording = JSON.parse(readFileSync(join(FORGE_ROOT, recordingPathOf(GIT_BOUNDARY, process.platform)), 'utf8')) as BoundaryRecording;
  recordedOutputs = new Map(recording.answers.map(({ callShape, answer }) => [callShape, (answer as { standardOutput: string }).standardOutput]));
});

afterAll(() => {
  removeScratchDirectory(repositoryDirectory);
});

/** A distinct example id for each commit the scenario names. */
function exampleCommitsOf(scenario: EntityForgeScenario): Record<string, string> {
  return Object.fromEntries(ENTITY_FORGE_SCENARIO_COMMITS[scenario].map((placeholder, i) => [placeholder, `${i + 1}`.repeat(OBJECT_ID_LENGTH)]));
}

/** The recorded output of a call at `folder` in `scenario`, its placeholders left in, or null when nothing is recorded. */
function recordedOutputOf(scenario: EntityForgeScenario, folder: string, gitArguments: readonly string[]): string | null {
  return recordedOutputs.get(scenarioCallShapeOf(scenario, join(SCENARIO_REPOSITORY_PLACEHOLDER, folder), gitArguments)) ?? null;
}

/** The owners of what the shop's ticket changed since the start, read from the recorded diff in its worktree. */
function ownersOfTheShopTicketChange(scenario: EntityForgeScenario): Record<string, string[]> {
  const changedSinceTheStart = recordedOutputOf(scenario, ticketWorktreeFolderOf(SHOP_TICKET), ['diff', '--name-only', '--no-renames', '-z', '<start>', 'HEAD', '--']) ?? '';
  const repositoryPaths = changedSinceTheStart.split('\0').filter((path) => path !== '').map((path) => `/${path}`);
  const entities = entityForgePipelineOf('strict-isolation').entities ?? {};
  return Object.fromEntries(EntityOwnershipUtil.pathsByOwnerOf(entities, repositoryPaths));
}

describe('the entity-forge pipeline', () => {
  test.each(WHITELIST_FORMS)('passes the entity check as "%s"', (whitelists) => {
    expect(EntityValidationUtil.refusalsOf(entityForgePipelineOf(whitelists).entities ?? {})).toEqual([]);
  });

  test.each(WHITELIST_FORMS)('is stored as version 4 with the four entities as "%s"', (whitelists) => {
    const stored = JSON.parse(entityForgePipelineTextOf(whitelists)) as { version: number; entities: Record<string, unknown> };
    expect(stored.version).toBe(4);
    expect(Object.keys(stored.entities)).toEqual([SHOP.key, ADMIN.key, UI_KIT.key, ROOT.key]);
  });

  test.each(WHITELIST_FORMS)('is read whole as "%s"', (whitelists) => {
    const reading = PipelineFile.documentReadingOf(JSON.parse(entityForgePipelineTextOf(whitelists)));
    expect(reading).toEqual({ verdict: 'readable', pipeline: entityForgePipelineOf(whitelists) });
  });

  test('whitelists the package for the shop only in the step 4 form', () => {
    expect(entityForgePipelineOf('strict-isolation').entities?.[SHOP.key]?.whitelist).toBeUndefined();
    expect(entityForgePipelineOf('shop-crosses-into-ui-kit').entities?.[SHOP.key]?.whitelist).toEqual([UI_KIT.key]);
  });

  test('gives both apps the package as a dependency, so a change of the package reaches their gates', () => {
    const entities = entityForgePipelineOf('strict-isolation').entities ?? {};
    expect(EntityOwnershipUtil.gatedEntitiesOf(entities, [`/${UI_KIT.homeFolder}/src/Example.ts`])).toEqual([SHOP.key, ADMIN.key, UI_KIT.key]);
  });
});

describeWhenGitIsRecorded('the entity-forge answer set', () => {
  test.each(Object.values(ENTITY_FORGE_SCENARIOS))('holds an answer to every call it names at each place of "%s"', (scenario) => {
    const unrecorded = entityForgeCallsOf(scenario).flatMap((place) => place.calls
      .map((call) => scenarioCallShapeOf(scenario, place.folder, call.gitArguments))
      .filter((callShape) => !recordedOutputs.has(callShape)));
    expect(unrecorded).toEqual([]);
  });

  test('replays a scenario through today\'s code: the main checkout is the repository root from a home in the shop ticket\'s worktree', () => {
    enterScenario(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_AT_HOME, { repositoryDirectory, commits: exampleCommitsOf(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_AT_HOME) });
    const discovery = discoverRepositoryRoot(join(repositoryDirectory, ticketWorktreeFolderOf(SHOP_TICKET), SHOP.homeFolder));
    expect(discovery).toEqual({ rootDirectory: realpathSync(repositoryDirectory), source: 'git' });
  });

  test('gives the main checkout no prefix and each home its own', () => {
    const prefixAt = (folder: string): string | null => recordedOutputOf(ENTITY_FORGE_SCENARIOS.AT_REST, folder, ['rev-parse', '--show-prefix']);
    expect(prefixAt('')).toBe('\n');
    for (const entity of [SHOP, ADMIN, UI_KIT]) expect(prefixAt(entity.homeFolder)).toBe(`${entity.homeFolder}/\n`);
  });

  test.each([
    [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_AT_HOME, [SHOP.key]],
    [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN, [SHOP.key, ADMIN.key]],
    [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_ADMIN, [ADMIN.key]],
    [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_UI_KIT, [SHOP.key, ROOT.key, UI_KIT.key]],
    [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_UI_KIT, [UI_KIT.key]],
    [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED, [SHOP.key, ROOT.key, UI_KIT.key]],
    [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_PACKAGE_RESHAPED, [SHOP.key, ROOT.key, UI_KIT.key]],
    [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_LOCKFILE_SEALED, [SHOP.key, ROOT.key, UI_KIT.key]],
    [ENTITY_FORGE_SCENARIOS.NEED_DELIVERED, [SHOP.key]],
  ] as const)('in "%s", the shop ticket\'s change is owned by %p', (scenario, owners) => {
    expect(Object.keys(ownersOfTheShopTicketChange(scenario)).sort()).toEqual([...owners].sort());
  });

  test('moves the main line to the need\'s ticket once it is delivered, and lists both tickets\' worktrees', () => {
    const scenario = ENTITY_FORGE_SCENARIOS.NEED_DELIVERED;
    expect(recordedOutputOf(scenario, '', ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'])).toBe('<need ticket tip>\n');
    const worktreeList = recordedOutputOf(scenario, '', ['worktree', 'list', '--porcelain']);
    expect(worktreeList).toContain('branch refs/heads/ticket-001\n');
    expect(worktreeList).toContain('branch refs/heads/ticket-002\n');
  });
});
