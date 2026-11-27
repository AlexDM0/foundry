/**
 * A picture upload as the routes answer it. What matters: an upload past the size limit answers 413 `picture-too-large` and bytes that are
 * no accepted picture 415 `picture-type-unsupported`, each worded with its fields, and nothing is stored for either.
 */
import { existsSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { HephaestusRoutes }                  from '../../../src/services/hephaestus/HephaestusServer.ts';
import { createUnreadableBoardFiles }             from '../../../src/services/hephaestus/UnreadableBoardFiles.ts';
import { PictureStore }                           from '../../../src/services/tracker/PictureStore.ts';
import { requireWorkspace }                       from '../../../src/services/tracker/Workspace.ts';
import { PICTURE_SIZE_LIMIT_BYTES }               from '../../../src/shared/constants/HephaestusLimits.ts';
import { useRecordedGit }                         from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                 from '../../../src/testing/TalosChildReadings.ts';
import { describeWhenGitIsRecorded }              from '../../../src/testing/ToolGuard.ts';
import { boardStoreIn }                           from '../../BoardStoreOf.ts';
import { createArgumentParser }                   from '../../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }           from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../../testing/InitializedScratchRepository.ts';
import { hephaestusRoutesOf }                     from './HephaestusRoutes.ts';

const FROZEN_NOW = new Date('2026-11-27T10:00:00+01:00');

const recordedGit = useRecordedGit();
let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('picture-route', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function routesOf(): HephaestusRoutes {
  const context   = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const workspace = requireWorkspace(repositoryDirectory);
  return hephaestusRoutesOf({
    commandArguments:     createArgumentParser([]),
    context,
    workspace,
    boardStore:           boardStoreIn(context, workspace),
    boardChildren:        talosChildReadingsWith(context.platformPorts),
    token:                () => null,
    started:              () => true,
    broker:               () => null,
    monitorStream:        () => null,
    monitorFacts:         () => null,
    log:                  () => undefined,
    unreadableBoardFiles: createUnreadableBoardFiles(() => undefined),
    wake:                 () => undefined,
    launchesHeld:         () => false,
    onRuntimeCommand:     () => Promise.resolve('done'),
    notices:              () => [],
    hephaestus:           () => ({
      state: 'serving', url: null, generation: 3, codeVersion: 'code-example', installVersion: 1, restartWarning: null, unreadableFiles: []
    }),
  });
}

describeWhenGitIsRecorded('a picture upload at the route', () => {
  test('an upload past the size limit answers 413 picture-too-large with its size and the limit', () => {
    const oversizedBytes = PICTURE_SIZE_LIMIT_BYTES + 1;

    expect(routesOf().storePicture({ verdict: 'over-limit', bytes: oversizedBytes })).toEqual({
      status: 413,
      body:   { refusal: 'picture-too-large', fields: { bytes: oversizedBytes, sizeLimitBytes: PICTURE_SIZE_LIMIT_BYTES }, text: expect.any(String) },
    });
  });

  test('bytes that are no accepted picture answer 415 picture-type-unsupported naming the accepted types, and nothing is stored', () => {
    const answer = routesOf().storePicture({ verdict: 'read', bytes: Uint8Array.from([1, 2, 3]) });

    expect(answer).toEqual({
      status: 415,
      body:   { refusal: 'picture-type-unsupported', fields: { mediaTypes: expect.arrayContaining(['image/png']) }, text: expect.stringContaining('image/png') },
    });
    expect(existsSync(PictureStore.picturesFolderOf(requireWorkspace(repositoryDirectory).trackerDirectory))).toBe(false);
  });
});
