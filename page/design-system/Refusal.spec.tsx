/**
 * The refusal. What matters: it is an alert that says which command the forge refused, or which one Gaia could not carry out when Gaia
 * refused or nothing answered, so no forge is blamed for what it was never asked; the code is in mono and the sentence unedited; "Try again"
 * shows only when the command can be sent again, as the package's compact secondary button, never a red one; the dismiss button is the
 * package's icon button, named and titled, and calls onDismiss.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree }        from '../testing/ReactElementTree.ts';
import { Refusal, type RefusedBy } from './Refusal.tsx';

function refusalOf(presses: string[], canTryAgain: boolean, refusedBy: RefusedBy = 'forge') {
  return ReactElementTree.unfolded(
    <Refusal
      commandLabel="Stop"
      refusedBy={refusedBy}
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

  test('a refusal Gaia gave, or one nothing answered, says Gaia could not carry out the command and never that the forge refused it', () => {
    const text = ReactElementTree.textOf([ReactElementTree.onlyWithClass(refusalOf([], false, 'gaia'), 'gaia-refusal-text')]);
    expect(text).toBe('Gaia could not Stop: overseer-still-live. The Overseer did not stop within its tries.');
  });

  test('Try again and the named dismiss button call their own handlers', () => {
    const presses: string[] = [];
    const [tryAgain, dismiss] = ReactElementTree.hostElementsIn(refusalOf(presses, true), ReactElementTree.withTag('button'));
    if (tryAgain === undefined || dismiss === undefined) throw new Error('A refusal button is missing.');
    expect([ReactElementTree.textOf([tryAgain]), tryAgain.props['data-compact'], tryAgain.props['data-primary'], tryAgain.props['data-danger']])
      .toEqual(['Try again', '', undefined, undefined]);
    expect([dismiss.props['className'], dismiss.props['aria-label'], dismiss.props['title']])
      .toEqual(['design-system-icon-button', 'Dismiss this refusal', 'Dismiss this refusal']);
    ReactElementTree.dispatch(tryAgain, 'onClick');
    ReactElementTree.dispatch(dismiss, 'onClick');
    expect(presses).toEqual(['try again', 'dismiss']);
  });

  test('without a way to try again only the dismiss button shows', () => {
    const buttons = ReactElementTree.hostElementsIn(refusalOf([], false), ReactElementTree.withTag('button'));
    expect(buttons.map((button) => button.props['aria-label'])).toEqual(['Dismiss this refusal']);
  });
});
