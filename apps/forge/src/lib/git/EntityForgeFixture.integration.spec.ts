/**
 * Records the entity-forge answer set: builds each git state of the fixture repository of `src/testing/EntityForgeFixture.ts` with real
 * git, and at each of its places runs the calls `src/testing/EntityForgeScenarios.ts` names, so a default spec replays a top-level forge
 * over two apps and a shared package without real git. `bun run record src/lib/git/GitProcess.ts` runs this spec and writes the answers.
 */
import { realpathSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import {
  ENTITY_FORGE_ENTITIES,
  ENTITY_FORGE_HOOKS_FOLDER,
  ENTITY_FORGE_LOCK_FILE,
  ENTITY_FORGE_MAIN_LINE,
  ENTITY_FORGE_TICKETS,
  type EntityForgeTicket,
  sourceFileOf,
  ticketBranchOf,
  ticketWorktreeFolderOf,
  writeEntityForgeFiles
} from '../../testing/EntityForgeFixture.ts';
import {
  ENTITY_FORGE_SCENARIO_COMMITS,
  ENTITY_FORGE_SCENARIOS,
  entityForgeCallsOf,
  type EntityForgeScenario
} from '../../testing/EntityForgeScenarios.ts';
import { recordAnswer } from '../../testing/RecordedAnswers.ts';
import {
  scenarioCallShapeOf,
  scenarioReplacementsOf,
  withScenarioPlaceholders,
  withScenarioValues
} from '../../testing/RecordedGitScenarios.ts';
import {
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import { GitProcess }               from './GitProcess.ts';

const { SHOP, ADMIN, UI_KIT } = ENTITY_FORGE_ENTITIES;
const { SHOP_TICKET, NEED_TICKET } = ENTITY_FORGE_TICKETS;
const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function commitAll(directory: string, message: string): string {
  gitOutputIn(directory, ['add', '--all']);
  gitOutputIn(directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', message]);
  return gitOutputIn(directory, ['rev-parse', 'HEAD']);
}

/** The main line at its start with every tracked file and the hooks path set. */
function fixtureRepository(): { directory: string; startCommit: string } {
  const directory = realpathSync(createScratchGitRepository('entity-forge'));
  scratchDirectories.push(directory);
  gitOutputIn(directory, ['branch', '-m', ENTITY_FORGE_MAIN_LINE]);
  writeEntityForgeFiles(directory);
  const startCommit = commitAll(directory, 'Add the example workspace');
  gitOutputIn(directory, ['config', 'core.hooksPath', ENTITY_FORGE_HOOKS_FOLDER]);
  return { directory, startCommit };
}

function ticketBuiltIn(directory: string, startCommit: string, ticket: EntityForgeTicket, changedPaths: readonly string[]): string {
  const worktreeDirectory = join(directory, ticketWorktreeFolderOf(ticket));
  gitOutputIn(directory, ['worktree', 'add', '-q', '-b', ticketBranchOf(ticket), worktreeDirectory, startCommit]);
  for (const path of changedPaths) writeFileSync(join(worktreeDirectory, path), `export const changedByTicket${ticket.id} = 2;\n`);
  return commitAll(worktreeDirectory, `Change ${ticket.entity.homeFolder} for ticket ${ticket.id}`);
}

function shopTicketChanging(changedPaths: readonly string[]): (directory: string, startCommit: string) => Record<string, string> {
  return (directory, startCommit) => ({ '<shop ticket tip>': ticketBuiltIn(directory, startCommit, SHOP_TICKET, changedPaths) });
}

/** The shop's ticket kept only its own change; the need's ticket for the admin app landed on main by a fast-forward. */
function needDeliveredIn(directory: string, startCommit: string): Record<string, string> {
  const shopTicketTip = ticketBuiltIn(directory, startCommit, SHOP_TICKET, [sourceFileOf(SHOP)]);
  const needTicketTip = ticketBuiltIn(directory, startCommit, NEED_TICKET, [sourceFileOf(ADMIN)]);
  gitOutputIn(directory, ['merge', '--ff-only', '-q', ticketBranchOf(NEED_TICKET)]);
  return { '<shop ticket tip>': shopTicketTip, '<need ticket tip>': needTicketTip };
}

/** The shop's ticket crossed into the package, then a later stage of it changed `changedPaths` in one more commit. */
function crossedThenChanging(changedPaths: readonly string[]): (directory: string, startCommit: string) => Record<string, string> {
  return (directory, startCommit) => {
    const shopTicketTip = ticketBuiltIn(directory, startCommit, SHOP_TICKET, [sourceFileOf(SHOP), sourceFileOf(UI_KIT), ENTITY_FORGE_LOCK_FILE]);
    const worktreeDirectory = join(directory, ticketWorktreeFolderOf(SHOP_TICKET));
    for (const path of changedPaths) writeFileSync(join(worktreeDirectory, path), 'export const changedByALaterStage = 3;\n');
    return { '<shop ticket tip>': shopTicketTip, '<stage tip>': commitAll(worktreeDirectory, 'Change ticket 001 in a later stage') };
  };
}

/** The shop's ticket crossed into the package and the package build reshaped it, then `adapt` changed the shop, and the home review too. */
function reshapedThenAdapted(homeReviewFixes: boolean): (directory: string, startCommit: string) => Record<string, string> {
  return (directory, startCommit) => {
    const reshaped = crossedThenChanging([sourceFileOf(UI_KIT)])(directory, startCommit);
    const worktreeDirectory = join(directory, ticketWorktreeFolderOf(SHOP_TICKET));
    writeFileSync(join(worktreeDirectory, sourceFileOf(SHOP)), 'export const changedByAdapt = 4;\n');
    const adapted = { ...reshaped, '<adapt tip>': commitAll(worktreeDirectory, 'Adapt the shop to the package for ticket 001') };
    if (!homeReviewFixes) return adapted;
    writeFileSync(join(worktreeDirectory, sourceFileOf(SHOP)), 'export const changedByTheHomeReview = 5;\n');
    return { ...adapted, '<home review tip>': commitAll(worktreeDirectory, 'Fix the shop in the review of ticket 001') };
  };
}

/** Each scenario and how it changes the fixture repository, naming the commits beside the start. */
const SCENARIO_STATES: readonly (readonly [EntityForgeScenario, (directory: string, startCommit: string) => Record<string, string>])[] = [
  [ENTITY_FORGE_SCENARIOS.AT_REST, () => ({})],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_AT_HOME, shopTicketChanging([sourceFileOf(SHOP)])],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN, shopTicketChanging([sourceFileOf(SHOP), sourceFileOf(ADMIN)])],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_ADMIN, shopTicketChanging([sourceFileOf(ADMIN)])],
  [ENTITY_FORGE_SCENARIOS.NEED_DELIVERED, needDeliveredIn],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_UI_KIT, shopTicketChanging([sourceFileOf(SHOP), sourceFileOf(UI_KIT), ENTITY_FORGE_LOCK_FILE])],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_UI_KIT, shopTicketChanging([sourceFileOf(UI_KIT)])],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED, crossedThenChanging([sourceFileOf(SHOP)])],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_PACKAGE_RESHAPED, crossedThenChanging([sourceFileOf(UI_KIT)])],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_LOCKFILE_SEALED, crossedThenChanging([sourceFileOf(UI_KIT), ENTITY_FORGE_LOCK_FILE])],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_RESHAPED_ADAPTED, reshapedThenAdapted(false)],
  [ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED_REVIEWED, reshapedThenAdapted(true)],
];

/** Runs every call of the scenario at each of its places, and records each answer under the scenario with the placeholders put back. */
function recordScenario(scenario: EntityForgeScenario, directory: string, commits: Readonly<Record<string, string>>): number {
  const replacements = scenarioReplacementsOf({ repositoryDirectory: directory, commits });
  let recordedCount = 0;
  for (const place of entityForgeCallsOf(scenario)) {
    const placeDirectory = withScenarioValues(place.folder, replacements);
    for (const call of place.calls) {
      const gitArguments = call.gitArguments.map((argument) => withScenarioValues(argument, replacements));
      const answer = GitProcess.run(placeDirectory, gitArguments, call.hookPolicy ?? 'hooks-off');
      if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started in ${placeDirectory}`);
      recordAnswer(scenarioCallShapeOf(scenario, place.folder, call.gitArguments), {
        ...answer,
        standardOutput: withScenarioPlaceholders(answer.standardOutput, replacements),
        standardError:  withScenarioPlaceholders(answer.standardError, replacements),
      });
      recordedCount += 1;
    }
  }
  return recordedCount;
}

describeWhenGitIsPresent('the entity-forge answer set', () => {
  test.each([...SCENARIO_STATES])('%s', (scenario, plant) => {
    const { directory, startCommit } = fixtureRepository();
    const commits = { '<start>': startCommit, ...plant(directory, startCommit) };
    expect(Object.keys(commits).sort()).toEqual([...ENTITY_FORGE_SCENARIO_COMMITS[scenario]].sort());
    expect(recordScenario(scenario, directory, commits)).toBeGreaterThan(0);
  });
});
