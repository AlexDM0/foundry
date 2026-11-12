/**
 * The refusal. What matters: it is an alert that says which command the forge refused, with the forge's code in mono and its own sentence
 * unedited; "Try again" shows only when the command can be sent again; the dismiss button is named and calls onDismiss.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Refusal }          from './Refusal.tsx';

function refusalOf(presses: string[], canTryAgain: boolean) {
  return ReactElementTree.unfolded(
    <Refusal
      commandLabel="Stop"
      code="overseer-still-live"
      sentence="The Overseer did not stop within its tries."
      onDismiss={() => presses.push('dismiss')}
      {...(canTryAgain ? { onTryAgain: () => presses.push('try again') } : {})}
    />,
  );
}

describe('the refusal', () => {
  test('it is an alert with the refused command, the forge\'s code in mono and its sentence', () => {
    const unfolded = refusalOf([], true);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-refusal').props['role']).toBe('alert');
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'gaia-refusal-code')])).toBe('overseer-still-live');
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'gaia-refusal-text')]))
      .toBe('The forge refused Stop: overseer-still-live. The Overseer did not stop within its tries.');
  });

  test('Try again and the named dismiss button call their own handlers', () => {
    const presses: string[] = [];
    const [tryAgain, dismiss] = ReactElementTree.hostElementsIn(refusalOf(presses, true), ReactElementTree.withClass('gaia-button'));
    if (tryAgain === undefined || dismiss === undefined) throw new Error('A refusal button is missing.');
    expect([ReactElementTree.textOf([tryAgain]), dismiss.props['aria-label']]).toEqual(['Try again', 'Dismiss this refusal']);
    ReactElementTree.dispatch(tryAgain, 'onClick');
    ReactElementTree.dispatch(dismiss, 'onClick');
    expect(presses).toEqual(['try again', 'dismiss']);
  });

  test('without a way to try again only the dismiss button shows', () => {
    const buttons = ReactElementTree.hostElementsIn(refusalOf([], false), ReactElementTree.withClass('gaia-button'));
    expect(buttons.map((button) => button.props['aria-label'])).toEqual(['Dismiss this refusal']);
  });
});
