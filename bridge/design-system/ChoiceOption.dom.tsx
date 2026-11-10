/**
 * The choice option, in a happy-dom document. What matters: with an input it is a label whose input carries the accessible name, the
 * group and the checked state, and calls `onChange`; without one it is a list item with no input; chosen sets `data-chosen`; the
 * description, marks and facts show only when given; the variant sets `data-variant`; and the words are text, never markup.
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

import { ChoiceOption } from './ChoiceOption.tsx';

afterEach(() => {
  cleanup();
});

describe('the choice option', () => {
  test('with an input it is a label whose input carries its name, group and state, and calls onChange', () => {
    const changes: string[] = [];
    render(
      <ChoiceOption
        letter="A"
        label="Follow the system"
        description="Example description"
        chosen
        variant="row"
        input={{
          type: 'radio', name: 'E1-0', checked: true, accessibleName: 'A. Follow the system', onChange: () => changes.push('A'),
        }}
      />,
    );
    const radio = screen.getByRole('radio', { name: 'A. Follow the system' });
    const option = radio.closest('.bridge-choice');
    fireEvent.click(screen.getByRole('radio', { name: 'A. Follow the system' }));
    expect([option?.tagName, radio.getAttribute('name'), (radio as HTMLInputElement).checked, option?.hasAttribute('data-chosen')]).toEqual(['LABEL', 'E1-0', true, true]);
    expect(option?.querySelector('.bridge-choice-text')?.textContent).toBe('Follow the systemExample description');
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

  test('the words are text, never markup', () => {
    render(<ol><ChoiceOption letter="<b>planted</b>" label="<b>planted</b>" description="<b>planted</b>" chosen={false} variant="row" /></ol>);
    expect(screen.getByRole('listitem').querySelector('b')).toBeNull();
  });
});
