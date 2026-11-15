/**
 * The constitution step's model against the pipeline fixtures. What matters: READ BY names Builder, Review and Re-review from the facts'
 * roles and nothing else, both re-reviewers as one word; the footer counts the outline's sections and rules; the agent's state comes from
 * its job and its ready mark; a SOURCES tick flips that one choice at the facts' revision and never sends the markdown; Continue moves the
 * constitution step; an update record is the edit mode.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineSetupFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { pipelineBoardStateOf }    from '../../../testing/PipelineFixture.ts';
import { ConstitutionStepModel }   from './ConstitutionStepModel.ts';

function constitutionSetup(): PipelineSetupFacts {
  const setup = pipelineBoardStateOf('A3b').pipelineSetup;
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
  test('drafts while the agent runs, is ready once it says so, and is not running with no job', () => {
    const setup = constitutionSetup();
    expect(ConstitutionStepModel.agentStateOf(setup)).toBe('drafting');
    expect(ConstitutionStepModel.agentStateOf({ ...setup, record: { ...setup.record, readyToContinue: ['constitution'] } })).toBe('ready');
    expect(ConstitutionStepModel.agentStateOf({ ...setup, agentJobState: null })).toBe('not-running');
  });

  test('the panel head says it drafts, is ready or does not run', () => {
    const setup = constitutionSetup();
    expect(ConstitutionStepModel.panelStatusOf(setup)).toEqual({ tone: 'working', text: 'Drafting' });
    expect(ConstitutionStepModel.panelStatusOf({ ...setup, record: { ...setup.record, readyToContinue: ['constitution'] } })).toEqual({ tone: 'ready', text: 'Draft ready' });
    expect(ConstitutionStepModel.panelStatusOf({ ...setup, agentJobState: null })).toEqual({ tone: 'idle', text: 'Not running' });
  });
});

describe('the commands', () => {
  test('a SOURCES tick flips that one choice at the facts revision, with no markdown', () => {
    expect(ConstitutionStepModel.sourcesCommandOf(constitutionSetup(), 'installedDefault')).toEqual({
      kind:        'pipeline-constitution-edit',
      setupId:     'S1',
      revision:    3,
      draftedFrom: { contributing: true, research: true, installedDefault: true },
    });
  });

  test('Continue moves the constitution step', () => {
    expect(ConstitutionStepModel.continueCommandOf(constitutionSetup())).toEqual({
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'constitution', move: 'continue',
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
