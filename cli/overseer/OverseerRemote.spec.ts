/**
 * What the CLI asks a live Overseer over HTTP, against the recorded Overseer API in place of the global `fetch`. What matters: the identity
 * answers with no token; the state and a session code need the Baton's token, so another token or an unreadable token file gives `null`;
 * and an Overseer gone answers nothing, never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import type { BatonRecord }                                                       from '../../src/services/overseer/Baton.ts';
import { recordedOverseerAnswerOf, useRecordedOverseerFetch }                     from '../../src/testing/RecordedOverseerAnswers.ts';
import { OVERSEER_CALL_SHAPES, type RecordedHttpResponse, type RecordedOverseer } from '../../src/testing/RecordedOverseerFetch.ts';
import { createScratchDirectory, removeScratchDirectory }                         from '../../src/testing/ScratchWorkspace.ts';
import { OverseerRemote }                                                         from './OverseerRemote.ts';

const recordedOverseer = useRecordedOverseerFetch();

let scratchDirectory = '';
let overseer: RecordedOverseer;
let globalFetch: ReturnType<typeof spyOn> | null = null;

function batonRecordWithToken(token: string | null): BatonRecord {
  const tokenFile = join(scratchDirectory, 'token');
  if (token !== null) writeFileSync(tokenFile, `${token}\n`);
  return {
    processId:              4242,
    processStartStamp:      'example-start',
    bootIdentity:           'example-boot',
    port:                   overseer.port,
    url:                    overseer.url,
    tokenFile,
    codeVersion:            'code-example',
    installVersion:         17,
    watcherProtocolVersion: 2,
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
    expect(overseer.requests.map((request) => request.callShape)).toEqual([OVERSEER_CALL_SHAPES.STATE, OVERSEER_CALL_SHAPES.STATE_NO_SESSION]);
    removeScratchDirectory(scratchDirectory);
    scratchDirectory = createScratchDirectory('overseer-remote');
    expect(await OverseerRemote.stateOf(batonRecordWithToken(null))).toBeNull();
  });

  test('a session code is asked for with the Baton\'s token and buys the session once', async () => {
    const code = await OverseerRemote.sessionCodeOf(batonRecordWithToken('example-token'));
    expect(code).toMatch(/^[0-9a-f]+$/);
    expect(await OverseerRemote.sessionCodeOf(batonRecordWithToken('another-token'))).toBeNull();
    const exchange = () => overseer.fetch('/api/session', { method: 'POST', body: JSON.stringify({ code }) });
    expect((await exchange()).status).toBe(200);
    expect((await exchange()).status).toBe(401);
  });
});
