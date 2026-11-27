/**
 * The constitution step's model against the pipeline fixtures: READ BY from the facts' roles, the footer's outline counts, the agent's state, SOURCES
 * ticks and Continue, and each entity's own file, sources and readers.
 */
import { describe, expect, test }                                     from 'bun:test';
import type { BoardPipelineFlowDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { pipelineBoardStateOf }                                       from '../../../testing/PipelineFixture.ts';
import { ConstitutionStepModel }                                      from './ConstitutionStepModel.ts';

function constitutionSetup(): BoardPipelineSetupDocument {
  const { setup } = pipelineBoardStateOf('A3b').pipeline;
  if (setup === null || setup === undefined) throw new Error('the fixture A3b has no setup');
  return setup;
}

describe('READ BY', () => {
  test('names Builder, Review and Re-review from the facts, both re-reviewers as one', () => {
    expect(ConstitutionStepModel.readerLabelsOf(constitutionSetup().readByRoles)).toEqual(['Builder', 'Review', 'Re-review']);
  });

  test('names only the roles the facts list', () => {
    expect(ConstitutionStepModel.readerLabelsOf(['reviewer'])).toEqual(['Review']);
  });
});

describe('the footer', () => {
  test('counts the sections and rules of the outline', () => {
    expect(ConstitutionStepModel.outlineTextOf({ sectionCount: 4, ruleCount: 9 })).toBe('4 sections · 9 rules');
    expect(ConstitutionStepModel.outlineTextOf({ sectionCount: 1, ruleCount: 1 })).toBe('1 section · 1 rule');
    expect(ConstitutionStepModel.outlineTextOf(null)).toBeNull();
  });
});

describe('the agent state', () => {
  test('drafts while the agent runs, is ready once it says so, is not running with no job, and never drafts while forge did not launch it', () => {
    const setup = constitutionSetup();
    expect(ConstitutionStepModel.agentStateOf(setup, 'running')).toBe('drafting');
    expect(ConstitutionStepModel.agentStateOf({ ...setup, record: { ...setup.record, readyToContinue: ['constitution'] } }, 'running')).toBe('ready');
    expect(ConstitutionStepModel.agentStateOf(setup, 'stopped')).toBe('not-running');
    expect(ConstitutionStepModel.agentStateOf(setup, 'not-launched')).toBe('not-launched');
  });

  test('the status line and the panel head say it drafts, is ready, does not run or is not launched', () => {
    expect(ConstitutionStepModel.panelStatusOf('drafting')).toEqual({ tone: 'working', text: 'Drafting' });
    expect(ConstitutionStepModel.panelStatusOf('ready')).toEqual({ tone: 'ready', text: 'Draft ready' });
    expect(ConstitutionStepModel.panelStatusOf('not-running')).toEqual({ tone: 'idle', text: 'Not running' });
    expect(ConstitutionStepModel.panelStatusOf('not-launched')).toEqual({ tone: 'failed', text: 'Not launched' });
    expect(ConstitutionStepModel.statusLineOf('not-launched')).toBe('Pipeline agent · not launched');
    expect(ConstitutionStepModel.entityStatusLineOf('not-launched', 'web')).toBe('Pipeline agent · not launched');
  });
});

describe('the commands', () => {
  test('a SOURCES tick flips that one choice at the facts revision, with no markdown', () => {
    expect(ConstitutionStepModel.sourcesCommandOf(constitutionSetup(), 'installedDefault')).toEqual({
      boardCommandVersion: 3,
      kind:                'pipeline-constitution-edit',
      setupId:             'S1',
      revision:            3,
      markdown:            null,
      draftedFrom:         { contributing: true, research: true, installedDefault: true },
      entity:              null,
    });
  });

  test('Continue moves the constitution step', () => {
    expect(ConstitutionStepModel.continueCommandOf(constitutionSetup())).toEqual({
      boardCommandVersion: 3, kind: 'pipeline-setup-step', setupId: 'S1', step: 'constitution', move: 'continue',
    });
  });

  test('before the first draft the editor starts empty at revision 0', () => {
    expect(ConstitutionStepModel.versionOf(null)).toEqual({ markdown: '', revision: 0 });
  });
});

describe('the mode', () => {
  test('only a first setup walks the steps; update and advise edit the applied constitution', () => {
    expect(ConstitutionStepModel.stepModeOf('setup')).toBe('setup');
    expect(ConstitutionStepModel.stepModeOf('update')).toBe('update');
    expect(ConstitutionStepModel.stepModeOf('advise')).toBe('update');
  });
});

describe('an entity', () => {
  function monorepoSetup(): BoardPipelineSetupDocument {
    const { setup } = pipelineBoardStateOf('mono-design').pipeline;
    if (setup === null || setup === undefined) throw new Error('the fixture mono-design has no setup');
    return setup;
  }

  test('READ BY names each of its roles apart, and what a ticket that crosses into its packages reads', () => {
    expect(ConstitutionStepModel.entityReaderLabelsOf(['builder', 'reviewer', 'reReviewer', 'conflictReReviewer']))
      .toEqual(['Builder', 'Reviewer', 'Re-reviewer', 'Conflict re-reviewer']);
    expect(ConstitutionStepModel.entityReaderLabelsOf(['productOwner', 'builder', 'pipelineAgent', 'reviewer', 'assistant'])).toEqual(['Builder', 'Reviewer']);
    expect(ConstitutionStepModel.entityReadersNoteOf({ whitelist: [] })).toBe('No other entity’s agent reads it.');
    expect(ConstitutionStepModel.entityReadersNoteOf({ whitelist: ['ui', 'api-client', 'config'] }))
      .toBe('No other entity’s agent reads it. On a ticket that crosses into ui, api-client or config, their agents read their own.');
  });

  test('its file is the one it names, else CONSTITUTION.md in its first home folder', () => {
    expect(ConstitutionStepModel.entityConstitutionFileOf({ home: ['/apps/web'], constitutionPath: '/apps/web/RULES.md' })).toBe('apps/web/RULES.md');
    expect(ConstitutionStepModel.entityConstitutionFileOf({ home: ['/apps/web', '/apps/shared'], constitutionPath: null })).toBe('apps/web/CONSTITUTION.md');
    expect(ConstitutionStepModel.entityConstitutionFileOf({ home: ['/'], constitutionPath: null })).toBe('CONSTITUTION.md');
  });

  test('its SOURCES name its own CONTRIBUTING.md and research', () => {
    expect(ConstitutionStepModel.entitySourceChoicesOf('web', { home: ['/apps/web'] }).map((choice) => choice.label))
      .toEqual(['apps/web/CONTRIBUTING.md', 'web’s research findings', 'The installed default']);
  });

  test('its setup carries its own draft, document and readers, and its tick names it', () => {
    const entitySetup = ConstitutionStepModel.entitySetupOf(monorepoSetup(), 'web');
    expect(entitySetup.record.constitution?.revision).toBe(3);
    expect(entitySetup.constitutionOutline).toEqual({ sectionCount: 4, ruleCount: 6 });
    expect(entitySetup.readByRoles).toEqual(['builder', 'reviewer', 'reReviewer', 'conflictReReviewer']);
    expect(ConstitutionStepModel.sourcesCommandOf(entitySetup, 'research', 'web')).toMatchObject({ revision: 3, entity: 'web' });
    expect(ConstitutionStepModel.entitySetupOf(monorepoSetup(), 'design-system').record.constitution).toBeNull();
  });

  test('an adopted file is offered only when the flow holds it whole', () => {
    const flowWith = (text: string | null, textIsCut: boolean): Pick<BoardPipelineFlowDocument, 'nodes'> => {
      const node = pipelineBoardStateOf('A2').pipeline.flow?.nodes.find((candidate) => candidate.nodeId === 'builder');
      if (node === undefined) throw new Error('the fixture A2 has no builder');
      return {
        nodes: [{
          ...node,
          instructionEntries: [{
            entry: { kind: 'constitution' }, fileName: 'CONSTITUTION.md', readByRoles: [], text, textIsCut
          }]
        }]
      };
    };
    expect(ConstitutionStepModel.adoptedTextOf(flowWith('- Kept.\r\n', false))).toBe('- Kept.\r\n');
    expect(ConstitutionStepModel.adoptedTextOf(flowWith('- Cut', true))).toBeNull();
    expect(ConstitutionStepModel.adoptedTextOf(flowWith(null, false))).toBeNull();
    expect(ConstitutionStepModel.adoptedTextOf(null)).toBeNull();
  });

  test('the editor starts from the adopted file or the draft; a root kept for a person and a cut file have none, and say why', () => {
    const draft = {
      markdown: '- Drafted.\n', annotations: [], draftedFrom: { contributing: false, research: true, installedDefault: false }, baseBlob: null, revision: 2
    };
    expect(ConstitutionStepModel.entityEditorVersionOf('drafted', null, draft)).toEqual({ markdown: '- Drafted.\n', revision: 2 });
    expect(ConstitutionStepModel.entityEditorVersionOf('not-started', null, null)).toEqual({ markdown: '', revision: 0 });
    expect(ConstitutionStepModel.entityEditorVersionOf('kept-for-a-person', null, draft)).toBeNull();
    expect(ConstitutionStepModel.entityEditorVersionOf('adopted', null, draft)).toBeNull();
    expect(ConstitutionStepModel.entityEditNoteOf('kept-for-a-person', 'CONSTITUTION.md')).toMatch(/^It is kept for a person/u);
    expect(ConstitutionStepModel.entityEditNoteOf('adopted', 'apps/web/RULES.md'))
      .toBe('The pipeline keeps apps/web/RULES.md as it is. Ask the pipeline agent to draft a new one.');
    expect(ConstitutionStepModel.entityPreviewNoteOf('adopted', 'apps/web/RULES.md', 'web')).toBe('apps/web/RULES.md stays as it is, byte for byte.');
    expect(ConstitutionStepModel.entityPreviewNoteOf('not-started', 'apps/web/CONSTITUTION.md', 'web')).toBe('The agent has not drafted web’s constitution yet.');
  });
});
