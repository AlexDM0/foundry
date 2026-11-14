/**
 * The Intake view against fake controls and a fake transcript stream. What matters: the list shows every session with its title, state,
 * asks and drafts, the ones that wait on User first; the route selects one session, whose transcript is the only one followed, so moving
 * to another closes the first stream; the chat shows User's request as a bubble, the agent's turns with their tool folds and the open
 * decision as a turn whose Answer posts `decision-answer`; the composer posts `job-message`, on Enter too, and clears; Close intake posts
 * `intake-close` and names the drafts it offers; an open session's chat ends with the product owner's live turn, holding the one Flint
 * slot; each pane is headed in the page face; a closed session has no Close intake, says a message resumes it and takes a message; the
 * new chat opens on `#intake/new` and when there is no session, starts the session with `intake-start` and then follows the new job,
 * shown as starting until a board names it.
 */
import {
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
import { useEffect, useState } from 'react';

import type { ConversationBoardDocument }              from '../../@types/ConversationDocuments.ts';
import { clickSettled, fakeControls, fakeTranscripts } from '../../testing/FakeControls.ts';
import { IntakeView }                                  from './IntakeView.tsx';

const AT = '2026-10-29T20:00:00+01:00';

/** The view under the route the hash names, as the shell gives it. */
function RoutedIntakeView({ board }: { readonly board: ConversationBoardDocument }) {
  const itemOfHash = (): string | null => window.location.hash.split('/')[1] ?? null;
  const [selectedItem, setSelectedItem] = useState(itemOfHash);
  useEffect(() => {
    const follow = (): void => setSelectedItem(itemOfHash());
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  return <IntakeView board={board} followTranscript={fakeTranscripts().follow} selectedItem={selectedItem} />;
}

const BOARD: ConversationBoardDocument = {
  jobs: [
    {
      id:        'J6',
      kind:      'product-owner',
      ticketIds: [],
      state:     'running',
      intake:    { text: 'Orders CSV dates in UTC' },
      live:      {
        calls: 3, turn: 'mid-turn', messagesWaiting: 0, lastLine: { role: 'assistant', text: 'Read src/admin/RefundsCsv.ts', at: null }
      }
    },
    {
      id:        'J7',
      kind:      'product-owner',
      ticketIds: [],
      state:     'waiting-for-answer',
      intake:    { text: 'Add an export', title: 'Orders export' },
      live:      {
        calls: 7, turn: 'mid-turn', messagesWaiting: 0, lastLine: null
      }
    },
  ],
  decisions: [{
    id:        'E4',
    kind:      'agent-question',
    ticketIds: [],
    jobId:     'J7',
    askedBy:   'product-owner',
    context:   '',
    openedAt:  AT,
    questions: [{
      question: 'CSV or JSON?', header: 'Format', multiSelect: false, options: [{ label: 'CSV', description: '' }, { label: 'JSON', description: '' }]
    }],
  }],
  incidents: [],
  page:      {
    tickets: [
      {
        id: '060', title: 'Export as CSV', status: 'draft', filedByJob: 'J7'
      },
      {
        id: '063', title: 'Export as JSON', status: 'draft', filedByJob: 'J7'
      },
      {
        id: '061', title: 'Older request', status: 'pending', filedByJob: 'J2'
      },
    ]
  },
  questionHistory: [
    {
      kind: 'job-launched', at: AT, jobId: 'J2', fields: { kind: 'product-owner', ticketIds: [], intakeText: 'Reorder button' }
    },
    {
      kind: 'job-ended', at: AT, jobId: 'J2', fields: { outcome: 'closed' }
    },
    {
      kind: 'job-launched', at: AT, jobId: 'J6', fields: { kind: 'product-owner', ticketIds: [] }
    },
    {
      kind: 'job-launched', at: AT, jobId: 'J7', fields: { kind: 'product-owner', ticketIds: [] }
    },
  ],
};

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function sessionRows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Sessions' })).getAllByRole('link');
}

describe('the session list', () => {
  test('shows every session with its title, state, asks and drafts, the one that waits on User first', () => {
    fakeControls().render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem={null} />);
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
    const view = fakeControls().render(<IntakeView board={BOARD} followTranscript={transcripts.follow} selectedItem="J6" />);
    expect(sessionRows().map((row) => row.getAttribute('href'))).toEqual(['#intake/J7', '#intake/J6', '#intake/J2']);
    expect(sessionRows().map((row) => row.getAttribute('aria-current'))).toEqual([null, 'true', null]);
    expect(screen.getByRole('region', { name: 'Intake J6' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Intake J7' })).toBeNull();
    expect(transcripts.followedJobs()).toEqual(['J6']);
    view.rerender(<IntakeView board={BOARD} followTranscript={transcripts.follow} selectedItem="J2" />);
    expect(transcripts.followedJobs()).toEqual(['J2']);
  });
});

describe('the selected chat', () => {
  test('shows User\'s request, the agent\'s turns with their tool folds and the open decision, whose Answer posts decision-answer', async () => {
    const controls = fakeControls();
    const transcripts = fakeTranscripts();
    controls.render(<IntakeView board={BOARD} followTranscript={transcripts.follow} selectedItem="J7" />);
    transcripts.feed('J7', [
      {
        cursor: '1.1', entryKey: '1.1.0', at: null, role: 'overseer', text: 'You are the product owner.', sentBy: 'overseer', clientAct: 'chat'
      },
      {
        cursor: '1.2', entryKey: '1.2.0', at: null, role: 'tool-call', text: 'src/export.ts', toolName: 'Read', toolUseId: 't1'
      },
      {
        cursor: '1.3', entryKey: '1.3.0', at: null, role: 'tool-result', text: '', toolUseId: 't1'
      },
      {
        cursor: '1.4', entryKey: '1.4.0', at: null, role: 'assistant', text: 'Which format do you need?'
      },
      {
        cursor: '1.5', entryKey: '1.5.0', at: null, role: 'turn-end', text: ''
      },
    ]);
    const thread = screen.getByRole('list', { name: 'Conversation of J7' });
    expect(within(thread).getByText('Overseer started J7 from User\'s first message · product-owner')).toBeDefined();
    expect(within(thread).getByText('Add an export').className).toBe('bridge-chat-bubble');
    expect(within(thread).getByText('Used 1 tool')).toBeDefined();
    expect(within(thread).getByText('Which format do you need?')).toBeDefined();
    const question = within(thread).getByRole('region', { name: 'Question E4' });
    expect(question.dataset['placement']).toBe('docked');
    fireEvent.click(within(question).getByLabelText('a. CSV'));
    await clickSettled(within(question).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{ kind: 'decision-answer', decisionId: 'E4', answer: { form: 'letters', choices: ['a'] } }]);
  });

  test('the head names the job, its turns and calls, and the composer says the session waits on User', () => {
    fakeControls().render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    const pane = screen.getByRole('region', { name: 'Intake J7' });
    expect(pane.querySelector('.bridge-intake-meta')?.textContent).toBe('product-owner · J7 · 0 turns · 7 calls');
    expect(within(pane).getByText('Waiting on User: the next message queues')).toBeDefined();
  });

  test('Send and Enter post job-message and clear the text, and Shift + Enter sends nothing', async () => {
    const controls = fakeControls();
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    const textBox = screen.getByLabelText('Message Product owner J7');
    fireEvent.change(textBox, { target: { value: 'Also a header row' } });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect((textBox as HTMLTextAreaElement).value).toBe(''));
    fireEvent.change(textBox, { target: { value: 'And dates in UTC' } });
    fireEvent.keyDown(textBox, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(textBox, { key: 'Enter' });
    await waitFor(() => expect(controls.sent).toHaveLength(2));
    expect(controls.sent).toEqual([
      { kind: 'job-message', jobId: 'J7', text: 'Also a header row' },
      { kind: 'job-message', jobId: 'J7', text: 'And dates in UTC' },
    ]);
  });

  test('Close intake posts intake-close and its caption names the drafts it offers to ready', async () => {
    const controls = fakeControls();
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    const aside = screen.getByRole('complementary', { name: 'Drafts of J7' });
    const draft = within(aside).getByRole('link', { name: '#060 Export as CSV' });
    expect(draft.getAttribute('href')).toBe('#kanban/ticket/060');
    expect(within(aside).getByText('Close intake offers #060 and #063 to ready.')).toBeDefined();
    await clickSettled(within(aside).getByRole('button', { name: 'Close intake' }));
    expect(controls.sent).toEqual([{ kind: 'intake-close', jobId: 'J7', proposedDraftSets: [] }]);
  });

  test('a closed session has no Close intake, says a message resumes it, and a message to it posts job-message', async () => {
    const controls = fakeControls();
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J2" />);
    const pane = screen.getByRole('region', { name: 'Intake J2' });
    expect(within(pane).queryByRole('button', { name: 'Close intake' })).toBeNull();
    expect(within(pane).getByText('Closed: a message resumes it')).toBeDefined();
    expect(pane.querySelector('.bridge-refusal, .design-system-banner[data-tone="error"], [role="alert"]')).toBeNull();
    fireEvent.change(within(pane).getByLabelText('Message Product owner J2'), { target: { value: 'One more thing' } });
    await clickSettled(within(pane).getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{ kind: 'job-message', jobId: 'J2', text: 'One more thing' }]);
  });

  test('an open session ends its chat with the product owner\'s live turn, holding the one Flint slot; a closed one has none', () => {
    const view = fakeControls().render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J6" />);
    const chat = screen.getByRole('region', { name: 'Chat with J6' });
    const flint = within(chat).getByRole('img', { name: 'Flint, the product owner' });
    expect([flint.getAttribute('data-size'), flint.getAttribute('data-ground'), flint.getAttribute('data-flint-pose')]).toEqual(['100', 'page', 'typing']);
    expect(flint.parentElement?.textContent).toContain('Product owner');
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
    view.unmount();
    fakeControls().render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J2" />);
    expect(document.querySelector('.design-system-flint-slot')).toBeNull();
  });

  test('each pane is headed in the page face: Intake with its count, and the session by its title and job', () => {
    fakeControls().render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J6" />);
    const intakeTitle = within(screen.getByRole('region', { name: 'Product-owner sessions' })).getByRole('heading', { level: 2, name: 'Intake' });
    expect(intakeTitle.getAttribute('data-type-role')).toBe('page');
    const sessionTitle = within(screen.getByRole('region', { name: 'Intake J6' })).getByRole('heading', { level: 2 });
    expect([sessionTitle.textContent, sessionTitle.nextElementSibling?.textContent]).toEqual(['Orders CSV dates in UTC', 'J6']);
  });
});

describe('the new chat', () => {
  test('New chat links to the new chat, which shows its row first and a composer whose Start session waits for text', () => {
    fakeControls().render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="new" />);
    expect(screen.getByRole('link', { name: 'New chat' }).getAttribute('href')).toBe('#intake/new');
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
    controls.answerNextWith({ verdict: 'applied', outcome: 'done', result: { job: { id: 'J12' }, logged: [] } });
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="new" />);
    fireEvent.change(screen.getByLabelText('First message'), { target: { value: '  Shoppers lose their basket  ' } });
    await clickSettled(screen.getByRole('button', { name: 'Start session' }));
    expect(controls.sent).toEqual([{ kind: 'intake-start', text: 'Shoppers lose their basket' }]);
    expect(window.location.hash).toBe('#intake/J12');
  });

  test('the started job shows as starting until a board names it, not another session nor the new chat', async () => {
    window.location.hash = '#intake/new';
    const controls = fakeControls();
    controls.answerNextWith({ verdict: 'applied', outcome: 'done', result: { job: { id: 'J12' }, logged: [] } });
    controls.render(<RoutedIntakeView board={BOARD} />);
    fireEvent.change(screen.getByLabelText('First message'), { target: { value: 'Shoppers lose their basket' } });
    await clickSettled(screen.getByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(screen.getByText('Starting J12…')).toBeDefined());
    expect([screen.queryByRole('region', { name: 'New chat' }), screen.queryByRole('region', { name: 'Chat with J7' })]).toEqual([null, null]);
  });

  test('with no session at all the new chat opens', () => {
    const empty: ConversationBoardDocument = {
      jobs: [], decisions: [], incidents: [], questionHistory: []
    };
    fakeControls().render(<IntakeView board={empty} followTranscript={fakeTranscripts().follow} selectedItem={null} />);
    expect(screen.getByRole('region', { name: 'New chat' })).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Product-owner sessions' })).getByText('0 sessions')).toBeDefined();
  });
});
