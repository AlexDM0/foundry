/**
 * The notes an agent gives with `question options` before it asks: read from untrusted JSON into a verdict, kept per question text, and
 * matched onto the options of the question they describe by the question's text and each option's label, both trimmed.
 */
import type { DecisionQuestionOption }                              from '../@types/Decision.ts';
import type { OptionConsequences, OptionNote, QuestionOptionNotes } from '../@types/OptionConsequences.ts';

export type OptionNotesProblem = 'not-an-object' | 'not-text' | 'not-a-list' | 'repeated' | 'unknown-key';

/** `field` names the offending value as a JSON path from the notes, such as `options[1].touches`. */
export type OptionNotesReading =
  | { verdict: 'read'; notes: QuestionOptionNotes }
  | { verdict: 'malformed'; field: string; problem: OptionNotesProblem };

type MalformedReading = Extract<OptionNotesReading, { verdict: 'malformed' }>;

const NOTES_KEYS: readonly string[] = ['question', 'options'];

const OPTION_NOTE_KEYS: readonly string[] = ['label', 'touches', 'tradeOff', 'acceptanceEffect'];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function malformed(field: string, problem: OptionNotesProblem): MalformedReading {
  return { verdict: 'malformed', field, problem };
}

function unknownKeyOf(record: Readonly<Record<string, unknown>>, knownKeys: readonly string[]): string | undefined {
  return Object.keys(record).find((key) => !knownKeys.includes(key));
}

function textFactProblemOf(record: Readonly<Record<string, unknown>>, key: 'tradeOff' | 'acceptanceEffect', path: string): MalformedReading | null {
  return record[key] === undefined || isFilledText(record[key]) ? null : malformed(`${path}.${key}`, 'not-text');
}

function touchesProblemOf(touches: unknown, path: string): MalformedReading | null {
  if (touches === undefined) return null;
  if (!Array.isArray(touches) || touches.length === 0) return malformed(`${path}.touches`, 'not-a-list');
  const blankIndex = touches.findIndex((touched) => !isFilledText(touched));
  return blankIndex === -1 ? null : malformed(`${path}.touches[${blankIndex}]`, 'not-text');
}

function optionNoteProblemOf(value: unknown, path: string, earlierLabels: ReadonlySet<string>): MalformedReading | null {
  if (!isRecord(value)) return malformed(path, 'not-an-object');
  const unknownKey = unknownKeyOf(value, OPTION_NOTE_KEYS);
  if (unknownKey !== undefined) return malformed(`${path}.${unknownKey}`, 'unknown-key');
  const { label } = value;
  if (!isFilledText(label)) return malformed(`${path}.label`, 'not-text');
  if (earlierLabels.has(label.trim())) return malformed(`${path}.label`, 'repeated');
  return touchesProblemOf(value['touches'], path) ?? textFactProblemOf(value, 'tradeOff', path) ?? textFactProblemOf(value, 'acceptanceEffect', path);
}

/** Whether the facts an option carries, beside whatever else it holds, are each absent or well formed: a stored or escalated option's check. */
function factsAreWellFormed(option: Readonly<Record<string, unknown>>): boolean {
  return (touchesProblemOf(option['touches'], 'option') ?? textFactProblemOf(option, 'tradeOff', 'option') ?? textFactProblemOf(option, 'acceptanceEffect', 'option')) === null;
}

/** Only the facts given, in a fixed order, copied as they are. */
function consequencesCopyOf(source: Readonly<OptionConsequences>): OptionConsequences {
  return {
    ...(source.touches === undefined ? {} : { touches: [...source.touches] }),
    ...(source.tradeOff === undefined ? {} : { tradeOff: source.tradeOff }),
    ...(source.acceptanceEffect === undefined ? {} : { acceptanceEffect: source.acceptanceEffect }),
  };
}

function trimmedNoteOf(option: Readonly<OptionNote>): OptionNote {
  return {
    label: option.label.trim(),
    ...(option.touches === undefined ? {} : { touches: option.touches.map((touched) => touched.trim()) }),
    ...(option.tradeOff === undefined ? {} : { tradeOff: option.tradeOff.trim() }),
    ...(option.acceptanceEffect === undefined ? {} : { acceptanceEffect: option.acceptanceEffect.trim() }),
  };
}

/** Fails closed on the first problem: an unknown key, a blank text, an empty list or a repeated label is never stored. */
function notesReadingOf(value: unknown): OptionNotesReading {
  if (!isRecord(value)) return malformed('notes', 'not-an-object');
  const unknownKey = unknownKeyOf(value, NOTES_KEYS);
  if (unknownKey !== undefined) return malformed(unknownKey, 'unknown-key');
  const { question, options } = value;
  if (!isFilledText(question)) return malformed('question', 'not-text');
  if (!Array.isArray(options) || options.length === 0) return malformed('options', 'not-a-list');
  const labels = new Set<string>();
  for (const [i, option] of options.entries()) {
    const problem = optionNoteProblemOf(option, `options[${i}]`, labels);
    if (problem !== null) return problem;
    labels.add((option as OptionNote).label.trim());
  }
  return { verdict: 'read', notes: { question: question.trim(), options: (options as OptionNote[]).map(trimmedNoteOf) } };
}

function notesAreForQuestion(notes: Readonly<QuestionOptionNotes>, questionText: string): boolean {
  return notes.question === questionText.trim();
}

/** Each option takes the facts of the note whose label is its own; an option no note names keeps its label and description alone. */
function optionsWithNotes(
  question: { readonly question: string; readonly options: readonly Readonly<Pick<DecisionQuestionOption, 'label' | 'description'>>[] },
  pendingNotes: readonly Readonly<QuestionOptionNotes>[],
): DecisionQuestionOption[] {
  const notes = pendingNotes.find((candidate) => notesAreForQuestion(candidate, question.question));
  return question.options.map((option) => {
    const noted = notes?.options.find((candidate) => candidate.label === option.label.trim());
    return { label: option.label, description: option.description, ...consequencesCopyOf(noted ?? {}) };
  });
}

export const OptionConsequencesUtil = Object.freeze({
  notesReadingOf,
  factsAreWellFormed,
  consequencesCopyOf,
  notesAreForQuestion,
  optionsWithNotes,
});
