/**
 * The copy between entities (MonoCopyGates) in a happy-dom document, against fake controls. What matters: it opens on the entity it was
 * asked from and offers every other entity as a target; with no target the foot says what to pick and Copy sends nothing; ticking a target
 * and a part previews each changed target and its replaced gates, and Copy sends the set as one copy and closes once applied; a new source
 * drops itself from the targets.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Pipeline, PipelineEntity } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { clickSettled, fakeControls }    from '../../../testing/FakeControls.ts';
import { CopyBetweenEntitiesDialog }     from './CopyBetweenEntitiesDialog.tsx';

afterEach(cleanup);

const NO_PHASES = { build: [], review: [], merge: [] };

const WEB: PipelineEntity = {
  kind: 'app', home: ['/apps/web'], prepare: [], gates: [{ name: 'typecheck', run: 'tsc' }], phases: { build: ['typecheck'], review: [], merge: [] },
};

const ADMIN: PipelineEntity = {
  kind: 'app', home: ['/apps/admin'], prepare: [], gates: [{ name: 'typecheck', run: 'tsc --noEmit' }], phases: { build: ['typecheck'], review: [], merge: [] },
};

const DRAFT: Pipeline = {
  version:  3,
  prepare:  [],
  gates:    [],
  phases:   NO_PHASES,
  entities: {
    web:   WEB,
    admin: ADMIN,
    root:  {
      kind: 'root', home: ['/'], prepare: [], gates: [], phases: NO_PHASES,
    },
  },
};

function renderCopy() {
  const controls = fakeControls();
  const closes: string[] = [];
  controls.render(
    <CopyBetweenEntitiesDialog wholeDraft={DRAFT} fromEntityKey="web" target={{ setupId: 'S1', draftRevision: 7 }} onClose={() => closes.push('closed')} />,
  );
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
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 7, edits: [{ target: 'within-entity', entityKey: 'admin', edit: { target: 'gate', name: 'typecheck', value: { name: 'typecheck', run: 'tsc' } } }], isACopy: true,
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
