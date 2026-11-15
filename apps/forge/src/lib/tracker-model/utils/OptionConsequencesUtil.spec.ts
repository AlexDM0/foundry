/**
 * The rule `question options` reads an agent's notes by, and how notes reach the options of the question they describe. What matters: the
 * notes are untrusted JSON, so every malformed form is a verdict naming its field and never a throw, and a read note is trimmed; a note
 * reaches an option only through the question's text and the option's own label, so an option no note names keeps its label and
 * description alone, with no consequence key; and a stored fact is copied as it is, so a read keeps a file byte-identical.
 */
import { describe, expect, test } from 'bun:test';

import { OptionConsequencesUtil } from './OptionConsequencesUtil.ts';

const WELL_FORMED_NOTES = {
  question: 'Which basket layout?',
  options:  [
    {
      label: 'Wicker', touches: ['src/basket/Wicker.ts'], tradeOff: 'Lighter, less sturdy.', acceptanceEffect: 'A2 fails.'
    },
    { label: 'Steel', tradeOff: 'Sturdy, heavier.' },
  ],
};

describe('reading the notes', () => {
  test('well-formed notes are read, each text trimmed and each fact kept only where given', () => {
    const reading = OptionConsequencesUtil.notesReadingOf({
      question: '  Which basket layout? ',
      options:  [{ label: ' Wicker ', touches: [' src/basket/Wicker.ts '], tradeOff: ' Lighter, less sturdy. ' }, { label: 'Steel' }],
    });

    expect(reading).toEqual({
      verdict: 'read',
      notes:   {
        question: 'Which basket layout?',
        options:  [{ label: 'Wicker', touches: ['src/basket/Wicker.ts'], tradeOff: 'Lighter, less sturdy.' }, { label: 'Steel' }],
      },
    });
  });

  test.each([
    ['notes that are not an object', ['Wicker'], 'notes', 'not-an-object'],
    ['a key the notes do not have', { ...WELL_FORMED_NOTES, header: 'Layout' }, 'header', 'unknown-key'],
    ['a blank question', { ...WELL_FORMED_NOTES, question: '  ' }, 'question', 'not-text'],
    ['no options', { ...WELL_FORMED_NOTES, options: [] }, 'options', 'not-a-list'],
    ['an option that is not an object', { ...WELL_FORMED_NOTES, options: ['Wicker'] }, 'options[0]', 'not-an-object'],
    ['a key an option note does not have', { ...WELL_FORMED_NOTES, options: [{ label: 'Wicker', description: 'Woven' }] }, 'options[0].description', 'unknown-key'],
    ['a blank label', { ...WELL_FORMED_NOTES, options: [{ label: '' }] }, 'options[0].label', 'not-text'],
    ['a label an earlier option has, once trimmed', { ...WELL_FORMED_NOTES, options: [{ label: 'Wicker' }, { label: ' Wicker' }] }, 'options[1].label', 'repeated'],
    ['an empty touches list', { ...WELL_FORMED_NOTES, options: [{ label: 'Wicker', touches: [] }] }, 'options[0].touches', 'not-a-list'],
    ['a touched path that is not text', { ...WELL_FORMED_NOTES, options: [{ label: 'Wicker', touches: ['src/a.ts', 7] }] }, 'options[0].touches[1]', 'not-text'],
    ['a trade-off that is not text', { ...WELL_FORMED_NOTES, options: [{ label: 'Wicker', tradeOff: 3 }] }, 'options[0].tradeOff', 'not-text'],
    ['a blank Acceptance effect', { ...WELL_FORMED_NOTES, options: [{ label: 'Wicker', acceptanceEffect: ' ' }] }, 'options[0].acceptanceEffect', 'not-text'],
  ] as const)('%s is malformed, naming its field', (_case, notes, field, problem) => {
    expect(OptionConsequencesUtil.notesReadingOf(notes)).toEqual({ verdict: 'malformed', field, problem });
  });
});

describe('the facts on a stored or escalated option', () => {
  test('an option with no facts, or with well-formed ones beside other keys, is well formed', () => {
    expect(OptionConsequencesUtil.factsAreWellFormed({ label: 'Wicker', description: 'Woven' })).toBe(true);
    expect(OptionConsequencesUtil.factsAreWellFormed({ label: 'Wicker', description: 'Woven', ...WELL_FORMED_NOTES.options[0] })).toBe(true);
  });

  test.each([
    ['touches that is not a list', { touches: 'src/a.ts' }],
    ['a trade-off that is not text', { tradeOff: false }],
    ['an Acceptance effect that is not text', { acceptanceEffect: ['A2'] }],
  ] as const)('an option with %s is not well formed', (_case, facts) => {
    expect(OptionConsequencesUtil.factsAreWellFormed({ label: 'Wicker', description: 'Woven', ...facts })).toBe(false);
  });

  test('a copy keeps each given fact exactly as stored and adds no key for one not given', () => {
    expect(OptionConsequencesUtil.consequencesCopyOf({ tradeOff: ' Lighter. ' })).toEqual({ tradeOff: ' Lighter. ' });
    expect(Object.keys(OptionConsequencesUtil.consequencesCopyOf({}))).toEqual([]);
  });
});

describe('matching notes to a question', () => {
  const asked = {
    question: ' Which basket layout?',
    options:  [{ label: 'Wicker', description: 'Woven' }, { label: 'Steel', description: 'Welded' }, { label: 'Paper', description: 'Folded' }],
  };

  test('notes are for a question by its trimmed text alone', () => {
    expect(OptionConsequencesUtil.notesAreForQuestion(WELL_FORMED_NOTES, asked.question)).toBe(true);
    expect(OptionConsequencesUtil.notesAreForQuestion(WELL_FORMED_NOTES, 'Which basket colour?')).toBe(false);
  });

  test('each option takes the facts of the note with its label, and an option no note names keeps label and description alone', () => {
    const otherQuestionNotes = { question: 'Which basket colour?', options: [{ label: 'Paper', tradeOff: 'Not this one.' }] };
    const options            = OptionConsequencesUtil.optionsWithNotes(asked, [otherQuestionNotes, WELL_FORMED_NOTES]);

    expect(options).toEqual([
      {
        label: 'Wicker', description: 'Woven', touches: ['src/basket/Wicker.ts'], tradeOff: 'Lighter, less sturdy.', acceptanceEffect: 'A2 fails.'
      },
      { label: 'Steel', description: 'Welded', tradeOff: 'Sturdy, heavier.' },
      { label: 'Paper', description: 'Folded' },
    ]);
    expect(Object.keys(options[2] ?? {})).toEqual(['label', 'description']);
  });

  test('with no notes for the question, every option is the agent\'s own', () => {
    expect(OptionConsequencesUtil.optionsWithNotes(asked, [])).toEqual(asked.options);
  });
});
