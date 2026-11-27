/**
 * The Hephaestus lock's generations in one process: what matters is that a live newest generation refuses, also one of older code with no
 * version, a dead or unreadable one is followed by the next and named for the log, the holder removes only the generations below its own, a
 * newer generation makes the holder's effect-batch check refuse `hephaestus-lock-taken` as unrepaired, and a release never unlinks a
 * generation the releaser does not hold. Two starters racing are `cli/hephaestus/StartCommand.integration.spec.ts`'s. Where hard links fail,
 * both claims are refused in words and leave no Hephaestus lock. This process's identity is the recorded process table's, so no spec reads it
 * through a program a sandbox may refuse.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { HEPHAESTUS_LOCK_FORMAT_VERSION }                        from '../../adapters/hephaestus-lock/HephaestusLockIngestion.ts';
import { createHephaestusLockWriter }                            from '../../adapters/hephaestus-lock/HephaestusLockWriter.ts';
import { OperationRefusal }                                      from '../../shared/OperationRefusal.ts';
import { EXAMPLE_LINK_REFUSAL_MESSAGE, fileReplaceWithoutLinks } from '../../testing/FileReplaceWithoutLinks.ts';
import { nativePlatformPorts }                                   from '../../testing/NativePlatformPorts.ts';
import { useRecordedProcessTable }                               from '../../testing/RecordedProcessTable.ts';
import { createScratchDirectory, removeScratchDirectory }        from '../../testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                                  from '../../testing/ToolGuard.ts';
import { HephaestusLock, type HephaestusLockRecord }             from './HephaestusLock.ts';

const processTable = useRecordedProcessTable(nativePlatformPorts());
const { ports } = processTable;

let hephaestusDirectory = '';

function recordOf(startStamp: string): HephaestusLockRecord {
  const ownIdentity = processTable.callerProcess();
  return {
    processId:            process.pid,
    processStartStamp:    startStamp,
    bootIdentity:         ownIdentity.bootIdentity,
    port:                 4930,
    url:                  'http://127.0.0.1:4930/',
    tokenFile:            `${hephaestusDirectory}/token`,
    codeVersion:          'code-example',
    installVersion:       17,
    talosProtocolVersion: 1,
  };
}

function liveRecord(): HephaestusLockRecord {
  return recordOf(processTable.callerProcess().startStamp);
}

/** This process's pid under a start it never had: dead, whatever pids the machine has free. */
function deadRecord(): HephaestusLockRecord {
  return recordOf('1');
}

function plant(generation: number, record: HephaestusLockRecord): void {
  createHephaestusLockWriter(HephaestusLock.filePathFor(hephaestusDirectory, generation)).createWhole(record);
}

beforeEach(() => {
  hephaestusDirectory = createScratchDirectory('hephaestus-hephaestusLock');
});

afterEach(() => {
  removeScratchDirectory(hephaestusDirectory);
});

describeWhenRecorded(['process-table-recording'], 'a claim where hard links fail', () => {
  test.each([
    ['acquire', () => HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord(), fileReplaceWithoutLinks())],
  ])('Hephaestus lock.%s creates its record whole, so where hard links fail it is refused in words and no Hephaestus lock exists', (_claim, claim) => {
    let refusal: unknown = null;
    try {
      claim();
    } catch (thrown) {
      refusal = thrown;
    }
    expect(refusal instanceof OperationRefusal ? refusal.status : null).toBe('refused');
    const hephaestusLockFilePath = HephaestusLock.filePathFor(hephaestusDirectory, 1);
    const detail = { kind: 'hephaestus-lock-not-created-whole', hephaestusLockFilePath, systemError: `Error: ${EXAMPLE_LINK_REFUSAL_MESSAGE}` } as const;
    expect(refusal instanceof OperationRefusal ? refusal.detail : null).toEqual(detail);
    expect(HephaestusLock.generationsIn(hephaestusDirectory)).toEqual([]);
  });
});

describeWhenRecorded(['process-table-recording'], 'HephaestusLock.acquire', () => {
  test('an empty folder gives generation 1, and a live newest generation then refuses already-running with its record', () => {
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 1 });
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'already-running', generation: 1, record: liveRecord() });
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toEqual({ verdict: 'live', generation: 1, record: liveRecord() });
  });

  test('an unreadable newest generation, not JSON or of the wrong fields, reads dead and is taken over, named for the log', () => {
    plant(2, deadRecord());
    writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 5), '{ not a hephaestusLock');
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toMatchObject({ verdict: 'dead', generation: 5, record: null });
    const acquisition = HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord());
    expect(acquisition).toMatchObject({ verdict: 'acquired', generation: 6, staleTakenOver: { hephaestusLockFilePath: HephaestusLock.filePathFor(hephaestusDirectory, 5) } });
    const unreadableReason = acquisition.verdict === 'acquired' ? acquisition.staleTakenOver?.reason : null;
    expect(unreadableReason).toMatchObject({ kind: 'unreadable' });
    expect(unreadableReason?.kind === 'unreadable' ? unreadableReason.problem?.code : null).toBe('not-json');
    expect(HephaestusLock.generationsIn(hephaestusDirectory)).toEqual([6]);
    writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 7), JSON.stringify({ ...liveRecord(), port: 'not a port' }));
    const unreadableTakenOver = { reason: { kind: 'unreadable', problem: { code: 'field-not-a-number', field: 'port' } } };
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toMatchObject({ verdict: 'acquired', generation: 8, staleTakenOver: unreadableTakenOver });
  });

  test('a dead newest generation that reads whole is taken over, named for the log by its gone process', () => {
    plant(3, deadRecord());
    const staleTakenOver = { hephaestusLockFilePath: HephaestusLock.filePathFor(hephaestusDirectory, 3), reason: { kind: 'holder-gone' as const, processId: process.pid } };
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 4, staleTakenOver });
  });

  test('a newest generation without a version, as a Hephaestus of older code wrote, is judged by its process: live refuses, dead is taken over', () => {
    writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 4), JSON.stringify(liveRecord()));
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toEqual({ verdict: 'live', generation: 4, record: liveRecord() });
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'already-running', generation: 4, record: liveRecord() });
    expect(HephaestusLock.generationsIn(hephaestusDirectory)).toEqual([4]);

    writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 5), JSON.stringify(deadRecord()));
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toEqual({ verdict: 'dead', generation: 5, record: deadRecord() });
    const deadTakenOver = { reason: { kind: 'holder-gone' as const, processId: process.pid } };
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toMatchObject({ verdict: 'acquired', generation: 6, staleTakenOver: deadTakenOver });
    expect(JSON.parse(readFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 6), 'utf8'))).toEqual({ version: HEPHAESTUS_LOCK_FORMAT_VERSION, ...liveRecord() });
  });
});

describeWhenRecorded(['process-table-recording'], 'the holder', () => {
  test('passes its effect-batch check while newest, and is refused hephaestus-lock-taken, unrepaired, once a newer generation exists', () => {
    HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord());
    expect(() => HephaestusLock.requireNewestGeneration(hephaestusDirectory, 1)).not.toThrow();
    plant(2, deadRecord());
    let refusal: unknown = null;
    try {
      HephaestusLock.requireNewestGeneration(hephaestusDirectory, 1);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(OperationRefusal);
    expect((refusal as OperationRefusal).status).toBe('unrepaired');
    expect((refusal as OperationRefusal).detail).toEqual({ kind: 'hephaestus-lock-taken', hephaestusLockFilePath: HephaestusLock.filePathFor(hephaestusDirectory, 1) });
  });

  test('releases its own generation, and once overtaken unlinks nothing at all', () => {
    HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord());
    HephaestusLock.release(hephaestusDirectory, 1);
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toEqual({ verdict: 'none' });

    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 1 });
    plant(2, deadRecord());
    HephaestusLock.release(hephaestusDirectory, 1);
    expect(HephaestusLock.generationsIn(hephaestusDirectory)).toEqual([1, 2]);
  });
});
