/**
 * The agent step, the setup's first, against fake controls and a planted file chooser. What matters: the vendor cards come from what the
 * forge sends, the one it cannot run yet shown as coming later and never chosen. On the landing, with no record, the page holds the choice
 * and sends nothing until Continue to billing starts the setup with it: this machine's program, kept first when forge only found it, or
 * a program chosen in the dialog, kept for every forge while the box is ticked (asking first while other forges follow the machine's) or
 * pinned once unticked; the start of an unreadable file says it replaces it, a refused start shows forge's sentence verbatim and stays,
 * and with nothing found the primary action opens the chooser. With a record, a choice is sent to the record at once, a refusal shows
 * verbatim and keeps nothing, the program's run shows as forge reports it, Continue to billing waits until the record's program runs, and
 * a record past the step is reached again by the way back to its current step, never a Back to billing.
 */
import {
  act,
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
import { useState } from 'react';

import type { BoardPipelineAgentDocument }                                         from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }                                               from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardDocument }                                                      from '../../../../@types/board/BoardDocument.ts';
import { ProgramFileChooserContext }                                               from '../../../shared/commands/ProgramFileChooser.ts';
import { EXAMPLE_AGENT_PROGRAM_PATH, EXAMPLE_AGENT_VENDOR, LATER_EXAMPLE_VENDORS } from '../../../testing/AgentFixture.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                        from '../../../testing/FakeControls.ts';
import { onBoard }                                                                 from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName }  from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                            from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const LANDING_ROUTE = { tab: 'pipeline', item: null } as const;
const AGENT_ROUTE = { tab: 'pipeline', item: 'setup/agent' } as const;
const CHOSEN_PATH = '/Users/example/tools/example-agent';
const BILLING_HASH = '#forge/example-tracker/pipeline/setup/billing';

const FOLLOWING_MACHINE = { vendor: EXAMPLE_AGENT_VENDOR, program: { follows: 'machine' } } as const;

function startOf(agent: BoardPipelineAgentDocument, replacesUnreadablePipeline = false): BoardCommandDocument {
  return {
    ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-start', agent, replacesUnreadablePipeline
  };
}

function machineProgramSetOf(programPath: string): BoardCommandDocument {
  return {
    ...SENT_COMMAND_VERSION, kind: 'machine-agent-program-set', vendor: EXAMPLE_AGENT_VENDOR, programPath
  };
}

function renderOf(facts: BoardDocument, route: typeof LANDING_ROUTE | typeof AGENT_ROUTE, chosenPath: string | null = CHOSEN_PATH) {
  const controls = fakeControls();
  controls.render(
    <ProgramFileChooserContext value={() => Promise.resolve(chosenPath)}>
      {onBoard(<PipelineView facts={facts} route={route} {...pipelineViewServicesOf()} />)}
    </ProgramFileChooserContext>,
  );
  return controls;
}

function renderLanding(name: PipelineFixtureName, chosenPath: string | null = CHOSEN_PATH) {
  return renderOf(pipelineBoardStateOf(name), LANDING_ROUTE, chosenPath);
}

function renderAgentStep(name: PipelineFixtureName) {
  return renderOf(pipelineBoardStateOf(name), AGENT_ROUTE);
}

describe('the agent cards', () => {
  test('show the forge\'s vendor chosen and each vendor it cannot run yet as its own card, coming later, which cannot be chosen', () => {
    renderLanding('landing-found');
    expect((screen.getByLabelText('Example Agent') as HTMLInputElement).checked).toBe(true);
    const later = LATER_EXAMPLE_VENDORS.map((vendor) => screen.getByLabelText(vendor.displayName) as HTMLInputElement);
    expect(later.map((input) => [input.checked, input.disabled])).toEqual([[false, true], [false, true]]);
    expect(screen.getAllByText('Coming later')).toHaveLength(LATER_EXAMPLE_VENDORS.length);
    expect(screen.getByText('Step 1 of 6')).toBeDefined();
  });
});

describe('the landing', () => {
  test('opens the setup under its title, with the pipeline not set, the waiting tickets and what the pipeline decides', () => {
    renderLanding('landing-found');
    expect(screen.getByRole('heading', { name: 'Set up the pipeline' })).toBeDefined();
    expect(screen.getByText('Pipeline not set')).toBeDefined();
    expect(screen.getByText('4 tickets wait for a pipeline')).toBeDefined();
    expect(screen.getByRole('region', { name: 'What the pipeline decides' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Back to billing' })).toBeNull();
  });

  test('holds this machine\'s program forge found, sends nothing on a choice, and Continue keeps it as the machine\'s, then starts', async () => {
    const controls = renderLanding('landing-found');
    const machineProgram = screen.getByLabelText('This machine\'s Example Agent') as HTMLInputElement;
    expect(machineProgram.checked).toBe(true);
    fireEvent.click(machineProgram);
    expect(controls.sent).toEqual([]);
    await clickSettled(screen.getByRole('button', { name: 'Continue to billing' }));
    expect(controls.sent).toEqual([machineProgramSetOf(EXAMPLE_AGENT_PROGRAM_PATH), startOf(FOLLOWING_MACHINE)]);
    expect(window.location.hash).toBe(BILLING_HASH);
  });

  test('a program the machine keeps already is only followed, and the start of an unreadable pipeline.json replaces it', async () => {
    const controls = renderLanding('A0-unreadable');
    await clickSettled(screen.getByRole('button', { name: 'Continue to billing' }));
    expect(controls.sent).toEqual([startOf(FOLLOWING_MACHINE, true)]);
  });

  test('a refused start shows forge\'s words and stays on the landing', async () => {
    const controls = renderLanding('A0');
    const refusal = 'agent program refused: the Example Agent at /Users/example/.local/bin/example-agent did not answer its version';
    controls.answerNextWith({ verdict: 'refused', refusal });
    await clickSettled(screen.getByRole('button', { name: 'Continue to billing' }));
    expect(screen.getByText(refusal)).toBeDefined();
    expect(window.location.hash).toBe('');
  });

  test('with nothing found, the primary action opens the chooser, and the chosen program is kept for every forge, then started', async () => {
    const controls = renderLanding('landing-nothing-found');
    await clickSettled(screen.getByRole('button', { name: 'Choose the Example Agent program…' }));
    const chosen = screen.getByLabelText('The chosen program');
    expect(within(chosen).getByText(CHOSEN_PATH)).toBeDefined();
    expect((within(chosen).getByRole('checkbox', { name: /Use it for every forge on this machine/u }) as HTMLInputElement).checked).toBe(true);
    expect(within(chosen).queryByRole('button', { name: 'Use this program' })).toBeNull();
    expect(controls.sent).toEqual([]);
    await clickSettled(screen.getByRole('button', { name: 'Continue to billing' }));
    expect(controls.sent).toEqual([machineProgramSetOf(CHOSEN_PATH), startOf(FOLLOWING_MACHINE)]);
  });

  test('a chosen program is pinned to this forge once the box is unticked', async () => {
    const controls = renderLanding('landing-nothing-found');
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Use it for every forge on this machine/u }));
    await clickSettled(screen.getByRole('button', { name: 'Continue to billing' }));
    expect(controls.sent).toEqual([startOf({ vendor: EXAMPLE_AGENT_VENDOR, program: { pinned: CHOSEN_PATH } })]);
  });

  test('changing the program other forges follow asks first, then keeps it for every forge and starts', async () => {
    const controls = renderLanding('A0');
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Use it for every forge on this machine/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to billing' }));
    expect(controls.sent).toEqual([]);
    expect(screen.getByText('3 other forges follow this machine\'s Example Agent. Change it for every one of them?')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Change it for every forge' }));
    expect(controls.sent).toEqual([machineProgramSetOf(CHOSEN_PATH), startOf(FOLLOWING_MACHINE)]);
    expect(window.location.hash).toBe(BILLING_HASH);
  });

  test('choosing this machine\'s program again drops the program chosen in the dialog', async () => {
    renderLanding('A0');
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    fireEvent.click(screen.getByLabelText('This machine\'s Example Agent'));
    expect(screen.queryByLabelText('The chosen program')).toBeNull();
  });

  test('the box follows the current board: once the machine keeps a program, a chosen one is for this forge only by default', async () => {
    const facts = pipelineBoardStateOf('landing-nothing-found');
    const controls = fakeControls();
    let showFacts: (shown: typeof facts) => void = () => undefined;

    function BoardThatChanges() {
      const [shown, setShown] = useState(facts);
      showFacts = setShown;
      return (
        <ProgramFileChooserContext value={() => Promise.resolve(CHOSEN_PATH)}>
          {onBoard(<PipelineView facts={shown} route={LANDING_ROUTE} {...pipelineViewServicesOf()} />)}
        </ProgramFileChooserContext>
      );
    }
    controls.render(<BoardThatChanges />);
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    const everyForgeBox = () => screen.getByRole('checkbox', { name: /Use it for every forge on this machine/u }) as HTMLInputElement;
    expect(everyForgeBox().checked).toBe(true);
    act(() => showFacts({ ...facts, agent: { ...facts.agent, machineProgramPath: EXAMPLE_AGENT_PROGRAM_PATH } }));
    expect(everyForgeBox().checked).toBe(false);
  });

  test('a cancelled chooser chooses nothing', async () => {
    renderLanding('landing-nothing-found', null);
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    expect(screen.queryByLabelText('The chosen program')).toBeNull();
  });
});

describe('the agent step with a record', () => {
  test('shows the run forge reports, and Continue to billing continues the step and opens billing', async () => {
    const controls = renderAgentStep('agent-step-chosen');
    expect(screen.getByRole('heading', { name: 'Which agent builds Example Agency' })).toBeDefined();
    expect(screen.getByText('runs · 2.1.327')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Continue to billing' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'agent', move: 'continue'
    }]);
    expect(window.location.hash).toBe(BILLING_HASH);
  });

  test('Continue waits while the chosen program does not run, whose reason forge words', () => {
    renderAgentStep('agent-step-refused');
    expect((screen.getByRole('button', { name: 'Continue to billing' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(`the Example Agent at ${EXAMPLE_AGENT_PROGRAM_PATH} is not there`)).toBeDefined();
  });

  test('a record past the step offers the way back to its current step, and no Continue', () => {
    renderAgentStep('A1');
    expect(screen.queryByRole('button', { name: 'Continue to billing' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back to billing' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to research' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/research');
  });

  test('a choice of this machine\'s program is sent to the record at once', async () => {
    const chosen = pipelineBoardStateOf('agent-step-chosen');
    const { setup } = chosen.pipeline;
    if (setup === null) throw new Error('the fixture agent-step-chosen has no setup');
    const pinnedRecord = { ...setup.record, agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { pinned: CHOSEN_PATH } } };
    const controls = renderOf({ ...chosen, pipeline: { ...chosen.pipeline, setup: { ...setup, record: pinnedRecord } } }, AGENT_ROUTE);
    await clickSettled(screen.getByLabelText('This machine\'s Example Agent'));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-agent', setupId: 'S1', agent: FOLLOWING_MACHINE
    }]);
  });

  test('a program chosen in the dialog is pinned to the record by Use this program', async () => {
    const controls = renderAgentStep('agent-step-chosen');
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-agent', setupId: 'S1', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { pinned: CHOSEN_PATH } }
    }]);
  });

  test('a program forge refuses shows forge\'s sentence verbatim and stays unkept', async () => {
    const controls = renderAgentStep('agent-step-chosen');
    const refusal = 'agent program refused: the Example Agent at /Users/example/Downloads/agent.zip is not a program this user may run';
    controls.answerNextWith({ verdict: 'refused', refusal });
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect(screen.getByText(refusal)).toBeDefined();
    expect(screen.getByText('Refused')).toBeDefined();
    expect(screen.getByLabelText('The chosen program')).toBeDefined();
  });

  test('a refusal of the forge\'s choice after the machine\'s program was stored says both, so nothing reads as unchanged', async () => {
    const chosen = pipelineBoardStateOf('agent-step-chosen');
    const controls = renderOf({ ...chosen, agent: { ...chosen.agent, machineProgramPath: null, otherForgesFollowingMachine: 0 } }, AGENT_ROUTE);
    const refusal = 'pipeline agent refused: the setup is not at its agent step';
    controls.answerNextWith({ verdict: 'applied', outcome: 'done', result: { startedJobId: null, writtenVersionNumber: null } });
    controls.answerNextWith({ verdict: 'refused', refusal });
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect(controls.sent.map((command) => command.kind)).toEqual(['machine-agent-program-set', 'pipeline-setup-agent']);
    expect(screen.getByText(refusal)).toBeDefined();
    expect(screen.getByText(`This machine's Example Agent is now ${CHOSEN_PATH}, but this forge's agent did not change.`)).toBeDefined();
  });

  test('a refusal of the machine\'s program itself says only the refusal: nothing was stored', async () => {
    const chosen = pipelineBoardStateOf('agent-step-chosen');
    const controls = renderOf({ ...chosen, agent: { ...chosen.agent, machineProgramPath: null, otherForgesFollowingMachine: 0 } }, AGENT_ROUTE);
    controls.answerNextWith({ verdict: 'refused', refusal: 'agent program refused: not a program' });
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect(controls.sent.map((command) => command.kind)).toEqual(['machine-agent-program-set']);
    expect(screen.queryByText(/is now/u)).toBeNull();
  });
});

describe('where forge looked', () => {
  test('lists each place, found or not there', () => {
    renderLanding('landing-found');
    const places = within(screen.getByRole('list', { name: 'Where forge looked' })).getAllByRole('listitem');
    expect(places.map((place) => [place.getAttribute('data-found'), place.textContent])).toEqual([
      ['true', `${EXAMPLE_AGENT_PROGRAM_PATH}found`],
      ['false', '/opt/homebrew/bin/example-agentnot there'],
      ['false', '/usr/local/bin/example-agentnot there'],
    ]);
  });
});
