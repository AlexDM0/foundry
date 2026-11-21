/**
 * The monitor snapshot ingestion over the snapshots a forge at the version Gaia supports answered as Example Storefront, at monitor
 * contract 3, read through the forge client. What matters: each brain
 * state reads as the forge reports it, an ended brain's run as one activity entry with its tokens, and a forge without Flint as reporting
 * no brain; the snapshot of the Storefront at work maps to its frozen reading below; a warning keeps its kind, `assistant-down` becoming a
 * notice; the current usage window is read; a job's turn, its interruption cause and a lost launch stamp read as the forge sends them, a
 * job of a forge before 1.19, which sends no cause, as having none, a cause outside the contract's list as malformed; a snapshot at a newer
 * `monitorVersion` maps nothing of itself, so no attention entry leaks from it, and one at an older version, monitor 2 included, is older
 * than Gaia reads; a malformed snapshot or one of another forge maps nothing; every key the reading needs is checked.
 */
import { describe, expect, test } from 'bun:test';

import type { ForgeReading }                   from '../../shared/@types/ForgeReading.ts';
import { CONTRACT_VERSIONS }                   from '../../shared/constants/ContractVersions.ts';
import { FORGE_NOTICE_KINDS }                  from '../../shared/constants/ForgeNoticeKinds.ts';
import type { FlintBrainSituation }            from '../../testing/RecordedAnswers.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../page-api/testing/fleet-snapshot-five-forges.ts';

import type { ForgeIdentity }       from './@types/ForgeDocumentReading.ts';
import { MonitorSnapshotIngestion } from './MonitorSnapshotIngestion.ts';
import {
  EXAMPLE_READ_STAMP,
  recordedDocumentOf,
  recordedFlintBrainDocumentOf,
  registryFactsOf,
} from './testing/ExampleForgeDocuments.ts';

const STOREFRONT = FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleStorefront;

/** The code version and stamp of the Storefront at work; retake them after `bun run record overseer-fetch-supported-forge`. */
const RECORDED_CODE_VERSION = 'fbc3c0ad0259';
const RECORDED_STAMP = '2026-11-21T00:47:18+01:00';
const STOREFRONT_FACTS = registryFactsOf(STOREFRONT);
const BATON_PASS_SENTENCE = 'the Baton pass to code example-code failed at take-baton: Example error';
const ASSISTANT_DOWN_SENTENCE = 'no Assistant can come up: open incidents take their defaults';

function storefrontIdentityOf(codeVersion: string): ForgeIdentity {
  return {
    trackerId:      STOREFRONT.trackerId,
    project:        STOREFRONT.project,
    codeVersion,
    installVersion: 42,
    processId:      48_107,
    contracts:      {
      summary: 1,
      monitor: 3,
      control: 1,
      embed:   1,
    },
  };
}

function ingestion(): MonitorSnapshotIngestion {
  return new MonitorSnapshotIngestion(STOREFRONT_FACTS, storefrontIdentityOf(RECORDED_CODE_VERSION));
}

async function storefrontSnapshot(): Promise<Record<string, unknown>> {
  return await recordedDocumentOf('serving-every-contract', 'monitor', STOREFRONT_FACTS.overseerUrl) as Record<string, unknown>;
}

/**
 * What the Storefront's snapshot at work maps to: a running board with a draft ticket, the question its first pass opened, its Assistant
 * at work and its brain off.
 */
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
    monitor: 3,
    control: 1,
    embed:   1,
  },
  codeVersion:       RECORDED_CODE_VERSION,
  lastReportedAt:    EXAMPLE_READ_STAMP,
  overseerStartedAt: '2026-11-21T00:47:18+01:00',
  program:           STOREFRONT.program,
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
      stamp:                   '2026-11-21T00:47:17+01:00',
      stampWord:               'filed',
      actionLabel:             'Ready',
      boardRoute:              { tab: 'kanban', item: 'ticket/001' },
    },
    {
      key:                     'decision:E1',
      kind:                    'question',
      idText:                  'E1',
      ticketIds:               [],
      subject:                 'No pipeline is set, so no ticket builds. Set up the pipeline on the Pipeline page, then press Apply.',
      jobId:                   null,
      askedBy:                 'overseer',
      decisionKind:            'checks-not-set',
      escalatedFromIncidentId: null,
      metaText:                null,
      stamp:                   '2026-11-21T00:47:18+01:00',
      stampWord:               'opened',
      actionLabel:             'Answer',
      boardRoute:              { tab: 'questions', item: 'E1' },
    },
  ],
  attentionCount: null,
  agents:         [
    {
      jobId:               'J1',
      kind:                'assistant',
      role:                'assistant',
      state:               'running',
      ticketIds:           [],
      tokens:              0,
      ticketTitle:         null,
      attempt:             1,
      startedAt:           '2026-11-21T00:47:18+01:00',
      calls:               0,
      callBudget:          null,
      toolCalls:           0,
      lastToolCall:        null,
      runningSubagents:    0,
      silentSweeps:        0,
      quiet:               false,
      turn:                'mid-turn',
      messagesWaiting:     0,
      lastLine:            null,
      waitingOnDecisionId: null,
      interruption:        null,
      boardRoute:          { tab: 'agents', item: 'J1' },
    },
  ],
  notices:  [],
  warnings: [],
  activity: [
    {
      logPosition: 0,
      at:          '2026-11-21T00:47:17+01:00',
      category:    'needs-user',
      text:        'Ticket #001 filed: Search suggestions',
      boardRoute:  { tab: 'kanban', item: 'ticket/001' },
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 1,
      at:          '2026-11-21T00:47:18+01:00',
      category:    'forge',
      text:        'Overseer started on code fbc3c0ad0259, install version 42',
      boardRoute:  null,
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 2,
      at:          '2026-11-21T00:47:18+01:00',
      category:    'forge',
      text:        'Forge started by User for the first time',
      boardRoute:  null,
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 3,
      at:          '2026-11-21T00:47:18+01:00',
      category:    'forge',
      text:        'Overseer set to running',
      boardRoute:  null,
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 4,
      at:          '2026-11-21T00:47:18+01:00',
      category:    'needs-user',
      text:        'Decision E1 opened: checks-not-set',
      boardRoute:  { tab: 'questions', item: 'E1' },
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 5,
      at:          '2026-11-21T00:47:18+01:00',
      category:    'agent',
      text:        'Job J1 launched: assistant (assistant), attempt 1',
      boardRoute:  { tab: 'agents', item: 'J1' },
      kind:        null,
      tokens:      null,
    },
  ],
  today: { deliveredTickets: 0, tokens: 0 },
  usage: {
    resetsAt:              null,
    window:                null,
    currentWindow:         null,
    currentWindowResetsAt: null,
  },
  brain: {
    state:       'off',
    startedAt:   null,
    endsAt:      null,
    startedBy:   null,
    model:       null,
    effort:      null,
    tokens:      null,
    calls:       null,
    recentMoves: [],
    endedAt:     null,
    endedReason: null,
    sentence:    null,
    refusal:     null,
  },
  versions: null,
};


const NEWER_MONITOR_VERSION = CONTRACT_VERSIONS.forgeMonitor + 1;

/** The brain's states are recorded from the same forge as the Storefront at work, and taken again with it. */
function brainIngestion(): MonitorSnapshotIngestion {
  return ingestion();
}

async function brainSnapshot(situation: FlintBrainSituation): Promise<Record<string, unknown>> {
  return await recordedFlintBrainDocumentOf(situation, 'monitor', STOREFRONT_FACTS.overseerUrl) as Record<string, unknown>;
}

async function brainReadingOf(situation: FlintBrainSituation): Promise<ForgeReading> {
  const reading = brainIngestion().readingOf(await brainSnapshot(situation), EXAMPLE_READ_STAMP);
  if (reading.verdict !== 'readable') throw new Error(`The ${situation} snapshot does not read: ${reading.verdict}.`);
  return reading.reading;
}

describe('a snapshot at monitor version 3', () => {
  test('reads a running brain as the forge reports it, beside the jobs, which it is not one of', async () => {
    const reading = await brainReadingOf('brain-running');
    expect(reading.contracts.monitor).toBe(3);
    expect(reading.brain).toEqual({
      state:       'running',
      startedAt:   '2026-11-20T23:45:19.939Z',
      endsAt:      '2026-11-20T23:47:19.939Z',
      startedBy:   'api',
      model:       'haiku',
      effort:      'low',
      tokens:      11,
      calls:       1,
      recentMoves: [{ at: '2026-11-20T23:45:20.504Z', intent: 'wave', emote: 'happy' }],
      endedAt:     null,
      endedReason: null,
      sentence:    'Flint\'s brain chooses Flint\'s moves.',
      refusal:     null,
    });
    expect([reading.agents.map((row) => row.jobId), reading.concurrency?.agentsInFlight]).toEqual([['J1'], 0]);
  });

  test('reads an ended brain with its end, and its run as the one activity entry of its kind, with its tokens, which the day\'s include', async () => {
    const reading = await brainReadingOf('brain-ended');
    expect(reading.brain === 'not-reported' ? null : [reading.brain.state, reading.brain.endedReason, reading.brain.endedAt, reading.brain.tokens])
      .toEqual(['ended', 'stopped', '2026-11-20T23:45:20.531Z', 11]);
    expect(reading.activity.filter((entry) => entry.kind !== null)).toEqual([{
      logPosition: 6,
      at:          '2026-11-21T00:45:20+01:00',
      category:    'agent',
      text:        'Flint\'s brain was stopped, after 1 model call and 11 tokens',
      boardRoute:  null,
      kind:        'flint-brain',
      tokens:      11,
    }]);
    expect(reading.today?.tokens).toBe(11);
  });

  test('reads a refused start with the forge\'s code and sentence, and no run', async () => {
    const reading = await brainReadingOf('brain-refused');
    const sentence = 'The Overseer is paused, so Flint\'s brain does not start.';
    expect(reading.brain === 'not-reported' ? null : [reading.brain.state, reading.brain.startedAt, reading.brain.refusal])
      .toEqual(['refused', null, { code: 'overseer-paused', sentence }]);
  });

  test('reads a forge without Flint as one that reports no brain', async () => {
    expect((await brainReadingOf('no-flint')).brain).toBe('not-reported');
  });

  test('names a brain key that is missing or fails its check, as a path into the snapshot', async () => {
    const snapshot = await brainSnapshot('brain-running');
    const brain = snapshot['flintBrain'] as Record<string, unknown>;
    const { flintBrain: _droppedBrain, ...withoutBrain } = snapshot;
    expect(brainIngestion().readingOf(withoutBrain, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['flintBrain'] });
    const broken = { ...snapshot, flintBrain: { ...brain, state: 'asleep', recentMoves: [{ at: 'now', intent: 7, emote: null }] } };
    expect(brainIngestion().readingOf(broken, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['flintBrain.state', 'flintBrain.recentMoves[0].intent'] });
  });
});

describe('the snapshot of Example Storefront at work', () => {
  test('maps to its reading, which reports its brain off', async () => {
    expect(ingestion().readingOf(await storefrontSnapshot(), EXAMPLE_READ_STAMP)).toEqual({ verdict: 'readable', reading: RECORDED_READING });
  });

  test('keeps a failed Baton pass as a warning of its kind, and shows an Assistant that cannot come up as a notice', async () => {
    const snapshot = await storefrontSnapshot();
    const warnings = [{ kind: 'baton-pass-failed', text: BATON_PASS_SENTENCE }, { kind: FORGE_NOTICE_KINDS.assistantDown, text: ASSISTANT_DOWN_SENTENCE }];
    const reading = ingestion().readingOf({ ...snapshot, notices: [], warnings }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? [reading.reading.warnings, reading.reading.notices] : null).toEqual([
      [{ kind: 'baton-pass-failed', text: BATON_PASS_SENTENCE }],
      [{ kind: FORGE_NOTICE_KINDS.assistantDown, text: ASSISTANT_DOWN_SENTENCE }],
    ]);
  });

  test('reads a warning of a kind this Gaia does not know as a warning of that kind, and a warning that is a bare sentence as malformed', async () => {
    const snapshot = await storefrontSnapshot();
    const unknownKind = ingestion().readingOf({ ...snapshot, warnings: [{ kind: 'example-new-warning', text: 'Example warning' }] }, EXAMPLE_READ_STAMP);
    expect(unknownKind.verdict === 'readable' ? unknownKind.reading.warnings : null).toEqual([{ kind: 'example-new-warning', text: 'Example warning' }]);
    expect(ingestion().readingOf({ ...snapshot, warnings: [BATON_PASS_SENTENCE] }, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['warnings[0]'] });
  });

  test('reads the current usage window and its reset beside the limit hit', async () => {
    const snapshot = await storefrontSnapshot();
    const usage = {
      resetsAt:              null,
      window:                null,
      currentWindow:         'five_hour',
      currentWindowResetsAt: '2026-11-12T15:00:00.000Z',
    };
    const reading = ingestion().readingOf({ ...snapshot, usage }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.usage : null).toEqual(usage);
    const { currentWindowResetsAt: _droppedReset, ...withoutReset } = usage;
    expect(ingestion().readingOf({ ...snapshot, usage: withoutReset }, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['usage.currentWindowResetsAt'] });
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

  test('reads a job\'s interruption cause onto its agent row, no cause from a forge before 1.19, and a cause outside the contract\'s list as malformed', async () => {
    const snapshot = await storefrontSnapshot();
    const [assistantJob] = snapshot['jobs'] as Record<string, unknown>[];
    const { interruption: _interruptionOfNewerForge, ...jobOfForgeBeforeInterruptionCauses } = { ...assistantJob, interruption: null };
    const jobs = [
      {
        ...assistantJob, id: 'J2', state: 'interrupted', interruption: 'network-outage'
      },
      {
        ...assistantJob, id: 'J3', state: 'interrupted', interruption: 'lease-ended'
      },
      { ...assistantJob, id: 'J4', interruption: null },
      { ...jobOfForgeBeforeInterruptionCauses, id: 'J5' },
    ];
    const reading = ingestion().readingOf({ ...snapshot, jobs }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.agents.map(({ jobId, interruption }) => [jobId, interruption]) : null).toEqual([
      ['J2', 'network-outage'],
      ['J3', 'lease-ended'],
      ['J4', null],
      ['J5', null],
    ]);
    expect(ingestion().readingOf({ ...snapshot, jobs: [{ ...assistantJob, interruption: 'watcher-lost' }] }, EXAMPLE_READ_STAMP))
      .toEqual({ verdict: 'malformed', invalidKeys: ['jobs[0].interruption'] });
  });

  test('stamps the reading with the moment it was read, the snapshot carrying no stamp of its own', async () => {
    const reading = ingestion().readingOf(await storefrontSnapshot(), '2026-11-12T14:00:00.000Z');
    expect(reading.verdict === 'readable' ? reading.reading.lastReportedAt : null).toBe('2026-11-12T14:00:00.000Z');
  });

  test('names the machine-wide keys a snapshot leaves out as malformed', async () => {
    const snapshot = await storefrontSnapshot();
    snapshot['concurrency'] = { limit: 5, agentsInFlight: 4 };
    expect(ingestion().readingOf(snapshot, EXAMPLE_READ_STAMP)).toEqual({
      verdict:     'malformed',
      invalidKeys: ['concurrency.machineLimit', 'concurrency.machineAgentsInFlight', 'concurrency.ticketsWaitingForMachineSlot'],
    });
  });
});

describe('a snapshot at a version this Gaia does not know', () => {
  test('maps a snapshot with a monitorVersion above the known one to a reading at fidelity newer-contract with no attention entries', async () => {
    const snapshot = { ...await storefrontSnapshot(), monitorVersion: NEWER_MONITOR_VERSION };
    const reading  = ingestion().readingOf(snapshot, EXAMPLE_READ_STAMP);
    expect(reading.verdict).toBe('newer-contract');
    if (reading.verdict !== 'newer-contract') return;
    expect([reading.contract, reading.version]).toEqual(['monitor', NEWER_MONITOR_VERSION]);
    expect(reading.reading.fidelity).toBe('newer-contract');
    expect(reading.reading.attention).toEqual([]);
  });

  test('maps nothing of a newer snapshot: the reading holds the registry, the identity and the numbers, and no fact of the document', async () => {
    const reading = ingestion().readingOf({ ...await storefrontSnapshot(), monitorVersion: NEWER_MONITOR_VERSION }, EXAMPLE_READ_STAMP);
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
        monitor: NEWER_MONITOR_VERSION,
        control: 1,
        embed:   1,
      },
      codeVersion:       RECORDED_CODE_VERSION,
      lastReportedAt:    null,
      overseerStartedAt: null,
      program:           STOREFRONT.program,
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
      brain:             'not-reported',
      versions:          null,
    });
  });

  test('answers older-contract and maps nothing for any version below the known one, monitor 2 included', async () => {
    for (const olderVersion of [2, 1, 0]) {
      expect(ingestion().readingOf({ ...await storefrontSnapshot(), monitorVersion: olderVersion }, EXAMPLE_READ_STAMP))
        .toEqual({ verdict: 'older-contract', contract: 'monitor', version: olderVersion });
    }
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

describe('a snapshot with keys this Gaia does not know', () => {
  test('reads a snapshot of the known version as it reads one without them, a key named as a minor included', async () => {
    const withoutAddedKeys = brainIngestion().readingOf(await brainSnapshot('brain-running'), EXAMPLE_READ_STAMP);
    const withAddedKeys = { ...await brainSnapshot('brain-running'), monitorMinor: 2, exampleAddedKey: { exampleNested: 1 } };

    expect(withoutAddedKeys.verdict).toBe('readable');
    expect(brainIngestion().readingOf(withAddedKeys, EXAMPLE_READ_STAMP)).toEqual(withoutAddedKeys);
  });
});
