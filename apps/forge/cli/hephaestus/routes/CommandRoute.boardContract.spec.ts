/**
 * The board's command kinds of the contract a view sends to `POST /api/v3/commands`, under `controlVersion` 3. What
 * matters: `BOARD_COMMAND_CONTRACT_KINDS` names exactly the package's `ForgeBoardCommand` kinds, both ways, which the typecheck and a
 * runtime comparison hold, and no kind is in both contract lists; a board kind applied through the route answers 200
 * `{controlVersion: 3, outcome, result}`, and a body of it missing a field answers 400 and writes nothing; a typed draft edit inside an
 * entity lands, and an edit written as a field string is malformed.
 */
import { readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';
import type { ForgeBoardCommand } from 'forge-contracts/BoardCommand';

import type { PipelineSetup }                                                  from '../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { localStoreLayoutOf }                                                  from '../../../src/services/tracker/LocalStoreLayout.ts';
import { requireWorkspace }                                                    from '../../../src/services/tracker/Workspace.ts';
import { BOARD_COMMAND_CONTRACT_KINDS, CONTROL_CONTRACT_KINDS }                from '../../../src/shared/constants/HephaestusApiContracts.ts';
import { useRecordedGit }                                                      from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                              from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                           from '../../../src/testing/ToolGuard.ts';
import { boardStoreIn }                                                        from '../../BoardStoreOf.ts';
import { createArgumentParser }                                                from '../../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }                                        from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                              from '../../testing/InitializedScratchRepository.ts';
import { MAIN_WITHOUT_A_CONSTITUTION }                                         from '../../testing/RecordedGitStages.ts';
import { COMMAND_ROUTE_KINDS, answerControlCommand, type CommandRouteRequest } from './CommandRoute.ts';

const FROZEN_NOW = new Date('2026-11-19T10:00:00+01:00');


type BoardCommandKind = ForgeBoardCommand['kind'];

type ListedBoardKind = (typeof BOARD_COMMAND_CONTRACT_KINDS)[number];

type KindsAreTheSame = [ListedBoardKind] extends [BoardCommandKind] ? ([BoardCommandKind] extends [ListedBoardKind] ? true : false) : false;

const LIST_COVERS_THE_CONTRACT_BOTH_WAYS: KindsAreTheSame = true;

const EVERY_BOARD_KIND: Readonly<Record<BoardCommandKind, true>> = {
  'chart-range-set':            true,
  'decision-answer':            true,
  'gate-profile-start':         true,
  'gate-profile-stop':          true,
  'intake-close':               true,
  'intake-start':               true,
  'job-fresh':                  true,
  'job-message':                true,
  'job-stop':                   true,
  'merge-accept':               true,
  'merge-update':               true,
  'pipeline-agent-advise':      true,
  'pipeline-apply':             true,
  'pipeline-apply-cancel':      true,
  'pipeline-assistant-set':     true,
  'pipeline-check':             true,
  'pipeline-constitution-edit': true,
  'pipeline-draft-discard':     true,
  'pipeline-draft-edit':        true,
  'pipeline-draft-undo':        true,
  'pipeline-setup-answer':      true,
  'pipeline-setup-billing':     true,
  'pipeline-setup-resume':      true,
  'pipeline-setup-start':       true,
  'pipeline-setup-start-over':  true,
  'pipeline-setup-step':        true,
  'pipeline-update-start':      true,
  'ticket-deliver-by-hand':     true,
  'ticket-hold':                true,
  'ticket-network':             true,
  'ticket-park':                true,
  'ticket-priority':            true,
  'ticket-ready':               true,
  'ticket-unhold':              true,
  'tracker-clear':              true,
};

const MALFORMED_ANSWER = {
  status: 400,
  body:   {
    controlVersion: 3, refusal: 'malformed-body', fields: {}, text: expect.any(String)
  }
};

const recordedGit = useRecordedGit();
let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('board-contract', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function routeRequest(): CommandRouteRequest {
  const context   = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const workspace = requireWorkspace(repositoryDirectory);
  return {
    commandArguments: createArgumentParser([]),
    context,
    workspace,
    boardStore:       boardStoreIn(context, workspace),
    launchesHeld:     () => false,
    onRuntimeCommand: () => Promise.resolve('done'),
    wake:             () => undefined,
  };
}

function progressText(): string {
  return readFileSync(localStoreLayoutOf(requireWorkspace(repositoryDirectory)).progressRecordPath, 'utf8');
}

function storedSetup(): PipelineSetup {
  return JSON.parse(readFileSync(localStoreLayoutOf(requireWorkspace(repositoryDirectory)).pipelineSetupRecordPath, 'utf8')) as PipelineSetup;
}

async function answerOf(body: unknown): Promise<{ status: number; body: unknown }> {
  return await answerControlCommand(body, routeRequest());
}

describeWhenGitIsRecorded('the board commands of the contract', () => {
  test('the listed kinds are exactly the contract\'s, both ways, each a kind the route takes and none a control contract kind', () => {
    expect(LIST_COVERS_THE_CONTRACT_BOTH_WAYS).toBe(true);
    const listedKinds: readonly string[] = [...BOARD_COMMAND_CONTRACT_KINDS].sort();
    expect(listedKinds).toEqual(Object.keys(EVERY_BOARD_KIND).sort());
    expect(BOARD_COMMAND_CONTRACT_KINDS.filter((kind) => !COMMAND_ROUTE_KINDS.includes(kind))).toEqual([]);
    expect(BOARD_COMMAND_CONTRACT_KINDS.filter((kind) => (CONTROL_CONTRACT_KINDS as readonly string[]).includes(kind))).toEqual([]);
  });

  test('a priority set on a filed ticket answers 200 with control version 3 and the outcome done', async () => {
    const filed = await answerOf({
      kind: 'ticket-add', title: 'Example ticket', type: 'ticket', dependsOn: [], epics: [], network: [], introducedBy: null, foundInReview: null, bodyText: null
    });
    expect(filed.status).toBe(200);
    const body: ForgeBoardCommand = { kind: 'ticket-priority', ticketReference: '1', priority: 'high' };

    expect(await answerOf(body)).toEqual({ status: 200, body: { controlVersion: 3, outcome: 'done', result: expect.anything() } });
  });

  test('a priority with no ticket answers 400 malformed-body and writes nothing', async () => {
    const progressBefore = progressText();

    expect(await answerOf({ kind: 'ticket-priority', priority: 'high' })).toEqual(MALFORMED_ANSWER);
    expect(progressText()).toBe(progressBefore);
  });

  test('a typed draft edit inside an entity lands, and an edit written as a field string is malformed', async () => {
    const startBody: ForgeBoardCommand = { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false };
    const started = await recordedGit.playStage(MAIN_WITHOUT_A_CONSTITUTION, async () => await answerOf(startBody));
    expect(started.status).toBe(200);
    const typedEdit: ForgeBoardCommand = {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [
        { target: 'entity', entityKey: 'web', value: { kind: 'root', home: ['/'] } },
        { target: 'within-entity', entityKey: 'web', edit: { target: 'concurrency', value: 2 } },
      ],
    };

    expect(await answerOf(typedEdit)).toEqual({ status: 200, body: { controlVersion: 3, outcome: 'done', result: expect.anything() } });
    expect(storedSetup().draft?.entities?.['web']?.concurrency).toBe(2);
    const fieldStringEdit = {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 1, edits: [{ field: 'entity:web/concurrency', value: 3 }]
    };
    expect(await answerOf(fieldStringEdit)).toEqual(MALFORMED_ANSWER);
    expect(storedSetup().draft?.entities?.['web']?.concurrency).toBe(2);
  });
});
