/**
 * The reading mapper against its own contract, on documents its ingestions have checked: the Overseer's state and pause to a condition,
 * a held launch outranking a pause; an identity's absent contracts to `null`; the contract just read at the number its document carries;
 * a warning that an Assistant cannot come up read as a notice after the forge's own notices, every other warning kept with its kind; a
 * brain only from a snapshot, absent for a forge without Flint; an ended brain's activity entry keeping its kind and tokens; a summary's
 * usage with no current window; and a newer contract's reading with no fact of any document. The whole mappings are held by the
 * ingestion specs against the fixtures.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardSummaryDocument, SummaryOverseerState } from 'forge-contracts/BoardSummaryDocument';
import type { MonitorSnapshotDocument }                    from 'forge-contracts/MonitorSnapshotDocument';
import { FORGE_NOTICE_KINDS }                              from '../../../shared/constants/ForgeNoticeKinds.ts';
import type { ForgeIdentity, ForgeRegistryFacts }          from '../@types/ForgeDocumentReading.ts';
import { ForgeReadingMapUtil }                             from './ForgeReadingMapUtil.ts';

const REGISTRY_FACTS: ForgeRegistryFacts = {
  trackerId:         'example-agency-1a2b',
  project:           'Example Agency',
  root:              '/Users/alexexample/development/example-agency',
  overseerUrl:       'http://127.0.0.1:4987/',
  overseerProcessId: 4242,
  lastCommand:       'ticket ready',
  lastChangedAt:     '2026-11-12T08:00:00.000Z',
};

const IDENTITY: ForgeIdentity = {
  trackerId:      REGISTRY_FACTS.trackerId,
  project:        'Example Agency',
  codeVersion:    '3f9a2c1',
  installVersion: 27,
  processId:      4242,
  contracts:      null,
};

function summaryAt(state: SummaryOverseerState, paused: boolean): BoardSummaryDocument {
  return {
    summaryVersion: 1,
    project:        'Example Agency',
    overseer:       { state, paused, url: null },
    readyTicketIds: [],
    jobs:           [],
    openDecisions:  0,
    openIncidents:  0,
    usage:          { resetsAt: null, window: null },
  };
}

describe('the condition of a forge', () => {
  test('follows the Overseer\'s state, a held launch outranking a pause and a serving Overseer paused or live', () => {
    const conditions = ([
      ['serving', false],
      ['serving', true],
      ['held-by-install-change', true],
      ['passing-baton', false],
      ['down', false],
    ] as const).map(([state, paused]) => ForgeReadingMapUtil.countsOnlyReadingOf(summaryAt(state, paused), REGISTRY_FACTS, IDENTITY, 'stamp').condition);
    expect(conditions).toEqual(['live', 'paused', 'held', 'passing-baton', 'dormant']);
  });
});

function snapshotWith(changes: Partial<MonitorSnapshotDocument>): MonitorSnapshotDocument {
  return {
    monitorVersion: 3,
    trackerId:      REGISTRY_FACTS.trackerId,
    project:        'Example Agency',
    root:           REGISTRY_FACTS.root,
    overseer:       {
      state:       'serving',
      paused:      false,
      url:         REGISTRY_FACTS.overseerUrl,
      processId:   4242,
      startedAt:   '2026-11-12T08:00:00.000Z',
      codeVersion: '3f9a2c1',
    },
    concurrency:    { limit: 2, agentsInFlight: 0 },
    readyTicketIds: [],
    openIncidents:  0,
    attention:      [],
    jobs:           [],
    notices:        [],
    warnings:       [],
    today:          { deliveredTickets: 0, tokens: 0 },
    usage:          {
      resetsAt:              null,
      window:                null,
      currentWindow:         null,
      currentWindowResetsAt: null,
    },
    activity:   [],
    flintBrain: null,
    ...changes,
  };
}

describe('the warnings and notices of a snapshot read in full', () => {
  test('read a warning that an Assistant cannot come up as a notice, after the forge\'s own, and keep every other warning with its kind', () => {
    const newCode = { kind: 'new-code', text: 'new code is on disk: restart the Overseer to run it' };
    const assistantDown = { kind: FORGE_NOTICE_KINDS.assistantDown, text: 'no Assistant can come up: open incidents take their defaults' };
    const batonPassFailed = { kind: 'baton-pass-failed', text: 'the Baton pass to code example-code failed at take-baton: Example error' };
    const reading = ForgeReadingMapUtil.fullReadingOf(snapshotWith({ notices: [newCode], warnings: [assistantDown, batonPassFailed] }), REGISTRY_FACTS, IDENTITY, 'stamp');
    expect([reading.notices, reading.warnings]).toEqual([[newCode, assistantDown], [batonPassFailed]]);
  });

  test('carry the current usage window beside the limit hit', () => {
    const usage = {
      resetsAt:              null,
      window:                null,
      currentWindow:         'five_hour',
      currentWindowResetsAt: '2026-11-12T15:00:00.000Z',
    };
    expect(ForgeReadingMapUtil.fullReadingOf(snapshotWith({ usage }), REGISTRY_FACTS, IDENTITY, 'stamp').usage).toEqual(usage);
  });
});

const RUNNING_BRAIN = {
  state:       'running',
  startedAt:   '2026-11-12T08:01:00.000Z',
  endsAt:      '2026-11-12T08:03:00.000Z',
  startedBy:   'bridge',
  model:       'haiku',
  effort:      'low',
  tokens:      1840,
  calls:       3,
  recentMoves: [{ at: '2026-11-12T08:01:20.000Z', intent: 'walk-to-column', emote: 'wave' }],
  endedAt:     null,
  endedReason: null,
  sentence:    'Flint\'s brain is running until 08:03',
  refusal:     null,
} as const satisfies MonitorSnapshotDocument['flintBrain'];

describe('the brain of a snapshot read in full', () => {
  test('carries every fact the forge reports of its brain, and reads a forge without Flint as reporting no brain', () => {
    expect(ForgeReadingMapUtil.fullReadingOf(snapshotWith({ flintBrain: RUNNING_BRAIN }), REGISTRY_FACTS, IDENTITY, 'stamp').brain).toEqual({
      ...RUNNING_BRAIN,
      recentMoves: [{ at: '2026-11-12T08:01:20.000Z', intent: 'walk-to-column', emote: 'wave' }],
    });
    expect(ForgeReadingMapUtil.fullReadingOf(snapshotWith({ flintBrain: null }), REGISTRY_FACTS, IDENTITY, 'stamp').brain).toBe('not-reported');
  });

  test('is not reported by a summary or by a contract newer than this Gaia', () => {
    expect(ForgeReadingMapUtil.countsOnlyReadingOf(summaryAt('serving', false), REGISTRY_FACTS, IDENTITY, 'stamp').brain).toBe('not-reported');
    expect(ForgeReadingMapUtil.newerContractReadingOf(REGISTRY_FACTS, IDENTITY, ForgeReadingMapUtil.contractsWith(IDENTITY, { monitor: 4 })).brain).toBe('not-reported');
  });
});

describe('the activity of a snapshot read in full', () => {
  test('keeps the kind and tokens of an ended brain\'s entry, and reads an entry of no kind, or of a kind this Gaia does not know, as of none', () => {
    const entry = {
      logPosition: 6,
      at:          '2026-11-12T08:03:00.000Z',
      category:    'agent',
      text:        'Flint\'s brain stopped after 2:00',
      route:       null,
    } as const;
    const activity = [{ ...entry, kind: 'flint-brain', tokens: 2960 }, entry, { ...entry, kind: 'example-new-kind', tokens: null }];
    const reading = ForgeReadingMapUtil.fullReadingOf(snapshotWith({ activity }), REGISTRY_FACTS, IDENTITY, 'stamp');
    expect(reading.activity.map(({ kind, tokens }) => [kind, tokens])).toEqual([['flint-brain', 2960], [null, null], [null, null]]);
  });
});

describe('the usage of a forge read through its summary', () => {
  test('is the limit hit and no current window, which a summary does not report', () => {
    expect(ForgeReadingMapUtil.countsOnlyReadingOf(summaryAt('serving', false), REGISTRY_FACTS, IDENTITY, 'stamp').usage).toEqual({
      resetsAt:              null,
      window:                null,
      currentWindow:         null,
      currentWindowResetsAt: null,
    });
  });
});

describe('identityOf', () => {
  test('reads a contract the identity leaves out as null, and an identity without contracts as naming none', () => {
    const document = {
      application:    'forge',
      trackerId:      REGISTRY_FACTS.trackerId,
      project:        'Example Agency',
      codeVersion:    '3f9a2c1',
      installVersion: 27,
      processId:      4242,
    } as const;
    expect(ForgeReadingMapUtil.identityOf({ ...document, contracts: { summary: 1, monitor: 1 } }).contracts).toEqual({
      summary: 1,
      monitor: 1,
      control: null,
      embed:   null,
    });
    expect(ForgeReadingMapUtil.identityOf(document).contracts).toBeNull();
  });
});

describe('contractsWith', () => {
  test('sets the contract just read to the number its document carries, over what the identity names', () => {
    const identity = {
      ...IDENTITY,
      contracts: {
        summary: 1,
        monitor: 1,
        control: 1,
        embed:   null,
      },
    };
    expect(ForgeReadingMapUtil.contractsWith(identity, { monitor: 3 })).toEqual({
      summary: 1,
      monitor: 3,
      control: 1,
      embed:   null,
    });
    expect(ForgeReadingMapUtil.contractsWith(null, { summary: 1 })).toEqual({
      summary: 1,
      monitor: null,
      control: null,
      embed:   null,
    });
  });
});

describe('newerContractReadingOf', () => {
  test('takes the process id from the registry when the identity itself was not read', () => {
    const reading = ForgeReadingMapUtil.newerContractReadingOf(REGISTRY_FACTS, null, ForgeReadingMapUtil.contractsWith(null, {}));
    expect([reading.fidelity, reading.condition, reading.processId, reading.codeVersion, reading.lastReportedAt]).toEqual(['newer-contract', 'unreadable', 4242, null, null]);
  });
});
