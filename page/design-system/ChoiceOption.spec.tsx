/**
 * The choice option. What matters: the whole card is the label of a radio in the named group, checked only when chosen; choosing it calls
 * onChoose; the title and the line of consequence are its text; the chosen card is marked for its ink ring.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { ChoiceOption }     from './ChoiceOption.tsx';

function choiceOf(chosen: boolean, choices: string[] = []) {
  return ReactElementTree.unfolded(
    <ChoiceOption
      name="stop-example-storefront"
      title="Stop the Overseer only"
      consequence="The 4 agents finish what they are on under their Watchers."
      chosen={chosen}
      onChoose={() => choices.push('chosen')}
    />,
  );
}

describe('the choice option', () => {
  test('the card is the label of a radio in the named group, with its title and consequence as its text', () => {
    const unfolded = choiceOf(true);
    const card = ReactElementTree.onlyWithClass(unfolded, 'gaia-choice');
    const radio = ReactElementTree.onlyWithTag([card], 'input');
    expect([card.tag, radio.props['type'], radio.props['name'], radio.props['checked']]).toEqual(['label', 'radio', 'stop-example-storefront', true]);
    expect(ReactElementTree.textOf(unfolded)).toBe('Stop the Overseer onlyThe 4 agents finish what they are on under their Watchers.');
  });

  test('only the chosen card is checked and marked', () => {
    const marksOf = (chosen: boolean) => {
      const unfolded = choiceOf(chosen);
      return [ReactElementTree.onlyWithClass(unfolded, 'gaia-choice').props['data-chosen'], ReactElementTree.onlyWithTag(unfolded, 'input').props['checked']];
    };
    expect([marksOf(true), marksOf(false)]).toEqual([['', true], [undefined, false]]);
  });

  test('choosing the radio calls onChoose', () => {
    const choices: string[] = [];
    ReactElementTree.dispatch(ReactElementTree.onlyWithTag(choiceOf(false, choices), 'input'), 'onChange');
    expect(choices).toEqual(['chosen']);
  });
});
