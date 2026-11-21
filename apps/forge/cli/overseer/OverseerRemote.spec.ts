/**
 * What the CLI asks a live Overseer over HTTP, against the recorded Overseer API in place of the global `fetch`. What matters: the identity
 * answers with no token; the state and a session code need the Baton's token, so another token or an unreadable token file gives `null`;
 * an Overseer gone answers nothing, never a throw; and a detached start whose child lost the Baton to an Overseer started at the same time
 * answers that Overseer's URL, not a refusal. Its child is a recorded spawn that has exited, and its rival a process of the recorded table.
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

import type { PlatformPorts }                                                     from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { Baton, type BatonRecord }                                                from '../../src/services/overseer/Baton.ts';
import { overseerFilesIn }                                                        from '../../src/services/overseer/OverseerFiles.ts';
import { nativePlatformPorts }                                                    from '../../src/testing/NativePlatformPorts.ts';
import { recordedOverseerAnswerOf, useRecordedOverseerFetch }                     from '../../src/testing/RecordedOverseerAnswers.ts';
import { OVERSEER_CALL_SHAPES, type RecordedHttpResponse, type RecordedOverseer } from '../../src/testing/RecordedOverseerFetch.ts';
import { useRecordedProcessTable }                                                from '../../src/testing/RecordedProcessTable.ts';
import { createScratchDirectory, removeScratchDirectory }                         from '../../src/testing/ScratchWorkspace.ts';
import { OverseerRemote }                                                         from './OverseerRemote.ts';

const recordedOverseer = useRecordedOverseerFetch();
const processTable     = useRecordedProcessTable(nativePlatformPorts());

/** A child of `oversee` that lost the Baton: it has exited, as `Baton.acquire` refused it. */
const CHILD_THAT_LOST_THE_BATON = {
  pid: 4343, exitCode: 1, exited: Promise.resolve(1), unref: () => undefined
};

let scratchDirectory = '';
let overseer: RecordedOverseer;
let globalFetch: ReturnType<typeof spyOn> | null = null;

function batonRecordWithToken(token: string | null): BatonRecord {
  const tokenFile = join(scratchDirectory, 'token');
  if (token !== null) writeFileSync(tokenFile, `${token}\n`);
  return {
    processId:            4242,
    processStartStamp:    'example-start',
    bootIdentity:         'example-boot',
    port:                 overseer.port,
    url:                  overseer.url,
    tokenFile,
    codeVersion:          'code-example',
    installVersion:       17,
    talosProtocolVersion: 2,
  };
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('overseer-remote');
  overseer = recordedOverseer();
  globalFetch = spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL, init?: RequestInit) => overseer.fetch(input, init)) as typeof fetch);
});

afterEach(() => {
  globalFetch?.mockRestore();
  removeScratchDirectory(scratchDirectory);
});

describe('OverseerRemote over the recorded API', () => {
  test('the identity answers with no token, and an Overseer gone answers nothing', async () => {
    expect(await OverseerRemote.identityAnswers(batonRecordWithToken(null))).toBe(true);
    expect(overseer.requests.map((request) => [request.callShape, request.authorization])).toEqual([[OVERSEER_CALL_SHAPES.IDENTITY, null]]);
    overseer.stop();
    expect(await OverseerRemote.identityAnswers(batonRecordWithToken(null))).toBe(false);
  });

  test('the state is read with the Baton\'s token, and is null with another token or none', async () => {
    const recordedState = (recordedOverseerAnswerOf(OVERSEER_CALL_SHAPES.STATE) as RecordedHttpResponse).body;
    expect(await OverseerRemote.stateOf(batonRecordWithToken('example-token'))).toEqual(recordedState);
    expect(await OverseerRemote.stateOf(batonRecordWithToken('another-token'))).toBeNull();
    expect(overseer.requests.map((request) => request.callShape)).toEqual([OVERSEER_CALL_SHAPES.STATE, OVERSEER_CALL_SHAPES.STATE_NO_TOKEN]);
    removeScratchDirectory(scratchDirectory);
    scratchDirectory = createScratchDirectory('overseer-remote');
    expect(await OverseerRemote.stateOf(batonRecordWithToken(null))).toBeNull();
  });

  test('a detached start whose child lost the Baton to a rival started at the same time answers the rival\'s URL', async () => {
    const rival = processTable.bornProcess();
    const platformPorts: PlatformPorts = {
      ...processTable.ports,
      processSupervision: { ...processTable.ports.processSupervision, spawnOptionsFor: nativePlatformPorts().processSupervision.spawnOptionsFor },
    };
    const overseerDirectory = join(scratchDirectory, 'overseer');
    mkdirSync(overseerDirectory);
    const acquisition = Baton.acquire(platformPorts, overseerDirectory, {
      ...batonRecordWithToken('example-token'), processId: rival.processId, processStartStamp: rival.startStamp, bootIdentity: rival.bootIdentity
    });
    expect(acquisition.verdict).toBe('acquired');
    const spawn = spyOn(Bun, 'spawn').mockImplementation((() => CHILD_THAT_LOST_THE_BATON) as unknown as typeof Bun.spawn);
    try {
      const files = overseerFilesIn(scratchDirectory);
      expect(await OverseerRemote.startDetached({ programCommand: ['example-program'], platformPorts }, scratchDirectory, files, [])).toBe(overseer.url);
    } finally {
      spawn.mockRestore();
    }
  });
});
