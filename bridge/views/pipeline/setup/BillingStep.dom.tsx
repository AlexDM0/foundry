/**
 * The billing step against fake controls. What matters: "Set up the pipeline" sends the start with the chosen billing and cap and then
 * opens the research step; the start of an unreadable file says that it replaces it; a refusal shows verbatim; the page counts the
 * waiting tickets from the facts; the pipeline agent's meter shows opus and high over five bars; reopened while a record is open, the
 * start is replaced by the way back to the current step, or by Continue to research while the record is still at billing, so the step
 * never links back to itself, and a billing change is saved to the record; the panel introduces Flint in its one slot, and the footer
 * words the chosen billing.
 */
import {
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { clickSettled, fakeControls }                   from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                 from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const LANDING_ROUTE = { tab: 'pipeline', item: null } as const;

describe('the setup landing', () => {
  test('"Set up the pipeline" sends the start with the chosen billing and cap, then opens the research', async () => {
    const controls = fakeControls();
    controls.render(<PipelineView facts={pipelineBoardStateOf('A0')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    fireEvent.click(screen.getByLabelText('API key'));
    fireEvent.change(screen.getByLabelText('Cap per launch in US dollars'), { target: { value: '12.5' } });
    await clickSettled(screen.getByRole('button', { name: 'Set up the pipeline' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-setup-start', billing: { mode: 'api', maxBudgetUsd: 12.5 }, replacesUnreadablePipeline: false }]);
    expect(window.location.hash).toBe('#pipeline/setup/research');
  });

  test('the subscription is chosen first, and typing a cap chooses the API key', async () => {
    const controls = fakeControls();
    controls.render(<PipelineView facts={pipelineBoardStateOf('A0')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    expect((screen.getByLabelText('Subscription') as HTMLInputElement).checked).toBe(true);
    fireEvent.focus(screen.getByLabelText('Cap per launch in US dollars'));
    expect((screen.getByLabelText('API key') as HTMLInputElement).checked).toBe(true);
    await clickSettled(screen.getByRole('button', { name: 'Set up the pipeline' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-setup-start', billing: { mode: 'api' }, replacesUnreadablePipeline: false }]);
  });

  test('the start of an unreadable pipeline.json replaces it', async () => {
    const controls = fakeControls();
    controls.render(<PipelineView facts={pipelineBoardStateOf('A0-unreadable')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    await clickSettled(screen.getByRole('button', { name: 'Set up the pipeline' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: true }]);
  });

  test('a refused start shows the Overseer\'s words and stays on the landing', async () => {
    const controls = fakeControls();
    controls.answerNextWith({ verdict: 'refused', refusal: 'The cap per launch must be a positive number.' });
    controls.render(<PipelineView facts={pipelineBoardStateOf('A0')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    fireEvent.change(screen.getByLabelText('Cap per launch in US dollars'), { target: { value: '-1' } });
    await clickSettled(screen.getByRole('button', { name: 'Set up the pipeline' }));
    expect(screen.getByText('The cap per launch must be a positive number.')).toBeDefined();
    expect(window.location.hash).toBe('');
  });

  test('says how many tickets wait, from the facts', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A0')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    expect(screen.getByText('4 tickets wait for a pipeline')).toBeDefined();
  });

  test('the pipeline agent\'s meter shows opus and high over five bars', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A0')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    const meter = screen.getByRole('img', { name: 'Pipeline agent: opus, high effort' });
    expect(meter.querySelectorAll('.design-system-effort-meter-bar')).toHaveLength(5);
    expect(meter.querySelectorAll('.design-system-effort-meter-bar[data-filled]')).toHaveLength(3);
  });

  test('says that a gate\'s profile runs only when User asks for it', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A0')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    expect(screen.getByText('Profiles a gate in a phase when you ask, and shows its time. The time only informs.')).toBeDefined();
    expect(screen.queryByText(/benchmark/u)).toBeNull();
  });

  test('the pipeline agent\'s panel introduces Flint, waving, before the agent starts', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A0')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });
    expect(within(panel).getByRole('heading', { name: 'Pipeline agent' })).toBeDefined();
    expect(within(panel).getByText('Not started')).toBeDefined();
    expect(within(panel).getByRole('heading', { name: 'Meet Flint' })).toBeDefined();
    const flint = within(panel).getByRole('img', { name: 'Flint, the pipeline agent' });
    expect([flint.dataset['size'], flint.dataset['ground'], flint.dataset['flintPose']]).toEqual(['100', 'page', 'waving']);
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
    expect(within(panel).getByText('When you start it, Flint:')).toBeDefined();
  });

  test('the footer words the chosen billing', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A0')} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />);
    const footer = screen.getByRole('region', { name: 'Billing actions' });
    expect(within(footer).getByText('Agents run on this machine\'s Claude login.')).toBeDefined();
    fireEvent.click(screen.getByLabelText('API key'));
    expect(within(footer).getByText('Billed to ANTHROPIC_API_KEY. No cap per launch.')).toBeDefined();
  });
});

describe('the billing step reopened with a record', () => {
  const REOPENED_ROUTE = { tab: 'pipeline', item: 'setup/billing' } as const;

  test('offers the way back to the current step in place of a second start', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A0b-running')} route={REOPENED_ROUTE} {...pipelineViewServicesOf()} />);
    expect(screen.queryByRole('button', { name: 'Set up the pipeline' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to pipeline design' }).getAttribute('href')).toBe('#pipeline/setup/design');
  });

  test('a record still at billing offers Continue to research, which continues the step and opens the research', async () => {
    const controls = fakeControls();
    controls.render(<PipelineView facts={pipelineBoardStateOf('A0b-at-billing')} route={REOPENED_ROUTE} {...pipelineViewServicesOf()} />);
    expect(screen.queryByRole('link', { name: 'Back to billing' })).toBeNull();
    await clickSettled(screen.getByRole('button', { name: 'Continue to research' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'billing', move: 'continue'
    }]);
    expect(window.location.hash).toBe('#pipeline/setup/research');
  });

  test('a billing change is saved to the record, and the record\'s own billing sends nothing', async () => {
    const controls = fakeControls();
    controls.render(<PipelineView facts={pipelineBoardStateOf('A0b-running')} route={REOPENED_ROUTE} {...pipelineViewServicesOf()} />);
    const save = screen.getByRole('button', { name: 'Save billing' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('API key'));
    fireEvent.change(screen.getByLabelText('Cap per launch in US dollars'), { target: { value: '8' } });
    await clickSettled(save);
    expect(controls.sent).toEqual([{ kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'api', maxBudgetUsd: 8 } }]);
  });
});
