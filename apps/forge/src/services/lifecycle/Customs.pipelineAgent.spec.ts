/**
 * The pipeline agent's Customs column on a scratch main-line snapshot, run at each turn end of its session: it reads the repository and
 * writes only its Hatch, so a changed or added file in the snapshot, a commit on it and a moved ref each fail the check. The session owes no
 * report and files nothing, so the column asks for neither: no V1 and no V12. Git answers from the scenarios
 * `src/lib/git/RecordedGitScenarios.integration.spec.ts` records; a call a scenario did not record fails the case.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { LaunchSnapshot }                            from '../../adapters/@types/LaunchSnapshot.ts';
import { fakeAgentAdapter }                               from '../../testing/FakeAgentAdapter.ts';
import { useRecordedGit }                                 from '../../testing/RecordedGit.ts';
import { PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME }            from '../../testing/RecordedGitScenarioCalls.ts';
import { GIT_SCENARIOS }                                  from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../testing/ToolGuard.ts';
import type { CustomsSubject }                            from './@types/CustomsSubject.ts';
import { CHECKS_OF_ROLE, clearCustoms }                   from './Customs.ts';
import { launchSnapshotOf }                               from './CustomsLaunchSnapshot.ts';

const JOB_ID = 'J7';
const START_COMMIT = '1'.repeat(40);
const MOVED_COMMIT = '2'.repeat(40);

const { enterScenario, takeUnansweredCalls } = useRecordedGit();

let repositoryDirectory = '';
let snapshotDirectory = '';
let launchSnapshot: LaunchSnapshot = { refs: {}, hooksFolderDigest: null };

function enter(scenario: string): void {
  enterScenario(scenario, { repositoryDirectory, commits: { '<start>': START_COMMIT, '<moved>': MOVED_COMMIT } });
}

function pipelineAgentSubject(): CustomsSubject {
  return {
    role:                'pipeline-agent',
    worktreePath:        snapshotDirectory,
    startCommit:         START_COMMIT,
    report:              undefined,
    ticketBody:          '',
    contentHashAtLaunch: '',
    ticketContentHash:   '',
    jobId:               JOB_ID,
    logRecords:          [],
    launchSnapshot,
    refMovesAllowed:     {
      ownBranch: '', otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], airlockWorktreeHeads: []
    },
    agentNaming: fakeAgentAdapter(),
  };
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('pipeline-agent-verification');
  snapshotDirectory   = join(repositoryDirectory, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME);
  mkdirSync(join(repositoryDirectory, '.git', 'hooks'), { recursive: true });
  mkdirSync(snapshotDirectory, { recursive: true });
  enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_UNTOUCHED);
  launchSnapshot = launchSnapshotOf(snapshotDirectory) ?? launchSnapshot;
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the pipeline agent passes Customs only having changed nothing', () => {
  test('an untouched snapshot is verified at a turn end with no report', () => {
    expect(clearCustoms(pipelineAgentSubject())).toEqual({ verdict: 'verified' });
  });

  test('a changed tracked file fails V4', () => {
    enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_FILE_CHANGED);

    expect(clearCustoms(pipelineAgentSubject())).toMatchObject({ verdict: 'refused', check: 'V4', reason: 'worktree-dirty' });
  });

  test('a file written into the snapshot outside its Hatch fails V4', () => {
    enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_FILE_ADDED);

    expect(clearCustoms(pipelineAgentSubject())).toMatchObject({ verdict: 'refused', check: 'V4', facts: ['?? pipeline.json'] });
  });

  test('a commit on the snapshot, though it descends from the start, fails V16', () => {
    enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_COMMITTED);

    expect(clearCustoms(pipelineAgentSubject())).toEqual({
      verdict: 'refused', check: 'V16', reason: 'head-moved', facts: [START_COMMIT, MOVED_COMMIT]
    });
  });

  test('a moved branch fails V14', () => {
    enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_BRANCH_ADDED);

    expect(clearCustoms(pipelineAgentSubject())).toMatchObject({
      verdict: 'refused', check: 'V14', reason: 'foreign-ref-moved', facts: ['refs/heads/pipeline-agent-moved']
    });
  });

  test('a git call the scenario did not record fails the case: the main checkout was never asked in it', () => {
    expect(() => launchSnapshotOf(repositoryDirectory)).toThrow('has no recorded answer');
    expect(takeUnansweredCalls()[0]).toEndWith(`the scenario "${GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_UNTOUCHED}" recorded no such call`);
  });

  test('its column is the snapshot checks alone: no report, no commit, no ticket body, no Acceptance and no filed finding', () => {
    expect(CHECKS_OF_ROLE['pipeline-agent']).toEqual(['V16', 'V4', 'V5', 'V13', 'V14']);
  });
});
