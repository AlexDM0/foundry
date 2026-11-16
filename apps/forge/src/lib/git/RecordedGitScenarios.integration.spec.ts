/**
 * Records the git scenarios the Customs and review outcome specs replay (`src/services/lifecycle/Customs.pipelineAgent.spec.ts`,
 * `Customs.verification.spec.ts`, `Customs.provenance.spec.ts` and `ReviewOutcome.settled.spec.ts`): each case builds a scenario's state with
 * real git and runs in it the calls `src/testing/RecordedGitScenarioCalls.ts` names, so each answer is recorded under the scenario. A call
 * the production code makes and the data does not name fails its replaying spec as unrecorded. `bun run record src/lib/git/GitProcess.ts`
 * runs this spec and writes the answers to `src/testing/recordings/<os>/`.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join }                          from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { recordAnswer }        from '../../testing/RecordedAnswers.ts';
import {
  CUSTOMS_MAIN_MERGE_SCENARIO_CALLS,
  CUSTOMS_SCENARIO_CALLS,
  PIPELINE_AGENT_SCENARIO_CALLS,
  PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME,
  REVIEW_PASS_WITHOUT_CHANGES_CALLS,
  reviewPassScenarioCalls,
  SCENARIO_DATA_FOLDER,
  SCENARIO_MAIN_LINE,
  SCENARIO_MANY_CODE_LINES_COUNT,
  SCENARIO_PRINTED_OBJECT_PLACEHOLDER,
  type RecordedScenarioCall,
  type RecordedScenarioCalls
} from '../../testing/RecordedGitScenarioCalls.ts';
import {
  GIT_SCENARIOS,
  SCENARIO_REPOSITORY_PLACEHOLDER,
  scenarioCallShapeOf,
  scenarioReplacementsOf,
  type ScenarioValues,
  withScenarioPlaceholders,
  withScenarioValues
} from '../../testing/RecordedGitScenarios.ts';
import {
  addWorktree,
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import { GitProcess, type GitRun }  from './GitProcess.ts';

const PLACEHOLDER_PATTERN = /<[^<>]+>/g;
const OBJECT_ID_PATTERN = /^[0-9a-f]{40,64}$/;
const ATTRIBUTION_TRAILER = '\n\nCo-Authored-By: Claude <noreply@example.com>';

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

interface ScenarioRun {
  directory:    string;
  gitArguments: readonly string[];
  answer:       GitRun;
}

function placeholdersAreNamed(gitArguments: readonly string[], commits: Readonly<Record<string, string>>): boolean {
  return gitArguments.flatMap((argument) => argument.match(PLACEHOLDER_PATTERN) ?? [])
    .every((placeholder) => [SCENARIO_REPOSITORY_PLACEHOLDER, SCENARIO_PRINTED_OBJECT_PLACEHOLDER].includes(placeholder) || Object.hasOwn(commits, placeholder));
}

function realRun(directory: string, gitArguments: readonly string[], call: RecordedScenarioCall): GitRun {
  const answer = GitProcess.run(directory, gitArguments, call.hookPolicy ?? 'hooks-off');
  if (answer === null) throw new Error(`git ${gitArguments.join(' ')} could not be started in ${directory}`);
  return answer;
}

function objectsPrintedBy(answer: GitRun): string[] {
  return answer.standardOutput.split('\n').map((line) => line.split(/\s/)[0] ?? '').filter((word) => OBJECT_ID_PATTERN.test(word));
}

/** Runs each call that names only the scenario's placeholders, and records every answer once the last call ran, under the final names. */
function recordScenario(scenario: string, values: ScenarioValues, scenarioCalls: RecordedScenarioCalls): number {
  let { commits } = values;
  const runs: ScenarioRun[] = [];
  const valuesOf = (text: string): string => withScenarioValues(text, scenarioReplacementsOf({ ...values, commits }));
  const directory = valuesOf(scenarioCalls.folder);
  for (const call of scenarioCalls.calls) {
    const printingArguments = call.forEachObjectPrintedBy ?? [];
    if (!placeholdersAreNamed([...call.gitArguments, ...printingArguments], commits)) continue;
    const printedObjects = call.forEachObjectPrintedBy === undefined
      ? [null]
      : objectsPrintedBy(realRun(directory, printingArguments.map(valuesOf), call));
    for (const printedObject of printedObjects) {
      const gitArguments = call.gitArguments.map(valuesOf)
        .map((argument) => (printedObject === null ? argument : argument.replaceAll(SCENARIO_PRINTED_OBJECT_PLACEHOLDER, printedObject)));
      runs.push({ directory, gitArguments, answer: realRun(directory, gitArguments, call) });
    }
    if (call.namesCommitMade !== undefined) commits = { ...commits, [call.namesCommitMade]: gitOutputIn(directory, ['rev-parse', 'HEAD']) };
  }
  const replacements = scenarioReplacementsOf({ ...values, commits });
  for (const run of runs) {
    const callShape = scenarioCallShapeOf(
      scenario,
      withScenarioPlaceholders(run.directory, replacements),
      run.gitArguments.map((argument) => withScenarioPlaceholders(argument, replacements)),
    );
    recordAnswer(callShape, {
      ...run.answer,
      standardOutput: withScenarioPlaceholders(run.answer.standardOutput, replacements),
      standardError:  withScenarioPlaceholders(run.answer.standardError, replacements),
    });
  }
  return runs.length;
}

/** Records the repository's state as `scenario`: the commits named, and HEAD as `<head>` when no other name holds it. */
function recordStateOf(scenario: string, directory: string, namedCommits: Record<string, string>, scenarioCalls = CUSTOMS_SCENARIO_CALLS): void {
  const head = gitOutputIn(directory, ['rev-parse', 'HEAD']);
  const commits: Record<string, string> = { ...namedCommits };
  if (!Object.values(commits).includes(head)) commits['<head>'] = head;
  expect(recordScenario(scenario, { repositoryDirectory: directory, commits }, scenarioCalls)).toBeGreaterThan(0);
}

function scratchRepository(prefix: string): string {
  const directory = realpathSync(createScratchGitRepository(prefix));
  scratchDirectories.push(directory, `${directory}-worktrees`);
  gitOutputIn(directory, ['branch', '-m', SCENARIO_MAIN_LINE]);
  return directory;
}

function writeFileIn(directory: string, path: string, content: string): void {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), content);
}

function commitPath(directory: string, path: string, content: string): string {
  writeFileIn(directory, path, content);
  return commitFile(directory, path, content);
}

function commitAll(directory: string, message: string): string {
  gitOutputIn(directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', message]);
  return gitOutputIn(directory, ['rev-parse', 'HEAD']);
}

function commitWithMessage(directory: string, fileName: string, message: string): string {
  writeFileSync(join(directory, fileName), `${message}\n`);
  gitOutputIn(directory, ['add', '--', fileName]);
  return commitAll(directory, message);
}

function manyCodeLines(): string {
  return `${Array.from({ length: SCENARIO_MANY_CODE_LINES_COUNT }, (_unused, i) => `export const exampleValue${i} = ${i};`).join('\n')}\n`;
}

describeWhenGitIsPresent('the git scenarios the Customs pipeline agent spec replays', () => {
  /** A main line with package.json and its detached snapshot inside the repository. */
  function pipelineAgentRepository(): { directory: string; snapshotDirectory: string; startCommit: string } {
    const directory = scratchRepository('customs-scenarios');
    const startCommit = commitFile(directory, 'package.json', '{ "name": "example" }\n');
    const snapshotDirectory = join(directory, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME);
    gitOutputIn(directory, ['worktree', 'add', '--detach', snapshotDirectory, startCommit]);
    return { directory, snapshotDirectory, startCommit };
  }

  test.each([
    [GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_UNTOUCHED, (): void => undefined],
    [GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_FILE_CHANGED, (snapshotDirectory: string): void => {
      writeFileSync(join(snapshotDirectory, 'package.json'), '{ "name": "changed" }\n');
    }],
    [GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_FILE_ADDED, (snapshotDirectory: string): void => {
      writeFileSync(join(snapshotDirectory, 'pipeline.json'), '{}\n');
    }],
    [GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_BRANCH_ADDED, (snapshotDirectory: string): void => {
      gitOutputIn(snapshotDirectory, ['branch', 'pipeline-agent-moved', 'HEAD']);
    }],
  ] as const)('%s', (scenario, plant) => {
    const { directory, snapshotDirectory, startCommit } = pipelineAgentRepository();
    plant(snapshotDirectory);
    const commits = { '<start>': startCommit };
    expect(recordScenario(scenario, { repositoryDirectory: directory, commits }, PIPELINE_AGENT_SCENARIO_CALLS)).toBeGreaterThan(0);
  });

  test(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_COMMITTED, () => {
    const { directory, snapshotDirectory, startCommit } = pipelineAgentRepository();
    const movedCommit = commitFile(snapshotDirectory, 'turbo.json', '{}\n');
    const commits = { '<start>': startCommit, '<moved>': movedCommit };
    expect(recordScenario(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_COMMITTED, { repositoryDirectory: directory, commits }, PIPELINE_AGENT_SCENARIO_CALLS))
      .toBeGreaterThan(0);
  });
});

interface BuiltRepository {
  directory:   string;
  startCommit: string;
}

/** As the verification spec's `beforeEach` leaves one: base.ts at the start, feature.ts on top. */
function builtRepository(): BuiltRepository {
  const directory = scratchRepository('customs-scenarios');
  const startCommit = commitFile(directory, 'base.ts', 'export const base = true;\n');
  commitFile(directory, 'feature.ts', 'export const feature = true;\n');
  return { directory, startCommit };
}

function plantTargetHistory(directory: string): void {
  commitFile(directory, 'package.json', '{ "name": "example-target" }\n');
  commitPath(directory, `${SCENARIO_DATA_FOLDER}/progress.json`, '{}\n');
  commitPath(directory, '.claude/settings.json', '{}\n');
  commitWithMessage(directory, 'attributed.ts', `Add the attributed file${ATTRIBUTION_TRAILER}`);
}

/** The target branched from the start and merged into the branch with `--no-commit`, `resolveMerge` run before the merge's commit. */
function mergedTargetIn(
  built: BuiltRepository, plantOnTarget: () => void, resolveMerge: () => void = () => undefined, mergeMessage = 'Merge the example target'
): Record<string, string> {
  const { directory } = built;
  const branchTip = gitOutputIn(directory, ['rev-parse', 'HEAD']);
  gitOutputIn(directory, ['checkout', '-q', '-b', 'example-target', built.startCommit]);
  plantOnTarget();
  const targetTip = gitOutputIn(directory, ['rev-parse', 'HEAD']);
  gitOutputIn(directory, ['checkout', '-q', '-']);
  gitOutputIn(directory, ['merge', '-q', '--no-ff', '--no-commit', 'example-target']);
  resolveMerge();
  commitAll(directory, mergeMessage);
  return { '<branch tip>': branchTip, '<target tip>': targetTip };
}

/** target.ts changed on the branch and on a target that also adds package.json; the conflict resolved, `stageBeside` run before its commit. */
function conflictOnTargetResolved({ directory, startCommit }: BuiltRepository, stageBeside: () => void = () => undefined): Record<string, string> {
  const branchTip = commitFile(directory, 'target.ts', 'export const target = \'branch\';\n');
  gitOutputIn(directory, ['checkout', '-q', '-b', 'example-target', startCommit]);
  commitFile(directory, 'package.json', '{ "name": "example-target" }\n');
  const targetTip = commitFile(directory, 'target.ts', 'export const target = \'target\';\n');
  gitOutputIn(directory, ['checkout', '-q', '-']);
  expect(GitProcess.run(directory, ['merge', '-q', '--no-ff', '--no-commit', 'example-target'])?.exitCode).not.toBe(0);
  stageBeside();
  commitFile(directory, 'target.ts', 'export const target = \'resolved\';\n');
  return { '<branch tip>': branchTip, '<target tip>': targetTip };
}

function packageJsonAndDataStaged(directory: string): void {
  writeFileSync(join(directory, 'package.json'), '{ "scripts": { "verify": "true" } }\n');
  gitOutputIn(directory, ['add', '--', 'package.json']);
  writeFileIn(directory, `${SCENARIO_DATA_FOLDER}/progress.json`, '{}\n');
  gitOutputIn(directory, ['add', '--', SCENARIO_DATA_FOLDER]);
}

/** Each scenario and how it changes the built repository, naming the commits beside the start and HEAD. */
const VERIFICATION_PLANTS: readonly (readonly [string, (built: BuiltRepository) => Record<string, string>])[] = [
  [GIT_SCENARIOS.BUILT, () => ({})],
  [GIT_SCENARIOS.BUILT_THEN_RESET, ({ directory }) => {
    const rewrittenFrom = gitOutputIn(directory, ['rev-parse', 'HEAD']);
    gitOutputIn(directory, ['reset', '-q', '--hard', 'HEAD~1']);
    return { '<rewritten>': rewrittenFrom };
  }],
  [GIT_SCENARIOS.BUILT_WITH_AN_UNTRACKED_FILE, ({ directory }) => {
    writeFileSync(join(directory, 'left-behind.txt'), 'scratch\n');
    return {};
  }],
  [GIT_SCENARIOS.DATA_FOLDER_COMMITTED, ({ directory }) => {
    commitPath(directory, `${SCENARIO_DATA_FOLDER}/progress.json`, '{}\n');
    return {};
  }],
  [GIT_SCENARIOS.DATA_FOLDER_COMMITTED_IN_CAPITALS, ({ directory }) => {
    commitPath(directory, `${SCENARIO_DATA_FOLDER.toUpperCase()}/progress.json`, '{}\n');
    return {};
  }],
  [GIT_SCENARIOS.DATA_FOLDER_QUOTED_NAME_COMMITTED, ({ directory }) => {
    commitPath(directory, `${SCENARIO_DATA_FOLDER}/example"quoted\tname.json`, '{}\n');
    return {};
  }],
  [GIT_SCENARIOS.LOWER_CASE_AGENTS_FILE_COMMITTED, ({ directory }) => {
    commitFile(directory, 'agents.md', '# Example instructions\n');
    return {};
  }],
  [GIT_SCENARIOS.HONEST_CASE_COMMITTED, ({ directory }) => {
    const honestStart = commitFile(directory, 'agents.md', '# Example instructions\n');
    commitPath(directory, 'Docs/Agents-Example.md', '# Example\n');
    return { '<honest start>': honestStart };
  }],
  [GIT_SCENARIOS.DATA_AND_PACKAGE_UNDONE, ({ directory }) => {
    commitPath(directory, `${SCENARIO_DATA_FOLDER}/progress.json`, '{}\n');
    commitFile(directory, 'package.json', '{ "scripts": { "verify": "true" } }\n');
    gitOutputIn(directory, ['rm', '-q', '--', `${SCENARIO_DATA_FOLDER}/progress.json`, 'package.json']);
    commitAll(directory, 'Undo the planted changes');
    return {};
  }],
  [GIT_SCENARIOS.ATTRIBUTION_TRAILER_COMMITTED, ({ directory }) => {
    commitWithMessage(directory, 'trailer.ts', `Add the trailer file${ATTRIBUTION_TRAILER}`);
    return {};
  }],
  [GIT_SCENARIOS.TARGET_MERGED, (built) => mergedTargetIn(built, () => commitFile(built.directory, 'target.ts', 'export const target = true;\n'))],
  [GIT_SCENARIOS.TARGET_HISTORY_MERGED, (built) => mergedTargetIn(built, () => plantTargetHistory(built.directory))],
  [GIT_SCENARIOS.RESOLUTION_CHANGES_CHECKED_FILES, (built) => mergedTargetIn(
    built,
    () => commitFile(built.directory, 'target.ts', 'export const target = true;\n'),
    () => packageJsonAndDataStaged(built.directory),
    `Merge the example target${ATTRIBUTION_TRAILER}`,
  )],
  [GIT_SCENARIOS.CONFLICT_RESOLVED_ELSEWHERE, (built) => conflictOnTargetResolved(built)],
  [GIT_SCENARIOS.CONFLICT_RESOLVED_WITH_AGENT_CONFIG, (built) => conflictOnTargetResolved(built, () => {
    writeFileIn(built.directory, 'apps/example/.claude/settings.json', '{}\n');
    gitOutputIn(built.directory, ['add', '--', 'apps/example/.claude/settings.json']);
  })],
  [GIT_SCENARIOS.COMMIT_AFTER_TARGET_HISTORY, (built) => {
    const merge = mergedTargetIn(built, () => plantTargetHistory(built.directory));
    writeFileSync(join(built.directory, 'package.json'), '{ "scripts": { "verify": "true" } }\n');
    gitOutputIn(built.directory, ['add', '--', 'package.json']);
    commitAll(built.directory, 'Change the verify script');
    return merge;
  }],
  [GIT_SCENARIOS.PACKAGE_JSON_COMMITTED, ({ directory }) => {
    commitFile(directory, 'package.json', '{ "scripts": { "verify": "true" } }\n');
    return {};
  }],
  [GIT_SCENARIOS.PACKAGE_JSON_THEN_PYPROJECT, ({ directory }) => {
    const feature = gitOutputIn(directory, ['rev-parse', 'HEAD']);
    commitFile(directory, 'package.json', '{}\n');
    commitFile(directory, 'pyproject.toml', '[project]\nname = "example"\n');
    return { '<feature>': feature };
  }],
  [GIT_SCENARIOS.ESLINT_CONFIG_COMMITTED, ({ directory }) => {
    commitFile(directory, 'eslint.config.js', 'export default [];\n');
    return {};
  }],
  [GIT_SCENARIOS.INSTRUCTION_FILE_COMMITTED, ({ directory }) => {
    commitFile(directory, 'example-constitution.md', '# Example rules\n');
    return {};
  }],
];

describeWhenGitIsPresent('the git scenarios the Customs verification spec replays', () => {
  test.each([...VERIFICATION_PLANTS])('%s', (scenario, plant) => {
    const built = builtRepository();
    const namedCommits = plant(built);
    recordStateOf(scenario, built.directory, { '<start>': built.startCommit, ...namedCommits });
  });
});

describeWhenGitIsPresent('the git scenarios of a branch that merged the main line in, which the Customs verification spec replays', () => {
  const MERGE_MAIN = [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'merge', '-q', '--no-ff', '-m', 'Merge the main line', SCENARIO_MAIN_LINE];

  /** Main at the start with base.ts, ticket-001 off it with feature.ts, then main's own example-constitution.md, ticket-001 checked out. */
  function branchBesideMain(): { directory: string; commits: Record<string, string> } {
    const directory = scratchRepository('customs-main-merge-scenarios');
    const startCommit = commitFile(directory, 'base.ts', 'export const base = true;\n');
    gitOutputIn(directory, ['checkout', '-q', '-b', 'ticket-001']);
    commitFile(directory, 'feature.ts', 'export const feature = true;\n');
    gitOutputIn(directory, ['checkout', '-q', SCENARIO_MAIN_LINE]);
    const mainTip = commitFile(directory, 'example-constitution.md', '# Example rules\n');
    gitOutputIn(directory, ['checkout', '-q', 'ticket-001']);
    return { directory, commits: { '<start>': startCommit, '<main tip>': mainTip } };
  }

  test(GIT_SCENARIOS.MAIN_INSTRUCTION_FILE_MERGED, () => {
    const { directory, commits } = branchBesideMain();
    gitOutputIn(directory, MERGE_MAIN);
    recordStateOf(GIT_SCENARIOS.MAIN_INSTRUCTION_FILE_MERGED, directory, commits, CUSTOMS_MAIN_MERGE_SCENARIO_CALLS);
  });

  test(GIT_SCENARIOS.OWN_INSTRUCTION_EDIT_AFTER_MERGE, () => {
    const { directory, commits } = branchBesideMain();
    gitOutputIn(directory, MERGE_MAIN);
    commitFile(directory, 'example-constitution.md', '# Example rules\n\n- A rule the worker added.\n');
    recordStateOf(GIT_SCENARIOS.OWN_INSTRUCTION_EDIT_AFTER_MERGE, directory, commits, CUSTOMS_MAIN_MERGE_SCENARIO_CALLS);
  });

  test(GIT_SCENARIOS.INSTRUCTION_EDIT_IN_THE_MERGE, () => {
    const { directory, commits } = branchBesideMain();
    gitOutputIn(directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'merge', '-q', '--no-ff', '--no-commit', SCENARIO_MAIN_LINE]);
    writeFileSync(join(directory, 'example-constitution.md'), '# Example rules, changed in the merge\n');
    gitOutputIn(directory, ['add', '--', 'example-constitution.md']);
    commitAll(directory, 'Merge the main line');
    recordStateOf(GIT_SCENARIOS.INSTRUCTION_EDIT_IN_THE_MERGE, directory, commits, CUSTOMS_MAIN_MERGE_SCENARIO_CALLS);
  });
});

describeWhenGitIsPresent('the git scenarios the Customs provenance spec replays', () => {
  /** A repository on main with base.ts committed as the start, its start state recorded. */
  function startedRepository(): { directory: string; startCommit: string } {
    const directory = scratchRepository('customs-provenance-scenarios');
    const startCommit = commitFile(directory, 'base.ts', 'export const base = true;\n');
    recordStateOf(GIT_SCENARIOS.ONE_COMMIT, directory, { '<start>': startCommit });
    return { directory, startCommit };
  }

  function git(directory: string, gitArguments: readonly string[]): string {
    return gitOutputIn(directory, gitArguments);
  }

  test('agent configuration committed and undone, and an untracked .mcp.json', () => {
    const { directory, startCommit } = startedRepository();
    writeFileSync(join(directory, '.mcp.json'), '{}\n');
    recordStateOf(GIT_SCENARIOS.MCP_FILE_UNTRACKED, directory, { '<start>': startCommit });
    removeScratchDirectory(join(directory, '.mcp.json'));
    commitPath(directory, '.claude/settings.json', '{"hooks":{}}\n');
    git(directory, ['rm', '-q', '.claude/settings.json']);
    git(directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', 'Undo']);
    recordStateOf(GIT_SCENARIOS.AGENT_CONFIG_UNDONE, directory, { '<start>': startCommit });
  });

  test('an untracked file under .claude/ whose name git would quote', () => {
    const { directory, startCommit } = startedRepository();
    mkdirSync(join(directory, '.claude'));
    writeFileSync(join(directory, '.claude', 'example"untracked.md'), '# Example\n');
    recordStateOf(GIT_SCENARIOS.CLAUDE_FILE_QUOTED_NAME_UNTRACKED, directory, { '<start>': startCommit });
  });

  test('a core.hooksPath, a commit beside it and a hook committed under it', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['config', 'core.hooksPath', 'example-hooks']);
    mkdirSync(join(directory, 'other-hooks'));
    mkdirSync(join(directory, 'example-hooks'));
    recordStateOf(GIT_SCENARIOS.HOOKS_PATH_SET, directory, { '<start>': startCommit });
    commitPath(directory, 'other-hooks/pre-commit', 'exit 0\n');
    recordStateOf(GIT_SCENARIOS.HOOKS_PATH_OTHER_FOLDER_COMMIT, directory, { '<start>': startCommit });
    commitPath(directory, 'example-hooks/pre-commit', 'exit 0\n');
    recordStateOf(GIT_SCENARIOS.HOOKS_PATH_HOOK_COMMIT, directory, { '<start>': startCommit });
  });

  test('a nested core.hooksPath and a hook committed under it', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['config', 'core.hooksPath', 'tools/git-hooks']);
    mkdirSync(join(directory, 'tools', 'git-hooks'), { recursive: true });
    recordStateOf(GIT_SCENARIOS.NESTED_HOOKS_PATH_SET, directory, { '<start>': startCommit });
    commitPath(directory, 'tools/git-hooks/pre-commit', 'exit 0\n');
    recordStateOf(GIT_SCENARIOS.NESTED_HOOKS_PATH_HOOK_COMMIT, directory, { '<start>': startCommit });
  });

  test.each([
    [GIT_SCENARIOS.CLAUDE_FOLDER_IN_CAPITALS, '.CLAUDE/settings.json'],
    [GIT_SCENARIOS.CLAUDE_FOLDER_CAPITALISED, '.Claude/agents/example.md'],
    [GIT_SCENARIOS.MCP_FILE_IN_CAPITALS, '.MCP.json'],
    [GIT_SCENARIOS.CLAUDE_FILE_QUOTED_NAME, '.claude/agents/example"quoted.md'],
  ])('%s', (scenario, gitPath) => {
    const { directory, startCommit } = startedRepository();
    commitPath(directory, gitPath, '{}\n');
    recordStateOf(scenario, directory, { '<start>': startCommit });
  });

  test('an honest different case outside the protected names', () => {
    const { directory, startCommit } = startedRepository();
    commitPath(directory, 'Src/Example.ts', 'export const example = true;\n');
    commitPath(directory, 'Example.MCP.json', '{}\n');
    recordStateOf(GIT_SCENARIOS.HONEST_CAPITALS_COMMITTED, directory, { '<start>': startCommit });
  });

  test('a ticket branch, and agent configuration committed on it', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['checkout', '-q', '-b', 'ticket-007']);
    recordStateOf(GIT_SCENARIOS.TICKET_BRANCH_MADE, directory, { '<start>': startCommit });
    commitPath(directory, '.claude/settings.json', '{}\n');
    recordStateOf(GIT_SCENARIOS.TICKET_BRANCH_ADDS_AGENT_CONFIG, directory, { '<start>': startCommit });
  });

  test(GIT_SCENARIOS.TICKET_BRANCH_NESTS_AGENT_CONFIG, () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['checkout', '-q', '-b', 'ticket-007']);
    commitPath(directory, 'apps/example/.claude/settings.json', '{}\n');
    recordStateOf(GIT_SCENARIOS.TICKET_BRANCH_NESTS_AGENT_CONFIG, directory, { '<start>': startCommit });
  });

  test('the own branch moving, then a foreign branch appearing', () => {
    const { directory, startCommit } = startedRepository();
    commitPath(directory, 'feature.ts', 'export const feature = true;\n');
    recordStateOf(GIT_SCENARIOS.OWN_BRANCH_MOVED, directory, { '<start>': startCommit });
    git(directory, ['branch', 'example-foreign', startCommit]);
    recordStateOf(GIT_SCENARIOS.FOREIGN_BRANCH_ADDED, directory, { '<start>': startCommit });
  });

  test('a target and another job\'s branch made at the start', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['branch', 'example-target', startCommit]);
    git(directory, ['branch', 'ticket-009', startCommit]);
    recordStateOf(GIT_SCENARIOS.TARGET_AND_JOB_BRANCH_ADDED, directory, { '<start>': startCommit });
  });

  test('another worktree detached at the start, then moved', () => {
    const { directory, startCommit } = startedRepository();
    const otherWorktree = addWorktree(directory, 'example-detached');
    git(otherWorktree, ['checkout', '-q', '--detach', startCommit]);
    recordStateOf(GIT_SCENARIOS.DETACHED_WORKTREE_AT_START, directory, { '<start>': startCommit });
    const moved = commitPath(otherWorktree, 'moved.ts', 'export const moved = true;\n');
    recordStateOf(GIT_SCENARIOS.DETACHED_WORKTREE_MOVED, directory, { '<start>': startCommit, '<moved>': moved });
  });

  test('a group release landing while a build job is live', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['branch', 'group-example', startCommit]);
    git(directory, ['branch', 'ticket-378', startCommit]);
    git(directory, ['checkout', '-q', '-b', 'ticket-020']);
    recordStateOf(GIT_SCENARIOS.GROUP_RELEASE_LAUNCHED, directory, { '<start>': startCommit });
    commitPath(directory, 'built.ts', 'export const built = true;\n');
    const landed = commitPath(directory, 'released.ts', 'export const released = true;\n');
    git(directory, ['branch', '-f', SCENARIO_MAIN_LINE, landed]);
    git(directory, ['branch', '-D', 'group-example', 'ticket-378']);
    recordStateOf(GIT_SCENARIOS.GROUP_RELEASE_LANDED, directory, { '<start>': startCommit, '<landed>': landed });
  });

  test('a refresh worktree added, merged into and removed while a build job is live', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['checkout', '-q', '-b', 'ticket-020']);
    const refreshWorktree = addWorktree(directory, 'refresh-group-example');
    git(refreshWorktree, ['checkout', '-q', '--detach', startCommit]);
    git(directory, ['branch', '-D', 'worktree/refresh-group-example']);
    recordStateOf(GIT_SCENARIOS.REFRESH_WORKTREE_ADDED, directory, { '<start>': startCommit });
    const moved = commitPath(refreshWorktree, 'refreshed.ts', 'export const refreshed = true;\n');
    recordStateOf(GIT_SCENARIOS.REFRESH_WORKTREE_MERGED_INTO, directory, { '<start>': startCommit, '<moved>': moved });
    git(directory, ['worktree', 'remove', '--force', refreshWorktree]);
    recordStateOf(GIT_SCENARIOS.REFRESH_WORKTREE_REMOVED, directory, { '<start>': startCommit, '<moved>': moved });
  });

  test('a ticket landing on the main line mid-build, its branch then made again and deleted', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['checkout', '-q', '-b', 'ticket-020']);
    recordStateOf(GIT_SCENARIOS.OWN_TICKET_BRANCH_MADE, directory, { '<start>': startCommit });
    git(directory, ['branch', 'ticket-019', startCommit]);
    git(directory, ['checkout', '-q', 'ticket-019']);
    const landed = commitPath(directory, 'reviewed.ts', 'export const reviewed = true;\n');
    git(directory, ['branch', '-f', SCENARIO_MAIN_LINE, landed]);
    git(directory, ['checkout', '-q', 'ticket-020']);
    recordStateOf(GIT_SCENARIOS.TICKET_LANDED_MID_BUILD, directory, { '<start>': startCommit, '<landed>': landed });
    git(directory, ['branch', '-D', 'ticket-019']);
    git(directory, ['branch', 'ticket-019', startCommit]);
    recordStateOf(GIT_SCENARIOS.LANDED_TICKET_BRANCH_REMADE, directory, { '<start>': startCommit, '<landed>': landed });
    git(directory, ['branch', '-D', 'ticket-019']);
    recordStateOf(GIT_SCENARIOS.LANDED_TICKET_BRANCH_DELETED, directory, { '<start>': startCommit, '<landed>': landed });
  });

  test('another ticket landing on the own target, then a protected ref and the own target moving', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['branch', 'ticket-001', startCommit]);
    git(directory, ['branch', 'example-protected', startCommit]);
    git(directory, ['checkout', '-q', '-b', 'ticket-002']);
    recordStateOf(GIT_SCENARIOS.OTHER_TICKET_LAUNCHED, directory, { '<start>': startCommit });
    git(directory, ['checkout', '-q', 'ticket-001']);
    const landed = commitPath(directory, 'palette.txt', 'colour: Example\n');
    git(directory, ['branch', '-f', SCENARIO_MAIN_LINE, landed]);
    git(directory, ['checkout', '-q', 'ticket-002']);
    const ownTip = commitPath(directory, 'shade.txt', 'shade: Example\n');
    const named = { '<start>': startCommit, '<landed>': landed, '<own tip>': ownTip };
    recordStateOf(GIT_SCENARIOS.OTHER_TICKET_LANDED, directory, named);
    git(directory, ['branch', '-f', 'example-protected', ownTip]);
    recordStateOf(GIT_SCENARIOS.PROTECTED_BRANCH_MOVED, directory, named);
    git(directory, ['branch', '-f', 'example-protected', startCommit]);
    git(directory, ['branch', '-f', SCENARIO_MAIN_LINE, ownTip]);
    recordStateOf(GIT_SCENARIOS.OWN_TARGET_MOVED_PAST_LANDING, directory, named);
  });

  test('another ticket\'s branch and a group branch deleted', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['branch', 'ticket-021', startCommit]);
    git(directory, ['branch', 'group-example', startCommit]);
    recordStateOf(GIT_SCENARIOS.BRANCHES_TO_DELETE_MADE, directory, { '<start>': startCommit });
    git(directory, ['branch', '-D', 'ticket-021', 'group-example']);
    recordStateOf(GIT_SCENARIOS.BRANCHES_DELETED, directory, { '<start>': startCommit });
  });
});

describeWhenGitIsPresent('the git scenarios the review outcome spec replays', () => {
  /** main holding base.ts, ticket-001 off it with feature.ts committed, where the review starts. */
  function reviewedBranch(): { directory: string; reviewStartCommit: string } {
    const directory = scratchRepository('review-outcome-scenarios');
    commitFile(directory, 'base.ts', 'export const base = true;\n');
    gitOutputIn(directory, ['checkout', '-q', '-b', 'ticket-001']);
    return { directory, reviewStartCommit: commitFile(directory, 'feature.ts', 'export const feature = true;\n') };
  }

  function recordReview(scenario: string, directory: string, commits: Record<string, string>, scenarioCalls: RecordedScenarioCalls): void {
    expect(recordScenario(scenario, { repositoryDirectory: directory, commits }, scenarioCalls)).toBeGreaterThan(0);
  }

  test('a pass that changed nothing', () => {
    const { directory, reviewStartCommit } = reviewedBranch();
    recordReview(GIT_SCENARIOS.REVIEW_WITHOUT_CHANGES, directory, { '<review start>': reviewStartCommit }, REVIEW_PASS_WITHOUT_CHANGES_CALLS);
  });

  test.each([
    [GIT_SCENARIOS.REVIEW_WITH_A_FIX, 'fix.ts', '// An example comment.\nexport const fixed = true;\n'],
    [GIT_SCENARIOS.REVIEW_WITH_MANY_REWORKED_LINES, 'rework.ts', manyCodeLines()],
  ])('%s', (scenario, fileName, content) => {
    const { directory, reviewStartCommit } = reviewedBranch();
    const fix = commitFile(directory, fileName, content);
    recordReview(scenario, directory, { '<review start>': reviewStartCommit, '<fix>': fix }, reviewPassScenarioCalls('<review start>', '<fix>'));
  });

  test('a pass with an old file fixed, then a second pass adding a new file of many lines', () => {
    const { directory, reviewStartCommit } = reviewedBranch();
    const fix = commitFile(directory, 'example-old.ts', 'export const old = true;\n');
    const firstPassCommits = { '<review start>': reviewStartCommit, '<fix>': fix };
    recordReview(GIT_SCENARIOS.REVIEW_WITH_AN_OLD_FILE_FIX, directory, firstPassCommits, reviewPassScenarioCalls('<review start>', '<fix>'));
    const secondFix = commitFile(directory, 'example-new.ts', manyCodeLines());
    const commits = { ...firstPassCommits, '<second fix>': secondFix };
    recordReview(GIT_SCENARIOS.SECOND_REVIEW_WITH_A_NEW_FILE, directory, commits, reviewPassScenarioCalls('<fix>', '<second fix>'));
  });
});
