/**
 * The start file carries every bound Talos runs on, so a reader that misread one would run Talos on a wrong lease or tick: a start file
 * round trips through its text, another format version is named rather than misread, and truncated text or a bound that is no whole
 * number of milliseconds above 0 reads `unreadable`.
 */
import { describe, expect, test } from 'bun:test';

import { type TalosStartFile, talosStartFileOf, talosStartFileTextOf } from './TalosStartFile.ts';

const START_FILE: TalosStartFile = {
  formatVersion:               1,
  startNumber:                 3,
  boardFolder:                 '/example/repository/.forge',
  endpoint:                    '/example/monitor/private/0123456789abcdef.sock',
  secretFilePath:              '/example/monitor/private/example-tracker/talos-3.secret',
  codeVersion:                 'a1b2c3d4e5f6',
  leaseMilliseconds:           60_000,
  renewalIntervalMilliseconds: 15_000,
  cleanQuitWaitMilliseconds:   10_000,
  tickMilliseconds:            1000,
  tickGapMilliseconds:         5000,
};

test('a start file round trips through its text, extra keys dropped', () => {
  expect(talosStartFileOf(talosStartFileTextOf(START_FILE))).toEqual({ verdict: 'read', record: START_FILE });
  expect(talosStartFileOf(JSON.stringify({ ...START_FILE, later: true }))).toEqual({ verdict: 'read', record: START_FILE });
});

test('another format version reads other-format', () => {
  expect(talosStartFileOf(JSON.stringify({ ...START_FILE, formatVersion: 2 }))).toEqual({ verdict: 'other-format', formatVersion: 2 });
});

describe('unreadable text', () => {
  test('truncated text reads unreadable', () => {
    expect(talosStartFileOf(talosStartFileTextOf(START_FILE).slice(0, 40)).verdict).toBe('unreadable');
  });

  test.each<[string, Record<string, unknown>]>([
    ['a relative board folder', { boardFolder: '.forge' }],
    ['no endpoint', { endpoint: '' }],
    ['a relative secret file', { secretFilePath: 'talos-3.secret' }],
    ['a lease of 0', { leaseMilliseconds: 0 }],
    ['a fractional tick', { tickMilliseconds: 0.5 }],
    ['no tick gap', { tickGapMilliseconds: undefined }],
  ])('%s reads unreadable', (_title, change) => {
    expect(talosStartFileOf(JSON.stringify({ ...START_FILE, ...change })).verdict).toBe('unreadable');
  });
});
