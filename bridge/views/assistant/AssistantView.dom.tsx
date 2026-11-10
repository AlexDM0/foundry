/**
 * The Assistant view against fake controls and a fake transcript stream. What matters: the live session reads as a chat, planted markup in
 * the Assistant's prose and in User's bubble reaching the DOM only as text; the head names the session's turns and calls; a queued bubble
 * comes from the board's `job-messaged` records and the session's waiting count, so it outlasts a reload, and goes once the session took
 * the message; the composer says whether a message queues and sends `job-message` on Enter; no live session says a fresh one is booting,
 * its Send disabled; and the open and handled incidents sit in the Incidents rail, a delivery linking its Assistant job and an escalation
 * its decision, an applied default in the warning state.
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
import { useState } from 'react';

import type { ConversationBoardDocument, SessionJobDocument } from '../../@types/ConversationDocuments.ts';
import { clickSettled, fakeControls, fakeTranscripts }        from '../../testing/FakeControls.ts';
import { AssistantView }                                      from './AssistantView.tsx';

const AT = '2026-10-29T20:00:00+01:00';
const PLANTED = '<script>window.planted = true</script><img src=x onerror="window.planted = true">';

const ASSISTANT_JOB: SessionJobDocument = {
  id: 'J9', kind: 'assistant', ticketIds: [], state: 'running', live: { calls: 13, turn: 'mid-turn', messagesWaiting: 0 }
};

const BOARD: ConversationBoardDocument = {
  jobs:      [ASSISTANT_JOB],
  decisions: [],
  incidents: [{
    id:              'I3',
    kind:            'setup-failed',
    ticketIds:       ['042'],
    jobId:           'J4',
    facts:           { step: 'install' },
    defaultMove:     'worktree-repair',
    deliveredInTurn: { jobId: 'J9', chatSequence: 2 },
    openedAt:        AT
  }],
  questionHistory: [
    {
      kind: 'incident-opened', at: AT, incidentId: 'I1', fields: { kind: 'gate-cannot-run', ticketIds: ['040'] }
    },
    {
      kind: 'incident-opened', at: AT, incidentId: 'I2', fields: { kind: 'system-question', ticketIds: ['041'] }
    },
    {
      kind: 'incident-handled', at: AT, incidentId: 'I1', fields: { move: 'gate-retry' }
    },
    {
      kind: 'incident-escalated', at: AT, incidentId: 'I2', fields: { decisionId: 'E5' }
    },
    {
      kind: 'incident-opened', at: AT, incidentId: 'I6', fields: { kind: 'quiet-job', ticketIds: ['043'] }
    },
    {
      kind: 'incident-defaulted', at: AT, incidentId: 'I6', fields: { move: 'open-quiet-job-decision', cause: 'turn-closed' }
    },
  ],
};

afterEach(() => {
  cleanup();
});

/** Renders the view over a board the spec can replace, as the shell does when a new state arrives. */
function renderedWithBoard(board: ConversationBoardDocument) {
  const controls = fakeControls();
  const transcripts = fakeTranscripts();
  let replaceBoard: (next: ConversationBoardDocument) => void = () => undefined;

  function Shell() {
    const [shown, setShown] = useState(board);
    replaceBoard = setShown;
    return <AssistantView board={shown} followTranscript={transcripts.follow} />;
  }
  controls.render(<Shell />);
  return { controls, transcripts, replaceBoard: (next: ConversationBoardDocument) => act(() => replaceBoard(next)) };
}

function thread(): HTMLElement {
  return screen.getByRole('list', { name: 'Assistant conversation' });
}

describe('the Assistant view', () => {
  test('follows the live session as a chat, planted markup in prose and in User\'s bubble reaching the DOM only as text', () => {
    const { transcripts } = renderedWithBoard(BOARD);
    expect(transcripts.followedJobs()).toEqual(['J9']);
    transcripts.feed('J9', [
      {
        cursor: '1.1', entryKey: '1.1.0', at: null, role: 'overseer', clientAct: 'chat', sentBy: 'overseer', chatSequence: 1, text: 'You are the Assistant.'
      },
      {
        cursor: '1.2', entryKey: '1.2.0', at: null, role: 'assistant', text: `Reading the incidents ${PLANTED}`
      },
      {
        cursor: '1.3', entryKey: '1.3.0', at: null, role: 'turn-end', text: ''
      },
      {
        cursor: '1.4', entryKey: '1.4.0', at: null, role: 'user', clientAct: 'chat', sentBy: 'user', text: `Why? ${PLANTED}`
      },
    ]);
    expect(within(thread()).getByText('Overseer booted J9 with its prompt · chat 1')).toBeDefined();
    expect(within(thread()).getByText(`Reading the incidents ${PLANTED}`).className).toBe('bridge-chat-prose');
    expect(within(thread()).getByText(`Why? ${PLANTED}`).className).toBe('bridge-chat-bubble');
    expect(document.querySelector('img, script')).toBeNull();
  });

  test('the head names the session\'s state, turns and calls, and no call budget', () => {
    const { transcripts } = renderedWithBoard(BOARD);
    transcripts.feed('J9', [{
      cursor: '1.1', entryKey: '1.1.0', at: null, role: 'assistant', text: 'Looking.'
    }]);
    expect(screen.getByText('running · 1 turn · 13 calls')).toBeDefined();
  });

  test('a queued bubble comes from the board\'s waiting message and goes once the session took it', () => {
    const waiting: ConversationBoardDocument = {
      ...BOARD,
      jobs:            [{ ...ASSISTANT_JOB, live: { calls: 13, turn: 'mid-turn', messagesWaiting: 1 } }],
      questionHistory: [...BOARD.questionHistory ?? [], {
        kind: 'job-messaged', at: AT, jobId: 'J9', fields: { text: 'Hold #008 until #007 lands.' }
      }],
    };
    const { transcripts, replaceBoard } = renderedWithBoard(waiting);
    const bubble = within(thread()).getByText('Hold #008 until #007 lands.');
    expect(bubble.hasAttribute('data-queued')).toBe(true);
    expect(within(thread()).getByText('Queued until the Assistant is idle')).toBeDefined();
    transcripts.feed('J9', [{
      cursor: '1.5', entryKey: '1.5.0', at: null, role: 'user', clientAct: 'chat', sentBy: 'user', text: 'Hold #008 until #007 lands.'
    }]);
    replaceBoard({ ...waiting, jobs: [ASSISTANT_JOB] });
    expect(within(thread()).getByText('Hold #008 until #007 lands.').hasAttribute('data-queued')).toBe(false);
    expect(within(thread()).queryByText('Queued until the Assistant is idle')).toBeNull();
  });

  test('the composer says a message queues while the session is mid-turn, and Enter sends job-message', async () => {
    const { controls } = renderedWithBoard(BOARD);
    expect(screen.getByText('Busy: the next message queues')).toBeDefined();
    const textBox = screen.getByLabelText<HTMLTextAreaElement>('Message Assistant J9');
    fireEvent.change(textBox, { target: { value: 'Look at 042 first' } });
    fireEvent.keyDown(textBox, { key: 'Enter' });
    await waitFor(() => expect(controls.sent).toEqual([{ kind: 'job-message', jobId: 'J9', text: 'Look at 042 first' }]));
    await waitFor(() => expect(textBox.value).toBe(''));
  });

  test('Send posts the same job-message', async () => {
    const { controls } = renderedWithBoard(BOARD);
    fireEvent.change(screen.getByLabelText('Message Assistant J9'), { target: { value: 'Then 043' } });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{ kind: 'job-message', jobId: 'J9', text: 'Then 043' }]);
  });

  test('says a fresh session is booting while none is up, its Send disabled', () => {
    renderedWithBoard({ ...BOARD, jobs: [] });
    expect(within(thread()).getByText('Booting a fresh session.')).toBeDefined();
    expect(screen.getByText('No session: a fresh one is booting')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Message the Assistant'), { target: { value: 'Hello' } });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
  });

  test('shows open and handled incidents in the Incidents rail, a delivery and an escalation linked, an applied default in the warning state', () => {
    renderedWithBoard(BOARD);
    const rail = screen.getByRole('complementary', { name: 'Incidents' });
    const open = within(rail).getByRole('listitem', { name: 'Incident I3' });
    expect(within(open).getByText('setup-failed')).toBeDefined();
    expect(open.querySelector('.bridge-state-badge')?.textContent).toBe('delivered');
    expect(within(open).getByRole('link', { name: '#042' }).getAttribute('href')).toBe('#tickets/ticket-row/042');
    expect(within(open).getByText('default worktree-repair')).toBeDefined();
    expect(within(open).getByText('opened: setup-failed on #042 (step install)')).toBeDefined();
    expect(within(open).getByRole('link', { name: 'J9' }).getAttribute('href')).toBe('#agents/J9');
    expect(within(within(rail).getByRole('listitem', { name: 'Incident I1' })).getByText('handled with gate-retry')).toBeDefined();
    const escalated = within(rail).getByRole('listitem', { name: 'Incident I2' });
    expect(within(escalated).getByRole('link', { name: 'E5' }).getAttribute('href')).toBe('#questions');
    expect(within(escalated).getByRole('link', { name: 'E5' }).parentElement?.textContent).toBe('escalated to User as E5');
    const defaulted = within(rail).getByRole('listitem', { name: 'Incident I6' });
    expect(defaulted.dataset['state']).toBe('warning');
    expect(defaulted.querySelector('.bridge-state-badge')?.getAttribute('data-state')).toBe('draft');
    expect(within(defaulted).getByText('default applied: open-quiet-job-decision, as its delivery turn closed')).toBeDefined();
  });
});
