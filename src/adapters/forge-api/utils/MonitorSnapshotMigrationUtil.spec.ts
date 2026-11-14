/**
 * The migration of a checked monitor snapshot of contract 1 to contract 2's shape, against its own contract. What matters: each warning,
 * the forge's sentence alone, keeps its sentence under the kind that names no kind, in order; the usage limit hit is kept and the current
 * window, which contract 1 does not report, is `null`; the document keeps its own `monitorVersion` and every other key as it was.
 */
import { describe, expect, test } from 'bun:test';

import type { MonitorSnapshotDocumentOfVersionOne }                 from '../@types/MonitorSnapshotDocument.ts';
import { FORGE_WARNING_WITHOUT_KIND, MonitorSnapshotMigrationUtil } from './MonitorSnapshotMigrationUtil.ts';

const SNAPSHOT_OF_VERSION_ONE: MonitorSnapshotDocumentOfVersionOne = {
  monitorVersion: 1,
  trackerId:      'example-agency-1a2b',
  project:        'Example Agency',
  root:           '/Users/alexexample/development/example-agency',
  overseer:       {
    state:       'serving',
    paused:      false,
    url:         'http://127.0.0.1:4987/',
    processId:   4242,
    startedAt:   '2026-11-12T08:00:00.000Z',
    codeVersion: '3f9a2c1',
  },
  concurrency:    { limit: 2, agentsInFlight: 1 },
  readyTicketIds: ['003'],
  openIncidents:  1,
  attention:      [],
  jobs:           [],
  notices:        [{ kind: 'new-code', text: 'new code: run `forge update`' }],
  warnings:       [
    'the Baton pass to code example-code failed at take-baton: Example error',
    'no Assistant can come up: open incidents take their defaults',
  ],
  today:    { deliveredTickets: 1, tokens: 1200 },
  usage:    { resetsAt: '2026-11-12T15:00:00.000Z', window: 'five_hour' },
  activity: [],
};

describe('a snapshot of monitor contract 1', () => {
  test('keeps each warning\'s sentence, in order, under the kind that names no kind', () => {
    expect(MonitorSnapshotMigrationUtil.currentDocumentOf(SNAPSHOT_OF_VERSION_ONE).warnings).toEqual([
      { kind: FORGE_WARNING_WITHOUT_KIND, text: 'the Baton pass to code example-code failed at take-baton: Example error' },
      { kind: FORGE_WARNING_WITHOUT_KIND, text: 'no Assistant can come up: open incidents take their defaults' },
    ]);
  });

  test('keeps the usage limit hit and knows no current window', () => {
    expect(MonitorSnapshotMigrationUtil.currentDocumentOf(SNAPSHOT_OF_VERSION_ONE).usage).toEqual({
      resetsAt:              '2026-11-12T15:00:00.000Z',
      window:                'five_hour',
      currentWindow:         null,
      currentWindowResetsAt: null,
    });
  });

  test('keeps its monitorVersion and every other key as it was', () => {
    const { warnings: _migratedWarnings, usage: _migratedUsage, ...unchanged } = MonitorSnapshotMigrationUtil.currentDocumentOf(SNAPSHOT_OF_VERSION_ONE);
    const { warnings: _sentWarnings, usage: _sentUsage, ...sent } = SNAPSHOT_OF_VERSION_ONE;
    expect(unchanged).toEqual(sent);
    expect(unchanged.monitorVersion).toBe(1);
  });
});
