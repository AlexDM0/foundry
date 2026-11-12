/**
 * The Pipeline view's screen choice. What matters: the facts decide before the route. With no record and no pipeline the setup landing
 * shows, and an unreadable `pipeline.json` lands there too with its reason; a record in `setup` mode opens the route's step only while
 * the record has reached it, and the resume summary on the bare `#pipeline` or an unknown or unreached step; a record in `update` or
 * `advise` mode is the flow being edited, or the constitution at `#pipeline/edit/constitution`; a readable pipeline is the live flow; an
 * Overseer that serves no pipeline facts lands on setup. A step's route is `#pipeline/setup/<step>`.
 */
import { describe, expect, test } from 'bun:test';

import type { BridgeRoute }     from '../../shell/HashRouter.ts';
import { pipelineBoardStateOf } from '../../testing/PipelineFixture.ts';
import { PipelineViewModel }    from './PipelineViewModel.ts';

const { screenOf } = PipelineViewModel;

function pipelineRoute(item: string | null): BridgeRoute {
  return { tab: 'pipeline', item };
}

describe('the screen the facts and the route pick', () => {
  test('no record and no pipeline is the setup landing, with nothing unreadable', () => {
    expect(screenOf(pipelineBoardStateOf('A0'), pipelineRoute(null))).toEqual({ screen: 'setup-landing', unreadable: null });
    expect(screenOf({}, pipelineRoute('setup/research'))).toEqual({ screen: 'setup-landing', unreadable: null });
  });

  test('an unreadable pipeline is the setup landing with its reason', () => {
    const malformed = { readingVerdict: 'malformed', reason: 'gates[1] has no run line' } as const;
    expect(screenOf(pipelineBoardStateOf('A0-unreadable'), pipelineRoute(null))).toEqual({ screen: 'setup-landing', unreadable: malformed });
    const older = { pipeline: { readingVerdict: 'older', fileText: '{}\n' } } as const;
    expect(screenOf(older, pipelineRoute(null))).toEqual({ screen: 'setup-landing', unreadable: { readingVerdict: 'older' } });
  });

  test('a setup record shows the resume summary on the bare route, and the routed step once the record has reached it', () => {
    const state = pipelineBoardStateOf('A0b-recheck');
    expect(screenOf(state, pipelineRoute(null))).toEqual({ screen: 'setup-resume' });
    expect(screenOf(state, pipelineRoute('setup/billing'))).toEqual({ screen: 'setup-step', step: 'billing' });
    expect(screenOf(state, pipelineRoute('setup/research'))).toEqual({ screen: 'setup-step', step: 'research' });
    expect(screenOf(state, pipelineRoute('setup/design'))).toEqual({ screen: 'setup-step', step: 'design' });
  });

  test('a step the record has not reached, or no step at all, falls back to the resume summary', () => {
    const state = pipelineBoardStateOf('A0b-recheck');
    expect(screenOf(state, pipelineRoute('setup/apply'))).toEqual({ screen: 'setup-resume' });
    expect(screenOf(state, pipelineRoute('setup/nowhere'))).toEqual({ screen: 'setup-resume' });
    expect(screenOf(state, pipelineRoute('edit'))).toEqual({ screen: 'setup-resume' });
  });

  test('a setup record wins over an unreadable pipeline it replaces', () => {
    const state = { ...pipelineBoardStateOf('A1'), pipeline: { readingVerdict: 'malformed', reason: 'gates[1] has no run line', fileText: '{}\n' } } as const;
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

describe('the words and routes', () => {
  test('a setup step reopens at its own route', () => {
    expect(PipelineViewModel.setupStepFragmentOf('design')).toBe('#pipeline/setup/design');
  });

  test('each screen has its title, a step its label', () => {
    expect(PipelineViewModel.screenTitleOf({ screen: 'setup-step', step: 'design' })).toBe('Pipeline design');
    expect(PipelineViewModel.screenTitleOf({ screen: 'flow', stage: 'live' })).toBe('Pipeline');
    expect(PipelineViewModel.screenTitleOf({ screen: 'setup-landing', unreadable: null })).toBe('Set up the pipeline');
  });

  test('an unreadable file\'s banner names its reason and says a new setup replaces it', () => {
    expect(PipelineViewModel.unreadableTextOf({ readingVerdict: 'older' }))
      .toBe('pipeline.json cannot be read: it is in an older format. A new setup replaces the file when it is applied.');
    expect(PipelineViewModel.unreadableTextOf({ readingVerdict: 'malformed', reason: 'gates[1] has no run line' }))
      .toBe('pipeline.json cannot be read: gates[1] has no run line. A new setup replaces the file when it is applied.');
  });
});
