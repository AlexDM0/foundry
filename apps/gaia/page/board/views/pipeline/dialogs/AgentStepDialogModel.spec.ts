/**
 * The agent step dialog's model. What matters: the form starts from the draft's stored settings, else the pair the facts resolved, else
 * the worker defaults the forge serves in its limits, and from the served default list of the role where the draft stores none; Reset is
 * the served defaults, so a forge with other defaults gives other forms; a Save is one edit of the role
 * carrying model, effort and the entries in order; the meter level is the effort's place plus one (low 1 … max 5); every effort has a
 * hint, xhigh's the one the plan words; and the builder's Fixes line names the merge before review.
 */
import { describe, expect, test }                                         from 'bun:test';
import type { BoardInstructionDocument, BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BOARD_AGENT_EFFORTS }                                            from '../../../../@types/board/BoardVocabulary.ts';
import { EXAMPLE_BOARD_LIMITS }                                           from '../../../testing/PageLimitsFixture.ts';
import { examplePipeline }                                                from '../../../testing/PipelineFixture.ts';
import { AgentStepDialogModel }                                           from './AgentStepDialogModel.ts';

const MINIMAL_DRAFT: BoardPipelineDefinitionDocument = examplePipeline();

const LIMITS = EXAMPLE_BOARD_LIMITS;

describe('the form a dialog opens on', () => {
  test('takes the draft\'s stored settings first', () => {
    const draft: BoardPipelineDefinitionDocument = { ...MINIMAL_DRAFT, agents: { builder: { model: 'fable', effort: 'xhigh', instructions: [] } } };
    expect(AgentStepDialogModel.formOf('builder', draft, { model: 'opus', effort: 'low' }, LIMITS)).toEqual({ model: 'fable', effort: 'xhigh', entries: [] });
  });

  test('takes the resolved pair where the draft stores none, and the role\'s default list', () => {
    const form = AgentStepDialogModel.formOf('builder', MINIMAL_DRAFT, { model: 'sonnet', effort: 'high' }, LIMITS);
    expect(form).toEqual({ model: 'sonnet', effort: 'high', entries: LIMITS.defaultInstructionsOfRole.builder });
  });

  test('falls back to the worker defaults with neither', () => {
    expect(AgentStepDialogModel.formOf('reviewer', null, null, LIMITS))
      .toEqual({ model: LIMITS.workerModel, effort: LIMITS.workerEffort, entries: LIMITS.defaultInstructionsOfRole.reviewer });
  });

  test('reads the worker pair and the default list from the limits the forge serves, never its own copy', () => {
    const otherForge = {
      ...LIMITS,
      workerModel:               'sonnet' as const,
      workerEffort:              'low' as const,
      defaultInstructionsOfRole: { ...LIMITS.defaultInstructionsOfRole, reviewer: [{ kind: 'file', path: 'docs/example-review.md' } as const] },
    };
    expect(AgentStepDialogModel.formOf('reviewer', null, null, otherForge))
      .toEqual({ model: 'sonnet', effort: 'low', entries: [{ kind: 'file', path: 'docs/example-review.md' }] });
    expect(AgentStepDialogModel.resetFormOf('reviewer', otherForge)).toMatchObject({ model: 'sonnet', effort: 'low' });
  });

  test('Reset is the defaults: the worker pair and the default list with the constitution first', () => {
    const entries: BoardInstructionDocument[] = [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }];
    expect(AgentStepDialogModel.resetFormOf('builder', LIMITS)).toEqual({ model: LIMITS.workerModel, effort: LIMITS.workerEffort, entries });
  });
});

describe('a Save', () => {
  test('is one edit of the role with its model, its effort and its entries in order', () => {
    const entries = [{ kind: 'default-brief', role: 'builder' } as const, { kind: 'file', path: 'docs/example-brief.md' } as const];
    const edit = AgentStepDialogModel.roleEditOf('builder', { model: 'haiku', effort: 'max', entries });
    expect(edit).toEqual({ target: 'role', role: 'builder', value: { model: 'haiku', effort: 'max', instructions: entries } });
  });
});

describe('the words', () => {
  test('the meter level is the effort\'s place plus one, from low 1 to max 5', () => {
    expect(BOARD_AGENT_EFFORTS.map((effort) => AgentStepDialogModel.levelOf(effort, BOARD_AGENT_EFFORTS))).toEqual([1, 2, 3, 4, 5]);
  });

  test('every effort has a hint, and xhigh is deeper than high', () => {
    BOARD_AGENT_EFFORTS.forEach((effort) => expect(AgentStepDialogModel.effortHintOf(effort)).not.toBe(''));
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
