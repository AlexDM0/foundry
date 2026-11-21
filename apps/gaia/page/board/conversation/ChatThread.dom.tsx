/**
 * The chat card and thread, in a happy-dom document. What matters: each turn kind renders its own part, in the order given, since the
 * thread is a conversation read top down; a system line reveals the text it stands for only on User's ask, and hides it again; an agent
 * turn leads with its speaker in its state's colour, then its stamp or, while it works, its working words, then its tool fold and prose;
 * User's message is a bubble under its stamp line, dashed with its tag while it waits in a queue; the caller places each decision; the
 * card is a named section; and agent prose, User's text and a revealed prompt are text, never markup.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ChatCard, ChatThread, type ChatTurn } from './ChatThread.tsx';

afterEach(() => {
  cleanup();
});

const BOOT_LINE: ChatTurn = {
  kind: 'system', key: 'boot', text: 'Overseer booted J1 with its prompt · chat 1', stamp: { shortText: '14:02:08' }, revealText: 'You are the Assistant of Example Storefront.',
};

const CLOSED_AGENT_TURN: ChatTurn = {
  kind:        'agent',
  key:         'turn-1',
  speaker:     'Assistant',
  state:       'reviewed',
  stamp:       { shortText: '14:05:31', fullText: '2026-11-09 14:05:31' },
  workingText: null,
  toolUse:     {
    summaryText: 'Used 1 tool', namesText: 'Bash', errorText: null, calls: [], openAtFirst: false,
  },
  prose: 'J4 is not hung.\nIt runs the snapshot suite.',
};

const USER_TURN: ChatTurn = {
  kind: 'user', key: 'user-1', speaker: 'User', stamp: { shortText: '14:06:40' }, stampSuffix: null, text: 'Why did #001 restart twice?', queued: null, pictures: null,
};

const DECISION_TURN: ChatTurn = { kind: 'decision', key: 'decision-E5', decisionId: 'E5' };

function renderedThread(turns: readonly ChatTurn[]) {
  return render(<ChatThread label="Assistant conversation" turns={turns} renderDecision={(decisionId) => <p>{`Decision ${decisionId}`}</p>} historyKey="J1" />);
}

describe('the chat thread', () => {
  test('each turn kind renders its part, in the order given', () => {
    const { container } = renderedThread([BOOT_LINE, CLOSED_AGENT_TURN, USER_TURN, DECISION_TURN]);
    const thread = screen.getByRole('list', { name: 'Assistant conversation' });
    expect([...thread.children].map((turn) => [turn.className, turn.getAttribute('data-speaker')])).toEqual([
      ['board-chat-system', null],
      ['board-chat-turn', 'agent'],
      ['board-chat-turn', 'user'],
      ['board-chat-turn', 'decision'],
    ]);
    expect(container.querySelector('[data-speaker="decision"]')?.textContent).toBe('Decision E5');
  });

  test('a system line reveals the text it stands for only on User\'s ask, and hides it again', () => {
    const { container } = renderedThread([BOOT_LINE]);
    expect([container.querySelector('.board-chat-system-text'), container.querySelector('.board-chat-system .design-system-stamp')?.textContent]).toEqual([null, '14:02:08']);
    fireEvent.click(screen.getByRole('button', { name: 'Show prompt' }));
    expect(container.querySelector('.board-chat-system-text')?.textContent).toBe('You are the Assistant of Example Storefront.');
    fireEvent.click(screen.getByRole('button', { name: 'Hide prompt' }));
    expect(container.querySelector('.board-chat-system-text')).toBeNull();
  });

  test('a system line with nothing to reveal offers no button', () => {
    renderedThread([{ ...BOOT_LINE, text: 'Talos sent a standing reply', revealText: null }]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('an agent turn leads with its speaker in its state, then its stamp, its tool fold and its prose', () => {
    const { container } = renderedThread([CLOSED_AGENT_TURN]);
    const who = container.querySelector('.board-chat-who');
    expect([
      who?.getAttribute('data-state'),
      who?.querySelector('.design-system-state-dot')?.getAttribute('aria-hidden'),
      who?.textContent,
      who?.querySelector('.design-system-stamp')?.getAttribute('title'),
      container.querySelector('.board-tool-fold-names')?.textContent,
      container.querySelector('.board-chat-prose')?.textContent,
    ]).toEqual(['reviewed', 'true', 'Assistant14:05:31', '2026-11-09 14:05:31', 'Bash', 'J4 is not hung.\nIt runs the snapshot suite.']);
  });

  test('a working turn says it works in place of a stamp, and an empty prose adds no paragraph', () => {
    const { container } = renderedThread([{
      ...CLOSED_AGENT_TURN, stamp: null, workingText: 'working', toolUse: null, prose: '',
    }]);
    expect([
      container.querySelector('.board-chat-who .design-system-stamp'),
      container.querySelector('.board-chat-working')?.textContent,
      container.querySelector('.board-tool-fold'),
      container.querySelector('.board-chat-prose'),
    ]).toEqual([null, 'working', null, null]);
  });

  test('User\'s message is a bubble under its stamp line, the stamp suffix after the stamp', () => {
    const { container } = renderedThread([{ ...USER_TURN, stampSuffix: '1 picture', pictures: <span>Example picture</span> }]);
    expect([
      container.querySelector('[data-speaker="user"] .board-chat-who')?.textContent,
      container.querySelector('.board-chat-pictures')?.textContent,
      container.querySelector('.board-chat-bubble')?.textContent,
      container.querySelector('.board-chat-bubble')?.hasAttribute('data-queued'),
      container.querySelector('.design-system-tag'),
    ]).toEqual(['User·14:06:40·1 picture', 'Example picture', 'Why did #001 restart twice?', false, null]);
  });

  test('a queued message is a dashed bubble with its tag', () => {
    const { container } = renderedThread([{
      ...USER_TURN,
      text:   'Hold #008 until #007 lands.',
      queued: {
        text: 'Queued until the Assistant is idle', tone: 'state', stateTone: 'neutral', dot: true
      },
    }]);
    const tag = container.querySelector('.design-system-tag');
    expect([container.querySelector('.board-chat-bubble')?.hasAttribute('data-queued'), tag?.textContent, tag?.getAttribute('data-state-tone')])
      .toEqual([true, 'Queued until the Assistant is idle', 'neutral']);
  });

  test('agent prose, User\'s text and a revealed prompt are text, never markup', () => {
    const { container } = renderedThread([
      { ...BOOT_LINE, revealText: '<b>planted</b>' },
      { ...CLOSED_AGENT_TURN, prose: '<b>planted</b>' },
      { ...USER_TURN, text: '<b>planted</b>' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Show prompt' }));
    expect(container.querySelector('b')).toBeNull();
    expect([...container.querySelectorAll('.board-chat-system-text, .board-chat-prose, .board-chat-bubble')].map((part) => part.textContent))
      .toEqual(['<b>planted</b>', '<b>planted</b>', '<b>planted</b>']);
  });
});

describe('the chat card', () => {
  test('it is a section named by its label, holding what it is given', () => {
    render(<ChatCard label="Assistant session"><p>Example thread</p></ChatCard>);
    const card = screen.getByRole('region', { name: 'Assistant session' });
    expect([card.className, card.textContent]).toEqual(['board-chat', 'Example thread']);
  });
});
