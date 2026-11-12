/**
 * The choice option, in a happy-dom document. What matters: with an input it is a label whose input carries the accessible name, the
 * group and the checked state, and a click anywhere on it calls `onChange`; without one it is a list item with no input; chosen sets
 * `data-chosen`; the description, marks and facts show only when given; the variant sets `data-variant` and the tone `data-tone`; the
 * Other option's text field takes the focus when the option is chosen, chooses the option once when it takes the focus itself, and hands
 * each typed value on; the recommended mark is a word in its own class, never the intake drafts' mark; and the words are text, never
 * markup.
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

import { ChoiceMark, ChoiceOption } from './ChoiceOption.tsx';

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
        input={{
          type: 'radio', name: 'E1-0', checked: true, accessibleName: 'A. Follow the system', onChange: () => undefined,
        }}
      />,
    );
    const radio = screen.getByRole('radio', { name: 'A. Follow the system' });
    const option = radio.closest('.bridge-choice');
    expect([option?.tagName, radio.getAttribute('name'), (radio as HTMLInputElement).checked, option?.hasAttribute('data-chosen')]).toEqual(['LABEL', 'E1-0', true, true]);
    expect(option?.querySelector('.bridge-choice-text')?.textContent).toBe('Follow the systemExample description');
  });

  test('a click anywhere on an unchosen option calls onChange', () => {
    const changes: string[] = [];
    render(
      <ChoiceOption
        letter="B"
        label="Always dark"
        chosen={false}
        variant="row"
        input={{
          type: 'checkbox', name: 'E1-1', checked: false, accessibleName: 'B. Always dark', onChange: () => changes.push('B'),
        }}
      />,
    );
    fireEvent.click(screen.getByText('Always dark'));
    expect(changes).toEqual(['B']);
  });

  test('without an input it is a list item with no input, its marks after the text', () => {
    render(<ol><ChoiceOption letter="B" label="Always dark" chosen={false} variant="row" marks={<span>recommended</span>} /></ol>);
    const option = screen.getByRole('listitem');
    expect([option.className, option.querySelector('input'), option.hasAttribute('data-chosen'), option.lastElementChild?.textContent])
      .toEqual(['bridge-choice', null, false, 'recommended']);
    expect([option.querySelector('.bridge-choice-description'), option.querySelector('.bridge-choice-facts')]).toEqual([null, null]);
  });

  test('facts show under the text, and the card variant sets data-variant', () => {
    render(<ol><ChoiceOption letter="C" label="Example" chosen={false} variant="card" facts={<span>touches bridge/</span>} /></ol>);
    const option = screen.getByRole('listitem');
    expect([option.getAttribute('data-variant'), option.querySelector('.bridge-choice-text .bridge-choice-facts')?.textContent]).toEqual(['card', 'touches bridge/']);
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
        input={{
          type: 'radio', name: 'E2-0', checked: false, accessibleName: 'Other', onChange: () => changes.push('other'),
        }}
        freeText={{
          value: '', placeholder: 'Describe another way', accessibleName: 'Other answer', onChange: () => undefined,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    const textField = screen.getByRole('textbox', { name: 'Other answer' });
    expect([document.activeElement === textField, changes, textField.getAttribute('placeholder')]).toEqual([true, ['other'], 'Describe another way']);
    expect(textField.closest('.bridge-choice')?.getAttribute('data-tone')).toBe('question');
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
        input={{
          type: 'radio', name: 'E2-1', checked: false, accessibleName: 'Other', onChange: () => changes.push('other'),
        }}
        freeText={{
          value: '', placeholder: 'Describe another way', accessibleName: 'Other answer', onChange: (value) => typed.push(value),
        }}
      />,
    );
    const textField = screen.getByRole('textbox', { name: 'Other answer' });
    textField.focus();
    fireEvent.change(textField, { target: { value: 'Run it nightly' } });
    expect([changes, typed]).toEqual([['other'], ['Run it nightly']]);
  });

  test('without free text there is no text field, and without a tone no data-tone', () => {
    const { container } = render(
      <ChoiceOption
        letter="A"
        label="Example"
        chosen={false}
        variant="card"
        input={{
          type: 'radio', name: 'E2-2', checked: false, accessibleName: 'Example', onChange: () => undefined,
        }}
      />,
    );
    expect([screen.queryByRole('textbox'), container.querySelector('.bridge-choice')?.hasAttribute('data-tone')]).toEqual([null, false]);
  });

  test('the recommended mark is a word in its own class, never the intake drafts\' mark', () => {
    render(<ol><ChoiceOption letter="A" label="Example" chosen={false} variant="card" marks={<ChoiceMark mark="recommended" text="Recommended" />} /></ol>);
    const mark = screen.getByText('Recommended');
    expect([mark.className, mark.getAttribute('data-mark'), screen.getByRole('listitem').querySelector('.bridge-draft-mark')])
      .toEqual(['bridge-choice-mark', 'recommended', null]);
  });

  test('the words are text, never markup', () => {
    render(<ol><ChoiceOption letter="<b>planted</b>" label="<b>planted</b>" description="<b>planted</b>" chosen={false} variant="row" /></ol>);
    expect(screen.getByRole('listitem').querySelector('b')).toBeNull();
  });
});
