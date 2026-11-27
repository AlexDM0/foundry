/**
 * The research sessions of a forge over entities: their order, each session's state from its own job alone, the stops, the counts, and which session
 * shows.
 */
import { describe, expect, test }                                                                    from 'bun:test';
import type { BoardPipelineSetupDocument, BoardResearchFindingDocument, BoardSetupQuestionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { EXAMPLE_NOT_LAUNCHED }                                                                      from '../../../testing/AgentFixture.ts';
import { pipelineBoardStateOf }                                                                      from '../../../testing/PipelineFixture.ts';
import { PipelineViewModel }                                                                         from '../PipelineViewModel.ts';
import { FORGE_LEVEL, PipelineLevelModel }                                                           from '../entities/PipelineLevelModel.ts';
import { EntitySessionListModel, type EntitySessionFacts }                                           from './EntitySessionListModel.ts';

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

function finding(findingId: string, topic: BoardResearchFindingDocument['topic']): BoardResearchFindingDocument {
  return {
    findingId, topic, label: 'Example', value: null, sourcePaths: [], script: null, needsRecheck: false
  };
}

function researchQuestion(questionId: string): BoardSetupQuestionDocument {
  return {
    questionId, step: 'research', subject: null, question: 'Example question?', context: '', options: [], recommended: [], multiple: false, answer: null,
  };
}

/** The mono-design setup at research: web's session runs with two findings and a question, design-system's stopped, root has none. */
function researchFacts(changes: Partial<BoardPipelineSetupDocument['record']> = {}): EntitySessionFacts {
  const board = pipelineBoardStateOf('mono-design');
  const { setup } = board.pipeline;
  if (setup === undefined || setup === null) throw new Error('the fixture mono-design has no setup');
  const { record } = setup;
  const parts = record.entities ?? {};
  const { web, 'design-system': designSystem } = parts;
  if (web === undefined || designSystem === undefined) throw new Error('the fixture mono-design lacks an entity part');
  const entityFacts = setup.entities ?? {};
  const setupAtResearch: BoardPipelineSetupDocument = {
    ...setup,
    record: {
      ...record,
      readyToContinue: [],
      findings:        [finding('F1', 'layout'), finding('F2', 'stack')],
      entities:        {
        'web':           { ...web, findings: [finding('F3', 'stack'), finding('F4', 'conventions')], questions: [researchQuestion('Q5')] },
        'design-system': { ...designSystem, agentJobId: 'J6' },
      },
      ...changes,
    },
    entities: {
      ...entityFacts,
      'design-system': { ...(entityFacts['design-system'] ?? setupEntityFactsOf(setup)), agentJobState: null },
    },
  };
  return { setup: setupAtResearch, shownEntities: PipelineViewModel.entitiesShownOf(board), jobs: [] };
}

function setupEntityFactsOf(setup: BoardPipelineSetupDocument): NonNullable<BoardPipelineSetupDocument['entities']>[string] {
  const web = setup.entities?.['web'];
  if (web === undefined) throw new Error('the fixture mono-design has no web facts');
  return web;
}

describe('the rows', () => {
  test('the forge comes first, then each entity under the label of its group', () => {
    const rows = EntitySessionListModel.rowsOf(researchFacts(), FORGE_LEVEL);
    expect(rows.map((row) => [row.name, row.kindText, row.groupLabel])).toEqual([
      ['Forge', 'Shared by every entity', null],
      ['web', 'app', 'Apps'],
      ['design-system', 'package', 'Packages'],
      ['root', 'every other path', 'Root'],
    ]);
  });

  test('a session\'s state comes from its own job: running, stopped, not started', () => {
    const rows = EntitySessionListModel.rowsOf(researchFacts(), FORGE_LEVEL);
    expect(rows.map((row) => [row.name, row.stateText])).toEqual([
      ['Forge', 'Researching'], ['web', 'Researching'], ['design-system', 'Stopped'], ['root', 'Not started'],
    ]);
  });

  test('only the forge\'s session reads as done, once the agent marked the research ready', () => {
    const rows = EntitySessionListModel.rowsOf(researchFacts({ readyToContinue: ['research'] }), FORGE_LEVEL);
    expect(rows.map((row) => row.state)).toEqual(['research-done', 'researching', 'stopped', 'not-started']);
  });

  test('only a live session offers a stop, and Stop all is exactly those stops', () => {
    const rows = EntitySessionListModel.rowsOf(researchFacts(), FORGE_LEVEL);
    expect(rows.map((row) => row.stopCommand)).toEqual([
      {
        boardCommandVersion: 3, kind: 'job-stop', jobId: 'J4', mode: 'stop'
      }, {
        boardCommandVersion: 3, kind: 'job-stop', jobId: 'J5', mode: 'stop'
      }, null, null,
    ]);
    expect(EntitySessionListModel.stopEveryCommandsOf(rows)).toEqual([
      {
        boardCommandVersion: 3, kind: 'job-stop', jobId: 'J4', mode: 'stop'
      }, {
        boardCommandVersion: 3, kind: 'job-stop', jobId: 'J5', mode: 'stop'
      },
    ]);
    expect(rows[1]?.stopName).toBe('Stop web\'s session');
  });

  test('a row counts its findings without the layout and its open research questions, and says them for a screen reader', () => {
    const [forge, web] = EntitySessionListModel.rowsOf(researchFacts(), WEB_LEVEL);
    expect([forge?.findingCount, web?.findingCount, web?.openQuestionCount, web?.selected]).toEqual([1, 2, 1, true]);
    expect(web?.accessibleName).toBe('web, app, Researching, 2 findings, 1 open question');
  });

  test('a session whose launch forge refused reads not launched, never researching, and keeps its stop', () => {
    const facts = { ...researchFacts(), jobs: [{ id: 'J5', notLaunched: EXAMPLE_NOT_LAUNCHED }] };
    const web = EntitySessionListModel.rowsOf(facts, WEB_LEVEL)[1];
    expect([web?.state, web?.stateText, web?.stopCommand?.kind]).toEqual(['not-launched', 'Not launched', 'job-stop']);
    expect(EntitySessionListModel.panelStatusOf(EntitySessionListModel.selectedSessionOf(facts, WEB_LEVEL).state)).toEqual({ tone: 'failed', text: 'Not launched' });
    expect(EntitySessionListModel.footerCountsOf(EntitySessionListModel.rowsOf(facts, FORGE_LEVEL))).toBe('1 not launched · 1 stopped · 1 not started · 1 open question');
  });

  test('the counts name the entities\' states, then every open research question', () => {
    const rows = EntitySessionListModel.rowsOf(researchFacts(), FORGE_LEVEL);
    expect(EntitySessionListModel.footerCountsOf(rows)).toBe('1 researching · 1 stopped · 1 not started · 1 open question');
    expect(EntitySessionListModel.countTextOf(rows)).toBe('Forge and 3 entities');
  });
});

describe('the session shown', () => {
  test('is the route\'s level while the list holds it, else the forge\'s', () => {
    const facts = researchFacts();
    expect(EntitySessionListModel.shownLevelOf(facts, WEB_LEVEL)).toEqual(WEB_LEVEL);
    expect(EntitySessionListModel.shownLevelOf(facts, PipelineLevelModel.entityLevelOf('unknown'))).toEqual(FORGE_LEVEL);
    expect(EntitySessionListModel.shownLevelOf(facts, null)).toEqual(FORGE_LEVEL);
  });

  test('an entity\'s findings and what it reads; the forge\'s without the layout', () => {
    const facts = researchFacts();
    const web = EntitySessionListModel.selectedSessionOf(facts, WEB_LEVEL);
    expect([web.scopeText, web.findings.map((each) => each.findingId), web.emptyText]).toEqual(['Only what is in apps/web.', ['F3', 'F4'], null]);
    expect(EntitySessionListModel.selectedSessionOf(facts, FORGE_LEVEL).findings.map((each) => each.findingId)).toEqual(['F2']);
  });

  test('without findings, a stopped session says so, and one that researches shows grey lines', () => {
    const facts = researchFacts();
    expect(EntitySessionListModel.selectedSessionOf(facts, PipelineLevelModel.entityLevelOf('design-system')).emptyText)
      .toBe('Stopped before it found anything. You can still set up this entity by hand in the next steps.');
    expect(EntitySessionListModel.selectedSessionOf(facts, PipelineLevelModel.entityLevelOf('root')).emptyText).toBe('No session has started for it yet.');
    const withoutFindings = researchFacts({ findings: [] });
    expect(EntitySessionListModel.selectedSessionOf(withoutFindings, FORGE_LEVEL).emptyText).toBeNull();
  });

  test('the list shows only once an entity has a part of the record', () => {
    expect(EntitySessionListModel.hasEntitySessions(researchFacts())).toBe(true);
    const facts = researchFacts();
    expect(EntitySessionListModel.hasEntitySessions({ setup: { ...facts.setup, record: { ...facts.setup.record, entities: null } } })).toBe(false);
  });
});
