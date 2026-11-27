/**
 * The welcome, the setup landing of a forge with no pipeline: only the onboarding, the steps the setup walks, Start with the agent sending nothing,
 * and the agent's program, an unreadable `pipeline.json` and waiting tickets.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardDocument }                                                     from '../../../../@types/board/BoardDocument.ts';
import { EXAMPLE_AGENT_PROGRAM_PATH }                                             from '../../../testing/AgentFixture.ts';
import { fakeControls }                                                           from '../../../testing/FakeControls.ts';
import { onBoard }                                                                from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderWelcomeOf(facts: BoardDocument) {
  const controls = fakeControls();
  controls.render(onBoard(<PipelineView facts={facts} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />));
  return controls;
}

function renderWelcome(name: PipelineFixtureName) {
  return renderWelcomeOf(pipelineBoardStateOf(name));
}

describe('the welcome', () => {
  test('names the project and says what a pipeline is and that every answer is kept, with no state tags and no phase overview', () => {
    renderWelcome('landing-found');
    expect(screen.getByText('New forge')).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'Set up Example Agency\'s pipeline' })).toBeDefined();
    expect(screen.getByText(/Every answer is saved as you go, so you can leave and come back\./u)).toBeDefined();
    expect(screen.queryByText('Pipeline not set')).toBeNull();
    expect(screen.queryByRole('region', { name: 'What the pipeline decides' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('lists the steps the setup walks, numbered, each with what it decides, the agent first and current', () => {
    renderWelcome('landing-found');
    const steps = within(screen.getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem');
    expect(steps.map((step) => step.querySelector('.board-pipeline-welcome-step-number')?.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(steps[0]?.textContent).toContain('AgentThe coding agent every job runs.');
    expect(steps.map((step) => step.getAttribute('aria-current'))).toEqual(['step', null, null, null, null, null]);
  });

  test('its one way in, Start with the agent, leads to the agent step that starts the setup and sends nothing', () => {
    const controls = renderWelcome('landing-found');
    expect(screen.getByRole('link', { name: 'Start with the agent' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/agent');
    expect(screen.queryByRole('button', { name: 'Continue to billing' })).toBeNull();
    expect(controls.sent).toEqual([]);
  });

  test('says where forge found the agent\'s program, or that it found none', () => {
    renderWelcome('landing-found');
    expect(screen.getByText('Example Agent found at')).toBeDefined();
    expect(screen.getByText(EXAMPLE_AGENT_PROGRAM_PATH)).toBeDefined();
    cleanup();
    renderWelcome('landing-nothing-found');
    expect(screen.getByText('Forge found no Example Agent program yet. You choose it in the first step.')).toBeDefined();
  });

  test('names an unreadable pipeline.json with its reason', () => {
    renderWelcome('A0-unreadable');
    expect(screen.getByRole('status').textContent).toContain('gates[1] has no run line');
  });

  test('says how many tickets wait in one quiet line, and nothing while none waits', () => {
    renderWelcome('landing-found');
    expect(screen.getByText('4 tickets wait for a pipeline; none of them builds yet.')).toBeDefined();
    cleanup();
    const facts = pipelineBoardStateOf('landing-found');
    if (facts.page === null) throw new Error('the fixture landing-found has no page');
    renderWelcomeOf({ ...facts, page: { ...facts.page, tickets: [] } });
    expect(screen.queryByText(/wait for a pipeline/u)).toBeNull();
  });
});
