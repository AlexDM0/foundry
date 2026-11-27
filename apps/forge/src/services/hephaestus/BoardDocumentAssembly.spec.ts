/**
 * The board document a client reads is built from the same reading as the state of `GET /api/state`, field for field where both carry a
 * field, and the readings a view would recompute arrive finished.
 */
import { describe, expect, test } from 'bun:test';

import { BoardReadingMappingUtil }    from '../../adapters/board-document/utils/BoardReadingMappingUtil.ts';
import { BoardDocumentAssembly }      from './BoardDocumentAssembly.ts';
import { boardDocumentSourceFixture } from './testing/BoardStateFixture.ts';

/** The document's top-level fields the state holds at another path. */
const STATE_PATH_OF_DOCUMENT_FIELD: Readonly<Record<string, readonly string[]>> = {
  concurrency: ['page', 'payload', 'concurrency'],
  limits:      ['page', 'payload', 'limits'],
};

/** Filtered by the mapper, so its positions differ from the state's: its own spec holds it. */
const FIELDS_COMPARED_ELSEWHERE: ReadonlySet<string> = new Set(['pipelineHistory', 'notices']);

interface FieldComparison {
  path:          string;
  documentValue: unknown;
  stateValue:    unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stateValueAt(state: unknown, path: readonly string[]): { found: boolean; value: unknown } {
  let value = state;
  for (const field of path) {
    if (!isRecord(value) || !Object.hasOwn(value, field)) return { found: false, value: undefined };
    value = value[field];
  }
  return { found: true, value };
}

/** Every leaf of the document whose path the state also holds, beside the state's value there. */
function sharedLeavesOf(document: unknown, state: unknown, documentPath: readonly string[], statePath: readonly string[]): FieldComparison[] {
  if (isRecord(document) && Object.keys(document).length > 0) {
    return Object.entries(document).flatMap(([field, value]) => {
      const nextStatePath = documentPath.length === 0 ? STATE_PATH_OF_DOCUMENT_FIELD[field] ?? [field] : [...statePath, field];
      return sharedLeavesOf(value, state, [...documentPath, field], nextStatePath);
    });
  }
  const { found, value } = stateValueAt(state, statePath);
  return found ? [{ path: documentPath.join('.'), documentValue: document, stateValue: value }] : [];
}

describe('BoardDocumentAssembly.boardDocumentOf', () => {
  const source = boardDocumentSourceFixture();
  const { state } = source;
  const document = BoardDocumentAssembly.boardDocumentOf(source);

  test('every field the document and the state both carry holds the state\'s value', () => {
    const comparisons = Object.entries(document)
      .filter(([field]) => !FIELDS_COMPARED_ELSEWHERE.has(field))
      .flatMap(([field, value]) => sharedLeavesOf({ [field]: value }, state, [], []));
    expect(comparisons.length).toBeGreaterThan(200);
    const differing = comparisons.filter((comparison) => !Bun.deepEquals(comparison.documentValue, comparison.stateValue));
    expect(differing).toEqual([]);
  });

  test('reads each part of the scratch board: the ticket, the job, the decision, the incident and the open setup', () => {
    expect(document.page.tickets.map((ticket) => [ticket.id, ticket.status])).toEqual([['001', 'committed'], ['002', 'in-progress']]);
    expect(document.jobs.map((job) => [job.id, job.interruption, job.live.tokens])).toEqual([['J1', 'network-outage', 48_000]]);
    expect(document.decisions.map((decision) => decision.questions[0]?.options.map((option) => option.recommended))).toEqual([[true, false]]);
    expect(document.incidents.map((incident) => incident.facts)).toEqual([{ reason: 'The registry is down.' }]);
    expect(document.pipelineSetup?.record.draft?.gates.map((gate) => gate.name)).toEqual(['test', 'lint']);
    expect(document.pipeline.readingVerdict).toBe('readable');
  });

  test('serves the limits and the concurrency at the top level, as the state\'s page holds them', () => {
    expect(document.limits).toEqual({ ...state.page.payload.limits, ...BoardReadingMappingUtil.ruleLimitsOf() });
    expect(document.concurrency).toEqual(state.page.payload.concurrency);
  });

  test('carries the notices that name a kind, with their facts, and the pipeline records the contract declares', () => {
    expect(document.notices).toEqual([{ kind: 'attribution-found', facts: { ticketId: '002' }, sentence: 'ticket #002 carries an AI attribution' }]);
    expect(document.pipelineHistory.map((entry) => entry.kind)).toEqual(['pipeline-setup-opened', 'pipeline-gate-added']);
  });

  test('leaves out the model\'s fields no reader names', () => {
    const [ticket] = document.page.tickets;
    expect(ticket === undefined ? [] : ['model', 'extra', 'contentHash', 'filePath'].filter((field) => Object.hasOwn(ticket, field))).toEqual([]);
    expect(Object.hasOwn(document, 'flintBrain') || Object.hasOwn(document, 'ticketCountByStatus')).toBe(false);
    expect(Object.hasOwn(document.mergeQueue, 'slots')).toBe(false);
  });

  test('serves each ticket\'s facts and the commands it accepts now, as the Board offers them', () => {
    expect(document.page.tickets.map((ticket) => [ticket.id, ticket.facts.resolvedPriority, ticket.facts.noAgentHasPickedItUp, ticket.offers])).toEqual([
      ['001', 'high', true, { kinds: ['ticket-hold', 'ticket-park', 'ticket-network', 'ticket-priority', 'ticket-deliver-by-hand'], priorityChoices: ['normal', 'low'] }],
      ['002', 'normal', false, { kinds: ['ticket-hold', 'ticket-park', 'ticket-priority'], priorityChoices: ['high'] }],
    ]);
  });

  test('serves each job\'s stop holds and the controls it takes', () => {
    expect(document.jobs.map((job) => [job.stopHolds, job.offers])).toEqual([[
      { stop: 'stopped by User (J1)', windDown: 'wound down by User (J1)' },
      { stopModes: ['stop', 'wind-down'], takesFresh: true, takesMessage: true },
    ]]);
  });

  test('serves what waits on User with the thing each entry opens, and the open decisions in answering order', () => {
    expect(document.attention.map((entry) => [entry.key, entry.target])).toEqual([
      ['decision:E1', { subject: 'decision', id: 'E1' }],
      ['draft:D1', { subject: 'draft', id: 'D1' }],
    ]);
    expect([document.openDecisionIds, document.escalatedDecisionIds, document.warnings]).toEqual([['E1'], [], []]);
  });

  test('dates today\'s figures by the reading\'s clock', () => {
    expect(document.today.calendarDate).toBe('2026-11-19');
    const nextDay = BoardDocumentAssembly.boardDocumentOf({ ...source, now: new Date('2026-11-21T12:00:00+01:00') });
    expect(nextDay.today.calendarDate).toBe('2026-11-21');
  });

  test('serves the refusal an Apply of the draft meets now, worded as the command words it', () => {
    expect([document.pipelineSetup?.applyRefusal?.code, document.pipelineSetup?.applyRefusal?.fields['setupId']]).toEqual(['pipeline-moved', 'S1']);
    expect(document.pipelineSetup?.applyRefusal?.sentence).toContain('pipeline setup S1');
  });

  test('serves a stored option\'s isRecommended as recommended, with its label unchanged', () => {
    expect(document.decisions[0]?.questions[0]?.options.map((option) => [option.label, option.recommended])).toEqual([['CSV', true], ['JSON', false]]);
  });
});
