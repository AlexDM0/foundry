/**
 * The agent's tools at the design step and a launch forge refused, against fake controls. What matters: the design step's footer counts
 * the tools and the missing ones and opens their list, whose kept list is a draft edit of the record's draft at its revision; an added tool
 * forge did not find offers choosing its program in the system's file chooser and is sent again at that path; the research
 * step of a pipeline agent forge did not launch says "Not launched" with forge's own reason instead of Researching, and offers choosing the
 * program at the agent step and Look again; no setup step reads Running or the agent's work for such a job; and the board's notice names
 * each job not launched, or a forge with no agent, with where to choose it: the setup landing on a forge with no pipeline and no setup, where
 * forge keeps no agent outside a setup; a job whose billing its vendor does not offer leads to the billing step while a first setup is
 * open, else to the forge's settings, which show the billing.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { AgentNotice }                                                            from '../../../shell/AgentNotice.tsx';
import { AgentNoticeModel, type AgentNoticeView }                                 from '../../../shell/AgentNoticeModel.ts';
import { ProgramFileChooserContext }                                              from '../../../shell/ProgramFileChooser.ts';
import { EXAMPLE_NOT_LAUNCHED }                                                   from '../../../testing/AgentFixture.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                       from '../../../testing/FakeControls.ts';
import { onBoard }                                                                from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('the design step\'s tools', () => {
  test('the footer counts them and opens their list, kept as a draft edit at the draft\'s revision', async () => {
    const controls = fakeControls();
    const facts = pipelineBoardStateOf('A2');
    const draftRevision = facts.pipeline.setup?.record.draftRevision ?? -1;
    controls.render(onBoard(<PipelineView facts={facts} route={{ tab: 'pipeline', item: 'setup/design' }} {...pipelineViewServicesOf()} />));
    fireEvent.click(screen.getByRole('button', { name: 'Agent tools: 4 tools · 1 missing' }));
    const dialog = screen.getByRole('dialog', { name: 'The tools Example Agency\'s agents use' });
    expect(within(dialog).getByText('gate integration needs docker, which this machine lacks: install it, or drop what needs it from the design.')).toBeDefined();
    expect((within(dialog).getByRole('button', { name: 'Keep these tools' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText('Keep bun on the list'));
    await clickSettled(within(dialog).getByRole('button', { name: 'Keep these tools' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:    'pipeline-draft-edit',
      setupId: 'S1',
      draftRevision,
      edits:   [{ target: 'tools', value: [{ name: 'git', path: '/usr/bin/git' }, { name: 'gh', path: '/opt/homebrew/bin/gh' }] }],
      isACopy: false,
    }]);
  });
});

describe('an added tool forge did not find', () => {
  test('offers choosing its program, and sends the list again with the tool at the program chosen', async () => {
    const chosenPath = '/Users/example/tools/pnpm';
    const controls = fakeControls();
    const facts = pipelineBoardStateOf('A2');
    controls.render(
      <ProgramFileChooserContext value={() => Promise.resolve(chosenPath)}>
        {onBoard(<PipelineView facts={facts} route={{ tab: 'pipeline', item: 'setup/design' }} {...pipelineViewServicesOf()} />)}
      </ProgramFileChooserContext>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agent tools: 4 tools · 1 missing' }));
    const dialog = screen.getByRole('dialog', { name: 'The tools Example Agency\'s agents use' });
    fireEvent.change(within(dialog).getByLabelText('Tool name'), { target: { value: 'pnpm' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    const refusalText = 'No program pnpm is in /usr/bin: name the tool with its path. Nothing was written.';
    controls.answerNextWith({ verdict: 'refused', refusal: refusalText, forgeRefusal: { code: 'tool-not-found', fields: { name: 'pnpm', searchedFolders: ['/usr/bin'] } } });
    await clickSettled(within(dialog).getByRole('button', { name: 'Keep these tools' }));
    expect(within(dialog).getByText(refusalText)).toBeDefined();
    await clickSettled(within(dialog).getByRole('button', { name: 'Choose the pnpm program…' }));
    const foundTools = [{ name: 'git', path: '/usr/bin/git' }, { name: 'bun', path: '/Users/example/.bun/bin/bun' }, { name: 'gh', path: '/opt/homebrew/bin/gh' }];
    expect(controls.sent.map((command) => (command.kind === 'pipeline-draft-edit' ? command.edits : null))).toEqual([
      [{ target: 'tools', value: [...foundTools, { name: 'pnpm', path: null }] }],
      [{ target: 'tools', value: [...foundTools, { name: 'pnpm', path: chosenPath }] }],
    ]);
  });
});

describe('a pipeline agent forge did not launch', () => {
  test('the research step says Not launched with forge\'s reason, and offers the agent step and Look again', async () => {
    const controls = fakeControls();
    controls.render(onBoard(<PipelineView facts={pipelineBoardStateOf('A1-not-launched')} route={{ tab: 'pipeline', item: 'setup/research' }} {...pipelineViewServicesOf()} />));
    expect(screen.queryByText('Researching')).toBeNull();
    expect(screen.queryByText('Running')).toBeNull();
    expect(screen.getAllByText('Not launched').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Waiting for the first findings')).toBeNull();
    const job = screen.getByRole('region', { name: 'J4 not launched' });
    expect(within(job).getByText(EXAMPLE_NOT_LAUNCHED.text)).toBeDefined();
    expect(within(job).getByRole('link', { name: 'Choose the Example Agent program…' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/agent');
    await clickSettled(within(job).getByRole('button', { name: 'Look again' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'agent-look-again' }]);
  });
});

/** The fixture with its setup's pipeline agent job standing not launched, as `A1-not-launched` holds it. */
function notLaunchedAt(name: PipelineFixtureName): ReturnType<typeof pipelineBoardStateOf> {
  const facts = pipelineBoardStateOf(name);
  const agentJobId = facts.pipeline.setup?.record.agentJobId ?? null;
  const notLaunchedJob = pipelineBoardStateOf('A1-not-launched').jobs.find((job) => job.id === agentJobId);
  if (agentJobId === null || notLaunchedJob === undefined) throw new Error(`the fixture ${name} has no pipeline agent job`);
  return { ...facts, jobs: [...facts.jobs.filter((job) => job.id !== agentJobId), notLaunchedJob] };
}

const WORKING_WORDS = ['Running', 'Researching', 'Drafting', 'Designing', 'Reading the repository', 'Drafting the constitution', 'Designing the pipeline'];

describe('a pipeline agent forge did not launch, on every setup step', () => {
  const stepsWithTheAgent: readonly (readonly [PipelineFixtureName, string | null])[] = [
    ['A1', 'setup/research'],
    ['A3b', 'setup/constitution'],
    ['A2-designing', 'setup/design'],
    ['A0b-running', null],
  ];

  for (const [name, item] of stepsWithTheAgent) {
    test(`${item ?? 'the resume summary'} reads Not launched, never Running or the agent's work`, () => {
      fakeControls().render(onBoard(<PipelineView facts={notLaunchedAt(name)} route={{ tab: 'pipeline', item }} {...pipelineViewServicesOf()} />));
      for (const word of WORKING_WORDS) expect(screen.queryByText(word)).toBeNull();
      expect(screen.getAllByText(/not launched/iu).length).toBeGreaterThan(0);
    });
  }
});

describe('the board\'s agent notice', () => {
  function noticeOf(view: AgentNoticeView | null): HTMLElement {
    if (view === null) throw new Error('the fixture shows no agent notice');
    render(onBoard(<AgentNotice notice={view} />));
    return screen.getByRole('status');
  }

  test('names each job not launched with forge\'s reason, and leads to the setup\'s agent step', () => {
    const notice = noticeOf(AgentNoticeModel.agentNoticeOf(pipelineBoardStateOf('A1-not-launched')));
    expect(notice.textContent).toContain(`Job J4 is not launched: ${EXAMPLE_NOT_LAUNCHED.text}.`);
    expect(within(notice).getByRole('link', { name: 'Choose the Example Agent program…' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/agent');
    expect(within(notice).getByRole('button', { name: 'Look again' })).toBeDefined();
  });

  test('leads a job not launched on a forge with no pipeline and no setup to the setup landing, where its agent is chosen', () => {
    const notLaunchedJobs = pipelineBoardStateOf('A1-not-launched').jobs.filter((job) => job.notLaunched !== null);
    const notice = noticeOf(AgentNoticeModel.agentNoticeOf({ ...pipelineBoardStateOf('A0'), jobs: notLaunchedJobs }));
    expect(notice.textContent).toContain(`Job J4 is not launched: ${EXAMPLE_NOT_LAUNCHED.text}.`);
    expect(within(notice).getByRole('link', { name: 'Set up the pipeline' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline');
  });

  test('says a forge with a pipeline and no agent launches nothing, and leads to its settings', () => {
    const notice = noticeOf(AgentNoticeModel.agentNoticeOf(pipelineBoardStateOf('A5-no-agent')));
    expect(notice.textContent).toContain('No agent is chosen for this forge, so no job launches.');
    expect(within(notice).getByRole('link', { name: 'Choose this forge\'s agent' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/settings');
  });

  test('shows nothing while every job launched and the forge has an agent', () => {
    expect(AgentNoticeModel.agentNoticeOf(pipelineBoardStateOf('A5'))).toBeNull();
    expect(AgentNoticeModel.agentNoticeOf(pipelineBoardStateOf('landing-found'))).toBeNull();
  });

  test('leads a job whose billing its vendor does not offer to the billing step while a first setup is open', () => {
    const facts = pipelineBoardStateOf('A1-not-launched');
    const jobs = facts.jobs.map((job) => (job.notLaunched === null ? job : { ...job, notLaunched: { ...job.notLaunched, cause: 'billing-not-offered' as const } }));
    const notice = noticeOf(AgentNoticeModel.agentNoticeOf({ ...facts, jobs }));
    expect(within(notice).getByRole('link', { name: 'Choose how the agent bills' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/billing');
  });

  test('leads a job whose billing its vendor does not offer to the forge\'s settings, which show the billing, once the pipeline is live', () => {
    const notLaunchedJobs = pipelineBoardStateOf('A1-not-launched').jobs
      .filter((job) => job.notLaunched !== null)
      .map((job) => (job.notLaunched === null ? job : { ...job, notLaunched: { ...job.notLaunched, cause: 'billing-not-offered' as const } }));
    const notice = noticeOf(AgentNoticeModel.agentNoticeOf({ ...pipelineBoardStateOf('A5'), jobs: notLaunchedJobs }));
    expect(within(notice).getByRole('link', { name: 'Choose how the agent bills' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/settings');
  });
});
