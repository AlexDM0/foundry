/**
 * PLAN 7.2's table, one case per row, then the rule that picks between rows. What matters: each condition raises its own kind, a forge shows
 * at most the first look that applies, and a dormant forge Gaia read nothing of in this run shows none, since Gaia never reads a board's files.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { ForgeReading }                   from '../../../shared/@types/ForgeReading.ts';

import { BATON_PASS_FAILED_WARNING_KIND, ForgeLookUtil, NEW_CODE_NOTICE_KIND } from './ForgeLookUtil.ts';

/** Example Storefront, read in full and live, with nothing to look at. */
const QUIET_LIVE_FORGE = FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleStorefront;

const QUIET_LIVE_CONCURRENCY = {
  limit:                        5,
  agentsInFlight:               4,
  machineLimit:                 12,
  machineAgentsInFlight:        10,
  ticketsWaitingForMachineSlot: 0,
};

function liveForgeWith(changes: Partial<ForgeReading>): ForgeReading {
  return { ...QUIET_LIVE_FORGE, ...changes };
}

const BATON_PASS_FAILED = { kind: BATON_PASS_FAILED_WARNING_KIND, text: 'The Baton pass to the next Overseer failed.' };

const NEW_CODE = { kind: NEW_CODE_NOTICE_KIND, text: 'New code is on disk. Restart the Overseer to run it.' };

const MACHINE_AT_ITS_LIMIT = { ...QUIET_LIVE_CONCURRENCY, machineLimit: 10, ticketsWaitingForMachineSlot: 2 };

describe('one look per row of PLAN 7.2', () => {
  test('a forge read in full with nothing to look at needs no look', () => {
    expect(ForgeLookUtil.lookKindOf(QUIET_LIVE_FORGE)).toBeNull();
  });

  test('row 1: a forge whose Overseer stopped answering needs the look unreachable', () => {
    expect(ForgeLookUtil.lookKindOf(liveForgeWith({ fidelity: 'unreachable', condition: 'unreachable' }))).toBe('unreachable');
  });

  test('row 2: a forge on a newer monitor contract needs the look newer-contract', () => {
    expect(ForgeLookUtil.lookKindOf(liveForgeWith({ fidelity: 'newer-contract', condition: 'unreadable' }))).toBe('newer-contract');
  });

  test('row 3: a warning of a failed Baton pass needs the look baton-pass-failed', () => {
    expect(ForgeLookUtil.lookKindOf(liveForgeWith({ warnings: [BATON_PASS_FAILED] }))).toBe('baton-pass-failed');
  });

  test('row 4: an Overseer held by an install change needs the look launches-held', () => {
    expect(ForgeLookUtil.lookKindOf(FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleMobileApp)).toBe('launches-held');
  });

  test('row 5: a notice of new code needs the look new-code', () => {
    expect(ForgeLookUtil.lookKindOf(liveForgeWith({ notices: [NEW_CODE] }))).toBe('new-code');
  });

  test('row 6: a forge read through its summary only needs the look counts-only', () => {
    expect(ForgeLookUtil.lookKindOf(liveForgeWith({ fidelity: 'counts-only', concurrency: null }))).toBe('counts-only');
  });

  test('row 7: a dormant forge whose last summary in this run held ready tickets needs the look dormant-with-ready-tickets', () => {
    expect(ForgeLookUtil.lookKindOf(FLEET_SNAPSHOT_FIVE_FORGES_READINGS.designSystem)).toBe('dormant-with-ready-tickets');
  });

  test('row 8: tickets waiting for a machine slot need the look machine-limit-reached', () => {
    expect(ForgeLookUtil.lookKindOf(liveForgeWith({ concurrency: MACHINE_AT_ITS_LIMIT }))).toBe('machine-limit-reached');
  });
});

describe('the look a forge shows', () => {
  test('is the first row that applies when several do', () => {
    const everyCondition = liveForgeWith({
      condition:   'held',
      warnings:    [BATON_PASS_FAILED],
      notices:     [NEW_CODE],
      concurrency: MACHINE_AT_ITS_LIMIT,
    });
    expect(ForgeLookUtil.lookKindOf(everyCondition)).toBe('baton-pass-failed');
    expect(ForgeLookUtil.lookKindOf({ ...everyCondition, warnings: [] })).toBe('launches-held');
    expect(ForgeLookUtil.lookKindOf({ ...everyCondition, warnings: [], condition: 'live' })).toBe('new-code');
    expect(ForgeLookUtil.lookKindOf({ ...everyCondition, fidelity: 'unreachable' })).toBe('unreachable');
  });

  test('is none for a dormant forge that Gaia read nothing of in this run', () => {
    expect(ForgeLookUtil.lookKindOf({ ...FLEET_SNAPSHOT_FIVE_FORGES_READINGS.designSystem, readyTicketCount: null })).toBeNull();
    expect(ForgeLookUtil.lookKindOf({ ...FLEET_SNAPSHOT_FIVE_FORGES_READINGS.designSystem, readyTicketCount: 0 })).toBeNull();
  });

  test('takes warnings, notices and machine slots only from a forge read in full now', () => {
    const stoppedWithOldFacts = {
      ...FLEET_SNAPSHOT_FIVE_FORGES_READINGS.designSystem, readyTicketCount: 0, notices: [NEW_CODE], concurrency: MACHINE_AT_ITS_LIMIT
    };
    expect(ForgeLookUtil.lookKindOf(stoppedWithOldFacts)).toBeNull();
    expect(ForgeLookUtil.lookKindOf({ ...stoppedWithOldFacts, warnings: [BATON_PASS_FAILED] })).toBeNull();
  });

  test('is none for a forge whose repository is gone', () => {
    expect(ForgeLookUtil.lookKindOf(FLEET_SNAPSHOT_FIVE_FORGES_READINGS.legacyImporter)).toBeNull();
  });
});

describe('looksOf', () => {
  test('lists one look per forge that needs one, in the forges\' order', () => {
    const readings = Object.values(FLEET_SNAPSHOT_FIVE_FORGES_READINGS);
    expect(ForgeLookUtil.looksOf(readings)).toEqual([
      { trackerId: FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleMobileApp.trackerId, kind: 'launches-held' },
      { trackerId: FLEET_SNAPSHOT_FIVE_FORGES_READINGS.designSystem.trackerId, kind: 'dormant-with-ready-tickets' },
    ]);
  });
});
