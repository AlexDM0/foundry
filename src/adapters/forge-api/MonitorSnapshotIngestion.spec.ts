/**
 * The monitor snapshot ingestion over the authored F2 snapshot of Example Storefront, read through the forge client. What matters: the
 * snapshot maps to exactly the reading A1's fixture shows for that forge; a snapshot at a newer `monitorVersion` maps nothing of itself,
 * so no attention entry leaks from it; a malformed snapshot or one of another forge maps nothing; every key the reading needs is checked.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../page-api/testing/fleet-snapshot-five-forges.ts';

import type { ForgeIdentity }                                      from './@types/ForgeDocumentReading.ts';
import { MonitorSnapshotIngestion }                                from './MonitorSnapshotIngestion.ts';
import { EXAMPLE_READ_STAMP, recordedDocumentOf, registryFactsOf } from './testing/ExampleForgeDocuments.ts';

const STOREFRONT = FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleStorefront;
const STOREFRONT_FACTS = registryFactsOf(STOREFRONT);

const STOREFRONT_IDENTITY: ForgeIdentity = {
  trackerId:      STOREFRONT.trackerId,
  project:        STOREFRONT.project,
  codeVersion:    '3f9a2c1',
  installVersion: 27,
  processId:      48_107,
  contracts:      {
    summary: 1,
    monitor: 1,
    control: 1,
    embed:   1,
  },
};

function ingestion(): MonitorSnapshotIngestion {
  return new MonitorSnapshotIngestion(STOREFRONT_FACTS, STOREFRONT_IDENTITY);
}

async function storefrontSnapshot(): Promise<Record<string, unknown>> {
  return await recordedDocumentOf('serving-every-contract', 'monitor', STOREFRONT_FACTS.overseerUrl) as Record<string, unknown>;
}

describe('a snapshot at the known monitor version', () => {
  test('maps to the reading that A1\'s fixture shows for Example Storefront', async () => {
    expect(ingestion().readingOf(await storefrontSnapshot(), EXAMPLE_READ_STAMP)).toEqual({ verdict: 'readable', reading: STOREFRONT });
  });

  test('stamps the reading with the moment it was read, the snapshot carrying no stamp of its own', async () => {
    const reading = ingestion().readingOf(await storefrontSnapshot(), '2026-11-12T14:00:00.000Z');
    expect(reading.verdict === 'readable' ? reading.reading.lastReportedAt : null).toBe('2026-11-12T14:00:00.000Z');
  });

  test('reads the machine-wide keys a forge without F6 leaves out as null', async () => {
    const snapshot = await storefrontSnapshot();
    snapshot['concurrency'] = { limit: 5, agentsInFlight: 4 };
    const reading = ingestion().readingOf(snapshot, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.concurrency : null).toEqual({
      limit:                        5,
      agentsInFlight:               4,
      machineLimit:                 null,
      machineAgentsInFlight:        null,
      ticketsWaitingForMachineSlot: null,
    });
  });
});

describe('a snapshot at a version this Gaia does not know', () => {
  test('maps a snapshot with monitorVersion 2 to a reading at fidelity newer-contract with no attention entries', async () => {
    const snapshot = { ...await storefrontSnapshot(), monitorVersion: 2 };
    const reading  = ingestion().readingOf(snapshot, EXAMPLE_READ_STAMP);
    expect(reading.verdict).toBe('newer-contract');
    if (reading.verdict !== 'newer-contract') return;
    expect([reading.contract, reading.version]).toEqual(['monitor', 2]);
    expect(reading.reading.fidelity).toBe('newer-contract');
    expect(reading.reading.attention).toEqual([]);
  });

  test('maps nothing of a newer snapshot: the reading holds the registry, the identity and the numbers, and no fact of the document', async () => {
    const reading = ingestion().readingOf({ ...await storefrontSnapshot(), monitorVersion: 2 }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'newer-contract' ? reading.reading : null).toEqual({
      trackerId: STOREFRONT.trackerId,
      project:   STOREFRONT.project,
      root:      STOREFRONT.root,
      fidelity:  'newer-contract',
      condition: 'unreadable',
      url:       STOREFRONT.url,
      processId: 48_107,
      contracts: {
        summary: 1,
        monitor: 2,
        control: 1,
        embed:   1,
      },
      codeVersion:       '3f9a2c1',
      lastReportedAt:    null,
      overseerStartedAt: null,
      lastCommand:       STOREFRONT.lastCommand,
      lastChangedAt:     STOREFRONT.lastChangedAt,
      concurrency:       null,
      readyTicketCount:  null,
      openIncidents:     null,
      attention:         [],
      attentionCount:    null,
      agents:            [],
      notices:           [],
      warnings:          [],
      activity:          [],
      today:             null,
      usage:             null,
    });
  });

  test('answers older-contract and maps nothing for a version below the known one', async () => {
    expect(ingestion().readingOf({ ...await storefrontSnapshot(), monitorVersion: 0 }, EXAMPLE_READ_STAMP))
      .toEqual({ verdict: 'older-contract', contract: 'monitor', version: 0 });
  });
});

describe('a snapshot that cannot be read', () => {
  test('names a missing or unreadable monitorVersion before anything else', async () => {
    const { monitorVersion: _droppedVersion, ...withoutVersion } = await storefrontSnapshot();
    for (const document of [withoutVersion, { ...withoutVersion, monitorVersion: '1' }, ['monitorVersion'], null, 'monitor']) {
      expect(ingestion().readingOf(document, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['monitorVersion'] });
    }
  });

  test('names each key that is missing or fails its check, as a path into the snapshot', async () => {
    const snapshot = await storefrontSnapshot();
    const [firstJob, ...otherJobs] = snapshot['jobs'] as Record<string, unknown>[];
    const [firstEntry, ...otherEntries] = snapshot['attention'] as Record<string, unknown>[];
    const broken = {
      ...snapshot,
      overseer:  { ...snapshot['overseer'] as object, state: 'resting' },
      jobs:      [{ ...firstJob, tokens: -1 }, ...otherJobs],
      attention: [{ ...firstEntry, kind: 'chat' }, ...otherEntries],
      today:     null,
    };
    delete (broken as Record<string, unknown>)['root'];
    expect(ingestion().readingOf(broken, EXAMPLE_READ_STAMP)).toEqual({
      verdict:     'malformed',
      invalidKeys: ['root', 'overseer.state', 'attention[0].kind', 'jobs[0].tokens', 'today'],
    });
  });

  test('reads a warning as the forge\'s kind and sentence, so a bare sentence is malformed', async () => {
    const snapshot = { ...await storefrontSnapshot(), warnings: ['The Baton pass failed.'] };
    expect(ingestion().readingOf(snapshot, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['warnings[0]'] });
  });

  test('never shows a snapshot of another forge as this one', async () => {
    const snapshot = { ...await storefrontSnapshot(), trackerId: 'invoice-service-2b9e' };
    expect(ingestion().readingOf(snapshot, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['trackerId'] });
  });

  test('reads no key through the prototype', async () => {
    const snapshot = await storefrontSnapshot();
    const inheritedToday = Object.create({ today: snapshot['today'] }) as Record<string, unknown>;
    Object.assign(inheritedToday, snapshot);
    delete inheritedToday['today'];
    expect(ingestion().readingOf(inheritedToday, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['today'] });
  });
});
