/**
 * The Baton's generations in one process: what matters is that a live newest generation refuses, a dead one is followed by the next, the
 * holder removes only the generations below its own, a newer generation makes the holder's effect-batch check refuse `baton-taken`
 * as unrepaired, and a release never unlinks a generation the releaser does not hold. Two starters racing are
 * `cli/overseer/OverseerCommand.integration.spec.ts`'s. Where hard links fail, both claims are refused in words and leave no Baton.
 */
import { writeFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { FileReplace }                               from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                       from '../../lib/atomic-file/FileReplaceFor.ts';
import { OperationRefusal }                               from '../../shared/OperationRefusal.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { Baton, type BatonRecord }                        from './Baton.ts';

const ports = nativePlatformPorts();
const { identityOf } = ports.processSupervision;

let overseerDirectory = '';

function recordOf(startStamp: string): BatonRecord {
  const ownIdentity = identityOf(process.pid);
  if (ownIdentity === null) throw new Error('this process has no readable identity');
  return {
    processId:              process.pid,
    processStartStamp:      startStamp,
    bootIdentity:           ownIdentity.bootIdentity,
    port:                   4930,
    url:                    'http://127.0.0.1:4930/',
    tokenFile:              `${overseerDirectory}/token`,
    codeVersion:            'code-example',
    installVersion:         17,
    watcherProtocolVersion: 1,
  };
}

function liveRecord(): BatonRecord {
  return recordOf(identityOf(process.pid)?.startStamp ?? '0');
}

/** This process's pid under a start it never had: dead, whatever pids the machine has free. */
function deadRecord(): BatonRecord {
  return recordOf('1');
}

function plant(generation: number, record: BatonRecord): void {
  writeFileSync(Baton.batonFilePathFor(overseerDirectory, generation), JSON.stringify(record));
}

beforeEach(() => {
  overseerDirectory = createScratchDirectory('overseer-baton');
});

afterEach(() => {
  removeScratchDirectory(overseerDirectory);
});

/** Hard links fail here, while the exclusive open that would leave a partial file still works. */
const fileReplaceWithoutLinks: FileReplace = {
  ...fileReplaceOfThisProcess(),
  createWholeExclusively: () => {
    throw Object.assign(new Error('EPERM: example link refusal'), { code: 'EPERM' });
  },
};

test.each([
  ['acquire', () => Baton.acquire(ports, overseerDirectory, liveRecord(), fileReplaceWithoutLinks)],
  ['acquireAbove', () => Baton.acquireAbove(overseerDirectory, liveRecord(), 0, fileReplaceWithoutLinks)],
])('Baton.%s creates its record whole, so where hard links fail it is refused in words and no Baton exists', (_claim, claim) => {
  let refusal: unknown = null;
  try {
    claim();
  } catch (thrown) {
    refusal = thrown;
  }
  expect(refusal instanceof OperationRefusal ? refusal.status : null).toBe('refused');
  const batonFilePath = Baton.batonFilePathFor(overseerDirectory, 1);
  const detail = { kind: 'baton-not-created-whole', batonFilePath, reason: 'Error: EPERM: example link refusal' } as const;
  expect(refusal instanceof OperationRefusal ? refusal.detail : null).toEqual(detail);
  expect(Baton.batonGenerationsIn(overseerDirectory)).toEqual([]);
});

describe('Baton.acquire', () => {
  test('an empty folder gives generation 1, and a live newest generation then refuses already-running with its record', () => {
    expect(Baton.acquire(ports, overseerDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 1 });
    expect(Baton.acquire(ports, overseerDirectory, liveRecord())).toEqual({ verdict: 'already-running', generation: 1, record: liveRecord() });
    expect(Baton.newestBatonOf(ports, overseerDirectory)).toEqual({ verdict: 'live', generation: 1, record: liveRecord() });
  });

  test('a dead newest generation, or an unreadable one, is followed by the next, which removes every older one', () => {
    plant(2, deadRecord());
    writeFileSync(Baton.batonFilePathFor(overseerDirectory, 5), '{ not a baton');
    expect(Baton.newestBatonOf(ports, overseerDirectory)).toEqual({ verdict: 'dead', generation: 5, record: null });
    expect(Baton.acquire(ports, overseerDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 6 });
    expect(Baton.batonGenerationsIn(overseerDirectory)).toEqual([6]);
  });
});

describe('the holder', () => {
  test('passes its effect-batch check while newest, and is refused baton-taken, unrepaired, once a newer generation exists', () => {
    Baton.acquire(ports, overseerDirectory, liveRecord());
    expect(() => Baton.requireNewestGeneration(overseerDirectory, 1)).not.toThrow();
    plant(2, deadRecord());
    let refusal: unknown = null;
    try {
      Baton.requireNewestGeneration(overseerDirectory, 1);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(OperationRefusal);
    expect((refusal as OperationRefusal).status).toBe('unrepaired');
    expect((refusal as OperationRefusal).detail).toEqual({ kind: 'baton-taken', batonFilePath: Baton.batonFilePathFor(overseerDirectory, 1) });
  });

  test('releases its own generation, and once overtaken unlinks nothing at all', () => {
    Baton.acquire(ports, overseerDirectory, liveRecord());
    Baton.release(overseerDirectory, 1);
    expect(Baton.newestBatonOf(ports, overseerDirectory)).toEqual({ verdict: 'none' });

    expect(Baton.acquire(ports, overseerDirectory, liveRecord())).toEqual({ verdict: 'acquired', generation: 1 });
    plant(2, deadRecord());
    Baton.release(overseerDirectory, 1);
    expect(Baton.batonGenerationsIn(overseerDirectory)).toEqual([1, 2]);
  });
});
