/**
 * The question card, in a happy-dom document. What matters: it is a fieldset named by its legend, eyebrow and question, asking while no
 * answer was given; its options, given as children, are radios of one group, the recommended ones marked by the word in
 * `.design-system-choice-mark`; a multiple question draws checkboxes that show every chosen letter and hand on the letter toggled; choosing
 * an option hands its letter on, and choosing Other moves the focus into Other's text field; Answer waits for a choice, and for words when
 * Other is chosen; `columns` sets `data-layout`; once answered the green confirmation takes the place of the options and the answer button,
 * and the card says it is answered; disabled disables every control; an option outside a question refuses to render; and the words are
 * text, never markup.
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
import { useState, type ReactNode } from 'react';

import {
  MultipleChoiceQuestion,
  QuestionOption,
  QuestionOtherOption,
  type MultipleChoiceQuestionProps
} from './MultipleChoiceQuestion.tsx';

const NOTHING = (): void => undefined;

type QuestionOverrides = Partial<Omit<MultipleChoiceQuestionProps, 'children'>> & {
  readonly otherText?:   string;
  readonly onOtherText?: (text: string) => void;
  readonly options?:     ReactNode;
};

/** The example question: two options, A recommended, and Other as C. */
function ExampleQuestion({
  otherText = '', onOtherText = NOTHING, options, ...overrides
}: QuestionOverrides) {
  return (
    <MultipleChoiceQuestion
      eyebrow="Question"
      question="e2e needs a running database. How should the run handle it?"
      chosen={[]}
      onChoose={NOTHING}
      answerLabel="Answer"
      onAnswer={NOTHING}
      columns
      {...overrides}
    >
      {options ?? (
        <>
          <QuestionOption letter="A" label="Start the database in a container" description="A prepare step starts it." recommendedLabel="Recommended" />
          <QuestionOption letter="B" label="Leave e2e out" />
        </>
      )}
      <QuestionOtherOption
        letter="C"
        label="Other"
        placeholder="Describe another way"
        textLabel="Other answer"
        text={otherText}
        onText={onOtherText}
      />
    </MultipleChoiceQuestion>
  );
}

/** The card with its choice and Other's words held as a view would hold them. */
function HeldQuestion({ onAnswer }: { readonly onAnswer: (answer: string) => void }) {
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [otherText, setOtherText] = useState('');
  return (
    <ExampleQuestion
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
    render(<ExampleQuestion />);
    const card = screen.getByRole('group', { name: 'Question e2e needs a running database. How should the run handle it?' });
    const radios = screen.getAllByRole('radio');
    expect([card.tagName, card.className, card.getAttribute('data-state'), card.getAttribute('data-layout')])
      .toEqual(['FIELDSET', 'design-system-question-card', 'asking', 'columns']);
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Start the database in a container', 'Leave e2e out', 'Other']);
    expect(new Set(radios.map((radio) => radio.getAttribute('name'))).size).toBe(1);
  });

  test('a recommended option carries the word in .design-system-choice-mark, and the others carry none', () => {
    const { container } = render(<ExampleQuestion />);
    const marks = [...container.querySelectorAll('.design-system-choice-mark')];
    const letterOf = (mark: Element): string | null | undefined => mark.closest('.design-system-choice')?.querySelector('.design-system-choice-letter')?.textContent;
    expect(marks.map((mark) => [mark.textContent, mark.getAttribute('data-mark'), letterOf(mark)]))
      .toEqual([['Recommended', 'recommended', 'A']]);
  });

  test('choosing an option hands its letter on, and choosing Other moves the focus into its text field', () => {
    const chosenLetters: string[] = [];
    render(<ExampleQuestion onChoose={(letter) => chosenLetters.push(letter)} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Leave e2e out' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    expect([chosenLetters, document.activeElement === screen.getByRole('textbox', { name: 'Other answer' })]).toEqual([['B', 'C'], true]);
  });

  test('a multiple question draws checkboxes that show every chosen letter and hand on the letter toggled', () => {
    const chosenLetters: string[] = [];
    render(<ExampleQuestion multiple chosen={['A', 'B']} onChoose={(letter) => chosenLetters.push(letter)} />);
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
    render(<ExampleQuestion columns={false} chosen={['A']} answeredText="Answered: the database starts in a container" />);
    const card = screen.getByRole('group');
    const confirmation = screen.getByRole('status');
    expect([card.getAttribute('data-state'), card.getAttribute('data-layout'), confirmation.className, confirmation.textContent])
      .toEqual(['answered', 'stack', 'design-system-question-card-answered', 'Answered: the database starts in a container']);
    expect([screen.queryAllByRole('radio'), screen.queryByRole('button', { name: 'Answer' })]).toEqual([[], null]);
    expect(confirmation.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('disabled disables every control', () => {
    render(<ExampleQuestion chosen={['A']} disabled />);
    expect([(screen.getByRole('group') as HTMLFieldSetElement).disabled, screen.getByRole('button', { name: 'Answer' }).matches(':disabled')])
      .toEqual([true, true]);
  });

  test('an option outside a question refuses to render, naming where it belongs', () => {
    expect(() => render(<QuestionOption letter="A" label="Alone" />)).toThrow('inside a MultipleChoiceQuestion');
  });

  test('the words are text, never markup', () => {
    const planted = '<b>planted</b>';
    const { container } = render(
      <ExampleQuestion
        eyebrow={planted}
        question={planted}
        options={<QuestionOption letter="A" label={planted} description={planted} recommendedLabel={planted} />}
      />,
    );
    expect(container.querySelector('b')).toBeNull();
  });
});
