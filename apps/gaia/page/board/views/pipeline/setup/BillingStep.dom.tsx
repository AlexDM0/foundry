/**
 * The billing step against fake controls: the billing cards worded from what forge serves, Continue saving a changed choice first, refusals shown
 * verbatim, and the way back to the current step once the record stands past billing.
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

import { EXAMPLE_AGENT_KEY_VARIABLE_NAME }                                        from '../../../testing/AgentFixture.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                       from '../../../testing/FakeControls.ts';
import { onBoard }                                                                from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const BILLING_ROUTE = { tab: 'pipeline', item: 'setup/billing' } as const;

const CONTINUE = {
  ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'billing', move: 'continue'
} as const;

function renderBillingStep(name: PipelineFixtureName) {
  const controls = fakeControls();
  controls.render(onBoard(<PipelineView facts={pipelineBoardStateOf(name)} route={BILLING_ROUTE} {...pipelineViewServicesOf()} />));
  return controls;
}

describe('the billing step at billing', () => {
  test('is step 2, its cards the ways the agent bills, the default preselected while the record has none', () => {
    renderBillingStep('A0b-at-billing');
    expect(screen.getByText('Step 2 of 6')).toBeDefined();
    expect((screen.getByLabelText('Subscription') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Agents run on this machine\'s Example Agent login. Usage counts against the plan\'s limits, such as its weekly window.')).toBeDefined();
    expect(screen.getByText('Billed to the API key in Hephaestus\'s environment. The key is never stored.')).toBeDefined();
    expect(screen.getByText(EXAMPLE_AGENT_KEY_VARIABLE_NAME)).toBeDefined();
  });

  test('Continue to research saves the default the record does not hold yet, continues, and opens the research', async () => {
    const controls = renderBillingStep('A0b-at-billing');
    await clickSettled(screen.getByRole('button', { name: 'Continue to research' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'subscription' }
    }, CONTINUE]);
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline/setup/research');
  });

  test('Continue sends the chosen key and cap, and typing a cap chooses the key', async () => {
    const controls = renderBillingStep('A0b-at-billing');
    fireEvent.focus(screen.getByLabelText('Cap per launch in US dollars'));
    expect((screen.getByLabelText('API key') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Cap per launch in US dollars'), { target: { value: '12.5' } });
    await clickSettled(screen.getByRole('button', { name: 'Continue to research' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'api', maximumBudgetDollars: 12.5 }
    }, CONTINUE]);
  });

  test('a record that holds the chosen billing only continues', async () => {
    const controls = renderBillingStep('A0b-at-billing-api');
    expect((screen.getByLabelText('API key') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Cap per launch in US dollars') as HTMLInputElement).value).toBe('20');
    await clickSettled(screen.getByRole('button', { name: 'Continue to research' }));
    expect(controls.sent).toEqual([CONTINUE]);
  });

  test('a refused billing shows Hephaestus\'s words and stays at billing', async () => {
    const controls = renderBillingStep('A0b-at-billing');
    controls.answerNextWith({ verdict: 'refused', refusal: 'The cap per launch must be a positive number.' });
    fireEvent.change(screen.getByLabelText('Cap per launch in US dollars'), { target: { value: '-1' } });
    await clickSettled(screen.getByRole('button', { name: 'Continue to research' }));
    expect(screen.getByText('The cap per launch must be a positive number.')).toBeDefined();
    expect(controls.sent.map((command) => command.kind)).toEqual(['pipeline-setup-billing']);
    expect(window.location.hash).toBe('');
  });

  test('says the Continue starts the pipeline agent, and Back to agent leads to the step before', () => {
    renderBillingStep('A0b-at-billing');
    expect(screen.getByText('Starts the pipeline agent on a snapshot of main')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to agent' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/agent');
    expect(screen.queryByRole('button', { name: 'Save billing' })).toBeNull();
  });

  test('says how many tickets wait, from the facts', () => {
    renderBillingStep('A0b-at-billing');
    expect(screen.getByText('4 tickets wait for a pipeline')).toBeDefined();
    expect(screen.getByText('Setup in progress')).toBeDefined();
  });

  test('the pipeline agent\'s meter shows opus and high over five bars', () => {
    renderBillingStep('A0b-at-billing');
    const meter = screen.getByRole('img', { name: 'Pipeline agent: opus, high effort' });
    expect(meter.querySelectorAll('.design-system-effort-meter-bar')).toHaveLength(5);
    expect(meter.querySelectorAll('.design-system-effort-meter-bar[data-filled]')).toHaveLength(3);
  });

  test('says that a gate\'s profile runs only when User asks for it', () => {
    renderBillingStep('A0b-at-billing');
    expect(screen.getByText('Profiles a gate in a phase when you ask, and shows its time. The time only informs.')).toBeDefined();
    expect(screen.queryByText(/benchmark/u)).toBeNull();
  });

  test('the pipeline agent\'s panel introduces Flint in its slot before the agent starts', () => {
    renderBillingStep('A0b-at-billing');
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });
    expect(within(panel).getByRole('heading', { name: 'Pipeline agent' })).toBeDefined();
    expect(within(panel).getByText('Not started')).toBeDefined();
    expect(within(panel).getByRole('heading', { name: 'Meet Flint' })).toBeDefined();
    const flint = within(panel).getByRole('img', { name: 'Flint, the pipeline agent' });
    expect([flint.dataset['size'], flint.dataset['ground']]).toEqual(['100', 'page']);
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
    expect(within(panel).getByText('When you start it, Flint:')).toBeDefined();
  });

  test('the footer words the chosen billing', () => {
    renderBillingStep('A0b-at-billing');
    const footer = screen.getByRole('region', { name: 'Billing actions' });
    expect(within(footer).getByText('Agents run on this machine\'s Example Agent login.')).toBeDefined();
    fireEvent.click(screen.getByLabelText('API key'));
    expect(within(footer).getByText('Billed to the API key. No cap per launch.')).toBeDefined();
  });
});

describe('the billing step reopened past billing', () => {
  test('offers the way back to the current step in place of a Continue', () => {
    renderBillingStep('A0b-running');
    expect(screen.queryByRole('button', { name: 'Continue to research' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to pipeline design' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/design');
    expect(screen.queryByText('Starts the pipeline agent on a snapshot of main')).toBeNull();
  });

  test('a billing change is saved to the record, and the record\'s own billing sends nothing', async () => {
    const controls = renderBillingStep('A0b-running');
    const save = screen.getByRole('button', { name: 'Save billing' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('API key'));
    fireEvent.change(screen.getByLabelText('Cap per launch in US dollars'), { target: { value: '8' } });
    await clickSettled(save);
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'api', maximumBudgetDollars: 8 }
    }]);
  });
});
