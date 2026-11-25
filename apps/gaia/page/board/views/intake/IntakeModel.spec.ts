/**
 * The Intake view's model. What matters: live product-owner sessions come from the board and ended ones from the log, a session reopened by
 * a message shows once, as live, and an intake that ended stopped or failed is listed with its outcome, read only, so a route naming it
 * keeps its chat; sessions that wait on User sort first, then the live ones and the ended ones, each newest first by the log's order; a
 * title falls back from the product owner's to the request's first line to the job id, the request read from the launch record, since a
 * reopening message replaces the job's text; a session names each open decision by id, never a count; the route picks the session or the new
 * chat, and a started job stops starting once a `job-ended` record names it; the composer's tag follows the session's turn and closed state;
 * an open session's live turn, where Flint works, carries its pill and calls; and the chat places User's request after the line that started
 * the session and each open decision where it was asked.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDecisionDocument }                                from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardTicketStatus }                                    from '../../../@types/board/BoardVocabulary.ts';
import type { BoardTranscriptEntryDocument }                         from '../../../@types/board/ConversationDocument.ts';
import { exampleTicket }                                             from '../../testing/BoardStateFixture.ts';
import { EXAMPLE_SESSION_RECORD_AT, productOwnerJob, sessionRecord } from '../../testing/IntakeBoardFixture.ts';
import { exampleTranscriptEntry }                                    from '../../testing/TranscriptEntryFixture.ts';
import { TimeUtil }                                                  from '../../utils/TimeUtil.ts';
import { IntakeModelUtil, INTAKE_NEW_CHAT_ITEM, type IntakeBoard }   from './IntakeModel.ts';

const AT = EXAMPLE_SESSION_RECORD_AT;

function decision(id: string, jobId: string, openedAt = AT): BoardDecisionDocument {
  return {
    id, kind: 'agent-question', ticketIds: [], jobId, askedBy: 'product-owner', questions: [], context: '', openedAt, document: null, anchor: null, placement: null,
  };
}

const BOARD: IntakeBoard = {
  jobs: [
    productOwnerJob({ id: 'J7', state: 'running', intake: { text: 'Also JSON', title: null } }, {
      calls:    7,
      turn:     'mid-turn',
      lastLine: { role: 'assistant', text: 'Read src/export.ts', at: null },
    }),
    productOwnerJob({ id: 'J9', state: 'waiting-for-answer', intake: { text: 'Saved baskets', title: 'Baskets across devices' } }),
    productOwnerJob({ id: 'J8', state: 'running', intake: { text: 'Size guide', title: null } }),
  ],
  decisions: [decision('E5', 'J9')],
  page:      {
    tickets: [
      exampleTicket({
        id: '060', title: 'Export as CSV', status: 'draft', filedByJob: 'J7'
      }),
      exampleTicket({
        id: '061', title: 'Older', status: 'committed', filedByJob: 'J2'
      }),
      exampleTicket({
        id: '062', title: 'Older still', status: 'draft', filedByJob: 'J2'
      }),
    ]
  },
  questionHistory: [
    sessionRecord('job-launched', 'J2', { kind: 'product-owner', ticketIds: [], intakeText: 'Reorder button' }),
    sessionRecord('intake-titled', 'J2', { title: 'Reorder' }),
    sessionRecord('intake-titled', 'J2', { title: 'Reorder requests' }),
    sessionRecord('job-ended', 'J2', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J3', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-ended', 'J3', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J5', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-ended', 'J5', { outcome: 'stopped' }),
    sessionRecord('job-launched', 'J7', { kind: 'product-owner', ticketIds: [], intakeText: 'Add an export\nas CSV' }),
    sessionRecord('job-ended', 'J7', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J8', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-launched', 'J9', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-launched', 'J10', { kind: 'assistant', ticketIds: [] }),
    sessionRecord('job-ended', 'J10', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J11', { kind: 'product-owner', ticketIds: [], intakeText: 'Gift wrap' }),
    sessionRecord('job-ended', 'J11', { outcome: 'failed' }),
  ],
};

describe('IntakeModelUtil.intakeSessionsOf', () => {
  const sessions = IntakeModelUtil.intakeSessionsOf(BOARD);

  test('sessions that wait on User come first, then the live ones newest first, then the ended ones newest first with their outcome', () => {
    expect(sessions.map((session) => [session.jobId, session.state, session.ended, session.closed])).toEqual([
      ['J9', 'waiting-for-answer', false, false],
      ['J8', 'running', false, false],
      ['J7', 'running', false, false],
      ['J11', 'failed', true, false],
      ['J5', 'stopped', true, false],
      ['J3', 'closed', true, true],
      ['J2', 'closed', true, true],
    ]);
  });

  test('a session carries its drafts, open decisions and last line; an ended one shows no last line and no calls', () => {
    const [j9, , j7, , , , j2] = sessions;
    expect(j9?.questions.map((question) => question.id)).toEqual(['E5']);
    expect([j7?.drafts.map((ticket) => ticket.id), j7?.lastLine, j7?.calls, j7?.turn]).toEqual([['060'], 'Read src/export.ts', 7, 'mid-turn']);
    expect([j2?.drafts.map((ticket) => ticket.id), j2?.lastLine, j2?.calls, j2?.closed]).toEqual([['061', '062'], null, null, true]);
  });

  test('a title falls back from the product owner\'s to the request\'s first line to the job id, the request read from the launch record', () => {
    expect(sessions.map((session) => [session.jobId, session.title, session.requestText])).toEqual([
      ['J9', 'Baskets across devices', 'Saved baskets'],
      ['J8', 'Size guide', 'Size guide'],
      ['J7', 'Add an export', 'Add an export\nas CSV'],
      ['J11', 'Gift wrap', 'Gift wrap'],
      ['J5', 'J5', null],
      ['J3', 'J3', null],
      ['J2', 'Reorder requests', 'Reorder button'],
    ]);
  });
});

describe('IntakeModelUtil.sessionFactsOf', () => {
  const [j9, , j7, j11, , , j2] = IntakeModelUtil.intakeSessionsOf(BOARD);

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

  test('a failed session shows its outcome and never says a message resumes it', () => {
    expect(j11 === undefined ? null : IntakeModelUtil.sessionFactsOf(j11)).toEqual({
      pill: { state: 'abandoned', label: 'failed' }, askTexts: [], ticketsText: null, resumeText: null
    });
  });
});

describe('IntakeModelUtil.readOnlyTagOf', () => {
  test('a session that ended stopped or failed is read only and names its outcome; a closed or live one takes a message', () => {
    const textOf = (session: Parameters<typeof IntakeModelUtil.readOnlyTagOf>[0]): string | null => IntakeModelUtil.readOnlyTagOf(session)?.text ?? null;
    expect(textOf({ state: 'stopped', ended: true, closed: false })).toBe('Stopped: read only; a new chat starts a fresh session');
    expect(textOf({ state: 'failed', ended: true, closed: false })).toBe('Failed: read only; a new chat starts a fresh session');
    expect(textOf({ state: 'closed', ended: true, closed: true })).toBeNull();
    expect(textOf({ state: 'running', ended: false, closed: false })).toBeNull();
  });
});

describe('IntakeModelUtil.selectedOf', () => {
  const sessions = IntakeModelUtil.intakeSessionsOf(BOARD);

  test('the item new opens the new chat, a known job selects it, and an unknown or absent item the first session', () => {
    expect(IntakeModelUtil.selectedOf(sessions, INTAKE_NEW_CHAT_ITEM)).toEqual({ form: 'new-chat' });
    expect(IntakeModelUtil.selectedOf(sessions, 'J2')).toMatchObject({ form: 'session', session: { jobId: 'J2' } });
    expect(IntakeModelUtil.selectedOf(sessions, 'J5')).toMatchObject({ form: 'session', session: { jobId: 'J5', state: 'stopped' } });
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

  test('a job-ended record names a job that ended, so a start that failed before any board listed it stops starting', () => {
    const failedFirst = { ...BOARD, questionHistory: [sessionRecord('job-ended', 'J12', { outcome: 'failed' })] };
    expect([IntakeModelUtil.jobHasEnded(failedFirst, 'J12'), IntakeModelUtil.jobHasEnded(BOARD, 'J12')]).toEqual([true, false]);
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
  const ticket = (id: string, status: BoardTicketStatus) => exampleTicket({
    id, title: id, status, filedByJob: 'J7'
  });

  test('the Close intake caption offers every draft of the session to ready, and is absent without drafts', () => {
    expect(IntakeModelUtil.closeIntakeCaptionOf([ticket('015', 'draft'), ticket('016', 'committed'), ticket('017', 'draft')]))
      .toBe('Close intake offers #015 and #017 to ready.');
    expect(IntakeModelUtil.closeIntakeCaptionOf([ticket('015', 'draft'), ticket('016', 'draft'), ticket('017', 'draft')]))
      .toBe('Close intake offers #015, #016 and #017 to ready.');
    expect(IntakeModelUtil.closeIntakeCaptionOf([ticket('016', 'committed')])).toBeNull();
  });

  test('the head counts turns and, on a live session, calls', () => {
    expect(IntakeModelUtil.paneMetaOf(2, 7)).toBe('2 turns · 7 calls');
    expect(IntakeModelUtil.paneMetaOf(1, null)).toBe('1 turn');
  });
});

describe('IntakeModelUtil.productOwnerAtWorkOf', () => {
  test('an open session has a live turn with its pill and calls so far; an ended one has none', () => {
    const runningPill = { state: 'in-progress', label: 'running' } as const;
    expect(IntakeModelUtil.productOwnerAtWorkOf({ state: 'running', jobState: 'running', calls: 2 })).toEqual({ pill: runningPill, callsText: '2 calls so far' });
    expect(IntakeModelUtil.productOwnerAtWorkOf({ state: 'closed', jobState: null, calls: null })).toBeNull();
  });
});

describe('IntakeModelUtil.chatTurnsOf', () => {
  const minute = (count: number) => new Date(Date.UTC(2026, 9, 29, 19, count)).toISOString();
  const today = TimeUtil.calendarDateOf(Date.UTC(2026, 9, 29, 19, 0));
  const picture = {
    pictureId: 'a'.repeat(64), name: 'basket.png', mediaType: 'image/png', bytes: 421_888
  };
  const entries: BoardTranscriptEntryDocument[] = [
    exampleTranscriptEntry({
      cursor: '1.1', role: 'hephaestus', text: 'You are the product owner.', at: minute(1), sentBy: 'hephaestus', clientAct: 'chat', pictures: [picture]
    }),
    exampleTranscriptEntry({
      cursor: '1.2', role: 'tool-call', text: 'src/basket.ts', toolName: 'Read', toolUseId: 't1', at: minute(2)
    }),
    exampleTranscriptEntry({
      cursor: '1.3', role: 'tool-result', text: '', toolUseId: 't1', at: minute(2)
    }),
    exampleTranscriptEntry({
      cursor: '1.4', role: 'assistant', text: 'Two tickets.', at: minute(3)
    }),
    exampleTranscriptEntry({
      cursor: '1.5', role: 'turn-end', text: '', at: minute(3)
    }),
    exampleTranscriptEntry({
      cursor: '1.6', role: 'user', text: 'Titles first.', at: minute(6), sentBy: 'user', clientAct: 'chat'
    }),
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
      'system: Hephaestus started J7 from User\'s first message · product-owner',
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
      'system: Hephaestus started J7 from User\'s first message · product-owner',
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
    const working: BoardTranscriptEntryDocument[] = [entries[0] as BoardTranscriptEntryDocument, exampleTranscriptEntry({
      cursor: '1.2', role: 'tool-call', text: 'Which format?', toolName: 'example-ask', toolUseId: 't9', at: minute(2)
    })];
    const turns = IntakeModelUtil.chatTurnsOf(working, [decision('E5', 'J7', minute(3))], facts);
    expect(turns.map((turn) => turn.kind)).toEqual(['system', 'user', 'agent', 'decision']);
  });

  test('every picture the chat carried is listed once, in the order it was first sent', () => {
    const resent = exampleTranscriptEntry({
      cursor: '1.7', role: 'user', text: 'Again', pictures: [picture, { ...picture, pictureId: 'b'.repeat(64), name: null }]
    });
    expect(IntakeModelUtil.picturesInChatOf([...entries, resent]).map((sent) => sent.pictureId)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
  });
});

describe('the pills', () => {
  test('an ended session reads as ended with its outcome and a live one by its job state', () => {
    expect(IntakeModelUtil.sessionPillOf({ state: 'closed', jobState: null })).toEqual({ state: 'abandoned', label: 'closed' });
    expect(IntakeModelUtil.sessionPillOf({ state: 'stopped', jobState: null })).toEqual({ state: 'abandoned', label: 'stopped' });
    expect(IntakeModelUtil.sessionPillOf({ state: 'running', jobState: 'running' })).toEqual({ state: 'in-progress', label: 'running' });
  });

  test('a filed ticket takes its status badge', () => {
    expect(IntakeModelUtil.draftPillOf({ status: 'draft' })).toEqual({ state: 'draft', label: 'Draft' });
    expect(IntakeModelUtil.draftPillOf({ status: 'committed' })).toEqual({ state: 'committed', label: 'To do' });
  });
});
