/**
 * Where each ticket being written stands, as the Waiting on User list reads it. What matters: a spec-then-plan draft whose spec agent is
 * writing waits on its agent and is not listed, the same draft is listed once its agent asks User, and a draft of the one-ticket route,
 * which its intake shapes, is listed as before.
 */
import { describe, expect, test } from 'bun:test';

import type { Decision }                                        from '../../domain/tracker-model/@types/Decision.ts';
import { PipelineUtil }                                         from '../../domain/tracker-model/utils/PipelineUtil.ts';
import type { PageTicket }                                      from '../../shared/@types/PagePayload.ts';
import { attentionEntriesOf }                                   from '../../shared/monitor/AttentionEntries.ts';
import { documentAgentJobFixture, ticketDocumentRecordFixture } from '../../testing/TicketDocumentFixtures.ts';
import type { BoardState }                                      from './BoardState.ts';
import { DraftProgressReading, type DraftReadingBoard }         from './DraftProgressReading.ts';

const DRAFT_TICKET = {
  id: '012', title: 'Example draft', status: 'draft', updated: '2026-11-25T08:00:00.000Z', filed: '2026-11-25T08:00:00.000Z'
} as PageTicket;

const QUESTION: Decision = {
  id:        'E1',
  kind:      'agent-question',
  ticketIds: ['012'],
  jobId:     'J9',
  askedBy:   'spec-agent',
  requestId: null,
  questions: [],
  context:   '',
  openedAt:  '2026-11-25T09:00:00.000Z',
  document:  'spec',
  anchor:    {
    view: 'code', versionNumber: 1, lines: { from: 1, to: 1 }, sectionPath: [], surroundingLines: { from: 1, to: 3 }
  },
};

function stateWith(decisions: readonly Decision[]): BoardState {
  return {
    decisions,
    jobs: [documentAgentJobFixture('012', 'spec')],
    page: { tickets: [DRAFT_TICKET], payload: { boardFacts: { drafts: [] } } },
  } as unknown as BoardState;
}

function boardOn(route: 'spec-then-plan' | 'one-ticket'): DraftReadingBoard {
  const record = ticketDocumentRecordFixture('012', [{ kind: 'spec', texts: ['# Basket\n'] }]);
  return {
    pipeline:               () => ({ ...PipelineUtil.minimalPipelineOf(), ticketWriting: route }),
    ticketDocumentRecordOf: () => record,
  } as unknown as DraftReadingBoard;
}

function listedKeysOf(state: BoardState, board: DraftReadingBoard): string[] {
  return attentionEntriesOf(DraftProgressReading.attentionBoardOf(state, board)).map((entry) => entry.key);
}

describe('DraftProgressReading.attentionBoardOf', () => {
  test('a draft its spec agent is writing is not listed, and is once the agent asks User', () => {
    expect(listedKeysOf(stateWith([]), boardOn('spec-then-plan'))).toEqual([]);
    expect(listedKeysOf(stateWith([QUESTION]), boardOn('spec-then-plan'))).toEqual(['ticket:012', 'decision:E1']);
  });

  test('a draft of the one-ticket route is listed as before', () => {
    expect(listedKeysOf(stateWith([]), boardOn('one-ticket'))).toEqual(['ticket:012']);
  });
});
