/**
 * The flow model over the designed fixtures. What matters: the node-to-dialog table of PLAN 9.1 (the merge before review opens nothing);
 * every merge step carries a derived meter whose tooltip follows where it is derived from; a re-review is conditional with its inline tag,
 * sharing the dashed `--line-conditional` edge with the node's border; nodes fall into the spine, the right column and the train in the
 * facts' order with each + after its node; each + choice sends its edit or asks for the Gate dialog; the toolbar note and the footer's
 * removed steps are worded from the facts; the zoom moves by steps and a fit never overflows; a proposed Review shows its "proposed" chip,
 * and a node asks while a question it names is open.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { PipelineFlowFacts, PipelineFlowNode }       from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { pipelineBoardStateOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineFlowModel }                              from './PipelineFlowModel.ts';

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
  const flow = flowOf(name);
  const view = PipelineFlowModel.nodeViewsOf(flow.nodes, EFFORTS).find((each) => each.nodeId === nodeId);
  if (view === undefined) throw new Error(`no view ${nodeId}`);
  return view;
}

describe('the node-to-dialog table', () => {
  const openActionOfNode = (name: PipelineFixtureName, nodeId: string) => PipelineFlowModel.openActionOf(nodeOf(flowOf(name), nodeId));

  test('ticket creation and the builder open the agent step dialog', () => {
    expect(openActionOfNode('A2', 'ticket-creation')).toEqual({ kind: 'dialog', dialog: 'agent-step', focusesReReview: false });
    expect(openActionOfNode('A2', 'builder')).toEqual({ kind: 'dialog', dialog: 'agent-step', focusesReReview: false });
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

  test('a Gates node selects its phase tab', () => {
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
    const flow = flowOf('flow-human-code-review-proposal');
    const mergeViews = PipelineFlowModel.nodeViewsOf(flow.nodes, EFFORTS).filter((view) => view.title === 'Merge main into the tree');
    expect(mergeViews).toHaveLength(3);
    mergeViews.forEach((view) => expect(view.meter?.derivedNote).not.toBeNull());
  });

  test('the merge before review shows the builder\'s pair, its own tooltip and the build gate chips under their lead', () => {
    const view = viewOf('flow-merge-before-review', 'merge-before-review');
    expect(view.meter).toMatchObject({
      model: 'opus', effort: 'medium', level: 2, levelCount: 5
    });
    expect(view.meter?.derivedNote).toEqual({
      title: 'Derived from the builder',
      text:  'The builder fixes this merge\'s conflicts and red gates. Change it on the Builder step.',
    });
    expect(view.detail).toBe('conflicts and red gates: the builder fixes them');
    expect(view.chipsLead).toBe('then the build gates again');
    expect(view.gateChips.map((chip) => chip.gateName)).toEqual(['typecheck', 'lint', 'unit-tests']);
  });

  test('with no build gates the merge before review says no gates run after it', () => {
    const node = { ...nodeOf(flowOf('A2'), 'merge-before-review'), gateChips: [] };
    expect(PipelineFlowModel.nodeViewOf(node, EFFORTS).chipsLead).toBe('no gates run after it');
  });

  test('a merge after review is derived from the last worker; with no review step, from the builder as the last worker', () => {
    expect(viewOf('A2', 'merge-in-airlock').meter?.derivedNote).toEqual({
      title: 'Derived from the last worker',
      text:  'This ticket\'s reviewer, or its builder when no review ran. Change it on that step.',
    });
    expect(viewOf('A2', 'merge-in-airlock').detail).toBe('conflicts: the last worker fixes them');
    expect(viewOf('A7', 'merge-in-airlock').meter?.derivedNote).toEqual({
      title: 'Derived from the last worker',
      text:  'The builder, since no review runs. Change it on the Builder step.',
    });
    expect(viewOf('A7', 'merge-in-airlock').detail).toBe('conflicts: the builder fixes them');
    expect(viewOf('flow-human-code-review-proposal', 'merge-before-human-code-review').detail).toBe('conflicts: the reviewer fixes them');
  });
});

describe('node words', () => {
  test('a re-review is conditional with its inline tag and its threshold', () => {
    const view = viewOf('A2', 're-review');
    expect(view).toMatchObject({
      title: 'Re-review', conditional: true, tagText: 'conditional', detail: 'only when the review\'s fixes are over 750 lines'
    });
    expect(viewOf('A2', 're-review-in-airlock').detail).toBe('only when the conflict fix is over 750 lines');
  });

  test('the CONDITIONAL tag and the conditional node border share the dashed 1px --line-conditional edge', () => {
    const stylesheet = readFileSync(join(import.meta.dir, '..', '..', '..', 'styles', 'board.css'), 'utf8');
    const ruleOf = (selector: string): string => stylesheet.slice(stylesheet.indexOf(`${selector} {`)).split('}')[0] ?? '';
    expect(ruleOf('.bridge-flow-node-tag')).toContain('border: 1px dashed var(--line-conditional)');
    expect(ruleOf('.bridge-flow-node[data-conditional]')).toContain('border-style: dashed; border-color: var(--line-conditional)');
    expect(ruleOf('.bridge-flow-node')).toContain('border: 1px solid');
  });

  test('the switches word their state, and Human code review on is the highlighted box', () => {
    expect(viewOf('A2', 'human-ticket-review')).toMatchObject({
      variant:    'switch',
      detail:     'User readies each draft before it builds',
      switchView: { checked: true, approval: 'tickets' },
    });
    expect(viewOf('A2', 'human-code-review')).toMatchObject({ detail: 'Green after review goes straight to the train', highlighted: false });
    expect(viewOf('flow-human-code-review-proposal', 'human-code-review')).toMatchObject({
      detail:      'User reviews and presses Merge; press order sets the train',
      highlighted: true,
      switchView:  { checked: true },
    });
  });

  test('a switch edit flips its approval', () => {
    const { switchView } = viewOf('A2', 'human-code-review');
    if (switchView === null) throw new Error('no switch');
    expect(PipelineFlowModel.switchEditOf(switchView)).toEqual({ field: 'approval:merge', value: true });
  });

  test('agent steps list their instruction files; the gates after the merge before code review are their phase again', () => {
    expect(viewOf('A2', 'builder').detail).toBe('constitution.md · builder.md');
    expect(viewOf('A2', 'ticket-creation').detail).toBe('productOwner.md · drafts with a Brief');
    expect(viewOf('A2', 'gates-build').detail).toBe('build · to be reviewed');
    expect(viewOf('flow-human-code-review-proposal', 'gates-review-again').detail).toBe('review, again · must be green');
  });

  test('marks pass through: proposed chips are dashed, editing chips carry their change, unchanged nodes no mark', () => {
    expect(viewOf('A2', 'builder').mark).toBe('proposed');
    expect(viewOf('A2', 'gates-build').gateChips[0]).toEqual({ gateName: 'typecheck', change: null, proposed: true });
    expect(viewOf('A5', 'builder').mark).toBeNull();
    const node = { ...nodeOf(flowOf('A6'), 'gates-build'), mark: 'changed' as const, gateChips: [{ gateName: 'lint', mark: 'removed' as const }] };
    expect(PipelineFlowModel.nodeViewOf(node, EFFORTS)).toMatchObject({ mark: 'changed', gateChips: [{ gateName: 'lint', change: 'removed', proposed: false }] });
  });

  test('edge labels are worded from their kind', () => {
    const labels = PipelineFlowModel.layoutEdgesOf(flowOf('A2').edges).flatMap((edge) => (edge.labelText === null ? [] : [edge.labelText]));
    expect(labels).toEqual([
      'all green',
      'red: builder\nfixes it',
      'conflict or red:\nbuilder fixes it',
      'red: reviewer\nfixes it',
      'after a re-review:\ngates again',
      'red: last worker\nfixes it',
    ]);
  });
});

describe('columns', () => {
  const idsOf = (items: ReturnType<typeof PipelineFlowModel.columnsOf>['spine']) => items.map((item) => (item.kind === 'node' ? item.node.nodeId : `+${item.place}`));

  test('the spine ends at the merge before review, the right column runs to the train, and the train is framed', () => {
    const columns = PipelineFlowModel.columnsOf(flowOf('A2'));
    expect(idsOf(columns.spine)).toEqual(['ticket-creation', 'human-ticket-review', 'builder', 'gates-build', 'merge-before-review']);
    expect(idsOf(columns.branch)).toEqual(['review', 'gates-review', 're-review', 'human-code-review', 'ready-for-airlock']);
    expect(idsOf(columns.train)).toEqual(['merge-in-airlock', 're-review-in-airlock', 'gates-merge', 'fast-forward-main']);
    expect(columns.trainLabel).toBe('Merge train · Airlock, one at a time');
  });

  test('the smallest pipeline has no merge before review, and a + after the Builder and in the train', () => {
    const columns = PipelineFlowModel.columnsOf(flowOf('A7'));
    expect(idsOf(columns.spine)).toEqual(['ticket-creation', 'human-ticket-review', 'builder', '+after-builder']);
    expect(idsOf(columns.branch)).toEqual([]);
    expect(idsOf(columns.train)).toEqual(['merge-in-airlock', '+merge-train', 'fast-forward-main']);
  });

  test('Human code review with no review step opens the right column at its merge', () => {
    const columns = PipelineFlowModel.columnsOf(flowOf('A7-human-code-review-without-review'));
    expect(idsOf(columns.branch)[0]).toBe('merge-before-human-code-review');
    expect(PipelineFlowModel.columnOfNode(flowOf('A7-human-code-review-without-review'), 'builder')).toBe('spine');
  });
});

describe('insert slots', () => {
  test('the + after the Builder offers build gates, review and human code review, each with its action', () => {
    const [slot] = flowOf('A7').insertSlots;
    if (slot === undefined) throw new Error('no slot');
    const view = PipelineFlowModel.slotViewOf(slot, 'after-builder', null);
    expect(view).toMatchObject({ heading: 'Add after the Builder', triggerName: 'Add a step after the Builder', insertStyle: 'solid' });
    expect(view.choices.map((choice) => [choice.label, choice.action])).toEqual([
      ['Build gates', { kind: 'new-gate', phase: 'build' }],
      ['Review', { kind: 'edit', edits: [{ field: 'review', value: { name: 'review' } }] }],
      ['Human code review', { kind: 'edit', edits: [{ field: 'approval:merge', value: true }] }],
    ]);
  });

  test('the + in the train is dashed and adds merge gates or the train re-review at the default threshold', () => {
    const slot = flowOf('A7').insertSlots[1];
    if (slot === undefined) throw new Error('no slot');
    const view = PipelineFlowModel.slotViewOf(slot, 'merge-train', null);
    expect(view.insertStyle).toBe('dashed');
    expect(view.choices.map((choice) => choice.action)).toEqual([
      { kind: 'new-gate', phase: 'merge' },
      { kind: 'edit', edits: [{ field: 'airlock', value: { reReview: { thresholdLines: 750 } } }] },
    ]);
  });

  test('a re-review after the review keeps the draft review\'s name', () => {
    const slot = { slotId: 'after-review', after: 'gates-review', offeredSteps: ['re-review' as const] };
    const draft = {
      version: 2 as const, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, review: { name: 'careful-review' }
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

describe('toolbar and footer words', () => {
  test('each stage has its note; a proposal names only the profiles User started that still run', () => {
    expect(PipelineFlowModel.toolbarNoteOf('live', 0, [])).toBe('Applied pipeline · live');
    expect(PipelineFlowModel.toolbarNoteOf('editing', 3, [])).toBe('Editing · 3 changes, not applied');
    expect(PipelineFlowModel.toolbarNoteOf('editing', 1, [])).toBe('Editing · 1 change, not applied');
    expect(PipelineFlowModel.toolbarNoteOf('proposal', 0, pipelineBoardStateOf('profile-passed').profileRuns ?? [])).toBe('Proposed, not stored');
    expect(PipelineFlowModel.toolbarNoteOf('proposal', 0, pipelineBoardStateOf('profile-running').profileRuns ?? []))
      .toBe('Proposed, not stored · profiling browser-tests · merge');
  });

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

describe('zoom', () => {
  test('moves by steps and stops at the ends', () => {
    expect(PipelineFlowModel.zoomedPercentOf(100, 'in')).toBe(110);
    expect(PipelineFlowModel.zoomedPercentOf(100, 'out')).toBe(90);
    expect(PipelineFlowModel.zoomedPercentOf(150, 'in')).toBe(150);
    expect(PipelineFlowModel.canZoom(50, 'out')).toBe(false);
    expect(PipelineFlowModel.zoomTextOf(125)).toBe('125%');
  });

  test('fit takes the largest step that fits both ways, and keeps 100% with nothing measured', () => {
    expect(PipelineFlowModel.fitPercentOf({ width: 800, height: 900 }, { width: 1000, height: 600 })).toBe(80);
    expect(PipelineFlowModel.fitPercentOf({ width: 2000, height: 2000 }, { width: 1000, height: 600 })).toBe(150);
    expect(PipelineFlowModel.fitPercentOf({ width: 0, height: 0 }, { width: 1000, height: 600 })).toBe(100);
  });

  test('a stored zoom that is no step reads as 100%', () => {
    expect(PipelineFlowModel.storedZoomPercentOf('125')).toBe(125);
    expect(PipelineFlowModel.storedZoomPercentOf('133')).toBe(100);
    expect(PipelineFlowModel.storedZoomPercentOf(null)).toBe(100);
  });
});

describe('the proposal marks', () => {
  test('a proposed Review shows the "proposed" chip, as drawn, and no other node does', () => {
    const views = PipelineFlowModel.nodeViewsOf(flowOf('A2').nodes, EFFORTS);
    expect(views.filter((view) => view.markChip !== null).map((view) => [view.nodeId, view.markChip])).toEqual([['review', 'proposed']]);
    expect(views.every((view) => view.mark === 'proposed')).toBe(true);
    expect(viewOf('A5', 'review').markChip).toBeNull();
  });

  test('a node asks while one of its questions is open, and opens on it', () => {
    const asking = nodeOf(flowOf('A2-question-open'), 'gates-merge');
    expect(PipelineFlowModel.nodeAsksQuestion(asking, ['Q3'])).toBe(true);
    expect(PipelineFlowModel.nodeAsksQuestion(asking, [])).toBe(false);
    expect(PipelineFlowModel.nodeAsksQuestion(nodeOf(flowOf('A2-question-open'), 'builder'), ['Q3'])).toBe(false);
    expect(PipelineFlowModel.questionOpenLabelOf('Gates')).toBe('Answer the question on the Gates step');
  });
});
