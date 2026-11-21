/**
 * `restart` over the recorded process table, its successor a program that only writes its arguments down: over a Hephaestus found dead it
 * keeps the port of the Baton record, also one dead before the hand-over, which it closes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { PlatformPorts }                     from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { Baton }                                  from '../../src/services/hephaestus/Baton.ts';
import { hephaestusFilesIn }                      from '../../src/services/hephaestus/HephaestusFiles.ts';
import { requireWorkspace }                       from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                          from '../../src/shared/constants/ProductNames.ts';
import { nativePlatformPorts }                    from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { useRecordedProcessTable }                from '../../src/testing/RecordedProcessTable.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                   from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const UNANSWERING_URL            = 'http://127.0.0.1:1/';

const recordedGit = useRecordedGit();
const processTable = useRecordedProcessTable(nativePlatformPorts());
const hephaestusStoppedRecordsIn = (logKinds: readonly string[]): number => logKinds.filter((kind) => kind === 'hephaestus-stopped').length;

function storedLogKindsOf(repository: string): string[] {
  const logFilePath = join(repository, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl');
  if (!existsSync(logFilePath)) return [];
  return readFileSync(logFilePath, 'utf8').split('\n').filter((line) => line !== '').map((line) => (JSON.parse(line) as { kind: string }).kind);
}

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'run restart', () => {
  /** Hephaestus dies between the Baton pass ask and the stop, so the stop finds its Baton dead; the successor only writes its arguments down. */
  test('restart over a Hephaestus found dead starts the successor with the port of its Baton record', async () => {
    const workspace = requireWorkspace(repositoryDirectory);
    const { hephaestusDirectory } = hephaestusFilesIn(workspace.trackerDirectory);
    // The restart writes the board, whose lock reads this process's identity for its record.
    processTable.callerProcess();
    const deadHephaestus = processTable.bornProcess();
    const tablePorts = processTable.ports;
    let identityReads = 0;
    const platformPorts: PlatformPorts = {
      ...tablePorts,
      processSupervision: {
        ...tablePorts.processSupervision,
        identityOf: (processId) => {
          const identity = tablePorts.processSupervision.identityOf(processId);
          identityReads += 1;
          if (identityReads === 1) processTable.endProcess(deadHephaestus);
          return identity;
        },
        spawnOptionsFor: nativePlatformPorts().processSupervision.spawnOptionsFor,
      },
    };
    const acquisition = Baton.acquire(platformPorts, hephaestusDirectory, {
      processId:            deadHephaestus.processId,
      processStartStamp:    deadHephaestus.startStamp,
      bootIdentity:         deadHephaestus.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(hephaestusDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    });
    expect(acquisition.verdict).toBe('acquired');
    const successorArgumentsFile = join(repositoryDirectory, 'successor-arguments.json');
    const writeArguments = `require('node:fs').writeFileSync(${JSON.stringify(successorArgumentsFile)}, JSON.stringify(process.argv.slice(1)))`;
    const restarted = {
      ...createCapturedCommandContext({
        currentDirectory: repositoryDirectory, homeDirectory: join(repositoryDirectory, 'restart-home'), temporaryDirectories: [], platformPorts
      }),
      programCommand: [process.execPath, '-e', writeArguments],
    };

    // The successor writes its arguments and ends, so the start is refused as a Hephaestus that did not start.
    expect(await runCommandLine(['restart', '--json'], restarted), restarted.errorText()).toBe(1);

    expect((JSON.parse(readFileSync(successorArgumentsFile, 'utf8')) as string[]).join(' ')).toBe('start --foreground --port 1 --started-by user');
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
  });

  /** Hephaestus is dead before the Baton pass ask, so the hand-over finds no live Baton; the restart still reads the dead one. */
  test('restart over a Baton already dead at the hand-over keeps its port and closes it', async () => {
    const workspace = requireWorkspace(repositoryDirectory);
    const { hephaestusDirectory } = hephaestusFilesIn(workspace.trackerDirectory);
    // The restart writes the board, whose lock reads this process's identity for its record.
    processTable.callerProcess();
    const deadHephaestus = processTable.bornProcess();
    const platformPorts: PlatformPorts = {
      ...processTable.ports,
      processSupervision: { ...processTable.ports.processSupervision, spawnOptionsFor: nativePlatformPorts().processSupervision.spawnOptionsFor },
    };
    const acquisition = Baton.acquire(platformPorts, hephaestusDirectory, {
      processId:            deadHephaestus.processId,
      processStartStamp:    deadHephaestus.startStamp,
      bootIdentity:         deadHephaestus.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(hephaestusDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    });
    expect(acquisition.verdict).toBe('acquired');
    processTable.endProcess(deadHephaestus);
    const successorArgumentsFile = join(repositoryDirectory, 'successor-arguments.json');
    const writeArguments = `require('node:fs').writeFileSync(${JSON.stringify(successorArgumentsFile)}, JSON.stringify(process.argv.slice(1)))`;
    const restarted = {
      ...createCapturedCommandContext({
        currentDirectory: repositoryDirectory, homeDirectory: join(repositoryDirectory, 'restart-home'), temporaryDirectories: [], platformPorts
      }),
      programCommand: [process.execPath, '-e', writeArguments],
    };

    // The successor writes its arguments and ends, so the start is refused as a Hephaestus that did not start.
    expect(await runCommandLine(['restart', '--json'], restarted), restarted.errorText()).toBe(1);

    expect((JSON.parse(readFileSync(successorArgumentsFile, 'utf8')) as string[]).join(' ')).toBe('start --foreground --port 1 --started-by user');
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(Baton.newestBatonOf(platformPorts, hephaestusDirectory).verdict).toBe('none');
  });
});
