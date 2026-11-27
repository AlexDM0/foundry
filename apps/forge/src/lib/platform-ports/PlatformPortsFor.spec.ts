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
import type { OwnerOnlyRestriction }                      from '../owner-only-files/OwnerOnlyFiles.ts';
import { type PlatformPorts, platformPortsFor }           from './PlatformPortsFor.ts';

const HOST_FACTS = {
  userShell:                    () => undefined,
  commandInterpreter:           () => undefined,
  systemRoot:                   () => undefined,
  localApplicationDataFolder:   () => undefined,
  roamingApplicationDataFolder: () => undefined,
  programFilesFolder:           () => undefined,
  programExtensions:            () => undefined,
  monitorFolderName:            '.example-monitor',
  pipeNamePrefix:               'example-product'
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

/** An adapter changes the absent file's mode and meets the system's own error; the port with no adapter answers its refusal. */
function restrictionOrSystemError(restrict: () => OwnerOnlyRestriction): OwnerOnlyRestriction | 'system-error' {
  try {
    return restrict();
  } catch {
    return 'system-error';
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
    const restriction = restrictionOrSystemError(() => ports.ownerOnlyFiles.restrictFile(join(scratchDirectory, 'absent-folder', 'absent-file')));
    return restriction === 'system-error' || restriction.verdict === 'restricted' || restriction.cause !== 'no-adapter';
  },
  dataFolders: (ports) => {
    const systemFolder = ports.dataFolders.systemFolder();
    return systemFolder.verdict === 'found' || systemFolder.cause !== 'no-adapter';
  },
  programFolders:    (ports) => ports.programFolders.installFoldersOf('/home/example').length > 0,
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
  expect(ports.dataFolders.systemFolder()).toEqual({ verdict: 'found', folder: 'D:\\Windows\\System32' });
});

test('on win32 the host\'s SystemRoot ends every agent\'s search path, and its application folders hold program folders', () => {
  const ports = platformPortsFor('win32', { ...HOST_FACTS, systemRoot: () => 'D:\\Windows', roamingApplicationDataFolder: () => 'D:\\Users\\example\\AppData\\Roaming', });
  expect(ports.launchEnvironment.withSearchFolders({}, ['D:\\Tools'])['Path']?.split(';').slice(0, 2)).toEqual(['D:\\Tools', 'D:\\Windows\\System32']);
  expect(ports.programFolders.installFoldersOf('D:\\Users\\example')).toContain('D:\\Users\\example\\AppData\\Roaming\\npm');
});
