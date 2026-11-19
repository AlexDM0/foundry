/**
 * The board document a client reads. What matters: the document a client reads is built from the same reading the Bridge's state is, field
 * for field where both carry a field. On a scratch board with a ticket, a job, a decision, an incident and an open pipeline setup, every
 * value of the document whose path the state also holds equals the state's, a model's `pending` read as `committed`; the limits and the
 * concurrency, which the state keeps in its page, stand at the document's top level; and the model's fields no reader names stay out.
 */
import { describe, expect, test } from 'bun:test';

import { BoardDocumentAssembly } from './BoardDocumentAssembly.ts';
import { boardStateFixture }     from './testing/BoardStateFixture.ts';

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

function committedInPlaceOfPending(value: unknown): unknown {
  return value === 'pending' ? 'committed' : value;
}

describe('BoardDocumentAssembly.boardDocumentOf', () => {
  const state = boardStateFixture();
  const document = BoardDocumentAssembly.boardDocumentOf(state);

  test('every field the document and the state both carry holds the state\'s value, a pending status read as committed', () => {
    const comparisons = Object.entries(document)
      .filter(([field]) => !FIELDS_COMPARED_ELSEWHERE.has(field))
      .flatMap(([field, value]) => sharedLeavesOf({ [field]: value }, state, [], []));
    expect(comparisons.length).toBeGreaterThan(200);
    const differing = comparisons.filter((comparison) => !Bun.deepEquals(comparison.documentValue, committedInPlaceOfPending(comparison.stateValue)));
    expect(differing).toEqual([]);
  });

  test('reads each part of the scratch board: the ticket, the job, the decision, the incident and the open setup', () => {
    expect(document.page.tickets.map((ticket) => [ticket.id, ticket.status])).toEqual([['001', 'committed'], ['002', 'in-progress']]);
    expect(document.jobs.map((job) => [job.id, job.interruption, job.live.tokens])).toEqual([['J1', 'network-outage', 48_000]]);
    expect(document.decisions.map((decision) => decision.questions[0]?.options.map((option) => option.isRecommended))).toEqual([[true, false]]);
    expect(document.incidents.map((incident) => incident.facts)).toEqual([{ reason: 'The registry is down.' }]);
    expect(document.pipelineSetup?.record.draft?.gates.map((gate) => gate.name)).toEqual(['test', 'lint']);
    expect(document.pipeline.readingVerdict).toBe('readable');
  });

  test('serves the limits and the concurrency at the top level, as the state\'s page holds them', () => {
    expect(document.limits).toEqual(state.page.payload.limits);
    expect(document.concurrency).toEqual(state.page.payload.concurrency);
  });

  test('carries the notices that name a kind, with their facts, and the pipeline records the contract declares', () => {
    expect(document.notices).toEqual([{ kind: 'attribution-found', facts: { ticketId: '002' } }]);
    expect(document.pipelineHistory.map((entry) => entry.kind)).toEqual(['pipeline-setup-opened', 'pipeline-gate-added']);
  });

  test('leaves out the model\'s fields no reader names', () => {
    const [ticket] = document.page.tickets;
    expect(ticket === undefined ? [] : ['model', 'extra', 'claimedBodyHash', 'filePath'].filter((field) => Object.hasOwn(ticket, field))).toEqual([]);
    expect(Object.hasOwn(document, 'flintBrain') || Object.hasOwn(document, 'ticketCountByStatus')).toBe(false);
    expect(Object.hasOwn(document.mergeQueue, 'slots')).toBe(false);
  });
});
