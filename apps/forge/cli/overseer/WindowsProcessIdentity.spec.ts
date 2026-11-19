/**
 * The start path of an Overseer on Windows, over a fake kernel table in the place of `/bin/ps`. What matters: each consumer of `identityOf` gets a
 * real identity, so an Overseer passes its identity check, a Baton reads live, a child of Talos reads live while its Talos does; and a
 * failed boot read stops none of that and names no reboot.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { PlatformPorts }                                                      from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { type ProcessIdentity, UNREADABLE_BOOT_IDENTITY }                          from '../../src/lib/process-identity/ProcessIdentity.ts';
import type { ProcessSupervision }                                                 from '../../src/lib/process-identity/ProcessSupervision.ts';
import { windowsProcessSupervision }                                               from '../../src/lib/process-identity/ProcessSupervisionFor.ts';
import { createUnsupportedProcessSupervision }                                     from '../../src/lib/process-identity/UnsupportedProcessSupervision.ts';
import { Baton, type BatonRecord }                                                 from '../../src/services/overseer/Baton.ts';
import type { OverseerPortChoice }                                                 from '../../src/services/overseer/OverseerPort.ts';
import { Regrouping }                                                              from '../../src/services/overseer/Regrouping.ts';
import { type Workspace, workspacePathsFor }                                       from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                                                        from '../../src/shared/OperationRefusal.ts';
import { createFakeWindowsKernel, fakeWindowsSupervision, type FakeWindowsKernel } from '../../src/testing/FakeWindowsKernel.ts';
import { nativePlatformPorts }                                                     from '../../src/testing/NativePlatformPorts.ts';
import { PlantedChild }                                                            from '../../src/testing/PlantedChild.ts';
import { createScratchDirectory, removeScratchDirectory }                          from '../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                                                  from '../../src/testing/TalosChildReadings.ts';
import { writeReadableTracker }                                                    from '../../src/testing/TrackerFileFixtures.ts';
import type { CommandContext }                                                     from '../CommandContext.ts';
import type { ArgumentParser }                                                     from '../arguments/ArgumentParser.ts';
import { runOverseerInTheForeground }                                              from './OverseerForeground.ts';

const CREATION_TIME = 134_000_000_000_000_001n;
const REUSED_CREATION_TIME = CREATION_TIME + 1n;
const OTHER_PROCESS_ID = 5001;

const nativePorts = nativePlatformPorts();

let kernel: FakeWindowsKernel;
let scratchDirectory = '';

beforeEach(() => {
  kernel = createFakeWindowsKernel();
  kernel.table.set(process.pid, { creationTime: CREATION_TIME });
  kernel.table.set(OTHER_PROCESS_ID, { creationTime: CREATION_TIME });
  scratchDirectory = createScratchDirectory('windows-identity');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

function portsOn(processSupervision: ProcessSupervision): PlatformPorts {
  return { ...nativePorts, processSupervision };
}

function windowsPorts(): PlatformPorts {
  return portsOn(fakeWindowsSupervision(kernel));
}

/** The same kernel, on a machine where `reg.exe` fails. */
function portsWithoutBoot(): PlatformPorts {
  return portsOn(windowsProcessSupervision(kernel.api, { outputOfProgram: () => null }, 'C:\\Windows'));
}

function identityOf(ports: PlatformPorts, processId: number): ProcessIdentity {
  const identity = ports.processSupervision.identityOf(processId);
  if (identity === null) throw new Error('the fake kernel table does not hold this process');
  return identity;
}

class PastTheIdentityCheck extends Error {}

/** The port the start path binds after its identity check, which is all these specs want to reach. */
const PORT_CHOICE_ENDING_THE_START = new Proxy({} as OverseerPortChoice, {
  get: () => {
    throw new PastTheIdentityCheck();
  },
});

function trackedWorkspace(): Workspace {
  const workspace = workspacePathsFor(scratchDirectory);
  mkdirSync(workspace.trackerDirectory, { recursive: true });
  writeReadableTracker(workspace);
  return workspace;
}

async function foregroundOutcome(ports: PlatformPorts): Promise<unknown> {
  const startPath = runOverseerInTheForeground({
    commandArguments: {} as ArgumentParser,
    context:          { platformPorts: ports, homeDirectory: scratchDirectory } as CommandContext,
    workspace:        trackedWorkspace(),
    portChoice:       PORT_CHOICE_ENDING_THE_START,
    startOrigin:      'user',
  });
  return await startPath.then(() => null, (error: unknown) => error);
}

describe('an Overseer starting on Windows', () => {
  test('without an adapter it refuses as unreadable, the mismatch this start path had', async () => {
    const outcome = await foregroundOutcome(portsOn(createUnsupportedProcessSupervision('example-os')));
    expect(outcome).toBeInstanceOf(OperationRefusal);
    expect((outcome as OperationRefusal).detail).toMatchObject({ kind: 'overseer-identity-unreadable' });
  });

  test('over the fake table it passes the identity check', async () => {
    expect(await foregroundOutcome(windowsPorts())).toBeInstanceOf(PastTheIdentityCheck);
  });

  test('with a failed boot read it still passes the identity check', async () => {
    expect(await foregroundOutcome(portsWithoutBoot())).toBeInstanceOf(PastTheIdentityCheck);
  });
});

describe('a Baton on Windows', () => {
  function batonFor({ processId, startStamp, bootIdentity }: ProcessIdentity): BatonRecord {
    return {
      processId,
      processStartStamp:    startStamp,
      bootIdentity,
      port:                 4930,
      url:                  'http://127.0.0.1:4930/',
      tokenFile:            'token',
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    };
  }

  test('names a live process while the kernel answers its start, and a dead one once the id is reused', () => {
    const ports = windowsPorts();
    expect(Baton.acquire(ports, scratchDirectory, batonFor(identityOf(ports, OTHER_PROCESS_ID))).verdict).toBe('acquired');
    expect(Baton.newestBatonOf(ports, scratchDirectory).verdict).toBe('live');
    kernel.table.set(OTHER_PROCESS_ID, { creationTime: REUSED_CREATION_TIME });
    expect(Baton.newestBatonOf(ports, scratchDirectory).verdict).toBe('dead');
  });

  test('stays live when a successor cannot read the boot the Baton recorded', () => {
    const ports = windowsPorts();
    Baton.acquire(ports, scratchDirectory, batonFor(identityOf(ports, OTHER_PROCESS_ID)));
    expect(Baton.newestBatonOf(portsWithoutBoot(), scratchDirectory).verdict).toBe('live');
  });
});

describe('a child of Talos read by an Overseer on Windows', () => {
  /** A running child of Talos 1, whose record and Talos's both name the process given. */
  function jobFolderClaimedBy(talos: ProcessIdentity, childProcess: ProcessIdentity | null): string {
    const childFolder = 'jobs/J1';
    PlantedChild.plantTalosRecord(scratchDirectory, 1, { talos });
    PlantedChild.plantChildRecord({ boardFolder: scratchDirectory, childFolder, instance: 1 }, { talos, childProcess, childProcessGroupId: childProcess?.processId ?? null });
    return join(scratchDirectory, ...childFolder.split('/'));
  }

  test('reads live while the kernel answers its Talos\'s recorded start, and lost once the id is reused', () => {
    const ports = windowsPorts();
    const jobFolder = jobFolderClaimedBy(identityOf(ports, OTHER_PROCESS_ID), null);
    expect(talosChildReadingsWith(ports, scratchDirectory).livenessOf(jobFolder, 1).verdict).toBe('live');
    kernel.table.set(OTHER_PROCESS_ID, { creationTime: REUSED_CREATION_TIME });
    expect(talosChildReadingsWith(ports, scratchDirectory).livenessOf(jobFolder, 1).verdict).toBe('lost');
  });

  test('reads live with a failed boot read, whichever side failed', () => {
    const readableIdentity = identityOf(windowsPorts(), OTHER_PROCESS_ID);
    const unreadableIdentity = identityOf(portsWithoutBoot(), OTHER_PROCESS_ID);
    expect(unreadableIdentity.bootIdentity).toBe(UNREADABLE_BOOT_IDENTITY);
    expect(talosChildReadingsWith(portsWithoutBoot(), scratchDirectory).livenessOf(jobFolderClaimedBy(readableIdentity, null), 1).verdict).toBe('live');
    expect(talosChildReadingsWith(windowsPorts(), scratchDirectory).livenessOf(jobFolderClaimedBy(unreadableIdentity, null), 1).verdict).toBe('live');
  });

  describe('a lost child\'s cause', () => {
    test('with the boot unreadable now, it is no reboot', () => {
      const recorded = { ...identityOf(windowsPorts(), OTHER_PROCESS_ID), startStamp: '1' };
      expect(Regrouping.settleLostChildIn(scratchDirectory, portsWithoutBoot(), jobFolderClaimedBy(recorded, recorded), 1)).toBe('agent-crashed');
    });

    test('with the boot unreadable when it was recorded, it is no reboot', () => {
      const recorded = { ...identityOf(portsWithoutBoot(), OTHER_PROCESS_ID), startStamp: '1' };
      expect(Regrouping.settleLostChildIn(scratchDirectory, windowsPorts(), jobFolderClaimedBy(recorded, recorded), 1)).toBe('agent-crashed');
    });

    test('with two readable boots that differ, it still is a reboot', () => {
      const recorded = { ...identityOf(windowsPorts(), OTHER_PROCESS_ID), bootIdentity: '0x2b' };
      expect(Regrouping.settleLostChildIn(scratchDirectory, windowsPorts(), jobFolderClaimedBy(recorded, recorded), 1)).toBe('reboot');
    });
  });
});
