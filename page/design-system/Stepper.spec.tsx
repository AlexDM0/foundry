/**
 * The stepper. What matters: each button is named by what it changes and calls only its own handler, each side is disabled on its own,
 * so a limit at its ceiling can still be lowered, and the value is set in the size asked.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Stepper }          from './Stepper.tsx';

function stepperOf(presses: string[], raiseDisabled = false) {
  return ReactElementTree.unfolded(
    <Stepper
      value="3 / 5"
      lowerLabel="Lower this forge's agent limit"
      raiseLabel="Raise this forge's agent limit"
      onLower={() => presses.push('lower')}
      onRaise={() => presses.push('raise')}
      raiseDisabled={raiseDisabled}
    />,
  );
}

describe('the stepper', () => {
  test('each button is named by what it changes and calls its own handler', () => {
    const presses: string[] = [];
    const [lower, raise] = ReactElementTree.hostElementsIn(stepperOf(presses), ReactElementTree.withClass('gaia-stepper-button'));
    if (lower === undefined || raise === undefined) throw new Error('A stepper button is missing.');
    expect([lower.props['aria-label'], raise.props['aria-label']]).toEqual(['Lower this forge\'s agent limit', 'Raise this forge\'s agent limit']);
    ReactElementTree.dispatch(raise, 'onClick');
    ReactElementTree.dispatch(lower, 'onClick');
    expect(presses).toEqual(['raise', 'lower']);
  });

  test('a side is disabled on its own, so a limit at its ceiling can still be lowered', () => {
    const buttons = ReactElementTree.hostElementsIn(stepperOf([], true), ReactElementTree.withClass('gaia-stepper-button'));
    expect(buttons.map((button) => button.props['disabled'])).toEqual([false, true]);
  });

  test('the value sits between the buttons, in the body size unless the figure size is asked', () => {
    const unfolded = stepperOf([]);
    expect(ReactElementTree.textOf(unfolded)).toBe('−3 / 5+');
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-stepper-value').props['data-size']).toBe('body');
    const figure = ReactElementTree.unfolded(
      <Stepper
        value="12"
        lowerLabel="Lower the machine's agent limit"
        raiseLabel="Raise the machine's agent limit"
        onLower={() => undefined}
        onRaise={() => undefined}
        valueSize="figure"
      />,
    );
    expect(ReactElementTree.onlyWithClass(figure, 'gaia-stepper-value').props['data-size']).toBe('figure');
  });
});
