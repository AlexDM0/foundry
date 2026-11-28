/**
 * The scope checks on a conflict resolution of a tracker in a project folder (the data folders, the project's folder and its reach, the
 * agent configuration): each judges only what the resolution changed against git's automatic merge, and a tracker at the root asks git
 * nothing. Git states come from `src/lib/git/RecordedGitScenarios.integration.spec.ts`; an unrecorded call fails the case.
 */
import { afterEach, beforeEach, expect } from 'bun:test';

import type { MergeSides }                                from '../../adapters/merge-sides/MergeSidesIngestion.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { fakeAgentAdapter }                               from '../../testing/FakeAgentAdapter.ts';
import { useRecordedGit }                                 from '../../testing/RecordedGit.ts';
import { GIT_SCENARIOS }                                  from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import type { ProjectScope }                              from './@types/CustomsSubject.ts';
import { MergeRun }                                       from './MergeRun.ts';

const PROJECT_PREFIX = 'apps/example';
/** The file each conflict scenario resolves, at the repository's root, outside the project's folder. */
const RESOLVED_FILE = 'target.ts';

const SCENARIO_COMMITS = {
  '<start>':      '1'.repeat(40),
  '<head>':       '2'.repeat(40),
  '<branch tip>': '3'.repeat(40),
  '<target tip>': '4'.repeat(40),
};
const SIDES: MergeSides = { startTip: SCENARIO_COMMITS['<branch tip>'], mergedTip: SCENARIO_COMMITS['<target tip>'] };

const { enterScenario } = useRecordedGit();

let worktreePath = '';

beforeEach(() => {
  worktreePath = createScratchDirectory('merge-run-project-scope');
});

afterEach(() => {
  removeScratchDirectory(worktreePath);
});

function scopeVerdictIn(scenario: string, projectScope: ProjectScope): ReturnType<typeof MergeRun.resolutionScopeVerdictOf> {
  enterScenario(scenario, { repositoryDirectory: worktreePath, commits: SCENARIO_COMMITS });
  return MergeRun.resolutionScopeVerdictOf(worktreePath, SIDES, [RESOLVED_FILE], projectScope, fakeAgentAdapter());
}

testWhenGitIsRecorded('a resolution that changed a file outside the project\'s folder is refused by V17, the target\'s own files left out', () => {
  expect(scopeVerdictIn(GIT_SCENARIOS.CONFLICT_RESOLVED_ELSEWHERE, { projectPrefix: PROJECT_PREFIX, reach: [] }))
    .toEqual({ verdict: 'refused', reason: 'changed-outside-home-and-reach', facts: [RESOLVED_FILE] });
});

testWhenGitIsRecorded('the same resolution is in scope once the reach names the file', () => {
  expect(scopeVerdictIn(GIT_SCENARIOS.CONFLICT_RESOLVED_ELSEWHERE, { projectPrefix: PROJECT_PREFIX, reach: [`/${RESOLVED_FILE}`] }))
    .toEqual({ verdict: 'in-scope' });
});

testWhenGitIsRecorded('a resolution that added a data folder file is refused by V5 before the reach is judged', () => {
  expect(scopeVerdictIn(GIT_SCENARIOS.RESOLUTION_CHANGES_CHECKED_FILES, { projectPrefix: PROJECT_PREFIX, reach: [] }))
    .toEqual({ verdict: 'refused', reason: 'data-folder-touched', facts: [`${PRODUCT_NAMES.DATA_FOLDER}/progress.json`] });
});

testWhenGitIsRecorded('a resolution that added .claude/ inside the project\'s folder is refused by V13', () => {
  expect(scopeVerdictIn(GIT_SCENARIOS.CONFLICT_RESOLVED_WITH_AGENT_CONFIG, { projectPrefix: PROJECT_PREFIX, reach: [`/${RESOLVED_FILE}`] }))
    .toEqual({ verdict: 'refused', reason: 'branch-touches-agent-config', facts: [`${PROJECT_PREFIX}/.claude/settings.json`] });
});

testWhenGitIsRecorded('a tracker at its repository\'s root is in scope without a git call: none is answered, so any would fail the case', () => {
  expect(MergeRun.resolutionScopeVerdictOf(worktreePath, SIDES, [RESOLVED_FILE], { projectPrefix: '', reach: [] }, fakeAgentAdapter())).toEqual({ verdict: 'in-scope' });
});
