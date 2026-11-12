/**
 * The design step's model against the proposal fixtures. What matters: the footer counts the prepare steps and each phase's gates from
 * the facts' summary; Apply is disabled exactly while a question is open, with its reason and the amber hint, and enabled with "All
 * questions answered" at zero; the Changes tab's name says what its count counts; the agent's state and status line come from its job,
 * its ready mark and the snapshot; the newest change is the agent's newest edit that is not undone; each field shows on the flow at its
 * node, a gate or prepare step in the first phase whose tab lists it.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineFlowFacts, PipelineSetupFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { SetupEdit }                             from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { pipelineBoardStateOf }                       from '../../../testing/PipelineFixture.ts';
import { DesignStepModel }                            from './DesignStepModel.ts';

function proposal(): { readonly flow: PipelineFlowFacts; readonly setup: PipelineSetupFacts } {
  const board = pipelineBoardStateOf('A2');
  const flow = board.pipelineFlow ?? null;
  const setup = board.pipelineSetup ?? null;
  if (flow === null || setup === null) throw new Error('the fixture A2 has no flow or no setup');
  return { flow, setup };
}

function edit(changes: Partial<SetupEdit> & Pick<SetupEdit, 'editId'>): SetupEdit {
  return {
    by: 'agent', field: 'gate:typecheck', summary: 'Example change.', undone: false, ...changes,
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

  test('the agent designs while it runs, is ready once it says so, and is not running with no job', () => {
    const { setup } = proposal();
    expect(DesignStepModel.statusLineOf(setup)).toBe('J4 · designing · snapshot 1111111');
    const ready = { ...setup, record: { ...setup.record, readyToContinue: ['design' as const] } };
    expect(DesignStepModel.statusLineOf(ready)).toBe('J4 · proposal ready · snapshot 1111111');
    expect(DesignStepModel.agentStateOf({ ...ready, agentJobState: null })).toBe('not-running');
  });

  test('the newest change is the agent\'s newest edit that is not undone', () => {
    expect(DesignStepModel.newestAgentEditOf([
      edit({ editId: 'E1' }), edit({ editId: 'E2', undone: true }), edit({ editId: 'E3', by: 'user' }),
    ])?.editId).toBe('E1');
    expect(DesignStepModel.newestAgentEditOf([edit({ editId: 'E1', by: 'user' })])).toBeNull();
  });
});

describe('show on the flow', () => {
  test('a gate or prepare step shows at the first phase whose tab lists it; a step at its node', () => {
    const { flow } = proposal();
    expect(DesignStepModel.flowTargetOf('gate:typecheck', flow)).toEqual({ nodeId: 'gates-build', phase: 'build' });
    expect(DesignStepModel.flowTargetOf('gate:browser-tests', flow)).toEqual({ nodeId: 'gates-merge', phase: 'merge' });
    expect(DesignStepModel.flowTargetOf('prepare:install', flow)).toEqual({ nodeId: 'gates-build', phase: 'build' });
    expect(DesignStepModel.flowTargetOf('phase-order:review', flow)).toEqual({ nodeId: 'gates-review', phase: 'review' });
    expect(DesignStepModel.flowTargetOf('role:builder', flow)).toEqual({ nodeId: 'builder', phase: null });
    expect(DesignStepModel.flowTargetOf('review', flow)).toEqual({ nodeId: 'review', phase: null });
    expect(DesignStepModel.flowTargetOf('airlock', flow)).toEqual({ nodeId: 'merge-in-airlock', phase: null });
    expect(DesignStepModel.flowTargetOf('approval:merge', flow)).toEqual({ nodeId: 'human-code-review', phase: null });
    expect(DesignStepModel.flowTargetOf('constitution', flow)).toBeNull();
    expect(DesignStepModel.flowTargetOf('gate:no-such-gate', flow)).toBeNull();
    expect(DesignStepModel.showLinkTextOf('gate:typecheck')).toBe('Show typecheck on the flow');
  });
});

describe('Discard proposal', () => {
  test('sends pipeline-draft-discard for the setup', () => {
    expect(DesignStepModel.discardCommandOf('S1')).toEqual({ kind: 'pipeline-draft-discard', setupId: 'S1' });
  });
});
