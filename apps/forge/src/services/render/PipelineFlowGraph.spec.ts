/**
 * The flow graph's contract: which nodes exist for each flow shape the designs draw (`Flow.dc.html` with Human code review off and on and
 * with the review step off, `A7Minimal.dc.html`), the insert-slot table of PLAN 9.1 row by row, the merge steps' placement and derived
 * meter (Q5, Q16), the node-to-dialog table, the editing marks (a removed gate stays drawn, a removed agent step goes and leaves its +),
 * and that no node or edge carries words. The cases pin the rules the Bridge must not repeat, so each names the design or decision it holds.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline, PipelineAgentRole }                                   from '../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineFlowNode, PipelineFlowStage, ResolvedInstructionEntry } from '../../lib/tracker-model/@types/PipelineFacts.ts';
import type { AgentPair }                                                     from '../../lib/tracker-model/@types/Ticket.ts';
import type { PipelineFlowGraph }                                             from './PipelineFlowGraph.ts';
import { pipelineFlowGraphOf }                                                from './PipelineFlowGraph.ts';

const MINIMAL_PIPELINE: Pipeline = {
  version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
};

/** The pipeline `Flow.dc.html` draws: gates in every phase, a review with its re-review, and a train re-review. */
const DRAWN_PIPELINE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }],
  gates:   [
    { name: 'tests', run: 'bun test --bail' },
    { name: 'lint', run: 'bun run lint', fix: 'bun run lint:fix' },
    { name: 'typecheck', run: 'bun run typecheck' },
    { name: 'build', run: 'vite build' },
    { name: 'e2e', run: 'bunx playwright test', network: ['localhost'] },
  ],
  phases:  { build: ['tests', 'lint', 'typecheck'], review: ['tests', 'typecheck', 'build'], merge: ['tests', 'typecheck', 'e2e'] },
  review:  { name: 'review', reReview: { thresholdLines: 750 } },
  airlock: { reReview: { thresholdLines: 750 } },
};

const PRODUCT_OWNER_PAIR: AgentPair = { model: 'sonnet', effort: 'medium' };
const WORKER_PAIR: AgentPair        = { model: 'opus', effort: 'high' };

function instructionEntriesOf(role: PipelineAgentRole): ResolvedInstructionEntry[] {
  return [{
    entry: { kind: 'default-brief', role }, fileName: `${role}.md`, readByRoles: [role], text: null, textIsCut: false
  }];
}

function graphOf(pipeline: Pipeline, stage: PipelineFlowStage = 'proposal', appliedPipeline: Pipeline | null = null): PipelineFlowGraph {
  return pipelineFlowGraphOf({
    pipeline,
    appliedPipeline,
    stage,
    defaultSettingsOf: (role) => (role === 'productOwner' ? PRODUCT_OWNER_PAIR : WORKER_PAIR),
    instructionEntriesOf,
  });
}

function nodeIdsOf(graph: PipelineFlowGraph): string[] {
  return graph.nodes.map((node) => node.nodeId);
}

function nodeOf(graph: PipelineFlowGraph, nodeId: string): PipelineFlowNode {
  const node = graph.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (node === undefined) throw new Error(`no node ${nodeId}`);
  return node;
}

function edgeKeysOf(graph: PipelineFlowGraph): string[] {
  return graph.edges.map((edge) => `${edge.edgeId} ${edge.tone} ${edge.labelKind ?? '-'}`);
}

function mergeNodesOf(graph: PipelineFlowGraph): Array<Pick<PipelineFlowNode, 'nodeId' | 'mergePlacement' | 'derivedFrom' | 'dialogTarget'>> {
  return graph.nodes
    .filter((node) => node.nodeKind === 'merge-main-into-tree')
    .map(({
      nodeId, mergePlacement, derivedFrom, dialogTarget
    }) => ({
      nodeId, mergePlacement, derivedFrom, dialogTarget
    }));
}

describe('the flow shapes the designs draw', () => {
  test('Flow.dc.html with Human code review off: the left spine with the merge before review, the review column and the merge train', () => {
    const graph = graphOf(DRAWN_PIPELINE);
    expect(nodeIdsOf(graph)).toEqual([
      'ticket-creation',
      'human-ticket-review',
      'builder',
      'gates-build',
      'merge-before-review',
      'review',
      'gates-review',
      're-review',
      'human-code-review',
      'ready-for-airlock',
      'airlock',
      'merge-in-airlock',
      're-review-in-airlock',
      'gates-merge',
      'fast-forward-main',
    ]);
    expect(edgeKeysOf(graph)).toEqual([
      'ticket-creation->human-ticket-review forward -',
      'human-ticket-review->builder forward -',
      'builder->gates-build forward -',
      'gates-build->merge-before-review forward -',
      'merge-before-review->review forward all-green',
      'review->gates-review forward -',
      'gates-review->re-review forward -',
      're-review->human-code-review forward -',
      'human-code-review->ready-for-airlock forward -',
      'ready-for-airlock->merge-in-airlock forward -',
      'merge-in-airlock->re-review-in-airlock forward -',
      're-review-in-airlock->gates-merge forward -',
      'gates-merge->fast-forward-main forward -',
      'gates-build->builder rollback red-builder-fixes',
      'merge-before-review->builder rollback conflict-or-red-builder-fixes',
      'gates-review->review rollback red-reviewer-fixes',
      're-review->gates-review loop gates-again-after-re-review',
      'gates-merge->merge-in-airlock rollback red-last-worker-fixes',
    ]);
    expect(nodeOf(graph, 'human-code-review').switchState).toBe('off');
    expect(nodeOf(graph, 'human-ticket-review').switchState).toBe('on');
    expect(graph.insertSlots).toEqual([]);
  });

  test('Flow.dc.html with Human code review on: three merges of main, each with its placement and the worker its meter derives from', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, approvals: { merge: true } });
    expect(nodeIdsOf(graph)).toEqual([
      'ticket-creation',
      'human-ticket-review',
      'builder',
      'gates-build',
      'merge-before-review',
      'review',
      'gates-review',
      're-review',
      'merge-before-human-code-review',
      're-review-before-human-code-review',
      'gates-review-again',
      'human-code-review',
      'airlock',
      'merge-in-airlock',
      're-review-in-airlock',
      'gates-merge',
      'fast-forward-main',
    ]);
    expect(mergeNodesOf(graph)).toEqual([
      {
        nodeId: 'merge-before-review', mergePlacement: 'before-review', derivedFrom: 'builder', dialogTarget: null
      },
      {
        nodeId: 'merge-before-human-code-review', mergePlacement: 'before-human-code-review', derivedFrom: 'last-worker', dialogTarget: 'merge-step'
      },
      {
        nodeId: 'merge-in-airlock', mergePlacement: 'airlock', derivedFrom: 'last-worker', dialogTarget: 'merge-step'
      },
    ]);
    expect(nodeOf(graph, 'gates-review-again').phase).toBe('review');
    expect(nodeOf(graph, 'human-code-review').switchState).toBe('on');
  });

  test('the three re-review nodes of Flow.dc.html carry their dialog targets: the review step for the review’s, the merge step for both others', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, approvals: { merge: true } });
    const reReviews = graph.nodes.filter((node) => node.nodeKind === 're-review').map(({
      nodeId, role, dialogTarget, conditional, thresholdLines
    }) => ({
      nodeId, role, dialogTarget, conditional, thresholdLines
    }));
    expect(reReviews).toEqual([
      {
        nodeId: 're-review', role: 'reReviewer', dialogTarget: 'review-step-re-review', conditional: true, thresholdLines: 750
      },
      {
        nodeId: 're-review-before-human-code-review', role: 'conflictReReviewer', dialogTarget: 'merge-step-re-review', conditional: true, thresholdLines: 750
      },
      {
        nodeId: 're-review-in-airlock', role: 'conflictReReviewer', dialogTarget: 'merge-step-re-review', conditional: true, thresholdLines: 750
      },
    ]);
  });

  test('Flow.dc.html with the review step off: no merge before review, and every merge derives from the builder', () => {
    const { review: _review, ...withoutReview } = DRAWN_PIPELINE;
    const graph = graphOf({ ...withoutReview, approvals: { merge: true } });
    expect(nodeIdsOf(graph)).not.toContain('merge-before-review');
    expect(nodeIdsOf(graph)).not.toContain('gates-review');
    expect(mergeNodesOf(graph).map((node) => [node.nodeId, node.derivedFrom])).toEqual([
      ['merge-before-human-code-review', 'builder'],
      ['merge-in-airlock', 'builder'],
    ]);
    expect(nodeOf(graph, 'gates-review-again').phase).toBe('build');
    expect(nodeOf(graph, 'merge-in-airlock').settings).toEqual(WORKER_PAIR);
  });

  test('A7Minimal.dc.html: Builder, then the merge train, and exactly the two + slots of decision 18', () => {
    const graph = graphOf(MINIMAL_PIPELINE, 'editing');
    expect(nodeIdsOf(graph)).toEqual(['ticket-creation', 'human-ticket-review', 'builder', 'airlock', 'merge-in-airlock', 'fast-forward-main']);
    expect(graph.insertSlots).toEqual([
      { slotId: 'after-builder', after: 'builder', offeredSteps: ['build-gates', 'review', 'human-code-review'] },
      { slotId: 'airlock', after: 'merge-in-airlock', offeredSteps: ['merge-gates', 'airlock-re-review'] },
    ]);
    expect(mergeNodesOf(graph)).toEqual([{
      nodeId: 'merge-in-airlock', mergePlacement: 'airlock', derivedFrom: 'builder', dialogTarget: 'merge-step'
    }]);
    expect(graph.gateRows).toEqual({ build: [], review: [], merge: [] });
  });

  test('adding Review to the minimal pipeline adds the merge before review with it (Q5)', () => {
    const graph = graphOf({ ...MINIMAL_PIPELINE, review: { name: 'review' } }, 'editing', MINIMAL_PIPELINE);
    expect(nodeIdsOf(graph).slice(2, 5)).toEqual(['builder', 'merge-before-review', 'review']);
    expect(nodeOf(graph, 'merge-before-review').mark).toBe('new');
    expect(nodeOf(graph, 'review').mark).toBe('new');
  });

  test('the live flow marks nothing and animates the forward edges only', () => {
    const graph = graphOf(DRAWN_PIPELINE, 'live', DRAWN_PIPELINE);
    expect(new Set(graph.nodes.map((node) => node.mark))).toEqual(new Set(['unchanged']));
    expect(graph.edges.every((edge) => edge.active === (edge.tone === 'forward'))).toBe(true);
  });

  test('a proposal marks every node, chip and row proposed', () => {
    const graph = graphOf(DRAWN_PIPELINE);
    expect(new Set(graph.nodes.map((node) => node.mark))).toEqual(new Set(['proposed']));
    expect(new Set(graph.nodes.flatMap((node) => node.gateChips.map((chip) => chip.mark)))).toEqual(new Set(['proposed']));
    expect(new Set(graph.gateRows.build.map((row) => row.mark))).toEqual(new Set(['proposed']));
  });
});

describe('the insert-slot table, row by row', () => {
  const { review: _review, ...withoutReview } = DRAWN_PIPELINE;

  test('build gates missing: offered after the Builder', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, phases: { ...DRAWN_PIPELINE.phases, build: [] } });
    expect(graph.insertSlots).toEqual([{ slotId: 'after-builder', after: 'builder', offeredSteps: ['build-gates'] }]);
  });

  test('review missing: offered after the build gates when they are drawn, with Human code review while it is off', () => {
    const graph = graphOf(withoutReview);
    expect(graph.insertSlots).toEqual([{ slotId: 'after-builder', after: 'gates-build', offeredSteps: ['review', 'human-code-review'] }]);
  });

  test('Human code review: offered only with no review and the merge approval off; with review it is a switch, never a slot', () => {
    expect(graphOf({ ...withoutReview, approvals: { merge: true } }).insertSlots).toEqual([
      { slotId: 'after-builder', after: 'gates-build', offeredSteps: ['review'] },
    ]);
    expect(graphOf(DRAWN_PIPELINE).insertSlots.flatMap((slot) => slot.offeredSteps)).not.toContain('human-code-review');
  });

  test('review gates missing: offered after Review, before the re-review', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, phases: { ...DRAWN_PIPELINE.phases, review: [] } });
    expect(graph.insertSlots).toEqual([{ slotId: 'after-review', after: 'review', offeredSteps: ['review-gates'] }]);
    expect(nodeIdsOf(graph)).not.toContain('gates-review');
  });

  test('re-review missing: offered after the review gates, and no re-review node is drawn', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, review: { name: 'review' } });
    expect(graph.insertSlots).toEqual([{ slotId: 'after-review', after: 'gates-review', offeredSteps: ['re-review'] }]);
    expect(nodeIdsOf(graph)).not.toContain('re-review');
  });

  test('merge gates missing: offered in the train, after its re-review when that is on', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, phases: { ...DRAWN_PIPELINE.phases, merge: [] } });
    expect(graph.insertSlots).toEqual([{ slotId: 'airlock', after: 're-review-in-airlock', offeredSteps: ['merge-gates'] }]);
  });

  test('train re-review missing: offered in the train after Merge main into the tree, and no train re-review is drawn', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, airlock: {} });
    expect(graph.insertSlots).toEqual([{ slotId: 'airlock', after: 'merge-in-airlock', offeredSteps: ['airlock-re-review'] }]);
    expect(nodeIdsOf(graph)).not.toContain('re-review-in-airlock');
  });

  test('review gates defined while review is absent draw no review-gates node and offer no slot after review', () => {
    const graph = graphOf(withoutReview);
    expect(nodeIdsOf(graph)).not.toContain('gates-review');
    expect(graph.insertSlots.map((slot) => slot.slotId)).toEqual(['after-builder']);
  });
});

describe('the editing marks', () => {
  test('removing Review gives the after-builder slot back, draws neither Review nor its merge, and keeps no mark for them', () => {
    const { review: _review, ...withoutReview } = DRAWN_PIPELINE;
    const graph = graphOf(withoutReview, 'editing', DRAWN_PIPELINE);
    expect(nodeIdsOf(graph)).not.toContain('review');
    expect(nodeIdsOf(graph)).not.toContain('merge-before-review');
    expect(nodeIdsOf(graph)).not.toContain('re-review');
    expect(graph.insertSlots).toEqual([{ slotId: 'after-builder', after: 'gates-build', offeredSteps: ['review', 'human-code-review'] }]);
  });

  test('a removed gate stays drawn with a removed mark on its chip and row; a changed one is changed; a new one is new', () => {
    const draft: Pipeline = {
      ...DRAWN_PIPELINE,
      gates:  [...DRAWN_PIPELINE.gates.filter((gate) => gate.name !== 'tests'), { name: 'tests', run: 'bun test --bail --coverage' }, { name: 'a11y', run: 'bun run a11y' }],
      phases: { ...DRAWN_PIPELINE.phases, build: ['tests', 'typecheck'], merge: ['tests', 'typecheck', 'e2e', 'a11y'] },
    };
    const graph = graphOf(draft, 'editing', DRAWN_PIPELINE);
    expect(nodeOf(graph, 'gates-build').gateChips).toEqual([
      { gateName: 'tests', mark: 'changed' },
      { gateName: 'typecheck', mark: 'unchanged' },
      { gateName: 'lint', mark: 'removed' },
    ]);
    expect(nodeOf(graph, 'gates-build').mark).toBe('changed');
    expect(graph.gateRows.build.map((row) => [row.name, row.mark])).toEqual([
      ['install', 'unchanged'], ['tests', 'changed'], ['typecheck', 'unchanged'], ['lint', 'removed'],
    ]);
    expect(nodeOf(graph, 'gates-merge').gateChips.at(-1)).toEqual({ gateName: 'a11y', mark: 'new' });
  });

  test('a phase whose gates are all removed keeps its gates node, marked removed, and its + returns', () => {
    const draft: Pipeline = { ...DRAWN_PIPELINE, phases: { ...DRAWN_PIPELINE.phases, build: [] } };
    const graph = graphOf(draft, 'editing', DRAWN_PIPELINE);
    expect(nodeOf(graph, 'gates-build').mark).toBe('removed');
    expect(nodeOf(graph, 'gates-build').gateChips.map((chip) => chip.mark)).toEqual(['removed', 'removed', 'removed']);
    expect(graph.insertSlots).toEqual([{ slotId: 'after-builder', after: 'builder', offeredSteps: ['build-gates'] }]);
  });

  test('a removed re-review is not drawn and its + returns', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, airlock: {} }, 'editing', DRAWN_PIPELINE);
    expect(nodeIdsOf(graph)).not.toContain('re-review-in-airlock');
    expect(graph.insertSlots).toEqual([{ slotId: 'airlock', after: 'merge-in-airlock', offeredSteps: ['airlock-re-review'] }]);
  });

  test('a role, threshold or switch change marks its node changed; switching Human code review on marks the new branch new', () => {
    const draft: Pipeline = {
      ...DRAWN_PIPELINE,
      review:    { name: 'review', reReview: { thresholdLines: 800 } },
      agents:    { builder: { model: 'fable', effort: 'xhigh' } },
      approvals: { merge: true },
    };
    const graph = graphOf(draft, 'editing', DRAWN_PIPELINE);
    expect(nodeOf(graph, 'builder').mark).toBe('changed');
    expect(nodeOf(graph, 'builder').settings).toEqual({ model: 'fable', effort: 'xhigh' });
    expect(nodeOf(graph, 're-review').mark).toBe('changed');
    expect(nodeOf(graph, 'human-code-review').mark).toBe('changed');
    expect(nodeOf(graph, 'merge-before-human-code-review').mark).toBe('new');
    expect(nodeOf(graph, 'gates-review-again').mark).toBe('new');
    expect(nodeOf(graph, 'review').mark).toBe('unchanged');
    expect(nodeOf(graph, 'ticket-creation').mark).toBe('unchanged');
  });
});

describe('the node settings', () => {
  test('agent steps carry their resolved pair and instruction list; a merge step carries the derived pair and no instructions', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, agents: { reviewer: { model: 'sonnet', effort: 'max' } } });
    expect(nodeOf(graph, 'ticket-creation').settings).toEqual(PRODUCT_OWNER_PAIR);
    expect(nodeOf(graph, 'builder').instructionEntries.map((entry) => entry.fileName)).toEqual(['builder.md']);
    expect(nodeOf(graph, 'merge-before-review').settings).toEqual(WORKER_PAIR);
    expect(nodeOf(graph, 'merge-in-airlock').settings).toEqual({ model: 'sonnet', effort: 'max' });
    expect(nodeOf(graph, 'merge-in-airlock').instructionEntries).toEqual([]);
    expect(nodeOf(graph, 'human-code-review').settings).toBeNull();
  });

  test('the node-to-dialog table: agent steps, review, gates nodes, and nothing for switches, outcomes and targets', () => {
    const graph = graphOf(DRAWN_PIPELINE);
    expect(Object.fromEntries(graph.nodes.map((node) => [node.nodeId, node.dialogTarget]))).toEqual({
      'ticket-creation':      'agent-step',
      'human-ticket-review':  null,
      'builder':              'agent-step',
      'gates-build':          'gates-tab',
      'merge-before-review':  null,
      'review':               'review-step',
      'gates-review':         'gates-tab',
      're-review':            'review-step-re-review',
      'human-code-review':    null,
      'ready-for-airlock':    null,
      'airlock':              null,
      'merge-in-airlock':     'merge-step',
      're-review-in-airlock': 'merge-step-re-review',
      'gates-merge':          'gates-tab',
      'fast-forward-main':    null,
    });
  });
});

describe('no display text', () => {
  const VALUE_TOKEN = /^[a-z][a-zA-Z0-9-]*(?:->[a-z][a-zA-Z0-9-]*)?$/u;

  test('every node and edge holds exactly its value keys, and each string it carries is a value token, never a sentence', () => {
    const graph = graphOf({ ...DRAWN_PIPELINE, approvals: { merge: true } });
    const nodeKeys = [
      'conditional',
      'derivedFrom',
      'dialogTarget',
      'gateChips',
      'instructionEntries',
      'mark',
      'mergePlacement',
      'nodeId',
      'nodeKind',
      'phase',
      'questionIds',
      'role',
      'settings',
      'switchState',
      'thresholdLines',
    ];
    for (const node of graph.nodes) expect(Object.keys(node).sort()).toEqual(nodeKeys);
    for (const edge of graph.edges) expect(Object.keys(edge).sort()).toEqual(['active', 'edgeId', 'from', 'labelKind', 'to', 'tone']);
    const strings = [
      ...graph.nodes.flatMap(({ instructionEntries: _entries, ...node }) => Object.values(node)),
      ...graph.edges.flatMap((edge) => Object.values(edge)),
    ].filter((value): value is string => typeof value === 'string');
    expect(strings.length).toBeGreaterThan(0);
    for (const value of strings) expect(value).toMatch(VALUE_TOKEN);
  });
});
