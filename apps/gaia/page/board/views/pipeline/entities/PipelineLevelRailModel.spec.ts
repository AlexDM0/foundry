/**
 * The level rail's rows. What matters: the forge row comes first and the entities follow in the groups Apps, Packages and Root, each in
 * the draft's order; each row has one mark, a gate profile under way before no gates before the default constitution, else its gate
 * count; a root without gates is kept for a person and never counted as needing a look; the counts of open questions and pending edits
 * belong to their own level only, and a first setup counts no pending edit, since it proposes every field; the filter keeps the forge
 * and the entities whose key or kind holds its text; the stored pipeline's entities show while no record holds a draft; a screen's own
 * words replace every entity row's mark and the attention line, and drop the note on gates; a live screen's line of each level's work
 * joins its row and the row's sentence, and no row has one without it.
 */
import { describe, expect, test }                                                                    from 'bun:test';
import type { BoardGateProfileRunDocument, BoardPipelineEntityDocument, BoardSetupQuestionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardEntityKind, BoardSetupMode }                                                      from '../../../../@types/board/BoardVocabulary.ts';
import {
  exampleEntity,
  exampleGate,
  examplePipeline,
  pipelineBoardStateOf
} from '../../../testing/PipelineFixture.ts';
import { FORGE_LEVEL, PipelineLevelModel }                     from './PipelineLevelModel.ts';
import { PipelineLevelRailModel, type PipelineLevelRailFacts } from './PipelineLevelRailModel.ts';

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

const TYPECHECK_GATE = exampleGate('typecheck', 'bun run typecheck');

/** An entity with one gate and its own constitution, unless told it has no gates or keeps the default constitution. */
function entity(kind: BoardEntityKind, shape: { readonly gateless?: boolean; readonly defaultConstitution?: boolean } = {}): BoardPipelineEntityDocument {
  const gates = shape.gateless === true ? [] : [TYPECHECK_GATE];
  const base = exampleEntity(kind, ['/example'], { gates, phases: { build: gates.map((gate) => gate.name), review: [], merge: [] } });
  return shape.defaultConstitution === true ? base : { ...base, constitutionPath: '/example/CONSTITUTION.md' };
}

/** What a rail case sets beside the draft's entities: the open questions, the record's mode, each session's count, the changes and the profiles. */
interface RailCase {
  readonly questions?:          BoardSetupQuestionDocument[];
  readonly mode?:               BoardSetupMode;
  readonly openQuestionCounts?: Readonly<Record<string, number>>;
  readonly changedFields?:      readonly string[];
  readonly profileRuns?:        readonly Pick<BoardGateProfileRunDocument, 'entity' | 'state'>[];
}

/** The mono-design board with the draft's entities and what the case sets; an update unless told otherwise, so its edits count. */
function draftFacts(entities: Record<string, BoardPipelineEntityDocument>, railCase: RailCase = {}): PipelineLevelRailFacts {
  const board = pipelineBoardStateOf('mono-design');
  const { setup, flow } = board.pipeline;
  if (setup === null || flow === null) throw new Error('the fixture mono-design holds a setup and a flow');
  const sessionFacts = setup.entities?.['web'];
  if (sessionFacts === undefined) throw new Error('the fixture mono-design holds web\'s session');
  const openQuestionCounts = Object.entries(railCase.openQuestionCounts ?? {});
  return {
    pipeline: {
      ...board.pipeline,
      setup: {
        ...setup,
        record: {
          ...setup.record, draft: examplePipeline({ entities }), questions: railCase.questions ?? [], mode: railCase.mode ?? 'update'
        },
        entities: Object.fromEntries(openQuestionCounts.map(([entityKey, openQuestionCount]) => [entityKey, { ...sessionFacts, openQuestionCount }])),
      },
      flow:        { ...flow, changeList: (railCase.changedFields ?? []).map((field) => ({ field, changeKind: 'changed', editId: null })) },
      profileRuns: (railCase.profileRuns ?? []).map((run, i) => ({
        profileRunId: `P${String(i + 1)}`, gateName: 'typecheck', phase: 'build', elapsedMilliseconds: null, cacheReport: null, ...run,
      })),
    },
  };
}

function questionOf(questionId: string, answer: BoardSetupQuestionDocument['answer']): BoardSetupQuestionDocument {
  return {
    questionId, step: 'design', subject: null, question: 'Example?', context: '', options: [], recommended: [], multiple: false, answer,
  };
}

const ENTITIES: Record<string, BoardPipelineEntityDocument> = {
  'design-system': entity('package'),
  'web':           entity('app', { defaultConstitution: true }),
  'config':        entity('package', { gateless: true }),
  'root':          entity('root', { gateless: true, defaultConstitution: true }),
  'admin':         entity('app'),
};

describe('the rail\'s rows', () => {
  test('the forge first, then Apps, Packages and Root, each in the draft\'s order', () => {
    const rail = PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, '');
    expect(rail.forgeRow).toMatchObject({
      name: 'Forge', kindText: 'Shared by every entity', status: null, selected: true
    });
    expect(rail.groups.map((group) => [group.label, group.rows.map((row) => row.name)])).toEqual([
      ['Apps', ['web', 'admin']],
      ['Packages', ['design-system', 'config']],
      ['Root', ['root']],
    ]);
    expect(PipelineLevelRailModel.rowsInOrderOf(rail).map((row) => row.name)).toEqual(['Forge', 'web', 'admin', 'design-system', 'config', 'root']);
  });

  test('each row has one mark: no gates, the default constitution, kept for a person, or its gate count', () => {
    const rows = PipelineLevelRailModel.rowsInOrderOf(PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, ''));
    expect(rows.map((row) => [row.name, row.status, row.statusText, row.kindText])).toEqual([
      ['Forge', null, null, 'Shared by every entity'],
      ['web', 'default-constitution', 'Default constitution', 'app'],
      ['admin', 'checked', '1 gate', 'app'],
      ['design-system', 'checked', '1 gate', 'package'],
      ['config', 'no-gates', 'No gates', 'package'],
      ['root', 'kept-for-a-person', 'For a person', 'every other path'],
    ]);
  });

  test('a gate profile under way marks its own entity before any other mark', () => {
    const facts = draftFacts(ENTITIES, { profileRuns: [{ entity: 'config', state: 'running' }, { entity: 'admin', state: 'passed' }] });
    const rows = PipelineLevelRailModel.rowsInOrderOf(PipelineLevelRailModel.railOf(facts, FORGE_LEVEL, ''));
    expect(rows.find((row) => row.name === 'config')?.status).toBe('gate-running');
    expect(rows.find((row) => row.name === 'admin')?.status).toBe('checked');
  });

  test('the attention line counts the apps and packages without gates or with the default constitution, never the root', () => {
    const rail = PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, '');
    expect(rail.attentionText).toBe('1 entity has no gates · 1 entity has the default constitution');
    expect(rail.someEntityHasNoGates).toBe(true);
    const settled = PipelineLevelRailModel.railOf(draftFacts({ admin: entity('app'), root: entity('root', { gateless: true }) }), FORGE_LEVEL, '');
    expect(settled.attentionText).toBeNull();
    expect(settled.someEntityHasNoGates).toBe(false);
  });

  test('open questions and pending edits count at their own level, and the row names them for a screen reader', () => {
    const facts = draftFacts(ENTITIES, {
      questions:          [questionOf('Q1', null), questionOf('Q2', { form: 'letters', letters: ['a'], answeredAt: '2026-11-12T09:20:00' })],
      openQuestionCounts: { web: 2 },
      changedFields:      ['entity:web/gate:lint', 'entity:web', 'approval:merge', 'entity:admin/reach'],
    });
    const rows = PipelineLevelRailModel.rowsInOrderOf(PipelineLevelRailModel.railOf(facts, WEB_LEVEL, ''));
    expect(rows.map((row) => [row.name, row.openQuestionCount, row.pendingEditCount])).toEqual([
      ['Forge', 1, 1], ['web', 2, 2], ['admin', 0, 1], ['design-system', 0, 0], ['config', 0, 0], ['root', 0, 0],
    ]);
    expect(rows[1]?.accessibleName).toBe('web, app, Default constitution, 2 open questions, 2 pending edits');
    expect(rows.filter((row) => row.selected).map((row) => row.name)).toEqual(['web']);
  });

  test('a first setup counts no pending edit, since every field of its draft is proposed', () => {
    const facts = draftFacts(ENTITIES, { mode: 'setup', changedFields: ['entity:web/gate:lint', 'approval:merge'] });
    const rows = PipelineLevelRailModel.rowsInOrderOf(PipelineLevelRailModel.railOf(facts, WEB_LEVEL, ''));
    expect(rows.map((row) => row.pendingEditCount)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test('the filter keeps the forge and the entities whose key or kind holds its text, and says when none matches', () => {
    const byKey = PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, ' ADM ');
    expect(PipelineLevelRailModel.rowsInOrderOf(byKey).map((row) => row.name)).toEqual(['Forge', 'admin']);
    const byKind = PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, 'package');
    expect(byKind.groups.map((group) => group.label)).toEqual(['Packages']);
    const none = PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, 'example-nothing');
    expect(none.groups).toEqual([]);
    expect(none.nothingMatches).toBe(true);
    expect(none.attentionText).toBe('1 entity has no gates · 1 entity has the default constitution');
  });

  test('the stored pipeline\'s entities show while no record holds a draft, with a running profile marked', () => {
    const rows = PipelineLevelRailModel.rowsInOrderOf(PipelineLevelRailModel.railOf(pipelineBoardStateOf('mono-live'), FORGE_LEVEL, ''));
    expect(rows.map((row) => [row.name, row.status])).toEqual([
      ['Forge', null], ['web', 'gate-running'], ['design-system', 'checked'], ['root', 'kept-for-a-person'],
    ]);
  });

  test('a setup over entities reads its draft and each session\'s open questions', () => {
    const rows = PipelineLevelRailModel.rowsInOrderOf(PipelineLevelRailModel.railOf(pipelineBoardStateOf('mono-design'), FORGE_LEVEL, ''));
    expect(rows.map((row) => [row.name, row.openQuestionCount])).toEqual([['Forge', 0], ['web', 1], ['design-system', 0], ['root', 0]]);
  });
});

describe('a screen\'s own marks', () => {
  test('replace each entity row\'s word and the attention line, and drop the note on gates', () => {
    const rail = PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, '', { textOf: (entityKey) => `State of ${entityKey}`, attentionText: 'One line' });
    const rows = PipelineLevelRailModel.rowsInOrderOf(rail);
    expect(rows.map((row) => row.statusText)).toEqual([null, 'State of web', 'State of admin', 'State of design-system', 'State of config', 'State of root']);
    expect(rows[1]?.accessibleName).toBe('web, app, State of web');
    expect(rail.attentionText).toBe('One line');
    expect(rail.someEntityHasNoGates).toBe(false);
  });
});

describe('a live screen\'s line of each level\'s work', () => {
  test('joins each row and its sentence, and no row has one without it', () => {
    const activityTextOf = (level: { readonly kind: string }): string => (level.kind === 'forge' ? '2 of 6 jobs' : 'No tickets');
    const rows = PipelineLevelRailModel.rowsInOrderOf(PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, '', null, activityTextOf));
    expect(rows.slice(0, 2).map((row) => [row.activityText, row.accessibleName])).toEqual([
      ['2 of 6 jobs', 'Forge, Shared by every entity, 2 of 6 jobs'],
      ['No tickets', 'web, app, Default constitution, No tickets'],
    ]);
    const withoutLine = PipelineLevelRailModel.rowsInOrderOf(PipelineLevelRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, ''));
    expect(withoutLine.every((row) => row.activityText === null)).toBe(true);
  });
});
