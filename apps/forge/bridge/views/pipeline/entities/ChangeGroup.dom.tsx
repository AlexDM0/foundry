/**
 * A level's group of the Changes list in a happy-dom document, against fake controls. What matters: the head names the level with its
 * count and folds the group; a change card's Undo sends that edit; a copy's batch card names the set, undoes it with one press by the
 * command its caller gives, keeps that Undo disabled with none, and unfolds each edit with its own Undo.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { PipelineChange }                    from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { SetupEdit }                         from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody }                from '../../../api/CommandClient.ts';
import { clickSettled, fakeControls }             from '../../../testing/FakeControls.ts';
import { ChangeGroup }                            from './ChangeGroup.tsx';
import { ChangeGroupModel, type ChangeBatchView } from './ChangeGroupModel.ts';

afterEach(cleanup);

const CHANGES: readonly PipelineChange[] = [
  { field: 'entity:admin/gate:lint', changeKind: 'new', editId: 'E3' },
  { field: 'entity:admin/gate:test', changeKind: 'new', editId: 'E4' },
  { field: 'entity:admin/whitelist', changeKind: 'new', editId: 'E6' },
];

const EDITS: readonly SetupEdit[] = [
  {
    editId: 'E3', by: 'user', field: 'entity:admin/gate:lint', summary: 'Copied gates from web', undone: false, batch: 'E3',
  },
  {
    editId: 'E4', by: 'user', field: 'entity:admin/gate:test', summary: 'Copied gates from web', undone: false, batch: 'E3',
  },
  {
    editId: 'E6', by: 'user', field: 'entity:admin/whitelist', summary: '', undone: false,
  },
];

/** A stand-in for the set's command, which no move of the draft provides yet. */
function exampleSetUndoOf(batch: ChangeBatchView): ControlCommandBody {
  return { kind: 'pipeline-draft-undo', setupId: 'S1', editId: batch.batchId };
}

function adminGroup() {
  const group = ChangeGroupModel.groupsOf(CHANGES, EDITS, ['admin'])[0];
  if (group === undefined) throw new Error('no group for admin');
  return group;
}

describe('a level\'s group of changes', () => {
  test('the head names the level with its count and folds the group', async () => {
    fakeControls().render(<ChangeGroup setupId="S1" group={adminGroup()} batchUndoCommandOf={exampleSetUndoOf} />);
    const section = screen.getByRole('region', { name: 'admin changes' });
    const head = within(section).getByRole('button', { name: 'admin, 3 changes' });
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    await clickSettled(head);
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(within(section).queryAllByRole('listitem')).toHaveLength(0);
  });

  test('a change card\'s Undo sends its own edit', async () => {
    const controls = fakeControls();
    controls.render(<ChangeGroup setupId="S1" group={adminGroup()} batchUndoCommandOf={exampleSetUndoOf} />);
    expect(screen.getByText('packages it may cross into · new')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Undo the change to Whitelist' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E6' }]);
  });

  test('a batch card undoes the set with one press and unfolds each edit with its own Undo', async () => {
    const controls = fakeControls();
    controls.render(<ChangeGroup setupId="S1" group={adminGroup()} batchUndoCommandOf={exampleSetUndoOf} />);
    expect(screen.getByText('Copied gates from web')).toBeDefined();
    expect(screen.getByText('2 edits')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Undo all 2: Copied gates from web' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E3' }]);
    expect(screen.queryByRole('button', { name: 'Undo the change to lint' })).toBeNull();
    const disclosure = screen.getByRole('button', { name: 'Show the 2 edits' });
    await clickSettled(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    const edits = screen.getByRole('list', { name: 'Copied gates from web' });
    expect(within(edits).getAllByRole('listitem')).toHaveLength(2);
    await clickSettled(within(edits).getByRole('button', { name: 'Undo the change to test' }));
    expect(controls.sent.at(-1)).toEqual({ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E4' });
    expect(screen.getByRole('button', { name: 'Hide the 2 edits' })).toBeDefined();
  });

  test('with no command for the set, its Undo stays disabled', () => {
    fakeControls().render(<ChangeGroup setupId="S1" group={adminGroup()} batchUndoCommandOf={() => null} />);
    expect(screen.getByRole('button', { name: 'Undo all 2: Copied gates from web' }).hasAttribute('disabled')).toBe(true);
  });
});
