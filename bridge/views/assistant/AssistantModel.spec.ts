/**
 * The Assistant view's model. What matters: no live Assistant reads as booting, and a live one carries its live facts; an incident on the
 * board is open and never also settled, though the log opened it; the queued messages are the newest the session has not taken, counted
 * and never matched by text; the composer's tag follows the session's turn; the head names no call budget, since the Assistant has none;
 * and the thread's items are worded as the chat shows them, a stamp in local time with seconds and never invented. How each incident
 * reads is `IncidentTrailUtil`'s, held by its own spec; how the thread is read is `ChatThreadModelUtil`'s.
 */
import { describe, expect, test } from 'bun:test';

import type { ConversationBoardDocument, HistoryRecordDocument } from '../../@types/ConversationDocuments.ts';
import type { ChatThreadItem }                                   from '../../conversation/ChatThreadModel.ts';
import { TimeUtil }                                              from '../../utils/TimeUtil.ts';
import { AssistantModelUtil, type AssistantJob }                 from './AssistantModel.ts';

const AT = '2026-10-29T20:00:00+01:00';

const BOARD: ConversationBoardDocument = {
  jobs: [{
    id: 'J9', kind: 'assistant', ticketIds: [], state: 'running'
  }],
  decisions: [],
  incidents: [{
    id: 'I3', kind: 'setup-failed', ticketIds: ['042'], jobId: 'J4', facts: { step: 'install' }, defaultMove: 'worktree-repair', deliveredInTurn: null, openedAt: AT
  }],
  questionHistory: [
    {
      kind: 'incident-opened', at: AT, incidentId: 'I1', fields: { kind: 'gate-cannot-run', ticketIds: ['040'] }
    },
    {
      kind: 'incident-opened', at: AT, incidentId: 'I2', fields: { kind: 'system-question', ticketIds: ['041'] }
    },
    {
      kind: 'incident-opened', at: AT, incidentId: 'I3', fields: { kind: 'setup-failed', ticketIds: ['042'] }
    },
    {
      kind: 'incident-noted', at: AT, incidentId: 'I2', fields: { text: 'Needs the owner' }
    },
    {
      kind: 'incident-escalated', at: AT, incidentId: 'I2', fields: { decisionId: 'E5' }
    },
    {
      kind: 'incident-defaulted', at: AT, incidentId: 'I1', fields: { move: 'merge-abort', cause: 'no-assistant' }
    },
  ],
};

const RUNNING_ASSISTANT: AssistantJob = {
  id: 'J9', state: 'running', calls: 13, turn: 'mid-turn', messagesWaiting: 0
};

describe('AssistantModelUtil.assistantModelOf', () => {
  test('a running Assistant job is the session, and one still launching reads as booting', () => {
    expect(AssistantModelUtil.assistantModelOf(BOARD).assistantJob?.id).toBe('J9');
    expect(AssistantModelUtil.assistantModelOf({
      ...BOARD,
      jobs: [{
        id: 'J10', kind: 'assistant', ticketIds: [], state: 'launching'
      }]
    }).assistantJob).toBeNull();
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, jobs: [] }).assistantJob).toBeNull();
  });

  test('the session carries its calls, turn and waiting messages, and no calls or turn while the board sends no live facts', () => {
    const live = AssistantModelUtil.assistantModelOf({
      ...BOARD,
      jobs: [{
        id: 'J9', kind: 'assistant', ticketIds: [], state: 'running', live: { calls: 13, turn: 'mid-turn', messagesWaiting: 1 }
      }]
    });
    expect(live.assistantJob).toEqual({
      id: 'J9', state: 'running', calls: 13, turn: 'mid-turn', messagesWaiting: 1
    });
    expect(AssistantModelUtil.assistantModelOf(BOARD).assistantJob).toEqual({
      id: 'J9', state: 'running', calls: null, turn: null, messagesWaiting: 0
    });
  });

  test('an incident on the board is open and not settled, and the ones the log opened that left the board are settled', () => {
    const model = AssistantModelUtil.assistantModelOf(BOARD);
    expect(model.openIncidents.map((incident) => incident.incidentId)).toEqual(['I3']);
    expect(model.settledIncidents.map((incident) => incident.incidentId)).toEqual(['I2', 'I1']);
  });
});

function messagedRecordOf(jobId: string, text: string, at: string): HistoryRecordDocument {
  return {
    kind: 'job-messaged', at, jobId, fields: { text }
  };
}

describe('AssistantModelUtil.queuedMessagesOf', () => {
  const history = [
    messagedRecordOf('J9', 'Why did #001 restart twice?', '2026-11-10T15:06:40+01:00'),
    messagedRecordOf('J7', 'Another job', '2026-11-10T15:07:00+01:00'),
    messagedRecordOf('J9', 'Hold #008 until #007 lands.', '2026-11-10T15:12:10+01:00'),
    messagedRecordOf('J9', 'Hold #008 until #007 lands.', '2026-11-10T15:12:20+01:00'),
  ];

  test('the queued messages are the newest the session has not taken, of this job only', () => {
    expect(AssistantModelUtil.queuedMessagesOf(history, 'J9', 1)).toEqual([{ at: '2026-11-10T15:12:20+01:00', text: 'Hold #008 until #007 lands.' }]);
  });

  test('two equal messages both wait, since they are counted and never matched by text', () => {
    expect(AssistantModelUtil.queuedMessagesOf(history, 'J9', 2).map((message) => message.at)).toEqual(['2026-11-10T15:12:10+01:00', '2026-11-10T15:12:20+01:00']);
  });

  test('nothing waits once the session took every message', () => {
    expect(AssistantModelUtil.queuedMessagesOf(history, 'J9', 0)).toEqual([]);
  });
});

describe('AssistantModelUtil.composerTagOf', () => {
  test('mid-turn says the next message queues, between turns that it sends now', () => {
    expect(AssistantModelUtil.composerTagOf(RUNNING_ASSISTANT)).toMatchObject({ text: 'Busy: the next message queues', state: 'in-progress' });
    expect(AssistantModelUtil.composerTagOf({ ...RUNNING_ASSISTANT, turn: 'between-turns' })).toMatchObject({ text: 'Idle: a message sends now', state: 'reviewed' });
  });

  test('no session says a fresh one is booting, and a session with no reading yet shows no tag', () => {
    expect(AssistantModelUtil.composerTagOf(null)).toMatchObject({ text: 'No session: a fresh one is booting', state: 'pending' });
    expect(AssistantModelUtil.composerTagOf({ ...RUNNING_ASSISTANT, turn: null })).toBeNull();
  });
});

describe('AssistantModelUtil.headMetaOf', () => {
  test('names the state, the turns and the calls, never a call budget', () => {
    expect(AssistantModelUtil.headMetaOf(RUNNING_ASSISTANT, 3)).toBe('running · 3 turns · 13 calls');
  });

  test('says one turn and one call in the singular, and leaves the calls out while they are unknown', () => {
    expect(AssistantModelUtil.headMetaOf({ ...RUNNING_ASSISTANT, calls: 1 }, 1)).toBe('running · 1 turn · 1 call');
    expect(AssistantModelUtil.headMetaOf({ ...RUNNING_ASSISTANT, calls: null }, 0)).toBe('running · 0 turns');
  });
});

describe('AssistantModelUtil.chatTurnsOf', () => {
  const instant = Date.UTC(2026, 10, 10, 13, 5, 31);
  const today = TimeUtil.calendarDateOf(instant);
  const facts = { jobId: 'J1', todayCalendarDate: today };

  test('words the boot line, a delivery, a standing reply and a client act, each with its stamp in local time and seconds', () => {
    const items: ChatThreadItem[] = [
      {
        kind: 'system', key: 'a', at: new Date(instant).toISOString(), facts: { form: 'boot', chatSequence: 1 }, revealText: 'You are the Assistant.'
      },
      {
        kind: 'system', key: 'b', at: null, facts: { form: 'incident-delivery', chatSequence: 3, incidentIds: ['I2'] }, revealText: null
      },
      {
        kind: 'system', key: 'c', at: null, facts: { form: 'standing-reply' }, revealText: null
      },
      {
        kind: 'system', key: 'd', at: null, facts: { form: 'client-act', act: 'close-input', sender: 'overseer' }, revealText: null
      },
    ];
    const turns = AssistantModelUtil.chatTurnsOf(items, facts);
    expect(turns.map((turn) => (turn.kind === 'system' ? turn.text : turn.kind))).toEqual([
      'Overseer booted J1 with its prompt · chat 1',
      'Overseer delivered I2 · chat 3',
      'Watcher sent a standing reply',
      'Overseer closed the session\'s input',
    ]);
    expect(turns[0]).toMatchObject({ stamp: { shortText: `${TimeUtil.shortInstantText(instant, today)}:31` }, revealText: 'You are the Assistant.' });
    expect(turns[1]).toMatchObject({ stamp: null });
  });

  test('words a closed turn\'s fold with its tools and errors, and the working turn\'s as open with its count so far', () => {
    const fold = {
      calls: [
        {
          key: 'c1', toolName: 'Bash', inputText: 'git status', state: 'ok', startedAt: null
        },
        {
          key: 'c2', toolName: 'Bash', inputText: 'git log', state: 'error', startedAt: null
        },
        {
          key: 'c3', toolName: 'Read', inputText: 'README.md', state: 'running', startedAt: '2026-11-10T13:05:00.000Z'
        },
      ],
      toolCounts: [{ toolName: 'Bash', count: 2 }, { toolName: 'Read', count: 1 }],
      errorCount: 1,
    } as const;
    const [closed, working] = AssistantModelUtil.chatTurnsOf([
      {
        kind: 'agent-turn', key: 'a', at: null, working: false, prose: 'Done.', toolFold: fold
      },
      {
        kind: 'agent-turn', key: 'b', at: null, working: true, prose: '', toolFold: fold
      },
    ], facts);
    expect(closed).toMatchObject({
      speaker:     'Assistant',
      workingText: null,
      toolUse:     {
        summaryText: 'Used 3 tools', namesText: 'Bash ×2 · Read', errorText: '1 error', openAtFirst: false
      }
    });
    expect(working).toMatchObject({ workingText: 'working', toolUse: { summaryText: 'Using tools · 3 so far', openAtFirst: true } });
    expect(closed?.kind === 'agent' ? closed.toolUse?.calls.map((call) => [call.outcome, call.resultText]) : null)
      .toEqual([['ok', 'ok'], ['error', 'error'], ['running', null]]);
  });

  test('a call the turn ended without answering shows as an error with no result', () => {
    const [turn] = AssistantModelUtil.chatTurnsOf([{
      kind:     'agent-turn',
      key:      'a',
      at:       null,
      working:  false,
      prose:    '',
      toolFold: {
        calls: [{
          key: 'c1', toolName: 'Read', inputText: 'README.md', state: 'unanswered', startedAt: null
        }],
        toolCounts: [{ toolName: 'Read', count: 1 }],
        errorCount: 1
      },
    }], facts);
    expect(turn?.kind === 'agent' ? turn.toolUse?.calls[0] : null).toMatchObject({ outcome: 'error', resultText: 'no result' });
  });

  test('a queued message is User\'s bubble with the queued tag, one already taken has none', () => {
    const turns = AssistantModelUtil.chatTurnsOf([
      {
        kind: 'user-message', key: 'a', at: null, text: 'Why?', queued: false
      },
      {
        kind: 'user-message', key: 'b', at: null, text: 'Hold #008.', queued: true
      },
    ], facts);
    expect(turns.map((turn) => (turn.kind === 'user' ? [turn.speaker, turn.text, turn.queued?.text ?? null] : null))).toEqual([
      ['User', 'Why?', null],
      ['User', 'Hold #008.', 'Queued until the Assistant is idle'],
    ]);
  });
});
