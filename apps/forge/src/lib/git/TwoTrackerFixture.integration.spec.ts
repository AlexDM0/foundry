/**
 * Records the two-tracker answer set: builds each git state of the fixture repository of `src/testing/TwoTrackerFixture.ts` with real
 * git, and at each of its places runs the calls `src/testing/TwoTrackerScenarios.ts` names, so a default spec replays a repository holding
 * two sibling trackers without real git. `bun run record src/lib/git/GitProcess.ts` runs this spec and writes the answers.
 */
import { realpathSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';

import { afterAll, expect, test } from 'bun:test';

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
import {
  ticketBranchOfProject,
  ticketWorktreeFolderOf,
  TWO_TRACKER_HOOKS_FOLDER,
  TWO_TRACKER_MAIN_LINE,
  TWO_TRACKER_PERSON_BRANCH,
  TWO_TRACKER_PERSON_CHECKOUT_FOLDER,
  TWO_TRACKER_PROJECT_SOURCE_FILE,
  TWO_TRACKER_PROJECTS,
  TWO_TRACKER_SHARED_PACKAGE_SOURCE_FILE,
  TWO_TRACKER_TAG,
  type TwoTrackerProject,
  writeTwoTrackerFiles
} from '../../testing/TwoTrackerFixture.ts';
import {
  TWO_TRACKER_SCENARIO_COMMITS,
  TWO_TRACKER_SCENARIOS,
  twoTrackerCallsOf,
  type TwoTrackerScenario
} from '../../testing/TwoTrackerScenarios.ts';
import { GitProcess } from './GitProcess.ts';

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function commitAll(directory: string, message: string): string {
  gitOutputIn(directory, ['add', '--all']);
  gitOutputIn(directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', message]);
  return gitOutputIn(directory, ['rev-parse', 'HEAD']);
}

/** The main line at its start with every tracked file, the hooks path set and the person's checkout beside the trackers. */
function fixtureRepository(): { directory: string; startCommit: string } {
  const directory = realpathSync(createScratchGitRepository('two-trackers'));
  scratchDirectories.push(directory);
  gitOutputIn(directory, ['branch', '-m', TWO_TRACKER_MAIN_LINE]);
  writeTwoTrackerFiles(directory);
  const startCommit = commitAll(directory, 'Add the example workspace');
  gitOutputIn(directory, ['config', 'core.hooksPath', TWO_TRACKER_HOOKS_FOLDER]);
  gitOutputIn(directory, ['worktree', 'add', '-q', '-b', TWO_TRACKER_PERSON_BRANCH, TWO_TRACKER_PERSON_CHECKOUT_FOLDER, startCommit]);
  return { directory, startCommit };
}

function ticketBuiltIn(directory: string, startCommit: string, project: TwoTrackerProject, changedPaths: readonly string[]): string {
  const worktreeDirectory = join(directory, ticketWorktreeFolderOf(project));
  gitOutputIn(directory, ['worktree', 'add', '-q', '-b', ticketBranchOfProject(project), worktreeDirectory, startCommit]);
  for (const path of changedPaths) writeFileSync(join(worktreeDirectory, path), `export const changedBy${project.namespace} = 2;\n`);
  return commitAll(worktreeDirectory, `Change ${project.folder} for ticket 001`);
}

function ticketsBuiltIn(directory: string, startCommit: string): Record<string, string> {
  const { FORGE, GAIA } = TWO_TRACKER_PROJECTS;
  return {
    '<forge ticket tip>': ticketBuiltIn(directory, startCommit, FORGE, [`${FORGE.folder}/${TWO_TRACKER_PROJECT_SOURCE_FILE}`, TWO_TRACKER_SHARED_PACKAGE_SOURCE_FILE]),
    '<gaia ticket tip>':  ticketBuiltIn(directory, startCommit, GAIA, [`${GAIA.folder}/${TWO_TRACKER_PROJECT_SOURCE_FILE}`]),
  };
}

/** A person at work beside the trackers: a sibling's file changed in the main checkout, a stash, a commit and a tag. */
function personAndSiblingAtWorkIn(directory: string, startCommit: string): Record<string, string> {
  const { FORGE, GAIA } = TWO_TRACKER_PROJECTS;
  writeFileSync(join(directory, GAIA.folder, TWO_TRACKER_PROJECT_SOURCE_FILE), 'export const gaiaExample = 3;\n');
  const personDirectory = join(directory, TWO_TRACKER_PERSON_CHECKOUT_FOLDER);
  writeFileSync(join(personDirectory, FORGE.folder, TWO_TRACKER_PROJECT_SOURCE_FILE), 'export const stashedExample = 4;\n');
  gitOutputIn(personDirectory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'stash', '-q']);
  const stash = gitOutputIn(personDirectory, ['rev-parse', 'refs/stash']);
  writeFileSync(join(personDirectory, FORGE.folder, TWO_TRACKER_PROJECT_SOURCE_FILE), 'export const personExample = 5;\n');
  const personTip = commitAll(personDirectory, 'Change apps/forge by hand');
  gitOutputIn(directory, ['tag', TWO_TRACKER_TAG, startCommit]);
  return { '<person tip>': personTip, '<stash>': stash };
}

/** Each scenario and how it changes the fixture repository, naming the commits beside the start. */
const SCENARIO_STATES: readonly (readonly [TwoTrackerScenario, (directory: string, startCommit: string) => Record<string, string>])[] = [
  [TWO_TRACKER_SCENARIOS.AT_REST, () => ({})],
  [TWO_TRACKER_SCENARIOS.TICKETS_BUILT, ticketsBuiltIn],
  [TWO_TRACKER_SCENARIOS.SIBLING_LANDED, (directory, startCommit) => {
    const ticketTips = ticketsBuiltIn(directory, startCommit);
    gitOutputIn(directory, ['merge', '--ff-only', '-q', ticketBranchOfProject(TWO_TRACKER_PROJECTS.GAIA)]);
    return ticketTips;
  }],
  [TWO_TRACKER_SCENARIOS.PERSON_AND_SIBLING_AT_WORK, personAndSiblingAtWorkIn],
];

/** Runs every call of the scenario at each of its places, and records each answer under the scenario with the placeholders put back. */
function recordScenario(scenario: TwoTrackerScenario, directory: string, commits: Readonly<Record<string, string>>): number {
  const replacements = scenarioReplacementsOf({ repositoryDirectory: directory, commits });
  let recordedCount = 0;
  for (const place of twoTrackerCallsOf(scenario)) {
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

describeWhenGitIsPresent('the two-tracker answer set', () => {
  test.each([...SCENARIO_STATES])('%s', (scenario, plant) => {
    const { directory, startCommit } = fixtureRepository();
    const commits = { '<start>': startCommit, ...plant(directory, startCommit) };
    expect(Object.keys(commits).sort()).toEqual([...TWO_TRACKER_SCENARIO_COMMITS[scenario]].sort());
    expect(recordScenario(scenario, directory, commits)).toBeGreaterThan(0);
  });
});
