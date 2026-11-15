/**
 * The smallest pipeline's note. What matters: it belongs to a flow with no review step only; its warning shows while no phase has a gate
 * the draft keeps (a removed gate row drawn until Apply and a prepare step do not count) and goes once one has; its "WHERE STEPS GO"
 * lines follow the + slots in the facts, one line each, worded from the steps offered there.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineFlowFacts }   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { pipelineBoardStateOf }     from '../../../testing/PipelineFixture.ts';
import { MinimalPipelineNoteModel } from './MinimalPipelineNoteModel.ts';

function minimalFlow(): PipelineFlowFacts {
  const flow = pipelineBoardStateOf('A7').pipelineFlow ?? null;
  if (flow === null) throw new Error('A7 has no flow');
  return flow;
}

describe('noteIsShownFor', () => {
  test('a flow with no review step is the smallest kind; one with a review is not', () => {
    expect(MinimalPipelineNoteModel.noteIsShownFor(minimalFlow())).toBe(true);
    expect(MinimalPipelineNoteModel.noteIsShownFor(pipelineBoardStateOf('A6').pipelineFlow ?? { nodes: [] })).toBe(false);
  });
});

describe('noteOf', () => {
  test('the warning shows while no phase has a gate, and the lines follow the slots', () => {
    expect(MinimalPipelineNoteModel.noteOf(minimalFlow())).toEqual({
      warningIsShown: true,
      stepLines:      [
        {
          key:  'after-builder',
          text: 'On the line from Builder: build gates, a review (with the merge of main before it, its gates and re-review) or human code review.',
        },
        { key: 'airlock', text: 'In the merge train, before the fast-forward: merge gates or a conditional re-review.' },
      ],
    });
  });

  test('a gate in any phase drops the warning, and a slot that offers one step names it alone', () => {
    const flow = minimalFlow();
    const gateRow = {
      rowKind: 'gate' as const, name: 'typecheck', run: 'bun run typecheck', fix: null, in: null, network: [], alsoInPhases: [], mark: 'new' as const,
    };
    const note = MinimalPipelineNoteModel.noteOf({
      gateRows:    { ...flow.gateRows, merge: [gateRow] },
      insertSlots: [{ slotId: 'airlock', after: 'gates-merge', offeredSteps: ['airlock-re-review'] }],
    });
    expect(note.warningIsShown).toBe(false);
    expect(note.stepLines).toEqual([{ key: 'airlock', text: 'In the merge train, before the fast-forward: a conditional re-review.' }]);
  });

  test('gate rows the draft removes and prepare steps keep the warning, as Apply will leave no gate', () => {
    const flow = minimalFlow();
    const row = {
      rowKind: 'gate' as const, name: 'lint', run: 'bun run lint', fix: null, in: null, network: [], alsoInPhases: [], mark: 'removed' as const,
    };
    const prepareRow = {
      ...row, rowKind: 'prepare' as const, name: 'install', mark: 'unchanged' as const
    };
    const gateRows = { build: [prepareRow, row], review: [prepareRow, { ...row, name: 'typecheck' }], merge: [] };
    expect(MinimalPipelineNoteModel.noteOf({ gateRows, insertSlots: flow.insertSlots }).warningIsShown).toBe(true);
    const keptGateRows = { ...gateRows, merge: [{ ...row, name: 'e2e', mark: 'unchanged' as const }] };
    expect(MinimalPipelineNoteModel.noteOf({ gateRows: keptGateRows, insertSlots: flow.insertSlots }).warningIsShown).toBe(false);
  });
});
