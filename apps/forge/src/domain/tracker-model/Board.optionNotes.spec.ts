/**
 * The option notes a job keeps for its next question (`question options`): untrusted JSON, so a malformed one is refused naming its field;
 * not logged; a later note for the same question replaces the earlier, and a job keeps a bounded number, so a session cannot grow
 * progress.json without end; taking the asked questions' notes removes them; a finished job takes none.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, refusalDetailOf, ticketFixture } from '../../testing/BoardFixtures.ts';

const AT = '2026-09-26T10:15:00+02:00';

/** The bound `src/domain/tracker-model/Jobs.ts` names; the case below fills it past this count. */
const NOTES_KEPT_PER_JOB = 8;

function notesFor(question: string, tradeOff = 'Lighter, less sturdy.'): { question: string; options: { label: string; tradeOff: string }[] } {
  return { question, options: [{ label: 'Wicker', tradeOff }] };
}

function boardWithABuild(): ReturnType<typeof boardFixture> {
  const fixture = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })] });
  fixture.board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
  }, AT);
  fixture.records.length = 0;
  return fixture;
}

describe('noting the options of a question', () => {
  test('keeps the trimmed notes on the job and logs nothing', () => {
    const { board, records } = boardWithABuild();
    const { logged } = board.noteQuestionOptions('J1', { question: ' Which basket? ', options: [{ label: ' Wicker ', touches: ['src/basket/Wicker.ts'] }] });

    expect(board.jobById('J1')?.pendingOptionNotes).toEqual([{ question: 'Which basket?', options: [{ label: 'Wicker', touches: ['src/basket/Wicker.ts'] }] }]);
    expect(logged).toEqual([]);
    expect(records).toEqual([]);
  });

  test('malformed notes are refused question-options-malformed, naming the field, and change nothing', () => {
    const { board } = boardWithABuild();
    expect(refusalDetailOf(() => board.noteQuestionOptions('J1', { question: 'Which basket?', options: [{ label: 'Wicker', colour: 'Brown' }] }))).toEqual({
      reason: 'question-options-malformed', jobId: 'J1', field: 'options[0].colour', problem: 'unknown-key',
    });
    expect(Object.hasOwn(board.jobById('J1') ?? {}, 'pendingOptionNotes')).toBe(false);
  });

  test('a later note for the same question replaces the earlier one, and notes for other questions stay in order', () => {
    const { board } = boardWithABuild();
    board.noteQuestionOptions('J1', notesFor('Which basket?'));
    board.noteQuestionOptions('J1', notesFor('Which colour?'));
    board.noteQuestionOptions('J1', notesFor('Which basket?', 'Cheaper.'));

    expect(board.jobById('J1')?.pendingOptionNotes).toEqual([notesFor('Which colour?'), notesFor('Which basket?', 'Cheaper.')]);
  });

  test('a job keeps the notes of its newest questions only, up to the bound', () => {
    const { board } = boardWithABuild();
    const questions = Array.from({ length: NOTES_KEPT_PER_JOB + 2 }, (_unused, i) => `Example question ${i + 1}?`);
    for (const question of questions) board.noteQuestionOptions('J1', notesFor(question));

    expect(board.jobById('J1')?.pendingOptionNotes?.map((notes) => notes.question)).toEqual(questions.slice(-NOTES_KEPT_PER_JOB));
  });

  test('a finished job is refused job-finished, and an unknown one unknown-job', () => {
    const { board } = boardWithABuild();
    board.endJob('J1', { outcome: 'built' }, AT);
    expect(refusalDetailOf(() => board.noteQuestionOptions('J1', notesFor('Which basket?')))).toEqual({ reason: 'job-finished', jobId: 'J1' });
    expect(refusalDetailOf(() => board.noteQuestionOptions('J9', notesFor('Which basket?')))).toEqual({ reason: 'unknown-job', jobId: 'J9' });
  });
});

describe('taking the notes of the questions asked', () => {
  test('gives back the notes whose question text was asked and leaves the others on the job', () => {
    const { board } = boardWithABuild();
    board.noteQuestionOptions('J1', notesFor('Which basket?'));
    board.noteQuestionOptions('J1', notesFor('Which colour?'));

    expect(board.takeQuestionOptionNotes('J1', [' Which basket?'])).toEqual([notesFor('Which basket?')]);
    expect(board.jobById('J1')?.pendingOptionNotes).toEqual([notesFor('Which colour?')]);
  });

  test('removes the key with the last note, and taking from a job with none gives nothing back', () => {
    const { board } = boardWithABuild();
    expect(board.takeQuestionOptionNotes('J1', ['Which basket?'])).toEqual([]);
    board.noteQuestionOptions('J1', notesFor('Which basket?'));
    board.takeQuestionOptionNotes('J1', ['Which basket?']);

    expect(Object.hasOwn(board.jobById('J1') ?? {}, 'pendingOptionNotes')).toBe(false);
  });
});
