/**
 * The dialog. What matters: it is a modal dialog named by its title, holding its content and then its actions; Escape closes it and goes
 * no further, another key does nothing; the backdrop has no click handler, so a stray click loses no half-filled form.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Button }           from './Button.tsx';
import { Dialog }           from './Dialog.tsx';

function dialogOf(closes: string[]) {
  return ReactElementTree.unfolded(
    <Dialog title="Add a repository" actions={<Button label="Cancel" onPress={() => closes.push('cancel')} />} onClose={() => closes.push('close')}>
      Repository folder
    </Dialog>,
  );
}

describe('the dialog', () => {
  test('it is a modal dialog named by its title, with its content and then its actions', () => {
    const unfolded = dialogOf([]);
    const dialog = ReactElementTree.onlyWithClass(unfolded, 'gaia-dialog');
    expect([dialog.props['role'], dialog.props['aria-modal'], dialog.props['aria-label'], dialog.props['tabIndex']]).toEqual(['dialog', 'true', 'Add a repository', -1]);
    expect(ReactElementTree.textOf(unfolded)).toBe('Add a repositoryRepository folderCancel');
  });

  test('Escape closes it and stops there, and another key does nothing', () => {
    const closes: string[] = [];
    const stopped: string[] = [];
    const backdrop = ReactElementTree.onlyWithClass(dialogOf(closes), 'gaia-dialog-backdrop');
    ReactElementTree.dispatch(backdrop, 'onKeyDown', { key: 'Enter', stopPropagation: () => stopped.push('Enter') });
    ReactElementTree.dispatch(backdrop, 'onKeyDown', { key: 'Escape', stopPropagation: () => stopped.push('Escape') });
    expect([closes, stopped]).toEqual([['close'], ['Escape']]);
  });

  test('the backdrop has no click handler, so a stray click does not close it', () => {
    expect(ReactElementTree.onlyWithClass(dialogOf([]), 'gaia-dialog-backdrop').props['onClick']).toBeUndefined();
  });
});
