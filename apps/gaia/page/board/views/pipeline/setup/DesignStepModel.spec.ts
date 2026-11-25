/**
 * The design step's model against the proposal fixtures. What matters: the footer counts the prepare steps and each phase's gates from
 * the facts' summary; Apply is disabled exactly while a question is open, with its reason and the amber hint, and enabled with "All
 * questions answered" at zero; the Changes tab's name says what its count counts; the panel head's dot and word come from the agent's
 * job and its ready mark; the newest change is the agent's newest edit that is not undone; each field shows on the flow in the
 * phase that holds it: a step as its card, a gate or prepare step as its row in the first phase that lists it, an order as the gates,
 * and how a ticket is written as the Ticket phase's first step.
 */
import { describe, expect, test }                                                             from 'bun:test';
import type { BoardPipelineFlowDocument, BoardPipelineSetupDocument, BoardSetupEditDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { pipelineBoardStateOf }                                                               from '../../../testing/PipelineFixture.ts';
import type { AgentSessionState }                                                             from '../agent-panel/AgentSessionModel.ts';
import { DesignStepModel }                                                                    from './DesignStepModel.ts';

function proposal(): { readonly flow: BoardPipelineFlowDocument; readonly setup: BoardPipelineSetupDocument } {
  const board = pipelineBoardStateOf('A2');
  const flow = board.pipeline.flow ?? null;
  const setup = board.pipeline.setup ?? null;
  if (flow === null || setup === null) throw new Error('the fixture A2 has no flow or no setup');
  return { flow, setup };
}

function edit(changes: Partial<BoardSetupEditDocument> & Pick<BoardSetupEditDocument, 'editId'>): BoardSetupEditDocument {
  return {
    by: 'agent', field: 'gate:typecheck', summary: 'Example change.', undone: false, batch: null, ...changes,
  };
}

describe('the footer', () => {
  test('counts the prepare steps and each phase\'s gates from the summary', () => {
    expect(DesignStepModel.footerSummaryOf(proposal().setup.summary)).toBe('1 prepare step · 3 build gates · 3 review gates · 3 merge gates');
    const summary = { ...proposal().setup.summary, prepareStepCount: 2, gateCountByPhase: { build: 1, review: 0, merge: 1 } };
    expect(DesignStepModel.footerSummaryOf(summary)).toBe('2 prepare steps · 1 build gate · 0 review gates · 1 merge gate');
  });
});

describe('Apply', () => {
  test('is disabled exactly while a question is open, with its reason and the hint', () => {
    const openHint = { tone: 'question-open' as const, text: 'Answer the open question to apply' };
    expect(DesignStepModel.applyAvailabilityOf(1)).toEqual({ enabled: false, disabledReason: 'Answer the open question first', hint: openHint });
    expect(DesignStepModel.applyAvailabilityOf(2).hint.text).toBe('Answer the 2 open questions to apply');
    expect(DesignStepModel.applyAvailabilityOf(0)).toEqual({ enabled: true, disabledReason: null, hint: { tone: 'answered', text: 'All questions answered' }, });
  });
});

describe('the aside', () => {
  test('names the Changes tab by what its count counts', () => {
    expect(DesignStepModel.changesTabNameOf(proposal().flow.changeList.length)).toBe('Changes, 9 changes');
    expect(DesignStepModel.changesTabNameOf(1)).toBe('Changes, 1 change');
  });

  test('the agent designs while it runs, is ready once it says so, is not running with no job, and is not launched rather than designing', () => {
    const { setup } = proposal();
    const statusOf = (shown: typeof setup, sessionState: AgentSessionState) => DesignStepModel.panelStatusOf(DesignStepModel.agentStateOf(shown, sessionState));
    expect(statusOf(setup, 'running')).toEqual({ tone: 'working', text: 'Designing' });
    const ready = { ...setup, record: { ...setup.record, readyToContinue: ['design' as const] } };
    expect(statusOf(ready, 'running')).toEqual({ tone: 'ready', text: 'Proposal ready' });
    expect(statusOf(ready, 'stopped')).toEqual({ tone: 'idle', text: 'Not running' });
    expect(statusOf(setup, 'not-launched')).toEqual({ tone: 'failed', text: 'Not launched' });
  });

  test('the newest change is the agent\'s newest edit that is not undone', () => {
    expect(DesignStepModel.newestAgentEditOf([
      edit({ editId: 'E1' }), edit({ editId: 'E2', undone: true }), edit({ editId: 'E3', by: 'user' }),
    ])?.editId).toBe('E1');
    expect(DesignStepModel.newestAgentEditOf([edit({ editId: 'E1', by: 'user' })])).toBeNull();
  });
});

describe('show on the flow', () => {
  test('a gate or prepare step shows as its row in the first phase that lists it, an order as the gates table, a step as its card', () => {
    const { flow } = proposal();
    expect(DesignStepModel.flowTargetOf('gate:typecheck', flow)).toEqual({ phase: 'build', item: { kind: 'gate-row', rowKey: 'gate:typecheck' } });
    expect(DesignStepModel.flowTargetOf('gate:browser-tests', flow)).toEqual({ phase: 'merge', item: { kind: 'gate-row', rowKey: 'gate:browser-tests' } });
    expect(DesignStepModel.flowTargetOf('prepare:install', flow)).toEqual({ phase: 'build', item: { kind: 'gate-row', rowKey: 'prepare:install' } });
    expect(DesignStepModel.flowTargetOf('phase-order:review', flow)).toEqual({ phase: 'review', item: { kind: 'gates' } });
    expect(DesignStepModel.flowTargetOf('role:builder', flow)).toEqual({ phase: 'build', item: { kind: 'step', nodeId: 'builder' } });
    expect(DesignStepModel.flowTargetOf('review', flow)).toEqual({ phase: 'review', item: { kind: 'step', nodeId: 'review' } });
    expect(DesignStepModel.flowTargetOf('airlock', flow)).toEqual({ phase: 'merge', item: { kind: 'step', nodeId: 'merge-in-airlock' } });
    expect(DesignStepModel.flowTargetOf('approval:merge', flow)).toEqual({ phase: 'review', item: { kind: 'step', nodeId: 'human-code-review' } });
    expect(DesignStepModel.flowTargetOf('constitution', flow)).toBeNull();
    expect(DesignStepModel.flowTargetOf('gate:no-such-gate', flow)).toBeNull();
    expect(DesignStepModel.showLinkTextOf('gate:typecheck')).toBe('Show typecheck on the flow');
  });

  test('how a ticket is written shows as the Ticket phase\'s first step, and the document reviews and agents as their cards', () => {
    const flowOfState = (name: 'A2' | 'A2-spec-then-plan'): BoardPipelineFlowDocument => {
      const { flow } = pipelineBoardStateOf(name).pipeline;
      if (flow === null) throw new Error(`${name} has no flow`);
      return flow;
    };
    const flow = flowOfState('A2-spec-then-plan');
    expect(DesignStepModel.flowTargetOf('ticket-writing', flow)).toEqual({ phase: 'ticket', item: { kind: 'step', nodeId: 'spec-writing' } });
    expect(DesignStepModel.flowTargetOf('ticket-writing', flowOfState('A2'))).toEqual({ phase: 'ticket', item: { kind: 'step', nodeId: 'ticket-creation' } });
    expect(DesignStepModel.flowTargetOf('approval:spec', flow)).toEqual({ phase: 'ticket', item: { kind: 'step', nodeId: 'human-spec-review' } });
    expect(DesignStepModel.flowTargetOf('approval:plan', flow)).toEqual({ phase: 'ticket', item: { kind: 'step', nodeId: 'human-plan-review' } });
    expect(DesignStepModel.flowTargetOf('role:planAgent', flow)).toEqual({ phase: 'ticket', item: { kind: 'step', nodeId: 'plan-writing' } });
  });
});

describe('Discard proposal', () => {
  test('sends pipeline-draft-discard for the setup', () => {
    expect(DesignStepModel.discardCommandOf('S1')).toEqual({ boardCommandVersion: 3, kind: 'pipeline-draft-discard', setupId: 'S1' });
  });
});
