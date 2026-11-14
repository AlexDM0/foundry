/**
 * The choice option, in a happy-dom document. What matters: with a `ChoiceInput` it is a label whose input carries the accessible name, the group
 * and the checked state, and a click anywhere on it calls `onChange`; without one it is a list item with no input; chosen sets
 * `data-chosen`; the description, marks and facts show only when given; the variant sets `data-variant`, the tone `data-tone`, a size other
 * than the standard one `data-size` and mono `data-mono`; an option with no letter shows none; the Other option's text field takes the
 * focus when the option is chosen, chooses the option once when it takes the focus itself, and hands each typed value on; a text field
 * without an input does not compile; the recommended mark is a word in its own class; and the words are text, never markup.
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

import {
  ChoiceFreeText,
  ChoiceInput,
  ChoiceMark,
  ChoiceOption
} from './ChoiceOption.tsx';

afterEach(() => {
  cleanup();
});

describe('the choice option', () => {
  test('with an input it is a label whose input carries its name, group and state', () => {
    render(
      <ChoiceOption
        letter="A"
        label="Follow the system"
        description="Example description"
        chosen
        variant="row"
        input={<ChoiceInput type="radio" name="E1-0" checked accessibleName="A. Follow the system" onChange={() => undefined} />}
      />,
    );
    const radio = screen.getByRole('radio', { name: 'A. Follow the system' });
    const option = radio.closest('.design-system-choice');
    expect([option?.tagName, radio.getAttribute('name'), (radio as HTMLInputElement).checked, option?.hasAttribute('data-chosen')]).toEqual(['LABEL', 'E1-0', true, true]);
    expect(option?.querySelector('.design-system-choice-text')?.textContent).toBe('Follow the systemExample description');
  });

  test('a click anywhere on an unchosen option calls onChange', () => {
    const changes: string[] = [];
    render(
      <ChoiceOption
        letter="B"
        label="Always dark"
        chosen={false}
        variant="row"
        input={<ChoiceInput type="checkbox" name="E1-1" checked={false} accessibleName="B. Always dark" onChange={() => changes.push('B')} />}
      />,
    );
    fireEvent.click(screen.getByText('Always dark'));
    expect(changes).toEqual(['B']);
  });

  test('without an input it is a list item with no input, its marks after the text', () => {
    render(<ol><ChoiceOption letter="B" label="Always dark" chosen={false} variant="row" marks={<span>recommended</span>} /></ol>);
    const option = screen.getByRole('listitem');
    expect([option.className, option.querySelector('input'), option.hasAttribute('data-chosen'), option.lastElementChild?.textContent])
      .toEqual(['design-system-choice', null, false, 'recommended']);
    expect([option.querySelector('.design-system-choice-description'), option.querySelector('.design-system-choice-facts')]).toEqual([null, null]);
  });

  test('facts show under the text, and the card variant sets data-variant', () => {
    render(<ol><ChoiceOption letter="C" label="Example" chosen={false} variant="card" facts={<span>touches docs/</span>} /></ol>);
    const option = screen.getByRole('listitem');
    expect([option.getAttribute('data-variant'), option.querySelector('.design-system-choice-text .design-system-choice-facts')?.textContent]).toEqual(['card', 'touches docs/']);
  });

  test('choosing the Other option moves the focus into its text field, and calls onChange once', () => {
    const changes: string[] = [];
    render(
      <ChoiceOption
        letter="C"
        label="Other"
        chosen={false}
        variant="card"
        tone="question"
        input={<ChoiceInput type="radio" name="E2-0" checked={false} accessibleName="Other" onChange={() => changes.push('other')} />}
        freeText={<ChoiceFreeText value="" placeholder="Describe another way" accessibleName="Other answer" onChange={() => undefined} />}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    const textField = screen.getByRole('textbox', { name: 'Other answer' });
    expect([document.activeElement === textField, changes, textField.getAttribute('placeholder')]).toEqual([true, ['other'], 'Describe another way']);
    expect(textField.closest('.design-system-choice')?.getAttribute('data-tone')).toBe('question');
  });

  test('the text field chooses the Other option when it takes the focus itself, and hands each typed value on', () => {
    const changes: string[] = [];
    const typed: string[] = [];
    render(
      <ChoiceOption
        letter="C"
        label="Other"
        chosen={false}
        variant="card"
        input={<ChoiceInput type="radio" name="E2-1" checked={false} accessibleName="Other" onChange={() => changes.push('other')} />}
        freeText={<ChoiceFreeText value="" placeholder="Describe another way" accessibleName="Other answer" onChange={(value) => typed.push(value)} />}
      />,
    );
    const textField = screen.getByRole('textbox', { name: 'Other answer' });
    textField.focus();
    fireEvent.change(textField, { target: { value: 'Run it nightly' } });
    expect([changes, typed]).toEqual([['other'], ['Run it nightly']]);
  });

  test('a size other than the standard one sets data-size, mono sets data-mono, and the standard option sets neither', () => {
    const { container } = render(
      <ol>
        <ChoiceOption letter="A" label="Compact" chosen={false} variant="card" size="compact" mono />
        <ChoiceOption letter="B" label="Large" chosen={false} variant="card" size="large" />
        <ChoiceOption letter="C" label="Roomy" chosen={false} variant="card" size="roomy" />
        <ChoiceOption letter="D" label="Standard" chosen={false} variant="card" size="standard" />
      </ol>,
    );
    const options = [...container.querySelectorAll('.design-system-choice')];
    expect(options.map((option) => [option.getAttribute('data-size'), option.hasAttribute('data-mono')]))
      .toEqual([['compact', true], ['large', false], ['roomy', false], [null, false]]);
  });

  test('an option with no letter shows none, and keeps its label', () => {
    render(<ol><ChoiceOption label="Subscription" chosen={false} variant="card" /></ol>);
    const option = screen.getByRole('listitem');
    expect([option.querySelector('.design-system-choice-letter'), option.textContent]).toEqual([null, 'Subscription']);
  });

  test('without free text there is no text field, and without a tone no data-tone', () => {
    const { container } = render(
      <ChoiceOption
        letter="A"
        label="Example"
        chosen={false}
        variant="card"
        input={<ChoiceInput type="radio" name="E2-2" checked={false} accessibleName="Example" onChange={() => undefined} />}
      />,
    );
    expect([screen.queryByRole('textbox'), container.querySelector('.design-system-choice')?.hasAttribute('data-tone')]).toEqual([null, false]);
  });

  test('the recommended mark is a word in its own class of the package', () => {
    render(<ol><ChoiceOption letter="A" label="Example" chosen={false} variant="card" marks={<ChoiceMark mark="recommended" text="Recommended" />} /></ol>);
    const mark = screen.getByText('Recommended');
    expect([mark.className, mark.getAttribute('data-mark')]).toEqual(['design-system-choice-mark', 'recommended']);
  });

  test('a text field of the option\'s own words without an input does not compile', () => {
    const freeText = <ChoiceFreeText value="" placeholder="Example words" accessibleName="Other answer" onChange={() => undefined} />;
    // @ts-expect-error only an option that chooses takes a text field
    const freeTextWithoutInput = <ChoiceOption label="Other" chosen={false} variant="card" freeText={freeText} />;
    expect(freeTextWithoutInput).toBeDefined();
  });

  test('the words are text, never markup', () => {
    render(<ol><ChoiceOption letter="<b>planted</b>" label="<b>planted</b>" description="<b>planted</b>" chosen={false} variant="row" /></ol>);
    expect(screen.getByRole('listitem').querySelector('b')).toBeNull();
  });
});
