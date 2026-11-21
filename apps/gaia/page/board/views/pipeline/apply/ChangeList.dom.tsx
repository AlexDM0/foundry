/**
 * The change list in a happy-dom document, against fake controls. What matters: one card per change in the facts' order, its kind in its
 * words and its `data-change`; only a change an edit made offers Undo, which sends that edit and shows a refusal verbatim; an empty list
 * says the draft changes nothing.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardPipelineChangeDocument }                 from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardSetupEditDocument }                      from '../../../../@types/board/BoardPipelineDocuments.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../../testing/FakeControls.ts';
import { onBoard }                                          from '../../../testing/OnBoard.ts';
import { ChangeList }                                       from './ChangeList.tsx';

afterEach(cleanup);

const CHANGES: readonly BoardPipelineChangeDocument[] = [
  { field: 'gate:typecheck', changeKind: 'changed', editId: 'E1' },
  { field: 'gate:lint', changeKind: 'removed', editId: null },
];

const EDITS: readonly BoardSetupEditDocument[] = [
  {
    editId: 'E1', by: 'agent', field: 'gate:typecheck', summary: 'Example: typecheck runs in the merge phase only.', undone: false, batch: null,
  },
];

describe('the change list', () => {
  test('one card per change, worded with its kind, and Undo only where an edit made it', async () => {
    const controls = fakeControls();
    controls.render(onBoard(<ChangeList setupId="S1" changeList={CHANGES} edits={EDITS} />));
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.design-system-change-row')?.getAttribute('data-change'))).toEqual(['changed', 'removed']);
    expect(within(items[0] ?? document.body).getByText('gate · changed')).toBeDefined();
    expect(within(items[0] ?? document.body).getByText('Pipeline agent: Example: typecheck runs in the merge phase only.')).toBeDefined();
    expect(within(items[1] ?? document.body).queryByRole('button')).toBeNull();
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal: the draft moved.' });
    await clickSettled(screen.getByRole('button', { name: 'Undo the change to typecheck' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1', wholeBatch: false
    }]);
    expect(screen.getByRole('status').textContent).toBe('Example refusal: the draft moved.');
  });

  test('an empty list says the draft changes nothing', () => {
    fakeControls().render(onBoard(<ChangeList setupId="S1" changeList={[]} edits={[]} />));
    expect(screen.getByText('The draft changes nothing yet.')).toBeDefined();
  });
});
