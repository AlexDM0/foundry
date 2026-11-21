/**
 * Talos's own record is how a Hephaestus finds a running Talos and the orphans of a lost one, so the reader must give back exactly what
 * was written and never throw: a record round trips through its text, another format version is named rather than misread, and truncated
 * or damaged text reads `unreadable`.
 */
import { describe, expect, test } from 'bun:test';

import { type TalosRecord, talosRecordOf, talosRecordTextOf } from './TalosRecord.ts';

const SERVING: TalosRecord = {
  formatVersion:   1,
  startNumber:     3,
  protocolVersion: 1,
  codeVersion:     'a1b2c3d4e5f6',
  talos:           { processId: 4242, startStamp: '1790000000', bootIdentity: 'example-boot' },
  state:           'serving',
  endpoint:        '/example/monitor/private/0123456789abcdef.sock',
  quitReason:      null,
  lease:           {
    standing:    'held',
    lastRenewer: {
      processId: 4100, startStamp: '1789999000', bootIdentity: 'example-boot', generation: 7
    },
  },
};

const CLAIMED: TalosRecord = {
  ...SERVING, state: 'claimed', talos: null, endpoint: null, lease: { standing: 'unheld', lastRenewer: null }
};

const QUIT: TalosRecord = { ...SERVING, state: 'quit', quitReason: 'restart' };

describe('a record', () => {
  test.each([['a serving Talos', SERVING], ['a claim', CLAIMED], ['a Talos that quit', QUIT]])('%s round trips through its text', (_title, record) => {
    expect(talosRecordOf(talosRecordTextOf(record))).toEqual({ verdict: 'read', record });
  });

  test('drops keys it does not name', () => {
    expect(talosRecordOf(JSON.stringify({ ...SERVING, later: true, lease: { ...SERVING.lease, renewals: 40 } }))).toEqual({ verdict: 'read', record: SERVING });
  });
});

test('another format version reads other-format', () => {
  expect(talosRecordOf(JSON.stringify({ ...SERVING, formatVersion: 7 }))).toEqual({ verdict: 'other-format', formatVersion: 7 });
});

describe('unreadable text', () => {
  test('truncated text reads unreadable', () => {
    const text = talosRecordTextOf(SERVING);
    expect(talosRecordOf(text.slice(0, -10)).verdict).toBe('unreadable');
  });

  test.each<[string, Record<string, unknown>]>([
    ['a start number of 0', { startNumber: 0 }],
    ['an unknown state', { state: 'running' }],
    ['an unknown quit reason', { quitReason: 'lease' }],
    ['an unknown lease standing', { lease: { standing: 'lapsed', lastRenewer: null } }],
    ['a renewer with no generation', { lease: { standing: 'held', lastRenewer: { processId: 4100, startStamp: '1', bootIdentity: 'example-boot' } } }],
    ['no lease', { lease: null }],
  ])('%s reads unreadable', (_title, change) => {
    expect(talosRecordOf(JSON.stringify({ ...SERVING, ...change })).verdict).toBe('unreadable');
  });
});
