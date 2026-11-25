/**
 * The Intake view against fake controls and a fake transcript stream. What matters: the list shows every session with its title, state,
 * asks and drafts, the ones that wait on User first; the route selects one session, whose transcript is the only one followed, so moving
 * to another closes the first stream; the chat shows User's request as a bubble, the agent's turns with their tool folds and the open
 * decision as a turn whose Answer posts `decision-answer`; the composer posts `job-message`, on Enter too, and clears; Close intake posts
 * `intake-close` and names the drafts it offers; an open session's chat ends with the product owner's live turn, holding the one Flint
 * slot; each pane is headed in the page face; a closed session has no Close intake, says a message resumes it and takes a message; a
 * stopped or failed session stays listed and on the route naming it, read only with its outcome and no composer; the new chat opens on
 * `intake/new` and when there is no session, starts the session with `intake-start` and then follows the new job, shown as starting until
 * a board names it or its end.
 */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useEffect, useState, type ReactElement } from 'react';

import type { BoardDocument }                                       from '../../../@types/board/BoardDocument.ts';
import { BoardGoToContext, BoardTrackerContext }                    from '../../shell/BoardRouteLinks.ts';
import { BoardRouter }                                              from '../../shell/BoardRouter.ts';
import { boardHrefOf, boardRouteSurroundings }                      from '../../testing/BoardRouteSurroundings.tsx';
import { exampleAskingDecision, exampleTicket, FIXTURE_TRACKER_ID } from '../../testing/BoardStateFixture.ts';
import { clickSettled, fakeControls, fakeTranscripts }              from '../../testing/FakeControls.ts';
import {
  EXAMPLE_SESSION_RECORD_AT,
  intakeBoardOf,
  productOwnerJob,
  sessionRecord
} from '../../testing/IntakeBoardFixture.ts';
import { exampleTranscriptEntry } from '../../testing/TranscriptEntryFixture.ts';
import { IntakeView }             from './IntakeView.tsx';

const TRACKER_FRAGMENT_START = `#forge/${FIXTURE_TRACKER_ID}/`;

const COMMAND_VERSION = { boardCommandVersion: 3 } as const;

/** The view under the route it last went to, as the forge route gives it, starting on `initialItem`. */
function RoutedIntakeView({ board, initialItem }: { readonly board: BoardDocument; readonly initialItem: string | null }) {
  const [selectedItem, setSelectedItem] = useState(initialItem);
  const goTo = (fragment: string): void => setSelectedItem(BoardRouter.routeOf(fragment.slice(TRACKER_FRAGMENT_START.length), null).item);
  return (
    <BoardTrackerContext.Provider value={FIXTURE_TRACKER_ID}>
      <BoardGoToContext.Provider value={goTo}>
        <IntakeView board={board} followTranscript={fakeTranscripts().follow} selectedItem={selectedItem} />
      </BoardGoToContext.Provider>
    </BoardTrackerContext.Provider>
  );
}

/** The routed view on a board the spec replaces later, as a new reading of the board would. */
function FedIntakeView({ initialBoard, onFeed }: {
  readonly initialBoard: BoardDocument;
  readonly onFeed:       (showBoard: (board: BoardDocument) => void) => void;
}) {
  const [board, setBoard] = useState(initialBoard);
  useEffect(() => onFeed(setBoard), [onFeed]);
  return <RoutedIntakeView board={board} initialItem="new" />;
}

const OPTION = {
  description: '', recommended: false, touches: [], tradeOff: null, acceptanceEffect: null
} as const;

const BOARD: BoardDocument = intakeBoardOf({
  jobs: [
    productOwnerJob({ id: 'J6', state: 'running', intake: { text: 'Orders CSV dates in UTC', title: null } }, {
      calls:    3,
      turn:     'mid-turn',
      lastLine: { role: 'assistant', text: 'Read src/admin/RefundsCsv.ts', at: null },
    }),
    productOwnerJob({ id: 'J7', state: 'waiting-for-answer', intake: { text: 'Add an export', title: 'Orders export' } }, { calls: 7, turn: 'mid-turn' }),
  ],
  decisions: [exampleAskingDecision({
    id:        'E4',
    jobId:     'J7',
    askedBy:   'product-owner',
    openedAt:  EXAMPLE_SESSION_RECORD_AT,
    questions: [{
      question: 'CSV or JSON?', header: 'Format', multiSelect: false, options: [{ letter: 'a', label: 'CSV', ...OPTION }, { letter: 'b', label: 'JSON', ...OPTION }]
    }],
  })],
  tickets: [
    exampleTicket({
      id: '060', title: 'Export as CSV', status: 'draft', filedByJob: 'J7'
    }),
    exampleTicket({
      id: '063', title: 'Export as JSON', status: 'draft', filedByJob: 'J7'
    }),
    exampleTicket({
      id: '061', title: 'Older request', status: 'committed', filedByJob: 'J2'
    }),
  ],
  questionHistory: [
    sessionRecord('job-launched', 'J2', { kind: 'product-owner', ticketIds: [], intakeText: 'Reorder button' }),
    sessionRecord('job-ended', 'J2', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J6', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-launched', 'J7', { kind: 'product-owner', ticketIds: [] }),
  ],
});

/** The view under the fixture's tracker, with every route it goes to recorded. */
function shownUnderBoard(view: ReactElement): { readonly element: ReactElement; readonly followed: string[] } {
  const surroundings = boardRouteSurroundings();
  return { element: surroundings.wrap(view), followed: surroundings.followed };
}

function intakeViewOf(board: BoardDocument, selectedItem: string | null, followTranscript = fakeTranscripts().follow): ReactElement {
  return shownUnderBoard(<IntakeView board={board} followTranscript={followTranscript} selectedItem={selectedItem} />).element;
}

afterEach(cleanup);

function sessionRows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Sessions' })).getAllByRole('link');
}

describe('the session list', () => {
  test('shows every session with its title, state, asks and drafts, the one that waits on User first', () => {
    fakeControls().render(intakeViewOf(BOARD, null));
    expect(sessionRows().map((row) => row.getAttribute('aria-label'))).toEqual(['Intake J7', 'Intake J6', 'Intake J2']);
    const [waiting, running, closed] = sessionRows();
    expect(waiting?.textContent).toBe('J7Orders exportwaiting-for-answerE4 waits on User2 drafts');
    expect(running?.textContent).toBe('J6Orders CSV dates in UTCrunningRead src/admin/RefundsCsv.ts');
    expect(closed?.textContent).toBe('J2Reorder buttonclosed1 ticket fileda message resumes it');
    expect(closed?.hasAttribute('data-closed')).toBe(true);
    expect(within(screen.getByRole('region', { name: 'Product-owner sessions' })).getByText('3 sessions')).toBeDefined();
  });

  test('each row links to its session, the route selects one, and only its transcript is followed', () => {
    const transcripts = fakeTranscripts();
    const view = fakeControls().render(intakeViewOf(BOARD, 'J6', transcripts.follow));
    expect(sessionRows().map((row) => row.getAttribute('href'))).toEqual([boardHrefOf('intake/J7'), boardHrefOf('intake/J6'), boardHrefOf('intake/J2')]);
    expect(sessionRows().map((row) => row.getAttribute('aria-current'))).toEqual([null, 'true', null]);
    expect(screen.getByRole('region', { name: 'Intake J6' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Intake J7' })).toBeNull();
    expect(transcripts.followedJobs()).toEqual(['J6']);
    view.rerender(intakeViewOf(BOARD, 'J2', transcripts.follow));
    expect(transcripts.followedJobs()).toEqual(['J2']);
  });
});

describe('the selected chat', () => {
  test('shows User\'s request, the agent\'s turns with their tool folds and the open decision, whose Answer posts decision-answer', async () => {
    const controls = fakeControls();
    const transcripts = fakeTranscripts();
    controls.render(intakeViewOf(BOARD, 'J7', transcripts.follow));
    transcripts.feed('J7', [
      exampleTranscriptEntry({
        cursor: '1.1', role: 'hephaestus', text: 'You are the product owner.', sentBy: 'hephaestus', clientAct: 'chat'
      }),
      exampleTranscriptEntry({
        cursor: '1.2', role: 'tool-call', text: 'src/export.ts', toolName: 'Read', toolUseId: 't1'
      }),
      exampleTranscriptEntry({
        cursor: '1.3', role: 'tool-result', text: '', toolUseId: 't1'
      }),
      exampleTranscriptEntry({ cursor: '1.4', role: 'assistant', text: 'Which format do you need?' }),
      exampleTranscriptEntry({ cursor: '1.5', role: 'turn-end', text: '' }),
    ]);
    const thread = screen.getByRole('list', { name: 'Conversation of J7' });
    expect(within(thread).getByText('Hephaestus started J7 from User\'s first message · product-owner')).toBeDefined();
    expect(within(thread).getByText('Add an export').className).toBe('board-chat-bubble');
    expect(within(thread).getByText('Used 1 tool')).toBeDefined();
    expect(within(thread).getByText('Which format do you need?')).toBeDefined();
    const question = within(thread).getByRole('region', { name: 'Question E4' });
    expect(question.dataset['placement']).toBe('docked');
    fireEvent.click(within(question).getByLabelText('a. CSV'));
    await clickSettled(within(question).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{
      ...COMMAND_VERSION, kind: 'decision-answer', decisionId: 'E4', answer: { form: 'letters', choices: ['a'] }
    }]);
  });

  test('the head names the job, its turns and calls, and the composer says the session waits on User', () => {
    fakeControls().render(intakeViewOf(BOARD, 'J7'));
    const pane = screen.getByRole('region', { name: 'Intake J7' });
    expect(pane.querySelector('.board-intake-meta')?.textContent).toBe('product-owner · J7 · 0 turns · 7 calls');
    expect(within(pane).getByText('Waiting on User: the next message queues')).toBeDefined();
  });

  test('Send and Enter post job-message and clear the text, and Shift + Enter sends nothing', async () => {
    const controls = fakeControls();
    controls.render(intakeViewOf(BOARD, 'J7'));
    const textBox = screen.getByLabelText('Message Product owner J7');
    fireEvent.change(textBox, { target: { value: 'Also a header row' } });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect((textBox as HTMLTextAreaElement).value).toBe(''));
    fireEvent.change(textBox, { target: { value: 'And dates in UTC' } });
    fireEvent.keyDown(textBox, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(textBox, { key: 'Enter' });
    await waitFor(() => expect(controls.sent).toHaveLength(2));
    expect(controls.sent).toEqual([
      {
        ...COMMAND_VERSION, kind: 'job-message', jobId: 'J7', text: 'Also a header row', pictures: [], incidentId: null
      },
      {
        ...COMMAND_VERSION, kind: 'job-message', jobId: 'J7', text: 'And dates in UTC', pictures: [], incidentId: null
      },
    ]);
  });

  test('Close intake posts intake-close and its caption names the drafts it offers to ready', async () => {
    const controls = fakeControls();
    controls.render(intakeViewOf(BOARD, 'J7'));
    const aside = screen.getByRole('complementary', { name: 'Drafts of J7' });
    const draft = within(aside).getByRole('link', { name: '#060 Export as CSV' });
    expect(draft.getAttribute('href')).toBe(boardHrefOf('kanban/ticket/060'));
    expect(within(aside).getByText('Close intake offers #060 and #063 to ready.')).toBeDefined();
    await clickSettled(within(aside).getByRole('button', { name: 'Close intake' }));
    expect(controls.sent).toEqual([{
      ...COMMAND_VERSION, kind: 'intake-close', jobId: 'J7', proposedDraftSets: []
    }]);
  });

  test('a closed session has no Close intake, says a message resumes it, and a message to it posts job-message', async () => {
    const controls = fakeControls();
    controls.render(intakeViewOf(BOARD, 'J2'));
    const pane = screen.getByRole('region', { name: 'Intake J2' });
    expect(within(pane).queryByRole('button', { name: 'Close intake' })).toBeNull();
    expect(within(pane).getByText('Closed: a message resumes it')).toBeDefined();
    expect(pane.querySelector('.board-refusal, .design-system-banner[data-tone="error"], [role="alert"]')).toBeNull();
    fireEvent.change(within(pane).getByLabelText('Message Product owner J2'), { target: { value: 'One more thing' } });
    await clickSettled(within(pane).getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{
      ...COMMAND_VERSION, kind: 'job-message', jobId: 'J2', text: 'One more thing', pictures: [], incidentId: null
    }]);
  });

  test('a stopped session stays on its route, read only: its outcome shown, no composer and no Close intake', () => {
    const stopped: BoardDocument = {
      ...BOARD,
      questionHistory: [
        ...BOARD.questionHistory,
        sessionRecord('job-launched', 'J5', { kind: 'product-owner', ticketIds: [], intakeText: 'Gift wrap' }),
        sessionRecord('job-ended', 'J5', { outcome: 'stopped' }),
      ],
    };
    fakeControls().render(intakeViewOf(stopped, 'J5'));
    const pane = screen.getByRole('region', { name: 'Intake J5' });
    expect(within(pane).getByText('Stopped: read only; a new chat starts a fresh session')).toBeDefined();
    expect(within(pane).getByRole('region', { name: 'Chat with J5' })).toBeDefined();
    expect([within(pane).queryByLabelText('Message Product owner J5'), within(pane).queryByRole('button', { name: 'Close intake' })]).toEqual([null, null]);
    const stoppedRow = sessionRows().find((row) => row.getAttribute('aria-label') === 'Intake J5');
    expect([stoppedRow?.textContent, stoppedRow?.getAttribute('aria-current')]).toEqual(['J5Gift wrapstopped', 'true']);
  });

  test('an open session ends its chat with the product owner\'s live turn, holding the one Flint slot; a closed one has none', () => {
    const view = fakeControls().render(intakeViewOf(BOARD, 'J6'));
    const chat = screen.getByRole('region', { name: 'Chat with J6' });
    const flint = within(chat).getByRole('img', { name: 'Flint, the product owner' });
    expect([flint.getAttribute('data-size'), flint.getAttribute('data-ground')]).toEqual(['100', 'page']);
    expect(flint.parentElement?.textContent).toContain('Product owner');
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
    view.unmount();
    fakeControls().render(intakeViewOf(BOARD, 'J2'));
    expect(document.querySelector('.design-system-flint-slot')).toBeNull();
  });

  test('each pane is headed in the page face: Intake with its count, and the session by its title and job', () => {
    fakeControls().render(intakeViewOf(BOARD, 'J6'));
    const intakeTitle = within(screen.getByRole('region', { name: 'Product-owner sessions' })).getByRole('heading', { level: 2, name: 'Intake' });
    expect(intakeTitle.getAttribute('data-type-role')).toBe('page');
    const sessionTitle = within(screen.getByRole('region', { name: 'Intake J6' })).getByRole('heading', { level: 2 });
    expect([sessionTitle.textContent, sessionTitle.nextElementSibling?.textContent]).toEqual(['Orders CSV dates in UTC', 'J6']);
  });
});

describe('the new chat', () => {
  test('New chat links to the new chat, which shows its row first and a composer whose Start session waits for text', () => {
    fakeControls().render(intakeViewOf(BOARD, 'new'));
    expect(screen.getByRole('link', { name: 'New chat' }).getAttribute('href')).toBe(boardHrefOf('intake/new'));
    const [newRow] = sessionRows();
    expect([newRow?.textContent, newRow?.getAttribute('aria-current')]).toEqual(['New chatits first message starts a session', 'true']);
    const pane = screen.getByRole('region', { name: 'New chat' });
    expect(within(pane).getByText('No message yet: sending starts the session')).toBeDefined();
    const start = within(pane).getByRole('button', { name: 'Start session' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(within(pane).getByLabelText('First message'), { target: { value: 'Shoppers lose their basket' } });
    expect(start.disabled).toBe(false);
  });

  test('Start session posts intake-start and, once applied, follows the new job', async () => {
    const controls = fakeControls();
    controls.answerNextWith({ verdict: 'applied', outcome: 'done', result: { startedJobId: 'J12', writtenVersionNumber: null } });
    const shown = shownUnderBoard(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="new" />);
    controls.render(shown.element);
    fireEvent.change(screen.getByLabelText('First message'), { target: { value: '  Shoppers lose their basket  ' } });
    await clickSettled(screen.getByRole('button', { name: 'Start session' }));
    expect(controls.sent).toEqual([{
      ...COMMAND_VERSION, kind: 'intake-start', text: 'Shoppers lose their basket', pictures: []
    }]);
    expect(shown.followed).toEqual([boardHrefOf('intake/J12')]);
  });

  test('the started job shows as starting until a board names it, not another session nor the new chat', async () => {
    const controls = fakeControls();
    controls.answerNextWith({ verdict: 'applied', outcome: 'done', result: { startedJobId: 'J12', writtenVersionNumber: null } });
    controls.render(<RoutedIntakeView board={BOARD} initialItem="new" />);
    fireEvent.change(screen.getByLabelText('First message'), { target: { value: 'Shoppers lose their basket' } });
    await clickSettled(screen.getByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(screen.getByText('Starting J12…')).toBeDefined());
    expect([screen.queryByRole('region', { name: 'New chat' }), screen.queryByRole('region', { name: 'Chat with J7' })]).toEqual([null, null]);
  });

  test('a started job that fails before any board lists it live stops starting and shows read only with its outcome', async () => {
    const controls = fakeControls();
    controls.answerNextWith({ verdict: 'applied', outcome: 'done', result: { startedJobId: 'J12', writtenVersionNumber: null } });
    let showBoard: ((board: BoardDocument) => void) | null = null;
    controls.render(<FedIntakeView initialBoard={BOARD} onFeed={(show) => { showBoard = show; }} />);
    fireEvent.change(screen.getByLabelText('First message'), { target: { value: 'Shoppers lose their basket' } });
    await clickSettled(screen.getByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(screen.getByText('Starting J12…')).toBeDefined());
    const failed: BoardDocument = {
      ...BOARD,
      questionHistory: [
        ...BOARD.questionHistory,
        sessionRecord('job-launched', 'J12', { kind: 'product-owner', ticketIds: [], intakeText: 'Shoppers lose their basket' }),
        sessionRecord('job-ended', 'J12', { outcome: 'failed' }),
      ],
    };
    act(() => showBoard?.(failed));
    expect(screen.queryByText('Starting J12…')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Intake J12' })).getByText('Failed: read only; a new chat starts a fresh session')).toBeDefined();
  });

  test('with no session at all the new chat opens', () => {
    const empty = intakeBoardOf({ jobs: [], questionHistory: [] });
    fakeControls().render(intakeViewOf(empty, null));
    expect(screen.getByRole('region', { name: 'New chat' })).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Product-owner sessions' })).getByText('0 sessions')).toBeDefined();
  });
});
