/**
 * A pipeline agent's turn end in a repository two trackers and a person share: the own-refs check (`onlyOwnRefsMoved`) watches only the main
 * line and forge's own namespace and worktrees, so others' moves fail no turn, while a tracker with bare branch names refuses them as always.
 * Git answers from `src/testing/TwoTrackerScenarios.ts`, asked at the main checkout.
 */
import { mkdirSync }  from 'node:fs';
import path, { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { LaunchSnapshot }                                                from '../../adapters/@types/LaunchSnapshot.ts';
import { RepositoryLandings }                                                 from '../../lib/git/RepositoryLandings.ts';
import type { Board }                                                         from '../../lib/tracker-model/Board.ts';
import { type BranchNames, branchNamesOf }                                    from '../../shared/BranchNames.ts';
import { WorktreesFolder }                                                    from '../../shared/WorktreesFolder.ts';
import { PRODUCT_NAMES }                                                      from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }                                        from '../../testing/BoardFixtures.ts';
import { fakeAgentAdapter }                                                   from '../../testing/FakeAgentAdapter.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                                            from '../../testing/LockTakers.ts';
import { useRecordedGit }                                                     from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                     from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                          from '../../testing/ToolGuard.ts';
import { TWO_TRACKER_MAIN_LINE, TWO_TRACKER_PROJECTS, TWO_TRACKER_TICKET_ID } from '../../testing/TwoTrackerFixture.ts';
import { TWO_TRACKER_SCENARIOS, type TwoTrackerScenario }                     from '../../testing/TwoTrackerScenarios.ts';
import { CUSTOMS_CHECKS, launchSnapshotOf }                                   from '../lifecycle/Customs.ts';
import type { SharedRepositoryLanding }                                       from '../lifecycle/Landing.ts';
import type { Workspace }                                                     from '../tracker/Workspace.ts';
import { PipelineAgentSessions, type TurnEndContext }                         from './PipelineAgentSessions.ts';

const { FORGE } = TWO_TRACKER_PROJECTS;
const AT = '2026-11-16T12:00:00+01:00';

/** Each commit the replayed scenarios name. */
const COMMITS = {
  '<start>':            '1'.repeat(40),
  '<forge ticket tip>': '2'.repeat(40),
  '<gaia ticket tip>':  '3'.repeat(40),
  '<person tip>':       '4'.repeat(40),
  '<stash>':            '5'.repeat(40),
};

const { enterScenario } = useRecordedGit();

let repositoryDirectory = '';

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('pipeline-agent-two-trackers');
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function enter(scenario: TwoTrackerScenario): void {
  enterScenario(scenario, { repositoryDirectory, commits: COMMITS });
}

/** Every ref of the repository as the main checkout lists it in `scenario`, which is what a snapshot of the main line lists too. */
function launchSnapshotIn(scenario: TwoTrackerScenario): LaunchSnapshot {
  enter(scenario);
  const snapshot = launchSnapshotOf(repositoryDirectory);
  if (snapshot === null) throw new Error(`no launch snapshot in ${scenario}`);
  return snapshot;
}

/** The fixture names a ticket branch under its project's namespace alone, `forge/ticket-001`, so forge's names are built to match. */
function fixtureBranchNamesOf(namespace: string): BranchNames {
  const bareNames = branchNamesOf(null);
  const namespacePrefix = `${namespace}/`;
  return {
    ...bareNames,
    namespacePrefix,
    ticketBranchPrefix: `${namespacePrefix}${bareNames.ticketBranchPrefix}`,
    groupTargetPrefix:  `${namespacePrefix}${bareNames.groupTargetPrefix}`,
    ticketBranchOf:     (ticketId) => `${namespacePrefix}${bareNames.ticketBranchOf(ticketId)}`,
  };
}

function landingFiles(): SharedRepositoryLanding['files'] {
  return RepositoryLandings.landingFilesOf(join(repositoryDirectory, '.git'), PRODUCT_NAMES.PROGRAM);
}

function forgeTurnEndContext(): TurnEndContext {
  const rootDirectory = join(repositoryDirectory, FORGE.folder);
  return {
    workspace:        { rootDirectory, trackerDirectory: join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER) } as unknown as Workspace,
    worktreesRoot:    WorktreesFolder.worktreesRootOf(rootDirectory),
    branchNames:      fixtureBranchNamesOf(FORGE.namespace),
    mainLine:         TWO_TRACKER_MAIN_LINE,
    pathStyle:        { pathModule: path, foldsCase: false },
    agentNaming:      fakeAgentAdapter(),
    sharedRepository: {
      trackerId: 'forge-tracker-example', files: landingFiles(), now: () => new Date(AT), lockTaker: LIVE_HOLDERS_LOCK_TAKER
    },
  };
}

function rootTurnEndContext(): TurnEndContext {
  return {
    workspace:     { rootDirectory: repositoryDirectory, trackerDirectory: join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER) } as unknown as Workspace,
    worktreesRoot: WorktreesFolder.worktreesRootOf(repositoryDirectory),
    branchNames:   branchNamesOf(null),
    mainLine:      TWO_TRACKER_MAIN_LINE,
    pathStyle:     { pathModule: path, foldsCase: false },
    agentNaming:   fakeAgentAdapter(),
  };
}

/** Forge's board with its own ticket's build job beside the pipeline agent, whose branch that job's session moves. */
function boardWithPipelineAgent(): { board: Board; agentJobId: string } {
  const { board } = boardFixture({ tickets: [ticketFixture({ id: TWO_TRACKER_TICKET_ID })] });
  board.launchJob({
    kind: 'build', role: 'builder', ticketIds: [TWO_TRACKER_TICKET_ID], parentJobId: null, attempt: 1, target: TWO_TRACKER_MAIN_LINE
  }, AT);
  const { job } = board.startPipelineAgent(AT);
  return { board, agentJobId: job.id };
}

/** The own-refs check at the main checkout, the refs that moved since `launchSnapshot`; `null` when it passes. */
function movedRefsAtTurnEnd(context: TurnEndContext, launchSnapshot: LaunchSnapshot): readonly string[] | null {
  const { board, agentJobId } = boardWithPipelineAgent();
  const job = board.jobById(agentJobId);
  if (job === undefined) throw new Error('the agent is on the board');
  const verdict = CUSTOMS_CHECKS.V14({
    role:                'pipeline-agent',
    worktreePath:        repositoryDirectory,
    startCommit:         COMMITS['<start>'],
    report:              undefined,
    ticketBody:          '',
    contentHashAtLaunch: '',
    ticketContentHash:   '',
    launchSnapshot,
    refMovesAllowed:     PipelineAgentSessions.turnEndRefMovesAllowedOf(context, board, job),
    pathStyle:           context.pathStyle,
    agentNaming:         context.agentNaming,
  });
  return verdict.verdict === 'refused' ? verdict.facts : null;
}

function journalLanding(commit: string): void {
  const files = landingFiles();
  mkdirSync(path.dirname(files.journalFilePath), { recursive: true });
  const appended = RepositoryLandings.appendLanding(files, {
    trackerId: 'gaia-tracker-example', target: TWO_TRACKER_MAIN_LINE, previousTip: COMMITS['<start>'], commit
  });
  if (appended.verdict !== 'appended') throw new Error(`the journal took no line: ${appended.reason}`);
}

describeWhenGitIsRecorded('a pipeline agent\'s turn end beside a sibling tracker', () => {
  test('a sibling\'s ticket branch appearing fails no turn of a namespaced tracker, and refuses one with bare branch names', () => {
    const launchSnapshot = launchSnapshotIn(TWO_TRACKER_SCENARIOS.AT_REST);
    enter(TWO_TRACKER_SCENARIOS.TICKETS_BUILT);

    expect(movedRefsAtTurnEnd(forgeTurnEndContext(), launchSnapshot)).toBeNull();
    expect(movedRefsAtTurnEnd(rootTurnEndContext(), launchSnapshot)).toEqual(['refs/heads/forge/ticket-001', 'refs/heads/gaia/ticket-001']);
  });

  test('a person\'s commit, a stash and a tag fail no turn of a namespaced tracker, and refuse one with bare branch names', () => {
    const launchSnapshot = launchSnapshotIn(TWO_TRACKER_SCENARIOS.AT_REST);
    enter(TWO_TRACKER_SCENARIOS.PERSON_AND_SIBLING_AT_WORK);

    expect(movedRefsAtTurnEnd(forgeTurnEndContext(), launchSnapshot)).toBeNull();
    expect(movedRefsAtTurnEnd(rootTurnEndContext(), launchSnapshot)).toEqual(['refs/heads/person', 'refs/stash', 'refs/tags/example-tag']);
  });

  test('a sibling\'s landing on the main line passes once the journal records it at its commit, and refuses while it does not', () => {
    const launchSnapshot = launchSnapshotIn(TWO_TRACKER_SCENARIOS.TICKETS_BUILT);
    enter(TWO_TRACKER_SCENARIOS.SIBLING_LANDED);

    expect(movedRefsAtTurnEnd(forgeTurnEndContext(), launchSnapshot)).toEqual(['refs/heads/main']);
    journalLanding(COMMITS['<start>']);
    expect(movedRefsAtTurnEnd(forgeTurnEndContext(), launchSnapshot)).toEqual(['refs/heads/main']);
    journalLanding(COMMITS['<gaia ticket tip>']);
    expect(movedRefsAtTurnEnd(forgeTurnEndContext(), launchSnapshot)).toBeNull();
    expect(movedRefsAtTurnEnd(rootTurnEndContext(), launchSnapshot)).toEqual(['refs/heads/main']);
  });
});
