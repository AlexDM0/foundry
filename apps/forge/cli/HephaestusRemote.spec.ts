/**
 * What the CLI asks a live Hephaestus over HTTP, against the recorded API. The identity needs no token, the state needs the lock's token; a
 * Hephaestus gone answers nothing, never a throw; and a detached start whose child lost the lock to a rival started at the same time answers the
 * rival's URL.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import type { PlatformPorts }                                                         from '../src/lib/platform-ports/PlatformPortsFor.ts';
import { hephaestusFilesIn }                                                          from '../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock, type HephaestusLockRecord }                                  from '../src/services/hephaestus/HephaestusLock.ts';
import { nativePlatformPorts }                                                        from '../src/testing/NativePlatformPorts.ts';
import { recordedHephaestusAnswerOf, useRecordedHephaestusFetch }                     from '../src/testing/RecordedHephaestusAnswers.ts';
import { HEPHAESTUS_CALL_SHAPES, type RecordedHttpResponse, type RecordedHephaestus } from '../src/testing/RecordedHephaestusFetch.ts';
import { useRecordedProcessTable }                                                    from '../src/testing/RecordedProcessTable.ts';
import { createScratchDirectory, removeScratchDirectory }                             from '../src/testing/ScratchWorkspace.ts';
import { HephaestusRemote }                                                           from './HephaestusRemote.ts';

const recordedHephaestus = useRecordedHephaestusFetch();
const processTable     = useRecordedProcessTable(nativePlatformPorts());

/** A child of `start` that lost the Hephaestus lock: it has exited, as `HephaestusLock.acquire` refused it. */
const CHILD_THAT_LOST_THE_HEPHAESTUS_LOCK = {
  pid: 4343, exitCode: 1, exited: Promise.resolve(1), unref: () => undefined
};

let scratchDirectory = '';
let hephaestus: RecordedHephaestus;
let globalFetch: ReturnType<typeof spyOn> | null = null;

function hephaestusLockRecordWithToken(token: string | null): HephaestusLockRecord {
  const tokenFile = join(scratchDirectory, 'token');
  if (token !== null) writeFileSync(tokenFile, `${token}\n`);
  return {
    processId:            4242,
    processStartStamp:    'example-start',
    bootIdentity:         'example-boot',
    port:                 hephaestus.port,
    url:                  hephaestus.url,
    tokenFile,
    codeVersion:          'code-example',
    installVersion:       17,
    talosProtocolVersion: 2,
  };
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('hephaestus-remote');
  hephaestus = recordedHephaestus();
  globalFetch = spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL, init?: RequestInit) => hephaestus.fetch(input, init)) as typeof fetch);
});

afterEach(() => {
  globalFetch?.mockRestore();
  removeScratchDirectory(scratchDirectory);
});

describe('HephaestusRemote over the recorded API', () => {
  test('the identity answers with no token, and a Hephaestus gone answers nothing', async () => {
    expect(await HephaestusRemote.identityAnswers(hephaestusLockRecordWithToken(null))).toBe(true);
    expect(hephaestus.requests.map((request) => [request.callShape, request.authorization])).toEqual([[HEPHAESTUS_CALL_SHAPES.IDENTITY, null]]);
    hephaestus.stop();
    expect(await HephaestusRemote.identityAnswers(hephaestusLockRecordWithToken(null))).toBe(false);
  });

  test('the state is read with the Hephaestus lock\'s token, and is null with another token or none', async () => {
    const recordedState = (recordedHephaestusAnswerOf(HEPHAESTUS_CALL_SHAPES.STATE) as RecordedHttpResponse).body;
    expect(await HephaestusRemote.stateOf(hephaestusLockRecordWithToken('example-token'))).toEqual(recordedState);
    expect(await HephaestusRemote.stateOf(hephaestusLockRecordWithToken('another-token'))).toBeNull();
    expect(hephaestus.requests.map((request) => request.callShape)).toEqual([HEPHAESTUS_CALL_SHAPES.STATE, HEPHAESTUS_CALL_SHAPES.STATE_NO_TOKEN]);
    removeScratchDirectory(scratchDirectory);
    scratchDirectory = createScratchDirectory('hephaestus-remote');
    expect(await HephaestusRemote.stateOf(hephaestusLockRecordWithToken(null))).toBeNull();
  });

  test('a detached start whose child lost the Hephaestus lock to a rival started at the same time answers the rival\'s URL', async () => {
    const rival = processTable.bornProcess();
    const platformPorts: PlatformPorts = {
      ...processTable.ports,
      processSupervision: { ...processTable.ports.processSupervision, spawnOptionsFor: nativePlatformPorts().processSupervision.spawnOptionsFor },
    };
    const hephaestusDirectory = join(scratchDirectory, 'hephaestus');
    mkdirSync(hephaestusDirectory);
    const acquisition = HephaestusLock.acquire(platformPorts, hephaestusDirectory, {
      ...hephaestusLockRecordWithToken('example-token'), processId: rival.processId, processStartStamp: rival.startStamp, bootIdentity: rival.bootIdentity
    });
    expect(acquisition.verdict).toBe('acquired');
    const spawn = spyOn(Bun, 'spawn').mockImplementation((() => CHILD_THAT_LOST_THE_HEPHAESTUS_LOCK) as unknown as typeof Bun.spawn);
    try {
      const files = hephaestusFilesIn(scratchDirectory);
      expect(await HephaestusRemote.startDetached({ programCommand: ['example-program'], platformPorts }, scratchDirectory, files, [])).toBe(hephaestus.url);
    } finally {
      spawn.mockRestore();
    }
  });
});
