/**
 * The Focus layout's model over the pipeline fixtures. What matters: the nodes fall into the four phases in the facts' order, with each
 * add card right after its node and the merge train's queue, frame and end left to the Merge header; a step's phase is the one that holds
 * it; each tab says its steps and gates, and its pill says what waits there per stage (a question first, then the live tickets, the
 * editing changes or the smallest pipeline's word); the header words when a phase leaves, a phase with no step is skipped and Merge ends
 * on main; and a live step's state is a word. The spec-then-plan route keeps its four writing and review steps in the Ticket phase, says
 * the ticket is ready with a numbered Acceptance in the spec, an approved spec and an approved plan, and words who approves the spec by
 * its switch.
 */
import { describe, expect, test }         from 'bun:test';
import type { BoardPipelineFlowDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';

import { pipelineBoardStateOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelinePhaseModel, type PipelinePhase }         from './PipelinePhaseModel.ts';

function flowOf(name: PipelineFixtureName): BoardPipelineFlowDocument {
  const { flow } = pipelineBoardStateOf(name).pipeline;
  if (flow === null) throw new Error(`${name} has no flow`);
  return flow;
}

function cardIdsOf(flow: BoardPipelineFlowDocument, phase: PipelinePhase): string[] {
  return PipelinePhaseModel.stepItemsOf(flow, phase).map((item) => (item.kind === 'step' ? item.node.nodeId : `+${item.place}`));
}

function tabsOf(flow: BoardPipelineFlowDocument, openQuestionIds: readonly string[] = [], minimal = !flow.nodes.some((node) => node.nodeKind === 'review')) {
  return PipelinePhaseModel.tabViewsOf(flow, { stage: flow.toolbarStage, minimal, openQuestionIds });
}

describe('the phases', () => {
  test('the proposal\'s steps fall into Ticket, Build, Review and Merge; the Merge header draws the queue, the Airlock and main', () => {
    const flow = flowOf('A2');
    expect(['ticket', 'build', 'review', 'merge'].map((phase) => cardIdsOf(flow, phase as PipelinePhase))).toEqual([
      ['ticket-creation', 'human-ticket-review'],
      ['builder', 'gates-build', 'merge-before-review'],
      ['review', 'gates-review', 're-review', 'human-code-review'],
      ['merge-in-airlock', 're-review-in-airlock', 'gates-merge'],
    ]);
    expect(PipelinePhaseModel.phaseOfNode(flow, 'fast-forward-main')).toBe('merge');
  });

  test('the smallest pipeline has an add card after the Builder and in the merge train, and no Review step', () => {
    const flow = flowOf('A7');
    expect(cardIdsOf(flow, 'build')).toEqual(['builder', '+after-builder']);
    expect(cardIdsOf(flow, 'review')).toEqual([]);
    expect(cardIdsOf(flow, 'merge')).toEqual(['merge-in-airlock', '+merge-train']);
  });

  test('Human code review with no review step opens the Review phase at its merge, which shows as an Automatic step', () => {
    const flow = flowOf('A7-human-code-review-without-review');
    expect(cardIdsOf(flow, 'review')[0]).toBe('merge-before-human-code-review');
    expect(PipelinePhaseModel.phaseOfNode(flow, 'builder')).toBe('build');
  });

  test('a gate phase\'s table stands in the phase of its name, and Ticket has none', () => {
    expect(PipelinePhaseModel.phaseOfGatePhase('review')).toBe('review');
    expect(PipelinePhaseModel.gatePhaseOf('ticket')).toBeNull();
    expect(PipelinePhaseModel.gatePhaseOf('merge')).toBe('merge');
  });
});

describe('the stepper\'s tabs', () => {
  test('each tab counts its steps and gates', () => {
    expect(tabsOf(flowOf('A2')).map((tab) => [tab.name, tab.subText, tab.pill])).toEqual([
      ['Ticket', '2 steps · no gates', null],
      ['Build', '3 steps · 3 gates', null],
      ['Review', '4 steps · 3 gates', null],
      ['Merge', '3 steps · 3 gates', null],
    ]);
  });

  test('a question waiting in a phase is its orange pill', () => {
    expect(tabsOf(flowOf('A2-question-open'), ['Q3']).find((tab) => tab.phase === 'merge')?.pill).toEqual({ text: '1 question', tone: 'warn' });
  });

  test('a live tab counts its tickets, and the Ticket phase its drafts in work', () => {
    const tabs = tabsOf(flowOf('A5'));
    expect(tabs.map((tab) => tab.pill?.text ?? null)).toEqual(['1 ticket', '3 tickets', null, null]);
    expect(tabs[0]?.subText).toBe('2 steps · 1 draft in work');
  });

  test('an editing tab counts the changed steps and gate rows', () => {
    expect(tabsOf(flowOf('A6-drawn-changes')).slice(1, 3).map((tab) => tab.pill)).toEqual([
      { text: '2 changes', tone: 'warn' },
      { text: '3 changes', tone: 'warn' },
    ]);
  });

  test('the smallest pipeline\'s tabs say "Removed" or "Changed", and its Review phase with no step is a ring', () => {
    const flow = flowOf('A7');
    const nodes = flow.nodes.map((node) => (node.nodeId === 'builder' ? { ...node, mark: 'changed' as const } : node));
    const tabs = tabsOf({ ...flow, nodes });
    expect(tabs.map((tab) => tab.pill?.text ?? null)).toEqual([null, 'Changed', null, null]);
    expect(tabs[2]).toMatchObject({ subText: 'No review', runsNoStep: true });
    const [builder] = nodes.filter((node) => node.nodeId === 'builder');
    if (builder === undefined) throw new Error('A7 has no builder');
    const removedReview = {
      ...builder, nodeId: 'review', nodeKind: 'review' as const, mark: 'removed' as const
    };
    expect(tabsOf({ ...flow, nodes: [...nodes.slice(0, 3), removedReview, ...nodes.slice(3)] }, [], true)[2]?.pill).toEqual({ text: 'Removed', tone: 'error' });
  });
});

describe('the open phase\'s header', () => {
  test('a phase says when it leaves and opens the next; Merge ends on main', () => {
    const flow = flowOf('A2');
    expect(PipelinePhaseModel.headerOf(flow, 'build')).toEqual({
      numberText: 'Phase 2 of 4',
      name:       'Build',
      purpose:    'A builder makes the change in a worktree of its own.',
      endLead:    'Leaves when',
      endText:    'all build gates are green',
      nextPhase:  'review',
    });
    expect(PipelinePhaseModel.headerOf(flow, 'merge')).toMatchObject({ endLead: 'Ends', endText: 'on main, by fast-forward', nextPhase: null });
    expect(PipelinePhaseModel.nextLabelOf('review')).toBe('Next: Review');
    expect(PipelinePhaseModel.phaseLabelOf('build')).toBe('Phase 2: Build');
  });

  test('the smallest pipeline\'s Build leaves when the builder commits, and its Review is skipped', () => {
    const flow = flowOf('A7');
    expect(PipelinePhaseModel.headerOf(flow, 'build').endText).toBe('the builder commits');
    expect(PipelinePhaseModel.headerOf(flow, 'review')).toMatchObject({ endLead: 'Skipped:', endText: 'no step in this phase' });
    expect(PipelinePhaseModel.headerOf(flow, 'review').purpose).toBe('No review. A built ticket goes straight to the merge train.');
  });
});

describe('live steps', () => {
  test('a live step\'s state is a word: agents work, gates run, and User\'s step waits', () => {
    expect([
      PipelinePhaseModel.liveStateTextOf('agent', 0),
      PipelinePhaseModel.liveStateTextOf('agent', 1),
      PipelinePhaseModel.liveStateTextOf('agent', 2),
      PipelinePhaseModel.liveStateTextOf('gates', 1),
      PipelinePhaseModel.liveStateTextOf('you', 1),
    ]).toEqual([null, 'Working', '2 working', 'Running', 'Waiting']);
  });

  test('the Merge header reads the merge train past the queue, the fast-forward of main too, and the queue for it', () => {
    const flow = flowOf('A2');
    expect(PipelinePhaseModel.trainNodeIdsOf(flow)).toEqual(['airlock', 'merge-in-airlock', 're-review-in-airlock', 'gates-merge', 'fast-forward-main']);
    expect(PipelinePhaseModel.queueNodeIdsOf(flow)).toEqual(['ready-for-airlock']);
  });
});

describe('the Ticket phase by how a ticket is written', () => {
  test('the spec-then-plan route draws its four steps in the Ticket phase, and the Builder still opens Build', () => {
    const flow = flowOf('A2-spec-then-plan');
    expect(cardIdsOf(flow, 'ticket')).toEqual(['spec-writing', 'human-spec-review', 'plan-writing', 'human-plan-review']);
    expect(PipelinePhaseModel.phaseOfNode(flow, 'builder')).toBe('build');
    expect(tabsOf(flow).find((tab) => tab.phase === 'ticket')?.subText).toBe('4 steps · no gates');
    expect([PipelinePhaseModel.ticketWritingRouteOf(flow), PipelinePhaseModel.ticketWritingRouteOf(flowOf('A2'))]).toEqual(['spec-then-plan', 'one-ticket']);
  });

  test('one ticket is ready with an Acceptance and a Brief; a spec, then a plan, with the spec\'s Acceptance and both approved', () => {
    expect(PipelinePhaseModel.ticketReadinessOf(flowOf('A2')).lines.map((line) => line.title)).toEqual(['A numbered Acceptance', 'A Brief']);
    const readiness = PipelinePhaseModel.ticketReadinessOf(flowOf('A2-spec-then-plan'));
    expect(readiness.lead).toBe('A ticket is ready to build when it has all of these');
    expect(readiness.lines.map((line) => [line.title, line.text])).toEqual([
      ['A numbered Acceptance', 'In the spec. Each line is one check the change must pass.'],
      ['An approved spec', 'Approved by you, since Human spec review is on.'],
      ['An approved plan', 'It takes the place of the Brief. The builder starts from it.'],
    ]);
    expect(PipelinePhaseModel.ticketReadinessOf(flowOf('A2-spec-then-plan-reviews-off')).lines[1]?.text)
      .toBe('Approved by the pipeline when the spec agent calls it ready, since Human spec review is off.');
  });

  test('the Ticket header says how the request becomes a ticket, reviewed by User only while a document\'s review is on', () => {
    expect(PipelinePhaseModel.headerOf(flowOf('A2'), 'ticket').purpose).toBe('A request becomes a ticket with a numbered Acceptance and a Brief.');
    expect(PipelinePhaseModel.headerOf(flowOf('A2-spec-then-plan'), 'ticket').purpose).toBe('A request becomes a ticket: written, reviewed by you, then ready to build.');
    expect(PipelinePhaseModel.headerOf(flowOf('A2-spec-then-plan-reviews-off'), 'ticket').purpose).toBe('A request becomes a ticket: a spec, then a plan, then ready to build.');
  });
});
