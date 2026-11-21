/**
 * `unpause` with no Hephaestus up, on a new board, which starts paused: it writes the stored drain flag through the write pipeline, and the
 * board state a client reads for its header agrees with `status` afterwards.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { requireWorkspace }                       from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                          from '../../src/shared/constants/ProductNames.ts';
import { fakeGateConfinement }                    from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                    from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                 from '../../src/testing/TalosChildReadings.ts';
import { describeWhenRecorded }                   from '../../src/testing/ToolGuard.ts';
import { boardStoreIn }                           from '../BoardStoreOf.ts';
import { runCommandLine }                         from '../Main.ts';
import { INSTALL_VERSION }                        from '../constants/InstallVersion.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { readBoardState }                         from './routes/BoardStateReader.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const recordedGit = useRecordedGit();

let repositoryDirectory = '';

async function run(commandLine: readonly string[]): Promise<string> {
  const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
  expect(await runCommandLine(commandLine, context), context.errorText()).toBe(0);
  return context.outputText();
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('unpause', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'run unpause', () => {
  test('writes the stored drain flag through the write pipeline with no Hephaestus up', async () => {
    expect(JSON.parse(await run(['unpause', '--json']))).toEqual({ hephaestusState: 'running', previousState: 'paused' });

    const progress = JSON.parse(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'), 'utf8')) as Record<string, unknown>;
    expect(progress['hephaestusState']).toBe('running');
  });

  test('the served board state agrees with status afterwards', async () => {
    await run(['unpause']);

    const status = JSON.parse(await run(['status', '--json'])) as { hephaestus: { paused: boolean } };
    const workspace = requireWorkspace(repositoryDirectory);
    // The real confinement port's probe starts a process.
    const platformPorts = { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement('confined') };
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts });
    const boardState = readBoardState({
      context,
      workspace,
      boardReads:    boardStoreIn(context, workspace).reads,
      boardChildren: talosChildReadingsWith(nativePlatformPorts(), workspace.trackerDirectory),
      notices:       () => [],
      hephaestus:    () => ({
        state: 'serving', url: null, generation: null, codeVersion: 'example', installVersion: INSTALL_VERSION, batonPassWarning: null
      }),
    }).state;
    expect([boardState.hephaestus.paused, status.hephaestus.paused]).toEqual([false, false]);
  });

  test('an extra word is refused at exit 1 with the usage', async () => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });

    expect(await runCommandLine(['unpause', 'now'], context)).toBe(1);

    expect(context.errorText()).toContain(`${PRODUCT_NAMES.PROGRAM} unpause [--json]`);
  });
});
