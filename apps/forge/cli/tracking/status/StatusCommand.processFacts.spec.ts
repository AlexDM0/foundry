/**
 * Hephaestus's process facts `status` prints above the board, over the recorded process table: a forge down after a crash names the crashed
 * Hephaestus lock and its crash log's path above the board, `--json` carries the facts under `hephaestus` with the presence block, and a board no forge
 * ran on is down with no crash line. A live Hephaestus whose lock has no version, as one of older code holds, is live to status and to the
 * command line's control context alike.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { CrashLog }                               from '../../../src/services/hephaestus/CrashLog.ts';
import { hephaestusFilesIn }                      from '../../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }                         from '../../../src/services/hephaestus/HephaestusLock.ts';
import { Presence }                               from '../../../src/services/hephaestus/Presence.ts';
import { createUnreadableBoardFiles }             from '../../../src/services/hephaestus/UnreadableBoardFiles.ts';
import { requireWorkspace }                       from '../../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                          from '../../../src/shared/constants/ProductNames.ts';
import { defaultSpecPlatformPorts }               from '../../../src/testing/DefaultSpecPlatformPorts.ts';
import { fakeAgentAdapter }                       from '../../../src/testing/FakeAgentAdapter.ts';
import { useRecordedGit }                         from '../../../src/testing/RecordedGit.ts';
import { useRecordedProcessTable }                from '../../../src/testing/RecordedProcessTable.ts';
import { removeScratchDirectory }                 from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                   from '../../../src/testing/ToolGuard.ts';
import { commandControlContextOf }                from '../../CommandControlContext.ts';
import { runCommandLine }                         from '../../Main.ts';
import { createCapturedCommandContext }           from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../../testing/InitializedScratchRepository.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const recordedGit = useRecordedGit();
const processTable = useRecordedProcessTable(defaultSpecPlatformPorts());

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

interface StatusDocument {
  hephaestus: { state: string; presence: Record<string, unknown> };
  tickets:    unknown[];
}

describeWhenRecorded(['git-recording', 'process-table-recording'], 'status after a crash', () => {
  const CRASHED_GENERATION = 3;

  function plantACrash(): { crashLogPath: string } {
    const files = hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
    const crashed = processTable.bornProcess();
    const { crashLogNumber } = CrashLog.writeOnce(files, CrashLog.assemble({
      crashedGeneration: CRASHED_GENERATION,
      component:         'hephaestus',
      suspected:         false,
      classification:    null,
      recordedAt:        '2026-09-18T20:05:00+00:00',
      recordedBy:        { generation: CRASHED_GENERATION, startOrigin: 'user', crashPath: true },
      error:             {
        origin: 'pass', name: 'ExampleError', message: 'an example crash', stack: null
      },
      presence:             null,
      hephaestusLockHolder: crashed,
      heartbeat:            null,
      activeJobs:           [],
      talosChildren:        null,
      logTail:              [],
    }), createUnreadableBoardFiles(() => undefined));
    Presence.writeStartedPresence(files, {
      generation:          CRASHED_GENERATION,
      process:             crashed,
      codeVersion:         'code-example',
      startOrigin:         'user',
      startedAt:           '2026-09-18T20:00:00+00:00',
      startClassification: null,
    });
    Presence.writeEnding(files, CRASHED_GENERATION, { kind: 'crashed', component: 'hephaestus', crashLogNumber }, '2026-09-18T20:05:00+00:00');
    return { crashLogPath: CrashLog.pathOf(files, crashLogNumber) };
  }

  function statusContext() {
    processTable.callerProcess();
    return createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts: processTable.ports });
  }

  test('prints that the forge is off after a crash of its Hephaestus lock, with the crash log\'s number and path, and how to start and resume', async () => {
    const { crashLogPath } = plantACrash();
    const context = statusContext();

    expect(await runCommandLine(['status'], context), context.errorText()).toBe(0);

    expect(context.outputText()).toContain(`${PRODUCT_NAMES.PROGRAM}: off after a crash of Hephaestus lock ${CRASHED_GENERATION} (crash log 1, ${crashLogPath})`);
    expect(context.outputText()).toContain(`\`${PRODUCT_NAMES.PROGRAM} start\`, then resume the interrupted work with \`${PRODUCT_NAMES.PROGRAM} resume --all\``);
    const output = context.outputText();
    expect(output.indexOf('off after a crash')).toBe(output.indexOf(':') + ': '.length);
    expect(output.indexOf('hephaestus: down')).toBeLessThan(output.indexOf('Example Agency — started'));
    expect(context.errorText()).not.toContain('off after a crash');
  });

  test('--json carries the presence block of a forge off after a crash, and writes no crash log of its own', async () => {
    const { crashLogPath } = plantACrash();
    const context = statusContext();

    expect(await runCommandLine(['status', '--json'], context), context.errorText()).toBe(0);

    const { hephaestus: { state, presence }, tickets } = JSON.parse(context.outputText()) as StatusDocument;
    expect(tickets).toEqual([]);
    expect(state).toBe('down');
    expect(presence).toMatchObject({
      state:     'off-after-crash',
      lastStart: null,
      crashLog:  {
        number: 1, generation: CRASHED_GENERATION, path: crashLogPath, suspected: false
      },
      heartbeat:   null,
      supervision: 'no-talos',
    });
    expect(CrashLog.list(hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory))).toEqual([1]);
  });

  test('a forge stopped on purpose is down, not off after a crash', async () => {
    const files = hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
    Presence.writeStartedPresence(files, {
      generation:          CRASHED_GENERATION,
      process:             processTable.bornProcess(),
      codeVersion:         'code-example',
      startOrigin:         'user',
      startedAt:           '2026-09-18T20:00:00+00:00',
      startClassification: null,
    });
    Presence.writeEnding(files, CRASHED_GENERATION, { kind: 'stopped' }, '2026-09-18T20:05:00+00:00');
    const context = statusContext();

    expect(await runCommandLine(['status'], context), context.errorText()).toBe(0);

    expect(context.outputText()).not.toContain('off after a crash');
    expect(context.outputText()).toContain('hephaestus: down');
  });

  test('a board no forge ran on is down, not off after a crash, and prints no crash line', async () => {
    const context = statusContext();

    expect(await runCommandLine(['status', '--json'], context), context.errorText()).toBe(0);

    expect((JSON.parse(context.outputText()) as StatusDocument).hephaestus.presence).toMatchObject({ state: 'down', crashLog: null });
    const text = statusContext();
    expect(await runCommandLine(['status'], text), text.errorText()).toBe(0);
    expect(text.outputText()).not.toContain('off after a crash');
    expect(text.outputText()).toStartWith('hephaestus: down; paused\ncode on disk: ');
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'status of a Hephaestus of older code', () => {
  test('a lock without a version that names a live process is live to status and to the control context', async () => {
    const { trackerDirectory } = requireWorkspace(repositoryDirectory);
    const { hephaestusDirectory } = hephaestusFilesIn(trackerDirectory);
    const hephaestus = processTable.bornProcess();
    const url = 'http://127.0.0.1:1/';
    mkdirSync(hephaestusDirectory, { recursive: true });
    writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 2), JSON.stringify({
      processId:            hephaestus.processId,
      processStartStamp:    hephaestus.startStamp,
      bootIdentity:         hephaestus.bootIdentity,
      port:                 1,
      url,
      tokenFile:            `${hephaestusDirectory}/token`,
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    }));
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts: processTable.ports });

    expect(await runCommandLine(['status'], context), context.errorText()).toBe(0);

    expect(context.outputText()).toContain(`hephaestus: starting at ${url}, process ${hephaestus.processId}, Hephaestus lock 2;`);
    const liveHephaestus = commandControlContextOf(processTable.ports, fakeAgentAdapter()).liveHephaestusOf(trackerDirectory);
    expect(liveHephaestus).toEqual({ url, hephaestusLockFilePath: HephaestusLock.filePathFor(hephaestusDirectory, 2) });
  });
});
