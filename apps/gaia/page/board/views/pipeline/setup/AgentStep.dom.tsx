/**
 * The agent step against fake controls and a planted file chooser. What matters: the vendor cards come from what the forge sends, the one
 * it cannot run yet shown as coming later and never chosen; this machine's program forge found is kept as this machine's and followed in
 * one press; a program chosen in the dialog is kept for every forge while the box is ticked, or pinned to this forge once unticked; a
 * refusal shows forge's sentence verbatim and keeps nothing; the program's run shows as forge reports it; Continue to research waits
 * until the record's program runs; and with nothing found the footer's primary action opens the chooser.
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

import { ProgramFileChooserContext }                                               from '../../../shell/ProgramFileChooser.ts';
import { EXAMPLE_AGENT_PROGRAM_PATH, EXAMPLE_AGENT_VENDOR, LATER_EXAMPLE_VENDORS } from '../../../testing/AgentFixture.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                        from '../../../testing/FakeControls.ts';
import { onBoard }                                                                 from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName }  from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                            from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const AGENT_ROUTE = { tab: 'pipeline', item: 'setup/agent' } as const;
const CHOSEN_PATH = '/Users/example/tools/example-agent';

function renderAgentStep(name: PipelineFixtureName, chosenPath: string | null = CHOSEN_PATH) {
  const controls = fakeControls();
  controls.render(
    <ProgramFileChooserContext value={() => Promise.resolve(chosenPath)}>
      {onBoard(<PipelineView facts={pipelineBoardStateOf(name)} route={AGENT_ROUTE} {...pipelineViewServicesOf()} />)}
    </ProgramFileChooserContext>,
  );
  return controls;
}

describe('the agent cards', () => {
  test('show the forge\'s vendor chosen and each vendor it cannot run yet as its own card, coming later, which cannot be chosen', () => {
    renderAgentStep('agent-step-found');
    expect((screen.getByLabelText('Example Agent') as HTMLInputElement).checked).toBe(true);
    const later = LATER_EXAMPLE_VENDORS.map((vendor) => screen.getByLabelText(vendor.displayName) as HTMLInputElement);
    expect(later.map((input) => [input.checked, input.disabled])).toEqual([[false, true], [false, true]]);
    expect(screen.getAllByText('Coming later')).toHaveLength(LATER_EXAMPLE_VENDORS.length);
    expect(screen.queryByText('More coding agents')).toBeNull();
    expect(screen.getByText('Step 2 of 6')).toBeDefined();
  });
});

describe('this machine\'s program', () => {
  test('one forge found while the machine keeps none is selectable, kept as this machine\'s, then followed, in one press', async () => {
    const controls = renderAgentStep('agent-step-found');
    const machineProgram = screen.getByLabelText('This machine\'s Example Agent') as HTMLInputElement;
    expect(machineProgram.disabled).toBe(false);
    await clickSettled(machineProgram);
    expect(controls.sent).toEqual([
      {
        ...SENT_COMMAND_VERSION, kind: 'machine-agent-program-set', vendor: EXAMPLE_AGENT_VENDOR, programPath: EXAMPLE_AGENT_PROGRAM_PATH
      },
      {
        ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-agent', setupId: 'S1', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { follows: 'machine' } }
      },
    ]);
  });

  test('shows the run forge reports, and Continue to research continues the step and opens the research', async () => {
    const controls = renderAgentStep('agent-step-chosen');
    expect(screen.getByText('runs · 2.1.327')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Continue to research' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'agent', move: 'continue'
    }]);
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline/setup/research');
  });

  test('Continue waits while no program is chosen or the chosen one does not run, whose reason forge words', () => {
    renderAgentStep('agent-step-found');
    expect((screen.getByRole('button', { name: 'Continue to research' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderAgentStep('agent-step-refused');
    expect((screen.getByRole('button', { name: 'Continue to research' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(`the Example Agent at ${EXAMPLE_AGENT_PROGRAM_PATH} is not there`)).toBeDefined();
  });
});

describe('a program chosen in the file chooser', () => {
  test('is kept for every forge while nothing is kept for the machine yet', async () => {
    const controls = renderAgentStep('agent-step-nothing-found');
    await clickSettled(screen.getByRole('button', { name: 'Choose the Example Agent program…' }));
    const chosen = screen.getByLabelText('The chosen program');
    expect(within(chosen).getByText(CHOSEN_PATH)).toBeDefined();
    expect((within(chosen).getByRole('checkbox', { name: /Use it for every forge on this machine/u }) as HTMLInputElement).checked).toBe(true);
    await clickSettled(within(chosen).getByRole('button', { name: 'Use this program' }));
    expect(controls.sent).toEqual([
      {
        ...SENT_COMMAND_VERSION, kind: 'machine-agent-program-set', vendor: EXAMPLE_AGENT_VENDOR, programPath: CHOSEN_PATH
      },
      {
        ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-agent', setupId: 'S1', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { follows: 'machine' } }
      },
    ]);
  });

  test('is pinned to this forge once the box is unticked', async () => {
    const controls = renderAgentStep('agent-step-nothing-found');
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Use it for every forge on this machine/u }));
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-agent', setupId: 'S1', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { pinned: CHOSEN_PATH } }
    }]);
  });

  test('a program forge refuses shows forge\'s sentence verbatim and stays unkept', async () => {
    const controls = renderAgentStep('agent-step-nothing-found');
    const refusal = 'agent program refused: the Example Agent at /Users/example/Downloads/agent.zip is not a program this user may run';
    controls.answerNextWith({ verdict: 'refused', refusal });
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect(screen.getByText(refusal)).toBeDefined();
    expect(screen.getByText('Refused')).toBeDefined();
    expect(screen.getByLabelText('The chosen program')).toBeDefined();
  });

  test('a refusal of the forge\'s choice after the machine\'s program was stored says both, so nothing reads as unchanged', async () => {
    const controls = renderAgentStep('agent-step-nothing-found');
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
    const controls = renderAgentStep('agent-step-nothing-found');
    controls.answerNextWith({ verdict: 'refused', refusal: 'agent program refused: not a program' });
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect(controls.sent.map((command) => command.kind)).toEqual(['machine-agent-program-set']);
    expect(screen.queryByText(/is now/u)).toBeNull();
  });

  test('the box follows the current board: once the machine keeps a program, a chosen one is for this forge only by default', async () => {
    const facts = pipelineBoardStateOf('agent-step-nothing-found');
    const controls = fakeControls();
    const viewOf = (shown: typeof facts) => (
      <ProgramFileChooserContext value={() => Promise.resolve(CHOSEN_PATH)}>
        {onBoard(<PipelineView facts={shown} route={AGENT_ROUTE} {...pipelineViewServicesOf()} />)}
      </ProgramFileChooserContext>
    );
    let showFacts: (shown: typeof facts) => void = () => undefined;

    function BoardThatChanges() {
      const [shown, setShown] = useState(facts);
      showFacts = setShown;
      return viewOf(shown);
    }
    controls.render(<BoardThatChanges />);
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    const everyForgeBox = () => screen.getByRole('checkbox', { name: /Use it for every forge on this machine/u }) as HTMLInputElement;
    expect(everyForgeBox().checked).toBe(true);
    act(() => showFacts({ ...facts, agent: { ...facts.agent, machineProgramPath: EXAMPLE_AGENT_PROGRAM_PATH } }));
    expect(everyForgeBox().checked).toBe(false);
  });

  test('a cancelled chooser chooses nothing', async () => {
    renderAgentStep('agent-step-nothing-found', null);
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    expect(screen.queryByLabelText('The chosen program')).toBeNull();
  });
});

describe('where forge looked', () => {
  test('lists each place, found or not there', () => {
    renderAgentStep('agent-step-found');
    const places = within(screen.getByRole('list', { name: 'Where forge looked' })).getAllByRole('listitem');
    expect(places.map((place) => [place.getAttribute('data-found'), place.textContent])).toEqual([
      ['true', `${EXAMPLE_AGENT_PROGRAM_PATH}found`],
      ['false', '/opt/homebrew/bin/example-agentnot there'],
      ['false', '/usr/local/bin/example-agentnot there'],
    ]);
  });
});
