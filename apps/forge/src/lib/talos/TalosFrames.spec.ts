/**
 * Reading a client line as a frame after the first line: each well-formed frame reads as itself with extra keys dropped, each malformed
 * field makes the line no frame, and a `hello` there is no frame, since only `helloFrameOf` reads a first line. A launch is carried as
 * it came, for `childLaunchOf` to check against the board. Every `client` entry of the event log round trips through its line.
 */
import { describe, expect, test } from 'bun:test';

import type { ClientEntry, ReceivedClientFrame } from './@types/TalosFrame.ts';
import {
  clientEntryLineOf,
  clientEntryOf,
  clientFrameOf,
  helloFrameOf,
  talosFrameLineOf,
} from './TalosFrames.ts';

const EXAMPLE_RENEWER = {
  processId: 4242, startStamp: '1790000000', bootIdentity: 'example-boot', generation: 3
};

const WELL_FORMED_FRAMES: readonly (readonly [string, ReceivedClientFrame])[] = [
  ['lease-renewal', { kind: 'lease-renewal', frameId: 1, renewer: EXAMPLE_RENEWER }],
  ['launch', { kind: 'launch', frameId: 2, launch: { childFolder: 'jobs/J1' } }],
  ['input of a line', {
    kind: 'input', frameId: 3, childId: 'jobs/J1#1', input: { act: 'write-line', line: '{"type":"user"}' }
  }],
  ['input that closes', {
    kind: 'input', frameId: 4, childId: 'jobs/J1#1', input: { act: 'close' }
  }],
  ['stop', {
    kind: 'stop', frameId: 5, childId: 'jobs/J1#1', graceMilliseconds: 3000
  }],
  ['stop-lines', { kind: 'stop-lines', frameId: 6 }],
  ['quit', { kind: 'quit', frameId: 7, reason: 'restart' }],
];

describe('clientFrameOf', () => {
  test.each(WELL_FORMED_FRAMES)('reads %s as itself, extra keys dropped', (_title, frame) => {
    expect(clientFrameOf(JSON.stringify({ ...frame, later: true }))).toEqual(frame);
  });

  test('drops extra keys of a renewer and of an input', () => {
    const line = JSON.stringify({
      kind: 'input', frameId: 1, childId: 'jobs/J1#1', input: { act: 'close', line: 'ignored' }
    });
    expect(clientFrameOf(line)).toEqual({
      kind: 'input', frameId: 1, childId: 'jobs/J1#1', input: { act: 'close' }
    });
    const renewal = JSON.stringify({ kind: 'lease-renewal', frameId: 1, renewer: { ...EXAMPLE_RENEWER, extra: 1 } });
    expect(clientFrameOf(renewal)).toEqual({ kind: 'lease-renewal', frameId: 1, renewer: EXAMPLE_RENEWER });
  });

  test.each([
    ['not JSON', '{'],
    ['a list', '[]'],
    ['an unknown kind', '{"kind":"answer","frameId":1}'],
    ['a hello after the first line', '{"kind":"hello","requiredProtocolVersion":1,"secret":"s","frameId":1}'],
    ['a frame id of 0', '{"kind":"stop-lines","frameId":0}'],
    ['a fractional frame id', '{"kind":"stop-lines","frameId":1.5}'],
    ['a frame id past the safe whole numbers', '{"kind":"stop-lines","frameId":9007199254740992}'],
    ['a frame with no id', '{"kind":"stop-lines"}'],
    ['a renewal with no renewer', '{"kind":"lease-renewal","frameId":1}'],
    ['a renewer with a negative generation', JSON.stringify({ kind: 'lease-renewal', frameId: 1, renewer: { ...EXAMPLE_RENEWER, generation: -1 } })],
    ['a renewer with no start stamp', JSON.stringify({ kind: 'lease-renewal', frameId: 1, renewer: { ...EXAMPLE_RENEWER, startStamp: '' } })],
    ['a renewer with a process id of 0', JSON.stringify({ kind: 'lease-renewal', frameId: 1, renewer: { ...EXAMPLE_RENEWER, processId: 0 } })],
    ['a launch that is no object', '{"kind":"launch","frameId":1,"launch":"jobs/J1"}'],
    ['an input of two lines', '{"kind":"input","frameId":1,"childId":"jobs/J1#1","input":{"act":"write-line","line":"one\\ntwo"}}'],
    ['an input of an unknown act', '{"kind":"input","frameId":1,"childId":"jobs/J1#1","input":{"act":"stop"}}'],
    ['an input with no child', '{"kind":"input","frameId":1,"childId":"","input":{"act":"close"}}'],
    ['a stop with no grace', '{"kind":"stop","frameId":1,"childId":"jobs/J1#1"}'],
    ['a stop with a negative grace', '{"kind":"stop","frameId":1,"childId":"jobs/J1#1","graceMilliseconds":-1}'],
    ['a quit for another reason', '{"kind":"quit","frameId":1,"reason":"lease"}'],
  ])('reads %s as no frame', (_title, line) => {
    expect(clientFrameOf(line)).toBeNull();
  });
});

describe('helloFrameOf', () => {
  test('reads the three keys of a hello and drops the rest', () => {
    expect(helloFrameOf('{"kind":"hello","requiredProtocolVersion":2,"secret":"example-secret","frameId":1}'))
      .toEqual({ kind: 'hello', requiredProtocolVersion: 2, secret: 'example-secret' });
  });

  test.each([
    ['another frame', '{"kind":"stop-lines","frameId":1}'],
    ['a hello with no secret', '{"kind":"hello","requiredProtocolVersion":1}'],
    ['a hello with a fractional version', '{"kind":"hello","requiredProtocolVersion":1.5,"secret":"s"}'],
    ['a hello with a version of 0', '{"kind":"hello","requiredProtocolVersion":0,"secret":"s"}'],
    ['not JSON', 'hello'],
  ])('reads %s as no hello', (_title, line) => {
    expect(helloFrameOf(line)).toBeNull();
  });
});

test('writes a Talos frame as one JSON line', () => {
  expect(talosFrameLineOf({
    kind: 'done', frameId: 3, verdict: 'refused', reason: 'unknown-child'
  }))
    .toBe('{"kind":"done","frameId":3,"verdict":"refused","reason":"unknown-child"}\n');
});

describe('client entries', () => {
  test.each([
    ['a line written', { act: 'write-line', line: '{"type":"user"}' }],
    ['the input closed', { act: 'close' }],
    ['a stop', { act: 'stop', graceMilliseconds: 3000 }],
  ] satisfies readonly (readonly [string, ClientEntry])[])('%s round trips through its line', (_title, entry) => {
    expect(clientEntryOf(clientEntryLineOf(entry))).toEqual(entry);
  });

  test.each([
    ['not JSON', '{'],
    ['an unknown act', '{"act":"interrupt"}'],
    ['a stop with no grace', '{"act":"stop"}'],
    ['a line of two lines', '{"act":"write-line","line":"one\\ntwo"}'],
  ])('reads %s as no entry', (_title, line) => {
    expect(clientEntryOf(line)).toBeNull();
  });
});
