/**
 * The first frames of every connection never change shape in any protocol version (design decision 6), since they are how two versions
 * learn that they differ. What matters: each frozen `hello` reads through `helloFrameOf` as itself, each frozen answer is written byte for
 * byte, and the key sets of the three frames' types equal the table's, so a field added to one of them turns this spec red.
 */
import { expect, test } from 'bun:test';

import type { HelloFrame, RefusedFrame, VersionMismatchFrame } from './@types/TalosFrame.ts';
import FROZEN_TALOS_HANDSHAKE                                  from './FrozenTalosHandshake.json';
import {
  helloFrameOf,
  refusedFrameOf,
  talosFrameLineOf,
  versionMismatchFrameOf,
} from './TalosFrames.ts';

const HELLO_KEYS = { kind: true, requiredProtocolVersion: true, secret: true } satisfies Record<keyof HelloFrame, true>;
const VERSION_MISMATCH_KEYS = { kind: true, protocolVersion: true } satisfies Record<keyof VersionMismatchFrame, true>;
const REFUSED_KEYS = { kind: true, reason: true } satisfies Record<keyof RefusedFrame, true>;
const REFUSED_REASONS = { malformed: true, secret: true, quitting: true } satisfies Record<RefusedFrame['reason'], true>;

const { frames } = FROZEN_TALOS_HANDSHAKE;

function parsedLineOf(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

test('the table says it is never retaken', () => {
  expect(FROZEN_TALOS_HANDSHAKE.retake).toStartWith('Never retaken.');
});

test('the key sets of hello, version-mismatch and refused equal the table\'s', () => {
  expect(Object.keys(HELLO_KEYS)).toEqual(frames.hello.keys);
  expect(Object.keys(VERSION_MISMATCH_KEYS)).toEqual(frames['version-mismatch'].keys);
  expect(Object.keys(REFUSED_KEYS)).toEqual(frames.refused.keys);
});

test('each frozen hello reads through helloFrameOf as itself, in the table\'s keys', () => {
  expect(frames.hello.lines.length).toBeGreaterThan(0);
  for (const line of frames.hello.lines) {
    const frame = helloFrameOf(line);
    expect(frame).toEqual(parsedLineOf(line) as unknown as HelloFrame);
    expect(Object.keys(frame ?? {})).toEqual(frames.hello.keys);
  }
});

test('each frozen version-mismatch is written byte for byte', () => {
  expect(frames['version-mismatch'].lines.length).toBeGreaterThan(0);
  for (const line of frames['version-mismatch'].lines) {
    const { protocolVersion } = parsedLineOf(line);
    expect(talosFrameLineOf(versionMismatchFrameOf(protocolVersion as number))).toBe(`${line}\n`);
  }
});

test('the table holds one refused line per reason, and each is written byte for byte', () => {
  const reasons = frames.refused.lines.map((line) => parsedLineOf(line)['reason'] as RefusedFrame['reason']);
  expect(reasons.toSorted()).toEqual(Object.keys(REFUSED_REASONS).toSorted() as RefusedFrame['reason'][]);
  for (const [index, line] of frames.refused.lines.entries()) {
    expect(talosFrameLineOf(refusedFrameOf(reasons[index] ?? 'malformed'))).toBe(`${line}\n`);
  }
});
