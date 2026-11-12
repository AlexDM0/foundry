/**
 * The confirm panel. What matters: it is a group named by what it confirms; the question, the choices when given and the line of what
 * follows come in order; Cancel and the confirming button each call their own handler, and the confirming button is the one primary;
 * while the command is on its way both are disabled.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { ConfirmPanel }     from './ConfirmPanel.tsx';

function panelOf(presses: string[], extra: { readonly choices?: string; readonly disabled?: boolean } = {}) {
  return ReactElementTree.unfolded(
    <ConfirmPanel
      label="Stop Example Storefront"
      question="Stop the Overseer of Example Storefront? 4 agents are running."
      consequence="2 questions keep waiting on you while it is stopped."
      confirmLabel="Stop"
      onConfirm={() => presses.push('confirm')}
      onCancel={() => presses.push('cancel')}
      {...extra}
    />,
  );
}

describe('the confirm panel', () => {
  test('it is a group named by what it confirms, with the question, the choices and what follows in order', () => {
    const unfolded = panelOf([], { choices: 'Stop the Overseer only' });
    const panel = ReactElementTree.onlyWithClass(unfolded, 'gaia-confirm');
    expect([panel.props['role'], panel.props['aria-label']]).toEqual(['group', 'Stop Example Storefront']);
    expect(ReactElementTree.textOf(unfolded)).toBe(
      'Stop the Overseer of Example Storefront? 4 agents are running.Stop the Overseer only2 questions keep waiting on you while it is stopped.CancelStop',
    );
  });

  test('with no choices there is no choice area, as when no agent is running', () => {
    expect(ReactElementTree.hostElementsIn(panelOf([]), ReactElementTree.withClass('gaia-confirm-choices'))).toEqual([]);
  });

  test('Cancel and the confirming button call their own handlers, and only the confirming button is primary', () => {
    const presses: string[] = [];
    const [cancel, confirm] = ReactElementTree.hostElementsIn(panelOf(presses), ReactElementTree.withClass('gaia-button'));
    if (cancel === undefined || confirm === undefined) throw new Error('A panel button is missing.');
    ReactElementTree.dispatch(cancel, 'onClick');
    ReactElementTree.dispatch(confirm, 'onClick');
    expect(presses).toEqual(['cancel', 'confirm']);
    expect([cancel.props['data-emphasis'], confirm.props['data-emphasis']]).toEqual(['plain', 'primary']);
  });

  test('while the command is on its way both buttons are disabled', () => {
    const buttons = ReactElementTree.hostElementsIn(panelOf([], { disabled: true }), ReactElementTree.withClass('gaia-button'));
    expect(buttons.map((button) => button.props['disabled'])).toEqual([true, true]);
  });
});
