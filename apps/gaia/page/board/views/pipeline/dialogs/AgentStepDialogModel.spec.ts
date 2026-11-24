/**
 * The agent step dialog's model. What matters: the form starts from the draft's stored settings, else the pair the facts resolved, else
 * the worker defaults the forge serves in its limits, and from the served default list of the role where the draft stores none; Reset is
 * the served defaults, so a forge with other defaults gives other forms; a Save is one edit of the role
 * carrying model, effort and the entries in order; the meter level is the effort's place plus one (low 1 … max 5); every effort has a
 * hint, xhigh's the one the plan words; and the builder's Fixes line names the merge before review. The spec and plan agents are agent
 * steps of the Ticket phase whose Reset is the forge's own pair for each; the builder's and the reviewer's forms carry when they read the
 * pipeline documents, the stored rules over the role's defaults, and a Save stores only the rules that differ from those defaults.
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
    expect(AgentStepDialogModel.formOf('builder', draft, { model: 'opus', effort: 'low' }, LIMITS)).toEqual({
      model: 'fable', effort: 'xhigh', entries: [], documents: { spec: 'always', plan: 'always' }
    });
  });

  test('takes the resolved pair where the draft stores none, and the role\'s default list', () => {
    const form = AgentStepDialogModel.formOf('builder', MINIMAL_DRAFT, { model: 'sonnet', effort: 'high' }, LIMITS);
    expect(form).toEqual({
      model: 'sonnet', effort: 'high', entries: LIMITS.defaultInstructionsOfRole.builder, documents: { spec: 'always', plan: 'always' }
    });
  });

  test('falls back to the worker defaults with neither', () => {
    expect(AgentStepDialogModel.formOf('reviewer', null, null, LIMITS))
      .toEqual({
        model: LIMITS.workerModel, effort: LIMITS.workerEffort, entries: LIMITS.defaultInstructionsOfRole.reviewer, documents: { spec: 'always', plan: 'if-person-approved' }
      });
  });

  test('reads the worker pair and the default list from the limits the forge serves, never its own copy', () => {
    const otherForge = {
      ...LIMITS,
      workerModel:               'sonnet' as const,
      workerEffort:              'low' as const,
      defaultInstructionsOfRole: { ...LIMITS.defaultInstructionsOfRole, reviewer: [{ kind: 'file', path: 'docs/example-review.md' } as const] },
    };
    expect(AgentStepDialogModel.formOf('reviewer', null, null, otherForge))
      .toMatchObject({ model: 'sonnet', effort: 'low', entries: [{ kind: 'file', path: 'docs/example-review.md' }] });
    expect(AgentStepDialogModel.resetFormOf('reviewer', otherForge)).toMatchObject({ model: 'sonnet', effort: 'low' });
  });

  test('Reset is the defaults: the worker pair and the default list with the constitution first', () => {
    const entries: BoardInstructionDocument[] = [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }];
    expect(AgentStepDialogModel.resetFormOf('builder', LIMITS)).toEqual({
      model: LIMITS.workerModel, effort: LIMITS.workerEffort, entries, documents: { spec: 'always', plan: 'always' }
    });
  });

  test('a document agent falls back to its own pair, Reset puts it back, and it reads no pipeline document', () => {
    expect(AgentStepDialogModel.formOf('specAgent', null, null, LIMITS)).toEqual({
      model: 'sonnet', effort: 'medium', entries: LIMITS.defaultInstructionsOfRole.specAgent, documents: null
    });
    const draft: BoardPipelineDefinitionDocument = { ...MINIMAL_DRAFT, agents: { planAgent: { model: 'haiku', effort: 'low', instructions: null } } };
    expect(AgentStepDialogModel.formOf('planAgent', draft, null, LIMITS)).toMatchObject({ model: 'haiku', effort: 'low' });
    expect(AgentStepDialogModel.resetFormOf('planAgent', LIMITS)).toEqual({
      model: 'opus', effort: 'high', entries: LIMITS.defaultInstructionsOfRole.planAgent, documents: null
    });
  });

  test('the stored documents rules stand over the role\'s defaults, and the reviewer reads the spec always whatever is stored', () => {
    const draft: BoardPipelineDefinitionDocument = {
      ...MINIMAL_DRAFT,
      agents: {
        builder: {
          model: null, effort: null, instructions: null, documents: { plan: 'never' }
        },
        reviewer: {
          model: null, effort: null, instructions: null, documents: { spec: 'never', plan: 'always' }
        },
      },
    };
    expect(AgentStepDialogModel.formOf('builder', draft, null, LIMITS).documents).toEqual({ spec: 'always', plan: 'never' });
    expect(AgentStepDialogModel.formOf('reviewer', draft, null, LIMITS).documents).toEqual({ spec: 'always', plan: 'always' });
    expect(AgentStepDialogModel.formOf('reReviewer', draft, null, LIMITS).documents).toBeNull();
  });
});

describe('a Save', () => {
  test('is one edit of the role with its model, its effort and its entries in order', () => {
    const entries = [{ kind: 'default-brief', role: 'builder' } as const, { kind: 'file', path: 'docs/example-brief.md' } as const];
    const edit = AgentStepDialogModel.roleEditOf('builder', {
      model: 'haiku', effort: 'max', entries, documents: { spec: 'always', plan: 'always' }
    });
    expect(edit).toEqual({ target: 'role', role: 'builder', value: { model: 'haiku', effort: 'max', instructions: entries } });
  });

  test('stores only the documents rules that differ from the role\'s default', () => {
    const edit = AgentStepDialogModel.roleEditOf('reviewer', {
      model: 'opus', effort: 'high', entries: [], documents: { spec: 'always', plan: 'never' }
    });
    expect(edit).toEqual({
      target: 'role',
      role:   'reviewer',
      value:  {
        model: 'opus', effort: 'high', instructions: [], documents: { plan: 'never' }
      }
    });
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

  test('Ticket creation, the spec and plan agents and the Builder are agent steps, and the two document agents stand in the Ticket phase', () => {
    const roles = ['productOwner', 'specAgent', 'planAgent', 'builder', 'reviewer', null] as const;
    expect(roles.map((role) => AgentStepDialogModel.isAgentStepRole(role))).toEqual([true, true, true, true, false, false]);
    expect([AgentStepDialogModel.kickerOf('specAgent'), AgentStepDialogModel.kickerOf('planAgent')]).toEqual(['Ticket · Agent step', 'Ticket · Agent step']);
    expect([AgentStepDialogModel.wordsOf('specAgent').title, AgentStepDialogModel.wordsOf('planAgent').title]).toEqual(['Spec', 'Plan']);
  });
});
