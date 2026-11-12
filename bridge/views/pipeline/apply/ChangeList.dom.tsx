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

import type { PipelineChange }        from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { SetupEdit }             from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { clickSettled, fakeControls } from '../../../testing/FakeControls.ts';
import { ChangeList }                 from './ChangeList.tsx';

afterEach(cleanup);

const CHANGES: readonly PipelineChange[] = [
  { field: 'gate:typecheck', changeKind: 'changed', editId: 'E1' },
  { field: 'gate:lint', changeKind: 'removed', editId: null },
];

const EDITS: readonly SetupEdit[] = [
  {
    editId: 'E1', by: 'agent', field: 'gate:typecheck', summary: 'Example: typecheck runs in the merge phase only.', undone: false,
  },
];

describe('the change list', () => {
  test('one card per change, worded with its kind, and Undo only where an edit made it', async () => {
    const controls = fakeControls();
    controls.render(<ChangeList setupId="S1" changeList={CHANGES} edits={EDITS} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.bridge-change-row')?.getAttribute('data-change'))).toEqual(['changed', 'removed']);
    expect(within(items[0] ?? document.body).getByText('gate · changed')).toBeDefined();
    expect(within(items[0] ?? document.body).getByText('Pipeline agent: Example: typecheck runs in the merge phase only.')).toBeDefined();
    expect(within(items[1] ?? document.body).queryByRole('button')).toBeNull();
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal: the draft moved.' });
    await clickSettled(screen.getByRole('button', { name: 'Undo the change to typecheck' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1' }]);
    expect(screen.getByRole('status').textContent).toBe('Example refusal: the draft moved.');
  });

  test('an empty list says the draft changes nothing', () => {
    fakeControls().render(<ChangeList setupId="S1" changeList={[]} edits={[]} />);
    expect(screen.getByText('The draft changes nothing yet.')).toBeDefined();
  });
});
