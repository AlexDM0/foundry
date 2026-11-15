/**
 * The pending step. What matters: it is a status, not an alert, that leads with its word and then its sentence; it holds the control that
 * takes the step as given; and its dismiss button is the package's icon button, named and titled, and calls onDismiss.
 */
import { describe, expect, test } from 'bun:test';

import { Button } from 'design-system/Button';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { PendingStep }      from './PendingStep.tsx';

function pendingStepOf(presses: string[]) {
  return ReactElementTree.unfolded(
    <PendingStep
      word="Updated; restart pending."
      sentence="Its Overseer runs the old code until it restarts."
      action={<Button label="Restart" emphasis="quiet" compact onPress={() => presses.push('restart')} />}
      dismissLabel="Dismiss the pending restart"
      onDismiss={() => presses.push('dismiss')}
    />,
  );
}

describe('the pending step', () => {
  test('it is a status that leads with its word, then its sentence', () => {
    const unfolded = pendingStepOf([]);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-pending-step').props['role']).toBe('status');
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'gaia-pending-step-word')])).toBe('Updated; restart pending.');
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'gaia-pending-step-text')]))
      .toBe('Updated; restart pending. Its Overseer runs the old code until it restarts.');
  });

  test('the control it holds and the named dismiss button call their own handlers', () => {
    const presses: string[] = [];
    const [restart, dismiss] = ReactElementTree.hostElementsIn(pendingStepOf(presses), ReactElementTree.withTag('button'));
    if (restart === undefined || dismiss === undefined) throw new Error('A pending step button is missing.');
    expect([ReactElementTree.textOf([restart]), dismiss.props['className'], dismiss.props['aria-label'], dismiss.props['title']])
      .toEqual(['Restart', 'design-system-icon-button', 'Dismiss the pending restart', 'Dismiss the pending restart']);
    ReactElementTree.dispatch(restart, 'onClick');
    ReactElementTree.dispatch(dismiss, 'onClick');
    expect(presses).toEqual(['restart', 'dismiss']);
  });
});
