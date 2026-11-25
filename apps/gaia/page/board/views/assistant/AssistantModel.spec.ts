/**
 * The Assistant view's model. What matters: the switch is the state the board serves, its words name that state and a press sends the
 * other one; no live Assistant reads as booting while the switch is on and as off while it is off; a live one carries its live facts; an incident on the
 * board is open and never also settled, though the log opened it; the queued messages are the newest the session has not taken, counted
 * and never matched by text; the composer's tag follows the session's turn; the head names no call budget, since the Assistant has none;
 * the thread's items are worded as the chat shows them, a stamp in local time with seconds and never invented; the decisions the Assistant
 * put to User are the ones its job asks and the ones the forge serves as escalated, never another agent's, and Flint waits only while one
 * does; and an incident step's stamp is never invented. How each incident reads is `IncidentTrailUtil`'s, held by its own spec; how the
 * thread is read is `ChatThreadModelUtil`'s.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardQuestionHistoryEntryDocument } from '../../../@types/board/BoardDecisionDocuments.ts';
import type { ChatThreadItem }                    from '../../conversation/ChatThreadModel.ts';
import {
  boardStateFixture,
  exampleAgentJob,
  exampleAskingDecision,
  FIXTURE_ASSISTANT_JOB
} from '../../testing/BoardStateFixture.ts';
import { TimeUtil }                                                   from '../../utils/TimeUtil.ts';
import { AssistantModelUtil, type AssistantBoard, type AssistantJob } from './AssistantModel.ts';

const AT = '2026-10-29T20:00:00+01:00';

function historyEntryOf(changes: Partial<BoardQuestionHistoryEntryDocument> & Pick<BoardQuestionHistoryEntryDocument, 'kind'>): BoardQuestionHistoryEntryDocument {
  return {
    at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: null, fields: {}, ...changes
  };
}

const ASSISTANT_JOB = exampleAgentJob({
  id: 'J9', kind: 'assistant', role: 'assistant', ticketIds: []
});

const BOARD: AssistantBoard = boardStateFixture({
  jobs:      [ASSISTANT_JOB],
  decisions: [],
  incidents: [{
    id: 'I3', kind: 'setup-failed', ticketIds: ['042'], jobId: 'J4', facts: { step: 'install' }, defaultMove: 'worktree-repair', deliveredInTurn: null, openedAt: AT
  }],
  questionHistory: [
    historyEntryOf({ kind: 'incident-opened', incidentId: 'I1', fields: { kind: 'gate-cannot-run', ticketIds: ['040'] } }),
    historyEntryOf({ kind: 'incident-opened', incidentId: 'I2', fields: { kind: 'system-question', ticketIds: ['041'] } }),
    historyEntryOf({ kind: 'incident-opened', incidentId: 'I3', fields: { kind: 'setup-failed', ticketIds: ['042'] } }),
    historyEntryOf({ kind: 'incident-noted', incidentId: 'I2', fields: { text: 'Needs the owner' } }),
    historyEntryOf({ kind: 'incident-escalated', incidentId: 'I2', fields: { decisionId: 'E5' } }),
    historyEntryOf({ kind: 'incident-defaulted', incidentId: 'I1', fields: { move: 'merge-abort', cause: 'no-assistant' } }),
  ],
  escalatedDecisionIds: [],
});

const RUNNING_ASSISTANT: AssistantJob = {
  id: 'J9', state: 'running', calls: 13, turn: 'mid-turn', messagesWaiting: 0
};

describe('AssistantModelUtil.assistantModelOf', () => {
  test('a running Assistant job is the session, and one still launching reads as booting', () => {
    expect(AssistantModelUtil.assistantModelOf(BOARD).assistantJob?.id).toBe('J9');
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, jobs: [{ ...ASSISTANT_JOB, id: 'J10', state: 'launching' }] }).assistantJob).toBeNull();
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, jobs: [] }).assistantJob).toBeNull();
  });

  test('a builder is never the Assistant\'s session', () => {
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, jobs: [exampleAgentJob({ id: 'J12' })] }).assistantJob).toBeNull();
  });

  test('the session carries its served calls, turn and waiting messages', () => {
    const live = AssistantModelUtil.assistantModelOf({
      ...BOARD,
      jobs: [{
        ...ASSISTANT_JOB,
        live: {
          ...ASSISTANT_JOB.live, calls: 13, turn: 'mid-turn', messagesWaiting: 1
        }
      }],
    });
    expect(live.assistantJob).toEqual({
      id: 'J9', state: 'running', calls: 13, turn: 'mid-turn', messagesWaiting: 1
    });
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, jobs: [FIXTURE_ASSISTANT_JOB] }).assistantJob).toEqual({
      id: 'J1', state: 'running', calls: 12, turn: null, messagesWaiting: 0
    });
  });

  test('an incident on the board is open and not settled, and the ones the log opened that left the board are settled', () => {
    const model = AssistantModelUtil.assistantModelOf(BOARD);
    expect(model.openIncidents.map((incident) => incident.incidentId)).toEqual(['I3']);
    expect(model.settledIncidents.map((incident) => incident.incidentId)).toEqual(['I2', 'I1']);
  });
});

function messagedRecordOf(jobId: string, text: string, at: string): BoardQuestionHistoryEntryDocument {
  return historyEntryOf({
    kind: 'job-messaged', at, jobId, fields: { text }
  });
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
    expect(AssistantModelUtil.composerTagOf(RUNNING_ASSISTANT, true)).toMatchObject({ text: 'Busy: the next message queues', stateTone: 'accent' });
    expect(AssistantModelUtil.composerTagOf({ ...RUNNING_ASSISTANT, turn: 'between-turns' }, true)).toMatchObject({ text: 'Idle: a message sends now', stateTone: 'success' });
  });

  test('no session says a fresh one is booting, and a session with no reading yet shows no tag', () => {
    expect(AssistantModelUtil.composerTagOf(null, true)).toMatchObject({ text: 'No session: a fresh one is booting', stateTone: 'neutral' });
    expect(AssistantModelUtil.composerTagOf({ ...RUNNING_ASSISTANT, turn: null }, true)).toBeNull();
  });

  test('no session while the switch is off says the Assistant is off, and a session that still finishes its turn keeps its own tag', () => {
    expect(AssistantModelUtil.composerTagOf(null, false)).toMatchObject({ text: 'No session: the Assistant is off' });
    expect(AssistantModelUtil.composerTagOf(RUNNING_ASSISTANT, false)).toMatchObject({ text: 'Busy: the next message queues' });
  });
});

describe('the Assistant\'s switch', () => {
  test('is the state the board serves', () => {
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, assistantIsOn: true }).assistantIsOn).toBe(true);
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, assistantIsOn: false }).assistantIsOn).toBe(false);
  });

  test('its words name the served state', () => {
    expect([AssistantModelUtil.switchLabelOf(true), AssistantModelUtil.switchLabelOf(false)]).toEqual(['Assistant on', 'Assistant off']);
  });

  test('a press sends pipeline-assistant-set with the other state', () => {
    expect(AssistantModelUtil.switchCommandOf(false)).toEqual({ boardCommandVersion: 3, kind: 'pipeline-assistant-set', on: true });
    expect(AssistantModelUtil.switchCommandOf(true)).toEqual({ boardCommandVersion: 3, kind: 'pipeline-assistant-set', on: false });
  });
});

describe('AssistantModelUtil.headMetaOf', () => {
  test('names the state, the turns and the calls, never a call budget', () => {
    expect(AssistantModelUtil.headMetaOf(RUNNING_ASSISTANT, 3)).toBe('running · 3 turns · 13 calls');
  });

  test('says one turn and one call in the singular', () => {
    expect(AssistantModelUtil.headMetaOf({ ...RUNNING_ASSISTANT, calls: 1 }, 1)).toBe('running · 1 turn · 1 call');
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
        kind: 'system', key: 'd', at: null, facts: { form: 'client-act', act: 'close-input', sender: 'hephaestus' }, revealText: null
      },
    ];
    const turns = AssistantModelUtil.chatTurnsOf(items, facts);
    expect(turns.map((turn) => (turn.kind === 'system' ? turn.text : turn.kind))).toEqual([
      'Hephaestus booted J1 with its prompt · chat 1',
      'Hephaestus delivered I2 · chat 3',
      'Talos sent a standing reply',
      'Hephaestus closed the session\'s input',
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

describe('what the Assistant asks User', () => {
  const decisions = [exampleAskingDecision({ id: 'E4', jobId: 'J9' }), exampleAskingDecision({ id: 'E5', jobId: 'J12' }), exampleAskingDecision({ id: 'E6', jobId: 'J12' })];

  test('counts the decisions its job asks and the ones the forge serves as escalated, never another agent\'s', () => {
    const board: AssistantBoard = { ...BOARD, decisions, escalatedDecisionIds: ['E5'] };
    expect(AssistantModelUtil.assistantModelOf(board).askingDecisionCount).toBe(2);
    expect(AssistantModelUtil.assistantModelOf({ ...board, jobs: [], escalatedDecisionIds: [] }).askingDecisionCount).toBe(0);
  });

  test('an escalation the log records but the forge does not serve as escalated is not counted', () => {
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, jobs: [], decisions }).askingDecisionCount).toBe(0);
  });

  test('Flint waits only while one of its asks waits, and the count is worded in the singular for one', () => {
    expect([0, 2].map((askingDecisionCount) => AssistantModelUtil.flintCueOf({ askingDecisionCount }))).toEqual(['agent-is-idle', 'agent-waits-on-user']);
    expect([0, 1, 3].map(AssistantModelUtil.askingDecisionsTextOf)).toEqual([null, '1 decision waits on User', '3 decisions wait on User']);
  });

  test('an incident step with no stamp shows no time', () => {
    expect(AssistantModelUtil.stepStampOf(null, '2026-10-29')).toBeNull();
    expect(AssistantModelUtil.stepStampOf(AT, TimeUtil.calendarDateOf(new Date(AT).getTime()))?.element).toBe('time');
  });
});
