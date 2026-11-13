/**
 * The monitor snapshot ingestion over the snapshot a forge serving every contract answered as Example Storefront (recorded), read through
 * the forge client. What matters: the snapshot maps to the frozen reading below; a job's turn and a lost launch stamp, and a warning, read
 * as monitor contract 1 sends them; a snapshot at a newer `monitorVersion` maps nothing of itself, so no attention entry leaks from it; a
 * malformed snapshot or one of another forge maps nothing; every key the reading needs is checked.
 */
import { describe, expect, test } from 'bun:test';

import type { ForgeReading }                   from '../../shared/@types/ForgeReading.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../page-api/testing/fleet-snapshot-five-forges.ts';

import type { ForgeIdentity }                                      from './@types/ForgeDocumentReading.ts';
import { MonitorSnapshotIngestion }                                from './MonitorSnapshotIngestion.ts';
import { EXAMPLE_READ_STAMP, recordedDocumentOf, registryFactsOf } from './testing/ExampleForgeDocuments.ts';
import { FORGE_WARNING_WITHOUT_KIND }                              from './utils/ForgeReadingMapUtil.ts';

const STOREFRONT = FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleStorefront;

/** The code version and the stamps of the recorded run; retake them after `bun run record overseer-fetch-every-contract`. */
const RECORDED_CODE_VERSION = '9fc4e996dd57';
const RECORDED_STAMP = '2026-11-13T02:38:47+01:00';
const STOREFRONT_FACTS = registryFactsOf(STOREFRONT);

const STOREFRONT_IDENTITY: ForgeIdentity = {
  trackerId:      STOREFRONT.trackerId,
  project:        STOREFRONT.project,
  codeVersion:    RECORDED_CODE_VERSION,
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

/** What the recorded snapshot maps to: a running board with a draft ticket, the question its first pass opened and two jobs launching. */
const RECORDED_READING: ForgeReading = {
  trackerId: STOREFRONT.trackerId,
  project:   'Example Storefront',
  root:      '/Users/alexexample/development/example-storefront',
  fidelity:  'full',
  condition: 'live',
  url:       'http://127.0.0.1:4951/',
  processId: 48_107,
  contracts: {
    summary: 1,
    monitor: 1,
    control: 1,
    embed:   1,
  },
  codeVersion:       RECORDED_CODE_VERSION,
  lastReportedAt:    EXAMPLE_READ_STAMP,
  overseerStartedAt: '2026-11-13T02:38:47+01:00',
  lastCommand:       STOREFRONT.lastCommand,
  lastChangedAt:     STOREFRONT.lastChangedAt,
  concurrency:       {
    limit:                        2,
    agentsInFlight:               0,
    machineLimit:                 10,
    machineAgentsInFlight:        0,
    ticketsWaitingForMachineSlot: 0,
  },
  readyTicketCount: 0,
  openIncidents:    0,
  attention:        [
    {
      key:                     'decision:E1',
      kind:                    'question',
      idText:                  'E1',
      ticketIds:               [],
      subject:                 'The Overseer needs a decision (checks-not-set) about the board.',
      jobId:                   null,
      askedBy:                 'overseer',
      decisionKind:            'checks-not-set',
      escalatedFromIncidentId: null,
      metaText:                null,
      stamp:                   '2026-11-13T02:38:47+01:00',
      stampWord:               'opened',
      actionLabel:             'Answer',
      route:                   '#questions/E1',
    },
    {
      key:                     'ticket:001',
      kind:                    'draft-ticket',
      idText:                  '#001',
      ticketIds:               [],
      subject:                 'Search suggestions',
      jobId:                   null,
      askedBy:                 null,
      decisionKind:            null,
      escalatedFromIncidentId: null,
      metaText:                'draft ticket, no row yet',
      stamp:                   '2026-11-13T02:38:47+01:00',
      stampWord:               'filed',
      actionLabel:             'Ready',
      route:                   '#kanban/ticket/001',
    },
  ],
  attentionCount: null,
  agents:         [
    {
      jobId:               'J1',
      kind:                'onboarder',
      role:                'onboarder',
      state:               'launching',
      ticketIds:           [],
      tokens:              0,
      ticketTitle:         null,
      attempt:             1,
      startedAt:           '2026-11-13T02:38:47+01:00',
      calls:               0,
      callBudget:          null,
      toolCalls:           0,
      lastToolCall:        null,
      runningSubagents:    0,
      silentSweeps:        0,
      quiet:               false,
      turn:                null,
      messagesWaiting:     0,
      lastLine:            null,
      waitingOnDecisionId: null,
      route:               '#agents/J1',
    },
    {
      jobId:               'J2',
      kind:                'assistant',
      role:                'assistant',
      state:               'launching',
      ticketIds:           [],
      tokens:              0,
      ticketTitle:         null,
      attempt:             1,
      startedAt:           '2026-11-13T02:38:47+01:00',
      calls:               0,
      callBudget:          null,
      toolCalls:           0,
      lastToolCall:        null,
      runningSubagents:    0,
      silentSweeps:        0,
      quiet:               false,
      turn:                null,
      messagesWaiting:     0,
      lastLine:            null,
      waitingOnDecisionId: null,
      route:               '#agents/J2',
    },
  ],
  notices: [
    {
      kind: 'watcher-endpoint-does-not-fit',
      text: 'job J1 is not launched: this platform cannot bind the Watcher endpoint /Users/example/.forge-monitor/watchers/bb0ae8de0c0ac988.sock',
    },
    {
      kind: 'watcher-endpoint-does-not-fit',
      text: 'job J2 is not launched: this platform cannot bind the Watcher endpoint /Users/example/.forge-monitor/watchers/dd408833fc62cf81.sock',
    },
  ],
  warnings: [],
  activity: [
    {
      logPosition: 0,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'needs-user',
      text:        'Ticket #001 filed: Search suggestions',
      route:       '#kanban/ticket/001',
    },
    {
      logPosition: 1,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'forge',
      text:        'Overseer started on code 9fc4e996dd57, install version 27',
      route:       null,
    },
    {
      logPosition: 2,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'forge',
      text:        'Overseer set to running',
      route:       null,
    },
    {
      logPosition: 3,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'needs-user',
      text:        'Decision E1 opened: checks-not-set',
      route:       '#questions/E1',
    },
    {
      logPosition: 4,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'agent',
      text:        'Job J1 launched: onboarder (onboarder), attempt 1',
      route:       '#agents/J1',
    },
    {
      logPosition: 5,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'agent',
      text:        'Job J2 launched: assistant (assistant), attempt 1',
      route:       '#agents/J2',
    },
  ],
  today: { deliveredTickets: 0, tokens: 0 },
  usage: { resetsAt: null, window: null },
};

describe('a snapshot at the known monitor version', () => {
  test('maps the recorded snapshot of Example Storefront to its reading', async () => {
    expect(ingestion().readingOf(await storefrontSnapshot(), EXAMPLE_READ_STAMP)).toEqual({ verdict: 'readable', reading: RECORDED_READING });
  });

  test('reads a job\'s turn as the forge words where its session stands, and a lost launch stamp as no stamp', async () => {
    const snapshot = await storefrontSnapshot();
    const [assistantJob] = snapshot['jobs'] as Record<string, unknown>[];
    const jobs = [
      { ...assistantJob, id: 'J2', turn: 'mid-turn' },
      {
        ...assistantJob, id: 'J3', turn: 'between-turns', startedAt: ''
      },
    ];
    const reading = ingestion().readingOf({ ...snapshot, jobs }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.agents.map(({ jobId, turn, startedAt }) => [jobId, turn, startedAt]) : null).toEqual([
      ['J2', 'mid-turn', RECORDED_STAMP],
      ['J3', 'between-turns', null],
    ]);
    expect(ingestion().readingOf({ ...snapshot, jobs: [{ ...assistantJob, turn: 7 }] }, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['jobs[0].turn'] });
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
      codeVersion:       RECORDED_CODE_VERSION,
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

  test('reads a warning as the forge\'s sentence alone, under the kind a warning without one reads as, so a warning that is no sentence is malformed', async () => {
    const sentence = 'the Baton pass to code example-code failed at take-baton: Example error';
    const reading = ingestion().readingOf({ ...await storefrontSnapshot(), warnings: [sentence] }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.warnings : null).toEqual([{ kind: FORGE_WARNING_WITHOUT_KIND, text: sentence }]);
    const keyedWarning = { ...await storefrontSnapshot(), warnings: [{ kind: 'baton-pass-failed', text: sentence }] };
    expect(ingestion().readingOf(keyedWarning, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['warnings'] });
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
