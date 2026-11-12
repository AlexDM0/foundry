/**
 * The question card, in a happy-dom document. What matters: it is a fieldset named by its legend, eyebrow and question, asking while no
 * answer was given; its options are radios of one group, the recommended ones marked by the word in `.bridge-choice-mark`; a multiple
 * question draws checkboxes that show every chosen letter and hand on the letter toggled; choosing an option hands its letter on, and
 * choosing Other moves the focus into Other's text field; Answer waits for a choice, and for words when Other is chosen; the layout sets
 * `data-layout`; once answered the green confirmation takes the place of the options and the answer button, and the card says it is
 * answered; disabled disables every control; and the words are text, never markup.
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
import { useState } from 'react';

import { MultipleChoiceQuestion, type MultipleChoiceQuestionProps } from './MultipleChoiceQuestion.tsx';

const NOTHING = (): void => undefined;

const QUESTION_PROPS: MultipleChoiceQuestionProps = {
  eyebrow:  'Question',
  question: 'e2e needs a running database. How should the pipeline handle it?',
  options:  [
    { letter: 'A', text: 'Start the database in a container', description: 'A prepare step starts it.' },
    { letter: 'B', text: 'Leave e2e out' },
  ],
  recommendedLetters: ['A'],
  recommendedLabel:   'Recommended',
  otherLetter:        'C',
  otherLabel:         'Other',
  otherPlaceholder:   'Describe another way',
  otherTextLabel:     'Other answer',
  layout:             'columns',
  multiple:           false,
  chosen:             [],
  onChoose:           NOTHING,
  otherText:          '',
  onOtherText:        NOTHING,
  answerLabel:        'Answer',
  onAnswer:           NOTHING,
};

/** The card with its choice and Other's words held as a view would hold them. */
function HeldQuestion({ onAnswer }: { readonly onAnswer: (answer: string) => void }) {
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [otherText, setOtherText] = useState('');
  return (
    <MultipleChoiceQuestion
      {...QUESTION_PROPS}
      chosen={chosen}
      onChoose={(letter) => setChosen([letter])}
      otherText={otherText}
      onOtherText={setOtherText}
      onAnswer={() => onAnswer(chosen.includes('C') ? otherText : chosen.join(''))}
    />
  );
}

afterEach(cleanup);

describe('the question card', () => {
  test('it is a fieldset named by its eyebrow and question, asking, its options radios of one group', () => {
    render(<MultipleChoiceQuestion {...QUESTION_PROPS} />);
    const card = screen.getByRole('group', { name: 'Question e2e needs a running database. How should the pipeline handle it?' });
    const radios = screen.getAllByRole('radio');
    expect([card.tagName, card.className, card.getAttribute('data-state'), card.getAttribute('data-layout')])
      .toEqual(['FIELDSET', 'bridge-question-card', 'asking', 'columns']);
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Start the database in a container', 'Leave e2e out', 'Other']);
    expect(new Set(radios.map((radio) => radio.getAttribute('name'))).size).toBe(1);
  });

  test('a recommended option carries the word in .bridge-choice-mark, and the others carry none', () => {
    const { container } = render(<MultipleChoiceQuestion {...QUESTION_PROPS} />);
    const marks = [...container.querySelectorAll('.bridge-choice-mark')];
    expect(marks.map((mark) => [mark.textContent, mark.getAttribute('data-mark'), mark.closest('.bridge-choice')?.querySelector('.bridge-choice-letter')?.textContent]))
      .toEqual([['Recommended', 'recommended', 'A']]);
    expect(container.querySelector('.bridge-draft-mark')).toBeNull();
  });

  test('choosing an option hands its letter on, and choosing Other moves the focus into its text field', () => {
    const chosenLetters: string[] = [];
    render(<MultipleChoiceQuestion {...QUESTION_PROPS} onChoose={(letter) => chosenLetters.push(letter)} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Leave e2e out' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    expect([chosenLetters, document.activeElement === screen.getByRole('textbox', { name: 'Other answer' })]).toEqual([['B', 'C'], true]);
  });

  test('a multiple question draws checkboxes that show every chosen letter and hand on the letter toggled', () => {
    const chosenLetters: string[] = [];
    render(<MultipleChoiceQuestion {...QUESTION_PROPS} multiple chosen={['A', 'B']} onChoose={(letter) => chosenLetters.push(letter)} />);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(screen.getByRole('checkbox', { name: 'Start the database in a container' }));
    expect([screen.queryAllByRole('radio'), checkboxes.map((checkbox) => checkbox.checked), chosenLetters])
      .toEqual([[], [true, true, false], ['A']]);
    expect(screen.getByRole('button', { name: 'Answer' }).matches(':disabled')).toBe(false);
  });

  test('Answer waits for a choice, and for words when Other is chosen', () => {
    const answers: string[] = [];
    render(<HeldQuestion onAnswer={(answer) => answers.push(answer)} />);
    const answer = (): HTMLButtonElement => screen.getByRole('button', { name: 'Answer' });
    const disabledStates = [answer().disabled];
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    disabledStates.push(answer().disabled);
    fireEvent.change(screen.getByRole('textbox', { name: 'Other answer' }), { target: { value: 'Run e2e nightly' } });
    disabledStates.push(answer().disabled);
    fireEvent.click(answer());
    expect([disabledStates, answers]).toEqual([[true, true, false], ['Run e2e nightly']]);
  });

  test('answered, the confirmation takes the place of the options and Answer, and the card says it is answered', () => {
    render(<MultipleChoiceQuestion {...QUESTION_PROPS} layout="stack" chosen={['A']} answeredText="Answered: the database starts in a container" />);
    const card = screen.getByRole('group');
    const confirmation = screen.getByRole('status');
    expect([card.getAttribute('data-state'), card.getAttribute('data-layout'), confirmation.className, confirmation.textContent])
      .toEqual(['answered', 'stack', 'bridge-question-card-answered', 'Answered: the database starts in a container']);
    expect([screen.queryAllByRole('radio'), screen.queryByRole('button', { name: 'Answer' })]).toEqual([[], null]);
    expect(confirmation.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('disabled disables every control', () => {
    render(<MultipleChoiceQuestion {...QUESTION_PROPS} chosen={['A']} disabled />);
    expect([(screen.getByRole('group') as HTMLFieldSetElement).disabled, screen.getByRole('button', { name: 'Answer' }).matches(':disabled')])
      .toEqual([true, true]);
  });

  test('the words are text, never markup', () => {
    const planted = '<b>planted</b>';
    const { container } = render(
      <MultipleChoiceQuestion
        {...QUESTION_PROPS}
        eyebrow={planted}
        question={planted}
        options={[{ letter: 'A', text: planted, description: planted }]}
        recommendedLabel={planted}
        otherLabel={planted}
      />,
    );
    expect(container.querySelector('b')).toBeNull();
  });
});
