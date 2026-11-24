/**
 * The live pipeline's footer and toast. What matters: the footer names the applied version, its time and User, the content hash, and the
 * constitution commit only when the newest Apply made one; an Apply counts as landed only once the facts carry a newer applied version;
 * the toast says "Board resumed" only for an Apply that resumed the board. On a forge over entities: an occupant is the forge's on a step
 * the forge holds and else its job's entity's, or no one's while its job names none; an entity's live facts keep only its own tickets,
 * on the steps it draws; the words, the agent's tab, Ask and the advise command follow the level; only a queued or running profile of
 * the phase is under way.
 */
import { describe, expect, test }                                   from 'bun:test';
import type { BoardAppliedPipelineDocument, BoardFlowNodeDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { pipelineBoardStateOf }                                     from '../../../testing/PipelineFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                                 from '../../../testing/TimestampSlicesFixture.ts';
import { FORGE_LEVEL }                                              from '../entities/PipelineLevelModel.ts';
import { LivePipelineModel }                                        from './LivePipelineModel.ts';

const FORMAT = { todayCalendarDate: '2026-11-12', slices: EXAMPLE_TIMESTAMP_SLICES };

function appliedPipeline(): Extract<BoardAppliedPipelineDocument, { readingVerdict: 'readable' }> {
  const { applied } = pipelineBoardStateOf('A5').pipeline;
  if (applied.readingVerdict !== 'readable') throw new Error('A5 has no readable pipeline');
  return applied;
}

describe('footerOf', () => {
  test('the version, its time and User, the content hash and the constitution commit', () => {
    expect(LivePipelineModel.footerOf(appliedPipeline(), FORMAT)).toEqual({
      versionText: 'Version 2 · applied 10:30 by User',
      hashText:    'content hash example-',
      commitText:  'CONSTITUTION.md 2222222',
      fileText:    appliedPipeline().fileText,
    });
  });

  test('no constitution commit, no commit text; no slices, no time', () => {
    const pipeline = appliedPipeline();
    const withoutCommit = { ...pipeline, application: { ...pipeline.application, constitutionCommit: null } } as BoardAppliedPipelineDocument;
    expect(LivePipelineModel.footerOf(withoutCommit, null)).toMatchObject({ versionText: 'Version 2 · applied by User', commitText: null });
  });

  test('over entities the commit held each entity\'s constitution, so it names none of the forge\'s', () => {
    const pipeline = appliedPipeline();
    const overEntities: BoardAppliedPipelineDocument = { ...pipeline, pipeline: { ...pipeline.pipeline, entities: {} } };
    expect(LivePipelineModel.footerOf(overEntities, FORMAT)?.commitText).toBe('constitutions 2222222');
  });

  test('a pipeline the gate verbs wrote has no version, and an unreadable one no footer', () => {
    expect(LivePipelineModel.footerOf({ ...appliedPipeline(), application: null }, FORMAT)?.versionText).toBe('Set with the gate verbs, never applied here');
    expect(LivePipelineModel.footerOf({ readingVerdict: 'absent' }, FORMAT)).toBeNull();
  });
});

describe('landedRevisionOf', () => {
  test('an Apply lands once the applied version is newer than before it', () => {
    expect(LivePipelineModel.landedRevisionOf(null, appliedPipeline())).toBe(2);
    expect(LivePipelineModel.landedRevisionOf(1, appliedPipeline())).toBe(2);
    expect(LivePipelineModel.landedRevisionOf(2, appliedPipeline())).toBeNull();
    expect(LivePipelineModel.landedRevisionOf(null, { readingVerdict: 'absent' })).toBeNull();
  });
});

describe('toastOf', () => {
  test('"Board resumed" only when the Apply resumed the board', () => {
    expect(LivePipelineModel.toastOf(true, 1)).toEqual({ title: 'Pipeline applied', text: 'Board resumed · Version 1 is live.' });
    expect(LivePipelineModel.toastOf(false, 3)).toEqual({ title: 'Pipeline applied', text: 'Version 3 is live.' });
  });
});

function monorepoLive() {
  return pipelineBoardStateOf('mono-live');
}

function nodeOf(nodeKind: BoardFlowNodeDocument['nodeKind'], changes: Partial<Pick<BoardFlowNodeDocument, 'mergePlacement' | 'role'>> = {}) {
  return {
    nodeKind, mergePlacement: null, role: null, ...changes
  };
}

describe('occupantLevelOf', () => {
  const jobs = [{ id: 'J21', entity: 'web' }, { id: 'J7', entity: null }];

  test('a step the forge holds is the forge\'s, whatever entity the job runs', () => {
    expect(LivePipelineModel.occupantLevelOf({ jobId: 'J21' }, nodeOf('airlock'), jobs)).toEqual(FORGE_LEVEL);
    expect(LivePipelineModel.occupantLevelOf({ jobId: 'J21' }, nodeOf('merge-main-into-tree', { mergePlacement: 'airlock' }), jobs)).toEqual(FORGE_LEVEL);
    expect(LivePipelineModel.occupantLevelOf({ jobId: 'J7' }, nodeOf('ticket-creation'), jobs)).toEqual(FORGE_LEVEL);
  });

  test('any other step is the job\'s entity\'s, and no one\'s while the job names none or no job holds it', () => {
    expect(LivePipelineModel.occupantLevelOf({ jobId: 'J21' }, nodeOf('builder'), jobs)).toEqual({ kind: 'entity', key: 'web' });
    expect(LivePipelineModel.occupantLevelOf({ jobId: 'J21' }, nodeOf('merge-main-into-tree', { mergePlacement: 'before-review' }), jobs)).toEqual({ kind: 'entity', key: 'web' });
    expect(LivePipelineModel.occupantLevelOf({ jobId: 'J7' }, nodeOf('builder'), jobs)).toBeNull();
    expect(LivePipelineModel.occupantLevelOf({ jobId: null }, nodeOf('builder'), jobs)).toBeNull();
  });
});

describe('factsLiveAtEntityOf', () => {
  test('an entity keeps only its own tickets, on its own flow', () => {
    const atWeb = LivePipelineModel.factsLiveAtEntityOf(monorepoLive(), 'web');
    expect(atWeb.pipeline.flow?.occupants.map((occupant) => occupant.occupantId)).toEqual(['21', '19']);
    expect(atWeb.pipeline.flow?.nodes.some((node) => node.nodeId === 'gates-build')).toBe(true);
    const atDesignSystem = LivePipelineModel.factsLiveAtEntityOf(monorepoLive(), 'design-system');
    expect(atDesignSystem.pipeline.flow?.occupants.map((occupant) => occupant.occupantId)).toEqual(['22']);
    expect(LivePipelineModel.factsLiveAtEntityOf(monorepoLive(), 'root').pipeline.flow?.occupants).toEqual([]);
  });
});

describe('levelPageWordsOf', () => {
  test('an entity names its summary, home and live version; the forge what every entity shares', () => {
    const pipeline = monorepoLive().pipeline.applied;
    expect(LivePipelineModel.levelPageWordsOf({ kind: 'entity', key: 'design-system' }, pipeline)).toEqual({
      title: 'design-system',
      lead:  'The Example Agency components. Home: packages/design-system. Version 1 is live. Each step shows design-system’s tickets at it now.',
    });
    expect(LivePipelineModel.levelPageWordsOf(FORGE_LEVEL, pipeline).title).toBe('Forge');
  });

  test('a summary worded as a phrase gains its full stop before the home', () => {
    const pipeline = monorepoLive().pipeline.applied;
    if (pipeline.readingVerdict !== 'readable') throw new Error('the fixture holds a readable pipeline');
    const entities = pipeline.pipeline.entities ?? {};
    const designSystem = entities['design-system'];
    if (designSystem === undefined) throw new Error('the fixture holds design-system');
    const phrased = { ...pipeline, pipeline: { ...pipeline.pipeline, entities: { ...entities, 'design-system': { ...designSystem, summary: 'React components' } } } };
    expect(LivePipelineModel.levelPageWordsOf({ kind: 'entity', key: 'design-system' }, phrased).lead)
      .toBe('React components. Home: packages/design-system. Version 1 is live. Each step shows design-system’s tickets at it now.');
  });
});

describe('the pipeline agent at a level', () => {
  test('the advise command carries the entity, and the labels name the level', () => {
    expect(LivePipelineModel.adviseCommandOf({ kind: 'entity', key: 'web' })).toEqual({ boardCommandVersion: 2, kind: 'pipeline-agent-advise', entity: 'web' });
    expect(LivePipelineModel.adviseCommandOf(FORGE_LEVEL)).toEqual({ boardCommandVersion: 2, kind: 'pipeline-agent-advise', entity: null });
    expect(LivePipelineModel.agentTabLabelOf({ kind: 'entity', key: 'web' })).toBe('Pipeline agent · web');
    expect(LivePipelineModel.agentTabLabelOf(null)).toBe('Pipeline agent');
    expect(LivePipelineModel.askLabelOf(FORGE_LEVEL)).toBe('Ask the pipeline agent about the Forge level');
    expect(LivePipelineModel.askLabelOf(null)).toBe('Ask the pipeline agent');
  });
});

describe('profilesUnderWayTextsOf', () => {
  test('only a queued or running profile of the phase is under way', () => {
    const runs = [
      { gateName: 'lint', phase: 'build', state: 'running' },
      { gateName: 'test', phase: 'build', state: 'queued' },
      { gateName: 'e2e', phase: 'build', state: 'passed' },
      { gateName: 'typecheck', phase: 'review', state: 'running' },
    ] as const;
    expect(LivePipelineModel.profilesUnderWayTextsOf(runs, 'build')).toEqual(['lint being profiled', 'test being profiled']);
  });
});
