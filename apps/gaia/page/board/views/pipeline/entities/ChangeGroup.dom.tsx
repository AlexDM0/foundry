/**
 * A level's group of the Changes list in a happy-dom document, against fake controls. What matters: the head names the level with its
 * count and folds the group; a change card's Undo sends that edit; a copy's batch card names the set, undoes it with one press as
 * `pipeline-draft-undo` with `wholeBatch` for the set's first edit at its level, and unfolds each edit with its own Undo; a copy to two
 * entities gives the second entity's group a set that counts and undoes its own edits only.
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
import { ChangeGroup }                                      from './ChangeGroup.tsx';
import { ChangeGroupModel }                                 from './ChangeGroupModel.ts';

afterEach(cleanup);

const CHANGES: readonly BoardPipelineChangeDocument[] = [
  { field: 'entity:admin/gate:lint', changeKind: 'new', editId: 'E3' },
  { field: 'entity:admin/gate:test', changeKind: 'new', editId: 'E4' },
  { field: 'entity:admin/whitelist', changeKind: 'new', editId: 'E6' },
];

const EDITS: readonly BoardSetupEditDocument[] = [
  {
    editId: 'E3', by: 'user', field: 'entity:admin/gate:lint', summary: 'Copied gates from web', undone: false, batch: 'E3',
  },
  {
    editId: 'E4', by: 'user', field: 'entity:admin/gate:test', summary: 'Copied gates from web', undone: false, batch: 'E3',
  },
  {
    editId: 'E6', by: 'user', field: 'entity:admin/whitelist', summary: '', undone: false, batch: null,
  },
];

function adminGroup() {
  const group = ChangeGroupModel.groupsOf(CHANGES, EDITS, ['admin'])[0];
  if (group === undefined) throw new Error('no group for admin');
  return group;
}

describe('a level\'s group of changes', () => {
  test('the head names the level with its count and folds the group', async () => {
    fakeControls().render(onBoard(<ChangeGroup setupId="S1" group={adminGroup()} />));
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
    controls.render(onBoard(<ChangeGroup setupId="S1" group={adminGroup()} />));
    expect(screen.getByText('packages it may cross into · new')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Undo the change to Whitelist' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E6', wholeBatch: false
    }]);
  });

  test('a batch card undoes the set with one press and unfolds each edit with its own Undo', async () => {
    const controls = fakeControls();
    controls.render(onBoard(<ChangeGroup setupId="S1" group={adminGroup()} />));
    expect(screen.getByText('Copied gates from web')).toBeDefined();
    expect(screen.getByText('2 edits')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Undo all 2: Copied gates from web' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E3', wholeBatch: true
    }]);
    expect(screen.queryByRole('button', { name: 'Undo the change to lint' })).toBeNull();
    const disclosure = screen.getByRole('button', { name: 'Show the 2 edits' });
    await clickSettled(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    const edits = screen.getByRole('list', { name: 'Copied gates from web' });
    expect(within(edits).getAllByRole('listitem')).toHaveLength(2);
    await clickSettled(within(edits).getByRole('button', { name: 'Undo the change to test' }));
    expect(controls.sent.at(-1)).toEqual({
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E4', wholeBatch: false
    });
    expect(screen.getByRole('button', { name: 'Hide the 2 edits' })).toBeDefined();
  });

  test('a copy to two entities gives the second entity\'s group a set that counts and undoes its own edits only', async () => {
    const copyChanges: readonly BoardPipelineChangeDocument[] = [
      { field: 'entity:api/gate:lint', changeKind: 'new', editId: 'E1' },
      { field: 'entity:api/gate:test', changeKind: 'new', editId: 'E2' },
      { field: 'entity:docs/gate:lint', changeKind: 'new', editId: 'E3' },
      { field: 'entity:docs/gate:test', changeKind: 'new', editId: 'E4' },
    ];
    const copyEdits: BoardSetupEditDocument[] = copyChanges.map((change) => ({
      editId: change.editId ?? '', by: 'user', field: change.field, summary: 'Copied gates from web', undone: false, batch: 'E1',
    }));
    const docsGroup = ChangeGroupModel.groupsOf(copyChanges, copyEdits, ['api', 'docs'])[1];
    if (docsGroup === undefined) throw new Error('no group for docs');
    const controls = fakeControls();
    controls.render(onBoard(<ChangeGroup setupId="S1" group={docsGroup} />));
    expect(screen.getByRole('button', { name: 'docs, 2 changes' })).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Undo all 2: Copied gates from web' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E3', wholeBatch: true
    }]);
  });
});
