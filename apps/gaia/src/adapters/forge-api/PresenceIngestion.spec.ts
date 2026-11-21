/**
 * The presence ingestion against its own contract and the presence a scratch forge served (`hephaestus-fetch-presence`). What matters: the
 * recorded documents read with their supervision and crash logs; each listed job's wait, cause and tickets map in; every key Gaia does not
 * read, and one it does not know, is passed over; and a document that does not ingest names its keys and reads as no report.
 */
import { describe, expect, test }     from 'bun:test';
import type { ForgePresenceDocument } from 'forge-contracts/ForgePresenceDocument';

import { PresenceIngestion }          from './PresenceIngestion.ts';
import { recordedPresenceDocumentOf } from './testing/PresenceDocuments.ts';

const INGESTION = new PresenceIngestion();

const EXAMPLE_PRESENCE: ForgePresenceDocument = {
  generation:  3,
  processId:   4242,
  codeVersion: 'example-code',
  startedAt:   '2026-11-21T01:00:00+01:00',
  startOrigin: 'user',
  lastStart:   {
    kind: 'first-start', previousGeneration: null, crashSuspected: false, crashLogNumber: null
  },
  heartbeat:       null,
  supervision:     'stopped',
  abandonedPasses: { inARow: 0, lastReason: null, lastAt: null },
  interruptedWork: [
    {
      jobId: 'J4', kind: 'build', ticketIds: ['004'], cause: 'network-outage', waitsFor: 'instruction', crashResumes: 0, automaticRestartsLeft: null,
    },
    {
      jobId: 'J5', kind: 'review', ticketIds: ['005'], cause: 'agent-crashed', waitsFor: 'nothing', crashResumes: 1, automaticRestartsLeft: 1,
    },
  ],
  heldMerges: [],
  crashLogs:  [],
  talos:      { protocolVersion: 2, codeVersion: 'example-code', startNumber: 4 },
};

describe('presenceReportOf', () => {
  test('reads the presence a forge serves while it supervises its agents, with no work waiting and no crash log', () => {
    expect(INGESTION.presenceReportOf(recordedPresenceDocumentOf('presence-serving'))).toEqual({
      report: {
        supervision: 'supervising', interruptedWork: [], crashLogs: [], talos: { protocolVersion: 2, codeVersion: expect.any(String) },
      },
    });
  });

  test('reads the crash log a forge lists after User started it again after a crash', () => {
    expect(INGESTION.presenceReportOf(recordedPresenceDocumentOf('started-after-a-crash'))).toEqual({
      report: {
        supervision:     'supervising',
        interruptedWork: [],
        crashLogs:       [{
          number: 1, generation: 1, component: 'hephaestus', suspected: false, recordedAt: expect.any(String),
        }],
        talos: { protocolVersion: 2, codeVersion: expect.any(String) },
      },
    });
  });

  test('reads no Talos where none runs, and names a running Talos it cannot read', () => {
    expect(INGESTION.presenceReportOf({ ...EXAMPLE_PRESENCE, talos: null }).report?.talos).toBeNull();
    expect(INGESTION.presenceReportOf({ ...EXAMPLE_PRESENCE, talos: { protocolVersion: 'two', codeVersion: 'example-code', startNumber: 4 } }))
      .toEqual({ report: null, reason: { invalidKeys: ['talos.protocolVersion'] } });
  });

  test('maps each waiting job with its kind, tickets, cause and wait, a supervision that stopped, and the Talos that runs', () => {
    const reading = INGESTION.presenceReportOf(EXAMPLE_PRESENCE);
    expect(reading.report).toEqual({
      supervision:     'stopped',
      interruptedWork: [
        {
          jobId: 'J4', kind: 'build', ticketIds: ['004'], cause: 'network-outage', waitsFor: 'instruction',
        },
        {
          jobId: 'J5', kind: 'review', ticketIds: ['005'], cause: 'agent-crashed', waitsFor: 'nothing',
        },
      ],
      crashLogs: [],
      talos:     { protocolVersion: 2, codeVersion: 'example-code' },
    });
  });

  test('passes over a key it does not know', () => {
    const withAnUnknownKey = { ...recordedPresenceDocumentOf('presence-serving'), exampleAddedKey: { anything: true } };
    expect(INGESTION.presenceReportOf(withAnUnknownKey).report?.supervision).toBe('supervising');
  });

  test('names a wait it does not know, and every key it reads of a document that is no presence', () => {
    const unknownWait = { ...EXAMPLE_PRESENCE, interruptedWork: [{ ...EXAMPLE_PRESENCE.interruptedWork[0], waitsFor: 'tomorrow' }] };
    expect(INGESTION.presenceReportOf(unknownWait)).toEqual({ report: null, reason: { invalidKeys: ['interruptedWork[0].waitsFor'] } });
    expect(INGESTION.presenceReportOf(['example'])).toEqual({ report: null, reason: { invalidKeys: ['supervision', 'interruptedWork', 'crashLogs', 'talos'] } });
  });

  test('names a supervision or a crash log it cannot read', () => {
    const unreadable = { ...EXAMPLE_PRESENCE, supervision: 'resting', crashLogs: [{ number: 'one' }] };
    expect(INGESTION.presenceReportOf(unreadable)).toEqual({
      report: null,
      reason: { invalidKeys: ['supervision', 'crashLogs[0].number', 'crashLogs[0].generation', 'crashLogs[0].component', 'crashLogs[0].recordedAt', 'crashLogs[0].suspected'] },
    });
  });
});
