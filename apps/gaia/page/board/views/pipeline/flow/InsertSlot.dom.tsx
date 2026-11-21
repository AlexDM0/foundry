/**
 * The add card of a missing step in a happy-dom document. What matters: the card is named for where it adds and holds one choice per
 * offered step, each with its description; an edit choice hands its edits on, a gate choice asks for the Gate dialog, and a disabled
 * card's choices are disabled and hand nothing on.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { BoardDraftEditDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardGatePhase }         from '../../../../@types/board/BoardVocabulary.ts';
import { clickSettled, fakeControls }  from '../../../testing/FakeControls.ts';
import { onBoard }                     from '../../../testing/OnBoard.ts';

import { InsertSlot }        from './InsertSlot.tsx';
import { PipelineFlowModel } from './PipelineFlowModel.ts';

afterEach(cleanup);

const REWORK_THRESHOLD_LINES = 750;

const AIRLOCK_SLOT = { slotId: 'airlock', after: 'merge-in-airlock', offeredSteps: ['merge-gates', 'airlock-re-review'] } as const;

const SLOT = PipelineFlowModel.slotViewOf(AIRLOCK_SLOT, 'merge-train', null, REWORK_THRESHOLD_LINES);

function renderSlot(disabled = false) {
  const edits: (readonly BoardDraftEditDocument[])[] = [];
  const phases: BoardGatePhase[] = [];
  fakeControls().render(onBoard(<InsertSlot slot={SLOT} disabled={disabled} onEdits={(chosen) => edits.push(chosen)} onNewGate={(phase) => phases.push(phase)} />));
  return { edits, phases };
}

describe('an add card', () => {
  test('is named for where it adds, with one described choice per offered step', () => {
    renderSlot();
    const card = screen.getByRole('region', { name: 'Add before the fast-forward' });
    expect(within(card).getByText('Add a step')).toBeDefined();
    const choices = within(card).getAllByRole('button');
    expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual(['Merge gates', 'Conditional re-review']);
    expect(document.getElementById(choices[1]?.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Runs only when a conflict fix is large');
  });

  test('a gate choice asks for the Gate dialog, an edit choice hands on its edits', async () => {
    const { edits, phases } = renderSlot();
    await clickSettled(screen.getByRole('button', { name: 'Merge gates' }));
    await clickSettled(screen.getByRole('button', { name: 'Conditional re-review' }));
    expect(phases).toEqual(['merge']);
    expect(edits).toEqual([[{ target: 'airlock', value: { reReview: { thresholdLines: 750 } } }]]);
  });

  test('a disabled card\'s choices are disabled and hand nothing on', async () => {
    const { edits, phases } = renderSlot(true);
    const choice = screen.getByRole('button', { name: 'Conditional re-review' });
    expect(choice.hasAttribute('disabled')).toBe(true);
    await clickSettled(choice);
    expect(edits).toEqual([]);
    expect(phases).toEqual([]);
  });
});
