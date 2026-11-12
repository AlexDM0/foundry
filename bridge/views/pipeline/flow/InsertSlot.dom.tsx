/**
 * The + of a missing step in a happy-dom document. What matters: the trigger is named for where it adds; its menu opens under its heading
 * with one item per offered step; an edit choice hands its edits on, a gate choice asks for the Gate dialog, and a disabled slot hands
 * nothing on.
 */
import { cleanup, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { GatePhase }             from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import { clickSettled, fakeControls } from '../../../testing/FakeControls.ts';
import { InsertSlot }                 from './InsertSlot.tsx';
import type { FlowDraftEdit }         from './PipelineFlowModel.ts';
import { PipelineFlowModel }          from './PipelineFlowModel.ts';

afterEach(cleanup);

const SLOT = PipelineFlowModel.slotViewOf({ slotId: 'airlock', after: 'merge-in-airlock', offeredSteps: ['merge-gates', 'airlock-re-review'] }, 'merge-train', null);

function renderSlot(disabled = false) {
  const edits: (readonly FlowDraftEdit[])[] = [];
  const phases: GatePhase[] = [];
  fakeControls().render(<InsertSlot slot={SLOT} disabled={disabled} onEdits={(chosen) => edits.push(chosen)} onNewGate={(phase) => phases.push(phase)} />);
  return { edits, phases };
}

describe('an insert slot', () => {
  test('opens its menu under its heading, one item per offered step', async () => {
    renderSlot();
    const trigger = screen.getByRole('button', { name: 'Add a step before the fast-forward' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await clickSettled(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Add in the merge train')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Merge gates' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Conditional re-review' })).toBeDefined();
  });

  test('a gate choice asks for the Gate dialog, an edit choice hands on its edits', async () => {
    const { edits, phases } = renderSlot();
    await clickSettled(screen.getByRole('button', { name: 'Add a step before the fast-forward' }));
    await clickSettled(screen.getByRole('button', { name: 'Merge gates' }));
    await clickSettled(screen.getByRole('button', { name: 'Add a step before the fast-forward' }));
    await clickSettled(screen.getByRole('button', { name: 'Conditional re-review' }));
    expect(phases).toEqual(['merge']);
    expect(edits).toEqual([[{ field: 'airlock', value: { reReview: { thresholdLines: 750 } } }]]);
  });

  test('a disabled slot hands nothing on', async () => {
    const { edits, phases } = renderSlot(true);
    await clickSettled(screen.getByRole('button', { name: 'Add a step before the fast-forward' }));
    await clickSettled(screen.getByRole('button', { name: 'Conditional re-review' }));
    expect(edits).toEqual([]);
    expect(phases).toEqual([]);
  });
});
