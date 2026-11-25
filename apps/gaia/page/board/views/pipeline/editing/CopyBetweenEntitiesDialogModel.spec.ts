/**
 * The copy of one entity's settings to others. What matters: a gate goes with its definition and its place at the end of each copied phase,
 * a gate of the same name replaces the target's own and the preview says so; what the target already holds as the source does makes no
 * edit; prepare steps and agent settings go only when ticked, the settings keeping the target's briefs and document reading rules; the
 * source is never its own target; and the whole set goes as one `pipeline-draft-edit` marked as a copy, or nothing when no edit is left.
 */
import { describe, expect, test }                                                                    from 'bun:test';
import type { BoardDraftEditDocument, BoardPipelineDefinitionDocument, BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { exampleEntity, exampleGate, examplePipeline }                                               from '../../../testing/PipelineFixture.ts';
import { CopyBetweenEntitiesDialogModel }                                                            from './CopyBetweenEntitiesDialogModel.ts';

const WEB: BoardPipelineEntityDocument = exampleEntity('app', ['/apps/web'], {
  prepare: [{ name: 'install', run: 'bun install', runsIn: null }],
  gates:   [exampleGate('lint', 'bun run lint'), exampleGate('typecheck', 'tsc')],
  phases:  { build: ['lint', 'typecheck'], review: ['typecheck'], merge: [] },
  agents:  { builder: { model: 'opus', effort: 'high', instructions: null } },
});

const ADMIN: BoardPipelineEntityDocument = exampleEntity('app', ['/apps/admin'], {
  gates:  [exampleGate('typecheck', 'tsc --noEmit')],
  phases: { build: ['typecheck'], review: [], merge: [] },
  agents: { builder: { model: 'sonnet', effort: null, instructions: [{ kind: 'constitution' }] } },
});

const ROOT: BoardPipelineEntityDocument = exampleEntity('root', ['/']);

const DRAFT: BoardPipelineDefinitionDocument = examplePipeline({ entities: { web: WEB, admin: ADMIN, root: ROOT } });

describe('the gates of a copy', () => {
  test('go with their definitions and their place at the end of each copied phase; a gate of the same name replaces the target\'s', () => {
    const request = { fromEntityKey: 'web', toEntityKeys: ['admin'], parts: ['gates'] as const };
    expect(CopyBetweenEntitiesDialogModel.copyEditsOf(DRAFT, request)).toEqual([
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'gate', name: 'lint', value: exampleGate('lint', 'bun run lint') } },
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'gate', name: 'typecheck', value: exampleGate('typecheck', 'tsc') } },
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'phase-order', phase: 'build', names: ['typecheck', 'lint'] } },
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'phase-order', phase: 'review', names: ['typecheck'] } },
    ]);
    expect(CopyBetweenEntitiesDialogModel.previewLinesOf(DRAFT, request)).toEqual([
      { entityKey: 'admin', lead: 'Makes 4 edits in admin', rest: '; 1 gate replaces admin’s own typecheck.' },
    ]);
  });

  test('of one phase leave the other phases alone', () => {
    const request = {
      fromEntityKey: 'web', toEntityKeys: ['root'], parts: ['gates'] as const, gatePhases: ['review'] as const
    };
    expect(CopyBetweenEntitiesDialogModel.copyEditsOf(DRAFT, request)).toEqual([
      { target: 'within-entity', entityKey: 'root', edit: { target: 'gate', name: 'typecheck', value: exampleGate('typecheck', 'tsc') } },
      { target: 'within-entity', entityKey: 'root', edit: { target: 'phase-order', phase: 'review', names: ['typecheck'] } },
    ]);
  });

  test('make no edit for what the target already holds as the source does, so a copy that changes nothing sends nothing', () => {
    const same = { ...DRAFT, entities: { web: WEB, twin: { ...WEB, home: ['/apps/twin'] } } };
    const request = { fromEntityKey: 'web', toEntityKeys: ['twin', 'web'], parts: ['gates', 'prepare-steps', 'agent-settings'] as const };
    expect(CopyBetweenEntitiesDialogModel.copyEditsOf(same, request)).toEqual([]);
    expect(CopyBetweenEntitiesDialogModel.previewLinesOf(same, request)).toEqual([]);
    expect(CopyBetweenEntitiesDialogModel.copyCommandOf({ setupId: 'S1', draftRevision: 3 }, [])).toBeNull();
  });
});

describe('prepare steps and agent settings', () => {
  test('go only when ticked; the settings carry the model and effort and keep the target\'s briefs', () => {
    const request = { fromEntityKey: 'web', toEntityKeys: ['admin'], parts: ['prepare-steps', 'agent-settings'] as const };
    expect(CopyBetweenEntitiesDialogModel.copyEditsOf(DRAFT, request)).toEqual([
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'prepare', name: 'install', value: { name: 'install', run: 'bun install', runsIn: null } } },
      {
        target:    'within-entity',
        entityKey: 'admin',
        edit:      { target: 'role', role: 'builder', value: { model: 'opus', effort: 'high', instructions: [{ kind: 'constitution' }] } },
      },
    ]);
  });
});

describe('the agent settings of a copy', () => {
  const adminReadingNoPlan = exampleEntity('app', ['/apps/admin'], {
    agents: {
      builder: {
        model: 'opus', effort: 'high', instructions: null, documents: { plan: 'never' }
      }
    },
  });
  const draft = examplePipeline({ entities: { web: WEB, admin: adminReadingNoPlan } });
  const request = { fromEntityKey: 'web', toEntityKeys: ['admin'], parts: ['agent-settings'] as const };

  test('keep the target\'s document reading rules, so a copy that sets the same model and effort sends nothing', () => {
    expect(CopyBetweenEntitiesDialogModel.copyEditsOf(draft, request)).toEqual([]);
  });

  test('keep them in the role edit a copy of another model sends', () => {
    const otherModel = examplePipeline({
      entities: {
        web:   WEB,
        admin: {
          ...adminReadingNoPlan,
          agents: {
            builder: {
              model: 'sonnet', effort: 'high', instructions: null, documents: { plan: 'never' }
            }
          }
        }
      }
    });
    expect(CopyBetweenEntitiesDialogModel.copyEditsOf(otherModel, request)).toEqual([{
      target:    'within-entity',
      entityKey: 'admin',
      edit:      {
        target: 'role',
        role:   'builder',
        value:  {
          model: 'opus', effort: 'high', instructions: null, documents: { plan: 'never' }
        }
      },
    }]);
  });
});

describe('the targets and the command', () => {
  test('offer every entity but the source, with its kind and gates, the root kept for a person', () => {
    expect(CopyBetweenEntitiesDialogModel.targetOptionsOf(DRAFT, 'web')).toEqual([
      { entityKey: 'admin', explanation: 'app · 1 gate' },
      { entityKey: 'root', explanation: 'root · kept for a person' },
    ]);
  });

  test('send the whole set as one edit marked as a copy', () => {
    const edits: BoardDraftEditDocument[] = [{ target: 'within-entity', entityKey: 'admin', edit: { target: 'gate', name: 'lint', value: null } }];
    expect(CopyBetweenEntitiesDialogModel.copyCommandOf({ setupId: 'S1', draftRevision: 3 }, edits)).toEqual({
      boardCommandVersion: 3, kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 3, edits, isACopy: true,
    });
    expect(CopyBetweenEntitiesDialogModel.copyLabelOf(1)).toBe('Copy 1 edit');
    expect(CopyBetweenEntitiesDialogModel.copyLabelOf(4)).toBe('Copy 4 edits');
  });
});
