/**
 * The product-owner sessions. What matters: live sessions come from the board and ended ones from the log, a session reopened by a message
 * shows once, as live, and an intake that ended stopped or failed is listed with its outcome; sessions that wait on User sort first, then
 * the live ones and the ended ones, each newest first by the log's order; and a title falls back from the product owner's to the request's
 * first line to the job id, the request read from the launch record, since a reopening message replaces the job's text.
 */
import { describe, expect, test } from 'bun:test';

import { EXAMPLE_INTAKE_BOARD } from '../../testing/IntakeBoardFixture.ts';
import { IntakeSessionsModel }  from './IntakeSessionsModel.ts';

describe('IntakeSessionsModel.intakeSessionsOf', () => {
  const sessions = IntakeSessionsModel.intakeSessionsOf(EXAMPLE_INTAKE_BOARD);

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
