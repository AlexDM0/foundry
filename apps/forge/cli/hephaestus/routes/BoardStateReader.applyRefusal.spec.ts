/**
 * The Apply refusal of the board document Hephaestus serves, read from a store holding an open setup. What matters: the served
 * `applyRefusal` is the verdict `requestApply` gives on the same store, so a standing entity refusal is served as
 * `entity-refusals-stand` and the refusal is `null` once an edit clears it.
 */
import { writeFileSync } from 'node:fs';

import { afterAll, expect, test } from 'bun:test';

import { PipelineFile }                                   from '../../../src/adapters/pipeline/PipelineFile.ts';
import type { Pipeline }                                  from '../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineDraftEdit, PipelineSetupOpening }   from '../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { BoardDocumentAssembly }                          from '../../../src/services/hephaestus/BoardDocumentAssembly.ts';
import type { BoardStore }                                from '../../../src/services/store/BoardStore.ts';
import { createLocalFilesBoardStore }                     from '../../../src/services/store/LocalFilesBoardStore.ts';
import { localStoreLayoutOf }                             from '../../../src/services/tracker/LocalStoreLayout.ts';
import { workspacePathsFor }                              from '../../../src/services/tracker/Workspace.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                        from '../../../src/testing/LockTakers.ts';
import { nativePlatformPorts }                            from '../../../src/testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                         from '../../../src/testing/TalosChildReadings.ts';
import { createCapturedCommandContext }                   from '../../testing/CapturedCommandContext.ts';
import { readBoardState }                                 from './BoardStateReader.ts';

const STARTED_AT = '2026-11-21T09:00:00+01:00';
const CHANGED_AT = '2026-11-21T10:00:00+01:00';
const FROZEN_NOW = new Date('2026-11-21T11:00:00+01:00');

const NO_PHASES = { build: [], review: [], merge: [] };

const STORED_WEB_AND_API: Pipeline = {
  version:  5,
  prepare:  [],
  gates:    [],
  phases:   NO_PHASES,
  entities: {
    web: {
      kind: 'app', home: ['/apps/web'], prepare: [], gates: [], phases: NO_PHASES
    },
    api: {
      kind: 'app', home: ['/apps/api'], prepare: [], gates: [], phases: NO_PHASES
    },
  },
};

const UPDATE_OPENING: PipelineSetupOpening = {
  mode: 'update', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
};

const repositoryDirectory = createScratchDirectory('board-state-apply-refusal');
afterAll(() => removeScratchDirectory(repositoryDirectory));

const workspace = workspacePathsFor(repositoryDirectory);

async function storeWithAnOpenSetupOverWebAndApi(): Promise<{ store: BoardStore; setupId: string }> {
  const store = createLocalFilesBoardStore({ workspace, now: () => FROZEN_NOW, lockTaker: LIVE_HOLDERS_LOCK_TAKER });
  await store.initialise({ project: 'Example Agency', startedAt: STARTED_AT, trackerId: 'example-tracker' });
  writeFileSync(localStoreLayoutOf(workspace).pipelineRecordPath, PipelineFile.contentsOf(STORED_WEB_AND_API));
  const opened = await store.transactions.transact({
    at:     CHANGED_AT,
    mutate: (transaction) => transaction.board.openSetup(UPDATE_OPENING, transaction.at).setup.setupId,
  });
  return { store, setupId: opened.result };
}

async function moveApiHomeTo(store: BoardStore, setupId: string, home: string): Promise<void> {
  await store.transactions.transact({
    at:     CHANGED_AT,
    mutate: (transaction) => {
      const revision = transaction.board.pipelineSetup()?.draftRevision ?? 0;
      const edit: PipelineDraftEdit = { target: 'entity', entityKey: 'api', value: { kind: 'app', home: [home] } };
      transaction.board.editDraft(setupId, { by: 'user', revision, edits: [{ edit, summary: 'Move api.' }] }, transaction.at);
    },
  });
}

function servedPipelineSetupOf(store: BoardStore) {
  const read = readBoardState({
    context:       createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW }),
    workspace,
    boardReads:    store.reads,
    boardChildren: talosChildReadingsWith(nativePlatformPorts(), workspace.trackerDirectory),
    notices:       () => [],
    hephaestus:    () => ({
      state: 'serving', url: null, generation: null, codeVersion: 'code-example', installVersion: 1, batonPassWarning: null
    }),
  });
  return BoardDocumentAssembly.boardDocumentOf({ ...read, now: FROZEN_NOW }).pipelineSetup;
}

test('a standing entity refusal is served as the Apply refusal entity-refusals-stand, and none once an edit clears it', async () => {
  const { store, setupId } = await storeWithAnOpenSetupOverWebAndApi();

  await moveApiHomeTo(store, setupId, '/apps/web');
  const refused = servedPipelineSetupOf(store);

  expect(refused?.entityRefusals.map((refusal) => refusal.reason)).toEqual(['equal-homes']);
  expect(refused?.applyRefusal?.code).toBe('entity-refusals-stand');
  expect(refused?.applyRefusal?.fields).toEqual({ setupId, reasons: ['equal-homes'] });

  await moveApiHomeTo(store, setupId, '/apps/api');

  expect(servedPipelineSetupOf(store)?.applyRefusal).toBeNull();
});
