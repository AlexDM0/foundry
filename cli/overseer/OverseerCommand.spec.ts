/**
 * The `oversee` verbs that answer in this process, so no Overseer starts: a confinement preflight refuses before any Baton, the Bridge header's
 * board state reads as `status` and `oversee status` do, `oversee pause|resume` write the drain flag with no Overseer up, and `oversee stop` finds
 * nothing to do. An Overseer that runs is held by `cli/overseer/OverseerCommand.integration.spec.ts`.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Baton }                                          from '../../src/services/overseer/Baton.ts';
import { overseerFilesIn }                                from '../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace }                               from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                  from '../../src/shared/constants/ProductNames.ts';
import { FAKE_MISSING_TOOLS_REASON, fakeGateConfinement } from '../../src/testing/FakeGateConfinement.ts';
import { useFakeGit }                                     from '../../src/testing/FakeGit.ts';
import { nativePlatformPorts }                            from '../../src/testing/NativePlatformPorts.ts';
import { removeScratchDirectory }                         from '../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }                                 from '../Main.ts';
import { INSTALL_VERSION }                                from '../constants/InstallVersion.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';
import { createInitializedFakeGitRepository }             from '../testing/InitializedScratchRepository.ts';
import { storedProgressOf }                               from '../testing/StoredProgress.ts';
import { readBoardState }                                 from './routes/BoardStateReader.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const fakeGit = useFakeGit();

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedFakeGitRepository('overseer', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, fakeGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describe('the confinement preflight', () => {
  const STARTS = [[['oversee', '--port', '0']], [['oversee', '--detach', '--port', '0']]];

  test.each(STARTS)('%j on an adapter reporting missing tools refuses once at exit 1, naming them, with no Baton', async (commandLine) => {
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory,
      platformPorts:    { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement('unavailable') },
    });

    expect(await runCommandLine(commandLine, context)).toBe(1);

    expect(context.errorText().trim()).toBe(`Gates and install lines cannot run confined here, so the Overseer did not start: ${FAKE_MISSING_TOOLS_REASON}.`);
    expect(context.errorText()).toContain('bubblewrap, socat and ripgrep');
    expect(storedProgressOf(repositoryDirectory).jobs ?? []).toEqual([]);
    expect(Baton.newestBatonOf(nativePlatformPorts(), overseerFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory).overseerDirectory).verdict).not.toBe('live');
  });
});

describe('the board state the Bridge header reads', () => {
  test.each(['confined', 'unavailable', 'unconfined-by-design'] as const)('states %s, the port\'s word, as status does', async (verdict) => {
    const platformPorts = { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement(verdict) };
    const statusContext = createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts });
    expect(await runCommandLine(['status', '--json'], statusContext)).toBe(0);

    const { state } = readBoardState({
      context:   createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts }),
      workspace: requireWorkspace(repositoryDirectory),
      notices:   () => [],
      overseer:  () => ({
        state: 'serving', url: null, generation: null, codeVersion: 'code-example', installVersion: 1, batonPassWarning: null
      }),
    });

    expect(state['confinement']).toBe(verdict);
    expect((JSON.parse(statusContext.outputText()) as { confinement: string }).confinement).toBe(verdict);
  });
});

describe('run stop', () => {
  test('stop with no Overseer live has nothing to do', async () => {
    const stopped = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['oversee', 'stop'], stopped), stopped.errorText()).toBe(0);
    expect(stopped.outputText().trim()).toBe('No Overseer is live; nothing to stop.');
  });
});

describe('run pause and resume', () => {
  test('write the stored drain flag through the write pipeline with no Overseer up', async () => {
    const paused = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['oversee', 'resume', '--json'], paused), paused.errorText()).toBe(0);
    expect(JSON.parse(paused.outputText())).toEqual({ overseerState: 'running', previousState: 'paused' });
    const resumed = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['oversee', 'pause', '--json'], resumed), resumed.errorText()).toBe(0);
    expect(JSON.parse(resumed.outputText())).toEqual({ overseerState: 'paused', previousState: 'running' });
    const progress = JSON.parse(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'), 'utf8')) as Record<string, unknown>;
    expect(progress['overseerState']).toBe('paused');
  });

  test('the board state the Bridge header reads agrees with oversee status after a resume and after a pause', async () => {
    const pausedFlagsAfter = async (commandLine: readonly string[]): Promise<{ header: boolean; runStatus: unknown }> => {
      const moved = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
      expect(await runCommandLine([...commandLine], moved), moved.errorText()).toBe(0);
      const statusContext = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
      expect(await runCommandLine(['oversee', 'status', '--json'], statusContext), statusContext.errorText()).toBe(0);
      const boardState = readBoardState({
        context:   createCapturedCommandContext({ currentDirectory: repositoryDirectory }),
        workspace: requireWorkspace(repositoryDirectory),
        notices:   () => [],
        overseer:  () => ({
          state: 'serving', url: null, generation: null, codeVersion: 'example', installVersion: INSTALL_VERSION, batonPassWarning: null
        }),
      }).state;
      return { header: boardState.overseer.paused, runStatus: (JSON.parse(statusContext.outputText()) as Record<string, unknown>)['paused'] };
    };
    expect(await pausedFlagsAfter(['oversee', 'resume'])).toEqual({ header: false, runStatus: false });
    expect(await pausedFlagsAfter(['oversee', 'pause'])).toEqual({ header: true, runStatus: true });
  });
});
