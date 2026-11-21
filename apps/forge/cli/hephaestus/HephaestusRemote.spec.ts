/**
 * What the CLI asks a live Hephaestus over HTTP, against the recorded Hephaestus API in place of the global `fetch`. What matters: the identity
 * answers with no token; the state needs the Baton's token, so another token or an unreadable token file gives `null`;
 * a Hephaestus gone answers nothing, never a throw; and a detached start whose child lost the Baton to a Hephaestus started at the same time
 * answers that Hephaestus's URL, not a refusal. Its child is a recorded spawn that has exited, and its rival a process of the recorded table.
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

import type { PlatformPorts }                                                         from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { Baton, type BatonRecord }                                                    from '../../src/services/hephaestus/Baton.ts';
import { hephaestusFilesIn }                                                          from '../../src/services/hephaestus/HephaestusFiles.ts';
import { nativePlatformPorts }                                                        from '../../src/testing/NativePlatformPorts.ts';
import { recordedHephaestusAnswerOf, useRecordedHephaestusFetch }                     from '../../src/testing/RecordedHephaestusAnswers.ts';
import { HEPHAESTUS_CALL_SHAPES, type RecordedHttpResponse, type RecordedHephaestus } from '../../src/testing/RecordedHephaestusFetch.ts';
import { useRecordedProcessTable }                                                    from '../../src/testing/RecordedProcessTable.ts';
import { createScratchDirectory, removeScratchDirectory }                             from '../../src/testing/ScratchWorkspace.ts';
import { HephaestusRemote }                                                           from './HephaestusRemote.ts';

const recordedHephaestus = useRecordedHephaestusFetch();
const processTable     = useRecordedProcessTable(nativePlatformPorts());

/** A child of `start` that lost the Baton: it has exited, as `Baton.acquire` refused it. */
const CHILD_THAT_LOST_THE_BATON = {
  pid: 4343, exitCode: 1, exited: Promise.resolve(1), unref: () => undefined
};

let scratchDirectory = '';
let hephaestus: RecordedHephaestus;
let globalFetch: ReturnType<typeof spyOn> | null = null;

function batonRecordWithToken(token: string | null): BatonRecord {
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
    expect(await HephaestusRemote.identityAnswers(batonRecordWithToken(null))).toBe(true);
    expect(hephaestus.requests.map((request) => [request.callShape, request.authorization])).toEqual([[HEPHAESTUS_CALL_SHAPES.IDENTITY, null]]);
    hephaestus.stop();
    expect(await HephaestusRemote.identityAnswers(batonRecordWithToken(null))).toBe(false);
  });

  test('the state is read with the Baton\'s token, and is null with another token or none', async () => {
    const recordedState = (recordedHephaestusAnswerOf(HEPHAESTUS_CALL_SHAPES.STATE) as RecordedHttpResponse).body;
    expect(await HephaestusRemote.stateOf(batonRecordWithToken('example-token'))).toEqual(recordedState);
    expect(await HephaestusRemote.stateOf(batonRecordWithToken('another-token'))).toBeNull();
    expect(hephaestus.requests.map((request) => request.callShape)).toEqual([HEPHAESTUS_CALL_SHAPES.STATE, HEPHAESTUS_CALL_SHAPES.STATE_NO_TOKEN]);
    removeScratchDirectory(scratchDirectory);
    scratchDirectory = createScratchDirectory('hephaestus-remote');
    expect(await HephaestusRemote.stateOf(batonRecordWithToken(null))).toBeNull();
  });

  test('a detached start whose child lost the Baton to a rival started at the same time answers the rival\'s URL', async () => {
    const rival = processTable.bornProcess();
    const platformPorts: PlatformPorts = {
      ...processTable.ports,
      processSupervision: { ...processTable.ports.processSupervision, spawnOptionsFor: nativePlatformPorts().processSupervision.spawnOptionsFor },
    };
    const hephaestusDirectory = join(scratchDirectory, 'hephaestus');
    mkdirSync(hephaestusDirectory);
    const acquisition = Baton.acquire(platformPorts, hephaestusDirectory, {
      ...batonRecordWithToken('example-token'), processId: rival.processId, processStartStamp: rival.startStamp, bootIdentity: rival.bootIdentity
    });
    expect(acquisition.verdict).toBe('acquired');
    const spawn = spyOn(Bun, 'spawn').mockImplementation((() => CHILD_THAT_LOST_THE_BATON) as unknown as typeof Bun.spawn);
    try {
      const files = hephaestusFilesIn(scratchDirectory);
      expect(await HephaestusRemote.startDetached({ programCommand: ['example-program'], platformPorts }, scratchDirectory, files, [])).toBe(hephaestus.url);
    } finally {
      spawn.mockRestore();
    }
  });
});
