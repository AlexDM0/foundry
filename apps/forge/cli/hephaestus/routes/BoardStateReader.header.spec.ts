/**
 * The board state a client reads for its header and its ticket form, over a scratch board with no Hephaestus up: it states the confinement in the
 * port's word, as `status` does, and reads the stored pipeline, so a ready ticket carries its forecast.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { StoreReadFace }                     from '../../../src/services/store/BoardStore.ts';
import { requireWorkspace }                       from '../../../src/services/tracker/Workspace.ts';
import {  fakeGateConfinement }                   from '../../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                    from '../../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                         from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                 from '../../../src/testing/TalosChildReadings.ts';
import { describeWhenRecorded }                   from '../../../src/testing/ToolGuard.ts';
import { boardStoreIn }                           from '../../BoardStoreOf.ts';
import { runCommandLine }                         from '../../Main.ts';
import { createCapturedCommandContext }           from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../../testing/InitializedScratchRepository.ts';
import { fileReadyTicketThrough }                 from '../../testing/ReadyTicketFiling.ts';
import { readBoardState }                         from './BoardStateReader.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const recordedGit = useRecordedGit();

/** The read side of the board in `directory`, as Hephaestus's one store reads it. */
function boardReadsIn(directory: string): StoreReadFace {
  return boardStoreIn(createCapturedCommandContext({ currentDirectory: directory }), requireWorkspace(directory)).reads;
}

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the board state a client reads for its header', () => {
  test.each(['confined', 'unavailable', 'unconfined-by-design'] as const)('states %s, the port\'s word, as status does', async (verdict) => {
    const platformPorts = { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement(verdict) };
    const statusContext = createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts });
    expect(await runCommandLine(['status', '--json'], statusContext)).toBe(0);

    const { state } = readBoardState({
      context:       createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts }),
      workspace:     requireWorkspace(repositoryDirectory),
      boardReads:    boardReadsIn(repositoryDirectory),
      boardChildren: talosChildReadingsWith(nativePlatformPorts(), requireWorkspace(repositoryDirectory).trackerDirectory),
      notices:       () => [],
      hephaestus:    () => ({
        state: 'serving', url: null, generation: null, codeVersion: 'code-example', installVersion: 1, batonPassWarning: null
      }),
    });

    expect(state['confinement']).toBe(verdict);
    expect((JSON.parse(statusContext.outputText()) as { confinement: string }).confinement).toBe(verdict);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the board state a client reads for its ticket form', () => {
  test('reads the stored pipeline, so a ready ticket has its forecast: a builder takes it when a launch slot frees', async () => {
    const run = async (commandLine: readonly string[]): Promise<string> => {
      const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
      expect(await runCommandLine(commandLine, context), context.errorText()).toBe(0);
      return context.outputText();
    };
    await run(['gate', 'none']);
    await fileReadyTicketThrough(run, (output) => output, ['ticket', 'add', '--type', 'ticket', 'Example account pages']);

    const { state } = readBoardState({
      context:       createCapturedCommandContext({ currentDirectory: repositoryDirectory }),
      workspace:     requireWorkspace(repositoryDirectory),
      boardReads:    boardReadsIn(repositoryDirectory),
      boardChildren: talosChildReadingsWith(nativePlatformPorts(), requireWorkspace(repositoryDirectory).trackerDirectory),
      notices:       () => [],
      hephaestus:    () => ({
        state: 'serving', url: null, generation: null, codeVersion: 'code-example', installVersion: 1, batonPassWarning: null
      }),
    });

    expect(state.ticketForecasts.map((forecast) => [forecast.ticketId, forecast.steps[0], forecast.currentStepIndex])).toEqual([
      ['001', { kind: 'build', attempt: 1, jobId: null }, null],
    ]);
  });
});
