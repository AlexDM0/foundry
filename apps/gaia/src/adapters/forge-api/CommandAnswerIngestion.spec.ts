/**
 * The forge's answers to a board command, as a scratch forge recorded them. What matters: an applied command keeps its outcome and names
 * the job it started, an intake's product owner; the refusal of the recorded `ticket-hold` keeps its code, fields and the forge's sentence
 * unchanged, as does the refusal of a body the forge does not know; a held launch reads as held with its refusal; a body at another
 * control version, or one that is no answer, is unreadable and names its keys.
 */
import { describe, expect, test } from 'bun:test';

import { CommandAnswerIngestion }  from './CommandAnswerIngestion.ts';
import { recordedCommandAnswerOf } from './testing/BoardDocuments.ts';

const INGESTION = new CommandAnswerIngestion();

describe('answerOf, on the recorded answers', () => {
  test('reads an applied command, which started no job', async () => {
    const { status, body } = await recordedCommandAnswerOf('board-command-applied');
    expect(INGESTION.answerOf(status, body)).toEqual({ outcome: 'applied', applied: 'done', startedJobId: null });
  });

  test('reads the Assistant\'s switch applied, off and on again, which started no job', async () => {
    for (const situation of ['assistant-switched-off', 'assistant-switched-on'] as const) {
      const { status, body } = await recordedCommandAnswerOf(situation);
      expect(INGESTION.answerOf(status, body)).toEqual({ outcome: 'applied', applied: 'done', startedJobId: null });
    }
  });

  test('names the product owner an applied intake started', async () => {
    const { status, body } = await recordedCommandAnswerOf('intake-conversation');
    expect(INGESTION.answerOf(status, body)).toEqual({ outcome: 'applied', applied: 'done', startedJobId: 'J4' });
  });

  test('keeps the refusal of the recorded ticket-hold: its code, its fields and the forge\'s sentence unchanged', async () => {
    const { status, body } = await recordedCommandAnswerOf('board-command-refused');
    expect(INGESTION.answerOf(status, body)).toEqual({
      outcome: 'refused',
      status:  409,
      refusal: {
        code:     'no-readable-ticket',
        fields:   { reference: '999' },
        sentence: 'There is no readable ticket 999. Run `forge ticket list` to see what this tracker holds; a file that will not parse is reported there as malformed.',
      },
    });
  });

  test('keeps the refusal of a command the forge does not know', async () => {
    const { status, body } = await recordedCommandAnswerOf('board-command-unknown-kind');
    expect(INGESTION.answerOf(status, body)).toMatchObject({ outcome: 'refused', status: 400, refusal: { code: 'malformed-body', fields: {} } });
  });

  test('reads a launch held for an install change as held, with its refusal', async () => {
    const { status, body } = await recordedCommandAnswerOf('board-install-held');
    expect(INGESTION.answerOf(status, body)).toEqual({
      outcome: 'install-held',
      refusal: { code: 'launches-held-by-install-change', fields: {}, sentence: 'The install version changed, so launches are held until the board is updated.' },
    });
  });
});

describe('answerOf, on a body that is no answer', () => {
  test('reads a body at another control version, or with none, as unreadable', () => {
    expect(INGESTION.answerOf(200, { controlVersion: 4, outcome: 'done' })).toEqual({ outcome: 'unreadable', status: 200, invalidKeys: ['controlVersion'] });
    expect(INGESTION.answerOf(409, { refusal: 'example', fields: {}, text: 'Example.' })).toEqual({ outcome: 'unreadable', status: 409, invalidKeys: ['controlVersion'] });
  });

  test('names the keys of an applied answer or a refusal that is malformed', () => {
    expect(INGESTION.answerOf(200, { controlVersion: 3, outcome: 'example-outcome' })).toEqual({ outcome: 'unreadable', status: 200, invalidKeys: ['outcome'] });
    expect(INGESTION.answerOf(409, { controlVersion: 3, refusal: 'example', text: 'Example.' })).toEqual({ outcome: 'unreadable', status: 409, invalidKeys: ['fields'] });
  });

  test('reads no job from a result that names none as a string', () => {
    const answer = INGESTION.answerOf(200, { controlVersion: 3, outcome: 'nothing-to-do', result: { job: { id: 4 } } });
    expect(answer).toEqual({ outcome: 'applied', applied: 'nothing-to-do', startedJobId: null });
  });
});
