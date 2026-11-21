/**
 * How a forge is present, against the util's own contract. What matters: crashed, stopped, handed over, down, hung, serving and unknown are
 * told apart from the registry's presence, the Overseer's answer and the served supervision alone, a forge of a version Gaia cannot talk to
 * answering all the same; a crash the registry records wins over an answer; the crash summary, the crash logs and the waiting work reach
 * only the forge that holds them; and an alert, with Start where the Overseer is gone, is raised only for a crashed, down or hung forge.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS, forgeReadingOf } from '../../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { ForgePresenceReport, ForgeRegistryPresence }     from '../../../shared/@types/ForgePresence.ts';
import type { ForgeReading }                                   from '../../../shared/@types/ForgeReading.ts';
import { ForgePresenceUtil }                                   from './ForgePresenceUtil.ts';

const LIVE = forgeReadingOf(FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleStorefront);
const CRASH_AT = '2026-11-21T06:32:52+01:00';

const CRASHED: ForgeRegistryPresence = {
  state:      'crashed',
  generation: 2,
  at:         CRASH_AT,
  crash:      {
    component: 'overseer', suspected: true, errorName: 'Error', errorMessage: 'Example failure.',
  },
};

const SUPERVISION_STOPPED: ForgePresenceReport = {
  supervision:     'stopped',
  interruptedWork: [{
    jobId: 'J4', kind: 'build', ticketIds: ['004'], cause: 'lease-ended', waitsFor: 'instruction',
  }],
  crashLogs: [{
    number: 1, generation: 1, component: 'hephaestus', suspected: false, recordedAt: CRASH_AT,
  }],
  talos: null,
};

function registryPresence(state: ForgeRegistryPresence['state']): ForgeRegistryPresence {
  return {
    state, generation: 2, at: CRASH_AT, crash: null,
  };
}

function readingWith(changes: Partial<ForgeReading>): ForgeReading {
  return { ...LIVE, ...changes };
}

const NOT_ANSWERING = { fidelity: 'unreachable', condition: 'unreachable' } as const;
const DORMANT = { fidelity: 'dormant', condition: 'dormant' } as const;

describe('presenceOf', () => {
  test('tells crashed, stopped, handed over, down, hung, serving and unknown apart', () => {
    const stateOf = (changes: Partial<ForgeReading>): string => ForgePresenceUtil.presenceOf(readingWith(changes)).state;
    expect(stateOf({ ...NOT_ANSWERING, registryPresence: CRASHED })).toBe('crashed');
    expect(stateOf({ ...DORMANT, registryPresence: registryPresence('stopped') })).toBe('stopped');
    expect(stateOf({ ...NOT_ANSWERING, registryPresence: registryPresence('handed-over') })).toBe('handed-over');
    expect(stateOf({ ...NOT_ANSWERING, registryPresence: registryPresence('serving') })).toBe('down');
    expect(stateOf({ registryPresence: registryPresence('serving'), presenceReport: SUPERVISION_STOPPED })).toBe('hung');
    expect(stateOf({ registryPresence: registryPresence('serving'), presenceReport: { ...SUPERVISION_STOPPED, supervision: 'supervising' } })).toBe('serving');
    expect(stateOf({ ...NOT_ANSWERING, registryPresence: null })).toBe('unknown');
  });

  test('reads a crash the registry records as crashed, even while an Overseer answers as it starts again', () => {
    expect(ForgePresenceUtil.presenceOf(readingWith({ ...DORMANT, condition: 'starting', registryPresence: CRASHED }))).toEqual({ state: 'crashed', generation: 2, at: CRASH_AT });
  });

  test('reads an Overseer that says it is starting as answering, so a forge serving in the registry is not down', () => {
    expect(ForgePresenceUtil.presenceOf(readingWith({ ...DORMANT, condition: 'starting', registryPresence: registryPresence('serving') })).state).toBe('serving');
  });

  test('reads a forge whose Overseer answered at a version Gaia cannot talk to as serving, never down, and raises no alert for it', () => {
    for (const fidelity of ['older-contract', 'newer-contract'] as const) {
      const forge = ForgePresenceUtil.fleetForgeOf(readingWith({ fidelity, condition: 'unreadable', registryPresence: registryPresence('serving') }));
      expect([forge.presence.state, ForgePresenceUtil.forgeAlertOf(forge)]).toEqual(['serving', null]);
    }
  });
});

describe('fleetForgeOf', () => {
  test('carries the crash summary of a crashed forge only', () => {
    expect(ForgePresenceUtil.fleetForgeOf(readingWith({ ...NOT_ANSWERING, registryPresence: CRASHED })).crashSummary).toEqual(CRASHED.crash);
    expect(ForgePresenceUtil.fleetForgeOf(readingWith({ ...NOT_ANSWERING, registryPresence: { ...CRASHED, state: 'serving' } })).crashSummary).toBeNull();
  });

  test('carries the crash logs and waiting work a forge read in full serves, and none of a forge not read in full', () => {
    const served = ForgePresenceUtil.fleetForgeOf(readingWith({ presenceReport: SUPERVISION_STOPPED }));
    expect(served.crashLogs).toEqual([...SUPERVISION_STOPPED.crashLogs]);
    expect(served.waitingWork).toEqual([...SUPERVISION_STOPPED.interruptedWork]);
    const lost = ForgePresenceUtil.fleetForgeOf(readingWith({ ...NOT_ANSWERING, presenceReport: SUPERVISION_STOPPED }));
    expect(lost.crashLogs.length + lost.waitingWork.length).toBe(0);
  });
});

describe('forgeAlertOf', () => {
  test('raises forge-crashed and forge-down with Start, and forge-hung with Open', () => {
    const alertOf = (changes: Partial<ForgeReading>) => ForgePresenceUtil.forgeAlertOf(ForgePresenceUtil.fleetForgeOf(readingWith(changes)));
    expect(alertOf({ ...NOT_ANSWERING, registryPresence: CRASHED })).toMatchObject({
      trackerId: LIVE.trackerId, kind: 'forge-crashed', actionLabel: 'Start', stamp: CRASH_AT, stampWord: 'crashed',
    });
    expect(alertOf({ ...NOT_ANSWERING, registryPresence: registryPresence('serving') })).toMatchObject({ kind: 'forge-down', actionLabel: 'Start', stampWord: 'last reported' });
    expect(alertOf({ registryPresence: registryPresence('serving'), presenceReport: SUPERVISION_STOPPED })).toMatchObject({ kind: 'forge-hung', actionLabel: 'Open' });
  });

  test('raises nothing for a forge that serves, stopped, handed over or whose presence is unknown', () => {
    for (const changes of [
      { registryPresence: registryPresence('serving') },
      { ...DORMANT, registryPresence: registryPresence('stopped') },
      { ...NOT_ANSWERING, registryPresence: registryPresence('handed-over') },
      { ...NOT_ANSWERING, registryPresence: null },
    ]) {
      expect(ForgePresenceUtil.forgeAlertOf(ForgePresenceUtil.fleetForgeOf(readingWith(changes)))).toBeNull();
    }
  });
});
