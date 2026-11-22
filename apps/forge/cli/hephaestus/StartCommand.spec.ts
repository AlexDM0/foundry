/**
 * `start` with a Hephaestus live, which the detached form starts nothing beside and the foreground form refuses; and its start origin, over
 * recorded git and the recorded process table, with the detached child a recorded spawn that has exited. What matters: `--started-by` takes
 * `user`, `user` when absent, and hands it to the child.
 */
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { hephaestusFilesIn }                      from '../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }                         from '../../src/services/hephaestus/HephaestusLock.ts';
import { requireWorkspace }                       from '../../src/services/tracker/Workspace.ts';
import { HEPHAESTUS_READY_INTERVAL_MILLISECONDS } from '../../src/shared/constants/HephaestusLimits.ts';
import { fakeGateConfinement }                    from '../../src/testing/FakeGateConfinement.ts';
import { instantSleepsOf }                        from '../../src/testing/InstantSleeps.ts';
import { nativePlatformPorts }                    from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { useRecordedProcessTable }                from '../../src/testing/RecordedProcessTable.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                   from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { GIT_VERSION }                            from '../testing/RecordedGitStages.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const UNANSWERING_URL = 'http://127.0.0.1:1/';

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
  test('refuses a value other than user at exit 1, before anything is read', async () => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });

    expect(await runCommandLine(['start', '--started-by', 'cron', '--port', '0'], context)).toBe(1);

    expect(context.errorText()).toContain('"cron" is not a start origin. Write user.');
    expect(spawnedCommands).toEqual([]);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the start origin a detached child gets', () => {
  test.each([
    [[], 'user'],
    [['--started-by', 'user'], 'user'],
  ])('start %j hands the child --started-by %s', async (originArguments, origin) => {
    recordedGit.answerFrom([GIT_VERSION]);
    const context = startContext();

    expect(await runCommandLine(['start', ...originArguments, '--port', '0'], context)).toBe(1);

    expect(context.errorText()).toContain('before it answered');
    expect(spawnedCommands).toHaveLength(1);
    expect(spawnedCommands[0]?.slice(1)).toEqual(['start', '--foreground', '--port', '0', '--started-by', origin]);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'a start with a Hephaestus live', () => {
  /** A live Hephaestus whose API never answers: a Hephaestus lock that names a process of the recorded table. */
  function plantALiveHephaestus(context: ReturnType<typeof startContext>): void {
    const { hephaestusDirectory } = hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
    const liveHephaestus = processTable.bornProcess();
    const acquisition = HephaestusLock.acquire(context.platformPorts, hephaestusDirectory, {
      processId:            liveHephaestus.processId,
      processStartStamp:    liveHephaestus.startStamp,
      bootIdentity:         liveHephaestus.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(hephaestusDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    });
    expect(acquisition.verdict).toBe('acquired');
  }

  test('the detached form starts nothing, and says so when the live one does not answer', async () => {
    const context = startContext();
    plantALiveHephaestus(context);

    const { value: exitCode, instantSleeps } = await instantSleepsOf(HEPHAESTUS_READY_INTERVAL_MILLISECONDS, () => runCommandLine(['start', '--port', '0'], context));

    expect(exitCode).toBe(1);
    expect(instantSleeps).toBeGreaterThan(0);
    expect(context.errorText()).toContain(`Hephaestus at ${UNANSWERING_URL} is live, but its API did not answer, so nothing was started beside it.`);
    expect(spawnedCommands).toEqual([]);
  });

  test('the foreground form is refused hephaestus-already-running at exit 1, with its URL', async () => {
    recordedGit.answerFrom([GIT_VERSION]);
    const context = startContext();
    plantALiveHephaestus(context);

    expect(await runCommandLine(['start', '--foreground', '--port', '0'], context)).toBe(1);

    expect(context.errorText()).toContain(`A Hephaestus already serves this board at ${UNANSWERING_URL}`);
    expect(HephaestusLock.generationsIn(hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory).hephaestusDirectory)).toEqual([1]);
  });
});
