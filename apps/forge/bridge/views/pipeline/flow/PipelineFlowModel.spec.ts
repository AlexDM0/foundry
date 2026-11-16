/**
 * The flow's step model over the designed fixtures. What matters: the node-to-dialog table of PLAN 9.1 (the merge before review opens
 * nothing); every merge step carries a derived meter whose tooltip follows where it is derived from; each step card names its kind, and a
 * Gates card says who fixes a red gate, read from its way back; a re-review is conditional and says its threshold; the switches word their
 * state; an editing card carries its change, a switch the way it turned and a gates step the count of its changed gates, while a proposal
 * carries none; a gate pill carries the cache mark of its gate's newest profile run in the step's phase; each add choice sends its edit or
 * asks for the Gate dialog; the footer's removed steps are worded from the facts; and a node asks while a question it names is open.
 */
import { describe, expect, test } from 'bun:test';

import type { GatePhase }                                                from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { GateProfileRunFacts, PipelineFlowFacts, PipelineFlowNode } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { pipelineBoardStateOf, type PipelineFixtureName }                from '../../../testing/PipelineFixture.ts';
import { PipelineFlowModel }                                             from './PipelineFlowModel.ts';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

function flowOf(name: PipelineFixtureName): PipelineFlowFacts {
  const flow = pipelineBoardStateOf(name).pipelineFlow ?? null;
  if (flow === null) throw new Error(`${name} has no flow`);
  return flow;
}

function nodeOf(flow: PipelineFlowFacts, nodeId: string): PipelineFlowNode {
  const node = flow.nodes.find((each) => each.nodeId === nodeId);
  if (node === undefined) throw new Error(`no node ${nodeId}`);
  return node;
}

function viewOf(name: PipelineFixtureName, nodeId: string) {
  const view = PipelineFlowModel.nodeViewsOf(flowOf(name), EFFORTS).find((each) => each.nodeId === nodeId);
  if (view === undefined) throw new Error(`no view ${nodeId}`);
  return view;
}

describe('the node-to-dialog table', () => {
  const openActionOfNode = (name: PipelineFixtureName, nodeId: string) => PipelineFlowModel.openActionOf(nodeOf(flowOf(name), nodeId));

  test('ticket creation and the builder open the agent step dialog', () => {
    expect(openActionOfNode('A2', 'ticket-creation')).toEqual({ kind: 'dialog', dialog: 'agent-step', focusesReReview: false });
    expect(openActionOfNode('A2', 'builder')).toEqual({ kind: 'dialog', dialog: 'agent-step', focusesReReview: false });
    expect(viewOf('A2', 'ticket-creation').openLabel).toBe('Open the Ticket creation step');
  });

  test('the merge before review opens nothing: nothing on it is set', () => {
    expect(openActionOfNode('flow-merge-before-review', 'merge-before-review')).toBeNull();
    expect(viewOf('flow-merge-before-review', 'merge-before-review').openLabel).toBeNull();
  });

  test('review opens the review step dialog, and the re-review after the review gates opens it at its re-review section', () => {
    expect(openActionOfNode('A2', 'review')).toEqual({ kind: 'dialog', dialog: 'review-step', focusesReReview: false });
    expect(openActionOfNode('A2', 're-review')).toEqual({ kind: 'dialog', dialog: 'review-step', focusesReReview: true });
  });

  test('the two merges after review open the merge step dialog, and both later re-reviews open it at its re-review section', () => {
    const name = 'flow-human-code-review-proposal';
    expect(openActionOfNode(name, 'merge-before-human-code-review')).toEqual({ kind: 'dialog', dialog: 'merge-step', focusesReReview: false });
    expect(openActionOfNode(name, 'merge-in-airlock')).toEqual({ kind: 'dialog', dialog: 'merge-step', focusesReReview: false });
    expect(openActionOfNode(name, 're-review-before-human-code-review')).toEqual({ kind: 'dialog', dialog: 'merge-step', focusesReReview: true });
    expect(openActionOfNode(name, 're-review-in-airlock')).toEqual({ kind: 'dialog', dialog: 'merge-step', focusesReReview: true });
  });

  test('a Gates step shows its phase\'s gates', () => {
    expect(openActionOfNode('A2', 'gates-build')).toEqual({ kind: 'gates-tab', phase: 'build' });
    expect(openActionOfNode('A2', 'gates-merge')).toEqual({ kind: 'gates-tab', phase: 'merge' });
    expect(viewOf('A2', 'gates-merge').openLabel).toBe('Show the merge gates');
  });

  test('switch, outcome and target nodes open nothing', () => {
    ['human-ticket-review', 'human-code-review', 'ready-for-airlock', 'fast-forward-main'].forEach((nodeId) => {
      expect(openActionOfNode('A2', nodeId)).toBeNull();
    });
  });
});

describe('merge steps and their derived meters', () => {
  test('every merge step has a derived meter: three with Human code review on and a review step', () => {
    const mergeViews = PipelineFlowModel.nodeViewsOf(flowOf('flow-human-code-review-proposal'), EFFORTS).filter((view) => view.title === 'Merge main into the tree');
    expect(mergeViews).toHaveLength(3);
    mergeViews.forEach((view) => expect(view.meter?.derivedNote).not.toBeNull());
  });

  test('the merge before review is an Automatic step with the builder\'s pair, its own tooltip and the build gates it runs again', () => {
    const view = viewOf('flow-merge-before-review', 'merge-before-review');
    expect(view.kind).toBe('automatic');
    expect(view.meter).toMatchObject({
      model: 'opus', effort: 'medium', level: 2, levelCount: 5
    });
    expect(view.meter?.derivedNote).toEqual({
      title: 'Derived from the builder',
      text:  'The builder fixes this merge\'s conflicts and red gates. Change it on the Builder step.',
    });
    expect(view.sentence).toBe('Brings the branch up to date before review. The builder fixes a conflict or a red gate.');
    expect(view.gatePills.map((pill) => pill.gateName)).toEqual(['typecheck', 'lint', 'unit-tests']);
  });

  test('a merge after review is derived from the last worker; with no review step, from the builder as the last worker', () => {
    expect(viewOf('A2', 'merge-in-airlock').meter?.derivedNote).toEqual({
      title: 'Derived from the last worker',
      text:  'This ticket\'s reviewer, or its builder when no review ran. Change it on that step.',
    });
    expect(viewOf('A2', 'merge-in-airlock').sentence).toBe('Brings the branch up to date. The last worker fixes any conflict.');
    expect(viewOf('A7', 'merge-in-airlock').meter?.derivedNote).toEqual({
      title: 'Derived from the last worker',
      text:  'The builder, since no review runs. Change it on the Builder step.',
    });
    expect(viewOf('A7', 'merge-in-airlock').sentence).toBe('Brings the branch up to date. The builder fixes any conflict, since no review runs.');
    expect(viewOf('flow-human-code-review-proposal', 'merge-before-human-code-review').sentence)
      .toBe('Comes with human code review. The last worker fixes any conflict.');
  });
});

describe('step cards', () => {
  test('each step names its kind: agents, User\'s switches, gates, and the merges that run by themselves', () => {
    expect(['ticket-creation', 'human-ticket-review', 'builder', 'gates-build', 'merge-in-airlock', 're-review'].map((nodeId) => viewOf('A2', nodeId).kind))
      .toEqual(['agent', 'you', 'agent', 'gates', 'automatic', 'agent']);
  });

  test('a Gates card is named for its phase and says who fixes a red gate, read from its way back', () => {
    expect(viewOf('A2', 'gates-build')).toMatchObject({ title: 'Gates', cardTitle: 'Build gates', sentence: 'If one fails, the builder fixes it and the gates run again.' });
    expect(viewOf('A2', 'gates-review').sentence).toBe('If one fails, the reviewer fixes it and the gates run again.');
    expect(viewOf('A2', 'gates-merge').sentence).toBe('If one fails, the last worker fixes it and the gates run again.');
    expect(viewOf('flow-human-code-review-proposal', 'gates-review-again').sentence).toBe('The review gates run again on the merged tree.');
  });

  test('a re-review is conditional and says its threshold', () => {
    expect(viewOf('A2', 're-review')).toMatchObject({ title: 'Re-review', conditional: true });
    expect(viewOf('A2', 're-review').sentence).toBe('Runs only when the review\'s fixes are over 750 lines. Then the gates run again.');
    expect(viewOf('A2', 're-review-in-airlock').sentence).toBe('Runs only when the conflict fix is over 750 lines. Then the gates run again.');
  });

  test('the switches word their state, and Human code review on is the highlighted step', () => {
    expect(viewOf('A2', 'human-ticket-review')).toMatchObject({
      sentence:   'You ready each draft before it builds.',
      switchView: { checked: true, approval: 'tickets' },
    });
    expect(viewOf('A2', 'human-code-review')).toMatchObject({ sentence: 'Off: a green review goes straight to the merge train.', highlighted: false });
    expect(viewOf('flow-human-code-review-proposal', 'human-code-review')).toMatchObject({
      sentence:    'You review the change and press Merge. Your presses set the order.',
      highlighted: true,
      switchView:  { checked: true },
    });
  });

  test('a switch edit flips its approval', () => {
    const { switchView } = viewOf('A2', 'human-code-review');
    if (switchView === null) throw new Error('no switch');
    expect(PipelineFlowModel.switchEditOf(switchView)).toEqual({ field: 'approval:merge', value: true });
  });

  test('an agent step lists its instruction files; a step no agent runs has none', () => {
    expect(viewOf('A2', 'builder').briefText).toBe('constitution.md · builder.md');
    expect(viewOf('A2', 'ticket-creation').briefText).toBe('productOwner.md');
    expect(viewOf('A2', 'merge-in-airlock').briefText).toBeNull();
  });
});

describe('change markers', () => {
  test('a proposal and a live flow carry no change; proposed gates are plain pills', () => {
    expect(viewOf('A2', 'builder')).toMatchObject({ change: null, changeText: null });
    expect(viewOf('A2', 'gates-build').gatePills[0]).toEqual({ gateName: 'typecheck', text: 'typecheck', change: null });
    expect(viewOf('A5', 'builder').change).toBeNull();
  });

  test('an editing gates step counts its changed gates, and a removed gate stays a pill with its change', () => {
    const node = {
      ...nodeOf(flowOf('A6'), 'gates-build'),
      mark:      'changed' as const,
      gateChips: [{ gateName: 'tests', mark: 'changed' as const }, { gateName: 'lint', mark: 'removed' as const }],
    };
    expect(PipelineFlowModel.nodeViewOf(node, EFFORTS)).toMatchObject({
      change:     'changed',
      changeText: '2 changes',
      gatePills:  [{ gateName: 'tests', change: 'changed' }, { gateName: 'lint', change: 'removed' }],
    });
  });

  test('a gate pill carries the cache mark of its gate\'s newest profile run in the step\'s phase, and none from another phase', () => {
    const profileRunOf = (phase: GatePhase, cacheReport: GateProfileRunFacts['cacheReport']): GateProfileRunFacts => ({
      profileRunId: `P-${phase}`, gateName: 'typecheck', phase, state: 'passed', elapsedMilliseconds: 400, cacheReport,
    });
    const pillsOf = (profileRuns: readonly GateProfileRunFacts[]) => PipelineFlowModel.nodeViewsOf(flowOf('A2'), EFFORTS, profileRuns)
      .find((view) => view.nodeId === 'gates-build')?.gatePills[0]?.text;

    expect([
      pillsOf([profileRunOf('build', 'hit')]),
      pillsOf([profileRunOf('build', 'partial')]),
      pillsOf([profileRunOf('build', 'miss')]),
      pillsOf([profileRunOf('merge', 'hit')]),
    ]).toEqual(['typecheck · cached', 'typecheck · partly cached', 'typecheck', 'typecheck']);
  });

  test('a changed switch says the way it turned; a new or removed step says its word', () => {
    const humanCodeReview = nodeOf(flowOf('flow-human-code-review-proposal'), 'human-code-review');
    expect(PipelineFlowModel.nodeViewOf({ ...humanCodeReview, mark: 'changed' }, EFFORTS).changeText).toBe('Off → on');
    expect(PipelineFlowModel.nodeViewOf({ ...humanCodeReview, mark: 'changed', switchState: 'off' }, EFFORTS).changeText).toBe('On → off');
    expect(PipelineFlowModel.nodeViewOf({ ...nodeOf(flowOf('A2'), 'review'), mark: 'removed' }, EFFORTS).changeText).toBe('Removed');
    expect(PipelineFlowModel.nodeViewOf({ ...nodeOf(flowOf('A2'), 'review'), mark: 'new' }, EFFORTS).changeText).toBe('New');
  });
});

describe('add cards', () => {
  test('the slot after the Builder offers build gates, review and human code review, each with its action', () => {
    const [slot] = flowOf('A7').insertSlots;
    if (slot === undefined) throw new Error('no slot');
    const view = PipelineFlowModel.slotViewOf(slot, 'after-builder', null);
    expect(view.heading).toBe('Add after the Builder');
    expect(view.choices.map((choice) => [choice.label, choice.action])).toEqual([
      ['Build gates', { kind: 'new-gate', phase: 'build' }],
      ['Review', { kind: 'edit', edits: [{ field: 'review', value: { name: 'review' } }] }],
      ['Human code review', { kind: 'edit', edits: [{ field: 'approval:merge', value: true }] }],
    ]);
  });

  test('the slot in the merge train adds merge gates or the train re-review at the default threshold', () => {
    const slot = flowOf('A7').insertSlots[1];
    if (slot === undefined) throw new Error('no slot');
    const view = PipelineFlowModel.slotViewOf(slot, 'merge-train', null);
    expect(view.heading).toBe('Add before the fast-forward');
    expect(view.choices.map((choice) => choice.action)).toEqual([
      { kind: 'new-gate', phase: 'merge' },
      { kind: 'edit', edits: [{ field: 'airlock', value: { reReview: { thresholdLines: 750 } } }] },
    ]);
  });

  test('a re-review after the review keeps the draft review\'s name', () => {
    const slot = { slotId: 'after-review', after: 'gates-review', offeredSteps: ['re-review' as const] };
    const draft = {
      version: 3 as const, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, review: { name: 'careful-review' }
    };
    expect(PipelineFlowModel.slotViewOf(slot, 'after-review', draft).choices[0]?.action).toEqual({
      kind:  'edit',
      edits: [{ field: 'review', value: { name: 'careful-review', reReview: { thresholdLines: 750 } } }],
    });
  });

  test('a draft edit command names the record and the revision', () => {
    expect(PipelineFlowModel.draftEditCommandOf({ setupId: 'S2', draftRevision: 7 }, [{ field: 'approval:tickets', value: false }])).toEqual({
      kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ field: 'approval:tickets', value: false }],
    });
  });
});

describe('footer words', () => {
  test('the footer lists the removed steps from the change list, or nothing when none is removed', () => {
    expect(PipelineFlowModel.removedStepsTextOf(flowOf('A7').changeList)).toBe('Review and the merge train re-review removed');
    expect(PipelineFlowModel.removedStepsTextOf([
      { field: 'gate:lint', changeKind: 'removed', editId: null },
      { field: 'prepare:install', changeKind: 'removed', editId: null },
      { field: 'review', changeKind: 'removed', editId: null },
    ])).toBe('The lint gate, the install prepare step and Review removed');
    expect(PipelineFlowModel.removedStepsTextOf([{ field: 'role:builder', changeKind: 'changed', editId: null }])).toBeNull();
  });
});

describe('questions', () => {
  test('a node asks while one of its questions is open, and counts the open ones', () => {
    const asking = nodeOf(flowOf('A2-question-open'), 'gates-merge');
    expect(PipelineFlowModel.nodeAsksQuestion(asking, ['Q3'])).toBe(true);
    expect(PipelineFlowModel.nodeAsksQuestion(asking, [])).toBe(false);
    expect(PipelineFlowModel.nodeAsksQuestion(nodeOf(flowOf('A2-question-open'), 'builder'), ['Q3'])).toBe(false);
    expect(PipelineFlowModel.openQuestionCountOf({ questionIds: ['Q3', 'Q4'] }, ['Q3', 'Q4', 'Q9'])).toBe(2);
    expect([1, 2].map(PipelineFlowModel.questionCountTextOf)).toEqual(['1 question', '2 questions']);
    expect(PipelineFlowModel.questionOpenLabelOf('Gates')).toBe('Answer the question on the Gates step');
  });
});
