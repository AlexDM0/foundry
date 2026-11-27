/**
 * The Pipeline view's screen choice: the facts decide before the route, across the setup landing, the setup steps a record reached, the
 * resume summary, the edited flow and the live flow; the `entities` step shows only in monorepo mode; and a job forge did not launch is
 * fixed where its cause is chosen.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }                             from '../../../@types/board/BoardDocument.ts';
import type { BoardSetupRecordDocument }                  from '../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardRoute }                                from '../../../shared/BoardRouter.ts';
import { pipelineBoardStateOf, type PipelineFixtureName } from '../../testing/PipelineFixture.ts';
import { PipelineViewModel }                              from './PipelineViewModel.ts';

const { screenOf } = PipelineViewModel;

function pipelineRoute(item: string | null): BoardRoute {
  return { tab: 'pipeline', item };
}

/** A board whose stored pipeline reads as given, and nothing else of its pipeline changed. */
function withApplied(board: BoardDocument, applied: BoardDocument['pipeline']['applied']): BoardDocument {
  return { ...board, pipeline: { ...board.pipeline, applied } };
}

describe('the screen the facts and the route pick', () => {
  test('no record and no pipeline is the setup landing, with nothing unreadable, and the agent step\'s route the step that starts the setup', () => {
    expect(screenOf(pipelineBoardStateOf('A0'), pipelineRoute(null))).toEqual({ screen: 'setup-landing', unreadable: null });
    expect(screenOf(pipelineBoardStateOf('A0'), pipelineRoute('setup/research'))).toEqual({ screen: 'setup-landing', unreadable: null });
    expect(screenOf(pipelineBoardStateOf('A0'), PipelineViewModel.setupStartRoute)).toEqual({ screen: 'setup-start', unreadable: null });
    expect(PipelineViewModel.setupStartRoute).toEqual(pipelineRoute('setup/agent'));
  });

  test('an unreadable pipeline is the setup landing with its reason, and so is the step that starts the setup', () => {
    const malformed = { readingVerdict: 'malformed', reason: 'gates[1] has no run line' } as const;
    expect(screenOf(pipelineBoardStateOf('A0-unreadable'), pipelineRoute(null))).toEqual({ screen: 'setup-landing', unreadable: malformed });
    expect(screenOf(pipelineBoardStateOf('A0-unreadable'), pipelineRoute('setup/agent'))).toEqual({ screen: 'setup-start', unreadable: malformed });
    const older = withApplied(pipelineBoardStateOf('A0'), { readingVerdict: 'older', fileText: '{}\n' });
    expect(screenOf(older, pipelineRoute(null))).toEqual({ screen: 'setup-landing', unreadable: { readingVerdict: 'older' } });
  });

  test('a setup record shows the resume summary on the bare route, and the routed step once the record has reached it', () => {
    const state = pipelineBoardStateOf('A0b-recheck');
    expect(screenOf(state, pipelineRoute(null))).toEqual({ screen: 'setup-resume' });
    expect(screenOf(state, pipelineRoute('setup/billing'))).toEqual({ screen: 'setup-step', step: 'billing' });
    expect(screenOf(state, pipelineRoute('setup/research'))).toEqual({ screen: 'setup-step', step: 'research' });
    expect(screenOf(state, pipelineRoute('setup/design'))).toEqual({ screen: 'setup-step', step: 'design' });
  });

  test('the record a start opens is at the research, so the start\'s route to the research shows that step', () => {
    expect(screenOf(pipelineBoardStateOf('A1'), pipelineRoute('setup/research'))).toEqual({ screen: 'setup-step', step: 'research' });
  });

  test('a step the record has not reached, or no step at all, falls back to the resume summary', () => {
    const state = pipelineBoardStateOf('A0b-recheck');
    expect(screenOf(state, pipelineRoute('setup/apply'))).toEqual({ screen: 'setup-resume' });
    expect(screenOf(state, pipelineRoute('setup/nowhere'))).toEqual({ screen: 'setup-resume' });
    expect(screenOf(state, pipelineRoute('edit'))).toEqual({ screen: 'setup-resume' });
  });

  test('a setup record wins over an unreadable pipeline it replaces', () => {
    const state = withApplied(pipelineBoardStateOf('A1'), { readingVerdict: 'malformed', reason: 'gates[1] has no run line', fileText: '{}\n' });
    expect(screenOf(state, pipelineRoute('setup/research'))).toEqual({ screen: 'setup-step', step: 'research' });
  });

  test('an update record is the flow being edited, and the constitution at its own route', () => {
    expect(screenOf(pipelineBoardStateOf('A6'), pipelineRoute(null))).toEqual({ screen: 'flow', stage: 'editing' });
    expect(screenOf(pipelineBoardStateOf('A6'), pipelineRoute('edit'))).toEqual({ screen: 'flow', stage: 'editing' });
    expect(screenOf(pipelineBoardStateOf('A6'), pipelineRoute('edit/constitution'))).toEqual({ screen: 'constitution-edit' });
  });

  test('a readable pipeline with no record is the live flow, whatever the route names', () => {
    expect(screenOf(pipelineBoardStateOf('A5'), pipelineRoute(null))).toEqual({ screen: 'flow', stage: 'live' });
    expect(screenOf(pipelineBoardStateOf('A5'), pipelineRoute('setup/research'))).toEqual({ screen: 'flow', stage: 'live' });
  });
});

function recordOf(name: PipelineFixtureName): BoardSetupRecordDocument {
  const record = pipelineBoardStateOf(name).pipeline.setup?.record;
  if (record === undefined) throw new Error('the fixture holds a record');
  return record;
}

describe('single mode and monorepo mode', () => {
  test('single mode has no entities step, and its route falls back to the resume summary', () => {
    const state = pipelineBoardStateOf('A0b-recheck');
    expect(PipelineViewModel.setupStepsOf(recordOf('A0b-recheck'))).toEqual(['agent', 'billing', 'research', 'constitution', 'design', 'apply']);
    expect(PipelineViewModel.setupStepsOf(null)).toEqual(['agent', 'billing', 'research', 'constitution', 'design', 'apply']);
    expect(screenOf(state, pipelineRoute('setup/entities'))).toEqual({ screen: 'setup-resume' });
  });

  test('a record walking the entities step, or holding entities, shows the step after the research and opens its route once reached', () => {
    const single = recordOf('A0b-recheck');
    const walking: BoardSetupRecordDocument = { ...single, stepStates: { ...single.stepStates, entities: 'needs-recheck' } };
    const holding: BoardSetupRecordDocument = { ...single, entities: {} };

    expect(PipelineViewModel.setupStepsOf(walking)).toEqual(['agent', 'billing', 'research', 'entities', 'constitution', 'design', 'apply']);
    expect(PipelineViewModel.setupHasEntities(holding)).toBe(true);
    expect(PipelineViewModel.setupStepStatusOf(walking, 'entities')).toBe('recheck');
    const state = pipelineBoardStateOf('A0b-recheck');
    const { setup } = state.pipeline;
    if (setup === null) throw new Error('the fixture holds a setup');
    const facts = { ...state, pipeline: { ...state.pipeline, setup: { ...setup, record: walking } } };
    expect(screenOf(facts, pipelineRoute('setup/entities'))).toEqual({ screen: 'setup-step', step: 'entities' });
    expect(PipelineViewModel.screenTitleOf({ screen: 'setup-step', step: 'entities' })).toBe('Entities');
  });

  test('a record that left the entities step done with no entity declined monorepo mode, and is in single mode', () => {
    const single = recordOf('A0b-recheck');
    const declined: BoardSetupRecordDocument = { ...single, stepStates: { ...single.stepStates, entities: 'done' } };
    const stillThere: BoardSetupRecordDocument = { ...declined, currentStep: 'entities' };

    expect(PipelineViewModel.setupHasEntities(declined)).toBe(false);
    expect(PipelineViewModel.setupStepsOf(declined)).toEqual(['agent', 'billing', 'research', 'constitution', 'design', 'apply']);
    expect(PipelineViewModel.setupHasEntities(stillThere)).toBe(true);
  });
});

describe('the words and routes', () => {
  test('the live flow leaves a setup route for #pipeline, and no other route', () => {
    const live = screenOf(pipelineBoardStateOf('A5'), pipelineRoute(null));
    expect(PipelineViewModel.setupRouteIsLeftOf(live, pipelineRoute('setup/design'))).toBe(true);
    expect(PipelineViewModel.setupRouteIsLeftOf(live, pipelineRoute('edit'))).toBe(false);
    expect(PipelineViewModel.setupRouteIsLeftOf(live, pipelineRoute(null))).toBe(false);
    expect(PipelineViewModel.setupRouteIsLeftOf({ screen: 'setup-step', step: 'design' }, pipelineRoute('setup/design'))).toBe(false);
    expect(PipelineViewModel.liveRoute).toEqual(pipelineRoute(null));
  });

  test('a setup step reopens at its own route', () => {
    expect(PipelineViewModel.setupStepRouteOf('design')).toEqual(pipelineRoute('setup/design'));
  });

  test('each screen has its title, a step its label', () => {
    expect(PipelineViewModel.screenTitleOf({ screen: 'setup-step', step: 'design' })).toBe('Pipeline design');
    expect(PipelineViewModel.screenTitleOf({ screen: 'flow', stage: 'live' })).toBe('Pipeline');
    expect(PipelineViewModel.screenTitleOf({ screen: 'setup-landing', unreadable: null })).toBe('Set up the pipeline');
    expect(PipelineViewModel.screenTitleOf({ screen: 'setup-start', unreadable: null })).toBe('Agent');
  });

  test('an unreadable file\'s banner names its reason and says a new setup replaces it', () => {
    expect(PipelineViewModel.unreadableTextOf({ readingVerdict: 'older' }))
      .toBe('pipeline.json cannot be read: it is in an older format. A new setup replaces the file when it is applied.');
    expect(PipelineViewModel.unreadableTextOf({ readingVerdict: 'malformed', reason: 'gates[1] has no run line' }))
      .toBe('pipeline.json cannot be read: gates[1] has no run line. A new setup replaces the file when it is applied.');
  });
});

describe('the agent first', () => {
  test('the agent step leads the steps, current on a forge with no record, and each step names its place', () => {
    expect(PipelineViewModel.setupStepsOf(null).slice(0, 2)).toEqual(['agent', 'billing']);
    expect(PipelineViewModel.setupStepStatusOf(null, 'agent')).toBe('current');
    expect(PipelineViewModel.setupStepStatusOf(null, 'billing')).toBe('upcoming');
    expect(PipelineViewModel.stepPositionTextOf(null, 'agent')).toBe('Step 1 of 6');
    expect(PipelineViewModel.stepPositionTextOf(recordOf('A0b-at-billing'), 'billing')).toBe('Step 2 of 6');
  });

  test('a reopened step\'s way back names where the setup stands', () => {
    expect(PipelineViewModel.backToCurrentStepLabelOf(recordOf('A1'))).toBe('Back to research');
    expect(PipelineViewModel.backToCurrentStepLabelOf(recordOf('A0b-running'))).toBe('Back to pipeline design');
    expect(PipelineViewModel.backToCurrentStepLabelOf(recordOf('A0b-at-billing'))).toBe('Back to billing');
  });
});

describe('where a job forge did not launch is fixed', () => {
  test('a program cause leads to the agent step while a first setup is open, the landing with no setup, else the settings', () => {
    expect(PipelineViewModel.notLaunchedFixOf(pipelineBoardStateOf('A1'), 'not-there'))
      .toEqual({ label: 'Choose the Example Agent program…', route: pipelineRoute('setup/agent') });
    expect(PipelineViewModel.notLaunchedFixOf(pipelineBoardStateOf('A0'), 'not-there')).toEqual({ label: 'Set up the pipeline', route: pipelineRoute(null) });
    expect(PipelineViewModel.notLaunchedFixOf(pipelineBoardStateOf('A5'), 'not-there'))
      .toEqual({ label: 'Choose the Example Agent program…', route: pipelineRoute('settings') });
  });

  test('a billing its vendor does not offer leads to the billing step while a first setup is open, else to the forge\'s settings\' billing', () => {
    expect(PipelineViewModel.notLaunchedFixOf(pipelineBoardStateOf('A1'), 'billing-not-offered'))
      .toEqual({ label: 'Choose how the agent bills', route: pipelineRoute('setup/billing') });
    expect(PipelineViewModel.notLaunchedFixOf(pipelineBoardStateOf('A5'), 'billing-not-offered'))
      .toEqual({ label: 'Choose how the agent bills', route: pipelineRoute('settings') });
  });
});
