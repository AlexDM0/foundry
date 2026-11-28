/**
 * The by-hand board kinds, git answered from the recorded branch list: `log-note` logs the note at the hold's stamp; `namespace-set` stores the name,
 * and refuses a job on a branch and a name the repository's branches leave no room for, writing nothing. A failed branch list has no recording, so
 * the wording spec alone holds its detail.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Board }                                             from '../../domain/tracker-model/Board.ts';
import type { ControlCommand }                                    from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                                       from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                          from '../../shared/constants/ProductNames.ts';
import { boardFixture, type BoardFixture }                        from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                                 from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS }   from '../../testing/FixtureRecordAllocation.ts';
import { GIT_CALL_SHAPES, type RecordedGitStage, useRecordedGit } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                              from '../../testing/ToolGuard.ts';
import type { BoardTransaction }                                  from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                      from '../tracker/Workspace.ts';
import { ControlService }                                         from './ControlService.ts';

const CHANGED_AT = '2026-11-20T10:00:00+01:00';

const BRANCH_LIST_ARGUMENTS = ['for-each-ref', '--format=%(refname:short)', 'refs/heads'];

const { playStage } = useRecordedGit();

let repositoryDirectory: string | null = null;

afterEach(() => {
  if (repositoryDirectory === null) return;
  removeScratchDirectory(repositoryDirectory);
  repositoryDirectory = null;
});

function changeOf(board: Board, rootDirectory = '/example-agency/storefront'): BoardTransaction {
  return {
    board,
    workspace:                      workspacePathsFor(rootDirectory),
    at:                             CHANGED_AT,
    records:                        createFixtureRecordAllocation(board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    unreadablePipeline:             null,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function refusalOf(attempt: () => unknown): OperationRefusal {
  try {
    attempt();
  } catch (error) {
    if (error instanceof OperationRefusal) return error;
    throw error;
  }
  throw new Error('the command was not refused');
}

function branchListOf(branch: string): RecordedGitStage {
  return [{ gitArguments: BRANCH_LIST_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.BRANCH_NAMES_OF_ONE, filledIn: { '<branch>': branch } }];
}

/** Applies `namespace-set` in a scratch repository while git answers from `stage`. */
async function namespaceSetIn(fixture: BoardFixture, stage: RecordedGitStage, namespace: string): Promise<unknown> {
  const rootDirectory = createScratchDirectory('by-hand-namespace');
  repositoryDirectory = rootDirectory;
  const command: ControlCommand = { kind: 'namespace-set', namespace };
  return await playStage(stage, () => Promise.resolve(ControlService.apply(command, changeOf(fixture.board, rootDirectory), ECHOED_CONTROL_CONTEXT).result));
}

async function namespaceRefusalIn(fixture: BoardFixture, stage: RecordedGitStage, namespace: string): Promise<OperationRefusal> {
  try {
    await namespaceSetIn(fixture, stage, namespace);
  } catch (error) {
    if (error instanceof OperationRefusal) return error;
    throw error;
  }
  throw new Error('the command was not refused');
}

describe('log-note', () => {
  test('logs the note at the hold\'s stamp and answers it as the verb printed it', () => {
    const fixture = boardFixture();
    const command: ControlCommand = { kind: 'log-note', text: 'Alex Example tried the basket by hand' };

    const { result } = ControlService.apply(command, changeOf(fixture.board), ECHOED_CONTROL_CONTEXT);

    expect(result).toEqual({ at: CHANGED_AT, text: 'Alex Example tried the basket by hand' });
    expect(fixture.records).toHaveLength(1);
    expect(fixture.records[0]).toMatchObject({ at: CHANGED_AT });
  });
});

describe('namespace-set: a job on a branch', () => {
  test('a build job holds the name back with its count, before git is asked', () => {
    const fixture = boardFixture();
    fixture.board.launchJob({
      kind: 'build', role: 'builder', ticketIds: [], parentJobId: null, attempt: 1, target: 'main'
    }, CHANGED_AT);

    const refusal = refusalOf(() => ControlService.apply({ kind: 'namespace-set', namespace: 'web' }, changeOf(fixture.board), ECHOED_CONTROL_CONTEXT));

    expect(refusal.status).toBe('refused');
    expect(refusal.detail).toEqual({ kind: 'namespace-board-has-jobs', jobCount: 1 });
    expect(fixture.board.branchNamespace()).toBeNull();
  });
});

describeWhenGitIsRecorded('namespace-set with git', () => {
  test('stores the name and logs it, the Assistant and the product owner holding no name back', async () => {
    const fixture = boardFixture();
    for (const kind of ['assistant', 'product-owner'] as const) {
      fixture.board.launchJob({
        kind, role: kind, ticketIds: [], parentJobId: null, attempt: 1, target: null
      }, CHANGED_AT);
    }

    const result = await namespaceSetIn(fixture, branchListOf('main'), 'web');

    expect(fixture.board.branchNamespace()).toBe('web');
    expect((result as { logged: unknown[] }).logged.length).toBeGreaterThan(0);
  });

  test('a branch named as the program leaves no room for the namespace: namespace-not-free', async () => {
    const fixture = boardFixture();

    const refusal = await namespaceRefusalIn(fixture, branchListOf(PRODUCT_NAMES.PROGRAM), 'web');

    expect(refusal.detail).toEqual({ kind: 'namespace-not-free', refusal: { reason: 'branch-blocks-namespace', branch: PRODUCT_NAMES.PROGRAM }, wantedNamespace: 'web' });
    expect(fixture.board.branchNamespace()).toBeNull();
  });

});
