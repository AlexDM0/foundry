/**
 * A scenario is one named git state of a repository, such as "a commit under .claude/ undone by a later one". Its recorder builds the state
 * with real git and runs the production code a spec runs, and `captureGitScenario` records each git call it makes under the scenario's
 * name; a default spec enters the scenario through `useRecordedGit().enterScenario` and is answered from that recording, in any order.
 * The repository folder and each named commit are placeholders in the recording, which the replay fills with the spec's own values.
 */
import { realpathSync } from 'node:fs';

import { spyOn } from 'bun:test';

import { GitProcess, type GitRun } from '../lib/git/GitProcess.ts';
import { recordAnswer }            from './RecordedAnswers.ts';

export const SCENARIO_REPOSITORY_PLACEHOLDER = '<repository>';

/** The scenarios the recorders record, each named for its git state. */
export const GIT_SCENARIOS = {
  ONBOARDER_SNAPSHOT_UNTOUCHED:      'an onboarder snapshot at <start>, untouched',
  ONBOARDER_SNAPSHOT_FILE_CHANGED:   'an onboarder snapshot at <start>, package.json changed',
  ONBOARDER_SNAPSHOT_FILE_ADDED:     'an onboarder snapshot at <start>, pipeline.json untracked',
  ONBOARDER_SNAPSHOT_COMMITTED:      'an onboarder snapshot at <start>, the commit <moved> made on it',
  ONBOARDER_SNAPSHOT_BRANCH_ADDED:   'an onboarder snapshot at <start>, the branch onboarder-moved made at <start>',
  BUILT:                             'a branch built from <start> to <head>, clean',
  BUILT_THEN_RESET:                  'a branch built from <start> to <rewritten>, reset to <start>',
  BUILT_WITH_AN_UNTRACKED_FILE:      'a branch built from <start> to <head>, left-behind.txt untracked',
  DATA_FOLDER_COMMITTED:             'a branch built from <start>, the data folder committed at <head>',
  DATA_FOLDER_COMMITTED_IN_CAPITALS: 'a branch built from <start>, the data folder committed in capitals at <head>',
  LOWER_CASE_AGENTS_FILE_COMMITTED:  'a branch built from <start>, agents.md committed at <head>',
  HONEST_CASE_COMMITTED:             'a branch built from <start>, agents.md committed at <honest start>, Docs/Agents-Example.md at <head>',
  DATA_AND_PACKAGE_UNDONE:           'a branch built from <start>, the data folder and package.json committed, then removed at <head>',
  ATTRIBUTION_TRAILER_COMMITTED:     'a branch built from <start>, a commit with an AI attribution trailer at <head>',
  TARGET_MERGED:                     'a branch at <branch tip> merging <target tip> at <head>, cleanly',
  TARGET_HISTORY_MERGED:             'a branch at <branch tip> merging <target tip> at <head>, the target holding package.json, data, config and a trailer',
  RESOLUTION_CHANGES_CHECKED_FILES:  'a branch at <branch tip> merging <target tip> at <head>, the resolution adding package.json and data, the merge with a trailer',
  CONFLICT_RESOLVED_ELSEWHERE:       'a branch at <branch tip> merging <target tip> at <head>, target.ts conflicted and resolved, package.json from the target',
  COMMIT_AFTER_TARGET_HISTORY:       'a branch at <branch tip> merging <target tip>, the target holding package.json, a package.json commit at <head>',
  PACKAGE_JSON_COMMITTED:            'a branch built from <start>, package.json committed at <head>',
  PACKAGE_JSON_THEN_PYPROJECT:       'a branch built from <start> to <feature>, package.json and then pyproject.toml committed at <head>',
  ESLINT_CONFIG_COMMITTED:           'a branch built from <start>, eslint.config.js committed at <head>',
  INSTRUCTION_FILE_COMMITTED:        'a branch built from <start>, example-constitution.md committed at <head>',
} as const;

/** Each placeholder of a scenario and its value: the commits by name, such as `<start>`, beside the repository folder. */
export interface ScenarioValues {
  readonly repositoryDirectory: string;
  readonly commits:             Readonly<Record<string, string>>;
}

/** Placeholder and value pairs, the resolved repository folder first, since the folder a spec named can lie inside it as text. */
export function scenarioReplacementsOf(values: ScenarioValues): (readonly [string, string])[] {
  const resolvedRepository = realpathSync(values.repositoryDirectory);
  return [
    [SCENARIO_REPOSITORY_PLACEHOLDER, resolvedRepository],
    [SCENARIO_REPOSITORY_PLACEHOLDER, values.repositoryDirectory],
    ...Object.entries(values.commits),
  ];
}

export function withScenarioPlaceholders(text: string, replacements: readonly (readonly [string, string])[]): string {
  return replacements.reduce((replaced, [placeholder, value]) => replaced.replaceAll(value, placeholder), text);
}

/** The value of each placeholder; the resolved repository folder stands for `<repository>`, as git prints it. */
export function withScenarioValues(text: string, replacements: readonly (readonly [string, string])[]): string {
  const seen = new Set<string>();
  return replacements.reduce((filled, [placeholder, value]) => {
    if (seen.has(placeholder)) return filled;
    seen.add(placeholder);
    return filled.replaceAll(placeholder, value);
  }, text);
}

/** The key a scenario's recorded answer is stored under: the scenario, the folder asked in and the arguments, all with placeholders. */
export function scenarioCallShapeOf(scenario: string, directory: string, gitArguments: readonly string[]): string {
  return `scenario "${scenario}", in ${directory}: git ${gitArguments.join(' ')}`;
}

/**
 * Called by a recorder: runs `action` on real git, and records each call it makes as an answer of `scenario`. A call asked twice is recorded
 * once per answer, so a scenario must not change the repository between the calls it records.
 */
export function captureGitScenario<Result>(scenario: string, values: ScenarioValues, action: () => Result): Result {
  const realRun = GitProcess.run;
  const replacements = scenarioReplacementsOf(values);
  const recordedRun = (directory: string, gitArguments: readonly string[], ...rest: unknown[]): GitRun | null => {
    const answer = (realRun as (...parameters: unknown[]) => GitRun | null)(directory, gitArguments, ...rest);
    if (answer === null) return null;
    const callShape = scenarioCallShapeOf(
      scenario,
      withScenarioPlaceholders(directory, replacements),
      gitArguments.map((argument) => withScenarioPlaceholders(argument, replacements)),
    );
    recordAnswer(callShape, {
      ...answer,
      standardOutput: withScenarioPlaceholders(answer.standardOutput, replacements),
      standardError:  withScenarioPlaceholders(answer.standardError, replacements),
    });
    return answer;
  };
  const runSpy = spyOn(GitProcess, 'run').mockImplementation(recordedRun as typeof GitProcess.run);
  const resolveSpy = spyOn(GitProcess, 'resolvedCommitOf').mockImplementation((directory, revision, ceilingDirectory) => {
    const answer = recordedRun(directory, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`], 'hooks-off', undefined, ceilingDirectory);
    return answer !== null && answer.exitCode === 0 ? answer.standardOutput.trim() : null;
  });
  try {
    return action();
  } finally {
    runSpy.mockRestore();
    resolveSpy.mockRestore();
  }
}
