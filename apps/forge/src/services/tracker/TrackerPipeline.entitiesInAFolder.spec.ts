/**
 * Entities in a tracker that sits in a folder of its repository. What matters: only a tracker at the repository's root may hold entities,
 * so a change that would store a pipeline with entities in a tracker in a folder is refused with its own detail naming the folder, worded
 * for the command line and the API alike, and nothing is written; the same change in a tracker at the root is stored; and a pipeline
 * without entities is stored in a folder as before. The `.git` folder is planted, since finding the prefix runs no git.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { OperationRefusalWordingUtil }                    from '../../adapters/utils/OperationRefusalWordingUtil.ts';
import type { PipelineEntity }                            from '../../lib/tracker-model/@types/Pipeline.ts';
import { refusalIsOperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { storedFileContentsOf, writeReadableTracker }     from '../../testing/TrackerFileFixtures.ts';
import type { BoardTransaction }                          from './BoardTransaction.ts';
import { writeTracker }                                   from './TrackerPipeline.ts';
import { workspacePathsFor, type Workspace }              from './Workspace.ts';
import { thrownFailureOf }                                from './testing/ThrownFailure.ts';

const CHANGED_AT = '2026-11-17T10:00:00+01:00';

const now = (): Date => new Date('2026-11-17T09:00:00Z');

const EXAMPLE_ENTITIES: Record<string, PipelineEntity> = {
  web: {
    kind: 'app', home: ['/apps/web'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  },
};

let repositoryRoot = '';

beforeEach(() => {
  repositoryRoot = createScratchDirectory('tracker-pipeline-entities');
  mkdirSync(join(repositoryRoot, '.git'));
});

afterEach(() => {
  removeScratchDirectory(repositoryRoot);
});

function trackerIn(projectFolder: string): Workspace {
  const workspace = workspacePathsFor(join(repositoryRoot, projectFolder));
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
  writeReadableTracker(workspace);
  return workspace;
}

function storeNoGates(change: BoardTransaction, entities: Record<string, PipelineEntity> | null): void {
  const { pipeline } = change.board.setNoGates(change.at);
  if (entities !== null) pipeline.entities = entities;
}

test('a pipeline with entities in a tracker in a folder is refused, naming the folder, and nothing is written', async () => {
  const workspace   = trackerIn('apps/web');
  const filesBefore = storedFileContentsOf(workspace);

  const failure = await thrownFailureOf(() => writeTracker({
    workspace, at: CHANGED_AT, now, mutate: (change) => storeNoGates(change, EXAMPLE_ENTITIES)
  }));

  expect(refusalIsOperationRefusal(failure) ? failure.detail : null).toEqual({ kind: 'entities-in-a-folder', filePath: workspace.pipelineFilePath, projectPrefix: 'apps/web' });
  const expectedMessage = `The pipeline ${workspace.pipelineFilePath} of the tracker in the folder apps/web cannot hold entities: only a `
    + 'tracker at the repository\'s root holds them, since an entity\'s home is a folder of the repository. Nothing was written.';
  expect(refusalIsOperationRefusal(failure) ? OperationRefusalWordingUtil.messageOf(failure) : null).toBe(expectedMessage);
  expect(refusalIsOperationRefusal(failure) ? OperationRefusalWordingUtil.apiMessageOf(failure) : null).toBe(expectedMessage);
  expect(storedFileContentsOf(workspace)).toEqual(filesBefore);
});

test('a pipeline with entities in a tracker at the repository\'s root is stored', async () => {
  const workspace = trackerIn('');

  await writeTracker({
    workspace, at: CHANGED_AT, now, mutate: (change) => storeNoGates(change, EXAMPLE_ENTITIES)
  });

  expect(storedFileContentsOf(workspace)['pipeline.json']).toContain('"entities"');
});

test('a pipeline without entities in a tracker in a folder is stored as before', async () => {
  const workspace = trackerIn('apps/web');

  await writeTracker({
    workspace, at: CHANGED_AT, now, mutate: (change) => storeNoGates(change, null)
  });

  expect(JSON.parse(storedFileContentsOf(workspace)['pipeline.json'] ?? 'null')).toEqual({
    version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  });
});
