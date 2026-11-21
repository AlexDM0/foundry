/**
 * The Assistant view against fake controls and a fake transcript stream. What matters: the live session reads as a chat, planted markup in
 * the Assistant's prose and in User's bubble reaching the DOM only as text; the head names the session's turns and calls; a queued bubble
 * comes from the board's `job-messaged` records and the session's waiting count, so it outlasts a reload, and goes once the session took
 * the message; the composer says whether a message queues and sends `job-message` on Enter; no live session says a fresh one is booting,
 * its Send disabled; and the open and handled incidents sit in the Incidents rail, a delivery linking its Assistant job and an escalation
 * its decision, an applied default in the warning state with the forge's cause sentence, each step with its time. The view opens with its
 * title row, the chat head holds the one Flint slot (100, lane), and the count of the decisions the Assistant put to User links to
 * Questions, counting what the forge serves as escalated. The head's switch reads the state the board serves, a press sends
 * `pipeline-assistant-set` once and the switch waits for the forge's next board, never moving by itself; a refusal shows the forge's
 * sentence; and while the switch is off the tab says so and that each incident takes its default, a defaulted incident showing the reason
 * the forge serves.
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

import type { BoardQuestionHistoryEntryDocument }                    from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardTranscriptEntryDocument }                         from '../../../@types/board/ConversationDocument.ts';
import { boardHrefOf, boardRouteSurroundings }                       from '../../testing/BoardRouteSurroundings.tsx';
import { boardStateFixture, exampleAgentJob, exampleAskingDecision } from '../../testing/BoardStateFixture.ts';
import { clickSettled, fakeControls, fakeTranscripts }               from '../../testing/FakeControls.ts';
import type { AssistantBoard }                                       from './AssistantModel.ts';
import { AssistantView }                                             from './AssistantView.tsx';

const AT = '2026-10-29T20:00:00+01:00';
const PLANTED = '<script>window.planted = true</script><img src=x onerror="window.planted = true">';

function historyEntryOf(changes: Partial<BoardQuestionHistoryEntryDocument> & Pick<BoardQuestionHistoryEntryDocument, 'kind'>): BoardQuestionHistoryEntryDocument {
  return {
    at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: null, fields: {}, ...changes
  };
}

function transcriptEntryOf(cursor: string, role: string, text: string, changes: Partial<BoardTranscriptEntryDocument> = {}): BoardTranscriptEntryDocument {
  return {
    cursor,
    entryKey:        `${cursor}.0`,
    role,
    text,
    at:              null,
    toolName:        null,
    parentToolUseId: null,
    toolUseId:       null,
    asksUser:        false,
    model:           null,
    tokens:          null,
    clientAct:       null,
    sentBy:          null,
    chatSequence:    null,
    incidentIds:     [],
    pictures:        [],
    ...changes,
  };
}

const ASSISTANT_JOB = exampleAgentJob({
  id: 'J9', kind: 'assistant', role: 'assistant', ticketIds: []
});

const MID_TURN_ASSISTANT_JOB = {
  ...ASSISTANT_JOB,
  live: {
    ...ASSISTANT_JOB.live, calls: 13, turn: 'mid-turn', messagesWaiting: 0
  }
} as const;

const BOARD: AssistantBoard = boardStateFixture({
  assistantIsOn: true,
  jobs:          [MID_TURN_ASSISTANT_JOB],
  decisions:     [],
  incidents:     [{
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
    historyEntryOf({ kind: 'incident-opened', incidentId: 'I1', fields: { kind: 'gate-cannot-run', ticketIds: ['040'] } }),
    historyEntryOf({ kind: 'incident-opened', incidentId: 'I2', fields: { kind: 'system-question', ticketIds: ['041'] } }),
    historyEntryOf({ kind: 'incident-handled', incidentId: 'I1', fields: { move: 'gate-retry' } }),
    historyEntryOf({ kind: 'incident-escalated', incidentId: 'I2', fields: { decisionId: 'E5' } }),
    historyEntryOf({ kind: 'incident-opened', incidentId: 'I6', fields: { kind: 'quiet-job', ticketIds: ['043'] } }),
    historyEntryOf({ kind: 'incident-defaulted', incidentId: 'I6', fields: { move: 'open-quiet-job-decision', cause: 'turn-closed' } }),
  ],
  notices: [{
    kind: 'incident-defaulted', facts: { incidentId: 'I6' }, text: 'Example notice: I6 took its default', causeText: 'its delivery turn closed'
  }],
  escalatedDecisionIds: [],
});

afterEach(() => {
  cleanup();
});

/** Renders the view over a board the spec can replace, as the shell does when a new state arrives. */
function renderedWithBoard(board: AssistantBoard) {
  const controls = fakeControls();
  const transcripts = fakeTranscripts();
  const surroundings = boardRouteSurroundings();
  let replaceBoard: (next: AssistantBoard) => void = () => undefined;

  function Shell() {
    const [shown, setShown] = useState(board);
    replaceBoard = setShown;
    return <AssistantView board={shown} followTranscript={transcripts.follow} />;
  }
  controls.render(surroundings.wrap(<Shell />));
  return { controls, transcripts, replaceBoard: (next: AssistantBoard) => act(() => replaceBoard(next)) };
}

function thread(): HTMLElement {
  return screen.getByRole('list', { name: 'Assistant conversation' });
}

describe('the Assistant view', () => {
  test('follows the live session as a chat, planted markup in prose and in User\'s bubble reaching the DOM only as text', () => {
    const { transcripts } = renderedWithBoard(BOARD);
    expect(transcripts.followedJobs()).toEqual(['J9']);
    transcripts.feed('J9', [
      transcriptEntryOf('1.1', 'hephaestus', 'You are the Assistant.', { clientAct: 'chat', sentBy: 'hephaestus', chatSequence: 1 }),
      transcriptEntryOf('1.2', 'assistant', `Reading the incidents ${PLANTED}`),
      transcriptEntryOf('1.3', 'turn-end', ''),
      transcriptEntryOf('1.4', 'user', `Why? ${PLANTED}`, { clientAct: 'chat', sentBy: 'user' }),
    ]);
    expect(within(thread()).getByText('Hephaestus booted J9 with its prompt · chat 1')).toBeDefined();
    expect(within(thread()).getByText(`Reading the incidents ${PLANTED}`).className).toBe('board-chat-prose');
    expect(within(thread()).getByText(`Why? ${PLANTED}`).className).toBe('board-chat-bubble');
    expect(document.querySelector('img, script')).toBeNull();
  });

  test('the head names the session\'s state, turns and calls, and no call budget', () => {
    const { transcripts } = renderedWithBoard(BOARD);
    transcripts.feed('J9', [transcriptEntryOf('1.1', 'assistant', 'Looking.')]);
    expect(screen.getByText('running · 1 turn · 13 calls')).toBeDefined();
  });

  test('a queued bubble comes from the board\'s waiting message and goes once the session took it', () => {
    const waiting: AssistantBoard = {
      ...BOARD,
      jobs:            [{ ...MID_TURN_ASSISTANT_JOB, live: { ...MID_TURN_ASSISTANT_JOB.live, messagesWaiting: 1 } }],
      questionHistory: [...BOARD.questionHistory, historyEntryOf({ kind: 'job-messaged', jobId: 'J9', fields: { text: 'Hold #008 until #007 lands.' } })],
    };
    const { transcripts, replaceBoard } = renderedWithBoard(waiting);
    const bubble = within(thread()).getByText('Hold #008 until #007 lands.');
    expect(bubble.hasAttribute('data-queued')).toBe(true);
    expect(within(thread()).getByText('Queued until the Assistant is idle')).toBeDefined();
    transcripts.feed('J9', [transcriptEntryOf('1.5', 'user', 'Hold #008 until #007 lands.', { clientAct: 'chat', sentBy: 'user' })]);
    replaceBoard({ ...waiting, jobs: [MID_TURN_ASSISTANT_JOB] });
    expect(within(thread()).getByText('Hold #008 until #007 lands.').hasAttribute('data-queued')).toBe(false);
    expect(within(thread()).queryByText('Queued until the Assistant is idle')).toBeNull();
  });

  test('the composer says a message queues while the session is mid-turn, and Enter sends job-message', async () => {
    const { controls } = renderedWithBoard(BOARD);
    expect(screen.getByText('Busy: the next message queues')).toBeDefined();
    const textBox = screen.getByLabelText<HTMLTextAreaElement>('Message Assistant J9');
    fireEvent.change(textBox, { target: { value: 'Look at 042 first' } });
    fireEvent.keyDown(textBox, { key: 'Enter' });
    await waitFor(() => expect(controls.sent).toEqual([{
      boardCommandVersion: 1, kind: 'job-message', jobId: 'J9', text: 'Look at 042 first', pictures: [], incidentId: null
    }]));
    await waitFor(() => expect(textBox.value).toBe(''));
  });

  test('Send posts the same job-message', async () => {
    const { controls } = renderedWithBoard(BOARD);
    fireEvent.change(screen.getByLabelText('Message Assistant J9'), { target: { value: 'Then 043' } });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{
      boardCommandVersion: 1, kind: 'job-message', jobId: 'J9', text: 'Then 043', pictures: [], incidentId: null
    }]);
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
    expect(open.querySelector('.design-system-state-badge')?.textContent).toBe('delivered');
    expect(within(open).getByRole('link', { name: '#042' }).getAttribute('href')).toBe(boardHrefOf('tickets/ticket-row/042'));
    expect(within(open).getByText('default worktree-repair')).toBeDefined();
    expect(within(open).getByText('opened: setup-failed on #042 (step install)')).toBeDefined();
    expect(within(open).getByRole('link', { name: 'J9' }).getAttribute('href')).toBe(boardHrefOf('agents/J9'));
    expect(within(within(rail).getByRole('listitem', { name: 'Incident I1' })).getByText('handled with gate-retry')).toBeDefined();
    const escalated = within(rail).getByRole('listitem', { name: 'Incident I2' });
    expect(within(escalated).getByRole('link', { name: 'E5' }).getAttribute('href')).toBe(boardHrefOf('questions'));
    expect(within(escalated).getByRole('link', { name: 'E5' }).parentElement?.textContent).toBe('escalated to User as E5');
    const defaulted = within(rail).getByRole('listitem', { name: 'Incident I6' });
    expect(defaulted.dataset['state']).toBe('warning');
    expect(defaulted.querySelector('.design-system-state-badge')?.getAttribute('data-state-tone')).toBe('accent-outline');
    expect(within(defaulted).getByText('default applied: open-quiet-job-decision, as its delivery turn closed')).toBeDefined();
  });
});

describe('the title row and the chat head', () => {
  test('the view opens with its title, and the chat head holds the one Flint slot and no asks while none waits', () => {
    renderedWithBoard(BOARD);
    expect(screen.getByRole('heading', { level: 2, name: 'Assistant' }).dataset['typeRole']).toBe('display');
    expect(screen.getByText('Hephaestus\'s Assistant. Talk to it here; its incidents are on the right.')).toBeDefined();
    const flint = screen.getByRole('img', { name: 'Flint, the Assistant' });
    expect([flint.dataset['size'], flint.dataset['ground']]).toEqual(['100', 'lane']);
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
    expect(screen.queryByText(/waits? on User/)).toBeNull();
  });

  test('a decision the forge serves as escalated waits on User: the head links the count to Questions', () => {
    renderedWithBoard({
      ...BOARD,
      decisions: [exampleAskingDecision({
        id: 'E5', jobId: null, kind: 'system-question', askedBy: 'assistant'
      })],
      escalatedDecisionIds: ['E5'],
    });
    expect(screen.getByRole('link', { name: '1 decision waits on User' }).getAttribute('href')).toBe(boardHrefOf('questions'));
  });

  test('each incident step shows its time beside its words', () => {
    renderedWithBoard(BOARD);
    const open = within(screen.getByRole('complementary', { name: 'Incidents' })).getByRole('listitem', { name: 'Incident I3' });
    const step = within(open).getByText('opened: setup-failed on #042 (step install)').closest('.board-incident-step');
    expect(step?.querySelector('time')?.getAttribute('title')).toMatch(/^2026-10-29 /);
  });
});

const SWITCHED_OFF_BOARD: AssistantBoard = {
  ...BOARD,
  assistantIsOn:   false,
  jobs:            [],
  incidents:       [],
  questionHistory: [
    historyEntryOf({ kind: 'incident-opened', incidentId: 'I7', fields: { kind: 'gate-cannot-run', ticketIds: ['044'] } }),
    historyEntryOf({ kind: 'incident-defaulted', incidentId: 'I7', fields: { move: 'gate-retry', cause: 'assistant-off' } }),
  ],
  notices: [{
    kind: 'incident-defaulted', facts: { incidentId: 'I7' }, text: 'Example notice: I7 took its default', causeText: 'Example: the Assistant is off'
  }],
};

const REFUSAL_SENTENCE = 'Example: no gate pipeline is stored, so the Assistant was not switched.';

function assistantSwitch(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('switch', { name });
}

describe('the Assistant\'s switch', () => {
  test('reads the served state: on, and off', () => {
    const { replaceBoard } = renderedWithBoard(BOARD);
    expect(assistantSwitch('Assistant on').getAttribute('aria-checked')).toBe('true');
    replaceBoard(SWITCHED_OFF_BOARD);
    expect(assistantSwitch('Assistant off').getAttribute('aria-checked')).toBe('false');
  });

  test('a press sends pipeline-assistant-set once, and the switch waits for the forge\'s board instead of moving by itself', async () => {
    const { controls, replaceBoard } = renderedWithBoard(SWITCHED_OFF_BOARD);
    controls.holdCommands();
    fireEvent.click(assistantSwitch('Assistant off'));
    fireEvent.click(assistantSwitch('Assistant off'));
    expect(controls.sent).toEqual([{ boardCommandVersion: 1, kind: 'pipeline-assistant-set', on: true }]);
    expect(assistantSwitch('Assistant off').disabled).toBe(true);
    await controls.releaseCommands();
    expect(assistantSwitch('Assistant off').getAttribute('aria-checked')).toBe('false');
    expect(assistantSwitch('Assistant off').disabled).toBe(false);
    replaceBoard({ ...SWITCHED_OFF_BOARD, assistantIsOn: true });
    expect(assistantSwitch('Assistant on').getAttribute('aria-checked')).toBe('true');
  });

  test('a press while on sends the switch off', async () => {
    const { controls } = renderedWithBoard(BOARD);
    await clickSettled(assistantSwitch('Assistant on'));
    expect(controls.sent).toEqual([{ boardCommandVersion: 1, kind: 'pipeline-assistant-set', on: false }]);
  });

  test('a refusal shows the forge\'s sentence, and the switch stays as served', async () => {
    const { controls } = renderedWithBoard(SWITCHED_OFF_BOARD);
    controls.answerNextWith({ verdict: 'refused', refusal: REFUSAL_SENTENCE });
    await clickSettled(assistantSwitch('Assistant off'));
    expect(screen.getByRole('status').textContent).toBe(REFUSAL_SENTENCE);
    expect(assistantSwitch('Assistant off').getAttribute('aria-checked')).toBe('false');
  });
});

describe('while the switch is off', () => {
  test('the tab says the Assistant is off and that each incident takes its default, and no session is said to boot', () => {
    renderedWithBoard(SWITCHED_OFF_BOARD);
    expect(screen.getByText('The Assistant is off: each incident takes its default.')).toBeDefined();
    expect(within(thread()).getByText('No session while the Assistant is off.')).toBeDefined();
    expect(screen.getByText('No session: the Assistant is off')).toBeDefined();
    expect(screen.queryByText('Booting a fresh session.')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
  });

  test('a defaulted incident shows the reason the forge serves', () => {
    renderedWithBoard(SWITCHED_OFF_BOARD);
    const defaulted = within(screen.getByRole('complementary', { name: 'Incidents' })).getByRole('listitem', { name: 'Incident I7' });
    expect(defaulted.dataset['state']).toBe('warning');
    expect(within(defaulted).getByText('default applied: gate-retry, as Example: the Assistant is off')).toBeDefined();
  });

  test('says nothing of it while the switch is on', () => {
    renderedWithBoard(BOARD);
    expect(screen.queryByText('The Assistant is off: each incident takes its default.')).toBeNull();
  });
});
