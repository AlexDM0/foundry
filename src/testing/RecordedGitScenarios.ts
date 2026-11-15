/**
 * A scenario is one named git state of a repository, such as "a commit under .claude/ undone by a later one".
 * `src/lib/git/RecordedGitScenarios.integration.spec.ts` builds the state with real git and records under the scenario's name each call
 * `src/testing/RecordedGitScenarioCalls.ts` names; a default spec enters the scenario through `useRecordedGit().enterScenario` and is
 * answered from that recording, in any order. The repository folder and each named commit are placeholders in the recording, which the
 * replay fills with the spec's own values.
 */
import { realpathSync } from 'node:fs';

export const SCENARIO_REPOSITORY_PLACEHOLDER = '<repository>';

/** The scenarios the recorders record, each named for its git state. */
export const GIT_SCENARIOS = {
  PIPELINE_AGENT_SNAPSHOT_UNTOUCHED:    'a pipeline agent snapshot at <start>, untouched',
  PIPELINE_AGENT_SNAPSHOT_FILE_CHANGED: 'a pipeline agent snapshot at <start>, package.json changed',
  PIPELINE_AGENT_SNAPSHOT_FILE_ADDED:   'a pipeline agent snapshot at <start>, pipeline.json untracked',
  PIPELINE_AGENT_SNAPSHOT_COMMITTED:    'a pipeline agent snapshot at <start>, the commit <moved> made on it',
  PIPELINE_AGENT_SNAPSHOT_BRANCH_ADDED: 'a pipeline agent snapshot at <start>, the branch pipeline-agent-moved made at <start>',
  BUILT:                                'a branch built from <start> to <head>, clean',
  BUILT_THEN_RESET:                     'a branch built from <start> to <rewritten>, reset to <start>',
  BUILT_WITH_AN_UNTRACKED_FILE:         'a branch built from <start> to <head>, left-behind.txt untracked',
  DATA_FOLDER_COMMITTED:                'a branch built from <start>, the data folder committed at <head>',
  DATA_FOLDER_COMMITTED_IN_CAPITALS:    'a branch built from <start>, the data folder committed in capitals at <head>',
  DATA_FOLDER_QUOTED_NAME_COMMITTED:    'a branch built from <start>, a data folder file named with a quote and a tab committed at <head>',
  LOWER_CASE_AGENTS_FILE_COMMITTED:     'a branch built from <start>, agents.md committed at <head>',
  HONEST_CASE_COMMITTED:                'a branch built from <start>, agents.md committed at <honest start>, Docs/Agents-Example.md at <head>',
  DATA_AND_PACKAGE_UNDONE:              'a branch built from <start>, the data folder and package.json committed, then removed at <head>',
  ATTRIBUTION_TRAILER_COMMITTED:        'a branch built from <start>, a commit with an AI attribution trailer at <head>',
  TARGET_MERGED:                        'a branch at <branch tip> merging <target tip> at <head>, cleanly',
  TARGET_HISTORY_MERGED:                'a branch at <branch tip> merging <target tip> at <head>, the target holding package.json, data, config and a trailer',
  RESOLUTION_CHANGES_CHECKED_FILES:     'a branch at <branch tip> merging <target tip> at <head>, the resolution adding package.json and data, the merge with a trailer',
  CONFLICT_RESOLVED_ELSEWHERE:          'a branch at <branch tip> merging <target tip> at <head>, target.ts conflicted and resolved, package.json from the target',
  COMMIT_AFTER_TARGET_HISTORY:          'a branch at <branch tip> merging <target tip>, the target holding package.json, a package.json commit at <head>',
  PACKAGE_JSON_COMMITTED:               'a branch built from <start>, package.json committed at <head>',
  PACKAGE_JSON_THEN_PYPROJECT:          'a branch built from <start> to <feature>, package.json and then pyproject.toml committed at <head>',
  ESLINT_CONFIG_COMMITTED:              'a branch built from <start>, eslint.config.js committed at <head>',
  INSTRUCTION_FILE_COMMITTED:           'a branch built from <start>, example-constitution.md committed at <head>',
  MAIN_INSTRUCTION_FILE_MERGED:         'ticket-001 built from <start>, main committing example-constitution.md at <main tip>, merged in at <head>',
  OWN_INSTRUCTION_EDIT_AFTER_MERGE:     'ticket-001 built from <start>, main\'s example-constitution.md at <main tip> merged in, then changed at <head>',
  INSTRUCTION_EDIT_IN_THE_MERGE:        'ticket-001 built from <start>, main\'s example-constitution.md at <main tip> merged in at <head> with other text',
  ONE_COMMIT:                           'a repository on main at <start>',
  AGENT_CONFIG_UNDONE:                  'main from <start>, .claude/settings.json committed, then removed at <head>',
  MCP_FILE_UNTRACKED:                   'main at <start>, .mcp.json untracked',
  HOOKS_PATH_SET:                       'main at <start>, core.hooksPath example-hooks',
  HOOKS_PATH_OTHER_FOLDER_COMMIT:       'main from <start>, core.hooksPath example-hooks, other-hooks/pre-commit committed at <head>',
  HOOKS_PATH_HOOK_COMMIT:               'main from <start>, core.hooksPath example-hooks, other-hooks/pre-commit and then example-hooks/pre-commit committed',
  NESTED_HOOKS_PATH_SET:                'main at <start>, core.hooksPath tools/git-hooks',
  NESTED_HOOKS_PATH_HOOK_COMMIT:        'main from <start>, core.hooksPath tools/git-hooks, tools/git-hooks/pre-commit committed at <head>',
  CLAUDE_FOLDER_IN_CAPITALS:            'main from <start>, .CLAUDE/settings.json committed at <head>',
  CLAUDE_FOLDER_CAPITALISED:            'main from <start>, .Claude/agents/example.md committed at <head>',
  MCP_FILE_IN_CAPITALS:                 'main from <start>, .MCP.json committed at <head>',
  CLAUDE_FILE_QUOTED_NAME:              'main from <start>, .claude/agents/example"quoted.md committed at <head>',
  CLAUDE_FILE_QUOTED_NAME_UNTRACKED:    'main at <start>, .claude/example"untracked.md untracked',
  HONEST_CAPITALS_COMMITTED:            'main from <start>, Src/Example.ts and Example.MCP.json committed',
  TICKET_BRANCH_MADE:                   'main at <start>, ticket-007 made there and checked out',
  TICKET_BRANCH_ADDS_AGENT_CONFIG:      'main at <start>, ticket-007 checked out, .claude/settings.json committed at <head>',
  OWN_BRANCH_MOVED:                     'main moved from <start> to <head>',
  FOREIGN_BRANCH_ADDED:                 'main moved from <start> to <head>, example-foreign made at <start>',
  TARGET_AND_JOB_BRANCH_ADDED:          'main at <start>, example-target and ticket-009 made there',
  DETACHED_WORKTREE_AT_START:           'main at <start>, a worktree example-detached beside it, detached at <start>',
  DETACHED_WORKTREE_MOVED:              'main at <start>, a worktree example-detached beside it, detached and moved to <moved>',
  GROUP_RELEASE_LAUNCHED:               'main at <start>, group-example and ticket-378 there, ticket-020 checked out',
  GROUP_RELEASE_LANDED:                 'ticket-020 from <start> to <landed>, main moved to <landed>, group-example and ticket-378 deleted',
  REFRESH_WORKTREE_ADDED:               'ticket-020 at <start>, a refresh worktree beside it, detached at <start>',
  REFRESH_WORKTREE_MERGED_INTO:         'ticket-020 at <start>, a refresh worktree beside it, detached and moved to <moved>',
  REFRESH_WORKTREE_REMOVED:             'ticket-020 at <start>, the refresh worktree removed',
  OWN_TICKET_BRANCH_MADE:               'main at <start>, ticket-020 made there and checked out',
  TICKET_LANDED_MID_BUILD:              'ticket-020 at <start>, ticket-019 and main moved to <landed>',
  LANDED_TICKET_BRANCH_REMADE:          'ticket-020 at <start>, main at <landed>, ticket-019 made again at <start>',
  LANDED_TICKET_BRANCH_DELETED:         'ticket-020 at <start>, main at <landed>, ticket-019 deleted',
  OTHER_TICKET_LAUNCHED:                'main at <start>, ticket-001 and example-protected there, ticket-002 checked out',
  OTHER_TICKET_LANDED:                  'ticket-002 from <start> to <own tip>, ticket-001 and main moved to <landed>',
  PROTECTED_BRANCH_MOVED:               'ticket-002 at <own tip>, main at <landed>, example-protected moved to <own tip>',
  OWN_TARGET_MOVED_PAST_LANDING:        'ticket-002 at <own tip>, ticket-001 at <landed>, main moved past it to <own tip>',
  BRANCHES_TO_DELETE_MADE:              'main at <start>, ticket-021 and group-example made there',
  REVIEW_WITHOUT_CHANGES:               'ticket-001 off main, its review starting at <review start>, nothing changed since',
  REVIEW_WITH_A_FIX:                    'ticket-001 off main, its review starting at <review start>, fix.ts committed at <fix>',
  REVIEW_WITH_MANY_REWORKED_LINES:      'ticket-001 off main, its review starting at <review start>, rework.ts of many code lines committed at <fix>',
  REVIEW_WITH_AN_OLD_FILE_FIX:          'ticket-001 off main, its review starting at <review start>, example-old.ts committed at <fix>',
  SECOND_REVIEW_WITH_A_NEW_FILE:        'ticket-001 off main, a second review starting at <fix>, example-new.ts of many code lines committed at <second fix>',
  BRANCHES_DELETED:                     'main at <start>, ticket-021 and group-example deleted',
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
