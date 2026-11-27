/**
 * The gate run on a merged tree when `pipeline.json` cannot be read. What matters: an older or a malformed file never passes the tree
 * as a pipeline with no gates; the run ends `cannot-run`, which opens `gate-cannot-run` and holds the merge, and names the stored pipeline and why.
 * A readable file, or none, is gated as before. The pass reads the pipeline through the store's judged reading, so a tracker in a folder whose
 * stored pipeline holds entities gets the same answer as the pass's own write, which opens the Board on that pipeline unreadable.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { UNREADABLE_PIPELINE_STEP, unreadablePipelineGateOf } from '../../adapters/gate-outcome/UnreadablePipelineGate.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                            from '../../testing/LockTakers.ts';
import { createScratchDirectory, removeScratchDirectory }     from '../../testing/ScratchWorkspace.ts';
import type { BoardStore }                                    from '../store/BoardStore.ts';
import { createLocalFilesBoardStore }                         from '../store/LocalFilesBoardStore.ts';
import { workspacePathsFor }                                  from '../tracker/Workspace.ts';

const STARTED_AT = '2026-11-17T09:00:00+01:00';
const CHANGED_AT = '2026-11-17T10:00:00+01:00';

describe('a merged-tree gate run on a pipeline.json it cannot read', () => {
  test('the step names the stored pipeline, never the file it is kept in', () => {
    expect(UNREADABLE_PIPELINE_STEP).toBe('stored-pipeline');
  });

  test('an older file ends the run cannot-run at the stored pipeline\'s step, with no stamp', () => {
    expect(unreadablePipelineGateOf({ verdict: 'older' })).toEqual({
      outcome: 'cannot-run', step: UNREADABLE_PIPELINE_STEP, output: 'older', stamp: null
    });
  });

  test('a malformed file ends the run cannot-run with the reason it is malformed', () => {
    expect(unreadablePipelineGateOf({ verdict: 'malformed', problem: { code: 'not-a-list', field: 'gates' } }))
      .toEqual({
        outcome: 'cannot-run', step: UNREADABLE_PIPELINE_STEP, output: 'gates is not a list', stamp: null
      });
  });

  test('a readable file, or no file, runs its gates as before', () => {
    expect(unreadablePipelineGateOf({ verdict: 'absent' })).toBeNull();
    expect(unreadablePipelineGateOf({
      verdict:  'readable',
      pipeline: {
        version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
      }
    } as Parameters<typeof unreadablePipelineGateOf>[0])).toBeNull();
  });
});

describe('the merged-tree gate of a tracker in a folder whose stored pipeline holds entities', () => {
  let repositoryRoot = '';

  beforeEach(() => {
    repositoryRoot = createScratchDirectory('unreadable-pipeline-gate');
    // Finding the project's prefix runs no git, so the repository is its planted `.git` folder.
    mkdirSync(join(repositoryRoot, '.git'));
  });

  afterEach(() => {
    removeScratchDirectory(repositoryRoot);
  });

  async function initialisedStoreIn(projectFolder: string): Promise<BoardStore> {
    const workspace = workspacePathsFor(join(repositoryRoot, projectFolder));
    mkdirSync(workspace.trackerDirectory, { recursive: true });
    const store = createLocalFilesBoardStore({ workspace, now: () => new Date(Date.parse(CHANGED_AT)), lockTaker: LIVE_HOLDERS_LOCK_TAKER });
    await store.initialise({ project: 'Example Agency', startedAt: STARTED_AT, trackerId: `example-tracker-${projectFolder === '' ? 'root' : 'web'}` });
    return store;
  }

  test('answers the stored pipeline\'s step, as the pass\'s own write reads that pipeline unreadable', async () => {
    const atTheRoot = await initialisedStoreIn('');
    const inAFolder = await initialisedStoreIn('apps/web');
    await atTheRoot.transactions.transact({
      at:     CHANGED_AT,
      mutate: (transaction) => {
        transaction.board.setNoGates(transaction.at).pipeline.entities = {
          web: {
            kind: 'app', home: ['/apps/web'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
          },
        };
      },
    });
    writeFileSync(inAFolder.reads.locationOf({ record: 'pipeline' }), atTheRoot.reads.storedPipelineText() ?? '');

    const gate = unreadablePipelineGateOf(inAFolder.reads.readPipeline());
    const openedOn = await inAFolder.transactions.transact({ at: CHANGED_AT, mutate: (transaction) => transaction.unreadablePipeline });

    expect(gate).toMatchObject({ outcome: 'cannot-run', step: UNREADABLE_PIPELINE_STEP, stamp: null });
    expect(gate?.output).toContain('(entities-in-a-folder)');
    expect(openedOn.result).toMatchObject({ verdict: 'malformed', problem: { code: 'entities-in-a-folder', projectPrefix: 'apps/web' } });
    expect(unreadablePipelineGateOf(atTheRoot.reads.readPipeline())).toBeNull();
  });
});
