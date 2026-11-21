/**
 * The presence ingestion against its own contract. What matters: each listed job's wait maps in by its id, every key the board does not
 * read is passed over, and a document that does not ingest names its keys and reads as no waits.
 */
import { describe, expect, test }     from 'bun:test';
import type { ForgePresenceDocument } from 'forge-contracts/ForgePresenceDocument';

import { PresenceIngestion } from './PresenceIngestion.ts';

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
};

describe('resumeWaitsOf', () => {
  test('maps what each listed job waits for by its id', () => {
    const reading = INGESTION.resumeWaitsOf(EXAMPLE_PRESENCE);
    expect(reading.resumeWaits === null ? null : [...reading.resumeWaits]).toEqual([['J4', 'instruction'], ['J5', 'nothing']]);
  });

  test('names the keys of a document that does not ingest', () => {
    const unknownWait = { ...EXAMPLE_PRESENCE, interruptedWork: [{ ...EXAMPLE_PRESENCE.interruptedWork[0], waitsFor: 'tomorrow' }] };
    expect(INGESTION.resumeWaitsOf(unknownWait)).toEqual({ resumeWaits: null, reason: { invalidKeys: ['interruptedWork[0].waitsFor'] } });
    expect(INGESTION.resumeWaitsOf(['example'])).toEqual({ resumeWaits: null, reason: { invalidKeys: ['interruptedWork'] } });
  });
});
