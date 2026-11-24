/**
 * An agent's proposed edit. What matters: it lands where the forge placed it on the head and is labelled with those lines (artboard 4),
 * or for the spec version a plan's edit answers (artboard 8); its diff rows number the removed and added lines; a settled one leaves its
 * line in the chat; Apply sends the agent's lines or, after Edit first, User's own, one list per edit; Discard names the proposal.
 */
import { describe, expect, test } from 'bun:test';

import { SENT_COMMAND_VERSION } from '../../testing/FakeControls.ts';
import { DOCUMENT_STATES }      from '../../testing/TicketDocumentsFixture.ts';
import { ProposalModel }        from './ProposalModel.ts';

const PLACE = { ticketId: '004', document: 'spec' } as const;

const [SPEC] = DOCUMENT_STATES.specIdle.documents;

const [, PLAN_OUT_OF_DATE] = DOCUMENT_STATES.planOutOfDate.documents;

describe('an open proposal', () => {
  const [open] = ProposalModel.openProposalsOf('spec', SPEC?.proposals ?? []);

  test('is the one proposal still proposed, labelled with the line it lands on, as artboard 4', () => {
    expect(ProposalModel.openProposalsOf('spec', SPEC?.proposals ?? []).map((proposal) => proposal.proposalId)).toEqual(['P3']);
    expect([open?.label, open?.linesText, open?.headLines]).toEqual(['Spec agent proposes · line 29 only', 'line 29', { from: 29, to: 29 }]);
  });

  test('numbers its removed and added lines from where it lands', () => {
    expect(open?.diffRows.map((row) => [row.lineNumber, row.sign])).toEqual([[29, '−'], [29, '+']]);
    expect(open?.insertedLines[0]).toContain('bun run check:contrast');
  });

  test('on a plan the spec moved under, is labelled with the spec version it answers, as artboard 8', () => {
    const [planEdit] = ProposalModel.openProposalsOf('plan', PLAN_OUT_OF_DATE?.proposals ?? []);
    expect(planEdit?.label).toBe('Plan agent proposes, for spec v6');
  });
});

describe('a settled proposal', () => {
  test('leaves the lines it edited and its version in the chat', () => {
    const notes = (SPEC?.proposals ?? []).map(ProposalModel.settledNoteOf);
    expect(notes).toEqual(['Edited lines 1–35 · applied · v1', 'Edited lines 20, 37–39 · applied · v4', null]);
  });

  test('says when it was discarded, or not applied over User\'s newer text', () => {
    const [, applied] = SPEC?.proposals ?? [];
    if (applied === undefined) throw new Error('no proposal');
    expect(ProposalModel.settledNoteOf({ ...applied, state: 'discarded' })).toBe('Edited lines 20, 37–39 · discarded');
    expect(ProposalModel.settledNoteOf({ ...applied, state: 'conflicted' })).toBe('Edited lines 20, 37–39 · not applied: your newer text stands there');
  });
});

describe('Apply and Discard', () => {
  test('Apply sends the agent\'s lines, and after Edit first User\'s own, one list per edit', () => {
    expect(ProposalModel.applyCommandOf(PLACE, 'P3', null)).toEqual({
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-proposal-apply', ticketId: '004', document: 'spec', proposalId: 'P3', replacementLines: null,
    });
    expect(ProposalModel.applyCommandOf(PLACE, 'P3', ['- [ ] **A3** One.\n- [ ] **A5** Two.'])).toMatchObject({ replacementLines: [['- [ ] **A3** One.', '- [ ] **A5** Two.']] });
  });

  test('Discard names the proposal', () => {
    expect(ProposalModel.discardCommandOf(PLACE, 'P3')).toEqual({
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-proposal-discard', ticketId: '004', document: 'spec', proposalId: 'P3',
    });
  });
});
