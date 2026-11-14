/** The Forges view's dialogs' dismissal. What matters: Escape and the close button close the dialog; a click on the backdrop never does. */
import { describe, expect, test } from 'bun:test';

import { FormDialogUtil } from './FormDialogUtil.ts';

describe('a form dialog\'s dismissal', () => {
  test('closes on Escape and on its close button, and never on a click beside it', () => {
    const closed: number[] = [];
    const dismiss = FormDialogUtil.dismissalOf(() => closed.push(1));
    dismiss('backdrop');
    expect(closed).toEqual([]);
    dismiss('escape');
    dismiss('close');
    expect(closed).toEqual([1, 1]);
  });

  test('is as wide as each board draws its dialog', () => {
    expect([FormDialogUtil.ADD_REPOSITORY_WIDTH, FormDialogUtil.WHAT_NOTIFIES_WIDTH]).toEqual(['widest', 'wide']);
  });
});
