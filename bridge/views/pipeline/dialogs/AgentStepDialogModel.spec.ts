/**
 * The agent step dialog's model. What matters: the form starts from the draft's stored settings, else the pair the facts resolved, else
 * the worker defaults, and from the role's default list where the draft stores none; Reset is the defaults; a Save is one edit of the role
 * carrying model, effort and the entries in order; the meter level is the effort's place plus one (low 1 … max 5); every effort has a
 * hint, xhigh's the one the plan words; and the builder's Fixes line names the merge before review.
 */
import { describe, expect, test } from 'bun:test';

import type { InstructionEntry, Pipeline } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { AGENT_EFFORTS }                   from '../../../../src/lib/tracker-model/constants/AgentSettings.ts';
import { DEFAULT_INSTRUCTIONS_OF_ROLE }    from '../../../../src/lib/tracker-model/constants/PipelineDefaults.ts';
import { WORKER_EFFORT, WORKER_MODEL }     from '../../../../src/shared/constants/OverseerLimits.ts';
import { AgentStepDialogModel }            from './AgentStepDialogModel.ts';

const MINIMAL_DRAFT: Pipeline = {
  version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] },
};

describe('the form a dialog opens on', () => {
  test('takes the draft\'s stored settings first', () => {
    const draft: Pipeline = { ...MINIMAL_DRAFT, agents: { builder: { model: 'fable', effort: 'xhigh', instructions: [] } } };
    expect(AgentStepDialogModel.formOf('builder', draft, { model: 'opus', effort: 'low' })).toEqual({ model: 'fable', effort: 'xhigh', entries: [] });
  });

  test('takes the resolved pair where the draft stores none, and the role\'s default list', () => {
    const form = AgentStepDialogModel.formOf('builder', MINIMAL_DRAFT, { model: 'sonnet', effort: 'high' });
    expect(form).toEqual({ model: 'sonnet', effort: 'high', entries: DEFAULT_INSTRUCTIONS_OF_ROLE.builder });
  });

  test('falls back to the worker defaults with neither', () => {
    expect(AgentStepDialogModel.formOf('reviewer', null, null)).toEqual({ model: WORKER_MODEL, effort: WORKER_EFFORT, entries: DEFAULT_INSTRUCTIONS_OF_ROLE.reviewer });
  });

  test('Reset is the defaults: the worker pair and the default list with the constitution first', () => {
    const entries: InstructionEntry[] = [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }];
    expect(AgentStepDialogModel.resetFormOf('builder')).toEqual({ model: WORKER_MODEL, effort: WORKER_EFFORT, entries });
  });
});

describe('a Save', () => {
  test('is one edit of the role with its model, its effort and its entries in order', () => {
    const entries = [{ kind: 'default-brief', role: 'builder' } as const, { kind: 'file', path: 'docs/example-brief.md' } as const];
    const edit = AgentStepDialogModel.roleEditOf('builder', { model: 'haiku', effort: 'max', entries });
    expect(edit).toEqual({ field: 'role:builder', value: { model: 'haiku', effort: 'max', instructions: entries } });
  });
});

describe('the words', () => {
  test('the meter level is the effort\'s place plus one, from low 1 to max 5', () => {
    expect(AGENT_EFFORTS.map((effort) => AgentStepDialogModel.levelOf(effort, AGENT_EFFORTS))).toEqual([1, 2, 3, 4, 5]);
  });

  test('every effort has a hint, and xhigh is deeper than high', () => {
    AGENT_EFFORTS.forEach((effort) => expect(AgentStepDialogModel.effortHintOf(effort)).not.toBe(''));
    expect(AgentStepDialogModel.effortHintOf('xhigh')).toBe('Deeper than high, for large or subtle tickets.');
  });

  test('the builder fixes red build gates, the merge before review\'s conflicts and red gates, and the train\'s without a review', () => {
    expect(AgentStepDialogModel.wordsOf('builder').fixes).toBe(
      'Red build gates, the conflicts and red build gates of the merge before review, and conflicts and red merge gates when no review ran after it.',
    );
    expect(AgentStepDialogModel.wordsOf('productOwner').fixes).toBeNull();
  });

  test('the kicker names the phase the step stands in, then the kind of step', () => {
    expect(AgentStepDialogModel.kickerOf('productOwner')).toBe('Ticket · Agent step');
    expect(AgentStepDialogModel.kickerOf('builder')).toBe('Build · Agent step');
  });

  test('only Ticket creation and the Builder are agent steps', () => {
    expect(['productOwner', 'builder', 'reviewer', null].map((role) => AgentStepDialogModel.isAgentStepRole(role as 'reviewer' | null))).toEqual([true, true, false, false]);
  });
});
