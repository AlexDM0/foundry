/**
 * The Intake view's model. What matters: live product-owner sessions come from the board and closed ones from the log, a session reopened
 * by a message shows once, as live, and an intake stopped any other way is not offered a chat; sessions that wait on User sort first, then
 * the live ones and the closed ones, each newest first by the log's order; a title falls back from the product owner's to the request's
 * first line to the job id, the request read from the launch record, since a reopening message replaces the job's text; a session names
 * each open decision by id, never a count; the route picks the session or the new chat; the composer's tag follows the session's turn and
 * closed state; an open session's live turn, where Flint works, carries its pill and calls; the chat places User's request after the line
 * that started the session and each open decision where it was asked; and the start command's job id is read structurally.
 */
import { describe, expect, test } from 'bun:test';

import type { ConversationBoardDocument, DecisionDocument, HistoryRecordDocument } from '../../@types/ConversationDocuments.ts';
import type { TranscriptEntryDocument }                                            from '../../api/TranscriptStreamClient.ts';
import { TimeUtil }                                                                from '../../utils/TimeUtil.ts';
import { IntakeModelUtil, INTAKE_NEW_CHAT_ITEM }                                   from './IntakeModel.ts';

const AT = '2026-10-29T20:00:00+01:00';

function record(kind: string, jobId: string, fields: Record<string, unknown>): HistoryRecordDocument {
  return {
    kind, at: AT, jobId, fields
  };
}

function decision(id: string, jobId: string, openedAt = AT): DecisionDocument {
  return {
    id, kind: 'agent-question', ticketIds: [], jobId, askedBy: 'product-owner', questions: [], context: '', openedAt
  };
}

const BOARD: ConversationBoardDocument = {
  jobs: [
    {
      id:        'J7',
      kind:      'product-owner',
      ticketIds: [],
      state:     'running',
      intake:    { text: 'Also JSON' },
      live:      {
        calls: 7, turn: 'mid-turn', messagesWaiting: 0, lastLine: { role: 'assistant', text: 'Read src/export.ts', at: null }
      }
    },
    {
      id: 'J9', kind: 'product-owner', ticketIds: [], state: 'waiting-for-answer', intake: { text: 'Saved baskets', title: 'Baskets across devices' }
    },
    {
      id: 'J8', kind: 'product-owner', ticketIds: [], state: 'running', intake: { text: 'Size guide' }
    },
  ],
  decisions: [decision('E5', 'J9')],
  incidents: [],
  page:      {
    tickets: [
      {
        id: '060', title: 'Export as CSV', status: 'draft', filedByJob: 'J7'
      },
      {
        id: '061', title: 'Older', status: 'pending', filedByJob: 'J2'
      },
      {
        id: '062', title: 'Older still', status: 'draft', filedByJob: 'J2'
      },
    ]
  },
  questionHistory: [
    record('job-launched', 'J2', { kind: 'product-owner', ticketIds: [], intakeText: 'Reorder button' }),
    record('intake-titled', 'J2', { title: 'Reorder' }),
    record('intake-titled', 'J2', { title: 'Reorder requests' }),
    record('job-ended', 'J2', { outcome: 'closed' }),
    record('job-launched', 'J3', { kind: 'product-owner', ticketIds: [] }),
    record('job-ended', 'J3', { outcome: 'closed' }),
    record('job-launched', 'J5', { kind: 'product-owner', ticketIds: [] }),
    record('job-ended', 'J5', { outcome: 'stopped' }),
    record('job-launched', 'J7', { kind: 'product-owner', ticketIds: [], intakeText: 'Add an export\nas CSV' }),
    record('job-ended', 'J7', { outcome: 'closed' }),
    record('job-launched', 'J8', { kind: 'product-owner', ticketIds: [] }),
    record('job-launched', 'J9', { kind: 'product-owner', ticketIds: [] }),
    record('job-launched', 'J10', { kind: 'assistant', ticketIds: [] }),
    record('job-ended', 'J10', { outcome: 'closed' }),
  ],
};

describe('IntakeModelUtil.intakeSessionsOf', () => {
  const sessions = IntakeModelUtil.intakeSessionsOf(BOARD);

  test('sessions that wait on User come first, then the live ones newest first, then the closed ones newest first', () => {
    expect(sessions.map((session) => [session.jobId, session.state])).toEqual([
      ['J9', 'waiting-for-answer'],
      ['J8', 'running'],
      ['J7', 'running'],
      ['J3', 'closed'],
      ['J2', 'closed'],
    ]);
  });

  test('a session carries its drafts, open decisions and last line; a closed one shows no last line and no calls', () => {
    const [j9, , j7, , j2] = sessions;
    expect(j9?.questions.map((question) => question.id)).toEqual(['E5']);
    expect([j7?.drafts.map((ticket) => ticket.id), j7?.lastLine, j7?.calls, j7?.turn]).toEqual([['060'], 'Read src/export.ts', 7, 'mid-turn']);
    expect([j2?.drafts.map((ticket) => ticket.id), j2?.lastLine, j2?.calls, j2?.closed]).toEqual([['061', '062'], null, null, true]);
  });

  test('a title falls back from the product owner\'s to the request\'s first line to the job id, the request read from the launch record', () => {
    expect(sessions.map((session) => [session.jobId, session.title, session.requestText])).toEqual([
      ['J9', 'Baskets across devices', 'Saved baskets'],
      ['J8', 'Size guide', 'Size guide'],
      ['J7', 'Add an export', 'Add an export\nas CSV'],
      ['J3', 'J3', null],
      ['J2', 'Reorder requests', 'Reorder button'],
    ]);
  });
});

describe('IntakeModelUtil.sessionFactsOf', () => {
  const [j9, , j7, , j2] = IntakeModelUtil.intakeSessionsOf(BOARD);

  test('a session names each open decision of its job by id, never a question count, and counts its drafts', () => {
    expect(j9 === undefined ? null : IntakeModelUtil.sessionFactsOf(j9)).toEqual({
      pill: { state: 'paused', label: 'waiting-for-answer' }, askTexts: ['E5 waits on User'], ticketsText: null, resumeText: null
    });
    expect(j7 === undefined ? null : IntakeModelUtil.sessionFactsOf(j7).ticketsText).toBe('1 draft');
  });

  test('a closed session counts every ticket it filed and says a message resumes it', () => {
    expect(j2 === undefined ? null : IntakeModelUtil.sessionFactsOf(j2)).toEqual({
      pill: { state: 'abandoned', label: 'closed' }, askTexts: [], ticketsText: '2 tickets filed', resumeText: 'a message resumes it'
    });
  });
});

describe('IntakeModelUtil.selectedOf', () => {
  const sessions = IntakeModelUtil.intakeSessionsOf(BOARD);

  test('the item new opens the new chat, a known job selects it, and an unknown or absent item the first session', () => {
    expect(IntakeModelUtil.selectedOf(sessions, INTAKE_NEW_CHAT_ITEM)).toEqual({ form: 'new-chat' });
    expect(IntakeModelUtil.selectedOf(sessions, 'J2')).toMatchObject({ form: 'session', session: { jobId: 'J2' } });
    expect(IntakeModelUtil.selectedOf(sessions, 'J404')).toMatchObject({ form: 'session', session: { jobId: 'J9' } });
    expect(IntakeModelUtil.selectedOf(sessions, null)).toMatchObject({ form: 'session', session: { jobId: 'J9' } });
  });

  test('with no session at all the new chat opens', () => {
    expect(IntakeModelUtil.selectedOf([], null)).toEqual({ form: 'new-chat' });
  });

  test('the job a Start session just started is starting until a board names it, with sessions or none', () => {
    expect(IntakeModelUtil.selectedOf(sessions, 'J404', 'J404')).toEqual({ form: 'starting', jobId: 'J404' });
    expect(IntakeModelUtil.selectedOf([], 'J404', 'J404')).toEqual({ form: 'starting', jobId: 'J404' });
    expect(IntakeModelUtil.selectedOf(sessions, 'J2', 'J2')).toMatchObject({ form: 'session', session: { jobId: 'J2' } });
  });
});

describe('IntakeModelUtil.composerTagOf', () => {
  test('the turn says whether a message sends now or queues, the waiting state says it waits on User, and a closed session resumes', () => {
    const textOf = (session: Parameters<typeof IntakeModelUtil.composerTagOf>[0]) => IntakeModelUtil.composerTagOf(session)?.text ?? null;
    expect(textOf({ state: 'running', closed: false, turn: 'mid-turn' })).toBe('Busy: the next message queues');
    expect(textOf({ state: 'running', closed: false, turn: 'between-turns' })).toBe('Idle: a message sends now');
    expect(textOf({ state: 'waiting-for-answer', closed: false, turn: 'mid-turn' })).toBe('Waiting on User: the next message queues');
    expect(textOf({ state: 'waiting-for-answer', closed: false, turn: 'between-turns' })).toBe('Waiting on User: a message sends now');
    expect(textOf({ state: 'closed', closed: true, turn: null })).toBe('Closed: a message resumes it');
    expect(textOf({ state: 'running', closed: false, turn: null })).toBeNull();
    expect(textOf(null)).toBe('No message yet: sending starts the session');
  });
});

describe('IntakeModelUtil.closeIntakeCaptionOf and paneMetaOf', () => {
  const ticket = (id: string, status: string) => ({
    id, title: id, status, filedByJob: 'J7'
  });

  test('the Close intake caption offers every draft of the session to ready, and is absent without drafts', () => {
    expect(IntakeModelUtil.closeIntakeCaptionOf([ticket('015', 'draft'), ticket('016', 'pending'), ticket('017', 'draft')]))
      .toBe('Close intake offers #015 and #017 to ready.');
    expect(IntakeModelUtil.closeIntakeCaptionOf([ticket('015', 'draft'), ticket('016', 'draft'), ticket('017', 'draft')]))
      .toBe('Close intake offers #015, #016 and #017 to ready.');
    expect(IntakeModelUtil.closeIntakeCaptionOf([ticket('016', 'pending')])).toBeNull();
  });

  test('the head counts turns and, on a live session, calls', () => {
    expect(IntakeModelUtil.paneMetaOf(2, 7)).toBe('2 turns · 7 calls');
    expect(IntakeModelUtil.paneMetaOf(1, null)).toBe('1 turn');
  });
});

describe('IntakeModelUtil.productOwnerAtWorkOf', () => {
  test('an open session has a live turn with its pill and calls so far; a closed one has none', () => {
    const runningPill = { state: 'in-progress', label: 'running' } as const;
    expect(IntakeModelUtil.productOwnerAtWorkOf({ state: 'running', closed: false, calls: 2 })).toEqual({ pill: runningPill, callsText: '2 calls so far' });
    expect(IntakeModelUtil.productOwnerAtWorkOf({ state: 'running', closed: false, calls: null })?.callsText).toBeNull();
    expect(IntakeModelUtil.productOwnerAtWorkOf({ state: 'closed', closed: true, calls: null })).toBeNull();
  });
});

describe('IntakeModelUtil.newJobIdOf', () => {
  test('reads the job id of an applied intake-start and null from any other shape', () => {
    expect(IntakeModelUtil.newJobIdOf({ job: { id: 'J12', kind: 'product-owner' }, logged: [] })).toBe('J12');
    expect(IntakeModelUtil.newJobIdOf({ kind: 'overseer-stop' })).toBeNull();
    expect(IntakeModelUtil.newJobIdOf({ job: { id: 12 } })).toBeNull();
    expect(IntakeModelUtil.newJobIdOf(null)).toBeNull();
  });
});

describe('IntakeModelUtil.chatTurnsOf', () => {
  const minute = (count: number) => new Date(Date.UTC(2026, 9, 29, 19, count)).toISOString();
  const today = TimeUtil.calendarDateOf(Date.UTC(2026, 9, 29, 19, 0));
  const picture = {
    pictureId: 'a'.repeat(64), name: 'basket.png', mediaType: 'image/png', bytes: 421_888
  };
  const entries: TranscriptEntryDocument[] = [
    {
      cursor: '1.1', entryKey: '1.1.0', role: 'overseer', text: 'You are the product owner.', at: minute(1), sentBy: 'overseer', clientAct: 'chat', pictures: [picture]
    },
    {
      cursor: '1.2', entryKey: '1.2.0', role: 'tool-call', text: 'src/basket.ts', toolName: 'Read', toolUseId: 't1', at: minute(2)
    },
    {
      cursor: '1.3', entryKey: '1.3.0', role: 'tool-result', text: '', toolUseId: 't1', at: minute(2)
    },
    {
      cursor: '1.4', entryKey: '1.4.0', role: 'assistant', text: 'Two tickets.', at: minute(3)
    },
    {
      cursor: '1.5', entryKey: '1.5.0', role: 'turn-end', text: '', at: minute(3)
    },
    {
      cursor: '1.6', entryKey: '1.6.0', role: 'user', text: 'Titles first.', at: minute(6), sentBy: 'user', clientAct: 'chat'
    },
  ];
  const facts = { jobId: 'J7', requestText: 'Saved baskets across devices', todayCalendarDate: today };
  const shapeOf = (turn: ReturnType<typeof IntakeModelUtil.chatTurnsOf>[number]): string => {
    switch (turn.kind) {
      case 'system':
        return `system: ${turn.text}`;
      case 'user':
        return `user: ${turn.text}${turn.stampSuffix === null ? '' : ` (${turn.stampSuffix})`}`;
      case 'agent':
        return `${turn.speaker}: ${turn.prose}`;
      case 'decision':
        return `decision ${turn.decisionId}`;
    }
  };

  test('User\'s request follows the line that started the session, with the pictures that line carried', () => {
    const turns = IntakeModelUtil.chatTurnsOf(entries, [], facts);
    expect(turns.map(shapeOf)).toEqual([
      'system: Overseer started J7 from User\'s first message · product-owner',
      'user: Saved baskets across devices (1 picture)',
      'Product owner: Two tickets.',
      'user: Titles first.',
    ]);
    expect(turns[1]).toMatchObject({ sentPictures: [picture], stamp: { shortText: TimeUtil.secondsClockText(Date.parse(minute(1)), today) } });
    expect(turns[0]).toMatchObject({ revealText: 'You are the product owner.' });
  });

  test('before the starting line came, the request stands first', () => {
    expect(IntakeModelUtil.chatTurnsOf([], [], facts).map(shapeOf)).toEqual(['user: Saved baskets across devices']);
  });

  test('an open decision sits after the last entry stamped at or before it was asked, and at the end with no stamps', () => {
    const asked = [decision('E5', 'J7', minute(4)), decision('E6', 'J7', minute(4))];
    expect(IntakeModelUtil.chatTurnsOf(entries, asked, facts).map(shapeOf)).toEqual([
      'system: Overseer started J7 from User\'s first message · product-owner',
      'user: Saved baskets across devices (1 picture)',
      'Product owner: Two tickets.',
      'decision E5',
      'decision E6',
      'user: Titles first.',
    ]);
    const unstamped = entries.map((entry) => ({ ...entry, at: null }));
    expect(IntakeModelUtil.chatTurnsOf(unstamped, asked, facts).map(shapeOf).slice(-2)).toEqual(['decision E5', 'decision E6']);
  });

  test('an unstamped working turn before a later entry stays before the decision', () => {
    const working: TranscriptEntryDocument[] = [entries[0] as TranscriptEntryDocument, {
      cursor: '1.2', entryKey: '1.2.0', role: 'tool-call', text: 'AskUserQuestion', toolName: 'AskUserQuestion', toolUseId: 't9', at: minute(2)
    }];
    const turns = IntakeModelUtil.chatTurnsOf(working, [decision('E5', 'J7', minute(3))], facts);
    expect(turns.map((turn) => turn.kind)).toEqual(['system', 'user', 'agent', 'decision']);
  });

  test('every picture the chat carried is listed once, in the order it was first sent', () => {
    const resent: TranscriptEntryDocument = {
      cursor: '1.7', entryKey: '1.7.0', role: 'user', text: 'Again', at: null, pictures: [picture, { ...picture, pictureId: 'b'.repeat(64), name: null }]
    };
    expect(IntakeModelUtil.picturesInChatOf([...entries, resent]).map((sent) => sent.pictureId)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
  });
});

describe('the pills', () => {
  test('a closed session reads as ended and a live one by its job state', () => {
    expect(IntakeModelUtil.sessionPillOf({ state: 'closed', closed: true })).toEqual({ state: 'abandoned', label: 'closed' });
    expect(IntakeModelUtil.sessionPillOf({ state: 'running', closed: false })).toEqual({ state: 'in-progress', label: 'running' });
  });

  test('a filed ticket takes its status badge, and a status that is no display state shows its word on the waiting row', () => {
    expect(IntakeModelUtil.draftPillOf({ status: 'draft' })).toEqual({ state: 'draft', label: 'Draft' });
    expect(IntakeModelUtil.draftPillOf({ status: 'pending' })).toEqual({ state: 'pending', label: 'To do' });
    expect(IntakeModelUtil.draftPillOf({ status: 'parked' })).toEqual({ state: 'pending', label: 'parked' });
  });
});
