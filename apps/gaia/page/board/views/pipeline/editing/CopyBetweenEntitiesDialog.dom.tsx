/**
 * The copy between entities in a happy-dom document, against fake controls: the targets offered, the foot with no target, the preview
 * of each changed target, Copy sending the set as one copy, and a new source dropping itself from the targets.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../../testing/FakeControls.ts';
import { onBoard }                                          from '../../../testing/OnBoard.ts';

import { exampleEntity, exampleGate, examplePipeline } from '../../../testing/PipelineFixture.ts';
import { CopyBetweenEntitiesDialog }                   from './CopyBetweenEntitiesDialog.tsx';

afterEach(cleanup);

const WEB = exampleEntity('app', ['/apps/web'], { gates: [exampleGate('typecheck', 'tsc')], phases: { build: ['typecheck'], review: [], merge: [] } });

const ADMIN = exampleEntity('app', ['/apps/admin'], { gates: [exampleGate('typecheck', 'tsc --noEmit')], phases: { build: ['typecheck'], review: [], merge: [] } });

const DRAFT = examplePipeline({ version: 5, entities: { web: WEB, admin: ADMIN, root: exampleEntity('root', ['/']) } });

function renderCopy() {
  const controls = fakeControls();
  const closes: string[] = [];
  controls.render(onBoard(
    <CopyBetweenEntitiesDialog wholeDraft={DRAFT} fromEntityKey="web" target={{ setupId: 'S1', draftRevision: 7 }} onClose={() => closes.push('closed')} />,
  ));
  return { controls, closes, dialog: screen.getByRole('dialog', { name: 'Copy settings between entities' }) };
}

describe('the copy between entities', () => {
  test('opens on its source, offers every other entity, and with no target sends nothing', () => {
    const { controls, dialog } = renderCopy();
    expect(within(dialog).getByRole('button', { name: 'web' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(5);
    expect(within(dialog).getByText('Pick at least one entity and one thing to copy.')).toBeDefined();
    expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Copy 0 edits' }).disabled).toBe(true);
    expect(controls.sent).toEqual([]);
  });

  test('previews each changed target and sends the set as one copy, then closes', async () => {
    const { controls, closes, dialog } = renderCopy();
    await clickSettled(within(dialog).getByRole('checkbox', { name: /^admin/u }));
    const preview = within(dialog).getByRole('region', { name: 'Preview' });
    expect(preview.textContent).toBe('Makes 1 edit in admin; 1 gate replaces admin’s own typecheck.');
    await clickSettled(within(dialog).getByRole('button', { name: 'Copy 1 edit' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 7,
      edits:         [{ target: 'within-entity', entityKey: 'admin', edit: { target: 'gate', name: 'typecheck', value: exampleGate('typecheck', 'tsc') } }],
      isACopy:       true,
    }]);
    expect(closes).toEqual(['closed']);
  });

  test('a new source drops itself from the targets', async () => {
    const { dialog } = renderCopy();
    await clickSettled(within(dialog).getByRole('button', { name: 'admin' }));
    expect(within(dialog).queryByRole('checkbox', { name: /^admin/u })).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: /^web/u })).toBeDefined();
  });
});
