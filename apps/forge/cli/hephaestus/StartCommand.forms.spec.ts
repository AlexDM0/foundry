/**
 * `start`'s three forms, answered in this process so no Hephaestus starts: which options each form takes, what a successor refuses, the
 * confinement preflight of the foreground and the detached form, and the detached form with a Hephaestus live, which starts nothing.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { Baton }                                          from '../../src/services/hephaestus/Baton.ts';
import { hephaestusFilesIn }                              from '../../src/services/hephaestus/HephaestusFiles.ts';
import { requireWorkspace }                               from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                  from '../../src/shared/constants/ProductNames.ts';
import { FAKE_MISSING_TOOLS_REASON, fakeGateConfinement } from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                            from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                 from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                         from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                           from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                 from '../Main.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }         from '../testing/InitializedScratchRepository.ts';
import { storedProgressOf }                               from '../testing/StoredProgress.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const recordedGit = useRecordedGit();

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the options each form of start takes', () => {
  test('--started-by refuses a value other than user or login-item at exit 1', async () => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['start', '--foreground', '--started-by', 'cron', '--port', '0'], context)).toBe(1);
    expect(context.errorText()).toContain('"cron" is not a start origin. Write user or login-item.');
  });

  test('--started-by beside --successor-of is refused at exit 1: a successor\'s origin is the Hephaestus it takes over from', async () => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['start', '--successor-of', '2', '--started-by', 'user', '--port', '0'], context)).toBe(1);
    expect(context.errorText()).toContain('--started-by cannot go with --successor-of');
  });
  test('--successor-of takes a whole number and nothing else', async () => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['start', '--successor-of', 'two', '--port', '0'], context)).toBe(1);
    expect(context.errorText()).toContain('"two" is not a Baton generation. Write a whole number.');
    expect(context.errorText()).toContain(`${PRODUCT_NAMES.PROGRAM} start --successor-of <generation> [--port <n>]`);
  });

  test.each([
    [['start', '--detach', '--port', '0'], '--detach'],
    [['start', '--foreground', '--detach', '--port', '0'], '--detach'],
    [['start', '--foreground', '--json', '--port', '0'], '--json'],
    [['start', '--successor-of', '2', '--repository', 'elsewhere', '--port', '0'], '--repository'],
  ])('%j refuses %s as an unknown option at exit 1, before anything starts', async (commandLine, option) => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });

    expect(await runCommandLine(commandLine, context)).toBe(1);

    expect(context.errorText()).toContain(option);
    expect(context.errorText()).toContain(`${PRODUCT_NAMES.PROGRAM} start`);
    expect(Baton.batonGenerationsIn(hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory).hephaestusDirectory)).toEqual([]);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the confinement preflight', () => {
  const STARTS = [[['start', '--foreground', '--port', '0']], [['start', '--port', '0']]];

  test.each(STARTS)('%j on an adapter reporting missing tools refuses once at exit 1, naming them, with no Baton', async (commandLine) => {
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory,
      platformPorts:    { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement('unavailable') },
    });

    expect(await runCommandLine(commandLine, context)).toBe(1);

    expect(context.errorText().trim()).toBe(`Gates and install lines cannot run confined here, so Hephaestus did not start: ${FAKE_MISSING_TOOLS_REASON}.`);
    expect(context.errorText()).toContain('bubblewrap, socat and ripgrep');
    expect(storedProgressOf(repositoryDirectory).jobs ?? []).toEqual([]);
    expect(Baton.newestBatonOf(nativePlatformPorts(), hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory).hephaestusDirectory).verdict).not.toBe('live');
  });
});
