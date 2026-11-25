/**
 * The head of a ticket's documents page. What matters: the tabs in pipeline order, the plan muted after the spec until the spec is
 * approved, a ticked tab with its approved version, the plan out of date once the spec moved under it, and `then Build · held`; the state
 * line; the one primary button and its wording, `Approve spec · start Plan`, `Approve plan · start build` or `Approve plan again · start
 * build`, sending the head version, locked while there is nothing to approve, User's edit is unsaved or the agent's questions on the
 * document are open (saying how many), and read-only `Approved by pipeline` where the review is off; and the notice over a plan the spec moved under.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardTicketStatus }                               from '../../../@types/board/BoardVocabulary.ts';
import type { GaiaTicketDocumentsDocument }                     from '../../../@types/board/TicketDocumentsDocument.ts';
import { SENT_COMMAND_VERSION }                                 from '../../testing/FakeControls.ts';
import { DOCUMENT_STATES, documentsTicketOf }                   from '../../testing/TicketDocumentsFixture.ts';
import { OPEN_QUESTIONS_LOCK_REASON, TicketDocumentsViewModel } from './TicketDocumentsViewModel.ts';

interface HeadOptions {
  readonly editing?:   boolean;
  readonly status?:    BoardTicketStatus;
  readonly buildHeld?: boolean;
}

function headOf(documents: GaiaTicketDocumentsDocument, shown: 'spec' | 'plan', { editing = false, status = 'draft', buildHeld = false }: HeadOptions = {}) {
  return TicketDocumentsViewModel.headOf({
    documents, ticket: documentsTicketOf(status, buildHeld), shown, editing
  });
}

function tabTextsOf(documents: GaiaTicketDocumentsDocument, shown: 'spec' | 'plan'): string[] {
  return headOf(documents, shown).tabs.map((tab) => [tab.label, tab.version, tab.suffix, tab.muted ? 'muted' : null, tab.selected ? 'selected' : null]
    .filter((part) => part !== null)
    .join(' '));
}

describe('the tabs', () => {
  test('mute the plan after the spec until the spec is approved, as artboard 1', () => {
    expect(tabTextsOf(DOCUMENT_STATES.specWorking, 'spec')).toEqual(['Spec selected', 'Plan · after spec muted']);
  });

  test('tick the approved spec with its version, as artboard 7', () => {
    expect(tabTextsOf(DOCUMENT_STATES.plan, 'plan')).toEqual(['✓ Spec v5', 'Plan selected']);
  });

  test('mark the plan out of date once the spec moved under it, and the build held, as artboard 8', () => {
    expect(tabTextsOf(DOCUMENT_STATES.planOutOfDate, 'plan')).toEqual(['✓ Spec v6', 'Plan · out of date selected']);
    expect(headOf(DOCUMENT_STATES.planOutOfDate, 'plan', { status: 'committed', buildHeld: true })).toMatchObject({ buildText: 'then Build · held', isDraft: false });
    expect(headOf(DOCUMENT_STATES.specWorking, 'spec')).toMatchObject({ buildText: 'then Build', isDraft: true });
  });
});

describe('the state line', () => {
  test('names the document, its head version and when it was saved, or that User edits', () => {
    expect(headOf(DOCUMENT_STATES.specWorking, 'spec').stateLine).toMatch(/^spec · v4 · saved \d\d:\d\d$/u);
    expect(headOf(DOCUMENT_STATES.specSplit, 'spec', { editing: true }).stateLine).toBe('spec · v6 · editing');
  });

  test('counts an edit proposed, as artboard 4, and names the spec a plan the spec moved under was approved on, as artboard 8', () => {
    expect(headOf(DOCUMENT_STATES.specIdle, 'spec').stateLine).toBe('spec · v4 · 1 edit proposed');
    expect(headOf(DOCUMENT_STATES.planOutOfDate, 'plan').stateLine).toBe('plan · v3 · approved on spec v5');
  });

  test('says a document has no version yet', () => {
    expect(headOf(DOCUMENT_STATES.specWorking, 'plan').stateLine).toBe('plan · no version yet');
  });
});

describe('the primary button', () => {
  test('approves the spec\'s head and starts the plan', () => {
    expect(headOf(DOCUMENT_STATES.specWorking, 'spec').primaryAction).toEqual({
      kind:    'approve',
      label:   'Approve spec · start Plan',
      command: {
        ...SENT_COMMAND_VERSION, kind: 'ticket-document-approve', ticketId: '004', document: 'spec', version: 4
      },
      lockReason:        null,
      openQuestionsText: null,
    });
  });

  test('is locked while the agent\'s questions on the document are open, and says how many beside it, an unsaved edit or not', () => {
    expect(TicketDocumentsViewModel.headOf({
      documents: DOCUMENT_STATES.specWorking, ticket: documentsTicketOf(), shown: 'spec', editing: false, openQuestionCount: 2
    }).primaryAction).toMatchObject({ command: null, lockReason: OPEN_QUESTIONS_LOCK_REASON, openQuestionsText: '2 questions open' });
    expect(TicketDocumentsViewModel.headOf({
      documents: DOCUMENT_STATES.specWorking, ticket: documentsTicketOf(), shown: 'spec', editing: true, openQuestionCount: 1
    }).primaryAction).toMatchObject({ command: null, lockReason: 'Your edit is not saved yet.', openQuestionsText: '1 question open' });
  });

  test('approves the plan, or approves it again once the spec moved under it', () => {
    expect(headOf(DOCUMENT_STATES.plan, 'plan').primaryAction).toMatchObject({ label: 'Approve plan · start build', command: { version: 2 } });
    expect(headOf(DOCUMENT_STATES.planOutOfDate, 'plan').primaryAction).toMatchObject({ label: 'Approve plan again · start build', command: { version: 3 } });
  });

  test('is locked while there is nothing to approve, while User\'s edit is unsaved, and on a plan before the spec is approved', () => {
    expect(headOf(DOCUMENT_STATES.specWorking, 'plan').primaryAction).toMatchObject({ command: null, lockReason: 'The plan has no version to approve yet.' });
    expect(headOf(DOCUMENT_STATES.specWorking, 'spec', { editing: true }).primaryAction).toMatchObject({ command: null, lockReason: 'Your edit is not saved yet.' });
    expect(headOf(DOCUMENT_STATES.plan, 'spec').primaryAction).toMatchObject({ command: null, lockReason: 'v5 is approved.' });
    const [unapprovedSpec] = DOCUMENT_STATES.specWorking.documents;
    const [, plan] = DOCUMENT_STATES.plan.documents;
    if (unapprovedSpec === undefined || plan === undefined) throw new Error('no documents');
    const planOnUnapprovedSpec = { ...DOCUMENT_STATES.plan, documents: [unapprovedSpec, plan] };
    expect(headOf(planOnUnapprovedSpec, 'plan').primaryAction).toMatchObject({ command: null, lockReason: 'The spec is approved first.' });
  });

  test('reads Approved by pipeline, and the document opens read-only, where the review is off', () => {
    const [spec, plan] = DOCUMENT_STATES.plan.documents;
    if (spec === undefined || plan === undefined) throw new Error('no documents');
    const reviewOff = { ...DOCUMENT_STATES.plan, documents: [spec, { ...plan, reviewer: 'pipeline' as const }] };
    expect(headOf(reviewOff, 'plan')).toMatchObject({ primaryAction: { kind: 'approved-by-pipeline', label: 'Approved by pipeline' }, readOnly: true });
    expect(headOf(DOCUMENT_STATES.plan, 'plan').readOnly).toBe(false);
  });

  test('counts the comments', () => {
    expect(headOf(DOCUMENT_STATES.specSplit, 'spec').commentCount).toBe(4);
  });
});

describe('the notice over a plan the spec moved under', () => {
  test('names the approval it outlived and the spec\'s changed item, old and new, as artboard 8', () => {
    const [, plan] = DOCUMENT_STATES.planOutOfDate.documents;
    if (plan === undefined) throw new Error('no plan');
    expect(TicketDocumentsViewModel.outOfDateNoticeOf(plan)).toEqual({
      title:    'The spec changed after this plan was approved',
      sentence: 'You approved plan v3 on spec v5. Spec v6 changed A2. The build waits until this plan is approved again.',
      changes:  [{
        key:      '0',
        label:    'Spec · A2',
        removed:  'Switching the system setting re-themes an open page within one frame.',
        inserted: 'Switching the system setting re-themes an open page within 100 ms, without a reload.',
      }],
    });
    expect(TicketDocumentsViewModel.outOfDateNoticeOf(DOCUMENT_STATES.plan.documents[1] ?? plan)).toBeNull();
  });
});
