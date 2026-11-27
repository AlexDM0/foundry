/**
 * The forge's settings against fake controls and a planted file chooser. What matters: the agent shows its vendor, that it follows this
 * machine's program, the path and that it runs; a program kept for every forge, when other forges follow this machine's, asks first and
 * names how many, and sends nothing until confirmed; unticked it pins the program with `pipeline-agent-set`; Look again sends
 * `agent-look-again`; while forge runs the program, a send shows the busy ring and past a second the panel that names the check; Edit
 * tools lists each tool with where it was found or that the machine lacks it, and keeps the edited list whole with `pipeline-tools-set`, a
 * tool added by name for forge to find; the billing shows only while the pipeline bills a way the agent does not, and saves the chosen
 * way with the agent as it is, in one `pipeline-agent-set`; and the live footer leads here.
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

import { BoardClockContext }                                                      from '../../../shared/BoardClock.ts';
import { COMMAND_WAIT_PANEL_DELAY_MILLISECONDS }                                  from '../../../shared/commands/CommandWait.ts';
import { ProgramFileChooserContext }                                              from '../../../shared/commands/ProgramFileChooser.ts';
import { EXAMPLE_AGENT_PROGRAM_PATH, EXAMPLE_AGENT_VENDOR }                       from '../../../testing/AgentFixture.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                       from '../../../testing/FakeControls.ts';
import { manualBoardClock }                                                       from '../../../testing/ManualBoardClock.ts';
import { onBoard }                                                                from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const SETTINGS_ROUTE = { tab: 'pipeline', item: 'settings' } as const;
const CHOSEN_PATH = '/Users/example/tools/example-agent';

function renderSettings(fixture: PipelineFixtureName = 'forge-settings', clock = manualBoardClock().clock) {
  const controls = fakeControls();
  controls.render(
    <BoardClockContext.Provider value={clock}>
      <ProgramFileChooserContext value={() => Promise.resolve(CHOSEN_PATH)}>
        {onBoard(<PipelineView facts={pipelineBoardStateOf(fixture)} route={SETTINGS_ROUTE} {...pipelineViewServicesOf()} />)}
      </ProgramFileChooserContext>
    </BoardClockContext.Provider>,
  );
  return controls;
}

describe('the agent', () => {
  test('shows the vendor, this machine\'s program it follows, and that it runs', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Forge settings' })).toBeDefined();
    expect(screen.getByText('this machine\'s Example Agent')).toBeDefined();
    expect((screen.getByLabelText('This machine\'s Example Agent') as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByText(EXAMPLE_AGENT_PROGRAM_PATH).length).toBeGreaterThan(0);
    expect(screen.getByText('runs · 2.1.327')).toBeDefined();
    expect(screen.getByText('Changing this machine\'s Example Agent here asks first: 3 other forges follow it.')).toBeDefined();
  });

  test('a program for every forge asks first, naming how many other forges follow, and sends only on the confirm', async () => {
    const controls = renderSettings();
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Use it for every forge on this machine/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }));
    const strip = screen.getByRole('group', { name: 'Change this machine\'s program' });
    expect(strip.textContent).toContain('3 other forges follow this machine\'s Example Agent. Change it for every one of them?');
    expect(controls.sent).toEqual([]);
    await clickSettled(within(strip).getByRole('button', { name: 'Change it for every forge' }));
    expect(controls.sent).toEqual([
      {
        ...SENT_COMMAND_VERSION, kind: 'machine-agent-program-set', vendor: EXAMPLE_AGENT_VENDOR, programPath: CHOSEN_PATH
      },
      { ...SENT_COMMAND_VERSION, kind: 'pipeline-agent-set', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { follows: 'machine' } } },
    ]);
  });

  test('a program for this forge only is pinned without asking', async () => {
    const controls = renderSettings();
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    expect((screen.getByRole('checkbox', { name: /Use it for every forge on this machine/u }) as HTMLInputElement).checked).toBe(false);
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-agent-set', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { pinned: CHOSEN_PATH } } }]);
  });

  test('Look again has forge run the program again', async () => {
    const controls = renderSettings();
    await clickSettled(screen.getByRole('button', { name: 'Look again' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'agent-look-again' }]);
  });
});

describe('the waits while forge runs the program', () => {
  test('Use this program shows the busy ring at once and, past a second, the panel naming the check, until forge answers', async () => {
    const time = manualBoardClock();
    const controls = renderSettings('forge-settings', time.clock);
    await clickSettled(screen.getByRole('button', { name: 'Choose program…' }));
    controls.holdCommands();
    await clickSettled(screen.getByRole('button', { name: 'Use this program' }));
    expect([screen.getByRole('progressbar', { name: 'Use this program: waiting on the forge' }) instanceof HTMLElement, screen.queryByRole('dialog')])
      .toEqual([true, null]);
    time.passes(COMMAND_WAIT_PANEL_DELAY_MILLISECONDS);
    expect(screen.getByRole('dialog', { name: 'Checking Example Agent' }).textContent)
      .toContain('Forge starts the Example Agent program once to check that it runs on this machine, then keeps it as this forge\'s Example Agent.');
    await controls.releaseCommands();
    expect([screen.queryByRole('dialog'), screen.queryByRole('progressbar')]).toEqual([null, null]);
  });

  test('Look again opens the panel past a second, saying forge launches the jobs that stood not launched once the program runs', async () => {
    const time = manualBoardClock();
    const controls = renderSettings('forge-settings', time.clock);
    controls.holdCommands();
    await clickSettled(screen.getByRole('button', { name: 'Look again' }));
    time.passes(COMMAND_WAIT_PANEL_DELAY_MILLISECONDS);
    expect(screen.getByRole('dialog', { name: 'Looking again' }).textContent).toContain('forge launches every job that stood not launched');
    await controls.releaseCommands();
  });
});

describe('the billing', () => {
  test('is not shown while the pipeline\'s billing is a way the agent bills', () => {
    renderSettings();
    expect(screen.queryByRole('heading', { name: 'Billing' })).toBeNull();
  });

  test('shows while the pipeline bills a way the agent does not, and saves the chosen way with the agent as it is', async () => {
    const controls = renderSettings('forge-settings-billing-not-offered');
    expect(screen.getByRole('heading', { name: 'Billing' })).toBeDefined();
    expect(screen.getByText('The pipeline bills by an API key, which Example Agent does not offer, so no job launches. Choose how Example Agent bills.')).toBeDefined();
    expect(screen.queryByLabelText('API key')).toBeNull();
    await clickSettled(screen.getByRole('button', { name: 'Save billing' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-agent-set', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { follows: 'machine' } }, billing: { mode: 'subscription' }
    }]);
  });
});

describe('the tools', () => {
  test('Edit tools lists each tool, a missing one unticked and marked, and keeps the edited list whole', async () => {
    const controls = renderSettings();
    expect(screen.getByText('git · bun · gh')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Edit tools' }));
    const dialog = screen.getByRole('dialog', { name: 'The tools Example Agency\'s agents use' });
    expect(within(dialog).getByText('not on this machine')).toBeDefined();
    expect(within(dialog).getByText('missing')).toBeDefined();
    expect((within(dialog).getByLabelText('Keep docker on the list') as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText('Keep git on the list') as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText('gate typecheck, gate lint, prepare step install')).toBeDefined();
    expect(within(dialog).getByText(/The sandbox, not this list, is what keeps agents inside the repository\./u)).toBeDefined();
    fireEvent.click(within(dialog).getByLabelText('Keep gh on the list'));
    fireEvent.change(within(dialog).getByLabelText('Tool name'), { target: { value: 'pnpm' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await clickSettled(within(dialog).getByRole('button', { name: 'Keep these tools' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:  'pipeline-tools-set',
      tools: [{ name: 'git', path: '/usr/bin/git' }, { name: 'bun', path: '/Users/example/.bun/bin/bun' }, { name: 'pnpm', path: null }],
    }]);
  });
});

test('the live footer leads to the forge\'s settings', () => {
  fakeControls().render(onBoard(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />));
  expect(screen.getByRole('link', { name: 'Forge settings' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/settings');
});
