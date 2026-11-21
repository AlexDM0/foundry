/**
 * The forge route's presence from a fleet document (decisions 13, 14, 21, 38, 39). What matters: a crashed forge alerts with its crash
 * summary, "Suspected crash before a reboot" where the registry says so, and Start; a down forge alerts with Start; a hung one says it
 * stopped supervising its agents and offers no Start; a serving forge shows no alert; each waiting job's cause reads in words, with a
 * Resume only where it waits for an instruction, and Resume all while any work waits; crash logs list newest first; and a crash log once
 * read shows its error, its active jobs and its tail, never an unread board as no jobs.
 */
import { describe, expect, test } from 'bun:test';

import type { CrashLogDocument }                              from '../../@types/CrashLogDocument.ts';
import type { FleetDocumentForge }                            from '../../@types/FleetDocument.ts';
import { FLEET_FIVE_FORGES_READINGS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgePresenceModel }                                 from './ForgePresenceModel.ts';

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };
const STOREFRONT = FLEET_FIVE_FORGES_READINGS.exampleStorefront;
const TRACKER_ID = STOREFRONT.trackerId;
const CRASH_AT = '2026-11-12T13:10:00.000Z';

function forgeWith(changes: Partial<FleetDocumentForge>): FleetDocumentForge {
  return { ...STOREFRONT, ...changes };
}

const CRASHED = forgeWith({
  fidelity:     'unreachable',
  condition:    'unreachable',
  presence:     { state: 'crashed', generation: 2, at: CRASH_AT },
  crashSummary: {
    component: 'talos', suspected: true, errorName: 'Error', errorMessage: 'Example failure.',
  },
});

describe('the alert', () => {
  test('of a crashed forge names a suspected crash before a reboot, its crash summary, and offers Start', () => {
    expect(ForgePresenceModel.presenceContentOf(CRASHED, CLOCK).alert).toEqual({
      title:       'Forge crashed',
      sentence:    'It stays off until it is started. Nothing runs until then.',
      suspected:   'Suspected crash before a reboot',
      machineLine: 'talos · Error: Example failure.',
      start:       { kind: 'forge-start', trackerId: TRACKER_ID },
    });
  });

  test('of a down forge offers Start, and of a hung one says it stopped supervising and offers none', () => {
    const down = ForgePresenceModel.presenceContentOf(forgeWith({ presence: { state: 'down', generation: 1, at: null } }), CLOCK).alert;
    expect([down?.title, down?.start]).toEqual(['Forge is down', { kind: 'forge-start', trackerId: TRACKER_ID }]);
    const hung = ForgePresenceModel.presenceContentOf(forgeWith({ presence: { state: 'hung', generation: 1, at: null } }), CLOCK).alert;
    expect([hung?.title, hung?.start]).toEqual(['Not supervised', null]);
  });

  test('is absent for a forge that serves, and a serving forge with nothing waiting is quiet', () => {
    const content = ForgePresenceModel.presenceContentOf(STOREFRONT, CLOCK);
    expect([content.alert, ForgePresenceModel.presenceIsQuiet(content)]).toEqual([null, true]);
  });
});

describe('the waiting work', () => {
  const WAITING = forgeWith({
    waitingWork: [
      {
        jobId: 'J4', kind: 'build', ticketIds: ['004'], cause: 'network-outage', waitsFor: 'instruction',
      },
      {
        jobId: 'J5', kind: 'review', ticketIds: ['005'], cause: 'lease-ended', waitsFor: 'instruction',
      },
      {
        jobId: 'J6', kind: 'build', ticketIds: [], cause: 'agent-crashed', waitsFor: 'instruction',
      },
      {
        jobId: 'J7', kind: 'build', ticketIds: [], cause: 'agent-crashed', waitsFor: 'nothing',
      },
      {
        jobId: 'J8', kind: 'build', ticketIds: [], cause: 'reboot', waitsFor: 'answer',
      },
    ],
  });

  test('words each cause, with a Resume of its own job only where it waits for an instruction', () => {
    const { waitingWork } = ForgePresenceModel.presenceContentOf(WAITING, CLOCK);
    expect(waitingWork.map((line) => [line.jobId, line.cause, line.waitsFor, line.resume !== null])).toEqual([
      ['J4', 'Network outage', 'waits for a resume', true],
      ['J5', 'Not supervised: the forge stopped supervising this agent', 'waits for a resume', true],
      ['J6', 'Agent crashed twice', 'waits for a resume', true],
      ['J7', 'Agent crashed', 'resumes by itself', false],
      ['J8', 'Machine went down', 'waits for an answer', false],
    ]);
    expect(waitingWork[0]?.resume).toEqual({ kind: 'forge-interrupted-work-resume', trackerId: TRACKER_ID, target: { jobId: 'J4' } });
  });

  test('offers one Resume all while any work waits, and none when nothing does', () => {
    expect(ForgePresenceModel.presenceContentOf(WAITING, CLOCK).resumeAll).toEqual({ kind: 'forge-interrupted-work-resume', trackerId: TRACKER_ID, target: 'all' });
    expect(ForgePresenceModel.presenceContentOf(STOREFRONT, CLOCK).resumeAll).toBeNull();
  });
});

describe('the crash logs', () => {
  test('list newest first, a suspected one saying so', () => {
    const forge = forgeWith({
      crashLogs: [
        {
          number: 1, generation: 1, component: 'hephaestus', suspected: false, recordedAt: CRASH_AT,
        },
        {
          number: 2, generation: 3, component: 'unknown', suspected: true, recordedAt: CRASH_AT,
        },
      ],
    });
    expect(ForgePresenceModel.presenceContentOf(forge, CLOCK).crashLogs.map((line) => [line.crashLogNumber, line.title])).toEqual([
      [2, 'Suspected crash before a reboot: Forge crashed'],
      [1, 'Hephaestus crashed'],
    ]);
  });

  test('once read show the error, the active jobs and the tail, and an unread board as unread', () => {
    const crashLog: CrashLogDocument = {
      crashLogVersion: 1,
      number:          1,
      generation:      1,
      component:       'hephaestus',
      suspected:       false,
      recordedAt:      CRASH_AT,
      error:           {
        origin: 'uncaught-exception', name: 'Error', message: 'Example failure.', stack: null,
      },
      activeJobs: [{
        jobId: 'J1', kind: 'assistant', ticketIds: ['004'], state: 'running', interruption: null, airlockPhase: null,
      }],
      logTail: ['Example log line.'],
    };
    expect(ForgePresenceModel.crashLogShownOf(crashLog)).toEqual({
      heading:    'Crash log 1',
      errorLine:  'Error: Example failure.',
      stack:      null,
      activeJobs: ['J1 · assistant · running · #004'],
      logTail:    ['Example log line.'],
    });
    expect(ForgePresenceModel.crashLogShownOf({ ...crashLog, activeJobs: null }).activeJobs).toBeNull();
  });
});
