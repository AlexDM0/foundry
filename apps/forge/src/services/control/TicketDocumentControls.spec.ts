/**
 * User's document moves through the control service: each page kind reaches its Board move with the ticket its reference names; a save of the head's
 * own text answers `nothing-to-do`; an approval records the main line's tip and refuses a spec without numbered Acceptance; and an approval that
 * leaves both documents approved readies the draft.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { GitProcess }                                   from '../../lib/git/GitProcess.ts';
import type { Board }                                   from '../../lib/tracker-model/Board.ts';
import { PipelineUtil }                                 from '../../lib/tracker-model/utils/PipelineUtil.ts';
import type { ControlCommand }                          from '../../shared/@types/ControlCommand.ts';
import { boardFixture, refusalDetailOf, ticketFixture } from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                       from '../../testing/EchoedControlContext.ts';
import type { BoardTransaction }                        from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                            from '../tracker/Workspace.ts';
import { ControlService }                               from './ControlService.ts';

const AT = '2026-11-24T11:00:00.000Z';

const MAIN_TIP = 'c0ffee0000000000000000000000000000000000';

const SPEC = '## Outcome\n\nThe basket shows its items.\n\n## Acceptance\n\nA1. The basket shows two items.\n';

const PLAN = '## Files\n\nWork belongs in: src/Basket.ts\n';

let commitReads: string[] = [];

beforeEach(() => {
  commitReads = [];
  spyOn(GitProcess, 'resolvedCommitOf').mockImplementation((directory: string, revision: string): string => {
    commitReads.push(`${directory} ${revision}`);
    return MAIN_TIP;
  });
});

afterEach(() => {
  spyOn(GitProcess, 'resolvedCommitOf').mockRestore();
});

function routeBoard(): Board {
  return boardFixture({
    tickets:  [ticketFixture({ id: '004', status: 'draft' })],
    pipeline: { ...PipelineUtil.minimalPipelineOf(), ticketWriting: 'spec-then-plan' },
  }).board;
}

function apply(board: Board, command: ControlCommand): { outcome: string; result: unknown } {
  const change = { board, at: AT, workspace: workspacePathsFor('/example/repository') } as unknown as BoardTransaction;
  return ControlService.apply(command, change, ECHOED_CONTROL_CONTEXT);
}

describe('the document moves', () => {
  test('a save makes the first version, and the head\'s own text answers nothing-to-do', () => {
    const board = routeBoard();
    const save = {
      kind: 'ticket-document-save', ticketReference: '#4', document: 'spec', baseVersion: null, markdown: SPEC
    } as const;
    expect(apply(board, save).outcome).toBe('done');
    expect(apply(board, { ...save, baseVersion: 1 }).outcome).toBe('nothing-to-do');
    expect(board.ticketDocuments().documentOf('004', 'spec')?.versions.map((version) => version.number)).toEqual([1]);
  });

  test('a comment, its withdrawal and the mode reach the document', () => {
    const board = routeBoard();
    apply(board, {
      kind: 'ticket-document-comment', ticketReference: '4', document: 'spec', anchor: null, text: 'Name the total.'
    });
    apply(board, {
      kind: 'ticket-document-comment-withdraw', ticketReference: '4', document: 'spec', messageId: 'M1'
    });
    apply(board, {
      kind: 'ticket-document-mode-set', ticketReference: '4', document: 'spec', mode: 'auto-apply'
    });
    const spec = board.ticketDocuments().documentOf('004', 'spec');
    expect(spec?.messages.map((message) => message.state)).toEqual(['withdrawn']);
    expect(spec?.proposalMode).toBe('auto-apply');
  });

  test('an approval records the main line\'s tip, read at the repository root', () => {
    const board = routeBoard();
    apply(board, {
      kind: 'ticket-document-save', ticketReference: '4', document: 'spec', baseVersion: null, markdown: SPEC
    });
    apply(board, {
      kind: 'ticket-document-approve', ticketReference: '4', document: 'spec', version: 1
    });
    expect(board.ticketDocuments().documentOf('004', 'spec')?.approvals[0]).toMatchObject({ by: 'person', constitutionCommit: MAIN_TIP });
    expect(commitReads).toEqual(['/example/repository HEAD']);
  });

  test('a spec whose Acceptance numbers no item as the ticket format does is refused', () => {
    const board = routeBoard();
    apply(board, {
      kind: 'ticket-document-save', ticketReference: '4', document: 'spec', baseVersion: null, markdown: '## Acceptance\n\n1. The basket shows.\n'
    });
    expect(refusalDetailOf(() => apply(board, {
      kind: 'ticket-document-approve', ticketReference: '4', document: 'spec', version: 1
    }))).toEqual({ reason: 'spec-acceptance-unnumbered', ticketId: '004' });
  });

  test('a proposal that conflicts tells its agent in the board\'s words, and Discard settles an open one', () => {
    const board = routeBoard();
    apply(board, {
      kind: 'ticket-document-save', ticketReference: '4', document: 'spec', baseVersion: null, markdown: 'one\ntwo'
    });
    const judges = { bodyGapsOf: () => [], workFilesOf: () => [], conflictNoticeOf: () => '' };
    for (const replacement of ['agent two', 'agent two again']) {
      board.ticketDocuments().propose('004', 'spec', 'J4', {
        baseNumber: 1,
        edits:      [{
          fromLine: 2, toLine: 2, originalLines: ['two'], replacementLines: [replacement]
        }],
        summary: 'Edit'
      }, 'c1', judges, AT);
    }
    apply(board, {
      kind: 'ticket-document-save', ticketReference: '4', document: 'spec', baseVersion: 1, markdown: 'one\nUser two'
    });
    apply(board, {
      kind: 'ticket-document-proposal-apply', ticketReference: '4', document: 'spec', proposalId: 'P1'
    });
    apply(board, {
      kind: 'ticket-document-proposal-discard', ticketReference: '4', document: 'spec', proposalId: 'P2'
    });

    const spec = board.ticketDocuments().documentOf('004', 'spec');
    expect(spec?.proposals.map((proposal) => proposal.state)).toEqual(['conflicted', 'discarded']);
    expect(spec?.messages[0]?.text).toContain('Your edit P1 of the spec, made on version 1, did not apply.');
  });

  test('approving the plan once the spec is approved readies the draft in the same write', () => {
    const board = routeBoard();
    apply(board, {
      kind: 'ticket-document-save', ticketReference: '4', document: 'spec', baseVersion: null, markdown: SPEC
    });
    apply(board, {
      kind: 'ticket-document-approve', ticketReference: '4', document: 'spec', version: 1
    });
    apply(board, {
      kind: 'ticket-document-save', ticketReference: '4', document: 'plan', baseVersion: null, markdown: PLAN
    });
    apply(board, {
      kind: 'ticket-document-approve', ticketReference: '4', document: 'plan', version: 1
    });
    expect(board.ticketByReference('004')?.frontmatter.status).toBe('committed');
  });
});
