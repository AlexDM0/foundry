/**
 * A spec or plan agent's requests through the Hatch inbox: held during the turn so Customs can check the snapshot first, applied at the
 * turn end with the snapshot's commit stamped; a request naming its own commit or another kind is refused, and a refused turn refuses each
 * request once with the Board's refusal.
 */
import { describe, expect, test } from 'bun:test';

import { HatchFormatUtil }                                      from '../../adapters/hatch/utils/HatchFormatUtil.ts';
import type { BoardRefusalDetail }                              from '../../lib/tracker-model/BoardRefusal.ts';
import { PipelineUtil }                                         from '../../lib/tracker-model/utils/PipelineUtil.ts';
import type { ControlCommand }                                  from '../../shared/@types/ControlCommand.ts';
import { boardFixture, ticketFixture, type BoardFixture }       from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { documentAgentJobFixture, ticketDocumentRecordFixture } from '../../testing/TicketDocumentFixtures.ts';
import type { BoardTransaction }                                from '../tracker/BoardTransaction.ts';
import { HatchInbox, type PendingHatchRequest }                 from './HatchInbox.ts';

const AT = '2026-11-24T12:00:00.000Z';

const REPOSITORY_ROOT = '/example/repository';

const SNAPSHOT_COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const SPEC_TEXT = '# Basket\n\n## Acceptance\n\nA1. Alex Example sees the total.\n';

/** A spec agent `J9` of ticket `004` mid-turn, its spec at version 1 and its review off, so its ready approves the head as the pipeline. */
function documentAgentBoard(): BoardFixture & { change: BoardTransaction } {
  const fixture = boardFixture({
    tickets:               [ticketFixture({ id: '004', status: 'draft' })],
    ticketDocumentRecords: [ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC_TEXT] }])],
    pipeline:              { ...PipelineUtil.minimalPipelineOf(), approvals: { spec: false, plan: false } },
  });
  fixture.progress.jobs = [documentAgentJobFixture('004', 'spec')];
  // The cast: applying a request reads only the Board and the stamp of the hold.
  const change = { board: fixture.board, at: AT } as unknown as BoardTransaction;
  return { ...fixture, change };
}

function requestOf(requestId: string, command: Record<string, unknown>): PendingHatchRequest {
  return { jobId: 'J9', requestId, reading: HatchFormatUtil.requestReadingOf(JSON.stringify(HatchFormatUtil.requestOf(requestId, command as unknown as ControlCommand))) };
}

const READY = requestOf('R1', { kind: 'ticket-document-agent-ready' });

function specApprovalsOf(fixture: BoardFixture): readonly unknown[] {
  return fixture.board.ticketDocuments().documentOf('004', 'spec')?.approvals ?? [];
}

describe('during the turn', () => {
  test('a document agent\'s request is held: no reply, no record, no move', () => {
    const fixture = documentAgentBoard();
    expect(HatchInbox.applyPendingRequests(fixture.change, REPOSITORY_ROOT, [READY])).toEqual([]);
    expect(fixture.board.hatchAppliedRecordOf('R1')).toBeNull();
    expect(specApprovalsOf(fixture)).toEqual([]);
  });
});

describe('at the turn end', () => {
  test('the request applies, its document move stamped with the snapshot\'s commit', () => {
    const fixture = documentAgentBoard();
    const [applied] = HatchInbox.applyTurnEndRequests(fixture.change, REPOSITORY_ROOT, [READY], ECHOED_CONTROL_CONTEXT, SNAPSHOT_COMMIT);

    expect(applied?.reply.outcome).toBe('done');
    expect(specApprovalsOf(fixture)).toEqual([expect.objectContaining({ number: 1, by: 'pipeline', constitutionCommit: SNAPSHOT_COMMIT })]);
    expect(fixture.board.hatchAppliedRecordOf('R1')).not.toBeNull();
  });

  test.each([
    ['names its own snapshot commit', { kind: 'ticket-document-agent-ready', constitutionCommit: SNAPSHOT_COMMIT }, 'hatch-identity-mismatch'],
    ['asks a move outside its three', { kind: 'ticket-document-turn-stop', ticketReference: '4', document: 'spec' }, 'command-not-allowed-for-role'],
  ] as const)('a request that %s is refused and reaches no document', (_caseName, command, reason) => {
    const fixture = documentAgentBoard();
    const [refused] = HatchInbox.applyTurnEndRequests(fixture.change, REPOSITORY_ROOT, [requestOf('R2', command)], ECHOED_CONTROL_CONTEXT, SNAPSHOT_COMMIT);

    expect(refused?.reply).toMatchObject({ outcome: 'refused', detail: { kind: 'role-command-refused', reason } });
    expect(specApprovalsOf(fixture)).toEqual([]);
  });

  test('a turn refused as a whole refuses each request once with the Board\'s refusal, and a repeat rebuilds the same reply', () => {
    const fixture = documentAgentBoard();
    const refusal: BoardRefusalDetail = {
      reason: 'document-snapshot-touched', ticketId: '004', document: 'spec', jobId: 'J9', checks: ['V4']
    };
    const [first]  = HatchInbox.refuseRequests(fixture.change, REPOSITORY_ROOT, [READY], refusal);
    const [repeat] = HatchInbox.applyTurnEndRequests(fixture.change, REPOSITORY_ROOT, [READY], ECHOED_CONTROL_CONTEXT, SNAPSHOT_COMMIT);

    expect(first?.reply).toEqual({
      hatchFormatVersion: 1, requestId: 'R1', outcome: 'refused', status: 'refused', detail: { kind: 'board-refusal', boardRefusal: refusal }
    });
    expect(repeat?.reply).toEqual(first?.reply);
    expect(specApprovalsOf(fixture)).toEqual([]);
  });
});
