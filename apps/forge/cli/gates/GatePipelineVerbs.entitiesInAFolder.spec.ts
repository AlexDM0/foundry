/**
 * `gate list` in a tracker that sits in a folder of its repository, beside a stored pipeline that holds entities. What matters: the verb
 * reads the pipeline as the store judges it, so it is refused `entities-in-a-folder`, naming the stored pipeline and the folder, exactly as a
 * write would be. The `.git` folder is planted, since finding the folder runs no git.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';
import { workspacePathsFor }                              from '../../src/services/tracker/Workspace.ts';
import { entityForgePipelineTextOf }                      from '../../src/testing/EntityForgeFixture.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { writeReadableTracker }                           from '../../src/testing/TrackerFileFixtures.ts';
import { runCommandLine }                                 from '../Main.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';

const PROJECT_FOLDER = 'apps/web';

let repositoryRoot = '';

beforeEach(() => {
  // Resolved, as the tracker's discovery resolves it, so the refusal's path reads the same.
  repositoryRoot = realpathSync(createScratchDirectory('gate-list-entities-in-a-folder'));
  mkdirSync(join(repositoryRoot, '.git'));
});

afterEach(() => {
  removeScratchDirectory(repositoryRoot);
});

test('gate list in a tracker in a folder whose stored pipeline holds entities is refused entities-in-a-folder, naming the pipeline', async () => {
  const projectDirectory = join(repositoryRoot, PROJECT_FOLDER);
  const workspace        = workspacePathsFor(projectDirectory);
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
  writeReadableTracker(workspace);
  writeFileSync(workspace.pipelineFilePath, entityForgePipelineTextOf('strict-isolation'));

  const context  = createCapturedCommandContext({ currentDirectory: projectDirectory });
  const exitCode = await runCommandLine(['gate', 'list', '--json'], context);

  expect(exitCode).toBe(1);
  expect(context.outputText()).toBe('');
  expect(context.errorText()).toContain(`The pipeline ${workspace.pipelineFilePath} of the tracker in the folder ${PROJECT_FOLDER} cannot hold entities`);
});
