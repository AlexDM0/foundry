/**
 * The copy of one entity's settings to others. What matters: a gate goes with its definition and its place at the end of each copied
 * phase, a gate of the same name replaces the target's own and the preview says so; what the target already holds as the source does makes
 * no edit; prepare steps and agent settings go only when ticked, the settings keeping the target's briefs; the source is never its own
 * target; and the whole set goes as one `pipeline-draft-edit` marked as a copy, or nothing when no edit is left.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline, PipelineEntity }  from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { CopyBetweenEntitiesDialogModel } from './CopyBetweenEntitiesDialogModel.ts';

const WEB: PipelineEntity = {
  kind:    'app',
  home:    ['/apps/web'],
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [{ name: 'lint', run: 'bun run lint' }, { name: 'typecheck', run: 'tsc' }],
  phases:  { build: ['lint', 'typecheck'], review: ['typecheck'], merge: [] },
  agents:  { builder: { model: 'opus', effort: 'high' } },
};

const ADMIN: PipelineEntity = {
  kind:    'app',
  home:    ['/apps/admin'],
  prepare: [],
  gates:   [{ name: 'typecheck', run: 'tsc --noEmit' }],
  phases:  { build: ['typecheck'], review: [], merge: [] },
  agents:  { builder: { model: 'sonnet', instructions: [{ kind: 'constitution' }] } },
};

const ROOT: PipelineEntity = {
  kind: 'root', home: ['/'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] },
};

const DRAFT: Pipeline = {
  version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, entities: { web: WEB, admin: ADMIN, root: ROOT },
};

describe('the gates of a copy', () => {
  test('go with their definitions and their place at the end of each copied phase; a gate of the same name replaces the target\'s', () => {
    const request = { fromEntityKey: 'web', toEntityKeys: ['admin'], parts: ['gates'] as const };
    expect(CopyBetweenEntitiesDialogModel.copyEditsOf(DRAFT, request)).toEqual([
      { field: 'entity:admin/gate:lint', value: { name: 'lint', run: 'bun run lint' } },
      { field: 'entity:admin/gate:typecheck', value: { name: 'typecheck', run: 'tsc' } },
      { field: 'entity:admin/phase-order:build', value: ['typecheck', 'lint'] },
      { field: 'entity:admin/phase-order:review', value: ['typecheck'] },
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
      { field: 'entity:root/gate:typecheck', value: { name: 'typecheck', run: 'tsc' } },
      { field: 'entity:root/phase-order:review', value: ['typecheck'] },
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
      { field: 'entity:admin/prepare:install', value: { name: 'install', run: 'bun install' } },
      { field: 'entity:admin/role:builder', value: { model: 'opus', effort: 'high', instructions: [{ kind: 'constitution' }] } },
    ]);
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
    const edits = [{ field: 'entity:admin/gate:lint' as const, value: null }];
    expect(CopyBetweenEntitiesDialogModel.copyCommandOf({ setupId: 'S1', draftRevision: 3 }, edits)).toEqual({
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 3, edits, isACopy: true,
    });
    expect(CopyBetweenEntitiesDialogModel.copyLabelOf(1)).toBe('Copy 1 edit');
    expect(CopyBetweenEntitiesDialogModel.copyLabelOf(4)).toBe('Copy 4 edits');
  });
});
