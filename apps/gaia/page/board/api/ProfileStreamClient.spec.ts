/**
 * The profile stream client against fake relay sources. What matters: it opens the relay's profile stream at its version, every `line`
 * reaches the handler with its number and text, a line of another shape or version is dropped, and a stream the browser gave up on reopens
 * after the last line received once the wait fires, so a line replayed across the reopen is delivered once. Closing cancels a pending reopen.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_ENDPOINT_VERSIONS }                      from '../../../src/shared/constants/GaiaSystemVersions.ts';
import { fakeRelayStreams }                            from '../testing/FakeRelay.ts';
import { ProfileStreamClient, type ProfileOutputLine } from './ProfileStreamClient.ts';

const PROFILE_STREAM_PATH = `/api/v${GAIA_ENDPOINT_VERSIONS.forgeProfileStream}/forges/example-tracker/profiles/P3/stream`;

function lineOf(text: string): unknown {
  return { boardVersion: 3, kind: 'line', line: { text } };
}

describe('the profile stream client', () => {
  test('follows the run\'s own stream and hands on each line with its number, dropping a line of another shape or version', () => {
    const relay = fakeRelayStreams();
    const received: ProfileOutputLine[] = [];
    const stream = ProfileStreamClient.follow('example-tracker', 'P3', { onLines: (lines) => received.push(...lines) }, relay.surroundings);
    const [source] = relay.sources;
    source?.fire('line', lineOf('Running 12 tests'), '1');
    source?.fire('line', { boardVersion: 3, kind: 'line', line: { output: 'no text field' } }, '2');
    source?.fire('line', lineOf('no line number'), 'not-a-number');
    source?.fire('line', { boardVersion: 4, kind: 'line', line: { text: 'another version' } }, '3');
    source?.fire('line', lineOf('12 passed'), '4');
    expect(relay.sources.map(({ path }) => path)).toEqual([PROFILE_STREAM_PATH]);
    expect(received).toEqual([{ lineNumber: 1, text: 'Running 12 tests' }, { lineNumber: 4, text: '12 passed' }]);
    expect(stream.lastLineNumber()).toBe(4);
  });

  test('a stream the browser gave up on reopens after the last line received, and a replayed line is not delivered twice', () => {
    const relay = fakeRelayStreams();
    const received: number[] = [];
    const stream = ProfileStreamClient.follow('example-tracker', 'P3', { onLines: (lines) => received.push(...lines.map((line) => line.lineNumber)) }, relay.surroundings);
    relay.sources[0]?.fire('line', lineOf('first'), '1');
    relay.sources[0]?.fire('line', lineOf('second'), '2');
    relay.sources[0]?.giveUp();
    relay.fireWaits();
    relay.sources[1]?.fire('line', lineOf('second'), '2');
    relay.sources[1]?.fire('line', lineOf('third'), '3');
    stream.close();
    expect(relay.sources.map(({ path }) => path)).toEqual([PROFILE_STREAM_PATH, `${PROFILE_STREAM_PATH}?after=2`]);
    expect(received).toEqual([1, 2, 3]);
    expect(relay.sources[1]?.closed).toBe(true);
  });

  test('closing cancels a pending reopen', () => {
    const relay = fakeRelayStreams();
    const stream = ProfileStreamClient.follow('example-tracker', 'P3', { onLines: () => undefined }, relay.surroundings);
    relay.sources[0]?.giveUp();
    expect(relay.pendingWaits()).toHaveLength(1);
    stream.close();
    expect(relay.pendingWaits()).toEqual([]);
  });
});
