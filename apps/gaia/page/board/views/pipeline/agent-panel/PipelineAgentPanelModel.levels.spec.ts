/**
 * The pipeline agent panel at a level of monorepo mode. What matters: the forge's session is the record's own, and single mode reads it
 * the same; an entity's session is its own part of the record, its job, questions and findings, never the forge's or another entity's,
 * and an entity with no part yet has no job and no question; the line over the chat counts the open questions of every other level with
 * the forge first, worded by where they wait, and is absent while no other level asks; the head names the level. An entity's research
 * session's strip names the entity it reads; the forge's strip and every other step's read as in single mode.
 */
import { describe, expect, test }                                      from 'bun:test';
import type { BoardPipelineSetupDocument, BoardSetupQuestionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { pipelineBoardStateOf }                                        from '../../../testing/PipelineFixture.ts';
import { FORGE_LEVEL, PipelineLevelModel }                             from '../entities/PipelineLevelModel.ts';
import { PipelineAgentPanelModel }                                     from './PipelineAgentPanelModel.ts';

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

const DESIGN_SYSTEM_LEVEL = PipelineLevelModel.entityLevelOf('design-system');

function monorepoSetup(): BoardPipelineSetupDocument {
  const { setup } = pipelineBoardStateOf('mono-design').pipeline;
  if (setup === undefined || setup === null) throw new Error('the fixture mono-design has no setup');
  return setup;
}

function openQuestion(questionId: string): BoardSetupQuestionDocument {
  return {
    questionId, step: 'design', subject: null, question: 'Example question?', context: '', options: [], recommended: [], multiple: false, answer: null,
  };
}

/** The monorepo setup with an open question at the forge and one in the design system. */
function setupAskingEverywhere(): BoardPipelineSetupDocument {
  const setup = monorepoSetup();
  const { record } = setup;
  const entities = record.entities ?? {};
  const designSystem = entities['design-system'];
  if (designSystem === undefined) throw new Error('the fixture mono-design has no design-system part');
  return {
    ...setup,
    record: {
      ...record,
      questions: [...record.questions, openQuestion('Q8')],
      entities:  { ...entities, 'design-system': { ...designSystem, questions: [openQuestion('Q9'), openQuestion('Q10')] } },
    },
  };
}

describe('the session of a level', () => {
  test('the forge\'s session is the record\'s own, as single mode reads it', () => {
    const setup = monorepoSetup();
    const forge = PipelineAgentPanelModel.levelSessionOf(setup, FORGE_LEVEL);
    expect(forge).toEqual(PipelineAgentPanelModel.levelSessionOf(setup, null));
    expect(forge.agentJobId).toBe(setup.record.agentJobId);
    expect(forge.questions.map((question) => question.questionId)).toEqual(['Q1']);
  });

  test('an entity\'s session holds its own job and questions alone', () => {
    const web = PipelineAgentPanelModel.levelSessionOf(monorepoSetup(), WEB_LEVEL);
    expect(web.agentJobId).toBe('J5');
    expect(web.agentJobState).toBe('running');
    expect(web.questions.map((question) => question.questionId)).toEqual(['Q4']);
  });

  test('an entity with no part of the record yet has no job and no question', () => {
    expect(PipelineAgentPanelModel.levelSessionOf(monorepoSetup(), PipelineLevelModel.entityLevelOf('root'))).toEqual({
      agentJobId: null, agentJobState: null, questions: [], findings: [],
    });
  });
});

describe('the open questions of the other levels', () => {
  test('at the forge, the entities that ask', () => {
    expect(PipelineAgentPanelModel.otherLevelQuestionsOf(monorepoSetup(), FORGE_LEVEL)).toEqual({ text: '1 question in an entity', levels: [WEB_LEVEL] });
    expect(PipelineAgentPanelModel.otherLevelQuestionsOf(setupAskingEverywhere(), FORGE_LEVEL))
      .toEqual({ text: '3 questions in entities', levels: [WEB_LEVEL, DESIGN_SYSTEM_LEVEL] });
  });

  test('at an entity, the other entities, and the forge first once it asks too', () => {
    expect(PipelineAgentPanelModel.otherLevelQuestionsOf(monorepoSetup(), DESIGN_SYSTEM_LEVEL))
      .toEqual({ text: '1 question in another entity', levels: [WEB_LEVEL] });
    expect(PipelineAgentPanelModel.otherLevelQuestionsOf(setupAskingEverywhere(), WEB_LEVEL))
      .toEqual({ text: '3 questions at other levels', levels: [FORGE_LEVEL, DESIGN_SYSTEM_LEVEL] });
  });

  test('nothing while no other level asks', () => {
    expect(PipelineAgentPanelModel.otherLevelQuestionsOf(monorepoSetup(), WEB_LEVEL)).toBeNull();
  });
});

describe('the head', () => {
  test('names the level, and says only the agent in single mode', () => {
    expect(PipelineAgentPanelModel.panelTitleOf(null)).toBe('Pipeline agent');
    expect(PipelineAgentPanelModel.panelTitleOf(FORGE_LEVEL)).toBe('Pipeline agent · Forge');
    expect(PipelineAgentPanelModel.panelTitleOf(WEB_LEVEL)).toBe('Pipeline agent · web');
  });
});

describe('the strip at a level', () => {
  const record = { questions: [], readyToContinue: [] };

  test('an entity\'s research session names the entity it reads', () => {
    expect(PipelineAgentPanelModel.agentStripOf('research', record, 'running', 'web')).toMatchObject({ text: 'Reading', entityKey: 'web' });
  });

  test('the forge\'s research strip and an entity\'s design strip read as in single mode', () => {
    expect(PipelineAgentPanelModel.agentStripOf('research', record, 'running', null)).toEqual(PipelineAgentPanelModel.agentStripOf('research', record, 'running'));
    expect(PipelineAgentPanelModel.agentStripOf('design', record, 'running', 'web').text).toBe('Designing the pipeline');
  });
});
