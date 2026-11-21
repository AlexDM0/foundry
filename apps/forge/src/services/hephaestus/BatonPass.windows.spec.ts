/**
 * A Baton pass over the Windows adapter's fake process table. What matters: a silent successor really ends, with or without a logger for the kill,
 * so the take-back binds at once rather than reading `successor-live` until its tries run out.
 */
import { mkdirSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createFakeWindowsKernel, fakeWindowsSupervision, type FakeWindowsKernel } from '../../testing/FakeWindowsKernel.ts';
import { nativePlatformPorts }                                                     from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }                          from '../../testing/ScratchWorkspace.ts';
import { BatonPass }                                                               from './BatonPass.ts';

const SUCCESSOR_PROCESS_ID = 5001;
const SUCCESSOR_CHILD_ID = 5002;
const SUCCESSOR_CREATION_TIME = 134_000_000_000_000_001n;
const REBIND_TRIES = 3;
const SCHEDULE = { readyTries: 2, releaseTries: 2, intervalMilliseconds: 1 };

let hephaestusDirectory = '';
let kernel: FakeWindowsKernel;

beforeEach(() => {
  hephaestusDirectory = createScratchDirectory('baton-pass-windows');
  mkdirSync(hephaestusDirectory, { recursive: true });
  kernel = createFakeWindowsKernel();
  kernel.table.set(SUCCESSOR_PROCESS_ID, { creationTime: SUCCESSOR_CREATION_TIME });
  kernel.table.set(SUCCESSOR_CHILD_ID, { creationTime: SUCCESSOR_CREATION_TIME + 1n, parentProcessId: SUCCESSOR_PROCESS_ID });
});

afterEach(() => {
  removeScratchDirectory(hephaestusDirectory);
});

describe('a silent successor on Windows', () => {
  test('is ended with its tree, with no logger given, and the take-back then binds on its first try', async () => {
    const processSupervision = fakeWindowsSupervision(kernel);
    const ports = { ...nativePlatformPorts(), processSupervision };
    const successor = processSupervision.identityOf(SUCCESSOR_PROCESS_ID);
    const batonPassFilePath = BatonPass.batonPassFilePathOf(hephaestusDirectory, 1);
    BatonPass.writeBatonPass(batonPassFilePath, { state: 'requested' });
    const outcome = await BatonPass.handOver({
      ports,
      batonPassFilePath,
      successor,
      successorCodeVersion: 'code-successor',
      release:              () => Promise.resolve(),
      recordFailure:        () => Promise.resolve(),
      schedule:             SCHEDULE,
    });
    expect(outcome.verdict).toBe('kept-driving');
    expect(kernel.table.size).toBe(0);
    let binds = 0;
    const rebound = await BatonPass.rebindAfterTakeBack({
      ports,
      successor,
      tries:                REBIND_TRIES,
      intervalMilliseconds: SCHEDULE.intervalMilliseconds,
      bind:                 () => {
        binds += 1;
        return Promise.resolve('bound-example');
      },
    });
    expect(rebound).toEqual({ verdict: 'bound', bound: 'bound-example' });
    expect(binds).toBe(1);
  });
});
