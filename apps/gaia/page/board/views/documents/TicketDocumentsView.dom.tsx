/**
 * A ticket's documents page against a fake relay and fake controls. What matters: the page reads the documents of the routed ticket and
 * reads them again on the board stream's `documents` part, never on another; Approve sends the head version it shows; the tabs link the
 * other document, muted while it waits on the one before; a plan the spec moved under says so, holds the build and asks to be approved
 * again; where the review is off the document reads `Approved by pipeline` and its Code is read-only; a refusal reads verbatim; a comment's
 * card in the chat jumps to Preview and scrolls to its lines at each press, and a page opened jumped to lines scrolls there; while the agent
 * works on a comment made before User's edit, the chat says its edit lands on User's text; Plan's composer opens the effect pane on the effect reading it
 * asks for; a failed read after a good one keeps the page and User's text; and leaving Code leaves no edit that locks Approve. The
 * breadcrumb leads back to the ticket's Tickets segment and Next waiting on you to the next draft that waits; the agent's question shows
 * marked on its line, in the document's Open questions and as its card, whose Answer sends the option's letter and User's note; an
 * answered one says what User chose, with no way to change it; Approve waits while a question is open; and a route naming a line opens
 * the question there (artboard 11).
 */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardDocument }                               from '../../../@types/board/BoardDocument.ts';
import type { BoardEventDocument }                          from '../../../@types/board/BoardEventDocument.ts';
import type { GaiaTicketDocumentsDocument }                 from '../../../@types/board/TicketDocumentsDocument.ts';
import { silentBoardServicesOf }                            from '../../../testing/ShellSurroundingsAt.ts';
import type { BoardServices }                               from '../../@types/BoardServices.ts';
import type { EventStreamHandlers }                         from '../../api/BoardEventStreamClient.ts';
import type { TicketDocumentsRead }                         from '../../api/TicketDocumentsClient.ts';
import { BoardRouter, type BoardRoute }                     from '../../shell/BoardRouter.ts';
import { exampleTicket, FIXTURE_TRACKER_ID }                from '../../testing/BoardStateFixture.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../testing/FakeControls.ts';
import { onBoard }                                          from '../../testing/OnBoard.ts';
import {
  DOCUMENT_STATES,
  documentsBoardOf,
  documentsTicketOf,
  FALLBACK_LINE,
  lineOf,
  SAVED_CHOICE_QUESTION,
  SPEC_ASKS_DOCUMENTS,
  SPEC_TRANSCRIPT_ASKS,
  SPEC_MARKDOWN,
  SPEC_MARKDOWN_V6,
  SPEC_TRANSCRIPT_IDLE,
  SPEC_TRANSCRIPT_SPLIT,
  SPEC_TRANSCRIPT_WORKING,
  SPEC_AGENT_JOB_ID
} from '../../testing/TicketDocumentsFixture.ts';
import { DiagramFrameAddressContext } from './DiagramFrame.tsx';
import {
  TicketDocumentsPage,
  TicketDocumentsReaderContext,
  TicketDocumentsView,
  type PageStateAtMount
} from './TicketDocumentsView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

interface FakeDocumentsRelay {
  readonly reads:   string[];
  readonly answers: TicketDocumentsRead[];
}

interface RenderOptions {
  readonly shown?:      'spec' | 'plan';
  readonly status?:     'draft' | 'committed';
  readonly buildHeld?:  boolean;
  /** The relay's answers before it answers the documents themselves. */
  readonly answers?:    readonly TicketDocumentsRead[];
  readonly board?:      BoardDocument;
  readonly route?:      BoardRoute;
  readonly transcript?: typeof SPEC_TRANSCRIPT_WORKING;
}

function renderDocuments(documents: GaiaTicketDocumentsDocument, options: RenderOptions = {}) {
  const controls = fakeControls();
  const relay: FakeDocumentsRelay = { reads: [], answers: [...options.answers ?? []] };
  const streams: EventStreamHandlers[] = [];
  const followed: string[] = [];
  const services: BoardServices = {
    ...silentBoardServicesOf(FIXTURE_TRACKER_ID),
    openEventStream: (handlers) => {
      streams.push(handlers);
      return { close: () => undefined };
    },
    followTranscript: (jobId, handlers) => {
      followed.push(jobId);
      if (jobId === SPEC_AGENT_JOB_ID) queueMicrotask(() => handlers.onEntries(options.transcript ?? SPEC_TRANSCRIPT_WORKING));
      return { close: () => undefined };
    },
  };
  const reader = () => ({
    read: (ticketId: string) => {
      relay.reads.push(ticketId);
      return Promise.resolve(relay.answers.shift() ?? { verdict: 'read', documents } as const);
    },
  });
  const board = options.board ?? documentsBoardOf(documentsTicketOf(options.status ?? 'draft', options.buildHeld ?? false));
  const route = options.route ?? BoardRouter.documentsRouteOf('004', options.shown ?? 'spec');
  controls.render(onBoard(
    <DiagramFrameAddressContext value={null}>
      <TicketDocumentsReaderContext value={reader}>
        <TicketDocumentsView board={board} route={route} connection="live" boardStore={{} as never} services={services} />
      </TicketDocumentsReaderContext>
    </DiagramFrameAddressContext>,
  ));
  const fire = (event: BoardEventDocument): void => act(() => streams.forEach((stream) => stream.onEvent(event)));
  return {
    controls, relay, fire, followed
  };
}

function renderPage(documents: GaiaTicketDocumentsDocument, transcript: typeof SPEC_TRANSCRIPT_IDLE, atMount: PageStateAtMount) {
  const controls = fakeControls();
  controls.render(onBoard(
    <DiagramFrameAddressContext value={null}>
      <TicketDocumentsPage project="Example Storefront" ticket={documentsTicketOf()} documents={documents} shown="spec" transcript={transcript} atMount={atMount} />
    </DiagramFrameAddressContext>,
  ));
}

async function settled(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('the documents page', () => {
  test('reads the routed ticket\'s documents and follows its agent\'s transcript', async () => {
    const { relay, followed } = renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    expect(relay.reads).toEqual(['004']);
    expect(followed).toEqual([SPEC_AGENT_JOB_ID]);
    expect(screen.getByRole('tab', { name: 'Spec' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Reading package.json for C2')).toBeTruthy();
  });

  test('Flint, the spec agent, stands in the one 50px slot of the page, on the page ground', async () => {
    renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    const flint = screen.getByRole('img', { name: 'Flint, the spec agent' });
    expect([flint.dataset['size'], flint.dataset['ground']]).toEqual(['50', 'page']);
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
  });

  test('reads them again on the board stream\'s documents part, and not on another part', async () => {
    const { relay, fire } = renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    fire({ boardVersion: 3, kind: 'part-changed', part: 'job' });
    fire({ boardVersion: 3, kind: 'board-changed' });
    fire({ boardVersion: 3, kind: 'part-changed', part: 'documents' });
    await settled();
    expect(relay.reads).toEqual(['004', '004']);
  });

  test('Approve sends the head version it shows', async () => {
    const { controls } = renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    await clickSettled(screen.getByRole('button', { name: 'Approve spec · start Plan' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-approve', ticketId: '004', document: 'spec', version: 4
    }]);
  });

  test('a refused approval reads the forge\'s sentence verbatim', async () => {
    const { controls } = renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    controls.answerNextWith({ verdict: 'refused', refusal: 'The spec\'s Acceptance is not numbered yet.' });
    await clickSettled(screen.getByRole('button', { name: 'Approve spec · start Plan' }));
    expect(screen.getByRole('status').textContent).toBe('The spec\'s Acceptance is not numbered yet.');
  });

  test('the plan tab links the plan and is muted while the spec waits for its approval', async () => {
    renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    const planTab = screen.getByRole('tab', { name: 'Plan · after spec' });
    expect([planTab.getAttribute('href'), planTab.hasAttribute('data-muted')]).toEqual([`#forge/${FIXTURE_TRACKER_ID}/documents/ticket/004/plan`, true]);
  });

  test('a plan the spec moved under says so, holds the build and asks to be approved again', async () => {
    renderDocuments(DOCUMENT_STATES.planOutOfDate, { shown: 'plan', status: 'committed', buildHeld: true });
    await settled();
    expect(screen.getByText('then Build · held')).toBeTruthy();
    expect(screen.getByText('The spec changed after this plan was approved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve plan again · start build' })).toBeTruthy();
    expect(screen.queryByText('Draft')).toBeNull();
  });

  test('where the review is off, reads Approved by pipeline and opens its Code read-only', async () => {
    const [spec, plan] = DOCUMENT_STATES.plan.documents;
    if (spec === undefined || plan === undefined) throw new Error('no documents');
    renderDocuments({ ...DOCUMENT_STATES.plan, documents: [spec, { ...plan, reviewer: 'pipeline' }] }, { shown: 'plan' });
    await settled();
    expect(screen.getByText('Approved by pipeline')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Approve plan/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Plan markdown' }).readOnly).toBe(true);
  });

  test('a comment\'s card in the chat jumps to Preview', async () => {
    renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show C2 · § 4 Acceptance › A3 · line 29 · Preview' }));
    expect(screen.getByRole('article', { name: 'The spec' })).toBeTruthy();
  });

  test('Plan\'s composer asks for the effect reading of the head and opens its pane', async () => {
    const { controls } = renderDocuments(DOCUMENT_STATES.plan, { shown: 'plan' });
    await settled();
    expect(screen.queryByRole('region', { name: 'Effect in repo' })).toBeNull();
    await clickSettled(screen.getByRole('button', { name: 'Show effect in repo' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-effect-read', ticketId: '004', document: 'plan', version: 2
    }]);
    const pane = screen.getByRole('region', { name: 'Effect in repo' });
    expect(within(pane).getByText('From plan v2 and the file tree only. No code read. 1.4s')).toBeTruthy();
  });

  test('a read that fails after the documents were read keeps the page and what User typed, with the failure over it', async () => {
    const { relay, fire } = renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Spec markdown' });
    fireEvent.change(editor, { target: { value: `${editor.value}\n- Typed.` } });
    relay.answers.push({ verdict: 'unreachable' });
    fire({ boardVersion: 3, kind: 'part-changed', part: 'documents' });
    await settled();
    expect(screen.getByRole('status').textContent).toBe('Gaia could not be reached. The documents are read again once it answers.');
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Spec markdown' }).value.endsWith('\n- Typed.')).toBe(true);
    fire({ boardVersion: 3, kind: 'part-changed', part: 'documents' });
    await settled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('a new version read while Preview shows leaves Approve open, though Code was opened on the version before', async () => {
    const [spec, plan] = DOCUMENT_STATES.specWorking.documents;
    if (spec === undefined || plan === undefined || spec.head === null) throw new Error('no documents');
    const { relay, fire } = renderDocuments(DOCUMENT_STATES.specWorking);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const newer = { ...spec, markdown: `${spec.markdown}\n- Applied by the agent.`, head: { ...spec.head, number: spec.head.number + 1 } };
    relay.answers.push({ verdict: 'read', documents: { ...DOCUMENT_STATES.specWorking, documents: [newer, plan] } });
    fire({ boardVersion: 3, kind: 'part-changed', part: 'documents' });
    await settled();
    expect((screen.getByRole<HTMLButtonElement>('button', { name: 'Approve spec · start Plan' })).disabled).toBe(false);
    expect(screen.queryByText(/editing/u)).toBeNull();
  });

  test('a comment\'s card scrolls to its lines at each press, and a later view change scrolls nowhere', async () => {
    const scrolled: string[] = [];
    const scrollIntoViewBefore = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function recordScroll(this: Element) {
      scrolled.push(this.getAttribute('data-from-line') ?? '');
    };
    try {
      renderDocuments(DOCUMENT_STATES.specWorking);
      await settled();
      const card = screen.getByRole('button', { name: 'Show C2 · § 4 Acceptance › A3 · line 29 · Preview' });
      fireEvent.click(card);
      fireEvent.click(card);
      expect(scrolled.filter((line) => line !== '')).toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: 'Code' }));
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
      expect(scrolled.filter((line) => line !== '')).toHaveLength(2);
    } finally {
      Element.prototype.scrollIntoView = scrollIntoViewBefore;
    }
  });

  test('a page opened jumped to lines scrolls to them once, as a press on their comment\'s card does', () => {
    const scrolled: string[] = [];
    const scrollIntoViewBefore = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function recordScroll(this: Element) {
      scrolled.push(this.getAttribute('data-from-line') ?? '');
    };
    try {
      const contrastLine = lineOf(SPEC_MARKDOWN, '**A3**');
      renderPage(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE, { jumpedTo: { from: contrastLine, to: contrastLine } });
      expect(scrolled).toEqual([String(contrastLine)]);
    } finally {
      Element.prototype.scrollIntoView = scrollIntoViewBefore;
    }
  });

  test('while the agent answers C3, made on v5, User typing on line 34 reads that its edit lands on User\'s text', () => {
    const sentence = 'You changed line 34 while the agent works. It proposes against v6, so its edit to lines 17–23 lands on your text, not over it.';
    renderPage(DOCUMENT_STATES.specSplit, SPEC_TRANSCRIPT_SPLIT, { view: 'split' });
    const chat = screen.getByRole('log', { name: 'Chat with the spec agent' });
    expect(within(chat).getByText(/^You changed the spec while the agent works\./u)).toBeTruthy();
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Spec markdown' });
    const typed = SPEC_MARKDOWN_V6.replace('(ticket #011)', '(ticket #012)');
    fireEvent.change(editor, { target: { value: typed } });
    const caret = typed.indexOf('#012');
    editor.setSelectionRange(caret, caret);
    fireEvent.select(editor);
    expect(within(chat).getByText(sentence)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(within(chat).getByText(/^You changed the spec while the agent works\./u)).toBeTruthy();
  });

  test('a ticket with no documents shows the forge\'s refusal', async () => {
    renderDocuments(DOCUMENT_STATES.specWorking, { answers: [{ verdict: 'refused', refusal: 'Ticket 004 has no spec or plan.' }] });
    await settled();
    expect(screen.getByRole('status').textContent).toBe('Ticket 004 has no spec or plan.');
    expect(screen.queryByRole('tablist', { name: 'Ticket documents' })).toBeNull();
  });
});

/** Artboard 11's board: #004 waits on User's answer to E7 since 13:05, and, with `otherDraftWaits`, #007's plan for its approval since 12:00. */
function asksBoardOf(otherDraftWaits: boolean): BoardDocument {
  const asking = {
    ...documentsTicketOf(),
    draft: {
      stage: 'spec', waitsOnUser: 'answer', agent: null, waitingSince: '2026-11-24T13:05:00'
    },
  } as const;
  const approving = exampleTicket({
    id:        '007',
    title:     'Order history export',
    status:    'draft',
    documents: { spec: { standing: 'approved', headNumber: 2, approvedNumber: 2 }, plan: { standing: 'awaiting-review', headNumber: 1, approvedNumber: null }, buildHeld: false, },
    draft:     {
      stage: 'plan-review', waitsOnUser: 'approval', agent: null, waitingSince: '2026-11-24T12:00:00'
    },
  });
  const board = documentsBoardOf(asking);
  return {
    ...board,
    decisions: [SAVED_CHOICE_QUESTION],
    page:      { ...board.page, tickets: otherDraftWaits ? [...board.page.tickets, approving] : board.page.tickets },
  };
}

describe('the spec agent asks User on the spec (artboard 11)', () => {
  test('the breadcrumb leads back to the board, Tickets, the In draft segment and the ticket\'s detail', async () => {
    renderDocuments(SPEC_ASKS_DOCUMENTS, { board: asksBoardOf(false) });
    await settled();
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole('link');
    expect(crumbs.map((crumb) => [crumb.textContent, crumb.getAttribute('href')])).toEqual([
      ['Example Storefront', `#forge/${FIXTURE_TRACKER_ID}`],
      ['Tickets', `#forge/${FIXTURE_TRACKER_ID}/tickets`],
      ['In draft', `#forge/${FIXTURE_TRACKER_ID}/tickets/in-draft`],
      ['#004 Account pages dark mode', `#forge/${FIXTURE_TRACKER_ID}/tickets/ticket/004`],
    ]);
  });

  test('Next waiting on you goes to the next draft that waits, oldest wait first and round to the first, and shows none with no other', async () => {
    renderDocuments(SPEC_ASKS_DOCUMENTS, { board: asksBoardOf(true) });
    await settled();
    expect(screen.getByRole('link', { name: 'Next waiting on you ›' }).getAttribute('href')).toBe(`#forge/${FIXTURE_TRACKER_ID}/documents/ticket/007/plan`);
    cleanup();
    renderDocuments(SPEC_ASKS_DOCUMENTS, { board: asksBoardOf(false) });
    await settled();
    expect(screen.queryByRole('link', { name: 'Next waiting on you ›' })).toBeNull();
  });

  test('the question is marked on its line with its solid chip, and lists in the document\'s Open questions', async () => {
    renderDocuments(SPEC_ASKS_DOCUMENTS, { board: asksBoardOf(false) });
    await settled();
    const article = screen.getByRole('article', { name: 'The spec' });
    const chip = within(article).getByTitle('Question E7 for you');
    expect([chip.textContent, chip.hasAttribute('data-asks')]).toEqual(['E7', true]);
    expect(chip.closest<HTMLElement>('[data-from-line]')?.dataset['fromLine']).toBe(String(lineOf(SPEC_ASKS_DOCUMENTS.documents[0]?.markdown ?? '', 'The theme resolves once')));
    expect(article.querySelector('.board-document-questioned')?.textContent).toBe('With no setting the page falls back to light.');
    expect(within(article).getByTitle('Question E8, answered').textContent).toBe('✓ E8');
    const openQuestions = within(article).getByRole('list', { name: 'The agent\'s questions' });
    expect(openQuestions.textContent).toBe('E7 Does this ticket add the saved theme choice? waiting on youE8 Answered: Keep their colours, as A4 says.');
  });

  test('Answer sends the chosen option\'s letter with User\'s note, the recommended option chosen as the card opens', async () => {
    const { controls } = renderDocuments(SPEC_ASKS_DOCUMENTS, { board: asksBoardOf(false) });
    await settled();
    const card = screen.getByRole('region', { name: 'Question E7' });
    expect(within(card).getByRole('button', { name: 'Show line of E7' }).textContent).toBe(`E7 · § 3 Behaviour · line ${FALLBACK_LINE}`);
    expect(within(card).getByText('The answer goes on the ticket and to the agent.')).toBeTruthy();
    fireEvent.click(within(card).getByRole('radio', { name: 'B. No, follow the system only' }));
    fireEvent.change(within(card).getByLabelText('Or answer in your own words'), { target: { value: ' The cookie can go. ' } });
    await clickSettled(within(card).getByRole('button', { name: 'Answer B' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'decision-answer', decisionId: 'E7', answer: { form: 'letters', choices: ['b'], note: 'The cookie can go.' }
    }]);
  });

  test('a question with no option chosen answers with User\'s words alone', async () => {
    const [asked] = SAVED_CHOICE_QUESTION.questions;
    if (asked === undefined) throw new Error('no question');
    const unrecommended = { ...SAVED_CHOICE_QUESTION, questions: [{ ...asked, options: asked.options.map((option) => ({ ...option, recommended: false })) }] };
    const board = { ...asksBoardOf(false), decisions: [unrecommended] };
    const { controls } = renderDocuments(SPEC_ASKS_DOCUMENTS, { board });
    await settled();
    const card = screen.getByRole('region', { name: 'Question E7' });
    expect((within(card).getByRole<HTMLButtonElement>('button', { name: 'Answer' })).disabled).toBe(true);
    fireEvent.change(within(card).getByLabelText('Or answer in your own words'), { target: { value: 'Ask me again after #011.' } });
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'decision-answer', decisionId: 'E7', answer: { form: 'text', text: 'Ask me again after #011.' }
    }]);
  });

  test('the answered question says what User chose and offers no change, the agent\'s reply after it', async () => {
    renderDocuments(SPEC_ASKS_DOCUMENTS, { board: asksBoardOf(false), transcript: SPEC_TRANSCRIPT_ASKS });
    await settled();
    const card = screen.getByRole('region', { name: 'Question E8, answered' });
    expect(card.textContent).toContain('You answered Keep their colours, as A4 says');
    expect(within(card).queryByRole('button', { name: 'Change' })).toBeNull();
    expect(within(screen.getByRole('log', { name: 'Chat with the spec agent' })).getByText(/^Keeping the images as they are/u)).toBeTruthy();
  });

  test('Approve waits while the question is open, saying how many beside it, and sends nothing', async () => {
    const { controls } = renderDocuments(SPEC_ASKS_DOCUMENTS, { board: asksBoardOf(false) });
    await settled();
    const approve = screen.getByRole<HTMLButtonElement>('button', { name: 'Approve spec · start Plan. Answer the open questions first.' });
    expect(approve.disabled).toBe(true);
    expect(screen.getByText('1 question open')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toBe('Answer the open questions first.');
    fireEvent.click(approve);
    expect(controls.sent).toEqual([]);
  });

  test('a question asked after the page read the board reads the forge\'s refusal of Approve verbatim', async () => {
    const refusal = 'The spec of #004 waits on the answer to E7, so it cannot be approved yet: answer it first. Nothing was written.';
    const { controls } = renderDocuments(SPEC_ASKS_DOCUMENTS, { board: { ...asksBoardOf(false), decisions: [] } });
    await settled();
    controls.answerNextWith({ verdict: 'refused', refusal });
    await clickSettled(screen.getByRole('button', { name: 'Approve spec · start Plan' }));
    expect(screen.getByRole('status').textContent).toBe(refusal);
  });

  test('a route naming a line opens the question there unfolded and the others folded, and a folded one unfolds on a press', async () => {
    const imagesLine = lineOf(SPEC_ASKS_DOCUMENTS.documents[0]?.markdown ?? '', '**A4**');
    const second = { ...SAVED_CHOICE_QUESTION, id: 'E9', placement: { from: imagesLine, to: imagesLine } };
    const board = { ...asksBoardOf(false), decisions: [SAVED_CHOICE_QUESTION, second] };
    renderDocuments(SPEC_ASKS_DOCUMENTS, { board, route: BoardRouter.documentsRouteOf('004', 'spec', imagesLine) });
    await settled();
    expect(screen.getByRole('region', { name: 'Question E9' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Question E7' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open question E7: Does this ticket add the saved theme choice?' }));
    expect(screen.getByRole('region', { name: 'Question E7' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Question E9' })).toBeNull();
  });
});
