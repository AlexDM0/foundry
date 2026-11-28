/**
 * `ensureTalos` over fakes of Talos's records, the process table, the connection and spawn: a running Talos of the required version is
 * attached; one of another version is waited out, then stopped; a lost one is stopped and its children swept; and a fresh Talos of another
 * version holds Hephaestus, which never spawns again, since the program on disk would give the same Talos.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { type ChildRecord, childRecordTextOf } from '../../domain/talos/ChildRecord.ts';
import { launchRegistryEntryLineOf }           from '../../domain/talos/LaunchRegistry.ts';
import {
  childFilesOf,
  launchRegistryPathOf,
  startFilePathOf,
  talosRecordPathOf,
  talosSecretPathOf
} from '../../domain/talos/TalosFiles.ts';
import { type TalosRecord, talosRecordTextOf }            from '../../domain/talos/TalosRecord.ts';
import { talosStartFileOf }                               from '../../domain/talos/TalosStartFile.ts';
import { TALOS_PROTOCOL_VERSION }                         from '../../domain/talos/constants/TalosProtocol.ts';
import type { PlatformPorts }                             from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                           from '../../lib/process-identity/ProcessIdentity.ts';
import type { ProcessSupervision }                        from '../../lib/process-identity/ProcessSupervision.ts';
import { detailsLoggerOf }                                from '../../testing/LoggedDetails.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { TalosConnection, TalosConnectionOutcome }   from './TalosConnection.ts';
import {
  createTalosStartHold,
  ensureTalos,
  type TalosStartContext,
  type TalosSpawnRequest
} from './TalosStart.ts';
import { createUnreadableBoardFiles } from './UnreadableBoardFiles.ts';

const THIS_BOOT = 'example-boot';
const OTHER_BOOT = 'example-earlier-boot';
const TRACKER_ID = 'tracker-example';
const BOUNDS = {
  leaseMilliseconds:           600,
  renewalIntervalMilliseconds: 150,
  cleanQuitWaitMilliseconds:   300,
  tickMilliseconds:            50,
  tickGapMilliseconds:         200,
} as const;
const WAITS = {
  frameTimeoutMilliseconds: 10, startTries: 3, quitTries: 3, intervalMilliseconds: 0
} as const;
const FIRST_FAKE_PROCESS_ID = 7_000_000;

const WELCOMED_CONNECTION: TalosConnection = {
  send:    () => Promise.resolve('no-answer'),
  onState: () => undefined,
  onClose: () => undefined,
  close:   () => undefined,
};

interface FakeProcessTable {
  readonly supervision: ProcessSupervision;
  readonly born:        (bootIdentity?: string) => ProcessIdentity;
  readonly isRunning:   (identity: ProcessIdentity) => boolean;
  readonly stopped:     ProcessIdentity[];
  /** A process whose forced stops are refused from now on. */
  readonly refuseStops: (identity: ProcessIdentity) => void;
}

function fakeProcessTable(): FakeProcessTable {
  const running = new Map<number, ProcessIdentity>();
  const refusing = new Set<number>();
  const stopped: ProcessIdentity[] = [];
  let lastProcessId = FIRST_FAKE_PROCESS_ID;
  running.set(process.pid, { processId: process.pid, startStamp: '1', bootIdentity: THIS_BOOT });
  const stop = (identity: ProcessIdentity): 'signalled' | 'refused' | 'gone' => {
    if (!running.has(identity.processId)) return 'gone';
    if (refusing.has(identity.processId)) return 'refused';
    stopped.push(identity);
    running.delete(identity.processId);
    return 'signalled';
  };
  const supervision = {
    ...nativePlatformPorts().processSupervision,
    identityOf:    (processId: number) => running.get(processId) ?? null,
    sameProcess:   (first: ProcessIdentity, second: ProcessIdentity) => JSON.stringify(first) === JSON.stringify(second),
    treeMembersOf: () => [],
    stopTree:      (leader: ProcessIdentity) => ({ verdict: stop(leader) }),
    stopProcess:   (processId: number) => {
      const identity = running.get(processId);
      return identity === undefined ? { verdict: 'gone' as const } : { verdict: stop(identity) };
    },
  } as unknown as ProcessSupervision;
  return {
    supervision,
    born: (bootIdentity = THIS_BOOT) => {
      lastProcessId += 1;
      const identity = { processId: lastProcessId, startStamp: String(lastProcessId), bootIdentity };
      running.set(lastProcessId, identity);
      return identity;
    },
    isRunning:   (identity) => running.get(identity.processId) === identity,
    stopped,
    refuseStops: (identity) => refusing.add(identity.processId),
  };
}

let boardFolder = '';
let monitorFolder = '';
let processTable = fakeProcessTable();

beforeEach(() => {
  boardFolder = createScratchDirectory('talos-start-board');
  monitorFolder = createScratchDirectory('talos-start-monitor');
  processTable = fakeProcessTable();
});

afterEach(() => {
  removeScratchDirectory(boardFolder);
  removeScratchDirectory(monitorFolder);
});

function writeTalosRecord(startNumber: number, changes: Partial<TalosRecord>): void {
  const record: TalosRecord = {
    formatVersion:   1,
    startNumber,
    protocolVersion: TALOS_PROTOCOL_VERSION,
    codeVersion:     'code-example',
    talos:           null,
    state:           'serving',
    endpoint:        `/example/talos-${startNumber}.sock`,
    quitReason:      null,
    lease:           { standing: 'unheld', lastRenewer: null },
    ...changes,
  };
  const path = talosRecordPathOf(boardFolder, startNumber);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, talosRecordTextOf(record));
}

/** A Talos as a previous Hephaestus left it: its start file, its secret and its record. */
function plantTalos(startNumber: number, changes: Partial<TalosRecord>): void {
  const secretFilePath = talosSecretPathOf(monitorFolder, TRACKER_ID, startNumber);
  mkdirSync(dirname(secretFilePath), { recursive: true });
  writeFileSync(secretFilePath, 'example-secret');
  mkdirSync(dirname(startFilePathOf(boardFolder, startNumber)), { recursive: true });
  writeFileSync(startFilePathOf(boardFolder, startNumber), JSON.stringify({
    formatVersion: 1,
    startNumber,
    boardFolder,
    endpoint:      `/example/talos-${startNumber}.sock`,
    secretFilePath,
    codeVersion:   'code-example',
    ...BOUNDS,
  }));
  writeTalosRecord(startNumber, changes);
}

function plantChild(startNumber: number, childFolder: string, changes: Partial<ChildRecord>): void {
  const record: ChildRecord = {
    formatVersion:         1,
    childId:               `${childFolder}#1`,
    kind:                  'line',
    label:                 'example line',
    workingDirectory:      boardFolder,
    talosStartNumber:      startNumber,
    talos:                 null,
    state:                 'running',
    childProcess:          null,
    childProcessGroupId:   null,
    eventLogFormatVersion: 2,
    timeBoundMilliseconds: null,
    recognisedEndings:     [],
    end:                   null,
    ...changes,
  };
  const { recordPath } = childFilesOf(boardFolder, childFolder, 1);
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, childRecordTextOf(record));
  const registryPath = launchRegistryPathOf(boardFolder, startNumber);
  const registryText = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : '';
  writeFileSync(registryPath, `${registryText}${launchRegistryEntryLineOf({
    childId: record.childId, childFolder, instance: 1, kind: 'line'
  })}`);
}

function childFileText(childFolder: string, suffix: string): string | null {
  const path = `${dirname(childFilesOf(boardFolder, childFolder, 1).recordPath)}/child-1.${suffix}`;
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

type SpawnedTalos = (request: TalosSpawnRequest) => void;

/** A spawned Talos claims its record and serves, as the binary does. */
const SERVING_TALOS: SpawnedTalos = ({ startNumber }) => writeTalosRecord(startNumber, { talos: processTable.born() });

interface ContextFakes {
  readonly context:  TalosStartContext;
  readonly spawned:  number[];
  readonly logged:   string[];
  readonly connects: string[];
}

function contextWith(
  answerOf: (endpoint: string) => TalosConnectionOutcome,
  spawnedTalos: SpawnedTalos = SERVING_TALOS,
  endpointFits = true,
): ContextFakes {
  const spawned: number[] = [];
  const logged: string[] = [];
  const connects: string[] = [];
  const nativePorts = nativePlatformPorts();
  const ports: PlatformPorts = {
    ...nativePorts,
    processSupervision: processTable.supervision,
    localEndpoint:      {
      ...nativePorts.localEndpoint,
      endpointOf:   ({ name, instance }) => `/example/${name}-${instance}.sock`,
      endpointFits: () => endpointFits,
    },
    ownerOnlyFiles: { restrictFolder: () => ({ verdict: 'restricted' }), restrictFile: () => ({ verdict: 'restricted' }), isOwnerOnly: () => true },
  };
  const context: TalosStartContext = {
    boardFolder,
    monitorFolder,
    trackerId:      TRACKER_ID,
    codeVersion:    'code-example',
    repositoryRoot: boardFolder,
    ports,
    bounds:         BOUNDS,
    waits:          WAITS,
    connect:        (request) => {
      connects.push(request.endpoint);
      return Promise.resolve(answerOf(request.endpoint));
    },
    startTalos: (_ports, request) => {
      spawned.push(request.startNumber);
      spawnedTalos(request);
      return undefined;
    },
    hold:                 createTalosStartHold(),
    log:                  detailsLoggerOf(logged),
    unreadableBoardFiles: createUnreadableBoardFiles(detailsLoggerOf(logged)),
  };
  return {
    context, spawned, logged, connects
  };
}

const WELCOMED: TalosConnectionOutcome = { verdict: 'welcomed', connection: WELCOMED_CONNECTION };

test('with no Talos recorded it starts the first, its start file holding the bounds, the endpoint and an owner-only secret', async () => {
  const { context, spawned, connects } = contextWith(() => WELCOMED);

  expect(await ensureTalos(context)).toEqual({
    verdict: 'started', connection: WELCOMED_CONNECTION, startNumber: 1, previousTalos: 'none', sweptOrphans: 0
  });
  expect(spawned).toEqual([1]);
  expect(connects).toEqual(['/example/talos-1.sock']);
  const startFile = talosStartFileOf(readFileSync(startFilePathOf(boardFolder, 1), 'utf8'));
  expect(startFile).toEqual({
    verdict: 'read',
    record:  {
      formatVersion:  1,
      startNumber:    1,
      boardFolder,
      endpoint:       '/example/talos-1.sock',
      secretFilePath: talosSecretPathOf(monitorFolder, TRACKER_ID, 1),
      codeVersion:    'code-example',
      ...BOUNDS,
    },
  });
  expect(readFileSync(talosSecretPathOf(monitorFolder, TRACKER_ID, 1), 'utf8')).toMatch(/^[0-9a-f]{48}$/);
});

test('a running Talos that welcomes the required version is attached and nothing spawns', async () => {
  plantTalos(3, { talos: processTable.born() });
  const { context, spawned } = contextWith(() => WELCOMED);

  expect(await ensureTalos(context)).toEqual({ verdict: 'attached', connection: WELCOMED_CONNECTION, startNumber: 3 });
  expect(spawned).toEqual([]);
});

test('a Talos of another version is waited out until it records quit, then the next one starts', async () => {
  const oldTalos = processTable.born();
  plantTalos(1, { talos: oldTalos });
  const { context, spawned } = contextWith((endpoint) => {
    if (endpoint !== '/example/talos-1.sock') return WELCOMED;
    writeTalosRecord(1, { talos: oldTalos, state: 'quit', quitReason: 'protocol-mismatch' });
    return { verdict: 'version-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION + 1 };
  });

  expect(await ensureTalos(context)).toMatchObject({
    verdict: 'started', startNumber: 2, previousTalos: 'quit', sweptOrphans: 0
  });
  expect(spawned).toEqual([2]);
  expect(processTable.stopped).toEqual([]);
});

test('a Talos of another version that outlasts the quit wait is stopped, logged, and its unended children swept', async () => {
  const oldTalos = processTable.born();
  plantTalos(1, { talos: oldTalos });
  const child = processTable.born();
  plantChild(1, 'jobs/J-1/install', { childProcess: child });
  const { context, logged } = contextWith((endpoint) => (endpoint === '/example/talos-1.sock'
    ? { verdict: 'version-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION + 1 }
    : WELCOMED));

  expect(await ensureTalos(context)).toMatchObject({
    verdict: 'started', startNumber: 2, previousTalos: 'quit', sweptOrphans: 1
  });
  expect(processTable.stopped).toEqual([oldTalos, child]);
  expect(logged).toContain('Talos 1 did not quit within its wait and was stopped.');
});

test('a silent Talos is lost: it is stopped and each unended child is swept with its cause, the ended one left alone', async () => {
  const lostTalos = processTable.born();
  plantTalos(1, { talos: lostTalos });
  const runningChild = processTable.born();
  plantChild(1, 'jobs/J-1', { kind: 'agent', childProcess: runningChild });
  plantChild(1, 'jobs/J-2/install', {
    state: 'ended',
    end:   {
      reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: 5
    }
  });
  const { context, logged } = contextWith((endpoint) => (endpoint === '/example/talos-1.sock' ? { verdict: 'silent' } : WELCOMED));

  expect(await ensureTalos(context)).toMatchObject({
    verdict: 'started', startNumber: 2, previousTalos: 'lost', sweptOrphans: 1
  });
  expect(processTable.stopped).toEqual([lostTalos, runningChild]);
  expect(childFileText('jobs/J-1', 'lost-cause')).toBe('talos-lost\n');
  expect(childFileText('jobs/J-2/install', 'lost-cause')).toBeNull();
  expect(logged).toContain('Talos 1 was lost; 1 of its children were swept.');
});

test('a refused Talos is lost too', async () => {
  plantTalos(1, { talos: processTable.born() });
  const { context } = contextWith((endpoint) => (endpoint === '/example/talos-1.sock' ? { verdict: 'refused', reason: 'secret' } : WELCOMED));

  expect(await ensureTalos(context)).toMatchObject({ verdict: 'started', startNumber: 2, previousTalos: 'lost' });
});

test('a serving record whose process is gone is lost without a connect; a child of another boot is settled as a reboot, a gone one as ended with it', async () => {
  const goneTalos = { processId: 4242, startStamp: '9', bootIdentity: THIS_BOOT };
  plantTalos(1, { talos: goneTalos });
  plantChild(1, 'jobs/J-1', { childProcess: { processId: 4243, startStamp: '9', bootIdentity: THIS_BOOT } });
  const { context, connects } = contextWith(() => WELCOMED);

  expect(await ensureTalos(context)).toMatchObject({
    verdict: 'started', startNumber: 2, previousTalos: 'lost', sweptOrphans: 1
  });
  expect(connects).toEqual(['/example/talos-2.sock']);
  expect(childFileText('jobs/J-1', 'lost-cause')).toBe('agent-crashed\n');

  const rebootedBoard = contextWith(() => WELCOMED);
  writeTalosRecord(2, { talos: { processId: 4244, startStamp: '9', bootIdentity: OTHER_BOOT } });
  plantChild(2, 'jobs/J-3', { childProcess: { processId: 4245, startStamp: '9', bootIdentity: OTHER_BOOT } });
  expect(await ensureTalos(rebootedBoard.context)).toMatchObject({
    verdict: 'started', startNumber: 3, previousTalos: 'lost', sweptOrphans: 1
  });
  expect(childFileText('jobs/J-3', 'lost-cause')).toBe('reboot\n');
});

test('a registry line that does not fit is reported to the board header, its other lines are swept, and a cut-short last line is passed over', async () => {
  plantTalos(1, { talos: { processId: 4242, startStamp: '9', bootIdentity: THIS_BOOT } });
  plantChild(1, 'jobs/J-1', { childProcess: { processId: 4243, startStamp: '9', bootIdentity: THIS_BOOT } });
  const registryPath = launchRegistryPathOf(boardFolder, 1);
  writeFileSync(registryPath, `not a launch\n${readFileSync(registryPath, 'utf8')}{"childId":"jobs/J-2#1","childFol`);
  const { context } = contextWith(() => WELCOMED);

  expect(await ensureTalos(context)).toMatchObject({ verdict: 'started', previousTalos: 'lost', sweptOrphans: 1 });
  expect(childFileText('jobs/J-1', 'lost-cause')).toBe('agent-crashed\n');
  expect(context.unreadableBoardFiles.files()).toEqual([
    { file: 'talos/launches-1.ndjson', problem: { code: 'registry-line-not-json', parserError: expect.any(String) as unknown as string, lineNumber: 1 } },
  ]);
});

test('a refused forced stop of an orphan stores the refusal, no cause, and is not counted as swept', async () => {
  plantTalos(1, { talos: { processId: 4242, startStamp: '9', bootIdentity: THIS_BOOT } });
  const stubbornChild = processTable.born();
  processTable.refuseStops(stubbornChild);
  plantChild(1, 'jobs/J-1', { childProcess: stubbornChild });
  const { context, logged } = contextWith(() => WELCOMED);

  expect(await ensureTalos(context)).toMatchObject({ verdict: 'started', previousTalos: 'lost', sweptOrphans: 0 });
  expect(childFileText('jobs/J-1', 'lost-cause')).toBeNull();
  expect(JSON.parse(childFileText('jobs/J-1', 'refused-forced-stops') ?? 'null')).toEqual({ version: 1, refusals: 1, treeProcessIds: [stubbornChild.processId] });
  expect(logged).toContain('The forced stop of jobs/J-1#1, a child of the lost Talos 1, was refused.');
});

test('refusals that cannot be read are reported to the board header and count none, so the stop is tried and the next refusal is stored anew', async () => {
  plantTalos(1, { talos: { processId: 4242, startStamp: '9', bootIdentity: THIS_BOOT } });
  const stubbornChild = processTable.born();
  processTable.refuseStops(stubbornChild);
  plantChild(1, 'jobs/J-1', { childProcess: stubbornChild });
  writeFileSync(`${dirname(childFilesOf(boardFolder, 'jobs/J-1', 1).recordPath)}/child-1.refused-forced-stops`, '{"refusals":2,"treeProcessIds":[]}\n');
  const { context, logged } = contextWith(() => WELCOMED);

  expect(await ensureTalos(context)).toMatchObject({ verdict: 'started', previousTalos: 'lost', sweptOrphans: 0 });
  const versionDiffers = { code: 'version-differs', field: 'version', expectedVersion: 1 } as const;
  expect(context.unreadableBoardFiles.files()).toEqual([{ file: 'jobs/J-1/child-1.refused-forced-stops', problem: versionDiffers }]);
  expect(logged.some((line) => line.includes('cannot read the board file jobs/J-1/child-1.refused-forced-stops'))).toBe(true);
  expect(JSON.parse(childFileText('jobs/J-1', 'refused-forced-stops') ?? 'null')).toEqual({ version: 1, refusals: 1, treeProcessIds: [stubbornChild.processId] });
});

test('a Talos that quit is followed by the next start number, with no connect to it', async () => {
  plantTalos(4, { state: 'quit', quitReason: 'restart' });
  const { context, connects } = contextWith(() => WELCOMED);

  expect(await ensureTalos(context)).toMatchObject({ verdict: 'started', startNumber: 5, previousTalos: 'quit' });
  expect(connects).toEqual(['/example/talos-5.sock']);
});

test('a Talos just started that answers another version holds Hephaestus, and a second ensure never spawns again', async () => {
  const { context, spawned, logged } = contextWith(() => ({ verdict: 'version-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION + 1 }));
  const held = { verdict: 'held', reason: 'talos-protocol-differs', answeredProtocolVersion: TALOS_PROTOCOL_VERSION + 1 } as const;

  expect(await ensureTalos(context)).toEqual(held);
  expect(await ensureTalos(context)).toEqual(held);
  expect(spawned).toEqual([1]);
  expect(logged).toEqual([`Talos 1, started from the program on disk, answers protocol version ${TALOS_PROTOCOL_VERSION + 1}: no Talos starts again.`]);
});

test('a started Talos that never serves is unavailable, one that refused its start says so, and an endpoint that does not fit spawns nothing', async () => {
  const neverServing = contextWith(() => WELCOMED, ({ startNumber }) => writeTalosRecord(startNumber, { talos: processTable.born(), state: 'claimed' }));
  expect(await ensureTalos(neverServing.context)).toEqual({ verdict: 'unavailable', reason: 'not-serving', startNumber: 1 });
  expect(processTable.stopped).toHaveLength(1);

  const refusing = contextWith(() => WELCOMED, ({ startNumber }) => writeTalosRecord(startNumber, { state: 'quit', quitReason: 'start-refused' }));
  writeTalosRecord(1, { state: 'quit' });
  expect(await ensureTalos(refusing.context)).toEqual({ verdict: 'unavailable', reason: 'start-refused', startNumber: 2 });

  const unfit = contextWith(() => WELCOMED, SERVING_TALOS, false);
  expect(await ensureTalos(unfit.context)).toEqual({ verdict: 'unavailable', reason: 'endpoint-does-not-fit', startNumber: 3 });
  expect(unfit.spawned).toEqual([]);
});
