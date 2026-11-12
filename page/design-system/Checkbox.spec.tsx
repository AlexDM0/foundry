/** The checkbox. What matters: the box sits inside its label, a change hands on the new state, and the line of explanation shows only when given. */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Checkbox }         from './Checkbox.tsx';

describe('the checkbox', () => {
  test('the box sits inside its label and a change hands on the new state', () => {
    const states: boolean[] = [];
    const unfolded = ReactElementTree.unfolded(<Checkbox label="Start the running forges at login" checked={false} onChange={(checked) => states.push(checked)} />);
    const label = ReactElementTree.onlyWithClass(unfolded, 'gaia-checkbox');
    const box = ReactElementTree.onlyWithTag([label], 'input');
    expect([label.tag, box.props['type'], box.props['checked'], box.props['disabled']]).toEqual(['label', 'checkbox', false, false]);
    ReactElementTree.dispatch(box, 'onChange', { currentTarget: { checked: true } });
    expect(states).toEqual([true]);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-checkbox-explanation'))).toEqual([]);
  });

  test('the explanation follows the label when given, and disabled reaches the box', () => {
    const unfolded = ReactElementTree.unfolded(
      <Checkbox label="Escalated questions" explanation="A question a forge escalated to you." checked onChange={() => undefined} disabled />,
    );
    expect(ReactElementTree.textOf(unfolded)).toBe('Escalated questionsA question a forge escalated to you.');
    expect(ReactElementTree.onlyWithTag(unfolded, 'input').props['disabled']).toBe(true);
  });
});
