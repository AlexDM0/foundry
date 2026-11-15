/**
 * The monitor snapshot ingestion over the snapshots a forge serving every contract answered as Example Storefront (recorded at monitor
 * contract 2, and at monitor contract 1 from the forge at 55beb9cd; authored at monitor contract 3 for Flint's brain), read through the
 * forge client. What matters: each brain state of contract 3 reads as the forge reports it, an ended brain's run as one activity entry with
 * its tokens, and a forge without Flint, like every snapshot of contracts 2 and 1, as reporting no brain; each recorded snapshot of
 * contracts 2 and 1 maps to its frozen reading below, migrated; a warning of contract 2 keeps its kind, `assistant-down` becoming a notice,
 * and a warning of contract 1 reads as the kind that names none; the current usage window is read at 2 and unknown at 1; a job's turn and
 * a lost launch stamp read as the forge sends them; a snapshot at a newer `monitorVersion` maps nothing of itself, so no attention entry
 * leaks from it; a malformed snapshot or one of another forge maps nothing; every key the reading needs is checked.
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
  recordedMonitorOneDocumentOf,
  registryFactsOf,
} from './testing/ExampleForgeDocuments.ts';
import { FORGE_WARNING_WITHOUT_KIND } from './utils/MonitorSnapshotMigrationUtil.ts';

const STOREFRONT = FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleStorefront;

/** The code versions and stamps of the recorded runs; retake them after `bun run record overseer-fetch-every-contract` or `overseer-fetch-monitor-1`. */
const RECORDED_CODE_VERSION = '2b47322f0984';
const RECORDED_STAMP = '2026-11-13T09:57:13+01:00';
const MONITOR_ONE_CODE_VERSION = '9fc4e996dd57';
const STOREFRONT_FACTS = registryFactsOf(STOREFRONT);
const BATON_PASS_SENTENCE = 'the Baton pass to code example-code failed at take-baton: Example error';
const ASSISTANT_DOWN_SENTENCE = 'no Assistant can come up: open incidents take their defaults';

function storefrontIdentityAt(monitorVersion: number, codeVersion: string): ForgeIdentity {
  return {
    trackerId:      STOREFRONT.trackerId,
    project:        STOREFRONT.project,
    codeVersion,
    installVersion: 27,
    processId:      48_107,
    contracts:      {
      summary: 1,
      monitor: monitorVersion,
      control: 1,
      embed:   1,
    },
  };
}

function ingestion(): MonitorSnapshotIngestion {
  return new MonitorSnapshotIngestion(STOREFRONT_FACTS, storefrontIdentityAt(2, RECORDED_CODE_VERSION));
}

function monitorOneIngestion(): MonitorSnapshotIngestion {
  return new MonitorSnapshotIngestion(STOREFRONT_FACTS, storefrontIdentityAt(1, MONITOR_ONE_CODE_VERSION));
}

async function storefrontSnapshot(): Promise<Record<string, unknown>> {
  return await recordedDocumentOf('serving-every-contract', 'monitor', STOREFRONT_FACTS.overseerUrl) as Record<string, unknown>;
}

async function monitorOneStorefrontSnapshot(): Promise<Record<string, unknown>> {
  return await recordedMonitorOneDocumentOf('serving-every-contract', 'monitor', STOREFRONT_FACTS.overseerUrl) as Record<string, unknown>;
}

/** What the recorded monitor-2 snapshot maps to: a running board with a draft ticket, the question its first pass opened and two jobs launching. */
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
    monitor: 2,
    control: 1,
    embed:   1,
  },
  codeVersion:       RECORDED_CODE_VERSION,
  lastReportedAt:    EXAMPLE_READ_STAMP,
  overseerStartedAt: '2026-11-13T09:57:13+01:00',
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
      stamp:                   '2026-11-13T09:57:13+01:00',
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
      stamp:                   '2026-11-13T09:57:13+01:00',
      stampWord:               'filed',
      actionLabel:             'Ready',
      route:                   '#kanban/ticket/001',
    },
  ],
  attentionCount: null,
  agents:         [
    {
      jobId:               'J1',
      kind:                'assistant',
      role:                'assistant',
      state:               'launching',
      ticketIds:           [],
      tokens:              0,
      ticketTitle:         null,
      attempt:             1,
      startedAt:           '2026-11-13T09:57:13+01:00',
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
      kind:                'onboarder',
      role:                'onboarder',
      state:               'launching',
      ticketIds:           [],
      tokens:              0,
      ticketTitle:         null,
      attempt:             1,
      startedAt:           '2026-11-13T09:57:14+01:00',
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
      text: 'job J1 is not launched: this platform cannot bind the Watcher endpoint /Users/example/.forge-monitor/watchers/4bea13f3b1e48bad.sock',
    },
    {
      kind: 'watcher-endpoint-does-not-fit',
      text: 'job J2 is not launched: this platform cannot bind the Watcher endpoint /Users/example/.forge-monitor/watchers/7fc0567e7acf1539.sock',
    },
  ],
  warnings: [],
  activity: [
    {
      logPosition: 0,
      at:          '2026-11-13T09:57:13+01:00',
      category:    'needs-user',
      text:        'Ticket #001 filed: Search suggestions',
      route:       '#kanban/ticket/001',
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 1,
      at:          '2026-11-13T09:57:13+01:00',
      category:    'forge',
      text:        'Overseer started on code 2b47322f0984, install version 27',
      route:       null,
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 2,
      at:          '2026-11-13T09:57:13+01:00',
      category:    'needs-user',
      text:        'Decision E1 opened: checks-not-set',
      route:       '#questions/E1',
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 3,
      at:          '2026-11-13T09:57:13+01:00',
      category:    'agent',
      text:        'Job J1 launched: assistant (assistant), attempt 1',
      route:       '#agents/J1',
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 4,
      at:          '2026-11-13T09:57:14+01:00',
      category:    'forge',
      text:        'Overseer set to running',
      route:       null,
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 5,
      at:          '2026-11-13T09:57:14+01:00',
      category:    'agent',
      text:        'Job J2 launched: onboarder (onboarder), attempt 1',
      route:       '#agents/J2',
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
  brain: 'not-reported',
};


/** What the recorded monitor-1 snapshot migrates to: the same board, its warnings none and its current usage window unknown. */
const RECORDED_READING_OF_MONITOR_ONE: ForgeReading = {
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
  codeVersion:       MONITOR_ONE_CODE_VERSION,
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
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 1,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'forge',
      text:        'Overseer started on code 9fc4e996dd57, install version 27',
      route:       null,
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 2,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'forge',
      text:        'Overseer set to running',
      route:       null,
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 3,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'needs-user',
      text:        'Decision E1 opened: checks-not-set',
      route:       '#questions/E1',
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 4,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'agent',
      text:        'Job J1 launched: onboarder (onboarder), attempt 1',
      route:       '#agents/J1',
      kind:        null,
      tokens:      null,
    },
    {
      logPosition: 5,
      at:          '2026-11-13T02:38:47+01:00',
      category:    'agent',
      text:        'Job J2 launched: assistant (assistant), attempt 1',
      route:       '#agents/J2',
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
  brain: 'not-reported',
};


const NEWER_MONITOR_VERSION = CONTRACT_VERSIONS.forgeMonitor.major + 1;

/** The code version the monitor-3 answers were authored with; retake it after `bun run record overseer-fetch-monitor-3`. */
const MONITOR_THREE_CODE_VERSION = '3f9a2c1';

function monitorThreeIngestion(): MonitorSnapshotIngestion {
  const identity: ForgeIdentity = {
    ...storefrontIdentityAt(3, MONITOR_THREE_CODE_VERSION),
    contracts: {
      summary: 1,
      monitor: 3,
      control: 2,
      embed:   1,
    },
  };
  return new MonitorSnapshotIngestion(STOREFRONT_FACTS, identity);
}

async function brainSnapshot(situation: FlintBrainSituation): Promise<Record<string, unknown>> {
  return await recordedFlintBrainDocumentOf(situation, 'monitor', STOREFRONT_FACTS.overseerUrl) as Record<string, unknown>;
}

async function brainReadingOf(situation: FlintBrainSituation): Promise<ForgeReading> {
  const reading = monitorThreeIngestion().readingOf(await brainSnapshot(situation), EXAMPLE_READ_STAMP);
  if (reading.verdict !== 'readable') throw new Error(`The monitor-3 ${situation} snapshot does not read: ${reading.verdict}.`);
  return reading.reading;
}

describe('a snapshot at monitor version 3', () => {
  test('reads a running brain as the forge reports it, beside the jobs, which it is not one of', async () => {
    const reading = await brainReadingOf('brain-running');
    expect(reading.contracts.monitor).toBe(3);
    expect(reading.brain).toEqual({
      state:       'running',
      startedAt:   '2026-11-13T09:58:02+01:00',
      endsAt:      '2026-11-13T10:00:02+01:00',
      startedBy:   'gaia',
      model:       'haiku',
      effort:      'low',
      tokens:      1840,
      calls:       3,
      recentMoves: [
        { at: '2026-11-13T09:58:31+01:00', intent: 'watch-agent', emote: null },
        { at: '2026-11-13T09:58:17+01:00', intent: 'walk-to-column', emote: 'wave' },
        { at: '2026-11-13T09:58:05+01:00', intent: 'look-around', emote: null },
      ],
      endedAt:     null,
      endedReason: null,
      sentence:    'Flint\'s brain is running until 10:00',
      refusal:     null,
    });
    expect([reading.agents.map((row) => row.jobId), reading.concurrency?.agentsInFlight]).toEqual([['J1', 'J2'], 0]);
  });

  test('reads an ended brain with its end, and its run as the one activity entry of its kind, with its tokens, which the day\'s include', async () => {
    const reading = await brainReadingOf('brain-ended');
    expect(reading.brain === 'not-reported' ? null : [reading.brain.state, reading.brain.endedReason, reading.brain.endedAt, reading.brain.tokens])
      .toEqual(['ended', 'stopped', '2026-11-13T09:59:20+01:00', 2960]);
    expect(reading.activity.filter((entry) => entry.kind !== null)).toEqual([{
      logPosition: 6,
      at:          '2026-11-13T09:59:20+01:00',
      category:    'agent',
      text:        'Flint\'s brain stopped after 1:18',
      route:       null,
      kind:        'flint-brain',
      tokens:      2960,
    }]);
    expect(reading.today?.tokens).toBe(2960);
  });

  test('reads a refused start with the forge\'s code and sentence, and no run', async () => {
    const reading = await brainReadingOf('brain-refused');
    const sentence = 'Flint\'s brain cannot start while the usage limit holds. It resets at 14:00.';
    expect(reading.brain === 'not-reported' ? null : [reading.brain.state, reading.brain.startedAt, reading.brain.refusal])
      .toEqual(['refused', null, { code: 'usage-limit-holds', sentence }]);
  });

  test('reads a forge without Flint as one that reports no brain', async () => {
    expect((await brainReadingOf('no-flint')).brain).toBe('not-reported');
  });

  test('names a brain key that is missing or fails its check, as a path into the snapshot', async () => {
    const snapshot = await brainSnapshot('brain-running');
    const brain = snapshot['flintBrain'] as Record<string, unknown>;
    const { flintBrain: _droppedBrain, ...withoutBrain } = snapshot;
    expect(monitorThreeIngestion().readingOf(withoutBrain, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['flintBrain'] });
    const broken = { ...snapshot, flintBrain: { ...brain, state: 'asleep', recentMoves: [{ at: 'now', intent: 7, emote: null }] } };
    expect(monitorThreeIngestion().readingOf(broken, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['flintBrain.state', 'flintBrain.recentMoves[0].intent'] });
  });

  test('reads no brain from a monitor-2 snapshot, even one that carries a brain contract 2 does not have', async () => {
    const brain = (await brainSnapshot('brain-running'))['flintBrain'];
    const reading = ingestion().readingOf({ ...await storefrontSnapshot(), flintBrain: brain }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.brain : null).toBe('not-reported');
  });
});

describe('a snapshot at monitor version 2, which Gaia still reads', () => {
  test('maps the recorded snapshot of Example Storefront to its reading, which reports no brain', async () => {
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

describe('a snapshot at monitor version 1, which Gaia still reads', () => {
  test('migrates the recorded monitor-1 snapshot of Example Storefront to its reading, naming the monitor contract the forge serves and no brain', async () => {
    expect(monitorOneIngestion().readingOf(await monitorOneStorefrontSnapshot(), EXAMPLE_READ_STAMP)).toEqual({ verdict: 'readable', reading: RECORDED_READING_OF_MONITOR_ONE });
  });

  test('reads a warning as the forge\'s sentence alone, under the kind a warning without one reads as, so a warning that is no sentence is malformed', async () => {
    const snapshot = await monitorOneStorefrontSnapshot();
    const reading = monitorOneIngestion().readingOf({ ...snapshot, warnings: [BATON_PASS_SENTENCE, ASSISTANT_DOWN_SENTENCE] }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.warnings : null).toEqual([
      { kind: FORGE_WARNING_WITHOUT_KIND, text: BATON_PASS_SENTENCE },
      { kind: FORGE_WARNING_WITHOUT_KIND, text: ASSISTANT_DOWN_SENTENCE },
    ]);
    const keyedWarning = { ...snapshot, warnings: [{ kind: 'baton-pass-failed', text: BATON_PASS_SENTENCE }] };
    expect(monitorOneIngestion().readingOf(keyedWarning, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['warnings'] });
  });

  test('knows no current usage window, and needs none of its keys', async () => {
    const snapshot = await monitorOneStorefrontSnapshot();
    const reading = monitorOneIngestion().readingOf({ ...snapshot, usage: { resetsAt: '2026-11-12T15:00:00.000Z', window: 'five_hour' } }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.usage : null).toEqual({
      resetsAt:              '2026-11-12T15:00:00.000Z',
      window:                'five_hour',
      currentWindow:         null,
      currentWindowResetsAt: null,
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
    });
  });

  test('answers older-contract and maps nothing for a version below every one Gaia reads', async () => {
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

describe('a snapshot at another minor', () => {
  test('reads a snapshot of the known version at a newer monitorMinor, with a key this Gaia does not know, as it reads one at minor 0', async () => {
    const atMinorZero = monitorThreeIngestion().readingOf(await brainSnapshot('brain-running'), EXAMPLE_READ_STAMP);
    const atANewerMinor = { ...await brainSnapshot('brain-running'), monitorMinor: 2, exampleAddedKey: { exampleNested: 1 } };

    expect(atMinorZero.verdict).toBe('readable');
    expect(monitorThreeIngestion().readingOf(atANewerMinor, EXAMPLE_READ_STAMP)).toEqual(atMinorZero);
  });

  test('reads a snapshot of an older version Gaia still reads at a minor, migrated as at minor 0', async () => {
    const atMinorZero = ingestion().readingOf(await storefrontSnapshot(), EXAMPLE_READ_STAMP);
    const atAMinor = { ...await storefrontSnapshot(), monitorMinor: 1, exampleAddedKey: true };

    expect(atMinorZero.verdict).toBe('readable');
    expect(ingestion().readingOf(atAMinor, EXAMPLE_READ_STAMP)).toEqual(atMinorZero);
  });

  test('refuses a newer monitorVersion whatever its minor, and names a monitorMinor that is no whole number', async () => {
    const atANewerVersion = ingestion().readingOf({ ...await storefrontSnapshot(), monitorVersion: NEWER_MONITOR_VERSION, monitorMinor: 0 }, EXAMPLE_READ_STAMP);

    expect(atANewerVersion.verdict).toBe('newer-contract');
    expect(ingestion().readingOf({ ...await storefrontSnapshot(), monitorMinor: null }, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['monitorMinor'] });
  });
});
