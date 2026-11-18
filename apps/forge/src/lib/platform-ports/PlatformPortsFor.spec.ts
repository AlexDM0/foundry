/**
 * The composition root: a frozen record for every platform, the one with no adapter included, so a process starts whatever it runs on. What
 * matters is closure: on darwin, linux and win32 every port of the record is a real adapter, reached through its selector, and on an unknown
 * platform every port is the one that refuses. Each probe below is watched both ways, so a selector that loses a platform branch fails here.
 * A probe never changes a file outside the scratch folder.
 */
import { join } from 'node:path';
import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { type PlatformPorts, platformPortsFor }           from './PlatformPortsFor.ts';

const HOST_FACTS = {
  userShell: () => undefined, commandInterpreter: () => undefined, systemRoot: () => undefined, monitorFolderName: '.example-monitor', pipeNamePrefix: 'example-product'
};

const SUPPORTED_PLATFORMS: string[] = ['darwin', 'linux', 'win32'];
const UNKNOWN_PLATFORM = 'example-platform';
const UNKNOWN_PROCESS_ID = 4242;
/** Short enough for any socket path limit; the probe only names an endpoint, it binds nothing. */
const SHORT_MONITOR_FOLDER = '/example';

const scratchDirectory = createScratchDirectory('platform-ports');

afterAll(() => {
  removeScratchDirectory(scratchDirectory);
});

function thrownMessageOf(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** True when the port is an adapter, false when it is the record a platform with no adapter gets. One probe per port, so the type holds them all. */
const ADAPTER_PROBES: Readonly<Record<keyof PlatformPorts, (ports: PlatformPorts) => boolean>> = {
  processSupervision: (ports) => ports.processSupervision.identitySourcesOf(UNKNOWN_PROCESS_ID).length > 0,
  localEndpoint:      (ports) => {
    const endpoint = ports.localEndpoint.endpointOf({
      monitorFolder: SHORT_MONITOR_FOLDER, trackerId: 'example', name: '1', instance: 1
    });
    return ports.localEndpoint.endpointFits(endpoint);
  },
  gateConfinement:    (ports) => ports.gateConfinement.workerConfinement() !== 'unavailable',
  shellLine:          (ports) => ports.shellLine.lineGrammar !== 'none',
  executableResolver: (ports) => {
    const resolution = ports.executableResolver.absolutePathOf('example-absent-tool', []);
    return resolution.verdict === 'found' || resolution.cause !== 'no-adapter';
  },
  ownerOnlyFiles: (ports) => {
    const message = thrownMessageOf(() => ports.ownerOnlyFiles.restrictFile(join(scratchDirectory, 'absent-folder', 'absent-file')));
    return message === null || !message.includes('no owner-only files exist');
  },
  dataFolders: (ports) => {
    const message = thrownMessageOf(() => ports.dataFolders.systemFolder());
    return message === null || !message.includes('no data folders exist');
  },
  launchEnvironment: (ports) => ports.launchEnvironment.inheritedVariableNames.length > 0,
};

const PORT_NAMES = Object.keys(ADAPTER_PROBES) as (keyof PlatformPorts)[];

test('the record is frozen and carries both ports', () => {
  const ports = platformPortsFor('darwin', HOST_FACTS);
  expect(Object.isFrozen(ports)).toBe(true);
  expect(Object.isFrozen(ports.processSupervision)).toBe(true);
  expect(Object.isFrozen(ports.localEndpoint)).toBe(true);
});

test('a platform with no adapter still gets a record, whose ports refuse', () => {
  const ports = platformPortsFor(UNKNOWN_PLATFORM, HOST_FACTS);
  expect(ports.processSupervision.identityOf(process.pid)).toBeNull();
  expect(ports.localEndpoint.prepareEndpoint('/any').verdict).toBe('refused');
});

test('the probes cover every port of the record', () => {
  expect(Object.keys(platformPortsFor('darwin', HOST_FACTS)).sort()).toEqual([...PORT_NAMES].sort());
});

describe.each(SUPPORTED_PLATFORMS)('on %s', (platform) => {
  test.each(PORT_NAMES)('%s is an adapter, not a refusal', (portName) => {
    expect(ADAPTER_PROBES[portName](platformPortsFor(platform, HOST_FACTS))).toBe(true);
  });
});

describe(`on the unknown platform ${UNKNOWN_PLATFORM}`, () => {
  test.each(PORT_NAMES)('%s refuses, so its probe can fail', (portName) => {
    expect(ADAPTER_PROBES[portName](platformPortsFor(UNKNOWN_PLATFORM, HOST_FACTS))).toBe(false);
  });
});

test('on win32 the host\'s SystemRoot reaches the data folders, so a Windows installed off C: names its own system folder', () => {
  const ports = platformPortsFor('win32', { ...HOST_FACTS, systemRoot: () => 'D:\\Windows' });
  expect(ports.dataFolders.systemFolder()).toBe('D:\\Windows\\System32');
});
