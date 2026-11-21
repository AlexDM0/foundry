/**
 * What the first Apply over entities stores, per level. What matters: the forge leads with its approvals and the merge train's conflict
 * re-review; each entity follows in the draft's order with its kind, prepare steps, gates per phase, review and cap in jobs; the root
 * kept for a person says so; a draft without entities lists nothing.
 */
import { describe, expect, test }                from 'bun:test';
import type { BoardPipelineDefinitionDocument }  from '../../../../@types/board/BoardPipelineDocuments.ts';
import { examplePipeline, pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { LevelSummaryListModel }                 from './LevelSummaryListModel.ts';

function monorepoDraft(): BoardPipelineDefinitionDocument {
  const draft = pipelineBoardStateOf('mono-design').pipeline.setup?.record.draft ?? null;
  if (draft === null) throw new Error('the fixture mono-design has no draft');
  return draft;
}

describe('the levels', () => {
  test('the forge first, then each entity with what Apply stores for it', () => {
    expect(LevelSummaryListModel.levelsOf(monorepoDraft()).map((level) => [level.name, level.nameIsKey, level.text])).toEqual([
      ['Forge', false, 'Human ticket review on, human code review off, conflict re-review over 750 lines'],
      ['web', true, 'app · 1 prepare step · 2 build, 2 review and 2 merge gates · review on'],
      ['design-system', true, 'package · 1 build, 1 review and 1 merge gates · review on'],
      ['root', true, 'root · Kept for a person: no gates, no constitution'],
    ]);
  });

  test('a cap is worded in jobs, and an entity without gates says so', () => {
    const draft = monorepoDraft();
    const web = draft.entities?.['web'];
    if (web === undefined) throw new Error('the fixture holds web');
    const webWithoutGates = {
      ...web, gates: [], phases: { build: [], review: [], merge: [] }, review: null, concurrency: 1,
    };
    const changed = { ...draft, entities: { ...draft.entities, web: webWithoutGates } };
    expect(LevelSummaryListModel.levelsOf(changed)[1]?.text).toBe('app · 1 prepare step · No gates · review off · a cap of 1 job');
  });

  test('a draft without entities lists no level', () => {
    const singleDraft: BoardPipelineDefinitionDocument = examplePipeline();
    expect(LevelSummaryListModel.levelsOf(singleDraft)).toEqual([]);
    expect(LevelSummaryListModel.levelsOf(null)).toEqual([]);
  });
});
