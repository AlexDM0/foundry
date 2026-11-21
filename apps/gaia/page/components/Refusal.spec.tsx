/**
 * The refusal. What matters: it is the package's failed action, led by which command the forge refused, or which one Gaia could not carry
 * out when Gaia refused or nothing answered, so no forge is blamed for what it was never asked; it hands on the code and the sentence
 * unedited; "Try again" is handed on only when the command can be sent again, and calls onTryAgain; the dismissal is named and calls
 * onDismiss. How the failed action draws them (an alert, the code in mono, a compact secondary button) is the package's to hold.
 */
import { describe, expect, test } from 'bun:test';
import { FailedAction }           from '../lib/design-system/DesignSystemInterface.ts';

import { type HostElement, ReactElementTree } from '../testing/ReactElementTree.ts';
import { Refusal, type RefusedBy }            from './Refusal.tsx';

function refusalOf(presses: string[], canTryAgain: boolean, refusedBy: RefusedBy = 'forge'): HostElement {
  return ReactElementTree.onlyOfComponent(ReactElementTree.unfolded(
    <Refusal
      commandLabel="Stop"
      refusedBy={refusedBy}
      code="overseer-still-live"
      sentence="The Overseer did not stop within its tries."
      onDismiss={() => presses.push('dismiss')}
      {...(canTryAgain ? { onTryAgain: () => presses.push('try again') } : {})}
    />,
  ), FailedAction);
}

describe('the refusal', () => {
  test('it is the failed action led by the refused command, with the forge\'s code and its sentence unedited', () => {
    const refusal = refusalOf([], true);
    expect([refusal.props['lead'], refusal.props['code'], refusal.props['sentence']])
      .toEqual(['The forge refused Stop: ', 'overseer-still-live', 'The Overseer did not stop within its tries.']);
  });

  test('a refusal Gaia gave, or one nothing answered, says Gaia could not carry out the command and never that the forge refused it', () => {
    expect(refusalOf([], false, 'gaia').props['lead']).toBe('Gaia could not Stop: ');
  });

  test('Try again and the named dismissal call their own handlers', () => {
    const presses: string[] = [];
    const refusal = refusalOf(presses, true);
    expect([refusal.props['retryLabel'], refusal.props['dismissLabel']]).toEqual(['Try again', 'Dismiss this refusal']);
    ReactElementTree.dispatch(refusal, 'onRetry');
    ReactElementTree.dispatch(refusal, 'onDismiss');
    expect(presses).toEqual(['try again', 'dismiss']);
  });

  test('without a way to try again only the dismissal is handed on', () => {
    const refusal = refusalOf([], false);
    expect([refusal.props['retryLabel'], refusal.props['onRetry'], refusal.props['dismissLabel']]).toEqual([undefined, undefined, 'Dismiss this refusal']);
  });
});
