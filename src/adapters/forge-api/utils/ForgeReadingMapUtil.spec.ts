/**
 * The reading mapper against its own contract, on documents its ingestions have checked: the Overseer's state and pause to a condition,
 * a held launch outranking a pause; an identity's absent contracts to `null`; the contract just read at the number its document carries;
 * and a newer contract's reading with no fact of any document. The whole mappings are held by the ingestion specs against the fixtures.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardSummaryDocument, SummaryOverseerState } from '../@types/BoardSummaryDocument.ts';
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
