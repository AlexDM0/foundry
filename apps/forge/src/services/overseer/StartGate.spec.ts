/**
 * The start gate on a scratch data folder, over a process table and a boot the spec plants. What matters: only a start the user made serves
 * after a crash or a crash suspected before a reboot, a login item and a successor stay off; the crash log is written once, whoever reads
 * the crash first, so a second refused start or the user's start finds the first log standing; a crash of a Baton generation that came round
 * again, after an older crash of that generation, writes a log of its own under the next number and the verdict names it; a start that died
 * before its presence write is named by its Baton's holder; a reboot with a fresh beat writes no log; a Talos lost in this boot names Talos;
 * and a crash whose generation nothing names is logged once, with no generation.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { LocalTimeUtil }                                  from '../../lib/local-time/LocalTimeUtil.ts';
import type { PlatformPorts }                             from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                           from '../../lib/process-identity/ProcessIdentity.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { PlantedChild }                                   from '../../testing/PlantedChild.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { writeReadableTracker }                           from '../../testing/TrackerFileFixtures.ts';
import { createLocalFilesBoardStore }                     from '../store/LocalFilesBoardStore.ts';
import { NO_LOCK_HOLDER_READS_AS_GONE }                   from '../tracker/GenerationLock.ts';
import { type Workspace, workspacePathsFor }              from '../tracker/Workspace.ts';
import type { CrashLogError }                             from './@types/CrashLogRecord.ts';
import type { PresenceEndingToWrite }                     from './@types/PresenceRecord.ts';
import { Baton }                                          from './Baton.ts';
import { CrashLog }                                       from './CrashLog.ts';
import { overseerFilesIn, type OverseerFiles }            from './OverseerFiles.ts';
import { Presence }                                       from './Presence.ts';
import type { StartOriginReading }                        from './StartClassification.ts';
import { StartGate }                                      from './StartGate.ts';
import { HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS }       from './constants/PresenceLimits.ts';

const CURRENT_BOOT = 'example-boot-today';
const EARLIER_BOOT = 'example-boot-yesterday';
const CRASHED_GENERATION = 4;
const BOOT_STARTED_AT_EPOCH_SECONDS = 1_800_000_000;
const BOOT_STARTED_AT_MILLISECONDS = BOOT_STARTED_AT_EPOCH_SECONDS * 1_000;
const RECORDED_AT = '2026-11-19T09:30:00+01:00';
const CRASHED_PROCESS_ID = 4242;
const TALOS_PROCESS_ID = 4343;
const THIS_PROCESS_START_STAMP = '1700000500';
const FIRST_CRASH_LOG_NUMBER = 1;

const LOGIN_ITEM: StartOriginReading = { startOrigin: 'login-item' };
const USER: StartOriginReading = { startOrigin: 'user' };

let scratchDirectory = '';
let workspace: Workspace;
let files: OverseerFiles;

beforeEach(() => {
  scratchDirectory = createScratchDirectory('start-gate');
  workspace = workspacePathsFor(scratchDirectory);
  writeReadableTracker(workspace);
  files = overseerFilesIn(workspace.trackerDirectory);
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

/** Only this process answers the process table: every planted process is gone. */
function portsInBoot(bootIdentity = CURRENT_BOOT): PlatformPorts {
  const native = nativePlatformPorts();
  return {
    ...native,
    processSupervision: {
      ...native.processSupervision,
      identityOf:                (processId) => (processId === process.pid ? { processId, startStamp: THIS_PROCESS_START_STAMP, bootIdentity } : null),
      bootStartedAtEpochSeconds: () => BOOT_STARTED_AT_EPOCH_SECONDS,
    },
  };
}

function crashedProcessIn(bootIdentity: string): ProcessIdentity {
  return { processId: CRASHED_PROCESS_ID, startStamp: '1700000000', bootIdentity };
}

function plantBaton(generation: number, { processId, startStamp, bootIdentity }: ProcessIdentity): void {
  mkdirSync(files.overseerDirectory, { recursive: true });
  writeFileSync(Baton.batonFilePathFor(files.overseerDirectory, generation), `${JSON.stringify({
    processId,
    processStartStamp:    startStamp,
    bootIdentity,
    port:                 4100,
    url:                  'http://127.0.0.1:4100/',
    tokenFile:            '/example/token',
    codeVersion:          'code-example',
    installVersion:       1,
    talosProtocolVersion: 1,
  }, null, 2)}\n`);
}

/** The generation before this start: its presence record, its ending, and the Baton it held unless it let go of it. */
function plantPreviousGeneration(bootIdentity: string, ending: PresenceEndingToWrite | null, keptItsBaton: boolean): void {
  Presence.writeStartedPresence(files, {
    generation:          CRASHED_GENERATION,
    process:             crashedProcessIn(bootIdentity),
    codeVersion:         'code-example',
    startOrigin:         'user',
    startedAt:           '2026-11-19T08:00:00+01:00',
    startClassification: null,
  });
  if (ending !== null) Presence.writeEnding(files, CRASHED_GENERATION, ending, '2026-11-19T09:00:00+01:00');
  if (keptItsBaton) plantBaton(CRASHED_GENERATION, crashedProcessIn(bootIdentity));
}

function beatBeforeBoot(millisecondsBeforeBoot: number): void {
  Presence.writeHeartbeat(files, CRASHED_GENERATION, LocalTimeUtil.formatLocalIso(new Date(BOOT_STARTED_AT_MILLISECONDS - millisecondsBeforeBoot)));
}

function boardReads() {
  return createLocalFilesBoardStore({ workspace, now: () => new Date(RECORDED_AT), lockHolderIsGone: NO_LOCK_HOLDER_READS_AS_GONE }).reads;
}

function admit(origin: StartOriginReading, ports = portsInBoot()) {
  return StartGate.admit({
    ports, files, workspace, boardReads: boardReads(), origin, stampNow: () => RECORDED_AT
  });
}

function storedCrashLog(crashLogNumber = FIRST_CRASH_LOG_NUMBER) {
  const reading = CrashLog.read(files, crashLogNumber);
  if (reading.verdict !== 'read') throw new Error(`crash log ${crashLogNumber} is ${reading.verdict}`);
  return reading.record;
}

/** A crash log the crash path wrote for `generation`, of the process `batonHolder` names. */
function crashPathLogOf(generation: number, error: CrashLogError | null = null, batonHolder: ProcessIdentity | null = null) {
  return CrashLog.assemble({
    crashedGeneration: generation,
    component:         'overseer',
    suspected:         false,
    classification:    null,
    recordedAt:        RECORDED_AT,
    recordedBy:        { generation, startOrigin: 'user', crashPath: true },
    error,
    presence:          null,
    batonHolder,
    heartbeat:         null,
    activeJobs:        [],
    talosChildren:     null,
    logTail:           [],
  });
}

describe('after a crash in this boot', () => {
  beforeEach(() => {
    plantPreviousGeneration(CURRENT_BOOT, null, true);
  });

  test('a login-item start stays off and writes one crash log, of the Overseer, recorded by the start', () => {
    const verdict = admit(LOGIN_ITEM);

    expect(verdict).toMatchObject({
      verdict: 'stay-off', crashLogNumber: FIRST_CRASH_LOG_NUMBER, crashedGeneration: CRASHED_GENERATION, crashLogPath: CrashLog.pathOf(files, FIRST_CRASH_LOG_NUMBER)
    });
    expect(verdict.classification).toMatchObject({ kind: 'crashed', crashedComponent: 'overseer', previousGeneration: CRASHED_GENERATION });
    expect(CrashLog.list(files)).toEqual([FIRST_CRASH_LOG_NUMBER]);
    expect(storedCrashLog()).toMatchObject({
      crashedGeneration: CRASHED_GENERATION,
      component:         'overseer',
      suspected:         false,
      recordedBy:        { generation: null, startOrigin: 'login-item', crashPath: false },
      crashedProcess:    crashedProcessIn(CURRENT_BOOT),
      activeJobs:        [],
    });
  });

  test('a second refused start writes no second log and leaves the first byte for byte', () => {
    admit(LOGIN_ITEM);
    const firstLog = readFileSync(CrashLog.pathOf(files, FIRST_CRASH_LOG_NUMBER), 'utf8');

    const again = StartGate.admit({
      ports: portsInBoot(), files, workspace, boardReads: boardReads(), origin: LOGIN_ITEM, stampNow: () => '2026-11-19T10:00:00+01:00'
    });

    expect(again).toMatchObject({ verdict: 'stay-off', crashLogNumber: FIRST_CRASH_LOG_NUMBER });
    expect(CrashLog.list(files)).toEqual([FIRST_CRASH_LOG_NUMBER]);
    expect(readFileSync(CrashLog.pathOf(files, FIRST_CRASH_LOG_NUMBER), 'utf8')).toBe(firstLog);
  });

  test('after an older crash of the same generation, the crash writes a log of its own under the next number, and the verdict names it', () => {
    const earlierRun = { processId: 4141, startStamp: '1699990000', bootIdentity: CURRENT_BOOT };
    CrashLog.writeOnce(files, crashPathLogOf(CRASHED_GENERATION, {
      origin: 'pass', name: 'EarlierError', message: 'an earlier crash of the same generation', stack: null
    }, earlierRun));
    const olderLog = readFileSync(CrashLog.pathOf(files, FIRST_CRASH_LOG_NUMBER), 'utf8');

    const verdict = admit(LOGIN_ITEM);

    expect(verdict).toMatchObject({
      verdict: 'stay-off', crashLogNumber: 2, crashedGeneration: CRASHED_GENERATION, crashLogPath: CrashLog.pathOf(files, 2)
    });
    expect(CrashLog.list(files)).toEqual([FIRST_CRASH_LOG_NUMBER, 2]);
    expect(storedCrashLog(2)).toMatchObject({ crashedGeneration: CRASHED_GENERATION, crashedProcess: crashedProcessIn(CURRENT_BOOT), error: null });
    expect(readFileSync(CrashLog.pathOf(files, FIRST_CRASH_LOG_NUMBER), 'utf8')).toBe(olderLog);
    expect(admit(LOGIN_ITEM)).toMatchObject({ crashLogNumber: 2 });
  });

  test('a successor whose predecessor died during the Baton pass stays off', () => {
    const verdict = admit({ startOrigin: 'successor', predecessorGeneration: CRASHED_GENERATION });

    expect(verdict.verdict).toBe('stay-off');
    expect(verdict.classification.kind).toBe('crashed');
    expect(storedCrashLog().recordedBy.startOrigin).toBe('successor');
  });
});

test('a user start after a crash the crash path recorded serves and finds that crash log already there', () => {
  plantPreviousGeneration(CURRENT_BOOT, { kind: 'crashed', component: 'overseer', crashLogNumber: FIRST_CRASH_LOG_NUMBER }, true);
  CrashLog.writeOnce(files, crashPathLogOf(CRASHED_GENERATION, {
    origin: 'pass', name: 'Error', message: 'example failure', stack: null
  }));

  const verdict = admit(USER);

  expect(verdict).toMatchObject({ verdict: 'serve', crashLogNumber: FIRST_CRASH_LOG_NUMBER });
  expect(CrashLog.list(files)).toEqual([FIRST_CRASH_LOG_NUMBER]);
  expect(verdict.classification.kind).toBe('crashed');
  expect(storedCrashLog()).toMatchObject({ recordedBy: { crashPath: true }, error: { message: 'example failure' } });
});

describe('after a reboot the generation before did not record', () => {
  beforeEach(() => {
    plantPreviousGeneration(EARLIER_BOOT, null, true);
  });

  test('a login-item start with a stale beat stays off and writes a log marked suspected, of no known component', () => {
    beatBeforeBoot(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS * 2);

    const verdict = admit(LOGIN_ITEM);

    expect(verdict.verdict).toBe('stay-off');
    expect(verdict.classification).toMatchObject({ kind: 'machine-went-down', crashSuspected: true });
    expect(storedCrashLog()).toMatchObject({ suspected: true, component: 'unknown', lastHeartbeat: { sequence: 1 } });
  });

  test('a login-item start with a fresh beat serves and writes no crash log', () => {
    beatBeforeBoot(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS / 4);

    const verdict = admit(LOGIN_ITEM);

    expect(verdict).toMatchObject({ verdict: 'serve', crashLogNumber: null });
    expect(verdict.classification).toMatchObject({ kind: 'machine-went-down', crashSuspected: false });
    expect(CrashLog.list(files)).toEqual([]);
  });
});

test('a login-item start after a Talos lost in this boot, the forge stopped on purpose, stays off with a log naming Talos', () => {
  plantPreviousGeneration(CURRENT_BOOT, { kind: 'stopped' }, false);
  PlantedChild.plantTalosRecord(workspace.trackerDirectory, 1, { talos: { processId: TALOS_PROCESS_ID, startStamp: '1700000001', bootIdentity: CURRENT_BOOT } });

  const verdict = admit(LOGIN_ITEM);

  expect(verdict.verdict).toBe('stay-off');
  expect(verdict.classification).toMatchObject({ kind: 'crashed', crashedComponent: 'talos', evidence: { talos: 'lost-this-boot' } });
  expect(storedCrashLog().component).toBe('talos');
});

test('a login-item start after a stop on purpose, its Talos still live, serves with no crash log', () => {
  plantPreviousGeneration(CURRENT_BOOT, { kind: 'stopped' }, false);
  PlantedChild.plantTalosRecord(workspace.trackerDirectory, 1, { talos: { processId: process.pid, startStamp: THIS_PROCESS_START_STAMP, bootIdentity: CURRENT_BOOT } });

  expect(admit(LOGIN_ITEM)).toMatchObject({ verdict: 'serve', crashLogNumber: null, classification: { kind: 'stopped-on-purpose', evidence: { talos: 'live' } } });
  expect(CrashLog.list(files)).toEqual([]);
});

test('a start that took Baton 1 again after a stop and died before its presence write is logged as the crash of that Baton\'s holder', () => {
  plantPreviousGeneration(CURRENT_BOOT, { kind: 'stopped' }, false);
  const diedBeforePresence = { processId: 4545, startStamp: '1700000300', bootIdentity: CURRENT_BOOT };
  plantBaton(1, diedBeforePresence);

  const verdict = admit(LOGIN_ITEM);

  expect(verdict).toMatchObject({ verdict: 'stay-off', crashLogNumber: FIRST_CRASH_LOG_NUMBER, crashedGeneration: 1 });
  expect(storedCrashLog()).toMatchObject({ crashedGeneration: 1, crashedProcess: diedBeforePresence, startedAt: null });
});

test('a crash whose generation nothing names is logged under the next number with no generation, and a second start finds that log', () => {
  mkdirSync(files.overseerDirectory, { recursive: true });
  writeFileSync(files.presenceFilePath, 'not JSON\n');
  CrashLog.writeOnce(files, crashPathLogOf(2));

  const first = admit(LOGIN_ITEM);
  const second = admit(LOGIN_ITEM);

  expect(first).toMatchObject({ verdict: 'stay-off', crashLogNumber: 2, crashedGeneration: null });
  expect(second).toMatchObject({ verdict: 'stay-off', crashLogNumber: 2, crashedGeneration: null });
  expect(CrashLog.list(files)).toEqual([FIRST_CRASH_LOG_NUMBER, 2]);
  expect(storedCrashLog(2).crashedGeneration).toBeNull();
});
