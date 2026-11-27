/**
 * The Hephaestus lock's generations in one process: what matters is that a live newest generation refuses, also one that cannot be read but
 * names a live process, a dead one is followed by the next, the holder removes only the generations below its own, a newer generation makes
 * the holder's effect-batch check refuse `hephaestus-lock-taken` as unrepaired, and a release never unlinks a generation the releaser does not
 * hold. Two starters racing are
 * `cli/hephaestus/StartCommand.integration.spec.ts`'s. Where hard links fail, both claims are refused in words and leave no Hephaestus lock. This
 * process's identity is the recorded process table's, so no spec reads it through a program a sandbox may refuse.
 */
import { writeFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createHephaestusLockWriter }                     from '../../adapters/hephaestus-lock/HephaestusLockWriter.ts';
import type { FileReplace }                               from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                       from '../../lib/atomic-file/FileReplaceFor.ts';
import { OperationRefusal }                               from '../../shared/OperationRefusal.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { useRecordedProcessTable }                        from '../../testing/RecordedProcessTable.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                           from '../../testing/ToolGuard.ts';
import { HephaestusLock, type HephaestusLockRecord }      from './HephaestusLock.ts';

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

/** Hard links fail here, while the exclusive open that would leave a partial file still works. */
const fileReplaceWithoutLinks: FileReplace = {
  ...fileReplaceOfThisProcess(),
  createWholeExclusively: () => {
    throw Object.assign(new Error('EPERM: example link refusal'), { code: 'EPERM' });
  },
};

describeWhenRecorded(['process-table-recording'], 'a claim where hard links fail', () => {
  test.each([
    ['acquire', () => HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord(), fileReplaceWithoutLinks)],
  ])('Hephaestus lock.%s creates its record whole, so where hard links fail it is refused in words and no Hephaestus lock exists', (_claim, claim) => {
    let refusal: unknown = null;
    try {
      claim();
    } catch (thrown) {
      refusal = thrown;
    }
    expect(refusal instanceof OperationRefusal ? refusal.status : null).toBe('refused');
    const hephaestusLockFilePath = HephaestusLock.filePathFor(hephaestusDirectory, 1);
    const detail = { kind: 'hephaestus-lock-not-created-whole', hephaestusLockFilePath, reason: 'Error: EPERM: example link refusal' } as const;
    expect(refusal instanceof OperationRefusal ? refusal.detail : null).toEqual(detail);
    expect(HephaestusLock.generationsIn(hephaestusDirectory)).toEqual([]);
  });
});

describeWhenRecorded(['process-table-recording'], 'HephaestusLock.acquire', () => {
  test('an empty folder gives generation 1, and a live newest generation then refuses already-running with its URL', () => {
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 1 });
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'already-running', generation: 1, url: liveRecord().url });
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toEqual({ verdict: 'live', generation: 1, record: liveRecord() });
  });

  test('a dead newest generation, or an unreadable one, is followed by the next, which removes every older one', () => {
    plant(2, deadRecord());
    writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 5), '{ not a hephaestusLock');
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toMatchObject({ verdict: 'dead', generation: 5, record: null });
    const acquisition = HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord());
    expect(acquisition).toMatchObject({ verdict: 'acquired', generation: 6, unreadableTakenOver: { hephaestusLockFilePath: HephaestusLock.filePathFor(hephaestusDirectory, 5) } });
    expect(acquisition.verdict === 'acquired' ? acquisition.unreadableTakenOver?.reason : null).toStartWith('it is not valid JSON');
    expect(HephaestusLock.generationsIn(hephaestusDirectory)).toEqual([6]);
  });

  test('an unreadable newest generation whose JSON names a live process, as an older Hephaestus\'s lock with no version, reads live and is never taken over', () => {
    writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 4), JSON.stringify(liveRecord()));
    const {
      processId, processStartStamp, bootIdentity, url, tokenFile
    } = liveRecord();
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toEqual({
      verdict:    'live-unreadable',
      generation: 4,
      holder:     {
        processId, processStartStamp, bootIdentity, url, tokenFile
      },
      unreadableReason: 'its version is not 1'
    });
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'already-running', generation: 4, url });
    expect(HephaestusLock.generationsIn(hephaestusDirectory)).toEqual([4]);
  });

  test('an unreadable newest generation whose JSON names a dead process is taken over, and the take-over names it for the log', () => {
    writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 4), JSON.stringify(deadRecord()));
    expect(HephaestusLock.newestOf(ports, hephaestusDirectory)).toEqual({
      verdict: 'dead', generation: 4, record: null, unreadableReason: 'its version is not 1'
    });
    const unreadableTakenOver = { hephaestusLockFilePath: HephaestusLock.filePathFor(hephaestusDirectory, 4), reason: 'its version is not 1' };
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 5, unreadableTakenOver });
  });

  test('a dead newest generation that reads whole is taken over without an unreadable lock to log', () => {
    plant(3, deadRecord());
    expect(HephaestusLock.acquire(ports, hephaestusDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 4 });
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
