/**
 * `start`'s start origin and its start gate, over recorded git and the recorded process table, with the detached child a recorded spawn
 * that has exited. What matters: `--started-by` takes `user` or `login-item`, `user` when absent, and hands it to the child; and a login
 * item's start after a crash is refused `forge-off-after-crash` before any spawn, telling the registry the forge crashed, since the child
 * would only stay off.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { CrashLog }                                              from '../../src/services/overseer/CrashLog.ts';
import { overseerFilesIn }                                       from '../../src/services/overseer/OverseerFiles.ts';
import { Presence }                                              from '../../src/services/overseer/Presence.ts';
import { requireWorkspace }                                      from '../../src/services/tracker/Workspace.ts';
import { MONITOR_REGISTRY_FILES }                                from '../../src/services/tracker/constants/MonitorRegistryFiles.ts';
import { fakeGateConfinement }                                   from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                   from '../../src/testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, type RecordedGitStep, useRecordedGit } from '../../src/testing/RecordedGit.ts';
import { useRecordedProcessTable }                               from '../../src/testing/RecordedProcessTable.ts';
import { removeScratchDirectory }                                from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                                  from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                        from '../Main.ts';
import { createCapturedCommandContext }                          from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                from '../testing/InitializedScratchRepository.ts';
import { GIT_VERSION }                                           from '../testing/RecordedGitStages.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const ORIGIN_ASKED_WITH_NONE_SET: RecordedGitStep = { gitArguments: ['remote', 'get-url', 'origin'], answeredAs: GIT_CALL_SHAPES.ORIGIN_URL_UNSET };

const CRASHED_GENERATION = 3;

/** A detached child that has exited at once: the start reports it did not start, after the spawn the case reads. */
const CHILD_THAT_EXITED = {
  pid: 4343, exitCode: 1, exited: Promise.resolve(1), unref: () => undefined
};

const recordedGit = useRecordedGit();
const processTable = useRecordedProcessTable(nativePlatformPorts());

let repositoryDirectory = '';
let spawnedCommands: string[][] = [];
let spawn: ReturnType<typeof spyOn> | null = null;

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('start-command', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  spawnedCommands = [];
  spawn = spyOn(Bun, 'spawn').mockImplementation(((command: string[]) => {
    spawnedCommands.push([...command]);
    return CHILD_THAT_EXITED;
  }) as unknown as typeof Bun.spawn);
});

afterEach(() => {
  spawn?.mockRestore();
  removeScratchDirectory(repositoryDirectory);
});

function startContext() {
  processTable.callerProcess();
  const tablePorts = processTable.ports;
  const platformPorts = {
    ...tablePorts,
    gateConfinement:    fakeGateConfinement('confined'),
    processSupervision: { ...tablePorts.processSupervision, spawnOptionsFor: nativePlatformPorts().processSupervision.spawnOptionsFor },
  };
  const context = createCapturedCommandContext({
    currentDirectory: repositoryDirectory, homeDirectory: join(repositoryDirectory, 'start-home'), temporaryDirectories: [], platformPorts, now: SPEC_CLOCK
  });
  return { ...context, programCommand: ['example-program'] };
}

describe('--started-by', () => {
  test('refuses a value other than user or login-item at exit 1, before anything is read', async () => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });

    expect(await runCommandLine(['start', '--started-by', 'cron', '--port', '0'], context)).toBe(1);

    expect(context.errorText()).toContain('"cron" is not a start origin. Write user or login-item.');
    expect(spawnedCommands).toEqual([]);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the start origin a detached child gets', () => {
  test.each([
    [[], 'user'],
    [['--started-by', 'login-item'], 'login-item'],
  ])('start %j hands the child --started-by %s', async (originArguments, origin) => {
    recordedGit.answerFrom([GIT_VERSION]);
    const context = startContext();

    expect(await runCommandLine(['start', ...originArguments, '--port', '0'], context)).toBe(1);

    expect(context.errorText()).toContain('before it answered');
    expect(spawnedCommands).toHaveLength(1);
    expect(spawnedCommands[0]?.slice(1)).toEqual(['oversee', '--port', '0', '--started-by', origin]);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'a login item\'s start after a crash', () => {
  test('is refused forge-off-after-crash before any spawn, and tells the registry the forge crashed', async () => {
    const workspace = requireWorkspace(repositoryDirectory);
    const files = overseerFilesIn(workspace.trackerDirectory);
    const crashed = processTable.bornProcess();
    Presence.writeStartedPresence(files, {
      generation:          CRASHED_GENERATION,
      process:             crashed,
      codeVersion:         'code-example',
      startOrigin:         'user',
      startedAt:           '2026-09-18T20:00:00+00:00',
      startClassification: null,
    });
    Presence.writeEnding(files, CRASHED_GENERATION, { kind: 'crashed', component: 'overseer', crashLogGeneration: CRASHED_GENERATION }, '2026-09-18T20:05:00+00:00');
    recordedGit.answerFrom([GIT_VERSION, ORIGIN_ASKED_WITH_NONE_SET]);
    const context = startContext();

    expect(await runCommandLine(['start', '--started-by', 'login-item', '--port', '0'], context)).toBe(1);

    expect(context.errorText()).toContain(`is off after a crash of Baton ${CRASHED_GENERATION}`);
    expect(spawnedCommands).toEqual([]);
    expect(CrashLog.list(files)).toEqual([CRASHED_GENERATION]);
    const registryFilePath = join(context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory), MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME);
    const registry = JSON.parse(readFileSync(registryFilePath, 'utf8')) as Record<string, Record<string, Record<string, unknown>>>;
    const crashLogPath = CrashLog.pathOf(files, CRASHED_GENERATION);
    const crash = { component: 'overseer', suspected: false, crashLogPath };
    expect(Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {})[0]?.['presence']).toMatchObject({ state: 'crashed', generation: CRASHED_GENERATION, crash });
  });
});
